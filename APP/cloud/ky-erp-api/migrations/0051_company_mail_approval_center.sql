-- KY ERP Company Mail Scope + Critical Approval Center (0051)
-- Additive only. Requires 0050 Mail Core to be applied first.
PRAGMA foreign_keys = ON;

ALTER TABLE mail_accounts ADD COLUMN account_scope TEXT NOT NULL DEFAULT 'COMPANY';
ALTER TABLE mail_accounts ADD COLUMN owner_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_mail_accounts_company_scope
  ON mail_accounts(main_company_slug, account_scope, department_code, status);

CREATE TABLE IF NOT EXISTS critical_approval_requests (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT,
  source_module TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  risk_level TEXT NOT NULL DEFAULT 'HIGH',
  approval_policy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  company_owner_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  company_owner_decided_by TEXT,
  company_owner_decided_at TEXT,
  app_owner_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  app_owner_decided_by TEXT,
  app_owner_decided_at TEXT,
  requested_by TEXT NOT NULL,
  request_payload TEXT,
  fingerprint TEXT NOT NULL,
  expires_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  consumed_at TEXT,
  consumed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_critical_approvals_pending
  ON critical_approval_requests(main_company_slug, status, risk_level, created_at);

CREATE INDEX IF NOT EXISTS idx_critical_approvals_actor
  ON critical_approval_requests(requested_by, status, created_at);

CREATE INDEX IF NOT EXISTS idx_critical_approvals_fingerprint
  ON critical_approval_requests(fingerprint, status, consumed_at);

CREATE TABLE IF NOT EXISTS critical_approval_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  main_company_slug TEXT,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  note TEXT,
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(request_id) REFERENCES critical_approval_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_critical_approval_events_request
  ON critical_approval_events(request_id, created_at);
