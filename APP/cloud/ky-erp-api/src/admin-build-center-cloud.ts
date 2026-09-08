// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;

const ROOT = "build-center/";
const JOB_PREFIX = ROOT + "jobs/";
const ENROLL_PREFIX = ROOT + "enrollments/";
const AGENT_PREFIX = ROOT + "agents/";
const HEARTBEAT_PREFIX = ROOT + "status/agents/";
const MAX_JOBS = 100;
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;

const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const isOwner = (role: unknown) => ["ADMIN","SUPER_ADMIN"].includes(upper(role));
const errorBody = (code: string, message: string) => ({ ok:false, error:{ code,message } });
const jobKey = (id: string) => JOB_PREFIX + id + ".json";
const artifactRoot = (job: Row) => ROOT + "artifacts/" + text(job.product).toLowerCase() + "/" + text(job.version) + "/" + text(job.id) + "/";
const logKey = (id: string) => ROOT + "logs/" + id + "/build.log";

async function ownerCurrent(c:any) {
  const user = await getAuthenticatedUser(c);
  return user && isOwner(user.role) ? user : null;
}
async function bodyOf(c:any): Promise<Row> {
  try { const body = await c.req.json(); return body && typeof body === "object" && !Array.isArray(body) ? body : {}; }
  catch { return {}; }
}
async function jsonGet(bucket:any,key:string) {
  const object = await bucket.get(key);
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}
async function jsonGetVersioned(bucket:any,key:string) {
  const object = await bucket.get(key);
  if (!object) return null;
  try { return { data: JSON.parse(await object.text()), etag: text(object.etag || object.httpEtag) }; }
  catch { return null; }
}
async function jsonPut(bucket:any,key:string,value:Row) {
  await bucket.put(key, JSON.stringify(value), { httpMetadata:{ contentType:"application/json; charset=utf-8" } });
  return value;
}
async function jsonPutIfMatch(bucket:any,key:string,value:Row,etag:string) {
  return bucket.put(key, JSON.stringify(value), {
    onlyIf:{ etagMatches:etag },
    httpMetadata:{ contentType:"application/json; charset=utf-8" },
  });
}
async function listJsonPrefix(bucket:any,prefix:string) {
  const rows: Row[] = [];
  let cursor: string | undefined;
  do {
    const result = await bucket.list({ prefix, limit:1000, ...(cursor ? { cursor } : {}) });
    for (const object of result.objects || []) {
      const row = await jsonGet(bucket,object.key);
      if (row) rows.push(row);
    }
    cursor = result.truncated ? text(result.cursor) || undefined : undefined;
  } while (cursor);
  return rows;
}
async function listJobObjects(bucket:any) {
  return (await listJsonPrefix(bucket,JOB_PREFIX))
    .filter((row)=>row?.id)
    .sort((a,b)=>text(b.createdAt).localeCompare(text(a.createdAt)));
}
async function sha256(value:string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,"0")).join("");
}
function newSecret(prefix:string) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  return prefix + encoded;
}
function enrollmentKey(id:string){ return ENROLL_PREFIX + safeName(id) + ".json"; }
function agentKey(id:string){ return AGENT_PREFIX + safeName(id) + ".json"; }
function heartbeatKey(id:string){ return HEARTBEAT_PREFIX + safeName(id) + ".json"; }
async function agentAuthorized(c:any) {
  const supplied = text(c.req.header("X-KYERP-Build-Agent-Token"));
  const agentId = text(c.req.header("X-KYERP-Build-Agent-Id"));
  if (!supplied || !agentId) return null;
  const config = await jsonGet(c.env.FILES,agentKey(agentId));
  if (!config?.tokenHash || config.active===false) return null;
  if ((await sha256(supplied)) !== text(config.tokenHash)) return null;
  return config;
}
async function requireAgent(c:any) {
  const agent = await agentAuthorized(c);
  if (agent) return { agent, denied:null };
  return { agent:null, denied:c.json(errorBody("BUILD_AGENT_UNAUTHORIZED","Build Agent kimliği veya anahtarı geçersiz."),401) };
}
function normalizeProduct(value:unknown) {
  const key = upper(value);
  if (["PDKS","PDKS_PRO","KY_PDKS_PRO"].includes(key)) return "PDKS_PRO";
  if (["ERP","ERP_DESKTOP","KY_ERP_DESKTOP"].includes(key)) return "ERP_DESKTOP";
  return "";
}
function buildSpec(product:string,version:string,branch:string) {
  if (product === "PDKS_PRO") return {
    product,
    version,
    branch,
    buildScript: "APP/desktop/ky-pdks/BUILD_PDKS_PRO_SETUP.ps1",
    artifactRelativePath: `APP/desktop/ky-pdks/dist-pdks/setup/KY-PDKS-Pro-Setup-${version}.exe`,
    sha256RelativePath: `APP/desktop/ky-pdks/dist-pdks/setup/KY-PDKS-Pro-Setup-${version}.exe.sha256.txt`,
    buildInfoRelativePath: "APP/desktop/ky-pdks/dist-pdks/setup/build-info-pdks.json",
  };
  return {
    product,
    version,
    branch,
    buildScript: "APP/desktop/ky-pdks/BUILD_SETUP.ps1",
    artifactRelativePath: `APP/desktop/ky-pdks/dist/setup/KY-ERP-Desktop-Setup-${version}.exe`,
    sha256RelativePath: `APP/desktop/ky-pdks/dist/setup/KY-ERP-Desktop-Setup-${version}.exe.sha256.txt`,
    buildInfoRelativePath: "APP/desktop/ky-pdks/dist/setup/build-info.json",
  };
}
function transitionAllowed(fromStatus:string,toStatus:string) {
  const from=upper(fromStatus),to=upper(toStatus);
  if (!to || from===to) return true;
  const allowed:Record<string,string[]> = {
    QUEUED:["CLAIMED","CANCELLED","FAILED"],
    CLAIMED:["BUILDING","CANCELLED","FAILED"],
    BUILDING:["TESTING","FAILED"],
    TESTING:["PACKAGING","FAILED"],
    PACKAGING:["UPLOADING","FAILED"],
    UPLOADING:["SUCCESS","FAILED"],
    SUCCESS:[],
    FAILED:[],
    CANCELLED:[],
  };
  return (allowed[from]||[]).includes(to);
}
async function updateJobAtomic(c:any,id:string,patch:Row,requiredStatuses:string[]=[]){
  const key=jobKey(id);
  for(let attempt=0;attempt<4;attempt+=1){
    const versioned=await jsonGetVersioned(c.env.FILES,key);
    if(!versioned?.data)return {ok:false,code:"BUILD_NOT_FOUND",current:null};
    const current=versioned.data;
    if(requiredStatuses.length&&!requiredStatuses.includes(upper(current.status))){
      return {ok:false,code:"BUILD_STATE_CONFLICT",current};
    }
    const nextStatus=patch.status===undefined?upper(current.status):upper(patch.status);
    if(!transitionAllowed(current.status,nextStatus)){
      return {ok:false,code:"BUILD_STATE_CONFLICT",current};
    }
    const next={...current,...patch,status:nextStatus,updatedAt:nowIso(),revision:Number(current.revision||0)+1};
    const stored=await jsonPutIfMatch(c.env.FILES,key,next,versioned.etag);
    if(stored)return {ok:true,current:next};
  }
  const latest=await jsonGet(c.env.FILES,key);
  return {ok:false,code:"BUILD_CONCURRENT_UPDATE",current:latest};
}
function safeName(value:unknown) {
  return text(value).replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,180);
}
function fileKeyFor(job:Row,kind:string,fileName:string) {
  const root = artifactRoot(job);
  const k = upper(kind);
  if (k === "ARTIFACT") return root + safeName(fileName || job.artifactFileName || "setup.exe");
  if (k === "SHA256") return root + safeName(fileName || "setup.exe.sha256.txt");
  if (k === "BUILDINFO") return root + safeName(fileName || "build-info.json");
  if (k === "LOG") return logKey(text(job.id));
  return root + safeName(fileName || "file.bin");
}
async function streamObject(c:any,key:string,fileName:string) {
  const object = await c.env.FILES.get(key);
  if (!object) return c.json(errorBody("BUILD_FILE_NOT_FOUND","Build dosyası bulunamadı."),404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control","private, no-store");
  headers.set("Content-Disposition", `attachment; filename="${safeName(fileName || key.split("/").pop())}"`);
  return new Response(object.body,{headers});
}

export function registerAdminBuildCenterRoutes(app:any) {
  app.get("/api/admin/build-center/status", async(c:any)=>{
    const owner = await ownerCurrent(c);
    if (!owner) return c.json(errorBody("OWNER_ONLY","Sürüm Merkezi yalnız uygulama sahibine açıktır."),403);
    const [agents,heartbeats,jobs] = await Promise.all([
      listJsonPrefix(c.env.FILES,AGENT_PREFIX),
      listJsonPrefix(c.env.FILES,HEARTBEAT_PREFIX),
      listJobObjects(c.env.FILES),
    ]);
    const activeAgents=agents.filter((row)=>row?.active!==false);
    const heartbeat=heartbeats.sort((a,b)=>text(b.lastSeenAt).localeCompare(text(a.lastSeenAt)))[0]||null;
    return c.json({ok:true,data:{
      agentConfigured:activeAgents.length>0,
      agentCount:activeAgents.length,
      agents:activeAgents.map((row)=>({agentId:row.agentId,agentName:row.agentName,createdAt:row.createdAt,lastEnrolledAt:row.lastEnrolledAt,active:row.active!==false})),
      heartbeat,
      jobs:jobs.slice(0,MAX_JOBS),
      storage:"R2:FILES/build-center",
    }});
  });

  app.post("/api/admin/build-center/agent-enrollment", async(c:any)=>{
    const owner = await ownerCurrent(c);
    if (!owner) return c.json(errorBody("OWNER_ONLY","Build Agent kurulumu yalnız uygulama sahibi tarafından başlatılabilir."),403);
    const enrollmentId=crypto.randomUUID();
    const enrollmentCode=newSecret("kye_");
    const createdAt=nowIso();
    const expiresAt=new Date(Date.now()+ENROLLMENT_TTL_MS).toISOString();
    await jsonPut(c.env.FILES,enrollmentKey(enrollmentId),{
      enrollmentId,
      codeHash:await sha256(enrollmentCode),
      createdAt,
      expiresAt,
      usedAt:null,
      usedByAgentId:"",
      createdBy:text(owner.id),
      createdByName:text(owner.fullName||owner.full_name||owner.username),
    });
    return c.json({ok:true,data:{enrollmentId,enrollmentCode,expiresAt,shownOnce:true}});
  });

  app.post("/api/build-agent/enroll", async(c:any)=>{
    const body=await bodyOf(c);
    const enrollmentId=text(body.enrollmentId);
    const enrollmentCode=text(body.enrollmentCode);
    const requestedAgentId=safeName(body.agentId||crypto.randomUUID());
    const agentName=text(body.agentName||"WINDOWS-BUILDER").slice(0,180);
    if(!enrollmentId||!enrollmentCode||!requestedAgentId)return c.json(errorBody("BUILD_AGENT_ENROLLMENT_INVALID","Agent enrollment bilgileri eksik."),400);

    const key=enrollmentKey(enrollmentId);
    const versioned=await jsonGetVersioned(c.env.FILES,key);
    const enrollment=versioned?.data;
    if(!enrollment||!versioned?.etag)return c.json(errorBody("BUILD_AGENT_ENROLLMENT_NOT_FOUND","Agent enrollment kaydı bulunamadı."),404);
    if(enrollment.usedAt||Date.parse(text(enrollment.expiresAt))<=Date.now())return c.json(errorBody("BUILD_AGENT_ENROLLMENT_EXPIRED","Agent enrollment kodu kullanılmış veya süresi dolmuş."),409);
    if((await sha256(enrollmentCode))!==text(enrollment.codeHash))return c.json(errorBody("BUILD_AGENT_ENROLLMENT_INVALID","Agent enrollment kodu geçersiz."),401);

    const claimed={...enrollment,usedAt:nowIso(),usedByAgentId:requestedAgentId};
    const claimedObject=await jsonPutIfMatch(c.env.FILES,key,claimed,versioned.etag);
    if(!claimedObject)return c.json(errorBody("BUILD_AGENT_ENROLLMENT_CONFLICT","Agent enrollment kodu başka bir işlem tarafından kullanıldı."),409);

    const agentToken=newSecret("kyb_");
    const record={
      agentId:requestedAgentId,
      agentName,
      tokenHash:await sha256(agentToken),
      active:true,
      createdAt:nowIso(),
      lastEnrolledAt:nowIso(),
      enrolledFromIp:text(c.req.header("CF-Connecting-IP")),
    };
    await jsonPut(c.env.FILES,agentKey(requestedAgentId),record);
    return c.json({ok:true,data:{agentId:requestedAgentId,agentName,agentToken,shownOnce:true}});
  });

  app.post("/api/admin/build-center/jobs", async(c:any)=>{
    const owner = await ownerCurrent(c);
    if (!owner) return c.json(errorBody("OWNER_ONLY","Build talebi yalnız uygulama sahibine açıktır."),403);
    const body = await bodyOf(c);
    const product = normalizeProduct(body.product||"PDKS_PRO");
    if (!product) return c.json(errorBody("BUILD_PRODUCT_INVALID","Desteklenen ürün seçilmedi."),400);
    const version = text(body.version || (product==="PDKS_PRO" ? "1.9.0" : ""));
    if (!/^\d+\.\d+\.\d+$/.test(version)) return c.json(errorBody("BUILD_VERSION_INVALID","Sürüm x.y.z biçiminde olmalıdır."),400);
    const branch = text(body.branch || "codex/pdks-desktop-1.8.1-device-final-20260907");
    if (!/^[a-zA-Z0-9._\/-]{3,180}$/.test(branch) || branch.includes("..")) return c.json(errorBody("BUILD_BRANCH_INVALID","Branch adı geçersiz."),400);
    const id = crypto.randomUUID();
    const spec = buildSpec(product,version,branch);
    const job = {
      id,...spec,status:"QUEUED",progress:0,message:"Build kuyruğa alındı.",
      requestedBy:text(owner.id),requestedByName:text(owner.fullName||owner.full_name||owner.username),
      createdAt:nowIso(),updatedAt:nowIso(),startedAt:null,completedAt:null,commitSha:"",
      artifactKey:"",sha256Key:"",buildInfoKey:"",logKey:"",agentName:"",
    };
    await jsonPut(c.env.FILES,jobKey(id),job);
    return c.json({ok:true,data:job},201);
  });

  app.post("/api/admin/build-center/jobs/:id/cancel", async(c:any)=>{
    const owner = await ownerCurrent(c);
    if (!owner) return c.json(errorBody("OWNER_ONLY","Build iptali yalnız uygulama sahibine açıktır."),403);
    const result=await updateJobAtomic(c,c.req.param("id"),{
      status:"CANCELLED",progress:0,message:"Build uygulama sahibi tarafından iptal edildi.",completedAt:nowIso()
    },["QUEUED","CLAIMED"]);
    if(!result.ok){
      if(result.code==="BUILD_NOT_FOUND")return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
      return c.json(errorBody("BUILD_NOT_CANCELLABLE","Build durumu değişti; iptal uygulanmadı."),409);
    }
    return c.json({ok:true,data:result.current});
  });

  app.get("/api/admin/build-center/jobs/:id/artifact", async(c:any)=>{
    const owner = await ownerCurrent(c);
    if (!owner) return c.json(errorBody("OWNER_ONLY","Build artifact yalnız uygulama sahibine açıktır."),403);
    const job = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!job?.artifactKey) return c.json(errorBody("BUILD_ARTIFACT_NOT_READY","Setup artifact henüz hazır değil."),409);
    return streamObject(c,job.artifactKey,job.artifactFileName||job.artifactKey.split("/").pop());
  });

  app.get("/api/admin/build-center/jobs/:id/log", async(c:any)=>{
    const owner = await ownerCurrent(c);
    if (!owner) return c.json(errorBody("OWNER_ONLY","Build log yalnız uygulama sahibine açıktır."),403);
    const job = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!job?.logKey) return c.json(errorBody("BUILD_LOG_NOT_READY","Build log henüz hazır değil."),409);
    return streamObject(c,job.logKey,"KYERP-build-"+job.id+".log");
  });

  // Build Agent endpoints are outside browser auth. They are fail-closed behind
  // a 256-bit rotating token whose hash lives in the already-bound R2 FILES bucket.
  app.get("/api/build-agent/next", async(c:any)=>{
    const auth=await requireAgent(c); if(auth.denied)return auth.denied;
    const agent=auth.agent;
    const agentId=text(agent.agentId);
    const agentName=text(c.req.query("agent")||c.req.header("X-KYERP-Build-Agent")||agent.agentName||"WINDOWS-BUILDER");
    await jsonPut(c.env.FILES,heartbeatKey(agentId),{
      agentId,agentName,lastSeenAt:nowIso(),ip:text(c.req.header("CF-Connecting-IP"))
    });

    const queued=(await listJobObjects(c.env.FILES))
      .filter((row)=>upper(row.status)==="QUEUED")
      .sort((a,b)=>text(a.createdAt).localeCompare(text(b.createdAt)));
    for(const job of queued){
      const claim=await updateJobAtomic(c,job.id,{
        status:"CLAIMED",progress:1,message:"Windows Build Agent işi aldı.",
        agentId,agentName,startedAt:job.startedAt||nowIso()
      },["QUEUED"]);
      if(claim.ok)return c.json({ok:true,data:claim.current});
    }
    return c.json({ok:true,data:null});
  });

  app.post("/api/build-agent/jobs/:id/progress", async(c:any)=>{
    const auth=await requireAgent(c); if(auth.denied)return auth.denied;
    const body=await bodyOf(c);
    const status=upper(body.status||"BUILDING");
    const allowed=new Set(["CLAIMED","BUILDING","TESTING","PACKAGING","UPLOADING","SUCCESS","FAILED"]);
    if(!allowed.has(status))return c.json(errorBody("BUILD_STATUS_INVALID","Build durumu geçersiz."),400);

    const current=await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if(!current)return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    if(text(current.agentId)&&text(current.agentId)!==text(auth.agent.agentId))
      return c.json(errorBody("BUILD_AGENT_JOB_MISMATCH","Bu build başka bir Agent tarafından alınmış."),409);

    const patch:any={
      status,
      progress:Math.max(0,Math.min(100,Number(body.progress||0))),
      message:text(body.message).slice(0,500),
      commitSha:text(body.commitSha||current.commitSha).slice(0,64),
      agentId:text(auth.agent.agentId),
      agentName:text(body.agentName||current.agentName||auth.agent.agentName),
    };
    if(["SUCCESS","FAILED"].includes(status))patch.completedAt=nowIso();

    const result=await updateJobAtomic(c,current.id,patch);
    if(!result.ok)return c.json(errorBody("BUILD_STATE_CONFLICT","Build durumu eşzamanlı değişti; ilerleme uygulanmadı."),409);
    return c.json({ok:true,data:result.current});
  });

  app.put("/api/build-agent/jobs/:id/file/:kind", async(c:any)=>{
    const auth=await requireAgent(c); if(auth.denied)return auth.denied;
    const job=await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if(!job)return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    if(text(job.agentId)&&text(job.agentId)!==text(auth.agent.agentId))
      return c.json(errorBody("BUILD_AGENT_JOB_MISMATCH","Bu build başka bir Agent tarafından alınmış."),409);
    if(["CANCELLED","SUCCESS"].includes(upper(job.status)))
      return c.json(errorBody("BUILD_STATE_CONFLICT","Bu build artık dosya kabul etmiyor."),409);

    const kind=upper(c.req.param("kind"));
    if(!["LOG","SHA256","BUILDINFO"].includes(kind))return c.json(errorBody("BUILD_FILE_KIND_INVALID","Dosya türü geçersiz."),400);
    const fileName=safeName(c.req.query("fileName"));
    const key=fileKeyFor(job,kind,fileName);
    await c.env.FILES.put(key,c.req.raw.body,{httpMetadata:{contentType:c.req.header("content-type")||"application/octet-stream"}});

    const patch:any={};
    if(kind==="LOG")patch.logKey=key;
    if(kind==="SHA256")patch.sha256Key=key;
    if(kind==="BUILDINFO")patch.buildInfoKey=key;
    const result=await updateJobAtomic(c,job.id,patch);
    if(!result.ok)return c.json(errorBody("BUILD_STATE_CONFLICT","Build durumu değişti; dosya kaydı bağlanamadı."),409);
    return c.json({ok:true,data:{key,job:result.current}});
  });

  app.post("/api/build-agent/jobs/:id/multipart/start", async(c:any)=>{
    const auth=await requireAgent(c); if(auth.denied)return auth.denied;
    const job=await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if(!job)return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    if(text(job.agentId)!==text(auth.agent.agentId))
      return c.json(errorBody("BUILD_AGENT_JOB_MISMATCH","Bu build başka bir Agent tarafından alınmış."),409);
    if(!["PACKAGING","UPLOADING"].includes(upper(job.status)))
      return c.json(errorBody("BUILD_STATE_CONFLICT","Artifact yüklemesi için build paketleme aşamasında olmalıdır."),409);

    const body=await bodyOf(c);
    const fileName=safeName(body.fileName||("KY-PDKS-Pro-Setup-"+job.version+".exe"));
    const expectedBytes=Number(body.totalBytes||0);
    const expectedSha256=text(body.sha256).toLowerCase();
    if(!Number.isSafeInteger(expectedBytes)||expectedBytes<=0||!/^[a-f0-9]{64}$/.test(expectedSha256))
      return c.json(errorBody("BUILD_ARTIFACT_METADATA_INVALID","Artifact boyutu ve SHA-256 bilgisi zorunludur."),400);

    const key=fileKeyFor(job,"ARTIFACT",fileName);
    const upload=await c.env.FILES.createMultipartUpload(key,{
      httpMetadata:{contentType:text(body.contentType)||"application/octet-stream"},
      customMetadata:{buildId:job.id,product:job.product,version:job.version,sha256:expectedSha256}
    });
    const result=await updateJobAtomic(c,job.id,{
      status:"UPLOADING",message:"Setup R2'ye yükleniyor.",artifactFileName:fileName,
      artifactPendingKey:key,artifactUploadId:upload.uploadId,
      expectedArtifactBytes:expectedBytes,expectedArtifactSha256:expectedSha256
    });
    if(!result.ok){
      try{await upload.abort();}catch{}
      return c.json(errorBody("BUILD_STATE_CONFLICT","Build durumu değişti; artifact yüklemesi başlatılmadı."),409);
    }
    return c.json({ok:true,data:{key,uploadId:upload.uploadId,expectedBytes,expectedSha256}});
  });

  app.put("/api/build-agent/jobs/:id/multipart/part", async(c:any)=>{
    const auth=await requireAgent(c); if(auth.denied)return auth.denied;
    const job=await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if(!job)return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    if(text(job.agentId)!==text(auth.agent.agentId))
      return c.json(errorBody("BUILD_AGENT_JOB_MISMATCH","Bu build başka bir Agent tarafından alınmış."),409);

    const key=text(c.req.query("key")),uploadId=text(c.req.query("uploadId"));
    const partNumber=Number(c.req.query("partNumber")||0);
    if(upper(job.status)!=="UPLOADING"||key!==text(job.artifactPendingKey)||uploadId!==text(job.artifactUploadId)
      ||!Number.isInteger(partNumber)||partNumber<1||partNumber>10000)
      return c.json(errorBody("BUILD_UPLOAD_PART_INVALID","Multipart upload parametreleri geçersiz."),400);

    const upload=c.env.FILES.resumeMultipartUpload(key,uploadId);
    const part=await upload.uploadPart(partNumber,c.req.raw.body);
    return c.json({ok:true,data:{partNumber:part.partNumber,etag:part.etag}});
  });

  app.post("/api/build-agent/jobs/:id/multipart/complete", async(c:any)=>{
    const auth=await requireAgent(c); if(auth.denied)return auth.denied;
    const job=await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if(!job)return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    if(text(job.agentId)!==text(auth.agent.agentId))
      return c.json(errorBody("BUILD_AGENT_JOB_MISMATCH","Bu build başka bir Agent tarafından alınmış."),409);

    const body=await bodyOf(c);
    const key=text(body.key),uploadId=text(body.uploadId),parts=Array.isArray(body.parts)?body.parts:[];
    if(upper(job.status)!=="UPLOADING"||key!==text(job.artifactPendingKey)||uploadId!==text(job.artifactUploadId)||!parts.length)
      return c.json(errorBody("BUILD_UPLOAD_COMPLETE_INVALID","Multipart tamamlanma bilgisi geçersiz."),400);

    const upload=c.env.FILES.resumeMultipartUpload(key,uploadId);
    const object=await upload.complete(parts.map((row:any)=>({partNumber:Number(row.partNumber),etag:text(row.etag)})));
    const actualBytes=Number(object.size||0);
    const expectedBytes=Number(job.expectedArtifactBytes||0);
    if(!expectedBytes||actualBytes!==expectedBytes){
      try{await c.env.FILES.delete(key);}catch{}
      await updateJobAtomic(c,job.id,{
        status:"FAILED",progress:100,completedAt:nowIso(),
        message:`Artifact boyutu doğrulanamadı. Beklenen=${expectedBytes}, R2=${actualBytes}`,
        artifactPendingKey:"",artifactUploadId:""
      },["UPLOADING"]);
      return c.json(errorBody("BUILD_ARTIFACT_SIZE_MISMATCH","R2 artifact boyutu kaynak Setup ile eşleşmiyor."),422);
    }

    const result=await updateJobAtomic(c,job.id,{
      artifactKey:key,artifactPendingKey:"",artifactUploadId:"",
      artifactSize:actualBytes,artifactSha256:text(job.expectedArtifactSha256),
      message:"Setup R2 artifact hazır."
    },["UPLOADING"]);
    if(!result.ok)return c.json(errorBody("BUILD_STATE_CONFLICT","Artifact tamamlandı ancak build durumu eşzamanlı değişti."),409);
    return c.json({ok:true,data:result.current});
  });

  app.post("/api/build-agent/jobs/:id/multipart/abort", async(c:any)=>{
    const auth=await requireAgent(c); if(auth.denied)return auth.denied;
    const job=await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if(!job)return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    if(text(job.agentId)!==text(auth.agent.agentId))
      return c.json(errorBody("BUILD_AGENT_JOB_MISMATCH","Bu build başka bir Agent tarafından alınmış."),409);

    const body=await bodyOf(c),key=text(body.key),uploadId=text(body.uploadId);
    if(key===text(job.artifactPendingKey)&&uploadId===text(job.artifactUploadId)){
      try{await c.env.FILES.resumeMultipartUpload(key,uploadId).abort();}catch{}
      await updateJobAtomic(c,job.id,{artifactPendingKey:"",artifactUploadId:"",message:"Artifact yüklemesi iptal edildi."},["UPLOADING"]);
    }
    return c.json({ok:true});
  });}
