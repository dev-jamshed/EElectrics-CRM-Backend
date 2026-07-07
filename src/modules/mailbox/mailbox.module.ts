import { Module } from "@nestjs/common";
import { MailboxController } from "./mailbox.controller";
import { MailboxService } from "./mailbox.service";

@Module({
  controllers: [MailboxController],
  providers: [MailboxService]
})
export class MailboxModule {}
