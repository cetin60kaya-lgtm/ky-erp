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
    c.req.header("X-KYERP-Tenant-Slug") ||
    body.mainCompanyId || body.mainCompanySlug ||
    c.req.query("mainCompanyId") || c.req.query("mainCompanySlug"),
  ).toLocaleLowerCase("tr-TR");
}

async function authContext(c: Context<AppEnv>, body: Row = {}) {
  const user = await getAuthenticatedUser(c);
  if (!user) return null;
  const company = requestedCompany(c, body) ||
    text(user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY).toLocaleLowerCase("tr-TR");
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

function error(c: Context<AppEnv>, status: number, code: string, message: string, details?: unknown) {
  return c.json({ ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } }, status as any);
}

async function requireFull(c: Context<AppEnv>, body: Row = {}) {
  const auth = await authContext(c, body);
  if (!auth) return { response: error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.") };
  if (auth.audit) return { response: error(c, 403, "PDKS_AUDIT_READ_ONLY", "Denetim hesabı bu PDKS işlemine erişemez.") };
  return { auth };
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1")
    .bind(table).first<Row>();
  return Boolean(row?.name);
}

async function all(c: Context<AppEnv>, sql: string, values: unknown[] = []) {
  const result = await c.env.DB.prepare(sql).bind(...values).all<Row>();
  return result.results || [];
}

async function first(c: Context<AppEnv>, sql: string, values: unknown[] = []) {
  return c.env.DB.prepare(sql).bind(...values).first<Row>();
}

function monthParts(date: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateOnly(date));
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

function periodDates(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(days).padStart(2, "0")}` };
}

function eachDate(start: string, end: string) {
  const rows: string[] = [];
  let cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    rows.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return rows;
}

function currentPeriodIstanbul() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((item) => item.type === "year")?.value || 0);
  const month = Number(parts.find((item) => item.type === "month")?.value || 0);
  return { year, month };
}

async function ensurePeriodOpen(c: Context<AppEnv>, company: string, date: string) {
  const period = monthParts(date);
  if (!period) throw Object.assign(new Error("Tarih geçersiz."), { code: "DATE_INVALID" });
  if (!(await tableExists(c, "ik_monthly_close"))) return;
  const row = await first(c, "SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1",
    [company, period.year, period.month]);
  if (Number(row?.is_locked || 0) !== 0) {
    throw Object.assign(new Error(`Dönem kilitli: ${period.year}-${String(period.month).padStart(2, "0")}.`), { code: "PDKS_PERIOD_LOCKED" });
  }
}

async function ensureRangeOpen(c: Context<AppEnv>, company: string, start: string, end: string) {
  const seen = new Set<string>();
  for (const date of eachDate(start, end)) {
    const period = date.slice(0, 7);
    if (seen.has(period)) continue;
    seen.add(period);
    await ensurePeriodOpen(c, company, date);
  }
}

async function employee(c: Context<AppEnv>, company: string, employeeId: string) {
  return first(c, `SELECT e.id,e.code,e.full_name,e.department,e.title,e.sgk_status,e.status,e.hire_date,e.salary,e.bank_amount,e.cash_amount,
      e.annual_leave_entitlement,e.annual_leave_carryover,s.card_no,s.exit_date
    FROM hr_monthly_employees e
    LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=? AND e.id=? LIMIT 1`, [company, employeeId]);
}

async function strictPdksEmployee(c: Context<AppEnv>, company: string, employeeId: string) {
  const person = await employee(c, company, employeeId);
  return person && upper(person.sgk_status) === "VAR" && text(person.card_no) ? person : null;
}

async function officialHolidayRows(c: Context<AppEnv>, company: string, start = "", end = "") {
  if (!(await tableExists(c, "json_store"))) return [];
  const rows = await all(c, `SELECT data FROM json_store
    WHERE scope='IK_OFFICIAL_HOLIDAY' AND (main_company_slug=? OR main_company_slug IS NULL)
    ORDER BY updated_at DESC`, [company]);
  const result: Row[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    try {
      const data = JSON.parse(text(row.data) || "{}");
      const date = dateOnly(data.date || data.startDate);
      if (!date || seen.has(date) || (start && date < start) || (end && date > end)) continue;
      seen.add(date);
      result.push({ id: text(data.id || date), date, name: text(data.name || data.title || "Resmî tatil"), halfDay: Boolean(data.halfDay || data.half_day), note: text(data.note) });
    } catch {}
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

async function writeAudit(c: Context<AppEnv>, company: string, employeeId: string, period: string, actionType: string, oldValue: unknown, newValue: unknown, reason: string, userName: string) {
  if (!(await tableExists(c, "ik_audit_logs"))) return;
  try {
    await c.env.DB.prepare(`INSERT INTO ik_audit_logs
      (id,main_company_id,employee_id,period,action_type,source_screen,old_json,new_json,reason,user_name,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), company, employeeId || "", period || "", actionType, "KY_PDKS",
        JSON.stringify(oldValue || {}), JSON.stringify(newValue || {}), reason || "", userName || "", nowIso()).run();
  } catch {}
}

