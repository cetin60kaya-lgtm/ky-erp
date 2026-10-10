/**
 * Read-only multi-terminal coordinator for the existing KY PDKS gateway.
 *
 * Every real adapter is supplied by the trusted Windows process and MUST be
 * allowlisted independently of editable terminal JSON. Network reachability
 * never certifies a driver or a physical card punch.
 */
import {validateTerminalDefinition} from "./terminal-profiles.mjs";
import {normalizeDeviceEvidence,ensureCertifiedAdapter} from "./device-contract.mjs";
import {probeTerminalConnection} from "./terminal-network-probe.mjs";

const limited=(value,min,max,name)=>{
  if(!Number.isInteger(value)||value<min||value>max)throw Error(name);
  return value;
};
const message=(error)=>String(error?.code||"DEVICE_READ_FAILED").slice(0,80);
export function legacyTerminalDefinition(profile,companyId){
  const id=String(profile?.profileName??"").trim();
  if(!/^[A-Za-z0-9._-]{3,64}$/.test(id)||
     !Number.isInteger(Number(profile?.machineId))||
     !["FP_CLOCK_ACTIVE_X86",undefined].includes(profile?.adapter))
    throw Error("LEGACY_PROFILE_UNVERIFIED");
  return validateTerminalDefinition({
    terminalId:"HEDEF-"+id,companyId,vendor:"Generic",
    model:"Hedef FP_CLOCK x86 (model unverified)",
    connectorId:"HEDEF_FP_CLOCK",host:profile.ip,port:profile.port,
    timezone:"Europe/Istanbul",inputMethods:["RFID_125KHZ"],
    directionMode:profile.direction==="IN"?"EXPLICIT_IN":
      profile.direction==="OUT"?"EXPLICIT_OUT":"UNKNOWN",
    approvalState:"DRAFT",
  });
}
export function createTerminalFleet({
  definitions,probe=probeTerminalConnection,adapterFactory=null,
  approvedAdapterIds=[],now=()=>Date.now(),intervalMs=3000,
  maxEvents=500,maxBatch=200,onEvidence=()=>{},
}={}){
  if(!Array.isArray(definitions)||!definitions.length||definitions.length>32)
    throw Error("TERMINAL_FLEET_SIZE_INVALID");
  limited(intervalMs,250,60000,"TERMINAL_POLL_INTERVAL_INVALID");
  limited(maxEvents,1,10000,"TERMINAL_EVENT_LIMIT_INVALID");
  limited(maxBatch,1,1000,"TERMINAL_BATCH_LIMIT_INVALID");
  if(typeof probe!=="function"||typeof onEvidence!=="function"||
     (adapterFactory!==null&&typeof adapterFactory!=="function"))
    throw Error("TERMINAL_FLEET_CALLBACK_INVALID");
  const approved=new Set(approvedAdapterIds);
  const ids=new Set(),locations=new Set(),states=[];
  for(const definition of definitions){
    const d=validateTerminalDefinition(definition);
    if(ids.has(d.terminalId))throw Error("TERMINAL_DUPLICATE_ID");
    // Same LAN endpoint with different identities must be inspected manually.
    if(d.port&&locations.has(d.host+":"+d.port))throw Error("TERMINAL_DUPLICATE_ENDPOINT");
    ids.add(d.terminalId);
    if(d.port)locations.add(d.host+":"+d.port);
    states.push({definition:d,adapter:null,status:"NOT_TESTED",
      failures:0,nextAttemptAt:0,lastReadAt:null,lastContactAt:null,
      accepted:0,duplicates:0,rejected:0,lastError:null,busy:false});
  }
  const events=[],seen=new Set();
  let timer=null,stopped=false;
  const forgetAdapter=async(state)=>{
    const adapter=state.adapter;state.adapter=null;
    if(adapter&&typeof adapter.close==="function"){
      try{await adapter.close();}catch{/* do not block other devices */}
    }
  };
  const status=()=>Object.freeze(states.map(s=>Object.freeze({
    terminalId:s.definition.terminalId,companyId:s.definition.companyId,
    connectorId:s.definition.connectorId,status:s.status,
    lastContactAt:s.lastContactAt,lastReadAt:s.lastReadAt,
    nextAttemptAt:s.nextAttemptAt,failures:s.failures,
    accepted:s.accepted,duplicates:s.duplicates,rejected:s.rejected,
    lastError:s.lastError,canWriteTerminal:false,
    firebirdReconciled:false,tnfReconciled:false,cloudAcked:false,
  })));
  const processDevice=async(s)=>{
    if(stopped||s.busy||now()<s.nextAttemptAt)return;
    s.busy=true;
    try{
      const connectivity=await probe(s.definition);
      if(!connectivity?.connectionReachable){
        s.status=connectivity?.status||"OFFLINE";
        await forgetAdapter(s);
        throw Object.assign(Error("TERMINAL_NOT_REACHABLE"),{code:"TERMINAL_NOT_REACHABLE"});
      }
      s.lastContactAt=new Date(now()).toISOString();
      if(!adapterFactory||!approved.has(s.definition.terminalId)){
        s.status="NETWORK_REACHABLE_DRIVER_NOT_APPROVED";
        s.failures=0;s.nextAttemptAt=0;s.lastError=null;
        return;
      }
      if(!s.adapter){
        const adapter=await adapterFactory(s.definition);
        if(adapter?.id!==s.definition.terminalId)
          throw Object.assign(Error("TERMINAL_ADAPTER_ID_MISMATCH"),{code:"TERMINAL_ADAPTER_ID_MISMATCH"});
        ensureCertifiedAdapter(adapter);
        s.adapter=adapter;
      }
      if(await s.adapter.healthCheck()!==true)
        throw Object.assign(Error("TERMINAL_ADAPTER_HEALTH_FAILED"),{code:"TERMINAL_ADAPTER_HEALTH_FAILED"});
      const batch=await s.adapter.readRawBatch({maxRecords:maxBatch,deleteAfterRead:false});
      if(!Array.isArray(batch)||batch.length>maxBatch)
        throw Object.assign(Error("TERMINAL_BATCH_INVALID"),{code:"TERMINAL_BATCH_INVALID"});
      // Validate the complete batch BEFORE accepting any record from it.
      const normalized=batch.map(normalizeDeviceEvidence);
      if(normalized.some(e=>e.deviceId!==s.definition.terminalId||
        e.companyId!==s.definition.companyId))
        throw Object.assign(Error("TERMINAL_TENANT_OR_DEVICE_MISMATCH"),
          {code:"TERMINAL_TENANT_OR_DEVICE_MISMATCH"});
      for(const e of normalized){
        if(seen.has(e.sourceKey)){s.duplicates++;continue;}
        // An external downstream consumer sees an immutable, validated event.
        // Callback errors do not erase the source event or trigger a device write.
        try{await onEvidence(e);}catch{
          s.rejected++;continue; // retry this event at next read
        }
        events.push(e);seen.add(e.sourceKey);s.accepted++;
        if(events.length>maxEvents){
          const old=events.shift();seen.delete(old.sourceKey);
        }
      }
      s.lastReadAt=new Date(now()).toISOString();
      s.status="LIVE_RAW_READ_UNRECONCILED";
      s.failures=0;s.nextAttemptAt=0;s.lastError=null;
    }catch(error){
      await forgetAdapter(s);
      s.failures++;
      s.nextAttemptAt=now()+Math.min(60000,1000*2**Math.min(s.failures-1,6));
      s.lastError=message(error); // no SDK exception text, token or person data
      s.status="OFFLINE_RETRY_SCHEDULED";
    }finally{s.busy=false;}
  };
  const pollOnce=async()=>{
    if(stopped)throw Error("TERMINAL_FLEET_STOPPED");
    await Promise.all(states.map(processDevice));
    return status();
  };
  return Object.freeze({
    pollOnce,status,
    // Sensitive card data is only returned by an explicit trusted caller.
    recentEvidence:({trusted=false}={})=>{
      if(trusted!==true)throw Error("TERMINAL_EVIDENCE_TRUST_REQUIRED");
      return Object.freeze([...events]);
    },
    start(){
      if(stopped||timer)throw Error("TERMINAL_FLEET_ALREADY_STARTED_OR_STOPPED");
      timer=setInterval(()=>{void pollOnce().catch(()=>{});},intervalMs);
      timer.unref?.();
      return pollOnce();
    },
    async stop(){
      if(stopped)return;
      stopped=true;if(timer)clearInterval(timer);timer=null;
      // Wait for in-progress reads without forcibly destroying an SDK call.
      for(let i=0;i<50&&states.some(s=>s.busy);i++)
        await new Promise(resolve=>setTimeout(resolve,20));
      await Promise.all(states.map(forgetAdapter));
    },
  });
}
