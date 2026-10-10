#!/usr/bin/env node
/**
 * Read-only terminal fleet LAN observer.
 * Deliberately does NOT claim to read FP_CLOCK punches: actual FP_CLOCK.ocx
 * COM API and approved x86 read-only adapter must be verified separately.
 * Status UI binds loopback only and exposes no person/card details.
 */
import {readFile} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {createServer} from "node:http";
import {inspectImportedLegacyProfiles} from "./legacy-hedef-terminal-profile.mjs";
import {legacyTerminalDefinition,createTerminalFleet} from "./terminal-fleet.mjs";
import {createFpClockAdapter} from "./fp-clock-adapter.mjs";
import {listWindowsCardPrinters} from "./printer-health.mjs";
import {readLegacyAgentSnapshot} from "./legacy-agent-snapshot.mjs";
const args=process.argv.slice(2);
const fail=message=>{throw Error(message)};
if(args.length!==3||args[0]!=="--profiles"||
   !isAbsolute(args[1])||!["--once","--watch"].includes(args[2]))
  fail("USAGE: node terminal-fleet-cli.mjs --profiles ABSOLUTE_JSON_PATH --once|--watch");
const companyId=process.env.KY_PDKS_COMPANY_ID||"";
if(!/^[a-zA-Z0-9._:-]{3,100}$/.test(companyId))
  fail("KY_PDKS_COMPANY_ID_REQUIRED");
const file=await readFile(args[1],"utf8");
if(Buffer.byteLength(file)>65536)fail("LEGACY_PROFILE_SOURCE_TOO_LARGE");
const parsed=JSON.parse(file);
const imported=inspectImportedLegacyProfiles(Array.isArray(parsed)?parsed:parsed?.profiles);
if(!imported.length)fail("LEGACY_PROFILES_EMPTY");
const definitions=imported.map(p=>legacyTerminalDefinition(p,companyId));
const allowed=new Set((process.env.KY_PDKS_FP_CLOCK_APPROVED_IDS||"")
  .split(",").map(x=>x.trim()).filter(Boolean));
const readEnabled=process.env.KY_PDKS_FP_CLOCK_ENABLE_READ==="1";
if(readEnabled&&(!allowed.size||[...allowed].some(id=>
  !definitions.some(d=>d.terminalId===id))))
  fail("FP_CLOCK_APPROVED_TERMINAL_IDS_REQUIRED");
