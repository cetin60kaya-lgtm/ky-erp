-- KY ERP 0060: Firma -> IK personel -> yetkili cihaz -> vasif bazli oz servis.
-- Muhasebe/bordro izinleri bu tablolardan grant edilmez; uye rolu PERSONNEL'dir.
CREATE TABLE IF NOT EXISTS ky_employee_portal_accounts (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  auth_user_id TEXT NOT NULL UNIQUE,
  username_local TEXT NOT NULL,
  occupation TEXT NOT NULL DEFAULT 'PERSONEL',
  machine_id TEXT NOT NULL DEFAULT '',
  mobile_enabled INTEGER NOT NULL DEFAULT 1,
  workplace_enabled INTEGER NOT NULL DEFAULT 0,
  activated_at TEXT,
  approved_by_user_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (main_company_slug, employee_id),
  UNIQUE (main_company_slug, username_local)
);
CREATE INDEX IF NOT EXISTS idx_ky_employee_portal_company
  ON ky_employee_portal_accounts(main_company_slug,occupation,is_active);
CREATE TABLE IF NOT EXISTS ky_employee_portal_devices (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('MOBILE','WORKPLACE')),
  label TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DENIED','REVOKED')),
  approved_by_user_id TEXT,
  approved_at TEXT,
  revoked_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_user_id) REFERENCES auth_users(id)
);
CREATE INDEX IF NOT EXISTS idx_ky_employee_portal_devices_user
  ON ky_employee_portal_devices(main_company_slug,account_user_id,status);
CREATE TABLE IF NOT EXISTS ky_employee_portal_approvers (
  main_company_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  granted_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (main_company_slug,user_id)
);
-- Ayrica mevcut auth_security_audit tablosuna islem kaydi yazilir.

-- Imzali istegin ayni cihazdan tekrar yurutulmesini engeller.
CREATE TABLE IF NOT EXISTS ky_employee_portal_nonces (
  nonce TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ky_employee_portal_nonce_expiry ON ky_employee_portal_nonces(expires_at);
