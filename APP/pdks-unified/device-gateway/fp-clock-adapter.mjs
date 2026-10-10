/**
 * Approved Windows-only FP_CLOCK x86 reader adapter for existing KY PDKS fleet.
 * Runs ONLY the dedicated read-only C# helper, never the old command bridge
 * whose executable includes settime/clearlogs/deleteuser actions.
 */
import {createHash} from "node:crypto";
import {readFile,stat} from "node:fs/promises";
import {spawn} from "node:child_process";
import {isIP} from "node:net";
import {isAbsolute,basename} from "node:path";
import {normalizeDeviceEvidence} from "./device-contract.mjs";

const str=v=>String(v??"").trim();
const forbidden=/[\x00-\x1f]/;
const cap=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const hash=s=>createHash("sha256").update(s).digest("hex");
const isPrivateIp=ip=>{
 if(isIP(ip)!==4)return false;
 const p=ip.split(".").map(Number);
 return p[0]===10||(p[0]===172&&p[1]>=16&&p[1]<=31)||
   (p[0]===192&&p[1]===168);
};

export function parseFpClockReadout(output,{companyId,terminalId,timezone="Europe/Istanbul"}){
  if(typeof output!=="string"||Buffer.byteLength(output)>1_500_000)
    throw Error("FP_CLOCK_OUTPUT_INVALID");
  const lines=output.trim().split(/\r?\n/);
  let status=null,ended=false,count=0;
  const events=[];
  for(const line of lines){
    if(forbidden.test(line))throw Error("FP_CLOCK_CONTROL_CHARS");
    const f=line.split("|");
    if(f[0]==="STATUS"){
      if(status||f.length!==6||f[1]!=="OK"||
         !f.slice(3).every(v=>/^-?\d{1,8}$/.test(v)))
        throw Error("FP_CLOCK_STATUS_INVALID");
      status={deviceTime:f[2]||null,deviceLogCount:Number(f[3]),
        registeredUsers:Number(f[4]),registeredCards:Number(f[5])};
    }else if(f[0]==="LOG"){
      if(ended||!status||f.length!==7||!/^\d{5}$/.test(f[1])||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(f[2])||
        !f.slice(3).every(v=>/^-?\d{1,6}$/.test(v)))
        throw Error("FP_CLOCK_LOG_INVALID");
      const [cardNo,localTimestamp,rawDirection,verify,rawEvent,deviceNo]=f.slice(1);
      const rawSha256=hash(line);
      const sourceRecordId=hash(JSON.stringify([cardNo,localTimestamp,rawDirection,
        verify,rawEvent,deviceNo]));
      events.push(normalizeDeviceEvidence({
        companyId,deviceId:terminalId,cardNo,sourceRecordId,
        localTimestamp,timezone,rawSha256,
      }));
      count++;
    }else if(f[0]==="END"){
      if(ended||f.length!==2||!cap(Number(f[1]),0,10000)||
         Number(f[1])!==count)throw Error("FP_CLOCK_END_MISMATCH");
      ended=true;
    }else if(line){
      throw Error("FP_CLOCK_OUTPUT_UNEXPECTED");
    }
  }
  if(!status)throw Error("FP_CLOCK_STATUS_MISSING");
  if(status.deviceTime&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(status.deviceTime))
    throw Error("FP_CLOCK_CLOCK_INVALID");
  if(events.length&& !ended)throw Error("FP_CLOCK_END_MISSING");
  return Object.freeze({status:Object.freeze(status),events:Object.freeze(events)});
}

