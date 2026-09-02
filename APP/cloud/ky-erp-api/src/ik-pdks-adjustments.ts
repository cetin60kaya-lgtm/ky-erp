// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nowIso = () => new Date().toISOString();
const dateOnly = (value: unknown) => text(value).slice(0, 10);

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch { return {}; }
}

function requestedCompany(c: Context<AppEnv>, body: Row = {}) {
  return text(
    c.req.header("X-KYERP-Tenant-Slug") || body.mainCompanyId || body.mainCompanySlug ||
    c.req.query("mainCompanyId") || c.req.query("mainCompanySlug"),
  ).toLocaleLowerCase("tr-TR");
}

async function authContext(c: Context<AppEnv>, body: Row = {}) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const company = requestedCompany(c, body) || text(user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY).toLocaleLowerCase("tr-TR");
  let audit = upper(user.role) === "DENETIM" || text(user.username).toLocaleLowerCase("tr-TR") === "denetim";
  if (!audit) {
    try {
      const row = await c.env.DB.prepare("SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1")
        .bind(user.id, company).first<Row>();
      audit = upper(row?.scope) === "AUDIT";
    } catch {}
  }
  return { user, company, audit };
}

function ok(c: Context<AppEnv>, data: unknown, status = 200) {
  return c.json({ ok: true, success: true, data }, status as any);
}

function error(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<Row>();
  return Boolean(row?.name);
}

async function ensurePeriodOpen(c: Context<AppEnv>, company: string, date: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateOnly(date));
  if (!match) throw Object.assign(new Error("Tarih geçersiz."), { code: "DATE_INVALID" });
  if (!(await tableExists(c, "ik_monthly_close"))) return;
  const row = await c.env.DB.prepare("SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1")
    .bind(company, Number(match[1]), Number(match[2])).first<Row>();
  if (Number(row?.is_locked || 0) !== 0) {
    throw Object.assign(new Error(`Dönem kilitli: ${match[1]}-${match[2]}.`), { code: "PDKS_PERIOD_LOCKED" });
  }
}

async function writeAudit(c: Context<AppEnv>, company: string, employeeId: string, period: string, actionType: string, payload: unknown, reason: string, userName: string) {
  if (!(await tableExists(c, "ik_audit_logs"))) return;
  try {
    await c.env.DB.prepare(`INSERT INTO ik_audit_logs
      (id,main_company_id,employee_id,period,action_type,source_screen,old_json,new_json,reason,user_name,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), company, employeeId, period, actionType, "KY_PDKS", "{}", JSON.stringify(payload || {}), reason || "", userName || "", nowIso()).run();
  } catch {}
}

function normalizeAdjustmentType(value: unknown) {
  const raw = upper(value);
  if (raw.includes("AVANS")) return "Avans";
  if (raw.includes("KESINT")) return "Kesinti";
  if (raw.includes("RESM") && raw.includes("TATIL") && raw.includes("MESAI")) return "Resmi Tatil Mesai";
  if (raw.includes("HAFTA") && raw.includes("SONU") && raw.includes("MESAI")) return "Hafta Sonu Mesai";
  if (raw.includes("MESAI")) return "Hafta İçi Mesai";
  return "";
}

export function registerIkPdksAdjustmentRoutes(app: Hono<AppEnv>) {
  app.post("/api/ik/personnel-control/operations/adjustment", async (c) => {
    const body = await bodyOf(c);
    const auth = await authContext(c, body);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (auth.audit) return error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı PDKS finans/mesai kaydı yazamaz.");

    const employeeId = text(body.employeeId || body.personId);
    const date = dateOnly(body.date) || dateOnly(nowIso());
    const adjustmentType = normalizeAdjustmentType(body.adjustmentType || body.type);
    const hours = Math.max(0, number(body.hourOrDay ?? body.hours));
    const amount = Math.max(0, number(body.amount));
    if (!employeeId || !date || !adjustmentType) return error(c, 400, "ADJUSTMENT_FIELDS_REQUIRED", "Personel, tarih ve işlem türü zorunludur.");
    if (amount <= 0 && hours <= 0) return error(c, 400, "ADJUSTMENT_VALUE_REQUIRED", "Tutar veya saat sıfırdan büyük olmalıdır.");

    const person = await c.env.DB.prepare(`SELECT e.id,e.full_name,e.code,e.sgk_status,s.card_no
      FROM hr_monthly_employees e
      JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=? AND e.id=? AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR' AND TRIM(COALESCE(s.card_no,''))<>'' LIMIT 1`)
      .bind(auth.company, employeeId).first<Row>();
    if (!person) return error(c, 404, "PDKS_PERSON_NOT_FOUND", "SGK=VAR + kartlı personel bulunamadı.");

    try { await ensurePeriodOpen(c, auth.company, date); }
    catch (cause: any) { return error(c, 409, cause.code || "PDKS_PERIOD_LOCKED", cause.message); }
    if (!(await tableExists(c, "hr_monthly_adjustments_v2"))) return error(c, 500, "PDKS_SCHEMA_MISSING", "Mesai/avans/kesinti tablosu hazır değil.");

    const paymentMethod = text(body.paymentMethod) || (adjustmentType.includes("Mesai") ? "Bordro" : "Elden");
    const payrollEffect = text(body.payrollEffect) || (adjustmentType.includes("Mesai") ? "Bordroya ekle" : "Bordrodan düş");
    const status = text(body.status) || "APPROVED";
    const note = text(body.note || body.reason);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO hr_monthly_adjustments_v2
      (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,payroll_effect,note,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, employeeId, date, adjustmentType, hours, amount, paymentMethod, payrollEffect, note, status, nowIso()).run();

    const payload = { id, employeeId, fullName: text(person.full_name), personnelCode: text(person.code), date, adjustmentType, hours, amount, paymentMethod, payrollEffect, status, note };
    await writeAudit(c, auth.company, employeeId, date.slice(0, 7), adjustmentType.includes("Mesai") ? "PDKS_MESAI_EKLE" : adjustmentType === "Avans" ? "PDKS_AVANS_EKLE" : "PDKS_KESINTI_EKLE", payload, note, text(auth.user.username));
    return ok(c, payload, 201);
  });
}
