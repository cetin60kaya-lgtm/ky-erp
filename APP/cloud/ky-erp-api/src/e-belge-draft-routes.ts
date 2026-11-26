import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed} from "./accounting-access-policy";
import {selections} from "./e-belge-adapter-company-routes";
import {normalizeDraft,type DraftKind} from "./e-belge-draft-core";
type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const err=(code:string,message:string)=>({ok:false,error:{code,message}});
const kindOf=(v:unknown):DraftKind|null=>v==="INVOICE"||v==="DISPATCH"?v:null;
const idOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(v));
async function access(c:Context<Env>,method:string,body:Row={}){
  const all=[c.req.query("mainCompanySlug"),c.req.query("mainCompanyId"),c.req.header("X-KYERP-Tenant-Slug"),body.mainCompanySlug,body.main_company_slug,body.mainCompanyId].map(v=>clean(v).toLowerCase()).filter(Boolean);
  const tenants=[...new Set(all)],user=await getAuthenticatedUser(c);
  if(tenants.length!==1||!user?.id||!accountingTenantReadAllowed(user,tenants[0])||!accountingAccess(user,method,c.req.path))return null;
  return {tenant:tenants[0],userId:clean(user.id)};
}
const select="id,kind,provider_key,party_company_id,payload,version,state,created_at,updated_at";
const unpack=(row:Row)=>({...row,payload:JSON.parse(row.payload)});
async function read(c:Context<Env>,tenant:string,id:string){
  const row=await c.env.DB.prepare("SELECT "+select+" FROM accounting_document_drafts WHERE main_company_slug=? AND id=?").bind(tenant,id).first<Row>();
  return row?unpack(row):null;
}
async function readiness(c:Context<Env>){
  const row=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_document_drafts'").first();
  return Boolean(row);
}
async function party(c:Context<Env>,tenant:string,id:string){
  return c.env.DB.prepare("SELECT id,name,tax_no FROM companies WHERE main_company_slug=? AND id=? AND deleted_at IS NULL AND is_active=1 LIMIT 1").bind(tenant,id).first<Row>();
}
export function registerEBelgeDraftRoutes(app:Hono<Env>){
  const base="/api/e-belge/operator-drafts";
  app.get(base,async c=>{
    const a=await access(c,"GET");if(!a)return c.json(err("FORBIDDEN","Firma veya muhasebe yetkisi doğrulanamadı."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak veri şeması henüz onaylanıp uygulanmadı."),503);
    const kind=kindOf(c.req.query("kind"));if(!kind)return c.json(err("INVALID_KIND","Belge türü seçin."),400);
    const page=Math.min(100000,Math.max(1,Math.trunc(Number(c.req.query("page"))||1)));
    const result=await c.env.DB.prepare("SELECT "+select+" FROM accounting_document_drafts WHERE main_company_slug=? AND kind=? ORDER BY updated_at DESC,id LIMIT 50 OFFSET ?").bind(a.tenant,kind,(page-1)*50).all<Row>();
    const count=await c.env.DB.prepare("SELECT COUNT(*) n FROM accounting_document_drafts WHERE main_company_slug=? AND kind=?").bind(a.tenant,kind).first<Row>();
    c.header("Cache-Control","no-store");
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,items:(result.results||[]).map(unpack),total:Number(count?.n||0),page,pageSize:50}});
  });
  app.post(base,async c=>{
    const body=await c.req.json<Row>().catch(()=>null);
    if(!body)return c.json(err("INVALID_BODY","Taslak verisi gerekli."),400);
    const a=await access(c,"POST",body);if(!a)return c.json(err("FORBIDDEN","Taslak oluşturma yetkisi gerekli."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak şeması üretim onayı bekliyor."),503);
    const kind=kindOf(body.kind),id=clean(body.id);
    if(!kind||!idOk(id))return c.json(err("INVALID_DRAFT","Geçerli taslak kimliği ve türü gerekli."),400);
    let data;try{data=normalizeDraft(body.payload,kind)}catch(e){return c.json(err("INVALID_DRAFT",(e as Error).message),400)}
    const company=await party(c,a.tenant,data.partyId);
    if(!company)return c.json(err("INVALID_PARTY","Cari bu firmaya ait aktif kayıt değil."),400);
    const provider=clean(body.providerKey).toUpperCase();
    if(provider){
      const enabled=await selections(c,a.tenant);
      if(provider==="MANUAL"||!enabled.selected[provider]||!enabled.enabled[provider])return c.json(err("INVALID_PROVIDER","Seçili sağlayıcı firma için etkin değil."),400);
    }
    const payload=JSON.stringify({...data,partyName:company.name,partyTaxNo:company.tax_no||""}),now=new Date().toISOString();
    const result=await c.env.DB.prepare("INSERT INTO accounting_document_drafts(id,main_company_slug,kind,provider_key,party_company_id,payload,version,state,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,1,'DRAFT',?,?,?,?) ON CONFLICT(main_company_slug,id) DO NOTHING").bind(id,a.tenant,kind,provider||null,data.partyId,payload,a.userId,a.userId,now,now).run();
    const saved=await read(c,a.tenant,id);
    if(!saved||(!result.meta.changes&&(saved.kind!==kind||saved.provider_key!==(provider||null)||JSON.stringify(saved.payload)!==payload||saved.version!==1)))return c.json(err("DRAFT_CONFLICT","Taslak kimliği kayıtlı. Listeyi yenileyin."),409);
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,draft:saved}},201);
  });
  app.patch(base+"/:id",async c=>{
    const body=await c.req.json<Row>().catch(()=>null);
    if(!body)return c.json(err("INVALID_BODY","Taslak verisi gerekli."),400);
    const a=await access(c,"PATCH",body);if(!a)return c.json(err("FORBIDDEN","Taslak güncelleme yetkisi gerekli."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak şeması üretim onayı bekliyor."),503);
    const id=c.req.param("id"),version=Number(body.version);
    if(!idOk(id)||!Number.isSafeInteger(version)||version<1)return c.json(err("INVALID_VERSION","Geçerli kayıt sürümü gerekli."),400);
    const old=await read(c,a.tenant,id);if(!old)return c.json(err("NOT_FOUND","Taslak bulunamadı."),404);
    if(old.version!==version)return c.json(err("DRAFT_CONFLICT","Taslak değişti. Listeyi yenileyin; eski veri üzerine yazılmadı."),409);
    if(!["SAVE","CHECK"].includes(body.action))return c.json(err("INVALID_ACTION","Kaydet veya kontrol et seçin."),400);
    let data;try{data=normalizeDraft(body.action==="CHECK"?old.payload:body.payload,old.kind)}catch(e){return c.json(err("INVALID_DRAFT",(e as Error).message),400)}
    const company=await party(c,a.tenant,data.partyId);if(!company)return c.json(err("INVALID_PARTY","Cari kaydı artık geçerli değil."),400);
    if(body.action==="CHECK"&&data.warnings.length)return c.json(err("CONTROL_REQUIRED",data.warnings.join(" ")),409);
    const payload=JSON.stringify({...data,partyName:company.name,partyTaxNo:company.tax_no||""}),state=body.action==="CHECK"?"CHECKED":"DRAFT";
    const changed=await c.env.DB.prepare("UPDATE accounting_document_drafts SET payload=?,party_company_id=?,state=?,version=version+1,updated_by=?,updated_at=? WHERE main_company_slug=? AND id=? AND version=?").bind(payload,data.partyId,state,a.userId,new Date().toISOString(),a.tenant,id,version).run();
    if(changed.meta.changes!==1)return c.json(err("DRAFT_CONFLICT","Taslak değişti; üzerine yazılmadı."),409);
    const saved=await read(c,a.tenant,id);
    if(!saved||saved.version!==version+1)return c.json(err("DRAFT_CONFLICT","Kayıt yeniden okunurken sürüm değişti. Listeyi yenileyin."),409);
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,draft:saved}});
  });
}
