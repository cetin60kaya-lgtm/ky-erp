import type { Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, unknown>;

const CANONICAL_COMPANY_ID = "mecit-hakan";

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function canonicalCompanyId(value: unknown) {
  const normalized = text(value)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || normalized === "main-mecit-hakan" || normalized === "mecit-hakan") {
    return CANONICAL_COMPANY_ID;
  }
  return normalized;
}

function dateOnly(value: unknown) {
  return text(value).slice(0, 10);
}

export function registerIkDailyRosterFixRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/gunluk-personel/liste", async (c) => {
    const companyId = canonicalCompanyId(
      c.req.header("X-KYERP-Tenant-Slug") ||
        c.req.query("mainCompanyId") ||
        c.req.query("mainCompanySlug"),
    );
    const startDate = dateOnly(c.req.query("startDate") || c.req.query("start"));
    const endDate = dateOnly(c.req.query("endDate") || c.req.query("end") || startDate);

    if (!startDate || !endDate) {
      return c.json(
        {
          ok: false,
          success: false,
          error: { code: "DATE_RANGE_REQUIRED", message: "Geçerli tarih aralığı seçilmedi." },
        },
        400,
      );
    }

    const [savedResult, workedResult] = await Promise.all([
      c.env.DB.prepare(
        `SELECT r.employee_id
           FROM hr_daily_range_roster r
           JOIN hr_daily_employees e ON e.id = r.employee_id
          WHERE r.main_company_id=?
            AND r.start_date=?
            AND r.end_date=?
            AND e.main_company_id=?
          ORDER BY r.created_at ASC`,
      ).bind(companyId, startDate, endDate, companyId).all<Row>(),
      c.env.DB.prepare(
        `SELECT DISTINCT a.employee_id
           FROM hr_daily_attendance a
           JOIN hr_daily_employees e ON e.id = a.employee_id
          WHERE e.main_company_id=?
            AND a.work_date>=?
            AND a.work_date<=?
            AND (a.day_shift=1 OR a.night_shift=1)
          ORDER BY a.employee_id ASC`,
      ).bind(companyId, startDate, endDate).all<Row>(),
    ]);

    const savedIds = (savedResult.results || [])
      .map((row) => text(row.employee_id))
      .filter(Boolean);
    const workedIds = (workedResult.results || [])
      .map((row) => text(row.employee_id))
      .filter(Boolean);
    const employeeIds = [...new Set([...savedIds, ...workedIds])];

    return c.json({
      ok: true,
      success: true,
      data: { startDate, endDate, employeeIds },
      items: employeeIds,
    });
  });
}
