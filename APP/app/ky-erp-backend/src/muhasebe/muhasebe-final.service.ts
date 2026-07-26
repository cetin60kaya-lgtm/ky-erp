import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ModelService } from "../modules/models/model.service";
import { MuhasebeDbService } from "./muhasebe-db.service";
import type { ParsedKyDocument } from "./pdf/kyerp-pdf-parser";

type Query = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value: any) {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: any) {
  return new Prisma.Decimal(Number(value || 0));
}

function normalizeName(value: unknown) {
  return text(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function isoDate(value: any) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function asDate(value: unknown) {
  const raw = text(value) || new Date().toISOString().slice(0, 10);
  const dateText = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/)
    ? raw.replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3-$2-$1")
    : raw.slice(0, 10);
  const parsed = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()))
    throw new BadRequestException("Tarih geçersiz.");
  return parsed;
}

function startOfMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function endOfMonth() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}

function normalizeType(value: unknown) {
  const type = text(value).toLocaleLowerCase("tr-TR");
  if (
    type.includes("bizim") ||
    type.includes("giden") ||
    type.includes("sales")
  )
    return "SATIS";
  if (
    type.includes("tedarik") ||
    type.includes("gelen") ||
    type.includes("alis") ||
    type.includes("alış")
  )
    return "ALIS";
  return type.toLocaleUpperCase("tr-TR") || "BELGE";
}

function vatTypeLabel(value: unknown) {
  const type = text(value).toLocaleLowerCase("tr-TR");
  if (
    ["out", "outgoing", "sales", "satis", "satış", "giden"].some((key) =>
      type.includes(key),
    )
  )
    return "Giden KDV";
  if (
    ["in", "incoming", "purchase", "alis", "alış", "gelen"].some((key) =>
      type.includes(key),
    )
  )
    return "Gelen KDV";
  return "KDV";
}

function isPaid(status: unknown) {
  const key = text(status).toLocaleLowerCase("tr-TR");
  return [
    "odendi",
    "ödendi",
    "tahsil_edildi",
    "tahsil edildi",
    "paid",
  ].includes(key);
}

function optionalDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizedIncludes(left: unknown, right: unknown) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function formatCurrencyTr(value: unknown) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(number(value));
}

function formatDateTr(value: unknown) {
  const date = optionalDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC" }).format(date);
}

function monthLabelTr(value: unknown) {
  const date = optionalDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCheckDashboard(checkRows: any[] = []) {
  const activeRows = checkRows
    .filter((row) => row?.source === "check")
    .filter((row) => !isPaid(row?.durum))
    .filter((row) => !/iptal|iade/i.test(text(row?.durum)));
  const amountOf = (rows: any[]) =>
    rows.reduce((sum, row) => sum + number(row?.tutar), 0);
  const sortByDue = (rows: any[]) =>
    [...rows].sort((left, right) =>
      text(left?.vadeTarihi).localeCompare(text(right?.vadeTarihi), "tr"),
    );
  const bugunRows = activeRows.filter((row) => row?.vadeGrubu === "bugun");
  const upcomingRows = sortByDue(
    activeRows.filter((row) =>
      ["bugun", "bu_hafta", "yaklasan"].includes(text(row?.vadeGrubu)),
    ),
  );
  const overdueRows = sortByDue(
    activeRows.filter((row) => row?.vadeGrubu === "vadesi_gecmis"),
  );
  const monthlyMap = new Map<string, any>();
  for (const row of activeRows) {
    const monthKey = text(row?.vadeTarihi).slice(0, 7);
    if (!monthKey) continue;
    const current = monthlyMap.get(monthKey) || {
      monthKey,
      ay: monthLabelTr(`${monthKey}-01`),
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += number(row?.tutar);
    monthlyMap.set(monthKey, current);
  }
  const aylikDagilim = [...monthlyMap.values()].sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey, "tr"),
  );
  return {
    acikCekSayisi: activeRows.length,
    toplamAcikCekTutari: amountOf(activeRows),
    bugunCekSayisi: bugunRows.length,
    bugunCekTutari: amountOf(bugunRows),
    yaklasanCekSayisi: upcomingRows.length,
    yaklasanCekTutari: amountOf(upcomingRows),
    vadesiGecmisCekSayisi: overdueRows.length,
    vadesiGecmisCekTutari: amountOf(overdueRows),
    aylikDagilim,
    yaklasanListe: upcomingRows.slice(0, 12),
    vadesiGecmisListe: overdueRows.slice(0, 12),
  };
}

