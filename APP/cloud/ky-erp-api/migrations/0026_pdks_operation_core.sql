-- KY ERP PDKS canonical D1 operation core.
-- Safe/idempotent: only creates missing tables/indexes; existing production rows are not modified.

CREATE TABLE IF NOT EXISTS hr_monthly_adjustments_v2 (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  adjustment_type TEXT NOT NULL,
  hour_or_day REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  payroll_effect TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hr_monthly_adjustments_employee_date
  ON hr_monthly_adjustments_v2(employee_id,date);

CREATE TABLE IF NOT EXISTS hr_payrolls_v2 (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  employee_id TEXT NOT NULL,
  salary REAL NOT NULL DEFAULT 0,
  road_allowance REAL NOT NULL DEFAULT 0,
  overtime_amount REAL NOT NULL DEFAULT 0,
  premium_amount REAL NOT NULL DEFAULT 0,
  deduction_amount REAL NOT NULL DEFAULT 0,
  advance_amount REAL NOT NULL DEFAULT 0,
  bank_amount REAL NOT NULL DEFAULT 0,
  cash_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id,year,month,employee_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payrolls_v2_company_period
  ON hr_payrolls_v2(main_company_id,year,month,employee_id);

CREATE TABLE IF NOT EXISTS ik_monthly_close (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  is_locked INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id,period_year,period_month)
);
CREATE INDEX IF NOT EXISTS idx_ik_monthly_close_company_period
  ON ik_monthly_close(main_company_id,period_year,period_month,is_locked);

CREATE TABLE IF NOT EXISTS ik_monthly_close_logs (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  old_json TEXT NOT NULL DEFAULT '{}',
  new_json TEXT NOT NULL DEFAULT '{}',
  user_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ik_monthly_close_logs_company_period
  ON ik_monthly_close_logs(main_company_id,period_year,period_month,created_at DESC);

CREATE TABLE IF NOT EXISTS ik_audit_logs (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  source_screen TEXT NOT NULL DEFAULT '',
  old_json TEXT NOT NULL DEFAULT '{}',
  new_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ik_audit_logs_company_period
  ON ik_audit_logs(main_company_id,period,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ik_audit_logs_employee
  ON ik_audit_logs(main_company_id,employee_id,period,created_at DESC);
