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

function normalizePersonnelCode(value: unknown) {
  const raw = upper(value).replace(/\s+/g, "");
  if (!raw) return "";
  const legacy = raw.match(/^AY-?(\d+)$/);
  if (legacy) return `HKN-${String(Number(legacy[1])).padStart(2, "0")}`;
  const hkn = raw.match(/^HKN-?(\d+)$/);
  if (hkn) return `HKN-${String(Number(hkn[1])).padStart(2, "0")}`;
  const numeric = raw.match(/^(\d+)$/);
  if (numeric) return `HKN-${String(Number(numeric[1])).padStart(2, "0")}`;
  return raw;
}

function personnelCodeNumber(value: unknown) {
  const match = normalizePersonnelCode(value).match(/^HKN-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function nextPersonnelCode(c: Context<AppEnv>, company: string) {
  const rows = await all(c, "SELECT code FROM hr_monthly_employees WHERE main_company_id=? AND TRIM(COALESCE(code,''))<>''", [company]);
  const max = rows.reduce((current, row) => Math.max(current, personnelCodeNumber(row.code)), 0);
  return `HKN-${String(max + 1).padStart(2, "0")}`;
}

async function ensurePersonnelCodes(c: Context<AppEnv>, company: string) {
  const missing = await all(c, "SELECT id,full_name,created_at FROM hr_monthly_employees WHERE main_company_id=? AND TRIM(COALESCE(code,''))='' ORDER BY COALESCE(created_at,''),id", [company]);
  if (!missing.length) return;
  const existing = await all(c, "SELECT code FROM hr_monthly_employees WHERE main_company_id=? AND TRIM(COALESCE(code,''))<>''", [company]);
  let max = existing.reduce((current, row) => Math.max(current, personnelCodeNumber(row.code)), 0);
  for (const row of missing) {
    max += 1;
    const code = `HKN-${String(max).padStart(2, "0")}`;
    const timestamp = nowIso();
    const result = await c.env.DB.prepare("UPDATE hr_monthly_employees SET code=?,updated_at=? WHERE id=? AND main_company_id=? AND TRIM(COALESCE(code,''))=''")
      .bind(code, timestamp, text(row.id), company).run();
    if (!result.meta?.changes) continue;
    try {
      await c.env.DB.prepare(`INSERT INTO ik_employee_change_history
        (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
          crypto.randomUUID(), company, text(row.id), "AUTO_PERSONNEL_CODE", "personnelCode", "", code,
          dateOnly(timestamp), "Eksik personel kodu HKN standardına otomatik tamamlandı.", null, timestamp,
        ).run();
    } catch {}
  }
}

async function writePersonRemovalAudit(c: Context<AppEnv>, auth: Row, person: Row, mode: string, reason: string) {
  const details = {
    deletedEmployeeId: text(person.id),
    personnelCode: text(person.personnelCode),
    fullName: text(person.fullName),
    mode,
    reason,
    actorUserId: text(auth.user?.id),
    actorUsername: text(auth.user?.username),
  };
  try {
    await c.env.DB.prepare(`INSERT INTO hr_monthly_audit_logs
      (id,main_company_id,period,employee_id,entity_type,action,summary,details_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), auth.company, "", null, "PERSONEL", mode === "HARD" ? "HARD_DELETE" : "PASSIVE",
        mode === "HARD" ? `${text(person.fullName)} personel kaydı kalıcı silindi.` : `${text(person.fullName)} personel kaydı pasife alındı.`,
        JSON.stringify(details), nowIso(),
      ).run();
  } catch {}
  try {
    await c.env.DB.prepare(`INSERT INTO auth_security_audit
      (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), text(auth.user?.id) || null, null, auth.company,
        mode === "HARD" ? "IK_PERSONNEL_HARD_DELETE" : "IK_PERSONNEL_PASSIVE",
        null, text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]) || null,
        JSON.stringify(details), nowIso(),
      ).run();
  } catch {}
}

async function hardDeletePersonData(c: Context<AppEnv>, employeeId: string, company: string) {
  const cleanupErrors: Array<{ table: string; message: string }> = [];

  // Ana karta referans veren yardımcı bağları önce kopar.
  try {
    await c.env.DB.prepare("UPDATE ik_person_card_settings SET base_employee_id=NULL WHERE base_employee_id=?").bind(employeeId).run();
  } catch {}

  const tables = await all(c, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const preservedAudit = new Set(["hr_monthly_audit_logs", "ik_audit_logs", "auth_security_audit"]);

  for (const row of tables) {
    const table = text(row.name);
    if (!/^[A-Za-z0-9_]+$/.test(table) || table === "hr_monthly_employees") continue;

    let columns: Row[] = [];
    try {
      // pragma_table_info(?) bazı D1/SQLite sürümlerinde parametreyle sorun çıkarabildiği için
      // tablo adı whitelist edildikten sonra literal kullanıyoruz.
      columns = await all(c, `SELECT name FROM pragma_table_info('${table}')`);
    } catch (cause: any) {
      cleanupErrors.push({ table, message: text(cause?.message || cause) });
      continue;
    }

    const names = new Set(columns.map((column) => text(column.name)));
    const employeeColumns = ["employee_id", "person_id"].filter((column) => names.has(column));
    if (!employeeColumns.length) continue;

    const quoted = `"${table}"`;
    try {
      if (preservedAudit.has(table)) {
        for (const column of employeeColumns) {
          try {
            await c.env.DB.prepare(`UPDATE ${quoted} SET "${column}"=NULL WHERE "${column}"=?`).bind(employeeId).run();
          } catch {
            // NOT NULL audit tablolarında sadece ilgili satırı temizle; silme işlemini bloklama.
            await c.env.DB.prepare(`DELETE FROM ${quoted} WHERE "${column}"=?`).bind(employeeId).run();
          }
        }
        continue;
      }

      const where = employeeColumns.map((column) => `"${column}"=?`).join(" OR ");
      await c.env.DB.prepare(`DELETE FROM ${quoted} WHERE ${where}`).bind(...employeeColumns.map(() => employeeId)).run();
    } catch (cause: any) {
      // Yardımcı bir tablo hatası ana personel silmeyi sonsuza kadar engellemesin.
      // Master delete aşağıda ayrıca doğrulanıyor.
      cleanupErrors.push({ table, message: text(cause?.message || cause) });
    }
  }

  const deleted = await c.env.DB.prepare("DELETE FROM hr_monthly_employees WHERE id=? AND main_company_id=?")
    .bind(employeeId, company).run();

  const remaining = await first(c, "SELECT id FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1", [employeeId, company]);
  if (remaining || !Number(deleted.meta?.changes || 0)) {
    const detail = cleanupErrors.slice(0, 5).map((item) => `${item.table}: ${item.message}`).join(" | ");
    throw new Error(detail ? `Personel ana kaydı silinemedi. ${detail}` : "Personel ana kaydı silinemedi.");
  }

  return { cleanupErrors };
}

function personSelect(audit = false) {
  return `SELECT e.id,e.main_company_id,e.code,e.full_name,e.department,e.title,e.work_type,e.sgk_status,e.status,
                 e.hire_date,e.salary,e.road_allowance,e.bank_payment_type,e.bank_amount,e.cash_amount,
                 e.overtime_hourly_base,e.annual_leave_entitlement,e.annual_leave_carryover,e.note,
                 e.created_at,e.updated_at,
                 s.card_no,s.identity_no,s.exit_date,s.active_passive,s.phone,s.payment_type,s.sgk_follow,s.personel_kodu,
                 hp.personnel_status
            FROM hr_monthly_employees e
            LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
            LEFT JOIN ik_person_hr_profiles hp ON hp.employee_id=e.id AND hp.main_company_id=e.main_company_id
           WHERE e.main_company_id=?${audit ? " AND TRIM(COALESCE(s.card_no,'')) <> ''" : ""}`;
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
      personnelStatus: text(row.personnel_status) || "NORMAL",
      sgkDays: row.sgk_days === null || row.sgk_days === undefined ? null : number(row.sgk_days),
      sgkPeriod: text(row.sgk_period),
      pdksCardDays: row.pdks_card_days === null || row.pdks_card_days === undefined ? null : number(row.pdks_card_days),
      sgkPdksMatch: row.sgk_match === null || row.sgk_match === undefined ? null : Boolean(row.sgk_match),
    });
  }
  return base;
}

function requestedPeriod(c: Context<AppEnv>, fallbackYear?: number, fallbackMonth?: number) {
  const year = number(c.req.query("year")) || fallbackYear || new Date().getFullYear();
  const month = number(c.req.query("month")) || fallbackMonth || new Date().getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function complianceRow(c: Context<AppEnv>, company: string, employeeId: string, period: string) {
  try {
    return await first(c, "SELECT sgk_covered,sgk_days FROM ik_person_monthly_compliance WHERE main_company_id=? AND employee_id=? AND period=? LIMIT 1", [company, employeeId, period]);
  } catch {
    return null;
  }
}

async function pdksCardDays(c: Context<AppEnv>, company: string, employeeId: string, period: string) {
  const start = `${period}-01`;
  const y = Number(period.slice(0,4)), m = Number(period.slice(5,7));
  const end = `${period}-${String(new Date(y,m,0).getDate()).padStart(2,"0")}`;
  try {
    const row = await first(c, "SELECT COUNT(DISTINCT work_date) AS days FROM ik_time_clock_events WHERE main_company_id=? AND employee_id=? AND work_date BETWEEN ? AND ?", [company, employeeId, start, end]);
    return number(row?.days);
  } catch {
    return 0;
  }
}

async function auditVisibleForPeriod(c: Context<AppEnv>, company: string, row: Row, period: string) {
  if (!text(row.card_no)) return false;
  const compliance = await complianceRow(c, company, text(row.id), period);
  if (compliance) return number(compliance.sgk_covered) === 1;
  return upper(row.sgk_status || (number(row.sgk_follow) === 0 ? "YOK" : "VAR")) !== "YOK";
}

async function personRows(c: Context<AppEnv>, auth: Row) {
  if (!auth.audit) await ensurePersonnelCodes(c, auth.company);
  const rows = await all(c, `${personSelect(auth.audit)} ORDER BY e.code COLLATE NOCASE,e.full_name COLLATE NOCASE`, [auth.company]);
  const period = requestedPeriod(c);
  const result: Row[] = [];
  for (const row of rows) {
    const compliance = await complianceRow(c, auth.company, text(row.id), period);
    if (auth.audit && !(await auditVisibleForPeriod(c, auth.company, row, period))) continue;
    const cardDays = auth.audit ? null : await pdksCardDays(c, auth.company, text(row.id), period);
    const sgkDays = compliance?.sgk_days === null || compliance?.sgk_days === undefined ? null : number(compliance.sgk_days);
    result.push(mapPerson({
      ...row,
      sgk_status: compliance ? (number(compliance.sgk_covered) === 1 ? "VAR" : "YOK") : row.sgk_status,
      sgk_days: sgkDays,
      sgk_period: period,
      pdks_card_days: cardDays,
      sgk_match: auth.audit || sgkDays === null ? null : sgkDays === cardDays,
    }, auth.audit));
  }
  return result;
}

async function accessiblePerson(c: Context<AppEnv>, auth: Row, employeeId: string, period = requestedPeriod(c)) {
  const row = await first(c, `${personSelect(auth.audit)} AND e.id=? LIMIT 1`, [auth.company, employeeId]);
  if (!row) return null;
  if (auth.audit && !(await auditVisibleForPeriod(c, auth.company, row, period))) return null;
  return mapPerson(row, auth.audit);
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
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const person = await accessiblePerson(c, auth, employeeId, period);
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
  const todayTr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const days = dates.map((date) => {
    const dayEvents = byDate.get(date) || [];
    const override = overrideByDate.get(date);
    const times = dayEvents.map((row) => text(row.event_time).slice(0, 5)).filter(Boolean).sort();
    const firstTime = text(override?.manual_in) || times[0] || "";
    const lastTime = text(override?.manual_out) || (times.length > 1 ? times.at(-1)! : "");
    const wd = weekday(date);
    const outsideEmployment = Boolean(
      (person.startDate && date < person.startDate) ||
      (person.exitDate && date > person.exitDate),
    );
    const futureDay = date > todayTr;
    let status = text(override?.status);
    if (!status || status === "AUTO") {
      if (leaves.has(date)) status = upper(leaves.get(date)).includes("YILLIK") ? "YILLIK_IZIN" : "IZIN";
      else if (outsideEmployment || futureDay) status = "DONEM_DISI";
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
  const requestedCode = normalizePersonnelCode(body.personnelCode || body.code);
  if (requestedCode && !/^HKN-\d+$/.test(requestedCode)) {
    return error(c, 400, "PERSONNEL_CODE_INVALID", "Personel kodu HKN-01 biçiminde olmalıdır.");
  }
  const code = requestedCode || await nextPersonnelCode(c, auth.company);
  const codeDuplicate = await first(c, "SELECT id FROM hr_monthly_employees WHERE main_company_id=? AND UPPER(TRIM(COALESCE(code,'')))=UPPER(?) LIMIT 1", [auth.company, code]);
  if (codeDuplicate) return error(c, 409, "PERSONNEL_CODE_DUPLICATE", `Bu personel kodu zaten kullanılıyor: ${code}.`);
  const cardNo = text(body.cardNo);
  if (cardNo) {
    const cardDuplicate = await first(c, "SELECT employee_id FROM ik_person_card_settings WHERE main_company_id=? AND TRIM(COALESCE(card_no,''))=? LIMIT 1", [auth.company, cardNo]);
    if (cardDuplicate) return error(c, 409, "PERSONNEL_CARD_DUPLICATE", `Bu kart numarası başka personelde kayıtlı: ${cardNo}.`);
  }
  const startDate = dateOnly(body.startDate || body.hireDate);
  const duplicate = await first(c, `SELECT id FROM hr_monthly_employees
    WHERE main_company_id=? AND LOWER(TRIM(full_name))=LOWER(TRIM(?))
      AND COALESCE(hire_date,'')=? AND COALESCE(department,'')=? AND COALESCE(title,'')=? LIMIT 1`,
    [auth.company, fullName, startDate, text(body.department), text(body.title)]);
  if (duplicate) return error(c, 409, "DUPLICATE_EMPLOYEE", "Aynı personel kartı zaten mevcut. Yeni kayıt açmak yerine mevcut kartı düzenleyin.");
  const timestamp = nowIso();
  await c.env.DB.prepare(`INSERT INTO hr_monthly_employees
    (id,main_company_id,code,full_name,department,title,work_type,sgk_status,status,hire_date,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,overtime_hourly_base,annual_leave_entitlement,annual_leave_carryover,note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, auth.company, code || null, fullName, text(body.department) || null, text(body.title) || null,
      text(body.workType) || "Aylık", upper(body.sgkStatus) === "YOK" ? "YOK" : "VAR", text(body.status) || "Aktif",
      startDate || null, number(body.salary), number(body.roadAllowance), text(body.paymentChannel) || "Banka + Elden",
      number(body.bankAmount), number(body.cashAmount), number(body.overtimeBaseHours) || 225, number(body.annualLeaveEntitlement) || 14,
      number(body.annualLeaveCarryover), text(body.note) || null, timestamp, timestamp).run();
  await c.env.DB.prepare(`INSERT INTO ik_person_card_settings
    (employee_id,main_company_id,card_no,identity_no,exit_date,active_passive,phone,payment_type,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(employee_id) DO UPDATE SET card_no=excluded.card_no,identity_no=excluded.identity_no,exit_date=excluded.exit_date,active_passive=excluded.active_passive,phone=excluded.phone,payment_type=excluded.payment_type,updated_at=excluded.updated_at`)
    .bind(id, auth.company, cardNo || null, text(body.identityNo) || null, dateOnly(body.exitDate) || null, text(body.activePassive) || "Aktif", text(body.phone) || null, text(body.paymentChannel) || null, timestamp).run();
  const personnelStatus = ["RETIRED","EMEKLI","EMEKLİ"].includes(upper(body.personnelStatus)) ? "RETIRED" : "NORMAL";
  const period = /^\d{4}-\d{2}$/.test(text(body.period)) ? text(body.period) : requestedPeriod(c);
  const sgkCovered = upper(body.sgkStatus) !== "YOK";
  const sgkDays = body.sgkDays === null || body.sgkDays === undefined || body.sgkDays === "" ? null : Math.max(0, Math.min(31, Math.round(number(body.sgkDays))));
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT OR IGNORE INTO ik_person_hr_profiles(employee_id,main_company_id,personnel_status,updated_by,updated_at) VALUES (?,?,?,?,?)`).bind(id, auth.company, personnelStatus, text(auth.user?.username), timestamp),
    c.env.DB.prepare(`INSERT OR REPLACE INTO ik_person_monthly_compliance(main_company_id,employee_id,period,sgk_covered,sgk_days,note,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(auth.company, id, period, sgkCovered ? 1 : 0, sgkCovered ? sgkDays : 0, text(body.sgkNote), text(auth.user?.username), timestamp),
  ]);
  const person = await accessiblePerson(c, auth, id, period);
  return ok(c, person, 201);
}

async function removePerson(c: Context<AppEnv>) {
  const full = await ensureFull(c);
  if (full.response) return full.response;
  const { auth } = full;
  const employeeId = text(c.req.param("employeeId"));
  const currentRaw = await first(c, `${personSelect(false)} AND e.id=? LIMIT 1`, [auth.company, employeeId]);
  if (!currentRaw) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const person = mapPerson(currentRaw, false);
  const body = await bodyOf(c);
  const mode = upper(body.mode || "PASSIVE");
  const reason = text(body.reason) || (mode === "HARD" ? "Yanlış veya mükerrer personel kaydı" : "Personel pasife alındı");

  if (mode === "HARD") {
    if (!adminRole(auth.user?.role)) {
      return error(c, 403, "ADMIN_REQUIRED", "Kalıcı personel silme yalnız yönetici yetkisiyle yapılabilir.");
    }
    if (text(body.confirmName).toLocaleLowerCase("tr-TR") !== text(person.fullName).toLocaleLowerCase("tr-TR")) {
      return error(c, 400, "HARD_DELETE_CONFIRMATION_REQUIRED", "Kalıcı silme için personel adı doğrulanmalıdır.");
    }
    const cleanup = await hardDeletePersonData(c, employeeId, auth.company);
    await writePersonRemovalAudit(c, auth, person, "HARD", reason);
    const verify = await first(c, "SELECT id FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1", [employeeId, auth.company]);
    if (verify) return error(c, 500, "HARD_DELETE_VERIFY_FAILED", "Personel kaydı silme sonrası hâlâ mevcut görünüyor.");
    return ok(c, {
      id: employeeId,
      fullName: person.fullName,
      personnelCode: person.personnelCode,
      mode: "HARD",
      deleted: true,
      cleanupWarnings: cleanup.cleanupErrors,
    });
  }

  if (mode !== "PASSIVE") return error(c, 400, "REMOVE_MODE_INVALID", "Silme modu PASSIVE veya HARD olmalıdır.");
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE hr_monthly_employees SET status='Pasif',updated_at=? WHERE id=? AND main_company_id=?").bind(timestamp, employeeId, auth.company),
    c.env.DB.prepare(`INSERT INTO ik_person_card_settings(employee_id,main_company_id,active_passive,updated_at)
      VALUES (?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET active_passive=excluded.active_passive,updated_at=excluded.updated_at`)
      .bind(employeeId, auth.company, "Pasif", timestamp),
    c.env.DB.prepare(`INSERT INTO ik_employee_change_history
      (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), auth.company, employeeId, "PERSONNEL_STATUS", "status", text(person.status), "Pasif",
        dateOnly(timestamp), reason, text(auth.user?.id), timestamp,
      ),
  ]);
  await writePersonRemovalAudit(c, auth, { ...person, status: "Pasif" }, "PASSIVE", reason);
  const saved = await accessiblePerson(c, auth, employeeId);
  return ok(c, { ...(saved || person), mode: "PASSIVE", deleted: false });
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
  const period = /^\d{4}-\d{2}$/.test(text(body.period)) ? text(body.period) : requestedPeriod(c);
  const profile = await first(c, "SELECT personnel_status FROM ik_person_hr_profiles WHERE employee_id=? AND main_company_id=? LIMIT 1", [employeeId, auth.company]).catch(() => null);
  const monthCompliance = await complianceRow(c, auth.company, employeeId, period);
  const statements: any[] = [];
  let salaryTouched = false;
  for (const [key, value] of Object.entries(changes)) {
    if (key === "personnelStatus") {
      const nextStatus = ["RETIRED","EMEKLI","EMEKLİ"].includes(upper(value)) ? "RETIRED" : "NORMAL";
      const oldStatus = text(profile?.personnel_status) || "NORMAL";
      if (oldStatus !== nextStatus) {
        statements.push(c.env.DB.prepare(`INSERT INTO ik_person_hr_profiles(employee_id,main_company_id,personnel_status,updated_by,updated_at)
          VALUES (?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET personnel_status=excluded.personnel_status,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
          .bind(employeeId, auth.company, nextStatus, text(auth.user?.username), nowIso()));
      }
      continue;
    }
    if (key === "sgkDays" || key === "sgkStatus") {
      const currentCovered = monthCompliance ? number(monthCompliance.sgk_covered) === 1 : upper(currentRaw.sgk_status) !== "YOK";
      const nextCovered = key === "sgkStatus" ? upper(value) !== "YOK" : currentCovered;
      const rawDays = key === "sgkDays" ? value : monthCompliance?.sgk_days;
      const nextDays = nextCovered ? (rawDays === null || rawDays === undefined || rawDays === "" ? null : Math.max(0, Math.min(31, Math.round(number(rawDays))))) : 0;
      statements.push(c.env.DB.prepare(`INSERT INTO ik_person_monthly_compliance(main_company_id,employee_id,period,sgk_covered,sgk_days,note,updated_by,updated_at)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,employee_id,period) DO UPDATE SET
        sgk_covered=excluded.sgk_covered,sgk_days=excluded.sgk_days,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .bind(auth.company, employeeId, period, nextCovered ? 1 : 0, nextDays, text(body.sgkNote), text(auth.user?.username), nowIso()));
      continue;
    }
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
  app.post("/api/ik/personnel-control/people/:employeeId/remove", removePerson);
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
