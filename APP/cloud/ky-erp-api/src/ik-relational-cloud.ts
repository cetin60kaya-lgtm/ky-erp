import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, unknown>;

const CANONICAL_COMPANY_ID = "mecit-hakan";

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const flag = (value: unknown) => value === true || value === 1 || value === "1";
const nowIso = () => new Date().toISOString();

export function canonicalHrCompanyId(value: unknown) {
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

export function hrDateOnly(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" || /^\d{11,}$/.test(text(value))) {
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  return text(value).slice(0, 10);
}

function companyIdOf(c: Context<AppEnv>, body: Row = {}) {
  return canonicalHrCompanyId(
    c.req.header("X-KYERP-Tenant-Slug") ||
      body.mainCompanyId ||
      body.main_company_id ||
      body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanyId") ||
      c.req.query("mainCompanySlug"),
  );
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload: unknown = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Row)
      : {};
  } catch {
    return {};
  }
}

function okList(c: Context<AppEnv>, rows: Row[]) {
  return c.json(hrListResponse(rows));
}

export function hrListResponse<T>(rows: T[]) {
  return { ok: true as const, success: true as const, data: rows, items: rows };
}

export function mergeDailyRosterIds(
  savedIds: string[],
  workedIds: string[],
  knownIds: string[],
) {
  const known = new Set(knownIds.filter(Boolean));
  return [...new Set([...savedIds, ...workedIds])]
    .filter((employeeId) => employeeId && known.has(employeeId));
}

function okData(c: Context<AppEnv>, data: unknown, status: 200 | 201 = 200) {
  return c.json({ ok: true, success: true, data }, status);
}

function okDataItems(c: Context<AppEnv>, data: unknown, items: unknown[]) {
  return c.json({ ok: true, success: true, data, items });
}

function error(c: Context<AppEnv>, status: 400 | 404 | 409 | 500, code: string, message: string) {
  return c.json({ ok: false, success: false, error: { code, message } }, status);
}

async function all(c: Context<AppEnv>, sql: string, values: unknown[] = []) {
  const result = await c.env.DB.prepare(sql).bind(...values).all<Row>();
  return result.results || [];
}

async function first(c: Context<AppEnv>, sql: string, values: unknown[] = []) {
  return c.env.DB.prepare(sql).bind(...values).first<Row>();
}

