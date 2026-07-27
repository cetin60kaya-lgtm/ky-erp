import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { apiSuccess } from "../../common/api-helpers";
import { LiveDbService } from "../../database/live-db.service";
import { ModelService } from "../models/model.service";
import { DesenWorkflowService } from "./desen-workflow.service";
import { DesenService } from "./desen.service";

@Controller("models")
export class SharedModelsController {
  constructor(
    private readonly modelService: ModelService,
    private readonly service: DesenService,
    private readonly liveDb: LiveDbService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, any>) {
    const result = await this.modelService.list(query);
    return apiSuccess(Array.isArray(result) ? result : result.rows || []);
  }

  /** Geriye dönük uyumluluk – eski shared-list endpoint'i artık aynı Prisma kaynağını kullanıyor */
  @Get("shared-list")
  async sharedList(@Query() query: Record<string, any>) {
    const result = await this.modelService.list(query);
    return apiSuccess(Array.isArray(result) ? result : result.rows || []);
  }

  @Get("shared-list/:id")
  async sharedGet(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return apiSuccess(
      await this.modelService.getById(id, query.mainCompanySlug),
    );
  }

  @Get(":id/logs")
  async getLogs(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(
      await this.modelService.getLogs(id, query.mainCompanySlug),
    );
  }

  @Get(":id")
  async getOne(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(
      await this.modelService.getById(id, query.mainCompanySlug),
    );
  }

  @Post()
  async create(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.modelService.create(body ?? {}),
      "Model kaydedildi",
    );
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      await this.modelService.update(id, body ?? {}),
      "Model güncellendi",
    );
  }

  @Delete(":id")
  async delete(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(
      await this.modelService.delete(id, { ...(query ?? {}), ...(body ?? {}) }),
      "Model arşive alındı",
    );
  }
}

@Controller(["desen", "api/desen"])
export class DesenController {
  private readonly legacySyncInFlight = new Map<string, Promise<any>>();
  private readonly legacySyncedAt = new Map<string, number>();

  constructor(
    private readonly service: DesenService,
    private readonly workflow: DesenWorkflowService,
    private readonly liveDb: LiveDbService,
    private readonly modelService: ModelService,
  ) {}

  private async ensureLegacyHavuz(query: Record<string, any>) {
    const mainCompanySlug = String(query?.mainCompanySlug || query?.mainCompanyId || "").trim();
    if (!mainCompanySlug) return;
    const lastSync = this.legacySyncedAt.get(mainCompanySlug) || 0;
    if (query?.syncLegacy !== "true" && Date.now() - lastSync < 60_000) return;
    const running = this.legacySyncInFlight.get(mainCompanySlug);
    if (running) return running;
    const task = (async () => {
      const rows = await this.service.listHavuz({
        ...query,
        mainCompanySlug,
        skipAutoOcr: "true",
      });
      const result = await this.workflow.importLegacyHavuz({ mainCompanySlug }, rows);
      this.legacySyncedAt.set(mainCompanySlug, Date.now());
      return result;
    })();
    this.legacySyncInFlight.set(mainCompanySlug, task);
    try {
      return await task;
    } finally {
      this.legacySyncInFlight.delete(mainCompanySlug);
    }
  }

