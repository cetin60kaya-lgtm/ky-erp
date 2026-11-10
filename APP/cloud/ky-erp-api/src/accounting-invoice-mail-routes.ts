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
