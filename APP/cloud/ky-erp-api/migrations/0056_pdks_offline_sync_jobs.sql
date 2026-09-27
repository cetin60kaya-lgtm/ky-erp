CREATE TABLE IF NOT EXISTS ik_pdks_device_jobs (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  command TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING',
  result_json TEXT,
  requested_by_user_id TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ik_pdks_device_jobs_device_status
  ON ik_pdks_device_jobs(device_id, status, requested_at);

CREATE INDEX IF NOT EXISTS idx_ik_pdks_device_jobs_company_updated
  ON ik_pdks_device_jobs(main_company_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ik_pdks_sync_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  main_company_id TEXT NOT NULL,
  device_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  operation TEXT NOT NULL,
  source TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ik_pdks_sync_events_company_cursor
  ON ik_pdks_sync_events(main_company_id, received_at, id);
