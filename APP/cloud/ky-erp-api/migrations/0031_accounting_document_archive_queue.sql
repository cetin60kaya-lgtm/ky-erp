-- KY ERP scanned accounting document canonical archive queue
-- Heavy/original PDF/image remains staged in R2 only until the File Hub agent writes it
-- to the company-selected Google Drive / OneDrive / Local / NAS synced root.

CREATE TABLE IF NOT EXISTS accounting_document_archive_jobs (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  file_asset_id TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  storage_connection_id TEXT,
  relative_path TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_by TEXT,
  claimed_at TEXT,
  completed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, document_id, file_asset_id)
);

CREATE INDEX IF NOT EXISTS ix_accounting_archive_jobs_pending
  ON accounting_document_archive_jobs(main_company_slug, status, created_at);
CREATE INDEX IF NOT EXISTS ix_accounting_archive_jobs_document
  ON accounting_document_archive_jobs(main_company_slug, document_id);

CREATE TRIGGER IF NOT EXISTS trg_accounting_documents_enqueue_archive
AFTER INSERT ON accounting_documents
WHEN NEW.source_type = 'AI_SCAN' AND NEW.file_asset_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO accounting_document_archive_jobs(
    id, main_company_slug, document_id, file_asset_id, purpose_code,
    status, attempts, created_at, updated_at
  ) VALUES (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-' ||
    substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' ||
    lower(hex(randomblob(6))),
    NEW.main_company_slug,
    NEW.id,
    NEW.file_asset_id,
    CASE
      WHEN upper(NEW.document_type) LIKE '%IRSALIYE%' THEN 'DELIVERY_NOTE'
      ELSE 'INVOICE'
    END,
    'PENDING', 0, datetime('now'), datetime('now')
  );
END;
