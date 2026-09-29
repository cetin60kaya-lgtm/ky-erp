-- KY ERP Muhasebe tek çalışma omurgası: canlı revision, banka/kasa hesapları ve cari mutabakat.
CREATE TABLE IF NOT EXISTS accounting_live_revision (
  main_company_slug TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounting_financial_accounts (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_type TEXT NOT NULL,
  name TEXT NOT NULL,
  bank_name TEXT,
  iban TEXT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  opening_balance REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_financial_accounts_name
ON accounting_financial_accounts(main_company_slug, name);

CREATE TABLE IF NOT EXISTS accounting_reconciliations (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING',
  erp_balance REAL NOT NULL DEFAULT 0,
  counterparty_balance REAL,
  difference REAL,
  note TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_reconciliations_period
ON accounting_reconciliations(main_company_slug, company_id, period);

CREATE INDEX IF NOT EXISTS ix_accounting_financial_accounts_active
ON accounting_financial_accounts(main_company_slug, is_active, account_type, name);

CREATE INDEX IF NOT EXISTS ix_accounting_reconciliations_status
ON accounting_reconciliations(main_company_slug, period, status);
