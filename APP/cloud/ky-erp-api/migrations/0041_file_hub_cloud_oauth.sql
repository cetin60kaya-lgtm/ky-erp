-- KY ERP File Hub - direct Google Drive / Microsoft Graph cloud connection core
-- Additive only. No existing File Hub rows are reset or removed.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS file_hub_oauth_accounts (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  provider_account_id TEXT,
  account_email TEXT,
  display_name TEXT,
  access_token_cipher TEXT NOT NULL,
  refresh_token_cipher TEXT,
  token_expires_at TEXT,
  scopes TEXT,
  created_by_user_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, provider_type, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_file_hub_oauth_accounts_tenant
  ON file_hub_oauth_accounts(main_company_slug, provider_type);

CREATE TABLE IF NOT EXISTS file_hub_oauth_states (
  state TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  return_path TEXT,
  code_verifier TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_hub_oauth_states_expiry
  ON file_hub_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS file_hub_cloud_connection_accounts (
  connection_id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  oauth_account_id TEXT NOT NULL,
  provider_drive_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(connection_id) REFERENCES file_hub_connections(id),
  FOREIGN KEY(oauth_account_id) REFERENCES file_hub_oauth_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_file_hub_cloud_connection_tenant
  ON file_hub_cloud_connection_accounts(main_company_slug, oauth_account_id);
