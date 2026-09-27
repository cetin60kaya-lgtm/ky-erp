import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const now=()=>new Date().toISOString();

export function registerPdksWebChangeFeed(shell:Hono<Env>){
  shell.use("/api/ik/personnel-control/*",async(c,next)=>{
    const method=String(c.req.method||"GET").toUpperCase();
    if(!["POST","PATCH","PUT","DELETE"].includes(method))return next();
    const path=new URL(c.req.url).pathname;
    if(path.includes("/device")||path.includes("/time-events/import"))return next();
    let body:Row={};
    try{body=await c.req.raw.clone().json() as Row;}catch{}
    await next();
    if(c.res.status<200||c.res.status>=300)return;
    let responseData:unknown={}; try{const responseJson=await c.res.clone().json() as Row; responseData=responseJson?.data??responseJson;}catch{}
    const relevant=path.endsWith("/change")||path.endsWith("/leaves/save-v2");
    if(!relevant)return;
    const user=await getAuthenticatedUser(c) as Row|null;
    if(!user)return;
    const company=text(c.req.header("X-KYERP-Tenant-Slug")||body.mainCompanyId||body.mainCompanySlug||user.mainCompanySlug||user.security?.main_company_slug||"mecit-hakan").toLocaleLowerCase("tr-TR");
    const employeeId=path.endsWith("/change")?text(path.match(/\/people\/([^/]+)\/change$/)?.[1]):text(body.employeeId);
    let personnelCode="";
    if(employeeId){try{const row=await c.env.DB.prepare("SELECT code FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1").bind(employeeId,company).first<Row>();personnelCode=text(row?.code);}catch{}}
    const stamp=now();const id=crypto.randomUUID();
    const entityType=path.endsWith("/change")?"PERSONNEL":"LEAVE";
    await c.env.DB.prepare(`INSERT OR IGNORE INTO ik_pdks_sync_events(id,idempotency_key,main_company_id,device_id,entity_type,entity_id,operation,source,payload_json,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,`web:${company}:${id}`,company,null,entityType,employeeId||id,"UPSERT","WEB",JSON.stringify({path,body,responseData,employeeId,personnelCode,updatedBy:text(user.username||user.id),updatedAt:stamp,deviceId:"WEB",version:1,syncStatus:"PENDING"}),stamp,stamp).run();
  });
}
