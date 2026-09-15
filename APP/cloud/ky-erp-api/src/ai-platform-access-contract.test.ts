import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1)));
const worker = fs.readFileSync(path.join(here, "ai-platform-access.ts"), "utf8");
const entry = fs.readFileSync(path.join(here, "main-entry-security.ts"), "utf8");
const adminApi = fs.readFileSync(path.join(here, "../../../app/ky-erp-frontend/src/services/adminApi.js"), "utf8");

test("admin user screen uses the dedicated AI platform admin route", () => {
  assert.match(adminApi, /\/admin\/users\/\$\{encodeURIComponent\(id\)\}\/ai-platform-access/);
  assert.doesNotMatch(adminApi, /apiGet\(`\/ai\/platform-access\/\$\{encodeURIComponent\(id\)\}`/);
});

test("worker exposes admin aliases without removing external AI routes", () => {
  assert.match(worker, /app\.get\("\/api\/admin\/users\/:userId\/ai-platform-access"/);
  assert.match(worker, /app\.put\("\/api\/admin\/users\/:userId\/ai-platform-access"/);
  assert.match(worker, /app\.get\("\/api\/ai\/platform-access\/:userId"/);
  assert.match(worker, /app\.get\("\/api\/ai\/platform-access\/me"/);
});

test("security entry dispatches and CORS-protects the admin AI route", () => {
  assert.match(entry, /command\.use\("\/api\/admin\/users\/\*", cors/);
  assert.match(entry, /ai-platform-access\$\/\.test\(path\)/);
});
