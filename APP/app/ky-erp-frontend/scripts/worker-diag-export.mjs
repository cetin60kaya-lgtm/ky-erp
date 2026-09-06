import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const probe = path.join(worker, "ts-probe.ts");
const config = path.join(worker, "tsconfig.probe.json");

function run(command, args) {
  const r = spawnSync(command, args, { cwd: worker, encoding: "utf8", env: process.env, shell: process.platform === "win32", stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}

run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
writeFileSync(probe, "const probeValue: number = 1; export {};\n");
writeFileSync(config, JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    lib: ["ES2022", "WebWorker"],
    types: ["node"],
    strict: true,
    noEmit: true,
    skipLibCheck: true
  },
  files: ["worker-configuration.d.ts", "src/cloudflare-ai-env.d.ts", "ts-probe.ts"]
}, null, 2));
try {
  run("npx", ["tsc", "-p", "tsconfig.probe.json", "--pretty", "false"]);
  console.log("WORKER_DECLARATION_AI_PROBE_PASS");
} finally {
  rmSync(probe, { force: true });
  rmSync(config, { force: true });
}
