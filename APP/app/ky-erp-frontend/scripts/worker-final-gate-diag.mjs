import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const publicDir = path.resolve(here, "../public");
const resultPath = path.join(publicDir, "worker-final-gate.json");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: worker,
    encoding: "utf8",
    env: { ...process.env, CI: "true", NO_COLOR: "1" },
    shell: process.platform === "win32",
    maxBuffer: 24 * 1024 * 1024,
    timeout: 240_000,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error ? String(result.error.message || result.error) : "",
  };
}

function safeLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /not ok\b|ERR_[A-Z0-9_]+|error TS\d+|failed|failure|error|assert|\.test\.ts|npm ERR|wrangler|SyntaxError|TypeError|ReferenceError/i.test(line))
    .filter((line) => !/token|secret|password|authorization|cookie|api[_-]?key/i.test(line))
    .slice(0, 180);
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  stages: {},
  testFiles: readdirSync(path.join(worker, "src")).filter((name) => name.endsWith(".test.ts")).sort(),
};

const ci = run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
report.stages.npmCi = { ok: ci.ok, status: ci.status, lines: safeLines(ci.stderr + "\n" + ci.stdout) };

if (ci.ok) {
  for (const [key, args] of [
    ["typecheck", ["run", "typecheck"]],
    ["unit", ["run", "test:unit"]],
    ["authIntegration", ["run", "test:auth:integration"]],
    ["workerBuild", ["run", "build"]],
  ]) {
    const result = run("npm", args);
    report.stages[key] = {
      ok: result.ok,
      status: result.status,
      lines: safeLines(result.stderr + "\n" + result.stdout),
    };
  }
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(resultPath, JSON.stringify(report, null, 2) + "\n", "utf8");
const failedStages = Object.entries(report.stages).filter(([, stage]) => !stage.ok).map(([name]) => name);
console.log(`WORKER_FINAL_GATE_RESULT=${failedStages.length ? `FAIL:${failedStages.join(",")}` : "PASS"}`);
if (failedStages.length) process.exitCode = 1;
