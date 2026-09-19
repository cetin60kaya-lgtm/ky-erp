// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const CANONICAL_COMPANY_ID = "mecit-hakan";
const CANONICAL_ALIASES = new Set([
  "", "mecit-hakan", "main-mecit-hakan", "mecit-hakan-gursu", "hakan-baski",
  "main-hakan", "main-hakan-baski", "hkn-baski",
]);
const text = (value: unknown) => value == null ? "" : String(value).trim();
const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => Math.round(number(value) * 100) / 100;
const flag = (value: unknown) => value === true || value === 1 || value === "1";
const nowIso = () => new Date().toISOString();
const dateOnly = (value: unknown) => text(value).slice(0, 10);
const json = (value: unknown) => {
  if (!value) return null;
  try { return JSON.parse(String(value)); } catch { return null; }
};

function canonicalCompany(value: unknown) {
  const normalized = text(value).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
  return CANONICAL_ALIASES.has(normalized) ? CANONICAL_COMPANY_ID : normalized;
}

function companyIdOf(c: Context<AppEnv>, body: Row = {}) {
  return canonicalCompany(
    c.req.header("X-KYERP-Tenant-Slug") || body.mainCompanyId || body.main_company_id ||
    body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanyId") ||
    c.req.query("mainCompanySlug"),
  );
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch { return {}; }
}

function okList(c: Context<AppEnv>, rows: Row[]) {
  return c.json({ ok: true, success: true, data: rows, items: rows });
}
function okData(c: Context<AppEnv>, data: unknown) {
  return c.json({ ok: true, success: true, data });
}
function okItems(c: Context<AppEnv>, data: unknown, items: unknown[]) {
  return c.json({ ok: true, success: true, data, items });
}
function fail(c: Context<AppEnv>, status: 400 | 404 | 409 | 500, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status);
}

