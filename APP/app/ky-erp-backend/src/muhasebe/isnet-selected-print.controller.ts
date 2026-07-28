import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import type { Response } from "express";
import { RequireModule } from "../auth/roles.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetSelectedPrintService } from "./isnet-selected-print.service";

@Controller("isnet/selected-print-queue")
@RequireModule(ModuleKey.ISNET)
export class IsnetSelectedPrintController {
  constructor(private readonly service: IsnetSelectedPrintService) {}

  @Get()
  async list(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.list(query));
  }

  @Post("add")
  async add(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.add(body));
  }

  @Post("remove")
  async remove(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.remove(body));
  }

  @Post("bundle")
  async bundle(@Body() body: Record<string, any>, @Res() response: Response) {
    const file = await this.service.bundle(body);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader("X-KYERP-Print-Keys", file.keys.join(","));
    response.send(file.buffer);
  }

  @Post("printed")
  async markPrinted(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.markPrinted(body));
  }
}
