import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AddressesController } from "./addresses.controller";
import { AddressesService } from "./addresses.service";

@Module({
  imports: [ConfigModule],
  controllers: [AddressesController],
  providers: [AddressesService]
})
export class AddressesModule {}

