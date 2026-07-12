import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { LiveDbService } from "../../database/live-db.service";
import { UretimService } from "./uretim.service";
import { Public } from "../../auth/public.decorator";

@Controller(["uretim", "imalat", "api/uretim", "api/imalat"])
export class UretimController {
  constructor(
    private readonly service: UretimService,
    private readonly db: SqlStoreService,
    private readonly liveDb: LiveDbService,
  ) {}

  private resolveSlug(mainCompanySlug?: string, mainCompanyId?: string) {
    const requestedSlug = String(mainCompanySlug || "").trim();
    const requestedId = String(mainCompanyId || "").trim();
    const resolved = this.db.resolveMainCompany(requestedId, requestedSlug);
    if (!resolved?.slug) {
      throw new BadRequestException(
        "Geçerli bir ana firma bulunamadı. mainCompanySlug veya mainCompanyId gönderin.",
      );
    }
    return resolved.slug;
  }

  private qtyStatus(expectedQty: number, producedQty: number) {
    if (!producedQty) return "Bekliyor";
    if (producedQty === expectedQty) return "Tamam";
    if (producedQty < expectedQty) return "Kismi / Eksik";
    return "Fazla / Kontrol";
  }

  private mapToGirisHavuzuRow(row: any) {
    const expectedQty = Number(
      row.gelenAdet ||
        row.irsaliyeAdet ||
        row.toplamAdet ||
        row.uretimAdedi ||
        0,
    );
    const producedQty = Number(row.uretimAdedi || 0);
    const printDefectQty = Number(
      row.baskiHatasiAdet || row.printDefectQty || row.printDefect || 0,
    );
    const fabricDefectQty = Number(
      row.kumasHatasiAdet || row.fabricDefectQty || row.fabricDefect || 0,
    );
    const wasteQty = Number(
      row.hataliAdet || row.fireAdedi || printDefectQty + fabricDefectQty || 0,
    );
    const status = this.qtyStatus(expectedQty, producedQty);
    return {
      id: String(row.id),
      modelId: String(row.modelId || row.modelKaydiId || row.id || ""),
      date: row.tarih,
      machineNo: row.makina,
      machineName: row.makina,
      shift: row.vardiya,
      companyName: row.firma,
      modelName: row.modelAdi,
      productionModelName: row.productionModelName || row.modelAdi,
      orderNo: row.musteriIrsaliyeNo,
      sourceDispatchNo: row.musteriIrsaliyeNo,
      printArea: row.grup || "Diger",
      expectedQty,
      producedQty,
      wasteQty,
      printDefectQty,
      fabricDefectQty,
      operatorName: row.sorumluPersonel || "",
      assistantName: row.yardimciPersonel || "",
      status,
      note: row.not || "",
      raw: row,
      modelImageUrl:
        row.desenImageThumb ||
        row.imageUrl ||
        row.thumbnail ||
        row.desenImageOriginal ||
        row.modelImageUrl ||
        row.raw?.desenImageThumb ||
        row.desenGorseli ||
        "",
    };
  }

  private mapModelToGirisHavuzuRow(row: any) {
    const expectedQty = Number(row.gelenAdet || row.quantity || 0);
    const producedQty = Number(row.toplamUretim || row.productionQty || 0);
    return {
      id: String(row.id),
      modelId: String(row.id || ""),
      date: row.tarih || row.createdAt,
      machineNo: "",
      machineName: "",
      shift: "",
      companyName: row.firma || row.firmaAdi || row.musteriFirma || "",
      modelName:
        row.linkedVisualModelName ||
        row.visualModelName ||
        row.modelAdi ||
        row.modelName ||
        "",
      productionModelName:
        row.productionModelName || row.modelAdi || row.modelName || "",
      orderNo: row.musteriIrsaliyeNo || row.siparisNo || "",
      sourceDispatchNo: row.musteriIrsaliyeNo || row.siparisNo || "",
      printArea: row.baskiBolgesi || row.grup || "Diger",
      expectedQty,
      producedQty,
      wasteQty: 0,
      operatorName: "",
      assistantName: "",
      status:
        expectedQty > 0 || producedQty > 0
          ? this.qtyStatus(expectedQty, producedQty)
          : "Yeni Model",
      note: row.not || "",
      raw: { ...row, kaynak: row.kaynak || "Model Kartı" },
      modelImageUrl:
        row.desenImageThumb ||
        row.imageUrl ||
        row.thumbnail ||
        row.desenImageOriginal ||
        row.modelImageUrl ||
        row.raw?.desenImageThumb ||
        row.desenGorseli ||
        "",
    };
  }

