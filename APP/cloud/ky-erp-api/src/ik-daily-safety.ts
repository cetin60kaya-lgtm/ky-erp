import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";
import { dailyMoneyCents, dailyRevisionConflict } from "./ik-daily-safety-v3-core";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) => (value == null ? "" : String(value).trim());
const flag = (value: unknown) => value === true || value === 1 || value === "1";
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => Math.round(num(value) * 100) / 100;
const dateOnly = (value: unknown) => text(value).slice(0, 10);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const nowIso = () => new Date().toISOString();

const aliases = new Set([
  "",
  "mecit-hakan",
  "main-mecit-hakan",
  "mecit-hakan-gursu",
  "hakan-baski",
  "main-hakan",
  "main-hakan-baski",
  "hkn-baski",
]);

const canonicalCompany = (value: unknown) => {
  const normalized = text(value)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return aliases.has(normalized) ? "mecit-hakan" : normalized;
};

function companyIdOf(c: Context<AppEnv>, body: Row = {}) {
  return canonicalCompany(
    c.req.header("X-KYERP-Tenant-Slug") ||
      body.mainCompanyId ||
      body.mainCompanySlug ||
      body.main_company_id ||
      body.main_company_slug ||
      c.req.query("mainCompanyId") ||
      c.req.query("mainCompanySlug"),
  );
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Row)
      : {};
  } catch {
    return {};
  }
}

function ok(c: Context<AppEnv>, data: unknown, status: 200 | 201 = 200) {
  return c.json({ ok: true, success: true, data }, status);
}

function okItems(c: Context<AppEnv>, data: unknown, items: unknown[]) {
  return c.json({ ok: true, success: true, data, items });
}

function fail(
  c: Context<AppEnv>,
  status: 400 | 403 | 404 | 409 | 500,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      ok: false,
      success: false,
      error: { code, message, ...(details === undefined ? {} : { details }) },
    },
    status,
  );
}

function shiftOf(value: unknown): "day" | "night" {
  const normalized = text(value).toLocaleLowerCase("tr-TR");
  return ["n", "night", "gece"].includes(normalized) ? "night" : "day";
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(c: Context<AppEnv>) {
  if (!schemaReady) {
    schemaReady = c.env.DB.batch([
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
      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_attendance_revision (
        id TEXT PRIMARY KEY,
        main_company_id TEXT NOT NULL,
        attendance_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        work_date TEXT NOT NULL,
        revision INTEGER NOT NULL,
        day_shift INTEGER NOT NULL DEFAULT 0,
        night_shift INTEGER NOT NULL DEFAULT 0,
        day_wage_cents INTEGER NOT NULL DEFAULT 0,
        night_wage_cents INTEGER NOT NULL DEFAULT 0,
        total_amount_cents INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'WAITING',
        change_type TEXT NOT NULL,
        reason TEXT,
        actor_user_id TEXT,
        actor_label TEXT,
        source TEXT NOT NULL DEFAULT 'KYERP_WEB',
        request_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(attendance_id, revision)
      )`),
      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_period_lock (
        id TEXT PRIMARY KEY,
        main_company_id TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'LOCKED',
        reason TEXT,
        locked_by_user_id TEXT,
        locked_by_label TEXT,
        locked_at TEXT,
        unlocked_by_user_id TEXT,
        unlocked_by_label TEXT,
        unlocked_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS hr_daily_attendance_notes (
        id TEXT PRIMARY KEY,
        main_company_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        work_date TEXT NOT NULL,
        shift TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        UNIQUE(main_company_id, employee_id, work_date, shift)
      )`),
      c.env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_daily_revision_attendance ON hr_daily_attendance_revision(main_company_id, attendance_id, revision DESC)",
      ),
      c.env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_daily_revision_employee_date ON hr_daily_attendance_revision(main_company_id, employee_id, work_date, revision DESC)",
      ),
      c.env.DB.prepare(
        "CREATE INDEX IF NOT EXISTS idx_daily_period_lock_range ON hr_daily_period_lock(main_company_id, status, start_date, end_date)",
      ),
      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_revision_no_update
        BEFORE UPDATE ON hr_daily_attendance_revision
        BEGIN SELECT RAISE(ABORT,'daily attendance revision is append-only'); END`),
      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_revision_no_delete
        BEFORE DELETE ON hr_daily_attendance_revision
        BEGIN SELECT RAISE(ABORT,'daily attendance revision is append-only'); END`),
      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_audit_no_update
        BEFORE UPDATE ON hr_daily_operation_audit
        BEGIN SELECT RAISE(ABORT,'daily operation audit is append-only'); END`),
      c.env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_daily_audit_no_delete
        BEFORE DELETE ON hr_daily_operation_audit
        BEGIN SELECT RAISE(ABORT,'daily operation audit is append-only'); END`),
    ])
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

