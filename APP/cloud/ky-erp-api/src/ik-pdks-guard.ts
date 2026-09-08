import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerIkPdksCardBridgeRoutes } from "./ik-pdks-card-bridge";
import { registerIkPdksOperationRoutes } from "./ik-pdks-operations";
import { registerIkPdksAdjustmentRoutes } from "./ik-pdks-adjustments";
import { registerIkPdksAssistantRoutes } from "./ik-pdks-assistant";
import { registerIkPdksDeviceRoutes } from "./ik-pdks-device";
import { registerIkPdksModernRoutes } from "./ik-pdks-modern";
import { registerIkPersonnelMediaRoutes } from "./ik-personnel-media";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const lowerSlug = (value: unknown) => text(value).toLocaleLowerCase("tr-TR");
const isOwnerRole = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
const isCompanyAdminRole = (role: unknown) => upper(role) === "COMPANY_ADMIN";
const isAuditRole = (role: unknown) => upper(role) === "DENETIM";

function minutesOf(value: unknown) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text(value).slice(0, 5));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

async function requestBodyClone(c: Context<AppEnv>): Promise<Row> {
  const method = String(c.req.method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return {};
  const contentType = text(c.req.header("Content-Type")).toLowerCase();
  if (!contentType.includes("application/json")) return {};
  try {
    const parsed = await c.req.raw.clone().json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
  } catch {
    return {};
  }
}

function permissionAllows(user: Row, method: string) {
  if (isOwnerRole(user?.role) || isCompanyAdminRole(user?.role) || upper(user?.role) === "IK") return true;
  if (isAuditRole(user?.role)) return ["GET", "HEAD"].includes(method);
  const permission = Array.isArray(user?.permissions)
    ? user.permissions.find((row: Row) => upper(row?.moduleKey || row?.module_key) === "IK")
    : null;
  if (!permission) return false;
  if (["GET", "HEAD"].includes(method)) return Boolean(permission.canView ?? permission.can_view);
  if (method === "POST") return Boolean(permission.canCreate ?? permission.can_create ?? permission.canUpdate ?? permission.can_update);
  if (["PUT", "PATCH"].includes(method)) return Boolean(permission.canUpdate ?? permission.can_update);
  if (method === "DELETE") return Boolean(permission.canDelete ?? permission.can_delete);
  return false;
}

async function enforcePdksTenantAndPermission(c: Context<AppEnv>, next: () => Promise<void>) {
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) {
    c.res = c.json({ ok: false, error: { code: "UNAUTHORIZED", message: "PDKS için geçerli KY ERP oturumu gereklidir." } }, 401);
    return;
  }
  const body = await requestBodyClone(c);
  const requested = lowerSlug(
    c.req.header("X-KYERP-Tenant-Slug") ||
    c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") ||
    body.mainCompanySlug || body.mainCompanyId,
  );
  const own = lowerSlug(user?.mainCompanySlug || user?.security?.main_company_slug);
  let company = requested || own;

  if (!isOwnerRole(user.role)) {
    if (!own) {
      c.res = c.json({ ok: false, error: { code: "PDKS_TENANT_REQUIRED", message: "Kullanıcının ana firma bağlamı bulunamadı." } }, 403);
      return;
    }
    if (requested && requested !== own) {
      c.res = c.json({ ok: false, error: { code: "PDKS_TENANT_FORBIDDEN", message: "Başka firmanın PDKS alanına erişemezsiniz." } }, 403);
      return;
    }
    company = own;
  } else if (!company) {
    company = DEFAULT_COMPANY;
  }

  const companyRow = await c.env.DB.prepare("SELECT slug,is_active FROM main_companies WHERE slug=? LIMIT 1").bind(company).first<Row>();
  if (!companyRow || Number(companyRow.is_active ?? 1) === 0) {
    c.res = c.json({ ok: false, error: { code: "PDKS_TENANT_NOT_ACTIVE", message: "Seçilen ana firma bulunamadı veya pasif." } }, 404);
    return;
  }

  const method = String(c.req.method || "GET").toUpperCase();
  if (!permissionAllows(user, method)) {
    c.res = c.json({ ok: false, error: { code: "PDKS_PERMISSION_DENIED", message: "Bu PDKS işlemi için İK yetkiniz bulunmuyor." } }, 403);
    return;
  }

  (c as any).set?.("pdksCompany", company);
  await next();
}

