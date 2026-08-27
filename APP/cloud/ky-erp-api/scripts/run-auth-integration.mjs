import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WORKER_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WRANGLER_BIN = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const STATE_ROOT = fileURLToPath(new URL("../.wrangler/state", import.meta.url));
const CONFIG = "wrangler.production-local.jsonc";
const DATABASE = "ky-erp-production-local";

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

// This directory belongs only to Wrangler local emulation. It is never the remote D1 database.
// Starting clean makes every auth integration run deterministic and prevents stale local schemas.
rmSync(STATE_ROOT, { recursive: true, force: true });

try {
  run("LOCAL D1 MIGRATIONS (DISPOSABLE)", [
    WRANGLER_BIN,
    "d1",
    "migrations",
    "apply",
    DATABASE,
    "--local",
    "--config",
    CONFIG,
  ]);

  run("LOCAL AUTH RUNTIME SMOKE", [
    fileURLToPath(new URL("./auth-policy-runtime-smoke.mjs", import.meta.url)),
  ]);
} finally {
  rmSync(STATE_ROOT, { recursive: true, force: true });
}

console.log("\nLocal auth integration tamamlandi. Production D1'e hicbir istek gonderilmedi.");
