import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const config = path.join(worker, "tsconfig.pr77-candidates-diag.json");

const targets = [
  "src/accounting-canonical-read.test.ts",
  "src/accounting-dispatch-control-canonical.test.ts",
  "src/accounting-document-intelligence-kind.test.ts",
  "src/accounting-report-canonical.test.ts",
  "src/e-belge-product-routing.test.ts",
  "src/e-belge-provider-ingest.test.ts",
  "src/file-hub-cloud-oauth-contract.test.ts",
  "src/e-belge-ubl.ts"
];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
writeFileSync(config, JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    allowImportingTsExtensions: true,
    lib: ["ES2022", "WebWorker"],
    types: ["node"],
    strict: true,
    noEmit: true,
    skipLibCheck: true
  },
  files: targets
}, null, 2));

try {
  run("npx", ["tsc", "-p", path.basename(config), "--pretty", "false"]);
  console.log("WORKER_PR77_CANDIDATES_PASS");
} finally {
  rmSync(config, { force: true });
}
