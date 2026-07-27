-- Additive recovery migration for schema objects that are already modeled by
-- Prisma but were missing from older manually maintained SQLite databases.
-- No existing table or row is replaced or deleted here.

CREATE TABLE IF NOT EXISTS "print_region_definitions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mainCompanyId" TEXT,
  "regionCode" TEXT NOT NULL,
  "regionName" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "model_print_regions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "modelRecordId" TEXT NOT NULL,
  "mainCompanyId" TEXT,
  "regionCode" TEXT NOT NULL,
  "regionName" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoice_parser_company_profiles" (
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

CREATE INDEX IF NOT EXISTS "invoice_parser_company_profiles_main_company_slug_company_id_idx"
  ON "invoice_parser_company_profiles"("main_company_slug", "company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_parser_company_profiles_main_company_slug_company_id_document_type_key"
  ON "invoice_parser_company_profiles"("main_company_slug", "company_id", "document_type");

CREATE INDEX IF NOT EXISTS "companies_varsayilan_rapor_kategori_id_idx"
  ON "companies"("varsayilan_rapor_kategori_id");
CREATE INDEX IF NOT EXISTS "documents_rapor_kategori_id_idx"
  ON "documents"("rapor_kategori_id");
