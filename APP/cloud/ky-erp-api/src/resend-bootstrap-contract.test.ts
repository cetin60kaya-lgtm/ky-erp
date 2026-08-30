import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const deploy = (name: string) => readFileSync(resolve(root, "DEPLOY", name), "utf8");
const repoFile = (name: string) => readFileSync(resolve(root, name), "utf8");
const worker = (name: string) => readFileSync(resolve(here, name), "utf8");

const bootstrap = deploy("KYERP_RESEND_BOOTSTRAP.ps1");
const launcher = repoFile("KY ERP CANLIYA YUKLE.bat");
const wrangler = readFileSync(resolve(here, "../wrangler.jsonc"), "utf8");
const management = worker("admin-management-cloud.ts");

test("production launcher requires proven admin@kyerp.net mail before deploy", () => {
  const mail = launcher.indexOf("KYERP_RESEND_BOOTSTRAP.ps1");
  const production = launcher.indexOf("KYERP_DIRECT_PRODUCTION.ps1");
  assert.ok(mail >= 0, "Resend bootstrap must be called by root launcher");
  assert.ok(production > mail, "mail readiness must run before production deploy");
  assert.match(launcher, /Resend\/admin@kyerp\.net hazir olmadan production deploy baslatilmadi/);
});

test("resend bootstrap proves DNS, domain verification, worker secret and a real owner test", () => {
  assert.match(bootstrap, /POST" "/domains"/);
  assert.match(bootstrap, /POST" "/domains\/\$DomainId\/verify"/);
  assert.match(bootstrap, /Ensure-CloudflareDnsRecord/);
  assert.match(bootstrap, /wrangler secret put RESEND_API_KEY/);
  assert.match(bootstrap, /KY ERP sistem e-posta testi/);
  assert.match(bootstrap, /SYSTEM_EMAIL_READY_V1/);
  assert.match(bootstrap, /VERIFIED \+ GERCEK TEST/);
  const verify = bootstrap.indexOf("Wait-ResendVerification");
  const secret = bootstrap.indexOf("Install-WorkerResendSecret");
  const testMail = bootstrap.indexOf("Send-OwnerTestMail");
  const proof = bootstrap.indexOf("Set-MailReadyMarker");
  assert.ok(verify >= 0 && secret > verify && testMail > secret && proof > testMail);
});

test("admin verification is resend-only and sender is canonical owner address", () => {
  assert.match(wrangler, /"RECOVERY_EMAIL_FROM"\s*:\s*"KY ERP <admin@kyerp\.net>"/);
  assert.match(management, /RESEND_API_KEY/);
  assert.doesNotMatch(management, /RECOVERY_EMAIL_WEBHOOK_URL/);
  assert.match(management, /E-posta doğrulaması yalnız uygulama sahibi tarafından başlatılabilir/);
  assert.match(management, /providerMessageId/);
});