async function saveHoliday(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const result = await requireFull(c, body);
  if (result.response) return result.response;
  const { auth } = result;
  const date = dateOnly(body.date);
  const name = text(body.name || body.title);
  if (!date || !name) return error(c, 400, "HOLIDAY_REQUIRED", "Tarih ve tatil adı zorunludur.");
  try { await ensurePeriodOpen(c, auth.company, date); }
  catch (cause: any) { return error(c, 409, cause.code || "PDKS_PERIOD_LOCKED", cause.message); }
  if (!(await tableExists(c, "json_store"))) return error(c, 500, "JSON_STORE_MISSING", "Resmî tatil veri alanı hazır değil.");
  const fileName = `pdks-holiday-${date}`;
  const timestamp = nowIso();
  const existing = await first(c, "SELECT id,data FROM json_store WHERE scope='IK_OFFICIAL_HOLIDAY' AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) LIMIT 1",
    [fileName, auth.company]);
  const payload = { id: fileName, date, name, halfDay: Boolean(body.halfDay), note: text(body.note), updatedAt: timestamp };
  if (existing?.id) {
    await c.env.DB.prepare("UPDATE json_store SET data=?,main_company_slug=?,updated_at=? WHERE id=?")
      .bind(JSON.stringify(payload), auth.company, timestamp, existing.id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), "IK_OFFICIAL_HOLIDAY", auth.company, fileName, JSON.stringify(payload), timestamp, timestamp).run();
  }
  await writeAudit(c, auth.company, "", date.slice(0, 7), "PDKS_TATIL_KAYDET", existing ? JSON.parse(text(existing.data) || "{}") : {}, payload, text(body.note), text(auth.user.username));
  return ok(c, payload, 201);
}

async function leaveRows(c: Context<AppEnv>, company: string, from = "", to = "") {
  if (!(await tableExists(c, "ik_leave_plans"))) return [];
  const start = from || "0000-01-01";
  const end = to || "9999-12-31";
  const rows = await all(c, `SELECT p.*,e.full_name,e.code,e.department FROM ik_leave_plans p
    LEFT JOIN hr_monthly_employees e ON e.id=p.employee_id AND e.main_company_id=p.main_company_id
    WHERE p.main_company_id=? AND p.status<>'CANCELLED' AND p.start_date<=? AND p.end_date>=?
    ORDER BY p.start_date DESC,p.created_at DESC`, [company, end, start]);
  return rows.map((row) => ({
    id: text(row.id), employeeId: text(row.employee_id), fullName: text(row.full_name), personnelCode: text(row.code), department: text(row.department),
    recordType: text(row.record_type), startDate: dateOnly(row.start_date), endDate: dateOnly(row.end_date), returnDate: dateOnly(row.return_date),
    dayCount: number(row.counted_days), status: text(row.status), documentNo: text(row.document_no), note: text(row.note), createdAt: row.created_at,
  }));
}

async function leavePolicy(c: Context<AppEnv>, company: string) {
  if (!(await tableExists(c, "ik_leave_counting_policy"))) return { maxConcurrentDepartment: 1 };
  const row = await first(c, "SELECT max_concurrent_department FROM ik_leave_counting_policy WHERE main_company_id=? LIMIT 1", [company]);
  return { maxConcurrentDepartment: Math.max(1, number(row?.max_concurrent_department) || 1) };
}

