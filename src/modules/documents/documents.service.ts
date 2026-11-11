import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import Stripe = require("stripe");
import { CountersService } from "./../../common/counters.service";
import { PrismaService } from "../../common/prisma.service";
import { CloneDocumentDto, CreateDocumentDto, DocumentStatusValue, DocumentTypeValue, LineItemDto, RecordPaymentDto, UpdateDocumentDto } from "./dto";
import { DocumentMailService } from "./document-mail.service";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: CountersService,
    private readonly mail: DocumentMailService
  ) {}

  list(filters: { type?: DocumentTypeValue; status?: string; q?: string; clientId?: string }) {
    const statusFilter =
      filters.type === "INVOICE" && filters.status === "SENT"
        ? { in: ["SENT", "PAID"] as DocumentStatusValue[] }
        : (filters.status as DocumentStatusValue | undefined);

    return this.prisma.document.findMany({
      where: {
        type: filters.type,
        status: statusFilter,
        clientId: filters.clientId,
        OR: filters.q
          ? [
              { documentNo: { contains: filters.q } },
              { jobTitle: { contains: filters.q } },
              { addressLine: { contains: filters.q } },
              { client: { firstName: { contains: filters.q } } },
              { client: { lastName: { contains: filters.q } } },
              { client: { email: { contains: filters.q } } }
            ]
          : undefined
      },
      include: {
        client: true,
        caseFile: true,
        lineItems: true,
        attachments: true,
        revisions: {
          orderBy: { revisionNo: "desc" }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async detail(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        client: true,
        caseFile: {
          include: {
            documents: {
              orderBy: { createdAt: "desc" }
            }
          }
        },
        lineItems: { orderBy: { sortOrder: "asc" } },
        attachments: { orderBy: { createdAt: "asc" } },
        parentDocument: true,
        revisions: {
          include: { lineItems: true, attachments: true, paymentRecords: true },
          orderBy: { revisionNo: "desc" }
        },
        paymentRecords: {
          orderBy: { paidAt: "desc" }
        }
      }
    });

    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  async create(dto: CreateDocumentDto) {
    const clientId = await this.resolveClientId(dto);
    const duplicateBooking = dto.type === "BOOKING" && !dto.createAsClone ? await this.findDuplicateBooking(dto, clientId) : undefined;
    if (duplicateBooking) return this.detail(duplicateBooking.id);

    const caseFile = await this.resolveCaseFile(dto, clientId);
    const documentNo = await this.counters.nextDocumentNo(dto.type);
    const lineItems = dto.type === "BOOKING" ? [] : dto.lineItems ?? [];
    const totals = this.calculateTotals(lineItems);
    const totalAmount = dto.price ?? totals.total;
    const initialPaid = Math.max(0, Number(dto.paidAmount || 0));
    const isFullyPaid = initialPaid >= totalAmount && totalAmount > 0;
    const isPartiallyPaid = initialPaid > 0 && initialPaid < totalAmount;
    const computedPaymentStatus = isFullyPaid ? "PAID" : isPartiallyPaid ? "PARTIALLY_PAID" : "NOT_PAID";
    const computedStatus = dto.sendMail ? "SENT" : isFullyPaid ? "PAID" : isPartiallyPaid ? "PARTIALLY_PAID" : (dto.status ?? "DRAFT");

    const document = await this.prisma.document.create({
      data: {
        type: dto.type,
        status: computedStatus,
        documentNo,
        confirmationToken: dto.type === "BOOKING" ? createConfirmationToken() : undefined,
        caseFileId: caseFile?.id,
        clientId,
        jobTitle: dto.jobTitle,
        description: dto.description,
        greeting: dto.greeting,
        emailNote: dto.emailNote,
        cc: dto.cc,
        phoneNo: dto.phoneNo,
        postalCode: dto.postalCode,
        addressLine: dto.addressLine,
        extraAddress: dto.extraAddress,
        selectedAddress: dto.selectedAddress ? JSON.stringify(dto.selectedAddress) : undefined,
        hasOccupier: Boolean(dto.hasOccupier),
        occupierFirstName: dto.occupierFirstName?.trim() || null,
        occupierLastName: dto.occupierLastName?.trim() || null,
        occupierPhone: dto.occupierPhone?.trim() || null,
        occupierPostalCode: dto.occupierPostalCode?.trim() || null,
        occupierAddressLine: dto.occupierAddressLine?.trim() || null,
        occupierExtraAddress: dto.occupierExtraAddress?.trim() || null,
        occupierSelectedAddress: dto.occupierSelectedAddress ? JSON.stringify(dto.occupierSelectedAddress) : undefined,
        price: totalAmount,
        includeOptions: dto.includeOptions?.length ? JSON.stringify(dto.includeOptions) : undefined,
        sendMail: dto.sendMail ?? false,
        sendImages: dto.sendImages ?? false,
        invoiceCheck: dto.invoiceCheck ?? false,
        emailSubject: dto.emailSubject,
        emailBody: dto.emailBody,
        pdfNotes: dto.pdfNotes,
        emailStatus: dto.sendMail ? "PENDING" : "NOT_SENT",
        emailError: null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : undefined,
        subtotal: totals.subtotal,
        total: totalAmount,
        paidAmount: initialPaid,
        partialPaymentAmount: dto.partialPaymentAmount !== undefined && dto.partialPaymentAmount !== null && Number(dto.partialPaymentAmount) > 0 ? Number(dto.partialPaymentAmount) : null,
        paymentStatus: computedPaymentStatus,
        paidAt: isFullyPaid ? new Date() : undefined,
        lineItems: {
          create: this.toLineItemCreates(lineItems)
        },
        attachments: {
          create: this.toAttachmentCreates(dto.attachments)
        },
        paymentRecords: initialPaid > 0 ? {
          create: [{
            amount: initialPaid,
            note: isFullyPaid ? "Paid in full" : "Initial partial payment / deposit",
            method: "BANK_TRANSFER",
            paidAt: new Date()
          }]
        } : undefined
      },
      include: { client: true, caseFile: true, lineItems: true, attachments: true, paymentRecords: true }
    });

    if (!document.rootDocumentId) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { rootDocumentId: document.id }
      });
    }

    if (dto.sendMail && dto.type === "INVOICE") await this.ensurePaymentUrl(document.id);
    if (dto.sendMail) await this.sendMailAndUpdateStatus(document.id);

    return this.detail(document.id);
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.ensureExists(id);
    const clientId = await this.resolveClientId(dto);
    const lineItems = dto.type === "BOOKING" ? [] : dto.lineItems ?? [];
    const totals = this.calculateTotals(lineItems);
    const totalAmount = dto.price ?? totals.total;
    const existingDoc = await this.prisma.document.findUnique({ where: { id }, select: { paidAmount: true, paymentStatus: true, partialPaymentAmount: true, paymentUrl: true } });
    const currentPaid = dto.paidAmount !== undefined ? Math.max(0, Number(dto.paidAmount)) : Number(existingDoc?.paidAmount ?? 0);
    const hasPartialChanged = dto.partialPaymentAmount !== undefined;
    const partialPaymentAmount = hasPartialChanged
      ? (dto.partialPaymentAmount !== null && Number(dto.partialPaymentAmount) > 0 ? Number(dto.partialPaymentAmount) : null)
      : existingDoc?.partialPaymentAmount;
    const paymentUrl = hasPartialChanged ? null : existingDoc?.paymentUrl;
    const isFullyPaid = currentPaid >= totalAmount && totalAmount > 0;
    const isPartiallyPaid = currentPaid > 0 && currentPaid < totalAmount;
    const updatedPaymentStatus = isFullyPaid ? "PAID" : isPartiallyPaid ? "PARTIALLY_PAID" : (existingDoc?.paymentStatus === "PAID" ? "PAID" : "NOT_PAID");

    await this.prisma.$transaction([
      this.prisma.lineItem.deleteMany({ where: { documentId: id } }),
      this.prisma.attachment.deleteMany({ where: { documentId: id } }),
      this.prisma.document.update({
        where: { id },
        data: {
          status: dto.sendMail ? "SENT" : dto.status ?? "DRAFT",
          clientId,
          jobTitle: dto.jobTitle,
          description: dto.description,
          greeting: dto.greeting,
          emailNote: dto.emailNote,
          cc: dto.cc,
          phoneNo: dto.phoneNo,
          postalCode: dto.postalCode,
          addressLine: dto.addressLine,
          extraAddress: dto.extraAddress,
          selectedAddress: dto.selectedAddress ? JSON.stringify(dto.selectedAddress) : null,
          hasOccupier: Boolean(dto.hasOccupier),
          occupierFirstName: dto.occupierFirstName?.trim() || null,
          occupierLastName: dto.occupierLastName?.trim() || null,
          occupierPhone: dto.occupierPhone?.trim() || null,
          occupierPostalCode: dto.occupierPostalCode?.trim() || null,
          occupierAddressLine: dto.occupierAddressLine?.trim() || null,
          occupierExtraAddress: dto.occupierExtraAddress?.trim() || null,
          occupierSelectedAddress: dto.occupierSelectedAddress ? JSON.stringify(dto.occupierSelectedAddress) : null,
          price: totalAmount,
          includeOptions: dto.includeOptions?.length ? JSON.stringify(dto.includeOptions) : null,
          sendMail: dto.sendMail ?? false,
          sendImages: dto.sendImages ?? false,
          invoiceCheck: dto.invoiceCheck ?? false,
          emailSubject: dto.emailSubject,
          emailBody: dto.emailBody,
          pdfNotes: dto.pdfNotes,
          emailStatus: dto.sendMail ? "PENDING" : "NOT_SENT",
          emailError: null,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : null,
          subtotal: totals.subtotal,
          total: totalAmount,
          paidAmount: currentPaid,
          partialPaymentAmount,
          paymentUrl,
          paymentStatus: updatedPaymentStatus,
          lineItems: { create: this.toLineItemCreates(lineItems) },
          attachments: { create: this.toAttachmentCreates(dto.attachments) }
        }
      })
    ]);

    if (dto.sendMail && dto.type === "INVOICE") await this.ensurePaymentUrl(id);
    if (dto.sendMail) await this.sendMailAndUpdateStatus(id);

    return this.detail(id);
  }

  async remove(id: string) {
    await this.ensureExists(id);

    await this.prisma.$transaction([
      this.prisma.lineItem.deleteMany({ where: { documentId: id } }),
      this.prisma.attachment.deleteMany({ where: { documentId: id } }),
      this.prisma.document.updateMany({
        where: { parentDocumentId: id },
        data: { parentDocumentId: null }
      }),
      this.prisma.document.delete({ where: { id } })
    ]);

    return { id, deleted: true };
  }

  async publicBooking(token: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        type: "BOOKING",
        OR: [{ confirmationToken: token }, { id: token }]
      },
      include: { client: true, caseFile: true }
    });
    if (!document) throw new NotFoundException("Booking not found");

    return {
      id: document.id,
      documentNo: document.documentNo,
      status: document.status,
      bookingDate: document.bookingDate,
      bookingConfirmed: document.bookingConfirmed,
      confirmedAt: document.confirmedAt,
      jobTitle: document.jobTitle,
      greeting: document.greeting,
      emailNote: document.emailNote,
      addressLine: document.addressLine,
      extraAddress: document.extraAddress,
      client: {
        firstName: document.client?.firstName,
        lastName: document.client?.lastName
      }
    };
  }

  async confirmBooking(token: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        type: "BOOKING",
        OR: [{ confirmationToken: token }, { id: token }]
      },
      include: { client: true, caseFile: true }
    });
    if (!document) throw new NotFoundException("Booking not found");

    if (!document.bookingConfirmed) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { bookingConfirmed: true, confirmedAt: new Date() }
      });
    }

    return this.publicBooking(document.confirmationToken ?? document.id);
  }

  private async sendMailAndUpdateStatus(id: string) {
    let document = await this.prisma.document.findUnique({
      where: { id },
      include: { client: true, caseFile: true, lineItems: { orderBy: { sortOrder: "asc" } }, attachments: true }
    });
    if (!document) throw new NotFoundException("Document not found");

    try {
      if (document.type === "INVOICE") {
        await this.ensurePaymentUrl(id);
        document = await this.prisma.document.findUnique({
          where: { id },
          include: { client: true, caseFile: true, lineItems: { orderBy: { sortOrder: "asc" } }, attachments: true }
        });
        if (!document) throw new NotFoundException("Document not found");
      }
      const documentForMail =
        document.type === "BOOKING" && !document.confirmationToken
          ? await this.prisma.document.update({
              where: { id },
              data: { confirmationToken: createConfirmationToken() },
              include: { client: true, caseFile: true, lineItems: { orderBy: { sortOrder: "asc" } }, attachments: true }
            })
          : document;
      await this.mail.sendDocumentMail(documentForMail);
      await this.recordOutboundDocumentEmail(documentForMail);
      await this.prisma.document.update({
        where: { id },
        data: { status: "SENT", emailStatus: "SENT", emailError: null, sentAt: new Date() }
      });
    } catch (error) {
      await this.prisma.document.update({
        where: { id },
        data: {
          emailStatus: "FAILED",
          emailError: error instanceof Error ? error.message : "Email send failed"
        }
      });
    }
  }

  private async recordOutboundDocumentEmail(document: any) {
    const subject = documentEmailSubject(document);
    const now = new Date();
    const fromEmail = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME || "admin@eelectrics.co.uk";
    const fromName = process.env.MAIL_FROM_NAME || "E Electrics Ltd";
    const toEmail = document.client?.email;
    const textBody =
      document.type === "BOOKING"
        ? `Booking confirmation email sent for ${document.documentNo}. Please confirm your booking using the link in the email.`
        : `${titleForDocument(document.type)} email sent for ${document.documentNo}.`;

    const thread =
      (await this.prisma.emailThread.findFirst({
        where: { documentId: document.id, deletedAt: null },
        orderBy: { updatedAt: "desc" }
      })) ??
      (await this.prisma.emailThread.create({
        data: {
          subject,
          normalizedSubject: normalizeEmailSubject(subject),
          fromEmail: toEmail,
          fromName: [document.client?.firstName, document.client?.lastName].filter(Boolean).join(" ") || undefined,
          toEmail,
          documentId: document.id,
          clientId: document.clientId,
          unreadCount: 0,
          lastMessageAt: now
        }
      }));

    await this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        messageId: `document-${document.id}-${Date.now()}`,
        direction: "OUTBOUND",
        fromEmail,
        fromName,
        toEmail,
        subject,
        textBody,
        isRead: true,
        sentAt: now
      }
    });
    await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: {
        subject,
        normalizedSubject: normalizeEmailSubject(subject),
        documentId: document.id,
        clientId: document.clientId,
        toEmail,
        lastMessageAt: now
      }
    });
  }

  async cloneAsRevision(id: string, _dto: CloneDocumentDto) {
    const source = await this.detail(id);
    const rootDocumentId = source.rootDocumentId ?? source.id;
    const latestRevision = await this.prisma.document.findFirst({
      where: { rootDocumentId },
      orderBy: { revisionNo: "desc" }
    });
    const nextRevision = (latestRevision?.revisionNo ?? source.revisionNo) + 1;
    const rootDocument =
      source.id === rootDocumentId
        ? source
        : await this.prisma.document.findUnique({
            where: { id: rootDocumentId },
            select: { documentNo: true }
          });
    if (!rootDocument) throw new NotFoundException("Root document not found");

    const clone = await this.prisma.document.create({
      data: {
        type: source.type,
        status: "DRAFT",
        documentNo: rootDocument.documentNo,
        caseFileId: source.caseFileId,
        clientId: source.clientId,
        parentDocumentId: source.id,
        rootDocumentId,
        revisionNo: nextRevision,
        jobTitle: source.jobTitle,
        description: source.description,
        greeting: source.greeting,
        emailNote: source.emailNote,
        cc: source.cc,
        phoneNo: source.phoneNo,
        postalCode: source.postalCode,
        addressLine: source.addressLine,
        extraAddress: source.extraAddress,
        selectedAddress: source.selectedAddress,
        hasOccupier: source.hasOccupier,
        occupierFirstName: source.occupierFirstName,
        occupierLastName: source.occupierLastName,
        occupierPhone: source.occupierPhone,
        occupierPostalCode: source.occupierPostalCode,
        occupierAddressLine: source.occupierAddressLine,
        occupierExtraAddress: source.occupierExtraAddress,
        occupierSelectedAddress: source.occupierSelectedAddress,
        price: source.price,
        includeOptions: source.includeOptions,
        sendMail: source.sendMail,
        sendImages: source.sendImages,
        invoiceCheck: source.invoiceCheck,
        emailSubject: source.emailSubject,
        emailBody: source.emailBody,
        pdfNotes: source.pdfNotes,
        emailStatus: source.emailStatus,
        emailError: source.emailError,
        issueDate: source.issueDate,
        dueDate: source.dueDate,
        bookingDate: source.bookingDate,
        bookingConfirmed: source.bookingConfirmed,
        confirmedAt: source.confirmedAt,
        subtotal: source.subtotal,
        total: source.total,
        lineItems: {
          create: source.lineItems.map((item, index) => ({
            kind: item.kind,
            title: item.title,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            sortOrder: index
          }))
        },
        attachments: {
          create: this.toAttachmentCreates(source.attachments)
        }
      }
    });

    return this.detail(clone.id);
  }

  async ensurePaymentUrl(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { client: true }
    });
    if (!document) throw new NotFoundException("Document not found");
    if (document.type !== "INVOICE") throw new BadRequestException("Only invoices have online payment");
    const secret = stripeSecret();
    if (document.paymentUrl && paymentUrlMatchesStripeMode(document.paymentUrl, secret)) return document.paymentUrl;

    const paymentUrl = await this.createStripeCheckoutUrl(document, secret);
    await this.prisma.document.update({
      where: { id },
      data: { paymentUrl }
    });
    return paymentUrl;
  }

  async markPaidFromPayment(id: string, sessionId?: string) {
    const document = await this.ensureExists(id);
    if (document.type !== "INVOICE") throw new BadRequestException("Only invoices can be marked paid from payment");
    const total = Number(document.total ?? document.price ?? 0);
    const currentPaid = Number(document.paidAmount ?? 0);
    const remaining = Math.max(0, total - currentPaid);

    let amountCharged = 0;
    if (sessionId) {
      try {
        const secret = stripeSecret();
        const stripe = new Stripe(secret);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session && session.amount_total) {
          amountCharged = session.amount_total / 100;
        }
      } catch {
        // Fallback below
      }
    }

    if (!amountCharged || amountCharged <= 0) {
      const partialRequested =
        document.partialPaymentAmount !== null && document.partialPaymentAmount !== undefined
          ? Number(document.partialPaymentAmount)
          : 0;
      if (partialRequested > 0 && partialRequested < remaining) {
        amountCharged = partialRequested;
      } else {
        amountCharged = remaining > 0 ? remaining : total;
      }
    }

    if (amountCharged > 0) {
      await this.prisma.paymentRecord.create({
        data: {
          documentId: id,
          amount: amountCharged,
          note: amountCharged < remaining ? "Online Stripe partial payment" : "Online Stripe payment (Settlement)",
          method: "STRIPE",
          paidAt: new Date()
        }
      });
    }

    const allPayments = await this.prisma.paymentRecord.findMany({ where: { documentId: id } });
    const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const isFullyPaid = totalPaid >= total && total > 0;
    const isPartiallyPaid = totalPaid > 0 && totalPaid < total;
    const remainingAfter = Math.max(0, total - totalPaid);

    await this.prisma.document.update({
      where: { id },
      data: {
        paidAmount: totalPaid,
        partialPaymentAmount: null, // Reset requested partial amount once paid so next link is for remaining balance!
        paymentStatus: isFullyPaid ? "PAID" : isPartiallyPaid ? "PARTIALLY_PAID" : "NOT_PAID",
        status: isFullyPaid ? "PAID" : (document.status === "PAID" ? "PARTIALLY_PAID" : document.status),
        paidAt: isFullyPaid ? (document.paidAt || new Date()) : null,
        paymentUrl: null // Clear cached payment url so next link uses updated remaining balance!
      }
    });

    return {
      isFullyPaid,
      paidThisTime: amountCharged,
      totalPaid,
      remainingAmount: remainingAfter
    };
  }

  async markPaid(id: string) {
    const document = await this.ensureExists(id);
    if (document.type !== "INVOICE" && document.type !== "QUOTATION") {
      throw new BadRequestException("Only invoices and quotations can be marked paid");
    }
    const total = Number(document.total ?? document.price ?? 0);
    const currentPaid = Number(document.paidAmount ?? 0);
    const remaining = Math.max(0, total - currentPaid);
    if (remaining > 0) {
      await this.prisma.paymentRecord.create({
        data: {
          documentId: id,
          amount: remaining,
          note: "Marked as paid in full",
          method: "BANK_TRANSFER",
          paidAt: new Date()
        }
      });
    }
    await this.prisma.document.update({
      where: { id },
      data: {
        paidAmount: total,
        paymentStatus: "PAID",
        status: "PAID",
        paidAt: new Date(),
        paymentUrl: null
      }
    });
    return this.detail(id);
  }

  async recordPayment(id: string, dto: RecordPaymentDto) {
    const document = await this.ensureExists(id);
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than zero");
    }
    await this.prisma.paymentRecord.create({
      data: {
        documentId: id,
        amount,
        note: dto.note?.trim() || "Partial payment",
        method: dto.method?.trim() || "BANK_TRANSFER",
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date()
      }
    });

    const allPayments = await this.prisma.paymentRecord.findMany({ where: { documentId: id } });
    const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const total = Number(document.total ?? document.price ?? 0);
    const isFullyPaid = totalPaid >= total && total > 0;
    const isPartiallyPaid = totalPaid > 0 && totalPaid < total;

    await this.prisma.document.update({
      where: { id },
      data: {
        paidAmount: totalPaid,
        paymentStatus: isFullyPaid ? "PAID" : isPartiallyPaid ? "PARTIALLY_PAID" : "NOT_PAID",
        status: isFullyPaid ? "PAID" : (document.status === "PAID" ? "PARTIALLY_PAID" : document.status),
        paidAt: isFullyPaid ? (document.paidAt || new Date()) : null,
        paymentUrl: null
      }
    });

    return this.detail(id);
  }

  async markSent(id: string) {
    await this.ensureExists(id);
    await this.prisma.document.update({
      where: { id },
      data: { emailStatus: "PENDING", emailError: null }
    });
    await this.sendMailAndUpdateStatus(id);
    return this.detail(id);
  }

  private async resolveClientId(dto: CreateDocumentDto) {
    if (dto.clientId) return dto.clientId;
    if (!dto.client) return undefined;
    const firstName = dto.client.firstName?.trim();
    const lastName = dto.client.lastName?.trim() || undefined;
    const email = dto.client.email?.trim() || undefined;
    const phone = dto.client.phone?.trim() || undefined;

    if (!firstName && !email && !phone) return undefined;

    const existing = await this.prisma.client.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
          ...(firstName && lastName ? [{ firstName, lastName }] : [])
        ]
      },
      orderBy: { createdAt: "asc" }
    });
    if (existing) return existing.id;

    if (firstName) {
      const client = await this.prisma.client.create({
        data: {
          firstName,
          lastName: lastName ?? null,
          email: email ?? null,
          phone: phone ?? null,
          company: dto.client.company?.trim() ?? null,
          notes: dto.client.notes?.trim() ?? null
        }
      });
      return client.id;
    }
    return undefined;
  }

  private async findDuplicateBooking(dto: CreateDocumentDto, clientId?: string) {
    if (!clientId) return undefined;
    const bookingDate = dto.bookingDate ? new Date(dto.bookingDate) : undefined;
    const startOfDay = bookingDate ? new Date(bookingDate) : undefined;
    startOfDay?.setHours(0, 0, 0, 0);
    const endOfDay = bookingDate ? new Date(bookingDate) : undefined;
    endOfDay?.setHours(23, 59, 59, 999);

    return this.prisma.document.findFirst({
      where: {
        type: "BOOKING",
        clientId,
        jobTitle: dto.jobTitle,
        addressLine: dto.addressLine,
        bookingDate:
          startOfDay && endOfDay
            ? {
                gte: startOfDay,
                lte: endOfDay
              }
            : undefined
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
  }

  private async resolveCaseFile(dto: CreateDocumentDto, clientId?: string) {
    if (dto.caseFileId) {
      return this.prisma.caseFile.findUnique({ where: { id: dto.caseFileId } });
    }

    if (dto.sourceDocumentId) {
      const source = await this.prisma.document.findUnique({
        where: { id: dto.sourceDocumentId },
        include: { caseFile: true }
      });
      if (source?.caseFile) return source.caseFile;
    }

    const serialNo = await this.counters.nextSerialNo();
    return this.prisma.caseFile.create({
      data: {
        serialNo,
        title: dto.jobTitle,
        clientId
      }
    });
  }

  private calculateTotals(items: LineItemDto[] = []) {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return { subtotal, total: subtotal };
  }

  private toLineItemCreates(items: LineItemDto[] = []) {
    return items.map((item, index) => ({
      kind: item.kind,
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
      sortOrder: index
    }));
  }

  private toAttachmentCreates(attachments: { name: string; mimeType?: string | null; size?: number | null; dataUrl: string }[] = []) {
    return attachments
      .filter((attachment) => attachment.name && attachment.dataUrl)
      .map((attachment) => ({
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        dataUrl: attachment.dataUrl
      }));
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.document.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Document not found");
    return exists;
  }

  private async createStripeCheckoutUrl(
    document: {
      id: string;
      documentNo: string;
      type: string;
      price: unknown;
      total: unknown;
      paidAmount?: unknown;
      partialPaymentAmount?: unknown;
      addressLine?: string | null;
    },
    secret: string
  ) {
    const total = Number(document.price ?? document.total ?? 0);
    const paid = Number(document.paidAmount ?? 0);
    const remaining = Math.max(0, total - paid);

    const partialRequested =
      document.partialPaymentAmount !== null && document.partialPaymentAmount !== undefined
        ? Number(document.partialPaymentAmount)
        : 0;

    const isPartialCharge = partialRequested > 0 && partialRequested < remaining;
    const amountToCharge = isPartialCharge ? partialRequested : (remaining > 0 ? remaining : total);
    const amount = Math.round(amountToCharge * 100);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("Payment amount is invalid");

    const stripe = new Stripe(secret);
    const productName = isPartialCharge
      ? `${titleForDocument(document.type)} ${document.documentNo} - Partial Payment (£${amountToCharge.toFixed(2)})`
      : (remaining > 0 && paid > 0
        ? `${titleForDocument(document.type)} ${document.documentNo} - Remaining Balance (£${amountToCharge.toFixed(2)})`
        : `${titleForDocument(document.type)} ${document.documentNo}`);

    const product = await stripe.products.create({
      name: productName
    });
    const price = await stripe.prices.create({
      unit_amount: amount,
      currency: "GBP",
      product: product.id
    });
    const response = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: price.id, quantity: 1 }],
      mode: "payment",
      success_url: `${publicApiBaseUrl()}/public/payments/${document.id}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicApiBaseUrl()}/public/payments/${document.id}/cancel`,
      metadata: {
        documentId: document.id,
        documentNo: document.documentNo,
        type: document.type,
        amountCharged: String(amountToCharge)
      }
    });

    if (!response.url) throw new BadRequestException("Stripe checkout URL was not created");
    return response.url;
  }
}

