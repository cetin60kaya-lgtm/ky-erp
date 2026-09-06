import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const srcDir = path.join(worker, "src");
const originals = new Map();
for (const name of readdirSync(srcDir)) {
  if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
  const file = path.join(srcDir, name);
  const src = readFileSync(file, "utf8");
  originals.set(file, src);
  if (!src.startsWith("// @ts-nocheck")) writeFileSync(file, `// @ts-nocheck\n${src}`, "utf8");
}
function restore(){ for (const [file, src] of originals) writeFileSync(file, src, "utf8"); }
function run(label, command, args) {
  const r = spawnSync(command, args, { cwd: worker, encoding: "utf8", shell: process.platform === "win32" });
  console.log(`===== ${label} =====`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  return r.status ?? 1;
}
try {
  const ci = run("npm ci", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  if (ci !== 0) process.exitCode = ci;
  else {
    const typecheck = run("typecheck all-source-nocheck", "npm", ["run", "typecheck"]);
    if (typecheck !== 0) process.exitCode = typecheck;
    else console.log("WORKER_ALL_SOURCE_NOCHECK_PASS");
  }
} finally { restore(); }
