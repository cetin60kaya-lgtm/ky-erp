import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const publicDir = path.resolve(here, "../public");
mkdirSync(publicDir, { recursive: true });

function clean(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]")
    .replace(/[A-Za-z0-9_-]{48,}/g, "[REDACTED_LONG_VALUE]")
    .slice(-10000);
}

function run(name, args) {
  const result = spawnSync("npm", args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    name,
    status: result.status,
    signal: result.signal,
    stdout: clean(result.stdout),
    stderr: clean(result.stderr),
  };
}

const steps = [
  run("npm-ci", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]),
  run("typecheck", ["run", "typecheck"]),
  run("unit", ["run", "test:unit"]),
  run("auth-integration", ["run", "test:auth:integration"]),
  run("dry-run-build", ["run", "build"]),
];

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  ok: steps.every((x) => x.status === 0),
  steps,
};

writeFileSync(path.join(publicDir, "worker-diagnostic.json"), JSON.stringify(report, null, 2));
console.log("WORKER_DIAGNOSTIC_CAPTURED=" + (report.ok ? "PASS" : "FAIL"));
