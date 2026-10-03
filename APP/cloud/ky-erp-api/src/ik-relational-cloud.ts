// @ts-nocheck
import type { Context, Hono } from "hono";
import * as XLSX from "xlsx";
import { getAuthenticatedUser } from "./auth-cloud.ts";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, unknown>;

const CANONICAL_COMPANY_ID = "mecit-hakan";
const CANONICAL_COMPANY_ALIASES = new Set([
  "mecit-hakan",
  "main-mecit-hakan",
  "mecit-hakan-gursu",
  "hakan-baski",
  "main-hakan",
  "main-hakan-baski",
  "hkn-baski",
]);

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const number = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const flag = (value: unknown) => value === true || value === 1 || value === "1";
const nowIso = () => new Date().toISOString();

function ikAdminRole(role: unknown) {
  return ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(upper(role));
}

function normalizeHknPersonnelCode(value: unknown) {
  const raw = upper(value).replace(/\s+/g, "");
  const match = raw.match(/^(?:HKN-?)?(\d+)$/);
  if (!match) return "";
  const numberValue = Number(match[1]);
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > 99999) return "";
  return `HKN-${String(numberValue).padStart(2, "0")}`;
}

export function canonicalHrCompanyId(value: unknown) {
  const normalized = text(value)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || CANONICAL_COMPANY_ALIASES.has(normalized)) {
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

export function hrTodayIstanbul(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  const version = [text(row.updated_at), text(row.card_updated_at)].filter(Boolean).sort().at(-1) || text(row.updated_at || row.created_at);
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
    personnelStatus: text(row.personnel_status) || "NORMAL",
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
    cardUpdatedAt: row.card_updated_at,
    version,
  };
}

function overtimeMultiplierValue(value: unknown) {
  return number(value) >= 1.75 ? 2 : 1.5;
}

export function calculateOvertimeAmount(baseSalaryValue: unknown, hoursValue: unknown, multiplierValue: unknown, divisorValue: unknown = 225) {
  const baseSalary = Math.max(0, number(baseSalaryValue));
  const hours = Math.max(0, number(hoursValue));
  const divisor = number(divisorValue) || 225;
  const multiplier = overtimeMultiplierValue(multiplierValue);
  if (baseSalary <= 0 || hours <= 0 || divisor <= 0) return 0;
  return Math.round(((baseSalary / divisor) * hours * multiplier) * 100) / 100;
}

export function calculatePayrollAmounts(input: {
  salary?: unknown;
  road?: unknown;
  extra?: unknown;
  overtime?: unknown;
  advance?: unknown;
  deduction?: unknown;
  garnishment?: unknown;
}) {
  const earnings = Math.round((
    number(input.salary) +
    number(input.road) +
    number(input.extra) +
    number(input.overtime)
  ) * 100) / 100;
  const net = Math.max(Math.round((
    earnings -
    number(input.advance) -
    number(input.deduction) -
    number(input.garnishment)
  ) * 100) / 100, 0);
  return { earnings, net };
}

function overtimeMetaFromNote(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^\[OT:(1\.5|2):(WEEKDAY_50|WEEKEND_100)\]\s*/i);
  const multiplier = match ? overtimeMultiplierValue(match[1]) : (upper(raw).includes("X2") ? 2 : 1.5);
  return {
    multiplier,
    kind: multiplier === 2 ? "WEEKEND_100" : "WEEKDAY_50",
    note: raw.replace(/^\[OT:(1\.5|2):(WEEKDAY_50|WEEKEND_100)\]\s*/i, "").trim(),
  };
}

function overtimeStoredNote(note: unknown, multiplierValue: unknown) {
  const multiplier = overtimeMultiplierValue(multiplierValue);
  const kind = multiplier === 2 ? "WEEKEND_100" : "WEEKDAY_50";
  const clean = text(note).replace(/^\[OT:(1\.5|2):(WEEKDAY_50|WEEKEND_100)\]\s*/i, "").trim();
  return `[OT:${multiplier}:${kind}]${clean ? ` ${clean}` : ""}`;
}

