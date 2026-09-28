import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const now=()=>new Date().toISOString();

async function ensureSyncSchema(c:Context<Env>){
  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_sync_events (
      id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,main_company_id TEXT NOT NULL,device_id TEXT,
      entity_type TEXT NOT NULL,entity_id TEXT NOT NULL DEFAULT '',operation TEXT NOT NULL,source TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',occurred_at TEXT NOT NULL,received_at TEXT NOT NULL)`),
    c.env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ik_pdks_sync_events_company_cursor ON ik_pdks_sync_events(main_company_id,received_at,id)`),
  ]);
}

function companyOf(c:Context<Env>,user:Row,body:Row={}){
  return text(c.req.header("X-KYERP-Tenant-Slug")||body.mainCompanyId||body.mainCompanySlug||c.req.query("mainCompanyId")||c.req.query("mainCompanySlug")||user.mainCompanySlug||user.security?.main_company_slug||"mecit-hakan").toLocaleLowerCase("tr-TR");
}

async function scopedPeople(c:Context<Env>){
  const user=await getAuthenticatedUser(c) as Row|null;
  if(!user)return c.json({ok:false,error:{code:"UNAUTHORIZED",message:"Oturum doğrulanamadı."}},401);
  const company=companyOf(c,user);
  const result=await c.env.DB.prepare(`SELECT
    e.id,e.code,e.full_name,e.department,e.title,e.work_type,e.sgk_status,e.status,e.hire_date,
    e.salary,e.road_allowance,e.bank_payment_type,e.bank_amount,e.cash_amount,e.overtime_hourly_base,
    e.annual_leave_entitlement,e.annual_leave_carryover,e.note,e.created_at,e.updated_at,
    s.card_no,s.identity_no,s.exit_date,s.active_passive,s.phone,s.payment_type,s.sgk_follow,s.personel_kodu
    FROM hr_monthly_employees e
    JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=?
      AND TRIM(COALESCE(s.card_no,''))<>''
      AND COALESCE(s.sgk_follow,1)<>0
      AND UPPER(COALESCE(e.sgk_status,'VAR'))<>'YOK'
    ORDER BY CASE WHEN UPPER(COALESCE(s.active_passive,e.status,'Aktif'))='AKTIF' THEN 0 ELSE 1 END,
             COALESCE(NULLIF(TRIM(s.personel_kodu),''),NULLIF(TRIM(s.card_no),''),e.code),e.full_name`)
    .bind(company).all<Row>();
  const audit=String(user.role||"").toUpperCase().replace(/İ/g,"I")==="DENETIM"||text(user.username).toLocaleLowerCase("tr-TR")==="denetim";
  const rows=(result.results||[]).map((row)=>{
    const common:Row={
      id:text(row.id),personnelCode:text(row.personel_kodu)||text(row.card_no)||text(row.code),fullName:text(row.full_name),
      department:text(row.department),title:text(row.title),workType:text(row.work_type)||"Aylık",sgkStatus:"VAR",
      status:text(row.active_passive)||text(row.status)||"Aktif",startDate:text(row.hire_date).slice(0,10),exitDate:text(row.exit_date).slice(0,10),
      cardNo:text(row.card_no),activePassive:text(row.active_passive)||text(row.status)||"Aktif",phone:text(row.phone),
      annualLeaveEntitlement:Number(row.annual_leave_entitlement||0),annualLeaveCarryover:Number(row.annual_leave_carryover||0),
      createdAt:row.created_at,updatedAt:row.updated_at,
    };
    if(!audit)Object.assign(common,{
      identityNo:text(row.identity_no),salary:Number(row.salary||0),roadAllowance:Number(row.road_allowance||0),
      paymentChannel:text(row.bank_payment_type),bankAmount:Number(row.bank_amount||0),cashAmount:Number(row.cash_amount||0),
      overtimeBaseHours:Number(row.overtime_hourly_base||225),note:text(row.note),
    });
    return common;
  });
  return c.json({ok:true,success:true,data:rows});
}

export function registerPdksWebChangeFeed(app:Hono<Env>){
  // Bu route eski personnel-control /people route'undan önce kaydedilir. PDKS ekranı
  // böylece yalnız Desktop PDKS kart havuzunu görür; İK Aylık kayıtları karışmaz.
  app.get("/api/ik/personnel-control/people",scopedPeople);

  app.use("/api/ik/personnel-control/*",async(c,next)=>{
    const method=String(c.req.method||"GET").toUpperCase();
    if(!["POST","PATCH","PUT","DELETE"].includes(method))return next();
    const path=new URL(c.req.url).pathname;
    if(path.includes("/device")||path.includes("/time-events/import")||path.includes("/jobs"))return next();
    const relevant=/\/people\/[^/]+\/change$/i.test(path)||path.endsWith("/leaves/save-v2");
    if(!relevant)return next();
    let body:Row={};
    try{body=await c.req.raw.clone().json() as Row;}catch{}
    await next();
    if(c.res.status<200||c.res.status>=300)return;
    const user=await getAuthenticatedUser(c) as Row|null;
    if(!user)return;
    await ensureSyncSchema(c);
    const company=companyOf(c,user,body);
    const employeeId=/\/people\/([^/]+)\/change$/i.test(path)?decodeURIComponent(path.match(/\/people\/([^/]+)\/change$/i)?.[1]||""):text(body.employeeId);
    let personnelCode="";
    if(employeeId){
      try{
        const row=await c.env.DB.prepare(`SELECT COALESCE(NULLIF(TRIM(s.personel_kodu),''),NULLIF(TRIM(s.card_no),''),e.code) AS personnel_code
          FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
          WHERE e.id=? AND e.main_company_id=? LIMIT 1`).bind(employeeId,company).first<Row>();
        personnelCode=text(row?.personnel_code);
      }catch{}
    }
    let responseData:unknown={};
    try{const responseJson=await c.res.clone().json() as Row;responseData=responseJson?.data??responseJson;}catch{}
    const stamp=now();
    const id=crypto.randomUUID();
    await c.env.DB.prepare(`INSERT OR IGNORE INTO ik_pdks_sync_events
      (id,idempotency_key,main_company_id,device_id,entity_type,entity_id,operation,source,payload_json,occurred_at,received_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,`web:${company}:${id}`,company,null,path.endsWith("/change")?"PERSONNEL":"LEAVE",employeeId||id,"UPSERT","WEB",
        JSON.stringify({path,body,responseData,employeeId,personnelCode,updatedBy:text(user.username||user.id),updatedAt:stamp,deviceId:"WEB",version:1,syncStatus:"PENDING"}),stamp,stamp).run();
  });
}
