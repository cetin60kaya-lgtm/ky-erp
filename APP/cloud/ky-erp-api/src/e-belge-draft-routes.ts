import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed} from "./accounting-access-policy";
import {selections} from "./e-belge-adapter-company-routes";
import {searchRegisteredItems,resolveRegisteredItemIds} from "./isnet-registered-items";
import {parseDirectCommand,resolveDirectFields,storedWorkflowFields} from "./e-belge-command-core";
import {normalizeDraft,type DraftKind} from "./e-belge-draft-core";
type Env={Bindings:Cloudflare.Env;Variables:{requestId:string}};
type Row=Record<string,any>;
const clean=(v:unknown)=>String(v??"").trim();
const err=(code:string,message:string)=>({ok:false,error:{code,message}});
const kindOf=(v:unknown):DraftKind|null=>v==="INVOICE"||v==="DISPATCH"?v:null;
const idOk=(v:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean(v));
export async function operatorAccess(c:Context<Env>,method:string,body:Row={}){
  const all=[c.req.query("mainCompanySlug"),c.req.query("mainCompanyId"),c.req.header("X-KYERP-Tenant-Slug"),body.mainCompanySlug,body.main_company_slug,body.mainCompanyId].map(v=>clean(v).toLowerCase()).filter(Boolean);
  const tenants=[...new Set(all)],user=await getAuthenticatedUser(c);
  if(tenants.length!==1||!user?.id||!accountingTenantReadAllowed(user,tenants[0])||!accountingAccess(user,method,c.req.path))return null;
  return {tenant:tenants[0],userId:clean(user.id)};
}
const select="id,kind,provider_key,party_company_id,payload,version,state,created_at,updated_at,creation_context";
const unpack=(row:Row):Row=>({...row,payload:JSON.parse(row.payload),creation_context:JSON.parse(row.creation_context||"{}")});
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
async function verifiedDraft(c:Context<Env>,tenant:string,value:unknown,kind:DraftKind){
  const data=normalizeDraft(value,kind);
  const ids=[...new Set(data.lines.map((l:Row)=>l.catalogId).filter(Boolean))] as string[];
  const registered=await resolveRegisteredItemIds(c,tenant,ids);
  const byId=new Map(registered.map(x=>[x.id,x]));
  for(const line of data.lines){if(line.catalogId&&byId.get(line.catalogId)?.description!==line.description)throw Error("Katalog kalemi değişmiş. Kalemi yeniden seçin.");}
  return data;
}
async function persistNewDraft(c:Context<Env>,a:{tenant:string;userId:string},id:string,kind:DraftKind,provider:string,data:Row,company:Row,context:Row={}){
 const payload=JSON.stringify({...data,partyName:company.name,partyTaxNo:company.tax_no||""}),now=new Date().toISOString(),audit=JSON.stringify(context);
 const result=await c.env.DB.prepare("INSERT INTO accounting_document_drafts(id,main_company_slug,kind,provider_key,party_company_id,payload,version,state,created_by,updated_by,created_at,updated_at,creation_context) VALUES(?,?,?,?,?,?,1,'DRAFT',?,?,?,?,?) ON CONFLICT(main_company_slug,id) DO NOTHING").bind(id,a.tenant,kind,provider||null,data.partyId,payload,a.userId,a.userId,now,now,audit).run();
 const saved=await read(c,a.tenant,id);
 if(!saved||(!result.meta.changes&&(saved.kind!==kind||saved.provider_key!==(provider||null)||JSON.stringify(saved.payload)!==payload||JSON.stringify(saved.creation_context)!==audit||saved.version!==1)))return null;
 return saved;
}
export async function operatorReadReady(c:Context<Env>){
 return Boolean(await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_document_read_state'").first());
}
export function registerEBelgeDraftRoutes(app:Hono<Env>){
  app.get("/api/e-belge/operator-catalog",async c=>{
    const a=await operatorAccess(c,"GET");if(!a)return c.json(err("FORBIDDEN","Firma yetkisi doğrulanamadı."),403);
    const items=await searchRegisteredItems(c,a.tenant,clean(c.req.query("q")));
    c.header("Cache-Control","no-store");return c.json({ok:true,data:{mainCompanySlug:a.tenant,items}});
  });
  app.get("/api/e-belge/operator-companies",async c=>{
    const a=await operatorAccess(c,"GET");if(!a)return c.json(err("FORBIDDEN","Firma yetkisi doğrulanamadı."),403);
    const q=clean(c.req.query("q")).slice(0,100);const items=q.length<2?[]:(await c.env.DB.prepare("SELECT id,name,tax_no FROM companies WHERE main_company_slug=? AND deleted_at IS NULL AND is_active=1 AND (instr(upper(name),upper(?))>0 OR instr(COALESCE(tax_no,''),?)>0) ORDER BY name LIMIT 30").bind(a.tenant,q,q).all<Row>()).results||[];
    c.header("Cache-Control","no-store");return c.json({ok:true,data:{mainCompanySlug:a.tenant,items}});
  });
  app.patch("/api/e-belge/documents/:id/read-state",async c=>{
    const body=await c.req.json<Row>().catch(()=>null);if(!body)return c.json(err("INVALID_BODY","Okunma durumu gerekli."),400);
    const a=await operatorAccess(c,"PATCH",body);if(!a)return c.json(err("FORBIDDEN","Firma yetkisi doğrulanamadı."),403);
    if(!await operatorReadReady(c))return c.json(err("READ_SCHEMA_REQUIRED","Okunma durumu şeması henüz uygulanmadı."),503);
    const id=c.req.param("id"),state=clean(body.state);
    if(!["READ","UNREAD"].includes(state))return c.json(err("INVALID_STATE","Geçersiz okunma durumu."),400);
    const document=await c.env.DB.prepare("SELECT id FROM accounting_documents WHERE main_company_slug=? AND id=? AND deleted_at IS NULL AND direction='INCOMING' AND COALESCE(record_scope,'OFFICIAL')='OFFICIAL'").bind(a.tenant,id).first();
    if(!document)return c.json(err("NOT_FOUND","Gelen belge bulunamadı."),404);
    if(state==="READ")await c.env.DB.prepare("INSERT INTO accounting_document_read_state(main_company_slug,user_id,document_id,read_at) VALUES(?,?,?,?) ON CONFLICT(main_company_slug,user_id,document_id) DO UPDATE SET read_at=excluded.read_at").bind(a.tenant,a.userId,id,new Date().toISOString()).run();
    else await c.env.DB.prepare("DELETE FROM accounting_document_read_state WHERE main_company_slug=? AND user_id=? AND document_id=?").bind(a.tenant,a.userId,id).run();
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,id,state}});
  });
  // Read-only command resolution; only the existing draft API can persist the result.
  app.post("/api/e-belge/operator-command/prepare",async c=>{
    const body=await c.req.json<Row>().catch(()=>null);
    if(!body)return c.json(err("INVALID_BODY","Komut gerekli."),400);
    const a=await operatorAccess(c,"POST",body);if(!a)return c.json(err("FORBIDDEN","Firma veya işlem yetkisi doğrulanamadı."),403);
    let intent;try{intent=parseDirectCommand(body.command)}catch(e){return c.json(err("COMMAND_UNSUPPORTED",(e as Error).message),400)}
    const companyRows=await c.env.DB.prepare("SELECT id,name,tax_no FROM companies WHERE main_company_slug=? AND deleted_at IS NULL AND is_active=1 AND (name=? COLLATE NOCASE OR tax_no=?) LIMIT 3").bind(a.tenant,intent.party,intent.party).all<Row>();
    const companies=companyRows.results||[];
    if(companies.length!==1)return c.json({ok:true,data:{mainCompanySlug:a.tenant,missing:[{field:"party",question:"Cari ünvanını tam olarak veya VKN ile belirtin."}],proposal:null}});
    const company=companies[0]!;
    // Exact, non-deduplicated model/product identities; ambiguous names require selection.
    const modelRows=await c.env.DB.prepare("SELECT id,model_name AS description FROM model_records WHERE main_company_slug=? AND deleted_at IS NULL AND (model_name=? COLLATE NOCASE OR model_code=? COLLATE NOCASE) LIMIT 3").bind(a.tenant,intent.item,intent.item).all<Row>();
    const productRows=await c.env.DB.prepare("SELECT id,name AS description,unit FROM products WHERE main_company_slug=? AND name=? COLLATE NOCASE LIMIT 3").bind(a.tenant,intent.item).all<Row>();
    const items=[...(modelRows.results||[]).map(x=>({id:"MODEL:"+x.id,description:x.description,unit:"C62"})),...(productRows.results||[]).map(x=>({id:"PRODUCT:"+x.id,description:x.description,unit:clean(x.unit)}))];
    if(items.length!==1)return c.json({ok:true,data:{mainCompanySlug:a.tenant,missing:[{field:"item",question:"Model/ürün adı tekil değil veya bulunamadı. Benzersiz model kodu kullanın ya da ortak editörden seçin."}],proposal:null}});
    const item=items[0]!;
    const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Istanbul"});
    const defaultsReady=await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ebelge_command_defaults'").first();
    const defaults=defaultsReady?(await c.env.DB.prepare("SELECT id,version,payload FROM ebelge_command_defaults WHERE main_company_slug=? AND party_company_id=? AND catalog_id=? AND kind=? AND approved_by<>'' AND valid_from<=? AND valid_until>=? ORDER BY version DESC LIMIT 2").bind(a.tenant,company.id,item.id,intent.kind,today,today).all<Row>()).results||[]:[];
    if(defaults.length>1)return c.json({ok:true,data:{mainCompanySlug:a.tenant,missing:[{field:"defaults",question:"Çakışan aktif varsayılan kayıtları var; yönetici kontrolü gerekli."}],proposal:null}});
    const rule=defaults[0];
    const profileKey="workflow-defaults:"+a.tenant;
    const profileRow=await c.env.DB.prepare("SELECT data FROM json_store WHERE id=? AND scope='ISNET_BUSINESS_SETTINGS' AND main_company_slug=? AND file_name=?").bind(profileKey,a.tenant,profileKey).first<Row>();
    const workflow=storedWorkflowFields(profileRow?JSON.parse(profileRow.data):{},clean(company.id));
    if(workflow.conflict)return c.json({ok:true,data:{mainCompanySlug:a.tenant,missing:[{field:"defaults",question:"Birden fazla etkin cari/firma iş akışı profili var. Ayarları kontrol edin."}],proposal:null}});
    const values={...workflow.fields,...(rule?JSON.parse(rule.payload):{})};
    const provided=body.answers&&typeof body.answers==="object"?body.answers:{};
    const resolved=resolveDirectFields(intent,{partyId:clean(company.id),description:clean(item.description),catalogId:item.id,unit:clean(item.unit)},values,provided,today);
    if(resolved.missing.length)return c.json({ok:true,data:{mainCompanySlug:a.tenant,missing:resolved.missing,proposal:null}});
    let data;try{data=await verifiedDraft(c,a.tenant,resolved.payload,intent.kind)}catch(e){return c.json(err("INVALID_DRAFT",(e as Error).message),400)}
    const enabled=await selections(c,a.tenant);
    const providers=Object.keys(enabled.selected).filter(k=>k!=="MANUAL"&&enabled.selected[k]&&enabled.enabled[k]);
    const providerKey=providers.length===1?providers[0]:"";
    c.header("Cache-Control","no-store");
    const proposal={kind:intent.kind,providerKey,payload:{...data,partyName:company.name,partyTaxNo:company.tax_no||""},provenance:resolved.provenance,rule:rule?{id:rule.id,version:rule.version}:null,workflowProfile:workflow.source,sendAllowed:false};
    if(body.saveDraft!==true)return c.json({ok:true,data:{mainCompanySlug:a.tenant,missing:[],proposal}});
    const id=clean(body.id);if(!idOk(id))return c.json(err("INVALID_DRAFT","İşlem kimliği geçersiz."),400);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak şeması üretim onayı bekliyor."),503);
    const commandHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(clean(body.command)))),n=>n.toString(16).padStart(2,"0")).join("");
    const saved=await persistNewDraft(c,a,id,intent.kind,providerKey,data,company,{source:"REV3_COMMAND",commandHash,provenance:resolved.provenance,rule:proposal.rule,workflowProfile:workflow.source,sendAllowed:false});
    if(!saved)return c.json(err("DRAFT_CONFLICT","İşlem kimliği kayıtlı veya varsayılanlar değişti. Taslak listesini kontrol edin."),409);
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,missing:[],proposal,draft:saved}},201);
  });
  const base="/api/e-belge/operator-drafts";
  app.get(base,async c=>{
    const a=await operatorAccess(c,"GET");if(!a)return c.json(err("FORBIDDEN","Firma veya muhasebe yetkisi doğrulanamadı."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak veri şeması henüz onaylanıp uygulanmadı."),503);
    const kind=kindOf(c.req.query("kind"));if(!kind)return c.json(err("INVALID_KIND","Belge türü seçin."),400);
    const page=Math.min(100000,Math.max(1,Math.trunc(Number(c.req.query("page"))||1)));
    const state=clean(c.req.query("state")).toUpperCase()||"ACTIVE";
    if(!["ACTIVE","DRAFT","CHECKED","CANCELLED"].includes(state))return c.json(err("INVALID_STATE","Taslak durumu geçersiz."),400);
    const clause=state==="ACTIVE"?"state IN ('DRAFT','CHECKED')":"state=?";
    const args=state==="ACTIVE"?[a.tenant,kind]:[a.tenant,kind,state];
    const result=await c.env.DB.prepare("SELECT "+select+" FROM accounting_document_drafts WHERE main_company_slug=? AND kind=? AND "+clause+" ORDER BY updated_at DESC,id LIMIT 50 OFFSET ?").bind(...args,(page-1)*50).all<Row>();
    const count=await c.env.DB.prepare("SELECT COUNT(*) n FROM accounting_document_drafts WHERE main_company_slug=? AND kind=? AND "+clause).bind(...args).first<Row>();
    c.header("Cache-Control","no-store");
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,items:(result.results||[]).map(unpack),total:Number(count?.n||0),page,pageSize:50}});
  });
  app.post(base,async c=>{
    const body=await c.req.json<Row>().catch(()=>null);
    if(!body)return c.json(err("INVALID_BODY","Taslak verisi gerekli."),400);
    const a=await operatorAccess(c,"POST",body);if(!a)return c.json(err("FORBIDDEN","Taslak oluşturma yetkisi gerekli."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak şeması üretim onayı bekliyor."),503);
    const kind=kindOf(body.kind),id=clean(body.id);
    if(!kind||!idOk(id))return c.json(err("INVALID_DRAFT","Geçerli taslak kimliği ve türü gerekli."),400);
    let data;try{data=await verifiedDraft(c,a.tenant,body.payload,kind)}catch(e){return c.json(err("INVALID_DRAFT",(e as Error).message),400)}
    const company=await party(c,a.tenant,data.partyId);
    if(!company)return c.json(err("INVALID_PARTY","Cari bu firmaya ait aktif kayıt değil."),400);
    const provider=clean(body.providerKey).toUpperCase();
    if(provider){
      const enabled=await selections(c,a.tenant);
      if(provider==="MANUAL"||!enabled.selected[provider]||!enabled.enabled[provider])return c.json(err("INVALID_PROVIDER","Seçili sağlayıcı firma için etkin değil."),400);
    }
    const saved=await persistNewDraft(c,a,id,kind,provider,data,company);
    if(!saved)return c.json(err("DRAFT_CONFLICT","Taslak kimliği kayıtlı. Listeyi yenileyin."),409);
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,draft:saved}},201);
  });
  app.patch(base+"/:id",async c=>{
    const body=await c.req.json<Row>().catch(()=>null);
    if(!body)return c.json(err("INVALID_BODY","Taslak verisi gerekli."),400);
    const a=await operatorAccess(c,"PATCH",body);if(!a)return c.json(err("FORBIDDEN","Taslak güncelleme yetkisi gerekli."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak şeması üretim onayı bekliyor."),503);
    const id=clean(c.req.param("id")),version=Number(body.version);
    if(!idOk(id)||!Number.isSafeInteger(version)||version<1)return c.json(err("INVALID_VERSION","Geçerli kayıt sürümü gerekli."),400);
    const old=await read(c,a.tenant,id);if(!old)return c.json(err("NOT_FOUND","Taslak bulunamadı."),404);
    if(old.version!==version)return c.json(err("DRAFT_CONFLICT","Taslak değişti. Listeyi yenileyin; eski veri üzerine yazılmadı."),409);
    if(!["SAVE","CHECK","CANCEL"].includes(body.action))return c.json(err("INVALID_ACTION","Kaydet, kontrol et veya iptal seçin."),400);
    if(old.state==="CANCELLED")return c.json(err("DRAFT_CANCELLED","İptal edilmiş taslak değiştirilemez."),409);
    if(body.action==="CANCEL"){
      const deleteAccess=await operatorAccess(c,"DELETE",body);
      if(!deleteAccess)return c.json(err("FORBIDDEN","Taslak iptal yetkisi gerekli."),403);
      const changed=await c.env.DB.prepare("UPDATE accounting_document_drafts SET state='CANCELLED',version=version+1,updated_by=?,updated_at=? WHERE main_company_slug=? AND id=? AND version=? AND state IN ('DRAFT','CHECKED')").bind(a.userId,new Date().toISOString(),a.tenant,id,version).run();
      if(changed.meta.changes!==1)return c.json(err("DRAFT_CONFLICT","Taslak başka bir oturumda değişti."),409);
      const saved=await read(c,a.tenant,id);
      if(!saved||saved.version!==version+1||saved.state!=="CANCELLED")return c.json(err("DRAFT_CONFLICT","İptal sonucu doğrulanamadı."),409);
      return c.json({ok:true,data:{mainCompanySlug:a.tenant,draft:saved}});
    }
    let data;try{data=await verifiedDraft(c,a.tenant,body.action==="CHECK"?old.payload:body.payload,old.kind)}catch(e){return c.json(err("INVALID_DRAFT",(e as Error).message),400)}
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
