import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const probe = path.join(worker, "scripts", "temp-parse-all.mjs");

function run(command, args) {
  const r = spawnSync(command, args, { cwd: worker, encoding: "utf8", env: process.env, shell: process.platform === "win32", stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}

run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
writeFileSync(probe, `
import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const cwd = process.cwd();
const files = [
  ...readdirSync(path.join(cwd, "src")).filter((n) => n.endsWith(".ts")).map((n) => path.join(cwd, "src", n)),
  path.join(cwd, "worker-configuration.d.ts"),
];
let errors = 0;
for (const file of files) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  errors += sf.parseDiagnostics?.length || 0;
}
if (errors) process.exit(2);
console.log("WORKER_PARSE_ALL_PASS");
`);
try { run("node", ["scripts/temp-parse-all.mjs"]); }
finally { rmSync(probe, { force: true }); }
