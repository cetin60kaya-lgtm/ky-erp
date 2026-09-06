type D1Like = D1Database;

type TableSpec = { name: string; columns: string[]; createSql: string };
type IndexSpec = { name: string; columns: string[]; createSql: string };

const TABLES: TableSpec[] = [
  {
    "name": "mail_provider_configs",
    "columns": [
      "id",
      "main_company_slug",
      "provider_type",
      "display_name",
      "status",
      "capabilities_json",
      "provider_metadata",
      "created_by",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_provider_configs (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  provider_type TEXT NOT NULL,\n  display_name TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'DISCONNECTED',\n  capabilities_json TEXT,\n  provider_metadata TEXT,\n  created_by TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, provider_type, display_name)\n)"
  },
  {
    "name": "mail_accounts",
    "columns": [
      "id",
      "main_company_slug",
      "provider_type",
      "account_type",
      "email_address",
      "display_name",
      "department_code",
      "provider_account_id",
      "status",
      "approval_status",
      "provider_connected",
      "is_default_send",
      "is_default_receive",
      "created_by",
      "approved_by_company",
      "approved_by_owner",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_accounts (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  provider_type TEXT NOT NULL,\n  account_type TEXT NOT NULL DEFAULT 'PERSONAL',\n  email_address TEXT NOT NULL,\n  display_name TEXT,\n  department_code TEXT,\n  provider_account_id TEXT,\n  status TEXT NOT NULL DEFAULT 'PENDING',\n  approval_status TEXT NOT NULL DEFAULT 'PENDING',\n  provider_connected INTEGER NOT NULL DEFAULT 0 CHECK(provider_connected IN (0,1)),\n  is_default_send INTEGER NOT NULL DEFAULT 0 CHECK(is_default_send IN (0,1)),\n  is_default_receive INTEGER NOT NULL DEFAULT 0 CHECK(is_default_receive IN (0,1)),\n  created_by TEXT,\n  approved_by_company TEXT,\n  approved_by_owner TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, provider_type, email_address)\n)"
  },
  {
    "name": "mail_account_credentials",
    "columns": [
      "account_id",
      "main_company_slug",
      "ciphertext",
      "nonce",
      "key_version",
      "provider_metadata",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_account_credentials (\n  account_id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  ciphertext TEXT NOT NULL,\n  nonce TEXT NOT NULL,\n  key_version TEXT NOT NULL,\n  provider_metadata TEXT,\n  updated_at TEXT NOT NULL,\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_oauth_states",
    "columns": [
      "state_hash",
      "main_company_slug",
      "account_id",
      "user_id",
      "provider_type",
      "code_verifier_ciphertext",
      "code_verifier_nonce",
      "return_path",
      "expires_at",
      "created_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_oauth_states (\n  state_hash TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  provider_type TEXT NOT NULL,\n  code_verifier_ciphertext TEXT NOT NULL,\n  code_verifier_nonce TEXT NOT NULL,\n  return_path TEXT,\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_account_members",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "user_id",
      "can_view",
      "can_compose",
      "can_send",
      "can_reply",
      "can_forward",
      "can_attach",
      "can_link_entity",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_account_members (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  user_id TEXT NOT NULL,\n  can_view INTEGER NOT NULL DEFAULT 0 CHECK(can_view IN (0,1)),\n  can_compose INTEGER NOT NULL DEFAULT 0 CHECK(can_compose IN (0,1)),\n  can_send INTEGER NOT NULL DEFAULT 0 CHECK(can_send IN (0,1)),\n  can_reply INTEGER NOT NULL DEFAULT 0 CHECK(can_reply IN (0,1)),\n  can_forward INTEGER NOT NULL DEFAULT 0 CHECK(can_forward IN (0,1)),\n  can_attach INTEGER NOT NULL DEFAULT 0 CHECK(can_attach IN (0,1)),\n  can_link_entity INTEGER NOT NULL DEFAULT 0 CHECK(can_link_entity IN (0,1)),\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, account_id, user_id),\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_account_scopes",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "scope_code",
      "created_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_account_scopes (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  scope_code TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, account_id, scope_code),\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_folders",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "provider_folder_id",
      "parent_folder_id",
      "folder_type",
      "name",
      "sync_enabled",
      "provider_metadata",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_folders (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  provider_folder_id TEXT,\n  parent_folder_id TEXT,\n  folder_type TEXT,\n  name TEXT NOT NULL,\n  sync_enabled INTEGER NOT NULL DEFAULT 1 CHECK(sync_enabled IN (0,1)),\n  provider_metadata TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, account_id, provider_folder_id),\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_threads",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "provider_thread_id",
      "subject",
      "last_message_at",
      "message_count",
      "is_archived",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_threads (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  provider_thread_id TEXT,\n  subject TEXT,\n  last_message_at TEXT,\n  message_count INTEGER NOT NULL DEFAULT 0,\n  is_archived INTEGER NOT NULL DEFAULT 0 CHECK(is_archived IN (0,1)),\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, account_id, provider_thread_id),\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_messages",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "thread_id",
      "folder_id",
      "provider_message_id",
      "internet_message_id",
      "direction",
      "sender_email",
      "sender_name",
      "subject",
      "body_text",
      "body_html",
      "sent_at",
      "received_at",
      "is_read",
      "is_flagged",
      "has_attachments",
      "provider_metadata",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_messages (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  thread_id TEXT,\n  folder_id TEXT,\n  provider_message_id TEXT,\n  internet_message_id TEXT,\n  direction TEXT NOT NULL,\n  sender_email TEXT,\n  sender_name TEXT,\n  subject TEXT,\n  body_text TEXT,\n  body_html TEXT,\n  sent_at TEXT,\n  received_at TEXT,\n  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),\n  is_flagged INTEGER NOT NULL DEFAULT 0 CHECK(is_flagged IN (0,1)),\n  has_attachments INTEGER NOT NULL DEFAULT 0 CHECK(has_attachments IN (0,1)),\n  provider_metadata TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, account_id, provider_message_id),\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE,\n  FOREIGN KEY(thread_id) REFERENCES mail_threads(id) ON DELETE SET NULL,\n  FOREIGN KEY(folder_id) REFERENCES mail_folders(id) ON DELETE SET NULL\n)"
  },
  {
    "name": "mail_recipients",
    "columns": [
      "id",
      "main_company_slug",
      "message_id",
      "recipient_type",
      "email_address",
      "display_name",
      "created_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_recipients (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  message_id TEXT NOT NULL,\n  recipient_type TEXT NOT NULL,\n  email_address TEXT NOT NULL,\n  display_name TEXT,\n  created_at TEXT NOT NULL,\n  FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_attachments",
    "columns": [
      "id",
      "main_company_slug",
      "message_id",
      "provider_attachment_id",
      "file_asset_id",
      "file_name",
      "mime_type",
      "size_bytes",
      "is_inline",
      "content_id",
      "provider_metadata",
      "created_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_attachments (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  message_id TEXT NOT NULL,\n  provider_attachment_id TEXT,\n  file_asset_id TEXT,\n  file_name TEXT NOT NULL,\n  mime_type TEXT,\n  size_bytes INTEGER,\n  is_inline INTEGER NOT NULL DEFAULT 0 CHECK(is_inline IN (0,1)),\n  content_id TEXT,\n  provider_metadata TEXT,\n  created_at TEXT NOT NULL,\n  FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_relations",
    "columns": [
      "id",
      "main_company_slug",
      "message_id",
      "entity_type",
      "entity_id",
      "relation_type",
      "confidence",
      "source",
      "metadata",
      "created_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_relations (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  message_id TEXT NOT NULL,\n  entity_type TEXT NOT NULL,\n  entity_id TEXT NOT NULL,\n  relation_type TEXT,\n  confidence REAL,\n  source TEXT,\n  metadata TEXT,\n  created_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, message_id, entity_type, entity_id, relation_type),\n  FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_sync_cursors",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "folder_id",
      "cursor_type",
      "cursor_value",
      "last_sync_at",
      "last_success_at",
      "last_error",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_sync_cursors (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  folder_id TEXT,\n  cursor_type TEXT NOT NULL,\n  cursor_value TEXT,\n  last_sync_at TEXT,\n  last_success_at TEXT,\n  last_error TEXT,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, account_id, folder_id, cursor_type),\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_drafts",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "provider_draft_id",
      "reply_to_message_id",
      "subject",
      "body_text",
      "body_html",
      "recipients_json",
      "attachment_refs_json",
      "status",
      "created_by",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_drafts (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  provider_draft_id TEXT,\n  reply_to_message_id TEXT,\n  subject TEXT,\n  body_text TEXT,\n  body_html TEXT,\n  recipients_json TEXT,\n  attachment_refs_json TEXT,\n  status TEXT NOT NULL DEFAULT 'DRAFT',\n  created_by TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_send_jobs",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "draft_id",
      "logical_event_id",
      "status",
      "provider_message_id",
      "provider_acceptance_id",
      "attempt_count",
      "last_error",
      "requested_by",
      "approved_request_id",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_send_jobs (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  account_id TEXT NOT NULL,\n  draft_id TEXT,\n  logical_event_id TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'QUEUED',\n  provider_message_id TEXT,\n  provider_acceptance_id TEXT,\n  attempt_count INTEGER NOT NULL DEFAULT 0,\n  last_error TEXT,\n  requested_by TEXT,\n  approved_request_id TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, logical_event_id),\n  FOREIGN KEY(account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_templates",
    "columns": [
      "id",
      "main_company_slug",
      "template_code",
      "name",
      "subject_template",
      "body_template",
      "category",
      "is_active",
      "created_by",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_templates (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  template_code TEXT NOT NULL,\n  name TEXT NOT NULL,\n  subject_template TEXT,\n  body_template TEXT NOT NULL,\n  category TEXT,\n  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),\n  created_by TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, template_code)\n)"
  },
  {
    "name": "mail_approval_requests",
    "columns": [
      "id",
      "main_company_slug",
      "request_type",
      "target_type",
      "target_id",
      "status",
      "approval_policy",
      "requested_by",
      "request_payload",
      "decided_at",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_approval_requests (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  request_type TEXT NOT NULL,\n  target_type TEXT NOT NULL,\n  target_id TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'PENDING',\n  approval_policy TEXT NOT NULL,\n  requested_by TEXT NOT NULL,\n  request_payload TEXT,\n  decided_at TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n)"
  },
  {
    "name": "mail_approval_steps",
    "columns": [
      "id",
      "main_company_slug",
      "request_id",
      "step_type",
      "step_order",
      "required",
      "status",
      "decided_by",
      "decided_at",
      "note",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_approval_steps (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  request_id TEXT NOT NULL,\n  step_type TEXT NOT NULL,\n  step_order INTEGER NOT NULL,\n  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),\n  status TEXT NOT NULL DEFAULT 'PENDING',\n  decided_by TEXT,\n  decided_at TEXT,\n  note TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(main_company_slug, request_id, step_type),\n  FOREIGN KEY(request_id) REFERENCES mail_approval_requests(id) ON DELETE CASCADE\n)"
  },
  {
    "name": "mail_ai_drafts",
    "columns": [
      "id",
      "main_company_slug",
      "draft_id",
      "task_type",
      "input_context_json",
      "output_text",
      "source_refs_json",
      "created_by",
      "created_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_ai_drafts (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  draft_id TEXT,\n  task_type TEXT NOT NULL,\n  input_context_json TEXT,\n  output_text TEXT,\n  source_refs_json TEXT,\n  created_by TEXT,\n  created_at TEXT NOT NULL\n)"
  },
  {
    "name": "mail_audit_log",
    "columns": [
      "id",
      "main_company_slug",
      "actor_user_id",
      "account_id",
      "message_id",
      "action",
      "detail",
      "ip_address",
      "created_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS mail_audit_log (\n  id TEXT PRIMARY KEY,\n  main_company_slug TEXT NOT NULL,\n  actor_user_id TEXT,\n  account_id TEXT,\n  message_id TEXT,\n  action TEXT NOT NULL,\n  detail TEXT,\n  ip_address TEXT,\n  created_at TEXT NOT NULL\n)"
  },
  {
    "name": "system_mail_providers",
    "columns": [
      "id",
      "provider_type",
      "display_name",
      "status",
      "priority",
      "config_metadata",
      "credential_ciphertext",
      "credential_nonce",
      "key_version",
      "created_by",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS system_mail_providers (\n  id TEXT PRIMARY KEY,\n  provider_type TEXT NOT NULL,\n  display_name TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'DISCONNECTED',\n  priority INTEGER NOT NULL DEFAULT 100,\n  config_metadata TEXT,\n  credential_ciphertext TEXT,\n  credential_nonce TEXT,\n  key_version TEXT,\n  created_by TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL,\n  UNIQUE(provider_type, display_name)\n)"
  },
  {
    "name": "system_mail_events",
    "columns": [
      "id",
      "logical_event_id",
      "provider_id",
      "event_type",
      "destination_masked",
      "status",
      "provider_message_id",
      "provider_acceptance_id",
      "attempt_count",
      "last_error",
      "created_at",
      "updated_at"
    ],
    "createSql": "CREATE TABLE IF NOT EXISTS system_mail_events (\n  id TEXT PRIMARY KEY,\n  logical_event_id TEXT NOT NULL UNIQUE,\n  provider_id TEXT,\n  event_type TEXT NOT NULL,\n  destination_masked TEXT,\n  status TEXT NOT NULL,\n  provider_message_id TEXT,\n  provider_acceptance_id TEXT,\n  attempt_count INTEGER NOT NULL DEFAULT 0,\n  last_error TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n)"
  }
];
const INDEXES: IndexSpec[] = [
  {
    "name": "idx_mail_provider_configs_tenant",
    "columns": [
      "main_company_slug",
      "provider_type",
      "status"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_provider_configs_tenant\n  ON mail_provider_configs(main_company_slug, provider_type, status)"
  },
  {
    "name": "idx_mail_accounts_tenant_status",
    "columns": [
      "main_company_slug",
      "status",
      "account_type"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_accounts_tenant_status\n  ON mail_accounts(main_company_slug, status, account_type)"
  },
  {
    "name": "idx_mail_account_credentials_tenant",
    "columns": [
      "main_company_slug",
      "account_id"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_account_credentials_tenant\n  ON mail_account_credentials(main_company_slug, account_id)"
  },
  {
    "name": "idx_mail_oauth_states_expiry",
    "columns": [
      "expires_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_oauth_states_expiry\n  ON mail_oauth_states(expires_at)"
  },
  {
    "name": "idx_mail_account_members_user",
    "columns": [
      "main_company_slug",
      "user_id",
      "account_id"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_account_members_user\n  ON mail_account_members(main_company_slug, user_id, account_id)"
  },
  {
    "name": "idx_mail_folders_account",
    "columns": [
      "main_company_slug",
      "account_id",
      "folder_type"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_folders_account\n  ON mail_folders(main_company_slug, account_id, folder_type)"
  },
  {
    "name": "idx_mail_threads_recent",
    "columns": [
      "main_company_slug",
      "account_id",
      "last_message_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_threads_recent\n  ON mail_threads(main_company_slug, account_id, last_message_at)"
  },
  {
    "name": "idx_mail_messages_account_received",
    "columns": [
      "main_company_slug",
      "account_id",
      "received_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_messages_account_received\n  ON mail_messages(main_company_slug, account_id, received_at)"
  },
  {
    "name": "idx_mail_messages_thread",
    "columns": [
      "main_company_slug",
      "thread_id",
      "sent_at",
      "received_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_messages_thread\n  ON mail_messages(main_company_slug, thread_id, sent_at, received_at)"
  },
  {
    "name": "idx_mail_recipients_message",
    "columns": [
      "main_company_slug",
      "message_id",
      "recipient_type"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_recipients_message\n  ON mail_recipients(main_company_slug, message_id, recipient_type)"
  },
  {
    "name": "idx_mail_attachments_message",
    "columns": [
      "main_company_slug",
      "message_id"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_attachments_message\n  ON mail_attachments(main_company_slug, message_id)"
  },
  {
    "name": "idx_mail_relations_entity",
    "columns": [
      "main_company_slug",
      "entity_type",
      "entity_id"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_relations_entity\n  ON mail_relations(main_company_slug, entity_type, entity_id)"
  },
  {
    "name": "idx_mail_drafts_user",
    "columns": [
      "main_company_slug",
      "created_by",
      "updated_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_drafts_user\n  ON mail_drafts(main_company_slug, created_by, updated_at)"
  },
  {
    "name": "idx_mail_send_jobs_status",
    "columns": [
      "main_company_slug",
      "status",
      "created_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_send_jobs_status\n  ON mail_send_jobs(main_company_slug, status, created_at)"
  },
  {
    "name": "idx_mail_approval_requests_pending",
    "columns": [
      "main_company_slug",
      "status",
      "request_type",
      "created_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_approval_requests_pending\n  ON mail_approval_requests(main_company_slug, status, request_type, created_at)"
  },
  {
    "name": "idx_mail_approval_steps_pending",
    "columns": [
      "main_company_slug",
      "status",
      "step_type"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_approval_steps_pending\n  ON mail_approval_steps(main_company_slug, status, step_type)"
  },
  {
    "name": "idx_mail_audit_recent",
    "columns": [
      "main_company_slug",
      "created_at"
    ],
    "createSql": "CREATE INDEX IF NOT EXISTS idx_mail_audit_recent\n  ON mail_audit_log(main_company_slug, created_at)"
  }
];

let readyInThisIsolate = false;

function quotedIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function existingTableColumns(db: D1Like, table: string): Promise<Set<string> | null> {
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .bind(table).first<{ name: string }>();
  if (!exists?.name) return null;
  const result = await db.prepare(`PRAGMA table_info(${quotedIdentifier(table)})`).all<{ name: string }>();
  return new Set((result.results || []).map((row) => row.name));
}

async function existingIndexColumns(db: D1Like, index: string): Promise<string[] | null> {
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1")
    .bind(index).first<{ name: string }>();
  if (!exists?.name) return null;
  const result = await db.prepare(`PRAGMA index_info(${quotedIdentifier(index)})`).all<{ seqno: number; name: string }>();
  return [...(result.results || [])]
    .sort((left, right) => Number(left.seqno) - Number(right.seqno))
    .map((row) => row.name);
}

async function preflight(db: D1Like): Promise<{ missingTables: string[]; missingIndexes: string[] }> {
  const missingTables: string[] = [];
  const missingIndexes: string[] = [];

  for (const spec of TABLES) {
    const columns = await existingTableColumns(db, spec.name);
    if (!columns) {
      missingTables.push(spec.name);
      continue;
    }
    const missingColumns = spec.columns.filter((column) => !columns.has(column));
    if (missingColumns.length) {
      throw new Error(`MIGRATION_0050_PARTIAL_SCHEMA:${spec.name}:${missingColumns.join(",")}`);
    }
  }

  for (const spec of INDEXES) {
    const columns = await existingIndexColumns(db, spec.name);
    if (!columns) {
      missingIndexes.push(spec.name);
      continue;
    }
    if (columns.join("\u0000") !== spec.columns.join("\u0000")) {
      throw new Error(`MIGRATION_0050_PARTIAL_INDEX:${spec.name}:${columns.join(",")}`);
    }
  }
  return { missingTables, missingIndexes };
}

async function verify(db: D1Like): Promise<void> {
  for (const spec of TABLES) {
    const columns = await existingTableColumns(db, spec.name);
    if (!columns) throw new Error(`MIGRATION_0050_VERIFY_TABLE_MISSING:${spec.name}`);
    const missingColumns = spec.columns.filter((column) => !columns.has(column));
    if (missingColumns.length) {
      throw new Error(`MIGRATION_0050_VERIFY_COLUMNS_MISSING:${spec.name}:${missingColumns.join(",")}`);
    }
  }
  for (const spec of INDEXES) {
    const columns = await existingIndexColumns(db, spec.name);
    if (!columns) throw new Error(`MIGRATION_0050_VERIFY_INDEX_MISSING:${spec.name}`);
    if (columns.join("\u0000") !== spec.columns.join("\u0000")) {
      throw new Error(`MIGRATION_0050_VERIFY_INDEX_COLUMNS:${spec.name}:${columns.join(",")}`);
    }
  }
}

export async function ensureMailCommunicationCore0050(db: D1Like): Promise<{
  state: "READY";
  createdTables: string[];
  createdIndexes: string[];
}> {
  if (readyInThisIsolate) return { state: "READY", createdTables: [], createdIndexes: [] };

  const { missingTables, missingIndexes } = await preflight(db);
  const statements = [
    ...TABLES.filter((spec) => missingTables.includes(spec.name)).map((spec) => db.prepare(spec.createSql)),
    ...INDEXES.filter((spec) => missingIndexes.includes(spec.name)).map((spec) => db.prepare(spec.createSql)),
  ];
  if (statements.length) await db.batch(statements);
  await verify(db);
  readyInThisIsolate = true;
  return { state: "READY", createdTables: missingTables, createdIndexes: missingIndexes };
}

export const mailCommunication0050Contract = {
  tables: TABLES.map((spec) => ({ name: spec.name, columns: [...spec.columns] })),
  indexes: INDEXES.map((spec) => ({ name: spec.name, columns: [...spec.columns] })),
};