function createConfirmationToken() {
  return randomBytes(45).toString("base64url");
}

function documentEmailSubject(document: any) {
  const id = document.documentNo || document.id || "-";
  const address = document.addressLine || document.selectedAddress || "-";
  if (document.type === "BOOKING") return `Booking from Eelectrics LTD | ${id} | ${address}`;
  if (document.type === "QUOTATION") return `Quotation from Eelectrics LTD | ${id} | ${address}`;
  return `Invoice from Eelectrics LTD | ${id} | ${address}`;
}

function normalizeEmailSubject(subject: string) {
  return subject.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim().toLowerCase();
}

function titleForDocument(type: string) {
  if (type === "BOOKING") return "Booking";
  if (type === "QUOTATION") return "Quotation";
  return "Invoice";
}

function stripeSecret() {
  const secret = (process.env.STRIPE_SECRET ?? "").replace(/\s+/g, "").trim();
  if (!secret) throw new BadRequestException("Stripe secret key is missing");
  return secret;
}

function paymentUrlMatchesStripeMode(paymentUrl: string, secret: string) {
  if (secret.startsWith("sk_test_")) return paymentUrl.includes("cs_test_");
  if (secret.startsWith("sk_live_")) return paymentUrl.includes("cs_live_");
  return true;
}

function publicApiBaseUrl() {
  const configured = process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL;
  if (configured) return configured.split(",")[0].trim().replace(/\/$/, "");

  const appBase = (process.env.PUBLIC_APP_URL || process.env.WEB_ORIGIN || "http://localhost:5174").split(",")[0].trim();
  try {
    const url = new URL(appBase);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.port = process.env.PORT || "3000";
    }
    url.pathname = "/api";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3000/api";
  }
}
