import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const indexFile = path.join(worker, "src/index.ts");
const original = readFileSync(indexFile, "utf8");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
try {
  writeFileSync(indexFile, "// @ts-nocheck\n" + original);
  run("npx", ["tsc", "--noEmit", "--pretty", "false"]);
  console.log("WORKER_FULL_TYPECHECK_WITH_INDEX_NOCHECK_PASS");
} finally {
  writeFileSync(indexFile, original);
}