export async function runFpClockProcess(executable,mode,profile,{
  spawnProcess=spawn,timeoutMs=12000,env=process.env,
}={}){
  if(process.platform!=="win32"&&spawnProcess===spawn)
    throw Error("FP_CLOCK_WINDOWS_ONLY");
  if(!isAbsolute(executable)||basename(executable).toLowerCase()!=="kypdks.fpclock.reader.exe")
    throw Error("FP_CLOCK_READER_PATH_INVALID");
  if(!["--status","--read"].includes(mode)||!isPrivateIp(profile.ip)||
     !cap(Number(profile.port),1,65535)||!cap(Number(profile.machineId),1,255))
    throw Error("FP_CLOCK_EXEC_ARGS_INVALID");
  if(!cap(timeoutMs,1000,60000))throw Error("FP_CLOCK_TIMEOUT_INVALID");
  return await new Promise((resolve,reject)=>{
    const child=spawnProcess(executable,
      [mode,profile.ip,String(profile.port),String(profile.machineId)],
      {shell:false,windowsHide:true,env:{...env}});
    let stdout="",stderr="",finished=false;
    const end=(error,code)=>{
      if(finished)return;
      finished=true;clearTimeout(timer);
      if(error||code!==0)return reject(Error("FP_CLOCK_PROCESS_FAILED"));
      if(stdout.length>1_500_000||stderr.length>8192)
        return reject(Error("FP_CLOCK_OUTPUT_TOO_LARGE"));
      resolve(stdout);
    };
    const timer=setTimeout(()=>{child.kill();end(Error("FP_CLOCK_PROCESS_TIMEOUT"));},timeoutMs);
    child.stdout?.on("data",chunk=>{
      stdout+=chunk.toString("utf8");
      if(stdout.length>1_500_000){child.kill();end(Error("FP_CLOCK_OUTPUT_TOO_LARGE"));}
    });
    child.stderr?.on("data",chunk=>{
      stderr+=chunk.toString("utf8");
      if(stderr.length>8192){child.kill();end(Error("FP_CLOCK_OUTPUT_TOO_LARGE"));}
    });
    child.on("error",e=>end(e));child.on("close",code=>end(null,code));
  });
}

/**
 * Both operator opt-in and binary hash are mandatory. Approval ID also
 * belongs in the fleet's independent approvedAdapterIds allowlist.
 */
export async function createFpClockAdapter(profile,{
  companyId,terminalId,executable,approvedSha256,enabled=false,
  run=runFpClockProcess,
}={}){
  if(enabled!==true)throw Error("FP_CLOCK_EXPLICIT_OPT_IN_REQUIRED");
  if(!isAbsolute(str(executable))||
     basename(executable).toLowerCase()!=="kypdks.fpclock.reader.exe"||
     !/^[0-9a-f]{64}$/i.test(str(approvedSha256)))
    throw Error("FP_CLOCK_READER_TRUST_CONFIG_REQUIRED");
  const fileInfo=await stat(executable);
  if(!fileInfo.isFile()||fileInfo.size>160_000_000)
    throw Error("FP_CLOCK_READER_INVALID_BINARY");
  const digest=hash(await readFile(executable));
  if(digest!==approvedSha256.toLowerCase())
    throw Error("FP_CLOCK_READER_HASH_MISMATCH");
  let buffer=null,deviceStatus=null;
  return Object.freeze({
    id:terminalId,certified:true,
    getCapabilities:()=>Object.freeze({readRaw:true,deleteDeviceLogs:false,
      writeDevice:false,writeFirebird:false,writeAnnualTnf:false}),
    getDeviceReport:()=>deviceStatus,
    async healthCheck(){
      const output=await run(executable,"--read",profile);
      const parsed=parseFpClockReadout(output,{companyId,terminalId});
      buffer=parsed.events;deviceStatus=parsed.status;
      return true;
    },
    async readRawBatch({maxRecords=200,deleteAfterRead=false}={}){
      if(deleteAfterRead)throw Error("FP_CLOCK_DELETE_FORBIDDEN");
      if(!buffer)throw Error("FP_CLOCK_READ_FIRST_REQUIRED");
      const batch=buffer;buffer=null;
      if(batch.length>maxRecords)throw Error("FP_CLOCK_BATCH_LIMIT_EXCEEDED");
      return batch;
    },
    async close(){buffer=null;},
  });
}
