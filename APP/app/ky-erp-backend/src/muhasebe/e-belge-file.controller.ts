import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { RequireModule } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const objectValue = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

@Controller(["e-belge/files", "api/e-belge/files"])
@RequireModule(ModuleKey.ISNET)
export class EBelgeFileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id/:format")
  async file(
    @Param("id") id: string,
    @Param("format") format: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = clean(mainCompanySlug || mainCompanyId);
    if (!slug) throw new NotFoundException("Ana firma seçimi zorunludur.");
    const row = await this.prisma.documentIntake.findFirst({
      where: { id, mainCompanySlug: slug, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        originalFileName: true,
        filePath: true,
        mimeType: true,
        parseRawJson: true,
      },
    });
    if (!row) throw new NotFoundException("e-Belge bulunamadı.");

    const raw = objectValue(row.parseRawJson);
    const attachments = Array.isArray(raw._eBelgeAttachments)
      ? raw._eBelgeAttachments
      : [];
    const candidates = [
      ...attachments.map((item: any) => ({
        fileName: clean(item?.fileName),
        filePath: clean(item?.filePath),
        mimeType: clean(item?.mimeType),
      })),
      {
        fileName: clean(row.originalFileName),
        filePath: clean(row.filePath),
        mimeType: clean(row.mimeType),
      },
    ].filter(
      (item, index, array) =>
        item.filePath &&
        array.findIndex((candidate) => candidate.filePath === item.filePath) === index,
    );

    const requested = clean(format).toLocaleLowerCase("tr-TR");
    const selected =
      requested === "pdf"
        ? candidates.find((item) => /\.pdf$/i.test(item.fileName || item.filePath))
        : requested === "xml"
          ? candidates.find((item) => /\.xml$/i.test(item.fileName || item.filePath))
          : candidates[0];

    if (!selected?.filePath || !fs.existsSync(selected.filePath)) {
      throw new NotFoundException(`${requested.toUpperCase()} dosyası bulunamadı.`);
    }

    const ext = path.extname(selected.fileName || selected.filePath).toLocaleLowerCase("tr-TR");
    const type =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".xml"
          ? "application/xml; charset=utf-8"
          : selected.mimeType || "application/octet-stream";
    const safeName = clean(selected.fileName || path.basename(selected.filePath)) || `belge${ext}`;

    return new StreamableFile(fs.createReadStream(selected.filePath), {
      type,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    });
  }
}
