import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const worker=path.resolve(here,"../../../cloud/ky-erp-api");
const tests=["accounting-canonical-read.test.ts","accounting-dispatch-control-canonical.test.ts","accounting-document-core.test.ts","accounting-document-intelligence-kind.test.ts","accounting-document-readiness.test.ts","accounting-quick-ui-contract.test.ts","accounting-report-canonical.test.ts","admin-email-role-normalization.test.ts","admin-governance-v2-contract.test.ts","admin-management-contract.test.ts","admin-read-compat-contract.test.ts","admin-route-precedence-contract.test.ts","admin-user-center-v2-contract.test.ts","ai-gateway-contract.test.ts","auth-owner-recovery-policy.test.ts","auth-owner-session-policy.test.ts","auth-same-browser-contract.test.ts","auth-session-refresh.test.ts","auth-transport.test.ts","browser-origin-contract.test.ts","company-billing-pdks-contract.test.ts","d1-schema-readiness-contract.test.ts","denetim-pdks-contract.test.ts","e-belge-match-engine.test.ts","e-belge-product-routing.test.ts","e-belge-provider-ingest.test.ts","file-hub-cloud-oauth-contract.test.ts","file-hub-contract.test.ts","file-hub-release-contract.test.ts"];
function run(command,args){const r=spawnSync(command,args,{cwd:worker,encoding:"utf8",env:process.env,shell:process.platform==="win32",stdio:"inherit"});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
run("npm",["ci","--ignore-scripts","--no-audit","--no-fund"]);
run("node",["--experimental-strip-types","--test",...tests.map(x=>"src/"+x)]);
console.log("WORKER_UNIT_HALF_A_PASS");
