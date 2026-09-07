-- KY ERP phone/push approval core
-- Additive only. No existing authentication data is reset or deleted.

CREATE TABLE IF NOT EXISTS auth_push_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  push_endpoint TEXT NOT NULL,
  p256dh_key TEXT,
  auth_key TEXT,
  device_token_hash TEXT NOT NULL,
  device_label TEXT,
  user_agent TEXT,
  self_login_enabled INTEGER NOT NULL DEFAULT 1,
  manager_approval_enabled INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT,
  last_push_at TEXT,
  last_error TEXT,
  UNIQUE(push_endpoint)
);

CREATE INDEX IF NOT EXISTS idx_auth_push_devices_user_active
  ON auth_push_devices(user_id, is_active, self_login_enabled);

CREATE INDEX IF NOT EXISTS idx_auth_push_devices_company_active
  ON auth_push_devices(main_company_slug, is_active, manager_approval_enabled);

CREATE TABLE IF NOT EXISTS auth_phone_login_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  challenge_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by_device_id TEXT,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_phone_login_user_pending
  ON auth_phone_login_challenges(user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_phone_login_active
  ON auth_phone_login_challenges(status, expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS auth_company_login_approval_settings (
  main_company_slug TEXT PRIMARY KEY,
  notify_company_owner INTEGER NOT NULL DEFAULT 1,
  notify_application_owner INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_company_login_approval_owner_notify
  ON auth_company_login_approval_settings(notify_application_owner, main_company_slug);
