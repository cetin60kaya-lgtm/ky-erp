import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import * as fs from "fs";
import * as path from "path";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { ModelService } from "../models/model.service";
import { Public } from "../../auth/public.decorator";

@Controller("model-takip/models")
export class ModelTakipController {
  constructor(private readonly modelService: ModelService) {}

  private resolveSlug(mainCompanySlug?: string, mainCompanyId?: string) {
    const slug = String(mainCompanySlug || mainCompanyId || "").trim();
    if (!slug) {
      throw new BadRequestException(
        "Geçerli bir ana firma bulunamadı. mainCompanySlug veya mainCompanyId gönderin.",
      );
    }
    return slug;
  }

  private mapDocument(doc: any, type: string, belgeTuru: string) {
    return { ...doc, type, belgeTuru };
  }

  @Get("shared-list")
  async sharedList(@Query() query: Record<string, any>) {
    const result = await this.modelService.list(query);
    return {
      ok: true,
      data: result,
    };
  }

  @Post()
  async create(@Body() body: Record<string, any>) {
    return { ok: true, data: await this.modelService.create(body) };
  }

  @Post("bulk-create")
  async bulkCreate(@Body() body: Record<string, any>) {
    return { ok: true, data: await this.modelService.bulkCreate(body) };
  }

  @Get("shared-list/:id")
  async sharedGet(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.resolveSlug(mainCompanySlug, mainCompanyId);
    return { ok: true, data: await this.modelService.getById(id, slug) };
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: Record<string, any>) {
    return { ok: true, data: await this.modelService.update(id, body) };
  }

  @Get(":id/print-regions")
  async getPrintRegions(@Param("id") id: string, @Query() query: Record<string, any>) {
    return { ok: true, data: await this.modelService.getPrintRegions(id, query) };
  }

  @Put(":id/print-regions")
  async replacePrintRegions(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return { ok: true, data: await this.modelService.replacePrintRegions(id, body) };
  }

  @Post(":id/print-regions")
  async addPrintRegion(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return { ok: true, data: await this.modelService.addPrintRegion(id, body) };
  }

  @Patch(":id/print-regions/:regionId")
  async patchPrintRegion(
    @Param("id") id: string,
    @Param("regionId") regionId: string,
    @Body() body: Record<string, any>,
  ) {
    return { ok: true, data: await this.modelService.patchPrintRegion(id, regionId, body) };
  }

  @Delete(":id/print-regions/:regionId")
  async deactivatePrintRegion(
    @Param("id") id: string,
    @Param("regionId") regionId: string,
    @Query() query: Record<string, any>,
  ) {
    return { ok: true, data: await this.modelService.deactivatePrintRegion(id, regionId, query) };
  }

  @Delete(":id")
  async delete(@Param("id") id: string, @Query() query: Record<string, any>) {
    return { ok: true, data: await this.modelService.delete(id, query) };
  }

  @Post(":id/images")
  @UseInterceptors(FilesInterceptor("images", 12))
  async uploadImages(
    @Param("id") id: string,
    @UploadedFiles() files: any[],
    @Body() body: Record<string, any>,
    @Query() query: Record<string, any>,
  ) {
    const slug = this.resolveSlug(
      body.mainCompanySlug || query.mainCompanySlug,
      body.mainCompanyId || query.mainCompanyId,
    );
    return {
      ok: true,
      data: await this.modelService.saveUploadedImages(slug, id, files),
    };
  }

  @Post(":id/files")
  @UseInterceptors(FilesInterceptor("files", 30))
  async uploadFiles(
    @Param("id") id: string,
    @UploadedFiles() files: any[],
    @Body() body: Record<string, any>,
    @Query() query: Record<string, any>,
  ) {
    const slug = this.resolveSlug(
      body.mainCompanySlug || query.mainCompanySlug,
      body.mainCompanyId || query.mainCompanyId,
    );
    return {
      ok: true,
      data: await this.modelService.saveUploadedFiles(slug, id, files),
    };
  }

  @Get(":id/desen")
  async getDesenLinkleri(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return { ok: true, data: [] };
  }

  @Get(":id/history")
  async getHistory(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.resolveSlug(mainCompanySlug, mainCompanyId);
    const logs = await this.modelService.getLogs(id, slug);
    return { ok: true, data: logs };
  }

  @Get(":id/documents")
  async getDocuments(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return { ok: true, data: [] };
  }

  @Post(":id/documents")
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  linkDocument(
    @Param("id") _id: string,
    @Body() _body: Record<string, any>,
  ) {
    return {
      ok: false,
      message: "Belge bağlantısı bu endpoint üzerinden desteklenmiyor. Muhasebe modülündeki belge akışını kullanın.",
    };
  }

  @Get(":id/production")
  async getProduction(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return { ok: true, data: [] };
  }

  @Get("print-region-definitions")
  @Public()
  async getPrintRegionDefinitions() {
    // return default standardized regions
    return { ok: true, data: await this.modelService.getPrintRegionDefinitions() };
  }

