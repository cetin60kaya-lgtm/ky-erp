CREATE TABLE "isnet_document_states" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "automation_key" TEXT NOT NULL,
  "source_id" TEXT,
  "kind" TEXT,
  "direction" TEXT,
  "document_no" TEXT,
  "partner_name" TEXT,
  "date_text" TEXT,
  "model_name" TEXT,
  "model_linked" BOOLEAN NOT NULL DEFAULT false,
  "archive_stage" TEXT,
  "intake_id" TEXT,
  "pdf_path" TEXT,
  "xml_path" TEXT,
  "customer_dispatch" BOOLEAN NOT NULL DEFAULT false,
  "print_eligible" BOOLEAN NOT NULL DEFAULT false,
  "printed_at" DATETIME,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "downloaded_at" DATETIME,
  "marked_read_at" DATETIME,
  "first_seen_at" DATETIME,
  "new_document" BOOLEAN NOT NULL DEFAULT false,
  "app_read_at" DATETIME,
  "error" TEXT,
  "last_attempt_at" DATETIME,
  "metadata_json" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "isnet_document_states_main_company_slug_automation_key_key"
  ON "isnet_document_states"("main_company_slug", "automation_key");
CREATE INDEX "isnet_document_states_main_company_slug_completed_idx"
  ON "isnet_document_states"("main_company_slug", "completed");
CREATE INDEX "isnet_document_states_main_company_slug_print_eligible_printed_at_idx"
  ON "isnet_document_states"("main_company_slug", "print_eligible", "printed_at");
CREATE INDEX "isnet_document_states_main_company_slug_document_no_idx"
  ON "isnet_document_states"("main_company_slug", "document_no");