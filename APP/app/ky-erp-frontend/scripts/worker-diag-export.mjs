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
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sf.parseDiagnostics?.length) {
    errors += sf.parseDiagnostics.length;
    console.error("PARSE_ERROR_FILE=" + file);
    for (const d of sf.parseDiagnostics) console.error(ts.flattenDiagnosticMessageText(d.messageText, "\\n"));
  }
}
if (errors) process.exit(2);
console.log("WORKER_PARSE_ALL_PASS");
`);
try {
  run("node", ["scripts/temp-parse-all.mjs"]);
} finally {
  rmSync(probe, { force: true });
}
