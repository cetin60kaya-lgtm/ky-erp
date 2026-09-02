CREATE TABLE IF NOT EXISTS company_billing_accounts (
  main_company_id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL DEFAULT 'STANDARD',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  currency TEXT NOT NULL DEFAULT 'TRY',
  included_credits INTEGER NOT NULL DEFAULT 0,
  monthly_spend_limit_minor INTEGER NOT NULL DEFAULT 0,
  overage_price_minor_per_1k INTEGER NOT NULL DEFAULT 0,
  custom_price_json TEXT NOT NULL DEFAULT '{}',
  period_start TEXT,
  period_end TEXT,
  next_renewal_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS company_ai_usage_ledger (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  credit_delta INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_ai_usage_company_time
  ON company_ai_usage_ledger(main_company_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_ai_usage_company_source
  ON company_ai_usage_ledger(main_company_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS company_billing_ledger (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  credit_delta INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  note TEXT NOT NULL DEFAULT '',
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_billing_ledger_company_time
  ON company_billing_ledger(main_company_id, created_at DESC);
