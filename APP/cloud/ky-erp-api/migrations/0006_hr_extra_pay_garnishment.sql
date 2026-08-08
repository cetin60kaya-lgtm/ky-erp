-- İK kişi bazlı ek ödeme/prim ve icra kesintisi.
-- Veri silmez; mevcut personel ve bordro kayıtlarını korur.

ALTER TABLE ik_person_card_settings ADD COLUMN extra_payment_label TEXT NOT NULL DEFAULT 'Ek Ödeme / Prim';
ALTER TABLE ik_person_card_settings ADD COLUMN extra_payment_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE ik_person_card_settings ADD COLUMN garnishment_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ik_person_card_settings ADD COLUMN garnishment_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE ik_person_card_settings ADD COLUMN garnishment_note TEXT NOT NULL DEFAULT '';

ALTER TABLE hr_payrolls_v2 ADD COLUMN garnishment_amount REAL NOT NULL DEFAULT 0;
