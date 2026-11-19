// Customer/group/planner invoice delivery routing; stored in canonical tenant-scoped json_store.
// This module never sends email, changes an invoice, or posts an accounting entry.
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerInvoiceWeeklyReconciliationRoutes } from "./accounting-invoice-weekly-reconciliation";
import {invoiceMailCommonModelIds,invoiceMailDocumentFromFile,invoiceMailOutlookFileEvidence,invoiceMailDispatchKey,invoiceMailLegacyKeyPrefix,invoiceMailIsLegacyOrCanonicalKey,invoiceMailAttachmentProved} from "./invoice-mail-model-evidence";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const SCOPE = "MUHASEBE_INVOICE_MAIL_ROUTE";
const CONTACT_SCOPE = "MUHASEBE_INVOICE_MAIL_CONTACT";
const txt = (v: unknown) => v == null ? "" : String(v).trim();
const role = (v: unknown) => txt(v).toUpperCase().replace(/İ/g, "I");
const now = () => new Date().toISOString();
const elevated = (u: Row) => ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(role(u.role));

function mayAccess(u: Row, write = false) {
  if (elevated(u)) return true;
  return Array.isArray(u.permissions) && u.permissions.some((p: Row) =>
    role(p.moduleKey || p.module_key) === "MUHASEBE" &&
    Boolean(write ? p.canUpdate ?? p.can_update ?? p.canCreate ?? p.can_create
      : p.canView ?? p.can_view));
}
async function jsonBody(c: Context<AppEnv>): Promise<Row> {
  try { const v = await c.req.json(); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
}
function error(c: Context<AppEnv>, code: string, message: string, status: number) {
  return c.json({ok:false,error:{code,message}},status as any);
}
async function access(c: Context<AppEnv>, body: Row = {}, write = false) {
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) return {failure:error(c,"UNAUTHORIZED","Oturum gerekli.",401)};
  if (!mayAccess(user, write)) return {failure:error(c,"ACCOUNTING_ACCESS_FORBIDDEN","Muhasebe yetkiniz bulunmuyor.",403)};
  const own = txt(user.mainCompanySlug || user.security?.main_company_slug).toLocaleLowerCase("tr-TR");
  const asked = txt(body.mainCompanySlug || c.req.query("mainCompanySlug")).toLocaleLowerCase("tr-TR");
  if (!own && role(user.role) !== "SUPER_ADMIN" && role(user.role) !== "ADMIN") {
    return {failure:error(c,"TENANT_REQUIRED","Firma bağlamı bulunamadı.",403)};
  }
  if (asked && asked !== own && !["SUPER_ADMIN","ADMIN"].includes(role(user.role))) {
    return {failure:error(c,"TENANT_FORBIDDEN","Başka firmanın alıcı bilgilerini değiştiremezsiniz.",403)};
  }
  const tenant = asked || own;
  if (!tenant) return {failure:error(c,"TENANT_REQUIRED","Ana firma seçin.",400)};
  const company = await c.env.DB.prepare("SELECT slug FROM main_companies WHERE slug=? LIMIT 1")
    .bind(tenant).first<Row>();
  if (!company) return {failure:error(c,"TENANT_NOT_FOUND","Ana firma bulunamadı.",404)};
  return {user,tenant};
}
function emails(value: unknown, required: boolean) {
  if (!Array.isArray(value) || value.length > 12 || (required && !value.length)) return null;
  const list = value.map((v) => txt(v).toLowerCase());
  if (list.some((v) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(v))) return null;
  return [...new Set(list)];
}
function validRow(input: Row) {
  const groupCode = role(input.groupCode).replace(/\s+/g, "");
  const customerName = txt(input.customerName);
  const plannerName = txt(input.plannerName);
  const plannerEmail = txt(input.plannerEmail).toLowerCase();
  const department = txt(input.department);
  const to = emails(input.to, true);
  const cc = emails(input.cc || [], false);
  if (!/^[0-9]{2,4}(?:-[0-9]{1,3})?$/.test(groupCode))
    return {error:"Grup / alt ekip kodu 165, 165-6 gibi olmalıdır."};
  if (!customerName || customerName.length > 160 || !plannerName || plannerName.length > 120 || department.length > 160)
    return {error:"Müşteri, planlamacı ve departman alanlarını kontrol edin."};
  if (plannerEmail && !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(plannerEmail))
    return {error:"Planlamacı e-posta adresi geçersiz."};
  if (!to || !cc || to.length + cc.length > 16) return {error:"Fatura alıcısı ve CC adreslerini kontrol edin."};
  return {value:{customerName,groupCode,department,plannerName,plannerEmail,to,cc}};
}

