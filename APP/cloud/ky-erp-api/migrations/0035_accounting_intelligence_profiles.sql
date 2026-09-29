-- KY ERP accounting intelligence profiles + bank import staging

CREATE TABLE IF NOT EXISTS accounting_extraction_profiles (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  party_company_id TEXT,
  party_tax_no TEXT,
  party_name_pattern TEXT,
  document_type TEXT NOT NULL DEFAULT 'GELEN_FATURA',
  provider_type TEXT NOT NULL DEFAULT 'AZURE_DOCUMENT_INTELLIGENCE',
  provider_model_id TEXT,
  min_confidence REAL NOT NULL DEFAULT 0.75,
  field_hints TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  successful_samples INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_accounting_extraction_profiles_lookup
  ON accounting_extraction_profiles(main_company_slug, party_tax_no, document_type, is_active);

CREATE TABLE IF NOT EXISTS accounting_bank_import_batches (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'BANK_CSV',
  bank_name TEXT,
  account_name TEXT,
  iban TEXT,
  original_file_name TEXT,
  file_asset_id TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'IMPORTED',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounting_bank_import_rows (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  transaction_date TEXT,
  value_date TEXT,
  description TEXT,
  reference_no TEXT,
  amount REAL NOT NULL DEFAULT 0,
  direction TEXT NOT NULL DEFAULT 'IN',
  currency TEXT NOT NULL DEFAULT 'TRY',
  counterparty_name TEXT,
  counterparty_iban TEXT,
  company_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'UNMATCHED',
  match_confidence REAL NOT NULL DEFAULT 0,
  ledger_entry_id TEXT,
  raw_data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_accounting_bank_import_rows_batch
  ON accounting_bank_import_rows(main_company_slug, batch_id, row_no);
CREATE INDEX IF NOT EXISTS ix_accounting_bank_import_rows_unmatched
  ON accounting_bank_import_rows(main_company_slug, match_status, transaction_date DESC);
