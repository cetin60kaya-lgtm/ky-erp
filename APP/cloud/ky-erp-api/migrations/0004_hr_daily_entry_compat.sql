-- Günlük Giriş ekranının tarih aralığı listesi ve vardiya notları.
-- Yalnız İK tabloları oluşturulur; mevcut devam kayıtları değiştirilmez.

CREATE TABLE IF NOT EXISTS hr_daily_range_roster (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, start_date, end_date, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_daily_range_roster_lookup
  ON hr_daily_range_roster(main_company_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS hr_daily_attendance_notes (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  shift TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, employee_id, work_date, shift)
);

CREATE INDEX IF NOT EXISTS idx_hr_daily_attendance_notes_lookup
  ON hr_daily_attendance_notes(main_company_id, work_date, shift);
