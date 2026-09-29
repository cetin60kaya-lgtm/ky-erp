import type { Context, Next } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { accountingAccess, accountingTenantCandidates } from "./accounting-access-policy.ts";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const canonical = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const owner = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
const writeMethod = (method: unknown) => !["GET", "HEAD", "OPTIONS"].includes(upper(method));

async function requestedTenant(c: Context<AppEnv>) {
  const query = canonical(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId"));
  const header = canonical(c.req.header("X-KYERP-Tenant-Slug"));
  let body: Row = {};
  if (writeMethod(c.req.method)) {
    const type = text(c.req.header("Content-Type")).toLowerCase();
    if (type.includes("json") || type.includes("text/plain")) {
      try { body = await c.req.raw.clone().json() as Row; } catch { /* Route validates malformed input. */ }
    } else if (type.includes("multipart/form-data")) {
      const form = await c.req.raw.clone().formData();
      body = { mainCompanySlug: form.get("mainCompanySlug") || form.get("main_company_slug") };
    }
  }
  const candidates = accountingTenantCandidates(query, header, body);
  return candidates.length === 1 ? candidates[0] : "";
}

async function writeAccountingAudit(c: Context<AppEnv>, user: Row, companySlug: string) {
  try {
    const actor = text(user?.fullName || user?.full_name || user?.username || user?.email || user?.role) || "KY ERP Kullanıcısı";
    const method = upper(c.req.method);
    const path = text(c.req.path);
    const actionType = `ACCOUNTING_${method}`;
    const description = `${actor} · ${method} ${path}`;
    await c.env.DB.prepare(
      `INSERT INTO activity_logs
       (id,main_company_slug,module,entity_type,entity_id,action,action_type,description,old_value,new_value,after_data,actor,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      companySlug,
      "MUHASEBE",
      "ACCOUNTING_OPERATION",
      null,
      method,
      actionType,
      description,
      null,
      null,
      JSON.stringify({ path, requestId: text(c.get?.("requestId")), status: c.res.status }),
      actor,
      new Date().toISOString(),
    ).run();
  } catch (error) {
    console.error("KY ERP accounting audit write failed", error);
  }
}

export async function enforceAccountingTenant(c: Context<AppEnv>, next: Next) {
  if (upper(c.req.method) === "OPTIONS") return next();
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) {
    return c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "e-Belge Merkezi için geçerli oturum zorunludur." } }, 401);
  }
  const isWrite = writeMethod(c.req.method);
  if (!accountingAccess(user, upper(c.req.method), c.req.path)) {
    return c.json({ ok: false, error: { code: "ACCOUNTING_FORBIDDEN", message: "Bu Muhasebe / e-Belge işlemi için yetkiniz yok." } }, 403);
  }
  const requested = await requestedTenant(c);
  if (!requested) {
    return c.json({ ok: false, error: { code: "MAIN_COMPANY_REQUIRED", message: "e-Belge Merkezi için ana firma seçimi zorunludur." } }, 400);
  }
  if (!owner(user.role)) {
    const own = canonical(user.mainCompanySlug || user.main_company_slug);
    if (!own) {
      return c.json({ ok: false, error: { code: "MAIN_COMPANY_CONTEXT_MISSING", message: "Kullanıcının ana firma bağlamı tanımlı değil; erişim kapatıldı." } }, 403);
    }
    if (own !== requested) {
      return c.json({ ok: false, error: { code: "MAIN_COMPANY_FORBIDDEN", message: "Bu ana firmanın e-Belge verilerine erişim yetkiniz yok." } }, 403);
    }
  }
  await next();
  if (isWrite && c.res.status < 400) {
    c.executionCtx?.waitUntil?.(writeAccountingAudit(c, user, requested));
  }
}
