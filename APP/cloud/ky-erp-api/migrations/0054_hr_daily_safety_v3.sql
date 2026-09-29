-- KY ERP Günlük Operasyon V3 veri güvenliği.
-- Canlı tablo güncel projeksiyondur; revision tablosu değişmez tarihsel gerçeği saklar.

CREATE TABLE IF NOT EXISTS hr_daily_attendance_revision (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  attendance_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  revision INTEGER NOT NULL,
  day_shift INTEGER NOT NULL DEFAULT 0,
  night_shift INTEGER NOT NULL DEFAULT 0,
  day_wage_cents INTEGER NOT NULL DEFAULT 0,
  night_wage_cents INTEGER NOT NULL DEFAULT 0,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'WAITING',
  change_type TEXT NOT NULL,
  reason TEXT,
  actor_user_id TEXT,
  actor_label TEXT,
  source TEXT NOT NULL DEFAULT 'KYERP_WEB',
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attendance_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_daily_revision_attendance
  ON hr_daily_attendance_revision(main_company_id, attendance_id, revision DESC);
CREATE INDEX IF NOT EXISTS idx_daily_revision_employee_date
  ON hr_daily_attendance_revision(main_company_id, employee_id, work_date, revision DESC);

CREATE TRIGGER IF NOT EXISTS trg_daily_revision_no_update
BEFORE UPDATE ON hr_daily_attendance_revision
BEGIN
  SELECT RAISE(ABORT, 'daily attendance revision is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_daily_revision_no_delete
BEFORE DELETE ON hr_daily_attendance_revision
BEGIN
  SELECT RAISE(ABORT, 'daily attendance revision is append-only');
END;

CREATE TABLE IF NOT EXISTS hr_daily_period_lock (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOCKED',
  reason TEXT,
  locked_by_user_id TEXT,
  locked_by_label TEXT,
  locked_at TEXT,
  unlocked_by_user_id TEXT,
  unlocked_by_label TEXT,
  unlocked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_period_lock_range
  ON hr_daily_period_lock(main_company_id, status, start_date, end_date);
