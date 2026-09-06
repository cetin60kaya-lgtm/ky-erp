import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const r = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: worker,
  encoding: "utf8",
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit"
});
if (r.error) throw r.error;
if (r.status !== 0) process.exit(r.status || 1);
console.log("WORKER_NPM_CI_PASS");
