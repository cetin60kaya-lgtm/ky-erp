import {createServer} from "node:http";
import {open,mkdir,readFile,readdir,stat} from "node:fs/promises";
import {join,resolve,isAbsolute} from "node:path";
import {timingSafeEqual} from "node:crypto";
import {fileURLToPath} from "node:url";
import {validateTerminalDefinition} from "./terminal-profiles.mjs";
import {verifyQrCredential,normalizedKioskEvent,normalizedWedgeCardEvent} from "./qr-terminal-core.mjs";
import {sealTerminalJournalFact} from "./terminal-journal-proof.mjs";

const same=(a,b)=>{
  if(typeof a!=="string"||typeof b!=="string")return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
};
const reply=(res,code,value)=>{
  const bytes=Buffer.from(JSON.stringify(value),"utf8");
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'",
    "Content-Length":bytes.byteLength});
  res.end(bytes);
};
async function bodyJson(req){
  const parts=[];let size=0;
  for await(const part of req){
    size+=part.length;
    if(size>1800)throw new Error("TERMINAL_BODY_TOO_LARGE");
    parts.push(part);
  }
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"));}
  catch{throw new Error("TERMINAL_JSON_INVALID");}
}
export function createKioskHandler({terminal,secret,operatorKey,journalRoot,
  now=()=>Date.now(),bindPort=5197}={}){
  const profile=validateTerminalDefinition(terminal);
  if(profile.connectorId!=="KY_QR_LOCAL"||
     !["EXPLICIT_IN_OUT","EXPLICIT_IN","EXPLICIT_OUT"].includes(profile.directionMode))
    throw new Error("LOCAL_QR_PROFILE_REQUIRED");
  if(!Number.isInteger(bindPort)||bindPort<5197||bindPort>5205)
    throw new Error("QR_LOOPBACK_PORT_INVALID");
  if(typeof journalRoot!=="string"||!isAbsolute(journalRoot)||
     journalRoot.length<12)throw new Error("QR_ABSOLUTE_JOURNAL_ROOT_REQUIRED");
  if(typeof secret!=="string"||Buffer.byteLength(secret)<32||
    typeof operatorKey!=="string"||Buffer.byteLength(operatorKey)<32||
    same(secret,operatorKey))throw new Error("QR_GATEWAY_DISTINCT_KEYS_REQUIRED");
  const root=resolve(journalRoot);
  const origin="http://127.0.0.1:"+bindPort;
  return async(req,res)=>{
    const requestOrigin=req.headers.origin;
    if(req.headers.host!=="127.0.0.1:"+bindPort||
       requestOrigin&&requestOrigin!==origin)
      return reply(res,403,{ok:false,error:"TERMINAL_ORIGIN_DENIED"});
    res.setHeader("X-Frame-Options","DENY");
    res.setHeader("Cache-Control","no-store");
    if(req.method==="GET"&&req.url==="/"){
      const html=await readFile(fileURLToPath(new URL("./terminal-kiosk.html",import.meta.url)));
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8",
        "Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'none'",
        "X-Content-Type-Options":"nosniff"});
      return res.end(html);
    }
    if(req.method==="GET"&&req.url==="/health")
      return reply(res,200,{ok:true,state:"LOCAL_QR_GATEWAY_READY",
        productionSourceCertified:false,terminalId:profile.terminalId});
    if(!same(req.headers["x-ky-pdks-terminal-key"],operatorKey))
      return reply(res,401,{ok:false,error:"TERMINAL_AUTH_REQUIRED"});
    if(req.method==="GET"&&req.url==="/events"){
      const folder=join(root,"events");
      await mkdir(folder,{recursive:true,mode:0o700});
      const names=(await readdir(folder)).filter(x=>/^[a-f0-9]{64}\.json$/.test(x));
      if(names.length>30000)
        return reply(res,503,{ok:false,error:"TERMINAL_JOURNAL_TOO_LARGE_USE_OFFLINE_EXPORT"});
      const recent=await Promise.all(names.map(async name=>({
        name,mtime:(await stat(join(folder,name))).mtimeMs,
      })));
      recent.sort((a,b)=>b.mtime-a.mtime||a.name.localeCompare(b.name));
      const records=[];
      for(const entry of recent.slice(0,100)){
        try{records.push(JSON.parse(await readFile(join(folder,entry.name),"utf8")));}catch{}
      }
      return reply(res,200,{ok:true,records,total:names.length,
        hasMore:names.length>records.length,source:"LOCAL_UNSYNCED"});
    }
    if(req.method!=="POST"||!["/scan","/scan-card"].includes(req.url))
      return reply(res,404,{ok:false,error:"TERMINAL_ENDPOINT_NOT_FOUND"});
    try{
      if(req.headers["content-type"]?.split(";")[0].toLowerCase()!=="application/json")
        return reply(res,415,{ok:false,error:"TERMINAL_JSON_REQUIRED"});
      const body=await bodyJson(req);
      const event=sealTerminalJournalFact(req.url==="/scan-card"
        ? normalizedWedgeCardEvent({terminal:profile,cardNo:body.cardNo,
            direction:body.direction,now:now()})
        : normalizedKioskEvent({terminal:profile,
            credential:verifyQrCredential(body.token,{secret,companyId:profile.companyId,
              now:now()}),direction:body.direction,now:now()}),operatorKey);
      const folder=join(root,"events");
      await mkdir(folder,{recursive:true,mode:0o700});
      const path=join(folder,event.sourceKey+".json");
      let handle;
      try{
        handle=await open(path,"wx",0o600);
        await handle.writeFile(JSON.stringify(event)+"\n","utf8");
        await handle.sync();
      }catch(error){
        if(error?.code==="EEXIST")
          return reply(res,409,{ok:false,error:"QR_REPLAY_BLOCKED"});
        throw error;
      }finally{if(handle){try{await handle.close()}catch{}}}
      return reply(res,202,{ok:true,status:event.status,
        receivedAt:event.receivedAt,sourceKey:event.sourceKey,
        identityVerified:req.url==="/scan",
        fdbReconciled:false,tnfReconciled:false});
    }catch(error){
      const known=/^(QR_|TERMINAL_|INVALID_)/.test(error?.message||"");
      return reply(res,known?422:500,{ok:false,
        error:known?error.message:"TERMINAL_RECORD_FAILURE"});
    }
  };
}
export async function startQrKiosk(config){
  const server=createServer(createKioskHandler(config));
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(config.bindPort??5197,"127.0.0.1",resolve);
  });
  return server;
}
