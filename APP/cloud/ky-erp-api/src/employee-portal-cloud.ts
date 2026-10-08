// @ts-nocheck
// KY ERP: Firma + IK Aylik personeli + vasif + kriptografik cihaz yetkisi.
// Bu modül bordro, maas, avans ve mesai verisini ASLA sorgulamaz/dondurmez.
import { hash } from "bcryptjs";
import { getAuthenticatedUser } from "./auth-cloud";
import { calculateStatutoryAnnualLeave, calculateAnnualLeaveBalance } from "./ik-relational-cloud";
import { savePersonnelProductionEntry } from "./production-runtime-v2";

const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const roleOf = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const OCCUPATIONS = new Set(["PERSONEL", "MAKINACI", "NUMUNECI", "BOYACI"]);
const DEVICE_KINDS = new Set(["MOBILE", "WORKPLACE"]);
const limitLabel = (value: unknown) => text(value).slice(0, 100);
const err = (c: any, status: number, code: string, message: string) => c.json({ ok:false, error:{code,message} },status);
const ok = (c: any, data: unknown) => {c.header("Cache-Control","no-store");return c.json({ok:true,data});};
async function bodyOf(c: any) {try {const x=await c.req.json();return x && typeof x==="object"&&!Array.isArray(x)?x:{};}catch{return {};}}
async function ready(c:any) {
  const results=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ky_employee_portal_accounts','ky_employee_portal_devices','ky_employee_portal_approvers')").all();
  return (results.results||[]).length===3;
}
async function ownAccount(c:any) {
  const user=await getAuthenticatedUser(c);
  if(!user) return null;
  const account=await c.env.DB.prepare("SELECT a.*,u.is_active AS login_active FROM ky_employee_portal_accounts a JOIN auth_users u ON u.id=a.auth_user_id WHERE a.auth_user_id=? AND a.is_active=1 AND u.is_active=1 LIMIT 1").bind(user.id).first();
  if(!account || text(account.main_company_slug)!==text(user.mainCompanySlug)) return null;
  return {user,account};
}
function localCompany(user:any, requested:unknown) {
  const role=roleOf(user?.role);
  return role==="SUPER_ADMIN"||role==="ADMIN"?text(requested||user.mainCompanySlug):text(user.mainCompanySlug);
}
async function manager(c:any,companyRequested:unknown,needOwner=false) {
  const user=await getAuthenticatedUser(c);if(!user)return null;
  const role=roleOf(user.role),company=localCompany(user,companyRequested);
  if(!company || role==="PERSONNEL")return null;
  // Personel hesabina sonradan rol verilse bile firma cihaz idaresi yapamaz.
  const portal=await c.env.DB.prepare("SELECT id FROM ky_employee_portal_accounts WHERE auth_user_id=? LIMIT 1").bind(user.id).first();
  if(portal)return null;
  const owner=role==="SUPER_ADMIN"||role==="ADMIN"||role==="COMPANY_ADMIN";
  if(needOwner&&!owner)return null;
  if(!owner) {
    const grant=await c.env.DB.prepare("SELECT user_id FROM ky_employee_portal_approvers WHERE user_id=? AND main_company_slug=? LIMIT 1").bind(user.id,company).first();
    if(!grant)return null;
  }
  if(!(role==="SUPER_ADMIN"||role==="ADMIN") && company!==text(user.mainCompanySlug))return null;
  const companyRow=await c.env.DB.prepare("SELECT slug FROM main_companies WHERE slug=? AND COALESCE(is_active,1)<>0 LIMIT 1").bind(company).first();
  if(!companyRow)return null;
  return {user,company,owner};
}
async function audit(c:any,actor:string,target:string,company:string,action:string,details:any={}) {
  try {await c.env.DB.prepare("INSERT INTO auth_security_audit (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at) VALUES (?,?,?,?,?,NULL,NULL,?,?)").bind(crypto.randomUUID(),actor||null,target||null,company,action,JSON.stringify(details),nowIso()).run();}catch(e){console.error("KY_PERSONNEL_AUDIT",e);}
}
function base64Bytes(value:string) {
  const base=text(value).replace(/-/g,"+").replace(/_/g,"/");
  const binary=atob(base+"=".repeat((4-base.length%4)%4));
  return Uint8Array.from(binary,(ch)=>ch.charCodeAt(0));
}
async function sha256(value:string) {
  const d=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return Array.from(d,x=>x.toString(16).padStart(2,"0")).join("");
}
async function authorizedDevice(c:any,context:any) {
  const id=text(c.req.header("X-KYERP-Employee-Device")), ts=text(c.req.header("X-KYERP-Employee-Timestamp"));
  const nonce=text(c.req.header("X-KYERP-Employee-Nonce")), sig=text(c.req.header("X-KYERP-Employee-Signature"));
  if(!id||!ts||!nonce||!sig||!/^[a-zA-Z0-9_-]{15,100}$/.test(nonce))return null;
  if(!Number.isFinite(Number(ts))||Math.abs(Date.now()-Number(ts))>90000)return null;
  const device=await c.env.DB.prepare("SELECT * FROM ky_employee_portal_devices WHERE id=? AND account_user_id=? AND main_company_slug=? AND status='APPROVED' AND revoked_at IS NULL LIMIT 1").bind(id,context.user.id,context.account.main_company_slug).first();
  if(!device)return null;
  if(device.kind==="MOBILE"&&!Number(context.account.mobile_enabled))return null;
  if(device.kind==="WORKPLACE"&&!Number(context.account.workplace_enabled))return null;
  try {
    const jwk=JSON.parse(device.public_key_jwk);
    if(jwk.kty!=="EC"||jwk.crv!=="P-256")return null;
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    const raw=await c.req.raw.clone().text();
    if(raw.length>100000)return null;
    const bodyHash=await sha256(raw);
    const path=new URL(c.req.url).pathname;
    const signed=["KYERP-EMP-DEVICE-V1",id,c.req.method.toUpperCase(),path,ts,nonce,context.user.id,bodyHash].join("|");
    const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,base64Bytes(sig),new TextEncoder().encode(signed));
    if(!valid)return null;
    // Nonce tek kullanimlidir; tekrar gonderilen imza kabul edilmez.
    const result=await c.env.DB.prepare("INSERT OR IGNORE INTO ky_employee_portal_nonces(nonce,device_id,expires_at) VALUES (?,?,?)").bind(nonce,id,new Date(Date.now()+120000).toISOString()).run();
    if(Number(result?.meta?.changes||0)!==1)return null;
    c.executionCtx?.waitUntil?.(c.env.DB.prepare("DELETE FROM ky_employee_portal_nonces WHERE expires_at<?").bind(nowIso()).run());
    c.executionCtx?.waitUntil?.(c.env.DB.prepare("UPDATE ky_employee_portal_devices SET last_seen_at=? WHERE id=?").bind(nowIso(),id).run());
    return device;
  }catch(e){return null;}
}
async function prove(c:any) {
  if(!(await ready(c)))return {response:err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 personel erisim veritabani gecisi gereklidir.")};
  const ctx=await ownAccount(c);
  if(!ctx)return {response:err(c,403,"PERSONNEL_ACCOUNT_REQUIRED","Firma personel erisim hesabi bulunamadi.")};
  if(!text(ctx.account.activated_at))return {response:err(c,403,"PERSONNEL_NOT_APPROVED","Personel hesabi onayi bekleniyor.")};
  const device=await authorizedDevice(c,ctx);
  if(!device)return {response:err(c,403,"PERSONNEL_DEVICE_REQUIRED","Bu cihaz onayli degil veya cihaz imzasi dogrulanamadi.")};
  return {...ctx,device};
}
function dateInIstanbul() {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  return [parts.find(x=>x.type==="year")?.value,parts.find(x=>x.type==="month")?.value,parts.find(x=>x.type==="day")?.value].join("-");
}
async function ownInfo(c:any,ctx:any) {
  const company=text(ctx.account.main_company_slug),employeeId=text(ctx.account.employee_id);
  // KASITLI SECIM: salary/road_allowance/bank/cash/payroll/sgk veya TCKN kolonu yok.
  const person=await c.env.DB.prepare("SELECT e.id,e.code,e.full_name,e.department,e.title,e.hire_date,e.annual_leave_entitlement,e.annual_leave_carryover,s.card_no FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=? LIMIT 1").bind(employeeId,company).first();
  if(!person)return null;
  const today=dateInIstanbul(),year=Number(today.slice(0,4)),lastYear=year-1;
  const since=String(lastYear)+"-01-01";
  const [clockRows,leaveRows,profileRow,adjustRows]=await Promise.all([
    c.env.DB.prepare("SELECT work_date,event_time FROM ik_time_clock_events WHERE main_company_id=? AND employee_id=? AND work_date>=? AND work_date<=? ORDER BY work_date DESC,event_time ASC LIMIT 250").bind(company,employeeId,String(year)+"-01-01",today).all(),
    c.env.DB.prepare("SELECT start_date,end_date,day_count,record_type FROM hr_leave_records_v2 WHERE employee_id=? AND UPPER(record_type) LIKE '%YILLIK%' AND start_date>=? AND start_date<=? ORDER BY start_date DESC").bind(employeeId,since,today).all(),
    c.env.DB.prepare("SELECT data FROM json_store WHERE scope='IK_LEAVE_PROFILE' AND main_company_slug=? AND file_name=? LIMIT 1").bind(company,company+":"+employeeId).first(),
    c.env.DB.prepare("SELECT data FROM json_store WHERE scope='IK_LEAVE_BALANCE_ADJUSTMENT' AND main_company_slug=? AND file_name LIKE ?").bind(company,company+":"+employeeId+":%").all(),
  ]);
  const profile=JSON.parse(text(profileRow?.data)||"{}");
  const adjustment=(Array.isArray(profile.adjustments)?profile.adjustments:[]).reduce((s:any,r:any)=>s+Number(r.days||0),0)
    +(adjustRows.results||[]).reduce((s:any,r:any)=>{try{return s+Number(JSON.parse(r.data).days||0);}catch{return s;}},0);
  const leaveItems=(leaveRows.results||[]).map((row:any)=>({startDate:text(row.start_date),endDate:text(row.end_date),days:Number(row.day_count||0)}));
  const usedIn=(y:number)=>leaveItems.filter((x:any)=>x.startDate.startsWith(String(y))).reduce((s:number,x:any)=>s+x.days,0);
  const statutory=calculateStatutoryAnnualLeave(person.hire_date,profile.birthDate,today);
  const entitlement=Math.max(Number(person.annual_leave_entitlement||0),statutory.entitlementDays);
  const carryover=Number(person.annual_leave_carryover||0);
  const used=usedIn(year),balance=calculateAnnualLeaveBalance({entitlement,carryover,adjustment,used});
  const days=new Map();
  for(const row of clockRows.results||[]) {
    const date=text(row.work_date); if(!days.has(date))days.set(date,[]);
    days.get(date).push(text(row.event_time).slice(0,5));
  }
  return {
    person:{id:employeeId,code:text(person.code),fullName:text(person.full_name),department:text(person.department),occupation:text(ctx.account.occupation),machineId:text(ctx.account.machine_id),cardNo:text(person.card_no),hireDate:text(person.hire_date).slice(0,10)},
    attendance:Array.from(days,([date,stamps])=>({date,stamps,firstStamp:stamps[0]||"",lastStamp:stamps.length>1?stamps[stamps.length-1]:"",incomplete:stamps.length===1})),
    annualLeave:{year,previousYear:lastYear,entitlement,carryover,adjustment,usedThisYear:used,usedPreviousYear:usedIn(lastYear),annualRight:balance.annualRight,remaining:balance.balance,nextEntitlementDate:statutory.nextEntitlementDate,history:leaveItems},
    capabilities:{selfInfo:true,workForm:text(ctx.account.occupation)==="MAKINACI"?"MACHINE_ENTRY":text(ctx.account.occupation)==="NUMUNECI"?"SAMPLE_FORM_PLANNED":text(ctx.account.occupation)==="BOYACI"?"DYE_FORM_PLANNED":"SELF_ONLY",deviceKind:ctx.device.kind},
  };
}
export function registerEmployeePortalRoutes(app:any) {
  // Firma secimi icin yalniz aktif sirket adlari yayinlanir; kisi veya mali veri yok.
  app.get("/api/employee-portal/companies",async(c:any)=>{
    const rows=await c.env.DB.prepare("SELECT slug,name FROM main_companies WHERE COALESCE(is_active,1)<>0 ORDER BY name COLLATE NOCASE").all();
    return ok(c,(rows.results||[]).map((row:any)=>({slug:text(row.slug),name:text(row.name)})));
  });
  app.get("/api/employee-portal/account",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 personel erisim semasi gerekli.");
    const ctx=await ownAccount(c);if(!ctx)return err(c,403,"PERSONNEL_ACCOUNT_REQUIRED","Personel hesabi bulunamadi.");
    const devices=await c.env.DB.prepare("SELECT id,kind,label,status,created_at,approved_at,revoked_at FROM ky_employee_portal_devices WHERE account_user_id=? ORDER BY created_at DESC").bind(ctx.user.id).all();
    return ok(c,{userId:ctx.user.id,companySlug:ctx.account.main_company_slug,occupation:ctx.account.occupation,accountApproved:Boolean(ctx.account.activated_at),mobileEnabled:Boolean(ctx.account.mobile_enabled),workplaceEnabled:Boolean(ctx.account.workplace_enabled),devices:devices.results||[]});
  });
  app.post("/api/employee-portal/devices/register",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 personel erisim semasi gerekli.");
    const ctx=await ownAccount(c);if(!ctx)return err(c,403,"PERSONNEL_ACCOUNT_REQUIRED","Personel hesabi bulunamadi.");
    const body=await bodyOf(c),kind=roleOf(body.kind),label=limitLabel(body.label);
    const key=body.publicKeyJwk;
    if(!DEVICE_KINDS.has(kind)||!label||!key||key.kty!=="EC"||key.crv!=="P-256"||!text(key.x)||!text(key.y))return err(c,400,"DEVICE_FIELDS_INVALID","Cihaz adi, turu ve P-256 acik anahtari gerekli.");
    if((kind==="MOBILE"&&!ctx.account.mobile_enabled)||(kind==="WORKPLACE"&&!ctx.account.workplace_enabled))return err(c,403,"DEVICE_KIND_NOT_ALLOWED","Bu hesap icin cihaz turu acik degil.");
    try{await crypto.subtle.importKey("jwk",key,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);}catch{return err(c,400,"DEVICE_KEY_INVALID","Cihaz acik anahtari gecersiz.");}
    const count=await c.env.DB.prepare("SELECT COUNT(*) AS total FROM ky_employee_portal_devices WHERE account_user_id=? AND status IN ('PENDING','APPROVED')").bind(ctx.user.id).first();
    if(Number(count?.total||0)>=5)return err(c,429,"DEVICE_LIMIT","En fazla bes aktif veya bekleyen cihaz kaydi olabilir.");
    const id=crypto.randomUUID(),timestamp=nowIso();
    await c.env.DB.prepare("INSERT INTO ky_employee_portal_devices(id,main_company_slug,account_user_id,kind,label,public_key_jwk,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'PENDING',?,?)").bind(id,ctx.account.main_company_slug,ctx.user.id,kind,label,JSON.stringify({kty:"EC",crv:"P-256",x:key.x,y:key.y,ext:true}),timestamp,timestamp).run();
    await audit(c,ctx.user.id,ctx.user.id,ctx.account.main_company_slug,"PERSONNEL_DEVICE_REQUESTED",{id,kind,label});
    return ok(c,{id,status:"PENDING",kind,label,accountApproved:Boolean(ctx.account.activated_at)});
  });
  app.get("/api/employee-portal/me",async(c:any)=>{
    const ctx=await prove(c);if(ctx.response)return ctx.response;
    const data=await ownInfo(c,ctx);
    return data?ok(c,data):err(c,404,"IK_PERSON_NOT_FOUND","Ik Aylik personel karti bulunamadi.");
  });
  app.get("/api/employee-portal/work",async(c:any)=>{
    const ctx=await prove(c);if(ctx.response)return ctx.response;
    const occupation=roleOf(ctx.account.occupation);
    if(occupation!=="MAKINACI")return ok(c,{occupation,form:occupation==="BOYACI"?"DYE_FORM_PLANNED":occupation==="NUMUNECI"?"SAMPLE_FORM_PLANNED":"SELF_ONLY",models:[]});
    const rows=await c.env.DB.prepare("SELECT id,model_name,model_code FROM model_records WHERE main_company_slug=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 80").bind(ctx.account.main_company_slug).all();
    return ok(c,{occupation,form:"MACHINE_ENTRY",machineId:text(ctx.account.machine_id),models:(rows.results||[]).map((x:any)=>({id:x.id,name:text(x.model_name),code:text(x.model_code)}))});
  });
  app.post("/api/employee-portal/work/machine-production",async(c:any)=>{
    const ctx=await prove(c);if(ctx.response)return ctx.response;
    if(roleOf(ctx.account.occupation)!=="MAKINACI"||!text(ctx.account.machine_id))return err(c,403,"MACHINE_FORM_REQUIRED","Bu personelin makinaci formu veya makine atamasi yok.");
    const body=await bodyOf(c);
    const person=await c.env.DB.prepare("SELECT full_name,status FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1").bind(ctx.account.employee_id,ctx.account.main_company_slug).first();
    if(!person||roleOf(person.status)==="PASIF")return err(c,403,"PERSONNEL_INACTIVE","Aktif IK personel kaydi gerekli.");
    try {
      const row=await savePersonnelProductionEntry(c,{
        companySlug:ctx.account.main_company_slug,employeeId:ctx.account.employee_id,
        machineId:ctx.account.machine_id,operatorName:text(person.full_name),
        userId:ctx.user.id,deviceId:ctx.device.id,date:dateInIstanbul(),
      },body);
      await audit(c,ctx.user.id,ctx.user.id,ctx.account.main_company_slug,"PERSONNEL_MACHINE_PRODUCTION_RECORDED",{productionId:row.id,modelId:row.modelId,machineId:row.machineId,quantity:row.quantity});
      return ok(c,row);
    }catch(error){return err(c,409,"PRODUCTION_NOT_SAVED",error instanceof Error?error.message:"Uretim kaydi tamamlanamadi.");}
  });
  app.get("/api/employee-portal/admin/employees",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 semasi gerekli.");
    const actor=await manager(c,c.req.query("companySlug"),true);if(!actor)return err(c,403,"COMPANY_ADMIN_REQUIRED","Firma sahibi veya yetkili firma yoneticisi gerekli.");
    const rows=await c.env.DB.prepare("SELECT e.id,e.code,e.full_name,e.department,e.title,e.status,a.auth_user_id,a.username_local,a.occupation,a.machine_id,a.mobile_enabled,a.workplace_enabled,a.activated_at,a.is_active,u.is_active AS login_active FROM hr_monthly_employees e LEFT JOIN ky_employee_portal_accounts a ON a.employee_id=e.id AND a.main_company_slug=e.main_company_id LEFT JOIN auth_users u ON u.id=a.auth_user_id WHERE e.main_company_id=? ORDER BY e.full_name COLLATE NOCASE").bind(actor.company).all();
    const pending=await c.env.DB.prepare("SELECT d.id,d.account_user_id,d.kind,d.label,d.status,d.created_at,a.employee_id,e.full_name FROM ky_employee_portal_devices d JOIN ky_employee_portal_accounts a ON a.auth_user_id=d.account_user_id JOIN hr_monthly_employees e ON e.id=a.employee_id WHERE d.main_company_slug=? AND d.status='PENDING' ORDER BY d.created_at DESC").bind(actor.company).all();
    const approved=await c.env.DB.prepare("SELECT d.id,d.kind,d.label,d.created_at,d.approved_at,d.account_user_id,e.full_name FROM ky_employee_portal_devices d JOIN ky_employee_portal_accounts a ON a.auth_user_id=d.account_user_id JOIN hr_monthly_employees e ON e.id=a.employee_id AND e.main_company_id=a.main_company_slug WHERE d.main_company_slug=? AND d.status='APPROVED' ORDER BY d.approved_at DESC LIMIT 100").bind(actor.company).all();
    return ok(c,{companySlug:actor.company,employees:(rows.results||[]).map((x:any)=>({employeeId:x.id,code:x.code,fullName:x.full_name,department:x.department,title:x.title,status:x.status,accountUserId:x.auth_user_id||"",username:x.username_local||"",occupation:x.occupation||"",machineId:x.machine_id||"",mobileEnabled:Boolean(x.mobile_enabled),workplaceEnabled:Boolean(x.workplace_enabled),approved:Boolean(x.activated_at),active:Boolean(x.is_active)&&Boolean(x.login_active)})),pendingDevices:pending.results||[],approvedDevices:approved.results||[]});
  });
  app.post("/api/employee-portal/admin/accounts",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 semasi gerekli.");
    const body=await bodyOf(c),actor=await manager(c,body.companySlug,true);
    if(!actor)return err(c,403,"COMPANY_ADMIN_REQUIRED","Firma sahibi gerekli.");
    const employeeId=text(body.employeeId),local=text(body.username).toLocaleLowerCase("tr-TR");
    const occupation=roleOf(body.occupation||"PERSONEL"),machineId=text(body.machineId);
    const password=String(body.password||"");
    if(!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(local)||!OCCUPATIONS.has(occupation)||password.length<10||!employeeId)return err(c,400,"ACCOUNT_FIELDS_INVALID","Personel, 3-40 karakter kullanici adi, vasif ve en az 10 karakter parola gerekli.");
    if(occupation==="MAKINACI"&&!machineId)return err(c,400,"MACHINE_REQUIRED","Makinaci icin makine atanmalidir.");
    const person=await c.env.DB.prepare("SELECT id,full_name,status FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1").bind(employeeId,actor.company).first();
    if(!person||roleOf(person.status)==="PASIF")return err(c,404,"PERSON_NOT_ACTIVE","Firmada aktif IK Aylik personeli bulunamadi.");
    const username=actor.company+"--"+local,uid=crypto.randomUUID(),id=crypto.randomUUID(),timestamp=nowIso();
    const statements=[
      c.env.DB.prepare("INSERT INTO auth_users(id,username,password_hash,full_name,role,is_active,must_change_password,created_at,updated_at) VALUES (?,?,?,?, 'PERSONNEL',1,0,?,?)").bind(uid,username,await hash(password,12),text(person.full_name),timestamp,timestamp),
      c.env.DB.prepare("INSERT INTO auth_user_security(user_id,email,main_company_slug,role_override,mfa_enabled,email_verified,approval_required,google_mfa_enabled,microsoft_mfa_enabled,login_policy,session_seconds,created_at,updated_at) VALUES (?,NULL,?,NULL,0,0,0,0,0,'PASSWORD_ONLY',28800,?,?)").bind(uid,actor.company,timestamp,timestamp),
      c.env.DB.prepare("INSERT INTO ky_employee_portal_accounts(id,main_company_slug,employee_id,auth_user_id,username_local,occupation,machine_id,mobile_enabled,workplace_enabled,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,actor.company,employeeId,uid,local,occupation,machineId,body.mobileEnabled===false?0:1,body.workplaceEnabled===true?1:0,actor.user.id,timestamp,timestamp),
    ];
    try{await c.env.DB.batch(statements);}catch(e){return err(c,409,"PERSONNEL_ACCOUNT_CONFLICT","Personel zaten kayitli veya kullanici adi tekrar ediyor. Yarim kayit olusturulmadi.");}
    await audit(c,actor.user.id,uid,actor.company,"PERSONNEL_ACCOUNT_CREATED",{employeeId,occupation,machineId});
    return ok(c,{id,userId:uid,username:local,loginUsername:username,occupation,accountApproved:false});
  });
  // Personel hesabinin ilk onayi cihaz onayindan AYRI ve yalniz firma yoneticisine aittir.
  app.post("/api/employee-portal/admin/accounts/:userId/decision",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 semasi gerekli.");
    const body=await bodyOf(c),actor=await manager(c,body.companySlug,true);
    if(!actor)return err(c,403,"COMPANY_ADMIN_REQUIRED","Firma yetkilisi gerekli.");
    const decision=roleOf(body.decision);
    if(!["APPROVE","REVOKE"].includes(decision))return err(c,400,"ACCOUNT_DECISION_INVALID","Hesabi onaylama veya onayi kaldirma karari gerekli.");
    const target=await c.env.DB.prepare("SELECT id,auth_user_id,is_active,activated_at FROM ky_employee_portal_accounts WHERE auth_user_id=? AND main_company_slug=? LIMIT 1").bind(c.req.param("userId"),actor.company).first();
    if(!target)return err(c,404,"PERSONNEL_ACCOUNT_NOT_FOUND","Firma personel hesabi bulunamadi.");
    if(decision==="APPROVE"&&!Number(target.is_active))return err(c,409,"PERSONNEL_ACCOUNT_INACTIVE","Pasif personel hesabi onaylanamaz.");
    const timestamp=nowIso();
    if(decision==="APPROVE"){
      const result=await c.env.DB.prepare("UPDATE ky_employee_portal_accounts SET activated_at=?,approved_by_user_id=?,updated_at=? WHERE id=? AND main_company_slug=? AND activated_at IS NULL").bind(timestamp,actor.user.id,timestamp,target.id,actor.company).run();
      if(Number(result?.meta?.changes||0)!==1)return err(c,409,"ACCOUNT_STATE_CHANGED","Hesap zaten onayli veya durumu degismis.");
    }else{
      // Hesap onayi geri alindiginda mevcut cihazlar da iptal edilir; tekrar onay atlanamaz.
      if(!text(target.activated_at))return err(c,409,"ACCOUNT_STATE_CHANGED","Hesap zaten onaysiz.");
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE ky_employee_portal_accounts SET activated_at=NULL,approved_by_user_id=NULL,updated_at=? WHERE id=? AND main_company_slug=?").bind(timestamp,target.id,actor.company),
        c.env.DB.prepare("UPDATE ky_employee_portal_devices SET status='REVOKED',revoked_at=?,updated_at=? WHERE account_user_id=? AND main_company_slug=? AND status='APPROVED'").bind(timestamp,timestamp,target.auth_user_id,actor.company),
        c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE user_id=? AND revoked_at IS NULL").bind(timestamp,target.auth_user_id),
      ]);
    }
    await audit(c,actor.user.id,target.auth_user_id,actor.company,"PERSONNEL_ACCOUNT_"+(decision==="APPROVE"?"APPROVED":"APPROVAL_REVOKED"));
    return ok(c,{userId:target.auth_user_id,accountApproved:decision==="APPROVE"});
  });
  app.patch("/api/employee-portal/admin/accounts/:userId",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 semasi gerekli.");
    const body=await bodyOf(c),actor=await manager(c,body.companySlug,true);if(!actor)return err(c,403,"COMPANY_ADMIN_REQUIRED","Firma sahibi gerekli.");
    const target=await c.env.DB.prepare("SELECT * FROM ky_employee_portal_accounts WHERE auth_user_id=? AND main_company_slug=? LIMIT 1").bind(c.req.param("userId"),actor.company).first();
    if(!target)return err(c,404,"PERSONNEL_NOT_FOUND","Personel erisimi bulunamadi.");
    const occupation=roleOf(body.occupation||target.occupation),machineId=body.machineId===undefined?text(target.machine_id):text(body.machineId);
    if(!OCCUPATIONS.has(occupation)||(occupation==="MAKINACI"&&!machineId))return err(c,400,"PERSONNEL_FORM_INVALID","Vasif veya makine gecersiz.");
    const mobile=body.mobileEnabled===undefined?Number(target.mobile_enabled):body.mobileEnabled===true?1:0;
    const workplace=body.workplaceEnabled===undefined?Number(target.workplace_enabled):body.workplaceEnabled===true?1:0;
    const active=body.isActive===undefined?Number(target.is_active):body.isActive===true?1:0;
    const timestamp=nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE ky_employee_portal_accounts SET occupation=?,machine_id=?,mobile_enabled=?,workplace_enabled=?,is_active=?,updated_at=? WHERE id=? AND main_company_slug=?").bind(occupation,machineId,mobile,workplace,active,timestamp,target.id,actor.company),
      c.env.DB.prepare("UPDATE auth_users SET is_active=?,updated_at=? WHERE id=?").bind(active,timestamp,target.auth_user_id),
      ...(active?[]:[c.env.DB.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE user_id=? AND revoked_at IS NULL").bind(timestamp,target.auth_user_id)]),
    ]);
    await audit(c,actor.user.id,target.auth_user_id,actor.company,"PERSONNEL_ACCESS_UPDATED",{occupation,machineId,mobile,workplace,active});
    return ok(c,{userId:target.auth_user_id,occupation,machineId,mobileEnabled:!!mobile,workplaceEnabled:!!workplace,isActive:!!active});
  });
  app.post("/api/employee-portal/admin/approvers",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 semasi gerekli.");
    const body=await bodyOf(c),actor=await manager(c,body.companySlug,true);
    if(!actor)return err(c,403,"COMPANY_ADMIN_REQUIRED","Firma sahibi gerekli.");
    const userId=text(body.userId),enabled=body.enabled===true;
    const user=await c.env.DB.prepare("SELECT u.id,u.role,s.main_company_slug,s.role_override FROM auth_users u JOIN auth_user_security s ON s.user_id=u.id WHERE u.id=? AND u.is_active=1 LIMIT 1").bind(userId).first();
    if(!user||user.main_company_slug!==actor.company||roleOf(user.role)==="PERSONNEL"||roleOf(user.role_override)==="SUPER_ADMIN")return err(c,403,"APPROVER_NOT_ELIGIBLE","Ayni firmadaki yetkili bir ERP kullanicisi secin.");
    if(enabled)await c.env.DB.prepare("INSERT INTO ky_employee_portal_approvers(main_company_slug,user_id,granted_by_user_id,created_at) VALUES (?,?,?,?) ON CONFLICT(main_company_slug,user_id) DO UPDATE SET granted_by_user_id=excluded.granted_by_user_id").bind(actor.company,userId,actor.user.id,nowIso()).run();
    else await c.env.DB.prepare("DELETE FROM ky_employee_portal_approvers WHERE main_company_slug=? AND user_id=?").bind(actor.company,userId).run();
    await audit(c,actor.user.id,userId,actor.company,enabled?"PERSONNEL_APPROVER_GRANTED":"PERSONNEL_APPROVER_REVOKED");
    return ok(c,{userId,enabled});
  });
  app.get("/api/employee-portal/admin/pending",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 semasi gerekli.");
    const actor=await manager(c,c.req.query("companySlug"));if(!actor)return err(c,403,"DEVICE_APPROVER_REQUIRED","Cihaz onay yetkisi gerekli.");
    const rows=await c.env.DB.prepare("SELECT d.id,d.kind,d.label,d.created_at,a.username_local,a.occupation,e.full_name FROM ky_employee_portal_devices d JOIN ky_employee_portal_accounts a ON a.auth_user_id=d.account_user_id JOIN hr_monthly_employees e ON e.id=a.employee_id AND e.main_company_id=a.main_company_slug WHERE d.main_company_slug=? AND d.status='PENDING' ORDER BY d.created_at DESC").bind(actor.company).all();
    return ok(c,rows.results||[]);
  });
  app.post("/api/employee-portal/admin/devices/:id/decision",async(c:any)=>{
    if(!(await ready(c)))return err(c,503,"PERSONNEL_SCHEMA_NOT_READY","0060 semasi gerekli.");
    const body=await bodyOf(c),actor=await manager(c,body.companySlug);if(!actor)return err(c,403,"DEVICE_APPROVER_REQUIRED","Cihaz onay yetkisi gerekli.");
    const decision=roleOf(body.decision);if(!["APPROVE","DENY","REVOKE"].includes(decision))return err(c,400,"DEVICE_DECISION_INVALID","Onay, ret veya iptal secilmeli.");
    const device=await c.env.DB.prepare("SELECT d.*,a.is_active AS account_active,a.mobile_enabled,a.workplace_enabled FROM ky_employee_portal_devices d JOIN ky_employee_portal_accounts a ON a.auth_user_id=d.account_user_id AND a.main_company_slug=d.main_company_slug WHERE d.id=? AND d.main_company_slug=? LIMIT 1").bind(c.req.param("id"),actor.company).first();
    if(!device)return err(c,404,"DEVICE_NOT_FOUND","Firma cihaz kaydi bulunamadi.");
    if(decision==="APPROVE"&&!device.account_active)return err(c,409,"ACCOUNT_INACTIVE","Pasif personel cihazi onaylanamaz.");
    if(decision==="APPROVE"&&((device.kind==="MOBILE"&&!device.mobile_enabled)||(device.kind==="WORKPLACE"&&!device.workplace_enabled)))return err(c,409,"DEVICE_KIND_BLOCKED","Personel kartinda bu cihaz turu acik degil.");
    const wanted=decision==="APPROVE"?"APPROVED":decision==="DENY"?"DENIED":"REVOKED";
    const expected=decision==="REVOKE"?"APPROVED":"PENDING",timestamp=nowIso();
    const result=await c.env.DB.prepare("UPDATE ky_employee_portal_devices SET status=?,approved_by_user_id=?,approved_at=CASE WHEN ?='APPROVED' THEN ? ELSE approved_at END,revoked_at=CASE WHEN ?='REVOKED' THEN ? ELSE revoked_at END,updated_at=? WHERE id=? AND main_company_slug=? AND status=?").bind(wanted,actor.user.id,wanted,timestamp,wanted,timestamp,timestamp,device.id,actor.company,expected).run();
    if(Number(result?.meta?.changes||0)!==1)return err(c,409,"DEVICE_STATE_CHANGED","Cihaz karari daha once degistirilmis.");
    // Cihaz karari hesap onayini DEGISTIRMEZ. Iki onay birbirinden bagimsizdir.
    await audit(c,actor.user.id,device.account_user_id,actor.company,"PERSONNEL_DEVICE_"+wanted,{deviceId:device.id,kind:device.kind});
    return ok(c,{id:device.id,status:wanted,kind:device.kind});
  });
}
