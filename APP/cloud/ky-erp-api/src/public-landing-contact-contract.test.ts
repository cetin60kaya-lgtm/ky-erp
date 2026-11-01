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

test("public footer exposes actual static privacy and usage pages instead of placeholders", () => {
  const privacy = readFileSync(resolve(root, "APP/app/ky-erp-frontend/public/gizlilik.html"), "utf8");
  const terms = readFileSync(resolve(root, "APP/app/ky-erp-frontend/public/kullanim-kosullari.html"), "utf8");
  assert.ok(footer.includes('href="/gizlilik.html"'));
  assert.ok(footer.includes('href="/kullanim-kosullari.html"'));
  assert.ok(privacy.includes("<h1>Gizlilik Politikası</h1>"));
  assert.ok(terms.includes("<h1>Kullanım Koşulları</h1>"));
  assert.ok(footer.includes("© 2026 KY ERP. Tüm hakları saklıdır."));
});
