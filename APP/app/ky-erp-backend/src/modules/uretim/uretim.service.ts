import { BadRequestException, Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ModelTakipStore,
  type ModelTakipSummaryRow,
} from "../model-takip/model-takip.shared";
import { ModelService } from "../models/model.service";

type OwnedRow = {
  mainCompanyId?: string;
  mainCompanySlug?: string;
  mainCompanyName?: string;
};

type MakinaRow = OwnedRow & {
  id: string;
  ad: string;
  renkKapasitesi: number;
  durum: string;
  vardiya: string;
  operator: string;
  dayOperator?: string;
  nightOperator?: string;
  sortOrder?: number;
};

type ModelKaydiRow = OwnedRow & {
  id: string;
  modelAdi: string;
  musteriIrsaliyeNo: string;
  firma: string;
  zemin: string;
  gelenAdet: number;
  not?: string;
  desenGorseli?: string;
  yerlesimGorseli?: string;
  kesimhaneBilgisi?: string;
  kesimYeri?: string;
  kesimSorumlusu?: string;
  kesimNotu?: string;
  aktif: boolean;
  durum: string;
  kaynak: string;
  createdAt: string;
  updatedAt: string;
};

type UretimRow = OwnedRow & {
  id: number | string;
  tarih: string;
  firma: string;
  firmaId?: string;
  makina: string;
  makinaId?: string;
  vardiya: string;
  modelId?: string;
  modelKaydiId: string;
  modelAdi: string;
  musteriIrsaliyeNo: string;
  zemin: string;
  grup: string;
  uretimAdedi: number;
  fireAdedi?: number;
  netAdet?: number;
  hataliAdet: number;
  baskiHatasiAdet?: number;
  kumasHatasiAdet?: number;
  sorumluPersonel?: string;
  yardimciPersonel?: string;
  not: string;
  aciklama?: string;
  durum?: string;
};

type ImalatMachineRow = OwnedRow & {
  id: string;
  makineNo: string;
  makineAdi: string;
  gunduzMakinaci: string;
  geceMakinaci: string;
  durum: string;
  isActive: boolean;
  sortOrder: number;
};

type KaliteRow = OwnedRow & {
  id: number;
  tarih: string;
  modelKaydiId?: string;
  model: string;
  makina: string;
  seviye: string;
  aciklama: string;
};

type ModelKaydiOzetRow = ModelTakipSummaryRow & {
  toplamUretim: number;
  toplamFatura: number;
  makinaBaslayanSayi: number;
  makinaBasladiMetni: string;
  sonUretimTarihi: string;
  firma: string;
};

type UretimBootstrap = {
  makinalar: MakinaRow[];
  kaliteKayitlari: KaliteRow[];
  uretimKayitlari: UretimRow[];
  modelKayitlari: ModelKaydiOzetRow[];
};

@Injectable()
export class UretimService {
  private readonly modelStore: ModelTakipStore;

  constructor(
    private readonly db: SqlStoreService,
    private readonly modelService: ModelService,
    private readonly prisma: PrismaService,
  ) {
    this.modelStore = new ModelTakipStore(db);
  }

  private readonly mcFiles = {
    makinalar: "uretim.makinalar",
    kayitlar: "uretim.kayitlar",
    kalite: "uretim.kalite",
    modelTakip: "model-takip",
    muhasebeDocuments: "documents",
  } as const;

  private readonly standardPrintRegions = [
    { code: "FRONT", name: "Ön" },
    { code: "BACK", name: "Arka" },
    { code: "NECK", name: "Ense" },
    { code: "NECK_LABEL", name: "Ense Etiket" },
    { code: "COLLAR", name: "Yaka" },
    { code: "SEWN_FRONT", name: "Dikili Ön" },
    { code: "FRONT_HEM", name: "Ön Etek" },
    { code: "BACK_HEM", name: "Arka Etek" },
    { code: "LEFT_SLEEVE", name: "Sol Kol" },
    { code: "RIGHT_SLEEVE", name: "Sağ Kol" },
    { code: "LEFT_LEG", name: "Sol Paça" },
    { code: "RIGHT_LEG", name: "Sağ Paça" },
    { code: "POCKET", name: "Cep" },
    { code: "HOOD", name: "Kapüşon" },
    { code: "STRIPE", name: "Şerit" },
    { code: "SIDE_PANEL", name: "Yan Panel" },
    { code: "CUSTOM", name: "Özel Bölge" },
  ];

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeKey(value: any) {
    return this.cleanText(value).toLocaleUpperCase("tr-TR");
  }

