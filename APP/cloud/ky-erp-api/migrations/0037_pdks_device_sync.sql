CREATE TABLE IF NOT EXISTS ik_pdks_devices (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  device_label TEXT NOT NULL,
  machine_name TEXT NOT NULL DEFAULT '',
  secret_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT,
  last_sync_at TEXT,
  last_sync_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(main_company_id, device_label)
);

CREATE INDEX IF NOT EXISTS idx_ik_pdks_devices_company_active
  ON ik_pdks_devices(main_company_id, active, updated_at);

CREATE TABLE IF NOT EXISTS ik_pdks_device_sync_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  main_company_id TEXT NOT NULL,
  received_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ik_pdks_device_sync_logs_device
  ON ik_pdks_device_sync_logs(device_id, created_at DESC);
