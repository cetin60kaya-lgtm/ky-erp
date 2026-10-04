-- KY ERP Denetim Merkezi final operasyon katmani v2
-- Additive only. Mevcut kayitlari silmez veya yeniden olusturmaz.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS compliance_audit_documents (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'AUDITOR',
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, audit_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_documents
  ON compliance_audit_documents(main_company_slug, audit_id, sort_order, document_id);

CREATE TABLE IF NOT EXISTS compliance_audit_shares (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  label TEXT,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  allow_download INTEGER NOT NULL DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  revoked_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(token_hash)
);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_shares
  ON compliance_audit_shares(main_company_slug, audit_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS compliance_finding_capa (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  immediate_correction TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  verification_note TEXT,
  verification_status TEXT NOT NULL DEFAULT 'OPEN',
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, finding_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_finding_capa
  ON compliance_finding_capa(main_company_slug, verification_status, finding_id);

CREATE TABLE IF NOT EXISTS compliance_finding_evidence (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  file_asset_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_finding_evidence
  ON compliance_finding_evidence(main_company_slug, finding_id, created_at DESC);
