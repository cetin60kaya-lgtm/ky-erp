import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "main-entry.ts"), "utf8");

test("admin read compat yalnız üç problemli GET endpointine ve yalnız hata cevabında uygulanır", () => {
  assert.match(entry, /\/api\/admin\/main-companies/);
  assert.match(entry, /\/api\/admin\/security\/audit-log/);
  assert.match(entry, /\/api\/admin\/security\/delivery-capabilities/);
  assert.match(entry, /request\.method\.toUpperCase\(\) !== "GET" \|\| original\.ok/);
  assert.match(entry, /if \(!COMPAT_PATHS\.has\(path\)\) return original/);
});

test("fallback mevcut bearer oturumunu auth me ile tekrar doğrulamadan veri döndürmez", () => {
  assert.match(entry, /new URL\("\/api\/auth\/me", request\.url\)/);
  assert.match(entry, /headers\.set\("Authorization", authorization\)/);
  assert.match(entry, /if \(!response\.ok\) return null/);
  assert.match(entry, /if \(!user\) return original/);
  assert.match(entry, /if \(!isOwner\(user\.role\)\) return original/);
  assert.match(entry, /if \(!isAdmin\(user\.role\)\) return original/);
});

test("firma ve audit fallback canlı D1 kolonlarını PRAGMA ile okuyup eksik şemaya dayanıklıdır", () => {
  assert.match(entry, /PRAGMA table_info/);
  assert.match(entry, /compatMainCompanies/);
  assert.match(entry, /compatAuditLog/);
  assert.match(entry, /if \(!columns\.size\) return \[\]/);
  assert.match(entry, /columns\.has\("main_company_slug"\)/);
});

test("email fallback yalnız Worker secret varlığını raporlar ve sahte başarı üretmez", () => {
  assert.match(entry, /Boolean\(\(env as any\)\.RESEND_API_KEY\)/);
  assert.match(entry, /emailProvider: resend \? "RESEND" : "NONE"/);
  assert.match(entry, /emailConfirmation: "PROVIDER_ACCEPTED"/);
  assert.match(entry, /KY ERP <admin@kyerp\.net>/);
});
