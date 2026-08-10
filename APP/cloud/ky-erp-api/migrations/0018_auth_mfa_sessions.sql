-- KY ERP kimlik doğrulama güvenlik katmanı.
-- Canlıdaki eski tenant/oturum yapısını veri kaybetmeden arşivler ve
-- 8 saatlik imzalı oturum + MFA + yönetici onayı yapısına geçirir.
-- Mevcut kullanıcılar ve parola hashleri korunur.

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

-- Canlı D1'de bulunan tenant üyelik/izin tabloları temiz kurulumda da tanımlıdır.
CREATE TABLE IF NOT EXISTS user_company_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  main_company_id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  company_role TEXT NOT NULL DEFAULT 'VIEWER',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_company_memberships_user
  ON user_company_memberships (user_id, is_active, is_default);

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
CREATE INDEX IF NOT EXISTS idx_user_company_permissions_membership
  ON user_company_permissions (membership_id, module_key);

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

-- Canlıdaki mevcut kullanıcı e-postası, SUPER_ADMIN ve firma üyeliği yeni
-- güvenlik profiline taşınır; parola alanına hiçbir şekilde dokunulmaz.
INSERT OR IGNORE INTO auth_user_security
  (user_id,email,main_company_slug,role_override,mfa_secret,mfa_enabled,email_verified,approval_required,created_at,updated_at)
SELECT
  u.id,
  NULLIF(TRIM(COALESCE(u.email,'')), ''),
  COALESCE(
    (SELECT m.main_company_slug
       FROM user_company_memberships m
      WHERE m.user_id=u.id AND m.is_active=1
      ORDER BY m.is_default DESC, m.updated_at DESC
      LIMIT 1),
    'mecit-hakan'
  ),
  CASE
    WHEN UPPER(COALESCE(u.platform_role,''))='SUPER_ADMIN' OR UPPER(COALESCE(u.role,''))='ADMIN'
      THEN 'SUPER_ADMIN'
    WHEN EXISTS (
      SELECT 1 FROM user_company_memberships m
       WHERE m.user_id=u.id AND m.is_active=1 AND UPPER(COALESCE(m.company_role,''))='COMPANY_ADMIN'
    )
      THEN 'COMPANY_ADMIN'
    ELSE NULL
  END,
  NULL,
  0,
  0,
  CASE
    WHEN UPPER(COALESCE(u.platform_role,''))='SUPER_ADMIN' OR UPPER(COALESCE(u.role,''))='ADMIN'
      OR EXISTS (
        SELECT 1 FROM user_company_memberships m
         WHERE m.user_id=u.id AND m.is_active=1 AND UPPER(COALESCE(m.company_role,''))='COMPANY_ADMIN'
      )
      THEN 0
    ELSE 1
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM auth_users u;

UPDATE auth_user_security
SET
  email = COALESCE(
    NULLIF(TRIM(COALESCE(email,'')), ''),
    (SELECT NULLIF(TRIM(COALESCE(u.email,'')), '') FROM auth_users u WHERE u.id=auth_user_security.user_id)
  ),
  main_company_slug = COALESCE(
    NULLIF(TRIM(COALESCE(main_company_slug,'')), ''),
    (SELECT m.main_company_slug
       FROM user_company_memberships m
      WHERE m.user_id=auth_user_security.user_id AND m.is_active=1
      ORDER BY m.is_default DESC, m.updated_at DESC
      LIMIT 1),
    'mecit-hakan'
  ),
  role_override = CASE
    WHEN role_override IS NOT NULL AND TRIM(role_override)<>'' THEN role_override
    WHEN EXISTS (
      SELECT 1 FROM auth_users u
       WHERE u.id=auth_user_security.user_id
         AND (UPPER(COALESCE(u.platform_role,''))='SUPER_ADMIN' OR UPPER(COALESCE(u.role,''))='ADMIN')
    ) THEN 'SUPER_ADMIN'
    WHEN EXISTS (
      SELECT 1 FROM user_company_memberships m
       WHERE m.user_id=auth_user_security.user_id AND m.is_active=1
         AND UPPER(COALESCE(m.company_role,''))='COMPANY_ADMIN'
    ) THEN 'COMPANY_ADMIN'
    ELSE role_override
  END,
  approval_required = CASE
    WHEN EXISTS (
      SELECT 1 FROM auth_users u
       WHERE u.id=auth_user_security.user_id
         AND (UPPER(COALESCE(u.platform_role,''))='SUPER_ADMIN' OR UPPER(COALESCE(u.role,''))='ADMIN')
    ) OR EXISTS (
      SELECT 1 FROM user_company_memberships m
       WHERE m.user_id=auth_user_security.user_id AND m.is_active=1
         AND UPPER(COALESCE(m.company_role,''))='COMPANY_ADMIN'
    ) THEN 0
    ELSE approval_required
  END,
  updated_at=CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_security_email
  ON auth_user_security (LOWER(email))
  WHERE email IS NOT NULL AND TRIM(email) <> '';
CREATE INDEX IF NOT EXISTS idx_auth_user_security_company
  ON auth_user_security (main_company_slug, role_override);

-- Mevcut tenant izinleri yeni yönetim ekranının kullandığı kullanıcı izinlerine kopyalanır.
INSERT OR IGNORE INTO auth_user_module_permissions
  (id,user_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at)
SELECT
  'tenant-' || p.id,
  m.user_id,
  p.module_key,
  p.can_view,
  p.can_create,
  p.can_update,
  p.can_delete,
  p.can_approve,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM user_company_permissions p
JOIN user_company_memberships m ON m.id=p.membership_id
WHERE m.is_active=1;

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

-- Eski tenant oturum tablosu canlıda veri içeriyor. Önce aynı adla yoksa
-- boş legacy şema oluşturulur; ardından tablo olduğu gibi arşivlenir.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  membership_id TEXT,
  active_company_id TEXT,
  active_company_slug TEXT,
  issued_at INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  replaced_by_session_id TEXT,
  created_at INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE auth_sessions RENAME TO auth_sessions_legacy_v1;

-- Yeni imzalı oturumlar ayrı temiz şemada aynı aktif tablo adıyla tutulur.
CREATE TABLE auth_sessions (
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