@Injectable()
export class MuhasebeFinalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly muhasebeDb: MuhasebeDbService,
    private readonly modelService: ModelService,
  ) {}

  private slug(query: Query = {}) {
    const slug = text(query.mainCompanySlug || query.mainCompanyId);
    if (!slug) throw new BadRequestException("mainCompanySlug zorunludur.");
    return slug;
  }

  private async ensureMainCompany(slug: string) {
    await this.prisma.mainCompany.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
  }

  private async ensureCustomerCompany(slug: string, value: unknown) {
    const name = text(value);
    if (!name) {
      throw new BadRequestException("Model bağlantısı için müşteri firma zorunludur.");
    }
    const normalizedName = normalizeName(name);
    const existing = await (this.prisma as any).company.findFirst({
      where: {
        mainCompanySlug: slug,
        OR: [
          { name: { equals: name } },
          { normalizedName },
        ],
      },
    });
    if (existing) {
      if (existing.type !== "MUSTERI" || existing.isActive === false) {
        return (this.prisma as any).company.update({
          where: { id: existing.id },
          data: { type: "MUSTERI", isActive: true, deletedAt: null },
        });
      }
      if (existing.deletedAt) {
        return (this.prisma as any).company.update({
          where: { id: existing.id },
          data: { deletedAt: null, isActive: true },
        });
      }
      return existing;
    }
    return (this.prisma as any).company.create({
      data: {
        mainCompanySlug: slug,
        name,
        normalizedName,
        type: "MUSTERI",
        source: "FATURA_KESIM_MODEL_LINK",
      },
    });
  }

  private documentRaw(row: any) {
    return row?.raw && typeof row.raw === "object" ? row.raw : {};
  }

  private mapDocument(row: any, lines: any[] = []) {
    const raw = this.documentRaw(row);
    const files = Array.isArray(row.files) ? row.files : [];
    const modelId = text(raw.modelId || raw.modelKaydiId || row.targetRecordId);
    const modelName = text(
      raw.modelName || raw.modelAdi || raw.guessedModelName,
    );
    return {
      id: row.id,
      belgeNo: text(row.documentNo || raw.belgeNo || raw.faturaNo),
      firma: text(
        row.company?.name || raw.firma || raw.companyName || raw.saticiUnvan,
      ),
      belgeTuru: text(row.documentType || raw.belgeTipi || raw.documentType),
      tarih: isoDate(row.date || raw.tarih),
      tutar: number(row.grandTotal || raw.genelToplam || raw.tutar),
      durum: text(row.status || raw.durum || "bekleyen"),
      modelId,
      modelName,
      resmiGayri: text(
        raw.resmiGayri || row.company?.defaultRecordType || "RESMI",
      ),
      mailDurumu: text(raw.mailDurumu || raw.mailStatus || "BEKLIYOR"),
      ekstreDurumu: text(
        raw.ekstreDurumu || raw.statementStatus || "KONTROL_EDILMEDI",
      ),
      kesenFirma: text(raw.kesenFirma || raw.saticiUnvan || row.company?.name),
      aliciFirma: text(raw.aliciFirma || raw.aliciUnvan || raw.customerName),
      faturaBilgileri: raw.faturaBilgileri || raw.taslakAlanlar || {},
      irsaliyeBilgileri: raw.irsaliyeBilgileri || {},
      kalemler: lines.map((line) => ({
        id: line.id,
        sira: line.lineNo,
        aciklama: text(line.description || line.productName),
        miktar: number(line.quantity),
        birim: text(line.unit),
        birimFiyat: number(line.unitPrice),
        matrah: number(line.lineTotal),
        kdvOrani: number(line.vatRate),
        kdvTutari: number(line.vatAmount),
        toplam: number(line.lineTotal) + number(line.vatAmount),
        lot: text(line.lotNo),
      })),
      kdvOzeti: {
        matrah: number(row.subtotal),
        kdv: number(row.vatTotal),
        toplam: number(row.grandTotal),
      },
      cariEtkisi: {
        firmaId: row.companyId || "",
        borc:
          normalizeType(row.documentType) === "ALIS"
            ? number(row.grandTotal)
            : 0,
        alacak:
          normalizeType(row.documentType) === "SATIS"
            ? number(row.grandTotal)
            : 0,
      },
      hammaddeLotBilgileri: raw.hammaddeLotBilgileri || [],
      eksikBilgiler: raw.eksikBilgiler || [],
      pdfPath:
        files.find((file: any) => /pdf/i.test(file.mimeType || file.fileName))
          ?.filePath || "",
      xmlPath:
        files.find((file: any) => /xml/i.test(file.mimeType || file.fileName))
          ?.filePath || "",
      files,
    };
  }

  private async documentLines(slug: string, ids: string[]) {
    if (!ids.length) return new Map<string, any[]>();
    const lines = await this.prisma.invoiceItem.findMany({
      where: { mainCompanySlug: slug, documentId: { in: ids } },
      orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
    });
    const map = new Map<string, any[]>();
    for (const line of lines) {
      const list = map.get(line.documentId) || [];
      list.push(line);
      map.set(line.documentId, list);
    }
    return map;
  }

  async belgeHavuzu(query: Query = {}) {
    const slug = this.slug(query);
    await this.ensureMainCompany(slug);
    const rows = await this.prisma.document.findMany({
      where: { mainCompanySlug: slug, deletedAt: null },
      include: { company: true, files: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 250,
    });
    const lines = await this.documentLines(
      slug,
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.mapDocument(row, lines.get(row.id) || []));
  }

  async belgeDetay(mainCompanySlug: string, id: string) {
    const slug = this.slug({ mainCompanySlug });
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
      include: { company: true, files: true },
    });
    if (!row) throw new NotFoundException("Belge bulunamadı.");
    const lines = await this.documentLines(slug, [id]);
    return this.mapDocument(row, lines.get(id) || []);
  }

  private async ensureParsedFirm(slug: string, firmName: string) {
    const name = text(firmName) || "Firma eşleşmesi bekliyor";
    const normalizedName = normalizeName(name) || "firma-eslesmesi-bekliyor";
    return this.prisma.company.upsert({
      where: {
        mainCompanySlug_normalizedName: {
          mainCompanySlug: slug,
          normalizedName,
        },
      },
      create: {
        mainCompanySlug: slug,
        name,
        normalizedName,
        type: "MUSTERI",
        defaultRecordType: "RESMI",
        source: "FATURA_KESIM_YARDIMCISI",
        raw: { source: "fatura-kesim-pdf" },
      },
      update: {},
    });
  }

  async saveFaturaKesimParsedDocument(
    mainCompanySlug: string,
    parsed: ParsedKyDocument,
    file?: any,
  ) {
    const slug = this.slug({ mainCompanySlug });
    await this.ensureMainCompany(slug);
    const company = await this.ensureParsedFirm(slug, parsed.firmName);
    const documentNo = text(
      parsed.documentNo || parsed.dispatchNo || parsed.invoiceNo,
    );
    if (!documentNo) throw new BadRequestException("PDF belge no okunamadı.");
    const rawLines = parsed.rawText.split(/\n/).filter(Boolean);
    const status = parsed.lines.length
      ? parsed.lines.some((line) => line.status === "FIYAT_EKSIK")
        ? "Fatura Bekliyor"
        : "Kontrol"
      : "ESLESME_BEKLIYOR";
    const existing = await this.prisma.document.findFirst({
      where: { mainCompanySlug: slug, documentNo, deletedAt: null },
    });
    const document = await this.prisma.document.upsert({
      where: { id: existing?.id || "__new_fatura_kesim_document__" },
      create: {
        mainCompanySlug: slug,
        companyId: company.id,
        documentNo,
        documentType:
          parsed.documentType === "FATURA"
            ? "musteri_fatura"
            : "musteri_irsaliye",
        sourceType: "FATURA_KESIM_YARDIMCISI",
        date: parsed.date ? asDate(parsed.date) : null,
        subtotal: money(parsed.totals.goodsTotal),
        vatTotal: money(parsed.totals.vatTotal),
        grandTotal: money(parsed.totals.payableTotal),
        status,
        raw: {
          ...parsed,
          rawLines,
          mailDurumu: "BEKLIYOR",
          ekstreDurumu: "KONTROL_EDILMEDI",
          tasnifGerekliMi: false,
          faturaNotu: "TEST NUMUNESİ ELDEN TESLİM EDİLMİŞTİR.",
          faturaKesimKayitlari: [],
        },
      },
      update: {
        companyId: company.id,
        documentType:
          parsed.documentType === "FATURA"
            ? "musteri_fatura"
            : "musteri_irsaliye",
        date: parsed.date ? asDate(parsed.date) : undefined,
        subtotal: money(parsed.totals.goodsTotal),
        vatTotal: money(parsed.totals.vatTotal),
        grandTotal: money(parsed.totals.payableTotal),
        status,
        raw: {
          ...(existing?.raw && typeof existing.raw === "object"
            ? existing.raw
            : {}),
          ...parsed,
          rawLines,
          mailDurumu: "BEKLIYOR",
          ekstreDurumu: "KONTROL_EDILMEDI",
          tasnifGerekliMi: false,
          faturaNotu: "TEST NUMUNESİ ELDEN TESLİM EDİLMİŞTİR.",
        },
      },
    });
    await this.prisma.invoiceItem.deleteMany({
      where: { mainCompanySlug: slug, documentId: document.id },
    });
    if (parsed.lines.length) {
      await this.prisma.invoiceItem.createMany({
        data: parsed.lines.map((line) => ({
          mainCompanySlug: slug,
          documentId: document.id,
          lineNo: line.rowNo,
          productName: line.productName || line.rawName,
          normalizedProductName: normalizeName(
            line.productName || line.rawName,
          ),
          description: line.rawName || line.productName,
          quantity: money(line.quantity),
          unit: line.unit || "Adet",
          unitPrice: money(line.unitPrice),
          vatRate: money(line.vatRate),
          vatAmount: money(line.vatAmount),
          lineTotal: money(line.lineTotal),
          raw: {
            ...line,
            billedQuantity: 0,
            remainingQuantity: line.quantity,
            status: line.status,
          },
        })),
      });
    }
    if (file?.path) {
      await this.prisma.documentFile.create({
        data: {
          mainCompanySlug: slug,
          documentId: document.id,
          filePath: file.path,
          fileName: file.originalname || file.filename || "belge.pdf",
          mimeType: file.mimetype || "application/pdf",
          fileSize: Number(file.size || 0),
          role: "fatura-kesim-pdf",
        },
      });
    }
    return this.faturaKesimDetail(slug, document.id);
  }

  private mapFaturaKesimLine(line: any) {
    const raw = line.raw && typeof line.raw === "object" ? line.raw : {};
    const quantity = number(line.quantity);
    const billedQuantity = number(raw.billedQuantity);
    const nonBillableQuantity = number(
      raw.nonBillableQuantity || raw.testSampleQuantity,
    );
    const remainingQuantity = Math.max(
      0,
      quantity - billedQuantity - nonBillableQuantity,
    );
    const unitPrice = number(line.unitPrice);
    const vatRate = number(line.vatRate);
    const goodsTotal = number(line.lineTotal) || quantity * unitPrice;
    const vatAmount = number(line.vatAmount) || (goodsTotal * vatRate) / 100;
    return {
      id: line.id,
      rowNo: line.lineNo,
      rawName: text(raw.rawName || line.description || line.productName),
      productName: text(line.productName || line.description),
      quantity,
      unit: text(line.unit || "Adet"),
      unitPrice,
      vatRate,
      vatAmount,
      lineTotal: goodsTotal,
      payableTotal: goodsTotal + vatAmount,
      isTestSample: Boolean(raw.isTestSample),
      status: text(
        raw.status || (unitPrice ? "MODEL_BAGLANTISI_BEKLIYOR" : "FIYAT_EKSIK"),
      ),
      manufacturedQuantity: number(raw.manufacturedQuantity),
      billedQuantity,
      nonBillableQuantity,
      remainingQuantity,
      modelId: text(raw.modelId || raw.modelKaydiId),
      modelKaydiId: text(raw.modelKaydiId || raw.modelId),
      modelAdi: text(raw.modelAdi || raw.modelName),
      modelImageUrl: text(raw.modelImageUrl || raw.desenImageThumb),
    };
  }

  async linkFaturaKesimLineToModel(
    mainCompanySlug: string,
    id: string,
    payload: Query = {},
  ) {
    const slug = this.slug({ mainCompanySlug });
    const document = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
      include: { company: true },
    });
    if (!document) throw new NotFoundException("Fatura kesim belgesi bulunamadı.");
    const lineId = text(payload.lineId);
    if (!lineId) throw new BadRequestException("Bağlanacak satır zorunludur.");
    const line = await this.prisma.invoiceItem.findFirst({
      where: { id: lineId, mainCompanySlug: slug, documentId: id },
    });
    if (!line) throw new NotFoundException("Belge satırı bulunamadı.");

    const raw = this.documentRaw(document);
    const lineRaw = line.raw && typeof line.raw === "object" ? line.raw : {};
    const visualModelName = text(
      payload.modelAdi ||
        payload.modelName ||
        payload.visualModelName ||
        payload.linkedVisualModelName ||
        "",
    );
    const productionModelName = text(
      payload.productionModelName ||
        payload.lineProductName ||
        line.productName ||
        line.description ||
        visualModelName,
    );
    if (!productionModelName) throw new BadRequestException("Model adı zorunludur.");

    let model: any = null;
    const requestedModelId = text(payload.modelId || payload.modelKaydiId);
    if (requestedModelId) {
      try {
        model = await this.modelService.getById(requestedModelId, slug);
      } catch {
        model = null;
      }
    }
    if (!model) {
      const company = await this.ensureCustomerCompany(
        slug,
        payload.firmaAdi || payload.firma || document.company?.name || raw.firmName,
      );
      model = await this.modelService.create({
        mainCompanySlug: slug,
        mainCompanyId: slug,
        modelAdi: productionModelName,
        modelName: productionModelName,
        firmId: company.id,
        firmaId: company.id,
        firmaAdi: company.name,
        musteriFirma: company.name,
        siparisNo: text(payload.siparisNo || raw.dispatchNo || document.documentNo),
        musteriIrsaliyeNo: text(payload.siparisNo || raw.dispatchNo || document.documentNo),
        gelenAdet: number(payload.quantity || line.quantity),
        givenQty: number(payload.quantity || line.quantity),
        desenImageThumb: text(payload.modelImageUrl || payload.desenImageThumb),
        imageUrl: text(payload.modelImageUrl || payload.desenImageThumb),
        productionModelName,
        linkedVisualModelName: visualModelName,
        sourceInvoiceItemId: line.id,
        sourceDocumentId: document.id,
        durum: "ACTIVE",
      });
    } else {
      model = await this.modelService.update(model.id, {
        mainCompanySlug: slug,
        modelAdi: productionModelName,
        modelName: productionModelName,
        siparisNo: text(payload.siparisNo || raw.dispatchNo || document.documentNo),
        musteriIrsaliyeNo: text(payload.siparisNo || raw.dispatchNo || document.documentNo),
        gelenAdet: number(payload.quantity || line.quantity),
        givenQty: number(payload.quantity || line.quantity),
        desenImageThumb: text(
          payload.modelImageUrl || payload.desenImageThumb || model.desenImageThumb,
        ),
        imageUrl: text(payload.modelImageUrl || payload.desenImageThumb || model.imageUrl),
        productionModelName,
        linkedVisualModelName: visualModelName,
        sourceInvoiceItemId: line.id,
        sourceDocumentId: document.id,
      });
    }

    const imageUrl = text(
      payload.modelImageUrl ||
        payload.desenImageThumb ||
        model.desenImageThumb ||
        model.imageUrl ||
        model.thumbnail,
    );
    const nextLineRaw = {
      ...lineRaw,
      modelId: model.id,
      modelKaydiId: model.id,
      modelAdi: productionModelName,
      modelName: productionModelName,
      productionModelName,
      linkedVisualModelName: visualModelName,
      modelImageUrl: imageUrl,
      desenImageThumb: imageUrl,
      status: "MODELE_BAGLI",
      linkedAt: new Date().toISOString(),
    };

    await this.prisma.invoiceItem.update({
      where: { id: line.id },
      data: {
        productName: productionModelName,
        normalizedProductName: normalizeName(productionModelName),
        raw: nextLineRaw,
      },
    });

    const links = Array.isArray(raw.modelLinks) ? raw.modelLinks : [];
    await this.prisma.document.update({
      where: { id: document.id },
      data: {
        raw: {
          ...raw,
          modelId: model.id,
          modelKaydiId: model.id,
          modelAdi: productionModelName,
          modelLinks: [
            {
              lineId,
              modelId: model.id,
              modelAdi: productionModelName,
              productionModelName,
              linkedVisualModelName: visualModelName,
              siparisNo: text(payload.siparisNo || raw.dispatchNo || document.documentNo),
              linkedAt: new Date().toISOString(),
            },
            ...links.filter((item: any) => text(item?.lineId) !== lineId),
          ],
        },
      },
    });

    return this.faturaKesimDetail(slug, id);
  }

  async faturaKesimHavuz(query: Query = {}) {
    const slug = this.slug(query);
    await this.ensureMainCompany(slug);
    const statusFilter = text(query.status || query.durum);
    const rows = await this.prisma.document.findMany({
      where: {
        mainCompanySlug: slug,
        deletedAt: null,
        sourceType: "FATURA_KESIM_YARDIMCISI",
      },
      include: { company: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 250,
    });
    const lines = await this.documentLines(
      slug,
      rows.map((row) => row.id),
    );
    return rows
      .map((row) => {
        const raw = this.documentRaw(row);
        const mappedLines = (lines.get(row.id) || []).map((line) =>
          this.mapFaturaKesimLine(line),
        );
        const productSummary = mappedLines
          .filter((line) => !line.isTestSample)
          .map((line) => line.productName)
          .join(", ");
        return {
          id: row.id,
          belgeNo: text(row.documentNo),
          firma: text(row.company?.name || raw.firmName),
          tarih: isoDate(row.date || raw.date),
          modelUrunOzeti:
            productSummary || text(mappedLines[0]?.productName || "-"),
          toplamAdet: mappedLines
            .filter((line) => !line.isTestSample)
            .reduce((sum, line) => sum + line.quantity, 0),
          durum: text(row.status || raw.durum || "Fatura Bekliyor"),
          mailDurumu: text(raw.mailDurumu || "BEKLIYOR"),
          ekstreDurumu: text(raw.ekstreDurumu || "KONTROL_EDILMEDI"),
          tasnifGerekliMi: Boolean(raw.tasnifGerekliMi),
        };
      })
      .filter(
        (row) =>
          !statusFilter ||
          text(row.durum)
            .toLocaleLowerCase("tr-TR")
            .includes(statusFilter.toLocaleLowerCase("tr-TR")),
      );
  }

  async faturaKesimDetail(mainCompanySlug: string, id: string) {
    const slug = this.slug({ mainCompanySlug });
    const row = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
      include: { company: true, files: true },
    });
    if (!row) throw new NotFoundException("Fatura kesim belgesi bulunamadı.");
    const raw = this.documentRaw(row);
    const dbLines = await this.documentLines(slug, [id]);
    const lines = (dbLines.get(id) || []).map((line) =>
      this.mapFaturaKesimLine(line),
    );
    const invoiceLine =
      lines.find((line) => !line.isTestSample) || lines[0] || null;
    const testLine = lines.find((line) => line.isTestSample) || null;
    const invoiceHistory = (
      Array.isArray(raw.faturaKesimKayitlari) ? raw.faturaKesimKayitlari : []
    )
      .map((record: any) => ({
        id: text(record.id),
        invoiceNo: text(record.invoiceNo),
        dispatchNo: text(record.dispatchNo),
        invoiceDate: text(record.invoiceDate),
        productName: text(record.productName),
        billedQuantity: number(record.billedQuantity),
        nonBillableQuantity: number(
          record.nonBillableQuantity || record.testSampleQuantity,
        ),
        payableTotal: number(record.payableTotal),
        status: text(record.status),
        createdAt: text(record.createdAt),
      }))
      .sort((a: any, b: any) =>
        text(b.createdAt).localeCompare(text(a.createdAt)),
      );
    return {
      id: row.id,
      header: {
        belgeNo: text(row.documentNo || raw.documentNo),
        belgeTuru: text(row.documentType || raw.documentType),
        firma: text(row.company?.name || raw.firmName),
        tarih: isoDate(row.date || raw.date),
        scenario: text(raw.scenario),
        ettn: text(raw.ettn),
        irsaliyeNo: text(raw.dispatchNo || row.documentNo),
        faturaNo: text(raw.invoiceNo),
        plateNo: text(raw.plateNo),
        trailerPlateNo: text(raw.trailerPlateNo),
        driverName: text(raw.driverName),
        driverTckn: text(raw.driverTckn),
        durum: text(row.status || raw.durum),
      },
      lines,
      summary: {
        dispatchQuantity: lines
          .filter((line) => !line.isTestSample)
          .reduce((sum, line) => sum + line.quantity, 0),
        manufacturedQuantity: lines.reduce(
          (sum, line) => sum + line.manufacturedQuantity,
          0,
        ),
        billedQuantity: lines.reduce(
          (sum, line) => sum + line.billedQuantity,
          0,
        ),
        billableQuantity: lines.reduce(
          (sum, line) => sum + line.remainingQuantity,
          0,
        ),
        goodsTotal: number(row.subtotal),
        vatTotal: number(row.vatTotal),
        payableTotal: number(row.grandTotal),
      },
      invoicePreparation: invoiceLine
        ? {
            lineId: invoiceLine.id,
            productName: invoiceLine.productName,
            quantity: invoiceLine.remainingQuantity ?? invoiceLine.quantity,
            unitPrice: invoiceLine.unitPrice,
            vatRate: invoiceLine.vatRate,
            goodsTotal: invoiceLine.lineTotal,
            vatAmount: invoiceLine.vatAmount,
            payableTotal: invoiceLine.payableTotal,
            invoiceNote: text(
              raw.faturaNotu || "TEST NUMUNESİ ELDEN TESLİM EDİLMİŞTİR.",
            ),
            invoiceOfficerNote: text(raw.faturaYetkilisiEkNot),
          }
        : null,
      tracking: {
        mail: text(raw.mailDurumu || "BEKLIYOR"),
        ekstre: text(raw.ekstreDurumu || "KONTROL_EDILMEDI"),
        tasnif: raw.tasnifGerekliMi ? "GEREKLI" : "GEREKLI_DEGIL",
      },
      invoiceHistory,
      testSample: testLine
        ? {
            quantity: testLine.quantity,
            unit: testLine.unit,
            note: "TEST NUMUNESİ ELDEN TESLİM EDİLMİŞTİR.",
            exemption: "351 - TEST NUMUNELERİ BEDELSİZ TESLİM EDİLMİŞTİR",
          }
        : null,
      rawText: text(raw.rawText),
      rawLines: Array.isArray(raw.rawLines) ? raw.rawLines : [],
      files: row.files,
    };
  }

  async registerFaturaKesimIsnetFiles(
    mainCompanySlug: string,
    id: string,
    parsedFiles: Array<{ parsed: ParsedKyDocument; file?: any }>,
    body: Query = {},
  ) {
    const slug = this.slug({ mainCompanySlug });
    const entries = Array.isArray(parsedFiles)
      ? parsedFiles.filter((entry) => entry?.parsed)
      : [];
    if (!entries.length) {
      throw new BadRequestException("İşNet için en az bir PDF gereklidir.");
    }

    const detail = await this.faturaKesimDetail(slug, id);
    const openLines = Array.isArray(detail.lines)
      ? detail.lines.filter(
          (line) =>
            !line.isTestSample &&
            number(line.remainingQuantity ?? line.quantity) > 0,
        )
      : [];
    const selectedLine =
      openLines.find((line) => text(line.id) === text(body.lineId)) ||
      openLines[0] ||
      null;
    if (!selectedLine) {
      throw new BadRequestException(
        "İşlem yapılacak açık model satırı bulunamadı.",
      );
    }

    const invoiceEntry =
      entries.find(
        (entry) =>
          text(entry.parsed.invoiceNo) ||
          text(entry.parsed.documentType).toLocaleUpperCase("tr-TR") ===
            "FATURA",
      ) || entries[0];
    const dispatchEntry =
      entries.find(
        (entry) =>
          entry !== invoiceEntry &&
          (text(entry.parsed.dispatchNo) ||
            text(entry.parsed.documentType).toLocaleUpperCase("tr-TR") ===
              "IRSALIYE"),
      ) || null;

    const invoiceNo = text(
      invoiceEntry.parsed.invoiceNo || invoiceEntry.parsed.documentNo,
    );
    if (!invoiceNo) {
      throw new BadRequestException("İşNet faturasında fatura no okunamadı.");
    }

    const invoiceLines = Array.isArray(invoiceEntry.parsed.lines)
      ? invoiceEntry.parsed.lines.filter((line) => !line.isTestSample)
      : [];
    const invoiceTestSampleQuantity = Array.isArray(invoiceEntry.parsed.lines)
      ? invoiceEntry.parsed.lines
          .filter((line) => line.isTestSample)
          .reduce((sum, line) => sum + number(line.quantity), 0)
      : 0;
    const matchedInvoiceLine =
      invoiceLines
        .map((line) => {
          let score = 0;
          if (
            normalizeName(line.productName || line.rawName) ===
            normalizeName(selectedLine.productName || selectedLine.rawName)
          ) {
            score += 5;
          }
          if (
            normalizedIncludes(
              line.productName || line.rawName,
              selectedLine.productName || selectedLine.rawName,
            )
          ) {
            score += 3;
          }
          if (
            number(line.quantity) ===
            number(selectedLine.remainingQuantity ?? selectedLine.quantity)
          ) {
            score += 2;
          }
          return { line, score };
        })
        .sort((left, right) => right.score - left.score)[0]?.line ||
      invoiceLines[0] ||
      null;

    const billedQuantity = number(
      body.billedQuantity ??
        matchedInvoiceLine?.quantity ??
        selectedLine.remainingQuantity ??
        selectedLine.quantity,
    );
    if (billedQuantity <= 0) {
      throw new BadRequestException(
        "İşNet dosyalarından faturalanan adet okunamadı.",
      );
    }

    const unitPrice = number(
      matchedInvoiceLine?.unitPrice || selectedLine.unitPrice,
    );
    if (unitPrice <= 0) {
      throw new BadRequestException("İşNet faturasında birim fiyat okunamadı.");
    }
    const goodsTotal = number(
      matchedInvoiceLine?.lineTotal || billedQuantity * unitPrice,
    );
    const vatRate = number(
      matchedInvoiceLine?.vatRate ||
        (goodsTotal > 0
          ? (number(invoiceEntry.parsed.totals?.vatTotal) * 100) / goodsTotal
          : selectedLine.vatRate) ||
        selectedLine.vatRate,
    );
    const vatAmount = number(
      matchedInvoiceLine?.vatAmount ||
        (goodsTotal * vatRate) / 100 ||
        invoiceEntry.parsed.totals?.vatTotal,
    );
    const payableTotal = number(
      matchedInvoiceLine
        ? number(matchedInvoiceLine.lineTotal) +
            number(matchedInvoiceLine.vatAmount)
        : goodsTotal + vatAmount,
    );

    const result = await this.createFaturaKesimInvoiceRecord(slug, id, {
      lineId: selectedLine.id,
      invoiceNo,
      dispatchNo: text(
        dispatchEntry?.parsed?.dispatchNo || invoiceEntry.parsed.dispatchNo,
      ),
      invoiceDate:
        text(invoiceEntry.parsed.date) || new Date().toISOString().slice(0, 10),
      billedQuantity,
      unitPrice,
      vatRate,
      goodsTotal,
      vatAmount,
      payableTotal,
      nonBillableQuantity: invoiceTestSampleQuantity,
      invoiceNote: text(body.invoiceNote) || "İşNet kesim dosyasından işlendi.",
      invoiceOfficerNote: text(body.invoiceOfficerNote),
      source: "ISNET_DROP",
    });

    const attachments = entries
      .filter((entry) => entry?.file?.path)
      .map((entry) => ({
        mainCompanySlug: slug,
        documentId: id,
        filePath: entry.file.path,
        fileName:
          entry.file.originalname || entry.file.filename || "isnet-belge.pdf",
        mimeType: entry.file.mimetype || "application/pdf",
        fileSize: Number(entry.file.size || 0),
        role:
          entry === invoiceEntry
            ? "fatura-kesim-isnet-fatura"
            : "fatura-kesim-isnet-irsaliye",
      }));
    if (attachments.length) {
      await this.prisma.documentFile.createMany({ data: attachments });
    }
    return this.faturaKesimDetail(slug, result.id);
  }

  async createFaturaKesimInvoiceRecord(
    mainCompanySlug: string,
    id: string,
    body: Query = {},
  ) {
    const slug = this.slug({ mainCompanySlug });
    const invoiceNo = text(body.invoiceNo);
    if (!invoiceNo)
      throw new BadRequestException("Kesilen fatura no zorunludur.");
    const document = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
      include: { company: true },
    });
    if (!document)
      throw new NotFoundException("Fatura kesim belgesi bulunamadı.");
    const line = await this.prisma.invoiceItem.findFirst({
      where: { id: text(body.lineId), documentId: id, mainCompanySlug: slug },
    });
    if (!line) throw new NotFoundException("Fatura satırı bulunamadı.");
    const raw = this.documentRaw(document);
    const lineRaw: any =
      line.raw && typeof line.raw === "object" && !Array.isArray(line.raw)
        ? line.raw
        : {};
    const existingRecords = Array.isArray(raw.faturaKesimKayitlari)
      ? raw.faturaKesimKayitlari
      : [];
    const billedQuantity = number(body.billedQuantity);
    const duplicate = existingRecords.find(
      (record: any) =>
        text(record.invoiceNo) === invoiceNo ||
        (text(record.lineId) === line.id &&
          text(record.productName) === text(line.productName) &&
          number(record.billedQuantity) === billedQuantity &&
          ["Tam Faturalandırıldı", "Kısmi Faturalandırıldı"].includes(
            text(record.status),
          )),
    );
    if (duplicate)
      throw new BadRequestException(
        "Bu irsaliye/ürün/adet için fatura kaydı zaten var.",
      );
    const previousBilled = number(lineRaw.billedQuantity);
    const previousNonBillable = number(
      lineRaw.nonBillableQuantity || lineRaw.testSampleQuantity,
    );
    const quantity = number(line.quantity);
    const nonBillableQuantity = number(
      body.nonBillableQuantity || body.testSampleQuantity,
    );
    if (billedQuantity <= 0)
      throw new BadRequestException("Faturalanan adet sıfırdan büyük olmalı.");
    if (
      previousBilled +
        previousNonBillable +
        billedQuantity +
        nonBillableQuantity >
      quantity
    ) {
      throw new BadRequestException(
        "Faturalanan adet irsaliye kalan adedini aşıyor.",
      );
    }
    const invoiceDate = asDate(body.invoiceDate || new Date());
    const unitPrice = number(body.unitPrice ?? line.unitPrice);
    const vatRate = number(body.vatRate ?? line.vatRate);
    const goodsTotal = number(body.goodsTotal || billedQuantity * unitPrice);
    const vatAmount = number(body.vatAmount || (goodsTotal * vatRate) / 100);
    const payableTotal = number(body.payableTotal || goodsTotal + vatAmount);
    const companyId = text(document.companyId);
    if (!companyId)
      throw new BadRequestException(
        "Cari hareket için firma bağlantısı zorunludur.",
      );
    const record = {
      id: `fky_${Date.now()}`,
      invoiceNo,
      dispatchNo: text(body.dispatchNo),
      invoiceDate: invoiceDate.toISOString().slice(0, 10),
      lineId: line.id,
      productName: text(line.productName),
      billedQuantity,
      nonBillableQuantity,
      unitPrice,
      vatRate,
      goodsTotal,
      vatAmount,
      payableTotal,
      invoiceNote: text(body.invoiceNote),
      invoiceOfficerNote: text(body.invoiceOfficerNote),
      status: text(body.status || ""),
      source: text(body.source || "MANUAL"),
      createdAt: new Date().toISOString(),
    };
    await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId, mainCompanySlug: slug },
      });
      if (!company) throw new NotFoundException("Firma bulunamadı.");
      const balanceAfter = number(company.currentBalance) + payableTotal;
      await tx.currentAccountMovement.create({
        data: {
          mainCompanySlug: slug,
          companyId,
          movementDate: invoiceDate,
          movementType: "SATIS_FATURA",
          sourceType: "FATURA_KESIM_YARDIMCISI",
          documentNo: invoiceNo,
          documentId: document.id,
          description: `${invoiceNo} fatura kesim kaydı`,
          debit: money(payableTotal),
          credit: money(0),
          amount: money(payableTotal),
          effect: money(payableTotal),
          balanceAfter: money(balanceAfter),
          raw: { sourceDispatchNo: document.documentNo, lineId: line.id },
        },
      });
      await tx.company.update({
        where: { id: companyId },
        data: { currentBalance: money(balanceAfter) },
      });
      await tx.vatRecord.create({
        data: {
          mainCompanySlug: slug,
          companyId,
          documentId: document.id,
          direction: "OUT",
          workType: "RESMI",
          date: invoiceDate,
          subtotal: money(goodsTotal),
          total: money(payableTotal),
          periodMonth: invoiceDate.getUTCMonth() + 1,
          periodYear: invoiceDate.getUTCFullYear(),
          vatDirection: "OUT",
          vatRate: money(vatRate),
          baseAmount: money(goodsTotal),
          vatAmount: money(vatAmount),
          documentNo: invoiceNo,
          documentDate: invoiceDate,
          incomingVat: money(0),
          outgoingVat: money(vatAmount),
          raw: {
            source: "fatura-kesim-yardimcisi",
            sourceDispatchNo: document.documentNo,
          },
        },
      });
      const nextBilled = previousBilled + billedQuantity;
      const nextNonBillable = previousNonBillable + nonBillableQuantity;
      const lineStatus =
        nextBilled + nextNonBillable >= quantity
          ? "Tam Faturalandırıldı"
          : "Kısmi Faturalandırıldı";
      await tx.invoiceItem.update({
        where: { id: line.id },
        data: {
          unitPrice: money(unitPrice),
          vatRate: money(vatRate),
          vatAmount: money(vatAmount),
          lineTotal: money(goodsTotal),
          raw: {
            ...lineRaw,
            billedQuantity: nextBilled,
            nonBillableQuantity: nextNonBillable,
            testSampleQuantity: nextNonBillable,
            remainingQuantity: Math.max(
              0,
              quantity - nextBilled - nextNonBillable,
            ),
            status: lineStatus,
          },
        },
      });
      const siblingLines = await tx.invoiceItem.findMany({
        where: { mainCompanySlug: slug, documentId: document.id },
      });
      const allClosed = siblingLines.every((item) => {
        if (item.id === line.id) {
          return nextBilled + nextNonBillable >= number(item.quantity);
        }
        const itemRaw =
          item.raw && typeof item.raw === "object" ? item.raw : {};
        return (
          Boolean((itemRaw as any).isTestSample) ||
          number((itemRaw as any).billedQuantity) +
            number(
              (itemRaw as any).nonBillableQuantity ||
                (itemRaw as any).testSampleQuantity,
            ) >=
            number(item.quantity)
        );
      });
      const nextStatus = allClosed
        ? "Tam Faturalandırıldı"
        : "Kısmi Faturalandırıldı";
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: nextStatus,
          raw: {
            ...raw,
            faturaKesimKayitlari: [
              ...existingRecords,
              { ...record, status: nextStatus },
            ],
            mailDurumu: raw.mailDurumu || "BEKLIYOR",
            ekstreDurumu: raw.ekstreDurumu || "KONTROL_EDILMEDI",
            tasnifGerekliMi: Boolean(raw.tasnifGerekliMi),
          },
        },
      });
    });
    return this.faturaKesimDetail(slug, id);
  }

  async approveDocument(mainCompanySlug: string, id: string, body: Query = {}) {
    const slug = this.slug({ mainCompanySlug });
    const document = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug },
      include: { company: true },
    });
    if (!document) throw new NotFoundException("Belge bulunamadı.");
    if (
      ["islendi", "processed", "done"].includes(
        text(document.status).toLocaleLowerCase("tr-TR"),
      )
    ) {
      throw new BadRequestException("Bu belge daha önce onaylandı.");
    }
    const amount = number(
      document.grandTotal ||
        this.documentRaw(document).genelToplam ||
        body.tutar,
    );
    const vat = number(
      document.vatTotal || this.documentRaw(document).kdvToplam || body.kdv,
    );
    const subtotal = number(document.subtotal || amount - vat);
    const direction = normalizeType(document.documentType);
    const companyId = text(document.companyId || body.companyId);
    if (!companyId)
      throw new BadRequestException("Onay için firma bağlantısı zorunludur.");

    const approved = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId, mainCompanySlug: slug },
      });
      if (!company) throw new NotFoundException("Firma bulunamadı.");
      const effect = direction === "SATIS" ? amount : -amount;
      const balanceAfter = number(company.currentBalance) + effect;
      const movement = await tx.currentAccountMovement.create({
        data: {
          mainCompanySlug: slug,
          companyId,
          movementDate: document.date || new Date(),
          movementType: direction === "SATIS" ? "SATIS_FATURA" : "ALIS_FATURA",
          sourceType: "DOCUMENT_APPROVAL",
          documentNo: document.documentNo,
          documentId: document.id,
          description: `${document.documentNo || "Belge"} onayı`,
          debit: money(effect > 0 ? effect : 0),
          credit: money(effect < 0 ? Math.abs(effect) : 0),
          amount: money(Math.abs(effect)),
          effect: money(effect),
          balanceAfter: money(balanceAfter),
          raw: { source: "belge-havuzu-onayla" },
        },
      });
      await tx.company.update({
        where: { id: companyId },
        data: { currentBalance: money(balanceAfter) },
      });
      await tx.vatRecord.create({
        data: {
          mainCompanySlug: slug,
          companyId,
          documentId: document.id,
          direction: direction === "SATIS" ? "OUT" : "IN",
          workType: text(
            this.documentRaw(document).resmiGayri ||
              company.defaultRecordType ||
              "RESMI",
          ),
          date: document.date || new Date(),
          subtotal: money(subtotal),
          total: money(amount),
          periodMonth: (document.date || new Date()).getUTCMonth() + 1,
          periodYear: (document.date || new Date()).getUTCFullYear(),
          vatDirection: direction === "SATIS" ? "OUT" : "IN",
          vatRate: money(vat && subtotal ? (vat / subtotal) * 100 : 0),
          baseAmount: money(subtotal),
          vatAmount: money(vat),
          documentNo: document.documentNo,
          documentDate: document.date || new Date(),
          incomingVat: money(direction === "SATIS" ? 0 : vat),
          outgoingVat: money(direction === "SATIS" ? vat : 0),
          raw: { source: "document_approval" },
        },
      });
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: "islendi",
          processedAt: new Date(),
          raw: {
            ...this.documentRaw(document),
            durum: "islendi",
            approvedMovementId: movement.id,
          },
        },
      });
      return { ok: true, id: document.id, movementId: movement.id };
    });
    const stockSummary = await this.muhasebeDb.syncDocumentStockMovements(
      slug,
      document.id,
    );
    return {
      ...approved,
      stockSummary: (stockSummary as any)?.data || stockSummary,
    };
  }

  async cariList(query: Query = {}) {
    const slug = this.slug(query);
    const companies = await this.prisma.company.findMany({
      where: { mainCompanySlug: slug, isActive: true, deletedAt: null },
      orderBy: [{ currentBalance: "desc" }, { name: "asc" }],
      take: 250,
    });
    const companyIds = companies.map((item) => item.id);
    const movements = companyIds.length
      ? await this.prisma.currentAccountMovement.groupBy({
          by: ["companyId"],
          where: { mainCompanySlug: slug, companyId: { in: companyIds } },
          _sum: { debit: true, credit: true },
          _max: { movementDate: true },
        })
      : [];
    const byCompany = new Map(movements.map((row) => [row.companyId, row]));
    return companies.map((company) => {
      const totals = byCompany.get(company.id);
      return {
        firmaId: company.id,
        id: company.id,
        firmaAdi: company.name,
        firmaTipi: company.type,
        resmiGayri: company.defaultRecordType || "RESMI",
        bakiye: number(company.currentBalance),
        borc: number(totals?._sum?.debit),
        alacak: number(totals?._sum?.credit),
        sonHareketTarihi: isoDate(
          totals?._max?.movementDate || company.updatedAt,
        ),
      };
    });
  }

  async cariHareketler(mainCompanySlug: string, firmaId: string) {
    const slug = this.slug({ mainCompanySlug });
    const rows = await this.prisma.currentAccountMovement.findMany({
      where: { mainCompanySlug: slug, companyId: firmaId },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      tarih: isoDate(row.movementDate),
      belgeNo: row.documentNo || "",
      resmiGayri: text((row.raw as any)?.resmiGayri || "RESMI"),
      aciklama: row.description || "",
      borc: number(row.debit),
      alacak: number(row.credit),
      bakiye: number(row.balanceAfter),
      vade: isoDate((row.raw as any)?.vade),
      durum: text((row.raw as any)?.durum || "ISLENDI"),
    }));
  }

  async createCariMovement(body: Query = {}) {
    const slug = this.slug(body);
    const firmaId = text(body.firmaId || body.companyId);
    if (!firmaId) throw new BadRequestException("firmaId zorunludur.");
    const amount = number(body.tutar || body.amount);
    if (amount <= 0) throw new BadRequestException("Tutar zorunludur.");
    const description = text(body.aciklama || body.description);
    if (!description)
      throw new BadRequestException("Manuel cari kayıtta açıklama zorunludur.");
    const isCredit = /alacak|tahsilat|odeme|ödeme/i.test(
      text(body.islemTipi || body.movementType),
    );
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: firmaId, mainCompanySlug: slug },
      });
      if (!company) throw new NotFoundException("Firma bulunamadı.");
      const effect = isCredit ? -amount : amount;
      const balanceAfter = number(company.currentBalance) + effect;
      const movement = await tx.currentAccountMovement.create({
        data: {
          mainCompanySlug: slug,
          companyId: firmaId,
          movementDate: asDate(body.tarih || body.date),
          movementType: text(body.islemTipi || "MANUEL"),
          sourceType: "MANUAL",
          description,
          debit: money(effect > 0 ? effect : 0),
          credit: money(effect < 0 ? Math.abs(effect) : 0),
          amount: money(amount),
          effect: money(effect),
          balanceAfter: money(balanceAfter),
          raw: { resmiGayri: text(body.resmiGayri || "RESMI") },
        },
      });
      await tx.company.update({
        where: { id: firmaId },
        data: { currentBalance: money(balanceAfter) },
      });
      return { ok: true, data: movement };
    });
  }

  async kdvKontrol(query: Query = {}) {
    const slug = this.slug(query);
    const rows = await this.prisma.vatRecord.findMany({
      where: { mainCompanySlug: slug },
      include: { company: true },
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    const gelenKdv = rows.reduce(
      (sum, row) =>
        sum +
        number(
          row.incomingVat || (row.vatDirection === "IN" ? row.vatAmount : 0),
        ),
      0,
    );
    const gidenKdv = rows.reduce(
      (sum, row) =>
        sum +
        number(
          row.outgoingVat || (row.vatDirection === "OUT" ? row.vatAmount : 0),
        ),
      0,
    );
    const devredenKdv = rows.reduce(
      (sum, row) => sum + number(row.carryVat),
      0,
    );
    return {
      gidenKdv,
      gelenKdv,
      devredenKdv,
      netKdv: gidenKdv - gelenKdv - devredenKdv,
      belgeSayisi: rows.length,
      liste: rows.map((row) => ({
        id: row.id,
        tarih: isoDate(row.documentDate || row.date),
        belgeNo: row.documentNo || "",
        firma: row.company?.name || "",
        tur: vatTypeLabel(row.vatDirection || row.direction),
        resmiGayri: row.workType || "RESMI",
        matrah: number(row.baseAmount || row.subtotal),
        kdvOrani: number(row.vatRate),
        kdvTutari: number(row.vatAmount || row.incomingVat || row.outgoingVat),
        toplam:
          number(row.total) ||
          number(row.baseAmount || row.subtotal) +
            number(row.vatAmount || row.incomingVat || row.outgoingVat),
      })),
    };
  }

  async cekOdeme(query: Query = {}) {
    const slug = this.slug(query);
    const [checks, payments, companies, documents] = await Promise.all([
      this.prisma.check.findMany({
        where: { mainCompanySlug: slug },
        orderBy: [{ dueDate: "asc" }],
        take: 250,
      }),
      this.prisma.payment.findMany({
        where: { mainCompanySlug: slug },
        orderBy: [{ paymentDate: "desc" }],
        take: 250,
      }),
      this.prisma.company.findMany({ where: { mainCompanySlug: slug } }),
      this.prisma.document.findMany({
        where: { mainCompanySlug: slug },
        take: 500,
      }),
    ]);
    const companyById = new Map(
      companies.map((company) => [company.id, company]),
    );
    const docByNo = new Map(documents.map((doc) => [doc.documentNo, doc]));
    const today = new Date(new Date().toISOString().slice(0, 10));
    const week = new Date(today);
    week.setDate(today.getDate() + 7);
    const classify = (due: any, status: any) => {
      const date = due ? new Date(due) : null;
      if (isPaid(status)) return "odendi";
      if (!date || Number.isNaN(date.getTime())) return "plansiz";
      if (date < today) return "vadesi_gecmis";
      if (date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10))
        return "bugun";
      if (date <= week) return "bu_hafta";
      return "yaklasan";
    };
    const list = [
      ...checks
        .map((row) => ({
          constDueDate: text(
            (row.raw as any)?.vadeTarihi ||
              (row.raw as any)?.dueDate ||
              (row.raw as any)?.vade ||
              row.dueDate,
          ),
          row,
        }))
        .map(({ constDueDate, row }: any) => ({
          id: row.id,
          firma: companyById.get(row.companyId || "")?.name || "",
          bagliBelge: text(
            (row.raw as any)?.odemeBaglantisi || row.description,
          ),
          cekNo: row.checkNo,
          banka: row.bankName || "",
          odemeTipi: "Çek",
          vadeTarihi: constDueDate,
          tutar: number(row.amount),
          resmiGayri: text((row.raw as any)?.resmiGayri || "RESMI"),
          durum: row.status,
          vadeGrubu: classify(constDueDate, row.status),
          onGorsel: text(
            (row.raw as any)?.onGorsel || (row.raw as any)?.frontImagePath,
          ),
          arkaGorsel: text(
            (row.raw as any)?.arkaGorsel || (row.raw as any)?.backImagePath,
          ),
          source: "check",
        })),
      ...payments.map((row) => ({
        id: row.id,
        firma: companyById.get(row.companyId || "")?.name || "",
        bagliBelge:
          row.documentNo || docByNo.get(row.documentNo || "")?.documentNo || "",
        cekNo: "",
        banka: row.bankName || "",
        odemeTipi: row.paymentType,
        vadeTarihi: isoDate(row.paymentDate),
        tutar: number(row.amount),
        resmiGayri: text((row.raw as any)?.resmiGayri || "RESMI"),
        durum: "odendi",
        vadeGrubu: "odendi",
        onGorsel: "",
        arkaGorsel: "",
        source: "payment",
      })),
    ];
    return {
      yaklasan: list.filter(
        (row) => row.vadeGrubu === "yaklasan" || row.vadeGrubu === "bu_hafta",
      ),
      bugun: list.filter((row) => row.vadeGrubu === "bugun"),
      vadesiGecmis: list.filter((row) => row.vadeGrubu === "vadesi_gecmis"),
      liste: list,
    };
  }

  async createCekOdeme(body: Query = {}) {
    const slug = this.slug(body);
    if (
      text(body.odemeTipi || body.paymentType)
        .toLocaleLowerCase("tr-TR")
        .includes("çek")
    ) {
      const saved = await this.prisma.check.create({
        data: {
          mainCompanySlug: slug,
          companyId: text(body.firmaId || body.companyId) || null,
          checkNo: text(body.cekNo || body.checkNo) || `CEK-${Date.now()}`,
          bankName: text(body.banka || body.bankName) || null,
          dueDate: asDate(body.vadeTarihi || body.dueDate),
          amount: money(body.tutar || body.amount),
          status: text(body.durum || "bekliyor"),
          direction: text(body.yon || "OUT"),
          description: text(body.bagliBelge || body.aciklama),
          raw: body,
        },
      });
      return { ok: true, data: saved };
    }
    const saved = await this.prisma.payment.create({
      data: {
        mainCompanySlug: slug,
        companyId: text(body.firmaId || body.companyId),
        paymentDate: asDate(body.vadeTarihi || body.tarih || body.paymentDate),
        paymentType: text(body.odemeTipi || body.paymentType || "Ödeme"),
        direction: text(body.yon || "OUT"),
        amount: money(body.tutar || body.amount),
        bankName: text(body.banka || body.bankName) || null,
        documentNo: text(body.bagliBelge || body.documentNo) || null,
        sourceType: "PAYMENT_PLAN",
        raw: body,
      },
    });
    return { ok: true, data: saved };
  }

  async markPaid(body: Query = {}, id: string) {
    const slug = this.slug(body);
    const check = await this.prisma.check.findFirst({
      where: { id, mainCompanySlug: slug },
    });
    if (!check) throw new NotFoundException("Çek/ödeme kaydı bulunamadı.");
    return this.prisma.$transaction(async (tx) => {
      let movementId = check.currentAccountMovementId;
      if (check.companyId && !movementId) {
        const company = await tx.company.findFirst({
          where: { id: check.companyId, mainCompanySlug: slug },
        });
        if (company) {
          const amount = number(check.amount);
          const effect =
            text(check.direction).toUpperCase() === "IN" ? amount : -amount;
          const balanceAfter = number(company.currentBalance) + effect;
          const movement = await tx.currentAccountMovement.create({
            data: {
              mainCompanySlug: slug,
              companyId: check.companyId,
              movementDate: new Date(),
              movementType: "CEK_ODEME",
              sourceType: "CHECK_PAID",
              documentNo: check.checkNo,
              description: `${check.checkNo} ödendi`,
              debit: money(effect > 0 ? effect : 0),
              credit: money(effect < 0 ? Math.abs(effect) : 0),
              amount: money(amount),
              effect: money(effect),
              balanceAfter: money(balanceAfter),
              raw: { checkId: check.id },
            },
          });
          movementId = movement.id;
          await tx.company.update({
            where: { id: company.id },
            data: { currentBalance: money(balanceAfter) },
          });
        }
      }
      const saved = await tx.check.update({
        where: { id: check.id },
        data: { status: "odendi", currentAccountMovementId: movementId },
      });
      return { ok: true, data: saved };
    });
  }

  async mailEkstre(query: Query = {}) {
    const slug = this.slug(query);
    const [packages, contacts, documents] = await Promise.all([
      this.prisma.mailPackage.findMany({
        where: { mainCompanySlug: slug, deletedAt: null },
        orderBy: [{ createdAt: "desc" }],
        take: 250,
      }),
      this.prisma.emailContact.findMany({
        where: { mainCompanySlug: slug, deletedAt: null },
        take: 500,
      }),
      this.prisma.document.findMany({
        where: { mainCompanySlug: slug, deletedAt: null },
        include: { company: true, files: true },
        orderBy: [{ date: "desc" }],
        take: 250,
      }),
    ]);
    const fromDocuments = documents.map((doc) => {
      const raw = this.documentRaw(doc);
      const companyContacts = contacts.filter(
        (contact: any) =>
          contact.companyId === doc.companyId ||
          contact.companyName === doc.company?.name ||
          contact.raw?.companyName === doc.company?.name,
      );
      const to = companyContacts.filter(
        (contact) => contact.receivesInvoice || contact.receivesDispatch,
      );
      const cc = contacts.filter((contact) => contact.defaultCc);
      const pdfs = (doc.files || []).filter((file: any) =>
        /pdf/i.test(file.mimeType || file.fileName),
      );
      return {
        id: doc.id,
        firma: doc.company?.name || raw.firma || "",
        model: raw.modelName || raw.modelAdi || "",
        modelGrubu: raw.modelGroup || "",
        faturaNo: doc.documentNo || "",
        irsaliyeNo: raw.irsaliyeNo || "",
        tutar: number(doc.grandTotal),
        mailAliciKarari: to.length
          ? "Firma yetkilileri kullanıldı"
          : "Alıcı eksik",
        to: to.map((item) => item.email),
        cc: cc.map((item) => item.email),
        genelMuhasebeCc: cc.map((item) => item.email),
        eksikKontrol: to.length ? "Eksik yok" : "Alıcı eksik",
        ekstreKarsilastirma: raw.ekstreDurumu || "Kontrol edilmedi",
        ekler: pdfs.map((file: any) => file.filePath),
        status: to.length ? "gonderilecek" : "alici_eksik",
      };
    });
    const fromPackages = packages.map((pkg) => ({
      id: pkg.id,
      firma: "",
      model: "",
      modelGrubu: pkg.departmentNo || "",
      faturaNo: pkg.invoiceNo || "",
      irsaliyeNo: pkg.dispatchNo || "",
      tutar: 0,
      mailAliciKarari: "Mail paketi",
      to: Array.isArray(pkg.toList) ? pkg.toList : [],
      cc: Array.isArray(pkg.ccList) ? pkg.ccList : [],
      genelMuhasebeCc: [],
      eksikKontrol:
        pkg.status === "MISSING_RECIPIENT" ? "Alıcı eksik" : "Eksik yok",
      ekstreKarsilastirma: "Kontrol edilmedi",
      ekler: Array.isArray(pkg.attachmentsJson) ? pkg.attachmentsJson : [],
      status: text(pkg.status).toLocaleLowerCase("tr-TR"),
    }));
    const liste = [...fromPackages, ...fromDocuments];
    return {
      gonderilecek: liste.filter(
        (row) => row.status === "gonderilecek" || row.status === "draft",
      ).length,
      gonderildi: liste.filter(
        (row) => row.status === "sent" || row.status === "gonderildi",
      ).length,
      aliciEksik: liste.filter(
        (row) =>
          row.status === "alici_eksik" || row.status === "missing_recipient",
      ).length,
      ekstedeVar: liste.filter((row) => /var/i.test(row.ekstreKarsilastirma))
        .length,
      liste,
      seciliKayitDetay: liste[0] || null,
      mailAliciKarari: liste[0]?.mailAliciKarari || "",
      mailOnizleme: this.mailPreview(liste[0]),
      ekstreKarsilastirmaSonucu: {},
    };
  }

  private mailPreview(row: any) {
    if (!row) return "";
    return `Merhaba,\n${row.faturaNo || "Belge"} numaralı belge ekte bilgilerinize sunulmuştur.\nİyi çalışmalar.`;
  }

  async prepareMail(query: Query, id: string) {
    const data = await this.mailEkstre(query);
    const row = data.liste.find((item: any) => item.id === id);
    if (!row) throw new NotFoundException("Mail takip kaydı bulunamadı.");
    return {
      to: row.to,
      cc: row.cc,
      genelMuhasebeCc: row.genelMuhasebeCc,
      konu: `${row.faturaNo || "Muhasebe belgesi"} hakkında`,
      govde: this.mailPreview(row),
      ekler: row.ekler,
    };
  }

  async compareStatement(body: Query = {}) {
    return {
      odemeyeGirenFaturalar: [],
      odemeyeGirmeyenFaturalar: [],
      tutarFarkiOlanlar: [],
      ekstredeOlupBizdeOlmayanlar: [],
      yuklenenDosya: text(body.fileName || body.dosya || ""),
    };
  }

  async firmaKartlari(query: Query = {}) {
    const slug = this.slug(query);
    const firms = await this.prisma.company.findMany({
      where: { mainCompanySlug: slug, isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      take: 500,
    });
    const contacts = await this.prisma.emailContact.findMany({
      where: { mainCompanySlug: slug, deletedAt: null },
      orderBy: { name: "asc" },
      take: 1000,
    });
    return firms.map((firm) => ({
      id: firm.id,
      firmaAdi: firm.name,
      firmaTipi: firm.type,
      resmiGayri: firm.defaultRecordType || "RESMI",
      varsayilanKdv: number(firm.defaultVatRate),
      cariNotu: firm.note || "",
      departman: text((firm.raw as any)?.departman),
      mailKisileri: contacts
        .filter(
          (contact: any) =>
            contact.companyId === firm.id ||
            contact.companyName === firm.name ||
            contact.raw?.companyName === firm.name,
        )
        .map((contact) => ({
          id: contact.id,
          adSoyad: contact.name,
          email: contact.email,
          departman: contact.departmentNo || "",
          gorev: text((contact.raw as any)?.title),
          telefon: text((contact.raw as any)?.phone),
          faturaYetkilisi: contact.receivesInvoice,
          irsaliyeYetkilisi: contact.receivesDispatch,
          ekstreYetkilisi: Boolean((contact.raw as any)?.receivesStatement),
          odemeYetkilisi: Boolean(
            (contact.raw as any)?.receivesPaymentReminder,
          ),
          odemeHatirlatmaYetkilisi: Boolean(
            (contact.raw as any)?.receivesPaymentReminder,
          ),
          genelMuhasebeYetkilisi: contact.defaultCc,
          modelSorumlusuOlabilir: Boolean(
            (contact.raw as any)?.canBeModelResponsible,
          ),
          aktif: contact.active,
          not: text((contact.raw as any)?.note),
        })),
    }));
  }

  async saveFirmaContact(companyId: string, body: Query = {}) {
    const slug = this.slug(body);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, mainCompanySlug: slug, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Firma bulunamadı.");
    const name = text(body.adSoyad || body.fullName || body.name);
    const email = text(body.email || body["e-posta"]);
    if (!name) throw new BadRequestException("Kişi adı zorunludur.");
    if (!email) throw new BadRequestException("E-posta zorunludur.");
    const payload = {
      mainCompanySlug: slug,
      companyId: company.id,
      companyName: company.name,
      name,
      email,
      departmentNo: text(body.departman || body.department) || null,
      receivesInvoice: Boolean(body.faturaYetkilisi ?? body.canReceiveInvoice),
      receivesDispatch: Boolean(
        body.irsaliyeYetkilisi ?? body.canReceiveDispatch,
      ),
      defaultCc: Boolean(
        body.genelMuhasebeYetkilisi ?? body.canReceiveGeneralAccounting,
      ),
      active: body.aktif === undefined ? true : Boolean(body.aktif),
      raw: {
        title: text(body.gorev || body.title),
        phone: text(body.telefon || body.phone),
        receivesStatement: Boolean(
          body.ekstreYetkilisi ?? body.canReceiveStatement,
        ),
        receivesPaymentReminder: Boolean(
          body.odemeYetkilisi ?? body.canReceivePaymentReminder,
        ),
        canBeModelResponsible: Boolean(
          body.modelSorumlusuOlabilir ?? body.canBeModelResponsible,
        ),
        note: text(body.not || body.note),
      },
    };
    const id = text(body.id);
    const saved = id
      ? await this.prisma.emailContact.update({ where: { id }, data: payload })
      : await this.prisma.emailContact.create({ data: payload });
    return { ok: true, data: saved };
  }

  async passiveFirmaContact(
    mainCompanySlug: string,
    companyId: string,
    contactId: string,
  ) {
    const slug = this.slug({ mainCompanySlug });
    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, mainCompanySlug: slug, companyId },
    });
    if (!contact) throw new NotFoundException("Kişi bulunamadı.");
    return this.prisma.emailContact.update({
      where: { id: contact.id },
      data: { active: false, deletedAt: new Date() },
    });
  }

  async saveFirmaKarti(body: Query = {}) {
    const slug = this.slug(body);
    const name = text(body.firmaAdi || body.name || body.firma);
    if (!name) throw new BadRequestException("Firma adı zorunludur.");
    const normalizedName = name
      .toLocaleLowerCase("tr-TR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const company = await this.prisma.company.upsert({
      where: {
        mainCompanySlug_normalizedName: {
          mainCompanySlug: slug,
          normalizedName,
        },
      },
      create: {
        mainCompanySlug: slug,
        name,
        normalizedName,
        type: text(body.firmaTipi || body.type || "MUSTERI"),
        defaultRecordType: text(body.resmiGayri || "RESMI"),
        defaultVatRate: money(body.varsayilanKdv || body.defaultVatRate || 0),
        note: text(body.cariNotu || body.note) || null,
        raw: {
          departman: text(body.departman),
          modelSorumlusuOlabilir: Boolean(body.modelSorumlusuOlabilir),
        },
      },
      update: {
        name,
        type: text(body.firmaTipi || body.type || "MUSTERI"),
        defaultRecordType: text(body.resmiGayri || "RESMI"),
        defaultVatRate: money(body.varsayilanKdv || body.defaultVatRate || 0),
        note: text(body.cariNotu || body.note) || null,
        raw: {
          departman: text(body.departman),
          modelSorumlusuOlabilir: Boolean(body.modelSorumlusuOlabilir),
        },
      },
    });
    return { ok: true, data: company };
  }

  async yonetimOzeti(query: Query = {}) {
    const slug = this.slug(query);
    const [documents, cari, kdv, cekOdeme, mail] = await Promise.all([
      this.belgeHavuzu({ mainCompanySlug: slug }),
      this.cariList({ mainCompanySlug: slug }),
      this.kdvKontrol({ mainCompanySlug: slug }),
      this.cekOdeme({ mainCompanySlug: slug }),
      this.mailEkstre({ mainCompanySlug: slug }),
    ]);
    const monthStart = startOfMonth();
    const monthEnd = endOfMonth();
    const monthDocs = documents.filter((doc: any) => {
      const date = doc.tarih ? new Date(doc.tarih) : null;
      return date && date >= monthStart && date <= monthEnd;
    });
    const buAySatis = monthDocs
      .filter((doc: any) => normalizeType(doc.belgeTuru) === "SATIS")
      .reduce((sum: number, doc: any) => sum + number(doc.tutar), 0);
    const buAyAlisGider = monthDocs
      .filter((doc: any) => normalizeType(doc.belgeTuru) !== "SATIS")
      .reduce((sum: number, doc: any) => sum + number(doc.tutar), 0);
    const cekOzet = buildCheckDashboard(cekOdeme.liste);
    const gunlukIsListesi = [
      ...documents.slice(0, 10).map((doc: any) => ({
        oncelik: doc.durum === "islendi" ? "Normal" : "Yüksek",
        is: "Belge kontrolü",
        firma: doc.firma,
        model: doc.modelName,
        belge: doc.belgeNo,
        tutar: doc.tutar,
        durum: doc.durum,
        hedef: "belge-kontrol",
      })),
      ...mail.liste
        .filter((row: any) => row.status === "alici_eksik")
        .slice(0, 5)
        .map((row: any) => ({
          oncelik: "Yüksek",
          is: "Mail kişi/departman yetkisi eksik",
          firma: row.firma,
          model: row.model,
          belge: row.faturaNo,
          tutar: row.tutar,
          durum: "Alıcı eksik",
          hedef: "firma-kartlari",
        })),
    ].filter((row, index, rows) =>
      index === rows.findIndex((candidate) =>
        [candidate.is, candidate.firma, candidate.belge, candidate.hedef]
          .map((value) => text(value))
          .join("|") ===
        [row.is, row.firma, row.belge, row.hedef]
          .map((value) => text(value))
          .join("|"),
      ),
    );
    return {
      onayBekleyenBelge: documents.filter(
        (doc: any) =>
          !["islendi", "processed"].includes(
            text(doc.durum).toLocaleLowerCase("tr-TR"),
          ),
      ).length,
      mailBekleyenFatura: mail.gonderilecek,
      departmanYetkilisiEksik: mail.aliciEksik,
      ekstreyeGirmeyen: mail.liste.filter((row: any) =>
        /yok|girmeyen/i.test(row.ekstreKarsilastirma),
      ).length,
      buAySatis,
      buAyAlisGider,
      gelenKdv: kdv.gelenKdv,
      gidenKdv: kdv.gidenKdv,
      devredenKdv: kdv.devredenKdv,
      netKdv: kdv.netKdv,
      tahsilatBekleyen: cari
        .filter((row: any) => row.bakiye > 0)
        .reduce((sum: number, row: any) => sum + row.bakiye, 0),
      odemeBekleyen: cari
        .filter((row: any) => row.bakiye < 0)
        .reduce((sum: number, row: any) => sum + Math.abs(row.bakiye), 0),
      gunlukIsListesi,
      yaklasanOdemeler: cekOzet.yaklasanListe,
      cekOzet,
      mailDepartmanYetkiKontrol: {
        gonderilecek: mail.gonderilecek,
        gonderildi: mail.gonderildi,
        aliciEksik: mail.aliciEksik,
        ekstedeVar: mail.ekstedeVar,
      },
    };
  }

  async raporlar(query: Query = {}) {
    void query;
    return [
      "haftalik-yonetim-ozeti",
      "aylik-yonetim-ozeti",
      "cari-ekstre",
      "kdv-raporu",
      "cek-listesi",
      "mail-departman-yetki-eksik-raporu",
      "ekstreye-girmeyen-faturalar",
      "cek-vade-raporu",
      "mail-takip-raporu",
    ];
  }

  async rapor(query: Query = {}, tip: string) {
    const slug = this.slug(query);
    const normalized = text(tip);
    if (normalized === "cek-listesi" || normalized === "cek-vade-raporu") {
      const cekOdeme = await this.cekOdeme({ mainCompanySlug: slug });
      const checkRows = cekOdeme.liste
        .filter((row: any) => row.source === "check")
        .sort((left: any, right: any) =>
          text(left.vadeTarihi).localeCompare(text(right.vadeTarihi), "tr"),
        );
      const summary = buildCheckDashboard(checkRows);
      return {
        reportType: normalized,
        summary,
        monthly: summary.aylikDagilim,
        rows:
          normalized === "cek-vade-raporu"
            ? [...summary.vadesiGecmisListe, ...summary.yaklasanListe]
            : checkRows,
      };
    }
    if (normalized.includes("kdv"))
      return this.kdvKontrol({ mainCompanySlug: slug });
    if (normalized.includes("cek"))
      return this.cekOdeme({ mainCompanySlug: slug });
    if (normalized.includes("cari"))
      return this.cariList({ mainCompanySlug: slug });
    if (normalized.includes("mail") || normalized.includes("ekstre"))
      return this.mailEkstre({ mainCompanySlug: slug });
    return this.yonetimOzeti({ mainCompanySlug: slug });
  }

  async printableReport(query: Query = {}, tip: string) {
    const data = await this.rapor(query, tip);
    if (
      data &&
      typeof data === "object" &&
      Array.isArray((data as any).rows) &&
      (text(tip) === "cek-listesi" || text(tip) === "cek-vade-raporu")
    ) {
      const summary = (data as any).summary || {};
      const monthly = Array.isArray((data as any).monthly)
        ? (data as any).monthly
        : [];
      const rows = Array.isArray((data as any).rows) ? (data as any).rows : [];
      return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(tip)}</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#102a43}
h1,h2{margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}
.box{border:1px solid #d9e2ec;border-radius:10px;padding:12px;background:#f8fbff}
.box span{display:block;font-size:12px;color:#52667a;margin-bottom:6px}.box strong{font-size:20px}
table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #d9e2ec;padding:8px 10px;text-align:left;font-size:12px}th{background:#f2f6fb}
</style></head><body>
<h1>${escapeHtml(tip === "cek-listesi" ? "Çek Listesi" : "Çek Vade Raporu")}</h1>
<div class="grid">
<div class="box"><span>Açık Çek</span><strong>${escapeHtml(String(summary.acikCekSayisi || 0))}</strong></div>
<div class="box"><span>Toplam Tutar</span><strong>${escapeHtml(formatCurrencyTr(summary.toplamAcikCekTutari))}</strong></div>
<div class="box"><span>Yaklaşan</span><strong>${escapeHtml(String(summary.yaklasanCekSayisi || 0))} / ${escapeHtml(formatCurrencyTr(summary.yaklasanCekTutari))}</strong></div>
<div class="box"><span>Vadesi Geçmiş</span><strong>${escapeHtml(String(summary.vadesiGecmisCekSayisi || 0))} / ${escapeHtml(formatCurrencyTr(summary.vadesiGecmisCekTutari))}</strong></div>
</div>
<h2>Aylık Dağılım</h2>
<table><thead><tr><th>Ay</th><th>Çek Sayısı</th><th>Toplam</th></tr></thead><tbody>
${monthly.length ? monthly.map((row: any) => `<tr><td>${escapeHtml(row.ay)}</td><td>${escapeHtml(String(row.count || 0))}</td><td>${escapeHtml(formatCurrencyTr(row.total))}</td></tr>`).join("") : '<tr><td colspan="3">Kayıt yok.</td></tr>'}
</tbody></table>
<h2>Detay</h2>
<table><thead><tr><th>Vade</th><th>Firma</th><th>Çek No</th><th>Banka</th><th>Tutar</th><th>Durum</th><th>Grup</th></tr></thead><tbody>
${rows.length ? rows.map((row: any) => `<tr><td>${escapeHtml(formatDateTr(row.vadeTarihi))}</td><td>${escapeHtml(row.firma || "-")}</td><td>${escapeHtml(row.cekNo || "-")}</td><td>${escapeHtml(row.banka || "-")}</td><td>${escapeHtml(formatCurrencyTr(row.tutar))}</td><td>${escapeHtml(row.durum || "-")}</td><td>${escapeHtml(row.vadeGrubu || "-")}</td></tr>`).join("") : '<tr><td colspan="7">Kayıt yok.</td></tr>'}
</tbody></table>
</body></html>`;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>${tip}</title></head><body><h1>${tip}</h1><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
  }
}
