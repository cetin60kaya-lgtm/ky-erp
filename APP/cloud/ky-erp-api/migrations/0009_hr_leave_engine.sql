-- KY ERP IK annual leave engine: persistent policy + managed plans.
CREATE TABLE IF NOT EXISTS ik_leave_counting_policy (
  main_company_id TEXT PRIMARY KEY,
  counted_weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
  exclude_official_holidays INTEGER NOT NULL DEFAULT 1,
  max_concurrent_department INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ik_leave_plans (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  record_type TEXT NOT NULL DEFAULT 'Yıllık izin',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  counted_days REAL NOT NULL DEFAULT 0,
  excluded_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PLANNED',
  document_no TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ik_leave_plans_company_dates ON ik_leave_plans(main_company_id,start_date,end_date,status);
CREATE INDEX IF NOT EXISTS idx_ik_leave_plans_employee_dates ON ik_leave_plans(employee_id,start_date,end_date,status);

INSERT INTO ik_leave_counting_policy (main_company_id,counted_weekdays_json,exclude_official_holidays,max_concurrent_department,updated_by)
SELECT DISTINCT main_company_id,'[1,2,3,4,5,6]',1,1,'migration-0009' FROM hr_monthly_employees
ON CONFLICT(main_company_id) DO NOTHING;
