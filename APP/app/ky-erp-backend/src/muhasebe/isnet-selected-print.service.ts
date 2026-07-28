import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { PDFDocument } from "pdf-lib";
import { PrismaService } from "../prisma/prisma.service";

type Query = Record<string, any>;
type QueueRow = {
  key: string;
  addedAt: string;
  printedAt: string | null;
};

const clean = (value: unknown) => String(value ?? "").trim();
const arrayValue = (value: unknown) => (Array.isArray(value) ? value : []);

@Injectable()
export class IsnetSelectedPrintService {
  private readonly settingKey = "USER_PRINT_QUEUE";

  constructor(private readonly prisma: PrismaService) {}

  private slug(body: Query = {}) {
    const value = clean(body.mainCompanySlug || body.companyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private async readRows(slug: string): Promise<QueueRow[]> {
    const setting = await this.prisma.setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: this.settingKey,
        },
      },
    });
    const value = setting?.value as any;
    return Array.isArray(value?.rows) ? value.rows : [];
  }

  private async writeRows(slug: string, rows: QueueRow[]) {
    const value = { rows, updatedAt: new Date().toISOString() };
    await this.prisma.setting.upsert({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: this.settingKey,
        },
      },
      create: {
        scope: "ISNET",
        mainCompanySlug: slug,
        key: this.settingKey,
        value,
      },
      update: { value, deletedAt: null },
    });
  }

  async list(query: Query = {}) {
    const slug = this.slug(query);
    const queue = await this.readRows(slug);
    const keys = queue.map((row) => row.key).filter(Boolean);
    const states = keys.length
      ? await this.prisma.isnetDocumentState.findMany({
          where: { mainCompanySlug: slug, automationKey: { in: keys } },
        })
      : [];
    const stateByKey = new Map(states.map((row) => [row.automationKey, row]));
    const rows = queue
      .map((queueRow) => {
        const state = stateByKey.get(queueRow.key);
        if (!state) return null;
        const pdfPath = clean(state.pdfPath);
        return {
          key: queueRow.key,
          addedAt: queueRow.addedAt,
          printedAt: queueRow.printedAt,
          documentNo: clean(state.documentNo),
          dateText: clean(state.dateText),
          partnerName: clean(state.partnerName),
          modelName: clean(state.modelName),
          direction: clean(state.direction),
          kind: clean(state.kind),
          pdfReady: Boolean(pdfPath && fs.existsSync(pdfPath)),
        };
      })
      .filter(Boolean)
      .sort((left: any, right: any) => {
        if (Boolean(left.printedAt) !== Boolean(right.printedAt)) {
          return left.printedAt ? 1 : -1;
        }
        return String(right.addedAt).localeCompare(String(left.addedAt));
      });
    return {
      rows,
      waiting: rows.filter((row: any) => !row.printedAt && row.pdfReady).length,
      printed: rows.filter((row: any) => row.printedAt).length,
    };
  }

  async add(body: Query = {}) {
    const slug = this.slug(body);
    const keys = [...new Set(arrayValue(body.keys).map(clean).filter(Boolean))];
    if (!keys.length) throw new BadRequestException("Yazdırmaya eklenecek belgeleri seçin.");
    if (keys.length > 500) throw new BadRequestException("Tek işlemde en fazla 500 belge eklenebilir.");

    const states = await this.prisma.isnetDocumentState.findMany({
      where: { mainCompanySlug: slug, automationKey: { in: keys }, completed: true },
      select: { automationKey: true, pdfPath: true },
    });
    const valid = states.filter((row) => row.pdfPath && fs.existsSync(clean(row.pdfPath)));
    const validKeys = new Set(valid.map((row) => row.automationKey));
    const rejected = keys.filter((key) => !validKeys.has(key));
    if (!validKeys.size) {
      throw new BadRequestException("Seçilen belgelerde yerel PDF bulunamadı.");
    }

    const current = await this.readRows(slug);
    const currentByKey = new Map(current.map((row) => [row.key, row]));
    const now = new Date().toISOString();
    for (const key of validKeys) {
      const existing = currentByKey.get(key);
      currentByKey.set(key, {
        key,
        addedAt: existing?.addedAt || now,
        printedAt: null,
      });
    }
    const rows = [...currentByKey.values()];
    await this.writeRows(slug, rows);
    return {
      ok: true,
      added: validKeys.size,
      rejected,
      waiting: rows.filter((row) => !row.printedAt).length,
    };
  }

  async remove(body: Query = {}) {
    const slug = this.slug(body);
    const keys = new Set(arrayValue(body.keys).map(clean).filter(Boolean));
    if (!keys.size) throw new BadRequestException("Kaldırılacak belgeleri seçin.");
    const current = await this.readRows(slug);
    const rows = current.filter((row) => !keys.has(row.key));
    await this.writeRows(slug, rows);
    return { ok: true, removed: current.length - rows.length };
  }

  async bundle(body: Query = {}) {
    const slug = this.slug(body);
    const requestedKeys = new Set(arrayValue(body.keys).map(clean).filter(Boolean));
    const queue = await this.readRows(slug);
    const selected = queue.filter((row) =>
      requestedKeys.size ? requestedKeys.has(row.key) : !row.printedAt,
    );
    if (!selected.length) throw new BadRequestException("Yazdırılacak bekleyen belge bulunamadı.");

    const keys = selected.map((row) => row.key);
    const states = await this.prisma.isnetDocumentState.findMany({
      where: { mainCompanySlug: slug, automationKey: { in: keys } },
    });
    const stateByKey = new Map(states.map((row) => [row.automationKey, row]));
    const merged = await PDFDocument.create();
    const includedKeys: string[] = [];
    const invalid: string[] = [];

    for (const row of selected) {
      const state = stateByKey.get(row.key);
      const pdfPath = clean(state?.pdfPath);
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        invalid.push(clean(state?.documentNo || row.key));
        continue;
      }
      try {
        const source = await PDFDocument.load(fs.readFileSync(pdfPath), {
          ignoreEncryption: true,
        });
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
        includedKeys.push(row.key);
      } catch {
        invalid.push(clean(state?.documentNo || row.key));
      }
    }

    if (invalid.length) {
      throw new BadRequestException(
        `${invalid.length} PDF okunamadı (${invalid.slice(0, 3).join(", ")}). Hiçbir belge atlanmadı; dosyaları düzeltip tekrar deneyin.`,
      );
    }
    if (!includedKeys.length) throw new BadRequestException("Seçilen PDF dosyaları birleştirilemedi.");

    merged.setTitle(`KY ERP İşNet Seçili Çıktı - ${includedKeys.length} belge`);
    merged.setCreator("KY ERP İşNet");
    return {
      buffer: Buffer.from(await merged.save()),
      fileName: `ISNET-SECILI-CIKTI-${new Date().toISOString().slice(0, 10)}.pdf`,
      keys: includedKeys,
    };
  }

  async markPrinted(body: Query = {}) {
    const slug = this.slug(body);
    const keys = new Set(arrayValue(body.keys).map(clean).filter(Boolean));
    if (!keys.size) throw new BadRequestException("Çıktısı alınan belgeleri seçin.");
    const current = await this.readRows(slug);
    const now = new Date().toISOString();
    let updated = 0;
    const rows = current.map((row) => {
      if (!keys.has(row.key)) return row;
      updated += 1;
      return { ...row, printedAt: now };
    });
    if (!updated) throw new NotFoundException("Seçilen belgeler yazdırma kuyruğunda bulunamadı.");
    await this.writeRows(slug, rows);
    return { ok: true, updated, printedAt: now };
  }
}
