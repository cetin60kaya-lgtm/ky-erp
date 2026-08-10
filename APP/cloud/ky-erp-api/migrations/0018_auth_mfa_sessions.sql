-- KY ERP kimlik doğrulama güvenlik katmanı.
-- Mevcut auth_users ve parola kayıtlarını korur. Temiz D1 kurulumunda eksikse
-- yalnız temel kullanıcı/yetki tablolarını oluşturur; parola veya kullanıcı seed etmez.
-- MFA, firma kapsamı, admin onayı ve iptal edilebilir 8 saatlik oturumlar
-- ayrı güvenlik tablolarında tutulur.

PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VIEWER',
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_user_module_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_update INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_approve INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_auth_user_module_permissions_user
  ON auth_user_module_permissions (user_id);

CREATE TABLE IF NOT EXISTS auth_user_security (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  main_company_slug TEXT,
  role_override TEXT,
  mfa_secret TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0,
  approval_required INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_security_email
  ON auth_user_security (LOWER(email))
  WHERE email IS NOT NULL AND TRIM(email) <> '';
CREATE INDEX IF NOT EXISTS idx_auth_user_security_company
  ON auth_user_security (main_company_slug, role_override);

CREATE TABLE IF NOT EXISTS auth_system_secrets (
  secret_key TEXT PRIMARY KEY,
  secret_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_login_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  challenge_type TEXT NOT NULL,
  challenge_token_hash TEXT NOT NULL,
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_login_challenges_user
  ON auth_login_challenges (user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_login_approvals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  main_company_slug TEXT,
  approval_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_login_approvals_status
  ON auth_login_approvals (status, main_company_slug, requested_at);
CREATE INDEX IF NOT EXISTS idx_auth_login_approvals_user
  ON auth_login_approvals (user_id, status);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  main_company_slug TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  role_at_login TEXT,
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  approval_request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
  ON auth_sessions (user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_company
  ON auth_sessions (main_company_slug, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS auth_security_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  target_user_id TEXT,
  main_company_slug TEXT,
  action TEXT NOT NULL,
  session_id TEXT,
  ip_address TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_security_audit_created
  ON auth_security_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_security_audit_user
  ON auth_security_audit (target_user_id, created_at DESC);

PRAGMA defer_foreign_keys = false;
