-- KY ERP Cloud Test Machine / synthetic-only fixture.
-- This is a disposable GitHub-hosted Wrangler D1 database, NEVER production.
-- No actual company account, real invoice, token, or Google Drive credential.
CREATE TABLE IF NOT EXISTS file_hub_oauth_accounts (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  provider_account_id TEXT,
  account_email TEXT,
  display_name TEXT,
  token_expires_at TEXT,
  scopes TEXT,
  metadata TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS file_hub_connections (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sync_mode TEXT NOT NULL,
  remote_root_id TEXT,
  remote_root_name TEXT,
  connection_status TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  metadata TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS file_hub_bindings (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  storage_connection_id TEXT NOT NULL,
  module_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  root_path TEXT,
  read_enabled INTEGER NOT NULL DEFAULT 1,
  sync_enabled INTEGER NOT NULL DEFAULT 1
);
INSERT INTO file_hub_oauth_accounts
  (id, main_company_slug,provider_type,provider_account_id,account_email,display_name,created_at,updated_at)
VALUES ('mock-google-account','mecit-hakan','GOOGLE_DRIVE','mock-drive-id',
  'synthetic@example.test','Sahte Drive Hesabı','2026-11-23T00:00:00Z','2026-11-23T00:00:00Z');
INSERT INTO file_hub_connections
  (id,main_company_slug,provider_type,name,is_active,is_primary,sync_mode,
    remote_root_id,remote_root_name,connection_status,last_sync_at,last_error,metadata,updated_at)
VALUES ('mock-google-root','mecit-hakan','GOOGLE_DRIVE','Sahte Test Kökü',1,1,'CLOUD_API',
  'mock-root','Sahte Test Kökü','CONNECTED','2026-11-23T01:00:00Z',NULL,'{}','2026-11-23T01:00:00Z');
INSERT INTO file_hub_bindings
  (id,main_company_slug,storage_connection_id,module_code,purpose_code,root_path,read_enabled,sync_enabled)
VALUES ('mock-eb-document-binding','mecit-hakan','mock-google-root','E_BELGE','E_DOCUMENT','KY-ISNET-BELGELER',1,1);