  @Get("workflow/inbox")
  async workflowInbox(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listInbox(query));
  }

  @Post("workflow/inbox/scan")
  async workflowInboxScan(@Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.scanInbox(body ?? {}), "Gelen klasör tarandı");
  }

  @Get("workflow/inbox/:id/preview")
  async workflowInboxPreview(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
    @Res() res: any,
  ) {
    return res.sendFile(await this.workflow.resolveInboxFile(id, query));
  }

  @Post("workflow/inbox/process")
  async workflowInboxProcess(@Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.processInbox(body ?? {}), "Model ve dosyaları kaydedildi");
  }

  @Post("workflow/inbox/process-bulk")
  async workflowInboxProcessBulk(@Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.processInboxBulk(body ?? {}), "Seçili desenler toplu kaydedildi");
  }

  @Post("workflow/inbox/ignore")
  async workflowInboxIgnore(@Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.ignoreInbox(body ?? {}), "Dosyalar yok sayıldı");
  }

  @Post("workflow/inbox/move-to-error")
  async workflowInboxMoveToError(@Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.moveInboxToError(body ?? {}), "Dosyalar işlenemeyen klasörüne taşındı");
  }

  @Get("workflow/models")
  async workflowModels(@Query() query: Record<string, any>) {
    await this.ensureLegacyHavuz(query);
    return apiSuccess(await this.workflow.listModels(query));
  }

  @Get("workflow/analysis/status")
  async workflowAnalysisStatus(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.analysisStatus(query));
  }

  @Post("workflow/analyze")
  async workflowAnalyze(@Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.analyzeModels(body ?? {}), "Desen arama indeksi güncellendi");
  }

  @Post("workflow/models/:id/analyze")
  async workflowAnalyzeModel(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.analyzeModel(id, body ?? {}), "Desen özellikleri okundu");
  }

  @Get("workflow/models/:id")
  async workflowModel(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.getModel(id, query));
  }

  @Post("workflow/models")
  async workflowCreateModel(@Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.createModel(body ?? {}), "Desen modeli oluşturuldu");
  }

  @Post("workflow/models/:id/files")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async workflowUploadFile(
    @Param("id") id: string,
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
  ) {
    if (!file) throw new BadRequestException("Dosya zorunludur.");
    return apiSuccess(await this.workflow.uploadWorkflowFile(id, file, body ?? {}), "Desen dosyası yüklendi");
  }

  @Put("workflow/models/:id")
  async workflowUpdateModel(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.updateModel(id, body ?? {}), "Desen modeli güncellendi");
  }

  @Post("workflow/models/:id/archive")
  async workflowArchiveModel(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.archiveModel(id, body ?? {}), "Desen modeli arşivlendi");
  }

  @Post("workflow/models/:id/operations")
  async workflowCreateOperation(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.createOperation(id, body ?? {}), "Baskı bölgesi eklendi");
  }

  @Put("workflow/operations/:operationId")
  async workflowUpdateOperation(@Param("operationId") operationId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.updateOperation(operationId, body ?? {}), "Baskı bölgesi güncellendi");
  }

  @Delete("workflow/operations/:operationId")
  async workflowDeleteOperation(
    @Param("operationId") operationId: string,
    @Query() query: Record<string, any>,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.workflow.deleteOperation(operationId, { ...(query ?? {}), ...(body ?? {}) }), "Baskı bölgesi kaldırıldı");
  }

  @Post("workflow/operations/:operationId/channels")
  async workflowReplaceChannels(@Param("operationId") operationId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.replaceChannels(operationId, body ?? {}), "Kanal listesi kaydedildi");
  }

  @Post("workflow/operations/:operationId/channels/parse")
  workflowParseChannels(@Param("operationId") operationId: string, @Body() body: Record<string, any>) {
    return apiSuccess({ operationId, channels: this.workflow.parseChannels(body ?? {}) });
  }

  @Post("workflow/operations/:operationId/channels/reorder")
  async workflowReorderChannels(@Param("operationId") operationId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.reorderChannels(operationId, body ?? {}), "Kanal sırası güncellendi");
  }

  @Put("workflow/channels/:channelId")
  async workflowUpdateChannel(@Param("channelId") channelId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.updateChannel(channelId, body ?? {}), "Kanal güncellendi");
  }

  @Delete("workflow/channels/:channelId")
  async workflowDeleteChannel(
    @Param("channelId") channelId: string,
    @Query() query: Record<string, any>,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.workflow.deleteChannel(channelId, { ...(query ?? {}), ...(body ?? {}) }), "Kanal kaldırıldı");
  }

  @Post("workflow/operations/:operationId/color-groups")
  async workflowSaveColorGroup(@Param("operationId") operationId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.upsertColorGroup(operationId, body ?? {}), "Renk grubu kaydedildi");
  }

  @Put("workflow/color-groups/:groupId")
  async workflowUpdateColorGroup(@Param("groupId") groupId: string, @Body() body: Record<string, any>) {
    if (!body?.operationId) throw new BadRequestException("operationId zorunludur.");
    return apiSuccess(await this.workflow.upsertColorGroup(body.operationId, body, groupId), "Renk grubu güncellendi");
  }

  @Post("workflow/color-groups/:groupId/link-registered-color")
  async workflowLinkRegisteredColor(@Param("groupId") groupId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.linkRegisteredColor(groupId, body ?? {}), "Kayıtlı renk bağlantısı güncellendi");
  }

  @Get("workflow/registered-colors")
  async workflowRegisteredColors(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.searchRegisteredColors(query));
  }

  @Get("workflow/operations/:operationId/totals")
  async workflowOperationTotals(@Param("operationId") operationId: string) {
    return apiSuccess(await this.workflow.calculateTotals(operationId));
  }

  @Post("workflow/models/:id/sync-dyehouse")
  async workflowSyncDyehouse(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.workflow.syncDyehouse(id, body ?? {}), "Boyahane işi güncellendi");
  }

  @Get("workflow/models/:id/production-summary")
  async workflowProductionSummary(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.getProductionSummary(id, query));
  }

  @Get("workflow/reports")
  async workflowReports(@Query() query: Record<string, any>) {
    await this.ensureLegacyHavuz(query);
    return apiSuccess(await this.workflow.reports(query));
  }

  @Get("workflow/reports/export")
  async workflowReportsExport(@Query() query: Record<string, any>, @Res() res: any) {
    await this.ensureLegacyHavuz(query);
    const buffer = await this.workflow.exportReports(query);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=desen-raporu-${new Date().toISOString().slice(0, 10)}.xlsx`);
    return res.send(buffer);
  }

  @Get("workflow/files/:id/preview")
  async workflowFilePreview(@Param("id") id: string, @Res() res: any) {
    const resolved = await this.workflow.resolveWorkflowFile(id);
    return res.sendFile(resolved.filePath);
  }

  @Get()
  liveRecords(@Query() query: Record<string, any>) {
    return this.liveDb.list("designRecord", query, ["title", "status"]);
  }

  @Get("mold-layouts")
  liveMoldLayouts(@Query() query: Record<string, any>) {
    return this.liveDb.list("moldLayoutRecord", query, ["title"]);
  }

  @Get("records")
  records(@Query() query: Record<string, any>) {
    return apiSuccess(this.service.listRecords(query));
  }

  @Get("models-simple")
  async simpleModels(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.listSimpleModels(query));
  }

  @Get("modeller")
  async ortakModeller(@Query() query: Record<string, any>) {
    const result = await this.modelService.list(query);
    return apiSuccess(Array.isArray(result) ? result : result.rows || []);
  }

  @Get("modeller/:modelId")
  async ortakModel(@Param("modelId") modelId: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.modelService.getById(modelId, query.mainCompanySlug || query.mainCompanyId));
  }

  @Get("modeller/:modelId/gorsel")
  async modelGorsel(@Param("modelId") modelId: string, @Query() query: Record<string, any>) {
    const img = await this.service.getModelImageByModelId(modelId, query || {});
    if (!img) return apiSuccess(null);
    return apiSuccess(img);
  }

  @Get("modeller/:modelId/baski-bolgeleri")
  async baskiBolgeleri(@Param("modelId") modelId: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.modelService.getPrintRegions(modelId, query));
  }

  @Put("modeller/:modelId/baski-bolgeleri")
  async baskiBolgeleriDegistir(
    @Param("modelId") modelId: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.modelService.replacePrintRegions(modelId, body), "Baskı bölgeleri güncellendi");
  }

  @Post("modeller/:modelId/baski-bolgeleri")
  async baskiBolgesiEkle(
    @Param("modelId") modelId: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.modelService.addPrintRegion(modelId, body), "Baskı bölgesi eklendi");
  }

  @Patch("model-baski-bolgeleri/:regionId")
  async baskiBolgesiGuncelle(
    @Param("regionId") regionId: string,
    @Body() body: Record<string, any>,
  ) {
    const modelId = body.modelId || body.modelKaydiId;
    if (!modelId) throw new BadRequestException("modelId zorunludur.");
    return apiSuccess(await this.modelService.patchPrintRegion(modelId, regionId, body), "Baskı bölgesi güncellendi");
  }

  @Delete("model-baski-bolgeleri/:regionId")
  async baskiBolgesiPasifeAl(
    @Param("regionId") regionId: string,
    @Query() query: Record<string, any>,
    @Body() body: Record<string, any>,
  ) {
    const payload = { ...(query || {}), ...(body || {}) };
    const modelId = payload.modelId || payload.modelKaydiId;
    if (!modelId) throw new BadRequestException("modelId zorunludur.");
    return apiSuccess(await this.modelService.deactivatePrintRegion(modelId, regionId, payload), "Baskı bölgesi pasife alındı");
  }

  @Get("havuz")
  async havuz(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.listHavuz(query));
  }

  @Post("havuz/sync-watch-folder")
  async syncHavuzWatchFolder(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.syncHavuzWatchFolder(body ?? {}),
      "Bağlı desen klasörü yenilendi",
    );
  }

  @Post("import-from-storage")
  async importFromStorage(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.syncHavuzWatchFolder(body ?? {}),
      "Storage desen klasoru SQL havuzuna baglandi",
    );
  }

  @Post("havuz/reset-ai-kurulum")
  async resetAiKurulum(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.resetDesenAiKurulum(body ?? {}),
      "Desen sifir kurulum ve AI arama indeksleme tamamlandi",
    );
  }

  @Get("import/folder-status")
  async importFolderStatus(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.getHavuzFolderStatus(query ?? {}));
  }

  @Post("import/folder-scan")
  async importFolderScan(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.scanHavuzIncomingFolder(body ?? {}),
      "Bağlı klasör kontrol edildi",
    );
  }

  @Post("import/open-folder")
  async importOpenFolder(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.openHavuzIncomingFolder(body ?? {}),
      "Bağlı klasör açıldı",
    );
  }

  @Post("havuz/upload-image")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadHavuzImage(
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
  ) {
    if (!file) throw new BadRequestException("Görsel dosyası zorunludur.");
    return apiSuccess(
      await this.service.uploadHavuzImage(file, body ?? {}),
      "Görsel havuza alındı",
    );
  }

  @Post("gorsel-yukle")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadHavuzImageAlias(
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
  ) {
    return this.uploadHavuzImage(file, body);
  }

  @Get("havuz/search")
  async havuzSearch(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.searchHavuz(query));
  }

  @Get("havuz/storage-durum")
  async havuzStorageDurum(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.havuzStorageDurum(query));
  }

  @Get("havuz/:id")
  async havuzById(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return apiSuccess(await this.service.getHavuzById(id, query));
  }

  @Patch("havuz/:id")
  async patchHavuz(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.patchHavuz(id, body ?? {}),
      "Havuz kaydı güncellendi",
    );
  }

  @Post("havuz/bulk-firma-ata")
  async bulkFirmaAta(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.bulkFirmaAta(body ?? {}),
      "Firma ataması tamamlandı",
    );
  }

  @Post("toplu-firma-guncelle")
  async bulkFirmaGuncelleAlias(@Body() body: Record<string, any>) {
    return this.bulkFirmaAta(body);
  }

  @Post("havuz/bulk-model-havuzuna-ekle")
  async bulkModelHavuzunaEkle(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.bulkModelHavuzunaEkle(body ?? {}),
      "Seçilen kayıtlar model havuzuna işlendi",
    );
  }

  @Post("havuz/ocr-index")
  async indexHavuzOcr(@Body() body: Record<string, any>) {
    return apiSuccess(
      await this.service.indexHavuzOcr(body ?? {}),
      "OCR indeksleme tamamlandı",
    );
  }

  @Post("toplu-yeniden-indeksle")
  async bulkReindexAlias(@Body() body: Record<string, any>) {
    return this.indexHavuzOcr(body);
  }

  @Get("records/:id")
  record(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(this.service.getRecord(id, query));
  }

  @Post("records")
  createRecord(@Body() body: Record<string, any>) {
    return apiSuccess(this.service.saveRecord(body ?? {}), "Desen oluşturuldu");
  }

  @Patch("records/:id")
  updateRecord(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      this.service.saveRecord({ ...(body ?? {}), id }),
      "Desen güncellendi",
    );
  }

  @Post("records/:id/files")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadFile(
    @Param("id") id: string,
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
  ) {
    if (!file) throw new BadRequestException("Dosya zorunludur.");
    return apiSuccess(
      await this.service.saveFile(id, file, body ?? {}),
      "Dosya yüklendi",
    );
  }

  @Get("files/:id")
  fileInfo(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(this.service.getFile(id, query));
  }

  @Get("files/:id/preview")
  preview(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
    @Res() res: any,
  ) {
    return res.sendFile(this.service.resolveFilePath(id, query));
  }

  @Get("files/:id/download")
  download(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
    @Res() res: any,
  ) {
    const file = this.service.getFile(id, query);
    return res.download(
      this.service.resolveFilePath(id, query),
      file.originalName || file.fileName,
    );
  }

  @Delete("files/:id")
  deleteFile(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
    @Query() query: Record<string, any>,
  ) {
    return apiSuccess(
      this.service.softDeleteFile(id, { ...(query ?? {}), ...(body ?? {}) }),
      "Dosya arşivlendi",
    );
  }

  @Get("records/:id/yerlesim")
  listYerlesim(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(this.service.listYerlesim(id, query));
  }

  @Post("records/:id/yerlesim")
  saveYerlesim(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      this.service.saveYerlesim(id, body ?? {}),
      "Yerleşim kaydedildi",
    );
  }

  @Patch("records/:id/yerlesim/:yerlesimId")
  patchYerlesim(
    @Param("id") id: string,
    @Param("yerlesimId") yerlesimId: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(
      this.service.saveYerlesim(id, { ...(body ?? {}), id: yerlesimId }),
      "Yerleşim güncellendi",
    );
  }

  @Post("records/:id/yerlesim/:yerlesimId/files")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  uploadYerlesimFile(
    @Param("id") id: string,
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
  ) {
    if (!file) throw new BadRequestException("Dosya zorunludur.");
    return apiSuccess(
      this.service.saveFile(id, file, body ?? {}),
      "Yerleşim dosyası yüklendi",
    );
  }

  @Get("records/:id/kalip-yerlesim")
  listKalip(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(this.service.listKalip(id, query));
  }

  @Post("records/:id/kalip-yerlesim")
  saveKalip(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      this.service.saveKalip(id, body ?? {}),
      "Kalıp yerleşim kaydedildi",
    );
  }

  @Patch("records/:id/kalip-yerlesim/:kalipId")
  patchKalip(
    @Param("id") id: string,
    @Param("kalipId") kalipId: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(
      this.service.saveKalip(id, { ...(body ?? {}), id: kalipId }),
      "Kalıp yerleşim güncellendi",
    );
  }

  @Post("records/:id/kalip-yerlesim/parse-file-name")
  parseFileName(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      this.service.parseKalipForRecord(id, body ?? {}),
      "Dosya adından model ayıklandı",
    );
  }

  @Post("records/:id/kalip-yerlesim/next-code")
  nextCode(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(this.service.nextKalipCode(id, body ?? {}));
  }

  @Post("records/:id/kalip-yerlesim/:kalipId/approve-card")
  approveCard(
    @Param("id") id: string,
    @Param("kalipId") kalipId: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(
      this.service.approveKalipCard(id, kalipId, body ?? {}),
      "Model kartı onaylandı",
    );
  }

  @Post("records/:id/kalip-yerlesim/:kalipId/approve-all")
  approveAll(
    @Param("id") id: string,
    @Param("kalipId") kalipId: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(
      this.service.approveAllKalipCards(id, kalipId, body ?? {}),
      "Tüm kartlar onaylandı",
    );
  }

  @Post("records/:id/archive")
  archive(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      this.service.archiveRecord(id, body ?? {}),
      "Desen arşivlendi",
    );
  }

  @Post("records/:id/restore")
  restore(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(
      this.service.restoreRecord(id, body ?? {}),
      "Desen geri alındı",
    );
  }
}