let schemaReady: Promise<void> | null = null;
function ensureDailyAuditSchema(c: Context<AppEnv>) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await c.env.DB.batch([
        c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_operation_audit (
          id TEXT PRIMARY KEY,
          main_company_id TEXT NOT NULL,
          employee_id TEXT,
          attendance_id TEXT,
          work_date TEXT,
          shift TEXT NOT NULL DEFAULT '',
          action TEXT NOT NULL,
          before_json TEXT,
          after_json TEXT,
          note TEXT,
          actor_user_id TEXT,
          actor_label TEXT,
          source TEXT NOT NULL DEFAULT 'KYERP_WEB',
          request_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        c.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_hr_daily_operation_audit_company_date ON hr_daily_operation_audit(main_company_id, work_date, created_at DESC)"),
        c.env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_hr_daily_operation_audit_employee_date ON hr_daily_operation_audit(main_company_id, employee_id, work_date, created_at DESC)"),
        c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_hr_daily_operation_audit_no_update
          BEFORE UPDATE ON hr_daily_operation_audit BEGIN
            SELECT RAISE(ABORT, 'daily operation audit is append-only');
          END`),
        c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_hr_daily_operation_audit_no_delete
          BEFORE DELETE ON hr_daily_operation_audit BEGIN
            SELECT RAISE(ABORT, 'daily operation audit is append-only');
          END`),
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function actorOf(c: Context<AppEnv>) {
  let user: Row | null = null;
  try { user = await getAuthenticatedUser(c) as Row | null; } catch {}
  return {
    id: text(user?.id || user?.userId || user?.user_id),
    label: text(user?.fullName || user?.full_name || user?.name || user?.username || user?.email || user?.role) || "KY ERP Kullanıcısı",
    requestId: text(c.get?.("requestId")) || crypto.randomUUID(),
  };
}

function attendanceSnapshot(row: Row | null | undefined) {
  if (!row) return null;
  return {
    id: text(row.id), employeeId: text(row.employee_id), workDate: dateOnly(row.work_date),
    day: flag(row.day_shift), night: flag(row.night_shift), dayWage: money(row.day_wage),
    nightWage: money(row.night_wage), totalAmount: money(row.total_amount),
    paymentStatus: text(row.payment_status) || "WAITING", updatedAt: text(row.updated_at),
  };
}

function auditStatement(c: Context<AppEnv>, input: Row) {
  return c.env.DB.prepare(`INSERT INTO hr_daily_operation_audit
    (id,main_company_id,employee_id,attendance_id,work_date,shift,action,before_json,after_json,note,actor_user_id,actor_label,source,request_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(), canonicalCompany(input.companyId), text(input.employeeId) || null,
      text(input.attendanceId) || null, dateOnly(input.workDate) || null, text(input.shift), text(input.action),
      input.before == null ? null : JSON.stringify(input.before), input.after == null ? null : JSON.stringify(input.after),
      text(input.note) || null, text(input.actor?.id) || null, text(input.actor?.label) || "KY ERP Kullanıcısı",
      text(input.source) || "KYERP_WEB", text(input.actor?.requestId) || null, nowIso(),
    );
}

function mapAttendance(row: Row): Row {
  const workDate = dateOnly(row.work_date);
  return {
    id: text(row.id), employeeId: text(row.employee_id), workDate, date: workDate,
    dayShift: flag(row.day_shift), nightShift: flag(row.night_shift), day: flag(row.day_shift), night: flag(row.night_shift),
    dayWage: money(row.day_wage), nightWage: money(row.night_wage), totalAmount: money(row.total_amount),
    paymentStatus: text(row.payment_status) || "WAITING", createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function activeAttendanceRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const start = dateOnly(c.req.query("startDate") || c.req.query("start"));
  const end = dateOnly(c.req.query("endDate") || c.req.query("end"));
  const employeeId = text(c.req.query("employeeId") || c.req.query("personnelId"));
  const result = await c.env.DB.prepare(`SELECT a.* FROM hr_daily_attendance a
    JOIN hr_daily_employees e ON e.id=a.employee_id
    WHERE e.main_company_id=? AND (?='' OR a.employee_id=?)
      AND (a.day_shift=1 OR a.night_shift=1)
      AND (?='' OR a.work_date>=?) AND (?='' OR a.work_date<=?)
    ORDER BY a.work_date DESC,a.id DESC`)
    .bind(companyId, employeeId, employeeId, start, start, end, end).all<Row>();
  return (result.results || []).map(mapAttendance);
}

async function getAttendance(c: Context<AppEnv>) {
  return okList(c, await activeAttendanceRows(c));
}

async function saveRange(c: Context<AppEnv>) {
  await ensureDailyAuditSchema(c);
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const sourceRows = Array.isArray(body.rows) ? body.rows : Array.isArray(body.entries)
    ? body.entries.map((entry: Row) => ({ ...entry, employeeId: body.employeeId }))
    : body.employeeId ? [body] : [];
  const rows = sourceRows.filter((row: unknown) => row && typeof row === "object" && !Array.isArray(row)) as Row[];
  if (!rows.length) return fail(c, 400, "ROWS_REQUIRED", "Kaydedilecek devam satırı bulunamadı.");
  const ids = [...new Set(rows.map((row) => text(row.employeeId || row.personId)).filter(Boolean))];
  if (!ids.length) return fail(c, 400, "EMPLOYEE_REQUIRED", "Devam satırlarında personel zorunludur.");
  const peopleResult = await c.env.DB.prepare(`SELECT id,full_name,day_wage,night_wage FROM hr_daily_employees
    WHERE main_company_id=? AND id IN (${ids.map(() => "?").join(",")})`).bind(companyId, ...ids).all<Row>();
  const people = peopleResult.results || [];
  if (people.length !== ids.length) return fail(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
  const peopleById = new Map(people.map((row) => [text(row.id), row]));
  const existingResult = await c.env.DB.prepare(`SELECT a.* FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id
    WHERE e.main_company_id=? AND a.employee_id IN (${ids.map(() => "?").join(",")})`).bind(companyId, ...ids).all<Row>();
  const existingByDay = new Map((existingResult.results || []).map((row) => [`${text(row.employee_id)}-${dateOnly(row.work_date)}`, row]));

  for (const row of rows) {
    const employeeId = text(row.employeeId || row.personId);
    const workDate = dateOnly(row.workDate || row.date || body.startDate);
    const current = existingByDay.get(`${employeeId}-${workDate}`);
    const expected = text(row.expectedUpdatedAt || row.expected_updated_at);
    if (expected && current && text(current.updated_at) !== expected) {
      return fail(c, 409, "DAILY_RECORD_CHANGED", `${text(peopleById.get(employeeId)?.full_name) || "Personel"} / ${workDate} kaydı başka bir işlemle değişti. Ekranı yenileyip tekrar kontrol edin.`);
    }
  }

  const actor = await actorOf(c);
  const statements: D1PreparedStatement[] = [];
  const saved: Row[] = [];
  for (const row of rows) {
    const employeeId = text(row.employeeId || row.personId);
    const workDate = dateOnly(row.workDate || row.date || body.startDate);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue;
    const person = peopleById.get(employeeId) || {};
    const current = existingByDay.get(`${employeeId}-${workDate}`);
    const day = flag(row.dayShift ?? row.day);
    const night = flag(row.nightShift ?? row.night);
    if (!current && !day && !night) continue;
    const dayWage = current ? money(current.day_wage) : money(row.dayWage ?? person.day_wage);
    const nightWage = current ? money(current.night_wage) : money(row.nightWage ?? person.night_wage);
    const total = money((day ? dayWage : 0) + (night ? nightWage : 0));
    const paymentStatus = text(row.paymentStatus) || text(current?.payment_status) || "WAITING";
    const timestamp = nowIso();
    const id = text(current?.id) || text(row.id) || crypto.randomUUID();
    const before = attendanceSnapshot(current);
    const afterRaw = { id, employee_id: employeeId, work_date: workDate, day_shift: day ? 1 : 0, night_shift: night ? 1 : 0, day_wage: dayWage, night_wage: nightWage, total_amount: total, payment_status: paymentStatus, created_at: current?.created_at || timestamp, updated_at: timestamp };
    const after = attendanceSnapshot(afterRaw);
    const same = current && flag(current.day_shift) === day && flag(current.night_shift) === night && money(current.total_amount) === total && text(current.payment_status || "WAITING") === paymentStatus;
    if (same) { saved.push(mapAttendance(current)); continue; }
    if (current) {
      statements.push(c.env.DB.prepare(`UPDATE hr_daily_attendance SET day_shift=?,night_shift=?,day_wage=?,night_wage=?,total_amount=?,payment_status=?,updated_at=? WHERE id=?`)
        .bind(day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, paymentStatus, timestamp, id));
    } else {
      statements.push(c.env.DB.prepare(`INSERT INTO hr_daily_attendance
        (id,employee_id,work_date,day_shift,night_shift,day_wage,night_wage,total_amount,payment_status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id, employeeId, workDate, day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, paymentStatus, timestamp, timestamp));
    }
    const action = !current ? "ATTENDANCE_CREATE" : (!day && !night ? "ATTENDANCE_REMOVE" : (!flag(current.day_shift) && !flag(current.night_shift) ? "ATTENDANCE_RESTORE" : "ATTENDANCE_UPDATE"));
    statements.push(auditStatement(c, { companyId, employeeId, attendanceId: id, workDate, action, before, after, actor, note: text(row.note), source: "KYERP_RANGE" }));
    saved.push(mapAttendance(afterRaw));
  }
  if (statements.length) await c.env.DB.batch(statements);
  return okData(c, saved.filter((row) => row.dayShift || row.nightShift));
}

