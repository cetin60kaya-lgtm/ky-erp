-- Outgoing WORKING drafts only. No canonical accounting posting or external send.
-- Apply only with production backup/readiness approval.
CREATE TABLE IF NOT EXISTS accounting_document_drafts (
  id TEXT NOT NULL,
  main_company_slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('INVOICE','DISPATCH')),
  provider_key TEXT,
  party_company_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  creation_context TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(creation_context)),
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

CREATE TABLE IF NOT EXISTS accounting_document_read_state (
  main_company_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY(main_company_slug,user_id,document_id)
);

-- REV3 approved versioned defaults. No default rows seeded; management/approval is a separate gate.
CREATE TABLE IF NOT EXISTS ebelge_command_defaults (
 id TEXT NOT NULL, main_company_slug TEXT NOT NULL, party_company_id TEXT NOT NULL,
 catalog_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('INVOICE','DISPATCH')),
 version INTEGER NOT NULL CHECK(version>0), valid_from TEXT NOT NULL, valid_until TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)), approved_by TEXT NOT NULL,
 CHECK(valid_from<=valid_until), PRIMARY KEY(main_company_slug,id,version)
);
CREATE INDEX IF NOT EXISTS idx_ebelge_command_defaults ON ebelge_command_defaults(main_company_slug,party_company_id,catalog_id,kind,valid_from,valid_until);
