-- KY ERP / IK personel kodu koruma standardi
-- 2026-09-03
-- Hakan tenantinda bos personel kodlarini HKN001, HKN002... seklinde tamamlar.
-- Mevcut dolu kodlara dokunmaz; veri silmez.

-- 1) Mevcut bos kodlari deterministik sekilde tamamla.
WITH max_code AS (
  SELECT COALESCE(MAX(CAST(SUBSTR(code, 4) AS INTEGER)), 0) AS max_no
  FROM hr_monthly_employees
  WHERE main_company_id = 'mecit-hakan'
    AND code GLOB 'HKN[0-9][0-9][0-9]'
),
missing AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY COALESCE(created_at, ''), id) AS rn
  FROM hr_monthly_employees
  WHERE main_company_id = 'mecit-hakan'
    AND TRIM(COALESCE(code, '')) = ''
)
UPDATE hr_monthly_employees
SET code = (
  SELECT printf('HKN%03d', max_code.max_no + missing.rn)
  FROM max_code, missing
  WHERE missing.id = hr_monthly_employees.id
)
WHERE id IN (SELECT id FROM missing);

-- 2) Firma icinde dolu personel kodu tekil olmak zorunda.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_monthly_employees_company_code_unique
ON hr_monthly_employees(main_company_id, code)
WHERE TRIM(COALESCE(code, '')) <> '';

-- 3) Hakan tenantinda yeni personel bos kodla acilirsa otomatik siradaki HKN### kodunu ver.
DROP TRIGGER IF EXISTS trg_hr_monthly_employee_hkn_code;
CREATE TRIGGER trg_hr_monthly_employee_hkn_code
AFTER INSERT ON hr_monthly_employees
WHEN NEW.main_company_id = 'mecit-hakan'
 AND TRIM(COALESCE(NEW.code, '')) = ''
BEGIN
  UPDATE hr_monthly_employees
  SET code = printf(
    'HKN%03d',
    COALESCE((
      SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER))
      FROM hr_monthly_employees
      WHERE main_company_id = NEW.main_company_id
        AND id <> NEW.id
        AND code GLOB 'HKN[0-9][0-9][0-9]'
    ), 0) + 1
  )
  WHERE id = NEW.id;
END;

-- 4) Personel karti ayarindaki bos personel kodunu ana karttan tamamla.
UPDATE ik_person_card_settings
SET personel_kodu = (
  SELECT e.code
  FROM hr_monthly_employees e
  WHERE e.id = ik_person_card_settings.employee_id
    AND e.main_company_id = ik_person_card_settings.main_company_id
)
WHERE main_company_id = 'mecit-hakan'
  AND TRIM(COALESCE(personel_kodu, '')) = '';

-- 5) Eski null bordro kapsamlarini aktif et. Explicit 0 degerine dokunulmaz.
UPDATE ik_person_card_settings
SET payroll_included = 1
WHERE main_company_id = 'mecit-hakan'
  AND payroll_included IS NULL;

-- 6) Yeni kart ayarinda personel_kodu bos gelirse ana personel kodunu aynala.
DROP TRIGGER IF EXISTS trg_ik_person_card_hkn_code;
CREATE TRIGGER trg_ik_person_card_hkn_code
AFTER INSERT ON ik_person_card_settings
WHEN NEW.main_company_id = 'mecit-hakan'
 AND TRIM(COALESCE(NEW.personel_kodu, '')) = ''
BEGIN
  UPDATE ik_person_card_settings
  SET personel_kodu = (
    SELECT e.code
    FROM hr_monthly_employees e
    WHERE e.id = NEW.employee_id
      AND e.main_company_id = NEW.main_company_id
  )
  WHERE employee_id = NEW.employee_id;
END;