  private normalizeSeriModelKey(value: any) {
    return this.cleanText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/Ğ/g, "G")
      .replace(/Ü/g, "U")
      .replace(/Ş/g, "S")
      .replace(/İ/g, "I")
      .replace(/İ/g, "I")
      .replace(/Ö/g, "O")
      .replace(/Ç/g, "C")
      .replace(/[^A-Z0-9]/g, "");
  }

  private sameSeriModel(left: any, right: any) {
    const a = this.normalizeSeriModelKey(left);
    const b = this.normalizeSeriModelKey(right);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  private parseNumber(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = this.cleanText(value).replace(/[^\d,.-]/g, "");
    if (!raw) return 0;
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const dotCount = (raw.match(/\./g) || []).length;
    let normalized = raw;
    if (lastComma >= 0 && lastDot >= 0) {
      const decimalIndex = Math.max(lastComma, lastDot);
      normalized = `${raw.slice(0, decimalIndex).replace(/[,.]/g, "")}.${raw
        .slice(decimalIndex + 1)
        .replace(/[,.]/g, "")}`;
    } else if (lastComma >= 0) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else if (lastDot >= 0) {
      const after = raw.slice(lastDot + 1);
      normalized =
        dotCount === 1 && after.length === 3 ? raw.replace(/\./g, "") : raw;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private slugify(value: any) {
    return this.cleanText(value)
      .toLocaleLowerCase("tr-TR")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  private imageExtensionFromMime(mimeType: string) {
    const mime = this.cleanText(mimeType).toLocaleLowerCase("tr-TR");
    if (mime.includes("png")) return ".png";
    if (mime.includes("webp")) return ".webp";
    if (mime.includes("gif")) return ".gif";
    return ".jpg";
  }

  private weekOfMonth(date: Date) {
    const day = Number(date.getDate()) || 1;
    return Math.max(1, Math.ceil(day / 7));
  }

  private buildModelKey(modelAdi: string, irsaliyeNo: string, firma: string) {
    return [
      this.normalizeKey(modelAdi),
      this.normalizeKey(irsaliyeNo),
      this.normalizeKey(firma),
    ].join("|");
  }

  private buildProductionTrackingKey(
    modelAdi: string,
    tarih: string,
    siparisNo: string,
    baskiBolgesi: string,
  ) {
    return [
      this.normalizeKey(modelAdi),
      this.normalizeKey(tarih),
      this.normalizeKey(siparisNo),
      this.normalizeKey(baskiBolgesi),
    ].join("|");
  }

  private requireMainCompany(mainCompanySlug?: string, mainCompanyId?: string) {
    try {
      return this.db.requireMainCompany(mainCompanyId, mainCompanySlug);
    } catch {
      throw new BadRequestException(
        "mainCompanyId veya mainCompanySlug zorunludur.",
      );
    }
  }

  private makinaSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): MakinaRow[] {
    return [];
  }

  private uretimSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): UretimRow[] {
    return [];
  }

  private kaliteSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): KaliteRow[] {
    return [];
  }

  private modelSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): ModelKaydiRow[] {
    return [];
  }

  private getMakinaRows(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<MakinaRow[]>(
      mainCompanySlug,
      this.mcFiles.makinalar,
      [],
    );
  }

  private saveMakinaRows(mainCompanySlug: string, rows: MakinaRow[]) {
    return this.db.writeMainCompanyStore(
      mainCompanySlug,
      this.mcFiles.makinalar,
      rows,
    );
  }

  private getUretimRows(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<UretimRow[]>(
      mainCompanySlug,
      this.mcFiles.kayitlar,
      [],
    );
  }

  private saveUretimRows(mainCompanySlug: string, rows: UretimRow[]) {
    return this.db.writeMainCompanyStore(
      mainCompanySlug,
      this.mcFiles.kayitlar,
      rows,
    );
  }

  private mapSqlProduction(row: any): UretimRow {
    const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
    const productionDate = row?.productionDate
      ? new Date(row.productionDate)
      : raw.tarih
        ? new Date(raw.tarih)
        : new Date();
    const tarih = Number.isNaN(productionDate.getTime())
      ? this.today()
      : productionDate.toISOString().slice(0, 10);
    return {
      id: row.id,
      tarih,
      firma: this.cleanText(raw.firma || raw.firmaAdi || ""),
      firmaId: this.cleanText(raw.firmaId || ""),
      makina: this.cleanText(row.machineName || raw.makina || raw.makinaAdi),
      makinaId: this.cleanText(raw.makinaId || ""),
      vardiya: this.cleanText(row.shift || raw.vardiya || "Gündüz"),
      modelId: this.cleanText(row.modelId || raw.modelId),
      modelKaydiId: this.cleanText(row.modelId || raw.modelKaydiId),
      modelAdi: this.cleanText(row.modelName || raw.modelAdi),
      musteriIrsaliyeNo: this.cleanText(row.orderNo || raw.musteriIrsaliyeNo),
      zemin: this.cleanText(row.groundColor || raw.zemin),
      grup: this.cleanText(raw.grup || ""),
      uretimAdedi: this.parseNumber(row.totalQuantity || raw.uretimAdedi),
      fireAdedi: this.parseNumber(raw.fireAdedi ?? raw.hataliAdet),
      netAdet: this.parseNumber(raw.netAdet || row.totalQuantity),
      hataliAdet: this.parseNumber(raw.hataliAdet),
      baskiHatasiAdet: this.parseNumber(
        raw.baskiHatasiAdet ?? raw.printDefectQty ?? row.printDefect,
      ),
      kumasHatasiAdet: this.parseNumber(
        raw.kumasHatasiAdet ?? raw.fabricDefectQty ?? row.fabricDefect,
      ),
      sorumluPersonel: this.cleanText(row.machinist || raw.sorumluPersonel),
      yardimciPersonel: this.cleanText(row.assistant || raw.yardimciPersonel),
      not: this.cleanText(row.note || raw.not || raw.aciklama),
      aciklama: this.cleanText(row.note || raw.aciklama || raw.not),
      durum: this.cleanText(raw.durum || "Kaydedildi"),
      mainCompanySlug: row.mainCompanySlug,
      mainCompanyName: this.cleanText(raw.mainCompanyName),
      mainCompanyId: this.cleanText(raw.mainCompanyId),
    };
  }

  private async getSqlUretimRows(mainCompanySlug: string) {
    const rows = await (this.prisma as any).productionRecord.findMany({
      where: { mainCompanySlug },
      orderBy: [{ productionDate: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row: any) => this.mapSqlProduction(row));
  }

  private enrichUretimWithModels(rows: UretimRow[], models: any[]) {
    const byId = new Map(models.map((model) => [String(model.id), model]));
    const byKey = new Map(
      models.map((model) => [
        this.buildModelKey(
          model.modelAdi || model.modelName || "",
          model.musteriIrsaliyeNo || model.siparisNo || "",
          model.firma || model.firmaAdi || model.musteriFirma || "",
        ),
        model,
      ]),
    );
    return rows.map((row) => {
      const model =
        byId.get(String(row.modelKaydiId || row.modelId || "")) ||
        byKey.get(
          this.buildModelKey(row.modelAdi, row.musteriIrsaliyeNo, row.firma),
        );
      if (!model) return row;
      const linkedVisual =
        this.cleanText(model.linkedVisualModelName) ||
        this.cleanText((model as any).raw?.linkedVisualModelName);
      const imageValue =
        this.cleanText(
          model.desenImageThumb || model.imageUrl || model.thumbnail,
        ) ||
        this.cleanText(
          (model as any).raw?.desenImageThumb || (model as any).raw?.imageUrl,
        );
      return {
        ...row,
        modelAdi: linkedVisual || row.modelAdi,
        productionModelName:
          this.cleanText(model.productionModelName) ||
          this.cleanText((model as any).raw?.productionModelName) ||
          row.modelAdi,
        linkedVisualModelName: linkedVisual || row.modelAdi,
        desenImageThumb: imageValue,
        firma:
          row.firma ||
          model.firma ||
          model.firmaAdi ||
          model.musteriFirma ||
          "",
        firmaId: row.firmaId || model.firmaId || "",
        gelenAdet: this.parseNumber(model.gelenAdet || model.givenQty || 0),
      } as any;
    });
  }

  private getKaliteRows(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<KaliteRow[]>(
      mainCompanySlug,
      this.mcFiles.kalite,
      [],
    );
  }

  private saveKaliteRows(mainCompanySlug: string, rows: KaliteRow[]) {
    return this.db.writeMainCompanyStore(
      mainCompanySlug,
      this.mcFiles.kalite,
      rows,
    );
  }

  private getManualModelRows(mainCompanySlug: string) {
    return [];
  }

  private saveModelRows(mainCompanySlug: string, rows: ModelKaydiRow[]) {
    return this.db.writeMainCompanyStore(
      mainCompanySlug,
      this.mcFiles.modelTakip,
      rows,
    );
  }

  private getMuhasebeDocuments(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<any[]>(
      mainCompanySlug,
      this.mcFiles.muhasebeDocuments,
      [],
    );
  }

  private saveMuhasebeDocuments(mainCompanySlug: string, rows: any[]) {
    return this.db.writeMainCompanyStore(
      mainCompanySlug,
      this.mcFiles.muhasebeDocuments,
      rows,
    );
  }

  private async archiveWaitingPlanLinesForDeletedModel(
    mainCompanySlug: string,
    modelId: string,
  ) {
    const cleanModelId = this.cleanText(modelId);
    if (!cleanModelId) return { archivedPlanLineCount: 0 };

    const passiveStatuses = [
      "DELETED",
      "ARCHIVED",
      "CANCELLED",
      "PASSIVE",
      "SOFT_DELETED",
    ];
    const planLines = await (this.prisma as any).productionPlanLine
      .findMany({
        where: {
          mainCompanySlug,
          modelId: cleanModelId,
          NOT: { status: { in: passiveStatuses } },
        },
        select: { id: true, producedQty: true },
      })
      .catch(() => []);
    if (!planLines.length) return { archivedPlanLineCount: 0 };

    const planLineIds = planLines
      .map((line: any) => this.cleanText(line.id))
      .filter(Boolean);
    const entryCount = planLineIds.length
      ? await (this.prisma as any).productionEntry
          .count({ where: { planLineId: { in: planLineIds } } })
          .catch(() => 0)
      : 0;
    const producedQty = planLines.reduce(
      (sum: number, line: any) => sum + this.parseNumber(line.producedQty),
      0,
    );
    if (entryCount > 0 || producedQty > 0) {
      throw new BadRequestException(
        "Bagli uretim girisi olan imalat havuzu kaydi silinemez. Once bagli uretim girislerini silin.",
      );
    }

    const result = await (this.prisma as any).productionPlanLine.updateMany({
      where: { id: { in: planLineIds } },
      data: { status: "DELETED" },
    });
    return { archivedPlanLineCount: Number(result?.count || 0) };
  }

  private getCompanyCards(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<any[]>(
      mainCompanySlug,
      "companies",
      [],
    );
  }

  private requireActiveCompanyCard(mainCompanySlug: string, companyName: any) {
    const normalizedName = this.normalizeKey(companyName);
    if (!normalizedName) {
      throw new BadRequestException("Müşteri firma zorunludur.");
    }
    const card =
      this.getCompanyCards(mainCompanySlug).find(
        (item) =>
          item &&
          item.hiddenFromMainList !== true &&
          item.isAliasMerged !== true &&
          item.aktif !== false &&
          this.normalizeKey(item.firma) === normalizedName,
      ) || null;
    if (!card) {
      throw new BadRequestException(
        "Müşteri firma aktif firma kartlarından seçilmelidir.",
      );
    }
    return card;
  }

  private sumDocumentQty(document: any) {
    const header = document?.header || {};
    const itemSum = Array.isArray(document?.items)
      ? document.items.reduce((sum: number, item: any) => {
          const qty = this.parseNumber(
            item?.miktar ?? item?.quantity ?? item?.adet ?? item?.kg,
          );
          return sum + qty;
        }, 0)
      : 0;
    return (
      this.parseNumber(header?.belgeAdediToplami) ||
      this.parseNumber(header?.irsaliyeAdedi) ||
      this.parseNumber(header?.faturalananAdet) ||
      itemSum
    );
  }

  private extractAutoModelRows(mainCompanySlug: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const documents = this.getMuhasebeDocuments(company.slug);
    const rows: ModelKaydiRow[] = [];

    for (const document of documents) {
      const workflow = this.normalizeKey(
        document?.header?.flowType || document?.workflowType,
      );
      if (!["GIDEN_IRSALIYE", "BIZIM_IRSALIYE"].includes(workflow)) continue;

      const header = document?.header || {};
      const modelAdi = this.cleanText(
        header?.modelAdi ||
          document?.modelAdi ||
          document?.items?.find?.((item: any) =>
            this.cleanText(item?.modelAdayi),
          )?.modelAdayi ||
          "",
      );
      const musteriIrsaliyeNo = this.cleanText(
        header?.irsaliyeNo ||
          header?.dispatchNo ||
          header?.documentNo ||
          document?.documentId,
      );
      const firma = this.cleanText(
        document?.relatedCompanyName ||
          document?.firma ||
          header?.cariFirma ||
          header?.companyName,
      );

      if (!modelAdi || !musteriIrsaliyeNo || !firma) continue;

      rows.push({
        id: `auto-${this.buildModelKey(modelAdi, musteriIrsaliyeNo, firma)}`,
        modelAdi,
        musteriIrsaliyeNo,
        firma,
        zemin: this.cleanText(header?.zemin || ""),
        gelenAdet: this.sumDocumentQty(document),
        aktif: true,
        durum: "İşlem Bekliyor",
        kaynak: "Muhasebe İrsaliye",
        createdAt: this.cleanText(document?.createdAt) || this.nowIso(),
        updatedAt: this.cleanText(document?.updatedAt) || this.nowIso(),
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        mainCompanyName: company.name,
      });
    }

    return rows;
  }

  private getMergedModelRows(mainCompanySlug: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const manualRows = this.getManualModelRows(company.slug);
    const autoRows = this.extractAutoModelRows(company.slug);
    const map = new Map<string, ModelKaydiRow>();

    for (const row of autoRows) {
      map.set(
        this.buildModelKey(row.modelAdi, row.musteriIrsaliyeNo, row.firma),
        row,
      );
    }

    for (const row of manualRows) {
      const key = this.buildModelKey(
        row.modelAdi,
        row.musteriIrsaliyeNo,
        row.firma,
      );
      const base = map.get(key);
      map.set(key, {
        ...base,
        ...row,
        id: row.id || base?.id || `mdl-${Date.now()}`,
        modelAdi: this.cleanText(row.modelAdi || base?.modelAdi),
        musteriIrsaliyeNo: this.cleanText(
          row.musteriIrsaliyeNo || base?.musteriIrsaliyeNo,
        ),
        firma: this.cleanText(row.firma || base?.firma),
        zemin: this.cleanText(row.zemin || base?.zemin),
        gelenAdet: this.parseNumber(row.gelenAdet || base?.gelenAdet),
        aktif: row.aktif !== false,
        durum: this.cleanText(row.durum || base?.durum || "İşlem Bekliyor"),
        kaynak: this.cleanText(row.kaynak || base?.kaynak || "Model Takip"),
        createdAt:
          this.cleanText(row.createdAt || base?.createdAt) || this.nowIso(),
        updatedAt:
          this.cleanText(row.updatedAt || base?.updatedAt) || this.nowIso(),
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        mainCompanyName: company.name,
      });
    }

    return Array.from(map.values());
  }

  private getFaturaToplami(
    mainCompanySlug: string,
    modelKaydi: Pick<ModelKaydiRow, "musteriIrsaliyeNo" | "modelAdi">,
  ) {
    const documents = this.getMuhasebeDocuments(mainCompanySlug);
    return documents.reduce((sum: number, document: any) => {
      const workflow = this.normalizeKey(
        document?.header?.flowType || document?.workflowType,
      );
      if (!["GIDEN_FATURA"].includes(workflow)) return sum;
      const header = document?.header || {};
      const sameIrsaliye =
        this.normalizeKey(
          header?.irsaliyeNo ||
            header?.bagliIrsaliyeNo ||
            header?.dispatchNo ||
            header?.dispatchReferences?.[0] ||
            "",
        ) === this.normalizeKey(modelKaydi.musteriIrsaliyeNo);
      const sameModel =
        !this.cleanText(header?.modelAdi) ||
        this.normalizeKey(header?.modelAdi) ===
          this.normalizeKey(modelKaydi.modelAdi);
      if (!sameIrsaliye || !sameModel) return sum;
      return sum + this.sumDocumentQty(document);
    }, 0);
  }

  private async buildModelOzetleri(mainCompanySlug: string) {
    const summaryResult = await this.modelService.list({
      mainCompanySlug,
      pageSize: 5000,
      limit: 5000,
    });
    const summaries = Array.isArray(summaryResult)
      ? summaryResult
      : summaryResult.rows || [];
    const uretimRows = await this.getSqlUretimRows(mainCompanySlug);
    return summaries.map((row: any) => {
      const relatedUretim = uretimRows.filter(
        (item) => item.modelKaydiId === row.id || item.modelId === row.id,
      );
      const toplamUretim = relatedUretim.reduce(
        (sum, item) => sum + this.parseNumber(item.netAdet || item.uretimAdedi),
        0,
      );
      return {
        ...row,
        id: row.id,
        modelAdi: row.linkedVisualModelName || row.modelAdi || row.modelName,
        productionModelName:
          row.productionModelName || row.modelAdi || row.modelName,
        linkedVisualModelName: row.linkedVisualModelName || "",
        musteriIrsaliyeNo: row.musteriIrsaliyeNo || row.siparisNo || "",
        zemin: row.zemin || row.zeminRenk || "",
        gelenAdet: this.parseNumber(row.gelenAdet || row.givenQty || 0),
        aktif: row.aktif !== false,
        durum: row.durum || row.status || "Aktif",
        toplamUretim,
        toplamFatura: Number(row.kesilenFaturaAdedi || row.invoicedQty || 0),
        makinaBaslayanSayi: new Set(
          relatedUretim.map((item) => item.makina).filter(Boolean),
        ).size,
        makinaBasladiMetni: relatedUretim.length
          ? "Üretim başladı"
          : "makina başlamadı",
        sonUretimTarihi: relatedUretim[0]?.tarih || "",
        firma: row.firmaAdi || row.musteriFirma || row.firma || "",
        firmaId: row.firmaId || "",
      };
    }).sort((a: any, b: any) => {
      const dateOf = (item: any) => {
        const raw =
          item?.createdAt ||
          item?.created_at ||
          item?.updatedAt ||
          item?.updated_at ||
          item?.tarih ||
          "";
        const time = raw ? new Date(raw).getTime() : 0;
        return Number.isFinite(time) ? time : 0;
      };
      const dateDiff = dateOf(b) - dateOf(a);
      if (dateDiff) return dateDiff;
      return String(a?.modelAdi || a?.modelName || "").localeCompare(
        String(b?.modelAdi || b?.modelName || ""),
        "tr",
        { sensitivity: "base" },
      );
    });
  }

  async getBootstrap(mainCompanySlug: string): Promise<UretimBootstrap> {
    const slug = this.requireMainCompany(mainCompanySlug).slug;
    const [uretimKayitlari, modelKayitlari] = await Promise.all([
      this.getSqlUretimRows(slug),
      this.buildModelOzetleri(slug),
    ]);
    return {
      makinalar: this.getMakinaRows(slug),
      kaliteKayitlari: this.getKaliteRows(slug),
      uretimKayitlari,
      modelKayitlari,
    };
  }

  getMakinalar(mainCompanySlug: string) {
    return this.getMakinaRows(this.requireMainCompany(mainCompanySlug).slug);
  }

  saveMakina(payload: Partial<MakinaRow>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const rows = this.getMakinaRows(company.slug);
    const newRow: MakinaRow = {
      id: this.cleanText(payload.id || `MK-${Date.now()}`),
      ad: this.cleanText(payload.ad),
      renkKapasitesi: Number(payload.renkKapasitesi || 0),
      durum: this.cleanText(payload.durum || "Aktif"),
      vardiya: this.cleanText(payload.vardiya || "Gündüz"),
      operator: this.cleanText(payload.operator || ""),
      dayOperator: this.cleanText((payload as any).dayOperator || payload.operator || ""),
      nightOperator: this.cleanText((payload as any).nightOperator || payload.operator || ""),
      sortOrder: Number((payload as any).sortOrder || rows.length + 1),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    if (!newRow.ad) throw new BadRequestException("Makina adı zorunludur.");
    const next = [
      newRow,
      ...rows.filter(
        (item) => this.normalizeKey(item.id) !== this.normalizeKey(newRow.id),
      ),
    ];
    this.saveMakinaRows(company.slug, next);
    return newRow;
  }

  updateMakina(makinaId: string, payload: Partial<MakinaRow>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const rows = this.getMakinaRows(company.slug);
    const index = rows.findIndex(
      (item) => this.normalizeKey(item.id) === this.normalizeKey(makinaId),
    );
    if (index < 0) {
      throw new BadRequestException("Güncellenecek makina bulunamadı.");
    }

    const current = rows[index];
    const nextId = this.cleanText(payload.id || current.id);
    if (!nextId) {
      throw new BadRequestException("Makina kodu zorunludur.");
    }
    const duplicate = rows.some(
      (item, rowIndex) =>
        rowIndex !== index &&
        this.normalizeKey(item.id) === this.normalizeKey(nextId),
    );
    if (duplicate) {
      throw new BadRequestException("Bu makina kodu zaten kullanılıyor.");
    }

    const updated: MakinaRow = {
      ...current,
      id: nextId,
      ad: this.cleanText(payload.ad || current.ad),
      renkKapasitesi: Number(
        payload.renkKapasitesi ?? current.renkKapasitesi ?? 0,
      ),
      durum: this.cleanText(payload.durum || current.durum || "Aktif"),
      vardiya: this.cleanText(payload.vardiya || current.vardiya || "Gündüz"),
      operator: this.cleanText(payload.operator ?? current.operator ?? ""),
      dayOperator: this.cleanText((payload as any).dayOperator ?? current.dayOperator ?? payload.operator ?? current.operator ?? ""),
      nightOperator: this.cleanText((payload as any).nightOperator ?? current.nightOperator ?? payload.operator ?? current.operator ?? ""),
      sortOrder: Number((payload as any).sortOrder ?? current.sortOrder ?? 0),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    if (!updated.ad) {
      throw new BadRequestException("Makina adı zorunludur.");
    }

    const nextRows = [...rows];
    nextRows[index] = updated;
    this.saveMakinaRows(company.slug, nextRows);
    return updated;
  }

  getMakinaDeleteSummary(mainCompanySlug: string, makinaId: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const rows = this.getMakinaRows(company.slug);
    const makina =
      rows.find(
        (item) => this.normalizeKey(item.id) === this.normalizeKey(makinaId),
      ) || null;
    if (!makina) {
      throw new BadRequestException("Silinecek makina bulunamadı.");
    }

    const linkedProductionCount = this.getUretimRows(company.slug).filter(
      (item) => {
        const makinaValue = this.normalizeKey(item.makina);
        return (
          makinaValue === this.normalizeKey(makina.ad) ||
          makinaValue === this.normalizeKey(makina.id)
        );
      },
    ).length;

    return {
      makinaId: makina.id,
      makinaAdi: makina.ad,
      linkedProductionCount,
      canDelete: true,
    };
  }

  deleteMakina(mainCompanySlug: string, makinaId: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const rows = this.getMakinaRows(company.slug);
    const target = rows.find(
      (item) => this.normalizeKey(item.id) === this.normalizeKey(makinaId),
    );
    if (!target) {
      throw new BadRequestException("Silinecek makina bulunamadı.");
    }

    const summary = this.getMakinaDeleteSummary(company.slug, makinaId);
    const nextRows = rows.filter(
      (item) => this.normalizeKey(item.id) !== this.normalizeKey(makinaId),
    );
    this.saveMakinaRows(company.slug, nextRows);

    return {
      deleted: true,
      makinaId: target.id,
      makinaAdi: target.ad,
      linkedProductionCount: summary.linkedProductionCount,
    };
  }

  async getModelKayitlari(
    mainCompanySlug: string,
    options?: { firma?: string; activeOnly?: boolean },
  ) {
    const rows = await this.buildModelOzetleri(
      this.requireMainCompany(mainCompanySlug).slug,
    );
    return rows.filter((row) => {
      if (
        options?.firma &&
        this.normalizeKey(row.firma) !== this.normalizeKey(options.firma)
      ) {
        return false;
      }
      if (options?.activeOnly && row.aktif === false) return false;
      if (
        options?.activeOnly &&
        ["Tamamlandı", "Tamamlandı / Onaylandı"].includes(row.durum)
      ) {
        return false;
      }
      return true;
    });
  }

  async deleteModelKaydi(mainCompanySlug: string, id: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const detail = this.modelStore.getDetail(company.slug, company.id, id);
    if (!detail?.modelKaydi) {
      let sharedModel: any = null;
      try {
        sharedModel = await this.modelService.getById(id, company.slug);
      } catch {
        sharedModel = null;
      }
      if (!sharedModel?.id) {
        throw new BadRequestException("Silinecek model kaydı bulunamadı.");
      }

      const imalatCleanup = await this.archiveWaitingPlanLinesForDeletedModel(
        company.slug,
        id,
      );

      const nextDocuments = this.getMuhasebeDocuments(company.slug).map(
        (doc) => {
          const header = doc?.header || {};
          const sameModelId =
            this.cleanText(doc?.modelKaydiId || header?.modelKaydiId) ===
            this.cleanText(id);
          if (!sameModelId) return doc;
          return {
            ...doc,
            modelKaydiId: "",
            header: {
              ...header,
              modelKaydiId: "",
              modelAdi: "",
              zemin: header?.belgeYonu === "gelen" ? "" : header?.zemin || "",
            },
          };
        },
      );
      this.saveMuhasebeDocuments(company.slug, nextDocuments);

      const archived = await this.modelService.delete(id, {
        mainCompanySlug: company.slug,
      } as any);
      return {
        ok: true,
        archived: true,
        source: "shared-model",
        modelKaydi: archived,
        imalatCleanup,
      };
    }
    if (
      (detail.uretimKayitlari?.length || 0) > 0 ||
      (detail.gidenIrsaliyeler?.length || 0) > 0 ||
      (detail.gidenFaturalar?.length || 0) > 0
    ) {
      throw new BadRequestException(
        "Bağlı üretim veya giden belge olan model kaydı silinemez. Önce bağlı kayıtları çözün.",
      );
    }

    const imalatCleanup = await this.archiveWaitingPlanLinesForDeletedModel(
      company.slug,
      id,
    );

    const nextDocuments = this.getMuhasebeDocuments(company.slug).map((doc) => {
      const header = doc?.header || {};
      const sameModelId =
        this.cleanText(doc?.modelKaydiId || header?.modelKaydiId) ===
        this.cleanText(id);
      const sameIncomingRef =
        this.normalizeKey(header?.modelAdi) ===
          this.normalizeKey(detail.modelKaydi.modelAdi) &&
        this.normalizeKey(header?.irsaliyeNo || header?.dispatchNo || "") ===
          this.normalizeKey(detail.modelKaydi.musteriIrsaliyeNo);

      if (!sameModelId && !sameIncomingRef) return doc;

      return {
        ...doc,
        modelKaydiId: "",
        header: {
          ...header,
          modelKaydiId: "",
          modelAdi: "",
          zemin: header?.belgeYonu === "gelen" ? "" : header?.zemin || "",
        },
      };
    });

    this.saveMuhasebeDocuments(company.slug, nextDocuments);
    return {
      ...this.modelStore.deleteModel(company.slug, company.id, id),
      imalatCleanup,
    };
  }

  saveModelKaydi(payload: Partial<ModelKaydiRow>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const selectedCompany = this.requireActiveCompanyCard(
      company.slug,
      (payload as any).musteriFirma || payload.firma,
    );
    const row = this.modelStore.saveModel(company.slug, company.id, {
      id: this.cleanText(payload.id || ""),
      forceNewModel: Boolean((payload as any).forceNewModel),
      anaFirma: this.cleanText(payload.mainCompanyName || ""),
      musteriFirma: this.cleanText(
        selectedCompany.firma || (payload as any).musteriFirma || payload.firma,
      ),
      modelAdi: this.cleanText(payload.modelAdi),
      musteriIrsaliyeNo: this.cleanText(payload.musteriIrsaliyeNo),
      musteriIrsaliyeleri: Array.isArray((payload as any).musteriIrsaliyeleri)
        ? (payload as any).musteriIrsaliyeleri
        : [],
      zemin: this.cleanText(payload.zemin || ""),
      gelenAdet: this.parseNumber(payload.gelenAdet),
      not: this.cleanText(payload.not || ""),
      desenGorseli: this.cleanText((payload as any).desenGorseli || ""),
      yerlesimGorseli: this.cleanText((payload as any).yerlesimGorseli || ""),
      kesimhaneBilgisi: this.cleanText((payload as any).kesimhaneBilgisi || ""),
      kesimYeri: this.cleanText((payload as any).kesimYeri || ""),
      kesimSorumlusu: this.cleanText((payload as any).kesimSorumlusu || ""),
      kesimNotu: this.cleanText((payload as any).kesimNotu || ""),
      durum: this.cleanText(payload.durum || "İşlem Bekliyor"),
      aktif: payload.aktif !== false,
      kaynak: this.cleanText(payload.kaynak || "Model Takip"),
    });
    return row;
  }

  getModelKaydiDetay(mainCompanySlug: string, id: string) {
    return this.modelStore.getDetail(
      this.requireMainCompany(mainCompanySlug).slug,
      undefined,
      id,
    );
  }

  async saveModelImages(
    mainCompanySlug: string,
    modelKaydiId: string,
    files: Array<{
      originalname: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }>,
  ) {
    const company = this.requireMainCompany(mainCompanySlug);
    const modelId = this.cleanText(modelKaydiId);
    if (!modelId) {
      throw new BadRequestException("Model kaydı zorunludur.");
    }
    try {
      await this.modelService.getById(modelId, company.slug);
    } catch {
      throw new BadRequestException("Model kaydı bulunamadı.");
    }

    const safeFiles = Array.isArray(files) ? files : [];
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const week = `w${this.weekOfMonth(now)}`;
    const storageRoot = path.join(process.cwd(), "storage");
    const archiveDir = path.join(
      storageRoot,
      "uploads",
      "model-images",
      company.slug,
      year,
      month,
      week,
      modelId,
    );
    fs.mkdirSync(archiveDir, { recursive: true });

    const images = safeFiles
      .filter(
        (file) =>
          file?.buffer &&
          file.size > 0 &&
          this.cleanText(file.mimetype)
            .toLocaleLowerCase("tr-TR")
            .startsWith("image/"),
      )
      .slice(0, 6)
      .map((file, index) => {
        const mimeType = this.cleanText(file.mimetype) || "image/jpeg";
        const parsed = path.parse(this.cleanText(file.originalname));
        const originalBase = this.slugify(parsed.name || `model-${index + 1}`);
        const ext =
          parsed.ext && /^\.[a-z0-9]+$/i.test(parsed.ext)
            ? parsed.ext.toLocaleLowerCase("tr-TR")
            : this.imageExtensionFromMime(mimeType);
        const fileName = `${Date.now()}-${index}-${originalBase || "model"}${ext}`;
        const fullPath = path.join(archiveDir, fileName);
        fs.writeFileSync(fullPath, file.buffer);

        const relativeToStorage = path
          .relative(storageRoot, fullPath)
          .replace(/\\/g, "/");
        const url = `/storage/${relativeToStorage}`;

        return {
          id: `${modelId}-${Date.now()}-${index}`,
          name: this.cleanText(file.originalname) || `model-${index + 1}`,
          mimeType,
          size: Number(file.size || 0),
          uploadedAt: this.nowIso(),
          path: relativeToStorage,
          url,
        };
      });

    if (images.length) {
      await this.modelService.saveImages(company.slug, modelId, images);
    }

    return {
      ok: true,
      modelKaydiId: modelId,
      images,
    };
  }

  getUretimKayitlari(mainCompanySlug: string) {
    return this.getUretimRows(
      this.requireMainCompany(mainCompanySlug).slug,
    ).sort((a, b) => Number(b.id) - Number(a.id));
  }

  async getUretimKayitlariLive(mainCompanySlug: string) {
    const slug = this.requireMainCompany(mainCompanySlug).slug;
    const models = await this.buildModelOzetleri(slug);
    const sqlRows = this.enrichUretimWithModels(
      await this.getSqlUretimRows(slug),
      models,
    );
    const legacyRows = this.getUretimRows(slug);
    const ids = new Set(sqlRows.map((row) => String(row.id)));
    const legacyIdsInSqlRaw = new Set(
      sqlRows.map((row: any) => String((row as any).raw?.id || "")),
    );
    const producedKeys = new Set(
      sqlRows.map((row) =>
        this.buildModelKey(row.modelAdi, row.musteriIrsaliyeNo, row.firma),
      ),
    );
    const producedModelIds = new Set(
      sqlRows.map((row) => String(row.modelKaydiId || row.modelId || "")),
    );
    return [
      ...sqlRows,
      ...legacyRows.filter((row) => {
        if (ids.has(String(row.id))) return false;
        if (legacyIdsInSqlRaw.has(String(row.id))) return false;
        if (
          producedModelIds.has(String(row.modelKaydiId || row.modelId || ""))
        ) {
          return false;
        }
        return !producedKeys.has(
          this.buildModelKey(row.modelAdi, row.musteriIrsaliyeNo, row.firma),
        );
      }),
    ].sort((a, b) =>
      String(b.tarih || "").localeCompare(String(a.tarih || "")),
    );
  }

  getUretimKaydiById(mainCompanySlug: string, id: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const rows = this.getUretimRows(company.slug);
    const row = rows.find((item) => String(item.id) === String(id));
    if (row) return row;
    const sqlRows = this.db.readMainCompanyStore<UretimRow[]>(
      company.slug,
      this.mcFiles.kayitlar,
      [],
    );
    const sqlFallback = sqlRows.find((item) => String(item.id) === String(id));
    if (sqlFallback) return sqlFallback;
    throw new BadRequestException("Üretim kaydı bulunamadı.");
  }

  async updateUretimKaydi(id: string, payload: Partial<UretimRow>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const rows = this.getUretimRows(company.slug);
    const index = rows.findIndex((item) => String(item.id) === String(id));
    const parsedBaskiHatasi = this.parseNumber(
      (payload as any).baskiHatasiAdet ?? (payload as any).printDefectQty,
    );
    const parsedKumasHatasi = this.parseNumber(
      (payload as any).kumasHatasiAdet ?? (payload as any).fabricDefectQty,
    );

    let updated: UretimRow;
    if (index >= 0) {
      const current = rows[index];
      updated = {
        ...current,
        tarih: this.cleanText(payload.tarih || current.tarih),
        firma: this.cleanText(payload.firma || current.firma),
        makina: this.cleanText(payload.makina || current.makina),
        vardiya: this.cleanText(payload.vardiya || current.vardiya),
        modelKaydiId: this.cleanText(
          payload.modelKaydiId || current.modelKaydiId,
        ),
        modelAdi: this.cleanText(payload.modelAdi || current.modelAdi),
        musteriIrsaliyeNo: this.cleanText(
          payload.musteriIrsaliyeNo || current.musteriIrsaliyeNo,
        ),
        zemin: this.cleanText(payload.zemin ?? current.zemin),
        grup: this.cleanText(payload.grup ?? current.grup),
        uretimAdedi:
          payload.uretimAdedi !== undefined
            ? this.parseNumber(payload.uretimAdedi)
            : current.uretimAdedi,
        baskiHatasiAdet:
          (payload as any).baskiHatasiAdet !== undefined ||
          (payload as any).printDefectQty !== undefined
            ? parsedBaskiHatasi
            : this.parseNumber(current.baskiHatasiAdet),
        kumasHatasiAdet:
          (payload as any).kumasHatasiAdet !== undefined ||
          (payload as any).fabricDefectQty !== undefined
            ? parsedKumasHatasi
            : this.parseNumber(current.kumasHatasiAdet),
        hataliAdet:
          payload.hataliAdet !== undefined
            ? this.parseNumber(payload.hataliAdet)
            : (payload as any).baskiHatasiAdet !== undefined ||
                (payload as any).kumasHatasiAdet !== undefined ||
                (payload as any).printDefectQty !== undefined ||
                (payload as any).fabricDefectQty !== undefined
              ? parsedBaskiHatasi + parsedKumasHatasi
              : current.hataliAdet,
        not: this.cleanText(payload.not ?? current.not),
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        mainCompanyName: company.name,
      };
      const nextRows = [...rows];
      nextRows[index] = updated;
      this.saveUretimRows(company.slug, nextRows);
    } else {
      const currentSql = await (this.prisma as any).productionRecord.findFirst({
        where: { id: String(id), mainCompanySlug: company.slug },
      });
      if (!currentSql) {
        throw new BadRequestException("Güncellenecek üretim kaydı bulunamadı.");
      }
      const currentMapped = this.mapSqlProduction(currentSql);
      const nextRaw = {
        ...(currentSql.raw && typeof currentSql.raw === "object"
          ? currentSql.raw
          : {}),
        ...currentMapped,
        tarih: this.cleanText(payload.tarih || currentMapped.tarih),
        vardiya: this.cleanText(payload.vardiya || currentMapped.vardiya),
        makina: this.cleanText(payload.makina || currentMapped.makina),
        sorumluPersonel: this.cleanText(
          (payload as any).sorumluPersonel ?? currentMapped.sorumluPersonel,
        ),
        uretimAdedi:
          payload.uretimAdedi !== undefined
            ? this.parseNumber(payload.uretimAdedi)
            : currentMapped.uretimAdedi,
        baskiHatasiAdet:
          (payload as any).baskiHatasiAdet !== undefined ||
          (payload as any).printDefectQty !== undefined
            ? parsedBaskiHatasi
            : this.parseNumber(currentMapped.baskiHatasiAdet),
        kumasHatasiAdet:
          (payload as any).kumasHatasiAdet !== undefined ||
          (payload as any).fabricDefectQty !== undefined
            ? parsedKumasHatasi
            : this.parseNumber(currentMapped.kumasHatasiAdet),
      } as any;
      nextRaw.hataliAdet =
        payload.hataliAdet !== undefined
          ? this.parseNumber(payload.hataliAdet)
          : this.parseNumber(nextRaw.baskiHatasiAdet) +
            this.parseNumber(nextRaw.kumasHatasiAdet);
      const nextDate = new Date(
        nextRaw.tarih || currentMapped.tarih || this.today(),
      );
      const updatedSql = await (this.prisma as any).productionRecord.update({
        where: { id: String(id) },
        data: {
          machineName: this.cleanText(nextRaw.makina || currentMapped.makina),
          shift: this.cleanText(nextRaw.vardiya || currentMapped.vardiya),
          totalQuantity: Math.round(this.parseNumber(nextRaw.uretimAdedi)),
          machinist:
            this.cleanText(
              nextRaw.sorumluPersonel || currentMapped.sorumluPersonel,
            ) || null,
          note: this.cleanText(payload.not ?? currentMapped.not) || null,
          printDefect: String(this.parseNumber(nextRaw.baskiHatasiAdet || 0)),
          fabricDefect: String(this.parseNumber(nextRaw.kumasHatasiAdet || 0)),
          productionDate: Number.isNaN(nextDate.getTime())
            ? new Date(currentMapped.tarih)
            : nextDate,
          raw: nextRaw,
        },
      });
      updated = this.mapSqlProduction(updatedSql);
    }

    return {
      kayit: updated,
      modelKaydi: (await this.getModelKayitlari(company.slug)).find(
        (item) => item.id === updated.modelKaydiId,
      ),
    };
  }

  async deleteUretimKaydi(mainCompanySlug: string, id: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const rows = this.getUretimRows(company.slug);
    const index = rows.findIndex((item) => String(item.id) === String(id));
    if (index >= 0) {
      const nextRows = rows.filter((item) => String(item.id) !== String(id));
      this.saveUretimRows(company.slug, nextRows);
      return { ok: true, silinen: rows[index], kalan: nextRows.length };
    }

    try {
      const deleted = await (this.prisma as any).productionRecord.delete({
        where: { id: String(id) },
      });
      if (
        this.normalizeKey(deleted.mainCompanySlug) !==
        this.normalizeKey(company.slug)
      ) {
        throw new BadRequestException("Silinecek üretim kaydı bulunamadı.");
      }
      return {
        ok: true,
        silinen: this.mapSqlProduction(deleted),
        kalan: rows.length,
      };
    } catch {
      throw new BadRequestException("Silinecek üretim kaydı bulunamadı.");
    }
  }

  private firstCompanySlug() {
    return this.db.getMainCompanies().find((item) => item.slug)?.slug || "";
  }

  resolveSeriCompanySlug(mainCompanySlug?: string, mainCompanyId?: string) {
    const requestedSlug = this.cleanText(mainCompanySlug);
    const requestedId = this.cleanText(mainCompanyId);
    const fallbackSlug = requestedSlug || this.firstCompanySlug();
    return this.requireMainCompany(fallbackSlug, requestedId).slug;
  }

  private modelSearchText(model: any) {
    const raw = model?.raw && typeof model.raw === "object" ? model.raw : {};
    return [
      model?.modelAdi,
      model?.modelName,
      model?.name,
      model?.productionModelName,
      model?.linkedVisualModelName,
      model?.firma,
      model?.firmaAdi,
      model?.musteriFirma,
      model?.siparisNo,
      model?.orderNo,
      model?.musteriIrsaliyeNo,
      model?.ocrText,
      model?.etiket,
      model?.tags,
      model?.fileName,
      raw?.ocrText,
      raw?.etiket,
      raw?.tags,
      raw?.originalFileName,
      raw?.sourcePath,
    ]
      .flat()
      .filter(Boolean)
      .join(" ");
  }

  private entryModelId(entry: any) {
    const raw = entry?.raw && typeof entry.raw === "object" ? entry.raw : {};
    return this.cleanText(entry.modelId || raw.modelId || raw.modelKaydiId);
  }

  private entryDispatchNo(entry: any) {
    const raw = entry?.raw && typeof entry.raw === "object" ? entry.raw : {};
    return this.cleanText(entry.orderNo || raw.musteriIrsaliyeNo || raw.irsaliyeNo);
  }

  private entryDateIso(entry: any) {
    const date = entry?.productionDate ? new Date(entry.productionDate) : new Date(entry?.entryDate || entry?.createdAt || Date.now());
    return Number.isNaN(date.getTime()) ? this.today() : date.toISOString().slice(0, 10);
  }

  private mapSeriEntry(entry: any) {
    const raw = entry?.raw && typeof entry.raw === "object" ? entry.raw : {};
    return {
      id: this.cleanText(entry.id || raw.id),
      tarih: this.entryDateIso(entry),
      makineNo: this.cleanText(raw.makineNo || raw.makina || entry.machineName),
      makineAdi: this.cleanText(raw.makineAdi || entry.machineName),
      modelId: this.entryModelId(entry),
      model: this.cleanText(entry.modelName || raw.modelAdi),
      adet: this.parseNumber(entry.totalQuantity ?? raw.uretimAdedi ?? raw.adet),
      vardiya: this.cleanText(entry.shift || raw.vardiya),
      makinaci: this.cleanText(entry.machinist || raw.sorumluPersonel || raw.makinaci),
      baskiBolgesi: this.cleanText(raw.baskiBolgesi || raw.grup || raw.printArea || "Ön"),
      partiNo: this.cleanText(raw.partiNo || raw.batchNo || raw.seriNo || raw.siparisNo || entry.orderNo),
      firma: this.cleanText(raw.firma || raw.firmaAdi || raw.companyName),
      zemin: this.cleanText(entry.groundColor || raw.zemin || raw.zeminRenk),
      irsaliyeNo: this.entryDispatchNo(entry),
      siparisNo: this.cleanText(raw.siparisNo || entry.orderNo),
      birimFiyat: this.parseNumber(raw.birimFiyat || raw.unitPrice),
      not: this.cleanText(entry.note || raw.not),
      durum: this.cleanText(raw.durum || "Kaydedildi"),
    };
  }

  private async getSeriProductionEntries(mainCompanySlug: string) {
    const rows = await (this.prisma as any).productionRecord.findMany({
      where: { mainCompanySlug },
      orderBy: [{ productionDate: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });
    return rows.map((row: any) => this.mapSeriEntry(row));
  }

  private async getSeriModelRows(mainCompanySlug: string) {
    const rows = await this.buildModelOzetleri(mainCompanySlug);
    return rows.map((row: any) => {
      const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
      const modelName = this.cleanText(
        row.linkedVisualModelName ||
          row.productionModelName ||
          row.modelAdi ||
          row.modelName ||
          row.name,
      );
      return {
        id: this.cleanText(row.id),
        modelId: this.cleanText(row.id),
        model: modelName,
        modelAdi: modelName,
        aciklama: this.cleanText(row.aciklama || raw.description || raw.aciklama),
        firma: this.cleanText(row.firma || row.firmaAdi || row.musteriFirma) || "TAHA GIYIM SAN. VE TIC.",
        siparisNo: this.cleanText(row.siparisNo || row.orderNo || row.musteriIrsaliyeNo),
        irsaliyeNo: this.cleanText(row.musteriIrsaliyeNo || row.sourceDispatchNo || raw.irsaliyeNo),
        irsaliyeAdedi: this.parseNumber(row.gelenAdet || row.incomingQty || row.dispatchQty),
        faturaKesilenAdet: this.parseNumber(row.toplamFatura || row.invoiceQty || row.invoicedQty),
        birimFiyat: this.parseNumber(row.birimFiyat || row.unitPrice || raw.unitPrice),
        gorsel: this.cleanText(row.desenImageThumb || row.imageUrl || row.thumbnail || row.desenGorseli),
        durum: this.cleanText(row.durum || row.status || "Aktif"),
        kaynak: this.cleanText(row.kaynak || raw.kaynak || "Desen Havuzu"),
        searchText: this.modelSearchText(row),
      };
    });
  }

  private async searchSeriModels(mainCompanySlug: string, search: any) {
    const q = this.cleanText(search);
    if (!q) return [];
    const result = await this.modelService.list({
      mainCompanySlug,
      q,
      pageSize: 100,
    });
    const rows = Array.isArray(result) ? result : result.rows || [];
    const company = await (this.prisma as any).mainCompany
      .findFirst({
        where: { OR: [{ slug: mainCompanySlug }, { id: mainCompanySlug }] },
        select: { id: true },
      })
      .catch(() => null);
    const storedFiles = company?.id
      ? await (this.prisma as any).storedFile
          .findMany({
            where: {
              mainCompanyId: company.id,
              module: "DESEN",
              documentType: "DESEN_GORSEL",
              isDeleted: false,
              OR: [
                { originalFileName: { contains: q } },
                { ownerId: { contains: q } },
                { sourcePath: { contains: q } },
              ],
            },
            orderBy: [{ createdAt: "desc" }],
            take: 100,
          })
          .catch(() => [])
      : [];
    const storageRows = storedFiles.map((file: any) => {
      const modelName = this.cleanText(
        file.ownerId || path.parse(file.originalFileName || "").name,
      );
      const imageUrl = this.cleanText(file.thumbnailPath || file.publicUrl);
      return {
        id: `desen-${file.id}`,
        modelId: `desen-${file.id}`,
        model: modelName,
        modelAdi: modelName,
        firma: "TAHA GIYIM SAN. VE TIC.",
        siparisNo: "",
        gorsel: imageUrl,
        birimFiyat: 0,
        searchText: [modelName, file.originalFileName, file.sourcePath].filter(Boolean).join(" "),
      };
    });
    const mapped = rows.map((row: any) => {
      const modelName = this.cleanText(
        row.linkedVisualModelName ||
          row.productionModelName ||
          row.modelAdi ||
          row.modelName ||
          row.name,
      );
      return {
        id: this.cleanText(row.id),
        modelId: this.cleanText(row.id),
        model: modelName,
        modelAdi: modelName,
        firma: this.cleanText(row.firma || row.firmaAdi || row.musteriFirma) || "TAHA GIYIM SAN. VE TIC.",
        siparisNo: this.cleanText(row.siparisNo || row.orderNo || row.musteriIrsaliyeNo),
        gorsel: this.cleanText(row.desenImageThumb || row.imageUrl || row.thumbnail || row.desenGorseli),
        birimFiyat: this.parseNumber(row.birimFiyat || row.unitPrice),
        searchText: this.modelSearchText(row),
      };
    });
    const byId = new Map<string, any>();
    [...storageRows, ...mapped]
      .filter((row) =>
        this.normalizeSeriModelKey(`${row.searchText} ${row.model}`).includes(
          this.normalizeSeriModelKey(q),
        ),
      )
      .forEach((row) => {
        if (!byId.has(row.id)) byId.set(row.id, row);
      });
    return Array.from(byId.values()).slice(0, 100);
  }

  private isDispatchDocument(document: any) {
    const workflow = this.normalizeKey(
      document?.header?.flowType ||
        document?.workflowType ||
        document?.documentKind ||
        document?.targetType ||
        document?.belgeTipi,
    );
    return [
      "GIDEN_IRSALIYE",
      "BIZIM_IRSALIYE",
      "BIZIM_GIDEN_IRSALIYE",
      "MUSTERIDEN_GELEN_IRSALIYE",
      "OUR_DISPATCH",
      "CUSTOMER_DISPATCH",
    ].includes(workflow);
  }

  private dispatchLineQty(document: any, item: any) {
    return (
      this.parseNumber(item?.miktar ?? item?.quantity ?? item?.adet ?? item?.kg) ||
      this.sumDocumentQty(document)
    );
  }

  private dispatchNo(document: any) {
    const header = document?.header || {};
    return this.cleanText(
      header?.irsaliyeNo ||
        header?.dispatchNo ||
        header?.documentNo ||
        document?.dispatchNo ||
        document?.documentNo ||
        document?.documentId ||
        document?.id,
    );
  }

  private documentDate(document: any) {
    const header = document?.header || {};
    const value =
      header?.tarih ||
      header?.issueDate ||
      document?.date ||
      document?.issueDate ||
      document?.createdAt;
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? this.today() : date.toISOString().slice(0, 10);
  }

  private invoiceQtyForDispatch(mainCompanySlug: string, dispatchNo: string, modelName: string) {
    const dispatchKey = this.normalizeKey(dispatchNo);
    const modelKey = this.normalizeKey(modelName);
    if (!dispatchKey) return 0;
    return this.getMuhasebeDocuments(mainCompanySlug).reduce((sum: number, document: any) => {
      const workflow = this.normalizeKey(
        document?.header?.flowType ||
          document?.workflowType ||
          document?.documentKind ||
          document?.targetType ||
          document?.belgeTipi,
      );
      if (!workflow.includes("FATURA") && !workflow.includes("INVOICE")) return sum;
      const header = document?.header || {};
      const linkedDispatch = this.normalizeKey(
        header?.irsaliyeNo ||
          header?.bagliIrsaliyeNo ||
          header?.dispatchNo ||
          header?.dispatchReferences?.[0] ||
          "",
      );
      if (linkedDispatch !== dispatchKey) return sum;
      const items = Array.isArray(document?.items) && document.items.length ? document.items : [{}];
      return (
        sum +
        items.reduce((itemSum: number, item: any) => {
          const itemModel = this.normalizeKey(
            item?.modelAdi || item?.modelAdayi || item?.description || header?.modelAdi,
          );
          if (modelKey && itemModel && itemModel !== modelKey) return itemSum;
          return itemSum + this.dispatchLineQty(document, item);
        }, 0)
      );
    }, 0);
  }

  private dispatchLinks(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<any[]>(mainCompanySlug, "uretim.dispatch-links", []);
  }

  private async buildDocumentIntakeDispatchRows(mainCompanySlug: string, entries: any[]) {
    const rows = await (this.prisma as any).documentIntake
      .findMany({
        where: {
          mainCompanySlug,
          documentKind: { in: ["OUR_DISPATCH", "CUSTOMER_DISPATCH"] },
        },
        include: { lines: true },
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        take: 1000,
      })
      .catch(() => []);
    const links = this.dispatchLinks(mainCompanySlug);
    return rows.flatMap((document: any) => {
      const lines = Array.isArray(document.lines) && document.lines.length ? document.lines : [{}];
      const dispatchNo = this.cleanText(document.dispatchNo || document.documentNo || document.id);
      const date = document.issueDate ? new Date(document.issueDate) : new Date(document.createdAt || Date.now());
      const tarih = Number.isNaN(date.getTime()) ? this.today() : date.toISOString().slice(0, 10);
      const firma = this.cleanText(document.issuerName || document.receiverName || document.firmDraftJson?.name);
      return lines.map((line: any, index: number) => {
        const modelName = this.cleanText(line?.productDraftJson?.modelAdi || line?.rawName || line?.description || document.modelGuess);
        const link = links.find(
          (row) =>
            this.normalizeKey(row.irsaliyeNo) === this.normalizeKey(dispatchNo) &&
            (!modelName || this.normalizeKey(row.modelAdi || row.modelName) === this.normalizeKey(modelName)),
        );
        const modelId = this.cleanText(link?.modelId || document.modelId || line?.productDraftJson?.modelId);
        const dispatchQty = this.parseNumber(line?.quantity || line?.kg);
        const unitPrice = this.parseNumber(link?.birimFiyat || line?.unitPrice || line?.productDraftJson?.unitPrice);
        const produced = entries
          .filter((entry) => {
            const sameDispatch = this.normalizeKey(entry.irsaliyeNo) === this.normalizeKey(dispatchNo);
            const sameModel =
              modelId
                ? this.normalizeKey(entry.modelId) === this.normalizeKey(modelId)
                : this.sameSeriModel(entry.model, modelName);
            return sameDispatch || sameModel;
          })
          .reduce((sum, entry) => sum + this.parseNumber(entry.adet), 0);
        return {
          id: `${document.id}-${line?.id || index}`,
          documentId: document.id,
          lineIndex: index,
          tarih,
          firma,
          irsaliyeNo: dispatchNo,
          siparisNo: this.cleanText(line?.productDraftJson?.siparisNo || document.parseRawJson?.orderNo),
          modelId,
          modelAdi: modelName,
          model: modelName,
          irsaliyeAdedi: dispatchQty,
          birimFiyat: unitPrice,
          toplamTutar: dispatchQty * unitPrice,
          imalatGirilen: produced,
          faturaKesilen: 0,
          kalan: dispatchQty,
          kalanTutar: dispatchQty * unitPrice,
          durum: modelId ? (unitPrice ? "Kontrol Bekliyor" : "Fiyat Yok") : "Model Bağlanmadı",
        };
      });
    });
  }

  private async buildDispatchRows(mainCompanySlug: string, entries: any[]) {
    const links = this.dispatchLinks(mainCompanySlug);
    const rows: any[] = [];
    for (const document of this.getMuhasebeDocuments(mainCompanySlug)) {
      if (!this.isDispatchDocument(document)) continue;
      const header = document?.header || {};
      const items = Array.isArray(document?.items) && document.items.length ? document.items : [{}];
      const dispatchNo = this.dispatchNo(document);
      const firma = this.cleanText(
        document?.relatedCompanyName ||
          document?.firma ||
          header?.cariFirma ||
          header?.companyName ||
          header?.receiverName ||
          header?.issuerName,
      );
      items.forEach((item: any, index: number) => {
        const modelName = this.cleanText(
          item?.modelAdi ||
            item?.modelAdayi ||
            item?.description ||
            item?.rawName ||
            header?.modelAdi ||
            document?.modelAdi,
        );
        const orderNo = this.cleanText(item?.siparisNo || item?.orderNo || header?.siparisNo || header?.orderNo);
        const link = links.find(
          (row) =>
            this.normalizeKey(row.irsaliyeNo) === this.normalizeKey(dispatchNo) &&
            (!orderNo || this.normalizeKey(row.siparisNo) === this.normalizeKey(orderNo)) &&
            (!modelName || this.normalizeKey(row.modelAdi || row.modelName) === this.normalizeKey(modelName)),
        );
        const modelId = this.cleanText(link?.modelId || item?.modelId || header?.modelId || document?.modelId);
        const qty = this.dispatchLineQty(document, item);
        const unitPrice = this.parseNumber(link?.birimFiyat || item?.birimFiyat || item?.unitPrice || header?.birimFiyat);
        const produced = entries
          .filter((entry) => {
            const sameDispatch = this.normalizeKey(entry.irsaliyeNo) === this.normalizeKey(dispatchNo);
            const sameModel =
              modelId
                ? this.normalizeKey(entry.modelId) === this.normalizeKey(modelId)
                : this.sameSeriModel(entry.model, modelName);
            return sameDispatch || sameModel;
          })
          .reduce((sum, entry) => sum + this.parseNumber(entry.adet), 0);
        const invoiced = this.invoiceQtyForDispatch(mainCompanySlug, dispatchNo, modelName);
        const kalan = Math.max(0, qty - invoiced);
        rows.push({
          id: this.cleanText(`${document?.id || document?.documentId || dispatchNo}-${index}`),
          documentId: this.cleanText(document?.id || document?.documentId),
          lineIndex: index,
          tarih: this.documentDate(document),
          firma,
          irsaliyeNo: dispatchNo,
          siparisNo: orderNo,
          modelId,
          modelAdi: modelName,
          model: modelName,
          irsaliyeAdedi: qty,
          birimFiyat: unitPrice,
          toplamTutar: qty * unitPrice,
          imalatGirilen: produced,
          faturaKesilen: invoiced,
          kalan,
          kalanTutar: kalan * unitPrice,
          durum: modelId ? (unitPrice ? "Kontrol Bekliyor" : "Fiyat Yok") : "Model Bağlanmadı",
        });
      });
    }
    const intakeRows = await this.buildDocumentIntakeDispatchRows(mainCompanySlug, entries);
    const byKey = new Map<string, any>();
    [...rows, ...intakeRows].forEach((row) => {
      const key = [
        this.normalizeKey(row.irsaliyeNo),
        this.normalizeKey(row.siparisNo),
        this.normalizeKey(row.modelAdi),
        row.lineIndex,
      ].join("|");
      if (!byKey.has(key)) byKey.set(key, row);
    });
    return Array.from(byKey.values()).sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
  }

  private statusForSeriJob(job: any) {
    const produced = this.parseNumber(job.imalatAdedi);
    const dispatch = this.parseNumber(job.irsaliyeAdedi);
    const invoice = this.parseNumber(job.faturaKesilenAdet);
    const price = this.parseNumber(job.birimFiyat);
    if (job.status === "COMPLETED") return "Tamamlanan";
    if (!price) return "Fiyat yok";
    if (dispatch > 0 && invoice < dispatch) return "Fatura bekleyen";
    if (dispatch > 0 && produced > dispatch) return "Fazla imalat";
    if (dispatch > 0 && produced < dispatch) return "Eksik imalat";
    if (dispatch > 0) return "Irsaliyesi olan";
    if (produced > 0) return "Irsaliyesi olmayan";
    return "Bekliyor";
  }

  private attachSeriTotals(model: any, entries: any[]) {
    const modelEntries = entries.filter(
      (entry) =>
        this.normalizeKey(entry.modelId) === this.normalizeKey(model.id) ||
        (!entry.modelId && this.normalizeKey(entry.model) === this.normalizeKey(model.model)),
    );
    const imalatAdedi = modelEntries.reduce((sum, entry) => sum + this.parseNumber(entry.adet), 0);
    const birimFiyat =
      this.parseNumber(model.birimFiyat) ||
      modelEntries.reduce((value, entry) => value || this.parseNumber(entry.birimFiyat), 0);
    const irsaliyeAdedi = this.parseNumber(model.irsaliyeAdedi);
    const faturaKesilenAdet = this.parseNumber(model.faturaKesilenAdet);
    const kalanAdet = Math.max(0, (irsaliyeAdedi || imalatAdedi) - faturaKesilenAdet);
    const job = {
      ...model,
      entries: modelEntries,
      imalatAdedi,
      birimFiyat,
      toplamTutar: irsaliyeAdedi * birimFiyat,
      kesilenTutar: faturaKesilenAdet * birimFiyat,
      kalanAdet,
      kalanTutar: kalanAdet * birimFiyat,
      status: model.durum,
    };
    return { ...job, durum: this.statusForSeriJob(job) };
  }

  private invoiceLinks(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<any[]>(mainCompanySlug, "uretim.invoice-links", []);
  }

  private workCardOverrides(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<any[]>(mainCompanySlug, "uretim.work-cards", []);
  }

  private closedSeriJobs(mainCompanySlug: string) {
    return this.db.readMainCompanyStore<any[]>(mainCompanySlug, "uretim.closed-jobs", []);
  }

  private seriCardKey(row: any) {
    return [
      this.normalizeKey(row.modelId),
      this.normalizeSeriModelKey(row.model || row.modelAdi || row.modelName),
      this.normalizeKey(row.siparisNo),
      this.normalizeKey(row.irsaliyeNo),
    ]
      .filter(Boolean)
      .join("|");
  }

  private findSeriCard(cards: Map<string, any>, row: any) {
    const rowDispatch = this.normalizeKey(row.irsaliyeNo);
    const rowModelId = this.normalizeKey(row.modelId);
    const rowModel = row.model || row.modelAdi || row.modelName;
    for (const card of cards.values()) {
      if (rowDispatch && this.normalizeKey(card.irsaliyeNo) === rowDispatch) return card;
      if (rowModelId && this.normalizeKey(card.modelId) === rowModelId) return card;
      if (this.sameSeriModel(card.model, rowModel)) return card;
    }
    return null;
  }

  private seriStatus(card: any) {
    const incoming = this.parseNumber(card.gelenIrsaliye);
    const produced = this.parseNumber(card.imalat);
    const invoiced = this.parseNumber(card.fatura);
    const price = this.parseNumber(card.birimFiyat);
    if (card.closed) return "Tamamlandı";
    if (!card.modelId && incoming > 0) return "Model Bağlanmadı";
    if (incoming > 0 && produced <= 0) return "İrsaliye Var İmalat Yok";
    if (produced > 0 && incoming <= 0) return "İmalat Var İrsaliye Yok";
    if (!price) return "Fiyat Yok";
    if (invoiced > 0 && Math.abs(incoming - invoiced) > 0 && Math.abs(incoming - invoiced) <= 20) return "Numune/Fark Var";
    if (invoiced > 0 && produced > invoiced) return "Faturası Kesildi İmalat Devam";
    if (invoiced > 0 && invoiced < Math.max(incoming, produced)) return "Kısmi Kesildi";
    if (incoming > 0 && produced > 0 && invoiced <= 0) return "Fatura Kesilebilir";
    if (invoiced >= Math.max(incoming, produced) && invoiced > 0) return "Tamamlandı";
    return "Fatura Bekliyor";
  }

  private finalizeSeriCard(card: any) {
    const incoming = this.parseNumber(card.gelenIrsaliye);
    const produced = this.parseNumber(card.imalat);
    const invoiced = this.parseNumber(card.fatura);
    const price = this.parseNumber(card.birimFiyat);
    const remaining = Math.max(0, Math.max(incoming, produced) - invoiced);
    const durum = this.seriStatus({ ...card, gelenIrsaliye: incoming, imalat: produced, fatura: invoiced, birimFiyat: price });
    return {
      ...card,
      model: this.cleanText(card.model || card.modelAdi) || "Model Bağlanmadı",
      gelenIrsaliye: incoming,
      imalat: produced,
      bizimSevk: this.parseNumber(card.bizimSevk),
      fatura: invoiced,
      birimFiyat: price,
      kalanAdet: remaining,
      kalanTutar: remaining * price,
      durum,
      status: durum,
    };
  }

  private async buildSeriWorkCards(mainCompanySlug: string, query: Record<string, any> = {}) {
    const entries = await this.getSeriProductionEntries(mainCompanySlug);
    const incoming = await this.buildDispatchRows(mainCompanySlug, entries);
    const invoices = this.invoiceLinks(mainCompanySlug);
    const closed = this.closedSeriJobs(mainCompanySlug);
    const overrides = this.workCardOverrides(mainCompanySlug);
    const cards = new Map<string, any>();

    const ensureCard = (seed: any) => {
      const key = this.seriCardKey(seed) || this.cleanText(seed.id) || `CARD-${cards.size + 1}`;
      if (!cards.has(key)) {
        cards.set(key, {
          id: this.cleanText(seed.workCardId || seed.id || key),
          modelId: this.cleanText(seed.modelId),
          model: this.cleanText(seed.model || seed.modelAdi || seed.modelName),
          firma: this.cleanText(seed.firma) || "TAHA GIYIM SAN. VE TIC.",
          siparisNo: this.cleanText(seed.siparisNo),
          irsaliyeNo: this.cleanText(seed.irsaliyeNo),
          tarih: this.cleanText(seed.tarih || this.today()),
          gelenIrsaliye: 0,
          imalat: 0,
          bizimSevk: 0,
          fatura: 0,
          birimFiyat: 0,
          gorsel: this.cleanText(seed.gorsel),
          sourceIds: [],
        });
      }
      return cards.get(key);
    };

    incoming.forEach((row) => {
      const card = ensureCard(row);
      card.gelenIrsaliye += this.parseNumber(row.irsaliyeAdedi);
      card.fatura += this.parseNumber(row.faturaKesilen);
      card.birimFiyat = card.birimFiyat || this.parseNumber(row.birimFiyat);
      card.modelId = card.modelId || this.cleanText(row.modelId);
      card.model = card.model || this.cleanText(row.modelAdi || row.model);
      card.firma = card.firma || this.cleanText(row.firma);
      card.siparisNo = card.siparisNo || this.cleanText(row.siparisNo);
      card.irsaliyeNo = card.irsaliyeNo || this.cleanText(row.irsaliyeNo);
      card.sourceIds.push(row.id);
    });

    entries.forEach((entry) => {
      const card = this.findSeriCard(cards, entry) || ensureCard(entry);
      card.imalat += this.parseNumber(entry.adet);
      card.birimFiyat = card.birimFiyat || this.parseNumber(entry.birimFiyat);
      card.modelId = card.modelId || this.cleanText(entry.modelId);
      card.model = card.model || this.cleanText(entry.model);
      card.siparisNo = card.siparisNo || this.cleanText(entry.siparisNo);
      card.irsaliyeNo = card.irsaliyeNo || this.cleanText(entry.irsaliyeNo);
      card.tarih = this.cleanText(entry.tarih || card.tarih);
      card.sourceIds.push(entry.id);
    });

    overrides.forEach((item) => {
      const card = ensureCard(item);
      Object.assign(card, {
        ...item,
        gelenIrsaliye: this.parseNumber(card.gelenIrsaliye) + this.parseNumber(item.gelenIrsaliye),
        imalat: this.parseNumber(card.imalat) + this.parseNumber(item.imalat),
        fatura: this.parseNumber(card.fatura) + this.parseNumber(item.fatura),
        birimFiyat: this.parseNumber(item.birimFiyat) || this.parseNumber(card.birimFiyat),
      });
    });

    invoices.forEach((invoice) => {
      const card = this.findSeriCard(cards, invoice) || ensureCard(invoice);
      card.fatura += this.parseNumber(invoice.faturaAdedi || invoice.adet);
      card.bizimSevk += this.parseNumber(invoice.bizimSevkAdedi || invoice.sevkAdedi);
      card.birimFiyat = this.parseNumber(invoice.birimFiyat) || card.birimFiyat;
      card.faturaNo = this.cleanText(invoice.faturaNo || card.faturaNo);
    });

    closed.forEach((item) => {
      const card = this.findSeriCard(cards, { modelId: item.modelId || item.id, model: item.model });
      if (card) card.closed = true;
    });

    const search = this.normalizeSeriModelKey(query.q || query.search || query.model || "");
    const status = this.normalizeKey(query.durum || query.status || "");
    return Array.from(cards.values())
      .map((card) => this.finalizeSeriCard(card))
      .filter((card) => {
        if (search) {
          const haystack = this.normalizeSeriModelKey(
            `${card.firma} ${card.model} ${card.siparisNo} ${card.irsaliyeNo} ${card.faturaNo}`,
          );
          if (!haystack.includes(search)) return false;
        }
        if (status && this.normalizeKey(card.durum) !== status) return false;
        if (query.firma && !this.normalizeKey(card.firma).includes(this.normalizeKey(query.firma))) return false;
        if (query.tarih && card.tarih !== query.tarih) return false;
        return true;
      })
      .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
  }

  async getSeriSummary(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const cards = await this.buildSeriWorkCards(slug, query);
    const sumBy = (fn: (card: any) => number) => cards.reduce((sum, card) => sum + fn(card), 0);
    return {
      ok: true,
      data: {
        irsaliyeGelen: sumBy((card) => this.parseNumber(card.gelenIrsaliye)),
        faturaKesilebilir: cards.filter((card) => card.durum === "Fatura Kesilebilir").length,
        kismiDevam: cards.filter((card) => ["Kısmi Kesildi", "Faturası Kesildi İmalat Devam"].includes(card.durum)).length,
        modelBaglanmadi: cards.filter((card) => card.durum === "Model Bağlanmadı").length,
        toplamKalanTutar: sumBy((card) => this.parseNumber(card.kalanTutar)),
        acikIs: cards.filter((card) => card.durum !== "Tamamlandı").length,
      },
    };
  }

  async getSeriModelSearch(mainCompanySlug?: string, mainCompanyId?: string, q?: string) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const [models, cards] = await Promise.all([
      this.searchSeriModels(slug, q),
      this.buildSeriWorkCards(slug, { q }),
    ]);
    const cardModels = cards.map((card) => ({
      id: card.modelId || card.id,
      modelId: card.modelId || card.id,
      model: card.model,
      modelAdi: card.model,
      firma: card.firma,
      siparisNo: card.siparisNo,
      gorsel: card.gorsel,
      birimFiyat: card.birimFiyat,
    }));
    const byId = new Map<string, any>();
    [...models, ...cardModels].forEach((row) => {
      const key = this.cleanText(row.id || row.modelId || row.model);
      if (key && !byId.has(key)) byId.set(key, row);
    });
    return { ok: true, data: Array.from(byId.values()).slice(0, 100) };
  }

  async getSeriWorkCards(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    return { ok: true, data: await this.buildSeriWorkCards(slug, query) };
  }

  private applyImalatFilters(rows: any[], query: Record<string, any> = {}) {
    const contains = (value: any, needle: any) =>
      !this.cleanText(needle) ||
      this.normalizeKey(value).includes(this.normalizeKey(needle));
    return rows.filter((row) => {
      if (query.baslangic && row.tarih < query.baslangic) return false;
      if (query.bitis && row.tarih > query.bitis) return false;
      if (query.tarih && row.tarih !== query.tarih) return false;
      if (!contains(row.model, query.model)) return false;
      if (!contains(row.firma, query.firma)) return false;
      if (!contains(row.partiNo, query.partiNo || query.parti)) return false;
      if (!contains(`${row.makineNo} ${row.makineAdi}`, query.makine)) return false;
      if (!contains(row.makinaci, query.makinaci)) return false;
      if (query.vardiya && this.normalizeKey(row.vardiya) !== this.normalizeKey(query.vardiya)) return false;
      if (query.baskiBolgesi && this.normalizeKey(row.baskiBolgesi) !== this.normalizeKey(query.baskiBolgesi)) return false;
      if (query.durum && this.normalizeKey(row.durum) !== this.normalizeKey(query.durum)) return false;
      const q = this.cleanText(query.q || query.search);
      if (q && !this.normalizeKey(`${row.model} ${row.firma} ${row.partiNo} ${row.makineNo} ${row.makineAdi} ${row.makinaci} ${row.baskiBolgesi}`).includes(this.normalizeKey(q))) {
        return false;
      }
      return true;
    });
  }

  private regionNamesFromModel(model: any) {
    const raw = model?.raw && typeof model.raw === "object" ? model.raw : {};
    const source = model?.printRegions || model?.baskiBolgeleri || raw.printRegions || raw.baskiBolgeleri || model?.baskiBolgesi || raw.baskiBolgesi || "Ön";
    const rows = Array.isArray(source)
      ? source
      : String(source || "")
          .split(/[,;+|]/)
          .map((item) => item.trim())
          .filter(Boolean);
    const names = rows
      .map((item: any) => (typeof item === "string" ? item : item.regionName || item.name || item.label || item.bolge || item.printArea))
      .map((item: any) => this.cleanText(item))
      .filter(Boolean);
    return Array.from(new Set(names.length ? names : ["Ön"]));
  }

  private async buildImalatOperationRows(mainCompanySlug: string, query: Record<string, any> = {}) {
    const [entries, models] = await Promise.all([
      this.getSeriProductionEntries(mainCompanySlug),
      this.getSeriModelRows(mainCompanySlug),
    ]);
    const modelById = new Map(models.map((model: any) => [this.normalizeKey(model.modelId || model.id), model]));
    const rows = entries.map((entry: any) => {
      const model = modelById.get(this.normalizeKey(entry.modelId)) || {};
      const planlanan = this.parseNumber(model.irsaliyeAdedi || entry.adet);
      const basilan = this.parseNumber(entry.adet);
      const eksik = Math.max(0, planlanan - basilan);
      let durum = basilan <= 0 ? "Bekliyor" : eksik > 0 ? "Eksik Operasyon" : "Tamam";
      if (this.normalizeKey(entry.durum).includes("IPTAL")) durum = "İptal";
      return {
        id: entry.id,
        tarih: entry.tarih,
        firma: entry.firma || model.firma || "",
        model: entry.model || model.model || "",
        modelId: entry.modelId,
        modelImageUrl: model.modelImageUrl || model.desenImageThumb || model.imageUrl || model.thumbnail || model.raw?.desenImageThumb || "",
        partiNo: entry.partiNo || entry.siparisNo || entry.irsaliyeNo || "GENEL",
        baskiBolgesi: entry.baskiBolgesi || "Ön",
        planlanan,
        basilan,
        eksik,
        makineNo: entry.makineNo || "",
        makineAdi: entry.makineAdi || entry.makineNo || "",
        vardiya: entry.vardiya || "",
        makinaci: entry.makinaci || "",
        zemin: entry.zemin || "",
        durum,
        not: entry.not || "",
        requiredRegions: this.regionNamesFromModel(model),
      };
    });
    return this.applyImalatFilters(rows, query);
  }

  private calculateCompletedByBatch(rows: any[]) {
    const batches = new Map<string, any>();
    for (const row of rows) {
      const key = `${this.normalizeKey(row.modelId || row.model)}|${this.normalizeKey(row.partiNo)}`;
      const bucket =
        batches.get(key) || {
          model: row.model,
          firma: row.firma,
          partiNo: row.partiNo,
          requiredRegions: row.requiredRegions?.length ? row.requiredRegions : ["Ön"],
          regions: new Map<string, number>(),
        };
      bucket.regions.set(row.baskiBolgesi, this.parseNumber(bucket.regions.get(row.baskiBolgesi)) + this.parseNumber(row.basilan));
      batches.set(key, bucket);
    }
    let tamamlananModelAdedi = 0;
    let eksikOperasyon = 0;
    const batchRows = Array.from(batches.values()).map((batch: any) => {
      const values = batch.requiredRegions.map((region: string) => this.parseNumber(batch.regions.get(region)));
      const completed = values.length ? Math.min(...values) : 0;
      const maxValue = Math.max(0, ...values, ...Array.from(batch.regions.values()).map((value: any) => this.parseNumber(value)));
      const missing = batch.requiredRegions
        .map((region: string, index: number) => ({ region, qty: Math.max(0, maxValue - values[index]) }))
        .filter((item: any) => item.qty > 0);
      tamamlananModelAdedi += completed;
      eksikOperasyon += missing.length;
      return { ...batch, completed, missing };
    });
    return { tamamlananModelAdedi, eksikOperasyon, batchRows };
  }

  async getImalatDenetim(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const rows = await this.buildImalatOperationRows(slug, query);
    const completion = this.calculateCompletedByBatch(rows);
    const today = this.today();
    return {
      ok: true,
      data: {
        summary: {
          acikParti: new Set(rows.filter((row) => row.durum !== "Tamam").map((row) => `${row.modelId || row.model}|${row.partiNo}`)).size,
          eksikBolge: rows.filter((row) => row.durum === "Eksik Operasyon").length + completion.eksikOperasyon,
          tamamlananParti: completion.batchRows.filter((row: any) => row.completed > 0 && !row.missing.length).length,
          bugunBasilanAdet: rows.filter((row) => row.tarih === today).reduce((sum, row) => sum + this.parseNumber(row.basilan), 0),
          kontrolGereken: rows.filter((row) => ["Fazla", "Kontrol Gerekli"].includes(row.durum)).length,
        },
        rows,
      },
    };
  }

  async getImalatRapor(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const rows = await this.buildImalatOperationRows(slug, query);
    const completion = this.calculateCompletedByBatch(rows);
    const completedByModel = new Map<string, number>();
    for (const batch of completion.batchRows) {
      const key = this.normalizeKey(`${batch.firma}|${batch.model}`);
      completedByModel.set(key, this.parseNumber(completedByModel.get(key)) + this.parseNumber(batch.completed));
    }
    const group = (keyFn: (row: any) => string, seed: (row: any) => any) => {
      const map = new Map<string, any>();
      for (const row of rows) {
        const key = keyFn(row);
        const item = map.get(key) || seed(row);
        item.operasyonAdedi += this.parseNumber(row.basilan);
        item.eksik += this.parseNumber(row.eksik);
        map.set(key, item);
      }
      return Array.from(map.values());
    };
    const machineRows = group(
      (row) => `${row.makineNo}|${row.makineAdi}`,
      (row) => ({ makineNo: row.makineNo, makineAdi: row.makineAdi, operasyonAdedi: 0, tamamlananModelAdedi: 0, eksik: 0 }),
    );
    const operatorRows = group(
      (row) => `${row.makinaci}|${row.vardiya}`,
      (row) => ({ makinaci: row.makinaci || "-", vardiya: row.vardiya || "-", basilanBolgeAdedi: 0, operasyonAdedi: 0, tamamlananModelAdedi: 0, eksik: 0 }),
    ).map((row) => ({ ...row, basilanBolgeAdedi: row.operasyonAdedi }));
    const modelRows = group(
      (row) => `${row.firma}|${row.model}|${row.baskiBolgesi}`,
      (row) => ({ firma: row.firma, model: row.model, modelImageUrl: row.modelImageUrl || "", baskiBolgesi: row.baskiBolgesi, operasyonAdedi: 0, tamamlananModelAdedi: 0, eksik: 0, durum: "Tamam" }),
    ).map((row) => {
      const completed = this.parseNumber(completedByModel.get(this.normalizeKey(`${row.firma}|${row.model}`)));
      return { ...row, tamamlananModelAdedi: completed, durum: row.eksik > 0 ? "Eksik Operasyon" : "Tamam" };
    });
    return {
      ok: true,
      data: {
        summary: {
          tamamlananModelAdedi: completion.tamamlananModelAdedi,
          bolgeOperasyonu: rows.reduce((sum, row) => sum + this.parseNumber(row.basilan), 0),
          aktifMakine: new Set(rows.map((row) => row.makineNo).filter(Boolean)).size,
          eksikOperasyon: rows.filter((row) => row.eksik > 0).length + completion.eksikOperasyon,
          bugunBasilanAdet: rows.filter((row) => row.tarih === this.today()).reduce((sum, row) => sum + this.parseNumber(row.basilan), 0),
        },
        machineRows,
        operatorRows,
        modelRows,
        rows,
      },
    };
  }

  async getSeriIncomingDispatches(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const entries = await this.getSeriProductionEntries(slug);
    let rows = await this.buildDispatchRows(slug, entries);
    if (query.q || query.search) {
      const search = this.normalizeSeriModelKey(query.q || query.search);
      rows = rows.filter((row) =>
        this.normalizeSeriModelKey(`${row.firma} ${row.irsaliyeNo} ${row.modelAdi} ${row.siparisNo}`).includes(search),
      );
    }
    return { ok: true, data: rows };
  }

  async getSeriEntries(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    let rows = await this.getSeriProductionEntries(slug);
    if (query.tarih) rows = rows.filter((row) => row.tarih === query.tarih);
    return { ok: true, data: rows };
  }

  async getSeriReport(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const cards = await this.buildSeriWorkCards(
      this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId),
      query,
    );
    return {
      ok: true,
      data: cards.map((card) => ({
        tarih: card.tarih,
        firma: card.firma,
        model: card.model,
        siparis: card.siparisNo,
        irsaliye: card.irsaliyeNo,
        fatura: card.faturaNo || "",
        makine: card.makineNo || "",
        vardiya: card.vardiya || "",
        makinaci: card.makinaci || "",
        imalat: card.imalat,
        faturaKesilen: card.fatura,
        kalan: card.kalanAdet,
        birimFiyat: card.birimFiyat,
        tutar: card.fatura * card.birimFiyat,
        durum: card.durum,
      })),
    };
  }

  createSeriWorkCard(payload: Record<string, any>) {
    const slug = this.resolveSeriCompanySlug(payload.mainCompanySlug, payload.mainCompanyId);
    const model = this.cleanText(payload.model || payload.modelAdi || payload.modelName);
    if (!model) throw new BadRequestException("Model adı zorunludur.");
    const rows = this.workCardOverrides(slug);
    const item = {
      id: this.cleanText(payload.id) || `WC-${Date.now()}`,
      modelId: this.cleanText(payload.modelId || payload.id) || `WC-${Date.now()}`,
      model,
      firma: this.cleanText(payload.firma) || "TAHA GIYIM SAN. VE TIC.",
      siparisNo: this.cleanText(payload.siparisNo),
      irsaliyeNo: this.cleanText(payload.irsaliyeNo),
      gelenIrsaliye: this.parseNumber(payload.gelenIrsaliye),
      imalat: this.parseNumber(payload.imalat),
      fatura: this.parseNumber(payload.fatura),
      birimFiyat: this.parseNumber(payload.birimFiyat),
      gorsel: this.cleanText(payload.gorsel || payload.gorselData),
      createdAt: this.nowIso(),
    };
    this.db.writeMainCompanyStore(slug, "uretim.work-cards", [item, ...rows]);
    return { ok: true, data: item };
  }

  async linkSeriModel(payload: Record<string, any>) {
    return this.irsaliyeEslestir(payload);
  }

  linkSeriInvoice(payload: Record<string, any>) {
    const slug = this.resolveSeriCompanySlug(payload.mainCompanySlug, payload.mainCompanyId);
    const rows = this.invoiceLinks(slug);
    const item = {
      id: this.cleanText(payload.id) || `INV-${Date.now()}`,
      workCardId: this.cleanText(payload.workCardId),
      modelId: this.cleanText(payload.modelId),
      model: this.cleanText(payload.model || payload.modelAdi),
      firma: this.cleanText(payload.firma),
      siparisNo: this.cleanText(payload.siparisNo),
      irsaliyeNo: this.cleanText(payload.irsaliyeNo),
      faturaNo: this.cleanText(payload.faturaNo),
      faturaAdedi: this.parseNumber(payload.faturaAdedi || payload.adet),
      bizimSevkAdedi: this.parseNumber(payload.bizimSevkAdedi || payload.sevkAdedi),
      birimFiyat: this.parseNumber(payload.birimFiyat),
      createdAt: this.nowIso(),
    };
    this.db.writeMainCompanyStore(slug, "uretim.invoice-links", [item, ...rows]);
    return { ok: true, data: item };
  }

  async setSeriPrice(payload: Record<string, any>) {
    return this.irsaliyeEslestir({
      ...payload,
      adet: payload.adet || payload.irsaliyeAdedi || payload.gelenIrsaliye || 0,
      birimFiyat: payload.birimFiyat || payload.unitPrice,
    });
  }

  async getSeriHavuz(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const [entries, modelOptions] = await Promise.all([
      this.getSeriProductionEntries(slug),
      this.searchSeriModels(slug, query.modelSearch || query.search || query.q),
    ]);
    const irsaliyeGelenler = await this.buildDispatchRows(slug, entries);
    const imalatGirilenler = entries.map((entry) => {
      const linkedDispatch = irsaliyeGelenler.find(
        (row) =>
          this.normalizeKey(row.irsaliyeNo) === this.normalizeKey(entry.irsaliyeNo) ||
          (entry.modelId && this.normalizeKey(row.modelId) === this.normalizeKey(entry.modelId)),
      );
      const price = this.parseNumber(linkedDispatch?.birimFiyat || entry.birimFiyat);
      const invoice = this.parseNumber(linkedDispatch?.faturaKesilen);
      let durum = "İrsaliyesiz İmalat";
      if (linkedDispatch) durum = "İrsaliye Eşleşti";
      if (!price) durum = "Fiyat Yok";
      else if (linkedDispatch && invoice <= 0) durum = "Fatura Bekliyor";
      else if (linkedDispatch && invoice < this.parseNumber(linkedDispatch.irsaliyeAdedi)) durum = "Kısmi Kesildi";
      else if (linkedDispatch && invoice >= this.parseNumber(linkedDispatch.irsaliyeAdedi)) durum = "Tamamlandı";
      return { ...entry, durum, birimFiyat: price };
    });
    return {
      ok: true,
      data: {
        jobs: [],
        modelOptions,
        irsaliyeGelenler,
        imalatGirilenler,
        entries,
        summary: {
          modelSearchCount: modelOptions.length,
          dispatchCount: irsaliyeGelenler.length,
          productionCount: imalatGirilenler.length,
          missingPriceCount: irsaliyeGelenler.filter((row) => !row.birimFiyat).length,
        },
      },
    };
  }

  async hizliGiris(payload: Record<string, any>) {
    const slug = this.resolveSeriCompanySlug(payload.mainCompanySlug, payload.mainCompanyId);
    const required = [
      ["tarih", "Tarih"],
      ["makineNo", "Makine No"],
      ["modelId", "Model"],
      ["adet", "Adet"],
      ["vardiya", "Vardiya"],
      ["makinaci", "Makinaci"],
    ];
    for (const [field, label] of required) {
      if (!this.cleanText(payload[field]) && field !== "adet") {
        throw new BadRequestException(`${label} zorunludur.`);
      }
      if (field === "adet" && this.parseNumber(payload[field]) <= 0) {
        throw new BadRequestException("Adet 0'dan buyuk olmalidir.");
      }
    }
    return this.saveUretim({
      mainCompanySlug: slug,
      modelKaydiId: this.cleanText(payload.modelId),
      modelId: this.cleanText(payload.modelId),
      tarih: this.cleanText(payload.tarih),
      makina: this.cleanText(payload.makineNo),
      makinaAdi: this.cleanText(payload.makineAdi || payload.makineNo),
      vardiya: this.cleanText(payload.vardiya),
      sorumluPersonel: this.cleanText(payload.makinaci),
      uretimAdedi: this.parseNumber(payload.adet),
      firma: this.cleanText(payload.firma),
      modelAdi: this.cleanText(payload.model || payload.modelAdi),
      musteriIrsaliyeNo: this.cleanText(payload.irsaliyeNo || payload.siparisNo),
      grup: this.cleanText(payload.baskiBolgesi || payload.grup || payload.printArea || "Ön"),
      partiNo: this.cleanText(payload.partiNo || payload.batchNo || payload.seriNo),
      zemin: this.cleanText(payload.zemin || payload.zeminRenk),
      not: this.cleanText(payload.not),
      rawText: this.cleanText(payload.rawText),
      parseWarnings: Array.isArray(payload.parseWarnings) ? payload.parseWarnings : [],
      parseConfidence: this.parseNumber(payload.parseConfidence),
      requestId: this.cleanText(payload.requestId),
      clientId: this.cleanText(payload.clientId),
      ...(payload.birimFiyat !== undefined ? { birimFiyat: this.parseNumber(payload.birimFiyat) } : {}),
    } as any);
  }

  async getProductionParserDictionaries(mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const [models, machines] = await Promise.all([
      this.getModelKayitlari(slug, { activeOnly: true }),
      Promise.resolve(this.getImalatMachineRows(slug)),
    ]);
    const operators = new Map<string, any>();
    for (const machine of machines) {
      for (const name of [machine.gunduzMakinaci, machine.geceMakinaci]) {
        const clean = this.cleanText(name);
        if (clean) operators.set(this.normalizeKey(clean), { id: clean, name: clean, defaultMachineId: machine.id, defaultShift: clean === machine.geceMakinaci ? "Gece" : "Gündüz" });
      }
    }
    return { ok: true, data: {
      models: models.map((model: any) => ({ id: model.id, modelName: model.modelAdi || model.modelName, ground: model.zemin || model.zeminRenk || "", companyName: model.firma || model.firmaAdi || "", imageUrl: model.desenImageThumb || model.imageUrl || model.thumbnail || "", printRegions: this.regionNamesFromModel(model).map((regionName) => ({ regionName })) })),
      machines: machines.map((machine) => ({ id: machine.id, machineNo: machine.makineNo, machineName: machine.makineAdi, dayOperator: machine.gunduzMakinaci, nightOperator: machine.geceMakinaci })),
      operators: Array.from(operators.values()),
      regionAliases: { on: "Ön", "ön": "Ön", arka: "Arka", kol: "Kol", ense: "Ense", etek: "Etek", ust: "Üst", alt: "Alt", diger: "Diğer" },
      shiftAliases: { gunduz: "Gündüz", gun: "Gündüz", gece: "Gece", gec: "Gece" },
    }};
  }

  validateParsedProduction(payload: Record<string, any>) {
    const entry = payload.entry || payload;
    const errors: string[] = [];
    if (!this.cleanText(entry.date || entry.tarih)) errors.push("Tarih zorunludur.");
    if (!this.cleanText(entry.modelId)) errors.push("Model zorunludur.");
    if (!this.cleanText(entry.printRegion || entry.baskiBolgesi)) errors.push("Baskı bölgesi zorunludur.");
    if (this.parseNumber(entry.quantity || entry.adet) <= 0) errors.push("Adet 0'dan büyük olmalıdır.");
    if (!this.cleanText(entry.shift || entry.vardiya)) errors.push("Vardiya zorunludur.");
    if (!this.cleanText(entry.machineId || entry.machineName || entry.makineNo)) errors.push("Makine zorunludur.");
    if (!this.cleanText(entry.operatorId || entry.operatorName || entry.makinaci)) errors.push("Makinacı zorunludur.");
    return { ok: !errors.length, data: { valid: !errors.length, errors } };
  }

  async bulkCreateProduction(payload: Record<string, any>) {
    const slug = this.resolveSeriCompanySlug(payload.mainCompanySlug, payload.mainCompanyId);
    const requestId = this.cleanText(payload.requestId);
    if (!requestId) throw new BadRequestException("Toplu kayıt için requestId zorunludur.");
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    if (!entries.length) throw new BadRequestException("En az bir üretim satırı gönderin.");
    const existing = await (this.prisma as any).productionRecord.findMany({ where: { mainCompanySlug: slug }, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, raw: true } });
    const existingKeys = new Set(existing.map((row: any) => `${row.raw?.requestId || ""}:${row.raw?.clientId || ""}`));
    const success: any[] = []; const failed: any[] = []; const payloadKeys = new Set<string>();
    for (const entry of entries) {
      const clientId = this.cleanText(entry.clientId || entry.id);
      try {
        if (existingKeys.has(`${requestId}:${clientId}`)) { success.push({ clientId, duplicate: true }); continue; }
        const validation: any = this.validateParsedProduction(entry);
        if (!validation.data.valid) throw new BadRequestException(validation.data.errors.join(" "));
        const payloadKey = [entry.date, entry.modelId, entry.printRegion, entry.quantity, entry.shift, entry.machineId || entry.machineName, entry.operatorName || entry.operatorId]
          .map((value) => this.normalizeKey(value))
          .join("|");
        if (payloadKeys.has(payloadKey)) throw new BadRequestException("Aynı üretim satırı bu fişte birden fazla kez gönderildi.");
        payloadKeys.add(payloadKey);
        const saved: any = await this.hizliGiris({
          mainCompanySlug: slug, requestId, clientId, rawText: entry.rawText,
          parseWarnings: entry.warnings || entry.parseWarnings, parseConfidence: entry.confidence ?? entry.parseConfidence,
          tarih: entry.date, modelId: entry.modelId, model: entry.modelName, zemin: entry.ground,
          baskiBolgesi: entry.printRegion, adet: entry.quantity, vardiya: entry.shift,
          makineNo: entry.machineId || entry.machineName, makineAdi: entry.machineName,
          makinaci: entry.operatorName || entry.operatorId, irsaliyeNo: entry.dispatchNo || entry.irsaliyeNo,
        });
        success.push({ clientId, id: saved?.kayit?.id || saved?.id });
      } catch (error: any) { failed.push({ clientId, error: error?.message || "Kayıt reddedildi." }); }
    }
    return { ok: true, data: { requestId, success, failed } };
  }

  async getRecentProduction(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const rows = await this.getSeriProductionEntries(slug);
    return { ok: true, data: rows.slice(0, Math.min(100, Math.max(1, Number(query.limit || 20)))) };
  }

  async getModelGecmisi(id: string, mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const entries = await this.getSeriProductionEntries(slug);
    return { ok: true, data: entries.filter((entry) => this.normalizeKey(entry.modelId) === this.normalizeKey(id)) };
  }

  getMakineTanimlari(mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    return {
      ok: true,
      data: this.getImalatMachineRows(slug),
    };
  }

  saveMakineTanim(payload: Record<string, any>) {
    const slug = this.resolveSeriCompanySlug(payload.mainCompanySlug, payload.mainCompanyId);
    const currentRows = this.getMakinaRows(slug);
    const machineNo = this.cleanText(payload.makineNo || payload.id || payload.no);
    const current = currentRows.find((row) => this.normalizeKey(row.id) === this.normalizeKey(machineNo));
    return {
      ok: true,
      data: this.saveMakina({
        mainCompanySlug: slug,
        id: machineNo,
        ad: payload.makineAdi || payload.ad || payload.name,
        vardiya: payload.vardiya || current?.vardiya || "Gündüz",
        operator: payload.makinaci || payload.operator || payload.gunduzMakinaci || current?.operator,
        dayOperator: payload.gunduzMakinaci || payload.dayOperator || payload.dayMachinist || current?.dayOperator || current?.operator,
        nightOperator: payload.geceMakinaci || payload.nightOperator || payload.nightMachinist || current?.nightOperator,
        sortOrder: Number(payload.sortOrder ?? current?.sortOrder ?? 0),
        durum: payload.isActive === false ? "Pasif" : payload.durum || current?.durum || "Aktif",
        renkKapasitesi: payload.renkKapasitesi || 0,
      }),
    };
  }

  private getImalatMachineRows(mainCompanySlug: string): ImalatMachineRow[] {
    return this.getMakinaRows(mainCompanySlug)
      .map((row, index) => ({
        id: row.id,
        makineNo: row.id,
        makineAdi: row.ad,
        gunduzMakinaci: this.cleanText(row.dayOperator || row.operator),
        geceMakinaci: this.cleanText(row.nightOperator || row.operator),
        vardiya: row.vardiya,
        makinaci: row.operator,
        durum: row.durum || "Aktif",
        isActive: !["PASIF", "PASİF", "PASSIVE", "DELETED"].includes(this.normalizeKey(row.durum)),
        sortOrder: Number(row.sortOrder || index + 1),
        mainCompanyId: row.mainCompanyId,
        mainCompanySlug: row.mainCompanySlug,
        mainCompanyName: row.mainCompanyName,
      }))
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  getImalatMakineler(mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    return { ok: true, data: this.getImalatMachineRows(slug) };
  }

  patchImalatMakineDurum(machineId: string, payload: Record<string, any>) {
    const isActive = payload.isActive !== false && this.normalizeKey(payload.durum || "Aktif") !== "PASIF";
    return {
      ok: true,
      data: this.updateMakina(machineId, {
        ...payload,
        durum: isActive ? "Aktif" : "Pasif",
      }),
    };
  }

  getBaskiBolgesiTanimlari() {
    return {
      ok: true,
      data: this.standardPrintRegions.map((region, index) => ({
        id: region.code,
        code: region.code,
        name: region.name,
        regionCode: region.code,
        regionName: region.name,
        sortOrder: index + 1,
        isActive: true,
      })),
    };
  }

  async getImalatModelDetay(modelId: string, mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const model = await this.modelService.getById(modelId, slug);
    const operasyonOzet = await this.getImalatModelOperasyonOzet(modelId, slug);
    return { ok: true, data: { ...model, operasyonOzet: operasyonOzet.data } };
  }

  async getImalatModelOperasyonOzet(modelId: string, mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const rows = (await this.buildImalatOperationRows(slug, {})).filter(
      (row) => this.normalizeKey(row.modelId) === this.normalizeKey(modelId),
    );
    const completion = this.calculateCompletedByBatch(rows);
    return {
      ok: true,
      data: {
        toplamOperasyonAdedi: rows.reduce((sum, row) => sum + this.parseNumber(row.basilan), 0),
        tamamlananModelAdedi: completion.tamamlananModelAdedi,
        eksikOperasyon: rows.filter((row) => row.eksik > 0).length + completion.eksikOperasyon,
        rows,
      },
    };
  }

  async replaceImalatModelPrintRegions(modelId: string, payload: Record<string, any>) {
    return { ok: true, data: await this.modelService.replacePrintRegions(modelId, payload) };
  }

  async addImalatModelPrintRegion(modelId: string, payload: Record<string, any>) {
    return { ok: true, data: await this.modelService.addPrintRegion(modelId, payload) };
  }

  async patchImalatModelPrintRegion(modelId: string, regionId: string, payload: Record<string, any>) {
    return { ok: true, data: await this.modelService.patchPrintRegion(modelId, regionId, payload) };
  }

  async irsaliyeEslestir(payload: Record<string, any>) {
    const slug = this.resolveSeriCompanySlug(payload.mainCompanySlug, payload.mainCompanyId);
    const rows = this.db.readMainCompanyStore<any[]>(slug, "uretim.dispatch-links", []);
    const link = {
      id: `DL-${Date.now()}`,
      modelId: this.cleanText(payload.modelId),
      modelAdi: this.cleanText(payload.modelAdi || payload.model || payload.modelName),
      irsaliyeNo: this.cleanText(payload.irsaliyeNo),
      siparisNo: this.cleanText(payload.siparisNo),
      tarih: this.cleanText(payload.tarih || this.today()),
      adet: this.parseNumber(payload.adet),
      birimFiyat: this.parseNumber(payload.birimFiyat),
      createdAt: this.nowIso(),
    };
    this.db.writeMainCompanyStore(slug, "uretim.dispatch-links", [link, ...rows]);
    return { ok: true, data: link };
  }

  async isKapat(payload: Record<string, any>) {
    const slug = this.resolveSeriCompanySlug(payload.mainCompanySlug, payload.mainCompanyId);
    const rows = this.db.readMainCompanyStore<any[]>(slug, "uretim.closed-jobs", []);
    const item = {
      id: `CL-${Date.now()}`,
      modelId: this.cleanText(payload.modelId || payload.id),
      note: this.cleanText(payload.not),
      status: "COMPLETED",
      closedAt: this.nowIso(),
    };
    this.db.writeMainCompanyStore(slug, "uretim.closed-jobs", [item, ...rows]);
    return { ok: true, data: item };
  }

  async getSeriRapor(mainCompanySlug?: string, mainCompanyId?: string, query: Record<string, any> = {}) {
    const slug = this.resolveSeriCompanySlug(mainCompanySlug, mainCompanyId);
    const jobsPayload = await this.getSeriHavuz(slug, undefined, {});
    const jobs = jobsPayload.data.jobs;
    const jobById = new Map(jobs.map((job: any) => [this.normalizeKey(job.id), job]));
    const entries = (await this.getSeriProductionEntries(slug)).filter((entry) => {
      if (query.baslangic && entry.tarih < query.baslangic) return false;
      if (query.bitis && entry.tarih > query.bitis) return false;
      if (query.model && !this.normalizeKey(entry.model).includes(this.normalizeKey(query.model))) return false;
      if (query.makine && !this.normalizeKey(entry.makineNo).includes(this.normalizeKey(query.makine))) return false;
      if (query.makinaci && !this.normalizeKey(entry.makinaci).includes(this.normalizeKey(query.makinaci))) return false;
      if (query.vardiya && this.normalizeKey(entry.vardiya) !== this.normalizeKey(query.vardiya)) return false;
      return true;
    });
    return {
      ok: true,
      data: entries.map((entry) => {
        const job = jobById.get(this.normalizeKey(entry.modelId)) || {};
        const price = this.parseNumber(entry.birimFiyat || job.birimFiyat);
        return {
          tarih: entry.tarih,
          firma: job.firma || "",
          model: entry.model || job.model || "",
          siparis: entry.siparisNo || job.siparisNo || "",
          adet: entry.adet,
          makine: entry.makineNo,
          makinaci: entry.makinaci,
          vardiya: entry.vardiya,
          birimFiyat: price,
          tutar: entry.adet * price,
          durum: job.durum || entry.durum,
          irsaliye: entry.irsaliyeNo || job.irsaliyeNo || "",
        };
      }),
    };
  }

  async linkProductionToModel(id: string, payload: Partial<UretimRow>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const modelKaydiId = this.cleanText(
      (payload as any).modelKaydiId || (payload as any).modelId,
    );
    if (!modelKaydiId) {
      throw new BadRequestException("Bağlanacak model kaydı ID zorunludur.");
    }
    const modelKaydi = (await this.buildModelOzetleri(company.slug)).find(
      (item) => item.id === modelKaydiId,
    );
    if (!modelKaydi) {
      throw new BadRequestException("Seçilen model kaydı bulunamadı.");
    }
    const rows = this.getUretimRows(company.slug);
    const index = rows.findIndex((item) => String(item.id) === String(id));
    if (index < 0) {
      throw new BadRequestException("Üretim kaydı bulunamadı.");
    }
    const updated: UretimRow = {
      ...rows[index],
      modelKaydiId,
      modelAdi: modelKaydi.modelAdi,
      musteriIrsaliyeNo: modelKaydi.musteriIrsaliyeNo,
      zemin: modelKaydi.zemin || "",
      firma: modelKaydi.firma,
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    const nextRows = [...rows];
    nextRows[index] = updated;
    this.saveUretimRows(company.slug, nextRows);
    return { ok: true, kayit: updated, modelKaydi };
  }

  async saveUretim(payload: Partial<UretimRow>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const modelKaydiId = this.cleanText(
      payload.modelKaydiId || (payload as any).modelId,
    );
    if (!modelKaydiId) {
      throw new BadRequestException(
        "Model kaydı seçmeden üretim kaydı yapılamaz.",
      );
    }

    let modelKaydi: any = (await this.buildModelOzetleri(company.slug)).find(
      (item) => item.id === modelKaydiId,
    );
    if (!modelKaydi) {
      try {
        const sharedModel = await this.modelService.getById(
          modelKaydiId,
          company.slug,
        );
        modelKaydi = {
          id: sharedModel.id,
          modelAdi: sharedModel.modelAdi,
          firma:
            sharedModel.firmaAdi ||
            sharedModel.musteriFirma ||
            this.cleanText((payload as any).firmaAdi || payload.firma),
          firmaId: sharedModel.firmaId || "",
          musteriIrsaliyeNo: sharedModel.siparisNo || "",
          zemin: sharedModel.zeminRenk || "",
        };
      } catch {
        throw new BadRequestException("Seçilen model kaydı bulunamadı.");
      }
    }
    if (!this.cleanText(modelKaydi.modelAdi)) {
      throw new BadRequestException(
        "Boş model adı ile üretim kaydı oluşturulamaz.",
      );
    }
    if (!this.cleanText(payload.firma || modelKaydi.firma)) {
      throw new BadRequestException(
        "Ana firma bağlamı olmayan üretim kaydı kabul edilmez.",
      );
    }

    const rows = this.getUretimRows(company.slug);
    const uretimAdedi = this.parseNumber(payload.uretimAdedi);
    const hataliAdet = this.parseNumber(payload.hataliAdet);
    const baskiHatasiAdet = this.parseNumber(
      (payload as any).baskiHatasiAdet ?? (payload as any).printDefectQty,
    );
    const kumasHatasiAdet = this.parseNumber(
      (payload as any).kumasHatasiAdet ?? (payload as any).fabricDefectQty,
    );
    const finalHataliAdet =
      payload.hataliAdet !== undefined
        ? hataliAdet
        : baskiHatasiAdet + kumasHatasiAdet;
    if (!this.cleanText(payload.tarih || this.today())) {
      throw new BadRequestException("Tarih zorunludur.");
    }
    if (uretimAdedi <= 0) {
      throw new BadRequestException("Üretim adedi 0'dan büyük olmalıdır.");
    }
    if (!this.cleanText(payload.makina)) {
      throw new BadRequestException("Makina zorunludur.");
    }
    if (!this.cleanText(payload.vardiya)) {
      throw new BadRequestException("Vardiya zorunludur.");
    }
    const requestedPlanLineId = this.cleanText((payload as any).planLineId);

    const cleanOrderNo = this.cleanText(
      payload.musteriIrsaliyeNo || modelKaydi.musteriIrsaliyeNo,
    );
    const cleanPrintArea = this.cleanText(payload.grup || "Diger") || "Diger";
    const trackingKey = this.buildProductionTrackingKey(
      modelKaydi.modelAdi,
      this.cleanText(payload.tarih || this.today()),
      cleanOrderNo,
      cleanPrintArea,
    );

    const newRow: UretimRow = {
      id: Date.now(),
      tarih: this.cleanText(payload.tarih || this.today()),
      firma: this.cleanText(
        payload.firma || (payload as any).firmaAdi || modelKaydi.firma,
      ),
      firmaId: this.cleanText(
        (payload as any).firmaId || (modelKaydi as any).firmaId,
      ),
      makina: this.cleanText(payload.makina || (payload as any).makinaAdi),
      makinaId: this.cleanText((payload as any).makinaId),
      vardiya: this.cleanText(payload.vardiya || "Gündüz"),
      modelId: modelKaydi.id,
      modelKaydiId: modelKaydi.id,
      modelAdi: modelKaydi.modelAdi,
      musteriIrsaliyeNo: cleanOrderNo,
      zemin: modelKaydi.zemin || "",
      grup: cleanPrintArea,
      uretimAdedi,
      fireAdedi: this.parseNumber(
        (payload as any).fireAdedi ?? payload.hataliAdet,
      ),
      netAdet: this.parseNumber(
        (payload as any).netAdet || uretimAdedi - finalHataliAdet,
      ),
      hataliAdet: finalHataliAdet,
      baskiHatasiAdet,
      kumasHatasiAdet,
      sorumluPersonel: this.cleanText((payload as any).sorumluPersonel),
      yardimciPersonel: this.cleanText((payload as any).yardimciPersonel),
      not: this.cleanText(payload.not || (payload as any).aciklama || ""),
      aciklama: this.cleanText((payload as any).aciklama || payload.not || ""),
      durum: "Kaydedildi",
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    (newRow as any).trackingKey = trackingKey;
    (newRow as any).planLineId = requestedPlanLineId;
    (newRow as any).partiNo = this.cleanText((payload as any).partiNo || (payload as any).batchNo || (payload as any).seriNo);
    (newRow as any).makineNo = this.cleanText(payload.makina);
    (newRow as any).makineAdi = this.cleanText((payload as any).makinaAdi || payload.makina);
    (newRow as any).baskiBolgesi = cleanPrintArea;
    (newRow as any).rawText = this.cleanText((payload as any).rawText);
    (newRow as any).parseWarnings = Array.isArray((payload as any).parseWarnings) ? (payload as any).parseWarnings : [];
    (newRow as any).parseConfidence = this.parseNumber((payload as any).parseConfidence);
    (newRow as any).requestId = this.cleanText((payload as any).requestId);
    (newRow as any).clientId = this.cleanText((payload as any).clientId);

    const existingRows = await (this.prisma as any).productionRecord.findMany({
      where: {
        mainCompanySlug: company.slug,
        modelId: modelKaydi.id,
        orderNo: this.cleanText(newRow.musteriIrsaliyeNo),
      },
      orderBy: [{ productionDate: "desc" }, { createdAt: "desc" }],
    });

    const sameDayExisting = existingRows.find((item: any) => {
      const mapped = this.mapSqlProduction(item);
      const mappedTrackingKey =
        (mapped as any)?.trackingKey ||
        this.buildProductionTrackingKey(
          mapped.modelAdi,
          mapped.tarih,
          mapped.musteriIrsaliyeNo,
          mapped.grup || "Diger",
        );
      return mappedTrackingKey === trackingKey;
    });

    let created: any;
    if (sameDayExisting) {
      const mapped = this.mapSqlProduction(sameDayExisting);
      const nextProduced = this.parseNumber(mapped.uretimAdedi) + this.parseNumber(newRow.uretimAdedi);
      const nextPrintDefect =
        this.parseNumber(mapped.baskiHatasiAdet) + this.parseNumber(newRow.baskiHatasiAdet);
      const nextFabricDefect =
        this.parseNumber(mapped.kumasHatasiAdet) + this.parseNumber(newRow.kumasHatasiAdet);
      const nextDefect = this.parseNumber(mapped.hataliAdet) + this.parseNumber(newRow.hataliAdet);
      const nextRaw = {
        ...(sameDayExisting.raw || {}),
        ...mapped,
        trackingKey,
        uretimAdedi: nextProduced,
        baskiHatasiAdet: nextPrintDefect,
        kumasHatasiAdet: nextFabricDefect,
        hataliAdet: nextDefect,
        netAdet: Math.max(0, nextProduced - nextDefect),
        not: [this.cleanText(mapped.not), this.cleanText(newRow.not)]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 1500),
      };
      created = await (this.prisma as any).productionRecord.update({
        where: { id: sameDayExisting.id },
        data: {
          totalQuantity: Math.round(nextRaw.netAdet || nextProduced),
          printDefect: String(nextPrintDefect),
          fabricDefect: String(nextFabricDefect),
          note: nextRaw.not || null,
          raw: nextRaw,
        },
      });
    } else {
      created = await (this.prisma as any).productionRecord.create({
        data: {
          mainCompanySlug: company.slug,
          modelId: modelKaydi.id,
          modelName: modelKaydi.modelAdi,
          orderNo: this.cleanText(newRow.musteriIrsaliyeNo),
          groundColor: this.cleanText(newRow.zemin),
          machineName: this.cleanText(newRow.makina),
          totalQuantity: Math.round(newRow.netAdet || newRow.uretimAdedi || 0),
          machinist: newRow.sorumluPersonel || null,
          assistant: newRow.yardimciPersonel || null,
          printDefect: String(this.parseNumber(newRow.baskiHatasiAdet || 0)),
          fabricDefect: String(this.parseNumber(newRow.kumasHatasiAdet || 0)),
          shift: newRow.vardiya,
          productionDate: new Date(newRow.tarih),
          note: newRow.not || null,
          raw: newRow,
        },
      });
    }

    const planLineId = requestedPlanLineId;
    if (planLineId) {
      const planLine = await (this.prisma as any).productionPlanLine
        .findFirst({
          where: {
            id: planLineId,
            mainCompanySlug: company.slug,
            modelId: modelKaydi.id,
          },
        })
        .catch(() => null);
      if (planLine) {
        const nextProduced =
          this.parseNumber(planLine.producedQty) + this.parseNumber(newRow.netAdet || newRow.uretimAdedi);
        const expectedQty = this.parseNumber(planLine.expectedQty);
        const nextWaste =
          this.parseNumber(planLine.wasteQty) + this.parseNumber(newRow.hataliAdet);
        const nextStatus =
          expectedQty > 0 && nextProduced >= expectedQty
            ? "COMPLETED"
            : nextProduced > 0
              ? "PARTIAL"
              : "WAITING";
        await (this.prisma as any).productionPlanLine.update({
          where: { id: planLine.id },
          data: {
            producedQty: nextProduced,
            wasteQty: nextWaste,
            status: nextStatus,
          },
        });
      }
    }

    const next = [newRow, ...rows];
    this.saveUretimRows(company.slug, next);
    const savedRow = this.mapSqlProduction(created);
    return {
      kayit: savedRow,
      modelKaydi: (await this.getModelKayitlari(company.slug)).find(
        (item) => item.id === modelKaydi.id,
      ),
    };
  }

  getKaliteKayitlari(mainCompanySlug: string) {
    return this.getKaliteRows(this.requireMainCompany(mainCompanySlug).slug);
  }

  saveKalite(payload: Partial<KaliteRow>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const rows = this.getKaliteRows(company.slug);
    const newRow: KaliteRow = {
      id: Date.now(),
      tarih: this.cleanText(payload.tarih || this.today()),
      modelKaydiId: this.cleanText(payload.modelKaydiId || ""),
      model: this.cleanText(payload.model || ""),
      makina: this.cleanText(payload.makina || ""),
      seviye: this.cleanText(payload.seviye || "Bilgi"),
      aciklama: this.cleanText(payload.aciklama || ""),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    const next = [newRow, ...rows];
    this.saveKaliteRows(company.slug, next);
    return newRow;
  }

  async excel(type: string, mainCompanySlug: string) {
    const slug = this.requireMainCompany(mainCompanySlug).slug;
    if (type === "makinalar") {
      return this.db.buildExcelBuffer(this.getMakinaRows(slug), "Makinalar");
    }
    if (type === "kalite") {
      return this.db.buildExcelBuffer(
        this.getKaliteRows(slug),
        "KaliteKayitlari",
      );
    }
    if (type === "model-kayitlari") {
      return this.db.buildExcelBuffer(
        await this.getModelKayitlari(slug),
        "ModelTakip",
      );
    }
    return this.db.buildExcelBuffer(
      this.getUretimRows(slug),
      "UretimKayitlari",
    );
  }
}
