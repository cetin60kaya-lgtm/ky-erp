import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const frontendPath = (...parts: string[]) => resolve(root, "APP/app/ky-erp-frontend/src", ...parts);
const frontend = (...parts: string[]) => readFileSync(frontendPath(...parts), "utf8");

const service = frontend("services", "isnetApi.js");
const integrations = frontend("pages", "modules", "muhasebe", "EBelgeIntegrationsWorkspace.jsx");
const center = frontend("pages", "modules", "muhasebe", "EBelgeCenterPage.jsx");
const registry = frontend("app", "moduleRegistryBase.js");

test("İşNet eski ana modül değil e-Belge içindeki provider entegrasyonudur", () => {
  assert.equal(existsSync(frontendPath("pages", "modules", "isnet", "IsnetManagementCenterPage.jsx")), false);
  assert.match(registry, /key:\s*"e-belge"/);
  assert.doesNotMatch(registry, /key:\s*"isnet"/);
  assert.match(center, /view === "integrations"/);
  assert.match(center, /<EBelgeIntegrationsWorkspace/);
  assert.match(integrations, /İşNet Portal Bağlantısı/);
});

test("İşNet provider ayarları aktif firma bağlamı olmadan yüklenmez", () => {
  assert.match(integrations, /if \(!activeMainCompany\?\.slug && !activeMainCompany\?\.id\) return/);
  assert.match(integrations, /const tenant = activeMainCompany\?\.slug \|\| activeMainCompany\?\.id/);
  assert.match(integrations, /fetchSharedModels\(activeMainCompany/);
  assert.match(integrations, /fetchCompanies\(activeMainCompany\)/);
});

test("İşNet servis katmanı yalnız provider bağlantı ayarlarını taşır", () => {
  assert.match(service, /\/isnet\/settings/);
  assert.match(service, /\/isnet\/settings\/test/);
  assert.doesNotMatch(service, /outgoing-recovery|daily-sync|PARTIAL_REVIEW_REQUIRED/);
  assert.match(integrations, /Resmî irsaliye veya fatura kullanıcı onayı olmadan gönderilmez/);
});