  private mapPlanToGirisHavuzuRow(row: any, model?: any) {
    const expectedQty = Number(row.expectedQty || 0);
    const producedQty = Number(row.producedQty || 0);
    const wasteQty = Number(row.wasteQty || 0);
    return {
      id: String(row.id),
      date: row.createdAt,
      machineNo: row.machineId || "",
      machineName: row.machineId || "",
      shift: row.shift || "",
      companyName:
        model?.firma || model?.firmaAdi || model?.musteriFirma || "",
      modelId: row.modelId || "",
      modelName: model?.modelAdi || model?.modelName || "",
      productionModelName:
        model?.productionModelName || model?.modelAdi || model?.modelName || "",
      orderNo: row.orderNo || "",
      sourceDispatchNo: row.sourceDispatchNo || row.orderNo || "",
      printArea: row.printArea || "Diger",
      expectedQty,
      producedQty,
      wasteQty,
      operatorName: row.operatorId || "",
      assistantName: row.assistantId || "",
      status: this.qtyStatus(expectedQty, producedQty),
      note: row.note || "",
      raw: { ...row, kaynak: "ProductionPlanLine" },
      modelImageUrl:
        model?.desenImageThumb ||
        model?.imageUrl ||
        model?.thumbnail ||
        model?.desenImageOriginal ||
        (model as any)?.raw?.desenImageThumb ||
        "",
    };
  }

  private queueKey(row: any) {
    const model = String(
      row?.productionModelName || row?.modelName || "",
    ).trim();
    const dispatch = String(row?.sourceDispatchNo || row?.orderNo || "").trim();
    const company = String(row?.companyName || "").trim();
    return `${model.toLocaleUpperCase("tr-TR")}|${dispatch.toLocaleUpperCase("tr-TR")}|${company.toLocaleUpperCase("tr-TR")}`;
  }

  private queueRowPriority(row: any) {
    const produced = Number(row?.producedQty || 0);
    if (produced > 0) return 4;
    const source = String(row?.raw?.kaynak || "").toLocaleLowerCase("tr-TR");
    if (source.includes("productionplanline")) return 3;
    if (source.includes("model kart")) return 1;
    return 2;
  }

  private mergeQueueRows(rows: any[]) {
    const map = new Map<string, any>();
    for (const row of rows) {
      const key = this.queueKey(row);
      const current = map.get(key);
      if (!current) {
        map.set(key, row);
        continue;
      }
      const currentPriority = this.queueRowPriority(current);
      const nextPriority = this.queueRowPriority(row);
      if (nextPriority > currentPriority) {
        map.set(key, {
          ...row,
          modelImageUrl: row.modelImageUrl || current.modelImageUrl || "",
        });
      } else {
        map.set(key, {
          ...current,
          modelImageUrl: current.modelImageUrl || row.modelImageUrl || "",
        });
      }
    }
    return Array.from(map.values());
  }

  @Get("bootstrap")
  getBootstrap(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getBootstrap(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
    );
  }

