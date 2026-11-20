import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { accountingAccess, accountingTenantReadAllowed } from "./accounting-access-policy";
import { ingestProviderEBelgeXml } from "./e-belge-center-cloud";
import { MAX_ISNET_DOCUMENT_BYTES, verifyIsnetDownloadedFile } from "./isnet-file-validation";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, unknown>;
const SCOPE = "ISNET_SETTINGS";
const clean = (value: unknown) => String(value ?? "").trim();
const failure = (code: string, message: string) => ({
  ok: false, success: false, error: { code, message },
});
const companySlug = (c: Context<AppEnv>, body?: Row) => clean(
  body?.mainCompanySlug || c.req.query("mainCompanySlug") || c.req.header("X-KYERP-Tenant-Slug")
);

async function authorized(c: Context<AppEnv>, slug: string, method = "GET") {
  const user = await getAuthenticatedUser(c);
  return Boolean(user && accountingTenantReadAllowed(user, slug) && accountingAccess(user, method, c.req.path));
}

async function companySettings(c: Context<AppEnv>, slug: string) {
  const row = await c.env.DB.prepare(
    "SELECT id,data FROM json_store WHERE scope=? AND file_name=? AND main_company_slug=? ORDER BY updated_at DESC LIMIT 1",
  ).bind(SCOPE, slug, slug).first<{ id: string; data: string }>();
  if (!row) return { id: "", value: {} as Row };
  let value: Row = {};
  try {
    const parsed = JSON.parse(row.data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed;
  } catch { /* Existing malformed metadata must not be treated as a login. */ }
  return { id: row.id, value };
}

function sourceKind(sourceKey: string) {
  const kinds: Record<string, {kind: string; direction: string; root: string}> = {
    incoming_invoice: {kind:"invoice",direction:"incoming",root:"Invoice"},
    outgoing_invoice: {kind:"invoice",direction:"outgoing",root:"Invoice"},
    incoming_dispatch: {kind:"dispatch",direction:"incoming",root:"DespatchAdvice"},
    outgoing_dispatch: {kind:"dispatch",direction:"outgoing",root:"DespatchAdvice"},
  };
  return kinds[sourceKey] || null;
}

function documentHasRoot(xml: string, root: string) {
  const plain = xml.replace(/^\uFEFF/, "").trimStart();
  return new RegExp("^(?:<\\?xml\\b[^>]*\\?>\\s*)?(?:<!--[\\s\\S]*?-->\\s*)*<(?:[A-Za-z0-9_.-]+:)?"+root+"\\b").test(plain);
}

export function registerIsnetLocalPortalRoutes(app: Hono<AppEnv>) {
  app.get("/api/isnet/local/config", async c => {
    const slug = companySlug(c);
    if (!slug || !(await authorized(c,slug))) return c.json(failure("ISNET_LOCAL_FORBIDDEN","Bu firmanın İşNet bağlantısını görme yetkiniz yok."),403);
    const {value} = await companySettings(c,slug);
    return c.json({ok:true,success:true,data:{
      companyId: clean(value.companyId),companyName:clean(value.companyName),
      connectionMode:clean(value.connectionMode),localPortalConfigured:value.connectionMode==="local_portal",
    }});
  });

  app.put("/api/isnet/local/selection", async c => {
    let payload: Row = {};
    try { const p=await c.req.json();if(p && typeof p==="object" && !Array.isArray(p))payload=p; } catch {}
    const slug=companySlug(c,payload);
    if(!slug || !(await authorized(c,slug,"PUT"))) return c.json(failure("ISNET_LOCAL_FORBIDDEN","Firma bağlantısını kaydetme yetkiniz yok."),403);
    const companyId=clean(payload.companyId),companyName=clean(payload.companyName);
    if(!/^[0-9]{1,20}$/.test(companyId)||companyName.length<2||companyName.length>240)
      return c.json(failure("ISNET_LOCAL_INVALID_SELECTION","Yetkili firma bilgisi geçersiz."),422);
    const previous=await companySettings(c,slug);
    // No password, cookie or provider token ever enters this endpoint.
    const next={...previous.value,companyId,companyName,connectionMode:"local_portal",localPortalConfigured:true,savedAt:new Date().toISOString()};
    const ts=new Date().toISOString();
    if(previous.id){
      await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND main_company_slug=?")
        .bind(JSON.stringify(next),ts,previous.id,slug).run();
    }else{
      await c.env.DB.prepare(
        "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)"
      ).bind(crypto.randomUUID(),SCOPE,slug,slug,JSON.stringify(next),ts,ts).run();
    }
    const saved=await companySettings(c,slug);
    if(clean(saved.value.companyId)!==companyId||clean(saved.value.companyName)!==companyName)
      return c.json(failure("ISNET_LOCAL_SAVE_UNVERIFIED","Firma kaydı sunucudan doğrulanamadı."),502);
    return c.json({ok:true,success:true,data:{companyId,companyName,localPortalConfigured:true}});
  });

  app.post("/api/isnet/local/intake", async c => {
    const declaredLength=Number(c.req.header("Content-Length")||0);
    if(declaredLength > MAX_ISNET_DOCUMENT_BYTES*2+32768)
      return c.json(failure("ISNET_LOCAL_FILE_TOO_LARGE","XML/PDF yükleme boyutu izin verilen sınırı aşıyor."),413);
    let form: FormData;
    try { form=await c.req.formData(); }
    catch { return c.json(failure("ISNET_LOCAL_INVALID_FORM","İşNet belge yükleme içeriği okunamadı."),400); }
    const slug=clean(form.get("mainCompanySlug"));
    if(!slug || !(await authorized(c,slug,"POST"))) return c.json(failure("ISNET_LOCAL_FORBIDDEN","Bu firma için belge arşivleme yetkiniz yok."),403);
    if(!/^[a-z0-9-]{2,80}$/i.test(slug))return c.json(failure("ISNET_LOCAL_INVALID_TENANT","Firma anahtarı geçersiz."),422);
    const sourceKey=clean(form.get("sourceKey")),sourceId=clean(form.get("sourceId"));
    const info=sourceKind(sourceKey);
    const companyId=clean(form.get("companyId"));
    const docNo=clean(form.get("documentNo"));
    if(!info||!/^[0-9]{1,22}$/.test(sourceId)||!/^[0-9]{1,20}$/.test(companyId)||docNo.length>100)
      return c.json(failure("ISNET_LOCAL_IDENTITY_INVALID","Belge türü, firma veya kaynak kimliği geçersiz."),422);
    const selected=await companySettings(c,slug);
    if(selected.value.connectionMode!=="local_portal"||clean(selected.value.companyId)!==companyId)
      return c.json(failure("ISNET_LOCAL_COMPANY_MISMATCH","Firma seçimi KY ERP kayıtlarıyla uyuşmuyor. Belge aktarılmadı."),409);

    const xmlFile=form.get("xml"),pdfFile=form.get("pdf");
    if(!(xmlFile instanceof File)) return c.json(failure("ISNET_LOCAL_XML_REQUIRED","Orijinal XML olmadan belge havuza alınamaz."),422);
    if(xmlFile.size<20||xmlFile.size>MAX_ISNET_DOCUMENT_BYTES)
      return c.json(failure("ISNET_LOCAL_XML_INVALID","XML dosya boyutu geçersiz."),422);
    if(pdfFile!==null && (!(pdfFile instanceof File)||pdfFile.size>MAX_ISNET_DOCUMENT_BYTES))
      return c.json(failure("ISNET_LOCAL_PDF_INVALID","PDF dosyası geçersiz."),422);

    const xmlBuffer=await xmlFile.arrayBuffer(),xmlText=new TextDecoder("utf-8").decode(xmlBuffer);
    try {
      verifyIsnetDownloadedFile("xml",xmlBuffer,xmlFile.type||"application/xml");
      if(!documentHasRoot(xmlText,info.root))throw Error("DOCUMENT_KIND_MISMATCH");
    }catch {
      return c.json(failure("ISNET_LOCAL_XML_VALIDATION_FAILED","Orijinal XML seçilen fatura/irsaliye türüyle uyuşmuyor."),422);
    }
    let pdfBuffer: ArrayBuffer|null=null;
    if(pdfFile instanceof File && pdfFile.size>0){
      pdfBuffer=await pdfFile.arrayBuffer();
      try{verifyIsnetDownloadedFile("pdf",pdfBuffer,pdfFile.type||"application/pdf");}
      catch {return c.json(failure("ISNET_LOCAL_PDF_VALIDATION_FAILED","Portal PDF yerine farklı içerik döndürdü. XML korunarak yeniden denenebilir."),422);}
    }

    const safeId=sourceId, safeSlug=slug.toLowerCase();
    const providerDocumentId=sourceKey+":"+safeId;
    const folder=safeSlug+"/isnet/"+info.direction+"/"+info.kind+"/"+sourceKey+"-"+safeId;
    const xmlKey=folder+"/original.xml", pdfKey=pdfBuffer?folder+"/original.pdf":"";
    // Never overwrite a previously accepted original. Repeat synchronization is idempotent.
    try {
      if(!(await c.env.FILES.head(xmlKey)))await c.env.FILES.put(xmlKey,xmlBuffer,{httpMetadata:{contentType:"application/xml"}});
      if(pdfBuffer&&!(await c.env.FILES.head(pdfKey)))await c.env.FILES.put(pdfKey,pdfBuffer,{httpMetadata:{contentType:"application/pdf"}});
      const result=await ingestProviderEBelgeXml(c,slug,{
        providerType:"ISNET",providerDocumentId,sourceId:safeId,
        automationKey:providerDocumentId,kind:info.kind,direction:info.direction,
        documentNo:docNo,xmlText,xmlKey,pdfKey,
        statusText:"PORTAL_LOCAL_IMPORT",sourceType:"ISNET_LOCAL_PORTAL",
        rawMetadata:{portalSourceId:safeId,portalKind:info.kind,portalDirection:info.direction,
          adapter:"KY_ISNET_LOCAL_V1",localCompanyId:companyId},
      });
      return c.json({ok:true,success:true,data:{
        documentId:clean(result.documentId),duplicate:result.duplicate===true,
        documentNo:clean(result.documentNo)||docNo,xmlSaved:true,pdfSaved:Boolean(pdfKey),
      }});
    }catch {
      // No opaque provider response, sensitive document content, DB details, or secrets in errors.
      return c.json(failure("ISNET_LOCAL_INTAKE_REVIEW_REQUIRED",
        "Belge aktarımı tamamlanamadı. Daha önce kaydedilen dosyalar korunur; Belge Havuzu'nu kontrol edin."),502);
    }
  });
}
