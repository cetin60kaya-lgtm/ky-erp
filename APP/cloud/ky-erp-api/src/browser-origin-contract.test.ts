import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "main-entry.ts"), "utf8");
const main = readFileSync(resolve(here, "main.ts"), "utf8");
const wrangler = readFileSync(resolve(here, "../wrangler.jsonc"), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("worker accepts canonical V6 browser origins through the explicit CORS allowlist", () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/main-entry\.ts"/);
  assert.match(main, /const LIVE_ORIGINS = new Set\(\[/);
  assert.match(main, /"https:\/\/kyerp\.net"/);
  assert.match(main, /"https:\/\/www\.kyerp\.net"/);
  assert.match(main, /"https:\/\/app\.kyerp\.net"/);
  assert.match(main, /origin: allowedOrigin/);
  assert.doesNotMatch(entry, /LEGACY_FRONTEND_ORIGIN_BLOCKED/);
  assert.doesNotMatch(entry, /BLOCKED_LEGACY_ORIGINS/);
  assert.match(entry, /const canonicalRequest = await canonicalizeAdminWrite\(request\)/);
  assert.match(entry, /shell\.fetch\(\s*canonicalRequest,\s*env,\s*executionCtx/);
});

test("normal user writes cannot create ADMIN permission or unsupported forced-password flag", () => {
  const hardening = frontend("pages/admin/AdminUsersPanelHardening.css");
  const delegate = frontend("pages/admin/AdminUsersPanel.jsx");
  assert.match(entry, /path === "\/api\/admin\/users\/create-complete"/);
  assert.match(entry, /isPermissionWrite = method === "PUT"/);
  assert.match(entry, /users\\\/\[\^\/\]\+\\\/permissions\$/);
  assert.match(entry, /body\.mustChangePassword = false/);
  assert.match(entry, /!== "ADMIN"/);
  assert.match(delegate, /AdminUsersPanelHardening\.css/);
  assert.match(hardening, /auc2-check-stack > label:nth-child\(2\)/);
  assert.match(hardening, /auc2-perm-row:nth-last-child\(2\)/);
});
