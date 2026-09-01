#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const API=String(process.env.KYERP_API_URL||"https://api.kyerp.net").replace(/\/+$/,"");
const KEY=String(process.env.KYERP_AGENT_KEY||"").trim();
const COMPANY=String(process.env.KYERP_MAIN_COMPANY_SLUG||"mecit-hakan").trim();
const DEVICE=String(process.env.KYERP_DEVICE_NAME||os.hostname()).trim();
const CONFIG_PATH=process.env.KYERP_FILE_HUB_CONFIG||path.join(process.cwd(),"file-hub-agent.config.json");
const POLL_MS=Math.max(30_000,Number(process.env.KYERP_ACCOUNTING_ARCHIVE_POLL_MS||60_000));
if(!KEY) throw new Error("KYERP_AGENT_KEY zorunludur.");

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function safeJoin(root,relative){
  const base=path.resolve(root), target=path.resolve(base,...String(relative||"").split(/[\\/]+/).filter(Boolean));
  if(target!==base&&!target.startsWith(base+path.sep)) throw new Error("Güvensiz hedef yol reddedildi.");
  return target;
}
async function config(){
  if(fs.existsSync(CONFIG_PATH)){
    const raw=JSON.parse(await fsp.readFile(CONFIG_PATH,"utf8"));
    const rows=Array.isArray(raw)?raw:Array.isArray(raw.connections)?raw.connections:[];
    const map=new Map();
    for(const row of rows){const id=String(row.storageConnectionId||row.id||"").trim(),root=String(row.rootPath||row.localRootPath||"").trim();if(id&&root)map.set(id,path.resolve(root));}
    if(map.size)return map;
  }
  const response=await fetch(`${API}/api/auth/file-hub-agent/config`,{method:"POST",headers:{"Content-Type":"application/json","X-KYERP-Agent-Key":KEY,"X-KYERP-Tenant-Slug":COMPANY},body:JSON.stringify({mainCompanySlug:COMPANY,deviceName:DEVICE})});
  const payload=await response.json(); if(!response.ok||payload?.ok===false)throw new Error(payload?.error?.message||`HTTP ${response.status}`);
  return new Map((payload?.data?.connections||[]).map(row=>[String(row.storageConnectionId),path.resolve(String(row.rootPath))]));
}
async function post(endpoint,payload={}){
  const response=await fetch(`${API}${endpoint}`,{method:"POST",headers:{"Content-Type":"application/json","X-KYERP-Agent-Key":KEY,"X-KYERP-Tenant-Slug":COMPANY},body:JSON.stringify({mainCompanySlug:COMPANY,deviceName:DEVICE,...payload})});
  const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={raw:text}}if(!response.ok||data?.ok===false)throw new Error(data?.error?.message||`HTTP ${response.status}`);return data;
}
async function download(job){
  const response=await fetch(`${API}${job.downloadUrl}?mainCompanySlug=${encodeURIComponent(COMPANY)}`,{headers:{"X-KYERP-Agent-Key":KEY,"X-KYERP-Tenant-Slug":COMPANY}});
  if(!response.ok)throw new Error(`Belge indirilemedi (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
async function archiveOne(roots){
  const claim=await post("/api/auth/file-hub-agent/accounting-archive/claim");
  const job=claim?.data;if(!job)return false;
  const root=roots.get(String(job.storageConnectionId));
  if(!root){await post(`/api/auth/file-hub-agent/accounting-archive/${encodeURIComponent(job.jobId)}/fail`,{error:"Agent config içinde hedef storageConnectionId için rootPath yok."});return true;}
  const target=safeJoin(root,job.relativePath), temp=`${target}.kyerp-part-${process.pid}-${Date.now()}`;
  try{
    await fsp.mkdir(path.dirname(target),{recursive:true});
    const bytes=await download(job);
    const sha=crypto.createHash("sha256").update(bytes).digest("hex");
    await fsp.writeFile(temp,bytes,{flag:"wx"});
    try{await fsp.rename(temp,target);}catch(error){
      if(error?.code==="EEXIST"||error?.code==="EPERM"){
        const existing=await fsp.readFile(target).catch(()=>null);
        if(existing&&crypto.createHash("sha256").update(existing).digest("hex")===sha)await fsp.rm(temp,{force:true});
        else throw new Error(`Hedef dosya zaten var ve içeriği farklı: ${target}`);
      }else throw error;
    }
    const stat=await fsp.stat(target);
    await post(`/api/auth/file-hub-agent/accounting-archive/${encodeURIComponent(job.jobId)}/complete`,{storageConnectionId:job.storageConnectionId,relativePath:job.relativePath,sha256:sha,modifiedAt:new Date(stat.mtimeMs).toISOString(),sizeBytes:stat.size});
    console.log(`[MUHASEBE ARŞİV] ${job.documentId} -> ${target}`);
  }catch(error){
    await fsp.rm(temp,{force:true}).catch(()=>{});
    await post(`/api/auth/file-hub-agent/accounting-archive/${encodeURIComponent(job.jobId)}/fail`,{error:error instanceof Error?error.message:String(error)}).catch(()=>{});
    console.error(`[MUHASEBE ARŞİV HATA] ${job.documentId}:`,error instanceof Error?error.message:error);
  }
  return true;
}

let roots=await config();
console.log(`KY Muhasebe Arşiv Worker | Firma=${COMPANY} | Cihaz=${DEVICE} | Kaynak=${roots.size}`);
while(true){
  try{
    let worked=false;
    for(let i=0;i<20;i++){const one=await archiveOne(roots);if(!one)break;worked=true;}
    if(!worked)await sleep(POLL_MS); else await sleep(1000);
  }catch(error){
    console.error("[MUHASEBE ARŞİV WORKER]",error instanceof Error?error.message:error);
    await sleep(POLL_MS);
    roots=await config().catch(()=>roots);
  }
}
