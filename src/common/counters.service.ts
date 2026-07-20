import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

export type DocumentTypeValue = "BOOKING" | "INVOICE" | "QUOTATION";

const prefixes: Record<DocumentTypeValue, string> = {
  BOOKING: "BKG",
  INVOICE: "INV",
  QUOTATION: "QTN"
};

const MAX_DOCUMENT_SEQUENCE = 9999;

@Injectable()
export class CountersService {
  constructor(private readonly prisma: PrismaService) {}

  async nextSerialNo() {
    const counter = await this.prisma.counter.upsert({
      where: { id: "case_serial" },
      create: { id: "case_serial", nextSeq: 1001 },
      update: { nextSeq: { increment: 1 } }
    });

    return counter.nextSeq;
  }

  async nextDocumentNo(type: DocumentTypeValue) {
    const key = `document_${type.toLowerCase()}`;

    for (let attempt = 0; attempt < MAX_DOCUMENT_SEQUENCE; attempt += 1) {
      const counter = await this.prisma.counter.upsert({
        where: { id: key },
        create: { id: key, nextSeq: 2 },
        update: { nextSeq: { increment: 1 } }
      });
      const sequence = counter.nextSeq - 1;

      if (sequence > MAX_DOCUMENT_SEQUENCE) {
        throw new ConflictException(`No ${type.toLowerCase()} numbers are available in the 4-digit range`);
      }

      const documentNo = `${prefixes[type]}-${String(sequence).padStart(4, "0")}`;
      const existing = await this.prisma.document.findFirst({
        where: { documentNo },
        select: { id: true }
      });

      if (!existing) return documentNo;
    }

    throw new ConflictException(`No ${type.toLowerCase()} numbers are available in the 4-digit range`);
  }
}
