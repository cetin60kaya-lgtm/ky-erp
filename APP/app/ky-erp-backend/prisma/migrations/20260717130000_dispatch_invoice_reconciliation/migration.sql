CREATE TABLE "dispatch_invoice_matches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "dispatch_id" TEXT,
  "dispatch_line_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "invoice_line_id" TEXT NOT NULL,
  "dispatch_qty" DECIMAL NOT NULL DEFAULT 0,
  "matched_qty" DECIMAL NOT NULL DEFAULT 0,
  "match_type" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "matched_fields_json" JSONB,
  "mismatch_fields_json" JSONB,
  "is_manual" BOOLEAN NOT NULL DEFAULT false,
  "approved_by" TEXT,
  "approved_at" DATETIME,
  "rejected_by" TEXT,
  "rejected_at" DATETIME,
  "note" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "dispatch_invoice_matches_main_company_slug_invoice_line_id_key"
  ON "dispatch_invoice_matches"("main_company_slug", "invoice_line_id");
CREATE INDEX "dispatch_invoice_matches_main_company_slug_dispatch_line_id_idx"
  ON "dispatch_invoice_matches"("main_company_slug", "dispatch_line_id");
CREATE INDEX "dispatch_invoice_matches_main_company_slug_invoice_id_idx"
  ON "dispatch_invoice_matches"("main_company_slug", "invoice_id");
CREATE INDEX "dispatch_invoice_matches_main_company_slug_status_idx"
  ON "dispatch_invoice_matches"("main_company_slug", "status");

CREATE TABLE "dispatch_invoice_match_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "match_id" TEXT,
  "dispatch_line_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "old_value_json" JSONB,
  "new_value_json" JSONB,
  "description" TEXT,
  "user_id" TEXT,
  "is_automatic" BOOLEAN NOT NULL DEFAULT false,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "dispatch_invoice_match_logs_main_company_slug_dispatch_line_id_created_at_idx"
  ON "dispatch_invoice_match_logs"("main_company_slug", "dispatch_line_id", "created_at");
CREATE INDEX "dispatch_invoice_match_logs_match_id_idx"
  ON "dispatch_invoice_match_logs"("match_id");
