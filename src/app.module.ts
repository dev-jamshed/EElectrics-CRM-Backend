import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AddressesModule } from "./modules/addresses/addresses.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { PdfModule } from "./modules/pdf/pdf.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./modules/auth/auth.module";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./modules/auth/auth.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AuthModule,
    ClientsModule,
    DocumentsModule,
    AddressesModule,
    DashboardModule,
    PdfModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard
    }
  ]
})
export class AppModule {}