export function registerAccountingInvoiceMailRoutes(app: Hono<AppEnv>) {
  registerInvoiceWeeklyReconciliationRoutes(app);
  app.get("/api/muhasebe/invoice-mail-routes", async (c) => {
    const a = await access(c);
    if (a.failure) return a.failure;
    const rows = await c.env.DB.prepare(
      "SELECT file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND main_company_slug=? ORDER BY updated_at DESC LIMIT 300"
    ).bind(SCOPE,a.tenant).all<Row>();
    const profiles = (rows.results || []).map((row) => {
      try {
        const value=JSON.parse(txt(row.data));
        return {...value,id:txt(row.file_name),createdAt:row.created_at,updatedAt:row.updated_at};
      } catch { return null; }
    }).filter(Boolean);
    return c.json({ok:true,data:profiles});
  });

  app.post("/api/muhasebe/invoice-mail-routes", async (c) => {
    const body = await jsonBody(c);
    const a = await access(c,body,true);
    if (a.failure) return a.failure;
    const normalized=validRow(body);
    if (normalized.error) return error(c,"ROUTE_INVALID",normalized.error,422);
    const id=txt(body.id);
    const ts=now();
    if (id) {
      const existing=await c.env.DB.prepare(
        "SELECT id,created_at FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1"
      ).bind(SCOPE,a.tenant,id).first<Row>();
      if (!existing) return error(c,"ROUTE_NOT_FOUND","Bu alıcı eşleştirmesi bulunamadı.",404);
      const data={...normalized.value,id,updatedBy:txt(a.user?.id)};
      await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?")
        .bind(JSON.stringify(data),ts,existing.id).run();
      return c.json({ok:true,data:{...data,createdAt:existing.created_at,updatedAt:ts}});
    }
    const newId=crypto.randomUUID();
    const data={...normalized.value,id:newId,updatedBy:txt(a.user?.id)};
    await c.env.DB.prepare(
      "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)"
    ).bind(crypto.randomUUID(),SCOPE,a.tenant,newId,JSON.stringify(data),ts,ts).run();
    return c.json({ok:true,data:{...data,createdAt:ts,updatedAt:ts}},201);
  });

  // One canonical HKN send identity; the file package can contain multiple DDMs.
  // Pure preflight: no draft, send, or financial row is created.
  app.post("/api/muhasebe/invoice-mail-preflight",async(c)=>{
    const body=await jsonBody(c),a=await access(c,body,true);if(a.failure)return a.failure;
    const invoiceNo=txt(body.invoiceNo).toUpperCase().replace(/[^A-Z0-9]/g,"");
    const invoiceAssetId=txt(body.invoiceAssetId),accountId=txt(body.accountId),routeId=txt(body.routeId),modelId=txt(body.modelId);
    const raw=Array.isArray(body.deliveryAssets)?body.deliveryAssets:[{deliveryNo:body.deliveryNo,deliveryAssetId:body.deliveryAssetId}];
    const deliveries=raw.map((d:Row)=>({no:txt(d.deliveryNo).toUpperCase().replace(/[^A-Z0-9]/g,""),id:txt(d.deliveryAssetId)}));
    if(!/^HKN[0-9]{8,18}$/.test(invoiceNo)||!invoiceAssetId||!accountId||!routeId||!deliveries.length||deliveries.length>9||
      deliveries.some(d=>!/^DDM[0-9]{8,18}$/.test(d.no)||!d.id)||new Set(deliveries.map(d=>d.no)).size!==deliveries.length||
      new Set([invoiceAssetId,...deliveries.map(d=>d.id)]).size!==deliveries.length+1)
      return error(c,"MAIL_PREFLIGHT_INVALID","Bir HKN ve en fazla dokuz farklı DDM PDF, hesap ve alıcı profili zorunludur.",422);
    if(!emails(body.to,true)||!emails(body.cc||[],false)||!emails(body.bcc||[],false))
      return error(c,"MAIL_RECIPIENT_INVALID","TO/CC/BCC adreslerini kontrol edin.",422);
    if(!txt(body.subject)||txt(body.subject).length>250||!txt(body.bodyText)||txt(body.bodyText).length>20000)
      return error(c,"MAIL_CONTENT_INVALID","Konu ve mesaj geçerli olmalıdır.",422);
    const route=await c.env.DB.prepare("SELECT id FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
      .bind(SCOPE,a.tenant,routeId).first<Row>();
    if(!route)return error(c,"MAIL_ROUTE_NOT_FOUND","Firma/grup alıcı profili bulunamadı.",409);
    const account=await c.env.DB.prepare("SELECT id,provider_type,status,approval_status,provider_connected FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1")
      .bind(accountId,a.tenant).first<Row>();
    if(!account||role(account.provider_type)!=="MICROSOFT_365"||role(account.status)!=="ACTIVE"||
       role(account.approval_status)!=="APPROVED"||Number(account.provider_connected)!==1)
      return error(c,"MAIL_ACCOUNT_NOT_READY","Onaylı ve bağlı Outlook hesabı gerekir.",409);
    if(modelId){
      const model=await c.env.DB.prepare("SELECT id FROM model_records WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1")
        .bind(modelId,a.tenant).first<Row>();
      if(!model)return error(c,"MAIL_MODEL_NOT_FOUND","Canonical model bulunamadı.",409);
    }
    const verifiedAssets:Row[]=[];
    for(const file of [{no:invoiceNo,id:invoiceAssetId,prefix:"HKN"},...deliveries.map(d=>({...d,prefix:"DDM"}))]){
      const asset=await c.env.DB.prepare("SELECT id,file_name,status,mime_type FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1")
        .bind(file.id,a.tenant).first<Row>();
      if(!asset||role(asset.status)!=="AVAILABLE"||invoiceMailDocumentFromFile(asset.file_name,file.prefix as "HKN"|"DDM")!==file.no)
        return error(c,"MAIL_PDF_MISMATCH","HKN/DDM PDF dosyası File Hub üzerinden kesin doğrulanamadı.",409);
      verifiedAssets.push({id:file.id,prefix:file.prefix});
    }
    if(modelId){
      const relations=await c.env.DB.prepare("SELECT file_asset_id FROM file_hub_relations WHERE main_company_slug=? AND entity_type='MODEL' AND entity_id=?")
        .bind(a.tenant,modelId).all<Row>();
      const linked=new Set((relations.results||[]).map(r=>txt(r.file_asset_id)));
      if(!linked.has(invoiceAssetId)||!deliveries.some(d=>linked.has(d.id)))
        return error(c,"MAIL_PDF_MODEL_MISMATCH","Model için HKN ve en az bir ilgili DDM File Hub ilişkisi gerekir.",409);
    }
    const key=invoiceMailDispatchKey(a.tenant,invoiceNo),legacy=invoiceMailLegacyKeyPrefix(a.tenant,invoiceNo);
    const old=await c.env.DB.prepare("SELECT id,status FROM mail_send_jobs WHERE main_company_slug=? AND (logical_event_id=? OR substr(logical_event_id,1,?)=?) LIMIT 1")
      .bind(a.tenant,key,legacy.length,legacy).first<Row>();
    if(old)return error(c,"MAIL_ALREADY_ATTEMPTED","Bu HKN için daha önce gönderim başlatılmış. Eski DDM eşleşmeleri dahil geçmişi kontrol edin.",409);
    return c.json({ok:true,data:{verified:true,logicalEventId:key,deliveryNos:deliveries.map(d=>d.no),attachmentCount:verifiedAssets.length}});
  });

  // The persisted provider job is authoritative and deduplicated per HKN.
  app.get("/api/muhasebe/invoice-mail-dispatch-status",async(c)=>{
    const a=await access(c);if(a.failure)return a.failure;
    const invoiceNo=txt(c.req.query("invoiceNo")).toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!/^HKN[0-9]{8,18}$/.test(invoiceNo))return error(c,"MAIL_STATUS_DOCUMENT_INVALID","Tam HKN numarası gerekir.",422);
    const key=invoiceMailDispatchKey(a.tenant,invoiceNo),legacy=invoiceMailLegacyKeyPrefix(a.tenant,invoiceNo);
    const jobs=await c.env.DB.prepare("SELECT id,draft_id,status,logical_event_id,requested_by,updated_at FROM mail_send_jobs WHERE main_company_slug=? AND (logical_event_id=? OR substr(logical_event_id,1,?)=?) ORDER BY created_at DESC LIMIT 2")
      .bind(a.tenant,key,legacy.length,legacy).all<Row>();
    if((jobs.results||[]).length>1)return c.json({ok:true,data:{status:"REVIEW_REQUIRED",linked:false,delivered:false}});
    const job=(jobs.results||[])[0];if(!job)return c.json({ok:true,data:{status:"NOT_STARTED",linked:false}});
    const linked=await c.env.DB.prepare("SELECT data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
      .bind("MUHASEBE_INVOICE_MAIL_LINK",a.tenant,txt(job.draft_id)).first<Row>();
    const stored=(()=>{try{return JSON.parse(txt(linked?.data)||"{}");}catch{return{};}})();
    const canReconcile=elevated(a.user!)||txt(job.requested_by)===txt(a.user?.id);
    const deliveries=Array.isArray(stored.deliveryNos)?stored.deliveryNos:stored.deliveryNo?[stored.deliveryNo]:
      txt(job.logical_event_id).startsWith(legacy)?[txt(job.logical_event_id).slice(legacy.length)]:[];
    if(!deliveries.length && canReconcile){
      const draft=await c.env.DB.prepare("SELECT attachment_refs_json FROM mail_drafts WHERE id=? AND main_company_slug=? LIMIT 1")
        .bind(txt(job.draft_id),a.tenant).first<Row>();
      let refs:any[]=[];try{refs=JSON.parse(txt(draft?.attachment_refs_json)||"[]");}catch{}
      for(const ref of refs.slice(0,10)){
        const assetId=txt(typeof ref==="string"?ref:ref.fileAssetId||ref.file_asset_id||ref.id);
        const asset=await c.env.DB.prepare("SELECT file_name FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1")
          .bind(assetId,a.tenant).first<Row>();
        const no=invoiceMailDocumentFromFile(asset?.file_name,"DDM");
        if(no&&!deliveries.includes(no))deliveries.push(no);
      }
    }
    return c.json({ok:true,data:{status:role(job.status),linked:Boolean(linked),deliveryNos:deliveries,
      draftId:canReconcile?txt(job.draft_id):null,sendJobId:canReconcile?txt(job.id):null,
      updatedAt:txt(job.updated_at),providerAccepted:role(job.status)==="ACCEPTED",delivered:false}});
  });

  // Read-only reporting uses the accepted provider send job, never a client-claimed "sent" flag.
  app.get("/api/muhasebe/invoice-mail-links", async (c) => {
    const a = await access(c);
    if (a.failure) return a.failure;
    const invoiceNo=txt(c.req.query("invoiceNo")).toUpperCase().replace(/[^A-Z0-9]/g,"");
    const modelId=txt(c.req.query("modelId"));
    if (!invoiceNo && !modelId) return c.json({ok:true,data:[]});
    const filters=["scope=?","main_company_slug=?"];
    const args:any[]=["MUHASEBE_INVOICE_MAIL_LINK",a.tenant];
    if (invoiceNo) {filters.push("json_extract(data,'$.invoiceNo')=?");args.push(invoiceNo);}
    if (modelId) {filters.push("(json_extract(data,'$.modelId')=? OR EXISTS(SELECT 1 FROM json_each(data,'$.modelIds') model WHERE model.value=?))");args.push(modelId,modelId);}
    const result=await c.env.DB.prepare("SELECT file_name,data,created_at FROM json_store WHERE "+filters.join(" AND ")+" ORDER BY created_at DESC LIMIT 80")
      .bind(...args).all<Row>();
    const links=(result.results||[]).map((row) => {
      try{return {...JSON.parse(txt(row.data)),id:row.file_name,recordedAt:row.created_at};}
      catch{return null;}
    }).filter(Boolean);
    return c.json({ok:true,data:links});
  });

  // Synced Outlook sent archive: display candidates, never promote filename-only
  // evidence to a confirmed Model 360 relationship.
  app.get("/api/muhasebe/invoice-mail-outlook-history",async(c)=>{
    const a=await access(c);if(a.failure)return a.failure;
    const modelId=txt(c.req.query("modelId"));
    if(!modelId)return error(c,"MODEL_ID_REQUIRED","Model kartı seçilmelidir.",422);
    const model=await c.env.DB.prepare("SELECT id FROM model_records WHERE main_company_slug=? AND id=? AND deleted_at IS NULL LIMIT 1")
      .bind(a.tenant,modelId).first<Row>();
    if(!model)return error(c,"MODEL_NOT_FOUND","Model bulunamadı.",404);
    const fileRows=await c.env.DB.prepare(
      "SELECT DISTINCT f.id,f.file_name,f.sha256 FROM file_hub_relations r JOIN file_hub_assets f ON f.id=r.file_asset_id AND f.main_company_slug=r.main_company_slug WHERE r.main_company_slug=? AND r.entity_type='MODEL' AND r.entity_id=? AND UPPER(f.status)='AVAILABLE'"
    ).bind(a.tenant,modelId).all<Row>();
    const assets=new Map<string,Row>((fileRows.results||[]).map(row=>[txt(row.id),row]));
    const hkn=[...new Set((fileRows.results||[]).map(r=>invoiceMailDocumentFromFile(r.file_name,"HKN")).filter(Boolean))];
    const ddm=[...new Set((fileRows.results||[]).map(r=>invoiceMailDocumentFromFile(r.file_name,"DDM")).filter(Boolean))];
    if(!hkn.length||!ddm.length)return c.json({ok:true,data:{items:[],scanned:0,limited:false,source:"OUTLOOK_ATTACHMENT_EVIDENCE"}});
    const admin=elevated(a.user!),userId=txt(a.user?.id);
    const permissionJoin=admin?"":"JOIN mail_account_members mm ON mm.main_company_slug=m.main_company_slug AND mm.account_id=m.account_id AND mm.user_id=? AND mm.can_view=1";
    const params:any[]=admin?[]:[userId];params.push(a.tenant);
    const result=await c.env.DB.prepare(
      "SELECT DISTINCT m.id,m.subject,m.sent_at,m.provider_message_id FROM mail_messages m JOIN mail_accounts account ON account.main_company_slug=m.main_company_slug AND account.id=m.account_id JOIN mail_folders folder ON folder.main_company_slug=m.main_company_slug AND folder.id=m.folder_id "+permissionJoin+
      " JOIN mail_attachments att ON att.main_company_slug=m.main_company_slug AND att.message_id=m.id WHERE m.main_company_slug=? AND m.direction='OUTGOING' AND m.sent_at IS NOT NULL AND UPPER(folder.folder_type)='SENT' AND account.provider_type='MICROSOFT_365' AND UPPER(att.file_name) LIKE 'HKN%.PDF' ORDER BY m.sent_at DESC LIMIT 201"
    ).bind(...params).all<Row>();
    const messages=(result.results||[]).slice(0,200),byMessage=new Map<string,Row[]>();
    // D1 allows 100 bound parameters, including the tenant. Batch under the cap.
    for(let offset=0;offset<messages.length;offset+=90){
      const ids=messages.slice(offset,offset+90).map(m=>txt(m.id));
      const pieces=await c.env.DB.prepare("SELECT message_id,file_name,file_asset_id,provider_metadata FROM mail_attachments WHERE main_company_slug=? AND message_id IN ("+ids.map(()=>"?").join(",")+")")
        .bind(a.tenant,...ids).all<Row>();
      for(const row of pieces.results||[]){
        const key=txt(row.message_id),list=byMessage.get(key)||[];
        list.push(row);byMessage.set(key,list);
      }
    }
    const items=messages.map(m=>{
      const attachments=byMessage.get(txt(m.id))||[];
      const evidence=invoiceMailOutlookFileEvidence(attachments.map(att=>txt(att.file_name)),hkn,ddm);
      if(!evidence)return null;
      const relevant=attachments.filter(att=>invoiceMailDocumentFromFile(att.file_name,"HKN")===evidence.invoiceNo||
        evidence.deliveryNos.includes(invoiceMailDocumentFromFile(att.file_name,"DDM")));
      const proved=relevant.length===evidence.deliveryNos.length+1&&relevant.every(att=>{
        let metadata:Row={};try{metadata=JSON.parse(txt(att.provider_metadata)||"{}");}catch{}
        const asset=assets.get(txt(att.file_asset_id));
        return invoiceMailAttachmentProved({fileAssetId:txt(att.file_asset_id),fileName:txt(att.file_name),sha256:txt(metadata.sha256)},
          asset?{id:txt(asset.id),sha256:txt(asset.sha256),fileName:txt(asset.file_name)}:undefined);
      });
      return {id:txt(m.id),invoiceNo:evidence.invoiceNo,deliveryNo:evidence.deliveryNo,
        deliveryNos:evidence.deliveryNos,subject:txt(m.subject),sentAt:txt(m.sent_at),
        providerMessageId:txt(m.provider_message_id),status:"OUTLOOK_SYNCED_SENT",
        verificationStatus:proved?"VERIFIED":"REVIEW_REQUIRED",source:"OUTLOOK_ATTACHMENT_EVIDENCE",delivered:false};
    }).filter(Boolean);
    c.header("Cache-Control","private, no-store");
    return c.json({ok:true,data:{items,scanned:messages.length,limited:(result.results||[]).length>200,source:"OUTLOOK_ATTACHMENT_EVIDENCE"}});
  });

  // Link ONE accepted mail job to every model proven by HKN and at least one DDM.
  app.post("/api/muhasebe/invoice-mail-links",async(c)=>{
    const body=await jsonBody(c),a=await access(c,body,true);if(a.failure)return a.failure;
    const draftId=txt(body.draftId),modelId=txt(body.modelId),
      invoiceNo=txt(body.invoiceNo).toUpperCase().replace(/[^A-Z0-9]/g,"");
    const raw=Array.isArray(body.deliveryNos)?body.deliveryNos:[body.deliveryNo];
    const deliveryNos=[...new Set(raw.map((v:unknown)=>txt(v).toUpperCase().replace(/[^A-Z0-9]/g,"")).filter(Boolean))];
    if(!draftId||!/^HKN[0-9]{8,18}$/.test(invoiceNo)||!deliveryNos.length||deliveryNos.length>9||deliveryNos.some(n=>!/^DDM[0-9]{8,18}$/.test(n)))
      return error(c,"MAIL_LINK_DOCUMENT_INVALID","HKN ve bütün DDM numaraları doğrulanmalıdır.",422);
    const job=await c.env.DB.prepare(
      "SELECT j.id job_id,j.status,j.provider_message_id,j.account_id,j.requested_by,j.logical_event_id,d.attachment_refs_json,d.recipients_json,d.subject FROM mail_send_jobs j JOIN mail_drafts d ON d.id=j.draft_id AND d.main_company_slug=j.main_company_slug AND d.account_id=j.account_id WHERE j.draft_id=? AND j.main_company_slug=? ORDER BY j.created_at DESC LIMIT 1"
    ).bind(draftId,a.tenant).first<Row>();
    if(!job||role(job.status)!=="ACCEPTED")return error(c,"MAIL_LINK_NOT_ACCEPTED","Sağlayıcı kabulü bulunamadı.",409);
    if(txt(job.requested_by)!==txt(a.user?.id)&&!elevated(a.user!))
      return error(c,"MAIL_LINK_FORBIDDEN","Başka kullanıcının gönderimini bağlayamazsınız.",403);
    if(!invoiceMailIsLegacyOrCanonicalKey(txt(job.logical_event_id),a.tenant,invoiceNo,deliveryNos))
      return error(c,"MAIL_LINK_EVENT_MISMATCH","Bu gönderim işi seçili HKN paketine ait değil.",409);
    if(modelId){
      const model=await c.env.DB.prepare("SELECT id FROM model_records WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1")
        .bind(modelId,a.tenant).first<Row>();
      if(!model)return error(c,"MODEL_NOT_FOUND","Canonical model bulunamadı.",422);
    }
    let refs:any[]=[];try{refs=JSON.parse(txt(job.attachment_refs_json)||"[]");}
    catch{return error(c,"MAIL_LINK_ATTACHMENTS_INVALID","Gönderilen PDF listesi okunamadı.",409);}
    if(!Array.isArray(refs)||refs.length!==1+deliveryNos.length)
      return error(c,"MAIL_LINK_ATTACHMENTS_INVALID","Gönderim paketi HKN + bütün DDM PDF'lerinden oluşmalıdır.",409);
    const sent:Row[]=[];
    for(const ref of refs){
      const assetId=txt(typeof ref==="string"?ref:ref.fileAssetId||ref.file_asset_id||ref.id);
      const asset=await c.env.DB.prepare("SELECT id,file_name,status FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1")
        .bind(assetId,a.tenant).first<Row>();
      if(!asset||role(asset.status)!=="AVAILABLE")return error(c,"MAIL_LINK_ATTACHMENT_MISSING","Gönderilen PDF File Hub'da bulunamadı.",409);
      sent.push({id:assetId,hkn:invoiceMailDocumentFromFile(asset.file_name,"HKN"),ddm:invoiceMailDocumentFromFile(asset.file_name,"DDM")});
    }
    const hkn=sent.filter(f=>f.hkn===invoiceNo),ddms=deliveryNos.map(no=>sent.filter(f=>f.ddm===no));
    if(hkn.length!==1||ddms.some(matches=>matches.length!==1)||new Set(sent.map(f=>f.id)).size!==sent.length)
      return error(c,"MAIL_LINK_ATTACHMENT_MISMATCH","HKN/DDM PDF ekleri birebir eşleşmedi.",409);
    const ddmAssetIds=ddms.map(matches=>txt(matches[0].id)),hknAssetId=txt(hkn[0].id);
    const relations=await c.env.DB.prepare(
      "SELECT DISTINCT r.entity_id AS modelId,r.file_asset_id AS assetId FROM file_hub_relations r JOIN model_records m ON m.main_company_slug=r.main_company_slug AND m.id=r.entity_id AND m.deleted_at IS NULL WHERE r.main_company_slug=? AND r.entity_type='MODEL' AND r.file_asset_id IN ("+
      [hknAssetId,...ddmAssetIds].map(()=>"?").join(",")+")"
    ).bind(a.tenant,hknAssetId,...ddmAssetIds).all<Row>();
    const modelIds=invoiceMailCommonModelIds((relations.results||[]).map(r=>({modelId:txt(r.modelId),assetId:txt(r.assetId)})),hknAssetId,ddmAssetIds);
    if(modelId&&!modelIds.includes(modelId))
      return error(c,"MAIL_LINK_MODEL_MISMATCH","Model HKN ve ilgili DDM PDF ilişkisiyle doğrulanmadı.",409);
    if(!modelIds.length)return error(c,"MAIL_LINK_MODEL_MISMATCH","Bu HKN paketine bağlı kesin model bulunamadı.",409);
    let recipients:Row={};try{recipients=JSON.parse(txt(job.recipients_json)||"{}");}catch{}
    const existing=await c.env.DB.prepare("SELECT data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
      .bind("MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId).first<Row>();
    if(existing)return c.json({ok:true,data:JSON.parse(txt(existing.data)),idempotent:true});
    const data={draftId,sendJobId:job.job_id,providerMessageId:job.provider_message_id||"",accountId:job.account_id,
      invoiceNo,deliveryNo:deliveryNos[0],deliveryNos,modelId,modelIds,modelName:txt(body.modelName).slice(0,160),
      routeId:txt(body.routeId),subject:txt(job.subject),to:Array.isArray(recipients.to)?recipients.to:[],
      cc:Array.isArray(recipients.cc)?recipients.cc:[],status:"PROVIDER_ACCEPTED",createdBy:txt(a.user?.id),recordedAt:now()};
    const inserted=await c.env.DB.prepare(
      "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=?)"
    ).bind(crypto.randomUUID(),"MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId,JSON.stringify(data),data.recordedAt,data.recordedAt,
      "MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId).run();
    if(!Number(inserted.meta?.changes||0)){
      const same=await c.env.DB.prepare("SELECT data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
        .bind("MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId).first<Row>();
      if(!same)return error(c,"MAIL_LINK_RACE_REVIEW","Gönderim ilişkisi henüz kesinleştirilemedi.",409);
      return c.json({ok:true,data:JSON.parse(txt(same.data)),idempotent:true});
    }
    return c.json({ok:true,data},201);
  });

  // Person directory belongs to a tenant + customer + exactly one department.
  // It is independent from legacy TO/CC route strings and does not send messages.
  app.get("/api/muhasebe/invoice-mail-contacts", async (c) => {
    const a=await access(c);
    if(a.failure)return a.failure;
    const rows=await c.env.DB.prepare(
      "SELECT file_name,data,created_at,updated_at FROM json_store WHERE scope=? AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1500"
    ).bind(CONTACT_SCOPE,a.tenant).all<Row>();
    const contacts=(rows.results||[]).map((row)=>{
      try {return {...JSON.parse(txt(row.data)),id:txt(row.file_name),createdAt:row.created_at,updatedAt:row.updated_at};}
      catch{return null;}
    }).filter(Boolean);
    return c.json({ok:true,data:contacts});
  });
  app.post("/api/muhasebe/invoice-mail-contacts", async (c) => {
    const body=await jsonBody(c),a=await access(c,body,true);
    if(a.failure)return a.failure;
    const customerName=txt(body.customerName);
    const groupCode=role(body.groupCode).replace(/\s+/g,"");
    const customerKey=customerName.toLocaleUpperCase("tr-TR").replace(/\s+/g," ");
    const firstName=txt(body.firstName),lastName=txt(body.lastName);
    const email=txt(body.email).toLowerCase(),phone=txt(body.phone);
    const recipientKind=role(body.recipientKind||"TO");
    const active=body.active===false?false:true;
    const id=txt(body.id);
    if(!customerName||customerName.length>160||!customerKey||!/^\d{2,4}(?:-\d{1,3})?$/.test(groupCode)
      ||!firstName||firstName.length>100||!lastName||lastName.length>100||phone.length>60
      ||!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)||!["TO","CC"].includes(recipientKind))
      return error(c,"MAIL_CONTACT_INVALID","Firma, departman, ad, soyad, e-posta ve alıcı türünü kontrol edin.",422);
    // The contact must not be assigned to two departments in the same customer.
    const matches=await c.env.DB.prepare(
      "SELECT file_name,data FROM json_store WHERE scope=? AND main_company_slug=? AND json_extract(data,'$.email')=? AND json_extract(data,'$.customerKey')=? LIMIT 10"
    ).bind(CONTACT_SCOPE,a.tenant,email,customerKey).all<Row>();
    for(const item of matches.results||[]){
      if(txt(item.file_name)!==id)
        return error(c,"MAIL_CONTACT_EXISTS","Bu kişi firmada zaten kayıtlı. Departmanı mevcut kişi kartından değiştirin.",409);
    }
    const data={customerName,customerKey,groupCode,firstName,lastName,email,phone,recipientKind,active};
    const ts=now();
    if(id){
      const previous=await c.env.DB.prepare(
        "SELECT id,created_at FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1"
      ).bind(CONTACT_SCOPE,a.tenant,id).first<Row>();
      if(!previous)return error(c,"MAIL_CONTACT_NOT_FOUND","Kişi kartı bulunamadı.",404);
      await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND scope=? AND main_company_slug=?")
        .bind(JSON.stringify(data),ts,previous.id,CONTACT_SCOPE,a.tenant).run();
      return c.json({ok:true,data:{...data,id,createdAt:previous.created_at,updatedAt:ts}});
    }
    const newId=crypto.randomUUID();
    // A conditional INSERT prevents parallel creation of the same address within
    // this customer's directory even if both requests passed the initial SELECT.
    const result=await c.env.DB.prepare(
      "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) "+
      "SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM json_store WHERE scope=? AND main_company_slug=? AND json_extract(data,'$.email')=? AND json_extract(data,'$.customerKey')=?)"
    ).bind(crypto.randomUUID(),CONTACT_SCOPE,a.tenant,newId,JSON.stringify(data),ts,ts,
      CONTACT_SCOPE,a.tenant,email,customerKey).run();
    if(!Number(result.meta?.changes||0))
      return error(c,"MAIL_CONTACT_EXISTS","Kişi başka bir işlemde kaydedildi; listeyi yenileyin.",409);
    return c.json({ok:true,data:{...data,id:newId,createdAt:ts,updatedAt:ts}},201);
  });

  app.delete("/api/muhasebe/invoice-mail-routes/:id", async (c) => {
    const a=await access(c,{},true);
    if (a.failure) return a.failure;
    const id=txt(c.req.param("id"));
    const existing=await c.env.DB.prepare(
      "SELECT id FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1"
    ).bind(SCOPE,a.tenant,id).first<Row>();
    if (!existing) return error(c,"ROUTE_NOT_FOUND","Alıcı eşleştirmesi bulunamadı.",404);
    await c.env.DB.prepare("DELETE FROM json_store WHERE id=? AND scope=? AND main_company_slug=?")
      .bind(existing.id,SCOPE,a.tenant).run();
    return c.json({ok:true,data:{id,removed:true}});
  });
}