async function actorOf(c: Context<AppEnv>) {
  let user: Row | null = null;
  try {
    user = (await getAuthenticatedUser(c)) as Row | null;
  } catch {
    // The outer application auth middleware is authoritative.
  }
  return {
    id: text(user?.id || user?.userId || user?.user_id),
    label:
      text(
        user?.fullName ||
          user?.full_name ||
          user?.name ||
          user?.username ||
          user?.email ||
          user?.role,
      ) || "KY ERP Kullanıcısı",
    role: text(user?.role).toUpperCase().replace(/İ/g, "I"),
    requestId: text(c.get?.("requestId")) || crypto.randomUUID(),
  };
}

function attendanceSnapshot(row: Row | null | undefined) {
  if (!row) return null;
  return {
    id: text(row.id),
    employeeId: text(row.employee_id ?? row.employeeId),
    workDate: dateOnly(row.work_date ?? row.workDate),
    day: flag(row.day_shift ?? row.dayShift ?? row.day),
    night: flag(row.night_shift ?? row.nightShift ?? row.night),
    dayWage: money(row.day_wage ?? row.dayWage),
    nightWage: money(row.night_wage ?? row.nightWage),
    totalAmount: money(row.total_amount ?? row.totalAmount),
    paymentStatus: text(row.payment_status ?? row.paymentStatus) || "WAITING",
    createdAt: text(row.created_at ?? row.createdAt),
    updatedAt: text(row.updated_at ?? row.updatedAt),
  };
}

function attendanceDto(row: Row) {
  const snapshot = attendanceSnapshot(row)!;
  return {
    ...snapshot,
    date: snapshot.workDate,
    dayShift: snapshot.day,
    nightShift: snapshot.night,
  };
}

