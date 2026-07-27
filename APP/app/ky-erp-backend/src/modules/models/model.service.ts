import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../../prisma/prisma.service";

type Query = Record<string, any>;

const MODEL_FILE_ROOT = "MODEL_FILE_ROOT";
const MODEL_PREVIEW_ROOT = "MODEL_PREVIEW_ROOT";
const DEFAULT_MODEL_FILE_ROOT =
  "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\desen\\model-dosyalari";
const DEFAULT_MODEL_PREVIEW_ROOT =
  "D:\\onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\desen\\onizleme-gorseller";
const DEFAULT_PRINT_REGION_NAME = "Ön Baskı";

@Injectable()
export class ModelService {
  constructor(private readonly prisma: PrismaService) {}

  private cleanText(value: unknown) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeModelName(value: unknown) {
    return this.cleanText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/Ä°/g, "I")
      .replace(/Ä±/g, "I")
      .replace(/Ä/g, "G")
      .replace(/Ãœ/g, "U")
      .replace(/Å/g, "S")
      .replace(/Ã–/g, "O")
      .replace(/Ã‡/g, "C")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private async resolveMainCompanyId(mainCompanySlug: string) {
    const company = await (this.prisma as any).mainCompany.findFirst({
      where: { OR: [{ id: mainCompanySlug }, { slug: mainCompanySlug }] },
      select: { id: true, slug: true },
    });
    return company?.id || "";
  }

