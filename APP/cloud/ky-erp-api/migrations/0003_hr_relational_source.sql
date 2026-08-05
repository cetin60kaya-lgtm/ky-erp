-- İK kalıcı veri kaynağı: ilişkisel D1 tabloları.
-- Tekrar çalıştırılabilir; veri silmez ve diğer modül tablolarına dokunmaz.

CREATE TABLE IF NOT EXISTS hr_monthly_employees (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  code TEXT,
  full_name TEXT NOT NULL,
  department TEXT,
  title TEXT,
  work_type TEXT,
  sgk_status TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  hire_date TEXT,
  salary REAL NOT NULL DEFAULT 0,
  road_allowance REAL NOT NULL DEFAULT 0,
  bank_payment_type TEXT,
  bank_amount REAL NOT NULL DEFAULT 0,
  cash_amount REAL NOT NULL DEFAULT 0,
  overtime_hourly_base REAL NOT NULL DEFAULT 225,
  annual_leave_entitlement REAL NOT NULL DEFAULT 14,
  annual_leave_carryover REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_daily_employees (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  qualification TEXT,
  day_wage REAL NOT NULL DEFAULT 0,
  night_wage REAL NOT NULL DEFAULT 0,
  broker TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_daily_employee_meta (
  employee_id TEXT PRIMARY KEY,
  personnel_no TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_daily_attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  day_shift INTEGER NOT NULL DEFAULT 0,
  night_shift INTEGER NOT NULL DEFAULT 0,
  day_wage REAL NOT NULL DEFAULT 0,
  night_wage REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'WAITING',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_monthly_adjustments_v2 (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  adjustment_type TEXT NOT NULL,
  hour_or_day REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  payroll_effect TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_leave_records_v2 (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  day_count REAL NOT NULL DEFAULT 0,
  document_path TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_salary_contracts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  salary REAL NOT NULL DEFAULT 0,
  road_allowance REAL NOT NULL DEFAULT 0,
  bank_payment_type TEXT,
  bank_amount REAL NOT NULL DEFAULT 0,
  cash_amount REAL NOT NULL DEFAULT 0,
  contract_type TEXT,
  contract_start TEXT NOT NULL,
  contract_end TEXT,
  effective_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hr_monthly_audit_logs (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT '',
  employee_id TEXT,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ik_person_card_settings (
  employee_id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  card_no TEXT NOT NULL DEFAULT '',
  identity_no TEXT NOT NULL DEFAULT '',
  payroll_included INTEGER NOT NULL DEFAULT 1,
  card_source TEXT NOT NULL DEFAULT 'TNF',
  personel_kodu TEXT NOT NULL DEFAULT '',
  exit_date TEXT,
  active_passive TEXT NOT NULL DEFAULT 'AKTIF',
  work_type TEXT NOT NULL DEFAULT 'AYLIK',
  sgk_follow INTEGER NOT NULL DEFAULT 1,
  payment_type TEXT NOT NULL DEFAULT 'BANKA_ELDEN',
  note TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE hr_monthly_employees
SET main_company_id = 'mecit-hakan'
WHERE lower(replace(trim(main_company_id), '_', '-')) IN ('mecit-hakan', 'main-mecit-hakan');

UPDATE hr_daily_employees
SET main_company_id = 'mecit-hakan'
WHERE lower(replace(trim(main_company_id), '_', '-')) IN ('mecit-hakan', 'main-mecit-hakan');

UPDATE hr_payrolls_v2
SET main_company_id = 'mecit-hakan'
WHERE lower(replace(trim(main_company_id), '_', '-')) IN ('mecit-hakan', 'main-mecit-hakan');

UPDATE ik_person_card_settings
SET main_company_id = 'mecit-hakan'
WHERE lower(replace(trim(main_company_id), '_', '-')) IN ('mecit-hakan', 'main-mecit-hakan');

CREATE INDEX IF NOT EXISTS idx_hr_monthly_employees_company_status
  ON hr_monthly_employees(main_company_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_monthly_employees_company_code
  ON hr_monthly_employees(main_company_id, code)
  WHERE code IS NOT NULL AND trim(code) <> '';
CREATE INDEX IF NOT EXISTS idx_hr_daily_employees_company_status
  ON hr_daily_employees(main_company_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_daily_attendance_employee_date
  ON hr_daily_attendance(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_hr_daily_attendance_date
  ON hr_daily_attendance(work_date, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_adjustments_employee_date
  ON hr_monthly_adjustments_v2(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_employee_dates
  ON hr_leave_records_v2(employee_id, start_date, end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_payrolls_company_period_employee
  ON hr_payrolls_v2(main_company_id, year, month, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_contracts_employee_effective
  ON hr_salary_contracts(employee_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_hr_documents_employee_date
  ON hr_employee_documents(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_hr_audit_company_created
  ON hr_monthly_audit_logs(main_company_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ik_person_card_company_card
  ON ik_person_card_settings(main_company_id, card_no)
  WHERE trim(card_no) <> '';
