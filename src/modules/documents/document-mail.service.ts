import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

const LOGO_URL = "https://res.cloudinary.com/djneoqoqk/image/upload/v1734727264/email_logo_aqoox6.png";
const ARROW_URL = "https://res.cloudinary.com/djneoqoqk/image/upload/v1706693281/icons8-down-right-64_jbnhgq.png";

@Injectable()
export class DocumentMailService {
  constructor(private readonly config: ConfigService) {}

  async sendDocumentMail(document: any) {
    const to = document.client?.email;
    if (!to) throw new Error("Client email is missing");

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
    const subject = oldCrmSubject(document);

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      cc: document.cc || undefined,
      subject,
      html: renderEmailHtml(document),
      attachments: buildMailAttachments(document)
    });
  }

  private isSecureMail() {
    const encryption = (this.config.get<string>("MAIL_ENCRYPTION") ?? "").toLowerCase();
    const port = Number(this.config.get<string>("MAIL_PORT") ?? 587);
    return encryption === "ssl" || port === 465;
  }
}

function renderEmailHtml(document: any) {
  return document.type === "BOOKING" ? renderBookingEmail(document) : renderDocumentEmail(document);
}

function buildMailAttachments(document: any) {
  if (!document.sendImages || !Array.isArray(document.attachments)) return [];
  return document.attachments
    .map((attachment: any, index: number) => dataUrlToAttachment(attachment, index))
    .filter(Boolean);
}

function dataUrlToAttachment(attachment: any, index: number) {
  const dataUrl = String(attachment.dataUrl ?? "");
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const mimeType = attachment.mimeType || match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const raw = match[3] ?? "";
  const content = isBase64 ? Buffer.from(raw, "base64") : Buffer.from(decodeURIComponent(raw));
  const filename = safeFilename(attachment.name || `image-${index + 1}.${extensionForMime(mimeType)}`);

  return {
    filename,
    content,
    contentType: mimeType
  };
}

