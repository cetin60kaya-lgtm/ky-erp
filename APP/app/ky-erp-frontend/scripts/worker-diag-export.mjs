import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const worker=path.resolve(here,"../../../cloud/ky-erp-api");
const tests=["accounting-canonical-read.test.ts","accounting-dispatch-control-canonical.test.ts","accounting-document-intelligence-kind.test.ts","accounting-quick-ui-contract.test.ts","accounting-report-canonical.test.ts","admin-governance-v2-contract.test.ts","ai-gateway-contract.test.ts","e-belge-product-routing.test.ts","e-belge-provider-ingest.test.ts","file-hub-cloud-oauth-contract.test.ts","ik-payroll-print-contract.test.ts","ik-pdks-final-separation-contract.test.ts","mail-communication-core.test.ts","mail-google-gmail.test.ts","main-source-syntax-contract.test.ts","pdks-device-center-contract.test.ts","runtime-migration-0046.test.ts","runtime-migration-0050.test.ts","super-admin-recovery-final-contract.test.ts"];
function run(command,args){const r=spawnSync(command,args,{cwd:worker,encoding:"utf8",env:process.env,shell:process.platform==="win32",stdio:"inherit"});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
run("npm",["ci","--ignore-scripts","--no-audit","--no-fund"]);
run("npm",["run","typecheck"]);
run("node",["--experimental-strip-types","--test",...tests.map((x)=>"src/"+x)]);
console.log("WORKER_CHANGED_TESTS_PASS");
