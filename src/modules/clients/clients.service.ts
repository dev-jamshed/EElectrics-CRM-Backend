import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { UpsertClientDto } from "./dto";

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(q?: string) {
    return this.prisma.client.findMany({
      where: q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { phone: { contains: q } },
              { company: { contains: q } }
            ]
          }
        : undefined,
      include: {
        _count: {
          select: {
            documents: true,
            caseFiles: true
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async detail(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        caseFiles: {
          include: {
            documents: {
              include: { lineItems: true },
              orderBy: { createdAt: "desc" }
            }
          },
          orderBy: { updatedAt: "desc" }
        },
        documents: {
          where: { caseFileId: null },
          include: { lineItems: true },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!client) throw new NotFoundException("Client not found");

    const totals = {
      bookings: 0,
      invoices: 0,
      quotations: 0
    };

    const allDocuments = [
      ...client.documents,
      ...client.caseFiles.flatMap((file) => file.documents)
    ];

    for (const doc of allDocuments) {
      if (doc.type === "BOOKING") totals.bookings += 1;
      if (doc.type === "INVOICE") totals.invoices += 1;
      if (doc.type === "QUOTATION") totals.quotations += 1;
    }

    return { ...client, totals };
  }

  create(dto: UpsertClientDto) {
    return this.prisma.client.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        notes: dto.notes
      }
    });
  }

  update(id: string, dto: UpsertClientDto) {
    return this.prisma.client.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        notes: dto.notes
      }
    });
  }
}

