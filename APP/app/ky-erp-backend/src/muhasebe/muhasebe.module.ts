import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { SqlStoreService } from "../kyerp-core/sql-store.service";
import { ModelModule } from "../modules/models/model.module";
import { DocumentIntakeService } from "./document-intake.service";
import { DocumentIntakeController } from "./document-intake/document-intake.controller";
import { DocumentIntakeServiceV2 } from "./document-intake/document-intake.service";
import { DocumentParserService } from "./document-intake/document-parser.service";
import { DocumentClassifierService } from "./document-intake/document-classifier.service";
import { DocumentMatcherService } from "./document-intake/document-matcher.service";
import { DocumentFolderWatcherService } from "./document-folder-watcher.service";
import { BelgeImportController } from "./belge-import.controller";
import { MuhasebeAliasController } from "./muhasebe-alias.controller";
import { MuhasebeDocumentWorkflowService } from "./muhasebe-document-workflow.service";
import { MuhasebeController } from "./muhasebe.controller";
import { MuhasebeBelgeService } from "./muhasebe-belge.service";
import { MuhasebeService } from "./muhasebe.service";
import { PdfExtractionService } from "./pdf-extraction.service";
import { FirmaKartlariDbService } from "./firma-kartlari-db.service";
import { MuhasebeDbService } from "./muhasebe-db.service";
import { MuhasebeIntegrationService } from "./muhasebe-integration.service";
import { MuhasebeFinalService } from "./muhasebe-final.service";
import { AccountingApiService } from "./accounting-api.service";
import { AccountingPublicApiController } from "./accounting-public-api.controller";
import { FirmsController } from "./firms/firms.controller";
import { CariController } from "./cari/cari.controller";
import { KdvController } from "./kdv/kdv.controller";
import { PaymentController } from "./payment/payment.controller";
import { MailController } from "./mail/mail.controller";
import { MailTemplateService } from "./mail/mail-template.service";
import { StatementController } from "./statement/statement.controller";
import { SalesInvoicePoolService } from "./sales-invoice-pool.service";
import { DispatchReconciliationController } from "./dispatch-reconciliation.controller";
import { DispatchReconciliationService } from "./dispatch-reconciliation.service";
import { IsnetOperationsController } from "./isnet-operations.controller";
import { IsnetOperationsService } from "./isnet-operations.service";
import { IsnetConnectionController } from "./isnet-connection.controller";
import { IsnetConnectionService } from "./isnet-connection.service";
import { IsnetMailDraftService } from "./isnet-mail-draft.service";
import { IsnetSourceIntakeController } from "./isnet-source-intake.controller";
import { IsnetSourceIntakeService } from "./isnet-source-intake.service";
import { IsnetFullSyncController } from "./isnet-full-sync.controller";
import { IsnetFullSyncService } from "./isnet-full-sync.service";
import { IsnetSourceWorkflowController } from "./isnet-source-workflow.controller";
import { IsnetSourceWorkflowService } from "./isnet-source-workflow.service";
import { IsnetAutoFlowController } from "./isnet-auto-flow.controller";
import { IsnetAutoFlowService } from "./isnet-auto-flow.service";
import { IsnetLocalFileController } from "./isnet-local-file.controller";
import { IsnetLocalFileService } from "./isnet-local-file.service";
import { IsnetDocumentCenterController } from "./isnet-document-center.controller";
import { IsnetDocumentCenterService } from "./isnet-document-center.service";
import { IsnetSelectedPrintController } from "./isnet-selected-print.controller";
import { IsnetSelectedPrintService } from "./isnet-selected-print.service";
import { MuhasebeSmartMatchController } from "./muhasebe-smart-match.controller";
import { MuhasebeSmartMatchService } from "./muhasebe-smart-match.service";
import { IsnetBusinessSettingsController } from "./isnet-business-settings.controller";
import { IsnetBusinessSettingsService } from "./isnet-business-settings.service";
import { IsnetDispatchPreparationService } from "./isnet-dispatch-preparation.service";
import { IsnetDispatchFlowCoordinatorService } from "./isnet-dispatch-flow-coordinator.service";
import { IsnetInvoicePreparationController } from "./isnet-invoice-preparation.controller";
import { IsnetInvoicePreparationService } from "./isnet-invoice-preparation.service";
import { CheckCenterController } from "./check-center/check-center.controller";
import { CheckCenterService } from "./check-center/check-center.service";

@Module({
  imports: [AdminModule, ModelModule],
  controllers: [
    MuhasebeController,
    DocumentIntakeController,
    BelgeImportController,
    MuhasebeAliasController,
    MuhasebeSmartMatchController,
    FirmsController,
    CariController,
    KdvController,
    PaymentController,
    MailController,
    StatementController,
    AccountingPublicApiController,
    CheckCenterController,
    DispatchReconciliationController,
    IsnetOperationsController,
    IsnetConnectionController,
    IsnetSourceIntakeController,
    IsnetFullSyncController,
    IsnetSourceWorkflowController,
    IsnetAutoFlowController,
    IsnetLocalFileController,
    IsnetDocumentCenterController,
    IsnetSelectedPrintController,
    IsnetBusinessSettingsController,
    IsnetInvoicePreparationController,
  ],
  providers: [
    AccountingApiService,
    CheckCenterService,
    MuhasebeBelgeService,
    MuhasebeService,
    MuhasebeDocumentWorkflowService,
    MuhasebeSmartMatchService,
    DocumentIntakeService,
    DocumentIntakeServiceV2,
    DocumentParserService,
    DocumentClassifierService,
    DocumentMatcherService,
    DocumentFolderWatcherService,
    SqlStoreService,
    PdfExtractionService,
    FirmaKartlariDbService,
    MuhasebeDbService,
    MuhasebeIntegrationService,
    MuhasebeFinalService,
    SalesInvoicePoolService,
    MailTemplateService,
    DispatchReconciliationService,
    IsnetOperationsService,
    IsnetConnectionService,
    IsnetMailDraftService,
    IsnetSourceIntakeService,
    IsnetFullSyncService,
    IsnetSourceWorkflowService,
    IsnetAutoFlowService,
    IsnetLocalFileService,
    IsnetDocumentCenterService,
    IsnetSelectedPrintService,
    IsnetBusinessSettingsService,
    IsnetDispatchPreparationService,
    IsnetDispatchFlowCoordinatorService,
    IsnetInvoicePreparationService,
  ],
  exports: [
    MuhasebeBelgeService,
    MuhasebeService,
    MuhasebeDocumentWorkflowService,
    MuhasebeSmartMatchService,
    IsnetBusinessSettingsService,
    IsnetDispatchPreparationService,
    IsnetDispatchFlowCoordinatorService,
    IsnetInvoicePreparationService,
    DocumentIntakeService,
    DocumentFolderWatcherService,
    AccountingApiService,
    CheckCenterService,
    MuhasebeFinalService,
    FirmaKartlariDbService,
  ],
})
export class MuhasebeModule {}
