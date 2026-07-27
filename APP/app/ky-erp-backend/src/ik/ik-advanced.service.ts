import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";

type AnyRow = Record<string, any>;

@Injectable()
export class IkAdvancedService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() { await this.ensureSchema(); }

  private text(value: any) { return String(value ?? "").trim(); }
  private number(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const text = this.text(value).replace(/[^\d,.-]/g, "");
    const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
    const result = Number(normalized);
    return Number.isFinite(result) ? result : 0;
  }
  private companyCandidates(query: AnyRow = {}) {
    const seed = this.text(query.mainCompanyId || query.mainCompanySlug || "mecit-hakan");
    const values = [seed, "mecit-hakan", "main-mecit-hakan", "hakan-mecit"];
    return [...new Set(values.filter(Boolean))];
  }
  private dateOnly(value: any) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return this.text(value).slice(0, 10);
  }
  private safeDate(value: any) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
  private norm(value: any) {
    return this.text(value).toLocaleUpperCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[İIı]/g, "I").replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/Ö/g, "O").replace(/Ş/g, "S").replace(/Ü/g, "U").replace(/\s+/g, " ");
  }
  private normalizeAdjustmentType(value: any) {
    const raw = this.text(value || "Avans");
    const normalized = this.norm(raw);
    if (normalized.includes("TOPLU") && normalized.includes("AVANS")) return "Toplu avans";
    if (normalized.includes("HAFTA SONU") && normalized.includes("MESAI")) return "Hafta sonu mesai";
    if (normalized.includes("MESAI")) return "Mesai";
    if (normalized.includes("PRIM")) return "Prim";
    if (normalized.includes("AVANS")) return "Avans";
    if (normalized.includes("KESINTI")) return "Özel kesinti";
    return raw;
  }
  private isOvertimeType(value: any) {
    return this.norm(value).includes("MESAI");
  }
  private isPremiumType(value: any) {
    return this.norm(value).includes("PRIM");
  }
  private isAdvanceType(value: any) {
    return this.norm(value).includes("AVANS");
  }
  private isDeductionType(value: any) {
    return this.norm(value).includes("KESINTI");
  }
  private financePayrollEffect(type: string, fallback?: any) {
    const current = this.text(fallback);
    if (current) return current;
    if (this.isOvertimeType(type) || this.isPremiumType(type)) return "BORDRO_ARTIRIR";
    if (this.isAdvanceType(type) || this.isDeductionType(type)) return "BORDRO_AZALTIR";
    return "BORDROYA_YANSIR";
  }
  private status(value: any) {
    const status = this.text(value || "G").toLocaleUpperCase("tr-TR");
    return status === "İ" ? "I" : status;
  }

  private isWeekendDate(dateText: string) {
    const d = new Date(`${dateText}T00:00:00`);
    const day = d.getDay();
    return day === 0 || day === 6;
  }
  private dateInRange(dateText: string, start?: any, end?: any) {
    const startText = this.dateOnly(start || "");
    const endText = this.dateOnly(end || "");
    if (startText && dateText < startText) return false;
    if (endText && dateText > endText) return false;
    return true;
  }

  private async ensureSchema() {
    const db: any = this.prisma as any;
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_person_card_settings (
      employee_id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      card_no TEXT NOT NULL DEFAULT '',
      identity_no TEXT NOT NULL DEFAULT '',
      payroll_included INTEGER NOT NULL DEFAULT 1,
      card_source TEXT NOT NULL DEFAULT 'TNF',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ik_person_card_card_no ON ik_person_card_settings(main_company_id, card_no)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_monthly_attendance (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'G',
      check_in TEXT NOT NULL DEFAULT '',
      check_out TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'MANUAL',
      is_manual INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, work_date)
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_monthly_attendance_period ON ik_monthly_attendance(main_company_id, work_date)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_sgk_imports (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_sgk_rows (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL,
      employee_id TEXT,
      full_name TEXT NOT NULL,
      identity_no TEXT NOT NULL DEFAULT '',
      sgk_days REAL NOT NULL DEFAULT 0,
      gross REAL NOT NULL DEFAULT 0,
      net REAL NOT NULL DEFAULT 0,
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_sgk_rows_import ON ik_sgk_rows(import_id)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_monthly_close (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(main_company_id, period_year, period_month)
    )`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_monthly_close_logs (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      old_json TEXT NOT NULL DEFAULT '{}',
      new_json TEXT NOT NULL DEFAULT '{}',
      user_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_card_imports (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PREVIEW',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_card_import_rows (
      id TEXT PRIMARY KEY,
      import_id TEXT NOT NULL,
      employee_id TEXT,
      full_name TEXT NOT NULL DEFAULT '',
      card_no TEXT NOT NULL DEFAULT '',
      work_date TEXT NOT NULL DEFAULT '',
      check_in TEXT NOT NULL DEFAULT '',
      check_out TEXT NOT NULL DEFAULT '',
      warning TEXT NOT NULL DEFAULT '',
      raw_line TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_card_import_rows_import ON ik_card_import_rows(import_id)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_audit_logs (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL DEFAULT '',
      period TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL,
      source_screen TEXT NOT NULL DEFAULT '',
      old_json TEXT NOT NULL DEFAULT '{}',
      new_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_audit_logs_employee ON ik_audit_logs(main_company_id, employee_id, period)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_payroll_overrides (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      employee_id TEXT NOT NULL,
      system_json TEXT NOT NULL DEFAULT '{}',
      override_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'MANUAL_APPROVED',
      user_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(main_company_id, period_year, period_month, employee_id)
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_payroll_overrides_period ON ik_payroll_overrides(main_company_id, period_year, period_month)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS hr_payrolls_v2 (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      employee_id TEXT NOT NULL,
      salary REAL NOT NULL DEFAULT 0,
      road_allowance REAL NOT NULL DEFAULT 0,
      overtime_amount REAL NOT NULL DEFAULT 0,
      premium_amount REAL NOT NULL DEFAULT 0,
      deduction_amount REAL NOT NULL DEFAULT 0,
      advance_amount REAL NOT NULL DEFAULT 0,
      bank_amount REAL NOT NULL DEFAULT 0,
      cash_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(main_company_id, year, month, employee_id)
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_hr_payrolls_v2_company ON hr_payrolls_v2(main_company_id)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_settlement_drafts (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      exit_date TEXT NOT NULL,
      seniority_days INTEGER NOT NULL DEFAULT 0,
      gross_salary REAL NOT NULL DEFAULT 0,
      ceiling_amount REAL NOT NULL DEFAULT 0,
      severance_amount REAL NOT NULL DEFAULT 0,
      unused_leave_days REAL NOT NULL DEFAULT 0,
      unused_leave_amount REAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_settlement_drafts_employee ON ik_settlement_drafts(main_company_id, employee_id, exit_date)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_leave_counting_policy (
      main_company_id TEXT PRIMARY KEY,
      counted_weekdays_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
      exclude_official_holidays INTEGER NOT NULL DEFAULT 1,
      max_concurrent_department INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ik_leave_plans (
      id TEXT PRIMARY KEY,
      main_company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      record_type TEXT NOT NULL DEFAULT 'Yillik izin',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      counted_days REAL NOT NULL DEFAULT 0,
      excluded_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'PLANNED',
      document_no TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_leave_plans_period ON ik_leave_plans(main_company_id, start_date, end_date, status)`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_ik_leave_plans_employee ON ik_leave_plans(employee_id, start_date, end_date)`);
    await this.ensureColumn("ik_person_card_settings", "personel_kodu", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_person_card_settings", "exit_date", "TEXT");
    await this.ensureColumn("ik_person_card_settings", "active_passive", "TEXT NOT NULL DEFAULT 'AKTIF'");
    await this.ensureColumn("ik_person_card_settings", "work_type", "TEXT NOT NULL DEFAULT 'AYLIK'");
    await this.ensureColumn("ik_person_card_settings", "sgk_follow", "INTEGER NOT NULL DEFAULT 1");
    await this.ensureColumn("ik_person_card_settings", "payment_type", "TEXT NOT NULL DEFAULT 'BANKA_ELDEN'");
    await this.ensureColumn("ik_person_card_settings", "note", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_monthly_attendance", "early_exit", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_monthly_attendance", "late_entry", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_monthly_attendance", "document_id", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_monthly_attendance", "created_by", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_monthly_attendance", "updated_by", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_sgk_imports", "version_no", "INTEGER NOT NULL DEFAULT 1");
    await this.ensureColumn("ik_sgk_imports", "status", "TEXT NOT NULL DEFAULT 'CONFIRMED'");
    await this.ensureColumn("ik_sgk_rows", "person_code", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_sgk_rows", "hire_date", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_sgk_rows", "exit_date", "TEXT NOT NULL DEFAULT ''");
    await this.ensureColumn("ik_sgk_rows", "normal_earning", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "other_earning", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "total_earning", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "sgk_base", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "sgk_premium", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "unemployment_premium", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "income_tax", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "stamp_tax", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "special_deduction", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "employer_sgk", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "employer_unemployment", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "sgk_incentive", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "employer_net_cost", "REAL NOT NULL DEFAULT 0");
    await this.ensureColumn("ik_sgk_rows", "difference_reason", "TEXT NOT NULL DEFAULT ''");
  }

  private async ensureColumn(table: string, column: string, definition: string) {
    try {
      await (this.prisma as any).$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error: any) {
      const message = String(error?.message || "");
      if (!message.toLowerCase().includes("duplicate column")) throw error;
    }
  }

  private async writeAuditLog(body: AnyRow = {}) {
    const companyId = this.companyCandidates(body)[0];
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO ik_audit_logs (id, main_company_id, employee_id, period, action_type, source_screen, old_json, new_json, reason, user_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      companyId,
      this.text(body.employeeId),
      this.text(body.period),
      this.text(body.actionType || body.action || "IK_ISLEM"),
      this.text(body.sourceScreen || body.source || "IK"),
      JSON.stringify(body.oldValue || body.oldJson || {}),
      JSON.stringify(body.newValue || body.newJson || {}),
      this.text(body.reason || body.note),
      this.text(body.userName || "Sistem"),
    );
  }

  async auditLogs(query: AnyRow = {}) {
    await this.ensureSchema();
    const companyId = this.companyCandidates(query)[0];
    const args: any[] = [companyId];
    let where = `main_company_id = ?`;
    if (this.text(query.employeeId)) { where += ` AND employee_id = ?`; args.push(this.text(query.employeeId)); }
    if (this.text(query.period)) { where += ` AND period = ?`; args.push(this.text(query.period)); }
    const limit = Math.max(1, Math.min(500, Number(query.limit || 150)));
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM ik_audit_logs WHERE ${where} ORDER BY datetime(created_at) DESC LIMIT ${limit}`,
      ...args,
    ) as AnyRow[];
    return rows.map((row) => ({
      id: row.id,
      mainCompanyId: row.main_company_id,
      employeeId: row.employee_id,
      period: row.period,
      actionType: row.action_type,
      sourceScreen: row.source_screen,
      oldValue: JSON.parse(row.old_json || "{}"),
      newValue: JSON.parse(row.new_json || "{}"),
      reason: row.reason,
      userName: row.user_name,
      createdAt: row.created_at,
    }));
  }

  private async employees(query: AnyRow) {
    const candidates = this.companyCandidates(query);
    const rows = await (this.prisma as any).hrMonthlyEmployee.findMany({
      where: { mainCompanyId: { in: candidates }, status: { not: "Pasif" } },
      orderBy: [{ code: "asc" }, { fullName: "asc" }],
    });
    const liveRows = rows.filter((row: AnyRow) => !this.isLiveTestEmployee(row));
    const ids = liveRows.map((row: AnyRow) => row.id);
    const settings = ids.length ? await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM ik_person_card_settings WHERE employee_id IN (${ids.map(() => "?").join(",")})`, ...ids,
    ) : [];
    const map = new Map((settings as AnyRow[]).map((row) => [row.employee_id, row]));
    return liveRows.map((row: AnyRow) => {
      const s = map.get(row.id) || {};
      const hasSetting = map.has(row.id);
      const rawSgkStatus = this.norm(row.sgkStatus || "");
      const inferredSgkFollow = rawSgkStatus.includes("YOK") ? false : rawSgkStatus.includes("VAR") ? true : null;
      const storedSgkFollow = hasSetting ? (Number(s.sgk_follow) === 2 ? null : Number(s.sgk_follow) !== 0) : inferredSgkFollow;
      return {
        id: row.id, code: row.code || "", fullName: row.fullName || "", title: row.title || "", department: row.department || "",
        workType: s.work_type || row.workType || "AYLIK", sgkStatus: row.sgkStatus || "",
        status: s.active_passive || row.status || "AKTIF",
        hireDate: this.dateOnly(row.hireDate), exitDate: s.exit_date || "",
        salary: this.number(row.salary), roadAllowance: this.number(row.roadAllowance),
        bankAmount: this.number(row.bankAmount), cashAmount: this.number(row.cashAmount),
        annualLeaveEntitlement: this.number(row.annualLeaveEntitlement), annualLeaveCarryover: this.number(row.annualLeaveCarryover),
        cardNo: s.card_no || "", identityNo: s.identity_no || "", payrollIncluded: s.payroll_included !== 0,
        cardSource: s.card_source || "TNF", sgkFollow: storedSgkFollow,
        paymentType: s.payment_type || row.bankPaymentType || "BANKA_ELDEN",
        note: s.note || row.note || "", sgkDays: 0,
      };
    });
  }

  private isLiveTestEmployee(row: AnyRow = {}) {
    const fullName = this.text(row.fullName || row.full_name).toLocaleUpperCase("tr-TR");
    const title = this.text(row.title).toLocaleUpperCase("tr-TR");
    const department = this.text(row.department).toLocaleUpperCase("tr-TR");
    return fullName.includes("CANLI IK") || (fullName.includes("CANLI") && (title.includes("TEST") || department.includes("TEST")));
  }

  private async holidaysForYear(year: number) {
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT tarih as date FROM official_holidays WHERE yil = ? AND aktif = 1`,
      year,
    ) as AnyRow[];
    return new Set(rows.map((row) => this.dateOnly(row.date)).filter(Boolean));
  }

  private async monthlyResolvedDays(query: AnyRow, base?: AnyRow) {
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    const totalDays = new Date(year, month, 0).getDate();
    const employees = base?.employees || await this.employees(query);
    const attendance = base?.attendance || [];
    const attendanceMap = new Map<string, AnyRow>();
    attendance.forEach((row: AnyRow) => {
      const employeeId = row.employeeId || row.employee_id;
      const workDate = this.dateOnly(row.workDate || row.work_date);
      if (employeeId && workDate) attendanceMap.set(`${employeeId}|${workDate}`, row);
    });
    const holidays = await this.holidaysForYear(year);
    const result: AnyRow[] = [];
    for (const employee of employees) {
      const days: AnyRow[] = [];
      for (let day = 1; day <= totalDays; day += 1) {
        const workDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        days.push(await this.resolveMonthlyDay(employee.id, workDate, { employee, attendanceMap, holidays, query }));
      }
      result.push({ employeeId: employee.id, days });
    }
    return result;
  }

  async resolveMonthlyDay(employeeId: string, tarih: string, context: AnyRow = {}) {
    const workDate = this.dateOnly(tarih);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new BadRequestException("Personel ve tarih zorunlu.");
    const year = Number(workDate.slice(0, 4));
    const month = Number(workDate.slice(5, 7));
    const companyId = this.companyCandidates(context.query || context || {})[0];
    const locked = (await (this.prisma as any).$queryRawUnsafe(
      `SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1`,
      companyId, year, month,
    ) as AnyRow[])[0];
    const employee = context.employee || (await this.employees(context.query || context || {})).find((row: AnyRow) => row.id === employeeId);
    const holidays: Set<string> = context.holidays || await this.holidaysForYear(year);
    const attendanceMap: Map<string, AnyRow> = context.attendanceMap || new Map();
    let exception = attendanceMap.get(`${employeeId}|${workDate}`);
    if (!exception && !context.attendanceMap) {
      exception = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT id, employee_id as employeeId, work_date as workDate, status, check_in as checkIn, check_out as checkOut, note, source, is_manual as isManual, early_exit as earlyExit, late_entry as lateEntry, document_id as documentId FROM ik_monthly_attendance WHERE employee_id=? AND work_date=? LIMIT 1`,
        employeeId, workDate,
      ) as AnyRow[])[0];
    }
    if (employee && !this.dateInRange(workDate, employee.hireDate, employee.exitDate)) {
      return { employeeId, workDate, status: "-", source: "AUTO", locked: Boolean(locked?.is_locked), reason: "ISE_GIRIS_CIKIS_DISI" };
    }
    if (exception) {
      return {
        id: exception.id,
        employeeId,
        workDate,
        status: this.status(exception.status),
        checkIn: exception.checkIn || exception.check_in || "",
        checkOut: exception.checkOut || exception.check_out || "",
        note: exception.note || "",
        source: exception.source || "MANUAL",
        isManual: Boolean(exception.isManual ?? exception.is_manual),
        earlyExit: exception.earlyExit || exception.early_exit || "",
        lateEntry: exception.lateEntry || exception.late_entry || "",
        documentId: exception.documentId || exception.document_id || "",
        locked: Boolean(locked?.is_locked),
        reason: "ISTISNA",
      };
    }
    if (holidays.has(workDate)) {
      return { employeeId, workDate, status: "-", source: "AUTO", locked: Boolean(locked?.is_locked), reason: "RESMI_TATIL" };
    }
    if (this.isWeekendDate(workDate)) {
      return { employeeId, workDate, status: "-", source: "AUTO", locked: Boolean(locked?.is_locked), reason: "HAFTA_TATILI" };
    }
    return { employeeId, workDate, status: "G", source: "AUTO", locked: Boolean(locked?.is_locked), reason: "OTOMATIK_NORMAL" };
  }

  private employeeMonthStats(days: AnyRow[], sgkDays = 0) {
    const paidStatuses = new Set(["G", "Y", "M", "E", "L", "K", "W"]);
    const stats = { paid: 0, physicalPresent: 0, weekdayPresent: 0, weekendPresent: 0, annual: 0, report: 0, excuse: 0, unpaid: 0, absent: 0, manual: 0, cardWarning: 0, sgk: this.number(sgkDays), diff: 0 };
    days.forEach((day) => {
      const status = this.status(day.status);
      if (paidStatuses.has(status)) stats.paid += 1;
      if (status === "G") stats.weekdayPresent += 1;
      if (status === "W") stats.weekendPresent += 1;
      if (["G", "W", "E", "L", "K"].includes(status)) stats.physicalPresent += 1;
      if (status === "Y") stats.annual += 1;
      if (status === "R") stats.report += 1;
      if (status === "M") stats.excuse += 1;
      if (status === "U") stats.unpaid += 1;
      if (status === "I") stats.absent += 1;
      if (status === "K" || this.text(day.reason).includes("KART") || this.text(day.note).includes("Kart")) stats.cardWarning += 1;
      if (day.source && day.source !== "AUTO") stats.manual += 1;
    });
    stats.diff = stats.sgk ? stats.paid - stats.sgk : 0;
    return stats;
  }

  async month(query: AnyRow = {}) {
    await this.ensureSchema();
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    const companyId = this.companyCandidates(query)[0];
    const employees = await this.employees(query);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = `${year}-${String(month).padStart(2, "0")}-31`;
    const attendance = await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, work_date, status, check_in, check_out, note, source, is_manual, early_exit, late_entry, document_id FROM ik_monthly_attendance WHERE main_company_id = ? AND work_date >= ? AND work_date <= ? ORDER BY work_date`, companyId, start, end,
    ) as AnyRow[];
    const latestImport = (await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM ik_sgk_imports WHERE main_company_id = ? AND period_year = ? AND period_month = ? ORDER BY datetime(created_at) DESC LIMIT 1`, companyId, year, month,
    ) as AnyRow[])[0];
    const sgkRows = latestImport ? await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM ik_sgk_rows WHERE import_id = ? ORDER BY full_name`, latestImport.id,
    ) as AnyRow[] : [];
    const sgkByEmployee = new Map<string, AnyRow>();
    sgkRows.forEach((row) => { if (row.employee_id) sgkByEmployee.set(String(row.employee_id), row); });
    const normalizedEmployees = employees.map((employee) => {
      const sgk = sgkByEmployee.get(employee.id);
      return { ...employee, sgkDays: this.number(sgk?.sgk_days), sgkGross: this.number(sgk?.gross), sgkNet: this.number(sgk?.net), sgkHireDate: this.text(sgk?.hire_date), sgkExitDate: this.text(sgk?.exit_date) };
    });
    const employeeIds = employees.map((employee) => employee.id);
    const placeholders = employeeIds.map(() => "?").join(",");
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);
    const periodStartText = `${year}-${String(month).padStart(2, "0")}-01`;
    const periodEndText = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`;
    const leaves = employeeIds.length ? await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, record_type, effect_type, start_date, end_date, day_count, document_path, note FROM hr_leave_records_v2 WHERE employee_id IN (${placeholders}) AND date(start_date) < date(?) AND date(end_date) >= date(?) ORDER BY start_date DESC`,
      ...employeeIds, periodEnd.toISOString(), periodStart.toISOString(),
    ) as AnyRow[] : [];
    const rawAdjustments = employeeIds.length ? await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, CAST(date AS TEXT) as raw_date, adjustment_type, hour_or_day, amount, payroll_effect, note, status
       FROM hr_monthly_adjustments_v2
       WHERE employee_id IN (${placeholders})
       ORDER BY date DESC`,
      ...employeeIds,
    ) as AnyRow[] : [];
    const adjustments = rawAdjustments.filter((row) => {
      const adjustmentDate = this.dateOnly(row.raw_date);
      return adjustmentDate >= periodStartText && adjustmentDate < periodEndText;
    });
    const payroll = await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, salary, road_allowance, overtime_amount, premium_amount, deduction_amount, advance_amount, bank_amount, cash_amount, total_amount, status FROM hr_payrolls_v2 WHERE main_company_id = ? AND year = ? AND month = ?`,
      companyId, year, month,
    ) as AnyRow[];
    const documents = employeeIds.length ? await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, document_type, file_name, file_path, date, status FROM hr_employee_documents WHERE employee_id IN (${placeholders}) ORDER BY date DESC`,
      ...employeeIds,
    ) as AnyRow[] : [];
    const contracts = employeeIds.length ? await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, salary, road_allowance, bank_amount, cash_amount, bank_payment_type, contract_start, contract_end, effective_date, note FROM hr_salary_contracts WHERE employee_id IN (${placeholders}) ORDER BY effective_date DESC`,
      ...employeeIds,
    ) as AnyRow[] : [];
    const logs = await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, action, reason, user_name, created_at FROM ik_monthly_close_logs WHERE main_company_id = ? AND period_year = ? AND period_month = ? ORDER BY datetime(created_at) DESC LIMIT 25`,
      companyId, year, month,
    ) as AnyRow[];
    const close = await this.closeCheck({ ...query, year, month, silent: true });
    const normalizedAttendance = attendance.map((row) => ({ id: row.id, employeeId: row.employee_id, workDate: row.work_date, status: this.status(row.status), checkIn: row.check_in, checkOut: row.check_out, note: row.note, source: row.source, isManual: Boolean(row.is_manual), earlyExit: row.early_exit, lateEntry: row.late_entry, documentId: row.document_id }));
    const resolvedDays = await this.monthlyResolvedDays({ ...query, year, month }, { employees: normalizedEmployees, attendance: normalizedAttendance });
    const resolvedByEmployee = new Map(resolvedDays.map((row) => [row.employeeId, row.days]));
    const quickRows = normalizedEmployees.map((employee) => {
      const days = resolvedByEmployee.get(employee.id) || [];
      const stats = this.employeeMonthStats(days, employee.sgkDays);
      const leaveBalance = this.number(employee.annualLeaveEntitlement) + this.number(employee.annualLeaveCarryover) - stats.annual;
      const needsAction = !employee.cardNo || stats.diff !== 0 || stats.report > 0 || stats.unpaid > 0 || stats.absent > 0 || stats.cardWarning > 0 || leaveBalance < 0;
      return { employeeId: employee.id, fullName: employee.fullName, code: employee.code, department: employee.department, cardNo: employee.cardNo, leaveBalance, needsAction, stats };
    });
    return {
      year, month, employees: normalizedEmployees,
      attendance: normalizedAttendance,
      resolvedDays,
      quickRows,
      sgkImport: latestImport ? { id: latestImport.id, fileName: latestImport.file_name, versionNo: this.number(latestImport.version_no), status: latestImport.status, createdAt: latestImport.created_at } : null,
      sgkRows: sgkRows.map((row) => ({ id: row.id, employeeId: row.employee_id, fullName: row.full_name, identityNo: row.identity_no, personCode: row.person_code, hireDate: row.hire_date, exitDate: row.exit_date, sgkDays: this.number(row.sgk_days), normalEarning: this.number(row.normal_earning), otherEarning: this.number(row.other_earning), gross: this.number(row.gross), sgkBase: this.number(row.sgk_base), sgkPremium: this.number(row.sgk_premium), unemploymentPremium: this.number(row.unemployment_premium), incomeTax: this.number(row.income_tax), stampTax: this.number(row.stamp_tax), specialDeduction: this.number(row.special_deduction), net: this.number(row.net), employerNetCost: this.number(row.employer_net_cost), differenceReason: row.difference_reason || "", source: (() => { try { return JSON.parse(row.raw_json || "{}"); } catch { return {}; } })() })),
      leaves: leaves.map((row) => ({ id: row.id, employeeId: row.employee_id, recordType: row.record_type, effectType: row.effect_type, startDate: this.dateOnly(row.start_date), endDate: this.dateOnly(row.end_date), dayCount: this.number(row.day_count), documentPath: row.document_path, note: row.note })),
      adjustments: adjustments.map((row) => ({ id: row.id, employeeId: row.employee_id, date: this.dateOnly(row.raw_date), adjustmentType: row.adjustment_type, hourOrDay: this.number(row.hour_or_day), amount: this.number(row.amount), payrollEffect: row.payroll_effect, note: row.note, status: row.status })),
      payroll: payroll.map((row) => ({ id: row.id, employeeId: row.employee_id, salary: this.number(row.salary), roadAllowance: this.number(row.road_allowance), overtimeAmount: this.number(row.overtime_amount), premiumAmount: this.number(row.premium_amount), deductionAmount: this.number(row.deduction_amount), advanceAmount: this.number(row.advance_amount), bankAmount: this.number(row.bank_amount), cashAmount: this.number(row.cash_amount), totalAmount: this.number(row.total_amount), status: row.status })),
      documents: documents.map((row) => ({ id: row.id, employeeId: row.employee_id, documentType: row.document_type, fileName: row.file_name, filePath: row.file_path, date: this.dateOnly(row.date), status: row.status })),
      contracts: contracts.map((row) => ({ id: row.id, employeeId: row.employee_id, salary: this.number(row.salary), roadAllowance: this.number(row.road_allowance), bankAmount: this.number(row.bank_amount), cashAmount: this.number(row.cash_amount), paymentType: row.bank_payment_type, startDate: this.dateOnly(row.contract_start || row.effective_date), endDate: this.dateOnly(row.contract_end), note: row.note })),
      closeLogs: logs.map((row) => ({ id: row.id, action: row.action, reason: row.reason, userName: row.user_name, createdAt: row.created_at })),
      checks: close.checks, close,
    };
  }

  async savePersonCard(employeeId: string, body: AnyRow = {}) {
    await this.ensureSchema();
    const employee = await (this.prisma as any).hrMonthlyEmployee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new BadRequestException("Personel bulunamadı.");
    const companyId = this.companyCandidates(body)[0];
    const cardNo = this.text(body.cardNo);
    if (cardNo) {
      const duplicate = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT employee_id FROM ik_person_card_settings WHERE main_company_id = ? AND card_no = ? AND employee_id <> ?`, companyId, cardNo, employeeId,
      ) as AnyRow[])[0];
      if (duplicate) throw new BadRequestException("Bu kart numarası başka bir personele bağlı.");
    }
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO ik_person_card_settings (employee_id, main_company_id, card_no, identity_no, payroll_included, card_source, personel_kodu, exit_date, active_passive, work_type, sgk_follow, payment_type, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(employee_id) DO UPDATE SET card_no=excluded.card_no, identity_no=excluded.identity_no, payroll_included=excluded.payroll_included, card_source=excluded.card_source, personel_kodu=excluded.personel_kodu, exit_date=excluded.exit_date, active_passive=excluded.active_passive, work_type=excluded.work_type, sgk_follow=excluded.sgk_follow, payment_type=excluded.payment_type, note=excluded.note, updated_at=CURRENT_TIMESTAMP`,
      employeeId, companyId, cardNo, this.text(body.identityNo), body.payrollIncluded === false ? 0 : 1,
      this.text(body.cardSource || "TNF"), this.text(body.personelKodu || employee.code || ""),
      this.dateOnly(body.exitDate || ""), this.text(body.activePassive || employee.status || "AKTIF"),
      this.text(body.workType || employee.workType || "AYLIK"), body.sgkFollow === null ? 2 : body.sgkFollow === false ? 0 : 1,
      this.text(body.paymentType || employee.bankPaymentType || "BANKA_ELDEN"), this.text(body.note || employee.note || ""),
    );
    const hireDate = this.dateOnly(body.hireDate || body.startDate || employee.hireDate);
    await (this.prisma as any).hrMonthlyEmployee.update({
      where: { id: employeeId },
      data: {
        fullName: this.text(body.fullName || employee.fullName),
        code: this.text(body.personelKodu || body.code || employee.code) || null,
        title: this.text(body.title ?? employee.title) || null,
        department: this.text(body.department ?? employee.department) || null,
        hireDate: hireDate ? new Date(`${hireDate}T00:00:00.000Z`) : null,
        salary: this.number(body.salary ?? employee.salary),
        roadAllowance: this.number(body.roadAllowance ?? employee.roadAllowance),
        bankAmount: this.number(body.bankAmount ?? employee.bankAmount),
        cashAmount: this.number(body.cashAmount ?? employee.cashAmount),
        annualLeaveEntitlement: this.number(body.annualLeaveEntitlement ?? employee.annualLeaveEntitlement),
        annualLeaveCarryover: this.number(body.annualLeaveCarryover ?? employee.annualLeaveCarryover),
        bankPaymentType: this.text(body.paymentType || employee.bankPaymentType || "BANKA_ELDEN"),
        status: this.text(body.activePassive || employee.status || "AKTIF"),
        note: this.text(body.note ?? employee.note) || null,
      },
    });
    await this.writeAuditLog({
      ...body,
      employeeId,
      actionType: "PERSONEL_KARTI",
      sourceScreen: "Personel Kartı & Sözleşme",
      oldValue: { cardNo: employee.cardNo, identityNo: employee.identityNo },
      newValue: { cardNo, identityNo: this.text(body.identityNo), payrollIncluded: body.payrollIncluded !== false },
      reason: this.text(body.note || "Personel kartı güncellendi"),
    });
    return { ok: true };
  }

  async saveAttendance(body: AnyRow = {}) {
    await this.ensureSchema();
    const employeeId = this.text(body.employeeId);
    const workDate = this.dateOnly(body.workDate);
    const status = this.status(body.status || "G");
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new BadRequestException("Personel ve tarih zorunlu.");
    if (!["G","Y","M","R","U","I","E","L","K","W","-"].includes(status)) throw new BadRequestException("Gecersiz puantaj durumu.");
    const companyId = this.companyCandidates(body)[0];
    const year = Number(workDate.slice(0, 4));
    const month = Number(workDate.slice(5, 7));
    const locked = (await (this.prisma as any).$queryRawUnsafe(
      `SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1`, companyId, year, month,
    ) as AnyRow[])[0];
    if (locked?.is_locked) throw new BadRequestException("Dönem kilitli. Günlük puantaj kaydı değiştirilemez.");
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO ik_monthly_attendance (id, main_company_id, employee_id, work_date, status, check_in, check_out, note, source, is_manual, early_exit, late_entry, document_id, created_by, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(employee_id, work_date) DO UPDATE SET status=excluded.status, check_in=excluded.check_in, check_out=excluded.check_out, note=excluded.note, source=excluded.source, is_manual=excluded.is_manual, early_exit=excluded.early_exit, late_entry=excluded.late_entry, document_id=excluded.document_id, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP`,
      randomUUID(), companyId, employeeId, workDate, status, this.text(body.checkIn), this.text(body.checkOut),
      this.text(body.note), this.text(body.source || "MANUAL"), this.text(body.source || "MANUAL") === "MANUAL" ? 1 : 0,
      this.text(body.earlyExit), this.text(body.lateEntry), this.text(body.documentId), this.text(body.userName || "Sistem"), this.text(body.userName || "Sistem"),
    );
    await this.writeAuditLog({
      ...body,
      employeeId,
      period: `${year}-${String(month).padStart(2, "0")}`,
      actionType: "PUANTAJ_ISTISNA",
      sourceScreen: "Puantaj & İzin",
      newValue: { workDate, status, checkIn: this.text(body.checkIn), checkOut: this.text(body.checkOut), earlyExit: this.text(body.earlyExit), lateEntry: this.text(body.lateEntry) },
      reason: this.text(body.note || body.reason || "Günlük istisna kaydı"),
    });
    return { ok: true };
  }

  private async ensurePeriodWritable(companyId: string, year: number, month: number) {
    const locked = (await (this.prisma as any).$queryRawUnsafe(
      `SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=? LIMIT 1`,
      companyId, year, month,
    ) as AnyRow[])[0];
    if (locked?.is_locked) throw new BadRequestException("Donem kilitli. Gunluk istisna degistirilemez.");
  }

  async deleteException(body: AnyRow = {}) {
    await this.ensureSchema();
    const employeeId = this.text(body.employeeId);
    const workDate = this.dateOnly(body.workDate || body.date);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new BadRequestException("Personel ve tarih zorunlu.");
    const companyId = this.companyCandidates(body)[0];
    await this.ensurePeriodWritable(companyId, Number(workDate.slice(0, 4)), Number(workDate.slice(5, 7)));
    await (this.prisma as any).$executeRawUnsafe(
      `DELETE FROM ik_monthly_attendance WHERE main_company_id=? AND employee_id=? AND work_date=?`,
      companyId, employeeId, workDate,
    );
    await this.writeAuditLog({
      ...body,
      employeeId,
      period: workDate.slice(0, 7),
      actionType: "PUANTAJ_NORMALE_DON",
      sourceScreen: "Puantaj & İzin",
      oldValue: { workDate },
      reason: this.text(body.reason || "Gün otomatik kurala döndürüldü"),
    });
    return { ok: true, message: "Gun normale donduruldu. Hafta ici otomatik G, hafta sonu/resmi tatil otomatik - olarak cozulur." };
  }

  async saveException(body: AnyRow = {}) {
    const status = this.status(body.status || "G");
    const hasDetail = Boolean(this.text(body.checkIn) || this.text(body.checkOut) || this.text(body.earlyExit) || this.text(body.lateEntry) || this.text(body.documentId) || this.text(body.note));
    if ((status === "G" || status === "-") && !hasDetail) return this.deleteException(body);
    return this.saveAttendance({ ...body, status, source: this.text(body.source || "MANUAL") });
  }

  private async getLeavePolicy(query: AnyRow = {}) {
    const companyId = this.companyCandidates(query)[0];
    const row = (await (this.prisma as any).$queryRawUnsafe(`SELECT * FROM ik_leave_counting_policy WHERE main_company_id=? LIMIT 1`, companyId) as AnyRow[])[0];
    let countedWeekdays = [1,2,3,4,5,6];
    try { const parsed = JSON.parse(row?.counted_weekdays_json || "[]"); if (Array.isArray(parsed) && parsed.length) countedWeekdays = parsed.map(Number).filter((day) => day >= 0 && day <= 6); } catch {}
    return { mainCompanyId: companyId, countedWeekdays, excludeOfficialHolidays: row ? Boolean(row.exclude_official_holidays) : true, maxConcurrentDepartment: Math.max(1, this.number(row?.max_concurrent_department || 1)), updatedAt: row?.updated_at || null };
  }

  async saveLeavePolicy(body: AnyRow = {}) {
    await this.ensureSchema();
    const companyId = this.companyCandidates(body)[0];
    const countedWeekdays = [...new Set((Array.isArray(body.countedWeekdays) ? body.countedWeekdays : [1,2,3,4,5,6]).map(Number).filter((day) => day >= 0 && day <= 6))].sort();
    if (!countedWeekdays.length) throw new BadRequestException("En az bir haftalik izin sayim gunu secilmelidir.");
    await (this.prisma as any).$executeRawUnsafe(`INSERT INTO ik_leave_counting_policy (main_company_id,counted_weekdays_json,exclude_official_holidays,max_concurrent_department,updated_by,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(main_company_id) DO UPDATE SET counted_weekdays_json=excluded.counted_weekdays_json,exclude_official_holidays=excluded.exclude_official_holidays,max_concurrent_department=excluded.max_concurrent_department,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`, companyId, JSON.stringify(countedWeekdays), body.excludeOfficialHolidays === false ? 0 : 1, Math.max(1, this.number(body.maxConcurrentDepartment || 1)), this.text(body.userName || "Sistem"));
    await this.writeAuditLog({ ...body, mainCompanyId: companyId, actionType: "IZIN_GUN_POLITIKASI", sourceScreen: "Yillik Izin Genel Kontrol", newValue: { countedWeekdays, excludeOfficialHolidays: body.excludeOfficialHolidays !== false, maxConcurrentDepartment: Math.max(1, this.number(body.maxConcurrentDepartment || 1)) }, reason: this.text(body.reason || "Izin gun sayim politikasi guncellendi") });
    return { ok: true, policy: await this.getLeavePolicy(body) };
  }

  private leaveDateList(startDate: string, endDate: string) {
    const rows: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00.000Z`), end = new Date(`${endDate}T00:00:00.000Z`);
    while (cursor <= end && rows.length <= 370) { rows.push(cursor.toISOString().slice(0,10)); cursor.setUTCDate(cursor.getUTCDate()+1); }
    return rows;
  }

  async previewLeave(body: AnyRow = {}) {
    await this.ensureSchema();
    const companyId = this.companyCandidates(body)[0], employeeId = this.text(body.employeeId), startDate = this.dateOnly(body.startDate), endDate = this.dateOnly(body.endDate || body.startDate);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) throw new BadRequestException("Personel ile gecerli baslangic ve bitis tarihleri zorunludur.");
    const allDates = this.leaveDateList(startDate,endDate); if (!allDates.length || allDates.length > 370) throw new BadRequestException("Izin araligi en fazla 370 gun olabilir.");
    const employees = await this.employees(body), employee = employees.find((row: AnyRow) => row.id === employeeId); if (!employee) throw new BadRequestException("Personel bulunamadi.");
    const policy = await this.getLeavePolicy(body), holidays = new Set<string>();
    for (const year of [...new Set(allDates.map((date)=>Number(date.slice(0,4))))]) { const rows = await this.holidaysForYear(year); rows.forEach((date)=>holidays.add(date)); }
    const countedDates: string[] = [], excludedDates: AnyRow[] = [];
    for (const date of allDates) { const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay(); if (!policy.countedWeekdays.includes(weekday)) excludedDates.push({ date, reason: weekday===0?"Pazar / haftalik tatil":"Sirket izin sayim gunu degil" }); else if (policy.excludeOfficialHolidays && holidays.has(date)) excludedDates.push({ date, reason:"Resmi tatil" }); else countedDates.push(date); }
    let returnDate = endDate; for(let i=0;i<14;i++){ const next=new Date(`${returnDate}T00:00:00.000Z`); next.setUTCDate(next.getUTCDate()+1); returnDate=next.toISOString().slice(0,10); const weekday=next.getUTCDay(); if(policy.countedWeekdays.includes(weekday)&&(!policy.excludeOfficialHolidays||!holidays.has(returnDate))) break; }
    const overlaps = await (this.prisma as any).$queryRawUnsafe(`SELECT id,employee_id,start_date,end_date,status,record_type FROM ik_leave_plans WHERE main_company_id=? AND status<>'CANCELLED' AND start_date<=? AND end_date>=? AND id<>?`, companyId,endDate,startDate,this.text(body.id || "")) as AnyRow[];
    const employeeMap = new Map(employees.map((row: AnyRow)=>[row.id,row]));
    const sameDepartmentCount = overlaps.filter((row) => { const other: any = employeeMap.get(row.employee_id); return row.employee_id !== employeeId && other?.department && other.department === employee.department; }).length;
    const departmentLimitExceeded = sameDepartmentCount + 1 > policy.maxConcurrentDepartment;
    const conflicts: AnyRow[] = overlaps.map((row)=>{ const other:any=employeeMap.get(row.employee_id); const same=row.employee_id===employeeId, sameDepartment=other?.department&&other.department===employee.department; return { id:row.id,employeeId:row.employee_id,fullName:other?.fullName||"-",department:other?.department||"",startDate:this.dateOnly(row.start_date),endDate:this.dateOnly(row.end_date),status:row.status,severity:same?"CRITICAL":sameDepartment&&departmentLimitExceeded?"WARNING":"INFO",message:same?"Personelin ayni tarihlerde baska izin kaydi var.":sameDepartment&&departmentLimitExceeded?`${employee.department} bolumunde ayni anda izinli personel siniri asiliyor.`:"Baska personelin izin planiyla tarih kesisiyor."}; });
    const annualUsedRows = await (this.prisma as any).$queryRawUnsafe(`SELECT COALESCE(SUM(day_count),0) as total FROM hr_leave_records_v2 WHERE employee_id=? AND UPPER(record_type) LIKE '%YILLIK%'`,employeeId) as AnyRow[];
    const annualRight=this.number(employee.annualLeaveEntitlement)+this.number(employee.annualLeaveCarryover), annualUsed=this.number(annualUsedRows[0]?.total), balanceBefore=annualRight-annualUsed, balanceAfter=balanceBefore-countedDates.length;
    return { ok:true,employee,policy,startDate,endDate,returnDate,calendarDays:allDates.length,countedDays:countedDates.length,countedDates,excludedDates,conflicts,hasCriticalConflict:conflicts.some((row)=>row.severity==="CRITICAL"),hasDepartmentWarning:conflicts.some((row)=>row.severity==="WARNING"),annualRight,annualUsed,balanceBefore,balanceAfter };
  }

  async saveLeaveRecord(body: AnyRow = {}) {
    await this.ensureSchema();
    const preview = await this.previewLeave(body);
    if (preview.hasCriticalConflict) throw new BadRequestException("Personelin secilen tarihlerde baska bir izin kaydi var.");
    if (preview.hasDepartmentWarning && body.allowDepartmentConflict !== true) throw new BadRequestException("Ayni bolumde izin cakismasi var. Kontrol edip onaylayiniz.");
    const employeeId = this.text(body.employeeId), startDate = preview.startDate, endDate = preview.endDate;
    const companyId = this.companyCandidates(body)[0];
    const recordType = this.text(body.recordType || "Yillik izin");
    const requestedStatus = this.text(body.status || (startDate > new Date().toISOString().slice(0, 10) ? "PLANNED" : "TAKEN")).toUpperCase();
    const planStatus = ["PLANNED", "APPROVED", "TAKEN"].includes(requestedStatus) ? requestedStatus : "PLANNED";
    const planId = this.text(body.id) || randomUUID(), marker = `ik-leave-plan:${planId}`;
    const attendanceStatus = this.norm(recordType).includes("YILLIK") ? "Y" : this.norm(recordType).includes("RAPOR") ? "R" : this.norm(recordType).includes("UCRETSIZ") ? "U" : "M";
    await (this.prisma as any).$executeRawUnsafe(`DELETE FROM hr_leave_records_v2 WHERE document_path=?`, marker);
    await (this.prisma as any).$executeRawUnsafe(`DELETE FROM ik_monthly_attendance WHERE main_company_id=? AND employee_id=? AND document_id=?`, companyId, employeeId, planId);
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO ik_leave_plans (id,main_company_id,employee_id,record_type,start_date,end_date,return_date,counted_days,excluded_json,status,document_no,note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,record_type=excluded.record_type,start_date=excluded.start_date,end_date=excluded.end_date,return_date=excluded.return_date,counted_days=excluded.counted_days,excluded_json=excluded.excluded_json,status=excluded.status,document_no=excluded.document_no,note=excluded.note,updated_at=CURRENT_TIMESTAMP`,
      planId, companyId, employeeId, recordType, startDate, endDate, preview.returnDate, preview.countedDays, JSON.stringify(preview.excludedDates), planStatus, this.text(body.documentNo), this.text(body.note), this.text(body.userName || "Sistem"),
    );
    let recordId: string | null = null;
    if (planStatus !== "PLANNED") {
      for (const period of [...new Set(preview.countedDates.map((date: string) => date.slice(0, 7)))]) await this.ensurePeriodWritable(companyId, Number(period.slice(0, 4)), Number(period.slice(5, 7)));
      recordId = randomUUID();
      await (this.prisma as any).$executeRawUnsafe(
        `INSERT INTO hr_leave_records_v2 (id,employee_id,record_type,effect_type,start_date,end_date,day_count,document_path,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        recordId, employeeId, recordType, this.text(body.effectType || body.wageEffect || "Ucretli"), `${startDate}T00:00:00.000Z`, `${endDate}T00:00:00.000Z`, preview.countedDays, marker, this.text(body.note),
      );
      for (const workDate of preview.countedDates) await this.saveAttendance({ ...body, mainCompanyId: companyId, employeeId, workDate, status: attendanceStatus, documentId: planId, source: "LEAVE_PLAN" });
    }
    await this.writeAuditLog({ ...body, mainCompanyId: companyId, employeeId, period: startDate.slice(0, 7), actionType: planStatus === "PLANNED" ? "IZIN_PLAN_KAYDI" : "IZIN_ONAY_KAYDI", sourceScreen: "Yillik Izin Genel Kontrol", newValue: { planId, recordId, recordType, status: planStatus, startDate, endDate, countedDays: preview.countedDays }, reason: this.text(body.note || `${recordType} kaydi`) });
    return { ok: true, planId, recordId, status: planStatus, ...preview, message: planStatus === "PLANNED" ? "Izin plani kaydedildi." : `${recordType} resmi izin kaydi olusturuldu.` };
  }

  async cancelLeavePlan(body: AnyRow = {}) {
    await this.ensureSchema();
    const companyId = this.companyCandidates(body)[0], id = this.text(body.id);
    if (!id) throw new BadRequestException("Izin kaydi secilmelidir.");
    const plan = (await (this.prisma as any).$queryRawUnsafe(`SELECT * FROM ik_leave_plans WHERE id=? AND main_company_id=? LIMIT 1`, id, companyId) as AnyRow[])[0];
    if (!plan) throw new BadRequestException("Izin kaydi bulunamadi.");
    await (this.prisma as any).$executeRawUnsafe(`UPDATE ik_leave_plans SET status='CANCELLED',note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, this.text(body.reason || plan.note || "Iptal edildi"), id);
    await (this.prisma as any).$executeRawUnsafe(`DELETE FROM hr_leave_records_v2 WHERE document_path=?`, `ik-leave-plan:${id}`);
    await (this.prisma as any).$executeRawUnsafe(`DELETE FROM ik_monthly_attendance WHERE main_company_id=? AND employee_id=? AND document_id=?`, companyId, plan.employee_id, id);
    await this.writeAuditLog({ ...body, mainCompanyId: companyId, employeeId: plan.employee_id, period: this.dateOnly(plan.start_date).slice(0, 7), actionType: "IZIN_IPTAL", sourceScreen: "Yillik Izin Genel Kontrol", oldValue: plan, reason: this.text(body.reason || "Izin kaydi iptal edildi") });
    return { ok: true, message: "Izin kaydi iptal edildi ve puantaj etkisi geri alindi." };
  }

  async leaveCenter(query: AnyRow = {}) {
    await this.ensureSchema();
    const companyId = this.companyCandidates(query)[0], now = new Date(), defaultFrom = `${now.getFullYear() - 1}-01-01`, defaultTo = `${now.getFullYear() + 1}-12-31`;
    const from = this.dateOnly(query.from || defaultFrom), to = this.dateOnly(query.to || defaultTo), employees = await this.employees(query), policy = await this.getLeavePolicy(query);
    const rows = await (this.prisma as any).$queryRawUnsafe(`SELECT * FROM ik_leave_plans WHERE main_company_id=? AND start_date<=? AND end_date>=? ORDER BY start_date ASC`, companyId, to, from) as AnyRow[];
    const employeeMap = new Map(employees.map((row: AnyRow) => [row.id, row]));
    const managedPlans = rows.map((row) => { const employee: any = employeeMap.get(row.employee_id); let excludedDates: AnyRow[] = []; try { excludedDates = JSON.parse(row.excluded_json || "[]"); } catch {} return { id: row.id, employeeId: row.employee_id, fullName: employee?.fullName || "-", code: employee?.code || "", department: employee?.department || "", title: employee?.title || "", recordType: row.record_type, startDate: this.dateOnly(row.start_date), endDate: this.dateOnly(row.end_date), returnDate: this.dateOnly(row.return_date), countedDays: this.number(row.counted_days), excludedDates, status: row.status, documentNo: row.document_no || "", note: row.note || "", createdAt: row.created_at, updatedAt: row.updated_at, legacy: false }; });
    const legacyRows = await (this.prisma as any).$queryRawUnsafe(`SELECT * FROM hr_leave_records_v2 WHERE date(start_date)<=date(?) AND date(end_date)>=date(?) AND (document_path IS NULL OR document_path NOT LIKE 'ik-leave-plan:%') ORDER BY start_date ASC`, to, from) as AnyRow[];
    const legacyPlans = legacyRows.filter((row) => employeeMap.has(row.employee_id)).map((row) => { const employee: any = employeeMap.get(row.employee_id), endDate = this.dateOnly(row.end_date), returnDateValue = new Date(`${endDate}T00:00:00.000Z`); returnDateValue.setUTCDate(returnDateValue.getUTCDate() + 1); return { id: `legacy:${row.id}`, employeeId: row.employee_id, fullName: employee?.fullName || "-", code: employee?.code || "", department: employee?.department || "", title: employee?.title || "", recordType: row.record_type, startDate: this.dateOnly(row.start_date), endDate, returnDate: returnDateValue.toISOString().slice(0, 10), countedDays: this.number(row.day_count), excludedDates: [], status: "TAKEN", documentNo: "", note: row.note || "", createdAt: row.created_at, updatedAt: row.created_at, legacy: true }; });
    const plans = [...managedPlans, ...legacyPlans].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const active = plans.filter((row) => row.status !== "CANCELLED"), conflicts: AnyRow[] = [];
    for (let i = 0; i < active.length; i += 1) for (let j = i + 1; j < active.length; j += 1) { const a = active[i], b = active[j], overlapStart = a.startDate > b.startDate ? a.startDate : b.startDate, overlapEnd = a.endDate < b.endDate ? a.endDate : b.endDate; if (overlapStart <= overlapEnd && (a.employeeId === b.employeeId || (a.department && a.department === b.department))) { const departmentCount = active.filter((item) => item.department === a.department && item.startDate <= overlapEnd && item.endDate >= overlapStart).length; if (a.employeeId === b.employeeId || departmentCount > policy.maxConcurrentDepartment) conflicts.push({ id: `${a.id}:${b.id}`, severity: a.employeeId === b.employeeId ? "CRITICAL" : "WARNING", department: a.department || b.department, startDate: overlapStart, endDate: overlapEnd, people: [a.fullName, b.fullName], message: a.employeeId === b.employeeId ? "Ayni personelin cakisik izin kayitlari var." : `${a.department} bolumunde ayni anda izinli personel siniri asiliyor.` }); } }
    return { policy, employees, plans, conflicts, range: { from, to } };
  }

  async quickList(query: AnyRow = {}) {
    const data = await this.month(query);
    const filter = this.text(query.filter || "action");
    let rows = Array.isArray(data.quickRows) ? data.quickRows : [];
    if (filter === "action") rows = rows.filter((row: AnyRow) => row.needsAction);
    if (filter === "all") rows = rows;
    return { year: data.year, month: data.month, rows, summary: { total: data.quickRows.length, action: data.quickRows.filter((row: AnyRow) => row.needsAction).length } };
  }

  async personCalendar(employeeId: string, query: AnyRow = {}) {
    const data = await this.month(query);
    const employee = data.employees.find((row: AnyRow) => row.id === employeeId);
    if (!employee) throw new BadRequestException("Personel bulunamadi.");
    const days = data.resolvedDays.find((row: AnyRow) => row.employeeId === employeeId)?.days || [];
    const history = data.attendance.filter((row: AnyRow) => row.employeeId === employeeId);
    const quick = data.quickRows.find((row: AnyRow) => row.employeeId === employeeId);
    return { year: data.year, month: data.month, employee, days, history, quick };
  }

  async bulkPreview(body: AnyRow = {}) {
    await this.ensureSchema();
    const year = Number(body.year || new Date().getFullYear());
    const month = Number(body.month || new Date().getMonth() + 1);
    const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.map((id) => this.text(id)).filter(Boolean) : [];
    const start = Math.max(1, Number(body.startDay || body.start || 1));
    const end = Math.min(new Date(year, month, 0).getDate(), Number(body.endDay || body.end || start));
    const status = this.status(body.status || "Y");
    if (!employeeIds.length) throw new BadRequestException("Toplu islem icin personel secilmeli.");
    const rows: AnyRow[] = [];
    for (const employeeId of employeeIds) {
      for (let day = start; day <= end; day += 1) {
        const workDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const autoDay = await this.resolveMonthlyDay(employeeId, workDate, body);
        rows.push({ employeeId, workDate, oldStatus: autoDay.status, newStatus: status, skip: status === "Y" && autoDay.status === "-" });
      }
    }
    return { ok: true, year, month, rows, count: rows.filter((row) => !row.skip).length, message: `${rows.filter((row) => !row.skip).length} gun toplu islem icin hazir.` };
  }

  async bulkConfirm(body: AnyRow = {}) {
    const preview = Array.isArray(body.rows) ? { rows: body.rows } : await this.bulkPreview(body);
    let saved = 0;
    for (const row of preview.rows) {
      if (row.skip) continue;
      await this.saveException({ ...body, employeeId: row.employeeId, workDate: row.workDate, status: row.newStatus || body.status, note: body.note || row.note || "Toplu istisna" });
      saved += 1;
    }
    return { ok: true, count: saved, message: `${saved} gunluk istisna kaydedildi.` };
  }

  async exceptionHistory(query: AnyRow = {}) {
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    const companyId = this.companyCandidates(query)[0];
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = `${year}-${String(month).padStart(2, "0")}-31`;
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id as employeeId, work_date as workDate, status, note, source, created_by as createdBy, updated_by as updatedBy, updated_at as updatedAt FROM ik_monthly_attendance WHERE main_company_id=? AND work_date>=? AND work_date<=? ORDER BY work_date DESC, updated_at DESC`,
      companyId, start, end,
    ) as AnyRow[];
    return { year, month, rows: rows.map((row) => ({ ...row, status: this.status(row.status) })) };
  }

  async controlMatrix(query: AnyRow = {}) {
    const data = await this.month(query);
    return { year: data.year, month: data.month, employees: data.employees, resolvedDays: data.resolvedDays, quickRows: data.quickRows, checks: data.checks };
  }

  private headerIndex(headers: string[], alternatives: string[]) {
    for (const word of alternatives) { const index = headers.findIndex((item) => item.includes(word)); if (index >= 0) return index; }
    return -1;
  }

  private payrollWorkbook(file: any) {
    try {
      const workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: true, raw: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : null;
      if (!sheet) throw new Error("Ilk sayfa bulunamadi.");
      const values = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: true });
      return values.map((row) => Array.isArray(row) ? row : []);
    } catch (error: any) {
      throw new BadRequestException(`Bordro dosyasi okunamadi. XLS veya XLSX dosyasi secin. ${this.text(error?.message)}`);
    }
  }

  private payrollDate(value: any) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const match = this.text(value).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
  }

  private payrollPeriod(values: any[][], fallbackYear: number, fallbackMonth: number) {
    const heading = this.norm(values.slice(0, 12).flat().map((value) => this.text(value)).join(" "));
    const months = ["OCAK", "SUBAT", "MART", "NISAN", "MAYIS", "HAZIRAN", "TEMMUZ", "AGUSTOS", "EYLUL", "EKIM", "KASIM", "ARALIK"];
    const monthIndex = months.findIndex((name) => heading.includes(name));
    const yearMatch = heading.match(/\b(20\d{2})\b/);
    return { year: yearMatch ? Number(yearMatch[1]) : fallbackYear, month: monthIndex >= 0 ? monthIndex + 1 : fallbackMonth };
  }

  async previewSgk(file: any, body: AnyRow = {}) {
    await this.ensureSchema();
    if (!file?.buffer) throw new BadRequestException("SGK bordro dosyasi secilmedi.");
    const requestedYear = Number(body.year || new Date().getFullYear()), requestedMonth = Number(body.month || new Date().getMonth() + 1), companyId = this.companyCandidates(body)[0];
    const values = this.payrollWorkbook(file);
    const detectedPeriod = this.payrollPeriod(values, requestedYear, requestedMonth);
    const year = detectedPeriod.year, month = detectedPeriod.month;
    let headerRow = 0, headers: string[] = [];
    for (let r = 0; r < Math.min(30, values.length); r++) {
      const row = values[r].map((value) => this.norm(value?.text ?? value));
      if (row.some((item) => item.includes("ADI SOYADI")) && row.some((item) => item.includes("GUN"))) { headerRow = r; headers = row; break; }
    }
    if (!headers.length) throw new BadRequestException("Bordro baslik satiri bulunamadi. 'ADI SOYADI' ve 'GUN' kolonlari olmali.");
    const nameCol=this.headerIndex(headers,["ADI SOYADI"]),hireCol=this.headerIndex(headers,["GIRIS TARIHI"]),exitCol=this.headerIndex(headers,["CIKIS TARIHI"]),tcCol=this.headerIndex(headers,["T.C. KIMLIK","TC KIMLIK"]),codeCol=this.headerIndex(headers,["SSK SICIL","SICIL NO","PERSONEL KOD"]),dayCol=this.headerIndex(headers,["GUN"]),normalCol=this.headerIndex(headers,["NORMAL KAZANC"]),otherCol=this.headerIndex(headers,["DIGER KAZANC"]),grossCol=this.headerIndex(headers,["TOPLAM KAZANC"]),sgkBaseCol=this.headerIndex(headers,["SSK MATRAH","SGK MATRAH"]),sgkPremiumCol=this.headerIndex(headers,["SSK PRIMI","SGK PRIMI"]),unemploymentCol=this.headerIndex(headers,["ISSIZLIK PRIMI"]),incomeTaxCol=this.headerIndex(headers,["GELIR VERGISI"]),stampTaxCol=this.headerIndex(headers,["DAMGA VERGISI"]),specialDeductionCol=this.headerIndex(headers,["OZEL KESINTI"]),netCol=this.headerIndex(headers,["NET ISTIHKAK"]);
    if (nameCol < 0 || dayCol < 0) throw new BadRequestException("Ad Soyad veya Gun kolonu bulunamadi.");
    const employees = await this.employees(body);
    const rows: AnyRow[] = [];
    let matched=0, excluded=0;
    const metaText=values.slice(0,10).flat().map((value)=>this.text(value));
    const workplace=this.text(metaText.find((value)=>this.norm(value).startsWith("ISYERI:"))||"").replace(/^.*?:\s*/,"");
    const workplaceNo=this.text(metaText.find((value)=>this.norm(value).includes("ISYERI S.NO"))||"").replace(/^.*?:\s*/,"");
    for(let r=headerRow+1;r<values.length;r++){
      const vals=values[r];
      const fullName=this.text(vals[nameCol]); const sgkDays=this.number(vals[dayCol]);
      const identityNo=this.text(vals[tcCol]).replace(/\D/g,"");
      if(!fullName || identityNo.length!==11 || this.norm(fullName).includes("LISTELENEN")) continue;
      const personCode=this.text(vals[codeCol]);
      const found=employees.find((employee)=> (identityNo && employee.identityNo===identityNo) || (personCode && employee.code===personCode) || this.norm(employee.fullName)===this.norm(fullName));
      const employeeId=found?.payrollIncluded===false ? null : found?.id || null;
      if(employeeId) matched++; else excluded++;
      rows.push({ sourceFile:this.text(file.originalname),workplace,workplaceNo,rowNumber:r+1,selected:Boolean(employeeId),employeeId,fullName,identityNo,personCode,hireDate:this.payrollDate(vals[hireCol]),exitDate:this.payrollDate(vals[exitCol]),sgkDays,normalEarning:this.number(vals[normalCol]),otherEarning:this.number(vals[otherCol]),gross:this.number(vals[grossCol>=0?grossCol:normalCol]),sgkBase:this.number(vals[sgkBaseCol]),sgkPremium:this.number(vals[sgkPremiumCol]),unemploymentPremium:this.number(vals[unemploymentCol]),incomeTax:this.number(vals[incomeTaxCol]),stampTax:this.number(vals[stampTaxCol]),specialDeduction:this.number(vals[specialDeductionCol]),net:this.number(vals[netCol]),status:found?.payrollIncluded===false?"DIS_HARIC":employeeId?"ESLESTI":"ESLESMEDI" });
    }
    return {ok:true,preview:true,year,month,requestedYear,requestedMonth,periodMatches:year===requestedYear&&month===requestedMonth,workplace,workplaceNo,mainCompanyId:companyId,fileName:this.text(file.originalname),rows,count:rows.length,matched,excluded,message:`${rows.length} SGK satiri okundu. ${matched} sirket personeli eslesti; ${excluded} satir haric/eslesmeyen havuzda.`};
  }

  async confirmSgk(body: AnyRow = {}) {
    await this.ensureSchema();
    const year = Number(body.year || new Date().getFullYear()), month = Number(body.month || new Date().getMonth() + 1), companyId = this.companyCandidates(body)[0];
    const rawRows = Array.isArray(body.rows) ? body.rows.filter((row: AnyRow) => row.selected !== false) : [];
    const grouped = new Map<string, AnyRow>();
    for (const row of rawRows) {
      const key = this.text(row.employeeId) || `DIS|${this.text(row.identityNo)}|${this.norm(row.fullName)}`;
      const current = grouped.get(key);
      if (!current) { grouped.set(key, { ...row, sourceRows: [row] }); continue; }
      ["sgkDays","normalEarning","otherEarning","gross","sgkBase","sgkPremium","unemploymentPremium","incomeTax","stampTax","specialDeduction","employerSgk","employerUnemployment","sgkIncentive","employerNetCost","net"].forEach((field) => {
        current[field] = this.number(current[field]) + this.number(row[field]);
      });
      current.sourceRows.push(row);
      current.sourceFile = [...new Set(current.sourceRows.map((item: AnyRow) => this.text(item.sourceFile)).filter(Boolean))].join(" + ");
      current.workplace = [...new Set(current.sourceRows.map((item: AnyRow) => this.text(item.workplace)).filter(Boolean))].join(" + ");
      current.workplaceNo = [...new Set(current.sourceRows.map((item: AnyRow) => this.text(item.workplaceNo)).filter(Boolean))].join(" + ");
    }
    const rows = [...grouped.values()];
    if (!rows.length) throw new BadRequestException("Onaylanacak SGK ön analiz satırı bulunamadı.");
    const importId=randomUUID();
    const versionRows = await (this.prisma as any).$queryRawUnsafe(`SELECT COUNT(*) as count FROM ik_sgk_imports WHERE main_company_id=? AND period_year=? AND period_month=?`, companyId, year, month) as AnyRow[];
    const versionNo = this.number(versionRows[0]?.count) + 1;
    await (this.prisma as any).$executeRawUnsafe(`INSERT INTO ik_sgk_imports (id,main_company_id,period_year,period_month,file_name,version_no,status) VALUES (?,?,?,?,?,?,?)`,importId,companyId,year,month,this.text(body.fileName || "SGK_Excel.xlsx"),versionNo,"CONFIRMED");
    let matched=0, excluded=0;
    for(const row of rows){
      const employeeId=this.text(row.employeeId) || null;
      if(employeeId) matched++; else excluded++;
      await (this.prisma as any).$executeRawUnsafe(
        `INSERT INTO ik_sgk_rows (id,import_id,employee_id,full_name,identity_no,person_code,hire_date,exit_date,sgk_days,normal_earning,other_earning,total_earning,sgk_base,sgk_premium,unemployment_premium,income_tax,stamp_tax,special_deduction,employer_sgk,employer_unemployment,sgk_incentive,gross,net,employer_net_cost,difference_reason,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        randomUUID(),importId,employeeId,this.text(row.fullName),this.text(row.identityNo),this.text(row.personCode),this.text(row.hireDate),this.text(row.exitDate),this.number(row.sgkDays),this.number(row.normalEarning),this.number(row.otherEarning),this.number(row.gross),this.number(row.sgkBase),this.number(row.sgkPremium),this.number(row.unemploymentPremium),this.number(row.incomeTax),this.number(row.stampTax),this.number(row.specialDeduction),this.number(row.employerSgk),this.number(row.employerUnemployment),this.number(row.sgkIncentive),this.number(row.gross),this.number(row.net),this.number(row.employerNetCost),this.text(row.differenceReason),JSON.stringify(row),
      );
    }
    return { ok:true, importId, versionNo, count: rows.length, matched, excluded, message:`${rows.length} SGK satırı ${versionNo}. versiyon olarak onaylandı.` };
  }

  async importSgk(file: any, body: AnyRow = {}) {
    const preview = await this.previewSgk(file, body);
    return this.confirmSgk({ ...body, rows: preview.rows, fileName: preview.fileName });
  }

  async previewCard(file: any, body: AnyRow = {}) {
    await this.ensureSchema();
    if (!file?.buffer) throw new BadRequestException("Kart dosyası seçilmedi.");
    const companyId=this.companyCandidates(body)[0]; const year=Number(body.year||new Date().getFullYear()), month=Number(body.month||new Date().getMonth()+1);
    const employees=await this.employees(body); const byCard=new Map<string, AnyRow>(employees.filter(x=>x.cardNo).map(x=>[x.cardNo,x]));
    const text=file.buffer.toString("utf8").replace(/^\uFEFF/,"");
    const movements=new Map<string, AnyRow[]>();
    const unmatched: AnyRow[] = [];
    for(const rawLine of text.split(/\r?\n/)){
      const parts=rawLine.trim().split(/[;,\t]/); if(parts.length<3) continue;
      const cardNo=this.text(parts[0]); const match=this.text(parts[1]).match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/); const time=this.text(parts[2]).match(/\d{1,2}:\d{2}/)?.[0];
      const employee = byCard.get(cardNo);
      if(!match || !time || !employee) { unmatched.push({ cardNo, rawLine, reason: !employee ? "Kart no personel ile eşleşmedi." : "Tarih veya saat okunamadı." }); continue; }
      const year=match[3].length===2?2000+Number(match[3]):Number(match[3]); const date=`${year}-${String(match[2]).padStart(2,"0")}-${String(match[1]).padStart(2,"0")}`; const key=`${employee.id}|${date}`;
      movements.set(key,[...(movements.get(key)||[]),{time,employee,date}]);
    }
    const importId=randomUUID();
    await (this.prisma as any).$executeRawUnsafe(`INSERT INTO ik_card_imports (id,main_company_id,period_year,period_month,file_name,status) VALUES (?,?,?,?,?,?)`, importId, companyId, year, month, this.text(file.originalname), "PREVIEW");
    const rows: AnyRow[] = [];
    for(const list of movements.values()){
      list.sort((a,b)=>a.time.localeCompare(b.time)); const first=list[0], last=list[list.length-1];
      const row = {
        employeeId:first.employee.id, fullName:first.employee.fullName, cardNo:first.employee.cardNo, workDate:first.date,
        checkIn:first.time, checkOut:list.length>1?last.time:"", status:"G",
        warning:list.length===1?"Eksik giriş/çıkış hareketi":list.length>2?"Aynı gün birden fazla hareket var":"",
      };
      rows.push(row);
      await (this.prisma as any).$executeRawUnsafe(`INSERT INTO ik_card_import_rows (id,import_id,employee_id,full_name,card_no,work_date,check_in,check_out,warning,raw_line) VALUES (?,?,?,?,?,?,?,?,?,?)`, randomUUID(), importId, row.employeeId, row.fullName, row.cardNo, row.workDate, row.checkIn, row.checkOut, row.warning, JSON.stringify(list.map((item)=>item.time)));
    }
    for (const row of unmatched) {
      await (this.prisma as any).$executeRawUnsafe(`INSERT INTO ik_card_import_rows (id,import_id,card_no,warning,raw_line) VALUES (?,?,?,?,?)`, randomUUID(), importId, row.cardNo, row.reason, row.rawLine);
    }
    return {ok:true,preview:true,importId,mainCompanyId:companyId,fileName:this.text(file.originalname),rows,unmatched,count:rows.length,message:`${rows.length} kart günü ön kontrol havuzuna alındı. ${unmatched.length} satır eşleşmedi.`};
  }

  async confirmCard(body: AnyRow = {}) {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new BadRequestException("Onaylanacak kart hareketi bulunamadı.");
    const companyId=this.companyCandidates(body)[0];
    let imported=0;
    for(const row of rows){
      await this.saveAttendance({mainCompanyId:companyId,employeeId:row.employeeId,workDate:row.workDate,status:row.status||"G",checkIn:row.checkIn,checkOut:row.checkOut,note:row.warning || `Kart dosyası: ${this.text(body.fileName)}`,source:"CARD"});
      imported++;
    }
    if (body.importId) await (this.prisma as any).$executeRawUnsafe(`UPDATE ik_card_imports SET status='CONFIRMED' WHERE id=?`, this.text(body.importId));
    return {ok:true,message:`${imported} kart günü onaylanarak puantaja işlendi.`};
  }

  async importCard(file: any, body: AnyRow = {}) {
    const preview = await this.previewCard(file, body);
    return this.confirmCard({ ...body, rows: preview.rows, fileName: preview.fileName });
  }

  private payrollPolicy() {
    return {
      roadByActualPresence: true,
      overtimeWeekdayMultiplier: 1.5,
      overtimeWeekendMultiplier: 2,
      defaultOvertimeBase: 225,
      advanceFirstFromCash: true,
    };
  }

  async payrollCalculation(query: AnyRow = {}) {
    await this.ensureSchema();
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    const companyId = this.companyCandidates(query)[0];
    const data = await this.month({ ...query, year, month });
    const policy = this.payrollPolicy();
    const adjustmentsByEmployee = new Map<string, AnyRow[]>();
    data.adjustments.forEach((row: AnyRow) => adjustmentsByEmployee.set(row.employeeId, [...(adjustmentsByEmployee.get(row.employeeId) || []), row]));
    const overrideRows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM ik_payroll_overrides WHERE main_company_id=? AND period_year=? AND period_month=?`,
      companyId, year, month,
    ) as AnyRow[];
    const overrides = new Map(overrideRows.map((row) => [row.employee_id, row]));
    const lines = data.employees.filter((employee: AnyRow) => employee.payrollIncluded !== false).map((employee: AnyRow) => {
      const days = data.resolvedDays.find((row: AnyRow) => row.employeeId === employee.id)?.days || [];
      const stats = this.employeeMonthStats(days, employee.sgkDays);
      const ownAdjustments = adjustmentsByEmployee.get(employee.id) || [];
      const salary = this.number(employee.salary);
      const road = this.number(employee.roadAllowance);
      const followsSgk = employee.sgkFollow === true;
      const cutDays = followsSgk ? stats.unpaid + stats.absent + stats.report : 0;
      const salaryCut = Math.round((salary / 30) * cutDays * 100) / 100;
      const salaryPay = Math.max(0, salary - salaryCut);
      const roadPay = !followsSgk
        ? road
        : policy.roadByActualPresence
          ? Math.max(0, Math.round((road - (road / 30) * cutDays) * 100) / 100)
          : road;
      const roadCut = Math.max(0, road - roadPay);
      const overtimeAmount = ownAdjustments.filter((row) => this.isOvertimeType(row.adjustmentType)).reduce((sum, row) => sum + this.number(row.amount), 0);
      const premiumAmount = ownAdjustments.filter((row) => this.isPremiumType(row.adjustmentType)).reduce((sum, row) => sum + this.number(row.amount), 0);
      const advanceAmount = ownAdjustments.filter((row) => this.isAdvanceType(row.adjustmentType)).reduce((sum, row) => sum + this.number(row.amount), 0);
      const deductionAmount = ownAdjustments.filter((row) => this.isDeductionType(row.adjustmentType)).reduce((sum, row) => sum + this.number(row.amount), 0);
      const grossPay = Math.max(0, salaryPay + roadPay + overtimeAmount + premiumAmount - advanceAmount - deductionAmount);
      const officialPayrollNet = followsSgk ? this.number(employee.sgkNet) : 0;
      const plannedBank = officialPayrollNet > 0 ? officialPayrollNet : this.number(employee.bankAmount);
      const plannedCash = this.number(employee.cashAmount);
      const paymentType = this.norm(employee.paymentType || "BANKA_ELDEN");
      const onlyCash = officialPayrollNet <= 0 && (paymentType.includes("SADECE ELDEN") || paymentType.includes("SADECE_ELDEN") || (paymentType.includes("ELDEN") && !paymentType.includes("BANKA")));
      const onlyBank = paymentType.includes("SADECE BANKA") || paymentType.includes("SADECE_BANKA") || (paymentType.includes("BANKA") && !paymentType.includes("ELDEN"));
      let bank = onlyCash
        ? 0
        : onlyBank
          ? grossPay
          : plannedBank > 0
            ? Math.min(grossPay, plannedBank)
            : Math.max(0, grossPay - Math.min(grossPay, plannedCash || grossPay));
      let cash = onlyBank
        ? 0
        : onlyCash
          ? grossPay
          : Math.max(0, grossPay - bank);
      if (policy.advanceFirstFromCash && advanceAmount && !onlyBank && plannedCash > 0 && plannedBank > 0) {
        const cashBeforeAdvance = Math.max(0, plannedCash);
        cash = Math.max(0, cashBeforeAdvance - advanceAmount);
        bank = Math.max(0, grossPay - cash);
      }
      const system = {
        salary, roadAllowance: road, salaryPay, salaryCut, roadPay, roadCut,
        overtimeAmount, premiumAmount, advanceAmount, deductionAmount,
        bank, cash, total: grossPay + advanceAmount,
        officialPayrollNet, bankSource: officialPayrollNet > 0 ? "SGK_BORDRO_NET_ISTIHKAK" : "PERSONEL_ODEME_PLANI",
      };
      const override = overrides.get(employee.id);
      const manual = override ? JSON.parse(override.override_json || "{}") : null;
      const finalValues = manual ? { ...system, ...manual } : system;
      return {
        employeeId: employee.id,
        code: employee.code,
        fullName: employee.fullName,
        department: employee.department,
        cardNo: employee.cardNo,
        stats,
        system,
        final: finalValues,
        override: override ? { id: override.id, reason: override.reason, userName: override.user_name, updatedAt: override.updated_at } : null,
        sgkDays: stats.sgk,
        expectedSgkDays: stats.paid,
        status: override ? "MANUEL_ONAYLI" : "SISTEM",
      };
    });
    return { year, month, policy, lines, totals: lines.reduce((acc: AnyRow, row: AnyRow) => {
      acc.bank += this.number(row.final.bank); acc.cash += this.number(row.final.cash); acc.total += this.number(row.final.total); return acc;
    }, { bank: 0, cash: 0, total: 0 }) };
  }

  async savePayrollOverride(body: AnyRow = {}) {
    await this.ensureSchema();
    const year = Number(body.year || new Date().getFullYear());
    const month = Number(body.month || new Date().getMonth() + 1);
    const companyId = this.companyCandidates(body)[0];
    const employeeId = this.text(body.employeeId);
    const reason = this.text(body.reason);
    if (!employeeId) throw new BadRequestException("Personel zorunlu.");
    if (!reason) throw new BadRequestException("Manuel bordro duzeltme sebebi zorunlu.");
    await this.ensurePeriodWritable(companyId, year, month);
    const calculation = await this.payrollCalculation({ ...body, year, month, mainCompanyId: companyId });
    const systemLine = calculation.lines.find((row: AnyRow) => row.employeeId === employeeId);
    if (!systemLine) throw new BadRequestException("Bordro satiri bulunamadi.");
    const override = this.normalizePayrollOverride(systemLine.system, body.override || {});
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO ik_payroll_overrides (id, main_company_id, period_year, period_month, employee_id, system_json, override_json, reason, user_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(main_company_id, period_year, period_month, employee_id) DO UPDATE SET system_json=excluded.system_json, override_json=excluded.override_json, reason=excluded.reason, user_name=excluded.user_name, updated_at=CURRENT_TIMESTAMP`,
      randomUUID(), companyId, year, month, employeeId, JSON.stringify(systemLine.system), JSON.stringify(override), reason, this.text(body.userName || "Sistem"),
    );
    const finalLine = {
      ...systemLine,
      final: { ...systemLine.system, ...override },
      status: "MANUAL_APPROVED",
    };
    await this.upsertPayrollLine(companyId, year, month, finalLine, "MANUAL_APPROVED");
    await this.writeAuditLog({
      ...body,
      employeeId,
      period: `${year}-${String(month).padStart(2, "0")}`,
      actionType: "BORDRO_MANUEL_DUZELTME",
      sourceScreen: "Bordro & Ödeme",
      oldValue: systemLine.system,
      newValue: override,
      reason,
    });
    return { ok: true, message: "Manuel bordro duzeltmesi kaydedildi ve bordro satiri guncellendi." };
  }

  private normalizePayrollOverride(system: AnyRow = {}, override: AnyRow = {}) {
    const next = { ...override };
    const salaryPay = this.number(next.salaryPay ?? system.salaryPay);
    const roadPay = this.number(next.roadPay ?? system.roadPay);
    const overtimeAmount = this.number(next.overtimeAmount ?? system.overtimeAmount);
    const premiumAmount = this.number(next.premiumAmount ?? system.premiumAmount);
    const advanceAmount = this.number(next.advanceAmount ?? system.advanceAmount);
    const deductionAmount = this.number(next.deductionAmount ?? system.deductionAmount);
    const total = Math.max(0, Math.round((salaryPay + roadPay + overtimeAmount + premiumAmount - deductionAmount) * 100) / 100);
    const net = Math.max(0, Math.round((total - advanceAmount) * 100) / 100);
    let bank = Math.max(0, this.number(next.bank ?? system.bank));
    let cash = Math.max(0, this.number(next.cash ?? system.cash));
    if (Math.round((bank + cash - net) * 100) !== 0) {
      bank = Math.min(bank, net);
      cash = Math.round((net - bank) * 100) / 100;
    }
    return {
      ...next,
      bank,
      cash,
      total,
    };
  }

  private async upsertPayrollLine(companyId: string, year: number, month: number, line: AnyRow, status: string) {
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO hr_payrolls_v2 (id, main_company_id, year, month, employee_id, salary, road_allowance, overtime_amount, premium_amount, deduction_amount, advance_amount, bank_amount, cash_amount, total_amount, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(main_company_id, year, month, employee_id) DO UPDATE SET salary=excluded.salary, road_allowance=excluded.road_allowance, overtime_amount=excluded.overtime_amount, premium_amount=excluded.premium_amount, deduction_amount=excluded.deduction_amount, advance_amount=excluded.advance_amount, bank_amount=excluded.bank_amount, cash_amount=excluded.cash_amount, total_amount=excluded.total_amount, status=excluded.status, updated_at=CURRENT_TIMESTAMP`,
      randomUUID(),
      companyId,
      year,
      month,
      line.employeeId,
      this.number(line.final?.salaryPay),
      this.number(line.final?.roadPay),
      this.number(line.final?.overtimeAmount),
      this.number(line.final?.premiumAmount),
      this.number(line.final?.deductionAmount),
      this.number(line.final?.advanceAmount),
      this.number(line.final?.bank),
      this.number(line.final?.cash),
      this.number(line.final?.total),
      status,
    );
  }

  async savePayrollLines(body: AnyRow = {}) {
    await this.ensureSchema();
    const year = Number(body.year || new Date().getFullYear());
    const month = Number(body.month || new Date().getMonth() + 1);
    const companyId = this.companyCandidates(body)[0];
    await this.ensurePeriodWritable(companyId, year, month);
    const calculation = await this.payrollCalculation({ ...body, year, month, mainCompanyId: companyId });
    const employeeIds = Array.isArray(body.employeeIds) && body.employeeIds.length ? new Set(body.employeeIds.map((id: any) => this.text(id))) : null;
    let saved = 0;
    for (const line of calculation.lines) {
      if (employeeIds && !employeeIds.has(line.employeeId)) continue;
      await this.upsertPayrollLine(companyId, year, month, line, body.status || "CALCULATED");
      await this.writeAuditLog({
        ...body,
        employeeId: line.employeeId,
        period: `${year}-${String(month).padStart(2, "0")}`,
        actionType: "BORDRO_KAYDET",
        sourceScreen: "Bordro & Ödeme",
        newValue: line.final,
        reason: this.text(body.reason || "Bordro satiri kaydedildi"),
      });
      saved += 1;
    }
    return { ok: true, count: saved, message: `${saved} bordro satiri kaydedildi.` };
  }

  async saveFinanceMovement(body: AnyRow = {}) {
    await this.ensureSchema();
    const requestedIds = Array.isArray(body.employeeIds)
      ? body.employeeIds.map((id: any) => this.text(id)).filter(Boolean)
      : [];
    const employeeIds = requestedIds.length ? [...new Set(requestedIds)] : [this.text(body.employeeId)].filter(Boolean);
    const type = this.normalizeAdjustmentType(body.adjustmentType || body.type || "Avans");
    const date = this.dateOnly(body.date || new Date());
    const amount = this.number(body.amount);
    const note = this.text(body.note || body.reason);
    if (!employeeIds.length || !date) throw new BadRequestException("Personel ve tarih zorunlu.");
    if (amount <= 0) throw new BadRequestException("Tutar sifirdan buyuk olmalidir.");
    let saved = 0;
    for (const employeeId of employeeIds) {
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO hr_monthly_adjustments_v2 (id, employee_id, date, adjustment_type, hour_or_day, amount, payroll_effect, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(), employeeId, date, type, this.number(body.hourOrDay || body.hours), amount, this.financePayrollEffect(type, body.payrollEffect), note, this.text(body.status || "APPROVED"),
    );
    if (this.isOvertimeType(type) && this.isWeekendDate(date)) {
      await this.saveException({ ...body, employeeId, workDate: date, status: "W", note: note || "Hafta sonu mesaisi", source: "MESAI" });
    }
    await this.writeAuditLog({
      ...body,
      employeeId,
      period: date.slice(0, 7),
      actionType: "FINANS_HAREKETI",
      sourceScreen: "Mesai • Avans • Kesinti",
      newValue: { type, date, amount, hourOrDay: this.number(body.hourOrDay || body.hours) },
      reason: note || `${type} hareketi kaydedildi`,
    });
    saved += 1;
    }
    return { ok: true, count: saved, message: `${saved} finans hareketi kaydedildi.` };
  }

  async updateFinanceMovement(body: AnyRow = {}) {
    await this.ensureSchema();
    const id = this.text(body.id);
    if (!id) throw new BadRequestException("Guncellenecek hareket bulunamadi.");
    const current = (await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, date, adjustment_type, hour_or_day, amount, payroll_effect, note, status FROM hr_monthly_adjustments_v2 WHERE id=? LIMIT 1`,
      id,
    ) as AnyRow[])[0];
    if (!current) throw new BadRequestException("Hareket kaydi bulunamadi.");
    const date = this.dateOnly(body.date || current.date);
    const companyId = this.companyCandidates(body)[0];
    await this.ensurePeriodWritable(companyId, Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    const employeeId = this.text(body.employeeId || current.employee_id);
    if (!employeeId) throw new BadRequestException("Personel zorunlu.");
    const type = this.normalizeAdjustmentType(body.adjustmentType || body.type || current.adjustment_type);
    const amount = body.amount === undefined ? this.number(current.amount) : this.number(body.amount);
    if (amount <= 0) throw new BadRequestException("Tutar sifirdan buyuk olmalidir.");
    const hourOrDay = body.hourOrDay === undefined && body.hours === undefined
      ? this.number(current.hour_or_day)
      : this.number(body.hourOrDay || body.hours);
    const note = body.note === undefined && body.reason === undefined
      ? this.text(current.note)
      : this.text(body.note || body.reason);
    const payrollEffect = this.financePayrollEffect(type, body.payrollEffect || current.payroll_effect);
    const status = this.text(body.status || current.status || "APPROVED");
    await (this.prisma as any).$executeRawUnsafe(
      `UPDATE hr_monthly_adjustments_v2
       SET employee_id=?, date=?, adjustment_type=?, hour_or_day=?, amount=?, payroll_effect=?, note=?, status=?
       WHERE id=?`,
      employeeId, date, type, hourOrDay, amount, payrollEffect, note, status, id,
    );
    await this.writeAuditLog({
      ...body,
      employeeId,
      period: date.slice(0, 7),
      actionType: "FINANS_HAREKETI_GUNCELLE",
      sourceScreen: "Mesai • Avans • Kesinti",
      oldValue: {
        employeeId: current.employee_id,
        date: this.dateOnly(current.date),
        adjustmentType: current.adjustment_type,
        hourOrDay: this.number(current.hour_or_day),
        amount: this.number(current.amount),
        payrollEffect: current.payroll_effect,
        note: current.note,
      },
      newValue: { employeeId, date, adjustmentType: type, hourOrDay, amount, payrollEffect, note, status },
      reason: note || `${type} hareketi guncellendi`,
    });
    return { ok: true, message: "Finans hareketi guncellendi." };
  }

  async deleteFinanceMovement(body: AnyRow = {}) {
    await this.ensureSchema();
    const id = this.text(body.id);
    if (!id) throw new BadRequestException("Silinecek hareket bulunamadi.");
    const current = (await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id, date, adjustment_type, hour_or_day, amount, payroll_effect, note, status FROM hr_monthly_adjustments_v2 WHERE id=? LIMIT 1`,
      id,
    ) as AnyRow[])[0];
    if (!current) throw new BadRequestException("Hareket kaydi bulunamadi.");
    const companyId = this.companyCandidates(body)[0];
    const date = this.dateOnly(current.date);
    await this.ensurePeriodWritable(companyId, Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    await (this.prisma as any).$executeRawUnsafe(`DELETE FROM hr_monthly_adjustments_v2 WHERE id=?`, id);
    await this.writeAuditLog({
      ...body,
      employeeId: current.employee_id,
      period: date.slice(0, 7),
      actionType: "FINANS_HAREKETI_SIL",
      sourceScreen: "Mesai • Avans • Kesinti",
      oldValue: {
        id: current.id,
        date,
        adjustmentType: current.adjustment_type,
        hourOrDay: this.number(current.hour_or_day),
        amount: this.number(current.amount),
        payrollEffect: current.payroll_effect,
        note: current.note,
        status: current.status,
      },
      reason: this.text(body.reason || current.note || "Finans hareketi silindi"),
    });
    return { ok: true, message: "Finans hareketi silindi." };
  }

  async uploadDocument(file: any, body: AnyRow = {}) {
    await this.ensureSchema();
    if (!file?.buffer) throw new BadRequestException("Yuklenecek dosya secilmedi.");
    const employeeId = this.text(body.employeeId);
    if (!employeeId) throw new BadRequestException("Personel zorunlu.");
    const uploadRoot = path.resolve(process.cwd(), "..", "..", "..", "DATA", "uploads", "ik-documents");
    fs.mkdirSync(uploadRoot, { recursive: true });
    const ext = path.extname(file.originalname || "") || ".bin";
    const safeName = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}${ext}`;
    const filePath = path.join(uploadRoot, safeName);
    fs.writeFileSync(filePath, file.buffer);
    const documentId = randomUUID();
    await (this.prisma as any).$executeRawUnsafe(
      `INSERT INTO hr_employee_documents (id, employee_id, document_type, file_name, file_path, date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      documentId, employeeId, this.text(body.documentType || "Evrak"), this.text(file.originalname || safeName), filePath, this.dateOnly(body.date || new Date()), this.text(body.status || "WAITING"),
    );
    await this.writeAuditLog({
      ...body,
      employeeId,
      period: this.dateOnly(body.date || new Date()).slice(0, 7),
      actionType: "EVRAK_YUKLE",
      sourceScreen: "SGK • Evrak • Ay Sonu Kontrol",
      newValue: { documentId, fileName: file.originalname, filePath },
      reason: this.text(body.note || body.documentType || "Evrak yuklendi"),
    });
    return { ok: true, documentId, fileName: file.originalname, filePath, message: "Evrak dosyasi yuklendi." };
  }

  async settlementDraft(body: AnyRow = {}) {
    await this.ensureSchema();
    const employeeId = this.text(body.employeeId);
    const employee = (await this.employees(body)).find((row: AnyRow) => row.id === employeeId);
    if (!employee) throw new BadRequestException("Personel bulunamadi.");
    const exitDate = this.dateOnly(body.exitDate || new Date());
    const hireDate = this.dateOnly(employee.hireDate);
    const seniorityDays = hireDate ? Math.max(0, Math.floor((new Date(`${exitDate}T00:00:00`).getTime() - new Date(`${hireDate}T00:00:00`).getTime()) / 86400000)) : 0;
    const grossSalary = this.number(body.grossSalary || employee.salary);
    const ceiling = this.number(body.ceilingAmount);
    const severanceBase = ceiling ? Math.min(grossSalary, ceiling) : grossSalary;
    const severanceAmount = Math.round(severanceBase * (seniorityDays / 365) * 100) / 100;
    const unusedLeaveDays = Math.max(0, this.number(body.unusedLeaveDays ?? (this.number(employee.annualLeaveEntitlement) + this.number(employee.annualLeaveCarryover))));
    const unusedLeaveAmount = Math.round((grossSalary / 30) * unusedLeaveDays * 100) / 100;
    const draft = { employeeId, exitDate, seniorityDays, grossSalary, ceilingAmount: ceiling, severanceAmount, unusedLeaveDays, unusedLeaveAmount, total: severanceAmount + unusedLeaveAmount, note: this.text(body.note) };
    if (body.save) {
      await (this.prisma as any).$executeRawUnsafe(
        `INSERT INTO ik_settlement_drafts (id, main_company_id, employee_id, exit_date, seniority_days, gross_salary, ceiling_amount, severance_amount, unused_leave_days, unused_leave_amount, note, user_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(), this.companyCandidates(body)[0], employeeId, exitDate, seniorityDays, grossSalary, ceiling, severanceAmount, unusedLeaveDays, unusedLeaveAmount, this.text(body.note), this.text(body.userName || "Sistem"),
      );
      await this.writeAuditLog({ ...body, employeeId, period: exitDate.slice(0, 7), actionType: "AYRILIS_KIDEM_TASLAK", sourceScreen: "Ayrılış & Kıdem", newValue: draft, reason: this.text(body.note || "Ayrilis taslagi") });
    }
    return draft;
  }

  async closeCheck(body: AnyRow = {}) {
    await this.ensureSchema();
    const year=Number(body.year||new Date().getFullYear()),month=Number(body.month||new Date().getMonth()+1),companyId=this.companyCandidates(body)[0];
    const data=await this.monthBase({ ...body, year, month }); const checks:AnyRow[]=[]; const totalDays=new Date(year,month,0).getDate();
    const attendanceBy=new Map<string,AnyRow[]>(); data.attendance.forEach((row)=>attendanceBy.set(row.employeeId,[...(attendanceBy.get(row.employeeId)||[]),row]));
    const sgkBy=new Map<string,AnyRow>(); data.sgkRows.forEach((row)=>{if(row.employeeId) sgkBy.set(row.employeeId,row)});
    const resolvedDays = await this.monthlyResolvedDays({ ...body, year, month }, { employees: data.employees, attendance: data.attendance });
    const resolvedByEmployee = new Map(resolvedDays.map((row) => [row.employeeId, row.days]));
    const employeeIds=data.employees.map((employee)=>employee.id);
    const placeholders=employeeIds.map(() => "?").join(",");
    const periodStart=new Date(year,month-1,1).toISOString(), periodEnd=new Date(year,month,1).toISOString();
    const periodStartText=`${year}-${String(month).padStart(2,"0")}-01`, periodEndText=`${month===12?year+1:year}-${String(month===12?1:month+1).padStart(2,"0")}-01`;
    const leaves=employeeIds.length ? await (this.prisma as any).$queryRawUnsafe(`SELECT employee_id as employeeId, record_type as recordType, day_count as dayCount, document_path as documentPath FROM hr_leave_records_v2 WHERE employee_id IN (${placeholders}) AND date(start_date) < date(?) AND date(end_date) >= date(?)`,...employeeIds,periodEnd,periodStart) as AnyRow[] : [];
    const docs=employeeIds.length ? await (this.prisma as any).$queryRawUnsafe(`SELECT employee_id as employeeId, document_type as documentType FROM hr_employee_documents WHERE employee_id IN (${placeholders})`,...employeeIds) as AnyRow[] : [];
    const rawAdjustments=employeeIds.length ? await (this.prisma as any).$queryRawUnsafe(`SELECT employee_id as employeeId, CAST(date AS TEXT) as rawDate, adjustment_type as adjustmentType, amount, payroll_effect as payrollEffect, status FROM hr_monthly_adjustments_v2 WHERE employee_id IN (${placeholders})`,...employeeIds) as AnyRow[] : [];
    const adjustments=rawAdjustments.filter((row)=>{ const adjustmentDate=this.dateOnly(row.rawDate); return adjustmentDate>=periodStartText && adjustmentDate<periodEndText; });
    const payroll=await (this.prisma as any).$queryRawUnsafe(`SELECT employee_id as employeeId, bank_amount as bankAmount, cash_amount as cashAmount, advance_amount as advanceAmount, total_amount as totalAmount FROM hr_payrolls_v2 WHERE main_company_id=? AND year=? AND month=?`,companyId,year,month) as AnyRow[];
    const payrollBy=new Map(payroll.map((row)=>[row.employeeId,row]));
    const activePayroll=data.employees.filter(x=>x.payrollIncluded!==false);
    checks.push({type:"PERSONNEL_CARD",ok:activePayroll.every(x=>x.cardNo),title:"Aktif şirket personelinde kart no var mı?",detail:activePayroll.every(x=>x.cardNo)?"Tüm şirket personelinin kart numarası tanımlı.":"Kart numarası eksik şirket personeli var."});
    checks.push({type:"OUTSIDE_PAYMENT",ok:data.employees.filter(x=>x.payrollIncluded===false).every(x=>!payrollBy.has(x.id)),title:"Bordroya dahil olmayan kişi ödeme listesine girmiş mi?",detail:data.employees.filter(x=>x.payrollIncluded===false).some(x=>payrollBy.has(x.id))?"Bordroya dahil olmayan kişi ödeme listesinde görünüyor.":"Dış / günlük kişiler ödeme listesinde değil."});
    for(const employee of data.employees.filter(x=>x.payrollIncluded!==false)){
      const card=this.employeeMonthStats(resolvedByEmployee.get(employee.id) || [], 0).paid;
      const sgk=this.number(sgkBy.get(employee.id)?.sgkDays);
      const reason=this.text(sgkBy.get(employee.id)?.differenceReason);
      if(sgk && card!==sgk) checks.push({type:"DAY_MISMATCH",ok:false,title:`${employee.fullName} - SGK gün / puantaj farkı`,detail:`SGK: ${sgk} gün · Puantaj: ${card} gün. ${reason ? `Sebep: ${reason}` : "Sebep seçilmeden kapanış yapılamaz."}`});
    }
    if(!checks.some(x=>x.type==="DAY_MISMATCH")) checks.push({type:"DAY_MISMATCH",ok:true,title:"SGK gün / puantaj uyumu",detail:"Eşleşen şirket personellerinde SGK ve puantaj günleri uyumlu."});
    const missingReason=data.sgkRows.filter((row)=>row.employeeId && row.sgkDays && !this.text(row.differenceReason)).filter((row)=> {
      const card=this.employeeMonthStats(resolvedByEmployee.get(row.employeeId) || [], 0).paid;
      return card!==this.number(row.sgkDays);
    });
    checks.push({type:"DIFF_REASON",ok:missingReason.length===0,title:"Fark varsa açıklama/sebep seçilmiş mi?",detail:missingReason.length?`${missingReason.length} SGK/puantaj farkında sebep eksik.`:"Farklı günlerde sebep kontrolü tamam."});
    const reportLeaves=leaves.filter((row)=>this.norm(row.recordType).includes("RAPOR"));
    const missingReportDoc=reportLeaves.filter((row)=>!row.documentPath && !docs.some((doc)=>doc.employeeId===row.employeeId && this.norm(doc.documentType).includes("RAPOR")));
    checks.push({type:"REPORT_DOC",ok:missingReportDoc.length===0,title:"Rapor günlerinin belgesi var mı?",detail:missingReportDoc.length?`${missingReportDoc.length} rapor kaydında belge bağlantısı yok.`:"Rapor belge bağlantıları tamam."});
    const overLeave=data.employees.filter((employee)=> {
      const used=leaves.filter((row)=>row.employeeId===employee.id && this.norm(row.recordType).includes("YILLIK")).reduce((sum,row)=>sum+this.number(row.dayCount),0);
      const balance=this.number((employee as AnyRow).annualLeaveEntitlement)+this.number((employee as AnyRow).annualLeaveCarryover)-used;
      return balance<0;
    });
    checks.push({type:"LEAVE_BALANCE",ok:overLeave.length===0,title:"Yıllık izin bakiye içinde mi?",detail:overLeave.length?`${overLeave.length} personelde yıllık izin bakiyesi aşıldı.`:"Yıllık izin bakiyeleri uygun."});
    const duplicateMain=data.attendance.length-new Set(data.attendance.map((row)=>`${row.employeeId}|${row.workDate}`)).size;
    checks.push({type:"ONE_MAIN_STATUS",ok:duplicateMain===0,title:"Aynı kişiye aynı gün birden fazla ana durum girilmiş mi?",detail:duplicateMain?`${duplicateMain} mükerrer puantaj günü var.`:"Her personel/gün için tek ana durum var."});
    const missingClock=data.attendance.filter((row)=>((row.earlyExit&&!row.checkOut)||(row.lateEntry&&!row.checkIn)));
    checks.push({type:"CLOCK_DETAIL",ok:missingClock.length===0,title:"Erken çıkış/geç giriş kaydında saat bilgisi var mı?",detail:missingClock.length?`${missingClock.length} saat düzeltmesinde giriş/çıkış saati eksik.`:"Saat düzeltmeleri tamam."});
    const draftAdjustments=adjustments.filter((row)=>String(row.status||"").toUpperCase()==="DRAFT");
    checks.push({type:"ADJUSTMENT_PAYROLL",ok:draftAdjustments.length===0,title:"Avans ve kesintiler bordroya aktarılmış mı?",detail:draftAdjustments.length?`${draftAdjustments.length} mesai/avans/kesinti kaydı taslak durumda.`:"Mesai, avans ve kesinti kayıtları bordro kontrolüne hazır."});
    const badPayments=payroll.filter((row)=>Math.round((this.number(row.bankAmount)+this.number(row.cashAmount)+this.number(row.advanceAmount)-this.number(row.totalAmount))*100)!==0);
    checks.push({type:"PAYMENT_BALANCE",ok:badPayments.length===0,title:"Banka + Elden = Net ödeme mi?",detail:badPayments.length?`${badPayments.length} bordro satırında ödeme toplamı net tutara eşit değil.`:"Banka + elden toplamları net ödeme ile uyumlu."});
    checks.push({type:"SGK_IMPORTED",ok:data.sgkRows.length>0,title:"SGK bordro Excel",detail:data.sgkRows.length?`${data.sgkRows.length} satır analiz havuzunda.`:"Bu dönem için SGK Excel henüz yüklenmedi."});
    const duplicatePay=payroll.length-new Set(payroll.map((row)=>row.employeeId)).size;
    checks.push({type:"DUPLICATE_PAYMENT",ok:duplicatePay===0,title:"Aynı personel ödeme listesinde iki kez var mı?",detail:duplicatePay?`${duplicatePay} mükerrer ödeme satırı var.`:"Ödeme listesi tekil."});
    const blockingCount=checks.filter(x=>!x.ok).length,okCount=checks.filter(x=>x.ok).length;
    const lockedRows=await (this.prisma as any).$queryRawUnsafe(`SELECT is_locked FROM ik_monthly_close WHERE main_company_id=? AND period_year=? AND period_month=?`,companyId,year,month) as AnyRow[];
    if(body.lock){ if(blockingCount) throw new BadRequestException("Açık kontrol hataları varken dönem kapatılamaz."); await (this.prisma as any).$executeRawUnsafe(`INSERT INTO ik_monthly_close (id,main_company_id,period_year,period_month,is_locked,locked_at,updated_at) VALUES (?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(main_company_id,period_year,period_month) DO UPDATE SET is_locked=1,locked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,randomUUID(),companyId,year,month); await (this.prisma as any).$executeRawUnsafe(`INSERT INTO ik_monthly_close_logs (id,main_company_id,period_year,period_month,action,reason,user_name,new_json) VALUES (?,?,?,?,?,?,?,?)`,randomUUID(),companyId,year,month,"LOCK",this.text(body.reason),"Sistem",JSON.stringify({year,month})); }
    return {year,month,totalChecks:checks.length,okCount,blockingCount,isLocked:Boolean(lockedRows[0]?.is_locked)||Boolean(body.lock),checks};
  }

  private async monthBase(query: AnyRow) {
    const year=Number(query.year),month=Number(query.month),companyId=this.companyCandidates(query)[0];const employees=await this.employees(query);
    const start=`${year}-${String(month).padStart(2,"0")}-01`,end=`${year}-${String(month).padStart(2,"0")}-31`;
    const attendance=await (this.prisma as any).$queryRawUnsafe(`SELECT employee_id as employeeId, work_date as workDate, status, check_in as checkIn, check_out as checkOut, early_exit as earlyExit, late_entry as lateEntry FROM ik_monthly_attendance WHERE main_company_id=? AND work_date>=? AND work_date<=?`,companyId,start,end) as AnyRow[];
    const imp=(await (this.prisma as any).$queryRawUnsafe(`SELECT id FROM ik_sgk_imports WHERE main_company_id=? AND period_year=? AND period_month=? ORDER BY datetime(created_at) DESC LIMIT 1`,companyId,year,month) as AnyRow[])[0];
    const sgkRows=imp?await (this.prisma as any).$queryRawUnsafe(`SELECT employee_id as employeeId, sgk_days as sgkDays, full_name as fullName, difference_reason as differenceReason FROM ik_sgk_rows WHERE import_id=?`,imp.id) as AnyRow[]:[];
    return {employees,attendance,sgkRows};
  }
}
