import { Controller, Get, Query } from "@nestjs/common";
import { AddressesService } from "./addresses.service";
import { Public } from "../auth/public.decorator";

@Controller("addresses")
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Public()
  @Get("search")
  search(@Query("q") q = "") {
    return this.addresses.search(q);
  }
}
