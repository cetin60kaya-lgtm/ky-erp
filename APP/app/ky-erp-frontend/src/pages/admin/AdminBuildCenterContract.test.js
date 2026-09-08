import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./AdminBuildCenter.jsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../modules/AdminPage.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("../../app/moduleRegistryBase.js", import.meta.url), "utf8");

test("owner release center exposes agent, build, R2 and Setup actions", () => {
  assert.match(page, /Windows Build & Sürüm Merkezi/);
  assert.match(page, /Agent Anahtarı Üret/);
  assert.match(page, /PDKS 1\.9\.0 Build Al/);
  assert.match(page, /Setup İndir/);
  assert.match(page, /Cloudflare R2/);
});

test("release center is owner-only and registered in admin navigation", () => {
  assert.match(admin, /activeTab === "surum-merkezi"/);
  assert.match(admin, /owner \? <AdminBuildCenter/);
  assert.match(registry, /\["surum-merkezi", "Sürüm Merkezi"/);
});
