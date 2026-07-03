import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { client: true, caseFile: true, lineItems: { orderBy: { sortOrder: "asc" } } }
    });
    if (!document) throw new NotFoundException("Document not found");

    const clientName = [document.client?.firstName, document.client?.lastName].filter(Boolean).join(" ");
    const rows = document.lineItems
      .map(
        (item) =>
          `<tr><td>${item.kind}</td><td>${item.title}</td><td>${item.quantity}</td><td>${item.unitPrice}</td><td>${item.total}</td></tr>`
      )
      .join("");

    return {
      html: `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 40px; }
    header { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; }
    h1 { font-size: 24px; margin: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 10px; text-align: left; }
    .total { text-align: right; font-size: 20px; font-weight: 700; margin-top: 20px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${document.type} ${document.documentNo}</h1>
      <p>S.No: ${document.caseFile?.serialNo ?? "Standalone"}</p>
    </div>
    <div>
      <strong>${clientName || "No client"}</strong><br/>
      ${document.addressLine ?? ""}
    </div>
  </header>
  <h2>${document.jobTitle}</h2>
  <p>${document.description ?? ""}</p>
  <table>
    <thead><tr><th>Type</th><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">Total: ${document.total}</p>
</body>
</html>`
    };
  }
}

