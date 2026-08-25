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
const nowIso = () => new Date().toISOString();
const dateOnly = (value: unknown) => text(value).slice(0, 10);

function companyOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    c.req.header("X-KYERP-Tenant-Slug") ||
      body.mainCompanyId || body.mainCompanySlug ||
      c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") ||
      DEFAULT_COMPANY,
  ).toLocaleLowerCase("tr-TR");
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch {
    return {};
  }
}

async function all(c: Context<AppEnv>, sql: string, values: unknown[] = []) {
  const result = await c.env.DB.prepare(sql).bind(...values).all<Row>();
  return result.results || [];
}

async function first(c: Context<AppEnv>, sql: string, values: unknown[] = []) {
  return c.env.DB.prepare(sql).bind(...values).first<Row>();
}

function error(c: Context<AppEnv>, status: number, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status as any);
}

function ok(c: Context<AppEnv>, data: unknown, status = 200) {
  return c.json({ ok: true, success: true, data }, status as any);
}

function normalizeScope(value: unknown) {
  return upper(value) === "AUDIT" ? "AUDIT" : "FULL";
}

async function authContext(c: Context<AppEnv>) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const company = text(user.mainCompanySlug || user.security?.main_company_slug || companyOf(c)) || DEFAULT_COMPANY;
  let row: Row | null = null;
  try {
    row = await first(c, "SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1", [user.id, company]);
  } catch {
    row = null;
  }
  const username = text(user.username).toLocaleLowerCase("tr-TR");
  const scope = row?.scope ? normalizeScope(row.scope) : username === "denetim" ? "AUDIT" : "FULL";
  return { user, company, scope, audit: scope === "AUDIT" };
}

function adminRole(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(upper(role));
}

