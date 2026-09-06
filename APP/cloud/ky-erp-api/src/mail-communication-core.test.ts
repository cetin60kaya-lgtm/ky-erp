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
  const sql = read("../migrations/0046_mail_communication_core.sql");
  for (const table of [
    "mail_provider_configs", "mail_accounts", "mail_account_credentials", "mail_account_members",
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
  assert.match(registry, /label: "İletişim & Dosyalar"/);
  assert.match(registry, /const DEPOLAMA_MODULE/);
});
