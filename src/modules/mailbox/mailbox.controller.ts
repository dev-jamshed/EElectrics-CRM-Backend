import { Body, Controller, Get, MessageEvent, Param, Post, Sse } from "@nestjs/common";
import { map, Observable } from "rxjs";
import { MailboxService } from "./mailbox.service";

@Controller("mailbox")
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get("summary")
  summary() {
    return this.mailbox.summary();
  }

  @Sse("stream")
  stream(): Observable<MessageEvent> {
    return this.mailbox.stream().pipe(map((data) => ({ data })));
  }

  @Get("threads")
  threads() {
    return this.mailbox.list();
  }

  @Get("threads/:id")
  thread(@Param("id") id: string) {
    return this.mailbox.detail(id);
  }

  @Post("threads/:id/read")
  markRead(@Param("id") id: string) {
    return this.mailbox.markRead(id);
  }

  @Post("threads/:id/reply")
  reply(@Param("id") id: string, @Body() body: { body: string }) {
    return this.mailbox.reply(id, body.body);
  }

  @Post("sync")
  sync() {
    return this.mailbox.syncInbox();
  }
}
