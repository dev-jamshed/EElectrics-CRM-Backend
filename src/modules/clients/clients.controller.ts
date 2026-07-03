import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { UpsertClientDto } from "./dto";
import { ClientsService } from "./clients.service";

@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query("q") q?: string) {
    return this.clients.list(q);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.clients.detail(id);
  }

  @Post()
  create(@Body() dto: UpsertClientDto) {
    return this.clients.create(dto);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpsertClientDto) {
    return this.clients.update(id, dto);
  }
}

