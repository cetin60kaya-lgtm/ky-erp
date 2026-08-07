-- KY ERP tenant-aware authentication baseline.
-- Operational module data is intentionally untouched by this migration.

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_user_module_permissions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_update INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_approve INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
);

ALTER TABLE main_companies ADD COLUMN code TEXT;
ALTER TABLE main_companies ADD COLUMN legal_name TEXT;
ALTER TABLE main_companies ADD COLUMN tax_number TEXT;
ALTER TABLE main_companies ADD COLUMN tax_office TEXT;
ALTER TABLE main_companies ADD COLUMN email TEXT;
ALTER TABLE main_companies ADD COLUMN phone TEXT;
ALTER TABLE main_companies ADD COLUMN address TEXT;
ALTER TABLE main_companies ADD COLUMN logo TEXT;

ALTER TABLE auth_users ADD COLUMN email TEXT;
ALTER TABLE auth_users ADD COLUMN backup_email TEXT;
ALTER TABLE auth_users ADD COLUMN platform_role TEXT NOT NULL DEFAULT 'USER';

UPDATE auth_users
SET platform_role = 'SUPER_ADMIN'
WHERE role = 'ADMIN';

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_username_ci
  ON auth_users(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS idx_main_companies_slug_ci
  ON main_companies(lower(slug));

CREATE TABLE IF NOT EXISTS user_company_memberships (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  main_company_id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  company_role TEXT NOT NULL DEFAULT 'VIEWER',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
  FOREIGN KEY (main_company_id) REFERENCES main_companies(id) ON DELETE RESTRICT
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
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (membership_id) REFERENCES user_company_memberships(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_permission_membership_module
  ON user_company_permissions(membership_id, module_key);
CREATE INDEX IF NOT EXISTS idx_company_permission_membership
  ON user_company_permissions(membership_id);

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
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id) REFERENCES user_company_memberships(id) ON DELETE SET NULL,
  FOREIGN KEY (active_company_id) REFERENCES main_companies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
  ON auth_sessions(user_id, revoked_at, expires_at);

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
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
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
  created_at INTEGER NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES auth_users(id) ON DELETE SET NULL,
  FOREIGN KEY (main_company_id) REFERENCES main_companies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_activity_created
  ON auth_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_activity_company
  ON auth_activity_logs(main_company_id, created_at DESC);

-- Preserve pre-existing non-admin permissions by attaching them to the only
-- canonical tenant. The current live database has no such users, so this is a
-- no-op there and remains safe for older local installations.
INSERT OR IGNORE INTO user_company_memberships (
  id, user_id, main_company_id, main_company_slug, company_role,
  is_active, is_default, created_at, updated_at
)
SELECT
  'membership-' || u.id || '-mecit-hakan', u.id, c.id, c.slug, 'COMPANY_ADMIN',
  1, 1, unixepoch() * 1000, unixepoch() * 1000
FROM auth_users u
JOIN main_companies c ON lower(c.slug) = 'mecit-hakan'
WHERE COALESCE(u.platform_role, 'USER') <> 'SUPER_ADMIN';

INSERT OR IGNORE INTO user_company_permissions (
  id, membership_id, module_key, can_view, can_create, can_update,
  can_delete, can_approve, created_at, updated_at
)
SELECT
  'tenant-permission-' || p.id,
  'membership-' || p.user_id || '-mecit-hakan',
  p.module_key, p.can_view, p.can_create, p.can_update, p.can_delete,
  p.can_approve, unixepoch() * 1000, unixepoch() * 1000
FROM auth_user_module_permissions p
JOIN auth_users u ON u.id = p.user_id
WHERE COALESCE(u.platform_role, 'USER') <> 'SUPER_ADMIN';
