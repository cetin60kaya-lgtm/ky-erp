import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const pub = path.resolve(here, "../public");
mkdirSync(pub, { recursive: true });

function run(label, command, args, timeout = 180000) {
  const r = spawnSync(command, args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    timeout,
    maxBuffer: 12 * 1024 * 1024,
  });
  return [
    "===== " + label + " =====",
    "status=" + String(r.status),
    "signal=" + String(r.signal ?? ""),
    "error=" + String(r.error?.message || ""),
    "--- stdout ---",
    r.stdout || "",
    "--- stderr ---",
    r.stderr || "",
  ].join("\n");
}

const sections = [];
sections.push(run("npm ci", "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], 180000));
sections.push(run("typecheck", "npm", ["run", "typecheck"], 180000));
sections.push(run("unit", "npm", ["run", "test:unit"], 180000));

const text = sections.join("\n\n")
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
  .replace(/(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]");
writeFileSync(path.join(pub, "worker-diag.txt"), text, "utf8");
console.log("WORKER_UNIT_DIAG_EXPORTED");
