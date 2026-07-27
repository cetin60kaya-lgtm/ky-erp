import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { RequireModule } from "../auth/roles.decorator";
import { AiService } from "./ai.service";

@Controller("ai")
@RequireModule(ModuleKey.ASISTAN)
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Post("chat") chat(@Body() body: unknown, @CurrentUser() user: any) { return this.ai.chat(body, user); }
  @Post("actions/confirm") confirm(@Body() body: unknown, @CurrentUser() user: any) { return this.ai.confirm(body, user); }
  @Post("actions/cancel") cancel(@Body() body: unknown, @CurrentUser() user: any) { return this.ai.cancel(body, user); }
  @Get("conversations") conversations(@CurrentUser() user: any) { return this.ai.conversations(user); }
  @Get("conversations/:id") conversation(@Param("id") id: string, @CurrentUser() user: any) { return this.ai.conversation(id, user); }
  @Delete("conversations/:id") deleteConversation(@Param("id") id: string, @CurrentUser() user: any) { return this.ai.deleteConversation(id, user); }
  @Get("status") status(@CurrentUser() user: any) { return this.ai.status(user); }
}

