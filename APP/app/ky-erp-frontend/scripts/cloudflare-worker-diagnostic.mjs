import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const diagConfig = path.join(worker, "tsconfig.runtime-diag.json");

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error("WORKER_RUNTIME_TYPECHECK_FAIL=" + label);
    process.exit(result.status || 1);
  }
}

run("npm-ci", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);

writeFileSync(diagConfig, JSON.stringify({
  extends: "./tsconfig.json",
  include: ["src/**/*.ts", "worker-configuration.d.ts"],
  exclude: ["src/**/*.test.ts"],
}, null, 2));

try {
  run("runtime-typecheck", "npx", ["tsc", "--noEmit", "-p", "tsconfig.runtime-diag.json"]);
  console.log("WORKER_RUNTIME_TYPECHECK_PASS");
} finally {
  rmSync(diagConfig, { force: true });
}