function safeFilename(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return cleaned || "image";
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

function renderBookingEmail(document: any) {
  const clientName = [document.client?.firstName, document.client?.lastName].filter(Boolean).join(" ");
  const notes = richText(document.emailNote || "");
  const body = richText(document.greeting || document.description || document.emailBody || "");
  const confirmationUrl = publicDocumentUrl(document);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    .new-p{ margin: 0px; padding: 0px; font-size: 14px; }
    body { padding: 0px; margin: 0px; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; text-align: center; color: black; }
    .invoice-box { background-color: white; max-width: 850px; margin: auto; padding: 20px 0px 0px; font-size: 16px; font-family: 'Helvetica Neue', 'Helvetica', Helvetica, Arial, sans-serif; color: black; }
    .invoice-box table { width: 100%; line-height: inherit; text-align: left; border-collapse: collapse; }
    .invoice-box table td { vertical-align: top; }
    .information_td{ font-size: 13px; padding: 0px !important; }
    .text-align-right-td{ text-align: right; overflow-wrap: anywhere; }
    .title_user{ width: 71px; }
    .colum_user{ width: 33%; }
    .logo{ width: 100%; max-width: 200px }
    .greeting-desc{ padding:20px 30px; font-size: 13px; text-align: left; overflow-wrap: anywhere; }
    .notes{ font-size: 16px !important; }
    .footer{ padding: 10px 20px; background-color:#DD2D3E; color: white; font-size: 13px !important; }
    .confirm-booking{ background: #DD2D3E; color: white !important; border-radius: 5px; padding: 8px 14px; text-decoration: none; font-weight: 600; margin-left: 10px; }
  </style>
</head>
<body>
  <p>
    Please Confirm booking <a class="confirm-booking" href="${escapeAttribute(confirmationUrl)}">Click to Confirm</a>
  </p>
  <div class="color-container" style="background:#d3d3d321;width: 100%;height: 100%;padding: 50px 0px;">
    <div class="invoice-box">
      <table>
        <tr class="top">
          <td style="padding: 20px 30px;padding-bottom: 0px;">
            <table>
              <tr><td colspan="2" style="padding:0px !important"><img class="logo" src="${LOGO_URL}" title="logo" alt="Company logo" /></td></tr>
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
                    ${emailRow("Booking :", document.documentNo || "-")}
                    ${emailRow("Date :", formatDate(document.bookingDate))}
                    ${emailRow("FAO :", clientName || "-")}
                    ${emailRow("Address :", document.addressLine || document.selectedAddress || "-")}
                    ${document.extraAddress ? emailRow("Address 2 :", document.extraAddress) : ""}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td class="booking-heading" style="font-weight: bold;font-size: 20px;padding: 5px 0px 5px 0px;text-align: center;">BOOKING</td></tr>
        <tr><td class="greeting-desc">${body || "-"}</td></tr>
        ${notes ? `<tr><td colspan="2" style="width: 100% !important;padding: 0px 30px; overflow-wrap:break-word !important;padding-top: 10px;padding-bottom: 10px;font-size: 13px;"><p class="notes" style=" margin-bottom: 0px; margin-top: 0px;padding-bottom: 5px;font-weight: bold;">Notes</p><table><tr><td style="height: 1px;border-bottom:1.5px solid #DD2D3E;display: block !important;"></td></tr></table>${notes}</td></tr>` : ""}
      </table>
      ${footerHtml()}
    </div>
  </div>
</body>
</html>`;
}

function renderDocumentEmail(document: any) {
  const title = titleFor(document.type);
  const clientName = [document.client?.firstName, document.client?.lastName].filter(Boolean).join(" ");
  const isInvoice = document.type === "INVOICE";
  const greeting = richText(document.greeting || "");
  const body = richText(document.description || document.emailBody || "");
  const notes = richText(document.emailNote || "");
  const total = amount(document.price ?? document.total);
  const includeRow = renderIncludeRow(document, total);
  const paymentSection = renderPaymentMethodSection(document, String(document.type ?? ""));
  const downloadUrl = documentDownloadUrl(document);
  const downloadLabel = isInvoice ? "View & Download invoice PDF" : "View & Download quotation PDF";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      .pdf-container{width:100%;text-align:right;}
      body{font-family:'Helvetica Neue','Helvetica',Helvetica,Arial,sans-serif;color:black;margin:0;padding:0;background:#fff;}
      body a{color:#06f;}
      .invoice-box{text-align:center;max-width:700px;margin:auto;padding:20px 0px;font-size:16px;font-family:'Helvetica Neue','Helvetica',Helvetica,Arial,sans-serif;color:black;}
      .invoice-box table{width:100%;line-height:inherit;text-align:left;border-collapse:collapse;}
      .invoice-box table td{vertical-align:top;}
      .invoice-box table tr td:nth-child(2){text-align:right;}
      .invoice-box table tr.heading td{color:#fff;background:#DD2D3E;border-bottom:1px solid #DD2D3E;font-weight:bold;padding:10px 20px;font-size:13px;font-family:Verdana,Arial,Helvetica,sans-serif;}
      .invoice-box table tr.first_heading td{border-bottom:2px solid #DD2D3E;border-top:1px solid #DD2D3E;font-weight:bold;padding:10px 20px;font-size:13px;font-family:Verdana,Arial,Helvetica,sans-serif;}
      .information_td{font-size:13px!important;padding:0px!important;font-family:Verdana,Arial,Helvetica,sans-serif;}
      .text-align-right-td{font-size:13px!important;text-align:right;font-family:Verdana,Arial,Helvetica,sans-serif;overflow-wrap:anywhere;}
      .title_user{width:71px;}
      .colum_user{width:41%;}
      .header-mt{padding:48px!important;}
      .payment-td{width:40%;}
      .stripe-td{width:60%!important;text-align:center!important;padding:0px 20px;}
      .sub-heading{font-size:15px!important;}
      .footer{padding:10px 20px;background-color:#DD2D3E;color:white;}
      .new-p{margin:1px 0px;font-size:13px;font-family:Verdana,Arial,Helvetica,sans-serif;}
      .payment-ul li{font-size:12px;}
      .pdf-btn{color:#13294B!important;font-weight:600;border:0.5px solid #DD2D3E;padding:9px 17px;text-decoration:none;margin-top:20px;display:inline-block;font-size:13px;border-radius:3px;}
      .pdf-btn a{color:#13294B!important;}
      .mail-desc ul,.mail-desc ol{padding-left:15px!important;}
      .pay-now{background-color:#DD2D3E;color:white!important;text-decoration:none;padding:4px 13px;margin:0px 0px 40px;display:inline-block;border-radius:5px;font-size:12.5px;}
      @media only screen and (max-width:600px){
        .logo-td,.payment-td,.payment-tr{width:100%;display:block;}
        .stripe-td{text-align:left!important;padding:0px;padding-top:10px;width:100%!important;display:block;}
        .colum_user{width:100%;}
        .display-none{display:none!important;}
        .padding-bottom-sm{padding-top:10px!important;}
        .display-block{display:block!important;}
        .sub-heading{font-size:14px!important;}
      }
    </style>
  </head>
  <body>
    ${greeting || ""}
    <div class="pdf-container">
      <a class="pdf-btn" href="${escapeAttribute(downloadUrl)}"><span style="margin:0px;padding:0px;padding-bottom:5px;display:inline-block;">${downloadLabel}</span> <img style="width:20px;padding-left:10px;" src="https://cdn-icons-png.flaticon.com/128/9496/9496432.png" alt=""></a>
    </div>
    <div class="invoice-box">
      <table>
        <tr class="top">
          <td colspan="2" style="border-top:3px solid #DD2D3E;padding-top:8px;">
            <table>
              <tr class="logo-td">
                <td class="logo-td">
                  <img src="${LOGO_URL}" width="180" title="logo" alt="Company logo" style="width:100%;max-width:210px;" />
                  <p class="new-p"><strong>E Electrics | E Electrics Limited</strong></p>
                  <p class="new-p"><strong>Head Office: </strong>Dent Close, Essex,RM15 5DS</p>
                  <p class="new-p">Registration No: 12418331</p>
                  <p class="new-p">NAPIT Member No: 65513</p>
                  <p class="new-p">info@eelectrics.co.uk | 0800 999 1452</p>
                </td>
                <td class="colum_user logo-td">
                  <table>
                    <tr><td class="display-none header-mt"></td><td class="display-none header-mt"></td></tr>
                    ${emailRow(`${title}:`, document.documentNo || "-")}
                    ${emailRow("Date:", formatDate(document.issueDate))}
                    ${emailRow("FAO:", clientName || "-")}
                    ${emailRow("Address:", document.addressLine || document.selectedAddress || "-")}
                    ${document.extraAddress ? emailRow("Address 2:", document.extraAddress) : ""}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td colspan="2">
            <table>
              <tr>
                <td style="font-size:20px;border-bottom:3px solid #DD2D3E;display:block;margin-bottom:25px;"><strong>${title}</strong></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr class="heading"><td>Description</td><td>Price</td></tr>
        <tr class="item">
          <td colspan="2" width="100%" style="border-bottom:1px solid #DD2D3E;background:PapayaWhip;word-wrap:break-word;page-break-inside:avoid;padding:0px 20px;font-size:13px;">
            <p style="margin-bottom:0px!important;margin-top:0px!important;padding:10px 0px;"><img width="20" style="padding-right:5px;vertical-align:middle;" src="${ARROW_URL}" alt=""> ${escapeHtml(document.jobTitle || "")}</p>
          </td>
        </tr>
        <tr class="item">
          <td colspan="2" width="100%" style="background:PapayaWhip;word-wrap:break-word;page-break-inside:avoid;padding:0px 20px;font-size:13px!important;" class="mail-desc">
            ${body || "-"}
          </td>
        </tr>
        ${includeRow}
        <tr class="heading"><td>Total to be Paid</td><td>${formatPounds(total)}</td></tr>
        ${notes ? `<tr><td colspan="2" style="width:100%!important;overflow-wrap:break-word!important;padding-top:15px;font-size:12.5px;"><p style="margin-bottom:0px;padding-top:10px;margin-top:0px;padding-bottom:5px;font-weight:bold;" class="sub-heading">Notes:</p><table><tr><td class="display-block-sm" style="height:1px;border-bottom:1.5px solid #DD2D3E;display:block!important;"></td></tr></table>${notes}</td></tr>` : ""}
        ${paymentSection}
      </table>
      ${footerHtml()}
    </div>
    <div class="pdf-container">
      <a class="pdf-btn" href="${escapeAttribute(downloadUrl)}"><span style="margin:0px;padding:0px;padding-bottom:5px;display:inline-block;">${downloadLabel}</span> <img style="width:20px;padding-left:10px;" src="https://cdn-icons-png.flaticon.com/128/9496/9496432.png" alt=""></a>
    </div>
  </body>
</html>`;
}

function footerHtml() {
  return `<table><tr><td class="footer" style="text-align: center;margin-top: 20px;display: block;"><p style="font-weight: bold;line-height: 18px;margin: 8px 0px; padding: 25px 0px;">© 2023 EElectrics. All rights reserved. For bookings and inquiries, contact us at <a href="mailto:info@eelectrics.co.uk" style="color: white;">info@eelectrics.co.uk</a> .</p></td></tr></table>`;
}

function renderIncludeRow(document: any, total: number) {
  const label = includeTotalLabel(parseInclude(document.includeOptions));
  if (!label) return "";
  return `<tr class="first_heading"><td>${escapeHtml(label)}</td><td>${formatPounds(total)}</td></tr>`;
}

function renderPaymentMethodSection(document: any, type: string) {
  if (type === "INVOICE") {
    const paymentUrl = escapeAttribute(publicPaymentUrl(document));
    return `<tr>
      <td colspan="2">
        <table>
          <tr>
            <td colspan="2" style="display:block;">
              <p style="display:inline-block;font-size:12.5px;font-weight:bold;padding-bottom:3px;margin-bottom:0px;" class="sub-heading">Payment Method</p>
              <table>
                <tr><td class="display-block-sm" style="height:1px;border-bottom:1.5px solid #DD2D3E;display:block!important;"></td></tr>
                <tr><td class="display-none" style="height:5px;padding-bottom:5px;"></td></tr>
              </table>
              <table style="width:100%;">
                <tr>
                  <td colspan="2" style="width:100%;text-align:center;padding:20px 10px;">
                    <div style="background-color:#fff8f8;border:1px solid #DD2D3E;border-radius:10px;padding:30px;max-width:600px;margin:0 auto;box-shadow:0 2px 8px rgba(221,45,62,0.1);">
                      <p style="font-size:18px;font-weight:bold;color:#DD2D3E;margin-bottom:20px;margin-top:0px;text-transform:uppercase;letter-spacing:1px;">Preferred Payment Method - Bank Transfer</p>
                      <ul style="list-style-type:none;font-size:15px;padding-left:0px;margin:0px;text-align:left;line-height:2;">
                        <li style="padding:10px 15px;border-bottom:1px solid #eee;background-color:#fff;"><strong style="color:#DD2D3E;font-size:14px;">Bank Name:</strong> <span style="float:right;font-weight:600;">Barclays Bank</span></li>
                        <li style="padding:10px 15px;border-bottom:1px solid #eee;background-color:#fff;"><strong style="color:#DD2D3E;font-size:14px;">Account Name:</strong> <span style="float:right;font-weight:600;">E electrics limited</span></li>
                        <li style="padding:10px 15px;border-bottom:1px solid #eee;background-color:#f9f9f9;"><strong style="color:#DD2D3E;font-size:14px;">Account Number:</strong> <span style="float:right;font-weight:bold;font-size:17px;color:#DD2D3E;">23929884</span></li>
                        <li style="padding:10px 15px;background-color:#f9f9f9;"><strong style="color:#DD2D3E;font-size:14px;">Sort Code:</strong> <span style="float:right;font-weight:bold;font-size:17px;color:#DD2D3E;">20-25-19</span></li>
                      </ul>
                      <p style="font-size:11px;color:#666;margin-top:15px;margin-bottom:0px;font-style:italic;">Please use invoice number as reference</p>
                    </div>
                  </td>
                </tr>
                <tr><td colspan="2" style="height:15px;"></td></tr>
                <tr>
                  <td colspan="2" style="text-align:center;padding:5px;">
                    <p style="font-size:9px;color:#999;margin:5px 0px;">Alternative payment option: <a href="${paymentUrl}" style="color:#999;font-size:9px;">Online card payment</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }

  return `<tr>
    <td colspan="2">
      <table>
        <tr>
          <td colspan="2" style="display:block;">
            <p style="display:inline-block;font-size:12.5px;font-weight:bold;padding-bottom:3px;margin-bottom:0px;" class="sub-heading">Payment Method</p>
            <table>
              <tr><td class="display-block-sm" style="height:1px;border-bottom:1.5px solid #DD2D3E;display:block!important;"></td></tr>
              <tr><td class="display-none" style="height:5px;padding-bottom:5px;"></td></tr>
            </table>
            <table>
              <tr class="payment-tr">
                <td class="payment-td" colspan="2">
                  <ul class="padding-bottom-sm payment-ul" style="list-style-type:none;font-size:13px;padding-left:0px;padding-top:0px;margin-top:0px;">
                    <li style="padding-left:0px;margin-left:0px;"><strong>Bank Name:</strong> &nbsp;Barclays Bank</li>
                    <li style="padding-left:0px;margin-left:0px;"><strong>Account Name:</strong> &nbsp;E electrics limited</li>
                    <li style="padding-left:0px;margin-left:0px;"><strong>Account No:</strong> &nbsp;23929884</li>
                    <li style="padding-left:0px;margin-left:0px;"><strong>SortCode:</strong> &nbsp;202519</li>
                  </ul>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
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

function amount(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatPounds(value: number) {
  return `&pound;&nbsp;${value.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function documentDownloadUrl(document: any) {
  return `${publicApiBaseUrl()}/pdf/documents/${document.id}/download`;
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

function emailRow(label: string, value: unknown) {
  return `<tr><td class="information_td title_user">${escapeHtml(label)}</td><td class="information_td text-align-right-td">${escapeHtml(display(value))}</td></tr>`;
}

function titleFor(type: string) {
  if (type === "BOOKING") return "Booking";
  if (type === "QUOTATION") return "Quotation";
  return "Invoice";
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} - ${part("month")} - ${part("year")}`;
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

function oldCrmSubject(document: any) {
  const id = document.documentNo || document.id || "-";
  const address = document.addressLine || document.selectedAddress || "-";
  if (document.type === "BOOKING") return `Booking from Eelectrics LTD | ${id} | ${address}`;
  if (document.type === "QUOTATION") return `Quotation from Eelectrics LTD | ${id} | ${address}`;
  return `Invoice from Eelectrics LTD | ${id} | ${address}`;
}

function publicDocumentUrl(document: any) {
  const base = (process.env.PUBLIC_APP_URL || process.env.WEB_ORIGIN || "http://localhost:5174").split(",")[0].trim().replace(/\/$/, "");
  return `${base}/booking-confirmation/${document.confirmationToken || document.id}`;
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
