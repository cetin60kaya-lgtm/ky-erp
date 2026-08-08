-- IK kesintilerini personel kartindan hareket merkezine tasir.
-- Mevcut hukuki kesinti kayitlari kaybolmaz; bu aya tek hareket olarak aktarilir.

ALTER TABLE hr_monthly_adjustments_v2 ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Elden';

CREATE INDEX IF NOT EXISTS idx_hr_monthly_adjustments_employee_date_type
  ON hr_monthly_adjustments_v2(employee_id, date, adjustment_type);

INSERT INTO hr_monthly_adjustments_v2
  (id, employee_id, date, adjustment_type, hour_or_day, amount, payment_method, payroll_effect, note, status, created_at)
SELECT lower(hex(randomblob(16))), s.employee_id, date('now','start of month'),
       CASE WHEN upper(s.legal_deduction_type)='HACIZ' THEN 'Haciz' ELSE 'Icra' END,
       0, s.garnishment_amount,
       CASE WHEN upper(s.garnishment_source)='ELDEN' THEN 'Elden' ELSE 'Banka' END,
       'Bordroya yansir',
       CASE WHEN trim(COALESCE(s.garnishment_note,''))<>'' THEN s.garnishment_note ELSE 'Personel kartından kesinti merkezine aktarıldı' END,
       'APPROVED', CURRENT_TIMESTAMP
  FROM ik_person_card_settings s
 WHERE COALESCE(s.garnishment_active,0)=1
   AND COALESCE(s.garnishment_amount,0)>0
   AND upper(COALESCE(s.legal_deduction_type,'YOK')) IN ('ICRA','HACIZ')
   AND (trim(COALESCE(s.legal_start_period,''))='' OR strftime('%Y-%m','now') >= s.legal_start_period)
   AND (trim(COALESCE(s.legal_end_period,''))='' OR strftime('%Y-%m','now') <= s.legal_end_period);

UPDATE ik_person_card_settings
   SET legal_deduction_type='YOK', garnishment_active=0, garnishment_amount=0,
       garnishment_source='BANKA', legal_start_period='', legal_end_period='', garnishment_note='',
       updated_at=CURRENT_TIMESTAMP
 WHERE COALESCE(garnishment_active,0)<>0 OR COALESCE(garnishment_amount,0)<>0
    OR upper(COALESCE(legal_deduction_type,'YOK'))<>'YOK';
