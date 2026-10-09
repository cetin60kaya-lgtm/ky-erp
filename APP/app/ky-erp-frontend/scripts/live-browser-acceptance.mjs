#!/usr/bin/env node
// KY ERP canonical live smoke: real browser + real production URL, READ ONLY.
// Privileged account, MFA, device keys and D1 writes are intentionally excluded.
import {execFileSync} from "node:child_process";
import {existsSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const web=process.env.KYERP_LIVE_SITE||"https://kyerp.net";
const api=process.env.KYERP_LIVE_API||"https://api.kyerp.net";
const output=process.env.KYERP_ACCEPTANCE_DIR||join(process.cwd(),"live-acceptance-evidence");
mkdirSync(output,{recursive:true});
const proof={website:web,api,mode:"LIVE_ANONYMOUS_READ_ONLY",checks:[],startedAt:new Date().toISOString()};
function record(name,pass,detail=""){
  proof.checks.push({name,pass,detail});
  console.log((pass?"PASS":"FAIL")+" "+name+" "+detail);
}
async function checkApi(name,path,expected,valid){
  try {
    const result=await fetch(api+path,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(18000)});
    const json=await result.json().catch(()=>null);
    record(name,result.status===expected&&Boolean(valid(json)),"HTTP "+result.status);
  }catch(e){record(name,false,String(e?.message||e).slice(0,130));}
}
function chromePath(){
  if(process.env.CHROME_BIN&&existsSync(process.env.CHROME_BIN))return process.env.CHROME_BIN;
  for(const bin of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]){
    try{return execFileSync("which",[bin],{encoding:"utf8",timeout:2000}).trim();}
    catch{/* try next */}
  }
  return "";
}
function visibleWords(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]*>/g," ").replace(/\s+/g," ");
}
function browserCheck(chrome,name,path,required){
  const profile=mkdtempSync(join(tmpdir(),"kyerp-chrome-"));
  try {
    const raw=execFileSync(chrome,[
      "--headless=new","--disable-gpu","--no-sandbox","--no-first-run",
      "--disable-dev-shm-usage","--disable-extensions",
      "--window-size=1365,900","--virtual-time-budget=12000",
      "--user-data-dir="+profile,"--dump-dom",web+path
    ],{encoding:"utf8",timeout:50000,maxBuffer:14*1024*1024,stdio:["ignore","pipe","ignore"]});
    const txt=visibleWords(raw);
    const missing=required.filter(word=>!txt.includes(word));
    const pageFailure=txt.includes("KY ERP acilamadi")||txt.includes("KY ERP açılamadı");
    record("chrome:"+name,missing.length===0&&!pageFailure,
      missing.length?"missing "+missing.join(",") :pageFailure?"runtime failure":"rendered content verified");
    writeFileSync(join(output,name+".json"),JSON.stringify({url:web+path,required,missing,pageFailure,domLength:raw.length},null,2));
  }catch(e){record("chrome:"+name,false,String(e?.message||e).slice(0,180));}
  finally{rmSync(profile,{recursive:true,force:true});}
}
await checkApi("health","/api/health",200,x=>x?.ok===true&&x?.database==="d1");
await checkApi("personnel-company-select","/api/employee-portal/companies",200,x=>x?.ok===true&&Array.isArray(x.data)&&x.data.some(c=>c.slug==="kyerp-test"));
await checkApi("anonymous-personnel-denied","/api/employee-portal/account",401,x=>x?.ok===false);
const chrome=chromePath();
record("chromium-installed",Boolean(chrome),chrome||"Chrome executable not found");
if(chrome){
  browserCheck(chrome,"public-mobile-login","/mobile/login",["KY ERP Mobil","Personel Girişi"]);
  browserCheck(chrome,"public-personnel-login","/mobile/personel",["KY ERP Mobil","Personel Öz Servis","Firma seçiniz"]);
}
proof.finishedAt=new Date().toISOString();
proof.passed=proof.checks.every(r=>r.pass);
writeFileSync(join(output,"summary.json"),JSON.stringify(proof,null,2));
if(!proof.passed){console.error("LIVE CHROME SMOKE FAILED — deployment cannot be reported as fully validated");process.exitCode=1;}
else console.log("LIVE CHROME SMOKE PASSED: real production website, no auth bypass/no write.");
