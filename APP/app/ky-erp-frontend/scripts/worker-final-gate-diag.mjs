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
    .filter((line) => /error TS\d+|\.ts\(\d+,\d+\)|not ok\b|ERR_[A-Z0-9_]+|SyntaxError|TypeError|ReferenceError/i.test(line))
    .filter((line) => !/token|secret|password|authorization|cookie|api[_-]?key/i.test(line))
    .slice(0, 240);
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  mode: "exact-worker-typecheck-capture",
  stages: {},
  testFiles: readdirSync(path.join(worker, "src")).filter((name) => name.endsWith(".test.ts")).sort(),
};

const ci = run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
report.stages.npmCi = { ok: ci.ok, status: ci.status, lines: safeLines(ci.stderr + "\n" + ci.stdout) };

if (ci.ok) {
  const result = run("npm", ["run", "typecheck", "--", "--pretty", "false"]);
  report.stages.typecheck = {
    ok: result.ok,
    status: result.status,
    lines: safeLines(result.stderr + "\n" + result.stdout),
  };
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(resultPath, JSON.stringify(report, null, 2) + "\n", "utf8");
const typecheckOk = report.stages.typecheck?.ok === true;
console.log(`WORKER_TYPECHECK_PR_GATE=${typecheckOk ? "PASS" : "FAIL"}`);
if (!typecheckOk) process.exitCode = 1;
