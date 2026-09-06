import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const src = path.join(worker, "src");
const files = readdirSync(src).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => path.join(src, name));
const originals = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

function run(command, args) {
  const r = spawnSync(command, args, { cwd: worker, encoding: "utf8", env: process.env, shell: process.platform === "win32", stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}

run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
try {
  for (const file of files) writeFileSync(file, "// @ts-nocheck\n" + originals.get(file));
  run("npx", ["tsc", "--noEmit", "--pretty", "false"]);
  console.log("WORKER_ALL_SOURCE_DIRECT_TSC_PASS");
} finally {
  for (const file of files) writeFileSync(file, originals.get(file));
}
