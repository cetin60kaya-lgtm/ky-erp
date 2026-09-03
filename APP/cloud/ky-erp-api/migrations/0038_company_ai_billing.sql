-- KY ERP company AI usage / billing ledger
-- Additive only. No existing tenant or usage data is removed.

CREATE TABLE IF NOT EXISTS company_billing_profiles (
  main_company_id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL UNIQUE,
  package_code TEXT NOT NULL DEFAULT 'CUSTOM',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  included_tokens INTEGER NOT NULL DEFAULT 0,
  monthly_token_limit INTEGER NOT NULL DEFAULT 0,
  base_monthly_price_minor INTEGER NOT NULL DEFAULT 0,
  custom_monthly_price_minor INTEGER,
  overage_price_per_million_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  period_start TEXT,
  period_end TEXT,
  next_renewal_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL DEFAULT '',
  updated_by_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_billing_profiles_slug
  ON company_billing_profiles(main_company_slug);

CREATE TABLE IF NOT EXISTS company_billing_ledger (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  credit_tokens_delta INTEGER NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_billing_ledger_company_created
  ON company_billing_ledger(main_company_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_billing_ledger_type_created
  ON company_billing_ledger(movement_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_billing_ledger_source_ref
  ON company_billing_ledger(source, source_ref)
  WHERE source_ref IS NOT NULL AND TRIM(source_ref) <> '';

-- Existing tenants stay active/unlimited until the application owner explicitly
-- assigns a package/limit. This prevents a billing migration from locking out
-- already-live companies.
INSERT OR IGNORE INTO company_billing_profiles (
  main_company_id, main_company_slug, package_code, status,
  included_tokens, monthly_token_limit, base_monthly_price_minor,
  custom_monthly_price_minor, overage_price_per_million_minor, currency,
  period_start, period_end, next_renewal_at, note,
  created_by_user_id, updated_by_user_id, created_at, updated_at
)
SELECT
  id, slug, 'CUSTOM', 'ACTIVE',
  0, 0, 0,
  NULL, 0, 'TRY',
  strftime('%Y-%m-01T00:00:00.000Z','now'),
  strftime('%Y-%m-01T00:00:00.000Z','now','+1 month'),
  strftime('%Y-%m-01T00:00:00.000Z','now','+1 month'),
  '', 'SYSTEM', 'SYSTEM',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM main_companies;
