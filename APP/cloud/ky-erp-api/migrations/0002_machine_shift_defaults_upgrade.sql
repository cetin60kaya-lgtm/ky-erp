-- machine_shift_defaults tablosunu yeni üretim merkezi alanlarına yükseltir.
-- Canlı tabloda kayıt bulunmasa da mevcut kolonlar ve olası kayıtlar korunur.

PRAGMA defer_foreign_keys = true;

ALTER TABLE machine_shift_defaults ADD COLUMN machine_no TEXT;
ALTER TABLE machine_shift_defaults ADD COLUMN machine_name TEXT;
ALTER TABLE machine_shift_defaults ADD COLUMN day_operator TEXT;
ALTER TABLE machine_shift_defaults ADD COLUMN night_operator TEXT;
ALTER TABLE machine_shift_defaults ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE machine_shift_defaults ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE machine_shift_defaults ADD COLUMN deleted_at TEXT;

UPDATE machine_shift_defaults
SET machine_no = COALESCE(NULLIF(machine_no, ''), machine_id)
WHERE machine_no IS NULL OR machine_no = '';

CREATE INDEX IF NOT EXISTS idx_machine_shift_defaults_company
  ON machine_shift_defaults (main_company_slug, machine_no);

PRAGMA defer_foreign_keys = false;
