// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud.ts";

type AnyRow = Record<string, any>;

const text=(v:unknown)=>v==null?"":String(v).trim();
const upper=(v:unknown)=>text(v).toUpperCase().replace(/İ/g,"I");
const nowIso=()=>new Date().toISOString();
const ownerRole=(v:unknown)=>["SUPER_ADMIN","ADMIN"].includes(upper(v));
const companyOwnerRole=(v:unknown)=>upper(v)==="COMPANY_ADMIN";

async function tableExists(c:any,table:string){
  const row=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<AnyRow>();
  return Boolean(row?.name);
}
export async function criticalApprovalSchemaReady(c:any){
  return await tableExists(c,"critical_approval_requests") && await tableExists(c,"critical_approval_events");
}
function ownTenant(current:AnyRow){return text(current?.mainCompanySlug||current?.security?.main_company_slug);}
function canonical(value:any):any{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object"){const out:AnyRow={};for(const key of Object.keys(value).sort())out[key]=canonical(value[key]);return out;}
  return value;
}
async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}
async function addEvent(c:any,requestId:string,tenant:string,actorId:string,eventType:string,note="",detail:AnyRow={}){
  if(!(await criticalApprovalSchemaReady(c)))return;
  await c.env.DB.prepare("INSERT INTO critical_approval_events(id,request_id,main_company_slug,actor_user_id,event_type,note,detail,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),requestId,tenant||null,actorId||null,eventType,note||null,JSON.stringify(detail||{}),nowIso()).run();
}
function initialSteps(policy:string){
  const p=upper(policy);
  return {
    company:["COMPANY_OWNER","COMPANY_OWNER_OR_APP_OWNER","COMPANY_OWNER_AND_APP_OWNER"].includes(p)?"PENDING":"NOT_REQUIRED",
    app:["APP_OWNER","COMPANY_OWNER_OR_APP_OWNER","COMPANY_OWNER_AND_APP_OWNER"].includes(p)?"PENDING":"NOT_REQUIRED",
  };
}
export function approvalPolicyLabel(policy:string){
  const p=upper(policy);
  if(p==="COMPANY_OWNER")return"Firma Sahibi";
  if(p==="APP_OWNER")return"Uygulama Sahibi";
  if(p==="COMPANY_OWNER_OR_APP_OWNER")return"Firma Sahibi veya Uygulama Sahibi";
  if(p==="COMPANY_OWNER_AND_APP_OWNER")return"Firma Sahibi + Uygulama Sahibi";
  return p;
}

export async function requestCriticalApproval(c:any,current:AnyRow,input:AnyRow){
  if(!(await criticalApprovalSchemaReady(c)))return{state:"SCHEMA_MISSING",approved:false,request:null};
  const tenant=text(input.mainCompanySlug||ownTenant(current));
  const actionType=upper(input.actionType),targetType=upper(input.targetType),targetId=text(input.targetId);
  const policy=upper(input.approvalPolicy||"COMPANY_OWNER"),risk=upper(input.riskLevel||"HIGH");
  const payload=canonical(input.payload||{});
  const fingerprint=await sha256(JSON.stringify({tenant,actionType,targetType,targetId,requestedBy:text(current?.id),payload}));
  const timestamp=nowIso();
  await c.env.DB.prepare("UPDATE critical_approval_requests SET status='EXPIRED',updated_at=? WHERE fingerprint=? AND status='PENDING' AND expires_at IS NOT NULL AND expires_at<?").bind(timestamp,fingerprint,timestamp).run();
  const existing=await c.env.DB.prepare("SELECT * FROM critical_approval_requests WHERE fingerprint=? AND status IN ('PENDING','APPROVED') AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(fingerprint).first<AnyRow>();
  if(existing)return{state:upper(existing.status),approved:upper(existing.status)==="APPROVED",request:existing};
  const id=crypto.randomUUID(),steps=initialSteps(policy);
  const expiresAt=text(input.expiresAt)||new Date(Date.now()+Math.max(1,Number(input.expiresHours||72))*3600000).toISOString();
  await c.env.DB.prepare("INSERT INTO critical_approval_requests(id,main_company_slug,source_module,action_type,target_type,target_id,title,description,risk_level,approval_policy,status,company_owner_status,app_owner_status,requested_by,request_payload,fingerprint,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,tenant||null,upper(input.sourceModule||"SYSTEM"),actionType,targetType||null,targetId||null,text(input.title)||actionType,text(input.description)||null,risk,policy,"PENDING",steps.company,steps.app,text(current?.id),JSON.stringify(payload),fingerprint,expiresAt,timestamp,timestamp).run();
  await addEvent(c,id,tenant,text(current?.id),"REQUESTED","",{actionType,targetType,targetId,risk,policy});
  const row=await c.env.DB.prepare("SELECT * FROM critical_approval_requests WHERE id=? LIMIT 1").bind(id).first<AnyRow>();
  return{state:"PENDING",approved:false,request:row};
}

export async function consumeCriticalApproval(c:any,current:AnyRow,requestId:string,detail:AnyRow={}){
  if(!(await criticalApprovalSchemaReady(c)))return false;
  const row=await c.env.DB.prepare("SELECT * FROM critical_approval_requests WHERE id=? AND status='APPROVED' AND consumed_at IS NULL LIMIT 1").bind(requestId).first<AnyRow>();
  if(!row)return false;
  const timestamp=nowIso();
  await c.env.DB.prepare("UPDATE critical_approval_requests SET consumed_at=?,consumed_by=?,updated_at=? WHERE id=? AND status='APPROVED' AND consumed_at IS NULL").bind(timestamp,text(current?.id)||null,timestamp,requestId).run();
  await addEvent(c,requestId,text(row.main_company_slug),text(current?.id),"CONSUMED","",detail);
  return true;
}

export function approvalPendingPayload(result:any){
  const row=result?.request||{};
  return {approvalRequired:true,approvalRequestId:text(row.id),approvalStatus:upper(row.status||result?.state||"PENDING"),approvalPolicy:upper(row.approval_policy),approvalPolicyLabel:approvalPolicyLabel(row.approval_policy),riskLevel:upper(row.risk_level),title:text(row.title),expiresAt:text(row.expires_at)};
}

export function registerApprovalCenterRoutes(app:any){
  app.get("/api/admin/approval-center",async(c:any)=>{
    const current=await getAuthenticatedUser(c);
    if(!current||!(ownerRole(current.role)||companyOwnerRole(current.role)))return c.json({ok:false,error:{code:"APPROVAL_CENTER_FORBIDDEN",message:"Onay Merkezi yalnız Firma Sahibi veya Uygulama Sahibine açıktır."}},current?403:401);
    if(!(await criticalApprovalSchemaReady(c)))return c.json({ok:true,data:[],meta:{schemaReady:false}});
    const status=upper(c.req.query("status")||"ALL"),mine=upper(c.req.query("mine"));
    const where:string[]=[],args:any[]=[];
    if(companyOwnerRole(current.role)){const tenant=ownTenant(current);if(!tenant)return c.json({ok:false,error:{code:"TENANT_REQUIRED",message:"Firma Sahibi için firma bağlamı bulunamadı."}},403);where.push("r.main_company_slug=?");args.push(tenant);}
    else{const requested=text(c.req.query("mainCompanySlug"));if(requested){where.push("r.main_company_slug=?");args.push(requested);}}
    if(["PENDING","APPROVED","REJECTED","EXPIRED"].includes(status)){where.push("r.status=?");args.push(status);}
    if(mine==="DECIDED"){where.push("(r.company_owner_decided_by=? OR r.app_owner_decided_by=?)");args.push(text(current.id),text(current.id));}
    else if(mine==="REQUESTED"){where.push("r.requested_by=?");args.push(text(current.id));}
    const sql="SELECT r.*,u.full_name requested_by_name,u.username requested_by_username FROM critical_approval_requests r LEFT JOIN auth_users u ON u.id=r.requested_by "+(where.length?"WHERE "+where.join(" AND "):"")+" ORDER BY CASE r.status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'REJECTED' THEN 2 ELSE 3 END,r.created_at DESC LIMIT 500";
    const rows=await c.env.DB.prepare(sql).bind(...args).all<AnyRow>();
    return c.json({ok:true,data:(rows.results||[]).map((row:AnyRow)=>({...row,myDecision:text(row.company_owner_decided_by)===text(current.id)?row.company_owner_status:text(row.app_owner_decided_by)===text(current.id)?row.app_owner_status:"",approvalPolicyLabel:approvalPolicyLabel(row.approval_policy)})),meta:{schemaReady:true}});
  });

  app.post("/api/admin/approval-center/:id/decision",async(c:any)=>{
    const current=await getAuthenticatedUser(c);
    if(!current||!(ownerRole(current.role)||companyOwnerRole(current.role)))return c.json({ok:false,error:{code:"APPROVAL_CENTER_FORBIDDEN",message:"Bu onay kararını verme yetkiniz yok."}},current?403:401);
    if(!(await criticalApprovalSchemaReady(c)))return c.json({ok:false,error:{code:"APPROVAL_SCHEMA_NOT_READY",message:"Onay Merkezi veritabanı kurulumu tamamlanmadı."}},503);
    let body:AnyRow={};try{body=await c.req.json();}catch{}
    const decision=upper(body.decision),note=text(body.note);
    if(!["APPROVE","REJECT"].includes(decision))return c.json({ok:false,error:{code:"DECISION_INVALID",message:"Karar APPROVE veya REJECT olmalıdır."}},422);
    const id=text(c.req.param("id"));
    const row=await c.env.DB.prepare("SELECT * FROM critical_approval_requests WHERE id=? LIMIT 1").bind(id).first<AnyRow>();
    if(!row)return c.json({ok:false,error:{code:"APPROVAL_NOT_FOUND",message:"Onay isteği bulunamadı."}},404);
    if(upper(row.status)!=="PENDING")return c.json({ok:false,error:{code:"APPROVAL_ALREADY_DECIDED",message:"Bu onay isteği artık beklemede değil."}},409);
    if(row.expires_at&&Date.parse(text(row.expires_at))<=Date.now())return c.json({ok:false,error:{code:"APPROVAL_EXPIRED",message:"Bu onay isteğinin süresi doldu."}},409);
    const policy=upper(row.approval_policy),isCompany=companyOwnerRole(current.role),isApp=ownerRole(current.role);
    if(isCompany&&text(row.main_company_slug)!==ownTenant(current))return c.json({ok:false,error:{code:"TENANT_FORBIDDEN",message:"Başka firmanın onay isteğini sonuçlandıramazsınız."}},403);
    const companyAllowed=["COMPANY_OWNER","COMPANY_OWNER_OR_APP_OWNER","COMPANY_OWNER_AND_APP_OWNER"].includes(policy);
    const appAllowed=["APP_OWNER","COMPANY_OWNER_OR_APP_OWNER","COMPANY_OWNER_AND_APP_OWNER"].includes(policy);
    if(isCompany&&!companyAllowed)return c.json({ok:false,error:{code:"COMPANY_OWNER_NOT_APPROVER",message:"Bu işlem Uygulama Sahibi onayı gerektirir."}},403);
    if(isApp&&!appAllowed)return c.json({ok:false,error:{code:"APP_OWNER_NOT_APPROVER",message:"Bu firma işlemi yalnız Firma Sahibi tarafından onaylanabilir."}},403);
    const timestamp=nowIso(),nextStep=decision==="APPROVE"?"APPROVED":"REJECTED";
    if(isCompany)await c.env.DB.prepare("UPDATE critical_approval_requests SET company_owner_status=?,company_owner_decided_by=?,company_owner_decided_at=?,updated_at=? WHERE id=?").bind(nextStep,text(current.id),timestamp,timestamp,id).run();
    else await c.env.DB.prepare("UPDATE critical_approval_requests SET app_owner_status=?,app_owner_decided_by=?,app_owner_decided_at=?,updated_at=? WHERE id=?").bind(nextStep,text(current.id),timestamp,timestamp,id).run();
    await addEvent(c,id,text(row.main_company_slug),text(current.id),decision==="APPROVE"?"APPROVED_STEP":"REJECTED_STEP",note,{role:isCompany?"COMPANY_OWNER":"APP_OWNER"});
    const updated=await c.env.DB.prepare("SELECT * FROM critical_approval_requests WHERE id=? LIMIT 1").bind(id).first<AnyRow>();
    let finalStatus="PENDING";
    if(decision==="REJECT")finalStatus="REJECTED";
    else if(policy==="COMPANY_OWNER"&&upper(updated?.company_owner_status)==="APPROVED")finalStatus="APPROVED";
    else if(policy==="APP_OWNER"&&upper(updated?.app_owner_status)==="APPROVED")finalStatus="APPROVED";
    else if(policy==="COMPANY_OWNER_OR_APP_OWNER"&&(upper(updated?.company_owner_status)==="APPROVED"||upper(updated?.app_owner_status)==="APPROVED"))finalStatus="APPROVED";
    else if(policy==="COMPANY_OWNER_AND_APP_OWNER"&&upper(updated?.company_owner_status)==="APPROVED"&&upper(updated?.app_owner_status)==="APPROVED")finalStatus="APPROVED";
    if(finalStatus!=="PENDING"){await c.env.DB.prepare("UPDATE critical_approval_requests SET status=?,approved_at=?,rejected_at=?,updated_at=? WHERE id=?").bind(finalStatus,finalStatus==="APPROVED"?timestamp:null,finalStatus==="REJECTED"?timestamp:null,timestamp,id).run();await addEvent(c,id,text(row.main_company_slug),text(current.id),finalStatus,"",{policy});}
    const final=await c.env.DB.prepare("SELECT * FROM critical_approval_requests WHERE id=? LIMIT 1").bind(id).first<AnyRow>();
    return c.json({ok:true,data:{...final,approvalPolicyLabel:approvalPolicyLabel(final?.approval_policy)}});
  });
}