import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import * as nodemailer from "nodemailer";
import { Subject } from "rxjs";
import { PrismaService } from "../../common/prisma.service";

const emailAttachmentListSelect = {
  id: true,
  name: true,
  mimeType: true,
  size: true,
  createdAt: true
} as const;

@Injectable()
export class MailboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxService.name);
  private readonly events = new Subject<{ unreadCount: number; imported?: number; latestThreadId?: string }>();
  private syncTimer?: ReturnType<typeof setInterval>;
  private watchRestartTimer?: ReturnType<typeof setTimeout>;
  private watchClient?: ImapFlow;
  private syncRunning = false;
  private watching = false;
  private destroying = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  onModuleInit() {
    if ((this.config.get<string>("MAILBOX_AUTO_SYNC") ?? "true") === "false") return;
    if (!this.hasInboundConfig()) return;

    const intervalSeconds = Math.max(Number(this.config.get<string>("MAILBOX_SYNC_INTERVAL_SECONDS") ?? 60), 30);
    void this.syncInboxSafely("startup");
    void this.startMailboxWatcher();
    this.syncTimer = setInterval(() => void this.syncInboxSafely("interval"), intervalSeconds * 1000);
  }

  onModuleDestroy() {
    this.destroying = true;
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.watchRestartTimer) clearTimeout(this.watchRestartTimer);
    void this.watchClient?.logout().catch(() => undefined);
  }

  async summary() {
    const unreadCount = await this.prisma.emailMessage.count({
      where: { direction: "INBOUND", isRead: false }
    });
    const latest = await this.prisma.emailThread.findFirst({
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      include: { document: true, client: true }
    });
    return { unreadCount, latest };
  }

  stream() {
    return this.events.asObservable();
  }

  list() {
    return this.prisma.emailThread.findMany({
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      include: {
        document: true,
        client: true,
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1,
          include: { attachments: { select: emailAttachmentListSelect } }
        }
      }
    });
  }

  async detail(id: string) {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id },
      include: {
        document: true,
        client: true,
        messages: {
          orderBy: [{ sentAt: "asc" }, { createdAt: "asc" }],
          include: {
            attachments: { select: emailAttachmentListSelect },
            replyToMessage: {
              select: {
                id: true,
                direction: true,
                fromEmail: true,
                fromName: true,
                subject: true,
                textBody: true,
                sentAt: true,
                createdAt: true
              }
            }
          }
        }
      }
    });
    if (!thread) throw new NotFoundException("Email thread not found");
    return thread;
  }

  async markRead(id: string) {
    await this.detail(id);
    await this.prisma.emailMessage.updateMany({
      where: { threadId: id, direction: "INBOUND", isRead: false },
      data: { isRead: true }
    });
    await this.prisma.emailThread.update({
      where: { id },
      data: { unreadCount: 0 }
    });
    await this.publishSummary();
    return this.detail(id);
  }

  async reply(id: string, body: string, attachments: MailboxAttachment[] = [], replyToMessageId?: string) {
    const thread = await this.detail(id);
    const to = thread.fromEmail || thread.client?.email;
    if (!to) throw new NotFoundException("Reply email address not found");
    if (!body?.trim() && attachments.length === 0) {
      throw new BadRequestException("Reply text or attachment is required");
    }
    const replyToMessage = replyToMessageId
      ? await this.prisma.emailMessage.findFirst({ where: { id: replyToMessageId, threadId: id } })
      : undefined;
    if (replyToMessageId && !replyToMessage) {
      throw new NotFoundException("Reply target message not found");
    }

    const subject = thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`;
    const transporter = nodemailer.createTransport({
      host: this.config.get<string>("MAIL_HOST"),
      port: Number(this.config.get<string>("MAIL_PORT") ?? 587),
      secure: this.isSecureMail(),
      auth: {
        user: this.config.get<string>("MAIL_USERNAME"),
        pass: this.config.get<string>("MAIL_PASSWORD")
      }
    });

    const fromAddress = this.config.get<string>("MAIL_FROM_ADDRESS") ?? this.config.get<string>("MAIL_USERNAME");
    const fromName = this.config.get<string>("MAIL_FROM_NAME") ?? "E Electrics Ltd";
    const sent = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text: body,
      html: richText(body),
      inReplyTo: formatMessageId(replyToMessage?.messageId),
      references: formatMessageId(replyToMessage?.messageId),
      attachments: attachments.map((attachment) => ({
        filename: attachment.originalname,
        content: attachment.buffer,
        contentType: attachment.mimetype
      }))
    });

    const message = await this.prisma.emailMessage.create({
      data: {
        threadId: id,
        messageId: sent.messageId,
        direction: "OUTBOUND",
        fromEmail: fromAddress,
        fromName,
        toEmail: to,
        subject,
        textBody: body,
        htmlBody: richText(body),
        replyToMessageId: replyToMessage?.id,
        isRead: true,
        sentAt: new Date(),
        attachments: {
          create: attachments.map((attachment) => ({
            name: attachment.originalname,
            mimeType: attachment.mimetype,
            size: attachment.size,
            content: attachment.buffer
          }))
        }
      }
    });
    await this.prisma.emailThread.update({
      where: { id },
      data: { lastMessageAt: message.sentAt ?? new Date() }
    });
    return this.detail(id);
  }

  async sendNewEmail(input: { to: string; subject: string; body: string; attachments?: MailboxAttachment[] }) {
    const to = input.to?.trim();
    const subject = input.subject?.trim();
    const body = input.body ?? "";
    const attachments = input.attachments ?? [];

    if (!to) throw new BadRequestException("Recipient email is required");
    if (!subject) throw new BadRequestException("Subject is required");
    if (!body.trim() && attachments.length === 0) {
      throw new BadRequestException("Email text or attachment is required");
    }

    const transporter = nodemailer.createTransport({
      host: this.config.get<string>("MAIL_HOST"),
      port: Number(this.config.get<string>("MAIL_PORT") ?? 587),
      secure: this.isSecureMail(),
      auth: {
        user: this.config.get<string>("MAIL_USERNAME"),
        pass: this.config.get<string>("MAIL_PASSWORD")
      }
    });

    const fromAddress = this.config.get<string>("MAIL_FROM_ADDRESS") ?? this.config.get<string>("MAIL_USERNAME");
    const fromName = this.config.get<string>("MAIL_FROM_NAME") ?? "E Electrics Ltd";
    const sent = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text: body,
      html: richText(body),
      attachments: attachments.map((attachment) => ({
        filename: attachment.originalname,
        content: attachment.buffer,
        contentType: attachment.mimetype
      }))
    });

    const clientRecord = await this.findRelatedClient(to);
    const thread = await this.prisma.emailThread.create({
      data: {
        subject,
        normalizedSubject: normalizeSubject(subject),
        fromEmail: to,
        toEmail: to,
        clientId: clientRecord?.id,
        unreadCount: 0,
        lastMessageAt: new Date(),
        messages: {
          create: {
            messageId: sent.messageId,
            direction: "OUTBOUND",
            fromEmail: fromAddress,
            fromName,
            toEmail: to,
            subject,
            textBody: body,
            htmlBody: richText(body),
            isRead: true,
            sentAt: new Date(),
            attachments: {
              create: attachments.map((attachment) => ({
                name: attachment.originalname,
                mimeType: attachment.mimetype,
                size: attachment.size,
                content: attachment.buffer
              }))
            }
          }
        }
      }
    });
    await this.publishSummary();
    return this.detail(thread.id);
  }

  async getAttachment(messageId: string, attachmentId: string) {
    const attachment = await this.prisma.emailAttachment.findFirst({
      where: { id: attachmentId, messageId }
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    return attachment;
  }

  async deleteMessage(messageId: string) {
    const message = await this.prisma.emailMessage.findUnique({
      where: { id: messageId },
      select: { id: true, threadId: true }
    });
    if (!message) throw new NotFoundException("Email message not found");

    await this.prisma.emailMessage.delete({ where: { id: messageId } });
    const remaining = await this.prisma.emailMessage.findMany({
      where: { threadId: message.threadId },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, sentAt: true, createdAt: true, direction: true, isRead: true }
    });

    if (!remaining.length) {
      await this.prisma.emailThread.delete({ where: { id: message.threadId } });
      await this.publishSummary();
      return { deleted: true, threadDeleted: true, threadId: message.threadId };
    }

    const unreadCount = remaining.filter((item) => item.direction === "INBOUND" && !item.isRead).length;
    await this.prisma.emailThread.update({
      where: { id: message.threadId },
      data: {
        unreadCount,
        lastMessageAt: remaining[0].sentAt ?? remaining[0].createdAt
      }
    });
    await this.publishSummary();

    return { deleted: true, threadDeleted: false, threadId: message.threadId };
  }

  async backfillAttachments() {
    const records = await this.prisma.emailMessage.findMany({
      where: {
        uid: { not: null },
        attachments: { none: {} }
      },
      select: { id: true, uid: true }
    });

    if (!records.length) return { checked: 0, saved: 0 };

    const client = this.createImapClient();
    await client.connect();
    let saved = 0;
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        for (const record of records) {
          if (!record.uid) continue;
          const message = await client.fetchOne(String(record.uid), { source: true }, { uid: true });
          if (!message || !message.source) continue;
          const parsed = await simpleParser(message.source);
          saved += await this.saveParsedAttachments(record.id, parsed.attachments);
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return { checked: records.length, saved };
  }

  async syncInbox() {
    const client = this.createImapClient();

    await client.connect();
    let imported = 0;
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const fromUid = await this.nextUid();
        const uidNext = client.mailbox ? client.mailbox.uidNext : undefined;
        if (uidNext && fromUid >= uidNext) return { imported: 0 };

        for await (const message of client.fetch(`${fromUid}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          const messageId = normalizeMessageId(parsed.messageId) || `imap-${message.uid}`;
          const exists = await this.prisma.emailMessage.findUnique({ where: { messageId } });
          if (exists) continue;

          const subject = parsed.subject || "(No subject)";
          const from = firstAddress(parsed.from);
          const to = firstAddress(parsed.to);
          const document = await this.findRelatedDocument(subject, parsed.text || "");
          const clientRecord = await this.findRelatedClient(from?.address, document?.clientId);
          const thread = await this.findOrCreateThread({
            subject,
            fromEmail: from?.address,
            fromName: from?.name,
            toEmail: to?.address,
            documentId: document?.id,
            clientId: clientRecord?.id,
            messageDate: parsed.date ?? new Date()
          });

          await this.prisma.emailMessage.create({
            data: {
              threadId: thread.id,
              uid: message.uid,
              messageId,
              direction: "INBOUND",
              fromEmail: from?.address,
              fromName: from?.name,
              toEmail: to?.address,
              subject,
              textBody: parsed.text,
              htmlBody: parsed.html || undefined,
              isRead: false,
              sentAt: parsed.date,
              attachments: {
                create: parsed.attachments.map((attachment) => ({
                  name: attachment.filename || "attachment",
                  mimeType: attachment.contentType,
                  size: attachment.size,
                  content: attachment.content
                }))
              }
            }
          });
          await this.prisma.emailThread.update({
            where: { id: thread.id },
            data: {
              unreadCount: { increment: 1 },
              lastMessageAt: parsed.date ?? new Date(),
              fromEmail: from?.address,
              fromName: from?.name,
              toEmail: to?.address,
              documentId: document?.id ?? thread.documentId,
              clientId: clientRecord?.id ?? thread.clientId
            }
          });
          imported += 1;
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    if (imported > 0) {
      await this.publishSummary(imported);
    }

    return { imported };
  }

  private async syncInboxSafely(source: string) {
    if (this.syncRunning) return;
    this.syncRunning = true;
    try {
      const result = await this.syncInbox();
      if (result.imported > 0) {
        this.logger.log(`Mailbox ${source} sync imported ${result.imported} message(s)`);
      }
    } catch (error) {
      this.logger.warn(`Mailbox ${source} sync failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.syncRunning = false;
    }
  }

  private async startMailboxWatcher() {
    if ((this.config.get<string>("MAILBOX_LIVE_WATCH") ?? "true") === "false") return;
    if (this.watching || this.destroying) return;

    this.watching = true;
    const client = this.createImapClient({ maxIdleTime: 5 * 60 * 1000 });
    this.watchClient = client;

    client.on("exists", () => void this.syncInboxSafely("live"));
    client.on("close", () => {
      this.watchClient = undefined;
      this.watching = false;
      if (!this.destroying) this.scheduleWatcherRestart();
    });
    client.on("error", (error) => {
      this.logger.warn(`Mailbox live watch error: ${error.message}`);
    });

    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      this.logger.log("Mailbox live watch connected");
      void client.idle().catch((error) => {
        if (!this.destroying) this.logger.warn(`Mailbox live watch idle failed: ${error.message}`);
      });
    } catch (error) {
      this.watchClient = undefined;
      this.watching = false;
      await client.logout().catch(() => undefined);
      this.logger.warn(`Mailbox live watch failed: ${error instanceof Error ? error.message : String(error)}`);
      this.scheduleWatcherRestart();
    }
  }

  private scheduleWatcherRestart() {
    if (this.watchRestartTimer || this.destroying) return;
    this.watchRestartTimer = setTimeout(() => {
      this.watchRestartTimer = undefined;
      void this.startMailboxWatcher();
    }, 15000);
  }

  private createImapClient(options?: { maxIdleTime?: number }) {
    return new ImapFlow({
      host: this.config.get<string>("IMAP_HOST") ?? this.config.get<string>("MAIL_HOST") ?? "mail.eelectrics.co.uk",
      port: Number(this.config.get<string>("IMAP_PORT") ?? 993),
      secure: (this.config.get<string>("IMAP_SECURE") ?? "true") !== "false",
      logger: false,
      maxIdleTime: options?.maxIdleTime,
      auth: {
        user: this.config.get<string>("IMAP_USERNAME") ?? this.config.get<string>("MAIL_USERNAME") ?? "",
        pass: this.config.get<string>("IMAP_PASSWORD") ?? this.config.get<string>("MAIL_PASSWORD") ?? ""
      }
    });
  }

  private async publishSummary(imported?: number) {
    const summary = await this.summary();
    this.events.next({ unreadCount: summary.unreadCount, imported, latestThreadId: summary.latest?.id });
  }

  private async saveParsedAttachments(messageId: string, attachments: Array<{ filename?: string; contentType?: string; size?: number; content: Buffer }>) {
    if (!attachments.length) return 0;
    const existing = await this.prisma.emailAttachment.count({ where: { messageId } });
    if (existing) return 0;

    await this.prisma.emailMessage.update({
      where: { id: messageId },
      data: {
        attachments: {
          create: attachments.map((attachment) => ({
            name: attachment.filename || "attachment",
            mimeType: attachment.contentType,
            size: attachment.size,
            content: attachment.content
          }))
        }
      }
    });
    return attachments.length;
  }

  private hasInboundConfig() {
    const host = this.config.get<string>("IMAP_HOST") ?? this.config.get<string>("MAIL_HOST");
    const user = this.config.get<string>("IMAP_USERNAME") ?? this.config.get<string>("MAIL_USERNAME");
    const pass = this.config.get<string>("IMAP_PASSWORD") ?? this.config.get<string>("MAIL_PASSWORD");
    return Boolean(host && user && pass);
  }

  private async nextUid() {
    const latest = await this.prisma.emailMessage.findFirst({
      where: { uid: { not: null } },
      orderBy: { uid: "desc" }
    });
    return Math.max((latest?.uid ?? 0) + 1, 1);
  }

  private async findOrCreateThread(input: {
    subject: string;
    fromEmail?: string;
    fromName?: string;
    toEmail?: string;
    documentId?: string;
    clientId?: string;
    messageDate: Date;
  }) {
    const normalizedSubject = normalizeSubject(input.subject);
    const existing = await this.prisma.emailThread.findFirst({
      where: {
        OR: [
          ...(input.documentId ? [{ documentId: input.documentId }] : []),
          { normalizedSubject, fromEmail: input.fromEmail }
        ]
      },
      orderBy: { updatedAt: "desc" }
    });
    if (existing) return existing;

    return this.prisma.emailThread.create({
      data: {
        subject: input.subject,
        normalizedSubject,
        fromEmail: input.fromEmail,
        fromName: input.fromName,
        toEmail: input.toEmail,
        documentId: input.documentId,
        clientId: input.clientId,
        lastMessageAt: input.messageDate
      }
    });
  }

  private async findRelatedDocument(subject: string, body: string) {
    const haystack = `${subject}\n${body}`;
    const match = haystack.match(/\b(BKG|INV|QUO)-\d+-\d+\b/i);
    if (!match) return undefined;
    return this.prisma.document.findUnique({
      where: { documentNo: match[0].toUpperCase() },
      include: { client: true }
    });
  }

  private async findRelatedClient(email?: string, documentClientId?: string | null) {
    if (documentClientId) return this.prisma.client.findUnique({ where: { id: documentClientId } });
    if (!email) return undefined;
    return this.prisma.client.findFirst({ where: { email } });
  }

  private isSecureMail() {
    const encryption = (this.config.get<string>("MAIL_ENCRYPTION") ?? "").toLowerCase();
    const port = Number(this.config.get<string>("MAIL_PORT") ?? 587);
    return encryption === "ssl" || port === 465;
  }
}

export type MailboxAttachment = {
  originalname: string;
  mimetype: string;
  size?: number;
  buffer: Buffer;
};

function normalizeSubject(subject: string) {
  return subject.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim().toLowerCase();
}

function firstAddress(value: any) {
  if (Array.isArray(value)) return value[0]?.value?.[0];
  return value?.value?.[0];
}

function normalizeMessageId(messageId?: string) {
  return messageId?.trim().replace(/^<|>$/g, "");
}

function formatMessageId(messageId?: string | null) {
  if (!messageId) return undefined;
  const normalized = normalizeMessageId(messageId);
  return normalized ? `<${normalized}>` : undefined;
}

function richText(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
