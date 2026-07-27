import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { AccountingApiService } from "../accounting-api.service";
import { MailTemplateService } from "./mail-template.service";

@Controller(["muhasebe/mail", "api/muhasebe/mail"])
export class MailController {
  constructor(
    private readonly service: AccountingApiService,
    private readonly templateService: MailTemplateService,
  ) {}

  @Post("resolve-recipients") resolve(@Body() body: Record<string, any>) {
    return this.service.resolveRecipients(body);
  }
  @Get("tasks") list(@Query() query: Record<string, any>) {
    return this.service.listMailTasks(query);
  }
  @Post("tasks") create(@Body() body: Record<string, any>) {
    return this.service.createMailTask(body);
  }
  @Patch("tasks/:id") update(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateMailTask(id, body);
  }
  @Post("tasks/:id/send") send(@Param("id") id: string) {
    return this.service.sendMailTask(id);
  }
  @Post("tasks/:id/mark-sent") markSent(@Param("id") id: string) {
    return this.service.markMailSent(id);
  }

  @Get("templates")
  listTemplates(@Query() query: Record<string, any>) {
    return this.templateService.listTemplates(query);
  }

  @Post("templates/seed")
  seedTemplates(@Body() body: Record<string, any>) {
    return this.templateService.seedTemplates(body);
  }

  @Post("templates")
  createTemplate(@Body() body: Record<string, any>) {
    return this.templateService.createTemplate(body);
  }

  @Patch("templates/:id")
  updateTemplate(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.templateService.updateTemplate(id, body);
  }

  @Delete("templates/:id")
  deleteTemplate(@Param("id") id: string, @Query() query: Record<string, any>) {
    return this.templateService.deleteTemplate(id, query);
  }

  @Post("templates/render")
  renderTemplate(@Body() body: Record<string, any>) {
    return this.templateService.renderTemplate(body);
  }

  @Get("templates/drafts/list")
  listDrafts(@Query() query: Record<string, any>) {
    return this.templateService.listDrafts(query);
  }

  @Post("templates/drafts")
  createDraft(@Body() body: Record<string, any>) {
    return this.templateService.createDraft(body);
  }

  @Post("templates/drafts/:id/mark-sent")
  markDraftSent(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.templateService.markDraftSent(id, body);
  }
}
