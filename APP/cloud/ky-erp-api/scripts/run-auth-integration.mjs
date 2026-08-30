import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WORKER_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WRANGLER_BIN = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const STATE_ROOT = fileURLToPath(new URL("../.wrangler/state", import.meta.url));
const CONFIG = "wrangler.production-local.jsonc";
const DATABASE = "ky-erp-production-local";
const AUTH_SCHEMA_FILES = [
  "migrations/0018_auth_mfa_sessions.sql",
  "migrations/0019_auth_dual_mfa_recovery.sql",
  "migrations/0021_auth_security_policy_owner_recovery.sql",
  "migrations/0022_auth_same_browser_session_guard.sql",
];

function run(label, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, args, {
    cwd: WORKER_ROOT,
    env: {
      ...process.env,
      CI: "true",
      NO_D1_WARNING: "true",
    },
    stdio: "inherit",
    timeout: 180_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} basarisiz. Exit code: ${result.status}`);
  }
}

function applyLocalSql(file) {
  run(`LOCAL AUTH SCHEMA: ${file}`, [
    WRANGLER_BIN,
    "d1",
    "execute",
    DATABASE,
    "--local",
    "--config",
    CONFIG,
    "--file",
    file,
  ]);
}

// This directory belongs only to Wrangler local emulation. It is never the remote D1 database.
// Auth integration deliberately does NOT run the full production migration chain because unrelated
// historical accounting/production migrations are neither required nor safe prerequisites for auth tests.
rmSync(STATE_ROOT, { recursive: true, force: true });

try {
  console.log("\n=== LOCAL AUTH-ONLY D1 SETUP (DISPOSABLE) ===");
  for (const file of AUTH_SCHEMA_FILES) applyLocalSql(file);

  run("LOCAL AUTH RUNTIME SMOKE", [
    fileURLToPath(new URL("./auth-policy-runtime-smoke.mjs", import.meta.url)),
  ]);

  run("LOCAL SAME-BROWSER SESSION GUARD SMOKE", [
    fileURLToPath(new URL("./auth-same-browser-session-smoke.mjs", import.meta.url)),
  ]);
} finally {
  rmSync(STATE_ROOT, { recursive: true, force: true });
}

console.log("\nLocal auth integration tamamlandi. Yalniz auth semasi kullanildi; production D1'e hicbir istek gonderilmedi.");
