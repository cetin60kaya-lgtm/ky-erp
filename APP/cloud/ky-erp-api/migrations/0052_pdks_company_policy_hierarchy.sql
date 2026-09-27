-- 0052 PDKS company/group policy hierarchy
-- No business-hour value is application-global. Company card owns the base policy;
-- personnel groups may override it and shifts only describe actual clock windows.

CREATE TABLE IF NOT EXISTS ik_pdks_company_policy (
  main_company_id TEXT PRIMARY KEY,
  profile_name TEXT NOT NULL DEFAULT '',
  configured INTEGER NOT NULL DEFAULT 0,
  normal_credit_mode TEXT NOT NULL DEFAULT 'UNCONFIGURED',
  payroll_monthly_minutes INTEGER,
  fixed_daily_minutes INTEGER,
  contract_weekly_minutes INTEGER,
  overtime_enabled INTEGER NOT NULL DEFAULT 0,
  night_shift_enabled INTEGER NOT NULL DEFAULT 0,
  default_attendance_mode TEXT NOT NULL DEFAULT 'STRICT_CARD',
  require_punch_default INTEGER NOT NULL DEFAULT 1,
  show_daily_punch_detail INTEGER NOT NULL DEFAULT 1,
  late_early_effect TEXT NOT NULL DEFAULT 'TRACK_ONLY',
  missing_punch_policy TEXT NOT NULL DEFAULT 'REQUIRE_MANUAL',
  effective_from TEXT,
  policy_version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ik_pdks_personnel_groups (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  personnel_class TEXT NOT NULL DEFAULT 'CUSTOM',
  default_shift_id TEXT,
  attendance_mode TEXT NOT NULL DEFAULT 'INHERIT',
  require_punch INTEGER,
  show_daily_punch_detail INTEGER,
  late_early_effect TEXT NOT NULL DEFAULT 'INHERIT',
  missing_punch_policy TEXT NOT NULL DEFAULT 'INHERIT',
  overtime_mode TEXT NOT NULL DEFAULT 'INHERIT',
  night_shift_mode TEXT NOT NULL DEFAULT 'INHERIT',
  normal_credit_mode TEXT NOT NULL DEFAULT 'INHERIT',
  payroll_monthly_minutes INTEGER,
  fixed_daily_minutes INTEGER,
  contract_weekly_minutes INTEGER,
  work_days_json TEXT,
  weekly_rest_days_json TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_pdks_personnel_groups_company ON ik_pdks_personnel_groups(main_company_id,active,name);

CREATE TABLE IF NOT EXISTS ik_pdks_employee_personnel_groups (
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  personnel_group_id TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(main_company_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_pdks_employee_personnel_group ON ik_pdks_employee_personnel_groups(main_company_id,personnel_group_id,employee_id);

CREATE TABLE IF NOT EXISTS ik_pdks_employee_policy_overrides (
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  default_shift_id TEXT,
  attendance_mode TEXT,
  require_punch INTEGER,
  show_daily_punch_detail INTEGER,
  late_early_effect TEXT,
  missing_punch_policy TEXT,
  overtime_mode TEXT,
  night_shift_mode TEXT,
  normal_credit_mode TEXT,
  payroll_monthly_minutes INTEGER,
  fixed_daily_minutes INTEGER,
  contract_weekly_minutes INTEGER,
  work_days_json TEXT,
  weekly_rest_days_json TEXT,
  reason TEXT NOT NULL DEFAULT '',
  effective_from TEXT,
  effective_to TEXT,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(main_company_id, employee_id)
);
