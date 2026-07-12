CREATE TABLE IF NOT EXISTS "official_holidays" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tarih" DATETIME NOT NULL,
  "ad" TEXT NOT NULL,
  "yil" INTEGER NOT NULL,
  "aktif" BOOLEAN NOT NULL DEFAULT true,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "official_holidays_tarih_key" ON "official_holidays"("tarih");
CREATE INDEX IF NOT EXISTS "official_holidays_yil_idx" ON "official_holidays"("yil");
CREATE INDEX IF NOT EXISTS "official_holidays_aktif_idx" ON "official_holidays"("aktif");

INSERT OR IGNORE INTO "official_holidays" ("id", "tarih", "ad", "yil", "aktif", "created_at", "updated_at") VALUES
  ('tr-2026-01-01', '2026-01-01 00:00:00', 'Yilbasi', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-03-19', '2026-03-19 00:00:00', 'Ramazan Bayrami Arifesi', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-03-20', '2026-03-20 00:00:00', 'Ramazan Bayrami 1. Gun', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-03-21', '2026-03-21 00:00:00', 'Ramazan Bayrami 2. Gun', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-03-22', '2026-03-22 00:00:00', 'Ramazan Bayrami 3. Gun', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-04-23', '2026-04-23 00:00:00', 'Ulusal Egemenlik ve Cocuk Bayrami', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-05-01', '2026-05-01 00:00:00', 'Emek ve Dayanisma Gunu', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-05-19', '2026-05-19 00:00:00', 'Ataturk''u Anma Genclik ve Spor Bayrami', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-05-26', '2026-05-26 00:00:00', 'Kurban Bayrami Arifesi', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-05-27', '2026-05-27 00:00:00', 'Kurban Bayrami 1. Gun', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-05-28', '2026-05-28 00:00:00', 'Kurban Bayrami 2. Gun', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-05-29', '2026-05-29 00:00:00', 'Kurban Bayrami 3. Gun', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-05-30', '2026-05-30 00:00:00', 'Kurban Bayrami 4. Gun', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-07-15', '2026-07-15 00:00:00', 'Demokrasi ve Milli Birlik Gunu', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-08-30', '2026-08-30 00:00:00', 'Zafer Bayrami', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-10-28', '2026-10-28 00:00:00', 'Cumhuriyet Bayrami Arifesi', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tr-2026-10-29', '2026-10-29 00:00:00', 'Cumhuriyet Bayrami', 2026, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
