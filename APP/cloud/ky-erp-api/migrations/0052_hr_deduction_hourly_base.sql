-- İK aylık kesinti saat hesabını mesai saat böleninden ayırır.
-- Varsayılan: mesai 225 saat, kesinti 300 saat.
-- Mevcut personel kartları 300 varsayılanı ile geriye uyumlu kalır.

ALTER TABLE ik_person_card_settings
  ADD COLUMN deduction_hourly_base REAL NOT NULL DEFAULT 300;