const profileById=new Map(imported.map(p=>["HEDEF-"+p.profileName,p]));
const fleet=createTerminalFleet({definitions,intervalMs:3000,
  approvedAdapterIds:readEnabled?[...allowed]:[],
  adapterFactory:readEnabled?async definition=>createFpClockAdapter(
    profileById.get(definition.terminalId),{
      companyId,terminalId:definition.terminalId,
      executable:process.env.KY_PDKS_FP_CLOCK_READER_EXE,
      approvedSha256:process.env.KY_PDKS_FP_CLOCK_READER_SHA256,
      enabled:true,
    }):null,
});
if(args[2]==="--once"){
  try{console.log(JSON.stringify(await fleet.pollOnce(),null,2));}
  finally{await fleet.stop();}
}else{
  const port=5206;
  const html=String.raw`<!doctype html><html lang="tr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KY PDKS · Çoklu Cihaz İzleme</title><style>
body{font:15px system-ui;background:#f5f7fb;color:#162d3f;max-width:860px;margin:25px auto;padding:12px}
article{background:white;margin:12px 0;padding:16px;border:1px solid #ccd4df;border-radius:8px}
strong{display:block;margin-bottom:8px}small{color:#5c6775}pre{white-space:pre-wrap}
</style></head><body><h2>KY PDKS · Terminal Bağlantı İzleme</h2>
<p>Gerçek FP_CLOCK kart okuması yalnız sürüm/hash ve terminal açıkça onaylanmışsa etkinleşir.
  Diğer cihazlarda yalnız ağ erişimi izlenir. FDB/TNF mutabakatı yapılmaz.</p><main id="rows" role="status">Kontrol ediliyor…</main>
<script>
async function refresh(){
 try{
  const response=await fetch("/status",{cache:"no-store"});
  if(!response.ok)throw Error("Yerel ajan yanıt vermedi");
  const statuses=await response.json();
  const host=document.getElementById("rows");host.replaceChildren();
  for(const s of statuses){
   const box=document.createElement("article");
   const h=document.createElement("strong");h.textContent=s.terminalId;
   const state=document.createElement("div");state.textContent="Durum: "+s.status;
   const t=document.createElement("small");
   t.textContent="Son ağ erişimi: "+(s.lastContactAt||"—")+
     " | Son kart: "+(s.lastPunchAt||"—")+
     " | Okunan: "+s.accepted+" | Mükerrer: "+s.duplicates+
     " | Cihaz kayıt sayısı: "+(s.deviceLogCount??"bilinmiyor")+
     " | Son hata: "+(s.lastError||"—")+
     " | Tekrar deneme: "+(s.nextAttemptAt?new Date(s.nextAttemptAt).toLocaleTimeString():"—");
   const history=document.createElement("small");
   history.textContent="Hatalar: "+s.errorHistory.map(e=>e.code+" "+e.at).join(" • ");
   box.append(h,state,t,document.createElement("hr"),history);host.append(box);
  }
 }catch(error){document.getElementById("rows").textContent="Bağlantı kesildi: "+error.message;}
}
refresh();setInterval(refresh,3000);
</script></body></html>`;
  const allowedOrigins=new Set(["https://kyerp.net","https://app.kyerp.net",
    "http://127.0.0.1:5173","http://localhost:5173"]);
  let printerCache=null,printerAt=0;
  const server=createServer((request,response)=>{
    const reject=(code,body)=>{response.writeHead(code,{"content-type":"text/plain; charset=utf-8",
      "cache-control":"no-store","x-content-type-options":"nosniff"});response.end(body);};
    const origin=request.headers.origin||"";
    if(request.method!=="GET"||request.headers.host!=="127.0.0.1:"+port||
       (origin&&origin!=="http://127.0.0.1:"+port&&!allowedOrigins.has(origin)))
      return reject(403,"LOCAL_ONLY");
    const cors=allowedOrigins.has(origin)?{"access-control-allow-origin":origin,
       "vary":"Origin"}:{};
    if(request.url==="/status"){
      response.writeHead(200,{"content-type":"application/json; charset=utf-8",
        "cache-control":"no-store","x-content-type-options":"nosniff",...cors});
      return response.end(JSON.stringify(fleet.status()));
    }
    if(request.url==="/legacy-agent"){
      const dbPath=process.env.KY_PDKS_LEGACY_AGENT_DB_PATH||
        (process.platform==="win32"?"C:\\ProgramData\\KY ERP\\PDKS\\Data\\pdks.db":"");
      response.writeHead(200,{"content-type":"application/json; charset=utf-8",
        "cache-control":"no-store","x-content-type-options":"nosniff",...cors});
      return response.end(JSON.stringify(readLegacyAgentSnapshot(dbPath)));
    }
    if(request.url==="/qr-health"){
      void fetch("http://127.0.0.1:5197/health",{
        signal:AbortSignal.timeout(1000),redirect:"error"
      }).then(async r=>r.ok?await r.json():null).then(info=>{
        const alive=info?.ok===true&&info?.productionSourceCertified===false;
        response.writeHead(200,{"content-type":"application/json; charset=utf-8",
          "cache-control":"no-store","x-content-type-options":"nosniff",...cors});
        response.end(JSON.stringify({status:alive?"QR_KIOSK_HEALTH_RESPONDS_UNCERTIFIED":
          "QR_KIOSK_OFFLINE",terminalId:alive?String(info.terminalId).slice(0,64):null,
          physicalDeviceCertified:false,firebirdReconciled:false,tnfReconciled:false}));
      }).catch(()=>{
        response.writeHead(200,{"content-type":"application/json; charset=utf-8",
          "cache-control":"no-store","x-content-type-options":"nosniff",...cors});
        response.end(JSON.stringify({status:"QR_KIOSK_OFFLINE",terminalId:null,
          physicalDeviceCertified:false,firebirdReconciled:false,tnfReconciled:false}));
      });
      return;
    }
    if(request.url==="/printers"){
      const send=result=>{
        response.writeHead(200,{"content-type":"application/json; charset=utf-8",
          "cache-control":"no-store","x-content-type-options":"nosniff",...cors});
        response.end(JSON.stringify(result));
      };
      if(printerCache&&Date.now()-printerAt<20000)return send(printerCache);
      void listWindowsCardPrinters().catch(()=>({
        available:false,status:"PRINTER_DISCOVERY_UNAVAILABLE",printers:[],
      })).then(result=>{printerCache=result;printerAt=Date.now();send(result);});
      return;
    }
    if(request.url==="/"){
      response.writeHead(200,{"content-type":"text/html; charset=utf-8",
        "cache-control":"no-store","x-frame-options":"DENY",
        "content-security-policy":"default-src 'self'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'","x-content-type-options":"nosniff"});
      return response.end(html);
    }
    reject(404,"NOT_FOUND");
  });
  await new Promise((resolve,reject)=>server.once("error",reject).listen(port,"127.0.0.1",resolve));
  await fleet.start();
  console.log("KY_PDKS_FLEET_OBSERVER http://127.0.0.1:"+port+"/");
  console.log(readEnabled?"MODE=ALLOWLISTED_FP_CLOCK_READ_ONLY_NO_FDB_TNF_WRITES":
    "MODE=NETWORK_ONLY_FP_CLOCK_RAW_UNVERIFIED_NO_FDB_TNF_WRITES");
  const close=()=>server.close(()=>{void fleet.stop().then(()=>process.exit(0));});
  process.on("SIGINT",close);process.on("SIGTERM",close);
}
