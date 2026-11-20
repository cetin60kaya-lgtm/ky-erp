-- KY ERP / firma bazli bir amaca birden fazla depolama klasoru baglama.
-- Mevcut file_hub_bindings ana hedeflerini tasimaz veya degistirmez.
-- Production icin oncesinde D1 yedegi + migration readiness / schema kontrolu gerekir.
CREATE TABLE IF NOT EXISTS file_hub_binding_targets (
  id TEXT PRIMARY KEY NOT NULL,
  main_company_slug TEXT NOT NULL,
  module_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  storage_connection_id TEXT NOT NULL,
  root_path TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  read_enabled INTEGER NOT NULL DEFAULT 1 CHECK(read_enabled IN (0,1)),
  write_enabled INTEGER NOT NULL DEFAULT 0 CHECK(write_enabled IN (0,1)),
  sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK(sync_enabled IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_file_hub_binding_targets_scope
  ON file_hub_binding_targets(main_company_slug,module_code,purpose_code,storage_connection_id,root_path);
CREATE INDEX IF NOT EXISTS ix_file_hub_binding_targets_connection
  ON file_hub_binding_targets(main_company_slug,storage_connection_id,is_active,sync_enabled);
CREATE INDEX IF NOT EXISTS ix_file_hub_binding_targets_resolver
  ON file_hub_binding_targets(main_company_slug,module_code,purpose_code,is_active,priority);