async function userAndCompany(c: Context<AppEnv>) {
  const user = await getAuthenticatedUser(c);
  const storedCompany = text((c as any).get?.("pdksCompany"));
  const company = lowerSlug(storedCompany || c.req.header("X-KYERP-Tenant-Slug") || user?.mainCompanySlug || user?.security?.main_company_slug || DEFAULT_COMPANY);
  return { user, company };
}

async function companyOf(c: Context<AppEnv>) {
  return (await userAndCompany(c)).company;
}

async function isAuditRequest(c: Context<AppEnv>, company: string) {
  const user = await getAuthenticatedUser(c);
  if (!user) return false;
  if (isAuditRole(user.role) || text(user.username).toLocaleLowerCase("tr-TR") === "denetim") return true;
  try {
    const row = await c.env.DB.prepare("SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1")
      .bind(user.id, company).first<Row>();
    return upper(row?.scope) === "AUDIT";
  } catch {
    return false;
  }
}

function periodOf(date: unknown) {
  const value = text(date).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

async function lockedPeriods(c: Context<AppEnv>, company: string, dates: string[]) {
  const periods = [...new Map(dates.map((date) => periodOf(date)).filter(Boolean).map((item: any) => [`${item.year}-${item.month}`, item])).values()] as Array<{year:number;month:number}>;
  const locked: string[] = [];
  for (const period of periods) {
    try {
      const row = await c.env.DB.prepare("SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1")
        .bind(company, period.year, period.month).first<Row>();
      if (Number(row?.is_locked || 0) !== 0) locked.push(`${period.year}-${String(period.month).padStart(2, "0")}`);
    } catch {
      // Kapanış tablosu henüz yoksa dönem açık kabul edilir.
    }
  }
  return locked;
}

function auditPeriod(c: Context<AppEnv>) {
  const now = new Date();
  const year = Math.max(2020, Math.min(2100, number(c.req.query("year")) || now.getFullYear()));
  const month = Math.max(1, Math.min(12, number(c.req.query("month")) || now.getMonth() + 1));
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function strictAuditEmployeeIds(c: Context<AppEnv>, company: string) {
  const period = auditPeriod(c);
  try {
    const result = await c.env.DB.prepare(`SELECT e.id
      FROM hr_monthly_employees e
      JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      LEFT JOIN ik_person_monthly_compliance mc
        ON mc.main_company_id=e.main_company_id AND mc.employee_id=e.id AND mc.period=?
      WHERE e.main_company_id=?
        AND TRIM(COALESCE(s.card_no,''))<>''
        AND (
          (mc.employee_id IS NOT NULL AND mc.sgk_covered=1)
          OR
          (mc.employee_id IS NULL AND UPPER(TRIM(COALESCE(e.sgk_status,'VAR'))) <> 'YOK')
        )`)
      .bind(period, company).all<Row>();
    return new Set((result.results || []).map((row) => text(row.id)).filter(Boolean));
  } catch {
    try {
      const legacy = await c.env.DB.prepare(`SELECT e.id
        FROM hr_monthly_employees e
        JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
        WHERE e.main_company_id=?
          AND UPPER(TRIM(COALESCE(e.sgk_status,'VAR'))) <> 'YOK'
          AND TRIM(COALESCE(s.card_no,''))<>''`)
        .bind(company).all<Row>();
      return new Set((legacy.results || []).map((row) => text(row.id)).filter(Boolean));
    } catch {
      return new Set<string>();
    }
  }
}

function rewriteJson(c: Context<AppEnv>, payload: unknown) {
  const headers = new Headers(c.res.headers);
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json; charset=UTF-8");
  c.res = new Response(JSON.stringify(payload), { status: c.res.status, statusText: c.res.statusText, headers });
}

async function enforceAuditReadScope(c: Context<AppEnv>, next: () => Promise<void>) {
  const method = String(c.req.method || "GET").toUpperCase();
  const path = c.req.path;
  const company = await companyOf(c);
  if (!(await isAuditRequest(c, company))) return next();

  if (!["GET", "HEAD"].includes(method)) return next();

  const safeStatic = new Set([
    "/api/ik/personnel-control/profile",
    "/api/ik/personnel-control/people",
    "/api/ik/personnel-control/pdks-masters",
    "/api/ik/personnel-control/dashboard-live",
  ]);
  const personReadMatch = path.match(/^\/api\/ik\/personnel-control\/people\/([^/]+)\/(attendance(?:-v2)?|photo|photo-meta)$/i);
  if (!safeStatic.has(path) && !personReadMatch) {
    c.res = c.json({ ok: false, error: { code: "NOT_FOUND", message: "Endpoint bulunamadı." } }, 404);
    return;
  }

  const allowedIds = await strictAuditEmployeeIds(c, company);
  if (personReadMatch && !allowedIds.has(decodeURIComponent(personReadMatch[1]))) {
    c.res = c.json({ ok: false, error: { code: "NOT_FOUND", message: "Personel bulunamadı." } }, 404);
    return;
  }

  await next();
  if (!c.res.ok || method === "HEAD") return;

  let payload: any;
  try { payload = await c.res.clone().json(); } catch { return; }
  if (path === "/api/ik/personnel-control/people") {
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const filtered = rows
      .filter((row: Row) => allowedIds.has(text(row.id)) && text(row.cardNo || row.card_no))
      .map((row: Row) => {
        const {
          personnelStatus, sgkDays, sgkPeriod, pdksCardDays, sgkPdksMatch,
          salary, roadAllowance, paymentChannel, bankAmount, cashAmount, identityNo, note,
          ...safeRow
        } = row;
        void personnelStatus; void sgkDays; void sgkPeriod; void pdksCardDays; void sgkPdksMatch;
        void salary; void roadAllowance; void paymentChannel; void bankAmount; void cashAmount; void identityNo; void note;
        return safeRow;
      });
    rewriteJson(c, payload?.data && Array.isArray(payload.data) ? { ...payload, data: filtered } : filtered);
    return;
  }
  if (path === "/api/ik/personnel-control/pdks-masters") {
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    if (!data || typeof data !== "object") return;
    const filtered = {
      ...data,
      audit: true,
      groupAssignments: Array.isArray(data.groupAssignments) ? data.groupAssignments.filter((row: Row) => allowedIds.has(text(row.employeeId || row.employee_id))) : [],
      serviceAssignments: Array.isArray(data.serviceAssignments) ? data.serviceAssignments.filter((row: Row) => allowedIds.has(text(row.employeeId || row.employee_id))) : [],
    };
    rewriteJson(c, payload?.data && typeof payload.data === "object" ? { ...payload, data: filtered } : filtered);
  }
}

async function scheduleOf(c: Context<AppEnv>, company: string, employeeId: string) {
  const fallback = { code: "NORMAL", name: "Normal Mesai", entryTime: "08:30", exitTime: "19:00", lateTolerance: 5, earlyTolerance: 10 };
  try {
    const row = await c.env.DB.prepare(`SELECT g.code,g.name,g.entry_time AS entryTime,g.exit_time AS exitTime,
      g.late_tolerance AS lateTolerance,g.early_tolerance AS earlyTolerance
      FROM ik_pdks_employee_groups a
      JOIN ik_pdks_work_groups g ON g.id=a.group_id AND g.main_company_id=a.main_company_id
      WHERE a.main_company_id=? AND a.employee_id=? AND g.active=1 LIMIT 1`)
      .bind(company, employeeId).first<Row>();
    if (!row) return fallback;
    return {
      code: text(row.code) || fallback.code,
      name: text(row.name) || fallback.name,
      entryTime: text(row.entryTime) || fallback.entryTime,
      exitTime: text(row.exitTime) || fallback.exitTime,
      lateTolerance: Math.max(0, number(row.lateTolerance)),
      earlyTolerance: Math.max(0, number(row.earlyTolerance)),
    };
  } catch {
    return fallback;
  }
}

function recalcDay(day: Row, schedule: Row) {
  const working = ["CALISTI", "EKSIK_BASIM"].includes(text(day.status).toUpperCase());
  if (!working) return { ...day, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0 };
  const entry = minutesOf(day.entry);
  const exit = minutesOf(day.exit);
  const baseIn = minutesOf(schedule.entryTime) ?? 510;
  const baseOut = minutesOf(schedule.exitTime) ?? 1140;
  const lateTolerance = Math.max(0, number(schedule.lateTolerance));
  const earlyTolerance = Math.max(0, number(schedule.earlyTolerance));
  return {
    ...day,
    lateMinutes: entry === null ? 0 : Math.max(0, entry - baseIn - lateTolerance),
    earlyMinutes: exit === null ? 0 : Math.max(0, baseOut - exit - earlyTolerance),
    overtimeMinutes: exit === null ? 0 : Math.max(0, exit - baseOut),
  };
}

function summaryOf(days: Row[]) {
  return days.reduce((acc, day) => {
    const status = text(day.status).toUpperCase();
    if (status === "CALISTI" || status === "EKSIK_BASIM") acc.workedDays += 1;
    if (status === "YILLIK_IZIN") acc.annualLeaveDays += 1;
    if (status === "IZIN") acc.leaveDays += 1;
    if (status === "KART_YOK") acc.noPunchDays += 1;
    if (status === "EKSIK_BASIM") acc.missingPunchDays += 1;
    if (number(day.lateMinutes) > 0) acc.lateDays += 1;
    acc.lateMinutes += number(day.lateMinutes);
    acc.earlyMinutes += number(day.earlyMinutes);
    acc.overtimeMinutes += number(day.overtimeMinutes);
    return acc;
  }, { workedDays: 0, annualLeaveDays: 0, leaveDays: 0, noPunchDays: 0, missingPunchDays: 0, lateDays: 0, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0 });
}

async function normalizeSavedOverride(c: Context<AppEnv>, company: string, path: string, body: Row) {
  const match = path.match(/^\/api\/ik\/personnel-control\/people\/([^/]+)\/day-override$/i);
  if (!match || !c.res.ok) return;
  const employeeId = decodeURIComponent(match[1]);
  const workDate = text(body.workDate || body.date).slice(0, 10);
  if (!employeeId || !workDate) return;
  const schedule = await scheduleOf(c, company, employeeId);
  const normalized = recalcDay({
    status: text(body.status || "AUTO"),
    entry: text(body.entry || body.manualIn),
    exit: text(body.exit || body.manualOut),
  }, schedule);
  try {
    await c.env.DB.prepare(`UPDATE ik_attendance_day_overrides
      SET late_minutes=?,early_minutes=?,overtime_minutes=?,updated_at=?
      WHERE main_company_id=? AND employee_id=? AND work_date=?`)
      .bind(normalized.lateMinutes, normalized.earlyMinutes, normalized.overtimeMinutes, new Date().toISOString(), company, employeeId, workDate).run();
  } catch {}
}

export function registerIkPdksGuardRoutes(app: Hono<AppEnv>) {
  app.use("/api/ik/personnel-control/*", enforcePdksTenantAndPermission);
  app.use("/api/ik/personnel-control/*", enforceAuditReadScope);

  app.use("/api/ik/personnel-control/*", async (c, next) => {
    if (String(c.req.method).toUpperCase() !== "POST") return next();
    const path = c.req.path;
    const relevant = path.endsWith("/time-event") || path.endsWith("/day-override") || path.endsWith("/time-events/import");
    if (!relevant) return next();

    let body: Row = {};
    try {
      const clone = c.req.raw.clone();
      const parsed = await clone.json();
      body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
    } catch {}

    const dates = path.endsWith("/time-events/import")
      ? (Array.isArray(body.rows) ? body.rows.map((row: Row) => text(row.workDate || row.date)).filter(Boolean) : [])
      : [text(body.workDate || body.date)].filter(Boolean);
    const company = await companyOf(c);
    const locked = await lockedPeriods(c, company, dates);
    if (locked.length) {
      return c.json({ ok: false, error: { code: "PDKS_PERIOD_LOCKED", message: `Dönem kilitli: ${locked.join(", ")}. Önce KY ERP ay sonu ekranından dönemi açın.` } }, 409);
    }

    await next();
    if (path.endsWith("/day-override")) await normalizeSavedOverride(c, company, path, body);
  });

  app.use("/api/ik/personnel-control/people/:employeeId/attendance", async (c, next) => {
    if (String(c.req.method).toUpperCase() !== "GET") return next();
    await next();
    if (!c.res.ok) return;
    let payload: any;
    try { payload = await c.res.clone().json(); } catch { return; }
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    if (!data || !Array.isArray(data.days)) return;

    const company = await companyOf(c);
    const employeeId = text(c.req.param("employeeId"));
    const schedule = await scheduleOf(c, company, employeeId);
    const days = data.days.map((day: Row) => recalcDay(day, schedule));
    const nextData = {
      ...data,
      expectedIn: schedule.entryTime,
      expectedOut: schedule.exitTime,
      workGroup: schedule,
      days,
      summary: summaryOf(days),
    };
    const nextPayload = payload?.data && typeof payload.data === "object" ? { ...payload, data: nextData } : nextData;
    rewriteJson(c, nextPayload);
  });

  registerIkPdksOperationRoutes(app);
  registerIkPdksCardBridgeRoutes(app);
  registerIkPdksAdjustmentRoutes(app);
  registerIkPdksAssistantRoutes(app);
  registerIkPdksDeviceRoutes(app);
  registerIkPersonnelMediaRoutes(app);
  registerIkPdksModernRoutes(app);
}