async function annualLeaveUsed(c: Context<AppEnv>, company: string, employeeId: string) {
  if (!(await tableExists(c, "ik_leave_plans"))) return 0;
  const row = await first(c, `SELECT COALESCE(SUM(counted_days),0) AS total FROM ik_leave_plans
    WHERE main_company_id=? AND employee_id=? AND status<>'CANCELLED' AND UPPER(record_type) LIKE '%YILLIK%'`, [company, employeeId]);
  return number(row?.total);
}

async function saveLeave(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const result = await requireFull(c, body);
  if (result.response) return result.response;
  const { auth } = result;
  const employeeId = text(body.employeeId);
  const start = dateOnly(body.startDate);
  let end = dateOnly(body.endDate);
  const returnDateInput = dateOnly(body.returnDate);
  if (!end && returnDateInput) {
    const d = new Date(`${returnDateInput}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    end = d.toISOString().slice(0, 10);
  }
  if (!employeeId || !start || !end || end < start) return error(c, 400, "LEAVE_FIELDS_REQUIRED", "Personel ve geçerli izin tarihleri zorunludur.");
  const person = await strictPdksEmployee(c, auth.company, employeeId);
  if (!person) return error(c, 404, "PDKS_PERSON_NOT_FOUND", "SGK=VAR + kartlı personel bulunamadı.");
  try { await ensureRangeOpen(c, auth.company, start, end); }
  catch (cause: any) { return error(c, 409, cause.code || "PDKS_PERIOD_LOCKED", cause.message); }
  if (!(await tableExists(c, "ik_leave_plans"))) return error(c, 500, "PDKS_SCHEMA_MISSING", "İzin tablosu hazır değil.");

  const ownConflict = await first(c, `SELECT id FROM ik_leave_plans
    WHERE main_company_id=? AND employee_id=? AND status<>'CANCELLED' AND start_date<=? AND end_date>=? LIMIT 1`,
    [auth.company, employeeId, end, start]);
  if (ownConflict) return error(c, 409, "LEAVE_CONFLICT", "Personelin seçilen tarihlerde başka izin kaydı var.");

  const policy = await leavePolicy(c, auth.company);
  if (text(person.department) && body.allowDepartmentConflict !== true) {
    const departmentOverlap = await first(c, `SELECT COUNT(*) AS total
      FROM ik_leave_plans p JOIN hr_monthly_employees e ON e.id=p.employee_id AND e.main_company_id=p.main_company_id
      WHERE p.main_company_id=? AND p.employee_id<>? AND p.status<>'CANCELLED' AND e.department=?
        AND p.start_date<=? AND p.end_date>=?`, [auth.company, employeeId, text(person.department), end, start]);
    if (number(departmentOverlap?.total) >= policy.maxConcurrentDepartment) {
      return error(c, 409, "LEAVE_DEPARTMENT_CONFLICT", "Aynı bölümde izin çakışması var. Kontrol edip açık onay verin.");
    }
  }

  const holidays = new Set((await officialHolidayRows(c, auth.company, start, end)).map((row) => row.date));
  const dates = eachDate(start, end);
  const counted = dates.filter((date) => {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (day === 0) return false; // Yıllık izin 6 gün/hafta: Cumartesi sayılır, Pazar sayılmaz.
    if (holidays.has(date)) return false;
    return true;
  });
  const excluded = dates.filter((date) => !counted.includes(date));
  const annual = upper(body.recordType || body.type).includes("YILLIK");
  if (annual) {
    const right = number(person.annual_leave_entitlement) + number(person.annual_leave_carryover);
    const used = await annualLeaveUsed(c, auth.company, employeeId);
    if (counted.length > Math.max(0, right - used)) {
      return error(c, 409, "LEAVE_BALANCE_INSUFFICIENT", `Yıllık izin bakiyesi yetersiz. Kalan: ${Math.max(0, right - used)} gün.`);
    }
  }
  const returnDate = returnDateInput || new Date(new Date(`${end}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO ik_leave_plans
    (id,main_company_id,employee_id,record_type,start_date,end_date,return_date,counted_days,excluded_json,status,document_no,note,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, auth.company, employeeId, annual ? "Yıllık izin" : text(body.recordType || "İzin"), start, end, returnDate,
      counted.length, JSON.stringify(excluded), text(body.status || "APPROVED"), text(body.documentNo), text(body.note),
      text(auth.user.username || auth.user.id), nowIso(), nowIso()).run();
  await writeAudit(c, auth.company, employeeId, start.slice(0, 7), "PDKS_IZIN_EKLE", {}, { id, start, end, countedDays: counted.length }, text(body.note), text(auth.user.username));
  return ok(c, { id, employeeId, startDate: start, endDate: end, returnDate, countedDays: counted.length, excludedDates: excluded }, 201);
}

async function adjustmentRows(c: Context<AppEnv>, company: string, year: number, month: number) {
  if (!(await tableExists(c, "hr_monthly_adjustments_v2"))) return [];
  const { start, end } = periodDates(year, month);
  const rows = await all(c, `SELECT a.*,e.full_name,e.code FROM hr_monthly_adjustments_v2 a
    JOIN hr_monthly_employees e ON e.id=a.employee_id
    WHERE e.main_company_id=? AND substr(CAST(a.date AS TEXT),1,10) BETWEEN ? AND ?
    ORDER BY a.date DESC,a.id DESC`, [company, start, end]);
  return rows.map((row) => ({
    id: text(row.id), employeeId: text(row.employee_id), employeeName: text(row.full_name), personnelCode: text(row.code), date: dateOnly(row.date),
    adjustmentType: text(row.adjustment_type), hourOrDay: number(row.hour_or_day), amount: number(row.amount), paymentMethod: "Elden",
    payrollEffect: text(row.payroll_effect), note: text(row.note), status: text(row.status || "APPROVED"),
  }));
}

async function saveAdvance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const result = await requireFull(c, body);
  if (result.response) return result.response;
  const { auth } = result;
  const employeeId = text(body.employeeId);
  const date = dateOnly(body.date);
  const amount = number(body.amount);
  if (!employeeId || !date || amount <= 0) return error(c, 400, "ADVANCE_FIELDS_REQUIRED", "Personel, tarih ve pozitif avans tutarı zorunludur.");
  const person = await strictPdksEmployee(c, auth.company, employeeId);
  if (!person) return error(c, 404, "PDKS_PERSON_NOT_FOUND", "SGK=VAR + kartlı personel bulunamadı.");
  try { await ensurePeriodOpen(c, auth.company, date); }
  catch (cause: any) { return error(c, 409, cause.code || "PDKS_PERIOD_LOCKED", cause.message); }
  if (!(await tableExists(c, "hr_monthly_adjustments_v2"))) return error(c, 500, "PDKS_SCHEMA_MISSING", "Avans tablosu hazır değil.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO hr_monthly_adjustments_v2
    (id,employee_id,date,adjustment_type,hour_or_day,amount,payroll_effect,note,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, employeeId, date, "Avans", 0, amount, text(body.payrollEffect || "BORDRO_AZALTIR"), text(body.note), text(body.status || "APPROVED"), nowIso()).run();
  await writeAudit(c, auth.company, employeeId, date.slice(0, 7), "PDKS_AVANS_EKLE", {}, { id, date, amount }, text(body.note), text(auth.user.username));
  return ok(c, { id, employeeId, date, amount }, 201);
}

async function payroll(c: Context<AppEnv>) {
  const result = await requireFull(c);
  if (result.response) return result.response;
  const { auth } = result;
  const year = Math.trunc(number(c.req.query("year"))) || new Date().getFullYear();
  const month = Math.trunc(number(c.req.query("month"))) || new Date().getMonth() + 1;
  const employees = await all(c, `SELECT e.id,e.code,e.full_name,e.salary,e.bank_amount,e.cash_amount,s.card_no
    FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=? AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR' AND TRIM(COALESCE(s.card_no,''))<>''
    ORDER BY e.code,e.full_name`, [auth.company]);
  const adjustments = await adjustmentRows(c, auth.company, year, month);
  const byEmployee = new Map<string, Row[]>();
  for (const row of adjustments) {
    const key = text(row.employeeId);
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key)!.push(row);
  }
  let saved = new Map<string, Row>();
  if (await tableExists(c, "hr_payrolls_v2")) {
    const rows = await all(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=?", [auth.company, year, month]);
    saved = new Map(rows.map((row) => [text(row.employee_id), row]));
  }
  const lines = employees.map((person) => {
    const rows = byEmployee.get(text(person.id)) || [];
    const overtimeAmount = rows.filter((row) => upper(row.adjustmentType).includes("MESAI")).reduce((sum, row) => sum + number(row.amount), 0);
    const advanceAmount = rows.filter((row) => upper(row.adjustmentType).includes("AVANS")).reduce((sum, row) => sum + number(row.amount), 0);
    const deductionAmount = rows.filter((row) => upper(row.adjustmentType).includes("KESINTI")).reduce((sum, row) => sum + number(row.amount), 0);
    const current = saved.get(text(person.id));
    const salary = current ? number(current.salary) : number(person.salary);
    const bank = current ? number(current.bank_amount) : number(person.bank_amount);
    const cash = current ? number(current.cash_amount) : number(person.cash_amount);
    const net = current ? number(current.total_amount) : (bank + cash || Math.max(0, salary + overtimeAmount - advanceAmount - deductionAmount));
    return {
      employeeId: text(person.id), personnelCode: text(person.code), fullName: text(person.full_name), salary,
      overtimeAmount: current ? number(current.overtime_amount) : overtimeAmount,
      advanceAmount: current ? number(current.advance_amount) : advanceAmount,
      deductionAmount: current ? number(current.deduction_amount) : deductionAmount,
      bankAmount: bank, cashAmount: cash, totalAmount: net,
      status: text(current?.status || "D1_VIEW"),
    };
  });
  return ok(c, { year, month, lines });
}

async function auditLogs(c: Context<AppEnv>) {
  const result = await requireFull(c);
  if (result.response) return result.response;
  const { auth } = result;
  if (!(await tableExists(c, "ik_audit_logs"))) return ok(c, []);
  const period = text(c.req.query("period"));
  const limit = Math.max(1, Math.min(500, Math.trunc(number(c.req.query("limit"))) || 200));
  const rows = await all(c, `SELECT * FROM ik_audit_logs
    WHERE main_company_id=? AND (?='' OR period=?) ORDER BY created_at DESC LIMIT ?`, [auth.company, period, period, limit]);
  return ok(c, rows.map((row) => ({
    id: text(row.id), employeeId: text(row.employee_id), period: text(row.period), actionType: text(row.action_type),
    sourceScreen: text(row.source_screen), reason: text(row.reason), userName: text(row.user_name), createdAt: row.created_at,
  })));
}

function parseWorkDays(value: unknown, fallback: number[]) {
  try {
    const parsed = JSON.parse(text(value));
    if (!Array.isArray(parsed)) return fallback;
    const normalized = [...new Set(parsed.map((item) => Math.trunc(number(item))).filter((item) => item >= 0 && item <= 6))];
    return normalized.length ? normalized : fallback;
  } catch {
    return fallback;
  }
}

async function workCalendarForPerson(c: Context<AppEnv>, company: string, employeeId: string) {
  const fallbackWork = [1, 2, 3, 4, 5, 6];
  const fallbackRest = [0];
  try {
    const companyRule = await first(c, "SELECT work_days_json,weekly_rest_days_json FROM ik_pdks_rule_profiles WHERE main_company_id=? LIMIT 1", [company]) || {};
    const groupRule = await first(c, `SELECT r.work_days_json,r.weekly_rest_days_json
      FROM ik_pdks_employee_groups a
      JOIN ik_pdks_work_groups g ON g.id=a.group_id AND g.main_company_id=a.main_company_id
      LEFT JOIN ik_pdks_group_rules r ON r.main_company_id=a.main_company_id AND r.group_id=a.group_id
      WHERE a.main_company_id=? AND a.employee_id=? AND COALESCE(g.active,1)=1
      LIMIT 1`, [company, employeeId]) || {};
    return {
      workDays: parseWorkDays(groupRule.work_days_json || companyRule.work_days_json, fallbackWork),
      restDays: parseWorkDays(groupRule.weekly_rest_days_json || companyRule.weekly_rest_days_json, fallbackRest),
    };
  } catch {
    return { workDays: fallbackWork, restDays: fallbackRest };
  }
}

async function closeBlocking(c: Context<AppEnv>, company: string, year: number, month: number) {
  const { start, end } = periodDates(year, month);
  const people = await all(c, `SELECT e.id,e.code,e.full_name,e.hire_date,s.exit_date,s.card_no
    FROM hr_monthly_employees e JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=? AND UPPER(TRIM(COALESCE(e.sgk_status,'')))='VAR' AND TRIM(COALESCE(s.card_no,''))<>''`, [company]);
  const holidays = new Set((await officialHolidayRows(c, company, start, end)).filter((row) => !row.halfDay).map((row) => row.date));
  const events = await all(c, "SELECT employee_id,work_date,event_time FROM ik_time_clock_events WHERE main_company_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date,event_time", [company, start, end]);
  const overrides = await all(c, "SELECT employee_id,work_date,status,manual_in,manual_out FROM ik_attendance_day_overrides WHERE main_company_id=? AND work_date BETWEEN ? AND ?", [company, start, end]);
  const eventCount = new Map<string, number>();
  for (const row of events) {
    const key = `${text(row.employee_id)}|${dateOnly(row.work_date)}`;
    eventCount.set(key, (eventCount.get(key) || 0) + 1);
  }
  const overrideMap = new Map(overrides.map((row) => [`${text(row.employee_id)}|${dateOnly(row.work_date)}`, row]));
  const leaveMap = new Set<string>();
  if (await tableExists(c, "ik_leave_plans")) {
    const leaves = await all(c, "SELECT employee_id,start_date,end_date FROM ik_leave_plans WHERE main_company_id=? AND status<>'CANCELLED' AND start_date<=? AND end_date>=?", [company, end, start]);
    for (const leave of leaves) {
      const leaveStart = dateOnly(leave.start_date) < start ? start : dateOnly(leave.start_date);
      const leaveEnd = dateOnly(leave.end_date) > end ? end : dateOnly(leave.end_date);
      for (const date of eachDate(leaveStart, leaveEnd)) leaveMap.add(`${text(leave.employee_id)}|${date}`);
    }
  }
  const missing: Row[] = [];
  let checks = 0;
  for (const person of people) {
    const calendar = await workCalendarForPerson(c, company, text(person.id));
    for (const date of eachDate(start, end)) {
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (!calendar.workDays.includes(day) || calendar.restDays.includes(day) || holidays.has(date)) continue;
      if (dateOnly(person.hire_date) && date < dateOnly(person.hire_date)) continue;
      if (dateOnly(person.exit_date) && date > dateOnly(person.exit_date)) continue;
      const key = `${text(person.id)}|${date}`;
      if (leaveMap.has(key)) continue;
      checks += 1;
      const override = overrideMap.get(key);
      const status = upper(override?.status);
      if (["IZIN", "YILLIK_IZIN", "RESMI_TATIL", "HAFTA_SONU", "DONEM_DISI"].includes(status)) continue;
      const manualPair = Boolean(text(override?.manual_in) && text(override?.manual_out));
      if (manualPair || (eventCount.get(key) || 0) >= 2) continue;
      missing.push({ employeeId: text(person.id), personnelCode: text(person.code), fullName: text(person.full_name), date, eventCount: eventCount.get(key) || 0, status: status || "KART_YOK" });
    }
  }
  return { checks, missing };
}

async function periodClose(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const result = await requireFull(c, body);
  if (result.response) return result.response;
  const { auth } = result;
  const year = Math.trunc(number(body.year));
  const month = Math.trunc(number(body.month));
  if (year < 2020 || month < 1 || month > 12) return error(c, 400, "PERIOD_REQUIRED", "Geçerli yıl ve ay zorunludur.");
  if (!(await tableExists(c, "ik_monthly_close"))) return error(c, 500, "PDKS_SCHEMA_MISSING", "Dönem kapanış tablosu hazır değil.");
  const lock = body.lock !== false;
  if (lock) {
    const current = currentPeriodIstanbul();
    if (year > current.year || (year === current.year && month >= current.month)) {
      return error(c, 409, "PDKS_PERIOD_NOT_FINISHED", "İçinde bulunulan veya gelecek ay kapatılamaz.");
    }
  }
  let blocking = { checks: 0, missing: [] as Row[] };
  if (lock) {
    blocking = await closeBlocking(c, auth.company, year, month);
    if (blocking.missing.length) {
      return ok(c, {
        year, month, blockingCount: blocking.missing.length,
        okCount: Math.max(0, blocking.checks - blocking.missing.length), totalChecks: blocking.checks,
        isLocked: false, missing: blocking.missing.slice(0, 100),
      });
    }
  }
  const existing = await first(c, "SELECT * FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1", [auth.company, year, month]);
  const id = text(existing?.id || crypto.randomUUID());
  const timestamp = nowIso();
  await c.env.DB.prepare(`INSERT INTO ik_monthly_close
    (id,main_company_id,period_year,period_month,is_locked,locked_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(main_company_id,period_year,period_month) DO UPDATE SET
      is_locked=excluded.is_locked,locked_at=excluded.locked_at,updated_at=excluded.updated_at`)
    .bind(id, auth.company, year, month, lock ? 1 : 0, lock ? timestamp : null, text(existing?.created_at || timestamp), timestamp).run();
  if (await tableExists(c, "ik_monthly_close_logs")) {
    try {
      await c.env.DB.prepare(`INSERT INTO ik_monthly_close_logs
        (id,main_company_id,period_year,period_month,action,reason,old_json,new_json,user_name,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), auth.company, year, month, lock ? "LOCK" : "UNLOCK", text(body.reason),
          JSON.stringify(existing || {}), JSON.stringify({ isLocked: lock }), text(auth.user.username), timestamp).run();
    } catch {}
  }
  await writeAudit(c, auth.company, "", `${year}-${String(month).padStart(2, "0")}`, lock ? "PDKS_DONEM_KAPAT" : "PDKS_DONEM_AC",
    existing || {}, { isLocked: lock }, text(body.reason), text(auth.user.username));
  return ok(c, { year, month, blockingCount: 0, okCount: blocking.checks, totalChecks: blocking.checks, isLocked: lock });
}

async function monthOverview(c: Context<AppEnv>) {
  const result = await requireFull(c);
  if (result.response) return result.response;
  const { auth } = result;
  const year = Math.trunc(number(c.req.query("year"))) || new Date().getFullYear();
  const month = Math.trunc(number(c.req.query("month"))) || new Date().getMonth() + 1;
  const adjustments = await adjustmentRows(c, auth.company, year, month);
  let close: Row = {};
  if (await tableExists(c, "ik_monthly_close")) {
    close = await first(c, "SELECT * FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1", [auth.company, year, month]) || {};
  }
  return ok(c, { year, month, adjustments, close: { isLocked: Number(close.is_locked || 0) !== 0, lockedAt: close.locked_at || null } });
}

export function registerIkPdksOperationRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/personnel-control/operations/month", monthOverview);
  app.get("/api/ik/personnel-control/operations/leaves", async (c) => {
    const result = await requireFull(c);
    if (result.response) return result.response;
    return ok(c, { plans: await leaveRows(c, result.auth.company, dateOnly(c.req.query("from")), dateOnly(c.req.query("to"))) });
  });
  app.post("/api/ik/personnel-control/operations/leave", saveLeave);
  app.post("/api/ik/personnel-control/operations/advance", saveAdvance);
  app.get("/api/ik/personnel-control/operations/payroll", payroll);
  app.get("/api/ik/personnel-control/operations/holidays", async (c) => {
    const result = await requireFull(c);
    if (result.response) return result.response;
    const year = Math.trunc(number(c.req.query("year"))) || new Date().getFullYear();
    return ok(c, await officialHolidayRows(c, result.auth.company, `${year}-01-01`, `${year}-12-31`));
  });
  app.post("/api/ik/personnel-control/operations/holidays", saveHoliday);
  app.get("/api/ik/personnel-control/operations/audit-logs", auditLogs);
  app.post("/api/ik/personnel-control/operations/period-close", periodClose);
}
