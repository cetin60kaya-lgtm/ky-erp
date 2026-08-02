PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS main_companies (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT,
  company_type TEXT,
  type TEXT,
  tax_no TEXT,
  phone TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS model_records (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_code TEXT,
  order_no TEXT,
  company_id TEXT,
  customer_id TEXT,
  customer_name TEXT,
  source_dispatch_no TEXT,
  customer_dispatch_no TEXT,
  incoming_qty REAL DEFAULT 0,
  incoming_quantity REAL DEFAULT 0,
  remaining_quantity REAL DEFAULT 0,
  ground_color TEXT,
  image_url TEXT,
  status TEXT,
  raw TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS model_print_regions (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  main_company_id TEXT,
  model_record_id TEXT,
  model_id TEXT,
  region_code TEXT,
  region_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  company_id TEXT,
  document_type TEXT,
  target_type TEXT,
  detected_type TEXT,
  document_no TEXT,
  date TEXT,
  source_type TEXT,
  status TEXT,
  subtotal REAL DEFAULT 0,
  vat_total REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  metadata TEXT,
  raw TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  model_id TEXT,
  model_name TEXT,
  product_name TEXT,
  description TEXT,
  order_no TEXT,
  dispatch_no TEXT,
  quantity REAL DEFAULT 0,
  unit TEXT,
  unit_price REAL DEFAULT 0,
  line_total REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  print_area TEXT,
  raw TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS production_records (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  model_id TEXT,
  model_name TEXT,
  order_no TEXT,
  ground_color TEXT,
  machine_name TEXT,
  total_quantity REAL DEFAULT 0,
  machinist TEXT,
  assistant TEXT,
  serimci TEXT,
  fikse_temperature TEXT,
  fikse_speed TEXT,
  print_area TEXT,
  fabric_defect TEXT,
  print_defect TEXT,
  shift TEXT,
  production_date TEXT,
  note TEXT,
  raw TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS model_document_links (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  model_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  raw TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS model_production_links (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  model_id TEXT NOT NULL,
  production_record_id TEXT NOT NULL,
  raw TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS machine_shift_defaults (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  machine_no TEXT NOT NULL,
  machine_name TEXT,
  day_operator TEXT,
  night_operator TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS json_store (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  main_company_slug TEXT,
  file_name TEXT NOT NULL,
  data TEXT,
  created_at TEXT,
  updated_at TEXT
);

INSERT OR REPLACE INTO main_companies
  (id, slug, name, title, is_active, created_at, updated_at)
VALUES
  ('mc-mecit-hakan', 'mecit-hakan', 'Mecit Hakan', 'KY ERP Yerel Test', 1, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z');

INSERT OR REPLACE INTO companies
  (id, main_company_slug, name, normalized_name, company_type, type, tax_no, is_active, created_at, updated_at)
VALUES
  ('company-taha', 'mecit-hakan', 'TAHA GİYİM SAN. VE TİC. A.Ş.', 'TAHA GIYIM SAN VE TIC AS', 'CUSTOMER', 'CUSTOMER', '1111111111', 1, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  ('company-ren', 'mecit-hakan', 'REN FASHION', 'REN FASHION', 'CUSTOMER', 'CUSTOMER', '2222222222', 1, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z');

INSERT OR REPLACE INTO model_records
  (id, main_company_slug, model_name, model_code, order_no, company_id, customer_id, customer_name, source_dispatch_no, customer_dispatch_no, incoming_qty, incoming_quantity, remaining_quantity, ground_color, status, raw, created_at, updated_at)
VALUES
  ('model-windy', 'mecit-hakan', 'WINDY', 'WND-01', 'SP-2451', 'company-taha', 'company-taha', 'TAHA GİYİM SAN. VE TİC. A.Ş.', 'DDM2026000001001', 'DDM2026000001001', 5000, 5000, 5000, 'EKRU', 'ACTIVE', '{"source":"LOCAL_TEST","modelName":"WINDY","orderNo":"SP-2451","expectedQty":5000}', '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  ('model-mervod', 'mecit-hakan', 'MERVOD POLO', 'MRV-02', 'SP-2452', 'company-ren', 'company-ren', 'REN FASHION', 'DDM2026000001002', 'DDM2026000001002', 3000, 3000, 3000, 'LACİVERT', 'ACTIVE', '{"source":"LOCAL_TEST","modelName":"MERVOD POLO","orderNo":"SP-2452","expectedQty":3000}', '2026-08-01T09:05:00.000Z', '2026-08-01T09:05:00.000Z');

INSERT OR REPLACE INTO model_print_regions
  (id, main_company_slug, main_company_id, model_record_id, model_id, region_code, region_name, sort_order, is_active, created_at, updated_at)
VALUES
  ('region-windy-front', 'mecit-hakan', 'mc-mecit-hakan', 'model-windy', 'model-windy', 'FRONT', 'Ön', 1, 1, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  ('region-windy-back', 'mecit-hakan', 'mc-mecit-hakan', 'model-windy', 'model-windy', 'BACK', 'Arka', 2, 1, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  ('region-mervod-front', 'mecit-hakan', 'mc-mecit-hakan', 'model-mervod', 'model-mervod', 'FRONT', 'Ön', 1, 1, '2026-08-01T09:05:00.000Z', '2026-08-01T09:05:00.000Z');

INSERT OR REPLACE INTO documents
  (id, main_company_slug, company_id, document_type, target_type, detected_type, document_no, date, source_type, status, metadata, raw, created_at, updated_at)
VALUES
  ('dispatch-windy', 'mecit-hakan', 'company-taha', 'DISPATCH', 'CUSTOMER_DISPATCH', 'DISPATCH', 'DDM2026000001001', '2026-08-01', 'ISNET', 'PROCESSED', '{"direction":"INCOMING","orderNo":"SP-2451"}', '{"direction":"INCOMING","documentKind":"DISPATCH","companyName":"TAHA GİYİM SAN. VE TİC. A.Ş.","orderNo":"SP-2451"}', '2026-08-01T09:10:00.000Z', '2026-08-01T09:10:00.000Z'),
  ('dispatch-mervod', 'mecit-hakan', 'company-ren', 'DISPATCH', 'CUSTOMER_DISPATCH', 'DISPATCH', 'DDM2026000001002', '2026-08-01', 'ISNET', 'PROCESSED', '{"direction":"INCOMING","orderNo":"SP-2452"}', '{"direction":"INCOMING","documentKind":"DISPATCH","companyName":"REN FASHION","orderNo":"SP-2452"}', '2026-08-01T09:15:00.000Z', '2026-08-01T09:15:00.000Z'),
  ('invoice-windy', 'mecit-hakan', 'company-taha', 'CUSTOMER_INVOICE', 'CUSTOMER_INVOICE', 'CUSTOMER_INVOICE', 'HKN2026000000701', '2026-08-01', 'ISNET', 'SENT', '{"direction":"OUTGOING","orderNo":"SP-2451"}', '{"direction":"OUTGOING","documentKind":"CUSTOMER_INVOICE","companyName":"TAHA GİYİM SAN. VE TİC. A.Ş.","orderNo":"SP-2451"}', '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'),
  ('invoice-mervod', 'mecit-hakan', 'company-ren', 'CUSTOMER_INVOICE', 'CUSTOMER_INVOICE', 'CUSTOMER_INVOICE', 'HKN2026000000702', '2026-08-01', 'ISNET', 'SENT', '{"direction":"OUTGOING","orderNo":"SP-2452"}', '{"direction":"OUTGOING","documentKind":"CUSTOMER_INVOICE","companyName":"REN FASHION","orderNo":"SP-2452"}', '2026-08-01T12:10:00.000Z', '2026-08-01T12:10:00.000Z');

INSERT OR REPLACE INTO invoice_items
  (id, main_company_slug, document_id, model_id, model_name, product_name, description, order_no, dispatch_no, quantity, unit, unit_price, line_total, subtotal, vat_amount, print_area, raw, created_at, updated_at)
VALUES
  ('line-dispatch-windy', 'mecit-hakan', 'dispatch-windy', 'model-windy', 'WINDY', 'WINDY', 'WINDY BASKI', 'SP-2451', 'DDM2026000001001', 5000, 'ADET', 0, 0, 0, 0, '', '{"source":"LOCAL_TEST"}', '2026-08-01T09:10:00.000Z', '2026-08-01T09:10:00.000Z'),
  ('line-dispatch-mervod', 'mecit-hakan', 'dispatch-mervod', 'model-mervod', 'MERVOD POLO', 'MERVOD POLO', 'MERVOD POLO BASKI', 'SP-2452', 'DDM2026000001002', 3000, 'ADET', 0, 0, 0, 0, '', '{"source":"LOCAL_TEST"}', '2026-08-01T09:15:00.000Z', '2026-08-01T09:15:00.000Z'),
  ('line-invoice-windy', 'mecit-hakan', 'invoice-windy', 'model-windy', 'WINDY', 'WINDY', 'WINDY BASKI', 'SP-2451', 'DDM2026000001001', 2000, 'ADET', 12, 24000, 24000, 4800, '', '{"source":"LOCAL_TEST"}', '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'),
  ('line-invoice-mervod', 'mecit-hakan', 'invoice-mervod', 'model-mervod', 'MERVOD POLO', 'MERVOD POLO', 'MERVOD POLO BASKI', 'SP-2452', 'DDM2026000001002', 2500, 'ADET', 12, 30000, 30000, 6000, '', '{"source":"LOCAL_TEST"}', '2026-08-01T12:10:00.000Z', '2026-08-01T12:10:00.000Z');

INSERT OR REPLACE INTO model_document_links
  (id, main_company_slug, model_id, document_id, raw, created_at, updated_at)
VALUES
  ('link-dispatch-windy', 'mecit-hakan', 'model-windy', 'dispatch-windy', '{"source":"LOCAL_TEST"}', '2026-08-01T09:10:00.000Z', '2026-08-01T09:10:00.000Z'),
  ('link-dispatch-mervod', 'mecit-hakan', 'model-mervod', 'dispatch-mervod', '{"source":"LOCAL_TEST"}', '2026-08-01T09:15:00.000Z', '2026-08-01T09:15:00.000Z'),
  ('link-invoice-windy', 'mecit-hakan', 'model-windy', 'invoice-windy', '{"source":"LOCAL_TEST"}', '2026-08-01T12:00:00.000Z', '2026-08-01T12:00:00.000Z'),
  ('link-invoice-mervod', 'mecit-hakan', 'model-mervod', 'invoice-mervod', '{"source":"LOCAL_TEST"}', '2026-08-01T12:10:00.000Z', '2026-08-01T12:10:00.000Z');

INSERT OR REPLACE INTO production_records
  (id, main_company_slug, model_id, model_name, order_no, ground_color, machine_name, total_quantity, machinist, print_area, fabric_defect, print_defect, shift, production_date, note, raw, created_at, updated_at)
VALUES
  ('production-windy-front', 'mecit-hakan', 'model-windy', 'WINDY', 'SP-2451', 'EKRU', '1 - ADELCO', 2500, 'ALİ', 'Ön', '0', '30', 'Gündüz', '2026-08-01T10:00:00.000Z', 'Yerel test ön', '{"batchNo":"DDM2026000001001","dispatchNo":"DDM2026000001001","printRegion":"Ön","quantity":2500,"printDefectQty":30,"fabricDefectQty":0,"testQty":0,"machineId":"1","operatorName":"ALİ","source":"LOCAL_TEST"}', '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'),
  ('production-windy-back', 'mecit-hakan', 'model-windy', 'WINDY', 'SP-2451', 'EKRU', '2 - MHM', 2400, 'RESUL', 'Arka', '20', '0', 'Gece', '2026-08-01T11:00:00.000Z', 'Yerel test arka', '{"batchNo":"DDM2026000001001","dispatchNo":"DDM2026000001001","printRegion":"Arka","quantity":2400,"printDefectQty":0,"fabricDefectQty":20,"testQty":0,"machineId":"2","operatorName":"RESUL","source":"LOCAL_TEST"}', '2026-08-01T11:00:00.000Z', '2026-08-01T11:00:00.000Z'),
  ('production-mervod-front', 'mecit-hakan', 'model-mervod', 'MERVOD POLO', 'SP-2452', 'LACİVERT', '1 - ADELCO', 2900, 'CUMA', 'Ön', '10', '15', 'Gündüz', '2026-08-01T11:30:00.000Z', 'Yerel test üretimi', '{"batchNo":"DDM2026000001002","dispatchNo":"DDM2026000001002","printRegion":"Ön","quantity":2900,"printDefectQty":15,"fabricDefectQty":10,"testQty":0,"machineId":"1","operatorName":"CUMA","source":"LOCAL_TEST"}', '2026-08-01T11:30:00.000Z', '2026-08-01T11:30:00.000Z');

INSERT OR REPLACE INTO model_production_links
  (id, main_company_slug, model_id, production_record_id, raw, created_at, updated_at)
VALUES
  ('link-production-windy-front', 'mecit-hakan', 'model-windy', 'production-windy-front', '{"source":"LOCAL_TEST"}', '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'),
  ('link-production-windy-back', 'mecit-hakan', 'model-windy', 'production-windy-back', '{"source":"LOCAL_TEST"}', '2026-08-01T11:00:00.000Z', '2026-08-01T11:00:00.000Z'),
  ('link-production-mervod-front', 'mecit-hakan', 'model-mervod', 'production-mervod-front', '{"source":"LOCAL_TEST"}', '2026-08-01T11:30:00.000Z', '2026-08-01T11:30:00.000Z');

INSERT OR REPLACE INTO machine_shift_defaults
  (id, main_company_slug, machine_no, machine_name, day_operator, night_operator, is_active, sort_order, created_at, updated_at)
VALUES
  ('1', 'mecit-hakan', '1', 'ADELCO', 'ALİ', 'MURAT', 1, 1, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z'),
  ('2', 'mecit-hakan', '2', 'MHM', 'CUMA', 'RESUL', 1, 2, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z');

PRAGMA foreign_keys = ON;
