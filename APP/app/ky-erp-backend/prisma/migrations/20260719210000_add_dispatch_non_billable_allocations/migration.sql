-- Geri dönüş planı:
-- 1. Migration öncesi KYERP_DATABASE_GUVENCE.ps1 ile tam SQLite yedeği alınır.
-- 2. Geri dönüş gerekirse bu tablonun verileri dışa aktarılır.
-- 3. DROP TABLE "dispatch_non_billable_allocations" uygulanır.
-- Mevcut irsaliye, fatura ve eşleşme tabloları değiştirilmez.
CREATE TABLE "dispatch_non_billable_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "dispatch_line_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" DECIMAL NOT NULL DEFAULT 0,
  "delivery_method" TEXT NOT NULL DEFAULT 'ELDEN_TESLIM',
  "note" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "deleted_at" DATETIME,
  CONSTRAINT "dispatch_non_billable_allocations_dispatch_line_id_fkey"
    FOREIGN KEY ("dispatch_line_id") REFERENCES "customer_dispatch_lines" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "dispatch_non_billable_allocations_main_company_slug_dispatch_line_id_deleted_at_idx"
  ON "dispatch_non_billable_allocations"("main_company_slug", "dispatch_line_id", "deleted_at");
CREATE INDEX "dispatch_non_billable_allocations_main_company_slug_category_idx"
  ON "dispatch_non_billable_allocations"("main_company_slug", "category");
