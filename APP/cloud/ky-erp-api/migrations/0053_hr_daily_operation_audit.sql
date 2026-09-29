-- KY ERP Günlük Operasyon değişmez işlem geçmişi.
-- Canlı attendance tablosu güncel durumu taşır; bu ledger her değişikliğin önce/sonra halini saklar.

CREATE TABLE IF NOT EXISTS hr_daily_operation_audit (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT,
  attendance_id TEXT,
  work_date TEXT,
  shift TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  note TEXT,
  actor_user_id TEXT,
  actor_label TEXT,
  source TEXT NOT NULL DEFAULT 'KYERP_WEB',
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_daily_operation_audit_company_date
  ON hr_daily_operation_audit(main_company_id, work_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_daily_operation_audit_employee_date
  ON hr_daily_operation_audit(main_company_id, employee_id, work_date, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_hr_daily_operation_audit_no_update
BEFORE UPDATE ON hr_daily_operation_audit
BEGIN
  SELECT RAISE(ABORT, 'daily operation audit is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_hr_daily_operation_audit_no_delete
BEFORE DELETE ON hr_daily_operation_audit
BEGIN
  SELECT RAISE(ABORT, 'daily operation audit is append-only');
END;
