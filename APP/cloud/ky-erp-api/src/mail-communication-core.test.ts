import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mailProviderCapabilities, mailProviderRegistry, normalizeMailProvider } from "./mail-connection-broker.ts";

const read = (url) => readFileSync(new URL(url, import.meta.url), "utf8");

test("mail broker normalizes supported providers and keeps native APIs first-class", () => {
  assert.equal(normalizeMailProvider("Outlook"), "MICROSOFT_365");
  assert.equal(normalizeMailProvider("Google Workspace"), "GMAIL");
  assert.equal(mailProviderCapabilities("MICROSOFT_365")?.oauth, true);
  assert.equal(mailProviderCapabilities("MICROSOFT_365")?.sharedMailbox, true);
  assert.equal(mailProviderCapabilities("GMAIL")?.push, true);
  assert.equal(mailProviderCapabilities("JMAP")?.jmap, true);
  assert.equal(mailProviderCapabilities("IMAP_SMTP")?.imap, true);
  assert.deepEqual(mailProviderRegistry().map((row) => row.provider), ["MICROSOFT_365", "GMAIL", "JMAP", "IMAP_SMTP"]);
});

test("0050 mail schema is additive, tenant-scoped and send-idempotent", () => {
  const sql = read("../migrations/0050_mail_communication_core.sql");
  for (const table of [
    "mail_provider_configs", "mail_accounts", "mail_account_credentials", "mail_oauth_states", "mail_account_members",
    "mail_folders", "mail_threads", "mail_messages", "mail_recipients", "mail_attachments",
    "mail_relations", "mail_sync_cursors", "mail_drafts", "mail_send_jobs", "mail_templates",
    "mail_approval_requests", "mail_approval_steps", "mail_ai_drafts", "mail_audit_log",
    "system_mail_providers", "system_mail_events",
  ]) assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS\\s+" + table));
  assert.match(sql, /UNIQUE\(main_company_slug, logical_event_id\)/);
  assert.match(sql, /ciphertext TEXT NOT NULL/);
  assert.match(sql, /nonce TEXT NOT NULL/);
  assert.doesNotMatch(sql, /refresh_token\s+TEXT/i);
  assert.doesNotMatch(sql, /password\s+TEXT/i);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});

test("mail core is fail-closed for tenant, membership and approvals", () => {
  const source = read("./mail-communication-core.ts");
  assert.match(source, /MAIL_CREDENTIAL_KEY/);
  assert.match(source, /AES-GCM/);
  assert.match(source, /mail_account_members/);
  assert.match(source, /MAIL_REQUESTER_INITIAL_MEMBER/);
  assert.match(source, /COMPANY_OWNER_STEP_PENDING/);
  assert.match(source, /m\.user_id=\?/);
  assert.match(source, /COMPANY_OWNER_AND_APP_OWNER/);
  assert.match(source, /COMPANY_OWNER_APPROVAL_REQUIRED/);
  assert.match(source, /aiMaySendAutomatically:false/);
  assert.doesNotMatch(source, /mainCompanySlug\s*\|\|\s*["']mecit-hakan["']/);
});

test("worker and frontend expose the communication center without replacing storage admin", () => {
  const main = read("./main.ts");
  const registry = read("../../../app/ky-erp-frontend/src/app/moduleRegistry.js");
  assert.match(main, /registerMailCommunicationRoutes\(app\)/);
  assert.match(registry, /key: "iletisim"/);
  assert.match(registry, /permissionKey: "MAIL"/);
  assert.match(registry, /label: "Mail & Dosyalar"/);
  assert.match(registry, /const DEPOLAMA_MODULE/);
});


test("Microsoft Graph mail adapter reuses File Hub OAuth app and protects send retries", () => {
  const source = read("./mail-microsoft-graph.ts");
  assert.match(source, /MICROSOFT_GRAPH_CLIENT_ID/);
  assert.match(source, /MICROSOFT_GRAPH_CLIENT_SECRET/);
  assert.match(source, /Mail\.ReadWrite/);
  assert.match(source, /Mail\.Send/);
  assert.match(source, /code_challenge_method:"S256"/);
  assert.match(source, /UNKNOWN_REVIEW_REQUIRED/);
  assert.match(source, /providerAcceptanceId/);
  assert.doesNotMatch(source, /delivered:true/);
});

test("connection navigation keeps daily Mail and admin connection settings separate", () => {
  const registry = read("../../../app/ky-erp-frontend/src/app/moduleRegistry.js");
  const storagePage = read("../../../app/ky-erp-frontend/src/pages/modules/DepolamaPage.jsx");
  assert.match(registry, /label: "Mail & Dosyalar"/);
  assert.match(registry, /label: "Bağlantılar & Depolama"/);
  assert.match(registry, /\["depolama-mail", "E-posta Hesapları"/);
  assert.match(registry, /\["depolama-kaynaklar", "Dosya Servisleri"/);
  assert.match(storagePage, /AdminMailConnections/);
});


test("mail core fails soft before 0050 instead of breaking the ERP shell", () => {
  const source = read("./mail-communication-core.ts");
  assert.match(source, /mailSchemaReady/);
  assert.match(source, /schemaPendingData/);
  assert.match(source, /MAIL_SCHEMA_NOT_READY/);
  assert.match(source, /setupRequired:true/);
});


test("daily Mail and Files uses a module-scoped file endpoint", () => {
  const source = read("./mail-communication-core.ts");
  const api = read("../../../app/ky-erp-frontend/src/services/mailApi.js");
  assert.match(source, /app\.get\("\/api\/mail\/files"/);
  assert.match(source, /fileEntityTypesForUser/);
  assert.match(source, /JOIN file_hub_relations/);
  assert.match(source, /r\.entity_type IN/);
  assert.match(api, /apiGet\("\/mail\/files"/);
  assert.doesNotMatch(api, /apiGet\("\/file-hub\/(?:files|search)"/);
});
