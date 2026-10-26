-- KY ERP / e-Belge physical receipt idempotency journal, additive-only.
-- DO NOT apply to production D1 without separately approved migration.
-- R2/file archive queue (0036) is independent of physical receipts.
CREATE TABLE IF NOT EXISTS accounting_physical_operations (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_line_id TEXT NOT NULL,
  physical_document_id TEXT NOT NULL,
  physical_line_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('RECEIPT','COST_LINK','PROVISIONAL_RECONCILE')),
  product_id TEXT NOT NULL,
  supplier_company_id TEXT NOT NULL DEFAULT '',
  lot_normalized TEXT NOT NULL DEFAULT '',
  payload_hash TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(state IN ('PENDING','PROCESSING','DONE','RETRY','NEEDS_REVIEW')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
  lease_token TEXT,
  lease_until TEXT,
  next_attempt_at TEXT,
  last_error_code TEXT,
  last_error_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug,physical_document_id,physical_line_id,operation_type,
         product_id,supplier_company_id,lot_normalized,document_line_id)
);
CREATE INDEX IF NOT EXISTS ix_accounting_physical_operations_recovery
  ON accounting_physical_operations(main_company_slug,state,next_attempt_at,lease_until,created_at);
CREATE INDEX IF NOT EXISTS ix_accounting_physical_operations_document
  ON accounting_physical_operations(main_company_slug,document_id,state);
CREATE INDEX IF NOT EXISTS ix_accounting_physical_operations_source
  ON accounting_physical_operations(main_company_slug,physical_document_id,physical_line_id);
