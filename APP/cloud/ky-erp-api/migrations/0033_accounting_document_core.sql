-- KY ERP provider-neutral accounting / document pool core
-- Additive migration only. İşNet/Paraşüt/manual imports feed the same canonical tables.

CREATE TABLE IF NOT EXISTS accounting_documents (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'INCOMING',
  document_type TEXT NOT NULL DEFAULT 'OTHER',
  provider_type TEXT NOT NULL DEFAULT 'MANUAL',
  provider_document_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL',
  status TEXT NOT NULL DEFAULT 'INGESTED',
  record_scope TEXT NOT NULL DEFAULT 'OFFICIAL',
  document_no TEXT,
  uuid TEXT,
  issue_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  party_company_id TEXT,
  party_name TEXT,
  party_tax_no TEXT,
  party_tax_office TEXT,
  party_iban TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  payable_total REAL NOT NULL DEFAULT 0,
  file_asset_id TEXT,
  xml_file_asset_id TEXT,
  pdf_file_asset_id TEXT,
  duplicate_of_id TEXT,
  parser_version TEXT,
  raw_metadata TEXT,
  note TEXT,
  approved_by TEXT,
  approved_at TEXT,
  posted_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_documents_uuid
  ON accounting_documents(main_company_slug, uuid)
  WHERE uuid IS NOT NULL AND TRIM(uuid) <> '' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_accounting_documents_company_status
  ON accounting_documents(main_company_slug, status, issue_date DESC);
CREATE INDEX IF NOT EXISTS ix_accounting_documents_party
  ON accounting_documents(main_company_slug, party_company_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS ix_accounting_documents_no
  ON accounting_documents(main_company_slug, document_no, party_tax_no, issue_date);

CREATE TABLE IF NOT EXISTS accounting_document_lines (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  line_no INTEGER NOT NULL DEFAULT 1,
  product_id TEXT,
  product_code TEXT,
  supplier_product_code TEXT,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  unit_code TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  match_status TEXT NOT NULL DEFAULT 'UNMATCHED',
  match_confidence REAL,
  raw_metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_accounting_document_lines_document
  ON accounting_document_lines(main_company_slug, document_id, line_no);

CREATE TABLE IF NOT EXISTS accounting_document_taxes (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  tax_type TEXT NOT NULL DEFAULT 'KDV',
  tax_rate REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  exemption_code TEXT,
  exemption_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_accounting_document_taxes_document
  ON accounting_document_taxes(main_company_slug, document_id);

CREATE TABLE IF NOT EXISTS accounting_document_relations (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  related_document_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(main_company_slug, document_id, related_document_id, relation_type)
);

CREATE TABLE IF NOT EXISTS accounting_document_issues (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  issue_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'WARNING',
  field_name TEXT,
  message TEXT NOT NULL,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_accounting_document_issues_open
  ON accounting_document_issues(main_company_slug, document_id, is_resolved);

CREATE TABLE IF NOT EXISTS accounting_payment_plans (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  counterparty_type TEXT NOT NULL DEFAULT 'COMPANY',
  counterparty_id TEXT,
  counterparty_name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  planned_date TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  payment_method TEXT,
  bank_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  description TEXT,
  source_document_id TEXT,
  source_type TEXT,
  reminder_enabled INTEGER NOT NULL DEFAULT 0,
  reminder_at TEXT,
  paid_amount REAL NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_accounting_payment_plans_due
  ON accounting_payment_plans(main_company_slug, status, planned_date, due_date);

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
CREATE INDEX IF NOT EXISTS ix_accounting_ledger_entries_date
  ON accounting_ledger_entries(main_company_slug, entry_date DESC);
CREATE INDEX IF NOT EXISTS ix_accounting_ledger_entries_company
  ON accounting_ledger_entries(main_company_slug, company_id, entry_date DESC);