function auditStmt(c: Context<AppEnv>, input: Row) {
  return c.env.DB.prepare(`INSERT INTO hr_daily_operation_audit
    (id,main_company_id,employee_id,attendance_id,work_date,shift,action,before_json,after_json,note,actor_user_id,actor_label,source,request_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(),
    canonicalCompany(input.companyId),
    text(input.employeeId) || null,
    text(input.attendanceId) || null,
    dateOnly(input.workDate) || null,
    text(input.shift),
    text(input.action),
    input.before == null ? null : JSON.stringify(input.before),
    input.after == null ? null : JSON.stringify(input.after),
    text(input.note) || null,
    text(input.actor?.id) || null,
    text(input.actor?.label) || "KY ERP Kullanıcısı",
    text(input.source) || "KYERP_WEB",
    text(input.actor?.requestId) || null,
    nowIso(),
  );
}

function revisionStmt(c: Context<AppEnv>, input: Row) {
  const state = input.state || {};
  return c.env.DB.prepare(`INSERT INTO hr_daily_attendance_revision
    (id,main_company_id,attendance_id,employee_id,work_date,revision,day_shift,night_shift,day_wage_cents,night_wage_cents,total_amount_cents,payment_status,change_type,reason,actor_user_id,actor_label,source,request_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(),
    canonicalCompany(input.companyId),
    text(input.attendanceId),
    text(input.employeeId),
    dateOnly(input.workDate),
    Number(input.revision),
    flag(state.day_shift ?? state.day) ? 1 : 0,
    flag(state.night_shift ?? state.night) ? 1 : 0,
    dailyMoneyCents(state.day_wage ?? state.dayWage),
    dailyMoneyCents(state.night_wage ?? state.nightWage),
    dailyMoneyCents(state.total_amount ?? state.totalAmount),
    text(state.payment_status ?? state.paymentStatus) || "WAITING",
    text(input.changeType),
    text(input.reason) || null,
    text(input.actor?.id) || null,
    text(input.actor?.label) || "KY ERP Kullanıcısı",
    text(input.source) || "KYERP_WEB",
    text(input.actor?.requestId) || null,
    nowIso(),
  );
}

async function lockedPeriod(c: Context<AppEnv>, companyId: string, workDate: string) {
  return c.env.DB.prepare(`SELECT id,start_date,end_date,reason,locked_by_label,locked_at
      FROM hr_daily_period_lock
      WHERE main_company_id=? AND status='LOCKED' AND start_date<=? AND end_date>=?
      ORDER BY locked_at DESC,updated_at DESC LIMIT 1`)
    .bind(companyId, workDate, workDate)
    .first<Row>();
}

async function listAttendance(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId = companyIdOf(c);
  const singleDate = dateOnly(c.req.query("date"));
  const start = dateOnly(c.req.query("startDate") || c.req.query("start") || singleDate);
  const end = dateOnly(c.req.query("endDate") || c.req.query("end") || singleDate);

  const result = await c.env.DB.prepare(`SELECT a.*
      FROM hr_daily_attendance a
      JOIN hr_daily_employees e ON e.id=a.employee_id
      WHERE e.main_company_id=?
        AND (?='' OR a.work_date>=?)
        AND (?='' OR a.work_date<=?)
      ORDER BY a.work_date ASC,e.full_name ASC,a.id ASC`)
    .bind(companyId, start, start, end, end)
    .all<Row>();

  const rows = (result.results || []).map(attendanceDto);
  return okItems(c, rows, rows);
}

async function listFocused(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId = companyIdOf(c);
  const date = dateOnly(c.req.query("date") || c.req.query("selectedDate"));
  const shift = shiftOf(c.req.query("shift"));
  if (!validDate(date)) {
    return fail(c, 400, "DATE_REQUIRED", "Geçerli tarih seçilmedi.");
  }

  const result = await c.env.DB.prepare(`SELECT
        e.id AS employee_id,
        e.full_name,
        e.qualification,
        a.id AS attendance_id,
        a.day_shift,
        a.night_shift,
        a.updated_at AS attendance_updated_at,
        COALESCE(n.note,'') AS note,
        n.updated_at AS note_updated_at
      FROM hr_daily_employees e
      LEFT JOIN hr_daily_attendance a
        ON a.employee_id=e.id AND a.work_date=?
      LEFT JOIN hr_daily_attendance_notes n
        ON n.main_company_id=e.main_company_id
       AND n.employee_id=e.id
       AND n.work_date=?
       AND n.shift=?
      WHERE e.main_company_id=?
      ORDER BY e.qualification ASC,e.full_name ASC,e.id ASC`)
    .bind(date, date, shift, companyId)
    .all<Row>();

  const rows = (result.results || []).map((row) => ({
    employeeId: text(row.employee_id),
    personelId: text(row.employee_id),
    name: text(row.full_name),
    qualification: text(row.qualification),
    date,
    shift,
    selected: shift === "day" ? flag(row.day_shift) : flag(row.night_shift),
    day: flag(row.day_shift),
    night: flag(row.night_shift),
    dayShift: flag(row.day_shift),
    nightShift: flag(row.night_shift),
    note: text(row.note),
    updatedAt: text(row.attendance_updated_at),
    noteUpdatedAt: text(row.note_updated_at),
  }));

  return okItems(c, rows, rows);
}

async function listRoster(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId = companyIdOf(c);
  const start = dateOnly(c.req.query("startDate") || c.req.query("start"));
  const end = dateOnly(c.req.query("endDate") || c.req.query("end") || start);
  if (!validDate(start) || !validDate(end) || end < start) {
    return fail(c, 400, "DATE_RANGE_REQUIRED", "Geçerli tarih aralığı seçilmedi.");
  }

  const [savedResult, workedResult, knownResult] = await Promise.all([
    c.env.DB.prepare(`SELECT employee_id
        FROM hr_daily_range_roster
        WHERE main_company_id=? AND start_date=? AND end_date=?`)
      .bind(companyId, start, end)
      .all<Row>(),
    c.env.DB.prepare(`SELECT DISTINCT a.employee_id
        FROM hr_daily_attendance a
        JOIN hr_daily_employees e ON e.id=a.employee_id
        WHERE e.main_company_id=?
          AND a.work_date>=? AND a.work_date<=?
          AND (a.day_shift=1 OR a.night_shift=1)`)
      .bind(companyId, start, end)
      .all<Row>(),
    c.env.DB.prepare("SELECT id FROM hr_daily_employees WHERE main_company_id=?")
      .bind(companyId)
      .all<Row>(),
  ]);

  const knownIds = new Set((knownResult.results || []).map((row) => text(row.id)));
  const employeeIds = [
    ...new Set([
      ...(savedResult.results || []).map((row) => text(row.employee_id)),
      ...(workedResult.results || []).map((row) => text(row.employee_id)),
    ]),
  ].filter((id) => id && knownIds.has(id));

  const data = { startDate: start, endDate: end, employeeIds };
  return okItems(c, data, employeeIds);
}

async function writeRows(c: Context<AppEnv>, body: Row, rawRows: Row[], source: string) {
  await ensureSchema(c);
  const companyId = companyIdOf(c, body);
  const rows: Row[] = rawRows.map((row: Row) => ({
    ...row,
    employeeId: text(row.employeeId || row.personId || row.personelId),
    workDate: dateOnly(row.workDate || row.date),
  }));

  if (!rows.length) {
    return fail(c, 400, "ROWS_REQUIRED", "Kaydedilecek devam satırı bulunamadı.");
  }
  if (rows.some((row) => !row.employeeId || !validDate(row.workDate))) {
    return fail(
      c,
      400,
      "DAILY_ROW_INVALID",
      "Her günlük kayıtta personel ve geçerli tarih zorunludur.",
    );
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.employeeId}|${row.workDate}`;
    if (seen.has(key)) {
      return fail(
        c,
        400,
        "DUPLICATE_DAILY_ROW",
        `${row.employeeId} / ${row.workDate} aynı istekte birden fazla kez gönderildi.`,
      );
    }
    seen.add(key);
  }

  const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
  const peopleResult = await c.env.DB.prepare(`SELECT id,full_name,day_wage,night_wage
      FROM hr_daily_employees
      WHERE main_company_id=? AND id IN (${employeeIds.map(() => "?").join(",")})`)
    .bind(companyId, ...employeeIds)
    .all<Row>();
  const people = peopleResult.results || [];
  if (people.length !== employeeIds.length) {
    return fail(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
  }
  const peopleById = new Map(people.map((row) => [text(row.id), row]));

  const currentResult = await c.env.DB.prepare(`SELECT a.*
      FROM hr_daily_attendance a
      JOIN hr_daily_employees e ON e.id=a.employee_id
      WHERE e.main_company_id=? AND a.employee_id IN (${employeeIds.map(() => "?").join(",")})`)
    .bind(companyId, ...employeeIds)
    .all<Row>();
  const currentByKey = new Map(
    (currentResult.results || []).map((row) => [
      `${text(row.employee_id)}|${dateOnly(row.work_date)}`,
      row,
    ]),
  );

  for (const row of rows) {
    const lock = await lockedPeriod(c, companyId, row.workDate);
    if (lock) {
      return fail(c, 409, "DAILY_PERIOD_LOCKED", `${row.workDate} tarihi kilitli dönemde.`, {
        lock,
      });
    }
    const current = currentByKey.get(`${row.employeeId}|${row.workDate}`);
    const conflict = dailyRevisionConflict(
      current?.updated_at,
      row.expectedUpdatedAt || row.expected_updated_at,
    );
    if (conflict === "DAILY_REVISION_REQUIRED") {
      return fail(
        c,
        409,
        conflict,
        `${text(peopleById.get(row.employeeId)?.full_name) || "Personel"} / ${row.workDate} kaydı güncellenmeden önce son sürümü okunmalıdır.`,
      );
    }
    if (conflict === "DAILY_RECORD_CHANGED") {
      return fail(
        c,
        409,
        conflict,
        `${text(peopleById.get(row.employeeId)?.full_name) || "Personel"} / ${row.workDate} başka bir bilgisayarda değişti. Ekranı yenileyip tekrar kontrol edin.`,
      );
    }
  }

  const attendanceIds = [
    ...new Set((currentResult.results || []).map((row) => text(row.id)).filter(Boolean)),
  ];
  const revisionByAttendanceId = new Map<string, number>();
  if (attendanceIds.length) {
    const revisionResult = await c.env.DB.prepare(`SELECT attendance_id,MAX(revision) revision
        FROM hr_daily_attendance_revision
        WHERE main_company_id=? AND attendance_id IN (${attendanceIds.map(() => "?").join(",")})
        GROUP BY attendance_id`)
      .bind(companyId, ...attendanceIds)
      .all<Row>();
    for (const row of revisionResult.results || []) {
      revisionByAttendanceId.set(text(row.attendance_id), Number(row.revision) || 0);
    }
  }

  const actor = await actorOf(c);
  const statements: D1PreparedStatement[] = [];
  const saved: Row[] = [];

  for (const row of rows) {
    const current = currentByKey.get(`${row.employeeId}|${row.workDate}`);
    const person = peopleById.get(row.employeeId) || {};
    const day = flag(row.dayShift ?? row.day);
    const night = flag(row.nightShift ?? row.night);

    if (!current && !day && !night) continue;

    const dayWage = current ? money(current.day_wage) : money(row.dayWage ?? person.day_wage);
    const nightWage = current
      ? money(current.night_wage)
      : money(row.nightWage ?? person.night_wage);
    const totalAmount = money((day ? dayWage : 0) + (night ? nightWage : 0));
    const paymentStatus = text(row.paymentStatus || current?.payment_status) || "WAITING";
    const timestamp = nowIso();
    const attendanceId = text(current?.id || row.id) || crypto.randomUUID();
    const before = attendanceSnapshot(current);
    const afterRaw = {
      id: attendanceId,
      employee_id: row.employeeId,
      work_date: row.workDate,
      day_shift: day ? 1 : 0,
      night_shift: night ? 1 : 0,
      day_wage: dayWage,
      night_wage: nightWage,
      total_amount: totalAmount,
      payment_status: paymentStatus,
      created_at: current?.created_at || timestamp,
      updated_at: timestamp,
    };
    const after = attendanceSnapshot(afterRaw);
    const unchanged =
      current &&
      flag(current.day_shift) === day &&
      flag(current.night_shift) === night &&
      money(current.day_wage) === dayWage &&
      money(current.night_wage) === nightWage &&
      money(current.total_amount) === totalAmount &&
      text(current.payment_status || "WAITING") === paymentStatus;

    if (unchanged) {
      saved.push(current);
      continue;
    }

    let revision = revisionByAttendanceId.get(attendanceId) || 0;
    if (current && revision === 0) {
      revision = 1;
      statements.push(
        revisionStmt(c, {
          companyId,
          attendanceId,
          employeeId: row.employeeId,
          workDate: row.workDate,
          revision,
          state: current,
          changeType: "BASELINE",
          reason: "V3 öncesi mevcut kaydın başlangıç anlık görüntüsü",
          actor,
          source: "KYERP_V3_BASELINE",
        }),
      );
    }

    revision += 1;
    const changeType = !current ? "CREATE" : !day && !night ? "REMOVE" : "CORRECTION";
    statements.push(
      revisionStmt(c, {
        companyId,
        attendanceId,
        employeeId: row.employeeId,
        workDate: row.workDate,
        revision,
        state: afterRaw,
        changeType,
        reason: text(row.reason || row.note),
        actor,
        source,
      }),
    );

    if (current) {
      statements.push(
        c.env.DB.prepare(`UPDATE hr_daily_attendance
          SET day_shift=?,night_shift=?,day_wage=?,night_wage=?,total_amount=?,payment_status=?,updated_at=?
          WHERE id=?`).bind(
          day ? 1 : 0,
          night ? 1 : 0,
          dayWage,
          nightWage,
          totalAmount,
          paymentStatus,
          timestamp,
          attendanceId,
        ),
      );
    } else {
      statements.push(
        c.env.DB.prepare(`INSERT INTO hr_daily_attendance
          (id,employee_id,work_date,day_shift,night_shift,day_wage,night_wage,total_amount,payment_status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
          attendanceId,
          row.employeeId,
          row.workDate,
          day ? 1 : 0,
          night ? 1 : 0,
          dayWage,
          nightWage,
          totalAmount,
          paymentStatus,
          timestamp,
          timestamp,
        ),
      );
    }

    statements.push(
      auditStmt(c, {
        companyId,
        employeeId: row.employeeId,
        attendanceId,
        workDate: row.workDate,
        action: `ATTENDANCE_${changeType}`,
        before,
        after,
        actor,
        note: text(row.reason || row.note),
        source,
      }),
    );
    revisionByAttendanceId.set(attendanceId, revision);
    saved.push(afterRaw);
  }

  if (statements.length) await c.env.DB.batch(statements);
  return ok(c, saved.map(attendanceDto));
}

