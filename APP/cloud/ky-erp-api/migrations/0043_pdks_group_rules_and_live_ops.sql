-- KY ERP PDKS v3: vardiya/grup bazli gelismis kurallar ve operasyon altyapisi.
-- 0042 company-level defaults remain the fallback. This migration only adds
-- scoped overrides and durable operational records; no existing business data is rewritten.

CREATE TABLE IF NOT EXISTS ik_pdks_group_rules (
  main_company_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  work_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
  weekly_rest_days_json TEXT NOT NULL DEFAULT '[0]',
  break_minutes INTEGER NOT NULL DEFAULT 60,
  overtime_min_minutes INTEGER NOT NULL DEFAULT 15,
  overtime_round_minutes INTEGER NOT NULL DEFAULT 15,
  duplicate_punch_window_seconds INTEGER NOT NULL DEFAULT 60,
  half_day_minutes INTEGER NOT NULL DEFAULT 240,
  max_daily_minutes INTEGER NOT NULL DEFAULT 660,
  max_weekly_minutes INTEGER NOT NULL DEFAULT 2700,
  cross_midnight INTEGER NOT NULL DEFAULT 0,
  flexible INTEGER NOT NULL DEFAULT 0,
  flexible_start TEXT NOT NULL DEFAULT '',
  flexible_end TEXT NOT NULL DEFAULT '',
  night_shift INTEGER NOT NULL DEFAULT 0,
  overtime_requires_approval INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(main_company_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_pdks_group_rules_company
  ON ik_pdks_group_rules(main_company_id, group_id);

CREATE TABLE IF NOT EXISTS ik_pdks_department_groups (
  main_company_id TEXT NOT NULL,
  department TEXT NOT NULL,
  group_id TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(main_company_id, department)
);

CREATE TABLE IF NOT EXISTS ik_pdks_card_aliases (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  card_no TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  active INTEGER NOT NULL DEFAULT 1,
  valid_from TEXT,
  valid_to TEXT,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, card_no)
);
CREATE INDEX IF NOT EXISTS idx_pdks_card_aliases_employee
  ON ik_pdks_card_aliases(main_company_id, employee_id, active);

CREATE TABLE IF NOT EXISTS ik_pdks_overtime_requests (
  id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  requested_minutes INTEGER NOT NULL DEFAULT 0,
  approved_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT NOT NULL DEFAULT '',
  requested_by TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(main_company_id, employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_pdks_overtime_company_date
  ON ik_pdks_overtime_requests(main_company_id, work_date, status);
