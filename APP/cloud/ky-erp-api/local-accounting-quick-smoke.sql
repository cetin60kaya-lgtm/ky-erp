-- KY ERP hizli muhasebe / cari izole smoke semasi.
-- Sadece CI yerel D1 icindir; canli veriye uygulanmaz.

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT,
  company_type TEXT,
  type TEXT,
  tax_no TEXT,
  phone TEXT,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

ALTER TABLE companies ADD COLUMN current_balance REAL NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN supplier_debt_tracking INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN customer_receivable_tracking INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'CASH';
ALTER TABLE companies ADD COLUMN vat_tracking_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN expense_category TEXT;
ALTER TABLE companies ADD COLUMN default_record_type TEXT NOT NULL DEFAULT 'RESMI';
ALTER TABLE companies ADD COLUMN tax_office TEXT;
ALTER TABLE companies ADD COLUMN address TEXT;
ALTER TABLE companies ADD COLUMN note TEXT;

CREATE TABLE IF NOT EXISTS current_account_movements (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  document_no TEXT,
  document_id TEXT,
  description TEXT,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  effect REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL DEFAULT 0,
  record_type TEXT,
  payment_method TEXT,
  raw TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_smoke_cari_company_date
  ON current_account_movements(main_company_slug, company_id, movement_date DESC);

CREATE TABLE IF NOT EXISTS vat_records (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT,
  firm_id TEXT,
  document_id TEXT,
  date TEXT,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  incoming_vat REAL NOT NULL DEFAULT 0,
  outgoing_vat REAL NOT NULL DEFAULT 0,
  carry_vat REAL NOT NULL DEFAULT 0,
  raw TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounting_ledger_entries (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  record_scope TEXT NOT NULL DEFAULT 'OFFICIAL',
  company_id TEXT,
  company_name TEXT,
  description TEXT,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  payment_method TEXT,
  bank_account_id TEXT,
  source_document_id TEXT,
  source_payment_plan_id TEXT,
  file_asset_id TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS company_aliases (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  tax_no TEXT,
  source TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(main_company_slug, normalized_name)
);

CREATE TABLE IF NOT EXISTS payment_control_records (
  id TEXT PRIMARY KEY,
  main_company_id TEXT,
  main_company_slug TEXT,
  firm_id TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  work_type TEXT NOT NULL DEFAULT 'OFFICIAL',
  check_no TEXT,
  bank_name TEXT,
  due_date TEXT,
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  note TEXT,
  raw TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
