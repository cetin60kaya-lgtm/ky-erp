import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const frontend = (...parts: string[]) => readFileSync(resolve(root, "APP/app/ky-erp-frontend/src", ...parts), "utf8");

const landing = frontend("pages", "PublicLandingPage.jsx");
const footer = frontend("components", "public", "PublicCorporateFooter.jsx");

test("public site exposes a dedicated corporate contact section", () => {
  assert.match(landing, /PublicCorporateFooter/);
  assert.match(landing, /href="#iletisim"/);
  assert.match(footer, /id="iletisim"/);
  assert.match(footer, /CONTACT_EMAIL = "iletisim@kyerp\.net"/);
  assert.match(footer, /CONTACT_PHONE = "\+90 542 394 06 54"/);
  assert.match(footer, /tel:\+905423940654/);
});

test("admin address remains a system-only sender and is not the public mail target", () => {
  assert.doesNotMatch(footer, /mailto:admin@kyerp\.net/i);
  assert.match(footer, /admin@kyerp\.net yalnız sistem bildirimleri için ayrılmıştır/);
});

test("footer legal placeholders remain informational until real legal pages exist", () => {
  assert.match(footer, />KVKK</);
  assert.match(footer, />Gizlilik</);
  assert.match(footer, />Kullanım Koşulları</);
  assert.match(footer, />Çerez Politikası</);
  assert.doesNotMatch(footer, /href=["'][^"']*(kvkk|gizlilik|kullanim|çerez|cerez)/i);
  assert.match(footer, /© 2026 KY ERP\. Tüm hakları saklıdır\./);
});
