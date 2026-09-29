-- KY ERP Denetim & Uygunluk Merkezi v1
-- Additive migration: no destructive data operations.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS compliance_profiles (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  description TEXT,
  source_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, code)
);

CREATE INDEX IF NOT EXISTS idx_compliance_profiles_company
  ON compliance_profiles(main_company_slug, is_active, code);

CREATE TABLE IF NOT EXISTS compliance_requirements (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  requirement_type TEXT NOT NULL DEFAULT 'DOCUMENT',
  description TEXT,
  evidence_types TEXT NOT NULL DEFAULT '["DOCUMENT"]',
  source_url TEXT,
  legal_basis TEXT,
  recurrence_rule TEXT,
  applicability_rule TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  custom_fields TEXT NOT NULL DEFAULT '{}',
  mandatory INTEGER NOT NULL DEFAULT 1,
  cycle_days INTEGER,
  warning_days INTEGER NOT NULL DEFAULT 10,
  critical_days INTEGER NOT NULL DEFAULT 3,
  owner_department TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, profile_id, code)
);
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_company_profile
  ON compliance_requirements(main_company_slug, profile_id, category, sort_order);

CREATE TABLE IF NOT EXISTS compliance_documents (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'DOCUMENT',
  issuer TEXT,
  document_no TEXT,
  issue_date TEXT,
  valid_from TEXT,
  expires_at TEXT,
  reminder_days INTEGER NOT NULL DEFAULT 10,
  owner_department TEXT,
  responsible_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  file_asset_id TEXT,
  file_name TEXT,
  storage_key TEXT,
  mime_type TEXT,
  file_size INTEGER,
  tags TEXT NOT NULL DEFAULT '[]',
  custom_fields TEXT NOT NULL DEFAULT '{}',
  version_no INTEGER NOT NULL DEFAULT 1,
  superseded_by_id TEXT,
  revision_parent_id TEXT,
  notes TEXT,
  ai_status TEXT NOT NULL DEFAULT 'NOT_CHECKED',
  ai_confidence REAL,
  ai_extracted_data TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_compliance_documents_expiry
  ON compliance_documents(main_company_slug, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_file
  ON compliance_documents(main_company_slug, file_asset_id);

CREATE TABLE IF NOT EXISTS compliance_document_requirements (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, document_id, requirement_id)
);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_requirements_req
  ON compliance_document_requirements(main_company_slug, requirement_id, document_id);

CREATE TABLE IF NOT EXISTS compliance_audits (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  profile_id TEXT,
  name TEXT NOT NULL,
  audit_type TEXT NOT NULL DEFAULT 'CUSTOMER',
  planned_date TEXT,
  completed_date TEXT,
  auditor_name TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED',
  readiness_score REAL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_audits_company_date
  ON compliance_audits(main_company_slug, status, planned_date);

CREATE TABLE IF NOT EXISTS compliance_findings (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  audit_id TEXT,
  requirement_id TEXT,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM',
  description TEXT,
  corrective_action TEXT,
  responsible_user_id TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  evidence_file_asset_id TEXT,
  closed_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_findings_due
  ON compliance_findings(main_company_slug, status, due_date, severity);
CREATE TABLE IF NOT EXISTS compliance_ai_scans (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  scan_type TEXT NOT NULL DEFAULT 'AUTONOMOUS_REVIEW',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  score REAL,
  summary TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',
  model TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_ai_scans_company
  ON compliance_ai_scans(main_company_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS compliance_events (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_user_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_events_company
  ON compliance_events(main_company_slug, created_at DESC);




CREATE TABLE IF NOT EXISTS compliance_document_versions (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  file_asset_id TEXT,
  file_name TEXT,
  storage_key TEXT,
  mime_type TEXT,
  file_size INTEGER,
  metadata_snapshot TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(main_company_slug, document_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_compliance_document_versions_doc ON compliance_document_versions(main_company_slug, document_id, version_no DESC);

CREATE TABLE IF NOT EXISTS compliance_field_definitions (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  profile_id TEXT,
  entity_type TEXT NOT NULL DEFAULT 'DOCUMENT',
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'TEXT',
  options_json TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, profile_id, entity_type, field_key)
);
CREATE TABLE IF NOT EXISTS compliance_settings (
  id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL, setting_key TEXT NOT NULL, setting_value TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, setting_key)
);

CREATE TABLE IF NOT EXISTS compliance_tasks (
  id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL, task_type TEXT NOT NULL DEFAULT 'RENEWAL', title TEXT NOT NULL, entity_type TEXT, entity_id TEXT, due_date TEXT, warning_days INTEGER NOT NULL DEFAULT 10, priority TEXT NOT NULL DEFAULT 'NORMAL', status TEXT NOT NULL DEFAULT 'OPEN', responsible_user_id TEXT, source TEXT NOT NULL DEFAULT 'SYSTEM', metadata TEXT NOT NULL DEFAULT '{}', created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_compliance_tasks_due ON compliance_tasks(main_company_slug, status, due_date, priority);
