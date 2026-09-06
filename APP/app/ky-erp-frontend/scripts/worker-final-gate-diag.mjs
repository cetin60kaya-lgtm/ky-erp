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
    maxBuffer: 12 * 1024 * 1024,
  });
  return {
    ok: !r.error && r.status === 0,
    status: r.status,
    stdout: String(r.stdout || ""),
    stderr: String(r.stderr || ""),
    error: r.error ? String(r.error.message || r.error) : "",
  };
}

function diagnosticLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /not ok\b/i.test(line) ||
      /error TS\d+/i.test(line) ||
      /ERR_[A-Z0-9_]+/.test(line) ||
      /\.test\.ts(?::\d+)?/.test(line) ||
      /\b(fail|failed|failure|error)\b/i.test(line)
    )
    .filter((line) => !/token|secret|password|authorization|cookie/i.test(line))
    .slice(0, 80);
}

const report = {
  generatedAt: new Date().toISOString(),
  source: "temporary-build-diagnostic",
  stages: {},
  testFiles: readdirSync(path.join(worker, "src"))
    .filter((name) => name.endsWith(".test.ts"))
    .sort(),
};

const ci = run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
report.stages.npmCi = { ok: ci.ok, status: ci.status, lines: diagnosticLines(ci.stderr + "\n" + ci.stdout) };

if (ci.ok) {
  const typecheck = run("npm", ["run", "typecheck"]);
  report.stages.typecheck = { ok: typecheck.ok, status: typecheck.status, lines: diagnosticLines(typecheck.stderr + "\n" + typecheck.stdout) };

  const unit = run("npm", ["run", "test:unit"]);
  report.stages.unit = { ok: unit.ok, status: unit.status, lines: diagnosticLines(unit.stderr + "\n" + unit.stdout) };

  const auth = run("npm", ["run", "test:auth:integration"]);
  report.stages.authIntegration = { ok: auth.ok, status: auth.status, lines: diagnosticLines(auth.stderr + "\n" + auth.stdout) };

  const build = run("npm", ["run", "build"]);
  report.stages.workerBuild = { ok: build.ok, status: build.status, lines: diagnosticLines(build.stderr + "\n" + build.stdout) };
}

mkdirSync(publicDir, { recursive: true });
writeFileSync(resultPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("WORKER_FINAL_GATE_DIAGNOSTIC_WRITTEN");
