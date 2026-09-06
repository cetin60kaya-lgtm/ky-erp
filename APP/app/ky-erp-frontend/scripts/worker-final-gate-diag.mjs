import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const worker=path.resolve(here,"../../../cloud/ky-erp-api");

function run(command,args){
  const r=spawnSync(command,args,{cwd:worker,encoding:"utf8",env:process.env,shell:process.platform==="win32",stdio:"inherit"});
  if(r.error)throw r.error;
  if(r.status!==0)process.exit(r.status||1);
}

run("npm",["ci","--ignore-scripts","--no-audit","--no-fund"]);
run("npm",["run","typecheck"]);
console.log("WORKER_TYPECHECK_ONLY_PASS");
