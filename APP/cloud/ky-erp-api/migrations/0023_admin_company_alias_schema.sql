-- KY ERP Yönetim / Eşleştirme canonical şema uyumluluğu.
-- Yalnız additive işlemler içerir; mevcut firma veya muhasebe verisini değiştirmez.

CREATE TABLE IF NOT EXISTS company_aliases (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  tax_no TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_aliases_company_normalized
  ON company_aliases (main_company_slug, normalized_name);

CREATE INDEX IF NOT EXISTS idx_company_aliases_company_target
  ON company_aliases (main_company_slug, company_id, is_active, deleted_at);

CREATE INDEX IF NOT EXISTS idx_company_aliases_tax_no
  ON company_aliases (main_company_slug, tax_no)
  WHERE tax_no IS NOT NULL AND TRIM(tax_no) <> '';