  @Post(":id/production")
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  linkProduction(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return { ok: false, message: "Üretim kaydı bağlantısı bu endpoint üzerinden desteklenmiyor." };
  }

  @Post(":id/desen")
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  linkDesen(
    @Param("id") _id: string,
    @Body() _body: Record<string, any>,
  ) {
    return {
      ok: false,
      message: "Desen bağlantısı bu endpoint üzerinden desteklenmiyor. Desen modülünü kullanın.",
    };
  }
}

@Controller("model-takip")
export class ModelTakipSummaryController {
  constructor(
    private readonly modelService: ModelService,
    private readonly db: SqlStoreService,
  ) {}

  private cleanText(value: any) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  private parseNumber(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = this.cleanText(value).replace(/[^\d,.\-]/g, "");
    if (!raw) return 0;
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const normalized =
      lastComma > lastDot
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private resolveCompany(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.db.resolveMainCompany(mainCompanyId, mainCompanySlug);
    if (!company?.slug) {
      throw new BadRequestException(
        "Geçerli bir ana firma bulunamadı. mainCompanySlug veya mainCompanyId gönderin.",
      );
    }
    return company;
  }

  private listMonthRows(companySlug: string, dirName: string) {
    const root = path.join(this.db.getMainCompanyDir(companySlug), dirName);
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root)
      .filter((name: string) => /^\d{4}-\d{2}\.json$/.test(name))
      .sort((a: string, b: string) => b.localeCompare(a))
      .flatMap((name: string) =>
        this.db.readMainCompanyStore<any[]>(
          companySlug,
          path.join(dirName, name).replace(/\\/g, "/"),
          [],
        ),
      );
  }

  private ensureBucket(map: Map<string, any>, model: any) {
    const id = this.cleanText(model.modelId || model.id);
    if (!id) return null;
    if (!map.has(id)) {
      map.set(id, {
        modelId: id,
        modelAdi: this.cleanText(model.modelAdi || model.modelName),
        firmaId: this.cleanText(model.firmaId || model.companyId),
        firmaAdi: this.cleanText(model.firmaAdi || model.musteriFirma || model.firma),
        imageUrl: this.cleanText(model.imageUrl || model.desenGorseli || model.thumbnail),
        images: Array.isArray(model.images) ? model.images : [],
        musteriIrsaliyeAdedi: 0,
        // Üretim toplamı aşağıda doğrudan uretim.kayitlar kaynağından hesaplanır.
        // Model kartındaki özet alanını tekrar toplamak çift sayım oluşturuyordu.
        uretimAdedi: 0,
        bizimIrsaliyeAdedi: 0,
        kesilenFaturaAdedi: 0,
        toplamFaturaTutari: 0,
        odenenTutar: 0,
        kalanTutar: 0,
        ekstredeGorunmeyenFaturaSayisi: 0,
        tutarFarkiOlanFaturaSayisi: 0,
        ekstreDurumu: "Kontrol Edilmedi",
        musteriIrsaliyeleri: [],
        imalatKayitlari: [],
        kesilenFaturalar: [],
        bizimIrsaliyeler: [],
        cariHareketler: [],
        mailGecmisi: [],
      });
    }
    const bucket = map.get(id);
    bucket.modelAdi = bucket.modelAdi || this.cleanText(model.modelAdi || model.modelName);
    bucket.firmaId = bucket.firmaId || this.cleanText(model.firmaId || model.companyId);
    bucket.firmaAdi =
      bucket.firmaAdi || this.cleanText(model.firmaAdi || model.musteriFirma || model.firma);
    bucket.imageUrl =
      bucket.imageUrl || this.cleanText(model.imageUrl || model.desenGorseli || model.thumbnail);
    bucket.images = bucket.images?.length
      ? bucket.images
      : Array.isArray(model.images)
        ? model.images
        : [];
    return bucket;
  }

  private status(row: any) {
    const hasDiff =
      row.irsaliyeFaturaFarki !== 0 ||
      row.uretimFaturaFarki !== 0 ||
      row.uretimIrsaliyeFarki !== 0;
    if (!row.modelId) return "Model Bağlantısı Bekliyor";
    if (row.musteriIrsaliyeAdedi > 0 && row.kesilenFaturaAdedi === 0)
      return "İrsaliye Geldi / Fatura Kesilmedi";
    if (
      row.kesilenFaturaAdedi > 0 &&
      row.kesilenFaturaAdedi < row.musteriIrsaliyeAdedi
    )
      return "Kısmi Fatura Kesildi";
    if (
      row.musteriIrsaliyeAdedi > 0 &&
      row.kesilenFaturaAdedi === row.musteriIrsaliyeAdedi &&
      !hasDiff
    )
      return "Tamamı Faturalandı";
    if (row.kesilenFaturaAdedi > row.musteriIrsaliyeAdedi)
      return "Fatura Adedi Fazla";
    if (row.uretimAdedi < row.musteriIrsaliyeAdedi) return "Üretim Eksik";
    if (row.uretimAdedi > row.musteriIrsaliyeAdedi) return "Üretim Fazla";
    if (hasDiff) return "Adet Farkı Var";
    return "Takipte";
  }

