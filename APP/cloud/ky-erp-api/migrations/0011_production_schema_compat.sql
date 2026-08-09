-- KY ERP İmalat v2 canlı şema uyumluluk yükseltmesi.
-- 0010 ile üretim verileri temizlendikten sonra eski D1 tablolarını yeni runtime ile uyumlu hale getirir.
-- Muhasebe/İşNet invoice_items içeriğini korur; yalnız eksik nullable alanları ekler.

PRAGMA defer_foreign_keys = true;

ALTER TABLE model_records ADD COLUMN company_id TEXT;
ALTER TABLE model_records ADD COLUMN customer_id TEXT;
ALTER TABLE model_records ADD COLUMN customer_name TEXT;
ALTER TABLE model_records ADD COLUMN source_dispatch_no TEXT;
ALTER TABLE model_records ADD COLUMN customer_dispatch_no TEXT;
ALTER TABLE model_records ADD COLUMN incoming_qty REAL DEFAULT 0;
ALTER TABLE model_records ADD COLUMN incoming_quantity REAL DEFAULT 0;
ALTER TABLE model_records ADD COLUMN remaining_quantity REAL DEFAULT 0;
ALTER TABLE model_records ADD COLUMN ground_color TEXT;
ALTER TABLE model_records ADD COLUMN image_url TEXT;
ALTER TABLE model_records ADD COLUMN deleted_at TEXT;

ALTER TABLE invoice_items ADD COLUMN model_id TEXT;
ALTER TABLE invoice_items ADD COLUMN model_name TEXT;
ALTER TABLE invoice_items ADD COLUMN order_no TEXT;
ALTER TABLE invoice_items ADD COLUMN dispatch_no TEXT;
ALTER TABLE invoice_items ADD COLUMN subtotal REAL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN print_area TEXT;
ALTER TABLE invoice_items ADD COLUMN deleted_at TEXT;

ALTER TABLE production_records ADD COLUMN deleted_at TEXT;

ALTER TABLE model_document_links ADD COLUMN updated_at TEXT;
ALTER TABLE model_document_links ADD COLUMN deleted_at TEXT;

ALTER TABLE model_production_links ADD COLUMN updated_at TEXT;
ALTER TABLE model_production_links ADD COLUMN deleted_at TEXT;

-- Eski tabloda shift NOT NULL ve defaultsuzdu. Yeni düzende tek makine satırı
-- gündüz/gece makinacısını birlikte tuttuğundan, eski satırları koruyarak tabloyu
-- BOTH varsayılanlı hale getiriyoruz. Böylece yeni insertler shift göndermese de çalışır.
ALTER TABLE machine_shift_defaults RENAME TO machine_shift_defaults_legacy;

CREATE TABLE machine_shift_defaults (
  id TEXT PRIMARY KEY NOT NULL,
  main_company_slug TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  shift TEXT NOT NULL DEFAULT 'BOTH',
  raw JSONB,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL,
  machine_no TEXT,
  machine_name TEXT,
  day_operator TEXT,
  night_operator TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  deleted_at TEXT
);

INSERT INTO machine_shift_defaults (
  id,
  main_company_slug,
  machine_id,
  shift,
  raw,
  created_at,
  updated_at,
  machine_no,
  machine_name,
  day_operator,
  night_operator,
  is_active,
  sort_order,
  deleted_at
)
SELECT
  id,
  main_company_slug,
  machine_id,
  COALESCE(NULLIF(shift, ''), 'BOTH'),
  raw,
  created_at,
  updated_at,
  machine_no,
  machine_name,
  day_operator,
  night_operator,
  is_active,
  sort_order,
  deleted_at
FROM machine_shift_defaults_legacy;

DROP TABLE machine_shift_defaults_legacy;

CREATE INDEX IF NOT EXISTS idx_machine_shift_defaults_company
  ON machine_shift_defaults (main_company_slug, machine_no);

PRAGMA defer_foreign_keys = false;
