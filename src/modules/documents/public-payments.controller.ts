import { Controller, Get, Header, Param, Redirect } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { DocumentsService } from "./documents.service";

@Public()
@Controller("public/payments")
export class PublicPaymentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(":id")
  @Redirect()
  async pay(@Param("id") id: string) {
    const url = await this.documents.ensurePaymentUrl(id);
    return { url };
  }

  @Get(":id/success")
  @Header("Content-Type", "text/html; charset=utf-8")
  async success(@Param("id") id: string) {
    await this.documents.markPaidFromPayment(id);
    return paymentResultHtml("Payment Successful", "Thanks for your payment. Your invoice has been marked as paid.");
  }

  @Get(":id/cancel")
  @Header("Content-Type", "text/html; charset=utf-8")
  cancel() {
    return paymentResultHtml("Payment Cancelled", "Your payment was cancelled. You can use the payment link again anytime.");
  }
}

function paymentResultHtml(title: string, message: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f6;font-family:Arial,Helvetica,sans-serif;color:#13294B;}
      .card{width:min(92vw,520px);background:#fff;border-radius:12px;padding:42px 34px;text-align:center;box-shadow:0 16px 40px rgba(19,41,75,.08);}
      img{width:260px;max-width:80%;margin-bottom:18px;}
      h1{margin:0 0 14px;color:#F37636;font-size:40px;line-height:1.1;}
      p{margin:0;color:#9aa3ad;font-size:17px;letter-spacing:.03em;}
      @media(max-width:520px){.card{padding:34px 22px;}h1{font-size:32px;}p{font-size:15px;}}
    </style>
  </head>
  <body>
    <div class="card">
      <img src="https://res.cloudinary.com/djneoqoqk/image/upload/v1734727264/email_logo_aqoox6.png" alt="E Electrics" />
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`;
}
