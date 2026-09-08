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
    const [tokenConfig,heartbeat,jobs] = await Promise.all([
      jsonGet(c.env.FILES,TOKEN_KEY),
      jsonGet(c.env.FILES,HEARTBEAT_KEY),
      listJobObjects(c.env.FILES),
    ]);
    return c.json({ok:true,data:{
      agentConfigured:Boolean(tokenConfig?.tokenHash),
      tokenCreatedAt:tokenConfig?.createdAt||null,
      heartbeat,
      jobs,
      storage:"R2:FILES/build-center",
    }});
  });

  app.post("/api/admin/build-center/agent-token", async(c:any)=>{
    const owner = await ownerCurrent(c);
    if (!owner) return c.json(errorBody("OWNER_ONLY","Build Agent anahtarı yalnız uygulama sahibi tarafından üretilebilir."),403);
    const token = newAgentToken();
    await jsonPut(c.env.FILES,TOKEN_KEY,{
      tokenHash:await sha256(token),
      createdAt:nowIso(),
      createdBy:text(owner.id),
      createdByName:text(owner.fullName||owner.full_name||owner.username),
    });
    return c.json({ok:true,data:{token,shownOnce:true,createdAt:nowIso()}});
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
    const current = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!current) return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    if (!["QUEUED","CLAIMED"].includes(upper(current.status))) return c.json(errorBody("BUILD_NOT_CANCELLABLE","Başlamış build bu ekrandan iptal edilemez."),409);
    const next = await updateJob(c,current.id,{status:"CANCELLED",progress:0,message:"Build uygulama sahibi tarafından iptal edildi.",completedAt:nowIso()});
    return c.json({ok:true,data:next});
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
    const denied = await requireAgent(c); if (denied) return denied;
    const agentName = text(c.req.query("agent")||c.req.header("X-KYERP-Build-Agent")||"WINDOWS-BUILDER");
    await jsonPut(c.env.FILES,HEARTBEAT_KEY,{agentName,lastSeenAt:nowIso(),ip:text(c.req.header("CF-Connecting-IP"))});
    const jobs = (await listJobObjects(c.env.FILES)).filter((row)=>upper(row.status)==="QUEUED").sort((a,b)=>text(a.createdAt).localeCompare(text(b.createdAt)));
    const job = jobs[0];
    if (!job) return c.json({ok:true,data:null});
    const claimed = await updateJob(c,job.id,{status:"CLAIMED",progress:1,message:"Windows Build Agent işi aldı.",agentName,startedAt:job.startedAt||nowIso()});
    return c.json({ok:true,data:claimed});
  });

  app.post("/api/build-agent/jobs/:id/progress", async(c:any)=>{
    const denied = await requireAgent(c); if (denied) return denied;
    const body = await bodyOf(c);
    const status = upper(body.status||"BUILDING");
    const allowed = new Set(["CLAIMED","BUILDING","TESTING","PACKAGING","UPLOADING","SUCCESS","FAILED"]);
    if (!allowed.has(status)) return c.json(errorBody("BUILD_STATUS_INVALID","Build durumu geçersiz."),400);
    const current = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!current) return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    const patch:any = {
      status,
      progress:Math.max(0,Math.min(100,Number(body.progress||0))),
      message:text(body.message).slice(0,500),
      commitSha:text(body.commitSha||current.commitSha).slice(0,64),
      agentName:text(body.agentName||current.agentName),
    };
    if (["SUCCESS","FAILED"].includes(status)) patch.completedAt=nowIso();
    const next = await updateJob(c,current.id,patch);
    return c.json({ok:true,data:next});
  });

  app.put("/api/build-agent/jobs/:id/file/:kind", async(c:any)=>{
    const denied = await requireAgent(c); if (denied) return denied;
    const job = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!job) return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    const kind = upper(c.req.param("kind"));
    if (!["LOG","SHA256","BUILDINFO"].includes(kind)) return c.json(errorBody("BUILD_FILE_KIND_INVALID","Dosya türü geçersiz."),400);
    const fileName = safeName(c.req.query("fileName"));
    const key = fileKeyFor(job,kind,fileName);
    await c.env.FILES.put(key,c.req.raw.body,{httpMetadata:{contentType:c.req.header("content-type")||"application/octet-stream"}});
    const patch:any={};
    if(kind==="LOG")patch.logKey=key;
    if(kind==="SHA256")patch.sha256Key=key;
    if(kind==="BUILDINFO")patch.buildInfoKey=key;
    const next=await updateJob(c,job.id,patch);
    return c.json({ok:true,data:{key,job:next}});
  });

  app.post("/api/build-agent/jobs/:id/multipart/start", async(c:any)=>{
    const denied = await requireAgent(c); if (denied) return denied;
    const job = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!job) return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    const body = await bodyOf(c);
    const fileName = safeName(body.fileName||("KY-PDKS-Pro-Setup-"+job.version+".exe"));
    const key = fileKeyFor(job,"ARTIFACT",fileName);
    const upload = await c.env.FILES.createMultipartUpload(key,{httpMetadata:{contentType:text(body.contentType)||"application/octet-stream"},customMetadata:{buildId:job.id,product:job.product,version:job.version}});
    await updateJob(c,job.id,{status:"UPLOADING",message:"Setup R2'ye yükleniyor.",artifactFileName:fileName,artifactPendingKey:key});
    return c.json({ok:true,data:{key,uploadId:upload.uploadId}});
  });

  app.put("/api/build-agent/jobs/:id/multipart/part", async(c:any)=>{
    const denied = await requireAgent(c); if (denied) return denied;
    const job = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!job) return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    const key = text(c.req.query("key")), uploadId=text(c.req.query("uploadId"));
    const partNumber = Number(c.req.query("partNumber")||0);
    if (!key.startsWith(ROOT+"artifacts/") || key!==text(job.artifactPendingKey) || !uploadId || !Number.isInteger(partNumber) || partNumber<1 || partNumber>10000) {
      return c.json(errorBody("BUILD_UPLOAD_PART_INVALID","Multipart upload parametreleri geçersiz."),400);
    }
    const upload = c.env.FILES.resumeMultipartUpload(key,uploadId);
    const part = await upload.uploadPart(partNumber,c.req.raw.body);
    return c.json({ok:true,data:{partNumber:part.partNumber,etag:part.etag}});
  });

  app.post("/api/build-agent/jobs/:id/multipart/complete", async(c:any)=>{
    const denied = await requireAgent(c); if (denied) return denied;
    const job = await jsonGet(c.env.FILES,jobKey(c.req.param("id")));
    if (!job) return c.json(errorBody("BUILD_NOT_FOUND","Build kaydı bulunamadı."),404);
    const body = await bodyOf(c);
    const key=text(body.key),uploadId=text(body.uploadId),parts=Array.isArray(body.parts)?body.parts:[];
    if (!key || !uploadId || !parts.length || key!==text(job.artifactPendingKey)) return c.json(errorBody("BUILD_UPLOAD_COMPLETE_INVALID","Multipart tamamlanma bilgisi geçersiz."),400);
    const upload = c.env.FILES.resumeMultipartUpload(key,uploadId);
    const object = await upload.complete(parts.map((row:any)=>({partNumber:Number(row.partNumber),etag:text(row.etag)})));
    const next = await updateJob(c,job.id,{artifactKey:key,artifactPendingKey:"",artifactSize:Number(object.size||0),message:"Setup R2 artifact hazır."});
    return c.json({ok:true,data:next});
  });

  app.post("/api/build-agent/jobs/:id/multipart/abort", async(c:any)=>{
    const denied = await requireAgent(c); if (denied) return denied;
    const body=await bodyOf(c),key=text(body.key),uploadId=text(body.uploadId);
    if(key&&uploadId)await c.env.FILES.resumeMultipartUpload(key,uploadId).abort();
    return c.json({ok:true});
  });
}
