-- KY ERP / IK emekli + donemsel SGK uyum katmani
-- 2026-09-06
-- Personel statuleri ile aylik SGK kapsamini birbirinden ayirir.
-- Additive migration; mevcut personel, bordro veya PDKS kaydini silmez.

CREATE TABLE IF NOT EXISTS ik_person_hr_profiles (
  employee_id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL,
  personnel_status TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (personnel_status IN ('NORMAL','RETIRED')),
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ik_person_hr_profiles_company_status
  ON ik_person_hr_profiles(main_company_id, personnel_status, employee_id);

CREATE TABLE IF NOT EXISTS ik_person_monthly_compliance (
  main_company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  period TEXT NOT NULL,
  sgk_covered INTEGER NOT NULL DEFAULT 0 CHECK (sgk_covered IN (0,1)),
  sgk_days INTEGER CHECK (sgk_days IS NULL OR (sgk_days >= 0 AND sgk_days <= 31)),
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(main_company_id, employee_id, period)
);

CREATE INDEX IF NOT EXISTS idx_ik_person_monthly_compliance_period
  ON ik_person_monthly_compliance(main_company_id, period, sgk_covered, employee_id);

-- Mevcut kartlari NORMAL personel statüsüyle seed et.
INSERT OR IGNORE INTO ik_person_hr_profiles
  (employee_id, main_company_id, personnel_status, updated_by, updated_at)
SELECT e.id, e.main_company_id, 'NORMAL', 'SYSTEM', CURRENT_TIMESTAMP
FROM hr_monthly_employees e;

-- Donemsel satir olmayan durumlarda mevcut sgk_status/sgk_follow fallback olarak kullanilmaya devam eder.
