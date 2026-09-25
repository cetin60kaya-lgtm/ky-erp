-- Additive only. Remote uygulama bu değişikliğin parçası değildir.
CREATE TABLE IF NOT EXISTS pdks_sync_events (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  workplace_id TEXT NOT NULL,
  device_id TEXT,
  employee_id TEXT,
  entity_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdks_sync_scope_cursor
  ON pdks_sync_events (tenant_id, company_id, workplace_id, received_at, id);

CREATE INDEX IF NOT EXISTS idx_pdks_sync_employee
  ON pdks_sync_events (tenant_id, company_id, workplace_id, employee_id, occurred_at);
