// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";
import { registerFileHubRoutes } from "./file-hub";
import { registerFileHubCloudOauthRoutes } from "./file-hub-cloud-oauth";
import { registerFileHubPreviewRoutes } from "./file-hub-preview";
import { registerPublicFileHubAgentRoutes } from "./file-hub-agent-public";
import { registerPublicFileHubScanRoutes } from "./file-hub-agent-scan";
import { registerFileHubAgentAdminRoutes } from "./file-hub-agent-admin";
import { registerAccountingDocumentArchiveRoutes } from "./accounting-document-archive";

type Row = Record<string, any>;
const text = (v: unknown) => v == null ? "" : String(v).trim();
const upper = (v: unknown) => text(v).toUpperCase().replace(/İ/g, "I");
const lowerSlug = (v: unknown) => text(v).toLocaleLowerCase("tr-TR");
const slugOf = (c: any, b: Row = {}) => text(b.mainCompanySlug || b.main_company_slug || c.req.header("X-KYERP-Tenant-Slug") || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
const isOwner = (role: unknown) => ["ADMIN","SUPER_ADMIN"].includes(upper(role));
const isCompanyOwner = (role: unknown) => upper(role) === "COMPANY_ADMIN";
const errorBody = (code: string, message: string) => ({ ok:false, error:{ code,message } });
async function ownerCurrent(c:any){ const u=await getAuthenticatedUser(c); return u&&isOwner(u.role)?u:null; }
function permissionFor(user:Row,moduleKey:string){return Array.isArray(user?.permissions)?user.permissions.find((p:Row)=>upper(p.moduleKey||p.module_key)===upper(moduleKey)):null;}
function entityModule(entityType:string){return ({MODEL:"DESEN",MODEL_TEAMMATE:"DESEN",OUTGOING_PACKAGE:"DESEN",PRODUCTION_ORDER:"IMALAT",PRODUCTION:"IMALAT",DYE_RECIPE:"BOYAHANE",DYE_BATCH:"BOYAHANE",LOT:"BOYAHANE",STOCK_ITEM:"BOYAHANE",DOCUMENT:"MUHASEBE",INVOICE:"MUHASEBE",PERSONNEL:"IK",EMPLOYEE:"IK"})[upper(entityType)]||"";}
function normalizeModule(moduleCode:string){const key=upper(moduleCode);return key==="URETIM"?"IMALAT":key;}
function requestedTenant(c:any){return lowerSlug(c.req.header("X-KYERP-Tenant-Slug")||c.req.query("mainCompanySlug")||c.req.query("mainCompanyId"));}
function userTenant(user:Row){return lowerSlug(user?.mainCompanySlug||user?.main_company_slug||user?.security?.main_company_slug);}

async function legacyStatus(c:any){
  const slug=slugOf(c);
  try{
    const [conn,files,missing]=await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_connections WHERE main_company_slug=? AND is_active=1`).bind(slug).first<Row>(),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_assets WHERE main_company_slug=?`).bind(slug).first<Row>(),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM file_hub_assets WHERE main_company_slug=? AND status='MISSING'`).bind(slug).first<Row>(),
    ]);
    return {storageRoot:"FILE_HUB://"+slug,storageMode:"FILE_HUB",accessible:true,connected:Number(conn?.n||0)>0,totalFileCount:Number(files?.n||0),missingFileCount:Number(missing?.n||0),capabilities:{providerNeutral:true,multiCompany:true,multiStorage:true,r2PreviewOnly:true}};
  }catch(error){ return {storageRoot:"FILE_HUB://"+slug,storageMode:"FILE_HUB",accessible:false,connected:false,totalFileCount:0,error:error instanceof Error?error.message:String(error)}; }
}

export function registerAdminStorageRoutes(app:any){
  app.use("/api/file-hub/*",async(c:any,next:any)=>{
    const path=new URL(c.req.url).pathname, user=await getAuthenticatedUser(c);
    if(!user)return c.json(errorBody("UNAUTHORIZED","Oturum gerekli."),401);
    if(isOwner(user.role))return next();

    // File Hub provider/index rows are tenant data. A non-owner may never pick
    // another company by crafting a header/query parameter. For the canonical
    // historical tenant an omitted slug remains compatible with old preview
    // links; every other tenant must carry its own explicit slug so the legacy
    // fallback in older File Hub readers can never resolve to another company.
    const own=userTenant(user), requested=requestedTenant(c);
    if(!own)return c.json(errorBody("FILE_HUB_TENANT_REQUIRED","Kullanıcının ana firma bağlamı bulunamadı."),403);
    if(!requested&&own!=="mecit-hakan")return c.json(errorBody("FILE_HUB_TENANT_REQUIRED","File Hub isteğinde aktif firma bağlamı zorunludur."),403);
    if(requested&&requested!==own)return c.json(errorBody("FILE_HUB_TENANT_FORBIDDEN","Başka firmanın File Hub alanına erişemezsiniz."),403);

    // Firma sahibi / işveren kendi tenantında Mail + Drive/File Hub yönetimini yapar.
    // Uygulama sahibi sistem seviyesinde görünürlüğünü korur; normal kullanıcılar yönetim endpointlerine çıkamaz.
    if(isCompanyOwner(user.role))return next();

    const ownerOnly = path.startsWith("/api/file-hub/cloud/") || path==="/api/file-hub/overview" || path==="/api/file-hub/connections" || path==="/api/file-hub/bindings" || path==="/api/file-hub/files" || path==="/api/file-hub/search" || /\/files\/[^/]+\/relations$/.test(path);
    if(ownerOnly)return c.json(errorBody("COMPANY_OWNER_ONLY","Dosya Merkezi yönetim görünümü firma sahibi / işverene açıktır."),403);
    if(path==="/api/file-hub/entity-files"){
      const moduleKey=entityModule(c.req.query("entityType"));
      if(moduleKey&&!permissionFor(user,moduleKey)?.canView)return c.json(errorBody("FORBIDDEN","Bu kaydın dosyalarını görme yetkiniz bulunmuyor."),403);
    }
    if(path==="/api/file-hub/resolve-storage"){
      const moduleKey=normalizeModule(c.req.query("moduleCode"));
      if(moduleKey&&!permissionFor(user,moduleKey)?.canView)return c.json(errorBody("FORBIDDEN","Bu modülün depolama hedefini görme yetkiniz bulunmuyor."),403);
    }
    return next();
  });

  registerFileHubCloudOauthRoutes(app);
  registerFileHubRoutes(app);
  registerFileHubPreviewRoutes(app);
  registerPublicFileHubAgentRoutes(app);
  registerPublicFileHubScanRoutes(app);
  registerFileHubAgentAdminRoutes(app);
  registerAccountingDocumentArchiveRoutes(app);

  app.get("/api/admin/file-storage/status",async(c:any)=>{const owner=await ownerCurrent(c);if(!owner)return c.json(errorBody("OWNER_ONLY","Dosya ve depolama yönetimi yalnız uygulama sahibine açıktır."),403);return c.json({ok:true,data:await legacyStatus(c)});});
  app.get("/api/admin/file-storage/settings",async(c:any)=>{const owner=await ownerCurrent(c);if(!owner)return c.json(errorBody("OWNER_ONLY","Dosya ve depolama yönetimi yalnız uygulama sahibine açıktır."),403);return c.json({ok:true,data:{storageRoot:`FILE_HUB://${slugOf(c)}`,storageMode:"FILE_HUB",note:"Ana dosya evi firma bazında Google Drive, OneDrive veya seçilen provider'dır. R2 yalnız preview/cache katmanıdır."}});});
  app.get("/api/admin/file-storage/rules",async(c:any)=>{const owner=await ownerCurrent(c);if(!owner)return c.json(errorBody("OWNER_ONLY","Dosya kuralları yalnız uygulama sahibine açıktır."),403);const slug=slugOf(c);const r=await c.env.DB.prepare(`SELECT b.id,b.module_code module,b.purpose_code documentType,b.root_path targetPathTemplate,b.read_enabled,b.write_enabled,b.sync_enabled,c.provider_type,c.name providerName FROM file_hub_bindings b JOIN file_hub_connections c ON c.id=b.storage_connection_id WHERE b.main_company_slug=? ORDER BY b.module_code,b.purpose_code`).bind(slug).all<Row>();return c.json({ok:true,data:r.results||[]});});
  app.get("/api/admin/file-storage/files",async(c:any)=>{const owner=await ownerCurrent(c);if(!owner)return c.json(errorBody("OWNER_ONLY","Dosya listesi yalnız uygulama sahibine açıktır."),403);const slug=slugOf(c),take=Math.min(500,Math.max(1,Number(c.req.query("take")||100)));const r=await c.env.DB.prepare(`SELECT a.id,a.file_name fileName,a.size_bytes fileSize,a.status,a.updated_at uploadedAt,l.relative_path fileKey,c.provider_type sourceType FROM file_hub_assets a LEFT JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.location_role='PRIMARY' LEFT JOIN file_hub_connections c ON c.id=l.storage_connection_id WHERE a.main_company_slug=? ORDER BY a.updated_at DESC LIMIT ?`).bind(slug,take).all<Row>();return c.json({ok:true,data:r.results||[]});});
}
