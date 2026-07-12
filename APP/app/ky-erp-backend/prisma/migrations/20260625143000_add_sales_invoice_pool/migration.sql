CREATE TABLE "sales_invoice_states" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "main_company_slug" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "invoice_date" DATETIME NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'SATIS_FATURA',
    "source_kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "cari_status" TEXT NOT NULL DEFAULT 'CARI_PENDING',
    "model_status" TEXT NOT NULL DEFAULT 'MODEL_PENDING',
    "cari_movement_id" TEXT,
    "dispatch_no" TEXT,
    "order_no" TEXT,
    "note" TEXT,
    "parser_confidence" DECIMAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "sales_invoice_states_invoice_id_key" ON "sales_invoice_states"("invoice_id");
CREATE UNIQUE INDEX "sales_invoice_states_duplicate_key" ON "sales_invoice_states"("main_company_slug", "company_id", "invoice_no", "invoice_date", "document_type");
CREATE INDEX "sales_invoice_states_main_company_slug_invoice_date_idx" ON "sales_invoice_states"("main_company_slug", "invoice_date");
CREATE INDEX "sales_invoice_states_main_company_slug_cari_status_idx" ON "sales_invoice_states"("main_company_slug", "cari_status");
CREATE INDEX "sales_invoice_states_main_company_slug_model_status_idx" ON "sales_invoice_states"("main_company_slug", "model_status");

CREATE TABLE "sales_invoice_line_model_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "main_company_slug" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_line_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "print_region_id" TEXT,
    "print_region_name" TEXT,
    "matched_quantity" DECIMAL NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "sales_invoice_line_model_links_unique_region" ON "sales_invoice_line_model_links"("invoice_line_id", "model_id", "print_region_id");
CREATE INDEX "sales_invoice_line_model_links_main_company_slug_invoice_id_idx" ON "sales_invoice_line_model_links"("main_company_slug", "invoice_id");
CREATE INDEX "sales_invoice_line_model_links_invoice_line_id_idx" ON "sales_invoice_line_model_links"("invoice_line_id");
CREATE INDEX "sales_invoice_line_model_links_model_id_idx" ON "sales_invoice_line_model_links"("model_id");

CREATE TABLE "sales_invoice_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "main_company_slug" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "sales_invoice_history_main_company_slug_invoice_id_created_at_idx" ON "sales_invoice_history"("main_company_slug", "invoice_id", "created_at");

CREATE TABLE "invoice_parser_company_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "main_company_slug" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL DEFAULT 'SATIS_FATURA',
    "known_invoice_prefixes" JSONB,
    "known_line_description_patterns" JSONB,
    "known_model_aliases" JSONB,
    "known_unit_patterns" JSONB,
    "known_price_patterns" JSONB,
    "extraction_hints_json" JSONB,
    "last_successful_import_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "invoice_parser_company_profiles_scope_key" ON "invoice_parser_company_profiles"("main_company_slug", "company_id", "document_type");
CREATE INDEX "invoice_parser_company_profiles_main_company_slug_company_id_idx" ON "invoice_parser_company_profiles"("main_company_slug", "company_id");