async function saveRange(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const rows = Array.isArray(body.rows)
    ? body.rows
    : Array.isArray(body.entries)
      ? body.entries.map((entry: Row) => ({ ...entry, employeeId: body.employeeId }))
      : body.employeeId
        ? [body]
        : [];
  return writeRows(c, body, rows, "KYERP_RANGE_V3");
}

async function saveFocused(c: Context<AppEnv>) {
  await ensureSchema(c);
  const body = await bodyOf(c);
  const date = dateOnly(body.date || body.selectedDate);
  const shift = shiftOf(body.shift);
  const entries = Array.isArray(body.personnelEntries) ? (body.personnelEntries as Row[]) : [];

  if (!validDate(date)) return fail(c, 400, "DATE_REQUIRED", "Geçerli tarih seçilmedi.");
  if (!entries.length) return fail(c, 400, "ROWS_REQUIRED", "Kaydedilecek personel seçilmedi.");

  const companyId = companyIdOf(c, body);
  const employeeIds = [
    ...new Set(entries.map((entry) => text(entry.personelId || entry.employeeId)).filter(Boolean)),
  ];
  const currentResult = employeeIds.length
    ? await c.env.DB.prepare(`SELECT a.*
        FROM hr_daily_attendance a
        JOIN hr_daily_employees e ON e.id=a.employee_id
        WHERE e.main_company_id=? AND a.work_date=?
          AND a.employee_id IN (${employeeIds.map(() => "?").join(",")})`)
        .bind(companyId, date, ...employeeIds)
        .all<Row>()
    : { results: [] as Row[] };
  const currentByEmployee = new Map(
    (currentResult.results || []).map((row) => [text(row.employee_id), row]),
  );

  const rows = entries.map((entry) => {
    const employeeId = text(entry.personelId || entry.employeeId);
    const current = currentByEmployee.get(employeeId);
    const status = text(entry.status).toUpperCase().replace(/İ/g, "I");
    const selected = !["REMOVE", "PASSIVE", "INACTIVE", "DELETE"].includes(status);
    return {
      employeeId,
      workDate: date,
      dayShift: shift === "day" ? selected : flag(current?.day_shift),
      nightShift: shift === "night" ? selected : flag(current?.night_shift),
      expectedUpdatedAt: entry.expectedUpdatedAt || entry.expected_updated_at,
      note: entry.note,
    };
  });

  const response = await writeRows(c, body, rows, "KYERP_DAILY_ENTRY_V3");
  if (response.status >= 400) return response;

  const actor = await actorOf(c);
  const statements: D1PreparedStatement[] = [];
  const notesResult = employeeIds.length
    ? await c.env.DB.prepare(`SELECT employee_id,note
        FROM hr_daily_attendance_notes
        WHERE main_company_id=? AND work_date=? AND shift=?
          AND employee_id IN (${employeeIds.map(() => "?").join(",")})`)
        .bind(companyId, date, shift, ...employeeIds)
        .all<Row>()
    : { results: [] as Row[] };
  const noteByEmployee = new Map(
    (notesResult.results || []).map((row) => [text(row.employee_id), text(row.note)]),
  );

  for (const entry of entries) {
    const employeeId = text(entry.personelId || entry.employeeId);
    const before = noteByEmployee.get(employeeId) || "";
    const after = text(entry.note);
    if (before === after) continue;

    statements.push(
      c.env.DB.prepare(`INSERT INTO hr_daily_attendance_notes
        (id,main_company_id,employee_id,work_date,shift,note,updated_at)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(main_company_id,employee_id,work_date,shift)
        DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`).bind(
        crypto.randomUUID(),
        companyId,
        employeeId,
        date,
        shift,
        after,
        nowIso(),
      ),
    );
    statements.push(
      auditStmt(c, {
        companyId,
        employeeId,
        workDate: date,
        shift,
        action: "NOTE_UPDATE",
        before: { note: before },
        after: { note: after },
        actor,
        note: after,
        source: "KYERP_DAILY_ENTRY_V3",
      }),
    );
  }

  if (statements.length) await c.env.DB.batch(statements);
  return response;
}

