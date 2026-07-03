import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

export type DocumentTypeValue = "BOOKING" | "INVOICE" | "QUOTATION";

const prefixes: Record<DocumentTypeValue, string> = {
  BOOKING: "BKG",
  INVOICE: "INV",
  QUOTATION: "QTN"
};

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

  async nextDocumentNo(type: DocumentTypeValue, serialNo?: number) {
    const key = `document_${type.toLowerCase()}`;
    const counter = await this.prisma.counter.upsert({
      where: { id: key },
      create: { id: key, nextSeq: 2 },
      update: { nextSeq: { increment: 1 } }
    });
    const seq = String(counter.nextSeq - 1).padStart(3, "0");
    const serialPart = serialNo ? `${serialNo}-` : "";

    return `${prefixes[type]}-${serialPart}${seq}`;
  }
}
