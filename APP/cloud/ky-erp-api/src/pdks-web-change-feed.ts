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

export function registerPdksWebChangeFeed(app:Hono<Env>){
  // Bu katman yalnız web değişikliklerini sync event akışına yazar.
  // Personel listesi route'u pdks-device-jobs.ts tarafından tek noktadan sağlanır.
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
