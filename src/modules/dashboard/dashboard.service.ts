import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [clients, bookings, invoices, quotations, recentDocuments] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.document.count({ where: { type: "BOOKING" } }),
      this.prisma.document.count({ where: { type: "INVOICE" } }),
      this.prisma.document.count({ where: { type: "QUOTATION" } }),
      this.prisma.document.findMany({
        take: 8,
        include: { client: true, caseFile: true },
        orderBy: { updatedAt: "desc" }
      })
    ]);

    const unpaidInvoices = await this.prisma.document.aggregate({
      where: { type: "INVOICE", paymentStatus: "NOT_PAID" },
      _sum: { total: true }
    });

    return {
      counts: { clients, bookings, invoices, quotations },
      unpaidInvoiceTotal: unpaidInvoices._sum.total ?? 0,
      recentDocuments
    };
  }
}

