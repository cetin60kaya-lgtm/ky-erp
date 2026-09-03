-- KY ERP FIBE (Firma Bazli Ek Odeme) takip altyapisi.
-- FIBE normal cari bakiyesinden tamamen ayridir.
-- Varsayilan kapali; yalniz firma kartinda acilan firmalarda kullanilir.
-- Eski donem FIBE degeri acilis hak edisi / acilis odeneni ile devralinir.

ALTER TABLE companies ADD COLUMN fibe_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN fibe_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN fibe_start_date TEXT;
ALTER TABLE companies ADD COLUMN fibe_opening_accrual REAL NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN fibe_opening_paid REAL NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN fibe_note TEXT;

CREATE TABLE IF NOT EXISTS accounting_fibe_movements (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT,
  source_document_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  description TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS ix_accounting_fibe_company_date
  ON accounting_fibe_movements(main_company_slug, company_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS ix_accounting_fibe_source_document
  ON accounting_fibe_movements(main_company_slug, source_document_id)
  WHERE source_document_id IS NOT NULL AND TRIM(source_document_id) <> '' AND deleted_at IS NULL;
