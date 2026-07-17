import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { PdfService } from "./pdf.service";

@Controller("pdf")
export class PdfController {
  constructor(private readonly pdf: PdfService) {}

  @Get("documents/:id")
  preview(@Param("id") id: string) {
    return this.pdf.preview(id);
  }

  @Public()
  @Get("documents/:id/download")
  @Header("Content-Type", "text/html; charset=utf-8")
  download(@Param("id") id: string, @Query("action") action?: string) {
    return this.pdf.renderHtml(id, action === "download" ? "download" : "view");
  }
}
