// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";
import { canManageOwnCompanyStorage } from "./file-hub-company-owner-access";

type Row = Record<string, any>;
const str = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => str(v).toUpperCase().replace(/İ/g, "I");
const now = () => new Date().toISOString();
const yes = (v: unknown, fallback: boolean) => v === undefined ? fallback : v === true || v === 1 || v === "1";
const fault = (code: string, message: string) => ({ok:false,error:{code,message}});
const safeCode = (v: unknown) => /^[A-Z][A-Z0-9_]{1,63}$/.test(upper(v)) ? upper(v) : "";
const safePath = (v: unknown): string | null => {
  const path = str(v).replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
  if (path.length > 768 || /[\x00-\x1F]/.test(path) || /^(?:[A-Za-z]:|~)/.test(path)) return null;
  if (path.split("/").some(part => part === "." || part === ".." || /%2e|%2f|%5c/i.test(part))) return null;
  return path;
};
const body = async (c: any) => { try { return await c.req.json() || {}; } catch { return {}; } };
const signedTenant = (u: Row) => str(u?.mainCompanySlug || u?.main_company_slug || u?.security?.main_company_slug).toLowerCase();
const selectedTenant = (c: any, b: Row={}) => str(b.mainCompanySlug || c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug")).toLowerCase();
async function tenantUser(c: any, b: Row={}, manage=false) {
  const user=await getAuthenticatedUser(c) as Row | null;
  if(!user) return null;
  const own=signedTenant(user), selected=selectedTenant(c,b);
  if(!own || (selected && selected!==own)) return null;
  if(manage && !canManageOwnCompanyStorage(user,own)) return null;
  return {user,slug:own};
}
async function connection(c:any,slug:string,id:string) {
  return await c.env.DB.prepare("SELECT id,provider_type,is_active FROM file_hub_connections WHERE main_company_slug=? AND id=?").bind(slug,id).first<Row>();
}
async function log(c:any,slug:string,actor:Row,evt:string,route:Row) {
  await c.env.DB.prepare(`INSERT INTO file_hub_events(id,main_company_slug,storage_connection_id,event_type,actor_type,actor_id,details,created_at) VALUES(?,?,?,?,'USER',?,?,?)`)
    .bind(crypto.randomUUID(),slug,route.storage_connection_id,evt,str(actor.id)||null,JSON.stringify({routeId:route.id,moduleCode:route.module_code,purposeCode:route.purpose_code}),now()).run();
}
export function registerFileHubFolderRouteRoutes(app:any) {
  // Firma sadece kendi dosya haritasini yonetebilir. Liste fiziksel Windows dosyasi icermiyor.
  app.get("/api/file-hub/folder-routes",async(c:any)=>{
    const t=await tenantUser(c,{},true);if(!t)return c.json(fault("FORBIDDEN","Bu firmanin klasor haritasini yonetme yetkisi yok."),403);
    const moduleCode=safeCode(c.req.query("moduleCode")),purposeCode=safeCode(c.req.query("purposeCode"));
    const includeInactive=c.req.query("includeInactive")==="1";
    const where=["r.main_company_slug=?"], args:any[]=[t.slug];
    if(moduleCode){where.push("r.module_code=?");args.push(moduleCode);}
    if(purposeCode){where.push("r.purpose_code=?");args.push(purposeCode);}
    if(!includeInactive) where.push("r.is_active=1");
    const rows=await c.env.DB.prepare(`SELECT r.*,c.name connection_name,c.provider_type,c.connection_status FROM file_hub_folder_routes r JOIN file_hub_connections c ON c.id=r.storage_connection_id AND c.main_company_slug=r.main_company_slug WHERE ${where.join(" AND ")} ORDER BY r.module_code,r.purpose_code,r.priority,r.created_at`).bind(...args).all<Row>();
    return c.json({ok:true,data:rows.results||[]});
  });
  app.post("/api/file-hub/folder-routes",async(c:any)=>{
    const b=await body(c),t=await tenantUser(c,b,true);if(!t)return c.json(fault("FORBIDDEN","Bu firmanin klasor haritasini yonetme yetkisi yok."),403);
    const moduleCode=safeCode(b.moduleCode),purposeCode=safeCode(b.purposeCode),connectionId=str(b.storageConnectionId),path=safePath(b.rootPath);
    if(!moduleCode||!purposeCode||!connectionId||path===null)return c.json(fault("INVALID_ROUTE","Bolum, dosya turu, servis ve gecerli goreli klasor yolu gerekir."),422);
    const conn=await connection(c,t.slug,connectionId);if(!conn||Number(conn.is_active)!==1)return c.json(fault("INVALID_CONNECTION","Secilen firmanin etkin depolama servisi bulunamadi."),422);
    const deviceName=str(b.deviceName); if(deviceName.length>100)return c.json(fault("INVALID_DEVICE","Cihaz etiketi cok uzun."),422);
    const dup=await c.env.DB.prepare("SELECT id FROM file_hub_folder_routes WHERE main_company_slug=? AND module_code=? AND purpose_code=? AND storage_connection_id=? AND root_path=? AND device_name=?").bind(t.slug,moduleCode,purposeCode,connectionId,path,deviceName).first<Row>();
    if(dup)return c.json(fault("ALREADY_MAPPED","Bu dosya turu icin ayni klasor zaten eslestirilmis; kaydi duzenleyebilir veya yeniden etkinlestirebilirsiniz."),409);
    const priority=Number(b.priority??100);if(!Number.isInteger(priority)||priority<0||priority>10000)return c.json(fault("INVALID_PRIORITY","Oncelik 0 ile 10000 arasinda olmalidir."),422);
    const displayName=str(b.displayName).slice(0,160),id=crypto.randomUUID(),ts=now();
    const sensitive=/^(EMPLOYEE_|PERSONNEL_DOCUMENT|ATTENDANCE_REPORT|CHEQUE|CHEQUE_IMAGE|PROMISSORY_NOTE|BANK_RECEIPT|CREDIT_CARD_SLIP|TAX_DOCUMENT|AUDIT_EVIDENCE)/.test(purposeCode);
    await c.env.DB.prepare(`INSERT INTO file_hub_folder_routes(id,main_company_slug,module_code,purpose_code,storage_connection_id,root_path,display_name,device_name,read_enabled,write_enabled,sync_enabled,priority,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`)
      .bind(id,t.slug,moduleCode,purposeCode,connectionId,path,displayName,deviceName,yes(b.readEnabled,true)?1:0,yes(b.writeEnabled,false)?1:0,yes(b.syncEnabled,!sensitive)?1:0,priority,ts,ts).run();
    await log(c,t.slug,t.user,"FOLDER_ROUTE_CREATED",{id,module_code:moduleCode,purpose_code:purposeCode,storage_connection_id:connectionId});
    return c.json({ok:true,data:{id}},201);
  });
  app.patch("/api/file-hub/folder-routes/:id",async(c:any)=>{
    const b=await body(c),t=await tenantUser(c,b,true);if(!t)return c.json(fault("FORBIDDEN","Klasor degistirme yetkisi yok."),403);
    const id=str(c.req.param("id")),old=await c.env.DB.prepare("SELECT * FROM file_hub_folder_routes WHERE id=? AND main_company_slug=?").bind(id,t.slug).first<Row>();
    if(!old)return c.json(fault("NOT_FOUND","Klasor eslestirmesi bulunamadi."),404);
    const priority=Number(b.priority??old.priority);if(!Number.isInteger(priority)||priority<0||priority>10000)return c.json(fault("INVALID_PRIORITY","Oncelik 0 ile 10000 arasinda olmalidir."),422);
    const displayName=b.displayName===undefined?old.display_name:str(b.displayName).slice(0,160);
    await c.env.DB.prepare(`UPDATE file_hub_folder_routes SET display_name=?,priority=?,read_enabled=?,write_enabled=?,sync_enabled=?,is_active=?,updated_at=? WHERE id=? AND main_company_slug=?`)
      .bind(displayName,priority,yes(b.readEnabled,Number(old.read_enabled)===1)?1:0,yes(b.writeEnabled,Number(old.write_enabled)===1)?1:0,yes(b.syncEnabled,Number(old.sync_enabled)===1)?1:0,yes(b.isActive,Number(old.is_active)===1)?1:0,now(),id,t.slug).run();
    await log(c,t.slug,t.user,"FOLDER_ROUTE_UPDATED",old);return c.json({ok:true});
  });
  // Eslestirmeyi kapatir; Drive/Windows klasorunu veya File Hub dosyalarini SILMEZ.
  app.delete("/api/file-hub/folder-routes/:id",async(c:any)=>{
    const b=await body(c),t=await tenantUser(c,b,true);if(!t)return c.json(fault("FORBIDDEN","Klasor baglantisini kaldirma yetkisi yok."),403);
    const id=str(c.req.param("id")),old=await c.env.DB.prepare("SELECT * FROM file_hub_folder_routes WHERE id=? AND main_company_slug=?").bind(id,t.slug).first<Row>();
    if(!old)return c.json(fault("NOT_FOUND","Klasor eslestirmesi bulunamadi."),404);
    await c.env.DB.prepare("UPDATE file_hub_folder_routes SET is_active=0,updated_at=? WHERE id=? AND main_company_slug=?").bind(now(),id,t.slug).run();
    await log(c,t.slug,t.user,"FOLDER_ROUTE_DISABLED",old);return c.json({ok:true,physicalFilesDeleted:false});
  });
}