async function getFocusedRecords(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const date = dateOnly(c.req.query("date") || c.req.query("selectedDate"));
  if (!date) return fail(c, 400, "DATE_REQUIRED", "Geçerli tarih seçilmedi.");
  const shiftRaw = text(c.req.query("shift")).toLocaleLowerCase("tr-TR");
  const shift = ["n", "night", "gece"].includes(shiftRaw) ? "night" : "day";
  const [attendanceResult, peopleResult, notesResult] = await Promise.all([
    c.env.DB.prepare(`SELECT a.* FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id WHERE e.main_company_id=? AND a.work_date=? ORDER BY a.id`).bind(companyId, date).all<Row>(),
    c.env.DB.prepare("SELECT * FROM hr_daily_employees WHERE main_company_id=?").bind(companyId).all<Row>(),
    c.env.DB.prepare("SELECT employee_id,shift,note FROM hr_daily_attendance_notes WHERE main_company_id=? AND work_date=?").bind(companyId, date).all<Row>(),
  ]);
  const peopleById = new Map((peopleResult.results || []).map((row) => [text(row.id), row]));
  const notesByKey = new Map((notesResult.results || []).map((row) => [`${text(row.employee_id)}-${text(row.shift).toLowerCase()}`, text(row.note)]));
  const rows = (attendanceResult.results || []).map((row) => {
    const item = mapAttendance(row);
    const person = peopleById.get(text(row.employee_id)) || {};
    return { ...item, employee: person, shift, selected: shift === "day" ? item.dayShift : item.nightShift, note: notesByKey.get(`${item.employeeId}-${shift}`) || "" };
  });
  return okItems(c, rows, rows);
}

