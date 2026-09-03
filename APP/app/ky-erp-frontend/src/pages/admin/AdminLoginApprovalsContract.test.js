import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const approvalsSource = readFileSync(new URL("./AdminLoginApprovals.jsx", import.meta.url), "utf8");
const adminPageSource = readFileSync(new URL("../modules/AdminPage.jsx", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../../app/moduleRegistry.js", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../../services/adminApi.js", import.meta.url), "utf8");

test("login approval center exposes approve and deny actions", () => {
  assert.match(approvalsSource, /listLoginApprovals/);
  assert.match(approvalsSource, /approveLogin/);
  assert.match(approvalsSource, /denyLogin/);
  assert.match(approvalsSource, /Girişi Onayla/);
  assert.match(approvalsSource, /Reddet/);
});

test("admin navigation and route expose login approvals", () => {
  assert.match(registrySource, /\["giris-onaylari", "Giriş Onayları"/);
  assert.match(adminPageSource, /activeTab === "giris-onaylari"/);
  assert.match(adminPageSource, /<AdminLoginApprovals/);
});

test("admin API keeps backend approval endpoints wired", () => {
  assert.match(apiSource, /\/admin\/security\/approvals/);
  assert.match(apiSource, /\/approve/);
  assert.match(apiSource, /\/deny/);
});
