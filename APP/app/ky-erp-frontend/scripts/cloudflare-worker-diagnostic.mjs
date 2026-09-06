import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");

const result = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: worker,
  encoding: "utf8",
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error("WORKER_NPM_CI_FAIL");
  process.exit(result.status || 1);
}

console.log("WORKER_NPM_CI_PASS");
