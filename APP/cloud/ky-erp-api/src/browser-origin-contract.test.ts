import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "main-entry.ts"), "utf8");
const main = readFileSync(resolve(here, "main.ts"), "utf8");
const securityEntry = readFileSync(resolve(here, "main-entry-security.ts"), "utf8");
const mailEntry = readFileSync(resolve(here, "main-entry-mail.ts"), "utf8");
const wrangler = readFileSync(resolve(here, "../wrangler.jsonc"), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("worker accepts canonical V6 browser origins through the explicit CORS allowlist", () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/main-entry-security\.ts"/);
  assert.match(securityEntry, /import base from "\.\/main-entry-mail"/);
  assert.match(mailEntry, /import base from "\.\/main-entry"/);
  assert.match(main, /const LIVE_ORIGINS = new Set\(\[/);
  assert.match(main, /"https:\/\/kyerp\.net"/);
  assert.match(main, /"https:\/\/www\.kyerp\.net"/);
  assert.match(main, /"https:\/\/app\.kyerp\.net"/);
  assert.match(main, /origin: allowedOrigin/);
  assert.doesNotMatch(entry, /LEGACY_FRONTEND_ORIGIN_BLOCKED/);
  assert.doesNotMatch(entry, /BLOCKED_LEGACY_ORIGINS/);
  assert.match(entry, /const canonicalRequest = await canonicalizeAdminWrite\(request\)/);
  assert.match(entry, /const response = await shell\.fetch\(canonicalRequest, env, executionCtx\)/);
  assert.match(entry, /return adminReadCompat\(canonicalRequest, env, executionCtx, response\)/);
});

test("normal user writes cannot create ADMIN permission or unsupported forced-password flag", () => {
  const hardening = frontend("pages/admin/AdminUsersPanelHardening.css");
  const delegate = frontend("pages/admin/AdminUsersPanel.jsx");
  assert.match(entry, /path === "\/api\/admin\/users\/create-complete"/);
  assert.match(entry, /isPermissionWrite = method === "PUT"/);
  assert.match(entry, /users\\\/\[\^\/\]\+\\\/permissions\$/);
  assert.match(entry, /body\.mustChangePassword = false/);
  assert.match(entry, /!== "ADMIN"/);
  assert.match(delegate, /return <AdminUsersPanelV2 \{\.\.\.props\} \/>/);
  assert.match(hardening, /auc2-check-stack > label:nth-child\(2\)/);
  assert.match(hardening, /auc2-perm-row:nth-last-child\(2\)/);
});
