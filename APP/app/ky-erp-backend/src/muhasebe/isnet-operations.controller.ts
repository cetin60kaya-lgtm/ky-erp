import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { ModuleKey } from "@prisma/client";
import type { Response } from "express";
import { RequireModule } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { apiSuccess } from "../common/api-helpers";
import { IsnetOperationsService } from "./isnet-operations.service";

@Controller("isnet")
@RequireModule(ModuleKey.ISNET)
export class IsnetOperationsController {
  constructor(private readonly service: IsnetOperationsService) {}

  @Get("dashboard")
  async dashboard(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.dashboard(query));
  }

  @Get("configuration")
  async configuration(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.configurationSummary(query));
  }

  @Get("dispatches/incoming")
  async incomingDispatches(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.incomingDispatches(query));
  }

  @Get("documents/issued")
  async issuedDocuments(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.issuedDocuments(query));
  }

  @Get("documents/issued/:id/file")
  async issuedDocumentFile(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const file = await this.service.issuedDocumentFile(id, query);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader(
      "Content-Disposition",
      `${query.preview === "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.send(file.buffer);
  }

  @Get("documents/portal")
  async portalDocuments(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.portalDocuments(query));
  }

  @Get("documents/local")
  async localDocuments(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.localDocuments(query));
  }

  // Yerel arşiv için kanonik, dış bağlantı kurmayan liste endpoint'i.
  @Get("documents")
  async documents(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.localDocuments(query));
  }

  @Post("documents/backfill")
  async backfillPortalDocument(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.importArchivedPortalDocument(body));
  }

  @Get("documents/:direction/:kind/:id/file")
  async portalDocumentFile(
    @Param("direction") direction: string,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const file = await this.service.portalDocumentFile({
      ...query,
      direction,
      kind,
      id,
    });
    response.setHeader("Content-Type", file.contentType);
    response.setHeader(
      "Content-Disposition",
      `${query.preview === "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.send(file.buffer);
  }

  @Post("documents/incoming/dispatch/:id/import")
  async importIncomingDispatch(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(
      await this.service.importIncomingDispatch({ ...body, id }),
    );
  }

  @Post("documents/incoming/dispatch/:id/create-outgoing-draft")
  async createDispatchDraftFromIncoming(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(
      await this.service.createDispatchDraftFromIncoming({ ...body, id }),
    );
  }

  @Get("documents/incoming/dispatch/:id/outgoing-draft")
  async incomingDispatchDraft(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return apiSuccess(await this.service.incomingDispatchDraft(id, query));
  }

  @Get("recipients")
  async recipients(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.recipientSearch(query));
  }

  @Get("recipients/context")
  async recipientContext(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.invoiceRecipientContext(query));
  }

  @Get("invoice-assistant/template")
  async invoiceAssistantTemplate(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.invoiceAssistantTemplate(query));
  }

  @Put("invoice-assistant/template")
  async saveInvoiceAssistantTemplate(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.saveInvoiceAssistantTemplate(body));
  }

  @Post("invoice-drafts")
  async createManualInvoiceDraft(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.createManualInvoiceDraft(body));
  }

  @Post("dispatch-drafts")
  async createDispatchDraft(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.createManualDispatchDraft(body));
  }

  @Get("dispatches/:id/invoice-draft")
  async outgoingDispatchInvoiceDraft(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return apiSuccess(await this.service.outgoingDispatchInvoiceDraft(id, query));
  }

  @Post("dispatches/:id/invoice-draft")
  async createInvoiceFromDispatch(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.createInvoiceFromDispatch(id, body));
  }

  @Get("invoice-drafts/:draftId")
  async invoiceDraftStatus(@Param("draftId") draftId: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.service.invoiceDraftStatus(draftId, query));
  }

  @Post("invoice-drafts/:draftId/verify")
  async verifyInvoiceDraft(@Param("draftId") draftId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.service.verifyInvoiceDraft(draftId, body));
  }

  @Post("invoice-drafts/:draftId/final-approval")
  async finalApproveInvoiceDraft(
    @Param("draftId") draftId: string,
    @Body() body: Record<string, any>,
    @CurrentUser() user: any,
  ) {
    return apiSuccess(await this.service.finalApproveInvoiceDraft(draftId, body, user?.id || user?.sub || "user"));
  }

  @Post("invoice-drafts/:draftId/submit")
  async submitOfficialInvoice(
    @Param("draftId") draftId: string,
    @Body() body: Record<string, any>,
    @CurrentUser() user: any,
  ) {
    return apiSuccess(await this.service.submitOfficialInvoice(draftId, body, user?.id || user?.sub || "user"));
  }

  @Post("invoice-drafts/:draftId/retry-closure")
  async retryInvoiceClosure(@Param("draftId") draftId: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.service.archiveInvoice({ ...body, draftId }));
  }

  @Get("intakes/:id/model-suggestions")
  async modelSuggestions(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return apiSuccess(await this.service.modelSuggestions(id, query));
  }

  @Get("intakes/:id")
  async intakeDetail(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return apiSuccess(await this.service.intakeDetail(id, query));
  }

  @Put("intakes/:id/model")
  async assignIntakeModel(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.assignIntakeModelSafe(id, body));
  }

  @Post("intakes/:id/model")
  async createIntakeModel(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.createIntakeModelSafe(id, body));
  }

  @Get("model-aliases")
  async modelAliases(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.modelAliases(query));
  }

  @Post("model-aliases")
  async approveModelAlias(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.approveModelAlias(body));
  }

  @Put("model-aliases/:id")
  async updateModelAlias(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.service.updateModelAlias(id, body));
  }

  @Post("model-aliases/:id/reject")
  async rejectModelAlias(@Param("id") id: string, @Body() body: Record<string, any>) {
    return apiSuccess(await this.service.rejectModelAlias(id, body));
  }

  @Get("mail/queue")
  async mailQueue(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.mailQueue(query));
  }

  @Get("settings")
  async settings(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.getSettings(query));
  }

  @Post("settings/test")
  async testSettings(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.testSettings(body));
  }

  @Put("settings")
  async saveSettings(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.saveSettings(body));
  }

  @Post("sync")
  async sync(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.sync(body));
  }

  @Post("documents/:key/read")
  async markDocumentRead(
    @Param("key") key: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.markDocumentRead(key, body));
  }

  @Patch("documents/read-status")
  async markDocumentsRead(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.markDocumentsRead(body));
  }

  @Get("automation/status")
  async automationStatus(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.automationStatus(query));
  }

  @Get("print-queue")
  async printQueue(@Query() query: Record<string, any>) {
    return apiSuccess(await this.service.printQueue(query));
  }

  @Post("print-queue/bulk/pdf")
  async printQueueBulkPdf(
    @Body() body: Record<string, any>,
    @Res() response: Response,
  ) {
    const file = await this.service.printQueueBundle(body);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("X-Isnet-Print-Keys", encodeURIComponent(file.keys.join(",")));
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.send(file.buffer);
  }

  @Post("print-queue/bulk/printed")
  async markPrintedMany(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.markPrintedMany(body));
  }

  @Get("print-queue/:key/pdf")
  async printQueuePdf(
    @Param("key") key: string,
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const file = await this.service.printQueueFile(key, query);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.send(file.buffer);
  }

  @Post("print-queue/:key/printed")
  async markPrinted(
    @Param("key") key: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.markPrinted(key, body));
  }

  @Post("invoices/validate")
  async validateInvoice(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.validateInvoice(body));
  }

  @Post("invoices/prepare")
  async prepareInvoice(@Body() body: Record<string, any>, @CurrentUser() user: any) {
    return apiSuccess(await this.service.prepareInvoice(body, user?.id || user?.sub || "user"));
  }

  @Post("invoices/archive")
  async archiveInvoice(@Body() body: Record<string, any>) {
    return apiSuccess(await this.service.archiveInvoice(body));
  }

  @Post("mail/:id/outlook-draft")
  async createOutlookDraft(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.createOutlookDraft(id, body));
  }

  @Post("mail/:id/sent")
  async markMailSent(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return apiSuccess(await this.service.markMailSent(id, body));
  }
}
