// @ts-nocheck
/**
 * KY PDKS Unified — ONE authenticated and durable D1 administrative write engine.
 *
 * Successful DB.batch is atomic: command receipt, one business mutation,
 * obligatory audit evidence and pending synchronization outbox.
 * No terminal RAW, Firebird, annual TNF or payroll approval is performed.
 * All write clients must use stable requestId and query the receipt after a
 * transport timeout; blindly retrying with a new ID is prohibited.
 */
import type {Hono,Context} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";

type AppEnv={Bindings:Cloudflare.Env;Variables:{requestId:string;pdksCompany?:string}};
type Row=Record<string,any>;
const base="/api/ik/personnel-control/unified/commands";
const txTables=["ik_pdks_unified_commands","ik_pdks_unified_outbox","ik_audit_logs"];
const maxPayloadSize=16000;
import {validateUnifiedCommand,commandValue as val,commandFold as fold}
  from "./ik-pdks-unified-contract.mjs";
const fail=(c:Context<AppEnv>,code:string,message:string,status=400)=>
  c.json({ok:false,error:{code,message}},status as any);
async function digest(value:string){
  const raw=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(raw),v=>v.toString(16).padStart(2,"0")).join("");
}
async function first(c:Context<AppEnv>,sql:string,params:unknown[]=[]){
  return c.env.DB.prepare(sql).bind(...params).first<Row>();
}
async function checkTables(c:Context<AppEnv>,required:string[]){
  const list=[...new Set([...txTables,...required])];
  const result=await Promise.all(list.map((table)=>
    first(c,"SELECT name FROM sqlite_master WHERE type='table' AND name=?",[table])));
  return result.every(Boolean);
}
async function context(c:Context<AppEnv>){
  const user=await getAuthenticatedUser(c);
  if(!user)return null;
  const company=val(c.get("pdksCompany"));
  if(!company)return null; // set only by upstream permission/tenant middleware
  if(fold(user.role)==="DENETIM"||val(user.username).toLocaleLowerCase("tr-TR")==="denetim")return null;
  const scope=await first(c, "SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1",
    [user.id,company]).catch(()=>null);
  if(fold(scope?.scope)==="AUDIT")return null;
  return {user,company};
}
function checkEmployeeSql(){
  return `SELECT 1 FROM hr_monthly_employees e
   JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
   WHERE e.main_company_id=? AND e.id=? AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR'
   AND TRIM(COALESCE(s.card_no,''))<>'' LIMIT 1`;
}
async function preflight(c:Context<AppEnv>,company:string,action:string,p:Row){
  const isPerson=!!p.employeeId;
  const needs=["hr_monthly_employees","ik_person_card_settings","ik_monthly_close"];
  if(["work-group","assign-work-group"].includes(action))needs.push("ik_pdks_work_groups","ik_pdks_employee_groups");
  if(["personnel-group","assign-personnel-group"].includes(action))
    needs.push("ik_pdks_personnel_groups","ik_pdks_employee_personnel_groups");
  if(["service","assign-service"].includes(action))needs.push("ik_pdks_services","ik_pdks_employee_services");
  if(action==="holiday")needs.push("json_store");
  if(action==="leave")needs.push("ik_leave_plans","ik_leave_counting_policy","json_store");
  if(["advance","deduction","overtime"].includes(action))needs.push("hr_monthly_adjustments_v2");
  if(!(await checkTables(c,needs)))throw new Error("PDKS_MIGRATION_0060_REQUIRED");
  let old:Row={},localCardNo="";
  if(isPerson){
    const employee=await first(c,`SELECT s.card_no AS card_no FROM hr_monthly_employees e
      JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=? AND e.id=? AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR'
      AND TRIM(COALESCE(s.card_no,''))<>'' LIMIT 1`,[company,p.employeeId]);
    if(!employee)throw new Error("PDKS_PERSON_NOT_IN_TENANT");
    localCardNo=val(employee.card_no).padStart(5,"0");
  }
  const date=p.date||p.startDate||p.endDate||"";
  let lockedMonths:string[]=[];
  if(date){
    const start=p.startDate||date,end=p.endDate||date;
    const cursor=new Date(start+"T12:00:00Z"),max=new Date(end+"T12:00:00Z"),seen=new Set();
    while(cursor<=max){
      const d=cursor.toISOString().slice(0,7);seen.add(d);
      cursor.setUTCMonth(cursor.getUTCMonth()+1,1);
    }
    lockedMonths=[...seen];
    for(const ym of lockedMonths){
      const [year,month]=ym.split("-").map(Number);
      const row=await first(c,`SELECT is_locked FROM ik_monthly_close
        WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1`,[company,year,month]);
      if(Number(row?.is_locked||0)!==0)throw new Error("PDKS_PERIOD_LOCKED");
    }
  }
  const tableByAction={
    "work-group":["ik_pdks_work_groups","code",p.code],
    "personnel-group":["ik_pdks_personnel_groups","code",p.code],
    "service":["ik_pdks_services","code",p.code],
  };
  if(tableByAction[action]){
    const [table,key,value]=tableByAction[action];
    if(await first(c,`SELECT id FROM ${table} WHERE main_company_id=? AND ${key}=? LIMIT 1`,
      [company,value]))throw new Error("PDKS_DEFINITION_ALREADY_EXISTS");
  }
  const assignment={
    "assign-work-group":["ik_pdks_work_groups","ik_pdks_employee_groups","group_id",p.groupId],
    "assign-personnel-group":["ik_pdks_personnel_groups","ik_pdks_employee_personnel_groups",
      "personnel_group_id",p.personnelGroupId],
    "assign-service":["ik_pdks_services","ik_pdks_employee_services","service_id",p.serviceId],
  };
  if(assignment[action]){
    const [master,target,field,id]=assignment[action];
    if(!id||!await first(c,`SELECT id FROM ${master}
      WHERE main_company_id=? AND id=? AND active=1 LIMIT 1`,[company,id]))
      throw new Error("PDKS_MASTER_NOT_ACTIVE");
    old=await first(c,`SELECT ${field} AS previous FROM ${target}
      WHERE main_company_id=? AND employee_id=? LIMIT 1`,[company,p.employeeId])||{};
  }
  if(action==="holiday"){
    if(await first(c,`SELECT id FROM json_store WHERE scope='IK_OFFICIAL_HOLIDAY'
      AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) LIMIT 1`,
      ["pdks-holiday-"+p.date,company]))
      throw new Error("PDKS_HOLIDAY_ALREADY_EXISTS");
  }
  let leaveExtra=null;
  if(action==="leave"){
    const conflict=await first(c,`SELECT id FROM ik_leave_plans
      WHERE main_company_id=? AND employee_id=? AND status<>'CANCELLED'
      AND start_date<=? AND end_date>=? LIMIT 1`,
      [company,p.employeeId,p.endDate,p.startDate]);
    if(conflict)throw new Error("PDKS_LEAVE_DATE_CONFLICT");
    const days=[],excluded=[],holidayRows=await c.env.DB.prepare(`SELECT data FROM json_store
      WHERE scope='IK_OFFICIAL_HOLIDAY' AND (main_company_slug=? OR main_company_slug IS NULL)`)
      .bind(company).all<Row>();
    const holidays=new Map();
    for(const item of holidayRows.results||[]){
      try{const row=JSON.parse(val(item.data));if(row.date)holidays.set(row.date,row);}
      catch{}
    }
    for(let d=new Date(p.startDate+"T12:00:00Z"),end=p.endDate;d.toISOString().slice(0,10)<=end;
      d.setUTCDate(d.getUTCDate()+1)){
      const date=d.toISOString().slice(0,10),holiday=holidays.get(date);
      if(holiday?.halfDay)throw new Error("PDKS_HALF_DAY_LEAVE_NEEDS_APPROVAL");
      if(d.getUTCDay()===0||holiday){excluded.push(date);continue;}
      days.push(date);
    }
    if(p.recordType==="YILLIK"){
      const person=await first(c,`SELECT annual_leave_entitlement,annual_leave_carryover
        FROM hr_monthly_employees WHERE main_company_id=? AND id=? LIMIT 1`,
        [company,p.employeeId]);
      const used=await first(c,`SELECT COALESCE(SUM(counted_days),0) AS value
        FROM ik_leave_plans WHERE main_company_id=? AND employee_id=? AND status<>'CANCELLED'
        AND UPPER(record_type) LIKE '%YILLIK%'`,[company,p.employeeId]);
      const available=Number(person?.annual_leave_entitlement||0)+
        Number(person?.annual_leave_carryover||0)-Number(used?.value||0);
      if(days.length>available)throw new Error("PDKS_LEAVE_BALANCE_INSUFFICIENT");
    }
    const policy=await first(c,`SELECT max_concurrent_department
      FROM ik_leave_counting_policy WHERE main_company_id=? LIMIT 1`,[company]);
    const employee=await first(c,`SELECT department FROM hr_monthly_employees
      WHERE main_company_id=? AND id=? LIMIT 1`,[company,p.employeeId]);
    if(val(employee?.department)){
      const n=await first(c,`SELECT COUNT(*) AS total FROM ik_leave_plans lp
        JOIN hr_monthly_employees emp ON emp.id=lp.employee_id AND emp.main_company_id=lp.main_company_id
        WHERE lp.main_company_id=? AND lp.employee_id<>? AND lp.status<>'CANCELLED'
        AND emp.department=? AND lp.start_date<=? AND lp.end_date>=?`,
        [company,p.employeeId,employee.department,p.endDate,p.startDate]);
      if(Number(n?.total||0)>=Math.max(1,Number(policy?.max_concurrent_department||1)))
        throw new Error("PDKS_LEAVE_DEPARTMENT_CONFLICT");
    }
    leaveExtra={days,excluded,returnDate:new Date(Date.parse(p.endDate+"T12:00:00Z")+86400000)
      .toISOString().slice(0,10)};
  }
  return {old,lockedMonths,leaveExtra,localCardNo};
}
function batchOperation(c:Context<AppEnv>,company:string,actor:string,action:string,p:Row,
  id:string,stamp:string,extra:any){
  const db=c.env.DB;
  const sql=(text:string,...values:unknown[])=>db.prepare(text).bind(...values);
  const result={id,action,employeeId:p.employeeId||"",date:p.date||p.startDate||"",
    mainCompanyId:company,cloudState:"COMMITTED",localFDB:false,annualTNF:false};
  let statement:any;
  if(action==="work-group")
    statement=sql(`INSERT INTO ik_pdks_work_groups
      (id,main_company_id,code,name,entry_time,exit_time,late_tolerance,early_tolerance,active,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,1,?,?)`,id,company,p.code,p.name,p.entryTime,p.exitTime,
      p.lateTolerance,p.earlyTolerance,actor,stamp);
  else if(action==="personnel-group")
    statement=sql(`INSERT INTO ik_pdks_personnel_groups
      (id,main_company_id,code,name,personnel_class,require_punch,active,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,1,?,?)`,id,company,p.code,p.name,p.personnelClass,p.requirePunch?1:0,actor,stamp);
  else if(action==="service")
    statement=sql(`INSERT INTO ik_pdks_services
      (id,main_company_id,code,name,route_note,active,updated_by,updated_at)
      VALUES(?,?,?,?,?,1,?,?)`,id,company,p.code,p.name,p.routeNote,actor,stamp);
  else if(["assign-work-group","assign-personnel-group","assign-service"].includes(action)){
    const field=action==="assign-work-group"?"group_id":
      action==="assign-personnel-group"?"personnel_group_id":"service_id";
    const table=action==="assign-work-group"?"ik_pdks_employee_groups":
      action==="assign-personnel-group"?"ik_pdks_employee_personnel_groups":"ik_pdks_employee_services";
    const target=p.groupId||p.personnelGroupId||p.serviceId;
    statement=sql(`INSERT INTO ${table}
      (main_company_id,employee_id,${field},updated_by,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(main_company_id,employee_id)
      DO UPDATE SET ${field}=excluded.${field},updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      company,p.employeeId,target,actor,stamp);
    result.id=id; // receipt ID is not the assignment row ID
    result.assignment={employeeId:p.employeeId,[field==="group_id"?"groupId":field==="service_id"?"serviceId":"personnelGroupId"]:target};
  }else if(action==="holiday"){
    const data={id:"pdks-holiday-"+p.date,date:p.date,name:p.name,halfDay:p.halfDay,
      note:p.note,updatedAt:stamp};
    statement=sql(`INSERT INTO json_store
      (id,scope,main_company_slug,file_name,data,created_at,updated_at)
      VALUES(?,'IK_OFFICIAL_HOLIDAY',?,?,?,?,?)`,
      id,company,"pdks-holiday-"+p.date,JSON.stringify(data),stamp,stamp);
    result.date=p.date;result.businessId=data.id;
  }else if(action==="leave"){
    const x=extra.leaveExtra;
    statement=sql(`INSERT INTO ik_leave_plans
      (id,main_company_id,employee_id,record_type,start_date,end_date,return_date,
       counted_days,excluded_json,status,document_no,note,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'APPROVED','',?,?,?,?)`,
      id,company,p.employeeId,p.recordType==="YILLIK"?"Yıllık izin":p.recordType,
      p.startDate,p.endDate,x.returnDate,x.days.length,JSON.stringify(x.excluded),
      p.note,actor,stamp,stamp);
    result.startDate=p.startDate;result.endDate=p.endDate;result.countedDays=x.days.length;
  }else if(["advance","deduction","overtime"].includes(action)){
    const typ=action==="advance"?"Avans":action==="deduction"?"Kesinti":p.adjustmentType;
    statement=sql(`INSERT INTO hr_monthly_adjustments_v2
      (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,
       payroll_effect,note,status)
      VALUES(?,?,?,?,?,?,?,?,?,'APPROVED')`,
      id,p.employeeId,p.date,typ,action==="overtime"?p.hourOrDay:0,p.amount,
      action==="overtime"?p.paymentMethod:"Elden",
      action==="overtime"?"Bordroya ekle":"Bordrodan düş",p.note);
    result.date=p.date;result.amount=p.amount;
  }else throw new Error("ACTION_UNAVAILABLE");
  return {statement,result};
}
function invariantAudit(c:Context<AppEnv>,company:string,action:string,p:Row,id:string,
  actor:string,stamp:string,old:Row,lockedMonths:string[]){
  // Evaluated inside the SAME SQLite batch transaction; failure of mandatory
  // NOT NULL audit action_type rolls back receipt, write and outbox together.
  const checks=lockedMonths.map((ym)=>`NOT EXISTS(
      SELECT 1 FROM ik_monthly_close WHERE main_company_id=? AND period_year=?
      AND period_month=? AND is_locked<>0)`);
  const args:unknown[]=[];
  for(const ym of lockedMonths){const [year,month]=ym.split("-").map(Number);
    args.push(company,year,month);
  }
  if(p.employeeId){
    checks.push(`EXISTS(${checkEmployeeSql()})`);
    args.push(company,p.employeeId);
  }
  if(action==="leave"){
    checks.push(`NOT EXISTS(SELECT 1 FROM ik_leave_plans WHERE main_company_id=?
      AND employee_id=? AND id<>? AND status<>'CANCELLED'
      AND start_date<=? AND end_date>=?)`);
    args.push(company,p.employeeId,id,p.endDate,p.startDate);
    if(p.recordType==="YILLIK"){
      checks.push(`(SELECT COALESCE(SUM(counted_days),0) FROM ik_leave_plans
         WHERE main_company_id=? AND employee_id=? AND status<>'CANCELLED'
         AND UPPER(record_type) LIKE '%YILLIK%') <=
         (SELECT COALESCE(annual_leave_entitlement,0)+COALESCE(annual_leave_carryover,0)
          FROM hr_monthly_employees WHERE main_company_id=? AND id=?)`);
      args.push(company,p.employeeId,company,p.employeeId);
    }
  }
  if(action==="holiday"){
    checks.push(`(SELECT COUNT(*) FROM json_store
      WHERE scope='IK_OFFICIAL_HOLIDAY' AND file_name=?
      AND (main_company_slug=? OR main_company_slug IS NULL))=1`);
    args.push("pdks-holiday-"+p.date,company);
  }
  const guard=checks.length?`CASE WHEN ${checks.join(" AND ")}
    THEN ? ELSE NULL END`:"?";
  const actionType=action.toLocaleUpperCase("tr-TR").replace(/[^A-Z0-9ÇĞİÖŞÜ]/g,"_");
  return c.env.DB.prepare(`INSERT INTO ik_audit_logs
    (id,main_company_id,employee_id,period,action_type,source_screen,old_json,
     new_json,reason,user_name,created_at)
    VALUES(?,?,?, ?, ${guard}, 'KY_PDKS_UNIFIED', ?,?,?,?,?)`)
    .bind(crypto.randomUUID(),company,p.employeeId||"",
      (p.date||p.startDate||"").slice(0,7),...args,
      "PDKS_UNIFIED_"+actionType,JSON.stringify(old||{}),
      JSON.stringify({commandId:id,action,data:p}),
      val(p.reason||p.note),actor,stamp);
}
async function receipt(c:Context<AppEnv>,company:string,actorId:string,requestId:string){
  return first(c,`SELECT id,action,payload_sha256,result_json,created_at
    FROM ik_pdks_unified_commands WHERE main_company_id=? AND actor_user_id=?
    AND request_id=? LIMIT 1`,[company,actorId,requestId]);
}
async function post(c:Context<AppEnv>){
  const auth=await context(c);
  if(!auth)return fail(c,"PDKS_FULL_AUTH_REQUIRED","Yetkili FULL oturum ve geçerli firma gerekli.",403);
  let body:Row;
  try{body=await c.req.json();}catch{return fail(c,"PDKS_INVALID_BODY","JSON istek zorunlu.");}
  if(!body||typeof body!=="object"||Array.isArray(body))return fail(c,"PDKS_INVALID_BODY","JSON nesnesi zorunlu.");
  const requestId=val(body.requestId),action=val(body.action);
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))
    return fail(c,"PDKS_REQUEST_ID_INVALID","Tekil işlem kimliği eksik.");
  const own=val(body.payload?.mainCompanyId||body.payload?.mainCompanySlug);
  if(own && own.toLocaleLowerCase("tr-TR")!==auth.company)
    return fail(c,"PDKS_TENANT_MISMATCH","Gönderilen firma oturum firmasından farklı.",403);
  let p:Row;
  try{p=validateUnifiedCommand(action,body.payload);}
  catch(e){return fail(c,"PDKS_VALIDATION_FAILED",val((e as Error).message));}
  const fingerprint=await digest(JSON.stringify({action,p}));
  const existing=await receipt(c,auth.company,val(auth.user.id),requestId);
  if(existing){
    if(existing.payload_sha256!==fingerprint)
      return fail(c,"PDKS_IDEMPOTENCY_CONFLICT","Bu işlem kimliği farklı veriyle kullanılmış.",409);
    return c.json({ok:true,data:{...JSON.parse(existing.result_json),
      replayed:true,receiptId:existing.id}});
  }
  let extra;
  try{extra=await preflight(c,auth.company,action,p);}
  catch(e){return fail(c,val((e as Error).message),"İşlem doğrulanamadı; kayıt yapılmadı.",409);}
  const stamp=new Date().toISOString(),id=crypto.randomUUID(),
    actor=val(auth.user.username||auth.user.id);
  const {statement,result}=batchOperation(c,auth.company,actor,action,p,id,stamp,extra);
  const db=c.env.DB;
  const statements=[
    db.prepare(`INSERT INTO ik_pdks_unified_commands
      (id,main_company_id,actor_user_id,request_id,action,payload_sha256,
       target_employee_id,result_json,state,created_at)
      VALUES(?,?,?,?,?,?,?,?, 'COMMITTED',?)`)
      .bind(id,auth.company,val(auth.user.id),requestId,action,fingerprint,
        p.employeeId||"",JSON.stringify(result),stamp),
    statement,
    invariantAudit(c,auth.company,action,p,id,actor,stamp,extra.old,extra.lockedMonths),
    db.prepare(`INSERT INTO ik_pdks_unified_outbox
      (id,main_company_id,command_id,event_type,payload_json,state,created_at)
      VALUES(?,?,?,?,?,'PENDING',?)`)
      .bind(crypto.randomUUID(),auth.company,id,"PDKS_CLOUD_ADMIN_CHANGE",
        JSON.stringify({commandId:id,action,company:auth.company,
          localFDB:false,annualTNF:false,localCardNo:extra.localCardNo||"",
          commandData:p,details:result}),stamp),
  ];
  try{await db.batch(statements);}
  catch(e){
    // Race with same ID: atomic UNIQUE failure, no partially applied actions.
    const raced=await receipt(c,auth.company,val(auth.user.id),requestId);
    if(raced){
      if(raced.payload_sha256!==fingerprint)return fail(c,"PDKS_IDEMPOTENCY_CONFLICT",
        "İşlem kimliği farklı veriyle kullanılmış.",409);
      return c.json({ok:true,data:{...JSON.parse(raced.result_json),
        replayed:true,receiptId:raced.id}});
    }
    console.error(JSON.stringify({code:"PDKS_BATCH_ROLLED_BACK",action,
      error:e instanceof Error?e.message:String(e)}));
    return fail(c,"PDKS_BATCH_ROLLED_BACK",
      "Değişiklik uygulanmadı. Dönem kilidini, izin çakışmasını ve tablo şemasını kontrol edin.",409);
  }
  return c.json({ok:true,data:{...result,replayed:false,receiptId:id}},201);
}
async function getReceipt(c:Context<AppEnv>){
  const auth=await context(c);
  if(!auth)return fail(c,"PDKS_FULL_AUTH_REQUIRED","Yetkili FULL oturum gerekli.",403);
  const requestId=val(c.req.param("requestId"));
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))return fail(c,"PDKS_REQUEST_ID_INVALID","Geçersiz işlem kimliği.");
  if(!(await checkTables(c,[])))return fail(c,"PDKS_MIGRATION_0060_REQUIRED","Veritabanı hazır değil.",503);
  const result=await receipt(c,auth.company,val(auth.user.id),requestId);
  if(!result)return fail(c,"PDKS_RECEIPT_NOT_FOUND","Bu işlem kimliği için onaylı kayıt bulunamadı.",404);
  const sync=await first(c,`SELECT state,delivery_attempts,delivery_owner,lease_until,next_attempt_at,
      ack_sha256,last_error,acknowledged_at FROM ik_pdks_unified_outbox
      WHERE main_company_id=? AND command_id=? LIMIT 1`,[auth.company,result.id]);
  return c.json({ok:true,data:{...JSON.parse(result.result_json),
    receiptId:result.id,replayed:true,localSync:sync?{
      state:sync.state,deliveryAttempts:Number(sync.delivery_attempts||0),
      deliveryOwner:sync.delivery_owner||null,leaseUntil:sync.lease_until||null,
      nextAttemptAt:sync.next_attempt_at||null,ackSha256:sync.ack_sha256||null,
      lastError:sync.last_error||null,acknowledgedAt:sync.acknowledged_at||null}:null}});
}
export function registerIkPdksUnifiedCommandRoutes(app:Hono<AppEnv>){
  app.post(base,post);
  app.get(base+"/:requestId",getReceipt);
}