async function saveFocusedRecords(c: Context<AppEnv>) {
  await ensureDailyAuditSchema(c);
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const date = dateOnly(body.date || body.selectedDate);
  const shiftRaw = text(body.shift).toLocaleLowerCase("tr-TR");
  const shift = ["n", "night", "gece"].includes(shiftRaw) ? "night" : "day";
  const entries = Array.isArray(body.personnelEntries) ? body.personnelEntries.filter((entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)) as Row[] : [];
  if (!date) return fail(c, 400, "DATE_REQUIRED", "Geçerli tarih seçilmedi.");
  if (!entries.length) return fail(c, 400, "ROWS_REQUIRED", "Kaydedilecek personel seçilmedi.");
  const ids = [...new Set(entries.map((entry) => text(entry.personelId || entry.employeeId)).filter(Boolean))];
  const peopleResult = await c.env.DB.prepare(`SELECT id,full_name,day_wage,night_wage FROM hr_daily_employees WHERE main_company_id=? AND id IN (${ids.map(() => "?").join(",")})`).bind(companyId, ...ids).all<Row>();
  const people = peopleResult.results || [];
  if (people.length !== ids.length) return fail(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
  const peopleById = new Map(people.map((row) => [text(row.id), row]));
  const existingResult = await c.env.DB.prepare(`SELECT a.* FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id WHERE e.main_company_id=? AND a.work_date=? AND a.employee_id IN (${ids.map(() => "?").join(",")})`).bind(companyId, date, ...ids).all<Row>();
  const existingByEmployee = new Map((existingResult.results || []).map((row) => [text(row.employee_id), row]));
  const notesResult = await c.env.DB.prepare(`SELECT employee_id,note FROM hr_daily_attendance_notes WHERE main_company_id=? AND work_date=? AND shift=? AND employee_id IN (${ids.map(() => "?").join(",")})`).bind(companyId, date, shift, ...ids).all<Row>();
  const notesByEmployee = new Map((notesResult.results || []).map((row) => [text(row.employee_id), text(row.note)]));

  for (const entry of entries) {
    const employeeId = text(entry.personelId || entry.employeeId);
    const current = existingByEmployee.get(employeeId);
    const expected = text(entry.expectedUpdatedAt || entry.expected_updated_at);
    if (expected && current && text(current.updated_at) !== expected) return fail(c, 409, "DAILY_RECORD_CHANGED", `${text(peopleById.get(employeeId)?.full_name) || "Personel"} / ${date} kaydı başka bir işlemle değişti. Ekranı yenileyip tekrar kontrol edin.`);
  }

  const actor = await actorOf(c);
  const statements: D1PreparedStatement[] = [];
  for (const entry of entries) {
    const employeeId = text(entry.personelId || entry.employeeId);
    const person = peopleById.get(employeeId) || {};
    const current = existingByEmployee.get(employeeId);
    const status = text(entry.status).toLocaleUpperCase("tr-TR");
    const selected = !["REMOVE", "PASSIVE", "INACTIVE", "DELETE"].includes(status);
    const day = shift === "day" ? selected : flag(current?.day_shift);
    const night = shift === "night" ? selected : flag(current?.night_shift);
    if (!current && !day && !night) continue;
    const dayWage = current ? money(current.day_wage) : money(person.day_wage);
    const nightWage = current ? money(current.night_wage) : money(person.night_wage);
    const total = money((day ? dayWage : 0) + (night ? nightWage : 0));
    const timestamp = nowIso();
    const id = text(current?.id) || crypto.randomUUID();
    const before = attendanceSnapshot(current);
    const afterRaw = { id, employee_id: employeeId, work_date: date, day_shift: day ? 1 : 0, night_shift: night ? 1 : 0, day_wage: dayWage, night_wage: nightWage, total_amount: total, payment_status: text(current?.payment_status) || "WAITING", created_at: current?.created_at || timestamp, updated_at: timestamp };
    const after = attendanceSnapshot(afterRaw);
    const stateChanged = !current || flag(current.day_shift) !== day || flag(current.night_shift) !== night;
    if (stateChanged) {
      if (current) statements.push(c.env.DB.prepare("UPDATE hr_daily_attendance SET day_shift=?,night_shift=?,day_wage=?,night_wage=?,total_amount=?,updated_at=? WHERE id=?").bind(day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, timestamp, id));
      else statements.push(c.env.DB.prepare("INSERT INTO hr_daily_attendance (id,employee_id,work_date,day_shift,night_shift,day_wage,night_wage,total_amount,payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, employeeId, date, day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, "WAITING", timestamp, timestamp));
      const previousShiftState = shift === "day" ? flag(current?.day_shift) : flag(current?.night_shift);
      const action = selected ? (previousShiftState ? "ATTENDANCE_UPDATE" : (current ? "ATTENDANCE_RESTORE" : "ATTENDANCE_CREATE")) : "ATTENDANCE_REMOVE";
      statements.push(auditStatement(c, { companyId, employeeId, attendanceId: id, workDate: date, shift, action, before, after, actor, note: text(entry.note), source: "KYERP_DAILY_ENTRY" }));
    }
    const nextNote = text(entry.note);
    const previousNote = notesByEmployee.get(employeeId) || "";
    if (nextNote !== previousNote) {
      statements.push(c.env.DB.prepare(`INSERT INTO hr_daily_attendance_notes (id,main_company_id,employee_id,work_date,shift,note,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(main_company_id,employee_id,work_date,shift) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`).bind(crypto.randomUUID(), companyId, employeeId, date, shift, nextNote, timestamp));
      statements.push(auditStatement(c, { companyId, employeeId, attendanceId: id, workDate: date, shift, action: "NOTE_UPDATE", before: { note: previousNote }, after: { note: nextNote }, actor, note: nextNote, source: "KYERP_DAILY_ENTRY" }));
    }
  }
  if (statements.length) await c.env.DB.batch(statements);
  return okItems(c, { date, shift, count: entries.length }, ids);
}

async function getRoster(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const startDate = dateOnly(c.req.query("startDate") || c.req.query("start"));
  const endDate = dateOnly(c.req.query("endDate") || c.req.query("end") || startDate);
  if (!startDate || !endDate) return fail(c, 400, "DATE_RANGE_REQUIRED", "Geçerli tarih aralığı seçilmedi.");
  const [saved, worked, people] = await Promise.all([
    c.env.DB.prepare("SELECT employee_id FROM hr_daily_range_roster WHERE main_company_id=? AND start_date=? AND end_date=? ORDER BY created_at").bind(companyId, startDate, endDate).all<Row>(),
    c.env.DB.prepare(`SELECT DISTINCT a.employee_id FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id WHERE e.main_company_id=? AND a.work_date>=? AND a.work_date<=? AND (a.day_shift=1 OR a.night_shift=1)`).bind(companyId, startDate, endDate).all<Row>(),
    c.env.DB.prepare("SELECT id FROM hr_daily_employees WHERE main_company_id=?").bind(companyId).all<Row>(),
  ]);
  const known = new Set((people.results || []).map((row) => text(row.id)));
  const employeeIds = [...new Set([...(saved.results || []), ...(worked.results || [])].map((row) => text(row.employee_id)))].filter((id) => known.has(id));
  return okItems(c, { startDate, endDate, employeeIds }, employeeIds);
}

async function saveRoster(c: Context<AppEnv>) {
  await ensureDailyAuditSchema(c);
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const startDate = dateOnly(body.startDate || body.start);
  const endDate = dateOnly(body.endDate || body.end || startDate);
  const requested = Array.isArray(body.employeeIds) ? [...new Set(body.employeeIds.map(text).filter(Boolean))] : [];
  if (!startDate || !endDate) return fail(c, 400, "DATE_RANGE_REQUIRED", "Geçerli tarih aralığı seçilmedi.");
  if (requested.length) {
    const allowed = await c.env.DB.prepare(`SELECT id FROM hr_daily_employees WHERE main_company_id=? AND id IN (${requested.map(() => "?").join(",")})`).bind(companyId, ...requested).all<Row>();
    if ((allowed.results || []).length !== requested.length) return fail(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
  }
  const [existingResult, workedResult] = await Promise.all([
    c.env.DB.prepare("SELECT id,employee_id FROM hr_daily_range_roster WHERE main_company_id=? AND start_date=? AND end_date=?").bind(companyId, startDate, endDate).all<Row>(),
    c.env.DB.prepare(`SELECT DISTINCT a.employee_id FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id WHERE e.main_company_id=? AND a.work_date>=? AND a.work_date<=? AND (a.day_shift=1 OR a.night_shift=1)`).bind(companyId, startDate, endDate).all<Row>(),
  ]);
  const existingRows = existingResult.results || [];
  const existingIds = new Set(existingRows.map((row) => text(row.employee_id)));
  const workedIds = (workedResult.results || []).map((row) => text(row.employee_id));
  const finalIds = [...new Set([...requested, ...workedIds])];
  const finalSet = new Set(finalIds);
  const actor = await actorOf(c);
  const statements: D1PreparedStatement[] = [];
  for (const employeeId of finalIds) {
    if (existingIds.has(employeeId)) continue;
    statements.push(c.env.DB.prepare("INSERT INTO hr_daily_range_roster (id,main_company_id,start_date,end_date,employee_id,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), companyId, startDate, endDate, employeeId, nowIso()));
    statements.push(auditStatement(c, { companyId, employeeId, workDate: startDate, action: "ROSTER_ADD", before: null, after: { startDate, endDate, included: true }, actor, source: "KYERP_ROSTER" }));
  }
  for (const row of existingRows) {
    const employeeId = text(row.employee_id);
    if (finalSet.has(employeeId)) continue;
    statements.push(c.env.DB.prepare("DELETE FROM hr_daily_range_roster WHERE id=?").bind(text(row.id)));
    statements.push(auditStatement(c, { companyId, employeeId, workDate: startDate, action: "ROSTER_REMOVE", before: { startDate, endDate, included: true }, after: { startDate, endDate, included: false }, actor, source: "KYERP_ROSTER" }));
  }
  if (statements.length) await c.env.DB.batch(statements);
  return okItems(c, { startDate, endDate, employeeIds: finalIds, changedCount: statements.length / 2 }, finalIds);
}

async function weeklySummary(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const start = dateOnly(c.req.query("startDate") || c.req.query("start"));
  const end = dateOnly(c.req.query("endDate") || c.req.query("end"));
  const result = await c.env.DB.prepare(`SELECT a.*,e.full_name,e.qualification FROM hr_daily_attendance a
    JOIN hr_daily_employees e ON e.id=a.employee_id
    WHERE e.main_company_id=? AND (?='' OR a.work_date>=?) AND (?='' OR a.work_date<=?) AND (a.day_shift=1 OR a.night_shift=1)
    ORDER BY e.full_name COLLATE NOCASE,a.work_date`).bind(companyId, start, start, end, end).all<Row>();
  const totals = new Map<string, Row>();
  for (const row of result.results || []) {
    const employeeId = text(row.employee_id);
    const current = totals.get(employeeId) || { id: `${employeeId}-${start}`, employeeId, fullName: text(row.full_name), name: text(row.full_name), qualification: text(row.qualification), dayWage: money(row.day_wage), nightWage: money(row.night_wage), dayCount: 0, nightCount: 0, dayTotal: 0, nightTotal: 0, totalAmount: 0, total: 0, weekStart: start, weekEnd: end };
    if (flag(row.day_shift)) { current.dayCount += 1; current.dayTotal = money(current.dayTotal + money(row.day_wage)); }
    if (flag(row.night_shift)) { current.nightCount += 1; current.nightTotal = money(current.nightTotal + money(row.night_wage)); }
    current.totalAmount = money(current.dayTotal + current.nightTotal);
    current.total = current.totalAmount;
    totals.set(employeeId, current);
  }
  return okList(c, [...totals.values()].sort((a, b) => text(a.fullName).localeCompare(text(b.fullName), "tr")));
}

async function dailyAudit(c: Context<AppEnv>) {
  await ensureDailyAuditSchema(c);
  const companyId = companyIdOf(c);
  const date = dateOnly(c.req.query("date"));
  const start = dateOnly(c.req.query("startDate") || c.req.query("start") || date);
  const end = dateOnly(c.req.query("endDate") || c.req.query("end") || date);
  const employeeId = text(c.req.query("employeeId"));
  const action = text(c.req.query("action"));
  const limitRaw = Number(c.req.query("limit") || 200);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 200;
  const result = await c.env.DB.prepare(`SELECT l.*,e.full_name,e.qualification FROM hr_daily_operation_audit l
    LEFT JOIN hr_daily_employees e ON e.id=l.employee_id AND e.main_company_id=l.main_company_id
    WHERE l.main_company_id=? AND (?='' OR l.work_date>=?) AND (?='' OR l.work_date<=?)
      AND (?='' OR l.employee_id=?) AND (?='' OR l.action=?)
    ORDER BY l.created_at DESC,l.id DESC LIMIT ?`)
    .bind(companyId, start, start, end, end, employeeId, employeeId, action, action, limit).all<Row>();
  const rows = (result.results || []).map((row) => ({
    id: text(row.id), employeeId: text(row.employee_id), personName: text(row.full_name) || "-", qualification: text(row.qualification),
    attendanceId: text(row.attendance_id), workDate: dateOnly(row.work_date), shift: text(row.shift), action: text(row.action),
    before: json(row.before_json), after: json(row.after_json), note: text(row.note), actorUserId: text(row.actor_user_id),
    actorLabel: text(row.actor_label) || "KY ERP Kullanıcısı", source: text(row.source), requestId: text(row.request_id), createdAt: row.created_at,
  }));
  return okList(c, rows);
}

function protect(handler: (c: Context<AppEnv>) => Promise<Response>) {
  return async (c: Context<AppEnv>) => {
    try { return await handler(c); }
    catch (error) {
      console.error(JSON.stringify({ code: "IK_DAILY_SAFETY_FAILED", path: c.req.path, message: error instanceof Error ? error.message : String(error) }));
      return fail(c, 500, "IK_DAILY_SAFETY_FAILED", "Günlük operasyon verisi güvenli şekilde işlenemedi.");
    }
  };
}

export function registerIkDailySafetyRoutes(app: Hono<AppEnv>) {
  // These routes are registered before the legacy relational routes in main.ts.
  // Hono stops at the first handler that returns a response, so the hardened write path is canonical.
  app.get("/api/ik/daily-attendance", protect(getAttendance));
  app.post("/api/ik/daily-attendance/save-range", protect(saveRange));
  app.get("/api/ik/daily-attendance/weekly-summary", protect(weeklySummary));
  app.get("/api/ik/daily-attendance/payment-slips", protect(weeklySummary));
  app.get("/api/ik/gunluk-personel/gun-kayitlari", protect(getFocusedRecords));
  app.post("/api/ik/gunluk-personel/gun-kayitlari", protect(saveFocusedRecords));
  app.get("/api/ik/gunluk-personel/liste", protect(getRoster));
  app.post("/api/ik/gunluk-personel/liste", protect(saveRoster));
  app.get("/api/ik/daily-operation-audit", protect(dailyAudit));
}
