import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import type { Response } from "express";
import { RequireModule } from "../auth/roles.decorator";
import { IsnetLocalFileService } from "./isnet-local-file.service";

@Controller("isnet/local-files")
@RequireModule(ModuleKey.ISNET)
export class IsnetLocalFileController {
  constructor(private readonly service: IsnetLocalFileService) {}

  @Get(":key/:format")
  async file(
    @Param("key") key: string,
    @Param("format") format: string,
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const file = await this.service.getFile(key, format, query);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.send(file.buffer);
  }
}
