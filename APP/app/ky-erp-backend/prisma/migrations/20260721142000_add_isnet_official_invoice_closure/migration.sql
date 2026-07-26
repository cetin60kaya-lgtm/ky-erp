ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "portal_draft_id" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "expected_snapshot" JSONB;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "portal_snapshot" JSONB;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "verification_diff" JSONB;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "draft_version" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "approval_version" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "approved_at" DATETIME;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "approved_by" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "submitted_at" DATETIME;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "submitted_by" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "official_invoice_number" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "official_uuid" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "isnet_document_id" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "official_status" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "portal_response_hash" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "pdf_path" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "xml_path" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "sales_invoice_id" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "current_movement_id" TEXT;
ALTER TABLE "isnet_invoice_draft_requests" ADD COLUMN "completed_at" DATETIME;

CREATE UNIQUE INDEX "isnet_invoice_draft_requests_main_company_slug_portal_draft_id_key"
ON "isnet_invoice_draft_requests"("main_company_slug", "portal_draft_id");
CREATE UNIQUE INDEX "isnet_invoice_draft_requests_main_company_slug_official_invoice_number_key"
ON "isnet_invoice_draft_requests"("main_company_slug", "official_invoice_number");
CREATE UNIQUE INDEX "isnet_invoice_draft_requests_main_company_slug_official_uuid_key"
ON "isnet_invoice_draft_requests"("main_company_slug", "official_uuid");

CREATE TABLE "isnet_invoice_line_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "draft_request_id" TEXT NOT NULL,
  "source_line_key" TEXT NOT NULL,
  "source_intake_line_id" TEXT,
  "source_document_line_id" TEXT,
  "sales_invoice_line_id" TEXT,
  "model_id" TEXT,
  "product_name" TEXT,
  "dispatched_quantity" DECIMAL NOT NULL DEFAULT 0,
  "previously_billed" DECIMAL NOT NULL DEFAULT 0,
  "billed_quantity" DECIMAL NOT NULL DEFAULT 0,
  "non_billable_quantity" DECIMAL NOT NULL DEFAULT 0,
  "total_billed" DECIMAL NOT NULL DEFAULT 0,
  "remaining_quantity" DECIMAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'FATURALANMADI',
  "raw" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "isnet_invoice_line_allocations_draft_request_id_fkey"
    FOREIGN KEY ("draft_request_id") REFERENCES "isnet_invoice_draft_requests" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "isnet_invoice_line_allocations_draft_request_id_source_line_key_key"
ON "isnet_invoice_line_allocations"("draft_request_id", "source_line_key");
CREATE INDEX "isnet_invoice_line_allocations_source_intake_line_id_idx" ON "isnet_invoice_line_allocations"("source_intake_line_id");
CREATE INDEX "isnet_invoice_line_allocations_source_document_line_id_idx" ON "isnet_invoice_line_allocations"("source_document_line_id");
CREATE INDEX "isnet_invoice_line_allocations_sales_invoice_line_id_idx" ON "isnet_invoice_line_allocations"("sales_invoice_line_id");
CREATE INDEX "isnet_invoice_line_allocations_model_id_idx" ON "isnet_invoice_line_allocations"("model_id");
