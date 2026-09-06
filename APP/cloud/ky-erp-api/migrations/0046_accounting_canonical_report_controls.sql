-- KY ERP canonical accounting report controls
-- Additive only. Keeps report decisions separate from accounting postings.

CREATE TABLE IF NOT EXISTS accounting_report_categories (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'EXPENSE',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, code)
);

CREATE INDEX IF NOT EXISTS ix_accounting_report_categories_active
  ON accounting_report_categories(main_company_slug, is_active, sort_order, name);

CREATE TABLE IF NOT EXISTS accounting_report_overrides (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  report_included INTEGER,
  report_category_id TEXT,
  report_amount REAL,
  report_description TEXT,
  report_official_type TEXT,
  report_vat_amount REAL,
  report_vat_included INTEGER,
  report_expense_status TEXT,
  report_note TEXT,
  override_mask TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS ix_accounting_report_overrides_source
  ON accounting_report_overrides(main_company_slug, source_type, source_id);

CREATE TABLE IF NOT EXISTS accounting_expense_rules (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT,
  product_id TEXT,
  normalized_description TEXT,
  category_id TEXT,
  category_name TEXT NOT NULL,
  routing_type TEXT NOT NULL DEFAULT 'EXPENSE',
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'USER',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_accounting_expense_rules_match
  ON accounting_expense_rules(main_company_slug, company_id, product_id, normalized_description, is_active, priority);
