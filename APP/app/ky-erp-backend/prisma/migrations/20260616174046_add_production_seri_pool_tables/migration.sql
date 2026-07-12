CREATE TABLE IF NOT EXISTS "production_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_id" TEXT,
  "main_company_slug" TEXT NOT NULL,
  "model_id" TEXT,
  "model_name" TEXT,
  "company_id" TEXT,
  "company_name" TEXT,
  "order_no" TEXT,
  "dispatch_no" TEXT,
  "dispatch_date" DATETIME,
  "dispatch_qty" DECIMAL NOT NULL DEFAULT 0,
  "produced_qty" DECIMAL NOT NULL DEFAULT 0,
  "invoice_qty" DECIMAL NOT NULL DEFAULT 0,
  "unit_price" DECIMAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "raw" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "production_machines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_id" TEXT,
  "main_company_slug" TEXT NOT NULL,
  "machine_no" TEXT NOT NULL,
  "machine_name" TEXT NOT NULL,
  "shift" TEXT,
  "default_machinist" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Aktif',
  "raw" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "production_dispatch_links" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_id" TEXT,
  "main_company_slug" TEXT NOT NULL,
  "production_job_id" TEXT,
  "model_id" TEXT,
  "dispatch_no" TEXT NOT NULL,
  "order_no" TEXT,
  "dispatch_qty" DECIMAL NOT NULL DEFAULT 0,
  "raw" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "production_invoice_links" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_id" TEXT,
  "main_company_slug" TEXT NOT NULL,
  "production_job_id" TEXT,
  "model_id" TEXT,
  "invoice_no" TEXT NOT NULL,
  "dispatch_no" TEXT,
  "invoice_qty" DECIMAL NOT NULL DEFAULT 0,
  "unit_price" DECIMAL NOT NULL DEFAULT 0,
  "raw" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "production_jobs_main_company_slug_idx" ON "production_jobs"("main_company_slug");
CREATE INDEX IF NOT EXISTS "production_jobs_model_id_idx" ON "production_jobs"("model_id");
CREATE UNIQUE INDEX IF NOT EXISTS "production_machines_main_company_slug_machine_no_key" ON "production_machines"("main_company_slug", "machine_no");
CREATE INDEX IF NOT EXISTS "production_machines_main_company_slug_idx" ON "production_machines"("main_company_slug");
CREATE INDEX IF NOT EXISTS "production_dispatch_links_main_company_slug_idx" ON "production_dispatch_links"("main_company_slug");
CREATE INDEX IF NOT EXISTS "production_dispatch_links_model_id_idx" ON "production_dispatch_links"("model_id");
CREATE INDEX IF NOT EXISTS "production_invoice_links_main_company_slug_idx" ON "production_invoice_links"("main_company_slug");
CREATE INDEX IF NOT EXISTS "production_invoice_links_model_id_idx" ON "production_invoice_links"("model_id");
