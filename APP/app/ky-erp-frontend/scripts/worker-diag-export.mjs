import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const pub = path.resolve(here, "../public");
mkdirSync(pub, { recursive: true });

const sections = [];
function run(label, command, args) {
  const r = spawnSync(command, args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });
  sections.push([
    "===== " + label + " =====",
    "status=" + String(r.status),
    "signal=" + String(r.signal ?? ""),
    "--- stdout ---",
    r.stdout || "",
    "--- stderr ---",
    r.stderr || "",
  ].join("\n"));
  return r.status ?? 1;
}

run("npm ci", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
run("typecheck", "npm", ["run", "typecheck"]);
run("test", "npm", ["test"]);

writeFileSync(path.join(pub, "worker-diag.txt"), sections.join("\n\n"), "utf8");
console.log("WORKER_DIAG_EXPORTED");
