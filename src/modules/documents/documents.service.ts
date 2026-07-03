import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CountersService } from "./../../common/counters.service";
import { PrismaService } from "../../common/prisma.service";
import { CloneDocumentDto, CreateDocumentDto, DocumentStatusValue, DocumentTypeValue, LineItemDto, UpdateDocumentDto } from "./dto";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: CountersService
  ) {}

  list(filters: { type?: DocumentTypeValue; status?: string; q?: string }) {
    return this.prisma.document.findMany({
      where: {
        type: filters.type,
        status: filters.status as DocumentStatusValue | undefined,
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
        parentDocument: true,
        revisions: {
          include: { lineItems: true },
          orderBy: { revisionNo: "desc" }
        }
      }
    });

    if (!document) throw new NotFoundException("Document not found");
    return document;
  }

  async create(dto: CreateDocumentDto) {
    const clientId = await this.resolveClientId(dto);
    const duplicateBooking = dto.type === "BOOKING" ? await this.findDuplicateBooking(dto, clientId) : undefined;
    if (duplicateBooking) return this.detail(duplicateBooking.id);

    const caseFile = await this.resolveCaseFile(dto, clientId);
    const documentNo = await this.counters.nextDocumentNo(dto.type, caseFile?.serialNo);
    const lineItems = dto.type === "BOOKING" ? [] : dto.lineItems ?? [];
    const totals = this.calculateTotals(lineItems);

    const document = await this.prisma.document.create({
      data: {
        type: dto.type,
        status: dto.status ?? "DRAFT",
        documentNo,
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
        price: dto.price ?? totals.total,
        includeOptions: dto.includeOptions?.length ? JSON.stringify(dto.includeOptions) : undefined,
        sendMail: dto.sendMail ?? false,
        sendImages: dto.sendImages ?? false,
        invoiceCheck: dto.invoiceCheck ?? false,
        emailSubject: dto.emailSubject,
        emailBody: dto.emailBody,
        pdfNotes: dto.pdfNotes,
        emailStatus: dto.sendMail ? "SENT" : "NOT_SENT",
        emailError: null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : undefined,
        subtotal: totals.subtotal,
        total: dto.price ?? totals.total,
        lineItems: {
          create: this.toLineItemCreates(lineItems)
        }
      },
      include: { client: true, caseFile: true, lineItems: true }
    });

    if (!document.rootDocumentId) {
      await this.prisma.document.update({
        where: { id: document.id },
        data: { rootDocumentId: document.id }
      });
    }

    return this.detail(document.id);
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.ensureExists(id);
    const clientId = await this.resolveClientId(dto);
    const lineItems = dto.type === "BOOKING" ? [] : dto.lineItems ?? [];
    const totals = this.calculateTotals(lineItems);

    await this.prisma.$transaction([
      this.prisma.lineItem.deleteMany({ where: { documentId: id } }),
      this.prisma.document.update({
        where: { id },
        data: {
          status: dto.status ?? "DRAFT",
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
          price: dto.price ?? totals.total,
          includeOptions: dto.includeOptions?.length ? JSON.stringify(dto.includeOptions) : null,
          sendMail: dto.sendMail ?? false,
          sendImages: dto.sendImages ?? false,
          invoiceCheck: dto.invoiceCheck ?? false,
          emailSubject: dto.emailSubject,
          emailBody: dto.emailBody,
          pdfNotes: dto.pdfNotes,
          emailStatus: dto.sendMail ? "SENT" : "NOT_SENT",
          emailError: null,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : null,
          subtotal: totals.subtotal,
          total: dto.price ?? totals.total,
          lineItems: { create: this.toLineItemCreates(lineItems) }
        }
      })
    ]);

    return this.detail(id);
  }

  async remove(id: string) {
    await this.ensureExists(id);

    await this.prisma.$transaction([
      this.prisma.lineItem.deleteMany({ where: { documentId: id } }),
      this.prisma.document.updateMany({
        where: { parentDocumentId: id },
        data: { parentDocumentId: null }
      }),
      this.prisma.document.delete({ where: { id } })
    ]);

    return { id, deleted: true };
  }

  async cloneAsRevision(id: string, _dto: CloneDocumentDto) {
    const source = await this.detail(id);
    if (source.type === "BOOKING") {
      throw new BadRequestException("Booking revisions are not allowed");
    }
    const rootDocumentId = source.rootDocumentId ?? source.id;
    const latestRevision = await this.prisma.document.findFirst({
      where: { rootDocumentId },
      orderBy: { revisionNo: "desc" }
    });
    const nextRevision = (latestRevision?.revisionNo ?? source.revisionNo) + 1;
    const documentNo = await this.counters.nextDocumentNo(source.type as DocumentTypeValue, source.caseFile?.serialNo);

    const clone = await this.prisma.document.create({
      data: {
        type: source.type,
        status: "DRAFT",
        documentNo,
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
        }
      }
    });

    return this.detail(clone.id);
  }

  async markPaid(id: string) {
    await this.ensureExists(id);
    return this.prisma.document.update({
      where: { id },
      data: {
        paymentStatus: "PAID",
        status: "PAID",
        paidAt: new Date()
      }
    });
  }

  async markSent(id: string) {
    await this.ensureExists(id);
    return this.prisma.document.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date()
      }
    });
  }

  private async resolveClientId(dto: CreateDocumentDto) {
    if (dto.clientId) return dto.clientId;
    if (!dto.client) return undefined;
    if (dto.client.email || dto.client.phone) {
      const existing = await this.prisma.client.findFirst({
        where: {
          OR: [
            ...(dto.client.email ? [{ email: dto.client.email }] : []),
            ...(dto.client.phone ? [{ phone: dto.client.phone }] : [])
          ]
        },
        orderBy: { createdAt: "asc" }
      });
      if (existing) return existing.id;
    }
    const client = await this.prisma.client.create({
      data: {
        firstName: dto.client.firstName,
        lastName: dto.client.lastName,
        email: dto.client.email,
        phone: dto.client.phone,
        company: dto.client.company,
        notes: dto.client.notes
      }
    });
    return client.id;
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

  private async ensureExists(id: string) {
    const exists = await this.prisma.document.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Document not found");
    return exists;
  }
}