  @Public()
  @Get("seri/summary")
  getSeriSummary(@Query() query: Record<string, any>) {
    return this.service.getSeriSummary(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Get("seri/model-search")
  getSeriModelSearch(@Query() query: Record<string, any>) {
    return this.service.getSeriModelSearch(
      query.mainCompanySlug,
      query.mainCompanyId,
      query.q || query.search || query.modelSearch,
    );
  }

  @Public()
  @Get("seri/work-cards")
  getSeriWorkCards(@Query() query: Record<string, any>) {
    return this.service.getSeriWorkCards(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Get("seri/incoming-dispatches")
  getSeriIncomingDispatches(@Query() query: Record<string, any>) {
    return this.service.getSeriIncomingDispatches(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Get("seri/entries")
  getSeriEntries(@Query() query: Record<string, any>) {
    return this.service.getSeriEntries(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Get("seri/report")
  getSeriReport(@Query() query: Record<string, any>) {
    return this.service.getSeriReport(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Get("denetim")
  getImalatDenetim(@Query() query: Record<string, any>) {
    return this.service.getImalatDenetim(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Get("rapor")
  getImalatRapor(@Query() query: Record<string, any>) {
    return this.service.getImalatRapor(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Get("baski-bolgesi-tanimlari")
  getBaskiBolgesiTanimlari() {
    return this.service.getBaskiBolgesiTanimlari();
  }

  @Public()
  @Get("modeller")
  async getImalatModeller(@Query() query: Record<string, any>) {
    return {
      ok: true,
      data: await this.service.getModelKayitlari(
        this.resolveSlug(query.mainCompanySlug, query.mainCompanyId),
        {
          firma: query.firma,
          activeOnly: query.activeOnly !== "false",
        },
      ),
    };
  }

  @Public()
  @Get("modeller/:modelId")
  getImalatModelDetay(
    @Param("modelId") modelId: string,
    @Query() query: Record<string, any>,
  ) {
    return this.service.getImalatModelDetay(
      modelId,
      query.mainCompanySlug,
      query.mainCompanyId,
    );
  }

  @Public()
  @Get("modeller/:modelId/operasyon-ozet")
  getImalatModelOperasyonOzet(
    @Param("modelId") modelId: string,
    @Query() query: Record<string, any>,
  ) {
    return this.service.getImalatModelOperasyonOzet(
      modelId,
      query.mainCompanySlug,
      query.mainCompanyId,
    );
  }

  @Public()
  @Post("modeller/:modelId/baski-bolgeleri")
  addImalatModelBaskiBolgesi(
    @Param("modelId") modelId: string,
    @Body() body: any,
  ) {
    return this.service.addImalatModelPrintRegion(modelId, body);
  }

  @Public()
  @Put("modeller/:modelId/baski-bolgeleri")
  replaceImalatModelBaskiBolgeleri(
    @Param("modelId") modelId: string,
    @Body() body: any,
  ) {
    return this.service.replaceImalatModelPrintRegions(modelId, body);
  }

  @Public()
  @Patch("model-baski-bolgeleri/:regionId")
  patchImalatModelBaskiBolgesi(
    @Param("regionId") regionId: string,
    @Body() body: any,
  ) {
    return this.service.patchImalatModelPrintRegion(
      body.modelId || body.modelRecordId || body.modelKaydiId,
      regionId,
      body,
    );
  }

  @Public()
  @Post("seri/entry")
  createSeriEntry(@Body() body: any) {
    return this.service.hizliGiris(body);
  }

  @Public()
  @Post("seri/work-card")
  createSeriWorkCard(@Body() body: any) {
    return this.service.createSeriWorkCard(body);
  }

  @Public()
  @Post("seri/link-model")
  linkSeriModel(@Body() body: any) {
    return this.service.linkSeriModel(body);
  }

  @Public()
  @Post("seri/link-invoice")
  linkSeriInvoice(@Body() body: any) {
    return this.service.linkSeriInvoice(body);
  }

  @Public()
  @Post("seri/set-price")
  setSeriPrice(@Body() body: any) {
    return this.service.setSeriPrice(body);
  }

  @Public()
  @Post("seri/close-work")
  closeSeriWork(@Body() body: any) {
    return this.service.isKapat(body);
  }

  @Public()
  @Get("seri/machines")
  getSeriMachines(@Query() query: Record<string, any>) {
    return this.service.getMakineTanimlari(
      query.mainCompanySlug,
      query.mainCompanyId,
    );
  }

  @Public()
  @Post("seri/machines")
  createSeriMachine(@Body() body: any) {
    return this.service.saveMakineTanim(body);
  }

  @Public()
  @Put("seri/machines/:id")
  updateSeriMachine(@Param("id") id: string, @Body() body: any) {
    return this.service.saveMakineTanim({ ...body, id, makineNo: body.makineNo || id });
  }

  @Public()
  @Get("makineler")
  getImalatMakineler(@Query() query: Record<string, any>) {
    return this.service.getImalatMakineler(
      query.mainCompanySlug,
      query.mainCompanyId,
    );
  }

  @Public()
  @Post("makineler")
  createImalatMakine(@Body() body: any) {
    return this.service.saveMakineTanim(body);
  }

  @Public()
  @Put("makineler/:machineId")
  updateImalatMakine(@Param("machineId") machineId: string, @Body() body: any) {
    return this.service.saveMakineTanim({
      ...body,
      id: machineId,
      makineNo: body.makineNo || machineId,
    });
  }

  @Public()
  @Patch("makineler/:machineId/durum")
  updateImalatMakineDurum(
    @Param("machineId") machineId: string,
    @Body() body: any,
  ) {
    return this.service.patchImalatMakineDurum(machineId, body);
  }

  @Public()
  @Get("seri-havuz")
  getSeriHavuz(@Query() query: Record<string, any>) {
    return this.service.getSeriHavuz(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Public()
  @Post("hizli-giris")
  hizliGiris(@Body() body: any) {
    return this.service.hizliGiris(body);
  }

  @Public()
  @Get("model-gecmisi/:id")
  getModelGecmisi(@Param("id") id: string, @Query() query: Record<string, any>) {
    return this.service.getModelGecmisi(
      id,
      query.mainCompanySlug,
      query.mainCompanyId,
    );
  }

  @Public()
  @Get("makine-tanimlari")
  getMakineTanimlari(@Query() query: Record<string, any>) {
    return this.service.getMakineTanimlari(
      query.mainCompanySlug,
      query.mainCompanyId,
    );
  }

  @Public()
  @Post("makine-tanimlari")
  saveMakineTanimlari(@Body() body: any) {
    return this.service.saveMakineTanim(body);
  }

  @Public()
  @Post("irsaliye-eslestir")
  irsaliyeEslestir(@Body() body: any) {
    return this.service.irsaliyeEslestir(body);
  }

  @Public()
  @Post("is-kapat")
  isKapat(@Body() body: any) {
    return this.service.isKapat(body);
  }

  @Public()
  @Get("seri-rapor")
  getSeriRapor(@Query() query: Record<string, any>) {
    return this.service.getSeriRapor(
      query.mainCompanySlug,
      query.mainCompanyId,
      query,
    );
  }

  @Get("makinalar")
  getMakinalar(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getMakinalar(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
    );
  }

  @Get("uretim-kayitlari")
  getUretimKayitlariDb(@Query() query: Record<string, any>) {
    return this.liveDb.list("productionRecord", query, [
      "modelName",
      "orderNo",
      "machineName",
      "shift",
    ]);
  }

  @Public()
  @Get("giris-havuzu")
  async getGirisHavuzu(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.resolveSlug(mainCompanySlug, mainCompanyId);
    const [rows, modelRows] = await Promise.all([
      this.service.getUretimKayitlariLive(slug),
      this.service.getModelKayitlari(slug, { activeOnly: true }),
    ]);
    const passiveStatuses = [
      "DELETED",
      "ARCHIVED",
      "CANCELLED",
      "PASSIVE",
      "SOFT_DELETED",
    ];
    const planPayload: any = await this.liveDb.list("productionPlanLine", {
      mainCompanySlug: slug,
      limit: 1000,
    });
    const planRows = (Array.isArray(planPayload?.items)
      ? planPayload.items
      : Array.isArray(planPayload?.rows)
        ? planPayload.rows
        : []
    ).filter((row: any) => !passiveStatuses.includes(String(row.status || "")));
    const producedModelIds = new Set(
      rows.map((row: any) => String(row.modelKaydiId || row.modelId || "")),
    );
    const plannedModelIds = new Set(
      planRows.map((row: any) => String(row.modelId || "")),
    );
    const modelsById = new Map(
      modelRows.map((row: any) => [String(row.id || ""), row]),
    );
    const waitingModelRows = modelRows.filter((row: any) => {
      return (
        !producedModelIds.has(String(row.id)) &&
        !plannedModelIds.has(String(row.id))
      );
    });
    const combinedRows = [
      ...planRows.map((row: any) =>
        this.mapPlanToGirisHavuzuRow(row, modelsById.get(String(row.modelId || ""))),
      ),
      ...waitingModelRows.map((row: any) => this.mapModelToGirisHavuzuRow(row)),
      ...rows.map((row: any) => this.mapToGirisHavuzuRow(row)),
    ];
    return {
      ok: true,
      data: this.mergeQueueRows(combinedRows).sort((a: any, b: any) => {
        const dateOf = (row: any) => {
          const raw =
            row?.raw?.createdAt ||
            row?.createdAt ||
            row?.raw?.updatedAt ||
            row?.updatedAt ||
            row?.date ||
            "";
          const time = raw ? new Date(raw).getTime() : 0;
          return Number.isFinite(time) ? time : 0;
        };
        const dateDiff = dateOf(b) - dateOf(a);
        if (dateDiff) return dateDiff;
        return String(a?.modelName || a?.productionModelName || "").localeCompare(
          String(b?.modelName || b?.productionModelName || ""),
          "tr",
          { sensitivity: "base" },
        );
      }),
    };
  }

  @Patch("giris-havuzu/:lineId/quantity")
  async patchGirisHavuzuQuantity(
    @Param("lineId") lineId: string,
    @Body() body: any,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    const slug = this.resolveSlug(
      body.mainCompanySlug || mainCompanySlug,
      body.mainCompanyId || mainCompanyId,
    );
    let current: any = {};
    try {
      current = this.service.getUretimKaydiById(slug, lineId);
    } catch {
      current = {};
    }
    const producedQty = Number(
      body.producedQty ?? body.quantity ?? current.uretimAdedi ?? 0,
    );
    const wasteQty = Number(body.wasteQty ?? current.hataliAdet ?? 0);
    const printDefectQty = Number(
      body.printDefectQty ??
        body.baskiHatasiAdet ??
        current.baskiHatasiAdet ??
        0,
    );
    const fabricDefectQty = Number(
      body.fabricDefectQty ??
        body.kumasHatasiAdet ??
        current.kumasHatasiAdet ??
        0,
    );
    const updated = await this.service.updateUretimKaydi(lineId, {
      mainCompanySlug: slug,
      uretimAdedi: producedQty,
      hataliAdet: wasteQty || printDefectQty + fabricDefectQty,
      baskiHatasiAdet: printDefectQty,
      kumasHatasiAdet: fabricDefectQty,
      not: body.note ?? current.not,
    });
    const row = updated?.kayit || current;
    const mapped = this.mapToGirisHavuzuRow({
      ...current,
      ...row,
      uretimAdedi: producedQty,
      hataliAdet: wasteQty,
    });
    return {
      ok: true,
      data: {
        ...mapped,
        remainingQty: mapped.expectedQty - mapped.producedQty,
        completeSetQty: Math.max(0, mapped.producedQty - mapped.wasteQty),
      },
    };
  }

  @Post("makinalar")
  saveMakina(@Body() body: any) {
    return this.service.saveMakina(body);
  }

  @Patch("makinalar/:id")
  updateMakina(@Param("id") id: string, @Body() body: any) {
    return this.service.updateMakina(id, body);
  }

  @Get("makinalar/:id/delete-summary")
  getMakinaDeleteSummary(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getMakinaDeleteSummary(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Delete("makinalar/:id")
  deleteMakina(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.deleteMakina(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Get("model-kayitlari")
  getModelKayitlari(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("firma") firma?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.service.getModelKayitlari(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      {
        firma,
        activeOnly: activeOnly !== "false",
      },
    );
  }

  @Get("model-kaynaklari")
  getModelKaynaklari(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("firma") firma?: string,
    @Query("activeOnly") activeOnly?: string,
  ) {
    return this.getModelKayitlari(mainCompanySlug, mainCompanyId, firma, activeOnly);
  }

  @Post("model-kayitlari")
  saveModelKaydi(@Body() body: any) {
    return this.service.saveModelKaydi(body);
  }

  @Get("model-kayitlari/:id")
  getModelKaydiDetay(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getModelKaydiDetay(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Post("model-kayitlari/:id/images")
  @UseInterceptors(FilesInterceptor("images", 6))
  uploadModelKaydiImages(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @UploadedFiles()
    files: Array<{
      originalname: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }> = [],
  ) {
    return this.service.saveModelImages(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
      files,
    );
  }

  @Delete("model-kayitlari/:id")
  deleteModelKaydi(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.deleteModelKaydi(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Get("kayitlar")
  getKayitlar(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getUretimKayitlari(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
    );
  }

  @Get("uretim")
  getUretimAlias(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("modelId") modelId?: string,
  ) {
    const rows = this.service.getUretimKayitlari(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
    );
    if (!modelId) return rows;
    return rows.filter(
      (row: any) =>
        String(row.modelId || row.modelKaydiId || "") === String(modelId),
    );
  }

  @Get("kayitlar/:id")
  getKayitById(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getUretimKaydiById(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Post("kayitlar")
  saveKayit(@Body() body: any) {
    return this.service.saveUretim(body);
  }

  @Post("uretim")
  saveUretimAlias(@Body() body: any) {
    return this.service.saveUretim(body);
  }

  @Patch("kayitlar/:id")
  updateKayit(@Param("id") id: string, @Body() body: any) {
    return this.service.updateUretimKaydi(id, body);
  }

  @Delete("kayitlar/:id")
  deleteKayit(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.deleteUretimKaydi(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Post("production-records/:id/link-model")
  linkProductionToModel(@Param("id") id: string, @Body() body: any) {
    return this.service.linkProductionToModel(id, body);
  }

  @Get("kalite")
  getKalite(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getKaliteKayitlari(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
    );
  }

  @Post("kalite")
  saveKalite(@Body() body: any) {
    return this.service.saveKalite(body);
  }

  @Get("excel/:type")
  @Header("Content-Type", "application/vnd.ms-excel")
  async excel(
    @Param("type") type: string,
    @Query("mainCompanySlug") mainCompanySlug: string,
    @Query("mainCompanyId") mainCompanyId: string,
    @Res() res: Response,
  ) {
    const slug = this.resolveSlug(mainCompanySlug, mainCompanyId);
    const buffer = await this.service.excel(type, slug);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="uretim-${type}.xls"`,
    );
    res.send(buffer);
  }
}
