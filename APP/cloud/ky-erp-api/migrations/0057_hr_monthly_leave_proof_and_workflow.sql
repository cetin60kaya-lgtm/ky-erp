-- IK Aylik final: izin kanit dokumu ve ucret etkisi snapshoti
ALTER TABLE ik_leave_plans ADD COLUMN effect_type TEXT NOT NULL DEFAULT 'Ücretli';
ALTER TABLE ik_leave_plans ADD COLUMN calculation_json TEXT NOT NULL DEFAULT '{}';

-- Existing leave plans keep the safe default "Ücretli".
-- New and edited plans persist their explicit wage effect in effect_type.

CREATE INDEX IF NOT EXISTS idx_ik_leave_plans_employee_dates
  ON ik_leave_plans(main_company_id, employee_id, start_date, end_date, status);

-- KY işyeri izin sayım kuralı: Cumartesi/Pazar ve resmi tatiller yıllık izin bakiyesinden düşmez.
INSERT INTO ik_leave_counting_policy
  (main_company_id,counted_weekdays_json,exclude_official_holidays,max_concurrent_department,updated_by,updated_at)
VALUES
  ('mecit-hakan','[1,2,3,4,5]',1,1,'migration-0057',CURRENT_TIMESTAMP)
ON CONFLICT(main_company_id) DO UPDATE SET
  counted_weekdays_json='[1,2,3,4,5]',
  exclude_official_holidays=1,
  updated_by='migration-0057',
  updated_at=CURRENT_TIMESTAMP;
