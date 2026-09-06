import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const probe = path.join(worker, "scripts", "temp-parse-group.mjs");
const files = ["accounting-canonical-read.ts","accounting-dispatch-control-canonical.ts","accounting-document-archive.ts","accounting-document-intelligence.ts","accounting-document-posting.ts","accounting-report-canonical.ts","admin-management-cloud.ts","admin-storage-cloud.ts","ai-cloud.ts","auth-cloud.ts","auth-policy-cloud.ts","e-belge-center-cloud.ts","e-belge-line-tools.ts","e-belge-product-store.ts","e-belge-ubl.ts","file-hub-cloud-oauth.ts"];

function run(command, args) {
  const r = spawnSync(command, args, { cwd: worker, encoding: "utf8", env: process.env, shell: process.platform === "win32", stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}

run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
writeFileSync(probe, `
import ts from "typescript";
import { readFileSync } from "node:fs";
import path from "node:path";
const files = ${JSON.stringify(files)};
let errors = 0;
for (const name of files) {
  const file = path.join(process.cwd(), "src", name);
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  errors += sf.parseDiagnostics?.length || 0;
}
if (errors) process.exit(2);
console.log("WORKER_PARSE_GROUP_A_PASS");
`);
try { run("node", ["scripts/temp-parse-group.mjs"]); }
finally { rmSync(probe, { force: true }); }
