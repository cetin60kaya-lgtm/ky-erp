import type {Context,Hono} from "hono";
import {getAuthenticatedUser} from "./auth-cloud";
import {accountingAccess,accountingTenantReadAllowed} from "./accounting-access-policy";
import {selections} from "./e-belge-adapter-company-routes";
import {searchRegisteredItems,resolveRegisteredItemIds} from "./isnet-registered-items";
import {parseDirectCommand,resolveDirectFields,storedWorkflowFields} from "./e-belge-command-core";
import {checkCompanyAiAllowance,recordCompanyAiUsage} from "./company-billing-cloud";
import {validateInterpretation} from "./e-belge-ai-intent";
import {normalizeDraft,type DraftKind} from "./e-belge-draft-core";
import {sourceLookupSql,sourceReservationGuard} from "./e-belge-source-reservation";
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
  return {tenant:tenants[0],userId:clean(user.id),role:clean(user.role).toUpperCase()};
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
 const guard=data.lines.some((l:Row)=>l.sourceLineId)?sourceReservationGuard(a.tenant,id,data.partyId,payload):{sql:"",args:[]};
 const result=await c.env.DB.prepare("INSERT INTO accounting_document_drafts(id,main_company_slug,kind,provider_key,party_company_id,payload,version,state,created_by,updated_by,created_at,updated_at,creation_context) SELECT ?,?,?,?,?,?,1,'DRAFT',?,?,?,?,? WHERE 1=1"+guard.sql+" ON CONFLICT(main_company_slug,id) DO NOTHING").bind(id,a.tenant,kind,provider||null,data.partyId,payload,a.userId,a.userId,now,now,audit,...guard.args).run();
 const saved=await read(c,a.tenant,id);
 if(!saved||(!result.meta.changes&&(saved.kind!==kind||saved.provider_key!==(provider||null)||JSON.stringify(saved.payload)!==payload||JSON.stringify(saved.creation_context)!==audit||saved.version!==1)))return null;
 return saved;
}
export async function operatorReadReady(c:Context<Env>){
 return Boolean(await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_document_read_state'").first());
}
const aiModel="@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const canManagePolicy=(role:string)=>["ADMIN","SUPER_ADMIN","COMPANY_ADMIN"].includes(role);
async function aiPolicy(c:Context<Env>,tenant:string){
 const ready=Boolean(await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ebelge_operator_policy'").first());
 const row=ready?await c.env.DB.prepare("SELECT version,ai_enabled,updated_at FROM ebelge_operator_policy WHERE main_company_slug=?").bind(tenant).first<Row>():null;
 return {ready,version:Number(row?.version||0),aiEnabled:Number(row?.ai_enabled||0)===1,updatedAt:row?.updated_at||"",sendEnabled:false};
}
// Optional second opinion for outgoing draft CHECK only. Deterministic warnings remain hard gates. No personal fields or document text sent.
async function draftAiReview(c:Context<Env>,a:{tenant:string;userId:string},data:Row,kind:DraftKind){
 const policy=await aiPolicy(c,a.tenant);
 if(!policy.ready||!policy.aiEnabled||!c.env.AI)return {ok:false,code:"AI_CONTROL_NOT_READY",message:"AI görüşü hazır değil; kesin resmî onay verilmez."};
 const allowance=await checkCompanyAiAllowance(c.env.DB,a.tenant);
 if(!allowance.allowed||!allowance.metered)return {ok:false,code:"AI_CONTROL_NOT_READY",message:"AI kullanım yetkisi doğrulanamadı."};
 if(!data.lines.length||data.lines.length>200)return {ok:false,code:"AI_CONTROL_REQUIRED",message:"Kalem kontrolü gerekli."};
 const shape={kind,scenario:data.scenario,currency:data.currency,lines:data.lines.map((l:Row)=>({quantity:l.quantity,price:l.price,vatRate:l.vatRate,discountRate:l.discountRate,freeKind:l.freeKind,net:l.net,vat:l.vat})),net:data.net,vat:data.vat,total:data.total};
 try{
  const binding=c.env.AI as unknown as {run:(model:string,input:Record<string,unknown>,options:Record<string,unknown>)=>Promise<unknown>};
  const result=await binding.run(aiModel,{messages:[{role:"system",content:"Yalnız sayısal ve belge senaryosu ön kontrolü yap. Kullanıcı bilgisi yok. Vergi mevzuatı onayı verme, işlem yapma. Belirgin miktar/fiyat/iskonto/KDV/tutar tutarsızlığı veya şüphe varsa REVIEW, yalnız tutarlıysa PASS. Çıktı tam olarak JSON {\"status\":\"PASS\"} veya {\"status\":\"REVIEW\"}. Başka alan yok."},{role:"user",content:JSON.stringify(shape)}],temperature:0,max_tokens:40},{gateway:{id:clean((c.env as unknown as Row).AI_GATEWAY_ID)||"default",skipCache:true,collectLog:false,metadata:{app:"KYERP",tenant:a.tenant,module:"EBELGE_DRAFT_CONTROL",requestId:clean(c.get("requestId"))}}});
  const output=result as Row;
  const ledger=await recordCompanyAiUsage(c.env.DB,{mainCompanySlug:a.tenant,usage:output?.usage,sourceRef:clean(c.get("requestId"))||crypto.randomUUID(),actorUserId:a.userId,model:aiModel,note:"e-Belge isteğe bağlı taslak ön kontrolü"});
  const after=await aiPolicy(c,a.tenant);
  if(!ledger.recorded||!after.aiEnabled||after.version!==policy.version)return {ok:false,code:"AI_CONTROL_UNVERIFIED",message:"AI kontrolü doğrulanamadı."};
  const parsed=JSON.parse(typeof result==="string"?result:typeof output?.response==="string"?output.response:"");
  if(!parsed||Object.keys(parsed).length!==1||parsed.status!=="PASS")return {ok:false,code:"AI_CONTROL_REVIEW",message:"AI kontrolü tutarsızlık veya belirsizlik gördü; kalemleri ve toplamları yeniden inceleyin."};
  return {ok:true,model:aiModel,policyVersion:policy.version,checkedAt:new Date().toISOString()};
 }catch{return {ok:false,code:"AI_CONTROL_UNAVAILABLE",message:"AI kontrolü tamamlanamadı. Otomatik onay verilmedi."}}
}
export function registerEBelgeDraftRoutes(app:Hono<Env>){
  app.get("/api/e-belge/operator-policy",async c=>{
    const a=await operatorAccess(c,"GET");if(!a)return c.json(err("FORBIDDEN","Firma erişimi gerekli."),403);
    c.header("Cache-Control","no-store");return c.json({ok:true,data:{mainCompanySlug:a.tenant,...await aiPolicy(c,a.tenant),canManage:canManagePolicy(a.role)}});
  });
  app.put("/api/e-belge/operator-policy",async c=>{
    const body=await c.req.json<Row>().catch(()=>null);
    if(!body)return c.json(err("INVALID_BODY","Politika gerekli."),400);
    const a=await operatorAccess(c,"PUT",body);if(!a||!canManagePolicy(a.role))return c.json(err("FORBIDDEN","Firma yönetimi yetkisi gerekli."),403);
    const current=await aiPolicy(c,a.tenant);
    if(!current.ready)return c.json(err("SCHEMA_REQUIRED","Politika şeması henüz uygulanmadı."),503);
    if(typeof body.aiEnabled!=="boolean"||!Number.isSafeInteger(body.version)||body.version!==current.version)return c.json(err("POLICY_CONFLICT","Ayarlar değişti veya sürüm geçersiz. Yenileyin."),409);
    const now=new Date().toISOString();
    const result=current.version?await c.env.DB.prepare("UPDATE ebelge_operator_policy SET version=version+1,ai_enabled=?,updated_by=?,updated_at=? WHERE main_company_slug=? AND version=?").bind(body.aiEnabled?1:0,a.userId,now,a.tenant,current.version).run():await c.env.DB.prepare("INSERT INTO ebelge_operator_policy(main_company_slug,version,ai_enabled,updated_by,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(main_company_slug) DO NOTHING").bind(a.tenant,body.aiEnabled?1:0,a.userId,now).run();
    const saved=await aiPolicy(c,a.tenant);
    if(result.meta.changes!==1||saved.version!==current.version+1||saved.aiEnabled!==body.aiEnabled)return c.json(err("POLICY_CONFLICT","Politika kayıt sonucu doğrulanamadı."),409);
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,...saved,canManage:true}});
  });
  app.post("/api/e-belge/operator-command/interpret",async c=>{
    const body=await c.req.json<Row>().catch(()=>null);
    if(!body||body.allowAi!==true||typeof body.command!=="string"||!body.command.trim()||body.command.length>500)return c.json(err("INVALID_COMMAND","En fazla 500 karakter ve açık AI yorumlama isteği gerekli."),400);
    const a=await operatorAccess(c,"POST",body);if(!a)return c.json(err("FORBIDDEN","Firma/işlem yetkisi gerekli."),403);
    const policy=await aiPolicy(c,a.tenant);
    if(!policy.ready||!policy.aiEnabled)return c.json(err("AI_POLICY_DISABLED","Firma AI komut yorumlama politikasını açmadı."),403);
    const allowance=await checkCompanyAiAllowance(c.env.DB,a.tenant);
    if(!allowance.allowed||!allowance.metered)return c.json(err("AI_ALLOWANCE_REQUIRED","Firma AI kullanım/ölçüm yapılandırması doğrulanamadı."),403);
    if(!c.env.AI)return c.json(err("AI_UNAVAILABLE","Workers AI bağlantısı hazır değil."),503);
    // Data minimization: send only the text deliberately entered by this user. No database rows,
    // source documents, credentials, files, SQL or executable tools are sent to the model.
    const binding=c.env.AI as unknown as {run:(model:string,input:Record<string,unknown>,options:Record<string,unknown>)=>Promise<unknown>};
    let result:unknown;
    try{result=await binding.run(aiModel,{messages:[{role:"system",content:"Türkçe e-Belge komutunu yalnız doğrudan fatura veya doğrudan irsaliye taslağı için biçimlendir. JSON dışında çıktı verme. Şema: {command: string, question: string}. Biçim: Cari için Model 100 adet 10 TL’den doğrudan fatura oluştur. Cari, model, miktar, birim ve açık fiyat yalnız kullanıcı metninden aynen; fiyat belirtilmediyse ekleme. Kaynak irsaliye, özel vergi, indirim, iptal, gönderim veya belirsizlikte command boş, question kısa olsun. İşlem yapma, yeni değer uydurma."},{role:"user",content:body.command}],temperature:0,max_tokens:280},{gateway:{id:clean((c.env as unknown as Row).AI_GATEWAY_ID)||"default",skipCache:true,collectLog:false,metadata:{app:"KYERP",tenant:a.tenant,module:"EBELGE_INTENT",requestId:clean(c.get("requestId"))}}});}catch{return c.json(err("AI_UNAVAILABLE","AI komutu yorumlayamadı. Kural tabanlı işlem veya editör kullanılabilir."),502)}
    const output=result as Row;
    try{
      const ledger=await recordCompanyAiUsage(c.env.DB,{mainCompanySlug:a.tenant,usage:output?.usage,sourceRef:clean(c.get("requestId"))||crypto.randomUUID(),actorUserId:a.userId,model:aiModel,note:"e-Belge intent önerisi"});
      if(!ledger.recorded)return c.json(err("AI_USAGE_UNVERIFIED","AI kullanım kaydı doğrulanamadı; öneri uygulanmadı."),503);
      const suggestion=validateInterpretation(body.command,typeof result==="string"?result:output?.response);
      const after=await aiPolicy(c,a.tenant);if(!after.aiEnabled||after.version!==policy.version)return c.json(err("AI_POLICY_CHANGED","AI politikası değişti; öneri uygulanmadı."),409);
      c.header("Cache-Control","no-store");return c.json({ok:true,data:{mainCompanySlug:a.tenant,...suggestion,requiresReview:true,sendAllowed:false}});
    }catch{return c.json(err("AI_REVIEW_REQUIRED","Komut güvenli biçimde doğrulanamadı. Doğrudan komut veya ortak editör kullanılabilir."),422)}
  });
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
  app.get("/api/e-belge/operator-dispatch-sources",async c=>{
    const a=await operatorAccess(c,"GET");if(!a)return c.json(err("FORBIDDEN","Firma erişimi gerekli."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak şeması üretim onayı bekliyor."),503);
    const partyId=clean(c.req.query("partyId")),documentNo=clean(c.req.query("documentNo"));
    if(!partyId||!documentNo||documentNo.length>100||!await party(c,a.tenant,partyId))return c.json(err("INVALID_SOURCE","Aktif cari ve tam irsaliye numarası gerekli."),400);
    const rows=(await c.env.DB.prepare(sourceLookupSql).bind(a.tenant,partyId,documentNo).all<Row>()).results||[];
    if(rows.length>200||new Set(rows.map(r=>r.documentId)).size>1)return c.json(err("SOURCE_REVIEW_REQUIRED","Kaynak belge tekil değil veya kalem sınırı aşıldı."),409);
    c.header("Cache-Control","no-store");
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,partyId,documentNo,items:rows.map(r=>({documentId:r.documentId,lineId:r.lineId,description:r.description,unit:r.unit,quantity:r.quantity,internalRemaining:Math.max(0,Math.round(Number(r.quantity)*1000)-Number(r.reservedMilli))/1000})),officialRemainingVerified:false}});
  });
  const base="/api/e-belge/operator-drafts";
  app.get(base,async c=>{
    const a=await operatorAccess(c,"GET");if(!a)return c.json(err("FORBIDDEN","Firma veya muhasebe yetkisi doğrulanamadı."),403);
    if(!await readiness(c))return c.json(err("DRAFT_SCHEMA_REQUIRED","Taslak veri şeması henüz onaylanıp uygulanmadı."),503);
    const kind=kindOf(c.req.query("kind"));if(!kind)return c.json(err("INVALID_KIND","Belge türü seçin."),400);
    const page=Math.min(100000,Math.max(1,Math.trunc(Number(c.req.query("page"))||1)));
    const state=clean(c.req.query("state")).toUpperCase()||"ACTIVE";
    if(!["ACTIVE","DRAFT","CHECKED","CANCELLED"].includes(state))return c.json(err("INVALID_STATE","Taslak durumu geçersiz."),400);
    const family=clean(c.req.query("family")).toUpperCase()||"ALL";
    if(!["ALL","EINVOICE","ARCHIVE"].includes(family)||(kind!=="INVOICE"&&family!=="ALL"))return c.json(err("INVALID_FAMILY","Taslak ailesi geçersiz."),400);
    const clause=(state==="ACTIVE"?"state IN ('DRAFT','CHECKED')":"state=?")+(family==="ARCHIVE"?" AND json_extract(payload,'$.scenario')='EARSIVFATURA'":family==="EINVOICE"?" AND COALESCE(json_extract(payload,'$.scenario'),'')<>'EARSIVFATURA'":"");
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
    if(!saved)return c.json(err("DRAFT_CONFLICT","Taslak kimliği, kaynak irsaliye veya ayrılabilir miktar değişti. Listeyi yenileyin."),409);
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
    let aiControl:Row|null=null;
    if(body.action==="CHECK"){
      // CHECKED is an internal deterministic validation; no official approval/send.
      const user=await getAuthenticatedUser(c);
      if(!user||!accountingAccess(user,"POST","/api/e-belge/operator-drafts/approve"))return c.json(err("FORBIDDEN","Taslak kontrolü için onay yetkisi gerekli."),403);
      let policy:Awaited<ReturnType<typeof aiPolicy>>|null=null;
      try{policy=await aiPolicy(c,a.tenant)}catch{/* deterministic validation remains available */}
      if(policy?.aiEnabled){
        let result:Awaited<ReturnType<typeof draftAiReview>>|null=null;
        try{result=await draftAiReview(c,a,data,old.kind)}catch{/* unavailable */}
        if(result?.code==="AI_CONTROL_REVIEW")return c.json(err("AI_CONTROL_REVIEW",result.message||"Kalemleri inceleyin."),409);
        aiControl=result?.ok?{...result,status:"PASS"}:{status:"UNAVAILABLE",code:result?.code||"AI_CONTROL_UNAVAILABLE"};
      }else aiControl={status:policy?"NOT_REQUESTED":"UNAVAILABLE"};
    }
    const payload=JSON.stringify({...data,partyName:company.name,partyTaxNo:company.tax_no||"",...(aiControl?{aiControl}: {})}),state=body.action==="CHECK"?"CHECKED":"DRAFT";
    const oldSources=old.payload.lines.filter((l:Row)=>l.sourceLineId);
    if(oldSources.length&&(old.payload.partyId!==data.partyId||!data.lines.some((l:Row)=>l.sourceLineId)||oldSources.some((l:Row)=>!data.lines.some((n:Row)=>n.sourceDocumentId===l.sourceDocumentId&&n.sourceLineId===l.sourceLineId))))return c.json(err("SOURCE_IDENTITY_LOCKED","Kaydedilmiş kaynak kalemleri ve cari değiştirilemez. Gerekirse taslağı iptal edip yeniden oluşturun."),409);
    const guard=data.lines.some((l:Row)=>l.sourceLineId)?sourceReservationGuard(a.tenant,id,data.partyId,payload):{sql:"",args:[]};
    const changed=await c.env.DB.prepare("UPDATE accounting_document_drafts SET payload=?,party_company_id=?,state=?,version=version+1,updated_by=?,updated_at=? WHERE main_company_slug=? AND id=? AND version=?"+guard.sql).bind(payload,data.partyId,state,a.userId,new Date().toISOString(),a.tenant,id,version,...guard.args).run();
    if(changed.meta.changes!==1)return c.json(err("DRAFT_CONFLICT","Taslak veya kaynak miktarı değişti; üzerine yazılmadı."),409);
    const saved=await read(c,a.tenant,id);
    if(!saved||saved.version!==version+1)return c.json(err("DRAFT_CONFLICT","Kayıt yeniden okunurken sürüm değişti. Listeyi yenileyin."),409);
    return c.json({ok:true,data:{mainCompanySlug:a.tenant,draft:saved}});
  });
}
