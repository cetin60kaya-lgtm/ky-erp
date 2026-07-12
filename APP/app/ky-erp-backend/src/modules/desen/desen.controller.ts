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
  constructor(
    private readonly service: DesenService,
    private readonly liveDb: LiveDbService,
    private readonly modelService: ModelService,
  ) {}

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
