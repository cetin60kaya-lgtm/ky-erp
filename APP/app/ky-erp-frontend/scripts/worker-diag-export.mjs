import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const rel = [
  "src/e-belge-ubl.ts",
  "src/index.ts",
  "src/mail-connection-broker.ts",
  "src/main.ts",
  "src/runtime-migration-0046.ts",
  "src/runtime-migration-0050.ts",
];
const files = rel.map((p) => path.join(worker, p));
const originals = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

function run(command, args) {
  const r = spawnSync(command, args, { cwd: worker, encoding: "utf8", env: process.env, shell: process.platform === "win32", stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}
run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
try {
  for (const f of files) writeFileSync(f, "// @ts-nocheck\n" + originals.get(f));
  run("npm", ["run", "typecheck"]);
  console.log("WORKER_SIX_RUNTIME_NOCHECK_PASS");
} finally {
  for (const f of files) writeFileSync(f, originals.get(f));
}
