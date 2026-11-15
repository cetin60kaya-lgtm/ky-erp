import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Env = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const text = (v: unknown) => String(v ?? "").trim();
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const fail = (code: string, message: string) => ({ ok: false, error: { code, message } });
const parse = (v: unknown): Row => {
  try { const o = typeof v === "string" ? JSON.parse(v) : v; return o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
  catch { return {}; }
};

async function contextOf(c: Context<Env>, write = false) {
  const actor = await getAuthenticatedUser(c);
  if (!actor) return { error: c.json(fail("AUTH_REQUIRED", "Oturum açın."), 401) };
  const role = text(actor.role).toUpperCase();
  if (!["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(role)) {
    return { error: c.json(fail("FORBIDDEN", "Muhasebe yetkisi gerekli."), 403) };
  }
  const requested = text(c.req.query("mainCompanySlug") || c.req.header("X-KYERP-Tenant-Slug"));
  const assigned = text(actor.mainCompanySlug);
  const slug = requested || assigned;
  if (!slug || (slug !== assigned && role !== "SUPER_ADMIN")) {
    return { error: c.json(fail("TENANT_MISMATCH", "Firma erişimi reddedildi."), 403) };
  }
  return { slug, actor, write };
}
async function rows(c: Context<Env>, scope: string, slug: string): Promise<Row[]> {
  const data = await c.env.DB.prepare(
    "SELECT id,file_name,data FROM json_store WHERE scope=? AND main_company_slug=? ORDER BY updated_at DESC"
  ).bind(scope, slug).all<Row>();
  return (data.results || []).map(r => ({ ...parse(r.data), storeId: text(r.id), fileName: text(r.file_name) }));
}
async function get(c: Context<Env>, scope: string, key: string, slug: string): Promise<Row|null> {
  const row = await c.env.DB.prepare(
    "SELECT id,data FROM json_store WHERE scope=? AND main_company_slug=? AND file_name=? LIMIT 1"
  ).bind(scope, slug, key).first<Row>();
  return row ? { ...parse(row.data), storeId: row.id } : null;
}
async function put(c: Context<Env>, scope: string, key: string, slug: string, data: Row) {
  const now = new Date().toISOString();
  const payload = JSON.stringify({ ...data, updatedAt: now });
  const found = await get(c, scope, key, slug);
  if (found) {
    await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=? AND main_company_slug=?")
      .bind(payload, now, found.storeId, slug).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO json_store (id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)"
    ).bind(crypto.randomUUID(),scope,slug,key,payload,now,now).run();
  }
  return { ...data, updatedAt: now };
}
function expectedForMonth(template: Row, month: string) {
  if (template.active === false || template.recurring !== true || !monthPattern.test(text(template.startMonth)) || !monthPattern.test(text(template.endMonth))) return false;
  return template.startMonth <= month && template.endMonth >= month;
}
function nextWeeklyTarget(today: string, weekday: number) {
  const base = new Date(today + "T12:00:00Z");
  const delta = (weekday - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0,10);
}
function dateOffset(date: string, days: number) {
  const day = new Date(date + "T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0,10);
}
export function upcomingReminder(today: string, weekday: number, advanceDays: number) {
  if (!datePattern.test(today) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !Number.isInteger(advanceDays) || advanceDays < 0 || advanceDays > 6) return null;
  let dueDate = nextWeeklyTarget(today, weekday);
  let remindOn = dateOffset(dueDate, -advanceDays);
  if (remindOn < today) { dueDate = dateOffset(dueDate, 7); remindOn = dateOffset(dueDate, -advanceDays); }
  return { dueDate, remindOn };
}
const SETTLEMENT = "MUHASEBE_OBLIGATION_STATUS_V1";
const REMINDERS = "MUHASEBE_REMINDER_RULE_V1";

export function registerAccountingObligationsRoutes(app: Hono<Env>) {
  app.get("/api/boyahane/chemical-document-link/:productId/:assetId", async c => {
    const auth = await contextOf(c);
    if (auth.error) return auth.error;
    const slug = auth.slug!;
    const productId = text(c.req.param("productId"));
    const assetId = text(c.req.param("assetId"));
    if (!productId || !assetId) return c.json(fail("INVALID_DOCUMENT", "Ürün ve PDF kimliği zorunludur."), 400);
    const found = await c.env.DB.prepare(`
      SELECT a.id, a.extension, a.mime_type, a.status, l.provider_file_id,
             l.is_available, co.provider_type
      FROM file_hub_assets a
      JOIN file_hub_relations r ON r.file_asset_id=a.id AND r.main_company_slug=a.main_company_slug
      JOIN file_hub_locations l ON l.file_asset_id=a.id AND l.main_company_slug=a.main_company_slug AND l.location_role='PRIMARY'
      JOIN file_hub_connections co ON co.id=l.storage_connection_id AND co.main_company_slug=a.main_company_slug
      WHERE a.main_company_slug=? AND a.id=? AND r.entity_type='BOYAHANE_PRODUCT' AND r.entity_id=?
      LIMIT 1
    `).bind(slug, assetId, productId).first<Row>();
    if (!found || text(found.status).toUpperCase() === "MISSING" || Number(found.is_available) !== 1 ||
        (text(found.mime_type) !== "application/pdf" && text(found.extension).toUpperCase() !== "PDF")) {
      return c.json(fail("PDF_UNAVAILABLE", "Bu ürünle ilişkilendirilmiş erişilebilir PDF bulunamadı."), 404);
    }
    const providerId = text(found.provider_file_id);
    if (text(found.provider_type) !== "GOOGLE_DRIVE" || !/^[A-Za-z0-9_-]{15,}$/.test(providerId)) {
      return c.json({ok:true,data:{url:null,provider:text(found.provider_type),status:"PROVIDER_LINK_UNAVAILABLE"}});
    }
    return c.json({ok:true,data:{url:"https://drive.google.com/file/d/"+encodeURIComponent(providerId)+"/view",provider:"GOOGLE_DRIVE",status:"AVAILABLE"}});
  });

  app.get("/api/muhasebe/obligations/overview", async c => {
    const auth = await contextOf(c); if (auth.error) return auth.error;
    const slug = auth.slug!;
    const month = text(c.req.query("month")) || new Date().toISOString().slice(0,7);
    if (!monthPattern.test(month)) return c.json(fail("INVALID_MONTH","Dönem YYYY-AA olmalı."),400);
    const [templates, statuses, rules] = await Promise.all([
      rows(c,"MUHASEBE_FIXED_EXPENSE",slug),rows(c,SETTLEMENT,slug),rows(c,REMINDERS,slug)
    ]);
    const byKey = new Map(statuses.map(x=>[text(x.key || x.fileName),x]));
    const planned = templates.filter(x=>expectedForMonth(x,month)).map(template=>{
      const id = text(template.id || template.fileName);
      const key = id + ":" + month;
      const actual = byKey.get(key);
      return {
        key,id,month,firmId:text(template.companyId),companyName:text(template.companyName),
        title:text(template.name || template.description || template.category || "Sabit gider"),
        category:text(template.category),amount:Number(template.amount)||0,
        recordType:text(template.recordType||"RESMI"),
        state:actual?.state || "PLANNED",
        paymentReference:text(actual?.paymentReference),
        paymentNote:text(actual?.paymentNote),
        verifiedLedger:false,
        source:"MONTHLY_TEMPLATE"
      };
    });
    const now = new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Istanbul"});
    const alerts = rules.filter(x=>x.active!==false).map(rule=>{
      const upcoming = upcomingReminder(now,Number(rule.weekday),Number(rule.advanceDays));
      return upcoming ? {...rule,...upcoming} : {...rule,invalid:true};
    });
    return c.json({ok:true,data:{
      month,planned,alerts,
      summary:{plannedAmount:planned.reduce((s,x)=>s+x.amount,0),
        declaredPaidAmount:planned.filter(x=>x.state==="PAYMENT_REPORTED").reduce((s,x)=>s+x.amount,0),
        remainingPlannedAmount:planned.filter(x=>x.state!=="PAYMENT_REPORTED").reduce((s,x)=>s+x.amount,0)},
      warning:"Bu planlar kesin muhasebe tahakkuku değildir. Ödeme bildirimi banka/defter kaydı oluşturmaz."
    }});
  });
  app.post("/api/muhasebe/obligations/period-status", async c=>{
    const auth=await contextOf(c,true);if(auth.error)return auth.error;const slug=auth.slug!;
    const body=parse(await c.req.json().catch(()=>({})));
    const id=text(body.templateId),month=text(body.month),state=text(body.state);
    if(!id || !monthPattern.test(month) || !["PLANNED","PAYMENT_REPORTED"].includes(state))
      return c.json(fail("INVALID_STATUS","Geçerli şablon, ay ve durum seçin."),400);
    const template=await get(c,"MUHASEBE_FIXED_EXPENSE",id,slug);
    if(!template || !expectedForMonth(template,month))
      return c.json(fail("TEMPLATE_MISSING","Bu dönemde sabit gider tanımı bulunamadı."),404);
    const reference=text(body.paymentReference).slice(0,150);
    if(state==="PAYMENT_REPORTED" && !reference)
      return c.json(fail("REFERENCE_REQUIRED","Ödeme bildiriminde dekont/defter referansı girin."),400);
    const key=id+":"+month;
    const saved=await put(c,SETTLEMENT,key,slug,{
      key,templateId:id,month,state,paymentReference:reference,
      paymentNote:text(body.paymentNote).slice(0,250),recordedBy:auth.actor!.id,
      recordedAt:new Date().toISOString(),
      verifiedLedger:false
    });
    return c.json({ok:true,data:saved,warning:"Bu işlem sadece ödeme bildirimi oluşturdu; banka veya mali fiş değiştirilmedi."});
  });
  app.post("/api/muhasebe/obligations/reminder-rules", async c=>{
    const auth=await contextOf(c,true);if(auth.error)return auth.error;const slug=auth.slug!;
    const body=parse(await c.req.json().catch(()=>({})));
    const firmId=text(body.firmId),name=text(body.companyName).slice(0,120);
    const weekday=Number(body.weekday),advanceDays=Number(body.advanceDays);
    if(!firmId || !name || !Number.isInteger(weekday) || weekday<0 || weekday>6 || !Number.isInteger(advanceDays) || advanceDays<0 || advanceDays>6)
      return c.json(fail("INVALID_REMINDER","Firma, haftanın günü ve 0–6 gün önceden bildirim seçin."),400);
    const firm=await c.env.DB.prepare("SELECT id,name FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1").bind(firmId,slug).first<Row>();
    if(!firm) return c.json(fail("FIRM_MISSING","Firma kartı bu şirkette bulunamadı."),404);
    const id=firmId+":WEEKLY";
    const saved=await put(c,REMINDERS,id,slug,{
      id,firmId,companyName:text(firm.name),weekday,advanceDays,
      active:body.active!==false,channel:"IN_APP",recordedBy:auth.actor!.id
    });
    return c.json({ok:true,data:saved});
  });
}
