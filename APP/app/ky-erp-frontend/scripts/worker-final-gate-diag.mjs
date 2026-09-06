import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const publicDir = path.resolve(here, "../public");
const resultPath = path.join(publicDir, "worker-final-gate.json");

function run(command, args) {
  const r = spawnSync(command, args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    ok: !r.error && r.status === 0,
    status: r.status,
    stdout: String(r.stdout || ""),
    stderr: String(r.stderr || ""),
    error: r.error ? String(r.error.message || r.error) : "",
  };
}

function lines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /not ok\b|ERR_[A-Z0-9_]+|error TS\d+|failed|failure|error|\.test\.ts/i.test(line))
    .filter((line) => !/token|secret|password|authorization|cookie/i.test(line))
    .slice(0, 120);
}

const report = {
  generatedAt: new Date().toISOString(),
  stages: {},
  testFiles: readdirSync(path.join(worker, "src")).filter((name) => name.endsWith(".test.ts")).sort(),
};

const ci = run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
report.stages.npmCi = { ok: ci.ok, status: ci.status, lines: lines(ci.stderr + "\n" + ci.stdout) };

if (ci.ok) {
  for (const [key, args] of [
    ["typecheck", ["run", "typecheck"]],
    ["unit", ["run", "test:unit"]],
    ["authIntegration", ["run", "test:auth:integration"]],
    ["workerBuild", ["run", "build"]],
  ]) {
    const r = run("npm", args);
    report.stages[key] = { ok: r.ok, status: r.status, lines: lines(r.stderr + "\n" + r.stdout) };
  }
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(resultPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("WORKER_FINAL_STAGE_DIAGNOSTIC_WRITTEN");
