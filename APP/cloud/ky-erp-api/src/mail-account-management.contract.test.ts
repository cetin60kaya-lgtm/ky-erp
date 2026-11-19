import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const core = readFileSync(new URL("./mail-communication-core.ts", import.meta.url), "utf8");
const graph = readFileSync(new URL("./mail-microsoft-graph.ts", import.meta.url), "utf8");
test("Firma bazlı hesap profili ve varsayılanlar mevcut Mail Core üzerinde güncellenir", () => {
  assert.match(core, /app\.put\("\/api\/mail\/accounts\/:id\/profile"/);
  assert.match(core, /app\.put\("\/api\/mail\/accounts\/:id\/defaults"/);
  assert.match(core, /MAIL_ACCOUNT_PROFILE_UPDATED/);
  assert.match(core, /MAIL_ACCOUNT_DEFAULTS_UPDATED/);
  assert.match(core, /WHERE id=\? AND main_company_slug=\?/);
  assert.match(core, /UPDATE mail_accounts SET is_default_send=0,updated_at=\? WHERE main_company_slug=\?/);
  assert.match(core, /UPDATE mail_accounts SET is_default_receive=0,updated_at=\? WHERE main_company_slug=\?/);
  assert.match(core, /hasSend&&typeof body\.isDefaultSend!=="boolean"/);
  assert.match(core, /hasReceive&&typeof body\.isDefaultReceive!=="boolean"/);
});
test("Hesap kimliği, OAuth ve belge arşivi profil düzenlemesinde değişmez", () => {
  const start = core.indexOf('app.put("/api/mail/accounts/:id/profile"');
  const end = core.indexOf('app.put("/api/mail/accounts/:id/defaults"', start);
  const route = core.slice(start, end);
  assert.match(route, /display_name=\?,department_code=\?/);
  assert.doesNotMatch(route, /SET provider_type=/);
  assert.doesNotMatch(route, /SET email_address=/);
  assert.doesNotMatch(route, /DELETE FROM /);
});
test("Graph hesap seçimi firmayı destekler ve kişisel OAuth tek başına gönderim izni olmaz", () => {
  assert.match(graph, /currentAccess\(c,body\)/);
  assert.match(graph, /app\.post\("\/api\/mail\/accounts\/:id\/oauth\/microsoft\/start"/);
  assert.match(graph, /approval_status/);
  assert.match(core, /providerRuntimeReady\(c,account\.provider_type\)/);
  assert.match(core, /normalized==="GMAIL"/);
  assert.match(graph, /currentAccess\(c,body\)/);
});

test("Gmail ve Microsoft varsayılan hesap kararı tek core rotasına gider", () => {
  const entry = readFileSync(new URL("./main-entry-mail.ts", import.meta.url), "utf8");
  const overlay = readFileSync(new URL("./mail-provider-overlay.ts", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /\/defaults\$\/\.test\(path\).*overlay\.fetch/);
  assert.doesNotMatch(overlay, /app\.put\("\/api\/mail\/accounts\/:id\/defaults"/);
  assert.match(core, /MAIL_DEFAULT_NOT_READY/);
  assert.match(overlay, /p==="GMAIL"/);
});

test("Gmail ilk 100 mesaj veya kısmi klasör taraması tam sağlık raporu değildir", () => {
  assert.match(core, /const syncHealthy=enabled>0&&completed===enabled/);
  assert.doesNotMatch(core, /Number\(row\.sync_success_count\|\|0\)>0&&Number\(row\.sync_error_count/);
});

test("Gmail provider cannot silently use Google Drive OAuth client",()=>{
  const core=readFileSync(new URL("./mail-communication-core.ts",import.meta.url),"utf8");
  const overlay=readFileSync(new URL("./mail-provider-overlay.ts",import.meta.url),"utf8");
  assert.match(core,/gmailOAuthClientReadiness\(c.env\)/);
  assert.match(overlay,/gmailOAuthClientReadiness\(c.env\)/);
  assert.doesNotMatch(core,/GOOGLE_MAIL_CLIENT_ID \|\| c.env.GOOGLE_DRIVE_CLIENT_ID/);
  assert.doesNotMatch(overlay,/GOOGLE_MAIL_CLIENT_ID\|\|c.env.GOOGLE_DRIVE_CLIENT_ID/);
});
test("Gmail account registry diagnostics are read-only and platform-owner scoped",()=>{
  const core=readFileSync(new URL("./mail-communication-core.ts",import.meta.url),"utf8");
  const start=core.indexOf('app.get("/api/mail/accounts/diagnostics"');
  const end=core.indexOf('app.post("/api/mail/accounts/request"',start);
  assert.ok(start>0&&end>start);
  const route=core.slice(start,end);
  assert.match(route,/!ownerRole\(current\?\.role\)/);
  assert.match(route,/GROUP BY main_company_slug/);
  assert.match(route,/WHERE main_company_slug=\?/);
  assert.doesNotMatch(route,/INSERT INTO |UPDATE mail_accounts SET|DELETE FROM/);
  assert.doesNotMatch(route,/email_address|access_token|refresh_token/);
});
