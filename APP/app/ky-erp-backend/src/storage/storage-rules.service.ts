import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import { PrismaService } from "../prisma/prisma.service";
import { FileDocumentType, FileStorageModule } from "./storage.types";
import { DEFAULT_STORAGE_RULES } from "./default-storage-rules";

@Injectable()
export class StorageRulesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  async resolveMainCompanyId(input?: { mainCompanyId?: string; mainCompanySlug?: string }) {
    const id = String(input?.mainCompanyId || "").trim();
    const slug = String(input?.mainCompanySlug || "").trim();
    if (!id && !slug) throw new BadRequestException("mainCompanyId veya mainCompanySlug zorunludur.");
    const company = await this.db.mainCompany.findFirst({
      where: {
        OR: [
          ...(id ? [{ id }, { slug: id }] : []),
          ...(slug ? [{ id: slug }, { slug }] : []),
        ],
      },
      select: { id: true },
    });
    if (!company) throw new NotFoundException("Ana firma bulunamadı.");
    return company.id;
  }

  async getRules(mainCompanyId: string) {
    return this.db.fileStorageRule.findMany({
      where: { mainCompanyId },
      orderBy: [{ module: "asc" }, { documentType: "asc" }],
    });
  }

  async getRule(mainCompanyId: string, module: FileStorageModule, documentType: FileDocumentType) {
    const rule = await this.db.fileStorageRule.findUnique({
      where: { mainCompanyId_module_documentType: { mainCompanyId, module, documentType } },
    });
    if (!rule || rule.isActive === false) {
      throw new NotFoundException("Dosya saklama kuralı bulunamadı veya pasif.");
    }
    return rule;
  }

  async getRuleById(id: string) {
    const rule = await this.db.fileStorageRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Dosya saklama kuralı bulunamadı.");
    return rule;
  }

  async createRule(input: any) {
    const mainCompanyId = await this.resolveMainCompanyId(input);
    const data = this.normalizeRuleData({ ...input, mainCompanyId });
    return this.db.fileStorageRule.upsert({
      where: {
        mainCompanyId_module_documentType: {
          mainCompanyId,
          module: data.module,
          documentType: data.documentType,
        },
      },
      create: data,
      update: data,
    });
  }

  async updateRule(id: string, input: any) {
    await this.getRuleById(id);
    const { mainCompanyId: _mainCompanyId, mainCompanySlug: _mainCompanySlug, ...ruleInput } = input || {};
    return this.db.fileStorageRule.update({
      where: { id },
      data: this.normalizeRuleData(ruleInput, false),
    });
  }

  async toggleWatch(id: string, isActive: boolean) {
    await this.getRuleById(id);
    return this.db.fileStorageRule.update({
      where: { id },
      data: { watchEnabled: Boolean(isActive) },
    });
  }

  async testWatchPath(id: string) {
    const rule = await this.getRuleById(id);
    const watchSourcePath = String(rule.watchSourcePath || "").trim();
    if (!watchSourcePath) {
      return { ok: false, exists: false, accessible: false, error: "İzleme klasörü boş." };
    }
    try {
      const stat = fs.statSync(watchSourcePath);
      return {
        ok: stat.isDirectory(),
        exists: true,
        accessible: stat.isDirectory(),
        error: stat.isDirectory() ? "" : "Yol klasör değil.",
      };
    } catch (error) {
      return {
        ok: false,
        exists: false,
        accessible: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async seedDefaultRules(mainCompanyId: string) {
    const created: any[] = [];
    const skipped: any[] = [];
    for (const rule of DEFAULT_STORAGE_RULES) {
      const existing = await this.db.fileStorageRule.findUnique({
        where: {
          mainCompanyId_module_documentType: {
            mainCompanyId,
            module: rule.module,
            documentType: rule.documentType,
          },
        },
      });
      const result = await this.db.fileStorageRule.upsert({
        where: {
          mainCompanyId_module_documentType: {
            mainCompanyId,
            module: rule.module,
            documentType: rule.documentType,
          },
        },
        create: this.normalizeRuleData({ ...rule, mainCompanyId }),
        update: this.normalizeRuleData({ ...rule, mainCompanyId }),
      });
      if (existing) skipped.push(result);
      else created.push(result);
    }
    return { createdCount: created.length, skippedCount: skipped.length, created, skipped };
  }

  private normalizeRuleData(input: any, includeRequired = true) {
    const data: any = {};
    [
      "mainCompanyId",
      "module",
      "documentType",
      "displayName",
      "targetPathTemplate",
      "allowedExtensions",
      "watchSourcePath",
    ].forEach((key) => {
      if (input[key] !== undefined) data[key] = input[key] === null ? null : String(input[key]);
    });
    [
      "maxFileSizeMb",
      "imageMaxWidth",
      "imageMaxHeight",
      "thumbWidth",
      "thumbHeight",
    ].forEach((key) => {
      if (input[key] !== undefined && input[key] !== "") data[key] = input[key] === null ? null : Number(input[key]);
    });
    ["imageResizeEnabled", "thumbEnabled", "watchEnabled", "isActive"].forEach((key) => {
      if (input[key] !== undefined) data[key] = Boolean(input[key]);
    });
    if (includeRequired) {
      if (!data.displayName || !data.targetPathTemplate || !data.allowedExtensions) {
        throw new BadRequestException("displayName, targetPathTemplate ve allowedExtensions zorunludur.");
      }
      if (data.isActive === undefined) data.isActive = true;
      if (data.imageResizeEnabled === undefined) data.imageResizeEnabled = false;
      if (data.thumbEnabled === undefined) data.thumbEnabled = false;
      if (data.watchEnabled === undefined) data.watchEnabled = false;
    }
    return data;
  }
}