function mapAdjustment(row: Row): Row {
  const adjustmentType = text(row.adjustment_type);
  const overtimeMeta = upper(adjustmentType).includes("MESAI")
    ? overtimeMetaFromNote(row.note)
    : { multiplier: 1, kind: "", note: text(row.note) };
  return {
    id: text(row.id),
    employeeId: text(row.employee_id),
    personId: text(row.employee_id),
    date: hrDateOnly(row.date),
    adjustmentType,
    type: adjustmentType,
    hourOrDay: number(row.hour_or_day),
    hours: number(row.hour_or_day),
    amount: number(row.amount),
    overtimeMultiplier: overtimeMeta.multiplier,
    overtimeKind: overtimeMeta.kind,
    paymentMethod: text(row.payment_method) || "Elden",
    payrollEffect: text(row.payroll_effect),
    note: overtimeMeta.note,
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
              s.garnishment_note,
              s.updated_at AS card_updated_at
         FROM hr_monthly_employees e
         LEFT JOIN ik_person_card_settings s
           ON s.employee_id = e.id AND s.main_company_id = e.main_company_id
        WHERE e.main_company_id = ?
        ORDER BY e.code COLLATE NOCASE ASC, e.full_name COLLATE NOCASE ASC`,
      [companyId],
    )
  ).map(mapMonthly);
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
    "Banka + Elden";
  const enteredBank = Math.max(0, number(body.bankAmount ?? current.bank_amount));
  const total = Math.max(0, salary + road);
  const paymentUpper = upper(requestedPayment);
  const cashOnly = paymentUpper.includes("ELDEN") && !paymentUpper.includes("BANKA");
  const bankOnly = paymentUpper.includes("BANKA") && !paymentUpper.includes("ELDEN");
  const bank = cashOnly ? 0 : bankOnly ? total : Math.min(total, enteredBank);
  const cash = bankOnly ? 0 : Math.max(0, total - bank);
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

async function nextMonthlyPersonnelCode(c: Context<AppEnv>, companyId: string) {
  const row = await first(
    c,
    `SELECT MAX(CASE
         WHEN UPPER(TRIM(code)) LIKE 'HKN-%'
          AND CAST(SUBSTR(TRIM(code), 5) AS INTEGER) > 0
         THEN CAST(SUBSTR(TRIM(code), 5) AS INTEGER)
         ELSE 0
       END) AS max_code
       FROM hr_monthly_employees
      WHERE main_company_id=?`,
    [companyId],
  );
  const next = Math.max(0, Math.trunc(number(row?.max_code))) + 1;
  return `HKN-${String(next).padStart(2, "0")}`;
}

async function createMonthly(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const value = monthlyValues(body);
  if (!value.fullName) return error(c, 400, "FULL_NAME_REQUIRED", "Ad soyad zorunludur.");
  if (!value.hireDate) return error(c, 400, "HIRE_DATE_REQUIRED", "İşe giriş tarihi zorunludur.");
  value.status = "Aktif";
  value.code = await nextMonthlyPersonnelCode(c, companyId);
  const duplicateCode = await first(
    c,
    "SELECT id FROM hr_monthly_employees WHERE main_company_id=? AND upper(trim(code))=upper(trim(?)) LIMIT 1",
    [companyId, value.code],
  );
  if (duplicateCode) return error(c, 409, "DUPLICATE_PERSONNEL_CODE", "Bu HKN personel kodu zaten kullanılıyor.");
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
  if (/^HKN-\d+$/i.test(text(current.code))) value.code = upper(current.code);
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
  const timestamp = nowIso();
  const effectiveExitDate = hrTodayIstanbul();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE hr_monthly_employees SET status='Pasif', updated_at=? WHERE id=? AND main_company_id=?").bind(timestamp, id, companyId),
    c.env.DB.prepare(`INSERT INTO ik_person_card_settings(employee_id,main_company_id,active_passive,exit_date,updated_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(employee_id) DO UPDATE SET
        active_passive=excluded.active_passive,
        exit_date=excluded.exit_date,
        updated_at=excluded.updated_at`)
      .bind(id, companyId, "Pasif", effectiveExitDate, timestamp),
  ]);
  const saved = { ...current, status: "Pasif", updated_at: timestamp };
  return okData(c, { ...mapMonthly(saved), exitDate: effectiveExitDate });
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
  const isOvertime = upper(adjustmentType).includes("MESAI");
  const multiplier = overtimeMultiplierValue(body.overtimeMultiplier || overtimeMetaFromNote(current?.note).multiplier);
  const amount = isOvertime
    ? await overtimeAmountForEmployee(c, companyId, employeeId, hourOrDay, multiplier)
    : number(body.amount ?? current?.amount);
  if (isOvertime && hourOrDay <= 0) return error(c, 400, "OVERTIME_HOURS_REQUIRED", "Mesai saati sıfırdan büyük olmalıdır.");
  const paymentMethod = isOvertime ? "Bordro" : (text(body.paymentMethod ?? current?.payment_method) || "Elden");
  const payrollEffect = isOvertime ? "Bordroya yansir" : (text(body.payrollEffect ?? current?.payroll_effect) || "Bordrodan düş");
  const note = isOvertime
    ? overtimeStoredNote(body.note ?? body.description ?? overtimeMetaFromNote(current?.note).note, multiplier)
    : (text(body.note ?? body.description ?? overtimeMetaFromNote(current?.note).note) || null);
  const status = text(body.status ?? current?.status) || "DRAFT";
  if (current) await c.env.DB.prepare("UPDATE hr_monthly_adjustments_v2 SET date=?,adjustment_type=?,hour_or_day=?,amount=?,payment_method=?,payroll_effect=?,note=?,status=? WHERE id=?").bind(date, adjustmentType, hourOrDay, amount, paymentMethod, payrollEffect, note, status, id).run();
  else await c.env.DB.prepare("INSERT INTO hr_monthly_adjustments_v2 (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,payroll_effect,note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id, employeeId, date, adjustmentType, hourOrDay, amount, paymentMethod, payrollEffect, note, status, nowIso()).run();
  const saved = await first(c, "SELECT * FROM hr_monthly_adjustments_v2 WHERE id=?", [id]);
  return okData(c, mapAdjustment(saved || { id, employee_id: employeeId, date, adjustment_type: adjustmentType, hour_or_day: hourOrDay, amount, payment_method: paymentMethod, payroll_effect: payrollEffect, note, status }), current ? 200 : 201);
}

async function overtimeAmountForEmployee(c: Context<AppEnv>, companyId: string, employeeId: string, hours: number, multiplierValue: unknown) {
  const employee = await first(c, `SELECT e.salary,e.overtime_hourly_base,s.base_employee_id
    FROM hr_monthly_employees e
    LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
    WHERE e.id=? AND e.main_company_id=? LIMIT 1`, [employeeId, companyId]);
  if (!employee) return 0;
  let baseSalary = number(employee.salary);
  const baseEmployeeId = text(employee.base_employee_id);
  if (baseEmployeeId) {
    const baseEmployee = await first(c, "SELECT salary FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1", [baseEmployeeId, companyId]);
    if (baseEmployee) baseSalary = number(baseEmployee.salary);
  }
  const divisor = number(employee.overtime_hourly_base) || 225;
  return calculateOvertimeAmount(baseSalary, hours, multiplierValue, divisor);
}

const IK_PERSON_CARD_CALC_SCOPE = "IK_PERSON_CARD_CALC";

type PersonCardCalc = {
  deductionHourlyBase: number;
};

type AbsenceDeductionResult = {
  hours: number;
  deductionDivisor: number;
  salaryHourly: number;
  salaryCut: number;
  roadDaily: number;
  roadCut: number;
  total: number;
};

function personCardCalcFileName(companyId: string, employeeId: string) {
  return `${companyId}:${employeeId}`;
}

function parsePersonCardCalc(row: Row | null | undefined): PersonCardCalc {
  try {
    const parsed = JSON.parse(text(row?.data) || "{}") as Row;
    return { deductionHourlyBase: number(parsed.deductionHourlyBase) || 300 };
  } catch {
    return { deductionHourlyBase: 300 };
  }
}

async function personCardCalc(c: Context<AppEnv>, companyId: string, employeeId: string): Promise<PersonCardCalc> {
  const row = await first(c, "SELECT data FROM json_store WHERE scope=? AND file_name=? LIMIT 1", [IK_PERSON_CARD_CALC_SCOPE, personCardCalcFileName(companyId, employeeId)]);
  return parsePersonCardCalc(row);
}

async function savePersonCardCalc(c: Context<AppEnv>, companyId: string, employeeId: string, deductionHourlyBase: number) {
  const fileName = personCardCalcFileName(companyId, employeeId);
  const id = `ik-person-card-calc:${companyId}:${employeeId}`;
  const data = JSON.stringify({ deductionHourlyBase, updatedAt: nowIso() });
  await c.env.DB.prepare(`INSERT INTO json_store (id,scope,main_company_slug,file_name,data,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET scope=excluded.scope,main_company_slug=excluded.main_company_slug,file_name=excluded.file_name,data=excluded.data,updated_at=excluded.updated_at`)
    .bind(id, IK_PERSON_CARD_CALC_SCOPE, null, fileName, data, nowIso(), nowIso()).run();
}

async function absenceDeductionForEmployee(c: Context<AppEnv>, companyId: string, employeeId: string, mode: "DAY" | "HOUR", hoursValue: unknown): Promise<AbsenceDeductionResult> {
  const employee = await first(c, "SELECT salary,road_allowance FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1", [employeeId, companyId]);
  if (!employee) return { hours: 0, deductionDivisor: 300, salaryHourly: 0, salaryCut: 0, roadDaily: 0, roadCut: 0, total: 0 };
  const salary = Math.max(0, number(employee.salary));
  const road = Math.max(0, number(employee.road_allowance));
  const calc = await personCardCalc(c, companyId, employeeId);
  const deductionDivisor = number(calc.deductionHourlyBase) || 300;
  const salaryDaily = Math.round((salary / 30) * 100) / 100;
  const roadDaily = Math.round((road / 30) * 100) / 100;
  if (mode === "DAY") {
    return { hours: 10, deductionDivisor, salaryHourly: Math.round((salary / deductionDivisor) * 100) / 100, salaryCut: salaryDaily, roadDaily, roadCut: roadDaily, total: Math.round((salaryDaily + roadDaily) * 100) / 100 };
  }
  const hours = Math.max(0, Math.min(number(hoursValue), 10));
  const salaryHourly = Math.round((salary / deductionDivisor) * 100) / 100;
  const salaryCut = Math.round((salaryHourly * hours) * 100) / 100;
  const roadCut = hours >= 10 ? roadDaily : 0;
  return { hours, deductionDivisor, salaryHourly, salaryCut, roadDaily, roadCut, total: Math.round((salaryCut + roadCut) * 100) / 100 };
}

async function saveAdvancedFinance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const adjustmentType = text(body.adjustmentType || body.type) || "Avans";
  const isBulkAdvance = upper(adjustmentType).includes("TOPLU") && upper(adjustmentType).includes("AVANS");
  const singleEmployeeId = text(body.employeeId);
  if (!isBulkAdvance && Array.isArray(body.employeeIds) && body.employeeIds.length) {
    return error(c, 400, "SINGLE_EMPLOYEE_ONLY", "Tekli avans/kesinti/mesai işleminde yalnız employeeId kullanılmalıdır.");
  }
  const employeeIds: string[] = isBulkAdvance && Array.isArray(body.employeeIds)
    ? [...new Set(body.employeeIds.map((value: unknown) => text(value)).filter(Boolean))]
    : [singleEmployeeId].filter(Boolean);
  if (!employeeIds.length) return error(c, 400, "EMPLOYEE_REQUIRED", isBulkAdvance ? "Toplu işlem için employeeIds zorunludur." : "Tekli işlem için employeeId zorunludur.");
  const valid = await all(c, `SELECT e.id,e.hire_date,s.exit_date FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.main_company_id=? AND e.id IN (${employeeIds.map(() => "?").join(",")})`, [companyId, ...employeeIds]);
  if (valid.length !== employeeIds.length) return error(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");

  const date = hrDateOnly(body.date) || hrTodayIstanbul();
  const invalidEmployment = valid.find((row) => {
    const hire = hrDateOnly(row.hire_date);
    const exit = hrDateOnly(row.exit_date);
    return (hire && date < hire) || (exit && date > exit);
  });
  if (invalidEmployment) return error(c, 409, "FINANCE_OUTSIDE_EMPLOYMENT", "Mesai/avans/kesinti tarihi personelin çalışma dönemi dışında olamaz.");
  const dateYear = number(date.slice(0, 4));
  const dateMonth = number(date.slice(5, 7));
  const financeLock = await rejectAdvancedPeriodLocked(c, companyId, dateYear, dateMonth);
  if (financeLock) return financeLock;
  const hourOrDay = number(body.hourOrDay || body.hours);
  const typeUpper = upper(adjustmentType);
  const isOvertime = typeUpper.includes("MESAI");
  const isAbsenceDay = (typeUpper.includes("EKSIK") || typeUpper.includes("EKSİK")) && (typeUpper.includes("GUN") || typeUpper.includes("GÜN"));
  const isAbsenceHour = (typeUpper.includes("EKSIK") || typeUpper.includes("EKSİK")) && typeUpper.includes("SAAT");
  const isAbsence = isAbsenceDay || isAbsenceHour || typeUpper.includes("DEVAMSIZ") || typeUpper.includes("GELMEDI") || typeUpper.includes("GELMEDİ");
  const absenceMode: "DAY" | "HOUR" = isAbsenceDay || typeUpper.includes("DEVAMSIZ") || typeUpper.includes("GELMEDI") || typeUpper.includes("GELMEDİ") ? "DAY" : "HOUR";
  if (isOvertime && hourOrDay <= 0) return error(c, 400, "OVERTIME_HOURS_REQUIRED", "Mesai saati sıfırdan büyük olmalıdır.");
  if (isAbsence && absenceMode === "HOUR" && (hourOrDay <= 0 || hourOrDay > 10)) return error(c, 400, "ABSENCE_HOURS_INVALID", "Eksik saat 0 dan büyük ve en fazla 10 saat olmalıdır.");
  let amount = number(body.amount);
  if (!isOvertime && !isAbsence && amount <= 0 && hourOrDay <= 0) return error(c, 400, "AMOUNT_REQUIRED", "Tutar veya süre sıfırdan büyük olmalıdır.");

  const paymentMethod = text(body.paymentMethod) || (isOvertime ? "Bordro" : "Elden");
  const payrollEffect = text(body.payrollEffect) || (isOvertime ? "Bordroya yansir" : "Bordrodan düş");
  const status = text(body.status) || "APPROVED";
  const multiplier = overtimeMultiplierValue(body.overtimeMultiplier);
  const statements: D1PreparedStatement[] = [];

  for (const employeeId of employeeIds) {
    const absence: AbsenceDeductionResult | null = isAbsence
      ? await absenceDeductionForEmployee(c, companyId, employeeId, absenceMode, hourOrDay)
      : null;
    const rowAmount = isOvertime
      ? await overtimeAmountForEmployee(c, companyId, employeeId, hourOrDay, multiplier)
      : isAbsence ? number(absence?.total) : amount;
    if (rowAmount <= 0) return error(c, 400, "AMOUNT_REQUIRED", "Hesaplanan tutar sıfırdan büyük olmalıdır.");
    const storedHourOrDay = isAbsence && absenceMode === "DAY" ? 1 : hourOrDay;
    const rowNote = isOvertime
      ? overtimeStoredNote(body.note || body.reason, multiplier)
      : isAbsence
        ? [absenceMode === "DAY"
            ? `1 gün eksik · Maaş/30: ${number(absence?.salaryCut).toFixed(2)} · Yol/30: ${number(absence?.roadCut).toFixed(2)}`
            : `Eksik saat: ${number(absence?.hours)}/10 · Kesinti böleni: ${number(absence?.deductionDivisor)} · Maaş kesintisi: ${number(absence?.salaryCut).toFixed(2)} · Yol kesintisi: ${number(absence?.roadCut).toFixed(2)}`,
          text(body.note || body.reason)].filter(Boolean).join(" · ")
        : (text(body.note || body.reason) || null);
    statements.push(c.env.DB.prepare("INSERT INTO hr_monthly_adjustments_v2 (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,payroll_effect,note,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), employeeId, date, adjustmentType, storedHourOrDay, rowAmount, isOvertime ? "Bordro" : paymentMethod, isOvertime || isAbsence ? "Bordroya yansir" : payrollEffect, rowNote, status, nowIso()));
  }
  await c.env.DB.batch(statements);
  await audit(c, {
    mainCompanyId: companyId,
    period: date.slice(0, 7),
    employeeId: employeeIds.length === 1 ? employeeIds[0] : undefined,
    entityType: "HAREKET",
    action: "FINANCE_CREATE",
    summary: `${adjustmentType} kaydı eklendi.`,
    details: { employeeIds, adjustmentType, date, hourOrDay, amount, paymentMethod, payrollEffect },
  });
  return okData(c, { savedCount: statements.length, employeeIds, adjustmentType, overtimeMultiplier: isOvertime ? multiplier : undefined });
}

async function updateAdvancedFinance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const id = text(body.id);
  const companyId = companyIdOf(c, body);
  const current = await first(c, "SELECT a.* FROM hr_monthly_adjustments_v2 a JOIN hr_monthly_employees e ON e.id=a.employee_id WHERE a.id=? AND e.main_company_id=?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Mesai/avans/kesinti kaydı bulunamadı.");
  if (upper(current.note).includes("SON BORDRO KONTROL")) {
    return error(c, 409, "FINAL_CONTROL_CORRECTION_IMMUTABLE", "Son bordro kontrolü düzeltmesi hareket ekranından değiştirilemez.");
  }

  if (Array.isArray(body.employeeIds) && body.employeeIds.length) {
    return error(c, 400, "SINGLE_EMPLOYEE_ONLY", "Hareket güncellemesinde yalnız employeeId kullanılmalıdır.");
  }
  const employeeId = text(body.employeeId || current.employee_id);
  const valid = await first(c, `SELECT e.id,e.hire_date,s.exit_date FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=? LIMIT 1`, [employeeId, companyId]);
  if (!valid) return error(c, 400, "INVALID_EMPLOYEE", "Başka firmaya ait veya geçersiz personel var.");

  const targetDate = hrDateOnly(body.date || current.date);
  const validHire = hrDateOnly(valid.hire_date);
  const validExit = hrDateOnly(valid.exit_date);
  if ((validHire && targetDate < validHire) || (validExit && targetDate > validExit)) {
    return error(c, 409, "FINANCE_OUTSIDE_EMPLOYMENT", "Mesai/avans/kesinti tarihi personelin çalışma dönemi dışında olamaz.");
  }
  const updateLock = await rejectAdvancedPeriodLocked(c, companyId, number(targetDate.slice(0, 4)), number(targetDate.slice(5, 7)));
  if (updateLock) return updateLock;

  const adjustmentType = text(body.adjustmentType || body.type || current.adjustment_type);
  const typeUpper = upper(adjustmentType);
  const isOvertime = typeUpper.includes("MESAI");
  const isAbsenceDay = (typeUpper.includes("EKSIK") || typeUpper.includes("EKSİK")) && (typeUpper.includes("GUN") || typeUpper.includes("GÜN"));
  const isAbsenceHour = (typeUpper.includes("EKSIK") || typeUpper.includes("EKSİK")) && typeUpper.includes("SAAT");
  const isAbsence = isAbsenceDay || isAbsenceHour || typeUpper.includes("DEVAMSIZ") || typeUpper.includes("GELMEDI") || typeUpper.includes("GELMEDİ");
  const absenceMode: "DAY" | "HOUR" = isAbsenceDay || typeUpper.includes("DEVAMSIZ") || typeUpper.includes("GELMEDI") || typeUpper.includes("GELMEDİ") ? "DAY" : "HOUR";
  const hourOrDay = number(body.hourOrDay ?? body.hours ?? current.hour_or_day);
  const multiplier = overtimeMultiplierValue(body.overtimeMultiplier || overtimeMetaFromNote(current.note).multiplier);
  if (isOvertime && hourOrDay <= 0) return error(c, 400, "OVERTIME_HOURS_REQUIRED", "Mesai saati sıfırdan büyük olmalıdır.");
  if (isAbsence && absenceMode === "HOUR" && (hourOrDay <= 0 || hourOrDay > 10)) return error(c, 400, "ABSENCE_HOURS_INVALID", "Eksik saat 0 dan büyük ve en fazla 10 saat olmalıdır.");
  const absence: AbsenceDeductionResult | null = isAbsence
    ? await absenceDeductionForEmployee(c, companyId, employeeId, absenceMode, hourOrDay)
    : null;
  const amount = isOvertime
    ? await overtimeAmountForEmployee(c, companyId, employeeId, hourOrDay, multiplier)
    : isAbsence ? number(absence?.total) : number(body.amount ?? current.amount);
  if (amount <= 0) return error(c, 400, "AMOUNT_REQUIRED", "Tutar sıfırdan büyük olmalıdır.");

  const note = isOvertime
    ? overtimeStoredNote(body.note ?? overtimeMetaFromNote(current.note).note, multiplier)
    : isAbsence
      ? [absenceMode === "DAY"
          ? `1 gün eksik · Maaş/30: ${number(absence?.salaryCut).toFixed(2)} · Yol/30: ${number(absence?.roadCut).toFixed(2)}`
          : `Eksik saat: ${number(absence?.hours)}/10 · Kesinti böleni: ${number(absence?.deductionDivisor)} · Maaş kesintisi: ${number(absence?.salaryCut).toFixed(2)} · Yol kesintisi: ${number(absence?.roadCut).toFixed(2)}`,
        text(body.note ?? overtimeMetaFromNote(current.note).note)].filter(Boolean).join(" · ")
      : (text(body.note ?? overtimeMetaFromNote(current.note).note) || null);
  await c.env.DB.prepare("UPDATE hr_monthly_adjustments_v2 SET employee_id=?,date=?,adjustment_type=?,hour_or_day=?,amount=?,payment_method=?,payroll_effect=?,note=?,status=? WHERE id=?")
    .bind(employeeId, targetDate, adjustmentType, isAbsence && absenceMode === "DAY" ? 1 : hourOrDay, amount,
      isOvertime ? "Bordro" : (text(body.paymentMethod || current.payment_method) || "Elden"),
      isOvertime || isAbsence ? "Bordroya yansir" : text(body.payrollEffect || current.payroll_effect),
      note, text(body.status || current.status), id).run();
  const saved = await first(c, "SELECT * FROM hr_monthly_adjustments_v2 WHERE id=?", [id]);
  await audit(c, {
    mainCompanyId: companyId,
    period: targetDate.slice(0, 7),
    employeeId,
    entityType: "HAREKET",
    action: "FINANCE_UPDATE",
    summary: `${adjustmentType} kaydı düzenlendi.`,
    details: { id, before: mapAdjustment(current), after: mapAdjustment(saved || current) },
  });
  return okData(c, mapAdjustment(saved || current));
}

async function deleteAdvancedFinance(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const id = text(body.id);
  const companyId = companyIdOf(c, body);
  const current = await first(c, "SELECT a.id,a.employee_id,a.adjustment_type,a.amount,a.payment_method,a.payroll_effect,a.note,a.date FROM hr_monthly_adjustments_v2 a JOIN hr_monthly_employees e ON e.id=a.employee_id WHERE a.id=? AND e.main_company_id=?", [id, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Mesai/avans/kesinti kaydı bulunamadı.");
  if (upper(current.note).includes("SON BORDRO KONTROL")) {
    return error(c, 409, "FINAL_CONTROL_CORRECTION_IMMUTABLE", "Son bordro kontrolü düzeltmesi hareket ekranından silinemez.");
  }
  const deleteDate = hrDateOnly(current.date);
  const deleteLock = await rejectAdvancedPeriodLocked(c, companyId, number(deleteDate.slice(0, 4)), number(deleteDate.slice(5, 7)));
  if (deleteLock) return deleteLock;
  await c.env.DB.prepare("DELETE FROM hr_monthly_adjustments_v2 WHERE id=?").bind(id).run();
  await audit(c, {
    mainCompanyId: companyId,
    period: deleteDate.slice(0, 7),
    employeeId: text(current.employee_id),
    entityType: "HAREKET",
    action: "FINANCE_DELETE",
    summary: `${text(current.adjustment_type)} kaydı silindi.`,
    details: { id, adjustmentType: text(current.adjustment_type), amount: number(current.amount), date: deleteDate },
  });
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
  const leaveLock = await rejectAdvancedPeriodLocked(c, companyId, number(startDate.slice(0, 4)), number(startDate.slice(5, 7)));
  if (leaveLock) return leaveLock;
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
  const leaveDate = hrDateOnly(row.start_date);
  const leaveLock = await rejectAdvancedPeriodLocked(c, companyId, number(leaveDate.slice(0, 4)), number(leaveDate.slice(5, 7)));
  if (leaveLock) return leaveLock;
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

export function employmentStateAtPeriod(employee: Row, card: Row, period: string) {
  const year = number(period.slice(0, 4));
  const month = number(period.slice(5, 7));
  if (!year || month < 1 || month > 12) return "INVALID_PERIOD";
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const hireDate = hrDateOnly(employee.hireDate || employee.startDate || employee.hire_date);
  const exitDate = hrDateOnly(card.exit_date || employee.exitDate || employee.exit_date);
  const currentStatus = upper(`${text(card.active_passive)} ${text(employee.status)}`);

  if (!hireDate) return "MISSING_HIRE_DATE";
  if (exitDate && exitDate < hireDate) return "INVALID_LIFECYCLE";
  if (hireDate > periodEnd) return "NOT_STARTED";
  if (exitDate && exitDate < periodStart) return "EXITED";
  if (currentStatus.includes("PAS") && !exitDate) return "MISSING_EXIT_DATE";
  if (hireDate.startsWith(period) && exitDate?.startsWith(period)) return "ENTERED_EXITED";
  if (hireDate.startsWith(period)) return "NEW_HIRE";
  if (exitDate?.startsWith(period)) return "EXIT_MONTH";
  return "ACTIVE";
}

export function advancedEmployeeVisible(employee: Row, card: Row, period: string) {
  if (card.payroll_included !== undefined && card.payroll_included !== null && !flag(card.payroll_included)) return false;
  return ["ACTIVE", "NEW_HIRE", "EXIT_MONTH", "ENTERED_EXITED", "MISSING_HIRE_DATE"].includes(employmentStateAtPeriod(employee, card, period));
}

const HISTORICAL_PAYROLL_FIELDS = new Set([
  "salary",
  "roadAllowance",
  "paymentChannel",
  "bankPaymentType",
  "bankAmount",
  "cashAmount",
  "overtimeBaseHours",
  "overtimeHourlyBase",
  "deductionHourlyBase",
]);

export function applyHistoricalEmployeeValues(employee: Row, changeRows: Row[] = [], periodEnd = "") {
  if (!periodEnd) return { ...employee };
  const result: Row = { ...employee };
  const own = changeRows
    .filter((row) => text(row.employee_id || row.employeeId) === text(employee.id))
    .filter((row) => hrDateOnly(row.effective_date || row.effectiveDate) > periodEnd)
    .sort((a, b) => {
      const byDate = hrDateOnly(b.effective_date || b.effectiveDate).localeCompare(hrDateOnly(a.effective_date || a.effectiveDate));
      if (byDate) return byDate;
      return text(b.created_at || b.createdAt).localeCompare(text(a.created_at || a.createdAt));
    });
  for (const row of own) {
    const field = text(row.field_name || row.fieldName);
    if (!HISTORICAL_PAYROLL_FIELDS.has(field)) continue;
    const oldValue = row.old_value ?? row.oldValue;
    if (["salary", "roadAllowance", "bankAmount", "cashAmount", "overtimeBaseHours", "overtimeHourlyBase", "deductionHourlyBase"].includes(field)) {
      result[field] = number(oldValue);
      if (field === "overtimeBaseHours") result.overtimeHourlyBase = number(oldValue) || 225;
      if (field === "overtimeHourlyBase") result.overtimeBaseHours = number(oldValue) || 225;
      continue;
    }
    if (field === "paymentChannel" || field === "bankPaymentType") {
      const paymentType = text(oldValue) || "Banka + Elden";
      result.paymentChannel = paymentType;
      result.bankPaymentType = paymentType;
    }
  }
  return result;
}

async function advancedSyncState(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const probes: Array<{ key: string; sql: string; values: unknown[] }> = [
    { key: "employee", sql: "SELECT MAX(COALESCE(updated_at,created_at,'')) AS stamp,COUNT(*) AS count FROM hr_monthly_employees WHERE main_company_id=?", values: [companyId] },
    { key: "card", sql: "SELECT MAX(COALESCE(updated_at,'')) AS stamp,COUNT(*) AS count FROM ik_person_card_settings WHERE main_company_id=?", values: [companyId] },
    { key: "history", sql: "SELECT MAX(COALESCE(created_at,'')) AS stamp,COUNT(*) AS count FROM ik_employee_change_history WHERE main_company_id=?", values: [companyId] },
    { key: "salary", sql: "SELECT MAX(COALESCE(s.created_at,s.effective_date,'')) AS stamp,COUNT(*) AS count FROM hr_salary_contracts s JOIN hr_monthly_employees e ON e.id=s.employee_id WHERE e.main_company_id=?", values: [companyId] },
    { key: "adjustment", sql: "SELECT MAX(COALESCE(a.created_at,a.date,'')) AS stamp,COUNT(*) AS count FROM hr_monthly_adjustments_v2 a JOIN hr_monthly_employees e ON e.id=a.employee_id WHERE e.main_company_id=?", values: [companyId] },
    { key: "leave", sql: "SELECT MAX(COALESCE(l.created_at,l.start_date,'')) AS stamp,COUNT(*) AS count FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id WHERE e.main_company_id=?", values: [companyId] },
    { key: "leavePlan", sql: "SELECT MAX(COALESCE(updated_at,created_at,'')) AS stamp,COUNT(*) AS count FROM ik_leave_plans WHERE main_company_id=?", values: [companyId] },
    { key: "payroll", sql: "SELECT MAX(COALESCE(updated_at,created_at,'')) AS stamp,COUNT(*) AS count FROM hr_payrolls_v2 WHERE main_company_id=?", values: [companyId] },
    { key: "sgk", sql: "SELECT MAX(COALESCE(updated_at,'')) AS stamp,COUNT(*) AS count FROM ik_person_monthly_compliance WHERE main_company_id=?", values: [companyId] },
    { key: "audit", sql: "SELECT MAX(COALESCE(created_at,'')) AS stamp,COUNT(*) AS count FROM hr_monthly_audit_logs WHERE main_company_id=?", values: [companyId] },
    { key: "document", sql: "SELECT MAX(COALESCE(d.created_at,d.date,'')) AS stamp,COUNT(*) AS count FROM hr_employee_documents d JOIN hr_monthly_employees e ON e.id=d.employee_id WHERE e.main_company_id=?", values: [companyId] },
    { key: "sgkImport", sql: "SELECT MAX(COALESCE(created_at,'')) AS stamp,COUNT(*) AS count FROM ik_sgk_imports WHERE main_company_id=?", values: [companyId] },
    { key: "close", sql: "SELECT MAX(COALESCE(updated_at,created_at,'')) AS stamp,COUNT(*) AS count FROM ik_monthly_close WHERE main_company_id=?", values: [companyId] },
  ];
  const parts: string[] = [];
  let updatedAt = "";
  for (const probe of probes) {
    try {
      const row = await first(c, probe.sql, probe.values);
      const stamp = text(row?.stamp);
      const count = number(row?.count);
      parts.push(`${probe.key}:${stamp}:${count}`);
      if (stamp > updatedAt) updatedAt = stamp;
    } catch {
      parts.push(`${probe.key}::0`);
    }
  }
  return okData(c, { mainCompanyId: companyId, version: parts.join("|"), updatedAt });
}

const IK_MONTH_PREPARED_ENTITY = "IK_DONEM";
const IK_MONTH_PREPARED_ACTION = "MONTH_PREPARED";

async function advancedPeriodLockRow(c: Context<AppEnv>, companyId: string, year: number, month: number) {
  return first(c, "SELECT is_locked,locked_at,updated_at FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1", [companyId, year, month]);
}

async function rejectAdvancedPeriodLocked(c: Context<AppEnv>, companyId: string, year: number, month: number) {
  const row = await advancedPeriodLockRow(c, companyId, year, month);
  return flag(row?.is_locked)
    ? error(c, 409, "IK_PERIOD_LOCKED", `${year}-${String(month).padStart(2, "0")} dönemi kapalıdır. Dönem yeniden açılmadan bordro/hareket/izin değiştirilemez.`)
    : null;
}

async function advancedPeriodState(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const year = number(c.req.query("year")) || new Date().getFullYear();
  const month = number(c.req.query("month")) || new Date().getMonth() + 1;
  if (month < 1 || month > 12) return error(c, 400, "INVALID_MONTH", "Geçerli bir ay seçilmelidir.");
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const row = await first(
    c,
    `SELECT id,created_at
       FROM hr_monthly_audit_logs
      WHERE main_company_id=? AND period=? AND entity_type=? AND action=?
      ORDER BY created_at DESC
      LIMIT 1`,
    [companyId, period, IK_MONTH_PREPARED_ENTITY, IK_MONTH_PREPARED_ACTION],
  );
  const lock = await advancedPeriodLockRow(c, companyId, year, month);
  return okData(c, {
    mainCompanyId: companyId,
    year,
    month,
    period,
    prepared: Boolean(row),
    preparedAt: row?.created_at || null,
    isLocked: flag(lock?.is_locked),
    lockedAt: lock?.locked_at || null,
  });
}

async function prepareAdvancedPeriod(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  if (month < 1 || month > 12) return error(c, 400, "INVALID_MONTH", "Geçerli bir ay seçilmelidir.");
  const period = `${year}-${String(month).padStart(2, "0")}`;

  let row = await first(
    c,
    `SELECT id,created_at
       FROM hr_monthly_audit_logs
      WHERE main_company_id=? AND period=? AND entity_type=? AND action=?
      ORDER BY created_at DESC
      LIMIT 1`,
    [companyId, period, IK_MONTH_PREPARED_ENTITY, IK_MONTH_PREPARED_ACTION],
  );

  if (!row) {
    await audit(c, {
      mainCompanyId: companyId,
      period,
      entityType: IK_MONTH_PREPARED_ENTITY,
      action: IK_MONTH_PREPARED_ACTION,
      summary: "Aylık İK dönemi hazırlandı.",
      details: { year, month, prepared: true },
    });
    row = await first(
      c,
      `SELECT id,created_at
         FROM hr_monthly_audit_logs
        WHERE main_company_id=? AND period=? AND entity_type=? AND action=?
        ORDER BY created_at DESC
        LIMIT 1`,
      [companyId, period, IK_MONTH_PREPARED_ENTITY, IK_MONTH_PREPARED_ACTION],
    );
  }

  return okData(c, {
    mainCompanyId: companyId,
    year,
    month,
    period,
    prepared: true,
    preparedAt: row?.created_at || nowIso(),
  });
}

async function advancedMonth(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const year = number(c.req.query("year")) || new Date().getFullYear();
  const month = number(c.req.query("month")) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const [employees, cards, adjustments, leaves, payroll, documents, contracts, profiles, compliance, cardDayRows, calcRows, historyRows, sgkImportRows, closeRows, closeLogRows, latestCloseChecks] = await Promise.all([
    monthlyRows(c, companyId),
    all(c, "SELECT * FROM ik_person_card_settings WHERE main_company_id=?", [companyId]),
    adjustmentRows(c, companyId),
    leaveRows(c, companyId),
    payrollRows(c, companyId),
    all(c, "SELECT d.* FROM hr_employee_documents d JOIN hr_monthly_employees e ON e.id=d.employee_id WHERE e.main_company_id=? ORDER BY d.date DESC", [companyId]),
    all(c, "SELECT s.* FROM hr_salary_contracts s JOIN hr_monthly_employees e ON e.id=s.employee_id WHERE e.main_company_id=? ORDER BY s.effective_date DESC", [companyId]),
    all(c, "SELECT employee_id,personnel_status FROM ik_person_hr_profiles WHERE main_company_id=?", [companyId]).catch(() => []),
    all(c, "SELECT employee_id,sgk_covered,sgk_days,note FROM ik_person_monthly_compliance WHERE main_company_id=? AND period=?", [companyId, period]).catch(() => []),
    all(c, "SELECT employee_id,COUNT(DISTINCT work_date) AS card_days FROM ik_time_clock_events WHERE main_company_id=? AND work_date BETWEEN ? AND ? GROUP BY employee_id", [companyId, periodStart, periodEnd]).catch(() => []),
    all(c, "SELECT file_name,data FROM json_store WHERE scope=? AND file_name LIKE ?", [IK_PERSON_CARD_CALC_SCOPE, `${companyId}:%`]).catch(() => []),
    all(c, "SELECT employee_id,field_name,old_value,new_value,effective_date,created_at FROM ik_employee_change_history WHERE main_company_id=? AND effective_date>? ORDER BY effective_date DESC,created_at DESC", [companyId, periodEnd]).catch(() => []),
    all(c, "SELECT * FROM ik_sgk_imports WHERE main_company_id=? AND period_year=? AND period_month=? ORDER BY version_no DESC,created_at DESC LIMIT 1", [companyId, year, month]).catch(() => []),
    all(c, "SELECT * FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1", [companyId, year, month]).catch(() => []),
    all(c, "SELECT * FROM ik_monthly_close_logs WHERE main_company_id=? AND period_year=? AND period_month=? ORDER BY created_at DESC LIMIT 100", [companyId, year, month]).catch(() => []),
    all(c, "SELECT details_json,created_at FROM hr_monthly_audit_logs WHERE main_company_id=? AND period=? AND entity_type='AY_SONU' AND action='CHECK' ORDER BY created_at DESC LIMIT 1", [companyId, period]).catch(() => []),
  ]);
  const calcPrefix = `${companyId}:`;
  const calcByEmployee = new Map<string, PersonCardCalc>();
  for (const row of calcRows) {
    const fileName = text(row.file_name);
    if (!fileName.startsWith(calcPrefix)) continue;
    calcByEmployee.set(fileName.slice(calcPrefix.length), parsePersonCardCalc(row));
  }
  const currentEmployeesWithCalc = employees.map((employee) => ({
    ...employee,
    deductionHourlyBase: number(calcByEmployee.get(text(employee.id))?.deductionHourlyBase) || 300,
  }));
  const rawEmployeesWithCalc = currentEmployeesWithCalc.map((employee) => applyHistoricalEmployeeValues(employee, historyRows, periodEnd));
  const cardsByEmployee = new Map(cards.map((row) => [text(row.employee_id), row]));
  const profileByEmployee = new Map(profiles.map((row) => [text(row.employee_id), row]));
  const complianceByEmployee = new Map(compliance.map((row) => [text(row.employee_id), row]));
  const cardDaysByEmployee = new Map(cardDayRows.map((row) => [text(row.employee_id), number(row.card_days)]));
  const allEmployees = rawEmployeesWithCalc.map((employee) => {
    const card = cardsByEmployee.get(text(employee.id)) || {};
    const profile = profileByEmployee.get(text(employee.id)) || {};
    const monthlyCompliance = complianceByEmployee.get(text(employee.id));
    const sgkValue = number(card.sgk_follow);
    const fallbackSgk = card.sgk_follow === undefined ? text(employee.sgkStatus) !== "YOK" : sgkValue === 1;
    const sgkFollow = monthlyCompliance ? number(monthlyCompliance.sgk_covered) === 1 : fallbackSgk;
    const sgkDays = monthlyCompliance?.sgk_days === null || monthlyCompliance?.sgk_days === undefined ? null : number(monthlyCompliance.sgk_days);
    const pdksCardDays = cardDaysByEmployee.get(text(employee.id)) || 0;
    const sgkPdksMatch = sgkDays === null ? null : sgkDays === pdksCardDays;
    return {
      ...employee,
      id: text(employee.id),
      personnelStatus: text(profile.personnel_status) || text(employee.personnelStatus) || "NORMAL",
      cardNo: text(card.card_no),
      identityNo: text(card.identity_no),
      exitDate: hrDateOnly(card.exit_date),
      payrollIncluded: card.payroll_included === undefined ? true : flag(card.payroll_included),
      cardSource: text(card.card_source) || "TNF",
      personelKodu: text(card.personel_kodu) || text(employee.code),
      activePassive: text(card.active_passive) || text(employee.status),
      periodEmploymentState: employmentStateAtPeriod(employee, card, period),
      paymentType: text(employee.bankPaymentType) || text(card.payment_type),
      sgkFollow,
      sgkStatus: sgkFollow ? "VAR" : "YOK",
      sgkDays,
      sgkPeriod: period,
      pdksCardDays,
      sgkPdksMatch,
      phone: text(card.phone),
    };
  });
  const masterEmployees = currentEmployeesWithCalc.map((employee) => {
    const card = cardsByEmployee.get(text(employee.id)) || {};
    const profile = profileByEmployee.get(text(employee.id)) || {};
    const sgkValue = number(card.sgk_follow);
    const sgkFollow = card.sgk_follow === undefined ? text(employee.sgkStatus) !== "YOK" : sgkValue === 1;
    return {
      ...employee,
      id: text(employee.id),
      personnelStatus: text(profile.personnel_status) || text(employee.personnelStatus) || "NORMAL",
      cardNo: text(card.card_no),
      identityNo: text(card.identity_no),
      exitDate: hrDateOnly(card.exit_date),
      payrollIncluded: card.payroll_included === undefined ? true : flag(card.payroll_included),
      cardSource: text(card.card_source) || "TNF",
      personelKodu: text(card.personel_kodu) || text(employee.code),
      activePassive: text(card.active_passive) || text(employee.status),
      periodEmploymentState: employmentStateAtPeriod(employee, card, period),
      paymentType: text(card.payment_type) || text(employee.bankPaymentType),
      sgkFollow,
      sgkStatus: sgkFollow ? "VAR" : "YOK",
      phone: text(card.phone),
    };
  });
  const mergedEmployees = allEmployees
    .filter((employee) => advancedEmployeeVisible(employee, cardsByEmployee.get(text(employee.id)) || {}, period));
  const visibleEmployeeIds = new Set(mergedEmployees.map((employee) => text(employee.id)));
  const sgkImport = sgkImportRows[0] || null;
  const sgkRowsRaw = sgkImport
    ? await all(c, "SELECT * FROM ik_sgk_rows WHERE import_id=? ORDER BY full_name COLLATE NOCASE,id", [text(sgkImport.id)]).catch(() => [])
    : [];
  const sgkRows = sgkRowsRaw.map((row) => {
    let source: Row = {};
    try { source = JSON.parse(text(row.raw_json) || "{}") as Row; } catch {}
    return {
      id: text(row.id),
      importId: text(row.import_id),
      employeeId: text(row.employee_id),
      fullName: text(row.full_name),
      identityNo: text(row.identity_no),
      personCode: text(row.person_code),
      hireDate: hrDateOnly(row.hire_date),
      exitDate: hrDateOnly(row.exit_date),
      sgkDays: number(row.sgk_days),
      normalEarning: number(row.normal_earning),
      otherEarning: number(row.other_earning),
      gross: number(row.total_earning || row.gross),
      sgkBase: number(row.sgk_base),
      sgkPremium: number(row.sgk_premium),
      unemploymentPremium: number(row.unemployment_premium),
      incomeTax: number(row.income_tax),
      stampTax: number(row.stamp_tax),
      specialDeduction: number(row.special_deduction),
      employerSgk: number(row.employer_sgk),
      employerUnemployment: number(row.employer_unemployment),
      sgkIncentive: number(row.sgk_incentive),
      net: number(row.net),
      employerNetCost: number(row.employer_net_cost),
      differenceReason: text(row.difference_reason),
      source,
    };
  });
  const sgkByEmployee = new Map<string, Row>();
  for (const row of sgkRows) {
    const employeeId = text(row.employeeId);
    if (!employeeId) continue;
    const current = sgkByEmployee.get(employeeId) || { sgkDays: 0, sgkNet: 0, sgkGross: 0 };
    current.sgkDays = number(current.sgkDays) + number(row.sgkDays);
    current.sgkNet = number(current.sgkNet) + number(row.net);
    current.sgkGross = number(current.sgkGross) + number(row.gross);
    sgkByEmployee.set(employeeId, current);
  }
  const employeesWithSgk = mergedEmployees.map((employee) => {
    const official = sgkByEmployee.get(text(employee.id));
    return official ? { ...employee, sgkDays: number(official.sgkDays), sgkNet: number(official.sgkNet), sgkGross: number(official.sgkGross), sgkImportVersion: number(sgkImport?.version_no) || 1 } : employee;
  });
  const closeRow = closeRows[0] || {};
  let checks: Row[] = [];
  try {
    const parsed = JSON.parse(text(latestCloseChecks[0]?.details_json) || "{}") as Row;
    checks = Array.isArray(parsed?.checks) ? parsed.checks as Row[] : [];
  } catch {}
  return okData(c, {
    year,
    month,
    employees: employeesWithSgk,
    masterEmployees,
    rawEmployees: allEmployees,
    rawLeaves: leaves,
    rawDocuments: documents.map((row) => ({ id: text(row.id), employeeId: text(row.employee_id), documentType: text(row.document_type), fileName: text(row.file_name), filePath: text(row.file_path), storagePath: text(row.file_path), date: hrDateOnly(row.date), status: text(row.status), note: text(row.note) })),
    adjustments: adjustments.filter((row) => visibleEmployeeIds.has(text(row.employeeId))),
    leaves: leaves.filter((row) => visibleEmployeeIds.has(text(row.employeeId))),
    payroll: payroll.filter((row) => visibleEmployeeIds.has(text(row.employeeId))),
    documents: documents
      .filter((row) => visibleEmployeeIds.has(text(row.employee_id)))
      .map((row) => ({ id: text(row.id), employeeId: text(row.employee_id), documentType: text(row.document_type), fileName: text(row.file_name), filePath: text(row.file_path), storagePath: text(row.file_path), date: hrDateOnly(row.date), status: text(row.status), note: text(row.note) })),
    contracts: contracts
      .filter((row) => visibleEmployeeIds.has(text(row.employee_id)))
      .map((row) => ({ id: text(row.id), employeeId: text(row.employee_id), salary: number(row.salary), roadAllowance: number(row.road_allowance), bankAmount: number(row.bank_amount), cashAmount: number(row.cash_amount), paymentType: text(row.bank_payment_type), startDate: hrDateOnly(row.contract_start || row.effective_date), endDate: hrDateOnly(row.contract_end), note: text(row.note) })),
    sgkImport: sgkImport ? { id: text(sgkImport.id), fileName: text(sgkImport.file_name), versionNo: number(sgkImport.version_no) || 1, status: text(sgkImport.status) || "CONFIRMED", createdAt: sgkImport.created_at } : null,
    sgkRows,
    resolvedDays: [],
    checks,
    close: { isLocked: flag(closeRow.is_locked), lockedAt: closeRow.locked_at || null },
    closeLogs: closeLogRows.map((row) => ({ id: text(row.id), action: text(row.action), reason: text(row.reason), userName: text(row.user_name), createdAt: row.created_at })),
  });
}

async function advancedPayroll(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const year = number(c.req.query("year")) || new Date().getFullYear();
  const month = number(c.req.query("month")) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const periodEnd = `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const [currentEmployees, saved, adjustments, cards, historyRows] = await Promise.all([
    monthlyRows(c, companyId),
    payrollRows(c, companyId),
    adjustmentRows(c, companyId),
    all(c, "SELECT employee_id,payroll_included,active_passive,exit_date FROM ik_person_card_settings WHERE main_company_id=?", [companyId]),
    all(c, "SELECT employee_id,field_name,old_value,new_value,effective_date,created_at FROM ik_employee_change_history WHERE main_company_id=? AND effective_date>? ORDER BY effective_date DESC,created_at DESC", [companyId, periodEnd]).catch(() => []),
  ]);
  const rawEmployees = currentEmployees.map((employee) => applyHistoricalEmployeeValues(employee, historyRows, periodEnd));
  const cardsByEmployee = new Map(cards.map((row) => [text(row.employee_id), row]));
  const employees = rawEmployees.filter((employee) => advancedEmployeeVisible(employee, cardsByEmployee.get(text(employee.id)) || {}, period));
  const employeesById = new Map(rawEmployees.map((employee) => [text(employee.id), employee]));
  const byEmployee = new Map(saved.filter((row) => number(row.year) === year && number(row.month) === month).map((row) => [text(row.employeeId), row]));
  const normalizeType = (value: unknown) => { const valueUpper = upper(value); if (valueUpper.includes("TOPLU") && valueUpper.includes("AVANS")) return "TOPLU_AVANS"; if (valueUpper.includes("AVANS")) return "AVANS"; if (valueUpper.includes("HACIZ") || valueUpper.includes("HACİZ")) return "HACIZ"; if (valueUpper.includes("ICRA") || valueUpper.includes("İCRA")) return "ICRA"; if (((valueUpper.includes("EKSIK") || valueUpper.includes("EKSİK")) && (valueUpper.includes("GUN") || valueUpper.includes("GÜN") || valueUpper.includes("SAAT"))) || valueUpper.includes("DEVAMSIZ") || valueUpper.includes("GELMEDI") || valueUpper.includes("GELMEDİ")) return "KESINTI"; if (valueUpper.includes("KESINT")) return "KESINTI"; if (valueUpper.includes("MESAI")) return "MESAI"; return valueUpper; };
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
    const { net: baseNet } = calculatePayrollAmounts({
      salary: baseSalary,
      road: employee.roadAllowance,
      extra,
      overtime,
      advance,
      deduction,
      garnishment,
    });
    const systemBank = Math.min(baseNet, Math.max(number(employee.bankAmount) - bankDeductions, 0));
    const systemCash = Math.max(baseNet - systemBank, 0);
    const systemFinal = { salaryPay: baseSalary, roadPay: number(employee.roadAllowance), overtimeAmount: overtime, premiumAmount: extra, garnishmentAmount: garnishment, deductionAmount: deduction, advanceAmount: advance, bank: systemBank, cash: systemCash, total: baseNet };
    const savedStatus = upper(row?.status);
    const hasSavedFinal = Boolean(row && ["OVERRIDE", "CALCULATED", "PAID", "MANUAL_APPROVED"].includes(savedStatus));
    const final = hasSavedFinal ? { salaryPay: row.salary, roadPay: row.roadAllowance, overtimeAmount: row.overtimeAmount, premiumAmount: row.premiumAmount, garnishmentAmount: row.garnishmentAmount, deductionAmount: row.deductionAmount, advanceAmount: row.advanceAmount, bank: row.bankAmount, cash: row.cashAmount, total: row.totalAmount } : systemFinal;
    return { employeeId: employee.id, code: employee.code, fullName: employee.fullName, department: employee.department, system: systemFinal, final, status: hasSavedFinal ? savedStatus : "SYSTEM" };
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
  const currentCard = await first(c, "SELECT * FROM ik_person_card_settings WHERE employee_id=? AND main_company_id=? LIMIT 1", [employeeId, companyId]);
  const currentVersion = [text(current.updated_at), text(currentCard?.updated_at)].filter(Boolean).sort().at(-1) || text(current.updated_at || current.created_at);
  const expectedVersion = text(body.expectedVersion);
  if (expectedVersion && expectedVersion !== currentVersion) {
    return error(c, 409, "PERSONNEL_VERSION_CONFLICT", "Personel kartı başka bir bilgisayarda değişti. Güncel kaydı yeniden yükleyip değişikliği tekrar kontrol edin.");
  }
  const currentCalc = await personCardCalc(c, companyId, employeeId);
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
  const personnelStatus = ["RETIRED","EMEKLI","EMEKLİ"].includes(upper(body.personnelStatus)) ? "RETIRED" : "NORMAL";
  const overtimeHourlyBase = number(body.overtimeHourlyBase ?? body.overtimeBaseHours ?? current.overtime_hourly_base) || 225;
  const deductionHourlyBase = number(body.deductionHourlyBase ?? currentCalc.deductionHourlyBase) || 300;
  if (overtimeHourlyBase <= 0) return error(c, 400, "OVERTIME_DIVISOR_INVALID", "Mesai saat böleni sıfırdan büyük olmalıdır.");
  if (deductionHourlyBase <= 0) return error(c, 400, "DEDUCTION_DIVISOR_INVALID", "Kesinti saat böleni sıfırdan büyük olmalıdır.");
  const period = /^\d{4}-\d{2}$/.test(text(body.period))
    ? text(body.period)
    : `${number(body.year) || new Date().getFullYear()}-${String(number(body.month) || new Date().getMonth() + 1).padStart(2, "0")}`;
  const effectiveDate = hrDateOnly(body.effectiveDate) || hrTodayIstanbul();
  const cardLock = await rejectAdvancedPeriodLocked(c, companyId, number(period.slice(0, 4)), number(period.slice(5, 7)));
  if (cardLock) return cardLock;
  const sgkCovered = body.sgkFollow === true || upper(body.sgkStatus) === "VAR";
  const maxSgkDays = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate() || 31;
  const rawSgkDays = body.sgkDays === null || body.sgkDays === undefined || body.sgkDays === "" ? null : Math.round(number(body.sgkDays));
  if (rawSgkDays !== null && (rawSgkDays < 0 || rawSgkDays > maxSgkDays)) {
    return error(c, 400, "SGK_DAYS_INVALID", `SGK gün sayısı 0-${maxSgkDays} arasında olmalıdır.`);
  }
  const sgkDays = sgkCovered ? rawSgkDays : 0;
  const hireDate = hrDateOnly(body.hireDate || body.startDate || current.hire_date);
  if (!hireDate) return error(c, 400, "HIRE_DATE_REQUIRED", "İşe giriş tarihi zorunludur.");
  const effectiveExitDate = hrDateOnly(body.exitDate);
  if (effectiveExitDate && effectiveExitDate < hireDate) {
    return error(c, 400, "EXIT_BEFORE_HIRE", "İşten çıkış tarihi işe giriş tarihinden önce olamaz.");
  }
  const activePassive = effectiveExitDate ? "Pasif" : "Aktif";
  body.hireDate = hireDate;
  body.startDate = hireDate;
  body.exitDate = effectiveExitDate;
  body.activePassive = activePassive;
  body.status = activePassive;
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
    text(body.cardSource) || "TNF", text(body.personelKodu || body.code), effectiveExitDate,
    activePassive, text(body.workType) || "AYLIK",
    body.sgkFollow === null ? 2 : body.sgkFollow === false ? 0 : 1, text(body.paymentType) || "BANKA_ELDEN",
    text(body.note), text(body.phone), "EK", autoExtra, baseEmployeeId, legalType,
    legalType !== "YOK" && legalAmount > 0 ? 1 : 0, legalAmount, legalSource,
    text(body.legalStartPeriod), text(body.legalEndPeriod), text(body.garnishmentNote), nowIso(),
  ).run();
  await savePersonCardCalc(c, companyId, employeeId, deductionHourlyBase);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO ik_person_hr_profiles(employee_id,main_company_id,personnel_status,updated_by,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET
      main_company_id=excluded.main_company_id,personnel_status=excluded.personnel_status,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(employeeId, companyId, personnelStatus, text(body.userName) || "IK", nowIso()),
    c.env.DB.prepare(`INSERT INTO ik_person_monthly_compliance(main_company_id,employee_id,period,sgk_covered,sgk_days,note,updated_by,updated_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,employee_id,period) DO UPDATE SET
      sgk_covered=excluded.sgk_covered,sgk_days=excluded.sgk_days,note=excluded.note,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(companyId, employeeId, period, sgkCovered ? 1 : 0, sgkDays, text(body.sgkNote), text(body.userName) || "IK", nowIso()),
  ]);
  await updateMonthlyEmployeeFromCard(c, employeeId, companyId, body, current);

  const updatedEmployee = await first(c, "SELECT * FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1", [employeeId, companyId]);
  const updatedCard = await first(c, "SELECT * FROM ik_person_card_settings WHERE employee_id=? AND main_company_id=? LIMIT 1", [employeeId, companyId]);
  const trackedChanges = [
    ["salary", number(current.salary), number(updatedEmployee?.salary)],
    ["roadAllowance", number(current.road_allowance), number(updatedEmployee?.road_allowance)],
    ["bankPaymentType", text(current.bank_payment_type), text(updatedEmployee?.bank_payment_type)],
    ["bankAmount", number(current.bank_amount), number(updatedEmployee?.bank_amount)],
    ["cashAmount", number(current.cash_amount), number(updatedEmployee?.cash_amount)],
    ["overtimeHourlyBase", number(current.overtime_hourly_base) || 225, number(updatedEmployee?.overtime_hourly_base) || 225],
    ["deductionHourlyBase", number(currentCalc.deductionHourlyBase) || 300, deductionHourlyBase],
    ["startDate", hrDateOnly(current.hire_date), hrDateOnly(updatedEmployee?.hire_date)],
    ["exitDate", hrDateOnly(currentCard?.exit_date), hrDateOnly(updatedCard?.exit_date)],
    ["employmentStatus", text(currentCard?.active_passive || current.status), text(updatedCard?.active_passive || updatedEmployee?.status)],
  ].filter(([, before, after]) => String(before ?? "") !== String(after ?? ""));

  if (trackedChanges.length) {
    const historyStatements = trackedChanges.map(([field, before, after]) => c.env.DB.prepare(`INSERT INTO ik_employee_change_history
      (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), companyId, employeeId,
        ["salary","roadAllowance","bankPaymentType","bankAmount","cashAmount","overtimeHourlyBase","deductionHourlyBase"].includes(String(field)) ? "COMPENSATION" : "PERSONNEL",
        String(field), text(before), text(after), effectiveDate,
        text(body.changeNote || body.note) || "İK personel / ücret kartı güncellendi",
        text(body.userId || body.userName) || "IK", nowIso(),
      ));
    await c.env.DB.batch(historyStatements);

    const compensationChanged = trackedChanges.some(([field]) => ["salary","roadAllowance","bankPaymentType","bankAmount","cashAmount"].includes(String(field)));
    if (compensationChanged) {
      await c.env.DB.prepare(`INSERT INTO hr_salary_contracts
        (id,employee_id,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,contract_type,contract_start,contract_end,effective_date,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          crypto.randomUUID(), employeeId, number(updatedEmployee?.salary), number(updatedEmployee?.road_allowance),
          text(updatedEmployee?.bank_payment_type) || "BANKA_ELDEN", number(updatedEmployee?.bank_amount), number(updatedEmployee?.cash_amount),
          "İK ücret değişikliği", effectiveDate, null, effectiveDate,
          text(body.changeNote || body.note) || "İK ücret / ödeme planı güncellendi", nowIso(),
        ).run();
    }
    await audit(c, {
      mainCompanyId: companyId,
      period: effectiveDate.slice(0, 7),
      employeeId,
      entityType: "PERSONEL",
      action: "PERSON_CARD_UPDATE",
      summary: `${trackedChanges.length} personel/ücret alanı güncellendi.`,
      details: { effectiveDate, changes: trackedChanges.map(([field, before, after]) => ({ field, before, after })) },
    });
  }

  return okData(c, {
    employeeId, saved: true, baseEmployeeId, extraPaymentAmount: autoExtra,
    legalDeductionType: legalType, garnishmentSource: legalSource,
    overtimeHourlyBase, deductionHourlyBase,
    personnelStatus, period, sgkCovered, sgkDays, effectiveDate, changedFields: trackedChanges.map(([field]) => field),
  });
}
async function adminMaintainPerson(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(c.req.param("employeeId"));
  const user = await getAuthenticatedUser(c);
  if (!user) return error(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
  if (!ikAdminRole(user.role)) {
    return error(c, 403, "ADMIN_REQUIRED", "Personel numarası değiştirme ve kalıcı silme yalnız yönetici onayıyla yapılabilir.");
  }

  const current = await first(c, "SELECT * FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1", [employeeId, companyId]);
  if (!current) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const currentCode = normalizeHknPersonnelCode(current.code) || text(current.code);
  const action = upper(body.action);
  const reason = text(body.reason);

  if (action === "RECODE") {
    const nextCode = normalizeHknPersonnelCode(body.personnelCode || body.code);
    if (!nextCode) return error(c, 400, "PERSONNEL_CODE_INVALID", "Personel kodu HKN-01 biçiminde olmalıdır.");
    if (nextCode === currentCode) return okData(c, { employeeId, code: currentCode, changed: false });
    if (upper(body.confirmText) !== upper(currentCode)) {
      return error(c, 400, "ADMIN_CONFIRMATION_REQUIRED", `Numara değişikliği için mevcut kodu (${currentCode}) onay alanına yazın.`);
    }
    const duplicate = await first(c, "SELECT id,full_name FROM hr_monthly_employees WHERE main_company_id=? AND UPPER(TRIM(code))=UPPER(TRIM(?)) AND id<>? LIMIT 1", [companyId, nextCode, employeeId]);
    if (duplicate) return error(c, 409, "DUPLICATE_PERSONNEL_CODE", `${nextCode} başka bir personele ait.`);

    const timestamp = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE hr_monthly_employees SET code=?,updated_at=? WHERE id=? AND main_company_id=?").bind(nextCode, timestamp, employeeId, companyId),
      c.env.DB.prepare(`INSERT INTO ik_person_card_settings(employee_id,main_company_id,personel_kodu,updated_at)
        VALUES (?,?,?,?) ON CONFLICT(employee_id) DO UPDATE SET personel_kodu=excluded.personel_kodu,updated_at=excluded.updated_at`)
        .bind(employeeId, companyId, nextCode, timestamp),
      c.env.DB.prepare(`INSERT INTO ik_employee_change_history
        (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), companyId, employeeId, "ADMIN_PERSONNEL_CODE", "personnelCode", currentCode, nextCode, hrTodayIstanbul(), reason || "Yönetici onayıyla personel kodu değiştirildi.", text(user.id), timestamp),
    ]);
    await audit(c, {
      mainCompanyId: companyId,
      employeeId,
      entityType: "PERSONEL",
      action: "ADMIN_RECODE",
      summary: `${text(current.full_name)} personel kodu ${currentCode} → ${nextCode} değiştirildi.`,
      details: { oldCode: currentCode, newCode: nextCode, reason, actorUserId: text(user.id), actorRole: text(user.role) },
    });
    return okData(c, { employeeId, oldCode: currentCode, code: nextCode, changed: true });
  }

  if (action !== "HARD_DELETE") {
    return error(c, 400, "ADMIN_ACTION_INVALID", "Yönetici işlemi RECODE veya HARD_DELETE olmalıdır.");
  }
  const expectedConfirm = `SİL ${currentCode}`;
  if (upper(body.confirmText) !== upper(expectedConfirm)) {
    return error(c, 400, "ADMIN_CONFIRMATION_REQUIRED", `Kalıcı silme için "${expectedConfirm}" yazılmalıdır.`);
  }
  if (reason.length < 5) return error(c, 400, "DELETE_REASON_REQUIRED", "Kalıcı silme için neden yazılmalıdır.");

  const tables = await all(c, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const cleanupTables = new Set(["ik_person_card_settings", "ik_person_hr_profiles", "ik_person_monthly_compliance"]);
  const auditTables = new Set(["ik_employee_change_history", "hr_monthly_audit_logs", "ik_audit_logs", "auth_security_audit"]);
  const blockers: Array<{ table: string; count: number }> = [];
  for (const row of tables) {
    const table = text(row.name);
    if (!/^[A-Za-z0-9_]+$/.test(table) || table === "hr_monthly_employees" || cleanupTables.has(table) || auditTables.has(table)) continue;
    let columns: Row[] = [];
    try { columns = await all(c, `SELECT name FROM pragma_table_info('${table}')`); } catch { continue; }
    const names = new Set(columns.map((column) => text(column.name)));
    const employeeColumn = names.has("employee_id") ? "employee_id" : names.has("person_id") ? "person_id" : "";
    if (!employeeColumn) continue;
    try {
      const countRow = await first(c, `SELECT COUNT(*) AS count FROM "${table}" WHERE "${employeeColumn}"=?`, [employeeId]);
      const count = number(countRow?.count);
      if (count > 0) blockers.push({ table, count });
    } catch {}
  }
  if (blockers.length) {
    return error(c, 409, "PERSONNEL_HAS_OPERATIONAL_HISTORY",
      "Bu personelin maaş/izin/mesai/evrak veya diğer operasyon geçmişi var. Kayıt silinemez; işten çıkış tarihi ile pasife alınmalıdır.");
  }

  const timestamp = nowIso();
  try { await c.env.DB.prepare("UPDATE ik_person_card_settings SET base_employee_id=NULL,updated_at=? WHERE base_employee_id=?").bind(timestamp, employeeId).run(); } catch {}
  for (const table of cleanupTables) {
    try {
      const exists = await first(c, "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", [table]);
      if (exists?.name) await c.env.DB.prepare(`DELETE FROM "${table}" WHERE employee_id=?`).bind(employeeId).run();
    } catch {}
  }
  try {
    await c.env.DB.prepare("DELETE FROM json_store WHERE scope='IK_PERSON_CARD_CALC' AND file_name LIKE ?").bind(`%${employeeId}%`).run();
  } catch {}

  const deleted = await c.env.DB.prepare("DELETE FROM hr_monthly_employees WHERE id=? AND main_company_id=?").bind(employeeId, companyId).run();
  if (!number(deleted.meta?.changes)) return error(c, 500, "HARD_DELETE_FAILED", "Personel ana kaydı silinemedi.");

  await audit(c, {
    mainCompanyId: companyId,
    employeeId: null,
    entityType: "PERSONEL",
    action: "ADMIN_HARD_DELETE",
    summary: `${text(current.full_name)} (${currentCode}) yanlış/mükerrer personel kaydı yönetici onayıyla kalıcı silindi.`,
    details: { deletedEmployeeId: employeeId, code: currentCode, fullName: text(current.full_name), reason, actorUserId: text(user.id), actorRole: text(user.role) },
  });
  return okData(c, { employeeId, code: currentCode, fullName: text(current.full_name), deleted: true });
}

async function saveAdvancedBulkCompensation(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeIds = Array.isArray(body.employeeIds)
    ? [...new Set(body.employeeIds.map((value: unknown) => text(value)).filter(Boolean))]
    : [];
  if (!employeeIds.length) return error(c, 400, "EMPLOYEE_REQUIRED", "Toplu düzenleme için en az bir personel seçilmelidir.");

  const action = upper(body.action);
  if (!["SALARY_PERCENT", "ROAD_SET", "ROAD_PERCENT"].includes(action)) {
    return error(c, 400, "BULK_COMPENSATION_ACTION_INVALID", "Toplu ücret işlemi geçersiz.");
  }
  const effectiveDate = hrDateOnly(body.effectiveDate) || hrTodayIstanbul();
  const lock = await rejectAdvancedPeriodLocked(c, companyId, number(effectiveDate.slice(0, 4)), number(effectiveDate.slice(5, 7)));
  if (lock) return lock;

  const percent = number(body.percent);
  const value = number(body.value);
  if (action.endsWith("_PERCENT") && (percent <= -100 || percent > 500)) {
    return error(c, 400, "PERCENT_INVALID", "Yüzde değişim -100 ile 500 arasında olmalıdır.");
  }
  if (action === "ROAD_SET" && value < 0) {
    return error(c, 400, "ROAD_VALUE_INVALID", "Yol yardımı negatif olamaz.");
  }

  const placeholders = employeeIds.map(() => "?").join(",");
  const rows = await all(c, `SELECT id,full_name,code,salary,road_allowance,bank_payment_type,bank_amount,cash_amount
    FROM hr_monthly_employees WHERE main_company_id=? AND id IN (${placeholders})`, [companyId, ...employeeIds]);
  if (rows.length !== employeeIds.length) return error(c, 400, "INVALID_EMPLOYEE", "Seçimde başka firmaya ait veya bulunamayan personel var.");

  const note = text(body.note) || (action === "SALARY_PERCENT"
    ? `Toplu maaş değişimi %${percent}`
    : action === "ROAD_SET" ? `Toplu yol yardımı: ${value}` : `Toplu yol değişimi %${percent}`);
  const statements: D1PreparedStatement[] = [];
  const preview: Row[] = [];
  const timestamp = nowIso();

  for (const row of rows) {
    const oldSalary = number(row.salary);
    const oldRoad = number(row.road_allowance);
    const nextSalary = action === "SALARY_PERCENT" ? Math.max(0, Math.round(oldSalary * (1 + percent / 100) * 100) / 100) : oldSalary;
    const nextRoad = action === "ROAD_SET"
      ? Math.max(0, Math.round(value * 100) / 100)
      : action === "ROAD_PERCENT" ? Math.max(0, Math.round(oldRoad * (1 + percent / 100) * 100) / 100) : oldRoad;
    const field = action === "SALARY_PERCENT" ? "salary" : "roadAllowance";
    const before = action === "SALARY_PERCENT" ? oldSalary : oldRoad;
    const after = action === "SALARY_PERCENT" ? nextSalary : nextRoad;
    if (Math.abs(after - before) <= 0.001) continue;

    statements.push(
      c.env.DB.prepare("UPDATE hr_monthly_employees SET salary=?,road_allowance=?,updated_at=? WHERE id=? AND main_company_id=?")
        .bind(nextSalary, nextRoad, timestamp, text(row.id), companyId),
      c.env.DB.prepare(`INSERT INTO ik_employee_change_history
        (id,main_company_id,employee_id,change_type,field_name,old_value,new_value,effective_date,note,actor_user_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), companyId, text(row.id), "COMPENSATION", field, text(before), text(after), effectiveDate, note, text(body.userId || body.userName) || "IK", timestamp),
      c.env.DB.prepare(`INSERT INTO hr_salary_contracts
        (id,employee_id,salary,road_allowance,bank_payment_type,bank_amount,cash_amount,contract_type,contract_start,contract_end,effective_date,note,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), text(row.id), nextSalary, nextRoad, text(row.bank_payment_type) || "BANKA_ELDEN",
          number(row.bank_amount), number(row.cash_amount), "Toplu ücret değişikliği", effectiveDate, null, effectiveDate, note, timestamp),
    );
    preview.push({
      employeeId: text(row.id), fullName: text(row.full_name), code: text(row.code),
      field, before, after, difference: Math.round((after - before) * 100) / 100,
    });
  }

  if (!preview.length) return okData(c, { changed: 0, rows: [], effectiveDate, message: "Seçili personelde değişecek tutar yok." });
  await c.env.DB.batch(statements);
  await audit(c, {
    mainCompanyId: companyId,
    period: effectiveDate.slice(0, 7),
    entityType: "UCRET",
    action: "BULK_COMPENSATION_UPDATE",
    summary: `${preview.length} personelde toplu ücret/yol düzenlemesi yapıldı.`,
    details: { action, percent, value, effectiveDate, note, employeeIds, rows: preview },
  });
  return okData(c, { changed: preview.length, rows: preview, effectiveDate, action, note });
}

async function updateMonthlyEmployeeFromCard(c: Context<AppEnv>, employeeId: string, companyId: string, body: Row, current: Row) {
  const merged: Row = { ...current, ...body, code: body.personelKodu || body.code || current.code, bankPaymentType: body.paymentType || current.bank_payment_type, sgkStatus: body.sgkFollow === false ? "YOK" : "VAR", status: body.activePassive || body.status || current.status };
  const value = monthlyValues(merged, current);
  await c.env.DB.prepare("UPDATE hr_monthly_employees SET code=?,full_name=?,department=?,title=?,work_type=?,sgk_status=?,status=?,hire_date=?,salary=?,road_allowance=?,bank_payment_type=?,bank_amount=?,cash_amount=?,overtime_hourly_base=?,annual_leave_entitlement=?,annual_leave_carryover=?,note=?,updated_at=? WHERE id=? AND main_company_id=?").bind(value.code || null, value.fullName, value.department, value.title, value.workType, value.sgkStatus, value.status, value.hireDate, value.salary, value.roadAllowance, value.bankPaymentType, value.bankAmount, value.cashAmount, value.overtimeHourlyBase, value.annualLeaveEntitlement, value.annualLeaveCarryover, value.note, nowIso(), employeeId, companyId).run();
}

async function saveAdvancedPayrollOverride(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId || body.personId);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const payrollLock = await rejectAdvancedPeriodLocked(c, companyId, year, month);
  if (payrollLock) return payrollLock;
  const override = body.override && typeof body.override === "object" && !Array.isArray(body.override) ? body.override as Row : {};
  const employee = await first(c, `SELECT e.*, s.extra_payment_amount, s.base_employee_id FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=?`, [employeeId, companyId]);
  if (!employee) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const existing = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  const baseEmployee = text(employee.base_employee_id) ? await first(c, "SELECT id,salary FROM hr_monthly_employees WHERE id=? AND main_company_id=?", [text(employee.base_employee_id), companyId]) : null;
  const baseSalary = baseEmployee ? number(baseEmployee.salary) : number(employee.salary);
  const autoPremium = baseEmployee ? Math.max(number(employee.salary) - baseSalary, 0) : number(employee.extra_payment_amount);
  const allAdjustments = await adjustmentRows(c, companyId);
  const normalizeType = (value: unknown) => { const valueUpper = upper(value); if (valueUpper.includes("TOPLU") && valueUpper.includes("AVANS")) return "TOPLU_AVANS"; if (valueUpper.includes("AVANS")) return "AVANS"; if (valueUpper.includes("HACIZ") || valueUpper.includes("HACİZ")) return "HACIZ"; if (valueUpper.includes("ICRA") || valueUpper.includes("İCRA")) return "ICRA"; if (((valueUpper.includes("EKSIK") || valueUpper.includes("EKSİK")) && (valueUpper.includes("GUN") || valueUpper.includes("GÜN") || valueUpper.includes("SAAT"))) || valueUpper.includes("DEVAMSIZ") || valueUpper.includes("GELMEDI") || valueUpper.includes("GELMEDİ")) return "KESINTI"; if (valueUpper.includes("KESINT")) return "KESINTI"; if (valueUpper.includes("MESAI")) return "MESAI"; return valueUpper; };
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
  const { net: calculatedTotal } = calculatePayrollAmounts({
    salary,
    road,
    extra: premium,
    overtime: overtimeFinal,
    advance,
    deduction,
    garnishment,
  });
  const plannedBank = Math.max(number(employee.bank_amount) - bankDeductions, 0);
  const bankProvided = override.bank !== undefined;
  const cashProvided = override.cash !== undefined;
  let bank = bankProvided ? Math.max(0, number(override.bank)) : Math.min(calculatedTotal, plannedBank);
  let cash = cashProvided ? Math.max(0, number(override.cash)) : Math.max(calculatedTotal - bank, 0);
  if (bankProvided && !cashProvided) cash = Math.max(calculatedTotal - bank, 0);
  if (!bankProvided && cashProvided) bank = Math.max(calculatedTotal - cash, 0);
  const paymentDiff = Math.round((bank + cash - calculatedTotal) * 100) / 100;
  if (Math.abs(paymentDiff) > 0.01) {
    return error(c, 409, "PAYMENT_TOTAL_MISMATCH", "Banka + elden toplamı net ödenecek tutara eşit olmalıdır.");
  }
  const total = calculatedTotal;
  const timestamp = nowIso();
  const id = text(existing?.id) || crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO hr_payrolls_v2 (id,main_company_id,year,month,employee_id,salary,road_allowance,overtime_amount,premium_amount,garnishment_amount,deduction_amount,advance_amount,bank_amount,cash_amount,total_amount,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id,year,month,employee_id) DO UPDATE SET salary=excluded.salary,road_allowance=excluded.road_allowance,overtime_amount=excluded.overtime_amount,premium_amount=excluded.premium_amount,garnishment_amount=excluded.garnishment_amount,deduction_amount=excluded.deduction_amount,advance_amount=excluded.advance_amount,bank_amount=excluded.bank_amount,cash_amount=excluded.cash_amount,total_amount=excluded.total_amount,status=excluded.status,updated_at=excluded.updated_at`).bind(id, companyId, year, month, employeeId, salary, road, overtimeFinal, premium, garnishment, deduction, advance, bank, cash, total, "OVERRIDE", text(existing?.created_at) || timestamp, timestamp).run();
  const saved = await first(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=?", [companyId, year, month, employeeId]);
  await audit(c, { mainCompanyId: companyId, period, employeeId, entityType: "BORDRO", action: "OVERRIDE", summary: "Bordro ödeme planı güncellendi.", details: { reason: text(body.reason), premiumAmount: premium, garnishmentAmount: garnishment, bank, cash, total } });
  return okData(c, mapPayroll(saved || { id, main_company_id: companyId, year, month, employee_id: employeeId, salary, road_allowance: road, overtime_amount: overtimeFinal, premium_amount: premium, garnishment_amount: garnishment, deduction_amount: deduction, advance_amount: advance, bank_amount: bank, cash_amount: cash, total_amount: total, status: "OVERRIDE" }));
}

async function saveAdvancedPayrollFinalControl(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const payrollLock = await rejectAdvancedPeriodLocked(c, companyId, year, month);
  if (payrollLock) return payrollLock;
  const employee = await first(c, "SELECT id,full_name FROM hr_monthly_employees WHERE id=? AND main_company_id=? LIMIT 1", [employeeId, companyId]);
  if (!employee) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");

  const desired = {
    salary: Math.max(0, number(body.salary)),
    road: Math.max(0, number(body.road)),
    extra: Math.max(0, number(body.extra)),
    overtime: Math.max(0, number(body.overtime)),
    advance: Math.max(0, number(body.advance)),
    deduction: Math.max(0, number(body.deduction)),
    garnishment: Math.max(0, number(body.garnishment)),
    bank: Math.max(0, number(body.bank)),
    cash: Math.max(0, number(body.cash)),
  };
  const { net } = calculatePayrollAmounts(desired);
  const paymentDiff = Math.round((desired.bank + desired.cash - net) * 100) / 100;
  if (Math.abs(paymentDiff) > 0.01) {
    return error(c, 409, "PAYMENT_TOTAL_MISMATCH", "Banka + elden toplamı net ödenecek tutara eşit olmalıdır.");
  }

  const allAdjustments = await adjustmentRows(c, companyId);
  const normalizeType = (value: unknown) => {
    const valueUpper = upper(value);
    if (valueUpper.includes("TOPLU") && valueUpper.includes("AVANS")) return "TOPLU_AVANS";
    if (valueUpper.includes("AVANS")) return "AVANS";
    if (valueUpper.includes("HACIZ") || valueUpper.includes("HACİZ")) return "HACIZ";
    if (valueUpper.includes("ICRA") || valueUpper.includes("İCRA")) return "ICRA";
    if (((valueUpper.includes("EKSIK") || valueUpper.includes("EKSİK")) && (valueUpper.includes("GUN") || valueUpper.includes("GÜN") || valueUpper.includes("SAAT"))) || valueUpper.includes("DEVAMSIZ") || valueUpper.includes("GELMEDI") || valueUpper.includes("GELMEDİ")) return "KESINTI"; if (valueUpper.includes("KESINT")) return "KESINTI";
    if (valueUpper.includes("MESAI")) return "MESAI";
    return valueUpper;
  };
  const own = allAdjustments.filter((item) =>
    text(item.employeeId) === employeeId &&
    text(item.date).startsWith(period) &&
    !upper(item.payrollEffect).includes("SADECE")
  );
  const current = {
    overtime: own.filter((item) => normalizeType(item.adjustmentType) === "MESAI").reduce((sum, item) => sum + number(item.amount), 0),
    advance: own.filter((item) => ["AVANS","TOPLU_AVANS"].includes(normalizeType(item.adjustmentType))).reduce((sum, item) => sum + number(item.amount), 0),
    deduction: own.filter((item) => normalizeType(item.adjustmentType) === "KESINTI").reduce((sum, item) => sum + number(item.amount), 0),
    garnishment: own.filter((item) => ["ICRA","HACIZ"].includes(normalizeType(item.adjustmentType))).reduce((sum, item) => sum + number(item.amount), 0),
  };

  const timestamp = nowIso();
  const correctionDate = hrDateOnly(body.date) || `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const reason = text(body.reason) || "Son bordro kontrolü";
  const statements: D1PreparedStatement[] = [];
  const correctionIds: string[] = [];

  const pushCorrection = (kind: "overtime" | "advance" | "deduction" | "garnishment", adjustmentType: string, source: string) => {
    const delta = Math.round((desired[kind] - current[kind]) * 100) / 100;
    if (Math.abs(delta) <= 0.01) return;
    const id = crypto.randomUUID();
    correctionIds.push(id);
    const paymentMethod = kind === "overtime" ? "Bordro" : (upper(source).includes("BANKA") ? "Banka" : "Elden");
    const note = `Son bordro kontrolü düzeltmesi · önce ${current[kind].toFixed(2)} · sonra ${desired[kind].toFixed(2)} · ${reason}`;
    statements.push(
      c.env.DB.prepare(`INSERT INTO hr_monthly_adjustments_v2
        (id,employee_id,date,adjustment_type,hour_or_day,amount,payment_method,payroll_effect,note,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, employeeId, correctionDate, adjustmentType, 0, delta, paymentMethod, "Bordroya yansir", note, "APPROVED", timestamp),
    );
  };

  pushCorrection("overtime", "Mesai - Son Bordro Düzeltme", "Bordro");
  pushCorrection("advance", "Avans - Son Bordro Düzeltme", text(body.advanceSource) || "Elden");
  pushCorrection("deduction", "Ozel kesinti - Son Bordro Düzeltme", text(body.deductionSource) || "Elden");
  const legalType = upper(body.legalType) === "HACIZ" ? "Haciz" : "Icra";
  pushCorrection("garnishment", `${legalType} - Son Bordro Düzeltme`, text(body.garnishmentSource) || "Banka");

  const existing = await first(c, "SELECT id,status,created_at FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id=? LIMIT 1", [companyId, year, month, employeeId]);
  if (upper(existing?.status) === "PAID") {
    return error(c, 409, "PAYROLL_PAID_LOCKED", "Ödemesi tamamlanmış bordro doğrudan değiştirilemez. Önce ödeme kaydını yetkili işlemle geri açın.");
  }
  const payrollId = text(existing?.id) || crypto.randomUUID();
  statements.push(
    c.env.DB.prepare(`INSERT INTO hr_payrolls_v2
      (id,main_company_id,year,month,employee_id,salary,road_allowance,overtime_amount,premium_amount,garnishment_amount,deduction_amount,advance_amount,bank_amount,cash_amount,total_amount,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(main_company_id,year,month,employee_id) DO UPDATE SET
        salary=excluded.salary,road_allowance=excluded.road_allowance,overtime_amount=excluded.overtime_amount,
        premium_amount=excluded.premium_amount,garnishment_amount=excluded.garnishment_amount,
        deduction_amount=excluded.deduction_amount,advance_amount=excluded.advance_amount,
        bank_amount=excluded.bank_amount,cash_amount=excluded.cash_amount,total_amount=excluded.total_amount,
        status=excluded.status,updated_at=excluded.updated_at`)
      .bind(
        payrollId, companyId, year, month, employeeId,
        desired.salary, desired.road, desired.overtime, desired.extra, desired.garnishment,
        desired.deduction, desired.advance, desired.bank, desired.cash, net, "OVERRIDE",
        text(existing?.created_at) || timestamp, timestamp,
      ),
  );

  await c.env.DB.batch(statements);
  await audit(c, {
    mainCompanyId: companyId,
    period,
    employeeId,
    entityType: "BORDRO",
    action: "FINAL_CONTROL",
    summary: "Son bordro kontrolü kaynak hareketleriyle birlikte kaydedildi.",
    details: { reason, current, desired, net, correctionIds },
  });
  return okData(c, { employeeId, period, current, final: { ...desired, total: net }, correctionIds });
}


async function saveAdvancedPayrollLines(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const payrollLock = await rejectAdvancedPeriodLocked(c, companyId, year, month);
  if (payrollLock) return payrollLock;
  const employeeIds = Array.isArray(body.employeeIds) ? [...new Set(body.employeeIds.map(text).filter(Boolean))] : [];
  if (!employeeIds.length) return error(c, 400, "EMPLOYEE_REQUIRED", "Bordro kaydı için en az bir personel seçilmelidir.");
  const requested = upper(body.status || "CALCULATED");
  const status = requested === "PAID" ? "PAID" : "CALCULATED";
  const placeholders = employeeIds.map(() => "?").join(",");
  const rows = await all(c, `SELECT id,employee_id,status FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=? AND employee_id IN (${placeholders})`, [companyId, year, month, ...employeeIds]);
  const existingIds = new Set(rows.map((row) => text(row.employee_id)));
  const missing = employeeIds.filter((id) => !existingIds.has(id));
  if (missing.length) {
    return error(c, 409, "PAYROLL_NOT_FROZEN", `${missing.length} personelin bordrosu henüz sabitlenmemiş. Önce Son Kontrol/Kaydet işlemi yapılmalıdır.`);
  }
  const timestamp = nowIso();
  await c.env.DB.batch(rows.map((row) => c.env.DB.prepare("UPDATE hr_payrolls_v2 SET status=?,updated_at=? WHERE id=?").bind(status, timestamp, text(row.id))));
  await audit(c, {
    mainCompanyId: companyId,
    period,
    entityType: "BORDRO",
    action: status === "PAID" ? "PAYMENT_COMPLETE" : "PAYROLL_SAVE",
    summary: status === "PAID" ? `${rows.length} personelin ödemesi tamamlandı.` : `${rows.length} personelin bordrosu sabitlendi.`,
    details: { employeeIds, status, reason: text(body.reason) },
  });
  return okData(c, { year, month, period, employeeIds, status, count: rows.length });
}

async function saveAdvancedSettlementDraft(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  if (!(await employeeBelongsToCompany(c, employeeId, companyId))) return error(c, 404, "NOT_FOUND", "Personel bulunamadı.");
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const id = crypto.randomUUID();
  await audit(c, {
    mainCompanyId: companyId,
    period,
    employeeId,
    entityType: "KIDEM_AYRILIS",
    action: "DRAFT",
    summary: "Kıdem / ayrılış taslağı oluşturuldu.",
    details: { id, reason: text(body.reason) || "Kıdem / ayrılış taslağı" },
  });
  return okData(c, { id, employeeId, period, status: "DRAFT" }, 201);
}

function sgkHeaderKey(value: unknown) {
  return upper(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}

function sgkNameKey(value: unknown) {
  return sgkHeaderKey(value).replace(/\s+/g, " ");
}

function sgkNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  const raw = text(value).replace(/₺|TL/gi, "").replace(/\s+/g, "");
  if (!raw) return 0;
  let normalized = raw;
  if (raw.includes(",")) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+$/.test(raw)) normalized = raw.replace(/,/g, "");
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function sgkDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 1000 && value < 100000) {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (decoded?.y && decoded?.m && decoded?.d) return `${String(decoded.y).padStart(4, "0")}-${String(decoded.m).padStart(2, "0")}-${String(decoded.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const tr = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (tr) return `${tr[3]}-${tr[2].padStart(2, "0")}-${tr[1].padStart(2, "0")}`;
  return "";
}

function sgkPeriodFromText(value: unknown) {
  const raw = sgkHeaderKey(value);
  const numeric = raw.match(/(?:^|\s)(0?[1-9]|1[0-2])\s*[./-]?\s*(20\d{2})(?:\s|$)/);
  if (numeric) return { month: Number(numeric[1]), year: Number(numeric[2]) };
  const months: Record<string, number> = { OCAK:1, SUBAT:2, MART:3, NISAN:4, MAYIS:5, HAZIRAN:6, TEMMUZ:7, AGUSTOS:8, EYLUL:9, EKIM:10, KASIM:11, ARALIK:12 };
  for (const [name, month] of Object.entries(months)) {
    const m = raw.match(new RegExp(`(?:^|\\s)${name}(?:\\s+AYI)?(?:\\s+|.*?)(20\\d{2})`));
    if (m) return { month, year: Number(m[1]) };
  }
  return null;
}

function sgkColumn(headers: unknown[], aliases: string[]) {
  const normalized = headers.map(sgkHeaderKey);
  for (const alias of aliases.map(sgkHeaderKey)) {
    const exact = normalized.findIndex((value) => value === alias);
    if (exact >= 0) return exact;
    const contains = normalized.findIndex((value) => value.includes(alias));
    if (contains >= 0) return contains;
  }
  return -1;
}

async function previewAdvancedSgk(c: Context<AppEnv>) {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error(c, 400, "FILE_REQUIRED", "Resmi bordro XLS/XLSX dosyası seçilmelidir.");
  if (file.size <= 0) return error(c, 400, "FILE_EMPTY", "Bordro dosyası boş.");
  if (file.size > 15 * 1024 * 1024) return error(c, 413, "FILE_TOO_LARGE", "Bordro dosyası en fazla 15 MB olabilir.");
  const fileName = text(file.name);
  if (!/\.(xls|xlsx)$/i.test(fileName)) return error(c, 400, "SGK_FILE_TYPE", "Yalnız .xls veya .xlsx bordro dosyası kabul edilir.");

  const body: Row = {};
  for (const [key, value] of form.entries()) if (!(value instanceof File)) body[key] = value;
  const companyId = companyIdOf(c, body);
  const selectedYear = number(body.year);
  const selectedMonth = number(body.month);

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array", cellDates: true, dense: false });
  } catch {
    return error(c, 400, "SGK_EXCEL_PARSE", "Bordro Excel dosyası okunamadı.");
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) return error(c, 400, "SGK_EXCEL_EMPTY", "Bordro dosyasında okunabilir sayfa bulunamadı.");
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (!matrix.length) return error(c, 400, "SGK_EXCEL_EMPTY", "Bordro dosyasında satır bulunamadı.");

  let headerIndex = -1;
  for (let i = 0; i < Math.min(matrix.length, 80); i += 1) {
    const keys = (matrix[i] || []).map(sgkHeaderKey);
    const hasName = keys.some((value) => value.includes("ADI SOYADI") || value === "AD SOYAD" || value === "PERSONEL");
    const hasDay = keys.some((value) => value === "GUN" || value.includes("SGK GUN"));
    const hasNet = keys.some((value) => value.includes("NET ISTIHKAK") || value === "NET");
    if (hasName && (hasDay || hasNet)) { headerIndex = i; break; }
  }
  if (headerIndex < 0) return error(c, 400, "SGK_HEADER_NOT_FOUND", "Bordro başlık satırı bulunamadı. ADI SOYADI ve GÜN/NET sütunları kontrol edilmelidir.");

  const headers = matrix[headerIndex] || [];
  const col = {
    name: sgkColumn(headers, ["ADI SOYADI","AD SOYAD","PERSONEL"]),
    identity: sgkColumn(headers, ["T.C. KIMLIK NO","TC KIMLIK NO","T.C. KIMLIK","TC KIMLIK"]),
    code: sgkColumn(headers, ["PERSONEL KODU","PERSONEL KOD","SICIL NO","SSK SICIL"]),
    hire: sgkColumn(headers, ["GIRIS TARIHI","ISE GIRIS"]),
    exit: sgkColumn(headers, ["CIKIS TARIHI","ISTEN CIKIS"]),
    days: sgkColumn(headers, ["SGK GUN","GUN"]),
    normal: sgkColumn(headers, ["NORMAL KAZANC"]),
    other: sgkColumn(headers, ["DIGER KAZANC"]),
    gross: sgkColumn(headers, ["TOPLAM KAZANC","BRUT KAZANC","BRUT"]),
    base: sgkColumn(headers, ["SGK MATRAH","SSK MATRAH"]),
    sgkPremium: sgkColumn(headers, ["SGK PRIMI","SSK PRIMI"]),
    unemployment: sgkColumn(headers, ["ISSIZLIK PRIMI"]),
    incomeTax: sgkColumn(headers, ["GELIR VERGISI"]),
    stampTax: sgkColumn(headers, ["DAMGA VERGISI"]),
    specialDeduction: sgkColumn(headers, ["OZEL KESINTI"]),
    employerSgk: sgkColumn(headers, ["ISVEREN SGK","ISVEREN SSK"]),
    employerUnemployment: sgkColumn(headers, ["ISVEREN ISSIZLIK"]),
    incentive: sgkColumn(headers, ["SGK TESVIK","TESVIK"]),
    employerCost: sgkColumn(headers, ["ISVEREN NET MALIYET","NET MALIYET"]),
    net: sgkColumn(headers, ["NET ISTIHKAK","NET UCRET","NET"]),
  };
  if (col.name < 0) return error(c, 400, "SGK_NAME_COLUMN_MISSING", "Bordroda personel adı sütunu bulunamadı.");

  const people = await all(c, `SELECT e.id,e.code,e.full_name,s.identity_no,s.payroll_included
      FROM hr_monthly_employees e
      LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id
      WHERE e.main_company_id=?`, [companyId]);
  const byIdentity = new Map<string, Row>();
  const byCode = new Map<string, Row>();
  const byName = new Map<string, Row[]>();
  for (const person of people) {
    const identity = text(person.identity_no).replace(/\D/g, "");
    if (identity) byIdentity.set(identity, person);
    const code = sgkHeaderKey(person.code).replace(/\s+/g, "");
    if (code) byCode.set(code, person);
    const name = sgkNameKey(person.full_name);
    const list = byName.get(name) || [];
    list.push(person);
    byName.set(name, list);
  }

  const topText = matrix.slice(0, Math.min(headerIndex + 1, 30)).flat().map(text).filter(Boolean);
  let detected = sgkPeriodFromText(topText.join(" "));
  if (!detected) detected = sgkPeriodFromText(fileName);
  const detectedYear = detected?.year || 0;
  const detectedMonth = detected?.month || 0;
  const periodDetected = Boolean(detectedYear && detectedMonth);
  const periodMatches = periodDetected
    ? (!selectedYear || !selectedMonth || (selectedYear === detectedYear && selectedMonth === detectedMonth))
    : false;

  const workplaceText = topText.find((value) => /ISYERI|İŞYERİ|SICIL|SİCİL/i.test(value)) || "";
  const rows: Row[] = [];
  const maxRows = Math.min(matrix.length, headerIndex + 1 + 5000);
  for (let i = headerIndex + 1; i < maxRows; i += 1) {
    const source = matrix[i] || [];
    const fullName = text(source[col.name]).replace(/\s+/g, " ");
    if (!fullName) continue;
    const identityNo = col.identity >= 0 ? text(source[col.identity]).replace(/\D/g, "") : "";
    const personCode = col.code >= 0 ? text(source[col.code]) : "";
    const identityMatch = identityNo ? byIdentity.get(identityNo) : null;
    const codeMatch = personCode ? byCode.get(sgkHeaderKey(personCode).replace(/\s+/g, "")) : null;
    const nameMatches = byName.get(sgkNameKey(fullName)) || [];
    const nameMatch = nameMatches.length === 1 ? nameMatches[0] : null;
    const matched = identityMatch || codeMatch || nameMatch || null;
    const payrollIncluded = matched?.payroll_included;
    const employeeId = matched && (payrollIncluded === null || payrollIncluded === undefined || flag(payrollIncluded)) ? text(matched.id) : "";
    rows.push({
      sourceFile: fileName,
      workplace: workplaceText,
      workplaceNo: "",
      rowNumber: i + 1,
      selected: Boolean(employeeId),
      employeeId: employeeId || null,
      fullName,
      identityNo,
      personCode,
      hireDate: col.hire >= 0 ? sgkDate(source[col.hire]) : "",
      exitDate: col.exit >= 0 ? sgkDate(source[col.exit]) : "",
      sgkDays: col.days >= 0 ? sgkNumber(source[col.days]) : 0,
      normalEarning: col.normal >= 0 ? sgkNumber(source[col.normal]) : 0,
      otherEarning: col.other >= 0 ? sgkNumber(source[col.other]) : 0,
      gross: col.gross >= 0 ? sgkNumber(source[col.gross]) : 0,
      sgkBase: col.base >= 0 ? sgkNumber(source[col.base]) : 0,
      sgkPremium: col.sgkPremium >= 0 ? sgkNumber(source[col.sgkPremium]) : 0,
      unemploymentPremium: col.unemployment >= 0 ? sgkNumber(source[col.unemployment]) : 0,
      incomeTax: col.incomeTax >= 0 ? sgkNumber(source[col.incomeTax]) : 0,
      stampTax: col.stampTax >= 0 ? sgkNumber(source[col.stampTax]) : 0,
      specialDeduction: col.specialDeduction >= 0 ? sgkNumber(source[col.specialDeduction]) : 0,
      employerSgk: col.employerSgk >= 0 ? sgkNumber(source[col.employerSgk]) : 0,
      employerUnemployment: col.employerUnemployment >= 0 ? sgkNumber(source[col.employerUnemployment]) : 0,
      sgkIncentive: col.incentive >= 0 ? sgkNumber(source[col.incentive]) : 0,
      employerNetCost: col.employerCost >= 0 ? sgkNumber(source[col.employerCost]) : 0,
      net: col.net >= 0 ? sgkNumber(source[col.net]) : 0,
      status: employeeId ? (identityMatch ? "TC_ESLESTI" : codeMatch ? "KOD_ESLESTI" : "AD_ESLESTI") : (nameMatches.length > 1 ? "AYNI_AD_COKLU" : "ESLESMEDI"),
    });
  }
  if (!rows.length) return error(c, 400, "SGK_ROWS_EMPTY", "Bordro dosyasında personel satırı bulunamadı.");
  return okData(c, {
    fileName,
    workplace: workplaceText,
    year: detectedYear,
    month: detectedMonth,
    periodDetected,
    periodMatches,
    selectedYear,
    selectedMonth,
    rows,
    matched: rows.filter((row) => row.employeeId).length,
    unmatched: rows.filter((row) => !row.employeeId).length,
  });
}

async function confirmAdvancedSgk(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const year = number(body.year);
  const month = number(body.month);
  if (!year || month < 1 || month > 12) return error(c, 400, "INVALID_PERIOD", "SGK bordrosu için geçerli yıl ve ay zorunludur.");
  const locked = await rejectAdvancedPeriodLocked(c, companyId, year, month);
  if (locked) return locked;
  const rows = Array.isArray(body.rows) ? body.rows.filter((row: Row) => text(row.employeeId)) as Row[] : [];
  if (!rows.length) return error(c, 400, "SGK_ROWS_REQUIRED", "Aktarılacak eşleşmiş bordro satırı bulunamadı.");

  const employeeIds = [...new Set(rows.map((row) => text(row.employeeId)).filter(Boolean))];
  const validRows = await all(c, `SELECT id FROM hr_monthly_employees WHERE main_company_id=? AND id IN (${employeeIds.map(() => "?").join(",")})`, [companyId, ...employeeIds]);
  if (validRows.length !== employeeIds.length) return error(c, 400, "INVALID_EMPLOYEE", "SGK bordrosunda başka firmaya ait veya geçersiz personel var.");

  const versionRow = await first(c, "SELECT MAX(version_no) AS version_no FROM ik_sgk_imports WHERE main_company_id=? AND period_year=? AND period_month=?", [companyId, year, month]);
  const versionNo = number(versionRow?.version_no) + 1;
  const importId = crypto.randomUUID();
  const timestamp = nowIso();
  const fileName = text(body.fileName) || "SGK Bordro";

  const grouped = new Map<string, Row>();
  const sums = ["sgkDays","normalEarning","otherEarning","gross","sgkBase","sgkPremium","unemploymentPremium","incomeTax","stampTax","specialDeduction","employerSgk","employerUnemployment","sgkIncentive","net","employerNetCost"];
  for (const row of rows) {
    const employeeId = text(row.employeeId);
    const current = grouped.get(employeeId) || {
      employeeId,
      fullName: text(row.fullName),
      identityNo: text(row.identityNo),
      personCode: text(row.personCode),
      hireDate: hrDateOnly(row.hireDate),
      exitDate: hrDateOnly(row.exitDate),
      sources: [],
    };
    for (const key of sums) current[key] = number(current[key]) + number(row[key]);
    (current.sources as unknown[]).push({ sourceFile: text(row.sourceFile), workplace: text(row.workplace), rowNumber: number(row.rowNumber) });
    grouped.set(employeeId, current);
  }

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO ik_sgk_imports
      (id,main_company_id,period_year,period_month,file_name,version_no,status,created_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(importId, companyId, year, month, fileName, versionNo, "CONFIRMED", timestamp),
  ];
  for (const row of grouped.values()) {
    statements.push(
      c.env.DB.prepare(`INSERT INTO ik_sgk_rows
        (id,import_id,employee_id,full_name,identity_no,sgk_days,gross,net,raw_json,created_at,
         person_code,hire_date,exit_date,normal_earning,other_earning,total_earning,sgk_base,sgk_premium,
         unemployment_premium,income_tax,stamp_tax,special_deduction,employer_sgk,employer_unemployment,
         sgk_incentive,employer_net_cost,difference_reason)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(), importId, text(row.employeeId), text(row.fullName), text(row.identityNo),
          number(row.sgkDays), number(row.gross), number(row.net), JSON.stringify({ sources: row.sources || [] }), timestamp,
          text(row.personCode), hrDateOnly(row.hireDate), hrDateOnly(row.exitDate), number(row.normalEarning),
          number(row.otherEarning), number(row.gross), number(row.sgkBase), number(row.sgkPremium),
          number(row.unemploymentPremium), number(row.incomeTax), number(row.stampTax), number(row.specialDeduction),
          number(row.employerSgk), number(row.employerUnemployment), number(row.sgkIncentive),
          number(row.employerNetCost), text(row.differenceReason),
        ),
    );
    statements.push(
      c.env.DB.prepare(`INSERT INTO ik_person_monthly_compliance
        (main_company_id,employee_id,period,sgk_covered,sgk_days,note,updated_by,updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(main_company_id,employee_id,period) DO UPDATE SET
          sgk_covered=excluded.sgk_covered,sgk_days=excluded.sgk_days,note=excluded.note,
          updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .bind(companyId, text(row.employeeId), `${year}-${String(month).padStart(2, "0")}`, 1, number(row.sgkDays), `Resmi bordro v${versionNo}`, "IK_SGK_IMPORT", timestamp),
    );
  }
  await c.env.DB.batch(statements);
  await audit(c, {
    mainCompanyId: companyId,
    period: `${year}-${String(month).padStart(2, "0")}`,
    entityType: "SGK_BORDRO",
    action: "CONFIRM",
    summary: `Resmi bordro v${versionNo} onaylandı.`,
    details: { importId, fileName, versionNo, matched: grouped.size, inputRows: rows.length },
  });
  return okData(c, { id: importId, importId, year, month, versionNo, fileName, matched: grouped.size, inputRows: rows.length, status: "CONFIRMED" }, 201);
}

function safeIkDocumentName(value: unknown) {
  return text(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "evrak.bin";
}

async function uploadAdvancedDocument(c: Context<AppEnv>) {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return error(c, 400, "FILE_REQUIRED", "Yüklenecek evrak seçilmelidir.");
  if (file.size <= 0) return error(c, 400, "FILE_EMPTY", "Seçilen evrak boş.");
  if (file.size > 25 * 1024 * 1024) return error(c, 413, "FILE_TOO_LARGE", "İK evrakı en fazla 25 MB olabilir.");

  const body: Row = {};
  for (const [key, value] of form.entries()) if (!(value instanceof File)) body[key] = value;
  const companyId = companyIdOf(c, body);
  const employeeId = text(body.employeeId);
  if (!(await employeeBelongsToCompany(c, employeeId, companyId))) {
    return error(c, 400, "INVALID_EMPLOYEE", "Evrak için geçerli personel seçilmelidir.");
  }

  const id = crypto.randomUUID();
  const documentDate = hrDateOnly(body.date) || hrTodayIstanbul();
  const fileName = text(file.name) || "evrak.bin";
  const storageKey = `ik/documents/${companyId}/${employeeId}/${documentDate.slice(0, 7)}/${id}-${safeIkDocumentName(fileName)}`;
  await c.env.FILES.put(storageKey, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: {
      originalName: fileName.slice(0, 512),
      employeeId,
      companyId,
      documentType: text(body.documentType || "Personel evrağı").slice(0, 128),
    },
  });

  try {
    await c.env.DB.prepare(`INSERT INTO hr_employee_documents
      (id,employee_id,document_type,file_name,file_path,date,status)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(id, employeeId, text(body.documentType || "Personel evrağı"), fileName, storageKey, documentDate, text(body.status || "KAYITLI"))
      .run();
  } catch (cause) {
    await c.env.FILES.delete(storageKey).catch(() => undefined);
    throw cause;
  }

  await audit(c, {
    mainCompanyId: companyId,
    period: documentDate.slice(0, 7),
    employeeId,
    entityType: "EVRAK",
    action: "UPLOAD",
    summary: `${fileName} İK evrakı yüklendi.`,
    details: { id, documentType: text(body.documentType), storageKey, note: text(body.note), size: file.size },
  });
  return okData(c, { id, employeeId, documentType: text(body.documentType || "Personel evrağı"), fileName, storagePath: storageKey, date: documentDate, status: text(body.status || "KAYITLI") }, 201);
}

async function downloadAdvancedDocument(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const documentId = text(c.req.param("documentId"));
  const row = await first(c, `SELECT d.id,d.file_name,d.file_path,d.document_type
      FROM hr_employee_documents d
      JOIN hr_monthly_employees e ON e.id=d.employee_id
      WHERE d.id=? AND e.main_company_id=? LIMIT 1`, [documentId, companyId]);
  if (!row) return error(c, 404, "DOCUMENT_NOT_FOUND", "Evrak bulunamadı.");
  const storageKey = text(row.file_path);
  if (!storageKey) return error(c, 404, "DOCUMENT_FILE_MISSING", "Evrak dosya bağlantısı bulunamadı.");
  const object = await c.env.FILES.get(storageKey);
  if (!object?.body) return error(c, 404, "DOCUMENT_OBJECT_MISSING", "Evrak dosyası depolamada bulunamadı.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(text(row.file_name) || "evrak")}`);
  if (object.etag) headers.set("ETag", object.etag);
  return new Response(object.body, { status: 200, headers });
}

async function runAdvancedCloseCheck(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const year = number(body.year) || new Date().getFullYear();
  const month = number(body.month) || new Date().getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const periodEnd = `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const [employees, cards, payroll] = await Promise.all([
    monthlyRows(c, companyId),
    all(c, "SELECT employee_id,payroll_included,active_passive,exit_date FROM ik_person_card_settings WHERE main_company_id=?", [companyId]),
    all(c, "SELECT * FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=?", [companyId, year, month]),
  ]);
  const cardsByEmployee = new Map(cards.map((row) => [text(row.employee_id), row]));
  const visible = employees.filter((employee) => advancedEmployeeVisible(employee, cardsByEmployee.get(text(employee.id)) || {}, period));
  const payrollByEmployee = new Map(payroll.map((row) => [text(row.employee_id), row]));
  const missingPayroll = visible.filter((employee) => !payrollByEmployee.has(text(employee.id)));
  const unbalanced = payroll.filter((row) => Math.abs(number(row.bank_amount) + number(row.cash_amount) - number(row.total_amount)) > 0.01);
  const unpaid = payroll.filter((row) => upper(row.status) !== "PAID");
  const badDates = visible.filter((employee) => {
    const card = cardsByEmployee.get(text(employee.id)) || {};
    const exitDate = hrDateOnly(card.exit_date);
    return Boolean(exitDate && employee.hireDate && exitDate < employee.hireDate);
  });
  const missingHire = visible.filter((employee) => !hrDateOnly(employee.hireDate));
  const passiveWithoutExit = employees.filter((employee) => {
    const card = cardsByEmployee.get(text(employee.id)) || {};
    const lifecycle = upper(`${text(card.active_passive)} ${text(employee.status)}`);
    return lifecycle.includes("PAS") && !hrDateOnly(card.exit_date);
  });
  const checks = [
    { type: "PERSONEL_TARIH", title: "İşe giriş / çıkış tarih sırası", ok: badDates.length === 0, detail: badDates.length ? `${badDates.length} personelde tarih sırası hatalı.` : "İşe giriş / çıkış tarih sırası tutarlı." },
    { type: "PERSONEL_GIRIS", title: "İşe giriş tarihleri", ok: missingHire.length === 0, detail: missingHire.length ? `${missingHire.length} dönem personelinde işe giriş tarihi eksik. Geçmiş dönem kapsamı kesinleştirilemez.` : "Dönem personelinin işe giriş tarihleri tam." },
    { type: "PERSONEL_CIKIS", title: "Pasif personel çıkış tarihleri", ok: passiveWithoutExit.length === 0, detail: passiveWithoutExit.length ? `${passiveWithoutExit.length} pasif personelde işten çıkış tarihi eksik.` : "Pasif personelin çıkış tarihleri tam." },
    { type: "BORDRO_KAPSAM", title: "Bordro kapsamı", ok: missingPayroll.length === 0, detail: missingPayroll.length ? `${missingPayroll.length} dönem personelinin bordrosu henüz sabitlenmedi.` : `${visible.length} dönem personelinin bordrosu kayıtlı.` },
    { type: "ODEME_DENGE", title: "Banka + elden dengesi", ok: unbalanced.length === 0, detail: unbalanced.length ? `${unbalanced.length} bordro satırında ödeme dengesi bozuk.` : "Tüm bordro satırlarında banka + elden = net." },
    { type: "ODEME_DURUM", title: "Ödeme durumu", ok: unpaid.length === 0, detail: unpaid.length ? `${unpaid.length} bordro satırı henüz PAID durumunda değil.` : "Tüm bordrolar ödendi." },
  ];
  await audit(c, { mainCompanyId: companyId, period, entityType: "AY_SONU", action: "CHECK", summary: "Ay sonu kontrolü çalıştırıldı.", details: { checks, periodEnd } });
  let lockRow = await advancedPeriodLockRow(c, companyId, year, month);
  if (body.lock === true) {
    const blocking = checks.filter((item) => !item.ok);
    if (blocking.length) return error(c, 409, "IK_CLOSE_BLOCKED", `${blocking.length} açık kontrol maddesi varken dönem kapatılamaz.`, { checks });
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO ik_monthly_close
        (id,main_company_id,period_year,period_month,is_locked,locked_at,created_at,updated_at)
        VALUES (?,?,?,?,1,?,?,?)
        ON CONFLICT(main_company_id,period_year,period_month) DO UPDATE SET
          is_locked=1,locked_at=excluded.locked_at,updated_at=excluded.updated_at`)
        .bind(id, companyId, year, month, timestamp, timestamp, timestamp),
      c.env.DB.prepare(`INSERT INTO ik_monthly_close_logs
        (id,main_company_id,period_year,period_month,action,reason,old_json,new_json,user_name,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), companyId, year, month, "LOCK", text(body.reason || "Ay sonu kontrolleri tamamlandı."), JSON.stringify({ isLocked: flag(lockRow?.is_locked) }), JSON.stringify({ isLocked: true }), text(body.userName || "Sistem"), timestamp),
    ]);
    await audit(c, { mainCompanyId: companyId, period, entityType: "AY_SONU", action: "LOCK", summary: "İK aylık dönem kapatıldı.", details: { checks } });
    lockRow = await advancedPeriodLockRow(c, companyId, year, month);
  }
  return okData(c, { year, month, period, periodEnd, checks, isLocked: flag(lockRow?.is_locked), lockedAt: lockRow?.locked_at || null });
}

async function auditLogs(c: Context<AppEnv>) {
  const companyId = companyIdOf(c);
  const limit = Math.min(Math.max(number(c.req.query("limit")) || 200, 1), 500);
  const rows = await all(c, "SELECT * FROM hr_monthly_audit_logs WHERE main_company_id=? ORDER BY created_at DESC LIMIT ?", [companyId, limit]);
  return okList(c, rows.map((row) => ({ id: text(row.id), mainCompanyId: companyId, period: text(row.period), employeeId: text(row.employee_id), entityType: text(row.entity_type), action: text(row.action), summary: text(row.summary), details: (() => { try { return JSON.parse(text(row.details_json) || "{}"); } catch { return {}; } })(), createdAt: row.created_at })));
}


const DEFAULT_TR_OFFICIAL_HOLIDAY_RULES_2026 = [
  { date: "2026-01-01", name: "Yılbaşı", fraction: 1 },
  { date: "2026-03-19", name: "Ramazan Bayramı Arefesi", fraction: 0.5 },
  { date: "2026-03-20", name: "Ramazan Bayramı 1. Gün", fraction: 1 },
  { date: "2026-03-21", name: "Ramazan Bayramı 2. Gün", fraction: 1 },
  { date: "2026-03-22", name: "Ramazan Bayramı 3. Gün", fraction: 1 },
  { date: "2026-04-23", name: "Ulusal Egemenlik ve Çocuk Bayramı", fraction: 1 },
  { date: "2026-05-01", name: "Emek ve Dayanışma Günü", fraction: 1 },
  { date: "2026-05-19", name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", fraction: 1 },
  { date: "2026-05-26", name: "Kurban Bayramı Arefesi", fraction: 0.5 },
  { date: "2026-05-27", name: "Kurban Bayramı 1. Gün", fraction: 1 },
  { date: "2026-05-28", name: "Kurban Bayramı 2. Gün", fraction: 1 },
  { date: "2026-05-29", name: "Kurban Bayramı 3. Gün", fraction: 1 },
  { date: "2026-05-30", name: "Kurban Bayramı 4. Gün", fraction: 1 },
  { date: "2026-07-15", name: "Demokrasi ve Milli Birlik Günü", fraction: 1 },
  { date: "2026-08-30", name: "Zafer Bayramı", fraction: 1 },
  { date: "2026-10-28", name: "Cumhuriyet Bayramı Arifesi", fraction: 0.5 },
  { date: "2026-10-29", name: "Cumhuriyet Bayramı", fraction: 1 },
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
  countedWeekdays: number[] = [1, 2, 3, 4, 5],
  excludeOfficialHolidays = true,
  officialHolidayRules: Array<string | Row> = [],
) {
  const weekdayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const official = new Map<string, { name: string; fraction: number }>();
  for (const rule of officialHolidayRules) {
    if (typeof rule === "string") {
      official.set(rule, { name: "Resmi tatil", fraction: 1 });
      continue;
    }
    const date = hrDateOnly(rule?.date || rule?.holidayDate || rule?.workDate);
    if (!date) continue;
    official.set(date, {
      name: text(rule?.name || rule?.title) || "Resmi tatil",
      fraction: Math.max(0, Math.min(1, number(rule?.fraction ?? rule?.holidayFraction ?? 1) || 1)),
    });
  }

  const counted = new Set(countedWeekdays.map(Number));
  const countedDates: string[] = [];
  const excludedDates: Array<{ date: string; reason: string }> = [];
  const partialDates: Array<{ date: string; reason: string; counted: number }> = [];
  const calendarDates: string[] = [];
  const dayDetails: Row[] = [];
  let countedDays = 0;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(returnDate) || returnDate <= startDate) {
    return { startDate, returnDate, lastLeaveDate: "", calendarDays: 0, calendarDates, countedDays, countedDates, excludedDates, partialDates, dayDetails };
  }

  for (let date = startDate, guard = 0; date < returnDate && guard < 371; date = addIsoDays(date, 1), guard += 1) {
    calendarDates.push(date);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const weekdayCounted = counted.has(weekday);
    const holiday = official.get(date);
    let countedAmount = weekdayCounted ? 1 : 0;
    const reasons: string[] = [];

    if (!weekdayCounted) reasons.push("Haftalık izin / şirket sayım günü değil");
    if (weekdayCounted && excludeOfficialHolidays && holiday) {
      countedAmount = Math.max(0, countedAmount - holiday.fraction);
      reasons.push(holiday.fraction >= 1 ? holiday.name : `${holiday.name} (yarım gün)`);
    }

    countedAmount = Math.round(countedAmount * 2) / 2;
    countedDays += countedAmount;
    if (countedAmount > 0) countedDates.push(date);
    if (countedAmount === 0) excludedDates.push({ date, reason: reasons.join(" + ") || "Sayılmayan gün" });
    if (countedAmount > 0 && countedAmount < 1) partialDates.push({ date, reason: reasons.join(" + ") || "Kısmi resmi tatil", counted: countedAmount });
    dayDetails.push({
      date,
      weekday,
      weekdayName: weekdayNames[weekday],
      counted: countedAmount,
      holidayName: holiday?.name || "",
      holidayFraction: holiday?.fraction || 0,
      status: countedAmount === 1 ? "COUNTED" : countedAmount === 0 ? "EXCLUDED" : "PARTIAL",
      reason: reasons.join(" + ") || "Yıllık izinden sayılır",
    });
  }

  return {
    startDate,
    returnDate,
    lastLeaveDate: calendarDates.at(-1) || "",
    calendarDays: calendarDates.length,
    calendarDates,
    countedDays: Math.round(countedDays * 2) / 2,
    countedDates,
    excludedDates,
    partialDates,
    dayDetails,
  };
}

async function leavePolicyV2(c: Context<AppEnv>, companyId = companyIdOf(c)) {
  const row = await first(c, "SELECT * FROM ik_leave_counting_policy WHERE main_company_id=? LIMIT 1", [companyId]);
  let countedWeekdays = [1, 2, 3, 4, 5];
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
  const rules = new Map<string, Row>(DEFAULT_TR_OFFICIAL_HOLIDAY_RULES_2026.map((item) => [item.date, { ...item }]));
  try {
    const exists = await first(c, "SELECT name FROM sqlite_master WHERE type='table' AND name='json_store' LIMIT 1");
    if (exists?.name) {
      const rows = await all(c, "SELECT data FROM json_store WHERE scope='IK_OFFICIAL_HOLIDAY' AND (main_company_slug=? OR main_company_slug IS NULL)", [companyId]);
      for (const row of rows) {
        try {
          const parsed = JSON.parse(text(row.data) || "{}");
          const date = hrDateOnly(parsed?.date || parsed?.holidayDate || parsed?.workDate);
          if (!date) continue;
          rules.set(date, {
            date,
            name: text(parsed?.name || parsed?.title) || "Şirket / resmi tatil",
            fraction: Math.max(0, Math.min(1, number(parsed?.fraction ?? parsed?.holidayFraction ?? 1) || 1)),
          });
        } catch {}
      }
    }
  } catch {}
  return [...rules.values()].sort((a, b) => text(a.date).localeCompare(text(b.date)));
}

async function saveAdvancedLeavePolicyV2(c: Context<AppEnv>) {
  const body = await bodyOf(c);
  const companyId = companyIdOf(c, body);
  const rawDays = Array.isArray(body.countedWeekdays) ? body.countedWeekdays : [1, 2, 3, 4, 5];
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
  const employeeCard = await first(c, "SELECT exit_date FROM ik_person_card_settings WHERE employee_id=? AND main_company_id=? LIMIT 1", [employeeId, companyId]).catch(() => null);
  const hireDate = hrDateOnly(employee.hireDate || employee.startDate || employee.hire_date);
  const exitDate = hrDateOnly(employeeCard?.exit_date || employee.exitDate || employee.exit_date);
  if (hireDate && startDate < hireDate) return supplied ? null : error(c, 409, "LEAVE_BEFORE_HIRE", "İzin başlangıcı personelin işe giriş tarihinden önce olamaz.");
  if (exitDate && startDate > exitDate) return supplied ? null : error(c, 409, "LEAVE_AFTER_EXIT", "İzin başlangıcı personelin işten çıkış tarihinden sonra olamaz.");
  const policy = await leavePolicyV2(c, companyId);
  const officialHolidays = await officialHolidayDatesV2(c, companyId);
  const range = calculateAnnualLeaveRange(startDate, returnDate, policy.countedWeekdays, policy.excludeOfficialHolidays, officialHolidays);
  if (!range.calendarDays || range.calendarDays > 370) return supplied ? null : error(c, 400, "LEAVE_RANGE_INVALID", "İzin aralığı 1 ile 370 takvim günü arasında olmalıdır.");
  if (exitDate && range.lastLeaveDate > exitDate) return supplied ? null : error(c, 409, "LEAVE_AFTER_EXIT", "İzin günleri personelin işten çıkış tarihinden sonraya taşamaz.");

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
    const employment = await first(c, `SELECT e.hire_date,s.exit_date FROM hr_monthly_employees e LEFT JOIN ik_person_card_settings s ON s.employee_id=e.id AND s.main_company_id=e.main_company_id WHERE e.id=? AND e.main_company_id=? LIMIT 1`, [employeeId, companyId]);
    const startDate = hrDateOnly(body.startDate || body.start);
    const endDate = hrDateOnly(body.endDate || body.end || startDate);
    if (!startDate || !endDate || endDate < startDate) return error(c, 400, "DATE_REQUIRED", "Geçerli izin başlangıç ve bitiş tarihi zorunludur.");
    const hireDate = hrDateOnly(employment?.hire_date);
    const exitDate = hrDateOnly(employment?.exit_date);
    if (hireDate && startDate < hireDate) return error(c, 409, "LEAVE_BEFORE_HIRE", "İzin personelin işe giriş tarihinden önce olamaz.");
    if (exitDate && endDate > exitDate) return error(c, 409, "LEAVE_AFTER_EXIT", "İzin personelin işten çıkış tarihinden sonraya taşamaz.");
    const leaveLock = await rejectAdvancedPeriodLocked(c, companyId, number(startDate.slice(0, 4)), number(startDate.slice(5, 7)));
    if (leaveLock) return leaveLock;
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
  const annualStart = text(preview.startDate);
  const annualLock = await rejectAdvancedPeriodLocked(c, companyId, number(annualStart.slice(0, 4)), number(annualStart.slice(5, 7)));
  if (annualLock) return annualLock;
  if (preview.hasCriticalConflict) return error(c, 409, "LEAVE_CONFLICT", "Personelin seçilen tarihlerde başka yıllık izin kaydı var.");
  if (preview.hasDepartmentWarning && body.allowDepartmentConflict !== true) return error(c, 409, "DEPARTMENT_LEAVE_CONFLICT", "Aynı bölümde izin çakışması var. Yetkili onayı gerekir.");

  const statusRaw = upper(body.status || (text(preview.startDate) > new Date().toISOString().slice(0, 10) ? "PLANNED" : "APPROVED"));
  const status = ["PLANNED", "APPROVED", "TAKEN"].includes(statusRaw) ? statusRaw : "PLANNED";
  const planId = text(body.id) || crypto.randomUUID();
  const marker = `ik-leave-plan:${planId}`;
  const documentNo = text(body.documentNo || body.documentId);
  const note = text(body.note);
  const effectType = text(body.effectType || body.wageEffect) || "Ücretli";
  const excludedDates = Array.isArray(preview.excludedDates) ? preview.excludedDates : [];
  const calculationSnapshot = {
    policy: preview.policy,
    countedDays: preview.countedDays,
    countedDates: preview.countedDates,
    excludedDates: preview.excludedDates,
    partialDates: preview.partialDates,
    dayDetails: preview.dayDetails,
    officialHolidays: preview.officialHolidays,
    calculatedAt: nowIso(),
  };
  await c.env.DB.prepare(`INSERT INTO ik_leave_plans
    (id,main_company_id,employee_id,record_type,effect_type,start_date,end_date,return_date,counted_days,excluded_json,calculation_json,status,document_no,note,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,record_type=excluded.record_type,effect_type=excluded.effect_type,start_date=excluded.start_date,end_date=excluded.end_date,return_date=excluded.return_date,counted_days=excluded.counted_days,excluded_json=excluded.excluded_json,calculation_json=excluded.calculation_json,status=excluded.status,document_no=excluded.document_no,note=excluded.note,updated_at=excluded.updated_at`)
    .bind(planId, companyId, employeeId, recordType, effectType, text(preview.startDate), text(preview.lastLeaveDate), text(preview.returnDate), number(preview.countedDays), JSON.stringify(excludedDates), JSON.stringify(calculationSnapshot), status, documentNo, note, text(body.userName) || "Sistem", nowIso(), nowIso()).run();
  await c.env.DB.prepare("DELETE FROM hr_leave_records_v2 WHERE document_path=?").bind(marker).run();
  let recordId = "";
  if (status !== "PLANNED") {
    recordId = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO hr_leave_records_v2
      (id,employee_id,record_type,effect_type,start_date,end_date,day_count,document_path,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(recordId, employeeId, recordType, effectType, text(preview.startDate), text(preview.lastLeaveDate), number(preview.countedDays), marker, note, nowIso()).run();
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
  const planStart = hrDateOnly(plan.start_date);
  const cancelLock = await rejectAdvancedPeriodLocked(c, companyId, number(planStart.slice(0, 4)), number(planStart.slice(5, 7)));
  if (cancelLock) return cancelLock;
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
    let calculation: Row = {};
    try { const parsed = JSON.parse(text(row.excluded_json) || "[]"); if (Array.isArray(parsed)) excludedDates = parsed; } catch {}
    try { const parsed = JSON.parse(text(row.calculation_json) || "{}"); if (parsed && typeof parsed === "object") calculation = parsed; } catch {}
    return {
      id: text(row.id),
      employeeId: text(row.employee_id),
      fullName: text(employee?.fullName) || "-",
      code: text(employee?.code),
      department: text(employee?.department),
      title: text(employee?.title),
      recordType: text(row.record_type),
      effectType: text(row.effect_type) || "Ücretli",
      startDate: hrDateOnly(row.start_date),
      endDate: hrDateOnly(row.end_date),
      lastLeaveDate: hrDateOnly(row.end_date),
      returnDate: hrDateOnly(row.return_date),
      countedDays: number(row.counted_days),
      excludedDates,
      countedDates: Array.isArray(calculation.countedDates) ? calculation.countedDates : [],
      partialDates: Array.isArray(calculation.partialDates) ? calculation.partialDates : [],
      dayDetails: Array.isArray(calculation.dayDetails) ? calculation.dayDetails : [],
      policySnapshot: calculation.policy || null,
      status: text(row.status),
      documentNo: text(row.document_no),
      note: text(row.note),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      legacy: false,
    };
  });
  const legacyRows = await all(c, `SELECT l.* FROM hr_leave_records_v2 l JOIN hr_monthly_employees e ON e.id=l.employee_id
      WHERE e.main_company_id=? AND (l.document_path IS NULL OR l.document_path NOT LIKE 'ik-leave-plan:%') ORDER BY l.start_date ASC`, [companyId]);
  const legacyPlans = legacyRows.filter((row) => upper(row.record_type).includes("YILLIK")).map((row) => {
    const employee = employeeMap.get(text(row.employee_id));
    const endDate = hrDateOnly(row.end_date);
    return { id: `legacy:${text(row.id)}`, employeeId: text(row.employee_id), fullName: text(employee?.fullName) || "-", code: text(employee?.code), department: text(employee?.department), title: text(employee?.title), recordType: text(row.record_type), effectType: text(row.effect_type) || "Ücretli", startDate: hrDateOnly(row.start_date), endDate, lastLeaveDate: endDate, returnDate: addIsoDays(endDate, 1), countedDays: number(row.day_count), excludedDates: [], countedDates: [], partialDates: [], dayDetails: [], policySnapshot: null, status: "TAKEN", documentNo: "", note: text(row.note), createdAt: row.created_at, updatedAt: row.created_at, legacy: true };
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
  return okData(c, { policy: { countedWeekdays: [1, 2, 3, 4, 5], excludeOfficialHolidays: true, maxConcurrentDepartment: 1 }, plans, conflicts: [] });
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


  app.get("/api/ik/monthly-adjustments", protect(listAdjustments));
  app.post("/api/ik/monthly-adjustments", protect(saveAdjustment));
  app.patch("/api/ik/monthly-adjustments/:id", protect(saveAdjustment));
  app.delete("/api/ik/monthly-adjustments/:id", protect(deleteAdjustment));
  app.get("/api/ik/leaves", protect(listLeaves));
  app.post("/api/ik/leaves", protect(saveLeave));
  app.patch("/api/ik/leaves/:id", protect(saveLeave));
  app.delete("/api/ik/leaves/:id", protect(deleteLeave));
  app.get("/api/ik/payroll", protect(listPayrolls));

  app.get("/api/ik/advanced/sync-state", protect(advancedSyncState));
  app.get("/api/ik/advanced/period-state", protect(advancedPeriodState));
  app.post("/api/ik/advanced/period-prepare", protect(prepareAdvancedPeriod));
  app.get("/api/ik/advanced/month", protect(advancedMonth));
  app.get("/api/ik/advanced/payroll", protect(advancedPayroll));
  app.post("/api/ik/advanced/payroll/override", protect(saveAdvancedPayrollOverride));
  app.post("/api/ik/advanced/payroll/final-control", protect(saveAdvancedPayrollFinalControl));
  app.post("/api/ik/advanced/payroll/save", protect(saveAdvancedPayrollLines));
  app.post("/api/ik/advanced/settlement-draft", protect(saveAdvancedSettlementDraft));
  app.post("/api/ik/advanced/sgk/preview", protect(previewAdvancedSgk));
  app.post("/api/ik/advanced/sgk/confirm", protect(confirmAdvancedSgk));
  app.post("/api/ik/advanced/documents/upload", protect(uploadAdvancedDocument));
  app.get("/api/ik/advanced/documents/:documentId/content", protect(downloadAdvancedDocument));
  app.post("/api/ik/advanced/close-check", protect(runAdvancedCloseCheck));
  app.get("/api/ik/advanced/audit-logs", protect(auditLogs));
  app.get("/api/ik/advanced/leave-center", protect(leaveCenterV2));
  app.post("/api/ik/advanced/leave/preview", protect(async (c) => (await previewAdvancedLeaveV2(c)) as Response));
  app.post("/api/ik/advanced/leave/policy", protect(saveAdvancedLeavePolicyV2));
  app.post("/api/ik/advanced/person-card/:employeeId", protect(savePersonCard));
  app.post("/api/ik/advanced/person-card/:employeeId/admin-maintenance", protect(adminMaintainPerson));
  app.post("/api/ik/advanced/compensation/bulk", protect(saveAdvancedBulkCompensation));
  app.post("/api/ik/advanced/finance-movement", protect(saveAdvancedFinance));
  app.post("/api/ik/advanced/finance-movement/update", protect(updateAdvancedFinance));
  app.post("/api/ik/advanced/finance-movement/delete", protect(deleteAdvancedFinance));
  app.post("/api/ik/advanced/leave", protect(saveAdvancedLeaveRecordV2));
  app.post("/api/ik/advanced/leave/cancel", protect(cancelAdvancedLeaveV2));
}
