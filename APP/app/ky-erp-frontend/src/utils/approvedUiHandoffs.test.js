import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSecurityInstallUrl, consumeMailTemplatesOpen, getPdksCompanyId, queueMailTemplatesOpen } from "./approvedUiHandoffs.js";

test("PDKS hızlı işlem firmasız/boş firma ile açılamaz", () => {
  assert.equal(getPdksCompanyId(null), "");
  assert.equal(getPdksCompanyId({ slug: "  " }), "");
  assert.equal(getPdksCompanyId({ slug: "firma-1" }), "firma-1");
  assert.equal(getPdksCompanyId({ id: 27 }), "27");
});

test("KY Güvenlik yükleyici tek canonical PWA yolunu kullanır", () => {
  const android = new URL(buildSecurityInstallUrl("android"));
  const ios = new URL(buildSecurityInstallUrl("ios"));
  assert.equal(android.origin, "https://security.kyerp.net");
  assert.equal(android.pathname, "/ky-guvenlik/");
  assert.equal(android.searchParams.get("install"), "1");
  assert.equal(ios.pathname, android.pathname);
  assert.equal(ios.searchParams.get("platform"), "ios");
});

test("Şablonlar komutu bir kere ve güvenli şekilde devredilir", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  assert.equal(consumeMailTemplatesOpen(storage), false);
  assert.equal(queueMailTemplatesOpen(storage), true);
  assert.equal(consumeMailTemplatesOpen(storage), true);
  assert.equal(consumeMailTemplatesOpen(storage), false);
  assert.equal(queueMailTemplatesOpen({ setItem() { throw new Error("denied"); } }), false);
  assert.equal(consumeMailTemplatesOpen({ getItem() { throw new Error("denied"); } }), false);
});

test("Mail Şablonları bağlantısı kayıtsız muhasebe sekmesine gitmez", () => {
  const file = readFileSync(new URL("../pages/modules/CommunicationHubPage.jsx", import.meta.url), "utf8");
  assert.ok(file.includes('tabKey: "mail-ekstre"'));
  assert.ok(!file.includes('tabKey: "mail-sablonlari"'));
});

test("Tasarım yalnız son ortak CSS katmanından yüklenir", () => {
  const shell = readFileSync(new URL("../layouts/AppShellV3.jsx", import.meta.url), "utf8");
  assert.ok(shell.includes('import "../styles/approved-html-shell.css";'));
  const css = readFileSync(new URL("../styles/approved-html-shell.css", import.meta.url), "utf8");
  assert.ok(css.includes("grid-template-columns: 270px minmax(0, 1fr)"));
  const canonical = readFileSync(new URL("../styles/ky-pro-shell.css", import.meta.url), "utf8");
  assert.ok(canonical.includes("grid-template-columns:270px minmax(0,1fr)"));
  assert.ok(css.includes('data-active-module="gunluk-operasyon"'));
  assert.ok(css.includes('data-active-module="ik"'));
});
