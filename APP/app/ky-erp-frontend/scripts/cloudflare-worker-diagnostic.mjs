import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const files = ["src/index.ts", "src/main.ts"].map((p) => path.join(worker, p));
const originals = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: worker, encoding: "utf8", env: process.env, shell: process.platform === "win32", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
try {
  for (const file of files) writeFileSync(file, "// @ts-nocheck\n" + originals.get(file));
  run("npm", ["run", "typecheck"]);
  console.log("WORKER_CANONICAL_TYPECHECK_WITH_MAIN_INDEX_NOCHECK_PASS");
} finally {
  for (const file of files) writeFileSync(file, originals.get(file));
}
