-- Outgoing WORKING drafts only. No canonical accounting posting or external send.
-- Apply only with production backup/readiness approval.
CREATE TABLE IF NOT EXISTS accounting_document_drafts (
  id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('INVOICE','DISPATCH')),
  provider_key TEXT,
  party_company_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','CHECKED')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(main_company_slug,id)
);
CREATE INDEX IF NOT EXISTS idx_ebelge_operator_drafts_list
 ON accounting_document_drafts(main_company_slug,kind,updated_at DESC,id);
