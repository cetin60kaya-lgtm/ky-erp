CREATE TABLE "isnet_invoice_draft_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "main_company_slug" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "source_id" TEXT,
    "dispatch_no" TEXT,
    "external_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "draft_no" TEXT,
    "mail_package_id" TEXT,
    "error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "isnet_invoice_draft_requests_main_company_slug_idempotency_key_key"
ON "isnet_invoice_draft_requests"("main_company_slug", "idempotency_key");

CREATE UNIQUE INDEX "isnet_invoice_draft_requests_main_company_slug_external_id_key"
ON "isnet_invoice_draft_requests"("main_company_slug", "external_id");

CREATE INDEX "isnet_invoice_draft_requests_main_company_slug_source_id_idx"
ON "isnet_invoice_draft_requests"("main_company_slug", "source_id");

CREATE INDEX "isnet_invoice_draft_requests_main_company_slug_status_idx"
ON "isnet_invoice_draft_requests"("main_company_slug", "status");