import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(resolve(here, "main-entry.ts"), "utf8");
const wrangler = readFileSync(resolve(here, "../wrangler.jsonc"), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("worker entry exposes only kyerp.net as the production browser origin", () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/main-entry\.ts"/);
  assert.match(entry, /CANONICAL_PUBLIC_ORIGIN = "https:\/\/kyerp\.net"/);
  assert.match(entry, /"https:\/\/app\.kyerp\.net"/);
  assert.match(entry, /"https:\/\/www\.kyerp\.net"/);
  assert.match(entry, /LEGACY_FRONTEND_ORIGIN_BLOCKED/);
  assert.match(entry, /BLOCKED_LEGACY_ORIGINS\.has\(origin\)/);
  assert.match(entry, /const canonicalRequest = await canonicalizeAdminWrite\(request\)/);
  assert.match(entry, /return shell\.fetch\(canonicalRequest, env, executionCtx\)/);
});

test("normal user writes cannot create ADMIN permission or unsupported forced-password flag", () => {
  const hardening = frontend("pages/admin/AdminUsersPanelHardening.css");
  const delegate = frontend("pages/admin/AdminUsersPanel.jsx");
  assert.match(entry, /url\.pathname === "\/api\/admin\/users\/create-complete"/);
  assert.match(entry, /isPermissionWrite = method === "PUT"/);
  assert.match(entry, /users\\\/\[\^\/\]\+\\\/permissions\$/);
  assert.match(entry, /body\.mustChangePassword = false/);
  assert.match(entry, /!== "ADMIN"/);
  assert.match(delegate, /AdminUsersPanelHardening\.css/);
  assert.match(hardening, /auc2-check-stack > label:nth-child\(2\)/);
  assert.match(hardening, /auc2-perm-row:nth-last-child\(2\)/);
});
