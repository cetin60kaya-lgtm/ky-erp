import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { registerIkPdksOperationRoutes } from "./ik-pdks-operations";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const nowIso = () => new Date().toISOString();

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Row : {};
  } catch { return {}; }
}

function companyOf(c: Context<AppEnv>, user: Row, body: Row = {}) {
  return text(
    c.req.header("X-KYERP-Tenant-Slug") ||
    body.mainCompanyId || body.mainCompanySlug ||
    c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") ||
    user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY,
  ).toLocaleLowerCase("tr-TR");
}

async function authContext(c: Context<AppEnv>, body: Row = {}) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const company = companyOf(c, user as Row, body);
  let scope = "FULL";
  try {
    const row = await c.env.DB.prepare("SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1")
      .bind(user.id, company).first<Row>();
    if (upper(row?.scope) === "AUDIT") scope = "AUDIT";
  } catch {}
  const username = text(user.username).toLocaleLowerCase("tr-TR");
  const role = upper(user.role);
  if (username === "denetim" || role === "DENETIM") scope = "AUDIT";
  return { user, company, scope, audit: scope === "AUDIT" };
}

function fail(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}

async function ensureSchema(c: Context<AppEnv>) {
  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_work_groups (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      entry_time TEXT NOT NULL DEFAULT '08:30',
      exit_time TEXT NOT NULL DEFAULT '19:00',
      late_tolerance INTEGER NOT NULL DEFAULT 5,
      early_tolerance INTEGER NOT NULL DEFAULT 10,
      active INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(main_company_id,code)
    )`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_employee_groups (
      main_company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(main_company_id,employee_id)
    )`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_services (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      route_note TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(main_company_id,code)
    )`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_employee_services (
      main_company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY(main_company_id,employee_id)
    )`),
  ]);
}

async function ensureDefaultGroup(c: Context<AppEnv>, company: string) {
  await c.env.DB.prepare(`INSERT OR IGNORE INTO ik_pdks_work_groups
    (id,main_company_id,code,name,entry_time,exit_time,late_tolerance,early_tolerance,active,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,1,'SYSTEM',?)`)
    .bind(`NORMAL:${company}`, company, "NORMAL", "Normal Mesai", "08:30", "19:00", 5, 10, nowIso()).run();
}

