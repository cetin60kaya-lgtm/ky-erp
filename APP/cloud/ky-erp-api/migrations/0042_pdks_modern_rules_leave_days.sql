-- KY ERP modern PDKS / IK ortak kural altyapisi.
-- Tek veri kaynagi: personel/izin IK, ham kart/puantaj PDKS.

CREATE TABLE IF NOT EXISTS ik_pdks_rule_profiles (
  main_company_id TEXT PRIMARY KEY,
  work_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
  weekly_rest_days_json TEXT NOT NULL DEFAULT '[0]',
  annual_leave_counted_weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
  break_minutes INTEGER NOT NULL DEFAULT 60,
  overtime_min_minutes INTEGER NOT NULL DEFAULT 15,
  overtime_round_minutes INTEGER NOT NULL DEFAULT 15,
  duplicate_punch_window_seconds INTEGER NOT NULL DEFAULT 60,
  half_day_minutes INTEGER NOT NULL DEFAULT 240,
  max_daily_minutes INTEGER NOT NULL DEFAULT 660,
  max_weekly_minutes INTEGER NOT NULL DEFAULT 2700,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ik_pdks_leave_types (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER',
  unit TEXT NOT NULL DEFAULT 'DAY',
  paid INTEGER NOT NULL DEFAULT 1,
  annual_balance_effect INTEGER NOT NULL DEFAULT 0,
  default_days REAL,
  requires_document INTEGER NOT NULL DEFAULT 0,
  legal_note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_pdks_leave_types_company_active
  ON ik_pdks_leave_types(main_company_id, active, name);

CREATE TABLE IF NOT EXISTS ik_leave_plan_days (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  leave_plan_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  leave_type_code TEXT NOT NULL DEFAULT '',
  leave_fraction REAL NOT NULL DEFAULT 1,
  counted_fraction REAL NOT NULL DEFAULT 1,
  day_part TEXT NOT NULL DEFAULT 'FULL',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, leave_plan_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_leave_plan_days_employee_date
  ON ik_leave_plan_days(main_company_id, employee_id, work_date);

CREATE TABLE IF NOT EXISTS ik_pdks_correction_logs (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  old_json TEXT NOT NULL DEFAULT '{}',
  new_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pdks_correction_logs_employee_date
  ON ik_pdks_correction_logs(main_company_id, employee_id, work_date, created_at DESC);

CREATE TABLE IF NOT EXISTS ik_pdks_leave_entitlement_ledger (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  service_year INTEGER NOT NULL,
  entitlement_date TEXT NOT NULL,
  entitlement_days REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'AUTO_STATUTORY',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, employee_id, service_year)
);
CREATE INDEX IF NOT EXISTS idx_pdks_leave_entitlement_employee
  ON ik_pdks_leave_entitlement_ledger(main_company_id, employee_id, entitlement_date);
