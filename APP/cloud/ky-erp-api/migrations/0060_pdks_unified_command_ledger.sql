-- KY PDKS Unified: durable idempotent command contract.
-- RUN ONLY through reviewed D1 migration; no GET/POST creates tables.
-- Ledger, immutable receipts and outbox are committed atomically via DB.batch.
-- Cloud administrative writes are NOT physical FDB / annual TNF acknowledgements.

CREATE TABLE IF NOT EXISTS ik_pdks_unified_commands (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  target_employee_id TEXT NOT NULL DEFAULT '',
  result_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state='COMMITTED'),
  created_at TEXT NOT NULL,
  UNIQUE(main_company_id,actor_user_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_pdks_unified_commands_company_date
 ON ik_pdks_unified_commands(main_company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdks_unified_commands_actor
 ON ik_pdks_unified_commands(main_company_id,actor_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ik_pdks_unified_outbox (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CLAIMED','ACKED','FAILED')),
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  delivery_owner TEXT,
  lease_until TEXT,
  next_attempt_at TEXT,
  delivery_hash TEXT,
  ack_payload_json TEXT,
  ack_sha256 TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  UNIQUE(main_company_id,command_id),
  FOREIGN KEY(command_id) REFERENCES ik_pdks_unified_commands(id)
);
CREATE INDEX IF NOT EXISTS idx_pdks_unified_outbox_state
 ON ik_pdks_unified_outbox(main_company_id,state,created_at);
CREATE INDEX IF NOT EXISTS idx_pdks_unified_outbox_delivery
 ON ik_pdks_unified_outbox(main_company_id,state,next_attempt_at,lease_until,created_at);

-- An audit-log entry is a REQUIRED member of every transactional batch,
-- not an after-the-fact best-effort try/catch.
CREATE INDEX IF NOT EXISTS idx_pdks_unified_audit_command
 ON ik_audit_logs(main_company_id,source_screen,created_at);