  private async buildSummary(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.resolveCompany(mainCompanySlug, mainCompanyId);
    const modelResult = await this.modelService.list({
      mainCompanySlug: company.slug,
      pageSize: 5000,
      limit: 5000,
      customerOnly: true,
    });
    const models = Array.isArray(modelResult)
      ? modelResult
      : modelResult.rows || [];
    const byModel = new Map<string, any>();
    models.forEach((model: any) => this.ensureBucket(byModel, model));

    for (const row of this.listMonthRows(company.slug, "incoming-deliveries")) {
      const modelId = this.cleanText(row.modelId || row.modelKaydiId);
      const bucket = modelId ? byModel.get(modelId) : null;
      if (!bucket) continue;
      bucket.musteriIrsaliyeAdedi += this.parseNumber(row.gelenAdet || row.quantity);
      bucket.musteriIrsaliyeleri.push(row);
    }

    for (const row of this.db.readMainCompanyStore<any[]>(
      company.slug,
      "uretim.kayitlar",
      [],
    )) {
      const modelId = this.cleanText(row.modelId || row.modelKaydiId);
      const bucket = modelId ? byModel.get(modelId) : null;
      if (!bucket) continue;
      bucket.uretimAdedi += this.parseNumber(row.netAdet || row.uretimAdedi);
      bucket.imalatKayitlari.push(row);
    }

    for (const row of this.listMonthRows(company.slug, "outgoing-documents")) {
      const modelId = this.cleanText(row.modelId || row.modelKaydiId);
      const bucket = modelId ? byModel.get(modelId) : null;
      if (!bucket) continue;
      const type = this.cleanText(row.belgeTipi || row.belgeTuru || row.documentType).toLocaleUpperCase("tr-TR");
      const adet = this.parseNumber(
        row.adet || row.quantity || row.lines?.[0]?.adet || row.lines?.[0]?.quantity,
      );
      if (type.includes("IRSALIYE") || type.includes("İRSALİYE")) {
        bucket.bizimIrsaliyeAdedi += adet;
        bucket.bizimIrsaliyeler.push(row);
      } else {
        bucket.kesilenFaturaAdedi += adet;
        bucket.toplamFaturaTutari += this.parseNumber(row.genelToplam || row.toplamTutar || row.grandTotal);
        bucket.kesilenFaturalar.push(row);
        const ekstre = this.cleanText(row.ekstreDurumu || row.statementStatus);
        if (/g[oö]r[uü]nme|not_visible|not in/i.test(ekstre))
          bucket.ekstredeGorunmeyenFaturaSayisi += 1;
        if (/fark|difference/i.test(ekstre))
          bucket.tutarFarkiOlanFaturaSayisi += 1;
      }
    }

    for (const row of this.db.readMainCompanyStore<any[]>(
      company.slug,
      "cari-movements",
      [],
    )) {
      const modelId = this.cleanText(row.modelId || row.modelKaydiId);
      const bucket = modelId ? byModel.get(modelId) : null;
      if (!bucket) continue;
      bucket.odenenTutar += this.parseNumber(row.alacak || row.credit || row.odenenTutar);
      bucket.cariHareketler.push(row);
    }

    return [...byModel.values()].map((row) => {
      const normalized = {
        ...row,
        irsaliyeFaturaFarki:
          row.musteriIrsaliyeAdedi - row.kesilenFaturaAdedi,
        uretimFaturaFarki: row.uretimAdedi - row.kesilenFaturaAdedi,
        uretimIrsaliyeFarki: row.musteriIrsaliyeAdedi - row.uretimAdedi,
        kalanTutar: row.toplamFaturaTutari - row.odenenTutar,
        ekstreDurumu:
          row.tutarFarkiOlanFaturaSayisi > 0
            ? "Tutar Farkı Var"
            : row.ekstredeGorunmeyenFaturaSayisi > 0
              ? "Ekstrede Yok"
              : row.kesilenFaturaAdedi > 0
                ? "Ekstrede Var"
                : "Kontrol Edilmedi",
      };
      return { ...normalized, durum: this.status(normalized) };
    });
  }

  @Get("model-genel-takip")
  async getGeneralTracking(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return { ok: true, data: await this.buildSummary(mainCompanySlug, mainCompanyId) };
  }

  @Get("model-genel-takip/:modelId")
  async getGeneralTrackingOne(
    @Param("modelId") modelId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const rows = await this.buildSummary(mainCompanySlug, mainCompanyId);
    const row = rows.find((item) => String(item.modelId) === String(modelId));
    if (!row) return { ok: true, data: null };
    return { ok: true, data: row };
  }
}
