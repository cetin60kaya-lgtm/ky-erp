-- KY ERP: sirket ve dosya amaci bazinda birden fazla klasor hedefi.
-- Eski file_hub_bindings ve dosya/location/relation kayitlari aynen korunur.
CREATE TABLE IF NOT EXISTS file_hub_folder_routes (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  module_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  storage_connection_id TEXT NOT NULL,
  root_path TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  device_name TEXT NOT NULL DEFAULT '',
  read_enabled INTEGER NOT NULL DEFAULT 1,
  write_enabled INTEGER NOT NULL DEFAULT 0,
  sync_enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(storage_connection_id) REFERENCES file_hub_connections(id),
  UNIQUE(main_company_slug,module_code,purpose_code,storage_connection_id,root_path,device_name)
);
CREATE INDEX IF NOT EXISTS idx_file_hub_folder_routes_resolve
  ON file_hub_folder_routes(main_company_slug,module_code,purpose_code,is_active,priority);
CREATE INDEX IF NOT EXISTS idx_file_hub_folder_routes_source
  ON file_hub_folder_routes(main_company_slug,storage_connection_id,is_active);
