import { Module } from "@nestjs/common";
import { CountersService } from "../../common/counters.service";
import { DocumentMailService } from "./document-mail.service";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { PublicBookingsController } from "./public-bookings.controller";
import { PublicPaymentsController } from "./public-payments.controller";

@Module({
  controllers: [DocumentsController, PublicBookingsController, PublicPaymentsController],
  providers: [DocumentsService, CountersService, DocumentMailService],
  exports: [DocumentsService]
})
export class DocumentsModule {}
