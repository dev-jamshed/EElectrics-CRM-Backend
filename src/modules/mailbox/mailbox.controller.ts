import { Body, Controller, Delete, Get, MessageEvent, Param, Post, Query, Res, Sse, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { map, Observable } from "rxjs";
import { MailboxService } from "./mailbox.service";

type UploadedMailboxFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Controller("mailbox")
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get("summary")
  summary() {
    return this.mailbox.summary();
  }

  @Sse("stream")
  stream(): Observable<MessageEvent> {
    return this.mailbox.stream().pipe(map((data) => ({ data })));
  }

  @Get("threads")
  threads(@Query("folder") folder?: string) {
    return this.mailbox.list(folder);
  }

  @Get("documents/:documentId/thread")
  documentThread(@Param("documentId") documentId: string) {
    return this.mailbox.detailByDocument(documentId);
  }

  @Get("threads/:id")
  thread(@Param("id") id: string) {
    return this.mailbox.detail(id);
  }

  @Get("messages/:messageId/attachments/:attachmentId")
  async attachment(
    @Param("messageId") messageId: string,
    @Param("attachmentId") attachmentId: string,
    @Res() response: Response
  ) {
    const attachment = await this.mailbox.getAttachment(messageId, attachmentId);
    response.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.name)}"`);
    response.send(Buffer.from(attachment.content));
  }

  @Delete("messages/:messageId")
  deleteMessage(@Param("messageId") messageId: string) {
    return this.mailbox.deleteMessage(messageId);
  }

  @Delete("threads/:id")
  deleteThread(@Param("id") id: string) {
    return this.mailbox.deleteThread(id);
  }

  @Post("threads/:id/read")
  markRead(@Param("id") id: string) {
    return this.mailbox.markRead(id);
  }

  @Post("threads/:id/star")
  toggleStar(@Param("id") id: string) {
    return this.mailbox.toggleStar(id);
  }

  @Post("threads/:id/archive")
  toggleArchive(@Param("id") id: string) {
    return this.mailbox.toggleArchive(id);
  }

  @Post("threads/:id/trash")
  trashThread(@Param("id") id: string) {
    return this.mailbox.trashThread(id);
  }

  @Post("threads/:id/restore")
  restoreThread(@Param("id") id: string) {
    return this.mailbox.restoreThread(id);
  }

  @Post("threads/:id/reply")
  reply(@Param("id") id: string, @Body() body: { body: string; replyToMessageId?: string }) {
    return this.mailbox.reply(id, body.body, [], body.replyToMessageId);
  }

  @Post("threads/:id/reply-with-attachments")
  @UseInterceptors(FilesInterceptor("attachments", 10, { limits: { fileSize: 15 * 1024 * 1024, files: 10 } }))
  replyWithAttachments(
    @Param("id") id: string,
    @Body() body: { body?: string; replyToMessageId?: string },
    @UploadedFiles() files: UploadedMailboxFile[] = []
  ) {
    return this.mailbox.reply(id, body.body ?? "", files, body.replyToMessageId);
  }

  @Post("send")
  @UseInterceptors(FilesInterceptor("attachments", 10, { limits: { fileSize: 15 * 1024 * 1024, files: 10 } }))
  sendNewEmail(
    @Body() body: { to?: string; cc?: string; subject?: string; body?: string },
    @UploadedFiles() files: UploadedMailboxFile[] = []
  ) {
    return this.mailbox.sendNewEmail({
      to: body.to ?? "",
      cc: body.cc ?? "",
      subject: body.subject ?? "",
      body: body.body ?? "",
      attachments: files
    });
  }

  @Post("sync")
  sync() {
    return this.mailbox.syncInbox();
  }

  @Post("backfill-attachments")
  backfillAttachments() {
    return this.mailbox.backfillAttachments();
  }
}
