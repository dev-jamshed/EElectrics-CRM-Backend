import { Module } from "@nestjs/common";
import { CountersService } from "../../common/counters.service";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, CountersService],
  exports: [DocumentsService]
})
export class DocumentsModule {}

