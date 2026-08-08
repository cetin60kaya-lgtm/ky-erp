-- İK nihai ücret planı: baz personel, otomatik EK ve hukuki kesinti kanalı.
-- Mevcut bordro geçmişini silmez veya değiştirmez.

ALTER TABLE ik_person_card_settings ADD COLUMN base_employee_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ik_person_card_settings ADD COLUMN legal_deduction_type TEXT NOT NULL DEFAULT 'YOK';
ALTER TABLE ik_person_card_settings ADD COLUMN garnishment_source TEXT NOT NULL DEFAULT 'BANKA';
ALTER TABLE ik_person_card_settings ADD COLUMN legal_start_period TEXT NOT NULL DEFAULT '';
ALTER TABLE ik_person_card_settings ADD COLUMN legal_end_period TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ik_person_card_base_employee
  ON ik_person_card_settings(main_company_id, base_employee_id);

-- CUMA ÖZKURT gerçek maaşı korunur; HKN-03 MURAT MİNANZ baz alınır ve fark EK olarak hesaplanır.
INSERT INTO ik_person_card_settings
  (employee_id, main_company_id, personel_kodu, extra_payment_label, extra_payment_amount, base_employee_id, updated_at)
SELECT c.id, c.main_company_id, c.code, 'EK', MAX(c.salary - b.salary, 0), b.id, CURRENT_TIMESTAMP
  FROM hr_monthly_employees c
  JOIN hr_monthly_employees b ON b.main_company_id = c.main_company_id AND b.code = 'HKN-03'
 WHERE c.code = 'HKN-05'
ON CONFLICT(employee_id) DO UPDATE SET
  base_employee_id = excluded.base_employee_id,
  extra_payment_label = 'EK',
  extra_payment_amount = excluded.extra_payment_amount,
  updated_at = excluded.updated_at;
