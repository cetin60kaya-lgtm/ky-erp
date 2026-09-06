import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");

function run(label, command, args) {
  const r = spawnSync(command, args, { cwd: worker, encoding: "utf8", shell: process.platform === "win32" });
  console.log(`===== ${label} =====`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  return r.status ?? 1;
}

const ci = run("npm ci", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
if (ci !== 0) process.exit(ci);
const typecheck = run("typecheck", "npm", ["run", "typecheck"]);
if (typecheck !== 0) process.exit(typecheck);
console.log("WORKER_TYPECHECK_GATE_PASS");
