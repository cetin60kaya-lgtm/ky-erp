-- KY ERP İK ilişkisel çekirdek şeması.
-- 0009 izin migrationı hr_monthly_employees tablosundan güvenli varsayılan üretir;
-- bu nedenle temiz D1 kurulumunda temel personel kartı ve kart ayarı önce hazır olmalıdır.
-- CREATE TABLE IF NOT EXISTS canlıdaki mevcut İK verilerine dokunmaz.

CREATE TABLE IF NOT EXISTS hr_monthly_employees (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  code TEXT,
  full_name TEXT NOT NULL,
  department TEXT,
  title TEXT,
  work_type TEXT DEFAULT 'Aylık',
  sgk_status TEXT DEFAULT 'VAR',
  status TEXT DEFAULT 'Aktif',
  hire_date TEXT,
  salary REAL DEFAULT 0,
  road_allowance REAL DEFAULT 0,
  bank_payment_type TEXT,
  bank_amount REAL DEFAULT 0,
  cash_amount REAL DEFAULT 0,
  overtime_hourly_base REAL DEFAULT 225,
  annual_leave_entitlement REAL DEFAULT 14,
  annual_leave_carryover REAL DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_monthly_employees_company
  ON hr_monthly_employees (main_company_id, status, code);
CREATE INDEX IF NOT EXISTS idx_hr_monthly_employees_name
  ON hr_monthly_employees (main_company_id, full_name);

CREATE TABLE IF NOT EXISTS ik_person_card_settings (
  employee_id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  card_no TEXT,
  identity_no TEXT,
  payroll_included INTEGER DEFAULT 1,
  card_source TEXT,
  personel_kodu TEXT,
  exit_date TEXT,
  active_passive TEXT DEFAULT 'Aktif',
  work_type TEXT,
  sgk_follow TEXT,
  payment_type TEXT,
  note TEXT,
  phone TEXT,
  extra_payment_label TEXT,
  extra_payment_amount REAL DEFAULT 0,
  base_employee_id TEXT,
  legal_deduction_type TEXT DEFAULT 'YOK',
  garnishment_active INTEGER DEFAULT 0,
  garnishment_amount REAL DEFAULT 0,
  garnishment_source TEXT DEFAULT 'BANKA',
  legal_start_period TEXT,
  legal_end_period TEXT,
  garnishment_note TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ik_person_card_company_card
  ON ik_person_card_settings (main_company_id, card_no)
  WHERE card_no IS NOT NULL AND TRIM(card_no) <> '';
CREATE INDEX IF NOT EXISTS idx_ik_person_card_company
  ON ik_person_card_settings (main_company_id, employee_id);
