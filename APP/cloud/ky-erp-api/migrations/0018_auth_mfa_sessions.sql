-- KY ERP MFA + yönetici onayı + 8 saatlik iptal edilebilir oturum güvenliği.
-- CANLI UYUMLULUK KURALI:
-- Canlı D1'de auth_users, user_company_memberships, auth_sessions ve auth_mfa_methods
-- daha önce kurulmuş olabilir. Bu migration bu tabloları silmez/yeniden adlandırmaz;
-- yalnız eksik güvenlik profil tablolarını oluşturur ve mevcut auth_sessions tablosuna
-- imzalı token / cihaz / son aktivite alanlarını ekler.
-- Mevcut kullanıcı parolaları ve firma üyelikleri aynen korunur.

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email TEXT,
  backup_email TEXT,
  platform_role TEXT NOT NULL DEFAULT 'USER'
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

CREATE TABLE IF NOT EXISTS user_company_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  main_company_id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  company_role TEXT NOT NULL DEFAULT 'USER',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_user_company
  ON user_company_memberships(user_id, main_company_id);
CREATE INDEX IF NOT EXISTS idx_membership_company_active
  ON user_company_memberships(main_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_membership_user_active
  ON user_company_memberships(user_id, is_active);

CREATE TABLE IF NOT EXISTS user_company_permissions (
  id TEXT PRIMARY KEY NOT NULL,
  membership_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_update INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_approve INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_permission_membership_module
  ON user_company_permissions(membership_id, module_key);
CREATE INDEX IF NOT EXISTS idx_company_permission_membership
  ON user_company_permissions(membership_id);

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

-- Canlıdaki auth_sessions tablosunun mevcut kolonları korunur.
-- Temiz kurulumda önce mevcut canlı şemaya uyumlu çekirdek tablo oluşturulur.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  membership_id TEXT,
  active_company_id TEXT,
  active_company_slug TEXT,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by_session_id TEXT,
  created_at INTEGER NOT NULL
);

-- 0018 daha önce başarıyla uygulanmadığı için bu alanlar canlıda yoktur.
-- Var olan oturum satırları NULL kalır ve yeni imzalı tokenlarla kullanılamaz;
-- böylece eski imzasız oturumlar güvenli biçimde geçersizleşir.
ALTER TABLE auth_sessions ADD COLUMN token_hash TEXT;
ALTER TABLE auth_sessions ADD COLUMN role_at_login TEXT;
ALTER TABLE auth_sessions ADD COLUMN device_label TEXT;
ALTER TABLE auth_sessions ADD COLUMN user_agent TEXT;
ALTER TABLE auth_sessions ADD COLUMN ip_address TEXT;
ALTER TABLE auth_sessions ADD COLUMN approved_at INTEGER;
ALTER TABLE auth_sessions ADD COLUMN last_seen_at INTEGER;
ALTER TABLE auth_sessions ADD COLUMN revoked_by TEXT;
ALTER TABLE auth_sessions ADD COLUMN approval_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_sessions_signed_token
  ON auth_sessions(token_hash)
  WHERE token_hash IS NOT NULL AND TRIM(token_hash) <> '';
CREATE INDEX IF NOT EXISTS idx_auth_sessions_company_secure
  ON auth_sessions(active_company_slug, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS auth_mfa_methods (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  method_type TEXT NOT NULL,
  label TEXT,
  secret_ciphertext TEXT,
  destination_masked TEXT,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_mfa_user_type_label
  ON auth_mfa_methods(user_id, method_type, label);

CREATE TABLE IF NOT EXISTS auth_activity_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT,
  main_company_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_activity_created
  ON auth_activity_logs(created_at DESC);

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
