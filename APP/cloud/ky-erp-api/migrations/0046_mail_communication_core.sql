-- KY ERP Mail / Iletisim Merkezi canonical core (0046)
-- Additive only. No existing business/auth/File Hub rows are reset or removed.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mail_provider_configs (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  capabilities_json TEXT,
  provider_metadata TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, provider_type, display_name)
);
CREATE INDEX IF NOT EXISTS idx_mail_provider_configs_tenant
  ON mail_provider_configs(main_company_slug, provider_type, status);

CREATE TABLE IF NOT EXISTS mail_accounts (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'PERSONAL',
  email_address TEXT NOT NULL,
  display_name TEXT,
  department_code TEXT,
  provider_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  provider_connected INTEGER NOT NULL DEFAULT 0 CHECK(provider_connected IN (0,1)),
  is_default_send INTEGER NOT NULL DEFAULT 0 CHECK(is_default_send IN (0,1)),
  is_default_receive INTEGER NOT NULL DEFAULT 0 CHECK(is_default_receive IN (0,1)),
  created_by TEXT,
  approved_by_company TEXT,
  approved_by_owner TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, provider_type, email_address)
);
CREATE INDEX IF NOT EXISTS idx_mail_accounts_tenant_status
  ON mail_accounts(main_company_slug, status, account_type);

CREATE TABLE IF NOT EXISTS mail_account_credentials (
  account_id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_version TEXT NOT NULL,
  provider_metadata TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_account_credentials_tenant
  ON mail_account_credentials(main_company_slug, account_id);

CREATE TABLE IF NOT EXISTS mail_account_members (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0 CHECK(can_view IN (0,1)),
  can_compose INTEGER NOT NULL DEFAULT 0 CHECK(can_compose IN (0,1)),
  can_send INTEGER NOT NULL DEFAULT 0 CHECK(can_send IN (0,1)),
  can_reply INTEGER NOT NULL DEFAULT 0 CHECK(can_reply IN (0,1)),
  can_forward INTEGER NOT NULL DEFAULT 0 CHECK(can_forward IN (0,1)),
  can_attach INTEGER NOT NULL DEFAULT 0 CHECK(can_attach IN (0,1)),
  can_link_entity INTEGER NOT NULL DEFAULT 0 CHECK(can_link_entity IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, account_id, user_id),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_account_members_user
  ON mail_account_members(main_company_slug, user_id, account_id);

CREATE TABLE IF NOT EXISTS mail_account_scopes (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  scope_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(main_company_slug, account_id, scope_code),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mail_folders (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_folder_id TEXT,
  parent_folder_id TEXT,
  folder_type TEXT,
  name TEXT NOT NULL,
  sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK(sync_enabled IN (0,1)),
  provider_metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, account_id, provider_folder_id),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_folders_account
  ON mail_folders(main_company_slug, account_id, folder_type);

CREATE TABLE IF NOT EXISTS mail_threads (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_thread_id TEXT,
  subject TEXT,
  last_message_at TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, account_id, provider_thread_id),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_threads_recent
  ON mail_threads(main_company_slug, account_id, last_message_at);

CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  thread_id TEXT,
  folder_id TEXT,
  provider_message_id TEXT,
  internet_message_id TEXT,
  direction TEXT NOT NULL,
  sender_email TEXT,
  sender_name TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  sent_at TEXT,
  received_at TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  is_flagged INTEGER NOT NULL DEFAULT 0 CHECK(is_flagged IN (0,1)),
  has_attachments INTEGER NOT NULL DEFAULT 0 CHECK(has_attachments IN (0,1)),
  provider_metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, account_id, provider_message_id),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY(thread_id) REFERENCES mail_threads(id) ON DELETE SET NULL,
  FOREIGN KEY(folder_id) REFERENCES mail_folders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_messages_account_received
  ON mail_messages(main_company_slug, account_id, received_at);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread
  ON mail_messages(main_company_slug, thread_id, sent_at, received_at);

CREATE TABLE IF NOT EXISTS mail_recipients (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  message_id TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_recipients_message
  ON mail_recipients(main_company_slug, message_id, recipient_type);

CREATE TABLE IF NOT EXISTS mail_attachments (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  message_id TEXT NOT NULL,
  provider_attachment_id TEXT,
  file_asset_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  is_inline INTEGER NOT NULL DEFAULT 0 CHECK(is_inline IN (0,1)),
  content_id TEXT,
  provider_metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_message
  ON mail_attachments(main_company_slug, message_id);

CREATE TABLE IF NOT EXISTS mail_relations (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  message_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation_type TEXT,
  confidence REAL,
  source TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(main_company_slug, message_id, entity_type, entity_id, relation_type),
  FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_relations_entity
  ON mail_relations(main_company_slug, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS mail_sync_cursors (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  folder_id TEXT,
  cursor_type TEXT NOT NULL,
  cursor_value TEXT,
  last_sync_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, account_id, folder_id, cursor_type),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mail_drafts (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_draft_id TEXT,
  reply_to_message_id TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  recipients_json TEXT,
  attachment_refs_json TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_drafts_user
  ON mail_drafts(main_company_slug, created_by, updated_at);

CREATE TABLE IF NOT EXISTS mail_send_jobs (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  account_id TEXT NOT NULL,
  draft_id TEXT,
  logical_event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  provider_message_id TEXT,
  provider_acceptance_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  requested_by TEXT,
  approved_request_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, logical_event_id),
  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_send_jobs_status
  ON mail_send_jobs(main_company_slug, status, created_at);

CREATE TABLE IF NOT EXISTS mail_templates (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  template_code TEXT NOT NULL,
  name TEXT NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  category TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, template_code)
);

CREATE TABLE IF NOT EXISTS mail_approval_requests (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  request_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approval_policy TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  request_payload TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_approval_requests_pending
  ON mail_approval_requests(main_company_slug, status, request_type, created_at);

CREATE TABLE IF NOT EXISTS mail_approval_steps (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  request_id TEXT NOT NULL,
  step_type TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'PENDING',
  decided_by TEXT,
  decided_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug, request_id, step_type),
  FOREIGN KEY(request_id) REFERENCES mail_approval_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mail_approval_steps_pending
  ON mail_approval_steps(main_company_slug, status, step_type);

CREATE TABLE IF NOT EXISTS mail_ai_drafts (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  draft_id TEXT,
  task_type TEXT NOT NULL,
  input_context_json TEXT,
  output_text TEXT,
  source_refs_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_audit_log (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  actor_user_id TEXT,
  account_id TEXT,
  message_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_audit_recent
  ON mail_audit_log(main_company_slug, created_at);

CREATE TABLE IF NOT EXISTS system_mail_providers (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  priority INTEGER NOT NULL DEFAULT 100,
  config_metadata TEXT,
  credential_ciphertext TEXT,
  credential_nonce TEXT,
  key_version TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_type, display_name)
);

CREATE TABLE IF NOT EXISTS system_mail_events (
  id TEXT PRIMARY KEY,
  logical_event_id TEXT NOT NULL UNIQUE,
  provider_id TEXT,
  event_type TEXT NOT NULL,
  destination_masked TEXT,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  provider_acceptance_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
