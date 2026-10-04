import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const read=(path)=>readFileSync(resolve(here,path),"utf8");

const registry=read("app/moduleRegistryBase.js");
const registryPatch=read("app/moduleRegistry.js");
const page=read("pages/modules/AdminPage.jsx");
const hub=read("pages/admin/AdminPlatformHub.jsx");

test("platform management sidebar is reduced to management security and system",()=>{
  assert.match(registry,/\["admin-yonetim-ozeti", "Yönetim"/);
  assert.match(registry,/\["admin-guvenlik", "Güvenlik"/);
  assert.match(registry,/\["admin-sistem", "Sistem"/);
  assert.match(registry,/hiddenTabs/);
  assert.match(registryPatch,/"giris-onaylari": "admin-guvenlik"/);
});

test("owner admin routes render one unified panel at a time",()=>{
  assert.match(page,/AdminPlatformHub/);
  assert.match(page,/if \(owner\) return <AdminPlatformHub/);
  assert.match(hub,/const GROUPS/);
  assert.match(hub,/management:/);
  assert.match(hub,/security:/);
  assert.match(hub,/system:/);
  assert.match(hub,/key=\{panel\}/);
  assert.doesNotMatch(hub,/<><AdminOwnerSecurity \/><SecurityCenterPanel/);
});
