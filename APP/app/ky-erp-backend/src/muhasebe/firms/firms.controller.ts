import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AccountingApiService } from "../accounting-api.service";

@Controller(["muhasebe", "api/muhasebe"])
export class FirmsController {
  constructor(private readonly service: AccountingApiService) {}

  @Get("firms") listFirms(@Query() query: Record<string, any>) { return this.service.listFirms(query); }
  @Get("firms/:id") getFirm(@Param("id") id: string) { return this.service.getFirm(id); }
  @Post("firms") createFirm(@Body() body: Record<string, any>) { return this.service.createFirm(body); }
  @Patch("firms/:id") updateFirm(@Param("id") id: string, @Body() body: Record<string, any>) { return this.service.updateFirm(id, body); }

  @Get("firms/:firmId/contacts") listContacts(@Param("firmId") firmId: string) { return this.service.listContacts(firmId); }
  @Post("firms/:firmId/contacts") createContact(@Param("firmId") firmId: string, @Body() body: Record<string, any>) { return this.service.createContact(firmId, body); }
  @Patch("firms/:firmId/contacts/:contactId") updateContact(@Param("contactId") contactId: string, @Body() body: Record<string, any>) { return this.service.updateContact(contactId, body); }
  @Delete("firms/:firmId/contacts/:contactId") deleteContact(@Param("contactId") contactId: string) { return this.service.deleteContact(contactId); }

  @Get("model-mail-assignments") listAssignments(@Query() query: Record<string, any>) { return this.service.listModelMailAssignments(query); }
  @Post("model-mail-assignments") createAssignment(@Body() body: Record<string, any>) { return this.service.createModelMailAssignment(body); }
  @Patch("model-mail-assignments/:id") updateAssignment(@Param("id") id: string, @Body() body: Record<string, any>) { return this.service.updateModelMailAssignment(id, body); }
  @Delete("model-mail-assignments/:id") deleteAssignment(@Param("id") id: string) { return this.service.deleteModelMailAssignment(id); }
}
