import { Controller, Get, Param, Post } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { DocumentsService } from "./documents.service";

@Public()
@Controller("public/bookings")
export class PublicBookingsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.documents.publicBooking(id);
  }

  @Post(":id/confirm")
  confirm(@Param("id") id: string) {
    return this.documents.confirmBooking(id);
  }
}
