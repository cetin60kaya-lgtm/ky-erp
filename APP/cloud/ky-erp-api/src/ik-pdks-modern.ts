// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { ensurePdksPolicySchema, readCompanyPdksPolicy, resolveEmployeePdksPolicy, saveCompanyPdksPolicy } from "./ik-pdks-policy";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const DEFAULT_COMPANY = "mecit-hakan";
const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const dateOnly = (value: unknown) => text(value).slice(0, 10);
const clamp = (value: unknown, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Math.round(num(value, fallback))));

const LEAVE_TYPES = [
  ["YILLIK_IZIN", "Yıllık İzin", "ANNUAL", "DAY", 1, 1, null, 0, "4857 yıllık ücretli izin; hafta tatili ve resmî tatiller yıllık izinden sayılmaz."],
  ["EVLILIK", "Evlilik İzni", "EXCUSE", "DAY", 1, 0, 3, 1, "Kanuni ücretli mazeret izni: 3 gün."],
  ["EVLAT_EDINME", "Evlat Edinme İzni", "EXCUSE", "DAY", 1, 0, 3, 1, "Kanuni ücretli mazeret izni: 3 gün."],
  ["OLUM", "Ölüm İzni", "EXCUSE", "DAY", 1, 0, 3, 1, "Anne, baba, eş, kardeş veya çocuk ölümü için kanuni ücretli izin."],
  ["BABALIK", "Eş Doğum / Babalık İzni", "EXCUSE", "DAY", 1, 0, 5, 1, "Eşin doğum yapması halinde kanuni ücretli izin: 5 gün."],
  ["DOGUM", "Doğum / Analık İzni", "MATERNITY", "DAY", 1, 0, null, 1, "Kural ve sağlık raporu ile yönetilir."],
  ["RAPOR", "Sağlık Raporu / İstirahat", "MEDICAL", "DAY", 1, 0, null, 1, "Sağlık raporu belge numarası ile izlenir."],
  ["UCRETSIZ", "Ücretsiz İzin", "UNPAID", "DAY", 0, 0, null, 0, "Ücretsiz izin; yıllık izin bakiyesini azaltmaz."],
  ["SUT", "Süt İzni", "PARENTAL", "HOUR", 1, 0, null, 0, "Çocuk bir yaşına gelene kadar günlük toplam 1,5 saat."],
  ["DOGUM_SONRASI_YARIM", "Doğum Sonrası Yarım Çalışma", "PARENTAL", "HALF_DAY", 1, 0, null, 1, "Doğum sonrası kanuni yarım çalışma süreci."],
  ["ENGELLI_COCUK_TEDAVI", "Engelli / Kronik Hasta Çocuk Tedavi İzni", "EXCUSE", "DAY", 1, 0, 10, 1, "Şartları sağlandığında yılda 10 güne kadar ücretli izin."],
  ["YOL_IZNI", "Yol İzni", "UNPAID", "DAY", 0, 0, 4, 0, "Yıllık izin kullanımında talep ve mesafe şartına göre ücretsiz yol izni."],
  ["MAZERET", "Mazeret İzni", "EXCUSE", "DAY", 1, 0, null, 0, "Şirket veya yasal mazeret kaydı."],
  ["IDARI", "İdari İzin", "ADMIN", "DAY", 1, 0, null, 0, "Şirket tarafından tanımlanan idari izin."],
];

