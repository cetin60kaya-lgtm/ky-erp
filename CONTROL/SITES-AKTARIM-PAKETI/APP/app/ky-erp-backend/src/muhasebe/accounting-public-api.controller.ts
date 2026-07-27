import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Delete,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { PrismaService } from "../prisma/prisma.service";
import { AccountingApiService } from "./accounting-api.service";
import { DocumentIntakeServiceV2 } from "./document-intake/document-intake.service";
import { MuhasebeFinalService } from "./muhasebe-final.service";
import { Public } from "../auth/public.decorator";

function slug(input: Record<string, any> = {}) {
  return String(input.mainCompanySlug || input.mainCompanyId || "mecit-hakan").trim();
}

@Controller("api")
export class AccountingPublicApiController {
  constructor(
    private readonly accounting: AccountingApiService,
    private readonly documents: DocumentIntakeServiceV2,
    private readonly finalService: MuhasebeFinalService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("health")
  @Public()
  health() {
    return { ok: true, service: "ky-erp-accounting" };
  }

  @Get("accounting/dashboard")
  dashboard(@Query() query: Record<string, any>) {
    return this.finalService.yonetimOzeti({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("firms")
  firms(@Query() query: Record<string, any>) {
    return this.accounting.listFirms({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("firms/:firmId")
  firm(@Param("firmId") firmId: string) {
    return this.accounting.getFirm(firmId);
  }

  @Post("firms")
  createFirm(@Body() body: Record<string, any>) {
    return this.accounting.createFirm({ ...body, mainCompanySlug: slug(body) });
  }

  @Put("firms/:firmId")
  updateFirm(@Param("firmId") firmId: string, @Body() body: Record<string, any>) {
    return this.accounting.updateFirm(firmId, { ...body, mainCompanySlug: slug(body) });
  }

  @Patch("firms/:firmId")
  patchFirm(@Param("firmId") firmId: string, @Body() body: Record<string, any>) {
    return this.updateFirm(firmId, body);
  }

  @Delete("firms/:firmId")
  deleteFirm(@Param("firmId") firmId: string) {
    return this.accounting.deleteFirm(firmId);
  }

  @Get("firms/:firmId/contacts")
  async firmContacts(@Param("firmId") firmId: string, @Query() query: Record<string, any>) {
    void query;
    return this.accounting.listContacts(firmId);
  }

  @Post("firms/:firmId/contacts")
  createFirmContact(@Param("firmId") firmId: string, @Body() body: Record<string, any>) {
    return this.accounting.createContact(firmId, { ...body, mainCompanySlug: slug(body) });
  }

  @Put("firms/:firmId/contacts/:contactId")
  updateFirmContact(
    @Param("firmId") firmId: string,
    @Param("contactId") contactId: string,
    @Body() body: Record<string, any>,
  ) {
    void firmId;
    return this.accounting.updateContact(contactId, { ...body, mainCompanySlug: slug(body) });
  }

  @Patch("firms/:firmId/contacts/:contactId")
  patchFirmContact(
    @Param("firmId") firmId: string,
    @Param("contactId") contactId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.updateFirmContact(firmId, contactId, body);
  }

  @Delete("firms/:firmId/contacts/:contactId")
  @Patch("firms/:firmId/contacts/:contactId/passive")
  passiveFirmContact(
    @Param("firmId") firmId: string,
    @Param("contactId") contactId: string,
    @Body() body: Record<string, any>,
  ) {
    void firmId;
    void body;
    return this.accounting.deleteContact(contactId);
  }

  @Post("documents/upload")
  @UseInterceptors(
    FilesInterceptor("files", 200, {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const name = String(file.originalname || "").toLocaleLowerCase("tr-TR");
        cb(null, name.endsWith(".pdf") || name.endsWith(".xml") || name.endsWith(".zip"));
      },
    }),
  )
  uploadDocuments(@UploadedFiles() files: Express.Multer.File[], @Body() body: Record<string, any>) {
    return this.documents.upload(files, body);
  }

  @Get("documents/pool")
  documentPool(@Query() query: Record<string, any>) {
    return this.finalService.belgeHavuzu({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("documents/:id")
  document(@Param("id") id: string, @Query() query: Record<string, any>) {
    return this.finalService.belgeDetay(slug(query), id);
  }

  @Post("documents/:id/approve")
  approveDocument(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.finalService.approveDocument(slug(body), id, body);
  }

  @Post("documents/:id/link-model")
  async linkModel(@Param("id") id: string, @Body() body: Record<string, any>) {
    const mainCompanySlug = slug(body);
    const modelId = String(body.modelId || "").trim();
    const document = await this.prisma.document.findFirst({ where: { id, mainCompanySlug } });
    const raw = document?.raw && typeof document.raw === "object" ? document.raw : {};
    return this.prisma.document.update({
      where: { id },
      data: {
        targetRecordId: modelId || null,
        raw: { ...raw, modelId, modelName: body.modelName || body.modelAdi || "" },
      },
    });
  }

  @Get("accounting/model-links/pending")
  modelLinksPending(@Query() query: Record<string, any>) {
    return this.finalService.belgeHavuzu({ ...query, mainCompanySlug: slug(query) });
  }

  @Post("accounting/model-links/:id/save")
  saveModelLink(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.linkModel(id, body);
  }

  @Get("current-accounts/firms")
  currentAccountFirms(@Query() query: Record<string, any>) {
    return this.accounting.currentAccountFirms({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("current-accounts/:firmId/summary")
  currentAccountSummary(@Param("firmId") firmId: string) {
    return this.accounting.currentAccountSummary(firmId);
  }

  @Get("current-accounts/:firmId/movements")
  currentAccountMovements(@Param("firmId") firmId: string, @Query() query: Record<string, any>) {
    void query;
    return this.accounting.firmMovements(firmId);
  }

  @Post("current-accounts/:firmId/manual-movement")
  manualMovement(@Param("firmId") firmId: string, @Body() body: Record<string, any>) {
    return this.accounting.createManualCari(firmId, { ...body, mainCompanySlug: slug(body) });
  }

  @Put("current-accounts/movements/:movementId")
  updateMovement(@Param("movementId") movementId: string, @Body() body: Record<string, any>) {
    return this.accounting.updateCariMovement(movementId, body);
  }

  @Patch("current-accounts/movements/:movementId")
  patchMovement(@Param("movementId") movementId: string, @Body() body: Record<string, any>) {
    return this.updateMovement(movementId, body);
  }

  @Delete("current-accounts/movements/:movementId")
  deleteMovement(@Param("movementId") movementId: string) {
    return this.accounting.deleteCariMovement(movementId);
  }

  @Get("vat/summary")
  vatSummary(@Query() query: Record<string, any>) {
    return this.accounting.vatSummary({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("vat/firms")
  vatFirms(@Query() query: Record<string, any>) {
    return this.accounting.vatFirms({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("vat/firms/:firmId/detail")
  vatFirmDetail(@Param("firmId") firmId: string, @Query() query: Record<string, any>) {
    return this.accounting.vatFirmDetail(firmId, { ...query, mainCompanySlug: slug(query) });
  }

  @Get("vat/records")
  vatRecords(@Query() query: Record<string, any>) {
    return this.accounting.vatSummary({ ...query, mainCompanySlug: slug(query) });
  }

  @Post("vat/periods/opening")
  vatOpening(@Body() body: Record<string, any>) {
    return this.accounting.vatOpening({ ...body, mainCompanySlug: slug(body) });
  }

  @Post("vat/firms/:firmId/adjustment")
  vatAdjustment(@Param("firmId") firmId: string, @Body() body: Record<string, any>) {
    return this.accounting.vatAdjustment(firmId, { ...body, mainCompanySlug: slug(body) });
  }

  @Get("check-payments")
  checkPayments(@Query() query: Record<string, any>) {
    return this.accounting.listPayments({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("check-payments/:id")
  checkPayment(@Param("id") id: string) {
    return this.accounting.getPayment(id);
  }

  @Post("check-payments")
  createCheckPayment(@Body() body: Record<string, any>) {
    return this.accounting.createPayment({ ...body, mainCompanySlug: slug(body) });
  }

  @Put("check-payments/:id")
  updateCheckPayment(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.accounting.updatePayment(id, body);
  }

  @Patch("check-payments/:id")
  patchCheckPayment(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.updateCheckPayment(id, body);
  }

  @Delete("check-payments/:id")
  deleteCheckPayment(@Param("id") id: string) {
    return this.accounting.deletePayment(id);
  }

  @Post("check-payments/:id/files")
  addCheckPaymentFile(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.accounting.uploadPaymentImage(id, body.side === "back" ? "back" : "front", body);
  }

  @Post("check-payments/:id/status")
  checkPaymentStatus(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.accounting.paymentStatus(id, body);
  }

  @Get("muhasebe/odeme/firmalar")
  paymentCenterFirms(@Query() query: Record<string, any>) {
    return this.accounting.paymentCenterFirms({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("muhasebe/odeme/firmalar/:id/ozet")
  paymentCenterFirmSummary(@Param("id") id: string) {
    return this.accounting.paymentCenterFirmSummary(id);
  }

  @Get("muhasebe/odeme/firmalar/:id/cekler")
  paymentCenterFirmChecks(@Param("id") id: string) {
    return this.accounting.paymentCenterFirmChecks(id);
  }

  @Get("muhasebe/odeme/firmalar/:id/kartlar")
  paymentCenterFirmCards(@Param("id") id: string) {
    return this.accounting.paymentCenterFirmCards(id);
  }

  @Get("muhasebe/odeme/firmalar/:id/hareketler")
  paymentCenterFirmMovements(@Param("id") id: string) {
    return this.accounting.firmMovements(id);
  }

  @Get("muhasebe/odeme/firmalar/:id/nakit-havale")
  paymentCenterFirmCashTransfers(@Param("id") id: string) {
    return this.accounting.paymentCenterFirmCashTransfers(id);
  }

  @Get("muhasebe/odeme/firmalar/:id/acik-borclar")
  paymentCenterOpenDebts(@Param("id") id: string) {
    return this.accounting.paymentCenterOpenDebts(id);
  }

  @Get("muhasebe/odeme/firmalar/:id/acik-kalemler")
  paymentCenterOpenItems(@Param("id") id: string) {
    return this.accounting.paymentCenterOpenDebts(id);
  }

  @Post("muhasebe/odeme/firma")
  createPaymentCenterFirm(@Body() body: Record<string, any>) {
    return this.accounting.createPaymentCenterFirm({ ...body, mainCompanySlug: slug(body) });
  }

  @Post("muhasebe/odeme/cek")
  createPaymentCenterCheck(@Body() body: Record<string, any>) {
    return this.accounting.createPaymentCenterCheck({ ...body, mainCompanySlug: slug(body) });
  }

  @Put("muhasebe/odeme/cek/:id")
  updatePaymentCenterCheck(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.accounting.updatePaymentCenterCheck(id, body);
  }

  @Post("muhasebe/odeme/kart")
  createPaymentCenterCard(@Body() body: Record<string, any>) {
    return this.accounting.createPaymentCenterCard({ ...body, mainCompanySlug: slug(body) });
  }

  @Put("muhasebe/odeme/kart/:id")
  updatePaymentCenterCard(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.accounting.updatePaymentCenterCard(id, body);
  }

  @Post("muhasebe/odeme/islem")
  savePaymentCenterTransaction(@Body() body: Record<string, any>) {
    return this.accounting.savePaymentCenterTransaction({ ...body, mainCompanySlug: slug(body) });
  }

  @Post("muhasebe/odeme/kismi-odeme")
  savePaymentCenterPartial(@Body() body: Record<string, any>) {
    return this.accounting.savePaymentCenterTransaction({ ...body, mainCompanySlug: slug(body) });
  }

  @Post("muhasebe/odeme/mahsup")
  savePaymentCenterOffset(@Body() body: Record<string, any>) {
    return this.accounting.savePaymentCenterTransaction({
      ...body,
      paymentMethod: "TRANSFER",
      mainCompanySlug: slug(body),
    });
  }

  @Get("muhasebe/odeme/rapor")
  paymentCenterReport(@Query() query: Record<string, any>) {
    return this.accounting.paymentCenterFirms({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("mail-tracking")
  mailTracking(@Query() query: Record<string, any>) {
    return this.accounting.mailTracking({ ...query, mainCompanySlug: slug(query) });
  }

  @Get("mail-tracking/:id")
  mailTrackingDetail(@Param("id") id: string, @Query() query: Record<string, any>) {
    return this.accounting.mailTrackingDetail(id, { ...query, mainCompanySlug: slug(query) });
  }

  @Post("mail-tracking/create-draft")
  createMailDraft(@Body() body: Record<string, any>) {
    return this.accounting.createMailDraft({ ...body, mainCompanySlug: slug(body) });
  }

  @Get("accounting/reports")
  reports(@Query() query: Record<string, any>) {
    return this.finalService.raporlar({ ...query, mainCompanySlug: slug(query) });
  }
}
