-- KY ERP Denetim Ortak Kanit / Kontrol Kutuphanesi v1
-- Additive only: mevcut compliance kayitlarini bozmaz.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS compliance_controls (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  control_key TEXT NOT NULL,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  description TEXT,
  evidence_types TEXT NOT NULL DEFAULT '["DOCUMENT"]',
  recurrence_rule TEXT,
  cycle_days INTEGER,
  warning_days INTEGER NOT NULL DEFAULT 30,
  critical_days INTEGER NOT NULL DEFAULT 7,
  owner_department TEXT,
  applicability_rule TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, control_key)
);
CREATE INDEX IF NOT EXISTS idx_compliance_controls_company_domain
  ON compliance_controls(main_company_slug, domain, is_active, control_key);

CREATE TABLE IF NOT EXISTS compliance_requirement_controls (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  control_id TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT 'EQUIVALENT',
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, requirement_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_req_controls_requirement
  ON compliance_requirement_controls(main_company_slug, requirement_id, control_id);
CREATE INDEX IF NOT EXISTS idx_compliance_req_controls_control
  ON compliance_requirement_controls(main_company_slug, control_id, requirement_id);

CREATE TABLE IF NOT EXISTS compliance_document_controls (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  control_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, document_id, control_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_controls_document
  ON compliance_document_controls(main_company_slug, document_id, control_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_controls_control
  ON compliance_document_controls(main_company_slug, control_id, document_id);

CREATE TABLE IF NOT EXISTS compliance_external_refs (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  external_url TEXT,
  status TEXT,
  valid_until TEXT,
  last_synced_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, entity_type, entity_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_compliance_external_refs_entity
  ON compliance_external_refs(main_company_slug, entity_type, entity_id, provider);


CREATE TABLE IF NOT EXISTS compliance_system_evidence (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  control_id TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'ERP_DATA',
  source_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  status TEXT NOT NULL DEFAULT 'VERIFIED',
  confidence REAL,
  snapshot TEXT NOT NULL DEFAULT '{}',
  verified_by TEXT,
  verified_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, control_id, source_module, source_ref, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS idx_compliance_system_evidence_control
  ON compliance_system_evidence(main_company_slug, control_id, status, expires_at);


CREATE TABLE IF NOT EXISTS compliance_requirement_applicability (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'APPLICABLE',
  reason TEXT,
  evidence_file_asset_id TEXT,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, requirement_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_requirement_applicability
  ON compliance_requirement_applicability(main_company_slug, state, requirement_id);
