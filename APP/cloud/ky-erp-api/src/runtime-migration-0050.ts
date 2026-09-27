type D1Like = D1Database;

type TableSpec = { name: string; columns: string[] };
type IndexSpec = { name: string; columns: string[] };

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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
  },
  {
    "name": "mail_account_scopes",
    "columns": [
      "id",
      "main_company_slug",
      "account_id",
      "scope_code",
      "created_at"
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
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
    ]
  }
];
const INDEXES: IndexSpec[] = [
  {
    "name": "idx_mail_provider_configs_tenant",
    "columns": [
      "main_company_slug",
      "provider_type",
      "status"
    ]
  },
  {
    "name": "idx_mail_accounts_tenant_status",
    "columns": [
      "main_company_slug",
      "status",
      "account_type"
    ]
  },
  {
    "name": "idx_mail_account_credentials_tenant",
    "columns": [
      "main_company_slug",
      "account_id"
    ]
  },
  {
    "name": "idx_mail_oauth_states_expiry",
    "columns": [
      "expires_at"
    ]
  },
  {
    "name": "idx_mail_account_members_user",
    "columns": [
      "main_company_slug",
      "user_id",
      "account_id"
    ]
  },
  {
    "name": "idx_mail_folders_account",
    "columns": [
      "main_company_slug",
      "account_id",
      "folder_type"
    ]
  },
  {
    "name": "idx_mail_threads_recent",
    "columns": [
      "main_company_slug",
      "account_id",
      "last_message_at"
    ]
  },
  {
    "name": "idx_mail_messages_account_received",
    "columns": [
      "main_company_slug",
      "account_id",
      "received_at"
    ]
  },
  {
    "name": "idx_mail_messages_thread",
    "columns": [
      "main_company_slug",
      "thread_id",
      "sent_at",
      "received_at"
    ]
  },
  {
    "name": "idx_mail_recipients_message",
    "columns": [
      "main_company_slug",
      "message_id",
      "recipient_type"
    ]
  },
  {
    "name": "idx_mail_attachments_message",
    "columns": [
      "main_company_slug",
      "message_id"
    ]
  },
  {
    "name": "idx_mail_relations_entity",
    "columns": [
      "main_company_slug",
      "entity_type",
      "entity_id"
    ]
  },
  {
    "name": "idx_mail_drafts_user",
    "columns": [
      "main_company_slug",
      "created_by",
      "updated_at"
    ]
  },
  {
    "name": "idx_mail_send_jobs_status",
    "columns": [
      "main_company_slug",
      "status",
      "created_at"
    ]
  },
  {
    "name": "idx_mail_approval_requests_pending",
    "columns": [
      "main_company_slug",
      "status",
      "request_type",
      "created_at"
    ]
  },
  {
    "name": "idx_mail_approval_steps_pending",
    "columns": [
      "main_company_slug",
      "status",
      "step_type"
    ]
  },
  {
    "name": "idx_mail_audit_recent",
    "columns": [
      "main_company_slug",
      "created_at"
    ]
  }
];

const readyDatabases = new WeakSet<D1Like>();

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

export async function ensureMailCommunicationCore0050(
  db: D1Like,
): Promise<{
  state: "READY";
  createdTables: string[];
  createdIndexes: string[];
}> {
  if (readyDatabases.has(db)) return { state: "READY", createdTables: [], createdIndexes: [] };

  const { missingTables, missingIndexes } = await preflight(db);
  if (missingTables.length) {
    throw new Error(`MIGRATION_0050_REQUIRED_TABLES:${missingTables.join(",")}`);
  }
  if (missingIndexes.length) {
    throw new Error(`MIGRATION_0050_REQUIRED_INDEXES:${missingIndexes.join(",")}`);
  }

  await verify(db);
  readyDatabases.add(db);
  return { state: "READY", createdTables: [], createdIndexes: [] };
}

export const mailCommunication0050Contract = {
  tables: TABLES.map((spec) => ({ name: spec.name, columns: [...spec.columns] })),
  indexes: INDEXES.map((spec) => ({ name: spec.name, columns: [...spec.columns] })),
};
