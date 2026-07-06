import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { CloneDocumentDto, CreateDocumentDto, DocumentTypeValue, UpdateDocumentDto } from "./dto";
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(
    @Query("type") type?: DocumentTypeValue,
    @Query("status") status?: string,
    @Query("q") q?: string
  ) {
    return this.documents.list({ type, status, q });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.documents.detail(id);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documents.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.documents.remove(id);
  }

  @Post(":id/clone")
  cloneAsRevision(@Param("id") id: string, @Body() dto: CloneDocumentDto) {
    return this.documents.cloneAsRevision(id, dto);
  }

  @Post(":id/mark-paid")
  markPaid(@Param("id") id: string) {
    return this.documents.markPaid(id);
  }

  @Post(":id/send")
  markSent(@Param("id") id: string) {
    return this.documents.markSent(id);
  }

}