const HOLIDAYS_2026: Record<string, { name: string; nonWorkFraction: number }> = {
  "2026-01-01": { name: "Yılbaşı", nonWorkFraction: 1 },
  "2026-03-19": { name: "Ramazan Bayramı Arifesi", nonWorkFraction: 0.5 },
  "2026-03-20": { name: "Ramazan Bayramı 1. Gün", nonWorkFraction: 1 },
  "2026-03-21": { name: "Ramazan Bayramı 2. Gün", nonWorkFraction: 1 },
  "2026-03-22": { name: "Ramazan Bayramı 3. Gün", nonWorkFraction: 1 },
  "2026-04-23": { name: "Ulusal Egemenlik ve Çocuk Bayramı", nonWorkFraction: 1 },
  "2026-05-01": { name: "Emek ve Dayanışma Günü", nonWorkFraction: 1 },
  "2026-05-19": { name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", nonWorkFraction: 1 },
  "2026-05-26": { name: "Kurban Bayramı Arifesi", nonWorkFraction: 0.5 },
  "2026-05-27": { name: "Kurban Bayramı 1. Gün", nonWorkFraction: 1 },
  "2026-05-28": { name: "Kurban Bayramı 2. Gün", nonWorkFraction: 1 },
  "2026-05-29": { name: "Kurban Bayramı 3. Gün", nonWorkFraction: 1 },
  "2026-05-30": { name: "Kurban Bayramı 4. Gün", nonWorkFraction: 1 },
  "2026-07-15": { name: "Demokrasi ve Millî Birlik Günü", nonWorkFraction: 1 },
  "2026-08-30": { name: "Zafer Bayramı", nonWorkFraction: 1 },
  "2026-10-28": { name: "Cumhuriyet Bayramı Arifesi", nonWorkFraction: 0.5 },
  "2026-10-29": { name: "Cumhuriyet Bayramı", nonWorkFraction: 1 },
};

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try { const value = await c.req.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
  catch { return {}; }
}
function ok(c: Context<AppEnv>, data: unknown, status = 200) { return c.json({ ok: true, success: true, data }, status as any); }
function fail(c: Context<AppEnv>, status: number, code: string, message: string) { return c.json({ ok: false, success: false, error: { code, message } }, status as any); }
async function all(c: Context<AppEnv>, sql: string, values: unknown[] = []) { const result = await c.env.DB.prepare(sql).bind(...values).all<Row>(); return result.results || []; }
async function first(c: Context<AppEnv>, sql: string, values: unknown[] = []) { return c.env.DB.prepare(sql).bind(...values).first<Row>(); }

function companyOf(c: Context<AppEnv>, user: Row, body: Row = {}) {
  return text(c.req.header("X-KYERP-Tenant-Slug") || body.mainCompanyId || body.mainCompanySlug || c.req.query("mainCompanyId") || c.req.query("mainCompanySlug") || user.mainCompanySlug || user.security?.main_company_slug || DEFAULT_COMPANY).toLocaleLowerCase("tr-TR");
}
async function authContext(c: Context<AppEnv>, body: Row = {}) {
  const user = await getAuthenticatedUser(c) as Row | null;
  if (!user) return null;
  const company = companyOf(c, user, body);
  let audit = upper(user.role) === "DENETIM" || text(user.username).toLocaleLowerCase("tr-TR") === "denetim";
  if (!audit) {
    try { const row = await first(c, "SELECT scope FROM ik_user_hr_scope WHERE user_id=? AND main_company_id=? LIMIT 1", [user.id, company]); audit = upper(row?.scope) === "AUDIT"; }
    catch {}
  }
  return { user, company, audit };
}

async function ensureSchema(c: Context<AppEnv>) {
  await c.env.DB.batch([
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_rule_profiles(main_company_id TEXT PRIMARY KEY,work_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',weekly_rest_days_json TEXT NOT NULL DEFAULT '[0]',annual_leave_counted_weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',break_minutes INTEGER NOT NULL DEFAULT 60,overtime_min_minutes INTEGER NOT NULL DEFAULT 15,overtime_round_minutes INTEGER NOT NULL DEFAULT 15,duplicate_punch_window_seconds INTEGER NOT NULL DEFAULT 60,half_day_minutes INTEGER NOT NULL DEFAULT 240,max_daily_minutes INTEGER NOT NULL DEFAULT 660,max_weekly_minutes INTEGER NOT NULL DEFAULT 2700,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_leave_types(id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'OTHER',unit TEXT NOT NULL DEFAULT 'DAY',paid INTEGER NOT NULL DEFAULT 1,annual_balance_effect INTEGER NOT NULL DEFAULT 0,default_days REAL,requires_document INTEGER NOT NULL DEFAULT 0,legal_note TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(main_company_id,code))`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_leave_plan_days(id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,leave_plan_id TEXT NOT NULL,employee_id TEXT NOT NULL,work_date TEXT NOT NULL,leave_type_code TEXT NOT NULL DEFAULT '',leave_fraction REAL NOT NULL DEFAULT 1,counted_fraction REAL NOT NULL DEFAULT 1,day_part TEXT NOT NULL DEFAULT 'FULL',reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(main_company_id,leave_plan_id,work_date))`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_correction_logs(id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,employee_id TEXT NOT NULL,work_date TEXT NOT NULL,old_json TEXT NOT NULL DEFAULT '{}',new_json TEXT NOT NULL DEFAULT '{}',reason TEXT NOT NULL DEFAULT '',actor_user_id TEXT NOT NULL DEFAULT '',actor_name TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_leave_entitlement_ledger(id TEXT PRIMARY KEY,main_company_id TEXT NOT NULL,employee_id TEXT NOT NULL,service_year INTEGER NOT NULL,entitlement_date TEXT NOT NULL,entitlement_days REAL NOT NULL DEFAULT 0,source TEXT NOT NULL DEFAULT 'AUTO_STATUTORY',note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(main_company_id,employee_id,service_year))`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_group_rules(main_company_id TEXT NOT NULL,group_id TEXT NOT NULL,work_days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',weekly_rest_days_json TEXT NOT NULL DEFAULT '[0]',break_minutes INTEGER NOT NULL DEFAULT 60,overtime_min_minutes INTEGER NOT NULL DEFAULT 15,overtime_round_minutes INTEGER NOT NULL DEFAULT 15,duplicate_punch_window_seconds INTEGER NOT NULL DEFAULT 60,half_day_minutes INTEGER NOT NULL DEFAULT 240,max_daily_minutes INTEGER NOT NULL DEFAULT 660,max_weekly_minutes INTEGER NOT NULL DEFAULT 2700,cross_midnight INTEGER NOT NULL DEFAULT 0,flexible INTEGER NOT NULL DEFAULT 0,flexible_start TEXT NOT NULL DEFAULT '',flexible_end TEXT NOT NULL DEFAULT '',night_shift INTEGER NOT NULL DEFAULT 0,overtime_requires_approval INTEGER NOT NULL DEFAULT 0,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(main_company_id,group_id))`),
    c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS ik_pdks_department_groups(main_company_id TEXT NOT NULL,department TEXT NOT NULL,group_id TEXT NOT NULL,updated_by TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(main_company_id,department))`),
  ]);
}

async function seedCompany(c: Context<AppEnv>, company: string) {
  await ensureSchema(c);
  await ensurePdksPolicySchema(c);
  const statements = LEAVE_TYPES.map((row) => c.env.DB.prepare(`INSERT OR IGNORE INTO ik_pdks_leave_types(id,main_company_id,code,name,category,unit,paid,annual_balance_effect,default_days,requires_document,legal_note,active,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,'SYSTEM',?)`)
    .bind(`${company}:${row[0]}`, company, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], nowIso()));
  if (statements.length) await c.env.DB.batch(statements);
}

function parseDays(value: unknown, fallback: number[]) {
  try { const rows = JSON.parse(text(value)); return Array.isArray(rows) ? [...new Set(rows.map(Number).filter((v) => v >= 0 && v <= 6))] : fallback; }
  catch { return fallback; }
}
function dateParts(value: string) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null; }
function weekday(value: string) { const p = dateParts(value); return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : -1; }
function addDays(value: string, amount: number) { const p = dateParts(value); if (!p) return ""; return new Date(Date.UTC(p.y, p.m - 1, p.d + amount)).toISOString().slice(0, 10); }
function monthDays(year: number, month: number) { const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); return Array.from({ length: last }, (_, i) => `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`); }
function minutesOf(value: unknown) { const m = /^(\d{1,2}):(\d{2})$/.exec(text(value).slice(0, 5)); if (!m) return null; const h = Number(m[1]), n = Number(m[2]); return h <= 23 && n <= 59 ? h * 60 + n : null; }
function timeDiff(start: number | null, end: number | null, cross = false) { if (start === null || end === null) return 0; let diff = end - start; if (cross && diff < 0) diff += 1440; return Math.max(0, diff); }
function todayTr() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function roundOvertime(value: number, minMinutes: number, step: number) { if (value < minMinutes) return 0; if (step <= 1) return value; return Math.floor(value / step) * step; }

async function holidayMap(c: Context<AppEnv>, company: string, start: string, end: string) {
  const map = new Map<string, Row>();
  Object.entries(HOLIDAYS_2026).forEach(([date, info]) => { if (date >= start && date <= end) map.set(date, { date, ...info, source: "TR_2026" }); });
  try {
    const rows = await all(c, `SELECT data FROM json_store WHERE scope='IK_OFFICIAL_HOLIDAY' AND (main_company_slug=? OR main_company_slug IS NULL)`, [company]);
    for (const row of rows) {
      try {
        const data = JSON.parse(text(row.data) || "{}");
        const date = dateOnly(data.date || data.startDate);
        if (!date || date < start || date > end) continue;
        const half = data.halfDay === true || data.half_day === true || Number(data.halfDay || data.half_day || 0) === 1;
        map.set(date, { date, name: text(data.name || data.title) || "Resmî Tatil", nonWorkFraction: half ? 0.5 : 1, source: "D1" });
      } catch {}
    }
  } catch {}
  return map;
}

async function personRow(c: Context<AppEnv>, company: string, employeeId: string) {
  return first(c, `SELECT e.id,e.code,e.full_name,e.department,e.title,e.hire_date,e.status,e.sgk_status,e.annual_leave_entitlement,e.annual_leave_carryover,s.card_no,s.exit_date
    FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.main_company_id=? AND e.id=? LIMIT 1`, [company, employeeId]);
}

async function auditSgkVisible(c: Context<AppEnv>, company: string, person: Row, year: number, month: number) {
  if (!text(person.card_no)) return false;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  try {
    const row = await first(c, "SELECT sgk_covered FROM ik_person_monthly_compliance WHERE main_company_id=? AND employee_id=? AND period=? LIMIT 1", [company, text(person.id), period]);
    if (row) return Number(row.sgk_covered || 0) === 1;
  } catch {}
  return upper(person.sgk_status || "VAR") !== "YOK";
}

async function resolveSchedule(c: Context<AppEnv>, company: string, person: Row) {
  await seedCompany(c, company);
  const policy = await resolveEmployeePdksPolicy(c, company, text(person.id));
  const preferredShiftId = text(policy.defaultShiftId);
  const group = await first(c, `SELECT g.*,r.work_days_json AS r_work_days_json,r.weekly_rest_days_json AS r_rest_days_json,r.break_minutes AS r_break_minutes,r.overtime_min_minutes AS r_ot_min,r.overtime_round_minutes AS r_ot_round,r.duplicate_punch_window_seconds AS r_dup,r.half_day_minutes AS r_half,r.max_daily_minutes AS r_daily,r.max_weekly_minutes AS r_weekly,r.cross_midnight AS r_cross,r.flexible AS r_flexible,r.flexible_start AS r_flex_start,r.flexible_end AS r_flex_end,r.night_shift AS r_night,r.overtime_requires_approval AS r_ot_approval
    FROM ik_pdks_work_groups g
    LEFT JOIN ik_pdks_group_rules r ON r.main_company_id=g.main_company_id AND r.group_id=g.id
    WHERE g.main_company_id=? AND g.id=COALESCE(
      (SELECT group_id FROM ik_pdks_employee_groups WHERE main_company_id=? AND employee_id=? LIMIT 1),
      NULLIF(?,''),
      (SELECT group_id FROM ik_pdks_department_groups WHERE main_company_id=? AND department=? LIMIT 1),
      (SELECT id FROM ik_pdks_work_groups WHERE main_company_id=? AND UPPER(code)='NORMAL' LIMIT 1)
    ) LIMIT 1`, [company, company, person.id, preferredShiftId, company, text(person.department), company]) || {};
  const shiftWorkDays = parseDays(group.r_work_days_json, []);
  const shiftRestDays = parseDays(group.r_rest_days_json, []);
  const workDays = policy.hasWorkDaysOverride ? policy.workDays : (shiftWorkDays.length ? shiftWorkDays : policy.workDays);
  const restDays = policy.hasRestDaysOverride ? policy.restDays : (shiftRestDays.length ? shiftRestDays : policy.restDays);
  const overtimeMode = upper(policy.overtimeMode || (policy.overtimeEnabled ? 'AUTO' : 'DISABLED'));
  const nightMode = upper(policy.nightShiftMode || (policy.nightShiftEnabled ? 'ENABLED' : 'DISABLED'));
  return {
    groupId: text(group.id), groupCode: text(group.code) || "NORMAL", groupName: text(group.name) || "Normal Mesai",
    personnelGroup: policy.personnelGroup, personOverride: Boolean(policy.personOverride),
    profileConfigured: Boolean(policy.configured), profileName: text(policy.profileName), policyVersion: num(policy.policyVersion),
    attendanceMode: upper(policy.attendanceMode) || "STRICT_CARD", requirePunch: Boolean(policy.requirePunch), showDailyPunchDetail: Boolean(policy.showDailyPunchDetail),
    lateEarlyEffect: upper(policy.lateEarlyEffect) || "TRACK_ONLY", missingPunchPolicy: upper(policy.missingPunchPolicy) || "REQUIRE_MANUAL",
    normalCreditMode: upper(policy.normalCreditMode) || "UNCONFIGURED", payrollMonthlyMinutes: policy.payrollMonthlyMinutes ?? null, fixedDailyMinutes: policy.fixedDailyMinutes ?? null, resolvedDailyCreditMinutes: policy.resolvedDailyCreditMinutes ?? null, contractWeeklyMinutes: policy.contractWeeklyMinutes ?? null,
    overtimeMode, overtimeEnabled: overtimeMode !== "DISABLED", nightShiftMode: nightMode, nightShiftEnabled: nightMode !== "DISABLED",
    entryTime: text(group.entry_time) || "08:30", exitTime: text(group.exit_time) || "19:00",
    lateTolerance: num(group.late_tolerance, 5), earlyTolerance: num(group.early_tolerance, 10),
    workDays, restDays, annualCountDays: policy.annualCountDays || [],
    breakMinutes: num(group.r_break_minutes ?? policy.breakMinutes, 0),
    overtimeMin: num(group.r_ot_min ?? policy.overtimeMin, 0), overtimeRound: Math.max(1, num(group.r_ot_round ?? policy.overtimeRound, 1)),
    duplicateWindow: num(group.r_dup ?? policy.duplicateWindow, 0), halfDayMinutes: num(group.r_half ?? policy.halfDayMinutes, 0),
    maxDailyMinutes: num(group.r_daily ?? policy.maxDailyMinutes, 0), maxWeeklyMinutes: num(group.r_weekly ?? policy.maxWeeklyMinutes, 0),
    crossMidnight: Number(group.r_cross || 0) !== 0, flexible: Number(group.r_flexible || 0) !== 0,
    flexibleStart: text(group.r_flex_start), flexibleEnd: text(group.r_flex_end), nightShift: Number(group.r_night || 0) !== 0,
    overtimeRequiresApproval: overtimeMode === "APPROVAL" || Number(group.r_ot_approval || 0) !== 0,
  };
}

async function leaveDayMap(c: Context<AppEnv>, company: string, employeeId: string, start: string, end: string) {
  const map = new Map<string, Row>();
  try {
    const rows = await all(c, `SELECT d.*,p.record_type,p.status,p.note,t.paid AS leave_paid,t.category AS leave_category FROM ik_leave_plan_days d JOIN ik_leave_plans p ON p.id=d.leave_plan_id LEFT JOIN ik_pdks_leave_types t ON t.main_company_id=d.main_company_id AND t.code=d.leave_type_code WHERE d.main_company_id=? AND d.employee_id=? AND d.work_date BETWEEN ? AND ? AND UPPER(COALESCE(p.status,''))<>'CANCELLED'`, [company, employeeId, start, end]);
    rows.forEach((row) => map.set(dateOnly(row.work_date), row));
  } catch {}
  try {
    const spans = await all(c, `SELECT id,record_type,start_date,end_date,counted_days,status,note FROM ik_leave_plans WHERE main_company_id=? AND employee_id=? AND start_date<=? AND end_date>=? AND UPPER(COALESCE(status,''))<>'CANCELLED'`, [company, employeeId, end, start]);
    for (const span of spans) {
      for (let date = dateOnly(span.start_date); date && date <= dateOnly(span.end_date); date = addDays(date, 1)) {
        if (date < start || date > end || map.has(date)) continue;
        const annual = upper(span.record_type).includes("YILLIK");
        map.set(date, { leave_plan_id: span.id, work_date: date, leave_type_code: annual ? "YILLIK_IZIN" : "MAZERET", leave_fraction: 1, counted_fraction: annual ? 1 : 0, day_part: "FULL", reason: "Eski izin planından", record_type: span.record_type, status: span.status, note: span.note });
      }
    }
  } catch {}
  return map;
}

function duplicateCount(times: string[], seconds: number) {
  let count = 0;
  for (let i = 1; i < times.length; i += 1) {
    const a = minutesOf(times[i - 1]), b = minutesOf(times[i]);
    if (a !== null && b !== null && Math.abs(b - a) * 60 <= seconds) count += 1;
  }
  return count;
}

async function attendanceV2(c: Context<AppEnv>, auth: Row, employeeId: string, year: number, month: number) {
  const person = await personRow(c, auth.company, employeeId);
  if (!person) return null;
  if (auth.audit && !(await auditSgkVisible(c, auth.company, person, year, month))) return null;
  const dates = monthDays(year, month), start = dates[0], end = dates[dates.length - 1];
  const schedule = await resolveSchedule(c, auth.company, person);
  const [events, overrides, holidays, leaves, overtimeApprovals] = await Promise.all([
    all(c, `SELECT id,work_date,event_time,direction,source,note,created_at FROM ik_time_clock_events WHERE main_company_id=? AND employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date,event_time`, [auth.company, employeeId, start, end]),
    all(c, `SELECT * FROM ik_attendance_day_overrides WHERE main_company_id=? AND employee_id=? AND work_date BETWEEN ? AND ?`, [auth.company, employeeId, start, end]),
    holidayMap(c, auth.company, start, end), leaveDayMap(c, auth.company, employeeId, start, end),
  ]);
  const byDate = new Map<string, Row[]>(); events.forEach((row) => { const key = dateOnly(row.work_date); const list = byDate.get(key) || []; list.push(row); byDate.set(key, list); });
  const overrideMap = new Map(overrides.map((row) => [dateOnly(row.work_date), row]));
  const overtimeApprovalMap = new Map(overtimeApprovals.map((row) => [dateOnly(row.work_date), num(row.approved_minutes)]));
  const expectedIn = minutesOf(schedule.entryTime), expectedOut = minutesOf(schedule.exitTime);
  const scheduledSpan = Math.max(0, timeDiff(expectedIn, expectedOut, schedule.crossMidnight) - schedule.breakMinutes);
  const today = todayTr();
  const days = dates.map((date) => {
    const wd = weekday(date), dayEvents = byDate.get(date) || [], override = overrideMap.get(date), holiday = holidays.get(date), leave = leaves.get(date);
    const times = dayEvents.map((row) => text(row.event_time).slice(0,5)).filter(Boolean).sort();
    const entry = text(override?.manual_in) || times[0] || "";
    const exit = text(override?.manual_out) || (times.length > 1 ? times[times.length - 1] : "");
    const inMin = minutesOf(entry), outMin = minutesOf(exit);
    const outside = (dateOnly(person.hire_date) && date < dateOnly(person.hire_date)) || (dateOnly(person.exit_date) && date > dateOnly(person.exit_date));
    const future = date > today;
    const isRest = schedule.restDays.includes(wd) || (!schedule.workDays.includes(wd) && !holiday);
    const leaveFraction = num(leave?.leave_fraction, 0), holidayFraction = num(holiday?.nonWorkFraction, 0);
    let status = upper(override?.status);
    if (!status || status === "AUTO") {
      if (outside || future) status = "DONEM_DISI";
      else if (leave && leaveFraction >= 1) status = upper(leave.leave_type_code) || (upper(leave.record_type).includes("YILLIK") ? "YILLIK_IZIN" : "IZIN");
      else if (leave && leaveFraction > 0) status = "YARIM_GUN_IZIN";
      else if (holidayFraction >= 1 && times.length >= 2) status = "RESMI_TATIL_CALISMA";
      else if (holidayFraction >= 1) status = "RESMI_TATIL";
      else if (isRest && times.length >= 2) status = "HAFTA_TATILI_CALISMA";
      else if (isRest) status = "HAFTA_TATILI";
      else if (holidayFraction === 0.5 && !times.length) status = "YARIM_GUN_TATIL";
      else if (!times.length) status = "KART_YOK";
      else if (times.length === 1) status = "EKSIK_BASIM";
      else status = holidayFraction === 0.5 ? "YARIM_GUN_TATIL_CALISMA" : "CALISTI";
    }
    const rawLate = inMin === null || expectedIn === null ? 0 : Math.max(0, inMin - expectedIn - schedule.lateTolerance);
    const rawEarly = outMin === null || expectedOut === null ? 0 : Math.max(0, expectedOut - outMin - schedule.earlyTolerance);
    const workedMinutes = Math.max(0, timeDiff(inMin, outMin, schedule.crossMidnight) - (inMin !== null && outMin !== null ? schedule.breakMinutes : 0));
    const overtimeRaw = Math.max(0, workedMinutes - scheduledSpan);
    const calculatedOvertime = schedule.overtimeEnabled ? roundOvertime(overtimeRaw, schedule.overtimeMin, schedule.overtimeRound) : 0;
    const approvedOvertime = overtimeApprovalMap.get(date);
    const overtime = override?.overtime_minutes ?? (schedule.overtimeRequiresApproval ? (approvedOvertime ?? 0) : calculatedOvertime);
    const late = override?.late_minutes ?? (schedule.lateEarlyEffect === "IGNORE" ? 0 : rawLate);
    const early = override?.early_minutes ?? (schedule.lateEarlyEffect === "IGNORE" ? 0 : rawEarly);
    const scheduledWorkday = schedule.workDays.includes(wd) && !schedule.restDays.includes(wd) && holidayFraction < 1;
    let normalReferenceMinutes = 0;
    if (schedule.profileConfigured && !outside) {
      if (schedule.normalCreditMode === "MONTHLY_DIV_30") normalReferenceMinutes = num(schedule.resolvedDailyCreditMinutes);
      else if (schedule.normalCreditMode === "MONTHLY_WORKDAYS" && scheduledWorkday) normalReferenceMinutes = num(monthlyWorkdayCredit);
      else if (schedule.normalCreditMode === "FIXED_DAILY" && scheduledWorkday) normalReferenceMinutes = num(schedule.fixedDailyMinutes);
      else if (schedule.normalCreditMode === "ACTUAL") normalReferenceMinutes = workedMinutes;
    }
    const unpaidLeave = Boolean(leave && (Number(leave.leave_paid) === 0 || upper(leave.leave_type_code) === "UCRETSIZ"));
    const punchProblem = ["KART_YOK","EKSIK_BASIM"].includes(status);
    let deductionMinutes = 0; let payrollBlocked = false;
    if (unpaidLeave) deductionMinutes = normalReferenceMinutes;
    else if (punchProblem && schedule.requirePunch) {
      if (schedule.missingPunchPolicy === "ZERO_CREDIT") deductionMinutes = normalReferenceMinutes;
      else if (schedule.missingPunchPolicy === "REQUIRE_MANUAL") { deductionMinutes = normalReferenceMinutes; payrollBlocked = true; }
    }
    if (!deductionMinutes && schedule.lateEarlyEffect === "DEDUCT_CREDIT" && scheduledWorkday && ["CALISTI","EKSIK_BASIM","YARIM_GUN_TATIL_CALISMA"].includes(status)) deductionMinutes = Math.min(normalReferenceMinutes, num(late) + num(early));
    const normalPayableMinutes = Math.max(0, normalReferenceMinutes - deductionMinutes);
    return {
      date, weekday: wd, status, entry, exit, eventCount: times.length, duplicatePunches: duplicateCount(times, schedule.duplicateWindow),
      lateMinutes: num(late), earlyMinutes: num(early), rawLateMinutes: rawLate, rawEarlyMinutes: rawEarly, overtimeMinutes: num(overtime), calculatedOvertimeMinutes: calculatedOvertime, pendingOvertimeApprovalMinutes: schedule.overtimeRequiresApproval && approvedOvertime === undefined ? calculatedOvertime : 0, workedMinutes,
      normalReferenceMinutes, normalPayableMinutes, deductionMinutes, payrollBlocked,
      missingPunch: Boolean(override?.missing_punch) || status === "EKSIK_BASIM", leaveFraction, countedLeaveFraction: num(leave?.counted_fraction, 0),
      leaveTypeCode: text(leave?.leave_type_code), dayPart: text(leave?.day_part), holidayName: text(holiday?.name), holidayFraction,
      expectedIn: schedule.entryTime, expectedOut: schedule.exitTime, breakMinutes: schedule.breakMinutes, displayPunchDetail: schedule.showDailyPunchDetail, attendanceMode: schedule.attendanceMode,
      warning: workedMinutes > schedule.maxDailyMinutes ? `Günlük ${schedule.maxDailyMinutes} dk sınırı aşıldı.` : "",
      note: text(override?.note || leave?.note || leave?.reason), source: override ? "MANUAL_OVERRIDE" : "AUTO",
      edited: Boolean(override), manualEntry: Boolean(text(override?.manual_in)), manualExit: Boolean(text(override?.manual_out)),
    };
  });
  const summary = days.reduce((acc: Row, day: Row) => {
    if (["CALISTI","EKSIK_BASIM","RESMI_TATIL_CALISMA","HAFTA_TATILI_CALISMA","YARIM_GUN_TATIL_CALISMA"].includes(day.status)) acc.workedDays += 1;
    if (day.status === "YILLIK_IZIN") acc.annualLeaveDays += day.leaveFraction || 1;
    if (day.status === "YARIM_GUN_IZIN" && day.leaveTypeCode === "YILLIK_IZIN") acc.annualLeaveDays += day.countedLeaveFraction || 0.5;
    if (day.status === "KART_YOK") acc.noPunchDays += 1;
    if (day.status === "EKSIK_BASIM") acc.missingPunchDays += 1;
    if (day.lateMinutes > 0) acc.lateDays += 1;
    acc.lateMinutes += day.lateMinutes; acc.earlyMinutes += day.earlyMinutes; acc.overtimeMinutes += day.overtimeMinutes; acc.workedMinutes += day.workedMinutes; acc.duplicatePunches += day.duplicatePunches; acc.normalReferenceMinutes += day.normalReferenceMinutes; acc.normalDeductionMinutes += day.deductionMinutes; if(day.payrollBlocked) acc.blockedDays += 1;
    return acc;
  }, { workedDays:0, annualLeaveDays:0, noPunchDays:0, missingPunchDays:0, lateDays:0, lateMinutes:0, earlyMinutes:0, overtimeMinutes:0, workedMinutes:0, duplicatePunches:0, normalReferenceMinutes:0, normalDeductionMinutes:0, blockedDays:0 });
  summary.profileConfigured = schedule.profileConfigured; summary.normalCreditMode = schedule.normalCreditMode; summary.payrollBasisMinutes = schedule.payrollMonthlyMinutes; summary.dailyReferenceMinutes = schedule.resolvedDailyCreditMinutes; summary.contractWeeklyMinutes = schedule.contractWeeklyMinutes; summary.actualWorkedMinutes = summary.workedMinutes;
  const monthlyTarget = schedule.normalCreditMode.startsWith("MONTHLY_") ? num(schedule.payrollMonthlyMinutes) : summary.normalReferenceMinutes;
  summary.normalTargetMinutes = monthlyTarget; summary.payableNormalMinutes = Math.max(0, monthlyTarget - summary.normalDeductionMinutes); summary.payrollReady = schedule.profileConfigured && summary.blockedDays === 0;
  return { person: { id: person.id, personnelCode: person.code, fullName: person.full_name, department: person.department, title: person.title, cardNo: person.card_no, startDate: dateOnly(person.hire_date), exitDate: dateOnly(person.exit_date) }, year, month, schedule, summary, days };
}

async function isLocked(c: Context<AppEnv>, company: string, date: string) {
  const m = /^(\d{4})-(\d{2})-/.exec(date); if (!m) return false;
  try { const row = await first(c, "SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1", [company, Number(m[1]), Number(m[2])]); return Number(row?.is_locked || 0) !== 0; }
  catch { return false; }
}

async function annualLeaveUsed(c: Context<AppEnv>, company: string, employeeId: string) {
  const [modernRows, legacyRows] = await Promise.all([
    all(c, `SELECT start_date,end_date,record_type,counted_days AS days FROM ik_leave_plans WHERE main_company_id=? AND employee_id=? AND UPPER(record_type) LIKE '%YILLIK%' AND UPPER(COALESCE(status,''))<>'CANCELLED'`, [company, employeeId]).catch(() => []),
    all(c, `SELECT start_date,end_date,record_type,day_count AS days FROM hr_leave_records_v2 WHERE employee_id=? AND UPPER(record_type) LIKE '%YILLIK%'`, [employeeId]).catch(() => []),
  ]);
  const seen = new Set<string>();
  let used = 0;
  for (const row of [...modernRows, ...legacyRows]) {
    const key = [upper(row.record_type), dateOnly(row.start_date), dateOnly(row.end_date), num(row.days)].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    used += num(row.days);
  }
  return used;
}

async function leavePreview(c: Context<AppEnv>, auth: Row, body: Row) {
  const employeeId = text(body.employeeId), code = upper(body.leaveTypeCode || body.type || "YILLIK_IZIN");
  const person = await personRow(c, auth.company, employeeId); if (!person) throw new Error("Personel bulunamadı.");
  const type = await first(c, `SELECT * FROM ik_pdks_leave_types WHERE main_company_id=? AND code=? AND active=1 LIMIT 1`, [auth.company, code]); if (!type) throw new Error("İzin türü bulunamadı.");
  const start = dateOnly(body.startDate), end = dateOnly(body.endDate || (body.returnDate ? addDays(dateOnly(body.returnDate), -1) : body.startDate));
  if (!start || !end || end < start) throw new Error("Geçerli izin tarih aralığı zorunludur.");
  const schedule = await resolveSchedule(c, auth.company, person), holidays = await holidayMap(c, auth.company, start, end);
  const requestedPart = upper(body.dayPart || "FULL"), requestedFraction = requestedPart === "FULL" ? 1 : 0.5;
  const rows: Row[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const wd = weekday(date), holiday = holidays.get(date), isRest = schedule.restDays.includes(wd) || !schedule.workDays.includes(wd);
    let leaveFraction = requestedFraction, countedFraction = Number(type.annual_balance_effect) !== 0 ? requestedFraction : 0, reason = text(type.name), dayPart = requestedPart;
    if (isRest) { leaveFraction = 0; countedFraction = 0; reason = "Hafta tatili / çalışma dışı gün"; dayPart = "NONE"; }
    else if (holiday?.nonWorkFraction >= 1) { leaveFraction = 0; countedFraction = 0; reason = `${holiday.name} — izinden sayılmaz`; dayPart = "NONE"; }
    else if (holiday?.nonWorkFraction === 0.5 && requestedPart === "FULL") { leaveFraction = 0.5; countedFraction = Number(type.annual_balance_effect) !== 0 ? 0.5 : 0; reason = `${holiday.name} — 0,5 gün resmî tatil + 0,5 gün izin`; dayPart = "MORNING"; }
    else if (Number(type.annual_balance_effect) !== 0 && !schedule.annualCountDays.includes(wd)) { countedFraction = 0; reason = "Yıllık izin sayım günleri dışında"; }
    rows.push({ date, weekday: wd, leaveFraction, countedFraction, dayPart, reason, holidayName: holiday?.name || "" });
  }
  const countedDays = rows.reduce((sum, row) => sum + num(row.countedFraction), 0), leaveDays = rows.reduce((sum, row) => sum + num(row.leaveFraction), 0);
  const used = await annualLeaveUsed(c, auth.company, employeeId);
  const annualAvailable = num(person.annual_leave_entitlement) + num(person.annual_leave_carryover) - used;
  return { employeeId, leaveType: { code: type.code, name: type.name, unit: type.unit, paid: Boolean(type.paid), annualBalanceEffect: Boolean(type.annual_balance_effect), requiresDocument: Boolean(type.requires_document), legalNote: type.legal_note }, startDate: start, endDate: end, returnDate: addDays(end, 1), dayPart: requestedPart, leaveDays, countedDays, annualAvailableBefore: annualAvailable, annualAvailableAfter: Number(type.annual_balance_effect) !== 0 ? annualAvailable - countedDays : annualAvailable, days: rows };
}

async function entitlementLedger(c: Context<AppEnv>, company: string, employeeId: string) {
  const person = await personRow(c, company, employeeId); if (!person) return null;
  const hire = dateOnly(person.hire_date); if (!hire) return { rows: [], warning: "İşe giriş tarihi olmadığı için otomatik hakediş hesaplanamadı." };
  const p = dateParts(hire)!; const today = todayTr(); const rows: Row[] = [];
  for (let serviceYear = 1; serviceYear <= 60; serviceYear += 1) {
    const entitlementDate = `${p.y + serviceYear}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`;
    if (entitlementDate > today) break;
    let days = serviceYear <= 5 ? 14 : serviceYear < 15 ? 20 : 26;
    let age: number | null = null;
    try {
      const dob = await first(c, `SELECT birth_date FROM ik_person_card_settings WHERE main_company_id=? AND employee_id=? LIMIT 1`, [company, employeeId]);
      const bd = dateParts(dateOnly(dob?.birth_date)); if (bd) { age = (p.y + serviceYear) - bd.y - (`${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}` < `${String(bd.m).padStart(2,"0")}-${String(bd.d).padStart(2,"0")}` ? 1 : 0); if (age <= 18 || age >= 50) days = Math.max(days, 20); }
    } catch {}
    await c.env.DB.prepare(`INSERT OR IGNORE INTO ik_pdks_leave_entitlement_ledger(id,main_company_id,employee_id,service_year,entitlement_date,entitlement_days,source,note,created_at) VALUES(?,?,?,?,?,?,?, ?,?)`).bind(crypto.randomUUID(), company, employeeId, serviceYear, entitlementDate, days, "AUTO_STATUTORY", age === null ? "Yaş istisnası için doğum tarihi alanı bulunursa otomatik uygulanır." : `Hakediş yaş: ${age}`, nowIso()).run();
    rows.push({ serviceYear, entitlementDate, entitlementDays: days, age });
  }
  const used = await annualLeaveUsed(c, company, employeeId);
  return { rows, currentCardEntitlement: num(person.annual_leave_entitlement), carryover: num(person.annual_leave_carryover), used, remaining: Math.max(0, num(person.annual_leave_entitlement) + num(person.annual_leave_carryover) - used) };
}

export function registerIkPdksModernRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/personnel-control/modern/config", async (c) => {
    const auth = await authContext(c);
    if (!auth) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    await seedCompany(c, auth.company);
    const profile = await readCompanyPdksPolicy(c, auth.company);
    const groups = await all(c, `SELECT g.id,g.code,g.name,g.entry_time AS entryTime,g.exit_time AS exitTime,g.late_tolerance AS lateTolerance,g.early_tolerance AS earlyTolerance,g.active,r.* FROM ik_pdks_work_groups g LEFT JOIN ik_pdks_group_rules r ON r.main_company_id=g.main_company_id AND r.group_id=g.id WHERE g.main_company_id=? ORDER BY g.active DESC,g.name`, [auth.company]);
    const leaveTypes = await all(c, `SELECT id,code,name,category,unit,paid,annual_balance_effect AS annualBalanceEffect,default_days AS defaultDays,requires_document AS requiresDocument,legal_note AS legalNote,active FROM ik_pdks_leave_types WHERE main_company_id=? ORDER BY active DESC,name`, [auth.company]);
    return ok(c, { audit: auth.audit, profile, groups, leaveTypes });
  });

  app.post("/api/ik/personnel-control/modern/config", async (c) => {
    const body = await bodyOf(c);
    const auth = await authContext(c, body);
    if (!auth) return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı.");
    if (auth.audit) return fail(c,403,"HR_AUDIT_READ_ONLY","Denetim kullanıcısı kural değiştiremez.");
    await seedCompany(c,auth.company);
    try {
      const profile = await saveCompanyPdksPolicy(c, auth.company, body, text(auth.user.username || auth.user.id));
      return ok(c,{saved:true,profile});
    } catch (error) {
      return fail(c,400,"PDKS_POLICY_INVALID",error instanceof Error ? error.message : "Firma PDKS profili kaydedilemedi.");
    }
  });

  app.post("/api/ik/personnel-control/work-groups/:groupId/rules", async (c) => {
    const body=await bodyOf(c),auth=await authContext(c,body); if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı."); if(auth.audit)return fail(c,403,"HR_AUDIT_READ_ONLY","Denetim kullanıcısı vardiya kuralı değiştiremez."); await seedCompany(c,auth.company); const groupId=text(c.req.param("groupId")); const companyPolicy=await readCompanyPdksPolicy(c,auth.company);
    await c.env.DB.prepare(`INSERT INTO ik_pdks_group_rules(main_company_id,group_id,work_days_json,weekly_rest_days_json,break_minutes,overtime_min_minutes,overtime_round_minutes,duplicate_punch_window_seconds,half_day_minutes,max_daily_minutes,max_weekly_minutes,cross_midnight,flexible,flexible_start,flexible_end,night_shift,overtime_requires_approval,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,group_id) DO UPDATE SET work_days_json=excluded.work_days_json,weekly_rest_days_json=excluded.weekly_rest_days_json,break_minutes=excluded.break_minutes,overtime_min_minutes=excluded.overtime_min_minutes,overtime_round_minutes=excluded.overtime_round_minutes,duplicate_punch_window_seconds=excluded.duplicate_punch_window_seconds,half_day_minutes=excluded.half_day_minutes,max_daily_minutes=excluded.max_daily_minutes,max_weekly_minutes=excluded.max_weekly_minutes,cross_midnight=excluded.cross_midnight,flexible=excluded.flexible,flexible_start=excluded.flexible_start,flexible_end=excluded.flexible_end,night_shift=excluded.night_shift,overtime_requires_approval=excluded.overtime_requires_approval,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(auth.company,groupId,JSON.stringify(parseDays(JSON.stringify(body.workDays),companyPolicy.workDays||[])),JSON.stringify(parseDays(JSON.stringify(body.restDays),companyPolicy.restDays||[])),clamp(body.breakMinutes,0,240,60),clamp(body.overtimeMin,0,240,15),clamp(body.overtimeRound,1,120,15),clamp(body.duplicateWindow,0,3600,60),clamp(body.halfDayMinutes,60,600,240),clamp(body.maxDailyMinutes,60,900,660),clamp(body.maxWeeklyMinutes,60,3600,2700),body.crossMidnight?1:0,body.flexible?1:0,text(body.flexibleStart),text(body.flexibleEnd),body.nightShift?1:0,body.overtimeRequiresApproval?1:0,text(auth.user.username),nowIso()).run(); return ok(c,{saved:true,groupId});
  });

  app.get("/api/ik/personnel-control/people/:employeeId/attendance-v2", async (c) => {
    const auth=await authContext(c); if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı."); const year=clamp(c.req.query("year"),2020,2100,new Date().getFullYear()),month=clamp(c.req.query("month"),1,12,new Date().getMonth()+1); const data=await attendanceV2(c,auth,text(c.req.param("employeeId")),year,month); return data?ok(c,data):fail(c,404,"NOT_FOUND","Personel bulunamadı.");
  });

  app.post("/api/ik/personnel-control/leaves/preview-v2", async (c) => {
    const body=await bodyOf(c),auth=await authContext(c,body); if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı."); await seedCompany(c,auth.company); try{return ok(c,await leavePreview(c,auth,body));}catch(error){return fail(c,400,"LEAVE_PREVIEW_INVALID",error?.message||"İzin önizlenemedi.");}
  });

  app.post("/api/ik/personnel-control/leaves/save-v2", async (c) => {
    const body=await bodyOf(c),auth=await authContext(c,body); if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı."); if(auth.audit)return fail(c,403,"HR_AUDIT_READ_ONLY","Denetim kullanıcısı izin kaydedemez."); await seedCompany(c,auth.company); let preview; try{preview=await leavePreview(c,auth,body);}catch(error){return fail(c,400,"LEAVE_INVALID",error?.message||"İzin doğrulanamadı.");}
    if(await isLocked(c,auth.company,preview.startDate))return fail(c,423,"PDKS_PERIOD_LOCKED","İzin başlangıç dönemi kilitli.");
    if(preview.leaveType.requiresDocument&&!text(body.documentNo))return fail(c,400,"LEAVE_DOCUMENT_REQUIRED","Bu izin türü için belge/rapor numarası zorunludur.");
    if(preview.leaveType.annualBalanceEffect&&preview.annualAvailableAfter<0)return fail(c,409,"ANNUAL_LEAVE_BALANCE","Yıllık izin bakiyesi yetersiz.");
    const id=text(body.id)||crypto.randomUUID(),status=upper(body.status)||"APPROVED",recordType=preview.leaveType.name;
    await c.env.DB.prepare(`INSERT INTO ik_leave_plans(id,main_company_id,employee_id,record_type,start_date,end_date,return_date,counted_days,excluded_json,status,document_no,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,auth.company,preview.employeeId,recordType,preview.startDate,preview.endDate,preview.returnDate,preview.countedDays,JSON.stringify(preview.days.filter((row)=>row.leaveFraction===0||row.countedFraction!==row.leaveFraction)),status,text(body.documentNo),text(body.note),text(auth.user.username||auth.user.id),nowIso(),nowIso()).run();
    const statements=preview.days.map((row)=>c.env.DB.prepare(`INSERT INTO ik_leave_plan_days(id,main_company_id,leave_plan_id,employee_id,work_date,leave_type_code,leave_fraction,counted_fraction,day_part,reason,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),auth.company,id,preview.employeeId,row.date,preview.leaveType.code,row.leaveFraction,row.countedFraction,row.dayPart,row.reason,nowIso(),nowIso())); if(statements.length)await c.env.DB.batch(statements);
    return ok(c,{id,status,...preview},201);
  });

  app.get("/api/ik/personnel-control/people/:employeeId/leave-entitlement",async(c)=>{const auth=await authContext(c);if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı.");await seedCompany(c,auth.company);const data=await entitlementLedger(c,auth.company,text(c.req.param("employeeId")));return data?ok(c,data):fail(c,404,"NOT_FOUND","Personel bulunamadı.");});

  app.post("/api/ik/personnel-control/people/:employeeId/correction", async (c) => {
    const body=await bodyOf(c),auth=await authContext(c,body); if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı."); if(auth.audit)return fail(c,403,"HR_AUDIT_READ_ONLY","Denetim kullanıcısı puantaj düzeltemez."); const employeeId=text(c.req.param("employeeId")),workDate=dateOnly(body.workDate||body.date),reason=text(body.reason||body.note); if(!workDate||!reason)return fail(c,400,"CORRECTION_REASON_REQUIRED","Tarih ve düzeltme nedeni zorunludur."); if(await isLocked(c,auth.company,workDate))return fail(c,423,"PDKS_PERIOD_LOCKED","Kilitli dönemde düzeltme yapılamaz.");
    const old=await first(c,`SELECT * FROM ik_attendance_day_overrides WHERE main_company_id=? AND employee_id=? AND work_date=? LIMIT 1`,[auth.company,employeeId,workDate]); const next={status:upper(body.status)||"AUTO",entry:text(body.entry||body.manualIn),exit:text(body.exit||body.manualOut),lateMinutes:body.lateMinutes===undefined?null:num(body.lateMinutes),earlyMinutes:body.earlyMinutes===undefined?null:num(body.earlyMinutes),overtimeMinutes:body.overtimeMinutes===undefined?null:num(body.overtimeMinutes),missingPunch:body.missingPunch?1:0,note:text(body.note||reason)};
    await c.env.DB.prepare(`INSERT INTO ik_attendance_day_overrides(id,main_company_id,employee_id,work_date,status,manual_in,manual_out,late_minutes,early_minutes,overtime_minutes,missing_punch,note,actor_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,employee_id,work_date) DO UPDATE SET status=excluded.status,manual_in=excluded.manual_in,manual_out=excluded.manual_out,late_minutes=excluded.late_minutes,early_minutes=excluded.early_minutes,overtime_minutes=excluded.overtime_minutes,missing_punch=excluded.missing_punch,note=excluded.note,actor_user_id=excluded.actor_user_id,updated_at=excluded.updated_at`).bind(crypto.randomUUID(),auth.company,employeeId,workDate,next.status,next.entry||null,next.exit||null,next.lateMinutes,next.earlyMinutes,next.overtimeMinutes,next.missingPunch,next.note,auth.user.id,nowIso(),nowIso()).run();
    await c.env.DB.prepare(`INSERT INTO ik_pdks_correction_logs(id,main_company_id,employee_id,work_date,old_json,new_json,reason,actor_user_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),auth.company,employeeId,workDate,JSON.stringify(old||{}),JSON.stringify(next),reason,text(auth.user.id),text(auth.user.fullName||auth.user.username),nowIso()).run(); return ok(c,{saved:true,employeeId,workDate});
  });

  app.get("/api/ik/personnel-control/people/:employeeId/corrections",async(c)=>{const auth=await authContext(c);if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı.");await seedCompany(c,auth.company);const rows=await all(c,`SELECT id,work_date AS workDate,old_json AS oldJson,new_json AS newJson,reason,actor_user_id AS actorUserId,actor_name AS actorName,created_at AS createdAt FROM ik_pdks_correction_logs WHERE main_company_id=? AND employee_id=? ORDER BY created_at DESC LIMIT 300`,[auth.company,text(c.req.param("employeeId"))]);return ok(c,rows);});

  app.get("/api/ik/personnel-control/dashboard-live", async (c) => {
    const auth=await authContext(c);if(!auth)return fail(c,401,"UNAUTHORIZED","Oturum doğrulanamadı.");await seedCompany(c,auth.company);const date=dateOnly(c.req.query("date"))||todayTr();
    const period=`${date.slice(0,7)}`;
    const people=auth.audit
      ? await all(c,`SELECT e.id,e.code,e.full_name,e.department,e.title,s.card_no
          FROM hr_monthly_employees e
          LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
          LEFT JOIN ik_person_monthly_compliance mc ON mc.main_company_id=e.main_company_id AND mc.employee_id=e.id AND mc.period=?
          WHERE e.main_company_id=?
            AND UPPER(COALESCE(s.active_passive,'AKTIF')) NOT LIKE '%PAS%'
            AND UPPER(COALESCE(e.status,'AKTIF')) NOT LIKE '%PAS%'
            AND TRIM(COALESCE(s.card_no,''))<>''
            AND ((mc.employee_id IS NOT NULL AND mc.sgk_covered=1)
              OR (mc.employee_id IS NULL AND UPPER(COALESCE(e.sgk_status,'VAR'))<>'YOK'))`,[period,auth.company])
      : await all(c,`SELECT e.id,e.code,e.full_name,e.department,e.title,s.card_no
          FROM hr_monthly_employees e
          LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
          WHERE e.main_company_id=?
            AND UPPER(COALESCE(s.active_passive,'AKTIF')) NOT LIKE '%PAS%'
            AND UPPER(COALESCE(e.status,'AKTIF')) NOT LIKE '%PAS%'`,[auth.company]);
    const events=await all(c,`SELECT t.id,t.employee_id AS employeeId,t.card_no AS cardNo,t.work_date AS workDate,t.event_time AS eventTime,t.direction,t.source,t.created_at AS createdAt,e.full_name AS fullName,e.department FROM ik_time_clock_events t LEFT JOIN hr_monthly_employees e ON e.id=t.employee_id WHERE t.main_company_id=? AND t.work_date=? ORDER BY t.event_time DESC`,[auth.company,date]);
    const leaveMap=new Map<string,Row>();try{const leaveRows=await all(c,`SELECT d.employee_id AS employeeId,d.leave_type_code AS leaveTypeCode,d.leave_fraction AS leaveFraction,p.record_type AS recordType FROM ik_leave_plan_days d JOIN ik_leave_plans p ON p.id=d.leave_plan_id WHERE d.main_company_id=? AND d.work_date=? AND UPPER(COALESCE(p.status,''))<>'CANCELLED'`,[auth.company,date]);leaveRows.forEach((r)=>leaveMap.set(text(r.employeeId),r));}catch{}
    const eventMap=new Map<string,Row[]>();events.forEach((e)=>{const list=eventMap.get(text(e.employeeId))||[];list.push(e);eventMap.set(text(e.employeeId),list);});
    let late=0,inside=0,absent=0,permitted=0,missing=0;const cards:Row[]=[];
    for(const person of people){const rows=(eventMap.get(text(person.id))||[]).slice().sort((a,b)=>text(a.eventTime).localeCompare(text(b.eventTime))),leave=leaveMap.get(text(person.id));if(leave){permitted+=1;continue;}if(!rows.length){absent+=1;continue;}if(rows.length===1)missing+=1;const schedule=await resolveSchedule(c,auth.company,person);const firstMin=minutesOf(rows[0].eventTime),expected=minutesOf(schedule.entryTime);if(firstMin!==null&&expected!==null&&firstMin>expected+schedule.lateTolerance)late+=1;const last=rows[rows.length-1];const dir=upper(last.direction);const isInside=dir==="IN"||(dir==="AUTO"&&rows.length%2===1);if(isInside)inside+=1;cards.push({employeeId:person.id,fullName:person.full_name,department:person.department,cardNo:person.card_no,lastTime:last.eventTime,direction:dir||"AUTO",inside:isInside});}
    let devices:Row[]=[];try{devices=await all(c,`SELECT id,device_label AS deviceLabel,machine_name AS machineName,active,last_seen_at AS lastSeenAt,last_sync_at AS lastSyncAt,last_sync_count AS lastSyncCount FROM ik_pdks_devices WHERE main_company_id=? ORDER BY active DESC,device_label`,[auth.company]);}catch{}
    const onlineDevices=devices.filter((d)=>Number(d.active)!==0&&d.lastSeenAt&&Date.now()-new Date(d.lastSeenAt).getTime()<300000).length;
    return ok(c,{date,metrics:{activePersonnel:people.length,inside,absent,late,permitted,missingPunch:missing,deviceCount:devices.length,onlineDevices},liveCards:cards.slice(-30).reverse(),events:events.slice(0,50),devices});
  });
}
