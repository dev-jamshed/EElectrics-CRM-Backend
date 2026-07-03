import { Controller, Get, Param } from "@nestjs/common";
import { PdfService } from "./pdf.service";

@Controller("pdf")
export class PdfController {
  constructor(private readonly pdf: PdfService) {}

  @Get("documents/:id")
  preview(@Param("id") id: string) {
    return this.pdf.preview(id);
  }
}

