-- KY ERP PDKS single-data master schema.
-- İş verisinin yetkili kaynağı D1'dir. Windows SQLite yalnız ham kart/cache/queue/log tutar.

CREATE TABLE IF NOT EXISTS ik_pdks_work_groups (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  entry_time TEXT NOT NULL DEFAULT '08:30',
  exit_time TEXT NOT NULL DEFAULT '19:00',
  late_tolerance INTEGER NOT NULL DEFAULT 5,
  early_tolerance INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pdks_work_groups_company_active
  ON ik_pdks_work_groups(main_company_id, active, name);

CREATE TABLE IF NOT EXISTS ik_pdks_employee_groups (
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(main_company_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_pdks_employee_groups_group
  ON ik_pdks_employee_groups(main_company_id, group_id, employee_id);

CREATE TABLE IF NOT EXISTS ik_pdks_services (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  route_note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pdks_services_company_active
  ON ik_pdks_services(main_company_id, active, name);

CREATE TABLE IF NOT EXISTS ik_pdks_employee_services (
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(main_company_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_pdks_employee_services_service
  ON ik_pdks_employee_services(main_company_id, service_id, employee_id);
