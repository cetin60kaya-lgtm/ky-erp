import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./AdminBuildCenter.jsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../modules/AdminPage.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../../app/moduleRegistryBase.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../layouts/AppShellV3.jsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../../services/adminApi.js", import.meta.url), "utf8");

test("owner release center exposes one-time agent enrollment, build, R2 and Setup actions", () => {
  assert.match(page, /Windows Build & Sürüm Merkezi/);
  assert.match(page, /Tek Kullanımlık Kurulum Kodu Üret/);
  assert.match(page, /10 dakikalık tek kullanımlık/);
  assert.match(page, /PDKS 1\.9\.0 Build Al/);
  assert.match(page, /Setup İndir/);
  assert.match(page, /Cloudflare R2/);
  assert.doesNotMatch(page, /\$Token='\+token/);
});

test("release center is owner-only in route and shell navigation", () => {
  assert.match(admin, /activeTab === "surum-merkezi"/);
  assert.match(admin, /owner \? <AdminBuildCenter/);
  assert.match(registry, /\["surum-merkezi", "Sürüm Merkezi"/);
  assert.match(shell, /OWNER_ONLY_ADMIN_TABS[^\n]+surum-merkezi/);
});


test("release center service uses one-time enrollment instead of reusable token rotation", () => {
  assert.match(service, /createBuildAgentEnrollment/);
  assert.match(service, /\/admin\/build-center\/agent-enrollment/);
  assert.doesNotMatch(service, /rotateBuildAgentToken/);
});
