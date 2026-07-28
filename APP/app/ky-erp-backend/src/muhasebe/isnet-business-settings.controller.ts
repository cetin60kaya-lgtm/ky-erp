import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { IsnetBusinessSettingsService } from "./isnet-business-settings.service";

@Controller(["isnet/business-settings", "api/isnet/business-settings"])
export class IsnetBusinessSettingsController {
  constructor(private readonly service: IsnetBusinessSettingsService) {}

  @Get()
  get(@Query() query: Record<string, any>) {
    return this.service.get(query);
  }

  @Put()
  save(@Body() body: Record<string, any>) {
    return this.service.save(body);
  }

  @Post("departments")
  createDepartment(@Body() body: Record<string, any>) {
    return this.service.createDepartment(body);
  }

  @Patch("departments/:id")
  updateDepartment(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateDepartment(id, body);
  }

  @Post("contacts")
  createContact(@Body() body: Record<string, any>) {
    return this.service.createContact(body);
  }

  @Patch("contacts/:id")
  updateContact(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateContact(id, body);
  }

  @Post("model-mappings")
  addModelMapping(@Body() body: Record<string, any>) {
    return this.service.addModelMapping(body);
  }

  @Delete("model-mappings/:id")
  removeModelMapping(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return this.service.removeModelMapping(id, query);
  }

  @Get("resolve")
  resolve(@Query() query: Record<string, any>) {
    return this.service.resolveContext(query);
  }
}