async function excelApply(c: Context<AppEnv>) {
  await ensureSchema(c);
  const body = await bodyOf(c);
  const rows = Array.isArray(body.rows)
    ? body.rows.filter((row: Row) => row?.enabled !== false && row?.employeeId && row?.workDate)
    : [];
  if (!rows.length) {
    return fail(c, 400, "ROWS_REQUIRED", "Excel aktarımında kaydedilecek satır bulunamadı.");
  }

  const response = await writeRows(
    c,
    body,
    rows.map((row: Row) => ({
      employeeId: text(row.employeeId),
      workDate: dateOnly(row.workDate),
      dayShift: Boolean(row.dayShift),
      nightShift: Boolean(row.nightShift),
      dayWage: row.dayWage,
      nightWage: row.nightWage,
      expectedUpdatedAt: row.expectedUpdatedAt || row.expected_updated_at,
      reason: "Excel günlük giriş aktarımı",
    })),
    "KYERP_EXCEL_V3",
  );
  if (response.status >= 400) return response;

  const companyId = companyIdOf(c, body);
  const actor = await actorOf(c);
  const statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    for (const shift of ["day", "night"] as const) {
      const note = text(shift === "day" ? row.dayNote : row.nightNote);
      if (!note) continue;
      const employeeId = text(row.employeeId);
      const workDate = dateOnly(row.workDate);
      statements.push(
        c.env.DB.prepare(`INSERT INTO hr_daily_attendance_notes
          (id,main_company_id,employee_id,work_date,shift,note,updated_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(main_company_id,employee_id,work_date,shift)
          DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`).bind(
          crypto.randomUUID(),
          companyId,
          employeeId,
          workDate,
          shift,
          note,
          nowIso(),
        ),
      );
      statements.push(
        auditStmt(c, {
          companyId,
          employeeId,
          workDate,
          shift,
          action: "NOTE_UPDATE",
          before: null,
          after: { note },
          actor,
          note,
          source: "KYERP_EXCEL_V3",
        }),
      );
    }
  }
  if (statements.length) await c.env.DB.batch(statements);
  return response;
}

