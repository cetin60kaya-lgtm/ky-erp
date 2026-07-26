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

@Module({
  imports: [AdminModule, ModelModule],
  controllers: [
    MuhasebeController,
    DocumentIntakeController,
    BelgeImportController,
    MuhasebeAliasController,
    FirmsController,
    CariController,
    KdvController,
    PaymentController,
    MailController,
    StatementController,
    AccountingPublicApiController,
    DispatchReconciliationController,
    IsnetOperationsController,
  ],
  providers: [
    AccountingApiService,
    MuhasebeBelgeService,
    MuhasebeService,
    MuhasebeDocumentWorkflowService,
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
  ],
  exports: [
    MuhasebeBelgeService,
    MuhasebeService,
    MuhasebeDocumentWorkflowService,
    DocumentIntakeService,
    DocumentFolderWatcherService,
    AccountingApiService,
    MuhasebeFinalService,
    FirmaKartlariDbService,
  ],
})
export class MuhasebeModule {}
