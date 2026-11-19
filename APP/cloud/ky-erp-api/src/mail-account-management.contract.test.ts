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
});
