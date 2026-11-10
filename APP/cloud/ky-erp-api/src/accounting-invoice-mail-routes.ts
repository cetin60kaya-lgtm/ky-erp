// Customer/group/planner invoice delivery routing; stored in canonical tenant-scoped json_store.
// This module never sends email, changes an invoice, or posts an accounting entry.
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const SCOPE = "MUHASEBE_INVOICE_MAIL_ROUTE";
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

  // Read-only preflight: verify the exact two tenant-owned PDFs and, when present,
  // their canonical model relationships before creating any mail draft or send job.
  app.post("/api/muhasebe/invoice-mail-preflight", async (c) => {
    const body=await jsonBody(c),a=await access(c,body,true);
    if(a.failure)return a.failure;
    const invoiceNo=txt(body.invoiceNo).toUpperCase().replace(/[^A-Z0-9]/g,"");
    const deliveryNo=txt(body.deliveryNo).toUpperCase().replace(/[^A-Z0-9]/g,"");
    const modelId=txt(body.modelId),routeId=txt(body.routeId),accountId=txt(body.accountId);
    const invoiceAssetId=txt(body.invoiceAssetId),deliveryAssetId=txt(body.deliveryAssetId);
    if(!/^HKN[0-9]{8,18}$/.test(invoiceNo)||!/^DDM[0-9]{8,18}$/.test(deliveryNo)||
       !accountId||!routeId||!invoiceAssetId||!deliveryAssetId||invoiceAssetId===deliveryAssetId)
      return error(c,"MAIL_PREFLIGHT_INVALID","HKN/DDM, ayrı PDF ekleri, alıcı profili ve posta hesabı zorunludur.",422);
    if(!emails(body.to,true)||!emails(body.cc||[],false)||!emails(body.bcc||[],false))
      return error(c,"MAIL_RECIPIENT_INVALID","TO/CC/BCC adreslerini kontrol edin.",422);
    if(!txt(body.subject)||txt(body.subject).length>250||!txt(body.bodyText)||txt(body.bodyText).length>20000)
      return error(c,"MAIL_CONTENT_INVALID","Konu ve mesaj boş olamaz; içerik sınırlarını kontrol edin.",422);
    const route=await c.env.DB.prepare("SELECT id FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
      .bind(SCOPE,a.tenant,routeId).first<Row>();
    if(!route)return error(c,"MAIL_ROUTE_NOT_FOUND","Firma/grup alıcı profili bulunamadı.",409);
    const account=await c.env.DB.prepare("SELECT id,provider_type,status,provider_connected FROM mail_accounts WHERE id=? AND main_company_slug=? LIMIT 1")
      .bind(accountId,a.tenant).first<Row>();
    if(!account||role(account.provider_type)!=="MICROSOFT_365"||role(account.status)!=="ACTIVE"||Number(account.provider_connected)!==1)
      return error(c,"MAIL_ACCOUNT_NOT_READY","Yetkili ve bağlı bir Outlook hesabı gereklidir.",409);
    if(modelId){
      const model=await c.env.DB.prepare("SELECT id FROM model_records WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1")
        .bind(modelId,a.tenant).first<Row>();
      if(!model)return error(c,"MAIL_MODEL_NOT_FOUND","Canonical model kartı bulunamadı.",409);
    }
    for(const [assetId,number] of [[invoiceAssetId,invoiceNo],[deliveryAssetId,deliveryNo]]){
      const asset=await c.env.DB.prepare("SELECT id,file_name,status,mime_type FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1")
        .bind(assetId,a.tenant).first<Row>();
      const fileName=txt(asset?.file_name).toUpperCase();
      if(!asset||role(asset.status)!=="AVAILABLE"||!new RegExp("^"+number+"(?![0-9]).*\\.PDF$").test(fileName))
        return error(c,"MAIL_PDF_MISMATCH","Dosya File Hub'da mevcut değil veya tam HKN/DDM numarasıyla eşleşmiyor.",409);
      if(modelId){
        const relation=await c.env.DB.prepare("SELECT id FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=? AND entity_type='MODEL' AND entity_id=? LIMIT 1")
          .bind(a.tenant,assetId,modelId).first<Row>();
        if(!relation)return error(c,"MAIL_PDF_MODEL_MISMATCH","PDF seçili modelin File Hub ilişkilerinde bulunamadı.",409);
      }
    }
    const logicalEventId=["MODEL_INVOICE_MAIL",a.tenant,invoiceNo,deliveryNo].join(":");
    const previous=await c.env.DB.prepare("SELECT id,status FROM mail_send_jobs WHERE main_company_slug=? AND logical_event_id=? LIMIT 1")
      .bind(a.tenant,logicalEventId).first<Row>();
    if(previous)return error(c,"MAIL_ALREADY_ATTEMPTED","Bu HKN/DDM gönderimi daha önce başlatılmış. Tekrar göndermeden önce yazışma geçmişinden kontrol edin.",409);
    return c.json({ok:true,data:{verified:true,logicalEventId}});
  });

  // Status is read from the canonical send job, not from an optimistic browser flag.
  // This also makes a lost client response recoverable after a page reload.
  app.get("/api/muhasebe/invoice-mail-dispatch-status", async (c) => {
    const a=await access(c);
    if(a.failure)return a.failure;
    const invoiceNo=txt(c.req.query("invoiceNo")).toUpperCase().replace(/[^A-Z0-9]/g,"");
    const deliveryNo=txt(c.req.query("deliveryNo")).toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(!/^HKN[0-9]{8,18}$/.test(invoiceNo)||!/^DDM[0-9]{8,18}$/.test(deliveryNo))
      return error(c,"MAIL_STATUS_DOCUMENT_INVALID","Tam HKN ve DDM numarası gerekir.",422);
    const eventId=["MODEL_INVOICE_MAIL",a.tenant,invoiceNo,deliveryNo].join(":");
    const job=await c.env.DB.prepare("SELECT id,draft_id,status,provider_message_id,requested_by,created_at,updated_at FROM mail_send_jobs WHERE main_company_slug=? AND logical_event_id=? LIMIT 1")
      .bind(a.tenant,eventId).first<Row>();
    if(!job)return c.json({ok:true,data:{status:"NOT_STARTED",linked:false}});
    const linked=await c.env.DB.prepare("SELECT id FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
      .bind("MUHASEBE_INVOICE_MAIL_LINK",a.tenant,txt(job.draft_id)).first<Row>();
    const canReconcile=elevated(a.user!)||txt(job.requested_by)===txt(a.user?.id);
    return c.json({ok:true,data:{
      status:role(job.status),linked:Boolean(linked),
      draftId:canReconcile?txt(job.draft_id):null,
      sendJobId:canReconcile?txt(job.id):null,
      updatedAt:txt(job.updated_at),
      providerAccepted:role(job.status)==="ACCEPTED",
      delivered:false,
    }});
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
    if (modelId) {filters.push("json_extract(data,'$.modelId')=?");args.push(modelId);}
    const result=await c.env.DB.prepare("SELECT file_name,data,created_at FROM json_store WHERE "+filters.join(" AND ")+" ORDER BY created_at DESC LIMIT 80")
      .bind(...args).all<Row>();
    const links=(result.results||[]).map((row) => {
      try{return {...JSON.parse(txt(row.data)),id:row.file_name,recordedAt:row.created_at};}
      catch{return null;}
    }).filter(Boolean);
    return c.json({ok:true,data:links});
  });

  app.post("/api/muhasebe/invoice-mail-links", async (c) => {
    const body=await jsonBody(c),a=await access(c,body,true);
    if(a.failure)return a.failure;
    const draftId=txt(body.draftId),modelId=txt(body.modelId);
    const invoiceNo=txt(body.invoiceNo).toUpperCase().replace(/[^A-Z0-9]/g,"");
    const deliveryNo=txt(body.deliveryNo).toUpperCase().replace(/[^A-Z0-9]/g,"");
    if (!draftId || !/^HKN[0-9]{8,18}$/.test(invoiceNo) || !/^DDM[0-9]{8,18}$/.test(deliveryNo))
      return error(c,"MAIL_LINK_DOCUMENT_INVALID","Gönderim kaydı için doğru HKN/DDM ve taslak gereklidir.",422);
    const job=await c.env.DB.prepare(
      "SELECT j.id job_id,j.status,j.provider_message_id,j.account_id,j.requested_by,j.logical_event_id,d.attachment_refs_json,d.recipients_json,d.subject FROM mail_send_jobs j JOIN mail_drafts d ON d.id=j.draft_id AND d.main_company_slug=j.main_company_slug AND d.account_id=j.account_id WHERE j.draft_id=? AND j.main_company_slug=? ORDER BY j.created_at DESC LIMIT 1"
    ).bind(draftId,a.tenant).first<Row>();
    if (!job || role(job.status)!=="ACCEPTED")
      return error(c,"MAIL_LINK_NOT_ACCEPTED","Sağlayıcının kabul ettiği mail gönderimi bulunamadı.",409);
    if (txt(job.requested_by)!==txt(a.user?.id) && !elevated(a.user!))
      return error(c,"MAIL_LINK_FORBIDDEN","Başka kullanıcının gönderimini bağlayamazsınız.",403);
    const expectEvent="MODEL_INVOICE_MAIL:"+a.tenant+":"+invoiceNo+":";
    if (!txt(job.logical_event_id).startsWith(expectEvent))
      return error(c,"MAIL_LINK_EVENT_MISMATCH","Gönderim olayı HKN faturasına ait değil.",409);
    if (modelId) {
      const model=await c.env.DB.prepare("SELECT id FROM model_records WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1")
        .bind(modelId,a.tenant).first<Row>();
      if(!model)return error(c,"MODEL_NOT_FOUND","Model kartı eşleşmesi doğrulanamadı.",422);
    }
    let refs:any[]=[];
    try{refs=JSON.parse(txt(job.attachment_refs_json)||"[]");}
    catch{return error(c,"MAIL_LINK_ATTACHMENTS_INVALID","Mail eki bilgisi okunamadı.",409);}
    if(refs.length!==2)return error(c,"MAIL_LINK_ATTACHMENTS_INVALID","Gönderimde iki belge eki olmalıdır.",409);
    const names:string[]=[];
    for(const ref of refs){
      const assetId=txt(ref.fileAssetId||ref.file_asset_id||ref.id);
      const asset=await c.env.DB.prepare("SELECT file_name FROM file_hub_assets WHERE id=? AND main_company_slug=? LIMIT 1")
        .bind(assetId,a.tenant).first<Row>();
      if(!asset)return error(c,"MAIL_LINK_ATTACHMENT_MISSING","Gönderim eki File Hub'da bulunamadı.",409);
      if (modelId) {
        const relation=await c.env.DB.prepare("SELECT id FROM file_hub_relations WHERE main_company_slug=? AND file_asset_id=? AND entity_type='MODEL' AND entity_id=? LIMIT 1")
          .bind(a.tenant,assetId,modelId).first<Row>();
        if (!relation)return error(c,"MAIL_LINK_MODEL_MISMATCH","Gönderilen belge seçili model kartına bağlı değil.",409);
      }
      names.push(txt(asset.file_name).toUpperCase());
    }
    const pdfFor=(number:string) => names.some((n) => new RegExp("^"+number+"(?![0-9]).*\\.PDF$").test(n));
    if(!pdfFor(invoiceNo) || !pdfFor(deliveryNo))
      return error(c,"MAIL_LINK_ATTACHMENT_MISMATCH","Mail ekleri bu HKN/DDM belgeleriyle eşleşmiyor.",409);
    let recipients:Row={};
    try{recipients=JSON.parse(txt(job.recipients_json)||"{}");}catch{recipients={};}
    const existing=await c.env.DB.prepare(
      "SELECT file_name,data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1"
    ).bind("MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId).first<Row>();
    if(existing){return c.json({ok:true,data:JSON.parse(txt(existing.data)),idempotent:true});}
    const data={
      draftId,sendJobId:job.job_id,providerMessageId:job.provider_message_id||"",
      accountId:job.account_id,invoiceNo,deliveryNo,modelId,
      modelName:txt(body.modelName).slice(0,160),routeId:txt(body.routeId),
      subject:txt(job.subject),to:Array.isArray(recipients.to)?recipients.to:[],
      cc:Array.isArray(recipients.cc)?recipients.cc:[],status:"PROVIDER_ACCEPTED",
      createdBy:txt(a.user?.id),recordedAt:now()
    };
    // A delayed response/retry must only create a single relationship row.
    const inserted=await c.env.DB.prepare(
      "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=?)"
    ).bind(crypto.randomUUID(),"MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId,JSON.stringify(data),data.recordedAt,data.recordedAt,
      "MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId).run();
    if(!Number(inserted.meta?.changes||0)){
      const same=await c.env.DB.prepare("SELECT data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1")
        .bind("MUHASEBE_INVOICE_MAIL_LINK",a.tenant,draftId).first<Row>();
      if(!same)return error(c,"MAIL_LINK_RACE_REVIEW","Gönderim kaydı henüz doğrulanamadı.",409);
      return c.json({ok:true,data:JSON.parse(txt(same.data)),idempotent:true});
    }
    return c.json({ok:true,data},201);
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