  private async listStorageModels(mainCompanySlug: string) {
    const mainCompanyId = await this.resolveMainCompanyId(mainCompanySlug);
    if (!mainCompanyId) return [];
    const rule = await (this.prisma as any).fileStorageRule.findUnique({
      where: {
        mainCompanyId_module_documentType: {
          mainCompanyId,
          module: "DESEN",
          documentType: "DESEN_GORSEL",
        },
      },
      select: { watchSourcePath: true },
    });
    const watchRoot = this.cleanText(rule?.watchSourcePath).toLocaleLowerCase("tr-TR");
    let files = await (this.prisma as any).storedFile.findMany({
      where: {
        mainCompanyId,
        module: "DESEN",
        documentType: "DESEN_GORSEL",
        isDeleted: false,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 5000,
    });
    if (watchRoot) {
      files = files.filter((file: any) => {
        const sourcePath = String(file.sourcePath || "").trim();
        if (!sourcePath) return true;
        return (
          sourcePath.toLocaleLowerCase("tr-TR").startsWith(watchRoot) &&
          fs.existsSync(sourcePath)
        );
      });
      const uniqueBySourcePath = new Map<string, any>();
      files.forEach((file: any) => {
        const sourcePath = String(file.sourcePath || "").trim();
        if (sourcePath && !uniqueBySourcePath.has(sourcePath)) {
          uniqueBySourcePath.set(sourcePath, file);
        }
      });
      files = Array.from(uniqueBySourcePath.values());
    }
    return files.map((file: any) => {
      const modelName = this.cleanText(
        file.ownerId || path.parse(file.originalFileName || "").name,
      );
      const imageUrl = this.cleanText(file.thumbnailPath || file.publicUrl);
      return {
        id: `desen-${file.id}`,
        modelId: `desen-${file.id}`,
        sourceStoredFileId: file.id,
        anaFirmaId: mainCompanySlug,
        mainCompanySlug,
        modelName,
        modelAdi: modelName,
        name: modelName,
        title: modelName,
        firmaId: "",
        companyId: "",
        firmId: "",
        firmaAdi: "",
        firmName: "",
        musteriFirma: "",
        sezon: "",
        zeminRenk: "",
        baskiBolgesi: DEFAULT_PRINT_REGION_NAME,
        printRegions: this.normalizePrintRegions([]),
        baskiBolgeleri: this.normalizePrintRegions([]),
        activePrintRegions: this.normalizePrintRegions([]),
        modelCode: "",
        modelKodu: "",
        orderNo: "",
        siparisNo: "",
        imageUrl,
        thumbnail: imageUrl,
        desenImageThumb: imageUrl,
        desenImageOriginal: this.cleanText(file.publicUrl || imageUrl),
        kanalImageThumb: "",
        thumbPath: imageUrl,
        originalPath: this.cleanText(file.sourcePath || file.absolutePath),
        modelFolderPath: "",
        folderName: this.safeFolderName(modelName),
        desenGorseli: imageUrl,
        files: [],
        images: imageUrl ? [{ url: imageUrl, path: imageUrl, note: "desen-storage" }] : [],
        productionQty: 0,
        renkSayisi: 0,
        durum: "ACTIVE",
        toplamUretimAdedi: 0,
        status: "ACTIVE",
        deletedAt: null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        isFromDesenStorage: true,
      };
    });
  }

  private safeFolderName(value: unknown) {
    const cleaned =
      this.normalizeModelName(value)
        .replace(/[\\/:*?"<>|]/g, " ")
        .trim() || "MODEL";
    return cleaned.replace(/\s+/g, " ");
  }

  private safeFilePart(value: unknown) {
    return this.safeFolderName(value).replace(/\s+/g, "_");
  }

  private regionCode(value: unknown) {
    return (
      this.normalizeModelName(value)
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .trim() || "BOLGE"
    );
  }

  private normalizePrintRegions(value: any) {
    const source = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value
            .split(/[,;+|]/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    const rows = source.length ? source : [DEFAULT_PRINT_REGION_NAME];
    const seen = new Set<string>();
    return rows
      .map((item: any, index: number) => {
        const regionName = this.cleanText(
          typeof item === "string"
            ? item
            : item.regionName || item.name || item.label || item.bolge || item.printArea,
        );
        if (!regionName) return null;
        const regionCode = this.regionCode(
          typeof item === "string" ? regionName : item.regionCode || item.code || regionName,
        );
        const key = regionCode.toLocaleUpperCase("tr-TR");
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          id:
            (typeof item === "object" && item.id) ||
            `${regionCode}-${index + 1}`,
          regionCode,
          regionName,
          sortOrder: Number(
            typeof item === "object" ? item.sortOrder ?? item.order ?? index + 1 : index + 1,
          ),
          isActive:
            typeof item === "object" && item.isActive !== undefined
              ? item.isActive !== false
              : true,
          createdAt:
            typeof item === "object" && item.createdAt
              ? item.createdAt
              : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }

  private isCustomerType(value: unknown) {
    const type = this.normalizeModelName(value);
    return type === "MUSTERI" || type === "CUSTOMER";
  }

  private fileHash(buffer: Buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  private timestamp() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${date}_${hh}${mm}`;
  }

  private ensureDir(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private uniquePath(dir: string, fileName: string) {
    const parsed = path.parse(fileName);
    let candidate = path.join(dir, fileName);
    let index = 2;
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${parsed.name}_${index}${parsed.ext}`);
      index += 1;
    }
    return candidate;
  }

  private storageUrl(fullPath: string) {
    const storageRoot = path.join(process.cwd(), "storage");
    const relative = path.relative(storageRoot, fullPath).replace(/\\/g, "/");
    return `/storage/${relative}`;
  }

  private async ensureModelFolderSettings(mainCompanySlug: string) {
    const defaults = [
      {
        folderKey: MODEL_FILE_ROOT,
        folderName: "Model Dosya KÃ¶k KlasÃ¶rÃ¼",
        folderPath: DEFAULT_MODEL_FILE_ROOT,
        targetType: "MODEL_FILES_ROOT",
        targetModule: "MODEL_TAKIP",
      },
      {
        folderKey: MODEL_PREVIEW_ROOT,
        folderName: "Kart Ã–nizleme GÃ¶rsel KlasÃ¶rÃ¼",
        folderPath: DEFAULT_MODEL_PREVIEW_ROOT,
        targetType: "MODEL_PREVIEW_ROOT",
        targetModule: "MODEL_TAKIP",
      },
    ];
    for (const item of defaults) {
      await (this.prisma as any).documentFolderSetting.upsert({
        where: {
          mainCompanySlug_folderKey: {
            mainCompanySlug,
            folderKey: item.folderKey,
          },
        },
        update: {},
        create: {
          mainCompanySlug,
          ...item,
          active: true,
        },
      });
    }
  }

  private async modelRoots(mainCompanySlug: string) {
    await this.ensureModelFolderSettings(mainCompanySlug);
    const rows = await (this.prisma as any).documentFolderSetting.findMany({
      where: {
        mainCompanySlug,
        folderKey: { in: [MODEL_FILE_ROOT, MODEL_PREVIEW_ROOT] },
        deletedAt: null,
      },
    });
    const byKey = new Map(
      rows.map((row: any) => [row.folderKey, row.folderPath]),
    );
    const fileRoot =
      this.cleanText(byKey.get(MODEL_FILE_ROOT)) || DEFAULT_MODEL_FILE_ROOT;
    const previewRoot =
      this.cleanText(byKey.get(MODEL_PREVIEW_ROOT)) ||
      DEFAULT_MODEL_PREVIEW_ROOT;
    this.ensureDir(fileRoot);
    this.ensureDir(previewRoot);
    return { fileRoot, previewRoot };
  }

  private async ensureModelFolder(mainCompanySlug: string, modelName: string) {
    const roots = await this.modelRoots(mainCompanySlug);
    const folderName = this.safeFolderName(modelName);
    const modelFolderPath = path.join(roots.fileRoot, folderName);
    this.ensureDir(modelFolderPath);
    return {
      ...roots,
      folderName,
      modelFolderPath,
      relativeFolderPath: folderName,
    };
  }

  private async requireCustomerCompany(
    mainCompanySlug: string,
    payload: Query,
  ) {
    const companyId = this.firmId(payload);
    if (!companyId) {
      throw new BadRequestException(
        "Model kaydÄ± iÃ§in mÃ¼ÅŸteri firma seÃ§melisiniz.",
      );
    }
    const company = await (this.prisma as any).company.findFirst({
      where: {
        id: companyId,
        mainCompanySlug,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!company || !this.isCustomerType(company.type)) {
      throw new BadRequestException(
        "Model kaydÄ± iÃ§in mÃ¼ÅŸteri firma seÃ§melisiniz.",
      );
    }
    return company;
  }

  private async resolveOptionalCustomerCompany(
    mainCompanySlug: string,
    payload: Query,
  ) {
    const companyId = this.firmId(payload);
    if (!companyId) return null;
    return this.requireCustomerCompany(mainCompanySlug, payload);
  }

  private requireSlug(value: unknown) {
    const slug = this.cleanText(value);
    if (!slug) {
      throw new BadRequestException("mainCompanySlug zorunludur.");
    }
    return slug;
  }

  private modelName(payload: Query) {
    return this.cleanText(
      payload.modelName ||
        payload.modelAdi ||
        payload.name ||
        payload.title ||
        payload.ad,
    );
  }

  private firmId(payload: Query) {
    return this.cleanText(
      payload.firmaId ||
        payload.firmId ||
        payload.customerFirmId ||
        payload.companyId ||
        payload.musteriFirmaId,
    );
  }

  private firmName(payload: Query) {
    return this.cleanText(
      payload.firmaAdi ||
        payload.firma ||
        payload.musteriFirma ||
        payload.customerName ||
        payload.companyName,
    );
  }

  private dateMillis(value: unknown) {
    const raw = this.cleanText(value);
    if (!raw) return 0;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  private modelSortTime(row: any) {
    return (
      this.dateMillis(row?.createdAt) ||
      this.dateMillis(row?.created_at) ||
      this.dateMillis(row?.updatedAt) ||
      this.dateMillis(row?.updated_at)
    );
  }

  private sortModelRows(rows: any[]) {
    return [...rows].sort((a: any, b: any) => {
      const dateDiff = this.modelSortTime(b) - this.modelSortTime(a);
      if (dateDiff) return dateDiff;
      return String(a?.modelName || a?.modelAdi || "").localeCompare(
        String(b?.modelName || b?.modelAdi || ""),
        "tr",
        { sensitivity: "base" },
      );
    });
  }

  private map(row: any) {
    const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
    const imageUrl =
      raw.thumbUrl ||
      raw.previewUrl ||
      raw.imageUrl ||
      raw.thumbnail ||
      raw.thumbnailPath ||
      raw.desenGorseli ||
      raw.previewPath ||
      "";
    const images = Array.isArray(raw.images)
      ? raw.images
      : imageUrl
        ? [{ url: imageUrl, path: imageUrl }]
        : [];
    const printRegions = this.normalizePrintRegions(
      raw.printRegions || raw.baskiBolgeleri || raw.baskiBolgesi || raw.printArea,
    );
    return {
      ...raw,
      id: row.id,
      modelId: row.id,
      anaFirmaId: raw.anaFirmaId || row.mainCompanySlug,
      mainCompanySlug: row.mainCompanySlug,
      modelName: row.modelName,
      modelAdi: row.modelName,
      name: row.modelName,
      title: row.modelName,
      firmaId: raw.firmaId || raw.firmId || raw.companyId || "",
      companyId: raw.companyId || raw.firmaId || raw.firmId || "",
      firmId: raw.firmaId || raw.firmId || raw.companyId || "",
      firmaAdi:
        raw.firmaAdi ||
        raw.firma ||
        raw.musteriFirma ||
        raw.customerName ||
        raw.companyName ||
        "",
      firmName:
        raw.firmaAdi ||
        raw.firma ||
        raw.musteriFirma ||
        raw.customerName ||
        raw.companyName ||
        "",
      musteriFirma:
        raw.firmaAdi ||
        raw.firma ||
        raw.musteriFirma ||
        raw.customerName ||
        raw.companyName ||
        "",
      sezon: raw.sezon || raw.season || "",
      zeminRenk: raw.zeminRenk || raw.zemin || raw.groundColor || "",
      baskiBolgesi: raw.baskiBolgesi || raw.printArea || DEFAULT_PRINT_REGION_NAME,
      printRegions,
      baskiBolgeleri: printRegions,
      activePrintRegions: printRegions.filter((region: any) => region.isActive !== false),
      modelCode: row.modelCode || "",
      modelKodu: row.modelCode || "",
      orderNo: row.orderNo || "",
      siparisNo: row.orderNo || "",
      imageUrl,
      thumbnail: imageUrl,
      desenImageThumb: raw.desenImageThumb || imageUrl,
      kanalImageThumb: raw.kanalImageThumb || raw.kanalThumb || "",
      thumbPath: raw.thumbPath || raw.previewRelativePath || "",
      originalPath: raw.originalPath || "",
      modelFolderPath: raw.modelFolderPath || "",
      folderName: raw.folderName || this.safeFolderName(row.modelName),
      desenGorseli: raw.desenGorseli || imageUrl,
      files: Array.isArray(raw.files) ? raw.files : [],
      images,
      productionQty: Number(raw.productionQty || raw.uretimAdedi || 0),
      renkSayisi: Number(raw.renkSayisi || raw.renkAdedi || 0),
      durum: raw.durum || row.status || "ACTIVE",
      toplamUretimAdedi: Number(
        raw.toplamUretimAdedi || raw.productionQty || 0,
      ),
      status: row.status,
      deletedAt: raw.deletedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async enrich(rows: any[]) {
    if (!rows.length) return rows;
    const ids = rows.map((row) => row.id).filter(Boolean);
    const mainCompanySlug = rows[0]?.mainCompanySlug || "";
    const [imageRows, productionRows, salesInvoiceLinks] = await Promise.all([
      (this.prisma as any).modelImage.findMany({
        where: { mainCompanySlug, modelId: { in: ids } },
        orderBy: { createdAt: "desc" },
      }),
      (this.prisma as any).productionRecord.findMany({
        where: { mainCompanySlug, modelId: { in: ids } },
        orderBy: { productionDate: "desc" },
      }),
      (this.prisma as any).salesInvoiceLineModelLink.findMany({
        where: { mainCompanySlug, modelId: { in: ids } },
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
    ]);
    const imagesByModel = new Map<string, any[]>();
    for (const image of imageRows || []) {
      const list = imagesByModel.get(image.modelId) || [];
      const note = (() => {
        try {
          return image.note ? JSON.parse(image.note) : {};
        } catch {
          return {};
        }
      })();
      list.push({
        id: image.id,
        url: image.thumbnailPath || image.filePath,
        path: image.thumbnailPath || image.filePath,
        originalPath: image.filePath,
        thumbnailPath: image.thumbnailPath || image.filePath,
        name: note.originalFileName || note.fileName || "GÃ¶rsel",
        uploadedAt: image.createdAt,
      });
      imagesByModel.set(image.modelId, list);
    }
    const productionByModel = new Map<string, { qty: number; rows: any[] }>();
    for (const production of productionRows || []) {
      const bucket = productionByModel.get(production.modelId) || {
        qty: 0,
        rows: [],
      };
      bucket.qty += Number(production.totalQuantity || 0);
      bucket.rows.push(production);
      productionByModel.set(production.modelId, bucket);
    }
    const salesInvoicesByModel = new Map<string, { qty: number; rows: any[] }>();
    for (const link of salesInvoiceLinks || []) {
      const bucket = salesInvoicesByModel.get(link.modelId) || {
        qty: 0,
        rows: [],
      };
      bucket.qty += Number(link.matchedQuantity || 0);
      bucket.rows.push({
        id: link.id,
        invoiceId: link.invoiceId,
        invoiceLineId: link.invoiceLineId,
        printRegionId: link.printRegionId,
        printRegionName: link.printRegionName,
        matchedQuantity: Number(link.matchedQuantity || 0),
        createdAt: link.createdAt,
      });
      salesInvoicesByModel.set(link.modelId, bucket);
    }

    return rows.map((row) => {
      const storedImages = imagesByModel.get(row.id) || [];
      const mergedImages = [
        ...storedImages,
        ...(Array.isArray(row.images) ? row.images : []),
      ].filter(Boolean);
      const firstImage = mergedImages[0];
      const firstUrl =
        (typeof firstImage === "string" ? firstImage : firstImage?.url) ||
        row.imageUrl ||
        "";
      const production = productionByModel.get(row.id);
      const productionQty =
        production?.qty ??
        Number(row.productionQty || row.toplamUretimAdedi || 0);
      const salesInvoice = salesInvoicesByModel.get(row.id);
      const salesInvoiceQty = Number(salesInvoice?.qty || 0);
      return {
        ...row,
        imageUrl: firstUrl,
        thumbnail: firstUrl,
        desenGorseli: row.desenGorseli || firstUrl,
        images: mergedImages,
        productionQty,
        uretimAdedi: productionQty,
        toplamUretimAdedi: productionQty,
        productionHistory: production?.rows || [],
        faturaAdedi: salesInvoiceQty,
        kesilenFaturaAdedi: salesInvoiceQty,
        toplamFaturaAdedi: salesInvoiceQty,
        totalInvoiceQty: salesInvoiceQty,
        invoicedQty: salesInvoiceQty,
        salesInvoiceLineLinks: salesInvoice?.rows || [],
      };
    });
  }

  async list(query: Query = {}) {
    const mainCompanySlug = this.requireSlug(
      query.mainCompanySlug || query.mainCompanyId,
    );
    const q = this.cleanText(query.q || query.search || query.term);
    const where: any = { mainCompanySlug, NOT: { status: "ARCHIVED" } };
    if (q) {
      where.OR = [
        { modelName: { contains: q } },
        { modelCode: { contains: q } },
        { orderNo: { contains: q } },
      ];
    }
    if (query.status) {
      where.status = this.cleanText(query.status);
    }

    const page = Math.max(1, Number(query.page || 1) || 1);
    const pageSize = Math.min(
      5000,
      Math.max(1, Number(query.pageSize || query.limit || 50) || 50),
    );
    const customerOnly = String(query.customerOnly || "").toLowerCase() === "true";
    const [rows, archivedRows, customerCompanies] = await Promise.all([
      (this.prisma as any).modelRecord.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }, { modelName: "asc" }],
        take: Math.max(250, pageSize * 5),
      }),
      (this.prisma as any).modelRecord.findMany({
        where: { mainCompanySlug, status: "ARCHIVED" },
        select: { modelName: true, modelCode: true, orderNo: true, raw: true },
        take: 5000,
      }),
      customerOnly
        ? (this.prisma as any).company.findMany({
            where: { mainCompanySlug, isActive: true, deletedAt: null, companyType: { in: ["CUSTOMER", "BOTH"] } },
            select: { id: true, name: true, normalizedName: true },
          })
        : Promise.resolve([]),
    ]);
    const customerIds = new Set(customerCompanies.map((company: any) => String(company.id)));
    const customerNames = new Set(customerCompanies.flatMap((company: any) =>
      [company.name, company.normalizedName]
        .map((value: any) => this.normalizeModelName(value))
        .filter(Boolean),
    ));
    const firmaId = this.cleanText(
      query.firmaId || query.firmId || query.companyId,
    );
    const firma = this.cleanText(
      query.firma || query.firmaAdi || query.companyName,
    );
    const storedModelRows = await this.listStorageModels(mainCompanySlug);
    const mappedRows = rows
      .map((row: any) => this.map(row))
      .filter((row: any) => {
        if (row.deletedAt) return false;
        if (customerOnly) {
          const companyId = String(row.firmaId || row.companyId || row.firmId || "");
          const companyName = this.normalizeModelName(row.firmaAdi || row.musteriFirma || row.firma || row.companyName);
          if (!customerIds.has(companyId) && !customerNames.has(companyName)) return false;
        }
        if (firmaId && String(row.firmaId || "") !== firmaId) return false;
        if (firma && row.firmaAdi !== firma && row.musteriFirma !== firma)
          return false;
        return true;
      });
    const mappedNames = new Set(
      mappedRows.map((row: any) => this.normalizeModelName(row.modelName)),
    );
    const archivedNames = new Set(
      archivedRows
        .flatMap((row: any) => [
          row.modelName,
          row.modelCode,
          row.orderNo,
          row.raw?.modelName,
          row.raw?.modelAdi,
          row.raw?.linkedVisualModelName,
          row.raw?.productionModelName,
        ])
        .map((value: any) => this.normalizeModelName(value))
        .filter(Boolean),
    );
    const combinedRows = [
      ...mappedRows,
      ...(!firmaId && !firma && !customerOnly
        ? storedModelRows.filter(
            (row: any) => {
              const normalizedName = this.normalizeModelName(row.modelName);
              return (
                normalizedName &&
                !mappedNames.has(normalizedName) &&
                !archivedNames.has(normalizedName)
              );
            },
          )
        : []),
    ];
    const filtered = combinedRows.filter((row: any) => {
      const department = this.cleanText(query.department);
      const ground = this.cleanText(
        query.groundColor || query.ground || query.zemin,
      );
      if (department && department !== "TÃ¼mÃ¼" && row.department !== department)
        return false;
      if (
        ground &&
        ground !== "TÃ¼mÃ¼" &&
        row.zeminRenk !== ground &&
        row.ground !== ground
      )
        return false;
      return true;
    });
    const sorted = this.sortModelRows(filtered);
    const start = (page - 1) * pageSize;
    const paged = sorted.slice(start, start + pageSize);
    const enriched = await this.enrich(paged);
    return { rows: enriched, total: sorted.length, page, pageSize };
  }

  async getById(id: string, mainCompanySlug?: string) {
    const where: any = { id };
    if (mainCompanySlug)
      where.mainCompanySlug = this.cleanText(mainCompanySlug);
    const row = await (this.prisma as any).modelRecord.findFirst({ where });
    if (!row) throw new NotFoundException("Model bulunamadi.");
    const [mapped] = await this.enrich([this.map(row)]);
    return mapped;
  }

  async getLogs(id: string, mainCompanySlug?: string) {
    const slug = this.cleanText(mainCompanySlug);
    const where: any = { entityType: "model", entityId: id };
    if (slug) where.mainCompanySlug = slug;
    const rows = await (this.prisma as any).activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows;
  }

  async create(payload: Query = {}) {
    const mainCompanySlug = this.requireSlug(
      payload.mainCompanySlug || payload.mainCompanyId,
    );
    const modelName = this.modelName(payload);
    if (!modelName) throw new BadRequestException("Model adi zorunludur.");
    const normalizedModelAdi = this.normalizeModelName(modelName);
    const company = await this.resolveOptionalCustomerCompany(
      mainCompanySlug,
      payload,
    );
    const firmaId = company?.id || "";
    const firmaAdi = company?.name || this.firmName(payload);

    const existingRows = await (this.prisma as any).modelRecord.findMany({
      where: { mainCompanySlug, NOT: { status: "ARCHIVED" } },
      orderBy: [{ updatedAt: "desc" }],
    });
    const existing = existingRows.find((row: any) => {
      const raw = row.raw && typeof row.raw === "object" ? row.raw : {};
      const rowFirmaId = this.cleanText(
        raw.firmaId || raw.firmId || raw.companyId,
      );
      const rowFirmaAdi = this.normalizeModelName(
        raw.firmaAdi ||
          raw.firma ||
          raw.musteriFirma ||
          raw.customerName ||
          raw.companyName,
      );
      return (
        this.normalizeModelName(raw.normalizedModelAdi || row.modelName) ===
          normalizedModelAdi &&
        (!firmaId || rowFirmaId === firmaId) &&
        !this.cleanText(raw.deletedAt)
      );
    });
    if (existing) return this.map(existing);

    const folder = await this.ensureModelFolder(mainCompanySlug, modelName);
    const printRegions = this.normalizePrintRegions(
      payload.printRegions ||
        payload.baskiBolgeleri ||
        payload.baskiBolgesi ||
        payload.printArea,
    );

    const row = await (this.prisma as any).modelRecord.create({
      data: {
        mainCompanySlug,
        modelName,
        modelCode:
          this.cleanText(payload.modelCode || payload.modelKodu) || null,
        orderNo: this.cleanText(payload.orderNo || payload.siparisNo) || null,
        status: this.cleanText(payload.status) || "ACTIVE",
        raw: {
          ...payload,
          anaFirmaId: this.cleanText(
            payload.anaFirmaId || payload.mainCompanyId || mainCompanySlug,
          ),
          firmaId,
          companyId: firmaId,
          firmaAdi,
          firma: firmaAdi,
          musteriFirma: firmaAdi,
          normalizedModelAdi,
          rootKey: MODEL_FILE_ROOT,
          previewRootKey: MODEL_PREVIEW_ROOT,
          folderName: folder.folderName,
          modelFolderPath: folder.modelFolderPath,
          relativePath: folder.relativeFolderPath,
          printRegions,
          baskiBolgeleri: printRegions,
          baskiBolgesi: printRegions
            .filter((region: any) => region.isActive !== false)
            .map((region: any) => region.regionName)
            .join(" + "),
        },
      },
    });
    return this.map(row);
  }

  async bulkCreate(payload: Query = {}) {
    const names = Array.isArray(payload.modelNames)
      ? payload.modelNames
      : this.cleanText(payload.modelNames)
          .split(/\r?\n|,|;/)
          .map((item) => item.trim())
          .filter(Boolean);
    if (!names.length)
      throw new BadRequestException("Model adÄ± listesi boÅŸ olamaz.");
    await this.requireCustomerCompany(
      this.requireSlug(payload.mainCompanySlug || payload.mainCompanyId),
      payload,
    );
    const created: any[] = [];
    const existing: any[] = [];
    const errors: any[] = [];
    for (const name of names) {
      try {
        const row = await this.create({
          ...(payload.defaults || {}),
          ...payload,
          modelName: name,
        });
        const isNew = new Date(row.createdAt).getTime() > Date.now() - 10000;
        (isNew ? created : existing).push(row);
      } catch (error) {
        errors.push({ modelName: name, message: error?.message || "Hata" });
      }
    }
    return {
      created,
      existing,
      errors,
      createdCount: created.length,
      existingCount: existing.length,
      errorCount: errors.length,
    };
  }

  async saveUploadedImages(
    mainCompanySlug: string,
    id: string,
    files: any[] = [],
  ) {
    const slug = this.requireSlug(mainCompanySlug);
    const model = await this.getById(id, slug);
    const folder = await this.ensureModelFolder(slug, model.modelName);
    const storageRoot = path.join(process.cwd(), "storage");
    const publicDir = path.join(storageRoot, "model-previews", slug);
    this.ensureDir(publicDir);

    const saved: any[] = [];
    for (const file of Array.isArray(files) ? files : []) {
      if (!file?.buffer || !String(file.mimetype || "").startsWith("image/"))
        continue;
      const parsed = path.parse(
        this.cleanText(file.originalname) || "gorsel.png",
      );
      const ext =
        parsed.ext && /^\.[a-z0-9]+$/i.test(parsed.ext)
          ? parsed.ext.toLowerCase()
          : ".png";
      const base = this.safeFilePart(model.modelName);
      const originalName = `${base}_original_${this.timestamp()}${ext}`;
      const originalPath = this.uniquePath(
        folder.modelFolderPath,
        originalName,
      );
      fs.writeFileSync(originalPath, file.buffer);

      const hash = this.fileHash(file.buffer);
      const duplicate = await (this.prisma as any).modelImage.findFirst({
        where: {
          mainCompanySlug: slug,
          modelId: id,
          note: { contains: hash },
        },
      });
      if (duplicate) continue;

      const thumbFile = `${base}_model_${id}_thumb${ext}`;
      const previewPath = this.uniquePath(folder.previewRoot, thumbFile);
      fs.writeFileSync(previewPath, file.buffer);
      const publicPath = this.uniquePath(publicDir, thumbFile);
      fs.writeFileSync(publicPath, file.buffer);
      const thumbUrl = this.storageUrl(publicPath);

      const relativePath = path
        .relative(folder.fileRoot, originalPath)
        .replace(/\\/g, "\\");
      const previewRelativePath = path
        .relative(folder.previewRoot, previewPath)
        .replace(/\\/g, "\\");
      const note = {
        originalPath,
        thumbPath: previewPath,
        filePath: originalPath,
        fileName: path.basename(originalPath),
        originalFileName: file.originalname,
        fileHash: hash,
        mimeType: file.mimetype,
        fileType: "MODEL_IMAGE",
        isPrimary: true,
        rootKey: MODEL_FILE_ROOT,
        relativePath,
        previewRootKey: MODEL_PREVIEW_ROOT,
        previewRelativePath,
        thumbUrl,
      };
      const image = await (this.prisma as any).modelImage.create({
        data: {
          mainCompanySlug: slug,
          modelId: id,
          filePath: originalPath,
          thumbnailPath: thumbUrl,
          note: JSON.stringify(note),
        },
      });
      saved.push({
        id: image.id,
        url: thumbUrl,
        path: thumbUrl,
        originalPath,
        thumbPath: previewPath,
        name: file.originalname,
      });
    }

    if (saved.length) {
      const existing = await (this.prisma as any).modelRecord.findFirst({
        where: { id, mainCompanySlug: slug },
      });
      const raw =
        existing?.raw && typeof existing.raw === "object" ? existing.raw : {};
      const nextImages = [
        ...saved,
        ...(Array.isArray(raw.images) ? raw.images : []),
      ];
      await (this.prisma as any).modelRecord.update({
        where: { id },
        data: {
          raw: {
            ...raw,
            imageUrl: saved[0].url,
            thumbUrl: saved[0].url,
            originalPath: saved[0].originalPath,
            thumbPath: saved[0].thumbPath,
            images: nextImages.slice(0, 12),
          },
        },
      });
    }
    return { images: saved, model: await this.getById(id, slug) };
  }

  async saveUploadedFiles(
    mainCompanySlug: string,
    id: string,
    files: any[] = [],
  ) {
    const slug = this.requireSlug(mainCompanySlug);
    const model = await this.getById(id, slug);
    const folder = await this.ensureModelFolder(slug, model.modelName);
    const saved: any[] = [];
    for (const file of Array.isArray(files) ? files : []) {
      if (!file?.buffer) continue;
      const parsed = path.parse(this.cleanText(file.originalname) || "dosya");
      const ext =
        parsed.ext && /^\.[a-z0-9]+$/i.test(parsed.ext)
          ? parsed.ext.toLowerCase()
          : "";
      const base = this.safeFilePart(model.modelName);
      const suffix =
        this.safeFilePart(parsed.name || "dosya").replace(
          new RegExp(`^${base}_?`, "i"),
          "",
        ) || "dosya";
      const fullPath = this.uniquePath(
        folder.modelFolderPath,
        `${base}_${suffix}${ext}`,
      );
      const hash = this.fileHash(file.buffer);
      const rawFiles = Array.isArray(model.files) ? model.files : [];
      if (rawFiles.some((item: any) => item.fileHash === hash)) continue;
      fs.writeFileSync(fullPath, file.buffer);
      const relativePath = path
        .relative(folder.fileRoot, fullPath)
        .replace(/\\/g, "\\");
      saved.push({
        id: `${id}-${hash.slice(0, 12)}`,
        name: path.basename(fullPath),
        originalFileName: file.originalname,
        path: fullPath,
        filePath: fullPath,
        fileHash: hash,
        mimeType: file.mimetype,
        fileType: "MODEL_FILE",
        rootKey: MODEL_FILE_ROOT,
        relativePath,
        createdAt: new Date().toISOString(),
      });
    }
    if (saved.length) {
      const existing = await (this.prisma as any).modelRecord.findFirst({
        where: { id, mainCompanySlug: slug },
      });
      const raw =
        existing?.raw && typeof existing.raw === "object" ? existing.raw : {};
      await (this.prisma as any).modelRecord.update({
        where: { id },
        data: {
          raw: {
            ...raw,
            files: [...saved, ...(Array.isArray(raw.files) ? raw.files : [])],
          },
        },
      });
    }
    return { files: saved, model: await this.getById(id, slug) };
  }

  async saveImages(
    mainCompanySlug: string,
    id: string,
    images: Array<{ url?: string; path?: string; note?: string }> = [],
  ) {
    const existing = await (this.prisma as any).modelRecord.findFirst({
      where: { id, mainCompanySlug: this.cleanText(mainCompanySlug) },
    });
    if (!existing) throw new NotFoundException("Model bulunamadi.");

    for (const image of images) {
      const filePath = this.cleanText(image.url || image.path);
      if (!filePath) continue;
      await (this.prisma as any).modelImage.create({
        data: {
          mainCompanySlug,
          modelId: id,
          filePath,
          thumbnailPath: this.cleanText(image.path || image.url) || null,
          note: this.cleanText(image.note) || null,
        },
      });
    }

    const currentRaw =
      existing.raw && typeof existing.raw === "object" ? existing.raw : {};
    const existingImages = Array.isArray(currentRaw.images)
      ? currentRaw.images
      : [];
    const nextImages = [
      ...images.map((image) => ({
        url: this.cleanText(image.url || image.path),
        path: this.cleanText(image.path || image.url),
      })),
      ...existingImages,
    ].filter((image) => image.url || image.path);
    const cover = nextImages[0]?.url || nextImages[0]?.path || "";
    const updated = await (this.prisma as any).modelRecord.update({
      where: { id },
      data: {
        raw: {
          ...currentRaw,
          imageUrl: cover || currentRaw.imageUrl || "",
          desenGorseli: cover || currentRaw.desenGorseli || "",
          images: nextImages.slice(0, 12),
        },
      },
    });
    const [mapped] = await this.enrich([this.map(updated)]);
    return mapped;
  }

  async update(id: string, payload: Query = {}) {
    const existing = await (this.prisma as any).modelRecord.findFirst({
      where: {
        id,
        ...(payload.mainCompanySlug
          ? { mainCompanySlug: this.cleanText(payload.mainCompanySlug) }
          : {}),
      },
    });
    if (!existing) throw new NotFoundException("Model bulunamadi.");

    const row = await (this.prisma as any).modelRecord.update({
      where: { id },
      data: {
        modelName: this.modelName(payload) || existing.modelName,
        modelCode:
          payload.modelCode !== undefined || payload.modelKodu !== undefined
            ? this.cleanText(payload.modelCode || payload.modelKodu) || null
            : existing.modelCode,
        orderNo:
          payload.orderNo !== undefined || payload.siparisNo !== undefined
            ? this.cleanText(payload.orderNo || payload.siparisNo) || null
            : existing.orderNo,
        status: this.cleanText(payload.status) || existing.status,
        raw: { ...(existing.raw || {}), ...payload },
      },
    });
    return this.map(row);
  }

  async getPrintRegions(id: string, payload: Query = {}) {
    const model = await this.getById(
      id,
      this.requireSlug(payload.mainCompanySlug || payload.mainCompanyId),
    );
    return this.normalizePrintRegions(model.printRegions || model.baskiBolgeleri);
  }

  // Public helper to return the default standardized print regions
  async getPrintRegionDefinitions() {
    return this.normalizePrintRegions([]);
  }

  async replacePrintRegions(id: string, payload: Query = {}) {
    const existing = await (this.prisma as any).modelRecord.findFirst({
      where: {
        id,
        ...(payload.mainCompanySlug
          ? { mainCompanySlug: this.cleanText(payload.mainCompanySlug) }
          : {}),
      },
    });
    if (!existing) throw new NotFoundException("Model bulunamadi.");
    const currentRaw =
      existing.raw && typeof existing.raw === "object" ? existing.raw : {};
    const regions = this.normalizePrintRegions(
      Array.isArray(payload.regions)
        ? payload.regions
        : Array.isArray(payload.baskiBolgeleri)
          ? payload.baskiBolgeleri
          : payload.regionName || payload.region,
    );
    const updated = await (this.prisma as any).modelRecord.update({
      where: { id },
      data: {
        raw: {
          ...currentRaw,
          printRegions: regions,
          baskiBolgeleri: regions,
          baskiBolgesi: regions
            .filter((region: any) => region.isActive !== false)
            .map((region: any) => region.regionName)
            .join(" + "),
          printRegionsUpdatedAt: new Date().toISOString(),
        },
      },
    });
    return this.map(updated);
  }

  async addPrintRegion(id: string, payload: Query = {}) {
    const existing = await this.getPrintRegions(id, payload);
    const next = [
      ...existing,
      {
        regionName: this.cleanText(payload.regionName || payload.name || payload.bolge),
        regionCode: this.cleanText(payload.regionCode || payload.code),
        sortOrder: Number(payload.sortOrder || existing.length + 1),
        isActive: payload.isActive !== false,
      },
    ];
    return this.replacePrintRegions(id, { ...payload, regions: next });
  }

  async patchPrintRegion(id: string, regionId: string, payload: Query = {}) {
    const existing = await this.getPrintRegions(id, payload);
    const next = existing.map((region: any) => {
      if (String(region.id) !== String(regionId) && region.regionCode !== regionId) {
        return region;
      }
      return {
        ...region,
        ...payload,
        regionName: this.cleanText(payload.regionName || payload.name || region.regionName),
        regionCode: this.cleanText(payload.regionCode || payload.code || region.regionCode),
        isActive:
          payload.isActive === undefined ? region.isActive !== false : payload.isActive !== false,
        updatedAt: new Date().toISOString(),
      };
    });
    return this.replacePrintRegions(id, { ...payload, regions: next });
  }

  async deactivatePrintRegion(id: string, regionId: string, payload: Query = {}) {
    return this.patchPrintRegion(id, regionId, { ...payload, isActive: false });
  }

  async delete(id: string, payload: Query = {}) {
    const existing = await (this.prisma as any).modelRecord.findFirst({
      where: {
        id,
        ...(payload.mainCompanySlug
          ? { mainCompanySlug: this.cleanText(payload.mainCompanySlug) }
          : {}),
      },
    });
    if (!existing) throw new NotFoundException("Model bulunamadi.");

    const row = await (this.prisma as any).modelRecord.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        raw: { ...(existing.raw || {}), deletedAt: new Date().toISOString() },
      },
    });
    return this.map(row);
  }
}