function mapMonthly(row: Row): Row {
  const hireDate = hrDateOnly(row.hire_date);
  const paymentType = text(row.bank_payment_type) || "Banka + Elden";
  return {
    id: text(row.id),
    mainCompanyId: canonicalHrCompanyId(row.main_company_id),
    mainCompanySlug: CANONICAL_COMPANY_ID,
    code: text(row.code),
    personnelCode: text(row.code),
    fullName: text(row.full_name),
    department: text(row.department),
    title: text(row.title),
    workType: text(row.work_type) || "Aylık",
    sgkStatus: text(row.sgk_status) || "VAR",
    status: text(row.status) || "Aktif",
    hireDate,
    startDate: hireDate,
    salary: number(row.salary),
    roadAllowance: number(row.road_allowance),
    paymentChannel: paymentType,
    bankPaymentType: paymentType,
    bankAmount: number(row.bank_amount),
    cashAmount: number(row.cash_amount),
    baseEmployeeId: text(row.base_employee_id),
    extraPaymentLabel: "EK",
    extraPaymentAmount: number(row.extra_payment_amount),
    legalDeductionType: text(row.legal_deduction_type) || (flag(row.garnishment_active) || number(row.garnishment_amount) > 0 ? "ICRA" : "YOK"),
    garnishmentActive: flag(row.garnishment_active) || number(row.garnishment_amount) > 0,
    garnishmentAmount: number(row.garnishment_amount),
    garnishmentSource: text(row.garnishment_source) || "BANKA",
    legalStartPeriod: text(row.legal_start_period),
    legalEndPeriod: text(row.legal_end_period),
    garnishmentNote: text(row.garnishment_note),
    overtimeBaseHours: number(row.overtime_hourly_base) || 225,
    overtimeHourlyBase: number(row.overtime_hourly_base) || 225,
    annualLeaveEntitlement: number(row.annual_leave_entitlement) || 14,
    annualLeaveCarryover: number(row.annual_leave_carryover),
    note: text(row.note),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDaily(row: Row): Row {
  const status = text(row.status) || "ACTIVE";
  return {
    id: text(row.id),
    mainCompanyId: canonicalHrCompanyId(row.main_company_id),
    mainCompanySlug: CANONICAL_COMPANY_ID,
    fullName: text(row.full_name),
    name: text(row.full_name),
    qualification: text(row.qualification),
    role: text(row.qualification),
    dayWage: number(row.day_wage),
    dayRate: number(row.day_wage),
    nightWage: number(row.night_wage),
    nightRate: number(row.night_wage),
    broker: text(row.broker) || "Direkt",
    personnelNo: text(row.personnel_no),
    note: text(row.meta_note),
    status,
    active: !["PASSIVE", "PASIF", "PASİF"].includes(status.toLocaleUpperCase("tr-TR")),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendance(row: Row): Row {
  const workDate = hrDateOnly(row.work_date);
  return {
    id: text(row.id),
    employeeId: text(row.employee_id),
    workDate,
    date: workDate,
    dayShift: flag(row.day_shift),
    nightShift: flag(row.night_shift),
    day: flag(row.day_shift),
    night: flag(row.night_shift),
    dayWage: number(row.day_wage),
    nightWage: number(row.night_wage),
    totalAmount: number(row.total_amount),
    paymentStatus: text(row.payment_status) || "WAITING",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAdjustment(row: Row): Row {
  return {
    id: text(row.id),
    employeeId: text(row.employee_id),
    personId: text(row.employee_id),
    date: hrDateOnly(row.date),
    adjustmentType: text(row.adjustment_type),
    type: text(row.adjustment_type),
    hourOrDay: number(row.hour_or_day),
    hours: number(row.hour_or_day),
    amount: number(row.amount),
    paymentMethod: text(row.payment_method) || "Elden",
    payrollEffect: text(row.payroll_effect),
    note: text(row.note),
    status: text(row.status) || "DRAFT",
    createdAt: row.created_at,
  };
}

function mapLeave(row: Row): Row {
  return {
    id: text(row.id),
    employeeId: text(row.employee_id),
    personId: text(row.employee_id),
    recordType: text(row.record_type),
    type: text(row.record_type),
    effectType: text(row.effect_type),
    effect: text(row.effect_type),
    startDate: hrDateOnly(row.start_date),
    start: hrDateOnly(row.start_date),
    endDate: hrDateOnly(row.end_date),
    end: hrDateOnly(row.end_date),
    dayCount: number(row.day_count),
    days: number(row.day_count),
    documentPath: text(row.document_path),
    document: text(row.document_path),
    note: text(row.note),
    description: text(row.note),
    createdAt: row.created_at,
  };
}

function mapPayroll(row: Row): Row {
  return {
    id: text(row.id),
    mainCompanyId: canonicalHrCompanyId(row.main_company_id),
    year: number(row.year),
    month: number(row.month),
    employeeId: text(row.employee_id),
    salary: number(row.salary),
    roadAllowance: number(row.road_allowance),
    overtimeAmount: number(row.overtime_amount),
    premiumAmount: number(row.premium_amount),
    garnishmentAmount: number(row.garnishment_amount),
    deductionAmount: number(row.deduction_amount),
    advanceAmount: number(row.advance_amount),
    bankAmount: number(row.bank_amount),
    cashAmount: number(row.cash_amount),
    totalAmount: number(row.total_amount),
    status: text(row.status) || "DRAFT",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function monthlyRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  return (
    await all(
      c,
      `SELECT e.*,
              s.extra_payment_label,
              s.extra_payment_amount,
              s.base_employee_id,
              s.legal_deduction_type,
              s.garnishment_active,
              s.garnishment_amount,
              s.garnishment_source,
              s.legal_start_period,
              s.legal_end_period,
              s.garnishment_note
         FROM hr_monthly_employees e
         LEFT JOIN ik_person_card_settings s
           ON s.employee_id = e.id AND s.main_company_id = e.main_company_id
        WHERE e.main_company_id = ?
        ORDER BY e.code COLLATE NOCASE ASC, e.full_name COLLATE NOCASE ASC`,
      [companyId],
    )
  ).map(mapMonthly);
}

async function dailyRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  return (
    await all(
      c,
      `SELECT e.*, m.personnel_no, m.note AS meta_note
         FROM hr_daily_employees e
         LEFT JOIN hr_daily_employee_meta m ON m.employee_id = e.id
        WHERE e.main_company_id = ?
        ORDER BY e.full_name COLLATE NOCASE ASC`,
      [companyId],
    )
  ).map(mapDaily);
}

async function attendanceRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const start = hrDateOnly(c.req.query("startDate") || c.req.query("start"));
  const end = hrDateOnly(c.req.query("endDate") || c.req.query("end"));
  const employeeId = text(c.req.query("employeeId") || c.req.query("personnelId"));
  const rows = await all(
    c,
    `SELECT a.*
       FROM hr_daily_attendance a
       JOIN hr_daily_employees e ON e.id = a.employee_id
      WHERE e.main_company_id = ?
        AND (? = '' OR a.employee_id = ?)
      ORDER BY a.work_date DESC, a.id DESC`,
    [companyId, employeeId, employeeId],
  );
  return rows
    .map(mapAttendance)
    .filter((row) => (!start || text(row.workDate) >= start) && (!end || text(row.workDate) <= end));
}

async function focusedDailyRoster(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const startDate = hrDateOnly(c.req.query("startDate") || c.req.query("start"));
  const endDate = hrDateOnly(c.req.query("endDate") || c.req.query("end") || startDate);
  if (!startDate || !endDate) return error(c, 400, "DATE_RANGE_REQUIRED", "Geçerli tarih aralığı seçilmedi.");

  const [savedRows, people, attendance] = await Promise.all([
    all(
      c,
      `SELECT employee_id FROM hr_daily_range_roster
        WHERE main_company_id=? AND start_date=? AND end_date=?
        ORDER BY created_at ASC`,
      [companyId, startDate, endDate],
    ),
    dailyRows(c, companyId),
    attendanceRows(c, companyId),
  ]);
  const savedIds = savedRows.map((row) => text(row.employee_id)).filter(Boolean);
  const workedIds = attendance
    .filter((row) => row.dayShift || row.nightShift)
    .map((row) => text(row.employeeId))
    .filter(Boolean);
  const employeeIds = mergeDailyRosterIds(
    savedIds,
    workedIds,
    people.map((row) => text(row.id)),
  );
  return okDataItems(c, { startDate, endDate, employeeIds }, employeeIds);
}

async function focusedDailyRecords(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const date = hrDateOnly(c.req.query("date") || c.req.query("selectedDate"));
  if (!date) return error(c, 400, "DATE_REQUIRED", "Geçerli tarih seçilmedi.");
  const shiftValue = text(c.req.query("shift")).toLocaleLowerCase("tr-TR");
  const shift = ["n", "night", "gece"].includes(shiftValue) ? "night" : "day";
  const [attendance, people, notes] = await Promise.all([
    attendanceRows(c, companyId),
    dailyRows(c, companyId),
    all(
      c,
      `SELECT employee_id, shift, note FROM hr_daily_attendance_notes
        WHERE main_company_id=? AND work_date=?`,
      [companyId, date],
    ),
  ]);
  const peopleById = new Map(people.map((row) => [text(row.id), row]));
  const notesByKey = new Map(notes.map((row) => [`${text(row.employee_id)}-${text(row.shift).toLowerCase()}`, text(row.note)]));
  const rows = attendance
    .filter((row) => text(row.workDate) === date)
    .map((row) => ({
      ...row,
      employee: peopleById.get(text(row.employeeId)) || {},
      shift,
      selected: shift === "day" ? Boolean(row.dayShift) : Boolean(row.nightShift),
      note: notesByKey.get(`${text(row.employeeId)}-${shift}`) || "",
    }));
  return okDataItems(c, rows, rows);
}

async function saveFocusedDailyRoster(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const startDate = hrDateOnly(body.startDate || body.start);
  const endDate = hrDateOnly(body.endDate || body.end || startDate);
  const requestedIds = Array.isArray(body.employeeIds)
    ? [...new Set(body.employeeIds.map(text).filter(Boolean))]
    : [];
  if (!startDate || !endDate) return error(c, 400, "DATE_RANGE_REQUIRED", "Geçerli tarih aralığı seçilmedi.");
  if (requestedIds.length) {
    const allowed = await all(c, `SELECT id FROM hr_daily_employees WHERE main_company_id=? AND id IN (${requestedIds.map(() => "?").join(",")})`, [companyId, ...requestedIds]);
    if (allowed.length !== requestedIds.length) return error(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
  }
  const existingRoster = await all(c, "SELECT id FROM hr_daily_range_roster WHERE main_company_id=? AND start_date=? AND end_date=?", [companyId, startDate, endDate]);
  const attendance = await attendanceRows(c, companyId);
  const workedIds = attendance
    .filter((row) => text(row.workDate) >= startDate && text(row.workDate) <= endDate && (row.dayShift || row.nightShift))
    .map((row) => text(row.employeeId));
  const employeeIds = [...new Set([...requestedIds, ...workedIds])];
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("DELETE FROM hr_daily_range_roster WHERE main_company_id=? AND start_date=? AND end_date=?").bind(companyId, startDate, endDate),
    ...employeeIds.map((employeeId) => c.env.DB.prepare("INSERT INTO hr_daily_range_roster (id,main_company_id,start_date,end_date,employee_id,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), companyId, startDate, endDate, employeeId, nowIso())),
  ];
  await c.env.DB.batch(statements);
  return okDataItems(c, { startDate, endDate, employeeIds, replacedCount: existingRoster.length }, employeeIds);
}

async function saveFocusedDailyRecords(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const date = hrDateOnly(body.date || body.selectedDate);
  const shiftValue = text(body.shift).toLocaleLowerCase("tr-TR");
  const shift = ["n", "night", "gece"].includes(shiftValue) ? "night" : "day";
  const entries = Array.isArray(body.personnelEntries)
    ? body.personnelEntries.filter((entry): entry is Row => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    : [];
  if (!date) return error(c, 400, "DATE_REQUIRED", "Geçerli tarih seçilmedi.");
  if (!entries.length) return error(c, 400, "ROWS_REQUIRED", "Kaydedilecek personel seçilmedi.");
  const ids = [...new Set(entries.map((entry) => text(entry.personelId || entry.employeeId)).filter(Boolean))];
  if (!ids.length) return error(c, 400, "EMPLOYEE_REQUIRED", "Personel zorunludur.");
  const people = await all(c, `SELECT id,day_wage,night_wage FROM hr_daily_employees WHERE main_company_id=? AND id IN (${ids.map(() => "?").join(",")})`, [companyId, ...ids]);
  if (people.length !== ids.length) return error(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
  const peopleById = new Map(people.map((row) => [text(row.id), row]));
  const existing = await all(c, `SELECT a.* FROM hr_daily_attendance a JOIN hr_daily_employees e ON e.id=a.employee_id WHERE e.main_company_id=? AND a.employee_id IN (${ids.map(() => "?").join(",")})`, [companyId, ...ids]);
  const existingByEmployee = new Map(existing.filter((row) => hrDateOnly(row.work_date) === date).map((row) => [text(row.employee_id), row]));
  const statements: D1PreparedStatement[] = [];
  for (const entry of entries) {
    const employeeId = text(entry.personelId || entry.employeeId);
    const person = peopleById.get(employeeId) || {};
    const current = existingByEmployee.get(employeeId);
    const status = text(entry.status).toLocaleUpperCase("tr-TR");
    const selected = !["REMOVE", "PASSIVE", "INACTIVE", "DELETE"].includes(status);
    const day = shift === "day" ? selected : flag(current?.day_shift);
    const night = shift === "night" ? selected : flag(current?.night_shift);
    const dayWage = number(current?.day_wage ?? person.day_wage);
    const nightWage = number(current?.night_wage ?? person.night_wage);
    const total = (day ? dayWage : 0) + (night ? nightWage : 0);
    if (!day && !night) {
      if (current?.id) statements.push(c.env.DB.prepare("DELETE FROM hr_daily_attendance WHERE id=?").bind(text(current.id)));
    } else if (current?.id) {
      statements.push(c.env.DB.prepare("UPDATE hr_daily_attendance SET work_date=?,day_shift=?,night_shift=?,day_wage=?,night_wage=?,total_amount=?,updated_at=? WHERE id=?").bind(date, day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, nowIso(), text(current.id)));
    } else {
      const timestamp = nowIso();
      statements.push(c.env.DB.prepare("INSERT INTO hr_daily_attendance (id,employee_id,work_date,day_shift,night_shift,day_wage,night_wage,total_amount,payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), employeeId, date, day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, "WAITING", timestamp, timestamp));
    }
    statements.push(c.env.DB.prepare("INSERT INTO hr_daily_attendance_notes (id,main_company_id,employee_id,work_date,shift,note,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(main_company_id,employee_id,work_date,shift) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at").bind(crypto.randomUUID(), companyId, employeeId, date, shift, text(entry.note), nowIso()));
  }
  await c.env.DB.batch(statements);
  return okDataItems(c, { date, shift, count: entries.length }, ids);
}

function weekBounds() {
  const now = new Date();
  const day = now.getUTCDay() || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

async function weeklyAttendanceRows(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const bounds = weekBounds();
  const start = hrDateOnly(c.req.query("startDate") || c.req.query("start") || bounds.start);
  const end = hrDateOnly(c.req.query("endDate") || c.req.query("end") || bounds.end);
  const [people, entries] = await Promise.all([dailyRows(c, companyId), attendanceRows(c, companyId)]);
  const byEmployee = new Map(people.map((row) => [text(row.id), row]));
  const totals = new Map<string, Row>();
  for (const entry of entries) {
    const date = text(entry.workDate);
    if (date < start || date > end) continue;
    const employeeId = text(entry.employeeId);
    const person = byEmployee.get(employeeId);
    if (!person) continue;
    const current = totals.get(employeeId) || {
      id: `${employeeId}-${start}`,
      employeeId,
      fullName: person.fullName,
      name: person.fullName,
      qualification: person.qualification,
      dayWage: person.dayWage,
      nightWage: person.nightWage,
      dayCount: 0,
      nightCount: 0,
      totalAmount: 0,
      weekStart: start,
      weekEnd: end,
    };
    current.dayCount = number(current.dayCount) + (entry.dayShift ? 1 : 0);
    current.nightCount = number(current.nightCount) + (entry.nightShift ? 1 : 0);
    current.totalAmount = number(current.totalAmount) + number(entry.totalAmount);
    current.total = current.totalAmount;
    totals.set(employeeId, current);
  }
  return [...totals.values()].sort((left, right) => text(left.fullName).localeCompare(text(right.fullName), "tr"));
}

async function adjustmentRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const employeeId = text(c.req.query("employeeId"));
  const year = text(c.req.query("year"));
  const month = text(c.req.query("month")).padStart(2, "0");
  const rows = await all(
    c,
    `SELECT a.*
       FROM hr_monthly_adjustments_v2 a
       JOIN hr_monthly_employees e ON e.id = a.employee_id
      WHERE e.main_company_id = ?
        AND (? = '' OR a.employee_id = ?)
      ORDER BY a.date DESC, a.id DESC`,
    [companyId, employeeId, employeeId],
  );
  return rows
    .map(mapAdjustment)
    .filter((row) => !year || text(row.date).startsWith(`${year}-${month}`));
}

async function leaveRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const employeeId = text(c.req.query("employeeId"));
  return (
    await all(
      c,
      `SELECT l.*
         FROM hr_leave_records_v2 l
         JOIN hr_monthly_employees e ON e.id = l.employee_id
        WHERE e.main_company_id = ?
          AND (? = '' OR l.employee_id = ?)
        ORDER BY l.start_date DESC, l.id DESC`,
      [companyId, employeeId, employeeId],
    )
  ).map(mapLeave);
}

async function payrollRows(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const year = text(c.req.query("year"));
  const month = text(c.req.query("month"));
  const employeeId = text(c.req.query("employeeId") || c.req.query("personnelId"));
  return (
    await all(
      c,
      `SELECT * FROM hr_payrolls_v2
        WHERE main_company_id = ?
          AND (? = '' OR year = ?)
          AND (? = '' OR month = ?)
          AND (? = '' OR employee_id = ?)
        ORDER BY year DESC, month DESC, employee_id ASC`,
      [companyId, year, year, month, month, employeeId, employeeId],
    )
  ).map(mapPayroll);
}

async function employeeBelongsToCompany(c: Context<AppEnv>, id: string, companyId: string) {
  return Boolean(
    await first(c, "SELECT id FROM hr_monthly_employees WHERE id = ? AND main_company_id = ?", [
      id,
      companyId,
    ]),
  );
}

async function audit(c: Context<AppEnv>, input: Row) {
  await c.env.DB.prepare(
    `INSERT INTO hr_monthly_audit_logs
      (id, main_company_id, period, employee_id, entity_type, action, summary, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      canonicalHrCompanyId(input.mainCompanyId),
      text(input.period),
      text(input.employeeId) || null,
      text(input.entityType),
      text(input.action),
      text(input.summary),
      JSON.stringify(input.details || {}),
      nowIso(),
    )
    .run();
}

async function getMonthly(c: Context<AppEnv>) {
  return okList(c, await monthlyRows(c));
}

async function getMonthlyById(c: Context<AppEnv>) {
  const row = await first(
    c,
    "SELECT * FROM hr_monthly_employees WHERE id = ? AND main_company_id = ?",
    [c.req.param("id"), companyIdOf(c)],
  );
  return row ? okData(c, mapMonthly(row)) : error(c, 404, "NOT_FOUND", "Aylık personel bulunamadı.");
}

function monthlyValues(body: Row, current: Row = {}) {
  const salary = number(body.salary ?? current.salary);
  const road = number(body.roadAllowance ?? body.road_allowance ?? current.road_allowance);
  const sgk = text(body.sgkStatus ?? body.sgk_status ?? current.sgk_status) || "VAR";
  const requestedPayment =
    text(body.bankPaymentType ?? body.paymentChannel ?? current.bank_payment_type) ||
    (sgk === "YOK" ? "Elden" : "Banka + Elden");
  const enteredBank = number(body.bankAmount ?? current.bank_amount);
  const enteredCash = number(body.cashAmount ?? current.cash_amount);
  const total = enteredBank + enteredCash > 0 ? enteredBank + enteredCash : salary + road;
  const cashOnly = requestedPayment.toLocaleLowerCase("tr-TR").includes("elden") &&
    !requestedPayment.toLocaleLowerCase("tr-TR").includes("banka");
  const bank = sgk === "YOK" || cashOnly ? 0 : Math.min(total, enteredBank || 28075.5);
  const cash = Math.max(0, total - bank);
  return {
    code: text(body.code ?? body.personnelCode ?? current.code),
    fullName: text(body.fullName ?? body.adSoyad ?? current.full_name).replace(/\s+/g, " "),
    department: text(body.department ?? current.department) || null,
    title: text(body.title ?? current.title) || null,
    workType: text(body.workType ?? current.work_type) || "Aylık",
    sgkStatus: sgk,
    status: text(body.status ?? current.status) || "Aktif",
    hireDate: hrDateOnly(body.hireDate ?? body.startDate ?? current.hire_date) || null,
    salary,
    roadAllowance: road,
    bankPaymentType: bank > 0 && cash > 0 ? "Banka + Elden" : bank > 0 ? "Banka" : "Elden",
    bankAmount: bank,
    cashAmount: cash,
    overtimeHourlyBase: number(body.overtimeHourlyBase ?? body.overtimeBaseHours ?? current.overtime_hourly_base) || 225,
    annualLeaveEntitlement: number(body.annualLeaveEntitlement ?? current.annual_leave_entitlement) || 14,
    annualLeaveCarryover: number(body.annualLeaveCarryover ?? current.annual_leave_carryover),
    note: text(body.note ?? current.note) || null,
  };
}

async function createMonthly(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const value = monthlyValues(body);
  if (!value.fullName) return error(c, 400, "FULL_NAME_REQUIRED", "Ad soyad zorunludur.");
  const duplicate = await first(
    c,
    "SELECT id FROM hr_monthly_employees WHERE main_company_id = ? AND lower(trim(full_name)) = lower(trim(?)) LIMIT 1",
    [companyId, value.fullName],
  );
  if (duplicate) return error(c, 409, "DUPLICATE_EMPLOYEE", "Bu aylık personel zaten kayıtlı.");
  const id = text(body.id) || crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO hr_monthly_employees
      (id, main_company_id, code, full_name, department, title, work_type, sgk_status, status,
       hire_date, salary, road_allowance, bank_payment_type, bank_amount, cash_amount,
       overtime_hourly_base, annual_leave_entitlement, annual_leave_carryover, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, companyId, value.code || null, value.fullName, value.department, value.title,
      value.workType, value.sgkStatus, value.status, value.hireDate, value.salary,
      value.roadAllowance, value.bankPaymentType, value.bankAmount, value.cashAmount,
      value.overtimeHourlyBase, value.annualLeaveEntitlement, value.annualLeaveCarryover,
      value.note, timestamp, timestamp,
    )
    .run();
  await audit(c, { mainCompanyId: companyId, employeeId: id, entityType: "PERSONEL", action: "CREATE", summary: `${value.fullName} aylık personel kartı açıldı.`, details: value });
  return okData(c, mapMonthly({ id, main_company_id: companyId, code: value.code, full_name: value.fullName, department: value.department, title: value.title, work_type: value.workType, sgk_status: value.sgkStatus, status: value.status, hire_date: value.hireDate, salary: value.salary, road_allowance: value.roadAllowance, bank_payment_type: value.bankPaymentType, bank_amount: value.bankAmount, cash_amount: value.cashAmount, overtime_hourly_base: value.overtimeHourlyBase, annual_leave_entitlement: value.annualLeaveEntitlement, annual_leave_carryover: value.annualLeaveCarryover, note: value.note, created_at: timestamp, updated_at: timestamp }), 201);
}

async function updateMonthly(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const id = c.req.param("id");
  const current = await first(c, "SELECT * FROM hr_monthly_employees WHERE id = ? AND main_company_id = ?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Aylık personel bulunamadı.");
  const value = monthlyValues(body, current);
  if (!value.fullName) return error(c, 400, "FULL_NAME_REQUIRED", "Ad soyad zorunludur.");
  const timestamp = nowIso();
  await c.env.DB.prepare(
    `UPDATE hr_monthly_employees SET code=?, full_name=?, department=?, title=?, work_type=?,
       sgk_status=?, status=?, hire_date=?, salary=?, road_allowance=?, bank_payment_type=?,
       bank_amount=?, cash_amount=?, overtime_hourly_base=?, annual_leave_entitlement=?,
       annual_leave_carryover=?, note=?, updated_at=? WHERE id=? AND main_company_id=?`,
  ).bind(value.code || null, value.fullName, value.department, value.title, value.workType, value.sgkStatus, value.status, value.hireDate, value.salary, value.roadAllowance, value.bankPaymentType, value.bankAmount, value.cashAmount, value.overtimeHourlyBase, value.annualLeaveEntitlement, value.annualLeaveCarryover, value.note, timestamp, id, companyId).run();
  const saved = await first(c, "SELECT * FROM hr_monthly_employees WHERE id = ?", [id]);
  await audit(c, { mainCompanyId: companyId, employeeId: id, entityType: "PERSONEL", action: "UPDATE", summary: `${value.fullName} aylık personel kartı güncellendi.`, details: value });
  return okData(c, mapMonthly(saved || current));
}

async function deleteMonthly(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const id = c.req.param("id");
  const current = await first(c, "SELECT * FROM hr_monthly_employees WHERE id = ? AND main_company_id = ?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Aylık personel bulunamadı.");
  await c.env.DB.prepare("UPDATE hr_monthly_employees SET status='Pasif', updated_at=? WHERE id=?").bind(nowIso(), id).run();
  const saved = { ...current, status: "Pasif", updated_at: nowIso() };
  return okData(c, mapMonthly(saved));
}

async function updateLeaveBalances(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const ids = Array.isArray(body.employeeIds) ? body.employeeIds.map(text).filter(Boolean) : [];
  if (!ids.length) return error(c, 400, "EMPLOYEE_REQUIRED", "Güncellenecek personel seçilmedi.");
  const entitlement = number(body.annualLeaveEntitlement ?? body.annualLeaveDays ?? 14);
  const carryover = number(body.annualLeaveCarryover ?? body.previousYearLeave);
  await c.env.DB.batch(ids.map((id) => c.env.DB.prepare("UPDATE hr_monthly_employees SET annual_leave_entitlement=?, annual_leave_carryover=?, updated_at=? WHERE id=? AND main_company_id=?").bind(entitlement, carryover, nowIso(), id, companyId)));
  return okList(c, await monthlyRows(c, companyId));
}

function dailyValues(body: Row, current: Row = {}) {
  return {
    fullName: text(body.fullName ?? body.name ?? current.full_name).replace(/\s+/g, " "),
    qualification: text(body.qualification ?? body.role ?? current.qualification) || null,
    dayWage: number(body.dayWage ?? body.dayRate ?? current.day_wage),
    nightWage: number(body.nightWage ?? body.nightRate ?? current.night_wage),
    broker: text(body.broker ?? current.broker) || null,
    status: text(body.status ?? current.status) || "ACTIVE",
    personnelNo: text(body.personnelNo ?? body.personelNo),
    note: text(body.note),
  };
}

async function createDaily(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const value = dailyValues(body);
  if (!value.fullName) return error(c, 400, "FULL_NAME_REQUIRED", "Ad soyad zorunludur.");
  const id = text(body.id) || crypto.randomUUID();
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO hr_daily_employees (id,main_company_id,full_name,qualification,day_wage,night_wage,broker,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, companyId, value.fullName, value.qualification, value.dayWage, value.nightWage, value.broker, value.status, timestamp, timestamp),
    c.env.DB.prepare("INSERT INTO hr_daily_employee_meta (employee_id,personnel_no,note,updated_at) VALUES (?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET personnel_no=excluded.personnel_no,note=excluded.note,updated_at=excluded.updated_at").bind(id, value.personnelNo, value.note, timestamp),
  ]);
  const row = await first(c, "SELECT e.*,m.personnel_no,m.note AS meta_note FROM hr_daily_employees e LEFT JOIN hr_daily_employee_meta m ON m.employee_id=e.id WHERE e.id=?", [id]);
  return okData(c, mapDaily(row || { id, main_company_id: companyId, full_name: value.fullName }), 201);
}

async function updateDaily(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const id = c.req.param("id");
  const current = await first(c, "SELECT e.*,m.personnel_no,m.note AS meta_note FROM hr_daily_employees e LEFT JOIN hr_daily_employee_meta m ON m.employee_id=e.id WHERE e.id=? AND e.main_company_id=?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Günlük personel bulunamadı.");
  const value = dailyValues(body, current);
  const timestamp = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE hr_daily_employees SET full_name=?,qualification=?,day_wage=?,night_wage=?,broker=?,status=?,updated_at=? WHERE id=? AND main_company_id=?").bind(value.fullName, value.qualification, value.dayWage, value.nightWage, value.broker, value.status, timestamp, id, companyId),
    c.env.DB.prepare("INSERT INTO hr_daily_employee_meta (employee_id,personnel_no,note,updated_at) VALUES (?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET personnel_no=excluded.personnel_no,note=excluded.note,updated_at=excluded.updated_at").bind(id, value.personnelNo || text(current.personnel_no), value.note || text(current.meta_note), timestamp),
  ]);
  const row = await first(c, "SELECT e.*,m.personnel_no,m.note AS meta_note FROM hr_daily_employees e LEFT JOIN hr_daily_employee_meta m ON m.employee_id=e.id WHERE e.id=?", [id]);
  return okData(c, mapDaily(row || current));
}

async function deleteDaily(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const id = c.req.param("id");
  const current = await first(c, "SELECT * FROM hr_daily_employees WHERE id=? AND main_company_id=?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Günlük personel bulunamadı.");
  await c.env.DB.prepare("UPDATE hr_daily_employees SET status='PASSIVE',updated_at=? WHERE id=?").bind(nowIso(), id).run();
  return okData(c, mapDaily({ ...current, status: "PASSIVE" }));
}

async function saveAttendance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const sourceRows = Array.isArray(body.rows)
    ? body.rows
    : Array.isArray(body.entries)
      ? body.entries.map((entry) => ({ ...(entry as Row), employeeId: body.employeeId }))
      : body.employeeId
        ? [body]
        : [];
  const rows = sourceRows.filter((row): row is Row => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  if (!rows.length) return error(c, 400, "ROWS_REQUIRED", "Kaydedilecek devam satırı bulunamadı.");
  const ids = [...new Set(rows.map((row) => text(row.employeeId || row.personId)).filter(Boolean))];
  if (!ids.length) return error(c, 400, "EMPLOYEE_REQUIRED", "Devam satırlarında personel zorunludur.");
  const allowed = await all(c, `SELECT id FROM hr_daily_employees WHERE main_company_id=? AND id IN (${ids.map(() => "?").join(",")})`, [companyId, ...ids]);
  const allowedIds = new Set(allowed.map((row) => text(row.id)));
  if (allowedIds.size !== ids.length) return error(c, 400, "INVALID_EMPLOYEE", "Devam satırında başka firmaya ait veya geçersiz personel var.");
  const existingRows = await all(
    c,
    `SELECT a.id, a.employee_id, a.work_date
       FROM hr_daily_attendance a
       JOIN hr_daily_employees e ON e.id=a.employee_id
      WHERE e.main_company_id=? AND a.employee_id IN (${ids.map(() => "?").join(",")})`,
    [companyId, ...ids],
  );
  const existingByDay = new Map(
    existingRows.map((row) => [`${text(row.employee_id)}-${hrDateOnly(row.work_date)}`, text(row.id)]),
  );
  const statements: D1PreparedStatement[] = [];
  const saved: Row[] = [];
  for (const row of rows) {
    const employeeId = text(row.employeeId || row.personId);
    const workDate = hrDateOnly(row.workDate || row.date || body.startDate);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue;
    const day = flag(row.dayShift ?? row.day);
    const night = flag(row.nightShift ?? row.night);
    const existingId = existingByDay.get(`${employeeId}-${workDate}`);
    if (body.deleteEmptyRows === true && !day && !night) {
      if (existingId) statements.push(c.env.DB.prepare("DELETE FROM hr_daily_attendance WHERE id=?").bind(existingId));
      continue;
    }
    const dayWage = number(row.dayWage);
    const nightWage = number(row.nightWage);
    const total = (day ? dayWage : 0) + (night ? nightWage : 0);
    const id = existingId || text(row.id) || crypto.randomUUID();
    const timestamp = nowIso();
    statements.push(
      existingId
        ? c.env.DB.prepare("UPDATE hr_daily_attendance SET work_date=?,day_shift=?,night_shift=?,day_wage=?,night_wage=?,total_amount=?,payment_status=?,updated_at=? WHERE id=?").bind(workDate, day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, text(row.paymentStatus) || "WAITING", timestamp, id)
        : c.env.DB.prepare("INSERT INTO hr_daily_attendance (id,employee_id,work_date,day_shift,night_shift,day_wage,night_wage,total_amount,payment_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, employeeId, workDate, day ? 1 : 0, night ? 1 : 0, dayWage, nightWage, total, text(row.paymentStatus) || "WAITING", timestamp, timestamp),
    );
    saved.push(mapAttendance({ id, employee_id: employeeId, work_date: workDate, day_shift: day ? 1 : 0, night_shift: night ? 1 : 0, day_wage: dayWage, night_wage: nightWage, total_amount: total, payment_status: text(row.paymentStatus) || "WAITING", created_at: timestamp, updated_at: timestamp }));
  }
  if (statements.length) await c.env.DB.batch(statements);
  return okData(c, saved);
}

async function listAdjustments(c: Context<AppEnv>) { return okList(c, await adjustmentRows(c)); }
async function listLeaves(c: Context<AppEnv>) { return okList(c, await leaveRows(c)); }
async function listPayrolls(c: Context<AppEnv>) { return okList(c, await payrollRows(c)); }

async function saveAdjustment(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  if (!(await employeeBelongsToCompany(c, employeeId, companyId))) return error(c, 400, "INVALID_EMPLOYEE", "Personel bulunamadı.");
  const id = c.req.param("id") || text(body.id) || crypto.randomUUID();
  const current = c.req.param("id") ? await first(c, "SELECT * FROM hr_monthly_adjustments_v2 WHERE id=? AND employee_id=?", [id, employeeId]) : null;
  if (c.req.param("id") && !current) return error(c, 404, "NOT_FOUND", "Mesai/avans/kesinti kaydı bulunamadı.");
  const date = hrDateOnly(body.date ?? current?.date) || hrDateOnly(nowIso());
  const adjustmentType = text(body.adjustmentType ?? body.type ?? current?.adjustment_type) || "Mesai";
  const hourOrDay = number(body.hourOrDay ?? body.hours ?? current?.hour_or_day);
  const amount = number(body.amount ?? current?.amount);
  const paymentMethod = text(body.paymentMethod ?? current?.payment_method) || (adjustmentType === "Mesai" ? "Bordro" : "Elden");
  const payrollEffect = text(body.payrollEffect ?? current?.payroll_effect) || (adjustmentType === "Mesai" ? "Bordroya ekle" : "Bordrodan düş");
  const note = text(body.note ?? body.description ?? current?.note) || null;
  const status = text(body.status ?? current?.status) || "DRAFT";
  if (current) await c.env.DB.prepare("UPDATE hr_monthly_adjustments_v2 SET date=?,adjustment_type=?,hour_or_day=?,amount=?,payment_method=?,payroll_effect=?,note=?,status=? WHERE id=?").bind(date, adjustmentType, hourOrDay, amount, paymentMethod, payrollEffect, note, status, id).run();
  else await c.env.DB.prepare("INSERT INTO hr_monthly_adjustments_v2 (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,payroll_effect,note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, employeeId, date, adjustmentType, hourOrDay, amount, paymentMethod, payrollEffect, note, status, nowIso()).run();
  const saved = await first(c, "SELECT * FROM hr_monthly_adjustments_v2 WHERE id=?", [id]);
  return okData(c, mapAdjustment(saved || { id, employee_id: employeeId, date, adjustment_type: adjustmentType, hour_or_day: hourOrDay, amount, payment_method: paymentMethod, payroll_effect: payrollEffect, note, status }), current ? 200 : 201);
}

async function saveAdvancedFinance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeIds = Array.isArray(body.employeeIds)
    ? [...new Set(body.employeeIds.map(text).filter(Boolean))]
    : [text(body.employeeId || body.personId)].filter(Boolean);
  if (!employeeIds.length) return error(c, 400, "EMPLOYEE_REQUIRED", "Personel zorunludur.");
  const valid = await all(c, `SELECT id FROM hr_monthly_employees WHERE main_company_id=? AND id IN (${employeeIds.map(() => "?").join(",")})`, [companyId, ...employeeIds]);
  if (valid.length !== employeeIds.length) return error(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");
  const date = hrDateOnly(body.date) || hrDateOnly(nowIso());
  const adjustmentType = text(body.adjustmentType || body.type) || "Avans";
  const hourOrDay = number(body.hourOrDay || body.hours);
  const amount = number(body.amount);
  if (amount <= 0 && hourOrDay <= 0) return error(c, 400, "AMOUNT_REQUIRED", "Tutar veya süre sıfırdan büyük olmalıdır.");
  const paymentMethod = text(body.paymentMethod) || (adjustmentType === "Mesai" ? "Bordro" : "Elden");
  const payrollEffect = text(body.payrollEffect) || (adjustmentType === "Mesai" ? "Bordroya ekle" : "Bordrodan düş");
  const note = text(body.note || body.reason) || null;
  const status = text(body.status) || "APPROVED";
  const statements = employeeIds.map((employeeId) => c.env.DB.prepare("INSERT INTO hr_monthly_adjustments_v2 (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,payroll_effect,note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), employeeId, date, adjustmentType, hourOrDay, amount, paymentMethod, payrollEffect, note, status, nowIso()));
  await c.env.DB.batch(statements);
  return okData(c, { savedCount: statements.length });
}

async function updateAdvancedFinance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const id = text(body.id);
  const companyId = companyIdOf(c, body);
  const current = await first(c, "SELECT a.* FROM hr_monthly_adjustments_v2 a JOIN hr_monthly_employees e ON e.id=a.employee_id WHERE a.id=? AND e.main_company_id=?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Mesai/avans/kesinti kaydı bulunamadı.");
  await c.env.DB.prepare("UPDATE hr_monthly_adjustments_v2 SET date=?,adjustment_type=?,hour_or_day=?,amount=?,payment_method=?,payroll_effect=?,note=?,status=? WHERE id=?").bind(hrDateOnly(body.date || current.date), text(body.adjustmentType || body.type || current.adjustment_type), number(body.hourOrDay ?? body.hours ?? current.hour_or_day), number(body.amount ?? current.amount), text(body.paymentMethod || current.payment_method) || "Elden", text(body.payrollEffect || current.payroll_effect), text(body.note ?? current.note) || null, text(body.status || current.status), id).run();
  const saved = await first(c, "SELECT * FROM hr_monthly_adjustments_v2 WHERE id=?", [id]);
  return okData(c, mapAdjustment(saved || current));
}

async function deleteAdvancedFinance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const id = text(body.id);
  const companyId = companyIdOf(c, body);
  const current = await first(c, "SELECT a.id FROM hr_monthly_adjustments_v2 a JOIN hr_monthly_employees e ON e.id=a.employee_id WHERE a.id=? AND e.main_company_id=?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Mesai/avans/kesinti kaydı bulunamadı.");
  await c.env.DB.prepare("DELETE FROM hr_monthly_adjustments_v2 WHERE id=?").bind(id).run();
  return okData(c, { id, deleted: true });
}

async function deleteAdjustment(c: Context<AppEnv>) {
  const id = c.req.param("id");
  const companyId = companyIdOf(c);
  const row = await first(c, "SELECT a.* FROM hr_monthly_adjustments_v2 a JOIN hr_monthly_employees e ON e.id=a.employee_id WHERE a.id=? AND e.main_company_id=?", [id, companyId]);
  if (!row) return error(c, 404, "NOT_FOUND", "Mesai/avans/kesinti kaydı bulunamadı.");
  await c.env.DB.prepare("DELETE FROM hr_monthly_adjustments_v2 WHERE id=?").bind(id).run();
  return okData(c, { id, deleted: true });
}

async function saveLeave(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  if (!(await employeeBelongsToCompany(c, employeeId, companyId))) return error(c, 400, "INVALID_EMPLOYEE", "Personel bulunamadı.");
  const id = c.req.param("id") || text(body.id) || crypto.randomUUID();
  const current = c.req.param("id") ? await first(c, "SELECT * FROM hr_leave_records_v2 WHERE id=? AND employee_id=?", [id, employeeId]) : null;
  if (c.req.param("id") && !current) return error(c, 404, "NOT_FOUND", "İzin kaydı bulunamadı.");
  const recordType = text(body.recordType ?? body.type ?? current?.record_type) || "Yıllık izin";
  const effectType = text(body.effectType ?? body.effect ?? current?.effect_type) || "Yıllık izinden düş";
  const startDate = hrDateOnly(body.startDate ?? body.start ?? current?.start_date);
  const endDate = hrDateOnly(body.endDate ?? body.end ?? current?.end_date);
  if (!startDate || !endDate) return error(c, 400, "DATE_REQUIRED", "İzin başlangıç ve bitiş tarihi zorunludur.");
  const dayCount = number(body.dayCount ?? body.days ?? current?.day_count) || 1;
  const documentPath = text(body.documentPath ?? body.document ?? current?.document_path) || null;
  const note = text(body.note ?? body.description ?? current?.note) || null;
  if (current) await c.env.DB.prepare("UPDATE hr_leave_records_v2 SET record_type=?,effect_type=?,start_date=?,end_date=?,day_count=?,document_path=?,note=? WHERE id=?").bind(recordType, effectType, startDate, endDate, dayCount, documentPath, note, id).run();
  else await c.env.DB.prepare("INSERT INTO hr_leave_records_v2 (id,employee_id,record_type,effect_type,start_date,end_date,day_count,document_path,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, employeeId, recordType, effectType, startDate, endDate, dayCount, documentPath, note, nowIso()).run();
  const saved = await first(c, "SELECT * FROM hr_leave_records_v2 WHERE id=?", [id]);
  return okData(c, mapLeave(saved || { id, employee_id: employeeId, record_type: recordType, effect_type: effectType, start_date: startDate, end_date: endDate, day_count: dayCount, document_path: documentPath, note }), current ? 200 : 201);
}

async function deleteLeave(c: Context<AppEnv>) {
  const id = c.req.param("id");
  const companyId = companyIdOf(c);
  const row = await first(c, "SELECT l.* FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id WHERE l.id=? AND e.main_company_id=?", [id, companyId]);
  if (!row) return error(c, 404, "NOT_FOUND", "İzin kaydı bulunamadı.");
  await c.env.DB.prepare("DELETE FROM hr_leave_records_v2 WHERE id=?").bind(id).run();
  return okData(c, { id, deleted: true });
}

async function salaryContracts(c: Context<AppEnv>) {
  const employeeId = text(c.req.param("id"));
  if (!(await employeeBelongsToCompany(c, employeeId, companyIdOf(c)))) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const rows = await all(c, "SELECT * FROM hr_salary_contracts WHERE employee_id=? ORDER BY effective_date DESC", [employeeId]);
  return okList(c, rows.map((row) => ({ id: text(row.id), employeeId, salary: number(row.salary), roadAllowance: number(row.road_allowance), bankPaymentType: text(row.bank_payment_type), bankAmount: number(row.bank_amount), cashAmount: number(row.cash_amount), contractType: text(row.contract_type), contractStart: hrDateOnly(row.contract_start), contractEnd: hrDateOnly(row.contract_end), effectiveDate: hrDateOnly(row.effective_date), note: text(row.note), createdAt: row.created_at })));
}

async function createSalaryContract(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const employeeId = text(c.req.param("id"));
  if (!(await employeeBelongsToCompany(c, employeeId, companyIdOf(c, body)))) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const id = text(body.id) || crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO hr_salary_contracts (id,employee_id,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,contract_type,contract_start,contract_end,effective_date,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, employeeId, number(body.salary), number(body.roadAllowance), text(body.bankPaymentType) || "BANK_CASH", number(body.bankAmount), number(body.cashAmount), text(body.contractType) || null, hrDateOnly(body.contractStart || body.contractStartDate), hrDateOnly(body.contractEnd || body.contractEndDate) || null, hrDateOnly(body.effectiveDate), text(body.note) || null, nowIso()).run();
  const row = await first(c, "SELECT * FROM hr_salary_contracts WHERE id=?", [id]);
  return okData(c, row || { id, employeeId }, 201);
}

async function advancedMonth(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const year = number(c.req.query("year")) || new Date().getFullYear();
  const month = number(c.req.query("month")) || new Date().getMonth() + 1;
  const [employees, cards, adjustments, leaves, payroll, documents, contracts] = await Promise.all([
    monthlyRows(c, companyId),
    all(c, "SELECT * FROM ik_person_card_settings WHERE main_company_id=?", [companyId]),
    adjustmentRows(c, companyId),
    leaveRows(c, companyId),
    payrollRows(c, companyId),
    all(c, "SELECT d.* FROM hr_employee_documents d JOIN hr_monthly_employees e ON e.id=d.employee_id WHERE e.main_company_id=? ORDER BY d.date DESC", [companyId]),
    all(c, "SELECT s.* FROM hr_salary_contracts s JOIN hr_monthly_employees e ON e.id=s.employee_id WHERE e.main_company_id=? ORDER BY s.effective_date DESC", [companyId]),
  ]);
  const cardsByEmployee = new Map(cards.map((row) => [text(row.employee_id), row]));
  const mergedEmployees = employees.map((employee) => {
    const card = cardsByEmployee.get(text(employee.id)) || {};
    const sgkValue = number(card.sgk_follow);
    return { ...employee, cardNo: text(card.card_no), identityNo: text(card.identity_no), payrollIncluded: card.payroll_included === undefined ? true : flag(card.payroll_included), cardSource: text(card.card_source) || "TNF", personelKodu: text(card.personel_kodu) || text(employee.code), activePassive: text(card.active_passive) || text(employee.status), paymentType: text(card.payment_type) || text(employee.bankPaymentType), sgkFollow: card.sgk_follow === undefined ? text(employee.sgkStatus) !== "YOK" : sgkValue === 1 ? true : sgkValue === 0 ? false : null, phone: text(card.phone) };
  });
  return okData(c, {
    year, month, employees: mergedEmployees, adjustments, leaves, payroll,
    documents: documents.map((row) => ({ id: text(row.id), employeeId: text(row.employee_id), documentType: text(row.document_type), fileName: text(row.file_name), filePath: text(row.file_path), date: hrDateOnly(row.date), status: text(row.status) })),
    contracts: contracts.map((row) => ({ id: text(row.id), employeeId: text(row.employee_id), salary: number(row.salary), roadAllowance: number(row.road_allowance), bankAmount: number(row.bank_amount), cashAmount: number(row.cash_amount), paymentType: text(row.bank_payment_type), startDate: hrDateOnly(row.contract_start || row.effective_date), endDate: hrDateOnly(row.contract_end), note: text(row.note) })),
    resolvedDays: [], checks: [], close: { isLocked: false }, closeLogs: [],
  });
}

async function advancedPayroll(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const year = number(c.req.query("year")) || new Date().getFullYear();
  const month = number(c.req.query("month")) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const [employees, saved, adjustments] = await Promise.all([monthlyRows(c, companyId), payrollRows(c, companyId), adjustmentRows(c, companyId)]);
  const employeesById = new Map(employees.map((employee) => [text(employee.id), employee]));
  const byEmployee = new Map(saved.filter((row) => number(row.year) === year && number(row.month) === month).map((row) => [text(row.employeeId), row]));
  const normalizeType = (value: unknown) => { const valueUpper = upper(value); if (valueUpper.includes("TOPLU") && valueUpper.includes("AVANS")) return "TOPLU_AVANS"; if (valueUpper.includes("AVANS")) return "AVANS"; if (valueUpper.includes("HACIZ") || valueUpper.includes("HACİZ")) return "HACIZ"; if (valueUpper.includes("ICRA") || valueUpper.includes("İCRA")) return "ICRA"; if (valueUpper.includes("KESINT")) return "KESINTI"; if (valueUpper.includes("MESAI")) return "MESAI"; return valueUpper; };
  const lines = employees.map((employee) => {
    const row = byEmployee.get(text(employee.id));
    const baseEmployee = employee.baseEmployeeId ? employeesById.get(text(employee.baseEmployeeId)) : null;
    const baseSalary = baseEmployee ? number(baseEmployee.salary) : number(employee.salary);
    const extra = baseEmployee ? Math.max(number(employee.salary) - baseSalary, 0) : number(employee.extraPaymentAmount);
    const own = adjustments.filter((item) => text(item.employeeId) === text(employee.id) && text(item.date).startsWith(period) && !upper(item.payrollEffect).includes("SADECE"));
    const overtime = own.filter((item) => normalizeType(item.adjustmentType) === "MESAI").reduce((sum, item) => sum + number(item.amount), 0);
    const advanceRows = own.filter((item) => ["AVANS", "TOPLU_AVANS"].includes(normalizeType(item.adjustmentType)));
    const deductionRows = own.filter((item) => normalizeType(item.adjustmentType) === "KESINTI");
    const legalRows = own.filter((item) => ["ICRA", "HACIZ"].includes(normalizeType(item.adjustmentType)));
    const advance = advanceRows.reduce((sum, item) => sum + number(item.amount), 0);
    const deduction = deductionRows.reduce((sum, item) => sum + number(item.amount), 0);
    const garnishment = legalRows.reduce((sum, item) => sum + number(item.amount), 0);
    const bankDeductions = [...advanceRows, ...deductionRows, ...legalRows].filter((item) => upper(item.paymentMethod).includes("BANKA")).reduce((sum, item) => sum + number(item.amount), 0);
    const baseNet = Math.max(baseSalary + number(employee.roadAllowance) + extra + overtime - advance - deduction - garnishment, 0);
    const systemBank = Math.min(baseNet, Math.max(number(employee.bankAmount) - bankDeductions, 0));
    const systemCash = Math.max(baseNet - systemBank, 0);
    const systemFinal = { salaryPay: baseSalary, roadPay: number(employee.roadAllowance), overtimeAmount: overtime, premiumAmount: extra, garnishmentAmount: garnishment, deductionAmount: deduction, advanceAmount: advance, bank: systemBank, cash: systemCash, total: baseNet };
    const final = row && upper(row.status) === "OVERRIDE" ? { salaryPay: row.salary, roadPay: row.roadAllowance, overtimeAmount: row.overtimeAmount, premiumAmount: row.premiumAmount, garnishmentAmount: row.garnishmentAmount, deductionAmount: row.deductionAmount, advanceAmount: row.advanceAmount, bank: row.bankAmount, cash: row.cashAmount, total: row.totalAmount } : systemFinal;
    return { employeeId: employee.id, code: employee.code, fullName: employee.fullName, department: employee.department, system: systemFinal, final, status: row && upper(row.status) === "OVERRIDE" ? "OVERRIDE" : "SYSTEM" };
  });
  const totals = lines.reduce((sum, row) => ({ bank: sum.bank + number(row.final.bank), cash: sum.cash + number(row.final.cash), total: sum.total + number(row.final.total) }), { bank: 0, cash: 0, total: 0 });
  return okData(c, { year, month, policy: { roadByActualPresence: true, defaultOvertimeBase: 225, advanceFirstFromCash: false, deductionRespectsSource: true, legalDeductionsAreMovements: true }, lines, totals });
}

async function savePersonCard(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(c.req.param("employeeId"));
  const current = await first(c, "SELECT * FROM hr_monthly_employees WHERE id=? AND main_company_id=?", [employeeId, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const cardNo = text(body.cardNo);
  if (cardNo) {
    const duplicate = await first(c, "SELECT employee_id FROM ik_person_card_settings WHERE main_company_id=? AND card_no=? AND employee_id<>?", [companyId, cardNo, employeeId]);
    if (duplicate) return error(c, 409, "DUPLICATE_CARD", "Bu kart numarası başka bir personele bağlı.");
  }
  const baseEmployeeId = text(body.baseEmployeeId);
  if (baseEmployeeId === employeeId) return error(c, 400, "INVALID_BASE_EMPLOYEE", "Personel kendisini baz personel seçemez.");
  const baseEmployee = baseEmployeeId ? await first(c, "SELECT id,salary FROM hr_monthly_employees WHERE id=? AND main_company_id=?", [baseEmployeeId, companyId]) : null;
  if (baseEmployeeId && !baseEmployee) return error(c, 400, "INVALID_BASE_EMPLOYEE", "Baz personel bulunamadı.");
  const actualSalary = number(body.salary ?? current.salary);
  if (baseEmployee && number(baseEmployee.salary) > actualSalary) return error(c, 400, "BASE_SALARY_HIGH", "Baz personel maaşı gerçek maaştan yüksek olamaz.");
  const autoExtra = baseEmployee ? Math.max(actualSalary - number(baseEmployee.salary), 0) : 0;
  const legalTypeRaw = upper(body.legalDeductionType);
  const legalType = legalTypeRaw === "HACIZ" ? "HACIZ" : legalTypeRaw === "ICRA" ? "ICRA" : "YOK";
  const legalAmount = legalType === "YOK" ? 0 : number(body.garnishmentAmount);
  const legalSource = upper(body.garnishmentSource) === "ELDEN" ? "ELDEN" : "BANKA";
  await c.env.DB.prepare(
    `INSERT INTO ik_person_card_settings (
       employee_id,main_company_id,card_no,identity_no,payroll_included,card_source,personel_kodu,exit_date,
       active_passive,work_type,sgk_follow,payment_type,note,phone,extra_payment_label,extra_payment_amount,
       base_employee_id,legal_deduction_type,garnishment_active,garnishment_amount,garnishment_source,
       legal_start_period,legal_end_period,garnishment_note,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(employee_id) DO UPDATE SET
       main_company_id=excluded.main_company_id,
       card_no=excluded.card_no,
       identity_no=excluded.identity_no,
       payroll_included=excluded.payroll_included,
       card_source=excluded.card_source,
       personel_kodu=excluded.personel_kodu,
       exit_date=excluded.exit_date,
       active_passive=excluded.active_passive,
       work_type=excluded.work_type,
       sgk_follow=excluded.sgk_follow,
       payment_type=excluded.payment_type,
       note=excluded.note,
       phone=excluded.phone,
       extra_payment_label=excluded.extra_payment_label,
       extra_payment_amount=excluded.extra_payment_amount,
       base_employee_id=excluded.base_employee_id,
       legal_deduction_type=excluded.legal_deduction_type,
       garnishment_active=excluded.garnishment_active,
       garnishment_amount=excluded.garnishment_amount,
       garnishment_source=excluded.garnishment_source,
       legal_start_period=excluded.legal_start_period,
       legal_end_period=excluded.legal_end_period,
       garnishment_note=excluded.garnishment_note,
       updated_at=excluded.updated_at`,
  ).bind(
    employeeId, companyId, cardNo, text(body.identityNo), body.payrollIncluded === false ? 0 : 1,
    text(body.cardSource) || "TNF", text(body.personelKodu || body.code), hrDateOnly(body.exitDate) || null,
    text(body.activePassive || body.status) || "AKTIF", text(body.workType) || "AYLIK",
    body.sgkFollow === null ? 2 : body.sgkFollow === false ? 0 : 1, text(body.paymentType) || "BANKA_ELDEN",
    text(body.note), text(body.phone), "EK", autoExtra, baseEmployeeId, legalType,
    legalType !== "YOK" && legalAmount > 0 ? 1 : 0, legalAmount, legalSource,
    text(body.legalStartPeriod), text(body.legalEndPeriod), text(body.garnishmentNote), nowIso(),
  ).run();
  await updateMonthlyEmployeeFromCard(c, employeeId, companyId, body, current);
  return okData(c, { employeeId, saved: true, baseEmployeeId, extraPaymentAmount: autoExtra, legalDeductionType: legalType, garnishmentSource: legalSource });
}
async function updateMonthlyEmployeeFromCard(c: Context<AppEnv>, employeeId: string, companyId: string, body: Row, current: Row) {
  const merged: Row = { ...current, ...body, code: body.personelKodu || body.code || current.code, bankPaymentType: body.paymentType || current.bank_payment_type, sgkStatus: body.sgkFollow === false ? "YOK" : "VAR", status: body.activePassive || body.status || current.status };
  const value = monthlyValues(merged, current);
  await c.env.DB.prepare("UPDATE hr_monthly_employees SET code=?,full_name=?,department=?,title=?,work_type=?,sgk_status=?,status=?,hire_date=?,salary=?,road_allowance=?,bank_payment_type=?,bank_amount=?,cash_amount=?,annual_leave_entitlement=?,annual_leave_carryover=?,note=?,updated_at=? WHERE id=? AND main_company_id=?").bind(value.code || null, value.fullName, value.department, value.title, value.workType, value.sgkStatus, value.status, value.hireDate, value.salary, value.roadAllowance, value.bankPaymentType, value.bankAmount, value.cashAmount, value.annualLeaveEntitlement, value.annualLeaveCarryover, value.note, nowIso(), employeeId, companyId).run();
}

async function saveAdvancedPayrollOverride(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const override = body.override && typeof body.override === "object" && !Array.isArray(body.override) ? body.override as Row : {};
  const employee = await first(c, `SELECT e.*, s.extra_payment_amount, s.base_employee_id FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=?`, [employeeId, companyId]);
  if (!employee) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const existing = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  const baseEmployee = text(employee.base_employee_id) ? await first(c, "SELECT id,salary FROM hr_monthly_employees WHERE id=? AND main_company_id=?", [text(employee.base_employee_id), companyId]) : null;
  const baseSalary = baseEmployee ? number(baseEmployee.salary) : number(employee.salary);
  const autoPremium = baseEmployee ? Math.max(number(employee.salary) - baseSalary, 0) : number(employee.extra_payment_amount);
  const allAdjustments = await adjustmentRows(c, companyId);
  const normalizeType = (value: unknown) => { const valueUpper = upper(value); if (valueUpper.includes("TOPLU") && valueUpper.includes("AVANS")) return "TOPLU_AVANS"; if (valueUpper.includes("AVANS")) return "AVANS"; if (valueUpper.includes("HACIZ") || valueUpper.includes("HACİZ")) return "HACIZ"; if (valueUpper.includes("ICRA") || valueUpper.includes("İCRA")) return "ICRA"; if (valueUpper.includes("KESINT")) return "KESINTI"; if (valueUpper.includes("MESAI")) return "MESAI"; return valueUpper; };
  const own = allAdjustments.filter((item) => text(item.employeeId) === employeeId && text(item.date).startsWith(period) && !upper(item.payrollEffect).includes("SADECE"));
  const overtime = own.filter((item) => normalizeType(item.adjustmentType) === "MESAI").reduce((sum, item) => sum + number(item.amount), 0);
  const advanceRows = own.filter((item) => ["AVANS", "TOPLU_AVANS"].includes(normalizeType(item.adjustmentType)));
  const deductionRows = own.filter((item) => normalizeType(item.adjustmentType) === "KESINTI");
  const legalRows = own.filter((item) => ["ICRA", "HACIZ"].includes(normalizeType(item.adjustmentType)));
  const advanceDefault = advanceRows.reduce((sum, item) => sum + number(item.amount), 0);
  const deductionDefault = deductionRows.reduce((sum, item) => sum + number(item.amount), 0);
  const garnishmentDefault = legalRows.reduce((sum, item) => sum + number(item.amount), 0);
  const bankDeductions = [...advanceRows, ...deductionRows, ...legalRows].filter((item) => upper(item.paymentMethod).includes("BANKA")).reduce((sum, item) => sum + number(item.amount), 0);
  const salary = baseSalary;
  const road = number(employee.road_allowance);
  const overtimeFinal = overtime;
  const premium = autoPremium;
  const deduction = deductionDefault;
  const advance = advanceDefault;
  const garnishment = garnishmentDefault;
  const calculatedTotal = Math.max(salary + road + overtimeFinal + premium - deduction - advance - garnishment, 0);
  const plannedBank = Math.max(number(employee.bank_amount) - bankDeductions, 0);
  const bank = override.bank !== undefined ? number(override.bank) : Math.min(calculatedTotal, plannedBank);
  const cash = override.cash !== undefined ? number(override.cash) : Math.max(calculatedTotal - bank, 0);
  const total = override.total !== undefined ? number(override.total) : calculatedTotal;
  const timestamp = nowIso();
  const id = text(existing?.id) || crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO hr_payrolls_v2 (id,main_company_id,year,month,employee_id,salary,road_allowance,overtime_amount,premium_amount,garnishment_amount,deduction_amount,advance_amount,bank_amount,cash_amount,total_amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,year,month,employee_id) DO UPDATE SET salary=excluded.salary,road_allowance=excluded.road_allowance,overtime_amount=excluded.overtime_amount,premium_amount=excluded.premium_amount,garnishment_amount=excluded.garnishment_amount,deduction_amount=excluded.deduction_amount,advance_amount=excluded.advance_amount,bank_amount=excluded.bank_amount,cash_amount=excluded.cash_amount,total_amount=excluded.total_amount,status=excluded.status,updated_at=excluded.updated_at`).bind(id, companyId, year, month, employeeId, salary, road, overtimeFinal, premium, garnishment, deduction, advance, bank, cash, total, "OVERRIDE", text(existing?.created_at) || timestamp, timestamp).run();
  const saved = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  await audit(c, { mainCompanyId: companyId, period, employeeId, entityType: "BORDRO", action: "OVERRIDE", summary: "Bordro ödeme planı güncellendi.", details: { reason: text(body.reason), premiumAmount: premium, garnishmentAmount: garnishment, bank, cash, total } });
  return okData(c, mapPayroll(saved || { id, main_company_id: companyId, year, month, employee_id: employeeId, salary, road_allowance: road, overtime_amount: overtimeFinal, premium_amount: premium, garnishment_amount: garnishment, deduction_amount: deduction, advance_amount: advance, bank_amount: bank, cash_amount: cash, total_amount: total, status: "OVERRIDE" }));
}

async function auditLogs(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const limit = Math.min(Math.max(number(c.req.query("limit")) || 200, 1), 500);
  const rows = await all(c, "SELECT * FROM hr_monthly_audit_logs WHERE main_company_id=? ORDER BY created_at DESC LIMIT ?", [companyId, limit]);
  return okList(c, rows.map((row) => ({ id: text(row.id), mainCompanyId: companyId, period: text(row.period), employeeId: text(row.employee_id), entityType: text(row.entity_type), action: text(row.action), summary: text(row.summary), details: (() => { try { return JSON.parse(text(row.details_json) || "{}"); } catch { return {}; } })(), createdAt: row.created_at })));
}


const DEFAULT_TR_OFFICIAL_HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22",
  "2026-04-23", "2026-05-01", "2026-05-19",
  "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30",
  "2026-07-15", "2026-08-30", "2026-10-28", "2026-10-29",
];

function addIsoDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function calculateAnnualLeaveRange(
  startDate: string,
  returnDate: string,
  countedWeekdays: number[] = [1, 2, 3, 4, 5, 6],
  excludeOfficialHolidays = true,
  officialHolidayDates: string[] = [],
) {
  const official = new Set(officialHolidayDates);
  const counted = new Set(countedWeekdays.map(Number));
  const countedDates: string[] = [];
  const excludedDates: Array<{ date: string; reason: string }> = [];
  const calendarDates: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(returnDate) || returnDate <= startDate) {
    return { startDate, returnDate, lastLeaveDate: "", calendarDays: 0, calendarDates, countedDays: 0, countedDates, excludedDates };
  }
  for (let date = startDate, guard = 0; date < returnDate && guard < 371; date = addIsoDays(date, 1), guard += 1) {
    calendarDates.push(date);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const isHoliday = official.has(date);
    const weekdayCounted = counted.has(weekday);
    if (weekdayCounted && !(excludeOfficialHolidays && isHoliday)) {
      countedDates.push(date);
    } else {
      const reasons: string[] = [];
      if (!weekdayCounted) reasons.push(weekday === 0 ? "Pazar / haftalık tatil" : "Şirket izin sayım günü değil");
      if (excludeOfficialHolidays && isHoliday) reasons.push("Resmi tatil");
      excludedDates.push({ date, reason: reasons.join(" + ") || "Sayılmayan gün" });
    }
  }
  return {
    startDate,
    returnDate,
    lastLeaveDate: calendarDates.at(-1) || "",
    calendarDays: calendarDates.length,
    calendarDates,
    countedDays: countedDates.length,
    countedDates,
    excludedDates,
  };
}

async function leavePolicyV2(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const row = await first(c, "SELECT * FROM ik_leave_counting_policy WHERE main_company_id=? LIMIT 1", [companyId]);
  let countedWeekdays = [1, 2, 3, 4, 5, 6];
  try {
    const parsed = JSON.parse(text(row?.counted_weekdays_json) || "[]");
    if (Array.isArray(parsed) && parsed.length) countedWeekdays = parsed.map(Number).filter((day) => day >= 0 && day <= 6);
  } catch {}
  return {
    mainCompanyId: companyId,
    countedWeekdays,
    excludeOfficialHolidays: row ? flag(row.exclude_official_holidays) : true,
    maxConcurrentDepartment: Math.max(1, number(row?.max_concurrent_department) || 1),
    updatedAt: row?.updated_at || null,
  };
}

async function officialHolidayDatesV2(c: Context<AppEnv>, companyId: string) {
  const dates = new Set<string>(DEFAULT_TR_OFFICIAL_HOLIDAYS_2026);
  try {
    const exists = await first(c, "SELECT name FROM sqlite_master WHERE type='table' AND name='json_store' LIMIT 1");
    if (exists?.name) {
      const rows = await all(c, "SELECT data FROM json_store WHERE scope='IK_OFFICIAL_HOLIDAY' AND (main_company_slug=? OR main_company_slug IS NULL)", [companyId]);
      for (const row of rows) {
        try {
          const parsed = JSON.parse(text(row.data) || "{}");
          const date = hrDateOnly(parsed?.date || parsed?.holidayDate || parsed?.workDate);
          if (date) dates.add(date);
        } catch {}
      }
    }
  } catch {}
  return [...dates];
}

async function saveAdvancedLeavePolicyV2(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const rawDays = Array.isArray(body.countedWeekdays) ? body.countedWeekdays : [1, 2, 3, 4, 5, 6];
  const countedWeekdays = [...new Set(rawDays.map(Number).filter((day) => day >= 0 && day <= 6))].sort();
  if (!countedWeekdays.length) return error(c, 400, "LEAVE_POLICY_EMPTY", "En az bir izin sayım günü seçilmelidir.");
  const excludeOfficialHolidays = body.excludeOfficialHolidays !== false;
  const maxConcurrentDepartment = Math.max(1, number(body.maxConcurrentDepartment) || 1);
  await c.env.DB.prepare(`INSERT INTO ik_leave_counting_policy
    (main_company_id,counted_weekdays_json,exclude_official_holidays,max_concurrent_department,updated_by,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(main_company_id) DO UPDATE SET
      counted_weekdays_json=excluded.counted_weekdays_json,
      exclude_official_holidays=excluded.exclude_official_holidays,
      max_concurrent_department=excluded.max_concurrent_department,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at`)
    .bind(companyId, JSON.stringify(countedWeekdays), excludeOfficialHolidays ? 1 : 0, maxConcurrentDepartment, text(body.userName) || "Sistem", nowIso()).run();
  const policy = await leavePolicyV2(c, companyId);
  await audit(c, { mainCompanyId: companyId, entityType: "IZIN_POLITIKASI", action: "UPDATE", summary: "Yıllık izin gün sayım ayarları güncellendi.", details: policy });
  return okData(c, { policy });
}

async function previewAdvancedLeaveV2(c: Context<AppEnv>, supplied?: Row) {
  const body = supplied || await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  const startDate = hrDateOnly(body.startDate || body.start);
  const returnDate = hrDateOnly(body.returnDate || body.endDate || body.end);
  if (!employeeId || !startDate || !returnDate || returnDate <= startDate) {
    return supplied ? null : error(c, 400, "LEAVE_DATE_REQUIRED", "Personel, izne çıkış ve işe dönüş tarihi zorunludur. İşe dönüş tarihi izne çıkıştan sonra olmalıdır.");
  }
  const employees = await monthlyRows(c, companyId);
  const employee = employees.find((row) => text(row.id) === employeeId);
  if (!employee) return supplied ? null : error(c, 400, "INVALID_EMPLOYEE", "Personel bulunamadı.");
  const policy = await leavePolicyV2(c, companyId);
  const officialHolidays = await officialHolidayDatesV2(c, companyId);
  const range = calculateAnnualLeaveRange(startDate, returnDate, policy.countedWeekdays, policy.excludeOfficialHolidays, officialHolidays);
  if (!range.calendarDays || range.calendarDays > 370) return supplied ? null : error(c, 400, "LEAVE_RANGE_INVALID", "İzin aralığı 1 ile 370 takvim günü arasında olmalıdır.");

  const currentId = text(body.id);
  const overlaps = await all(c, `SELECT id,employee_id,start_date,end_date,status,record_type
      FROM ik_leave_plans
      WHERE main_company_id=? AND status<>'CANCELLED' AND start_date<=? AND end_date>=? AND id<>?`,
    [companyId, range.lastLeaveDate, startDate, currentId]);
  const employeeMap = new Map(employees.map((row) => [text(row.id), row]));
  const sameDepartmentCount = overlaps.filter((row) => {
    const other = employeeMap.get(text(row.employee_id));
    return text(row.employee_id) !== employeeId && text(other?.department) && text(other?.department) === text(employee.department);
  }).length;
  const departmentLimitExceeded = sameDepartmentCount + 1 > policy.maxConcurrentDepartment;
  const conflicts = overlaps.map((row) => {
    const other = employeeMap.get(text(row.employee_id));
    const same = text(row.employee_id) === employeeId;
    const sameDepartment = Boolean(text(other?.department) && text(other?.department) === text(employee.department));
    return {
      id: text(row.id), employeeId: text(row.employee_id), fullName: text(other?.fullName) || "-", department: text(other?.department),
      startDate: hrDateOnly(row.start_date), endDate: hrDateOnly(row.end_date), status: text(row.status),
      severity: same ? "CRITICAL" : sameDepartment && departmentLimitExceeded ? "WARNING" : "INFO",
      message: same ? "Personelin aynı tarihlerde başka izin kaydı var." : sameDepartment && departmentLimitExceeded ? `${text(employee.department) || "Aynı bölüm"} için eş zamanlı izin sınırı aşılıyor.` : "Başka personelin izin planıyla tarih kesişiyor.",
    };
  });
  const marker = currentId ? `ik-leave-plan:${currentId}` : "";
  const usedRow = await first(c, `SELECT COALESCE(SUM(l.day_count),0) AS total
      FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id
      WHERE l.employee_id=? AND e.main_company_id=? AND UPPER(l.record_type) LIKE '%YILLIK%'
        AND (?='' OR COALESCE(l.document_path,'')<>?)`, [employeeId, companyId, marker, marker]);
  const annualRight = number(employee.annualLeaveEntitlement) + number(employee.annualLeaveCarryover);
  const annualUsed = number(usedRow?.total);
  const balanceBefore = annualRight - annualUsed;
  const balanceAfter = balanceBefore - range.countedDays;
  const data = {
    ok: true, employee, policy, officialHolidays, ...range,
    conflicts,
    hasCriticalConflict: conflicts.some((row) => row.severity === "CRITICAL"),
    hasDepartmentWarning: conflicts.some((row) => row.severity === "WARNING"),
    annualRight, annualUsed, balanceBefore, balanceAfter,
  };
  return supplied ? data : okData(c, data);
}

async function saveAdvancedLeaveRecordV2(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  const recordType = text(body.recordType || body.type) || "Yıllık izin";
  const isAnnual = upper(recordType).includes("YILLIK") || Boolean(text(body.returnDate));
  if (!isAnnual) {
    if (!(await employeeBelongsToCompany(c, employeeId, companyId))) return error(c, 400, "INVALID_EMPLOYEE", "Personel bulunamadı.");
    const startDate = hrDateOnly(body.startDate || body.start);
    const endDate = hrDateOnly(body.endDate || body.end || startDate);
    if (!startDate || !endDate || endDate < startDate) return error(c, 400, "DATE_REQUIRED", "Geçerli izin başlangıç ve bitiş tarihi zorunludur.");
    const dates = Array.isArray(body.dates) ? body.dates.map(hrDateOnly).filter(Boolean) : [];
    const diffDays = Math.max(1, Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000) + 1);
    const dayCount = number(body.dayCount || body.days) || dates.length || diffDays;
    const id = text(body.id) || crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO hr_leave_records_v2 (id,employee_id,record_type,effect_type,start_date,end_date,day_count,document_path,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, employeeId, recordType, text(body.effectType || body.wageEffect) || "Kayıt", startDate, endDate, dayCount, text(body.documentPath || body.documentId), text(body.note), nowIso()).run();
    return okData(c, { id, employeeId, recordType, startDate, endDate, dayCount, status: "TAKEN" }, 201);
  }

  const preview = await previewAdvancedLeaveV2(c, body) as Row | null;
  if (!preview) return error(c, 400, "LEAVE_PREVIEW_FAILED", "Yıllık izin günleri hesaplanamadı.");
  if (preview.hasCriticalConflict) return error(c, 409, "LEAVE_CONFLICT", "Personelin seçilen tarihlerde başka yıllık izin kaydı var.");
  if (preview.hasDepartmentWarning && body.allowDepartmentConflict !== true) return error(c, 409, "DEPARTMENT_LEAVE_CONFLICT", "Aynı bölümde izin çakışması var. Yetkili onayı gerekir.");

  const statusRaw = upper(body.status || (text(preview.startDate) > new Date().toISOString().slice(0, 10) ? "PLANNED" : "APPROVED"));
  const status = ["PLANNED", "APPROVED", "TAKEN"].includes(statusRaw) ? statusRaw : "PLANNED";
  const planId = text(body.id) || crypto.randomUUID();
  const marker = `ik-leave-plan:${planId}`;
  const documentNo = text(body.documentNo || body.documentId);
  const note = text(body.note);
  const excludedDates = Array.isArray(preview.excludedDates) ? preview.excludedDates : [];
  await c.env.DB.prepare(`INSERT INTO ik_leave_plans
    (id,main_company_id,employee_id,record_type,start_date,end_date,return_date,counted_days,excluded_json,status,document_no,note,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,record_type=excluded.record_type,start_date=excluded.start_date,end_date=excluded.end_date,return_date=excluded.return_date,counted_days=excluded.counted_days,excluded_json=excluded.excluded_json,status=excluded.status,document_no=excluded.document_no,note=excluded.note,updated_at=excluded.updated_at`)
    .bind(planId, companyId, employeeId, recordType, text(preview.startDate), text(preview.lastLeaveDate), text(preview.returnDate), number(preview.countedDays), JSON.stringify(excludedDates), status, documentNo, note, text(body.userName) || "Sistem", nowIso(), nowIso()).run();
  await c.env.DB.prepare("DELETE FROM hr_leave_records_v2 WHERE document_path=?").bind(marker).run();
  let recordId = "";
  if (status !== "PLANNED") {
    recordId = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO hr_leave_records_v2
      (id,employee_id,record_type,effect_type,start_date,end_date,day_count,document_path,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(recordId, employeeId, recordType, text(body.effectType || body.wageEffect) || "Ücretli", text(preview.startDate), text(preview.lastLeaveDate), number(preview.countedDays), marker, note, nowIso()).run();
  }
  await audit(c, { mainCompanyId: companyId, period: text(preview.startDate).slice(0, 7), employeeId, entityType: "IZIN", action: status === "PLANNED" ? "PLAN" : "APPROVE", summary: `${recordType}: ${number(preview.countedDays)} gün`, details: { planId, recordId, startDate: preview.startDate, lastLeaveDate: preview.lastLeaveDate, returnDate: preview.returnDate, countedDays: preview.countedDays } });
  return okData(c, { ...preview, planId, recordId, status, message: status === "PLANNED" ? "Yıllık izin planı kaydedildi." : "Yıllık izin resmi kaydı oluşturuldu." }, 201);
}

async function cancelAdvancedLeaveV2(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const id = text(body.id);
  if (!id) return error(c, 400, "ID_REQUIRED", "İzin kaydı seçilmelidir.");
  const plan = await first(c, "SELECT * FROM ik_leave_plans WHERE id=? AND main_company_id=? LIMIT 1", [id, companyId]);
  if (!plan) return error(c, 404, "NOT_FOUND", "İzin planı bulunamadı.");
  await c.env.DB.prepare("UPDATE ik_leave_plans SET status='CANCELLED',note=?,updated_at=? WHERE id=?").bind(text(body.reason || plan.note || "İptal edildi"), nowIso(), id).run();
  await c.env.DB.prepare("DELETE FROM hr_leave_records_v2 WHERE document_path=?").bind(`ik-leave-plan:${id}`).run();
  await audit(c, { mainCompanyId: companyId, period: hrDateOnly(plan.start_date).slice(0, 7), employeeId: text(plan.employee_id), entityType: "IZIN", action: "CANCEL", summary: "Yıllık izin kaydı iptal edildi.", details: { id, reason: text(body.reason) } });
  return okData(c, { id, cancelled: true, message: "İzin kaydı iptal edildi; izin bakiyesi etkisi geri alındı." });
}

async function leaveCenterV2(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const policy = await leavePolicyV2(c, companyId);
  const employees = await monthlyRows(c, companyId);
  const employeeMap = new Map(employees.map((row) => [text(row.id), row]));
  const managedRows = await all(c, "SELECT * FROM ik_leave_plans WHERE main_company_id=? ORDER BY start_date ASC", [companyId]);
  const managedPlans = managedRows.map((row) => {
    const employee = employeeMap.get(text(row.employee_id));
    let excludedDates: unknown[] = [];
    try { const parsed = JSON.parse(text(row.excluded_json) || "[]"); if (Array.isArray(parsed)) excludedDates = parsed; } catch {}
    return { id: text(row.id), employeeId: text(row.employee_id), fullName: text(employee?.fullName) || "-", code: text(employee?.code), department: text(employee?.department), title: text(employee?.title), recordType: text(row.record_type), startDate: hrDateOnly(row.start_date), endDate: hrDateOnly(row.end_date), lastLeaveDate: hrDateOnly(row.end_date), returnDate: hrDateOnly(row.return_date), countedDays: number(row.counted_days), excludedDates, status: text(row.status), documentNo: text(row.document_no), note: text(row.note), createdAt: row.created_at, updatedAt: row.updated_at, legacy: false };
  });
  const legacyRows = await all(c, `SELECT l.* FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id
      WHERE e.main_company_id=? AND (l.document_path IS NULL OR l.document_path NOT LIKE 'ik-leave-plan:%') ORDER BY l.start_date ASC`, [companyId]);
  const legacyPlans = legacyRows.filter((row) => upper(row.record_type).includes("YILLIK")).map((row) => {
    const employee = employeeMap.get(text(row.employee_id));
    const endDate = hrDateOnly(row.end_date);
    return { id: `legacy:${text(row.id)}`, employeeId: text(row.employee_id), fullName: text(employee?.fullName) || "-", code: text(employee?.code), department: text(employee?.department), title: text(employee?.title), recordType: text(row.record_type), startDate: hrDateOnly(row.start_date), endDate, lastLeaveDate: endDate, returnDate: addIsoDays(endDate, 1), countedDays: number(row.day_count), excludedDates: [], status: "TAKEN", documentNo: "", note: text(row.note), createdAt: row.created_at, updatedAt: row.created_at, legacy: true };
  });
  const plans = [...managedPlans, ...legacyPlans].sort((a, b) => text(a.startDate).localeCompare(text(b.startDate)));
  const active = managedPlans.filter((row) => row.status !== "CANCELLED");
  const conflicts: Row[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i], b = active[j];
      const overlapStart = a.startDate > b.startDate ? a.startDate : b.startDate;
      const overlapEnd = a.endDate < b.endDate ? a.endDate : b.endDate;
      if (overlapStart > overlapEnd) continue;
      const sameEmployee = a.employeeId === b.employeeId;
      const sameDepartment = Boolean(a.department && a.department === b.department);
      if (!sameEmployee && !sameDepartment) continue;
      const departmentCount = sameDepartment ? active.filter((item) => item.department === a.department && item.startDate <= overlapEnd && item.endDate >= overlapStart).length : 0;
      if (sameEmployee || departmentCount > policy.maxConcurrentDepartment) conflicts.push({ id: `${a.id}:${b.id}`, severity: sameEmployee ? "CRITICAL" : "WARNING", department: a.department || b.department, startDate: overlapStart, endDate: overlapEnd, people: [a.fullName, b.fullName], message: sameEmployee ? "Aynı personelin çakışan izin kayıtları var." : `${a.department || "Aynı bölüm"} için eş zamanlı izin sınırı aşılıyor.` });
    }
  }
  return okData(c, { policy, employees, plans, conflicts });
}

async function leaveCenter(c: Context<AppEnv>) {
  const plans = await leaveRows(c);
  return okData(c, { policy: { countedWeekdays: [1, 2, 3, 4, 5, 6], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 }, plans, conflicts: [] });
}

async function cancelAdvancedLeave(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const id = text(body.id);
  const companyId = companyIdOf(c, body);
  const current = await first(c, "SELECT l.id FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id WHERE l.id=? AND e.main_company_id=?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "İzin kaydı bulunamadı.");
  await c.env.DB.prepare("DELETE FROM hr_leave_records_v2 WHERE id=?").bind(id).run();
  return okData(c, { id, cancelled: true });
}

function protect(handler: (c: Context<AppEnv>) => Promise<Response>) {
  return async (c: Context<AppEnv>) => {
    try { return await handler(c); }
    catch (cause) {
      console.error(JSON.stringify({ message: "IK relational route failed", path: c.req.path, error: cause instanceof Error ? cause.message : String(cause) }));
      return error(c, 500, "IK_DATABASE_ERROR", "İK ilişkisel verisi işlenemedi.");
    }
  };
}

export function registerIkRelationalCloudRoutes(app: Hono<AppEnv>) {
  app.get("/api/ik/monthly-employees", protect(getMonthly));
  app.post("/api/ik/monthly-employees", protect(createMonthly));
  app.post("/api/ik/monthly-employees/leave-balances", protect(updateLeaveBalances));
  app.get("/api/ik/monthly-employees/:id/salary-contracts", protect(salaryContracts));
  app.post("/api/ik/monthly-employees/:id/salary-contracts", protect(createSalaryContract));
  app.get("/api/ik/monthly-employees/:id", protect(getMonthlyById));
  app.patch("/api/ik/monthly-employees/:id", protect(updateMonthly));
  app.delete("/api/ik/monthly-employees/:id", protect(deleteMonthly));

  app.get("/api/ik/daily-employees", protect(async (c) => okList(c, await dailyRows(c))));
  app.post("/api/ik/daily-employees", protect(createDaily));
  app.patch("/api/ik/daily-employees/:id", protect(updateDaily));
  app.delete("/api/ik/daily-employees/:id", protect(deleteDaily));
  app.get("/api/ik/daily-attendance", protect(async (c) => okList(c, await attendanceRows(c))));
  app.post("/api/ik/daily-attendance/save-range", protect(saveAttendance));
  app.get("/api/ik/daily-attendance/weekly-summary", protect(async (c) => okList(c, await weeklyAttendanceRows(c))));
  app.get("/api/ik/daily-attendance/payment-slips", protect(async (c) => okList(c, await weeklyAttendanceRows(c))));
  app.get("/api/ik/gunluk-personel/gun-kayitlari", protect(focusedDailyRecords));
  app.post("/api/ik/gunluk-personel/gun-kayitlari", protect(saveFocusedDailyRecords));
  app.get("/api/ik/gunluk-personel/liste", protect(focusedDailyRoster));
  app.post("/api/ik/gunluk-personel/liste", protect(saveFocusedDailyRoster));

  app.get("/api/ik/monthly-adjustments", protect(listAdjustments));
  app.post("/api/ik/monthly-adjustments", protect(saveAdjustment));
  app.patch("/api/ik/monthly-adjustments/:id", protect(saveAdjustment));
  app.delete("/api/ik/monthly-adjustments/:id", protect(deleteAdjustment));
  app.get("/api/ik/leaves", protect(listLeaves));
  app.post("/api/ik/leaves", protect(saveLeave));
  app.patch("/api/ik/leaves/:id", protect(saveLeave));
  app.delete("/api/ik/leaves/:id", protect(deleteLeave));
  app.get("/api/ik/payroll", protect(listPayrolls));

  app.get("/api/ik/advanced/month", protect(advancedMonth));
  app.get("/api/ik/advanced/payroll", protect(advancedPayroll));
  app.post("/api/ik/advanced/payroll/override", protect(saveAdvancedPayrollOverride));
  app.get("/api/ik/advanced/audit-logs", protect(auditLogs));
  app.get("/api/ik/advanced/leave-center", protect(leaveCenterV2));
  app.post("/api/ik/advanced/leave/preview", protect(async (c) => (await previewAdvancedLeaveV2(c)) as Response));
  app.post("/api/ik/advanced/leave/policy", protect(saveAdvancedLeavePolicyV2));
  app.post("/api/ik/advanced/person-card/:employeeId", protect(savePersonCard));
  app.post("/api/ik/advanced/finance-movement", protect(saveAdvancedFinance));
  app.post("/api/ik/advanced/finance-movement/update", protect(updateAdvancedFinance));
  app.post("/api/ik/advanced/finance-movement/delete", protect(deleteAdvancedFinance));
  app.post("/api/ik/advanced/leave", protect(saveAdvancedLeaveRecordV2));
  app.post("/api/ik/advanced/leave/cancel", protect(cancelAdvancedLeaveV2));
}
