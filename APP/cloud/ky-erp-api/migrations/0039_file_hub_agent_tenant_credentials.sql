-- KY ERP / KY File Hub
-- Tenant-scoped File Agent credentials. Additive schema extension only.

CREATE TABLE IF NOT EXISTS file_hub_agent_credentials (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'KY File Agent',
  secret_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_file_hub_agent_credentials_active
  ON file_hub_agent_credentials(main_company_slug, is_active);
