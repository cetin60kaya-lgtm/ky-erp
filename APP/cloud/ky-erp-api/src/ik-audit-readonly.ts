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
const dateOnly = (value: unknown) => text(value).slice(0, 10);

function ok(c: Context<AppEnv>, data: unknown) {
  return c.json({ ok: true, success: true, data });
}
function fail(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}

async function auditContext(c: Context<AppEnv>) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  if (upper(user.role) !== "DENETIM") return { user, allowed: false, company: "" };
  const company = text(user.mainCompanySlug || user.security?.main_company_slug) || DEFAULT_COMPANY;
  return { user, allowed: true, company };
}

function safePerson(row: Row) {
  return {
    id: text(row.id),
    personnelCode: text(row.code),
    fullName: text(row.full_name),
    department: text(row.department),
    title: text(row.title),
    sgkStatus: text(row.sgk_status) || "VAR",
    status: text(row.status) || "Aktif",
    startDate: dateOnly(row.hire_date),
    exitDate: dateOnly(row.exit_date),
    cardNo: text(row.card_no),
    phone: text(row.phone),
  };
}

const PERSON_SQL = `
  SELECT e.id,e.code,e.full_name,e.department,e.title,e.sgk_status,e.status,e.hire_date,
         s.exit_date,s.card_no,s.phone
    FROM hr_monthly_employees e
    LEFT JOIN ik_person_card_settings s
      ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
   WHERE e.main_company_id=?
     AND UPPER(COALESCE(e.sgk_status,'VAR')) <> 'YOK'
`;

export function registerIkAuditReadonlyRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/audit/people", async (c) => {
    const auth = await auditContext(c);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (!auth.allowed) return fail(c, 403, "FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor.");
    const result = await c.env.DB.prepare(`${PERSON_SQL} ORDER BY e.code COLLATE NOCASE,e.full_name COLLATE NOCASE`)
      .bind(auth.company)
      .all<Row>();
    return ok(c, (result.results || []).map(safePerson));
  });

  app.get("/api/ik/audit/people/:employeeId", async (c) => {
    const auth = await auditContext(c);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (!auth.allowed) return fail(c, 403, "FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor.");
    const row = await c.env.DB.prepare(`${PERSON_SQL} AND e.id=? LIMIT 1`)
      .bind(auth.company, text(c.req.param("employeeId")))
      .first<Row>();
    if (!row) return fail(c, 404, "NOT_FOUND", "Kayıt bulunamadı.");
    return ok(c, safePerson(row));
  });
}
