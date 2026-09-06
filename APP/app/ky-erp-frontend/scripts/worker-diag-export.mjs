import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");
const r = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: worker,
  encoding: "utf8",
  shell: process.platform === "win32"
});
console.log("===== WORKER NPM CI =====");
if (r.stdout) console.log(r.stdout);
if (r.stderr) console.error(r.stderr);
if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
console.log("WORKER_NPM_CI_PASS");