async function ensureFull(c: Context<AppEnv>) {
  const auth = await authContext(c);
  if (!auth) return { response: error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.") };
  if (auth.audit) return { response: error(c, 403, "HR_AUDIT_READ_ONLY", "Denetim kullanıcısı İK verisini değiştiremez.") };
  return { auth };
}

function personSelect(audit = false) {
  return `SELECT e.id,e.main_company_id,e.code,e.full_name,e.department,e.title,e.work_type,e.sgk_status,e.status,
                 e.hire_date,e.salary,e.road_allowance,e.bank_payment_type,e.bank_amount,e.cash_amount,
                 e.overtime_hourly_base,e.annual_leave_entitlement,e.annual_leave_carryover,e.note,
                 e.created_at,e.updated_at,
                 s.card_no,s.identity_no,s.exit_date,s.active_passive,s.phone,s.payment_type,s.sgk_follow,s.personel_kodu
            FROM hr_monthly_employees e
            LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
           WHERE e.main_company_id=?${audit ? " AND UPPER(COALESCE(e.sgk_status,'VAR')) <> 'YOK' AND TRIM(COALESCE(s.card_no,'')) <> ''" : ""}`;
}

function mapPerson(row: Row, audit = false) {
  const base: Row = {
    id: text(row.id),
    personnelCode: text(row.code),
    fullName: text(row.full_name),
    department: text(row.department),
    title: text(row.title),
    workType: text(row.work_type) || "Aylık",
    sgkStatus: text(row.sgk_status) || "VAR",
    status: text(row.status) || "Aktif",
    startDate: dateOnly(row.hire_date),
    exitDate: dateOnly(row.exit_date),
    cardNo: text(row.card_no),
    activePassive: text(row.active_passive) || text(row.status) || "Aktif",
    phone: text(row.phone),
    annualLeaveEntitlement: number(row.annual_leave_entitlement),
    annualLeaveCarryover: number(row.annual_leave_carryover),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (!audit) {
    Object.assign(base, {
      identityNo: text(row.identity_no),
      salary: number(row.salary),
      roadAllowance: number(row.road_allowance),
      paymentChannel: text(row.bank_payment_type),
      bankAmount: number(row.bank_amount),
      cashAmount: number(row.cash_amount),
      overtimeBaseHours: number(row.overtime_hourly_base) || 225,
      note: text(row.note),
    });
  }
  return base;
}

async function personRows(c: Context<AppEnv>, auth: Row) {
  const rows = await all(c, `${personSelect(auth.audit)} ORDER BY e.code COLLATE NOCASE,e.full_name COLLATE NOCASE`, [auth.company]);
  return rows.map((row) => mapPerson(row, auth.audit));
}

async function accessiblePerson(c: Context<AppEnv>, auth: Row, employeeId: string) {
  const row = await first(c, `${personSelect(auth.audit)} AND e.id=? LIMIT 1`, [auth.company, employeeId]);
  return row ? mapPerson(row, auth.audit) : null;
}

function minutesOf(hhmm: string) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text(hhmm));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function weekday(value: string) {
  const p = dateParts(value);
  if (!p) return -1;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

function monthDays(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

async function officialHolidaySet(c: Context<AppEnv>, company: string, start: string, end: string) {
  try {
    const rows = await all(c, `SELECT data FROM json_store WHERE scope='IK_OFFICIAL_HOLIDAY' AND (main_company_slug=? OR main_company_slug IS NULL)`, [company]);
    const dates = new Set<string>();
    for (const row of rows) {
      try {
        const data = JSON.parse(text(row.data) || "{}");
        const date = dateOnly(data.date || data.startDate);
        if (date && date >= start && date <= end) dates.add(date);
      } catch {}
    }
    return dates;
  } catch {
    return new Set<string>();
  }
}

async function annualLeaveMap(c: Context<AppEnv>, employeeId: string, start: string, end: string) {
  const spans: Row[] = [];
  try {
    const plans = await all(c, `SELECT start_date,end_date,record_type,status FROM ik_leave_plans WHERE employee_id=? AND status<>'CANCELLED' AND start_date<=? AND end_date>=?`, [employeeId, end, start]);
    plans.forEach((row) => spans.push({ start: dateOnly(row.start_date), end: dateOnly(row.end_date), type: text(row.record_type) || "Yıllık izin" }));
  } catch {}
  try {
    const legacy = await all(c, `SELECT start_date,end_date,record_type FROM hr_leave_records_v2 WHERE employee_id=? AND start_date<=? AND end_date>=?`, [employeeId, end, start]);
    legacy.forEach((row) => spans.push({ start: dateOnly(row.start_date), end: dateOnly(row.end_date), type: text(row.record_type) || "İzin" }));
  } catch {}
  const result = new Map<string, string>();
  for (const span of spans) {
    for (let date = span.start; date && date <= span.end; ) {
      if (date >= start && date <= end) result.set(date, span.type);
      const p = dateParts(date);
      if (!p) break;
      const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
      date = next.toISOString().slice(0, 10);
    }
  }
  return result;
}

async function attendanceMonth(c: Context<AppEnv>, auth: Row, employeeId: string, year: number, month: number) {
  const person = await accessiblePerson(c, auth, employeeId);
  if (!person) return null;
  const dates = monthDays(year, month);
  const start = dates[0];
  const end = dates.at(-1)!;
  const [events, overrides, holidays, leaves] = await Promise.all([
    all(c, `SELECT * FROM ik_time_clock_events WHERE main_company_id=? AND employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date,event_time`, [auth.company, employeeId, start, end]),
    all(c, `SELECT * FROM ik_attendance_day_overrides WHERE main_company_id=? AND employee_id=? AND work_date BETWEEN ? AND ?`, [auth.company, employeeId, start, end]),
    officialHolidaySet(c, auth.company, start, end),
    annualLeaveMap(c, employeeId, start, end),
  ]);
  const byDate = new Map<string, Row[]>();
  for (const event of events) {
    const key = dateOnly(event.work_date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(event);
  }
  const overrideByDate = new Map(overrides.map((row) => [dateOnly(row.work_date), row]));
  const inBase = minutesOf(EXPECTED_IN)!;
  const outBase = minutesOf(EXPECTED_OUT)!;
  const days = dates.map((date) => {
    const dayEvents = byDate.get(date) || [];
    const override = overrideByDate.get(date);
    const times = dayEvents.map((row) => text(row.event_time).slice(0, 5)).filter(Boolean).sort();
    const firstTime = text(override?.manual_in) || times[0] || "";
    const lastTime = text(override?.manual_out) || (times.length > 1 ? times.at(-1)! : "");
    const wd = weekday(date);
    let status = text(override?.status);
    if (!status || status === "AUTO") {
      if (leaves.has(date)) status = upper(leaves.get(date)).includes("YILLIK") ? "YILLIK_IZIN" : "IZIN";
      else if (holidays.has(date)) status = "RESMI_TATIL";
      else if (wd === 0 || wd === 6) status = "HAFTA_SONU";
      else if (!times.length) status = "KART_YOK";
      else if (times.length === 1) status = "EKSIK_BASIM";
      else status = "CALISTI";
    }
    const firstMin = minutesOf(firstTime);
    const lastMin = minutesOf(lastTime);
    const late = override?.late_minutes ?? (firstMin === null ? 0 : Math.max(0, firstMin - inBase));
    const early = override?.early_minutes ?? (lastMin === null ? 0 : Math.max(0, outBase - lastMin));
    const overtime = override?.overtime_minutes ?? (lastMin === null ? 0 : Math.max(0, lastMin - outBase));
    return {
      date,
      weekday: wd,
      status,
      entry: firstTime,
      exit: lastTime,
      lateMinutes: number(late),
      earlyMinutes: number(early),
      overtimeMinutes: number(overtime),
      missingPunch: Boolean(override?.missing_punch) || status === "EKSIK_BASIM",
      eventCount: times.length,
      note: text(override?.note),
    };
  });
  const summary = days.reduce((acc, day) => {
    if (day.status === "CALISTI" || day.status === "EKSIK_BASIM") acc.workedDays += 1;
    if (day.status === "YILLIK_IZIN") acc.annualLeaveDays += 1;
    if (day.status === "KART_YOK") acc.noPunchDays += 1;
    if (day.status === "EKSIK_BASIM") acc.missingPunchDays += 1;
    if (day.lateMinutes > 0) acc.lateDays += 1;
    acc.lateMinutes += day.lateMinutes;
    acc.earlyMinutes += day.earlyMinutes;
    acc.overtimeMinutes += day.overtimeMinutes;
    return acc;
  }, { workedDays: 0, annualLeaveDays: 0, noPunchDays: 0, missingPunchDays: 0, lateDays: 0, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0 });
  return { person, year, month, expectedIn: EXPECTED_IN, expectedOut: EXPECTED_OUT, summary, days };
}

async function createPerson(c: Context<AppEnv>) {
  const full = await ensureFull(c);
  if (full.response) return full.response;
  const { auth } = full;
  const body = await bodyOf(c);
  const fullName = text(body.fullName);
  if (!fullName) return error(c, 400, "FULL_NAME_REQUIRED", "Ad soyad zorunludur.");
  const id = text(body.id) || crypto.randomUUID();
  const code = text(body.personnelCode || body.code);
  const timestamp = nowIso();
  await c.env.DB.prepare(`INSERT INTO hr_monthly_employees
    (id,main_company_id,code,full_name,department,title,work_type,sgk_status,status,hire_date,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,overtime_hourly_base,annual_leave_entitlement,annual_leave_carryover,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, auth.company, code || null, fullName, text(body.department) || null, text(body.title) || null,
      text(body.workType) || "Aylık", upper(body.sgkStatus) === "YOK" ? "YOK" : "VAR", text(body.status) || "Aktif",
      dateOnly(body.startDate || body.hireDate) || null, number(body.salary), number(body.roadAllowance), text(body.paymentChannel) || "Banka + Elden",
      number(body.bankAmount), number(body.cashAmount), number(body.overtimeBaseHours) || 225, number(body.annualLeaveEntitlement) || 14,
      number(body.annualLeaveCarryover), text(body.note) || null, timestamp, timestamp).run();
  await c.env.DB.prepare(`INSERT INTO ik_person_card_settings
    (employee_id,main_company_id,card_no,identity_no,exit_date,active_passive,phone,payment_type,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(employee_id) DO UPDATE SET card_no=excluded.card_no,identity_no=excluded.identity_no,exit_date=excluded.exit_date,active_passive=excluded.active_passive,phone=excluded.phone,payment_type=excluded.payment_type,updated_at=excluded.updated_at`)
    .bind(id, auth.company, text(body.cardNo) || null, text(body.identityNo) || null, dateOnly(body.exitDate) || null, text(body.activePassive) || "Aktif", text(body.phone) || null, text(body.paymentChannel) || null, timestamp).run();
  const person = await accessiblePerson(c, auth, id);
  return ok(c, person, 201);
}

async function saveChanges(c: Context<AppEnv>) {
  const full = await ensureFull(c);
  if (full.response) return full.response;
  const { auth } = full;
  const employeeId = text(c.req.param("employeeId"));
  const currentRaw = await first(c, `${personSelect(false)} AND e.id=? LIMIT 1`, [auth.company, employeeId]);
  if (!currentRaw) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const body = await bodyOf(c);
  const changes = body.changes && typeof body.changes === "object" ? body.changes : {};
  const effectiveDate = dateOnly(body.effectiveDate) || dateOnly(nowIso());
  const note = text(body.note);
  const employeeFields: Record<string, string> = {
    fullName: "full_name", department: "department", title: "title", workType: "work_type",
    sgkStatus: "sgk_status", status: "status", startDate: "hire_date", salary: "salary",
    roadAllowance: "road_allowance", paymentChannel: "bank_payment_type", bankAmount: "bank_amount",
    cashAmount: "cash_amount", overtimeBaseHours: "overtime_hourly_base", annualLeaveEntitlement: "annual_leave_entitlement",
    annualLeaveCarryover: "annual_leave_carryover", note: "note",
  };
  const cardFields: Record<string, string> = {
    cardNo: "card_no", identityNo: "identity_no", exitDate: "exit_date", activePassive: "active_passive", phone: "phone",
  };
  const statements: any[] = [];
  let salaryTouched = false;
  for (const [key, value] of Object.entries(changes)) {
    const employeeColumn = employeeFields[key];
    const cardColumn = cardFields[key];
    if (!employeeColumn && !cardColumn) continue;
    const oldValue = employeeColumn ? currentRaw[employeeColumn] : currentRaw[cardColumn];
    const normalized = ["salary","roadAllowance","bankAmount","cashAmount","overtimeBaseHours","annualLeaveEntitlement","annualLeaveCarryover"].includes(key)
      ? number(value) : ["startDate","exitDate"].includes(key) ? (dateOnly(value) || null) : text(value);
    if (String(oldValue ?? "") === String(normalized ?? "")) continue;
    if (employeeColumn) {
      statements.push(c.env.DB.prepare(`UPDATE hr_monthly_employees SET ${employeeColumn}=?,updated_at=? WHERE id=? AND main_company_id=?`).bind(normalized, nowIso(), employeeId, auth.company));
    } else {
      statements.push(c.env.DB.prepare(`INSERT INTO ik_person_card_settings(employee_id,main_company_id,${cardColumn},updated_at) VALUES (?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET ${cardColumn}=excluded.${cardColumn},updated_at=excluded.updated_at`).bind(employeeId, auth.company, normalized, nowIso()));
    }
    statements.push(c.env.DB.prepare(`INSERT INTO ik_employee_change_history
      (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), auth.company, employeeId, key === "salary" ? "SALARY" : "PERSONNEL", key, text(oldValue), text(normalized), effectiveDate, note || null, auth.user.id, nowIso()));
    if (["salary","roadAllowance","paymentChannel","bankAmount","cashAmount"].includes(key)) salaryTouched = true;
  }
  if (!statements.length) return ok(c, { changed: false, person: mapPerson(currentRaw, false) });
  await c.env.DB.batch(statements);
  if (salaryTouched) {
    const updated = await first(c, `${personSelect(false)} AND e.id=? LIMIT 1`, [auth.company, employeeId]);
    await c.env.DB.prepare(`INSERT INTO hr_salary_contracts
      (id,employee_id,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,contract_type,contract_start,contract_end,effective_date,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), employeeId, number(updated?.salary), number(updated?.road_allowance), text(updated?.bank_payment_type), number(updated?.bank_amount), number(updated?.cash_amount), "Maaş değişikliği", effectiveDate, null, effectiveDate, note || "Personel kartından maaş değişikliği", nowIso()).run();
  }
  const person = await accessiblePerson(c, auth, employeeId);
  const history = await all(c, `SELECT * FROM ik_employee_change_history WHERE main_company_id=? AND employee_id=? ORDER BY effective_date DESC,created_at DESC LIMIT 200`, [auth.company, employeeId]);
  return ok(c, { changed: true, person, history });
}

async function saveTimeEvent(c: Context<AppEnv>) {
  const full = await ensureFull(c);
  if (full.response) return full.response;
  const { auth } = full;
  const employeeId = text(c.req.param("employeeId"));
  const personRaw = await first(c, `${personSelect(false)} AND e.id=? LIMIT 1`, [auth.company, employeeId]);
  if (!personRaw) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const body = await bodyOf(c);
  const workDate = dateOnly(body.workDate || body.date);
  const eventTime = text(body.eventTime || body.time).slice(0, 5);
  const cardNo = text(body.cardNo || personRaw.card_no);
  if (!workDate || !/^\d{2}:\d{2}$/.test(eventTime) || !cardNo) return error(c, 400, "EVENT_FIELDS_REQUIRED", "Kart no, tarih ve saat zorunludur.");
  const id = text(body.id) || crypto.randomUUID();
  try {
    await c.env.DB.prepare(`INSERT INTO ik_time_clock_events
      (id,main_company_id,employee_id,card_no,work_date,event_time,direction,source,note,actor_user_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, auth.company, employeeId, cardNo, workDate, eventTime, upper(body.direction) || "AUTO", text(body.source) || "KYERP", text(body.note) || null, auth.user.id, nowIso(), nowIso()).run();
  } catch (cause) {
    if (/UNIQUE|constraint/i.test(String(cause))) return error(c, 409, "DUPLICATE_PUNCH", "Aynı kart, tarih ve saat daha önce kayıtlı.");
    throw cause;
  }
  return ok(c, { id, employeeId, cardNo, workDate, eventTime }, 201);
}

async function importTimeEvents(c: Context<AppEnv>) {
  const full = await ensureFull(c);
  if (full.response) return full.response;
  const { auth } = full;
  const body = await bodyOf(c);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return error(c, 400, "ROWS_REQUIRED", "Aktarılacak kart satırı yok.");
  const people = await all(c, `${personSelect(false)} ORDER BY e.id`, [auth.company]);
  const byId = new Map(people.map((row) => [text(row.id), row]));
  const byCard = new Map(people.filter((row) => text(row.card_no)).map((row) => [text(row.card_no), row]));
  const statements: any[] = [];
  const accepted: Row[] = [];
  const rejected: Row[] = [];
  const seen = new Set<string>();
  for (const source of rows) {
    const person = byId.get(text(source.employeeId)) || byCard.get(text(source.cardNo));
    const workDate = dateOnly(source.workDate || source.date);
    const eventTime = text(source.eventTime || source.time).slice(0, 5);
    const cardNo = text(source.cardNo || person?.card_no);
    if (!person || !workDate || !/^\d{2}:\d{2}$/.test(eventTime) || !cardNo) {
      rejected.push({ ...source, reason: "Personel/kart/tarih/saat eşleşmedi" });
      continue;
    }
    const key = `${cardNo}|${workDate}|${eventTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = crypto.randomUUID();
    statements.push(c.env.DB.prepare(`INSERT OR IGNORE INTO ik_time_clock_events
      (id,main_company_id,employee_id,card_no,work_date,event_time,direction,source,note,actor_user_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, auth.company, text(person.id), cardNo, workDate, eventTime, upper(source.direction) || "AUTO", text(body.source || source.source) || "MANUAL_IMPORT", text(source.note) || null, auth.user.id, nowIso(), nowIso()));
    accepted.push({ id, employeeId: text(person.id), cardNo, workDate, eventTime });
  }
  if (statements.length) await c.env.DB.batch(statements);
  return ok(c, { acceptedCount: accepted.length, rejectedCount: rejected.length, accepted, rejected });
}

async function saveDayOverride(c: Context<AppEnv>) {
  const full = await ensureFull(c);
  if (full.response) return full.response;
  const { auth } = full;
  const employeeId = text(c.req.param("employeeId"));
  const person = await accessiblePerson(c, auth, employeeId);
  if (!person) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const body = await bodyOf(c);
  const workDate = dateOnly(body.workDate || body.date);
  if (!workDate) return error(c, 400, "DATE_REQUIRED", "Tarih zorunludur.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO ik_attendance_day_overrides
    (id,main_company_id,employee_id,work_date,status,manual_in,manual_out,late_minutes,early_minutes,overtime_minutes,missing_punch,note,actor_user_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(main_company_id,employee_id,work_date) DO UPDATE SET status=excluded.status,manual_in=excluded.manual_in,manual_out=excluded.manual_out,late_minutes=excluded.late_minutes,early_minutes=excluded.early_minutes,overtime_minutes=excluded.overtime_minutes,missing_punch=excluded.missing_punch,note=excluded.note,actor_user_id=excluded.actor_user_id,updated_at=excluded.updated_at`)
    .bind(id, auth.company, employeeId, workDate, upper(body.status) || "AUTO", text(body.entry || body.manualIn) || null, text(body.exit || body.manualOut) || null,
      body.lateMinutes === undefined ? null : number(body.lateMinutes), body.earlyMinutes === undefined ? null : number(body.earlyMinutes), body.overtimeMinutes === undefined ? null : number(body.overtimeMinutes),
      body.missingPunch ? 1 : 0, text(body.note) || null, auth.user.id, nowIso(), nowIso()).run();
  return ok(c, { employeeId, workDate, saved: true });
}

function ddmmyy(date: string) {
  const p = dateParts(date);
  return p ? `${String(p.d).padStart(2,"0")}${String(p.m).padStart(2,"0")}${String(p.y).slice(-2)}` : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cardExport(c: Context<AppEnv>) {
  const full = await ensureFull(c);
  if (full.response) return full.response;
  const { auth } = full;
  const body = await bodyOf(c);
  const start = dateOnly(body.startDate);
  const end = dateOnly(body.endDate || body.startDate);
  if (!start || !end || end < start) return error(c, 400, "DATE_RANGE_REQUIRED", "Geçerli başlangıç ve bitiş tarihi zorunludur.");
  const [events, holidays] = await Promise.all([
    all(c, `SELECT t.*,e.sgk_status,e.hire_date,s.exit_date FROM ik_time_clock_events t JOIN hr_monthly_employees e ON e.id=t.employee_id LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id WHERE t.main_company_id=? AND t.work_date BETWEEN ? AND ? AND UPPER(COALESCE(e.sgk_status,'VAR'))<>'YOK' AND TRIM(COALESCE(t.card_no,''))<>'' ORDER BY t.card_no,t.work_date,t.event_time`, [auth.company, start, end]),
    officialHolidaySet(c, auth.company, start, end),
  ]);
  const leaveCache = new Map<string, Map<string,string>>();
  const lines: Row[] = [];
  const seen = new Set<string>();
  for (const row of events) {
    const date = dateOnly(row.work_date);
    const wd = weekday(date);
    if (wd === 0 || wd === 6 || holidays.has(date)) continue;
    const hire = dateOnly(row.hire_date);
    const exit = dateOnly(row.exit_date);
    if (hire && date < hire) continue;
    if (exit && date > exit) continue;
    const employeeId = text(row.employee_id);
    if (!leaveCache.has(employeeId)) leaveCache.set(employeeId, await annualLeaveMap(c, employeeId, start, end));
    if (leaveCache.get(employeeId)!.has(date)) continue;
    const time = text(row.event_time).slice(0, 5);
    const cardNo = text(row.card_no);
    const key = `${cardNo}|${date}|${time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ employeeId, cardNo, workDate: date, eventTime: time, line: `${cardNo},${time},${ddmmyy(date)},1,001` });
  }
  const content = lines.map((row) => row.line).join("\n");
  const hash = await sha256(content);
  const existing = await first(c, "SELECT * FROM ik_card_export_batches WHERE main_company_id=? AND content_hash=? LIMIT 1", [auth.company, hash]);
  if (body.commit === true && !existing) {
    const batchId = crypto.randomUUID();
    const statements: any[] = [c.env.DB.prepare(`INSERT INTO ik_card_export_batches(id,main_company_id,period_start,period_end,row_count,content_hash,status,created_by,created_at,note) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(batchId, auth.company, start, end, lines.length, hash, "CREATED", auth.user.id, nowIso(), text(body.note) || null)];
    for (const row of lines) statements.push(c.env.DB.prepare(`INSERT INTO ik_card_export_items(id,batch_id,main_company_id,employee_id,card_no,work_date,event_time,export_line,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), batchId, auth.company, row.employeeId, row.cardNo, row.workDate, row.eventTime, row.line, nowIso()));
    await c.env.DB.batch(statements);
    return ok(c, { batchId, startDate: start, endDate: end, rowCount: lines.length, hash, content, duplicate: false }, 201);
  }
  return ok(c, { batchId: text(existing?.id), startDate: start, endDate: end, rowCount: lines.length, hash, content, duplicate: Boolean(existing) });
}

async function personDetail(c: Context<AppEnv>) {
  const auth = await authContext(c);
  if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
  const employeeId = text(c.req.param("employeeId"));
  const person = await accessiblePerson(c, auth, employeeId);
  if (!person) return error(c, 404, "NOT_FOUND", "Personel bulunamadı veya bu kullanıcı için görünür değil.");
  const [leaves, history, salaryHistory] = await Promise.all([
    all(c, `SELECT id,record_type,effect_type,start_date,end_date,day_count,note,created_at FROM hr_leave_records_v2 WHERE employee_id=? ORDER BY start_date DESC LIMIT 200`, [employeeId]),
    auth.audit ? Promise.resolve([]) : all(c, `SELECT * FROM ik_employee_change_history WHERE main_company_id=? AND employee_id=? ORDER BY effective_date DESC,created_at DESC LIMIT 300`, [auth.company, employeeId]),
    auth.audit ? Promise.resolve([]) : all(c, `SELECT id,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,contract_type,contract_start,contract_end,effective_date,note,created_at FROM hr_salary_contracts WHERE employee_id=? ORDER BY effective_date DESC,created_at DESC LIMIT 200`, [employeeId]),
  ]);
  return ok(c, { scope: auth.scope, person, leaves, changeHistory: history, salaryHistory });
}

async function setUserScope(c: Context<AppEnv>) {
  const auth = await authContext(c);
  if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
  if (!adminRole(auth.user.role)) return error(c, 403, "ADMIN_REQUIRED", "Bu işlem yönetici yetkisi gerektirir.");
  const body = await bodyOf(c);
  let userId = text(body.userId);
  if (!userId && text(body.username)) {
    const target = await first(c, "SELECT id FROM auth_users WHERE LOWER(username)=LOWER(?) LIMIT 1", [text(body.username)]);
    userId = text(target?.id);
  }
  if (!userId) return error(c, 400, "USER_REQUIRED", "Kullanıcı seçilmelidir.");
  const scope = normalizeScope(body.scope);
  const company = text(body.mainCompanyId || body.mainCompanySlug) || auth.company;
  await c.env.DB.prepare(`INSERT INTO ik_user_hr_scope(user_id,main_company_id,scope,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET main_company_id=excluded.main_company_id,scope=excluded.scope,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(userId, company, scope, auth.user.id, nowIso()).run();
  return ok(c, { userId, mainCompanyId: company, scope });
}

export function registerIkPersonnelControlRoutes(app: Hono<AppEnv>) {
  // Denetim kullanıcısı için eski İK endpointlerini kapat: veri yalnız güvenli personnel-control API'sinden okunur.
  app.use("/api/ik/*", async (c, next) => {
    const auth = await authContext(c);
    if (!auth || !auth.audit) return next();
    if (c.req.path.startsWith("/api/ik/personnel-control")) return next();
    if (c.req.method !== "GET") return error(c, 403, "HR_AUDIT_READ_ONLY", "Denetim kullanıcısı yalnız görüntüleme yapabilir.");
    return error(c, 403, "HR_AUDIT_SCOPED", "Denetim kullanıcısı yalnız SGK'lı kart personeli ve puantaj ekranına erişebilir.");
  });

  app.get("/api/ik/personnel-control/profile", async (c) => {
    const auth = await authContext(c);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    return ok(c, { scope: auth.scope, audit: auth.audit, username: auth.user.username, role: auth.user.role });
  });
  app.get("/api/ik/personnel-control/people", async (c) => {
    const auth = await authContext(c);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    return ok(c, await personRows(c, auth));
  });
  app.post("/api/ik/personnel-control/people", createPerson);
  app.get("/api/ik/personnel-control/people/:employeeId", personDetail);
  app.post("/api/ik/personnel-control/people/:employeeId/change", saveChanges);
  app.get("/api/ik/personnel-control/people/:employeeId/attendance", async (c) => {
    const auth = await authContext(c);
    if (!auth) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const year = number(c.req.query("year")) || new Date().getFullYear();
    const month = number(c.req.query("month")) || new Date().getMonth() + 1;
    const data = await attendanceMonth(c, auth, text(c.req.param("employeeId")), year, month);
    return data ? ok(c, data) : error(c, 404, "NOT_FOUND", "Personel bulunamadı veya görünür değil.");
  });
  app.post("/api/ik/personnel-control/people/:employeeId/time-event", saveTimeEvent);
  app.post("/api/ik/personnel-control/people/:employeeId/day-override", saveDayOverride);
  app.post("/api/ik/personnel-control/time-events/import", importTimeEvents);
  app.post("/api/ik/personnel-control/card-export", cardExport);
  app.post("/api/ik/personnel-control/user-scope", setUserScope);
}
