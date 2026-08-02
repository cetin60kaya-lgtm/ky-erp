-- KY ERP Cloudflare D1 çalışma şeması.
-- Bu migration veri silmez ve örnek/test kaydı eklemez.
-- Var olan tabloları korur; yalnız eksik çekirdek tabloları ve güvenli indeksleri oluşturur.
-- machine_shift_defaults tablosu canlıdaki eski şemayla uyumlu tutulur;
-- yeni alanlar 0002 migrationında güvenli biçimde eklenir.

PRAGMA defer_foreign_keys = true;

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
  tax_office TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  current_balance REAL DEFAULT 0,
  opening_balance REAL DEFAULT 0,
  default_record_type TEXT,
  note TEXT,
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
  machine_id TEXT NOT NULL,
  shift TEXT NOT NULL,
  raw TEXT,
  created_at TEXT,
  updated_at TEXT
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

CREATE INDEX IF NOT EXISTS idx_companies_main_company_name
  ON companies (main_company_slug, name);
CREATE INDEX IF NOT EXISTS idx_models_main_company_name
  ON model_records (main_company_slug, model_name);
CREATE INDEX IF NOT EXISTS idx_model_regions_model
  ON model_print_regions (main_company_slug, model_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_documents_main_company_date
  ON documents (main_company_slug, date, document_type);
CREATE INDEX IF NOT EXISTS idx_invoice_items_document
  ON invoice_items (main_company_slug, document_id);
CREATE INDEX IF NOT EXISTS idx_production_model_date
  ON production_records (main_company_slug, model_id, production_date);
CREATE INDEX IF NOT EXISTS idx_model_document_links_model
  ON model_document_links (main_company_slug, model_id, document_id);
CREATE INDEX IF NOT EXISTS idx_model_production_links_model
  ON model_production_links (main_company_slug, model_id, production_record_id);
CREATE INDEX IF NOT EXISTS idx_json_store_scope_company_file
  ON json_store (scope, main_company_slug, file_name);
CREATE INDEX IF NOT EXISTS idx_json_store_company_updated
  ON json_store (main_company_slug, updated_at);

PRAGMA defer_foreign_keys = false;