function normalizeTime(value: unknown, fallback: string) {
  const input = text(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(input) ? input : fallback;
}

export function registerIkPdksMasterRoutes(app: Hono<AppEnv>) {
  registerIkPdksOperationRoutes(app);

  app.get("/api/ik/personnel-control/pdks-masters", async (c) => {
    const auth = await authContext(c);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    await ensureSchema(c);
    await ensureDefaultGroup(c, auth.company);
    const [groupsResult, servicesResult, groupAssignResult, serviceAssignResult] = await Promise.all([
      c.env.DB.prepare(`SELECT id,code,name,entry_time AS entryTime,exit_time AS exitTime,
        late_tolerance AS lateTolerance,early_tolerance AS earlyTolerance,active,updated_at AS updatedAt
        FROM ik_pdks_work_groups WHERE main_company_id=? ORDER BY active DESC,name`).bind(auth.company).all<Row>(),
      c.env.DB.prepare(`SELECT id,code,name,route_note AS routeNote,active,updated_at AS updatedAt
        FROM ik_pdks_services WHERE main_company_id=? ORDER BY active DESC,name`).bind(auth.company).all<Row>(),
      c.env.DB.prepare(`SELECT employee_id AS employeeId,group_id AS groupId,updated_at AS updatedAt
        FROM ik_pdks_employee_groups WHERE main_company_id=?`).bind(auth.company).all<Row>(),
      c.env.DB.prepare(`SELECT employee_id AS employeeId,service_id AS serviceId,updated_at AS updatedAt
        FROM ik_pdks_employee_services WHERE main_company_id=?`).bind(auth.company).all<Row>(),
    ]);
    return c.json({ ok: true, data: {
      groups: groupsResult.results || [],
      services: servicesResult.results || [],
      groupAssignments: groupAssignResult.results || [],
      serviceAssignments: serviceAssignResult.results || [],
      audit: auth.audit,
    }});
  });

  app.post("/api/ik/personnel-control/work-groups", async (c) => {
    const body = await bodyOf(c);
    const auth = await authContext(c, body);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (auth.audit) return fail(c, 403, "HR_AUDIT_READ_ONLY", "Denetim kullanıcısı vardiya değiştiremez.");
    await ensureSchema(c);
    const code = upper(body.code || body.name).replace(/[^A-Z0-9ÇĞİÖŞÜ_-]+/g, "_").replace(/^_+|_+$/g, "");
    const name = text(body.name);
    if (!code || !name) return fail(c, 400, "GROUP_REQUIRED", "Grup kodu ve adı zorunludur.");
    const id = text(body.id) || crypto.randomUUID();
    const entryTime = normalizeTime(body.entryTime, "08:30");
    const exitTime = normalizeTime(body.exitTime, "19:00");
    const lateTolerance = Math.max(0, Math.min(240, Math.round(number(body.lateTolerance, 5))));
    const earlyTolerance = Math.max(0, Math.min(240, Math.round(number(body.earlyTolerance, 10))));
    const active = body.active === false || body.active === 0 ? 0 : 1;
    await c.env.DB.prepare(`INSERT INTO ik_pdks_work_groups
      (id,main_company_id,code,name,entry_time,exit_time,late_tolerance,early_tolerance,active,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(main_company_id,code) DO UPDATE SET name=excluded.name,entry_time=excluded.entry_time,
      exit_time=excluded.exit_time,late_tolerance=excluded.late_tolerance,early_tolerance=excluded.early_tolerance,
      active=excluded.active,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(id, auth.company, code, name, entryTime, exitTime, lateTolerance, earlyTolerance, active, text(auth.user.username), nowIso()).run();
    return c.json({ ok: true, data: { id, code, name, entryTime, exitTime, lateTolerance, earlyTolerance, active: Boolean(active) } });
  });

  app.post("/api/ik/personnel-control/people/:employeeId/work-group", async (c) => {
    const body = await bodyOf(c);
    const auth = await authContext(c, body);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (auth.audit) return fail(c, 403, "HR_AUDIT_READ_ONLY", "Denetim kullanıcısı vardiya atayamaz.");
    await ensureSchema(c);
    const employeeId = text(c.req.param("employeeId"));
    const groupId = text(body.groupId);
    if (!employeeId || !groupId) return fail(c, 400, "ASSIGNMENT_REQUIRED", "Personel ve vardiya zorunludur.");
    const group = await c.env.DB.prepare("SELECT id FROM ik_pdks_work_groups WHERE id=? AND main_company_id=? AND active=1 LIMIT 1")
      .bind(groupId, auth.company).first<Row>();
    if (!group) return fail(c, 404, "GROUP_NOT_FOUND", "Vardiya bulunamadı.");
    await c.env.DB.prepare(`INSERT INTO ik_pdks_employee_groups(main_company_id,employee_id,group_id,updated_by,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(main_company_id,employee_id) DO UPDATE SET group_id=excluded.group_id,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(auth.company, employeeId, groupId, text(auth.user.username), nowIso()).run();
    return c.json({ ok: true, data: { employeeId, groupId } });
  });

  app.post("/api/ik/personnel-control/services", async (c) => {
    const body = await bodyOf(c);
    const auth = await authContext(c, body);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (auth.audit) return fail(c, 403, "HR_AUDIT_READ_ONLY", "Denetim kullanıcısı servis değiştiremez.");
    await ensureSchema(c);
    const code = upper(body.code || body.name).replace(/[^A-Z0-9ÇĞİÖŞÜ_-]+/g, "_").replace(/^_+|_+$/g, "");
    const name = text(body.name);
    if (!code || !name) return fail(c, 400, "SERVICE_REQUIRED", "Servis kodu ve adı zorunludur.");
    const id = text(body.id) || crypto.randomUUID();
    const active = body.active === false || body.active === 0 ? 0 : 1;
    await c.env.DB.prepare(`INSERT INTO ik_pdks_services(id,main_company_id,code,name,route_note,active,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,code) DO UPDATE SET name=excluded.name,route_note=excluded.route_note,
      active=excluded.active,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(id, auth.company, code, name, text(body.routeNote), active, text(auth.user.username), nowIso()).run();
    return c.json({ ok: true, data: { id, code, name, routeNote: text(body.routeNote), active: Boolean(active) } });
  });

  app.post("/api/ik/personnel-control/people/:employeeId/service", async (c) => {
    const body = await bodyOf(c);
    const auth = await authContext(c, body);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (auth.audit) return fail(c, 403, "HR_AUDIT_READ_ONLY", "Denetim kullanıcısı servis atayamaz.");
    await ensureSchema(c);
    const employeeId = text(c.req.param("employeeId"));
    const serviceId = text(body.serviceId);
    if (!employeeId || !serviceId) return fail(c, 400, "ASSIGNMENT_REQUIRED", "Personel ve servis zorunludur.");
    const service = await c.env.DB.prepare("SELECT id FROM ik_pdks_services WHERE id=? AND main_company_id=? AND active=1 LIMIT 1")
      .bind(serviceId, auth.company).first<Row>();
    if (!service) return fail(c, 404, "SERVICE_NOT_FOUND", "Servis bulunamadı.");
    await c.env.DB.prepare(`INSERT INTO ik_pdks_employee_services(main_company_id,employee_id,service_id,updated_by,updated_at)
      VALUES(?,?,?,?,?) ON CONFLICT(main_company_id,employee_id) DO UPDATE SET service_id=excluded.service_id,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(auth.company, employeeId, serviceId, text(auth.user.username), nowIso()).run();
    return c.json({ ok: true, data: { employeeId, serviceId } });
  });
}