async function saveRoster(c: Context<AppEnv>) {
  await ensureSchema(c);
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const start = dateOnly(body.startDate || body.start);
  const end = dateOnly(body.endDate || body.end || start);
  const requested = Array.isArray(body.employeeIds)
    ? [...new Set(body.employeeIds.map(text).filter(Boolean))]
    : [];

  if (!validDate(start) || !validDate(end) || end < start) {
    return fail(c, 400, "DATE_RANGE_REQUIRED", "Geçerli tarih aralığı seçilmedi.");
  }

  if (requested.length) {
    const allowedResult = await c.env.DB.prepare(`SELECT id
        FROM hr_daily_employees
        WHERE main_company_id=? AND id IN (${requested.map(() => "?").join(",")})`)
      .bind(companyId, ...requested)
      .all<Row>();
    if ((allowedResult.results || []).length !== requested.length) {
      return fail(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
    }
  }

  const [existingResult, workedResult] = await Promise.all([
    c.env.DB.prepare(`SELECT id,employee_id
        FROM hr_daily_range_roster
        WHERE main_company_id=? AND start_date=? AND end_date=?`)
      .bind(companyId, start, end)
      .all<Row>(),
    c.env.DB.prepare(`SELECT DISTINCT a.employee_id
        FROM hr_daily_attendance a
        JOIN hr_daily_employees e ON e.id=a.employee_id
        WHERE e.main_company_id=?
          AND a.work_date>=? AND a.work_date<=?
          AND (a.day_shift=1 OR a.night_shift=1)`)
      .bind(companyId, start, end)
      .all<Row>(),
  ]);

  const existing = existingResult.results || [];
  const existingIds = new Set(existing.map((row) => text(row.employee_id)));
  const finalIds = [
    ...new Set([
      ...requested,
      ...(workedResult.results || []).map((row) => text(row.employee_id)),
    ]),
  ];
  const finalSet = new Set(finalIds);
  const actor = await actorOf(c);
  const statements: D1PreparedStatement[] = [];

  for (const employeeId of finalIds) {
    if (existingIds.has(employeeId)) continue;
    statements.push(
      c.env.DB.prepare(`INSERT INTO hr_daily_range_roster
        (id,main_company_id,start_date,end_date,employee_id,created_at)
        VALUES (?,?,?,?,?,?)`).bind(
        crypto.randomUUID(),
        companyId,
        start,
        end,
        employeeId,
        nowIso(),
      ),
    );
    statements.push(
      auditStmt(c, {
        companyId,
        employeeId,
        workDate: start,
        action: "ROSTER_ADD",
        before: null,
        after: { startDate: start, endDate: end, included: true },
        actor,
        source: "KYERP_ROSTER_V3",
      }),
    );
  }

  for (const row of existing) {
    const employeeId = text(row.employee_id);
    if (finalSet.has(employeeId)) continue;
    statements.push(
      c.env.DB.prepare("DELETE FROM hr_daily_range_roster WHERE id=?").bind(text(row.id)),
    );
    statements.push(
      auditStmt(c, {
        companyId,
        employeeId,
        workDate: start,
        action: "ROSTER_REMOVE",
        before: { startDate: start, endDate: end, included: true },
        after: { startDate: start, endDate: end, included: false },
        actor,
        source: "KYERP_ROSTER_V3",
      }),
    );
  }

  if (statements.length) await c.env.DB.batch(statements);
  const data = { startDate: start, endDate: end, employeeIds: finalIds };
  return okItems(c, data, finalIds);
}

async function auditGet(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId = companyIdOf(c);
  const date = dateOnly(c.req.query("date"));
  const start = dateOnly(c.req.query("startDate") || c.req.query("start") || date);
  const end = dateOnly(c.req.query("endDate") || c.req.query("end") || date);
  const employeeId = text(c.req.query("employeeId"));
  const action = text(c.req.query("action"));
  const limit = Math.max(
    1,
    Math.min(500, Math.trunc(Number(c.req.query("limit") || 200) || 200)),
  );
  const result = await c.env.DB.prepare(`SELECT l.*,e.full_name,e.qualification
      FROM hr_daily_operation_audit l
      LEFT JOIN hr_daily_employees e
        ON e.id=l.employee_id AND e.main_company_id=l.main_company_id
      WHERE l.main_company_id=?
        AND (?='' OR l.work_date>=?)
        AND (?='' OR l.work_date<=?)
        AND (?='' OR l.employee_id=?)
        AND (?='' OR l.action=?)
      ORDER BY l.created_at DESC,l.id DESC LIMIT ?`)
    .bind(
      companyId,
      start,
      start,
      end,
      end,
      employeeId,
      employeeId,
      action,
      action,
      limit,
    )
    .all<Row>();
  const rows = (result.results || []).map((row) => ({
    id: text(row.id),
    employeeId: text(row.employee_id),
    personName: text(row.full_name) || "-",
    qualification: text(row.qualification),
    attendanceId: text(row.attendance_id),
    workDate: dateOnly(row.work_date),
    shift: text(row.shift),
    action: text(row.action),
    before: row.before_json ? JSON.parse(text(row.before_json)) : null,
    after: row.after_json ? JSON.parse(text(row.after_json)) : null,
    note: text(row.note),
    actorUserId: text(row.actor_user_id),
    actorLabel: text(row.actor_label) || "KY ERP Kullanıcısı",
    source: text(row.source),
    requestId: text(row.request_id),
    createdAt: row.created_at,
  }));
  return ok(c, rows);
}

async function revisions(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId = companyIdOf(c);
  const employeeId = text(c.req.query("employeeId"));
  const workDate = dateOnly(c.req.query("date") || c.req.query("workDate"));
  const attendanceId = text(c.req.query("attendanceId"));
  const limit = Math.max(
    1,
    Math.min(500, Math.trunc(Number(c.req.query("limit") || 200) || 200)),
  );
  const result = await c.env.DB.prepare(`SELECT * FROM hr_daily_attendance_revision
      WHERE main_company_id=?
        AND (?='' OR employee_id=?)
        AND (?='' OR work_date=?)
        AND (?='' OR attendance_id=?)
      ORDER BY created_at DESC,revision DESC LIMIT ?`)
    .bind(
      companyId,
      employeeId,
      employeeId,
      workDate,
      workDate,
      attendanceId,
      attendanceId,
      limit,
    )
    .all<Row>();
  return ok(
    c,
    (result.results || []).map((row) => ({
      id: text(row.id),
      attendanceId: text(row.attendance_id),
      employeeId: text(row.employee_id),
      workDate: dateOnly(row.work_date),
      revision: Number(row.revision),
      day: flag(row.day_shift),
      night: flag(row.night_shift),
      dayWage: Number(row.day_wage_cents || 0) / 100,
      nightWage: Number(row.night_wage_cents || 0) / 100,
      totalAmount: Number(row.total_amount_cents || 0) / 100,
      paymentStatus: text(row.payment_status),
      changeType: text(row.change_type),
      reason: text(row.reason),
      actorLabel: text(row.actor_label),
      source: text(row.source),
      requestId: text(row.request_id),
      createdAt: row.created_at,
    })),
  );
}

async function lockGet(c: Context<AppEnv>) {
  await ensureSchema(c);
  const companyId = companyIdOf(c);
  const date = dateOnly(c.req.query("date"));
  const result = await c.env.DB.prepare(`SELECT * FROM hr_daily_period_lock
      WHERE main_company_id=?
        AND (?='' OR (start_date<=? AND end_date>=?))
      ORDER BY updated_at DESC LIMIT 100`)
    .bind(companyId, date, date, date)
    .all<Row>();
  return ok(c, result.results || []);
}

async function lockWrite(c: Context<AppEnv>) {
  await ensureSchema(c);
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const start = dateOnly(body.startDate || body.start);
  const end = dateOnly(body.endDate || body.end || start);
  if (!validDate(start) || !validDate(end) || end < start) {
    return fail(
      c,
      400,
      "DATE_RANGE_REQUIRED",
      "Geçerli dönem başlangıç ve bitiş tarihi zorunludur.",
    );
  }

  const actor = await actorOf(c);
  const action = text(body.action || body.status).toUpperCase().replace(/İ/g, "I");
  const shouldLock = ["LOCK", "LOCKED"].includes(action);
  if (!shouldLock && !["UNLOCK", "OPEN"].includes(action)) {
    return fail(
      c,
      400,
      "LOCK_ACTION_REQUIRED",
      "Dönem kilidi için LOCK veya UNLOCK işlemi seçilmelidir.",
    );
  }
  const reason = text(body.reason || body.note);
  if (!reason) {
    return fail(
      c,
      400,
      "LOCK_REASON_REQUIRED",
      "Dönem kilidi değişikliğinde açıklama zorunludur.",
    );
  }

  const existing = await c.env.DB.prepare(`SELECT * FROM hr_daily_period_lock
      WHERE main_company_id=? AND start_date=? AND end_date=?
      ORDER BY updated_at DESC LIMIT 1`)
    .bind(companyId, start, end)
    .first<Row>();
  const id = text(existing?.id) || crypto.randomUUID();
  const timestamp = nowIso();

  if (existing) {
    await c.env.DB.prepare(`UPDATE hr_daily_period_lock SET
        status=?,reason=?,locked_by_user_id=?,locked_by_label=?,locked_at=?,
        unlocked_by_user_id=?,unlocked_by_label=?,unlocked_at=?,updated_at=?
      WHERE id=?`)
      .bind(
        shouldLock ? "LOCKED" : "OPEN",
        reason,
        shouldLock ? actor.id || null : existing.locked_by_user_id,
        shouldLock ? actor.label : existing.locked_by_label,
        shouldLock ? timestamp : existing.locked_at,
        shouldLock ? null : actor.id || null,
        shouldLock ? null : actor.label,
        shouldLock ? null : timestamp,
        timestamp,
        id,
      )
      .run();
  } else {
    await c.env.DB.prepare(`INSERT INTO hr_daily_period_lock
      (id,main_company_id,start_date,end_date,status,reason,locked_by_user_id,locked_by_label,locked_at,unlocked_by_user_id,unlocked_by_label,unlocked_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        id,
        companyId,
        start,
        end,
        shouldLock ? "LOCKED" : "OPEN",
        reason,
        shouldLock ? actor.id || null : null,
        shouldLock ? actor.label : null,
        shouldLock ? timestamp : null,
        shouldLock ? null : actor.id || null,
        shouldLock ? null : actor.label,
        shouldLock ? null : timestamp,
        timestamp,
      )
      .run();
  }

  await c.env.DB.batch([
    auditStmt(c, {
      companyId,
      workDate: start,
      action: shouldLock ? "PERIOD_LOCK" : "PERIOD_UNLOCK",
      before: existing || null,
      after: {
        id,
        startDate: start,
        endDate: end,
        status: shouldLock ? "LOCKED" : "OPEN",
        reason,
      },
      actor,
      note: reason,
      source: "KYERP_PERIOD_LOCK_V3",
    }),
  ]);

  return ok(c, {
    id,
    mainCompanyId: companyId,
    startDate: start,
    endDate: end,
    status: shouldLock ? "LOCKED" : "OPEN",
    reason,
    updatedAt: timestamp,
  });
}

function protect(fn: (c: Context<AppEnv>) => Promise<Response>) {
  return async (c: Context<AppEnv>) => {
    try {
      return await fn(c);
    } catch (error) {
      console.error(
        JSON.stringify({
          code: "IK_DAILY_SAFETY_V3_FAILED",
          path: c.req.path,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return fail(
        c,
        500,
        "IK_DAILY_SAFETY_V3_FAILED",
        "Günlük operasyon verisi güvenli şekilde işlenemedi.",
      );
    }
  };
}

export function registerIkDailySafetyRoutes(app: Hono<AppEnv>) {
  // Günlük Operasyon'un bütün kritik okuma/yazma uçları aynı canonical tablolardan çalışır.
  app.get("/api/ik/daily-attendance", protect(listAttendance));
  app.post("/api/ik/daily-attendance/save-range", protect(saveRange));

  app.get("/api/ik/gunluk-personel/gun-kayitlari", protect(listFocused));
  app.post("/api/ik/gunluk-personel/gun-kayitlari", protect(saveFocused));

  app.get("/api/ik/gunluk-personel/liste", protect(listRoster));
  app.post("/api/ik/gunluk-personel/liste", protect(saveRoster));

  app.post("/api/ik/gunluk-personel/excel-apply", protect(excelApply));
  app.get("/api/ik/daily-operation-audit", protect(auditGet));
  app.get("/api/ik/daily-attendance/revisions", protect(revisions));
  app.get("/api/ik/daily-period-lock", protect(lockGet));
  app.post("/api/ik/daily-period-lock", protect(lockWrite));
}
