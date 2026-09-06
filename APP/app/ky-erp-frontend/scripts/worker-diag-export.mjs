import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const worker=path.resolve(here,"../../../cloud/ky-erp-api");
const tests=["pdks-device-center-contract.test.ts","runtime-migration-0046.test.ts","runtime-migration-0050.test.ts","super-admin-recovery-final-contract.test.ts"];
function run(command,args){const r=spawnSync(command,args,{cwd:worker,encoding:"utf8",env:process.env,shell:process.platform==="win32",stdio:"inherit"});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
run("npm",["ci","--ignore-scripts","--no-audit","--no-fund"]);
run("npm",["run","typecheck"]);
run("node",["--experimental-strip-types","--test",...tests.map((x)=>"src/"+x)]);
console.log("WORKER_CHANGED_TESTS_B2_PASS");
