import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const diagConfig = path.join(worker, "tsconfig.index-diag.json");

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
    console.error("WORKER_INDEX_TYPECHECK_FAIL=" + label);
    process.exit(result.status || 1);
  }
}

run("npm-ci", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
writeFileSync(diagConfig, JSON.stringify({
  extends: "./tsconfig.json",
  include: ["src/index.ts", "worker-configuration.d.ts"],
  exclude: ["src/**/*.test.ts"]
}, null, 2));

try {
  run("index-typecheck", "npx", ["tsc", "-p", "tsconfig.index-diag.json", "--pretty", "false"]);
  console.log("WORKER_INDEX_TYPECHECK_PASS");
} finally {
  rmSync(diagConfig, { force: true });
}
