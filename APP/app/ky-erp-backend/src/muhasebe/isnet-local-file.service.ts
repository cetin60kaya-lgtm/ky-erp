import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaService } from "../prisma/prisma.service";

type Query = Record<string, any>;
const clean = (value: unknown) => String(value ?? "").trim();

@Injectable()
export class IsnetLocalFileService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(query: Query = {}) {
    const value = clean(query.mainCompanySlug || query.companyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  async getFile(keyValue: string, formatValue: string, query: Query = {}) {
    const slug = this.slug(query);
    const key = clean(keyValue);
    const format = clean(formatValue).toLowerCase();
    if (!key) throw new BadRequestException("Belge anahtarı zorunludur.");
    if (!["pdf", "xml"].includes(format)) {
      throw new BadRequestException("Dosya türü PDF veya XML olmalıdır.");
    }

    const state = await this.prisma.isnetDocumentState.findFirst({
      where: {
        mainCompanySlug: slug,
        OR: [{ automationKey: key }, { id: key }],
      },
    });
    if (!state) throw new NotFoundException("İşNet yerel belge kaydı bulunamadı.");

    const filePath = clean(format === "pdf" ? state.pdfPath : state.xmlPath);
    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException(
        `${format.toUpperCase()} dosyası yerelde bulunamadı. İşNet'i Senkronize Et işlemini çalıştırın.`,
      );
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new NotFoundException("Yerel belge dosyası boş veya erişilemez.");
    }
    const buffer = fs.readFileSync(filePath);
    if (format === "pdf" && !buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
      throw new BadRequestException("Yerel PDF dosyasının içeriği geçersiz.");
    }
    if (format === "xml") {
      const text = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("utf8");
      if (!/<\?xml|<(Invoice|DespatchAdvice|ApplicationResponse)\b/i.test(text)) {
        throw new BadRequestException("Yerel XML dosyasının içeriği geçersiz.");
      }
    }

    const documentNo = clean(state.documentNo || state.sourceId || "ISNET-BELGE");
    return {
      buffer,
      contentType: format === "pdf" ? "application/pdf" : "application/xml; charset=utf-8",
      fileName: `${documentNo}.${format}`,
      sourcePath: path.basename(filePath),
    };
  }
}
