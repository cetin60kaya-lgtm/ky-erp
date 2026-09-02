// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const EXPECTED_IN = "08:30";
const EXPECTED_OUT = "19:00";
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
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

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(table).first<Row>();
  return Boolean(row?.name);
}

async function all(c: Context<AppEnv>, sql: string, values: unknown[] = []) {
  const result = await c.env.DB.prepare(sql).bind(...values).all<Row>();
  return result.results || [];
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

// DENETIM İK görünümü: SGK=VAR yeterlidir; kart numarası şart değildir.
const IK_PERSON_SQL = `
  SELECT e.id,e.code,e.full_name,e.department,e.title,e.sgk_status,e.status,e.hire_date,
         s.exit_date,s.card_no,s.phone
    FROM hr_monthly_employees e
    LEFT JOIN ik_person_card_settings s
      ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
   WHERE e.main_company_id=?
     AND UPPER(TRIM(COALESCE(e.sgk_status,''))) = 'VAR'
`;

// DENETIM PDKS görünümü: yalnız SGK=VAR + kart numarası bulunan personel.
const PDKS_PERSON_SQL = `${IK_PERSON_SQL}
     AND TRIM(COALESCE(s.card_no,'')) <> ''
`;

async function auditIkPeople(c: Context<AppEnv>, company: string) {
  return all(
    c,
    `${IK_PERSON_SQL} ORDER BY e.code COLLATE NOCASE,e.full_name COLLATE NOCASE`,
    [company],
  );
}

async function auditPdksPeople(c: Context<AppEnv>, company: string) {
  return all(
    c,
    `${PDKS_PERSON_SQL} ORDER BY e.code COLLATE NOCASE,e.full_name COLLATE NOCASE`,
    [company],
  );
}

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function weekday(value: string) {
  const parts = dateParts(value);
  if (!parts) return -1;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay();
}

function monthDays(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from(
    { length: last },
    (_, index) => `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
  );
}

function minutesOf(value: unknown) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text(value).slice(0, 5));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function istanbulToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function officialHolidaySet(
  c: Context<AppEnv>,
  company: string,
  start: string,
  end: string,
) {
  const dates = new Set<string>();
  if (!(await tableExists(c, "json_store"))) return dates;
  const rows = await all(
    c,
    `SELECT data FROM json_store
      WHERE scope='IK_OFFICIAL_HOLIDAY'
        AND (main_company_slug=? OR main_company_slug IS NULL)`,
    [company],
  );
  for (const row of rows) {
    try {
      const data = JSON.parse(text(row.data) || "{}");
      const day = dateOnly(data.date || data.startDate);
      if (day && day >= start && day <= end) dates.add(day);
    } catch {
      // Bozuk eski JSON kaydı denetim ekranını durdurmaz.
    }
  }
  return dates;
}

async function leaveMap(
  c: Context<AppEnv>,
  company: string,
  start: string,
  end: string,
) {
  const spans: Row[] = [];
  if (await tableExists(c, "ik_leave_plans")) {
    const rows = await all(
      c,
      `SELECT p.employee_id,p.start_date,p.end_date,p.record_type
         FROM ik_leave_plans p
         JOIN hr_monthly_employees e ON e.id=p.employee_id
         LEFT JOIN ik_person_card_settings s
           ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
        WHERE e.main_company_id=?
          AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR'
          AND TRIM(COALESCE(s.card_no,''))<>''
          AND COALESCE(p.status,'')<>'CANCELLED'
          AND p.start_date<=? AND p.end_date>=?`,
      [company, end, start],
    );
    spans.push(...rows);
  }
  if (await tableExists(c, "hr_leave_records_v2")) {
    const rows = await all(
      c,
      `SELECT p.employee_id,p.start_date,p.end_date,p.record_type
         FROM hr_leave_records_v2 p
         JOIN hr_monthly_employees e ON e.id=p.employee_id
         LEFT JOIN ik_person_card_settings s
           ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
        WHERE e.main_company_id=?
          AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR'
          AND TRIM(COALESCE(s.card_no,''))<>''
          AND p.start_date<=? AND p.end_date>=?`,
      [company, end, start],
    );
    spans.push(...rows);
  }

  const result = new Map<string, string>();
  for (const span of spans) {
    let cursor = dateOnly(span.start_date);
    const spanEnd = dateOnly(span.end_date);
    while (cursor && spanEnd && cursor <= spanEnd) {
      if (cursor >= start && cursor <= end) {
        const key = `${text(span.employee_id)}|${cursor}`;
        const recordType = text(span.record_type) || "İzin";
        result.set(key, recordType);
      }
      const parts = dateParts(cursor);
      if (!parts) break;
      cursor = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + 1)).toISOString().slice(0, 10);
    }
  }
  return result;
}

async function buildPdksMonth(
  c: Context<AppEnv>,
  company: string,
  year: number,
  month: number,
) {
  const dates = monthDays(year, month);
  const start = dates[0];
  const end = dates.at(-1)!;
  const peopleRows = await auditPdksPeople(c, company);
  const people = peopleRows.map(safePerson);

  const [events, overrides, holidays, leaves] = await Promise.all([
    tableExists(c, "ik_time_clock_events").then((exists) =>
      exists
        ? all(
            c,
            `SELECT t.id,t.employee_id,t.card_no,t.work_date,t.event_time,t.direction,t.source,t.note
               FROM ik_time_clock_events t
               JOIN hr_monthly_employees e ON e.id=t.employee_id
               LEFT JOIN ik_person_card_settings s
                 ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
              WHERE t.main_company_id=?
                AND t.work_date BETWEEN ? AND ?
                AND e.main_company_id=?
                AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR'
                AND TRIM(COALESCE(s.card_no,''))<>''
              ORDER BY t.work_date,t.event_time`,
            [company, start, end, company],
          )
        : Promise.resolve([]),
    ),
    tableExists(c, "ik_attendance_day_overrides").then((exists) =>
      exists
        ? all(
            c,
            `SELECT o.*
               FROM ik_attendance_day_overrides o
               JOIN hr_monthly_employees e ON e.id=o.employee_id
               LEFT JOIN ik_person_card_settings s
                 ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
              WHERE o.main_company_id=?
                AND o.work_date BETWEEN ? AND ?
                AND e.main_company_id=?
                AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR'
                AND TRIM(COALESCE(s.card_no,''))<>''`,
            [company, start, end, company],
          )
        : Promise.resolve([]),
    ),
    officialHolidaySet(c, company, start, end),
    leaveMap(c, company, start, end),
  ]);

  const eventsByKey = new Map<string, Row[]>();
  for (const event of events) {
    const key = `${text(event.employee_id)}|${dateOnly(event.work_date)}`;
    if (!eventsByKey.has(key)) eventsByKey.set(key, []);
    eventsByKey.get(key)!.push(event);
  }
  const overrideByKey = new Map(
    overrides.map((row) => [`${text(row.employee_id)}|${dateOnly(row.work_date)}`, row]),
  );

  const inBase = minutesOf(EXPECTED_IN)!;
  const outBase = minutesOf(EXPECTED_OUT)!;
  const today = istanbulToday();
  const rows: Row[] = [];

  for (const personRow of peopleRows) {
    const person = safePerson(personRow);
    for (const date of dates) {
      const key = `${person.id}|${date}`;
      const dayEvents = (eventsByKey.get(key) || []).slice().sort((a, b) =>
        text(a.event_time).localeCompare(text(b.event_time)),
      );
      const override = overrideByKey.get(key);
      const times = dayEvents
        .map((row) => text(row.event_time).slice(0, 5))
        .filter((value) => /^\d{2}:\d{2}$/.test(value))
        .sort();

      let entry = text(override?.manual_in).slice(0, 5);
      let exit = text(override?.manual_out).slice(0, 5);
      if (!entry && !exit) {
        if (times.length >= 2) {
          entry = times[0];
          exit = times.at(-1)!;
        } else if (times.length === 1) {
          const direction = upper(dayEvents[0]?.direction);
          if (direction === "OUT") exit = times[0];
          else entry = times[0];
        }
      } else {
        if (!entry && times.length) entry = times[0];
        if (!exit && times.length > 1) exit = times.at(-1)!;
      }

      const wd = weekday(date);
      const outsideEmployment = Boolean(
        (person.startDate && date < person.startDate) ||
        (person.exitDate && date > person.exitDate),
      );
      const futureDay = date > today;
      let status = upper(override?.status);
      if (!status || status === "AUTO") {
        const leaveType = leaves.get(key);
        if (leaveType) status = upper(leaveType).includes("YILLIK") ? "YILLIK_IZIN" : "IZIN";
        else if (outsideEmployment || futureDay) status = "DONEM_DISI";
        else if (holidays.has(date)) status = "RESMI_TATIL";
        else if (wd === 0 || wd === 6) status = "HAFTA_SONU";
        else if (!times.length && !entry && !exit) status = "KART_YOK";
        else if ((!entry || !exit) || times.length === 1) status = "EKSIK_BASIM";
        else status = "CALISTI";
      }

      const entryMinutes = minutesOf(entry);
      const exitMinutes = minutesOf(exit);
      const lateMinutes = override?.late_minutes ??
        (entryMinutes === null ? 0 : Math.max(0, entryMinutes - inBase));
      const earlyMinutes = override?.early_minutes ??
        (exitMinutes === null ? 0 : Math.max(0, outBase - exitMinutes));
      const overtimeMinutes = override?.overtime_minutes ??
        (exitMinutes === null ? 0 : Math.max(0, exitMinutes - outBase));
      const missingPunch = Boolean(override?.missing_punch) || status === "EKSIK_BASIM";

      rows.push({
        employeeId: person.id,
        personnelCode: person.personnelCode,
        fullName: person.fullName,
        department: person.department,
        title: person.title,
        sgkStatus: "VAR",
        cardNo: person.cardNo,
        date,
        weekday: wd,
        status,
        entry,
        exit,
        lateMinutes: number(lateMinutes),
        earlyMinutes: number(earlyMinutes),
        overtimeMinutes: number(overtimeMinutes),
        missingPunch,
        eventCount: dayEvents.length,
        note: text(override?.note),
      });
    }
  }

  const workingRows = rows.filter((row) =>
    !["DONEM_DISI", "HAFTA_SONU", "RESMI_TATIL"].includes(row.status),
  );
  const summary = {
    personCount: people.length,
    workedDays: workingRows.filter((row) => row.status === "CALISTI").length,
    missingPunchDays: workingRows.filter((row) => row.status === "EKSIK_BASIM").length,
    noPunchDays: workingRows.filter((row) => row.status === "KART_YOK").length,
    annualLeaveDays: workingRows.filter((row) => row.status === "YILLIK_IZIN").length,
    leaveDays: workingRows.filter((row) => row.status === "IZIN").length,
    lateDays: workingRows.filter((row) => number(row.lateMinutes) > 0).length,
    lateMinutes: workingRows.reduce((sum, row) => sum + number(row.lateMinutes), 0),
    earlyMinutes: workingRows.reduce((sum, row) => sum + number(row.earlyMinutes), 0),
    overtimeMinutes: workingRows.reduce((sum, row) => sum + number(row.overtimeMinutes), 0),
  };

  return {
    year,
    month,
    periodStart: start,
    periodEnd: end,
    today,
    expectedIn: EXPECTED_IN,
    expectedOut: EXPECTED_OUT,
    people,
    summary,
    rows,
  };
}

export function registerIkAuditReadonlyRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/audit/people", async (c) => {
    const auth = await auditContext(c);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (!auth.allowed) return fail(c, 403, "FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor.");
    return ok(c, (await auditIkPeople(c, auth.company)).map(safePerson));
  });

  app.get("/api/ik/audit/people/:employeeId", async (c) => {
    const auth = await auditContext(c);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (!auth.allowed) return fail(c, 403, "FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor.");
    const row = await c.env.DB.prepare(`${IK_PERSON_SQL} AND e.id=? LIMIT 1`)
      .bind(auth.company, text(c.req.param("employeeId")))
      .first<Row>();
    if (!row) return fail(c, 404, "NOT_FOUND", "Kayıt bulunamadı.");
    return ok(c, safePerson(row));
  });

  app.get("/api/ik/audit/pdks/month", async (c) => {
    const auth = await auditContext(c);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    if (!auth.allowed) return fail(c, 403, "FORBIDDEN", "Bu işlem için yetkiniz bulunmuyor.");
    const today = dateParts(istanbulToday())!;
    const year = Number(c.req.query("year") || today.y);
    const month = Number(c.req.query("month") || today.m);
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return fail(c, 400, "INVALID_PERIOD", "Geçerli yıl ve ay seçilmelidir.");
    }
    return ok(c, await buildPdksMonth(c, auth.company, year, month));
  });
}
