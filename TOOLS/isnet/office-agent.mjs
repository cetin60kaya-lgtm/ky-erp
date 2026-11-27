// Existing KYERP İşNet tools: outbound-only heartbeat for authorized office PCs.
// No inbound port, SOAP document call, document write, browser credential or remote commands.
// Secrets supplied by the approved Windows service account, not by command line or repo.
import {randomUUID} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {probeLiveWsdl,LIVE_NOT_BEFORE} from "./live-wsdl-probe.mjs";
const url="https://api.kyerp.net/api/isnet/office/heartbeat";
const tenant=process.env.KYERP_ISNET_TENANT||"",deviceId=process.env.KYERP_ISNET_DEVICE_ID||"",key=process.env.KYERP_ISNET_DEVICE_KEY||"";
if(!/^[A-Za-z0-9_-]{1,100}$/.test(tenant)||!/^[A-Za-z0-9_-]{1,100}$/.test(deviceId)||!/^[A-Za-z0-9_-]{43}$/.test(key)){console.error("OFFICE_AGENT_NOT_CONFIGURED");process.exit(2)}
const instanceId=randomUUID();
let last="",delay=30000,stop=false,probe=null,lastProbe=0,authorized=false;
for(const sig of ["SIGINT","SIGTERM"])process.on(sig,()=>{stop=true});
while(!stop){
 let state="OFFLINE";
 try{
  if(authorized&&Date.now()>=LIVE_NOT_BEFORE&&Date.now()-lastProbe>=10*60*1000){probe=await probeLiveWsdl();lastProbe=Date.now()}
  const r=await fetch(url,{method:"POST",body:JSON.stringify({liveProbe:probe&&Date.now()-probe.checkedAt<14*60*1000?probe:null}),headers:{"Content-Type":"application/json","X-KYERP-Tenant-Slug":tenant,"X-KYERP-Agent-Id":deviceId,"X-KYERP-Office-Instance":instanceId,"X-KYERP-Agent-Token":key},redirect:"error",signal:AbortSignal.timeout(10000)});
  if(r.ok){
   const v=await r.json();
   if(v?.ok===true&&["LEADER","STANDBY"].includes(v.data?.role)&&v.data.sendEnabled===false&&v.data.providerAuthorized===false){state=v.data.role;delay=30000;authorized=true}
   else {authorized=false;state="PROTOCOL_REVIEW_REQUIRED";delay=60000}
  }else{authorized=false;state=r.status===401||r.status===403?"AUTH_OR_IP_DENIED":"NOT_READY";delay=Math.min(120000,delay*2)}
 }catch{authorized=false;delay=Math.min(120000,delay*2)}
 if(state!==last){console.log(new Date().toISOString()+" "+state+" SEND_DISABLED");last=state}
 if(!stop)await sleep(delay);
}
