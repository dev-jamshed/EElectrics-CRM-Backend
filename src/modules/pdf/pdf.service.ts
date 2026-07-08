import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";

const LOGO_URL = "https://res.cloudinary.com/djneoqoqk/image/upload/v1734727264/email_logo_aqoox6.png";
const ARROW_URL = "https://res.cloudinary.com/djneoqoqk/image/upload/v1706693281/icons8-down-right-64_jbnhgq.png";

@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(id: string) {
    const html = await this.renderHtml(id);
    return { html };
  }

  async renderHtml(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { client: true, caseFile: true, lineItems: { orderBy: { sortOrder: "asc" } } }
    });
    if (!document) throw new NotFoundException("Document not found");

    return renderOldCrmPdf(document);
  }
}

function renderOldCrmPdf(document: any) {
  return document.type === "BOOKING" ? renderOldBookingTemplate(document) : renderOldInvoiceQuotationTemplate(document);
}

function renderOldInvoiceQuotationTemplate(document: any) {
  const type = String(document.type ?? "").toUpperCase();
  const title = type === "QUOTATION" ? "Quotation" : "Invoice";
  const clientName = [document.client?.firstName, document.client?.lastName].filter(Boolean).join(" ");
  const body = richText(document.description || document.emailBody || "");
  const notes = richText(document.emailNote || "");
  const pdfNotes = richText(document.pdfNotes || "");
  const total = amount(document.price ?? document.total);
  const includeFooter = renderIncludeFooter(document, total);
  const paymentSection = renderPaymentMethodSection(document, type);
  const lineItemRows = renderPdfLineItems(document.lineItems);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    #doc-target {
      font-family: sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #000;
      line-height: 1.6em;
      margin: 0 auto;
    }
    #outer {
      margin-bottom: 10px;
      width: 747px;
      margin-left: auto;
      margin-right: auto;
      background: #fff;
    }
    body {
      padding: 0px;
      margin: 0px;
      font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif;
      color: black;
      background: #E8E8E8;
    }
    .main-container{
      padding: 0px 20px;
    }
    .top-orange-line{
      padding: 8px 0px;
      border-top: 3px solid #DD2D3E;
    }
    .header{
      display: flex;
    }
    .header .col-1{
      width: 55%;
    }
    .header-col-1-details p,.header-col-2-details p{
      font-size: 13px;
      margin: 0px;
      padding: 0px;
      line-height: 16.5px;
      font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif;
    }
    .user-detail {
      display: flex;
      justify-content: space-between;
    }
    .u-1{
      width: 71px;
    }
    .u-2{
      text-align: right !important;
      flex: 1;
      overflow-wrap: anywhere;
    }
    .header .col-2{
      width: 45%;
    }
    .logo img{
      display: block;
      width: 100%;
      max-width: 180px;
      padding-bottom: 10px;
    }
    .mail-heading p{
      border-bottom: 3px solid #DD2D3E;
      font-size: 20px;
      font-weight: bold;
      padding-bottom: 0px;
      margin: 16px 0px 13px;
    }
    .description-container{
      margin: 10px 0px;
      line-height: 17.5px;
    }
    .description-header,.final-price-footer{
      background-color: #DD2D3E;
      font-weight: bold;
      font-size: 13px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0px 20px;
    }
    .description-header p,.final-price-footer p,.discount-price-footer p{
      margin: 0px;
      padding: 10px 0px;
    }
    .description-body{
      background-color:PapayaWhip;
    }
    .job-description-div,.description-div,.discount-price-footer{
      padding: 0px 20px;
      font-size: 13px;
    }
    .discount-price-footer{
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: bold;
    }
    .job-description-div{
      border-bottom: 1px solid #DD2D3E ;
      display: flex;
      align-items: center;
    }
    .job-description-div p{
      padding: 10px 0px;
      margin: 0px;
    }
    .description-div{
      border-bottom: 2px solid #DD2D3E;
      min-height: 95px;
      overflow-wrap: anywhere;
    }
    .description-body ul,.description-body ol{
      padding-left: 25px;
    }
    .note-container{
      line-height: 17.5px;
    }
    .note-container p{
      font-size: 13px;
      margin: 5px 0px;
    }
    .note,.payment-container p{
      margin: 5px 0px;
      padding:5px 0px !important;
      font-size: 15px !important;
      font-weight: bold;
      border-bottom: 2px solid #DD2D3E;
    }
    .payment-container ul{
      margin:5px 0px ;
      list-style:none;
      padding-left: 0px;
      line-height: 17.5px;
      font-size: 13px !important;
    }
    .payment-section{
      margin-top: 12px;
      font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif;
    }
    .payment-heading{
      display: inline-block;
      font-size: 12.5px;
      font-weight: bold;
      padding-bottom: 3px;
      margin-bottom: 0px;
      border-bottom: 1.5px solid #DD2D3E;
    }
    .bank-card{
      background-color: #fff8f8;
      border: 1px solid #DD2D3E;
      border-radius: 10px;
      padding: 30px;
      max-width: 600px;
      margin: 20px auto 15px;
      box-shadow: 0 2px 8px rgba(221, 45, 62, 0.1);
    }
    .bank-title{
      font-size: 18px;
      font-weight: bold;
      color: #DD2D3E;
      margin: 0px 0px 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
      text-align: center;
    }
    .bank-list{
      list-style-type: none;
      font-size: 15px;
      padding-left: 0px;
      margin: 0px;
      text-align: left;
      line-height: 2;
    }
    .bank-list li{
      padding: 10px 15px;
      border-bottom: 1px solid #eee;
      background-color: #fff;
    }
    .bank-list li:nth-child(3),.bank-list li:nth-child(4){
      background-color: #f9f9f9;
    }
    .bank-list li:last-child{
      border-bottom: 0;
    }
    .bank-list strong{
      color: #DD2D3E;
      font-size: 14px;
    }
    .bank-list span{
      float: right;
      font-weight: 600;
    }
    .bank-list .highlight{
      font-weight: bold;
      font-size: 17px;
      color: #DD2D3E;
    }
    .stripe-small{
      text-align: center;
      padding: 5px;
      font-size: 9px;
      color: #999;
      margin: 5px 0px;
    }
    .stripe-small a{
      color: #999;
      font-size: 9px;
    }
    .payment-grid{
      width: 100%;
      margin-top: 8px;
    }
    .payment-td{
      width: 40%;
      vertical-align: top;
    }
    .payment-ul{
      list-style-type: none;
      font-size: 13px;
      padding-left: 0px;
      padding-top: 0px;
      margin-top: 0px;
      line-height: 17.5px;
    }
    .stripe-td{
      width: 60%;
      text-align: center;
      padding: 0px 20px;
      vertical-align: top;
    }
    .pay-now{
      background-color: #DD2D3E;
      color: white;
      text-decoration: none;
      padding: 4px 13px;
      margin: 0px 0px 40px;
      display: inline-block;
      border-radius: 5px;
      font-size: 12.5px;
    }
    @page {
      size: 850px 900px;
      margin: 0 !important;
      padding: 0 !important
    }
    @media print {
      body { background: #fff; }
      #outer { margin: 0 auto; }
    }
    @media only screen and (max-width: 820px) {
      #outer { width: 100%; }
      .payment-td,.stripe-td{
        width: 100%;
        display: block;
      }
      .stripe-td{
        text-align: left;
        padding: 10px 0px 0px;
      }
    }
  </style>
</head>
<body onload="generatePdf()">
  <div id="outer">
    <div id="doc-target">
      <div id="lipsum">
        <div class="main-container">
          <div class="top-orange-line"></div>
          <div class="logo">
            <img src="${LOGO_URL}" title="logo" alt="Company logo" />
          </div>
          <div class="header">
            <div class="col-1">
              <div class="header-col-1-details">
                <p style="font-weight: bold;">E Electrics | E Electrics Limited</p>
                <p style="font-weight: bold;">Head Office: Dent Close, Essex,RM15 5DS</p>
                <p>Registration No: 12418331 </p>
                <p>NAPIT Member No: 65513 </p>
                <p>info@eelectrics.co.uk | 0800 999 1452 </p>
              </div>
            </div>
            <div class="col-2">
              <div class="header-col-2-details">
                ${detailRow(`${title} :`, document.documentNo || "-")}
                ${detailRow("Date :", formatDate(document.issueDate))}
                ${detailRow("FAO :", clientName || "-")}
                ${detailRow("Address :", document.addressLine || document.selectedAddress || "-")}
                ${document.extraAddress ? detailRow("Address 2 :", document.extraAddress) : ""}
              </div>
            </div>
          </div>
          <div class="mail-heading">
            <p>${title}</p>
          </div>
          <div class="description-container">
            <div class="description-header">
              <p>Description</p>
              <p>Price</p>
            </div>
            <div class="description-body">
              <div class="job-description-div">
                <img width="20px" style="padding-right: 5px;" src="${ARROW_URL}" alt="">
                <p>${escapeHtml(document.jobTitle || "")}</p>
              </div>
              ${lineItemRows || `<div class="description-div">${body || "-"}</div>`}
            </div>
            <div class="description-footer">
              ${includeFooter}
              <div class="final-price-footer">
                <p>Total to be Paid</p>
                <p>${formatPounds(total)}</p>
              </div>
            </div>
          </div>
          ${notes ? `<div class="note-container"><p class="note">Notes:</p><p>${notes}</p></div>` : ""}
          ${pdfNotes ? `<div class="note-container"><p class="note">PDF Notes:</p><p>${pdfNotes}</p></div>` : ""}
          ${paymentSection}
        </div>
      </div>
    </div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
    window.jsPDF = window.jspdf && window.jspdf.jsPDF;
    function generatePdf() {
      var htmlElement = document.getElementById('doc-target');
      if (!window.jsPDF || !htmlElement) return;
      var jsPdf = new window.jsPDF('p', 'pt', 'a4');
      jsPdf.html(htmlElement, {
        callback: function(pdf) {
          window.location.href = pdf.output('bloburl');
        },
        margin: [20, 0, 20, 0],
        autoPaging: 'text',
        html2canvas: {
          allowTaint: true,
          dpi: 300,
          letterRendering: true,
          logging: false,
          scale: 0.8
        }
      });
    }
  </script>
</body>
</html>`;
}

function renderOldBookingTemplate(document: any) {
  const clientName = [document.client?.firstName, document.client?.lastName].filter(Boolean).join(" ");
  const greeting = richText(document.greeting || document.description || "");
  const notes = richText(document.emailNote || "");
  const pdfNotes = richText(document.pdfNotes || "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    .new-p{
      margin: 0px;
      padding: 0px;
      font-size: 14px;
    }
    body {
      padding: 0px;
      margin: 0px;
      font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif;
      text-align: center;
      color: black;
      background: #d3d3d321;
    }
    body a {
      color: #06f;
    }
    .invoice-box {
      background-color: white;
      max-width: 850px;
      margin: auto;
      padding: 20px 0px;
      padding-bottom: 0px;
      font-size: 16px;
      font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif;
      color: black;
    }
    .invoice-box table {
      width: 100%;
      line-height: inherit;
      text-align: left;
      border-collapse: collapse;
    }
    .invoice-box table td {
      vertical-align: top;
    }
    .invoice-box table tr td:nth-child(2) {
      text-align: right;
    }
    .information_td{
      font-size: 13px;
      padding: 0px !important;
    }
    .text-align-right-td{
      text-align: right;
      overflow-wrap: anywhere;
    }
    .title_user{
      width: 71px;
    }
    .colum_user{
      width: 33%;
    }
    .logo{
      width: 100%;
      max-width: 200px
    }
    .greeting-desc{
      padding:20px 30px;
      font-size: 13px;
      text-align: left;
      overflow-wrap: anywhere;
    }
    .notes{
      font-size: 16px !important;
    }
    .footer{
      padding: 10px 20px;
      background-color:#DD2D3E;
      color: white;
      font-size: 13px !important;
    }
    @media only screen and (max-width: 640px) {
      .logo{
        width: 100%;
        max-width: 180px
      }
      .colum_user{
        width: 45%;
      }
      .booking-heading{
        font-size: 16px !important;
      }
    }
  </style>
</head>
<body>
  <div class="color-container" style="background:#d3d3d321;width: 100%;height: 100%;padding: 50px 0px;">
    <div class="invoice-box">
      <table>
        <tr class="top">
          <td style="padding: 20px 30px;padding-bottom: 0px;">
            <table>
              <tr>
                <td colspan="2" style="padding:0px !important">
                  <img class="logo" src="${LOGO_URL}" title="logo" alt="Company logo" />
                </td>
              </tr>
              <tr class="logo-td">
                <td style="padding-bottom: 5px;" class="logo-td">
                  <p class="new-p"><strong>E Electrics | E Electrics Limited</strong></p>
                  <p class="new-p"><strong>Head Office: </strong>Dent Close, Essex,RM15 5DS</p>
                  <p class="new-p">Registration No: 12418331</p>
                  <p class="new-p">NAPIT Member No: 65513</p>
                  <p class="new-p">info@eelectrics.co.uk | 0800 999 1452 </p>
                </td>
                <td class="colum_user">
                  <table>
                    <tr>
                      <td class="information_td title_user">Booking :</td>
                      <td class="information_td text-align-right-td">${escapeHtml(document.documentNo || "-")}</td>
                    </tr>
                    <tr>
                      <td class="information_td title_user">Date :</td>
                      <td class="information_td text-align-right-td">${escapeHtml(formatDate(document.bookingDate))}</td>
                    </tr>
                    <tr>
                      <td class="information_td title_user">FAO :</td>
                      <td class="information_td text-align-right-td">${escapeHtml(clientName || "-")}</td>
                    </tr>
                    <tr>
                      <td class="information_td title_user">Address :</td>
                      <td class="information_td text-align-right-td">${escapeHtml(document.addressLine || document.selectedAddress || "-")}</td>
                    </tr>
                    ${
                      document.extraAddress
                        ? `<tr><td class="information_td title_user">Address 2 :</td><td class="information_td text-align-right-td">${escapeHtml(document.extraAddress)}</td></tr>`
                        : ""
                    }
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="booking-heading" style="font-weight: bold;font-size: 20px;padding: 5px 0px 5px 0px;text-align: center;">BOOKING</td>
        </tr>
        <tr>
          <td class="greeting-desc">${greeting || "-"}</td>
        </tr>
        ${
          notes
            ? `<tr><td colspan="2" style="width: 100% !important;padding: 0px 30px; overflow-wrap:break-word !important;padding-top: 10px;padding-bottom: 10px;font-size: 13px;"><p class="notes" style=" margin-bottom: 0px; margin-top: 0px;padding-bottom: 5px;font-weight: bold;">Notes</p><table><tr><td class="display-block-sm" style="height: 1px;border-bottom:1.5px solid #DD2D3E;display: block !important;"></td></tr></table>${notes}</td></tr>`
            : ""
        }
        ${
          pdfNotes
            ? `<tr><td colspan="2" style="width: 100% !important;padding: 0px 30px; overflow-wrap:break-word !important;padding-top: 10px;padding-bottom: 10px;font-size: 13px;"><p class="notes" style=" margin-bottom: 0px; margin-top: 0px;padding-bottom: 5px;font-weight: bold;">PDF Notes</p><table><tr><td class="display-block-sm" style="height: 1px;border-bottom:1.5px solid #DD2D3E;display: block !important;"></td></tr></table>${pdfNotes}</td></tr>`
            : ""
        }
      </table>
      <table>
        <tr>
          <td class="footer" style="text-align: center;margin-top: 20px;display: block;">
            <p style="font-weight: bold;line-height: 18px;margin: 8px 0px; padding: 25px 0px;">© 2023 EElectrics. All rights reserved. For bookings and inquiries, contact us at <a href="mailto:info@eelectrics.co.uk" style="color: white;">info@eelectrics.co.uk</a> .</p>
          </td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function renderIncludeFooter(document: any, total: number) {
  const label = includeTotalLabel(parseInclude(document.includeOptions));
  if (!label) return "";
  return `<div class="discount-price-footer"><p>${escapeHtml(label)}</p><p>${formatPounds(total)}</p></div>`;
}

function renderPdfLineItems(items: any[] = []) {
  const rows = items.filter((item) => item?.title || item?.description || Number(item?.unitPrice || 0));
  if (!rows.length) return "";
  return rows
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const total = quantity * unitPrice;
      const detail = item.description ? `<br><span style="font-size:12px;color:#555;">${escapeHtml(item.description)}</span>` : "";
      return `<div class="job-description-div" style="justify-content:space-between;gap:20px;">
        <p><strong>${escapeHtml(item.title || "-")}</strong>${detail}<br><span style="font-size:12px;color:#666;">Qty ${quantity} x ${formatPounds(unitPrice)}</span></p>
        <p style="white-space:nowrap;font-weight:bold;">${formatPounds(total)}</p>
      </div>`;
    })
    .join("");
}

function renderPaymentMethodSection(document: any, type: string) {
  if (type === "INVOICE") {
    return `<div class="payment-section">
      <p class="payment-heading">Payment Method</p>
      <div class="bank-card">
        <p class="bank-title">Preferred Payment Method - Bank Transfer</p>
        <ul class="bank-list">
          <li><strong>Bank Name:</strong> <span>Barclays Bank</span></li>
          <li><strong>Account Name:</strong> <span>E electrics limited</span></li>
          <li><strong>Account Number:</strong> <span class="highlight">23929884</span></li>
          <li><strong>Sort Code:</strong> <span class="highlight">20-25-19</span></li>
        </ul>
        <p style="font-size: 11px; color: #666; margin-top: 15px; margin-bottom: 0px; font-style: italic; text-align: center;">Please use invoice number as reference</p>
      </div>
    </div>`;
  }

  return `<div class="payment-section">
    <p class="payment-heading">Payment Method</p>
    <table class="payment-grid">
      <tr class="payment-tr">
        <td class="payment-td" colspan="2">
          <ul class="payment-ul">
            <li><strong>Bank Name:</strong> &nbsp;Barclays Bank</li>
            <li><strong>Account Name:</strong> &nbsp;E electrics limited</li>
            <li><strong>Account No:</strong> &nbsp;23929884</li>
            <li><strong>SortCode:</strong> &nbsp;202519</li>
          </ul>
        </td>
      </tr>
    </table>
  </div>`;
}

function includeTotalLabel(includes: string[]) {
  const hasLabour = includes.includes("labour") || includes.includes("labour_only") || includes.includes("labour_material");
  const hasMaterial = includes.includes("material") || includes.includes("labour_material");
  if (hasLabour && hasMaterial) return "Total Including Labour and Materials";
  if (hasLabour) return "Total Including Only Labour";
  if (hasMaterial) return "Total Including Only Materials";
  if (includes.includes("total_paid")) return "Total Paid";
  return "";
}

function detailRow(label: string, value: unknown) {
  return `<div class="user-detail"><div class="u-1"><p>${escapeHtml(label)}</p></div><div class="u-2"><p>${escapeHtml(display(value))}</p></div></div>`;
}

function parseInclude(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeIncludes(value.map(String));
  try {
    const parsed: unknown = JSON.parse(String(value));
    if (Array.isArray(parsed)) return normalizeIncludes(parsed.map(String));
  } catch {
    return normalizeIncludes(String(value).split(","));
  }
  return [];
}

function normalizeIncludes(values: string[]) {
  const normalized = values
    .map((item) => item.trim().toLowerCase())
    .flatMap((item) => {
      if (item === "labour_material" || item === "labour & material") return ["labour", "material"];
      if (item === "labour_only") return ["labour"];
      if (item === "total paid") return ["total_paid"];
      return [item];
    });
  return Array.from(new Set(normalized));
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} - ${part("month")} - ${part("year")}`;
}

function formatPounds(value: number) {
  return `£ ${value.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function publicPaymentUrl(document: any) {
  return `${publicApiBaseUrl()}/public/payments/${document.id}`;
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

function amount(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function richText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const withoutDangerousTags = text.replace(/<\s*(script|style|iframe)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  const withoutHandlers = withoutDangerousTags.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  if (/<[a-z][\s\S]*>/i.test(withoutHandlers)) return withoutHandlers;
  return escapeHtml(withoutHandlers).replace(/\r?\n/g, "<br />");
}

function display(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: unknown) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
