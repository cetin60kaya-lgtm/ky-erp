-- KY ERP File Hub v1 - firma bazli, provider bagimsiz ortak dosya cekirdegi
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS file_hub_connections (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  local_root_path TEXT,
  remote_root_id TEXT,
  remote_root_name TEXT,
  sync_mode TEXT NOT NULL DEFAULT 'AGENT',
  connection_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_sync_at TEXT,
  last_error TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_hub_connections_tenant ON file_hub_connections(main_company_slug, is_active);

CREATE TABLE IF NOT EXISTS file_hub_bindings (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  module_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  storage_connection_id TEXT NOT NULL,
  root_path TEXT NOT NULL DEFAULT '',
  read_enabled INTEGER NOT NULL DEFAULT 1,
  write_enabled INTEGER NOT NULL DEFAULT 1,
  sync_enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, module_code, purpose_code),
  FOREIGN KEY(storage_connection_id) REFERENCES file_hub_connections(id)
);
CREATE INDEX IF NOT EXISTS idx_file_hub_bindings_lookup ON file_hub_bindings(main_company_slug, module_code, purpose_code);

CREATE TABLE IF NOT EXISTS file_hub_assets (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  logical_key TEXT,
  file_name TEXT NOT NULL,
  extension TEXT,
  mime_type TEXT,
  sha256 TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  source_type TEXT,
  preview_status TEXT NOT NULL DEFAULT 'NONE',
  preview_storage_key TEXT,
  metadata TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_hub_assets_tenant_name ON file_hub_assets(main_company_slug, file_name);
CREATE INDEX IF NOT EXISTS idx_file_hub_assets_sha ON file_hub_assets(main_company_slug, sha256);
CREATE INDEX IF NOT EXISTS idx_file_hub_assets_status ON file_hub_assets(main_company_slug, status);

CREATE TABLE IF NOT EXISTS file_hub_locations (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  file_asset_id TEXT NOT NULL,
  storage_connection_id TEXT NOT NULL,
  provider_file_id TEXT,
  relative_path TEXT NOT NULL,
  location_role TEXT NOT NULL DEFAULT 'PRIMARY',
  is_available INTEGER NOT NULL DEFAULT 1,
  provider_modified_at TEXT,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, storage_connection_id, relative_path),
  FOREIGN KEY(file_asset_id) REFERENCES file_hub_assets(id),
  FOREIGN KEY(storage_connection_id) REFERENCES file_hub_connections(id)
);
CREATE INDEX IF NOT EXISTS idx_file_hub_locations_asset ON file_hub_locations(main_company_slug, file_asset_id);

CREATE TABLE IF NOT EXISTS file_hub_relations (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  file_asset_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'ATTACHMENT',
  is_primary INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, file_asset_id, entity_type, entity_id, relation_type),
  FOREIGN KEY(file_asset_id) REFERENCES file_hub_assets(id)
);
CREATE INDEX IF NOT EXISTS idx_file_hub_rel_entity ON file_hub_relations(main_company_slug, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS file_hub_revisions (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  file_asset_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  sha256 TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  provider_modified_at TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(main_company_slug, file_asset_id, revision_no),
  FOREIGN KEY(file_asset_id) REFERENCES file_hub_assets(id)
);

CREATE TABLE IF NOT EXISTS file_hub_events (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  storage_connection_id TEXT,
  file_asset_id TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'SYSTEM',
  actor_id TEXT,
  device_name TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_hub_events_tenant_date ON file_hub_events(main_company_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS file_hub_agent_status (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  device_name TEXT NOT NULL,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'ONLINE',
  watched_connections TEXT,
  last_seen_at TEXT NOT NULL,
  last_error TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, device_name)
);
