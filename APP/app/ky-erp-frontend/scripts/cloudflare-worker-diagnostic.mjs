import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.resolve(here, "../../../cloud/ky-erp-api");

function run(label, args) {
  const result = spawnSync("npm", args, {
    cwd: worker,
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error("WORKER_GATE_A_FAIL=" + label);
    process.exit(result.status || 1);
  }
}

run("npm-ci", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
run("typecheck", ["run", "typecheck"]);
run("unit", ["run", "test:unit"]);
console.log("WORKER_GATE_A_PASS=typecheck+unit");
