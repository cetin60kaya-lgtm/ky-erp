-- KY ERP İK Personel Kontrol Merkezi v2
-- Personel kartı değişiklik geçmişi, kart/puantaj olayları, günlük istisnalar,
-- denetim kullanıcı kapsamı ve kart uygulaması dışa aktarım kayıtları.

CREATE TABLE IF NOT EXISTS ik_user_hr_scope (
  user_id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL DEFAULT 'mecit-hakan',
  scope TEXT NOT NULL DEFAULT 'FULL', -- FULL | AUDIT
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ik_user_hr_scope_company
  ON ik_user_hr_scope(main_company_id, scope);

CREATE TABLE IF NOT EXISTS ik_employee_change_history (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  effective_date TEXT NOT NULL,
  note TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ik_employee_change_history_employee
  ON ik_employee_change_history(main_company_id, employee_id, effective_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS ik_time_clock_events (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  card_no TEXT NOT NULL,
  work_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'AUTO', -- IN | OUT | AUTO
  source TEXT NOT NULL DEFAULT 'KYERP',
  note TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ik_time_clock_event_unique
  ON ik_time_clock_events(main_company_id, card_no, work_date, event_time);
CREATE INDEX IF NOT EXISTS idx_ik_time_clock_event_employee_date
  ON ik_time_clock_events(main_company_id, employee_id, work_date, event_time);

CREATE TABLE IF NOT EXISTS ik_attendance_day_overrides (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AUTO',
  manual_in TEXT,
  manual_out TEXT,
  late_minutes INTEGER,
  early_minutes INTEGER,
  overtime_minutes INTEGER,
  missing_punch INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_ik_attendance_override_employee_date
  ON ik_attendance_day_overrides(main_company_id, employee_id, work_date);

CREATE TABLE IF NOT EXISTS ik_card_export_batches (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ik_card_export_hash
  ON ik_card_export_batches(main_company_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_ik_card_export_period
  ON ik_card_export_batches(main_company_id, period_start, period_end, created_at DESC);

CREATE TABLE IF NOT EXISTS ik_card_export_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  card_no TEXT NOT NULL,
  work_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  export_line TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ik_card_export_items_batch
  ON ik_card_export_items(batch_id, card_no, work_date, event_time);
