import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import AdmZip from "adm-zip";
import { randomUUID } from "crypto";
import * as ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";

type AnyBody = Record<string, any>;

const DEFAULT_2026_OFFICIAL_HOLIDAYS = [
  ["2026-01-01", "Yılbaşı"],
  ["2026-03-19", "Ramazan Bayramı Arifesi"],
  ["2026-03-20", "Ramazan Bayramı 1. Gün"],
  ["2026-03-21", "Ramazan Bayramı 2. Gün"],
  ["2026-03-22", "Ramazan Bayramı 3. Gün"],
  ["2026-04-23", "Ulusal Egemenlik ve Çocuk Bayramı"],
  ["2026-05-01", "Emek ve Dayanışma Günü"],
  ["2026-05-19", "Atatürk'ü Anma Gençlik ve Spor Bayramı"],
  ["2026-05-26", "Kurban Bayramı Arifesi"],
  ["2026-05-27", "Kurban Bayramı 1. Gün"],
  ["2026-05-28", "Kurban Bayramı 2. Gün"],
  ["2026-05-29", "Kurban Bayramı 3. Gün"],
  ["2026-05-30", "Kurban Bayramı 4. Gün"],
  ["2026-07-15", "Demokrasi ve Milli Birlik Günü"],
  ["2026-08-30", "Zafer Bayramı"],
  ["2026-10-28", "Cumhuriyet Bayramı Arifesi"],
  ["2026-10-29", "Cumhuriyet Bayramı"],
] as const;

const DEFAULT_SGK_BANK_AMOUNT = 28075.5;

@Injectable()
export class IkService {
  constructor(private readonly prisma: PrismaService) {}

  private model(name: string) {
    return (this.prisma as any)[name];
  }

  private mainCompanyId(input: AnyBody = {}) {
    return this.canonicalCompanyId(
      input.mainCompanySlug || input.mainCompanyId || "mecit-hakan",
    );
  }

  private slugText(value: unknown) {
    return String(value || "")
      .trim()
      .replace(/[ıİIi]/g, "i")
      .replace(/[şŞ]/g, "s")
      .replace(/[ğĞ]/g, "g")
      .replace(/[üÜ]/g, "u")
      .replace(/[öÖ]/g, "o")
      .replace(/[çÇ]/g, "c")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private canonicalCompanyId(value: unknown) {
    let slug = this.slugText(value);
    if (!slug) slug = "mecit-hakan";
    if (slug.startsWith("main-")) slug = slug.slice(5);
    if (slug === "hakan-mecit") return "mecit-hakan";
    return slug;
  }

  private companyIdCandidates(input: AnyBody = {}) {
    const rawValues = [
      input.mainCompanySlug,
      input.mainCompanyId,
      input.companySlug,
      input.companyId,
      "mecit-hakan",
    ];
    const ordered: string[] = [];
    const add = (value: unknown) => {
      const slug = this.slugText(value);
      if (!slug) return;
      const canonical = this.canonicalCompanyId(slug);
      [canonical, slug, `main-${canonical}`].forEach((item) => {
        if (item && !ordered.includes(item)) ordered.push(item);
      });
      if (canonical === "mecit-hakan" && !ordered.includes("hakan-mecit")) {
        ordered.push("hakan-mecit");
      }
    };
    rawValues.forEach(add);
    return ordered.length ? ordered : ["mecit-hakan", "main-mecit-hakan", "hakan-mecit"];
  }

  private date(value: unknown) {
    if (!value) return new Date();
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private dateOnly(value: unknown) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return new Date();
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private dateOnlyString(value: unknown) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = value instanceof Date ? value : new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  private isValidDateOnlyString(value: unknown) {
    const text = this.dateOnlyString(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const parsed = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
    return (
      parsed.getUTCFullYear() === Number(match[1]) &&
      parsed.getUTCMonth() + 1 === Number(match[2]) &&
      parsed.getUTCDate() === Number(match[3])
    );
  }

  private requireDateOnlyString(value: unknown, message = "Geçerli tarih seçilmedi.") {
    const text = this.dateOnlyString(value);
    if (!this.isValidDateOnlyString(text)) {
      throw new BadRequestException(message);
    }
    return text;
  }

  private number(value: unknown) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let cleaned = String(value ?? "0")
      .trim()
      .replace(/[₺\s]/g, "");
    if (cleaned.includes(",")) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, "");
    }
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  private normalizeSgkStatus(value: unknown) {
    return String(value || "VAR").toLocaleUpperCase("tr-TR") === "YOK" ? "YOK" : "VAR";
  }

  private isCashOnlyPaymentType(value: unknown) {
    const text = String(value || "").toLocaleLowerCase("tr-TR");
    return text.includes("elden") && !text.includes("banka");
  }

  private resolveBankAmount(input: {
    totalAmount: number;
    sgkStatus?: unknown;
    paymentType?: unknown;
    bankAmount?: unknown;
  }) {
    const totalAmount = Math.max(0, this.number(input.totalAmount));
    if (this.normalizeSgkStatus(input.sgkStatus) === "YOK") return 0;
    if (this.isCashOnlyPaymentType(input.paymentType)) return 0;
    const enteredBank = this.number(input.bankAmount);
    const bankAmount = enteredBank > 0 ? enteredBank : DEFAULT_SGK_BANK_AMOUNT;
    return Math.min(totalAmount, Math.max(0, bankAmount));
  }

  private payrollEffectForType(type: string, fallback = "Bordroya ekle") {
    if (fallback === "Yıllık izinden düş") return "Yıllık izinden düş";
    if (fallback === "Sadece kayıt") return "Sadece kayıt";
    if (["Mesai", "Prim", "Yol farkı", "Maaş farkı"].includes(type)) {
      return "Bordroya ekle";
    }
    if (["Kesinti", "Avans", "Devamsızlık"].includes(type)) {
      return "Bordrodan düş";
    }
    return fallback || "Sadece not";
  }

  private adjustmentDirection(item: AnyBody = {}) {
    if (item.payrollEffect === "Yıllık izinden düş") return 0;
    if (item.payrollEffect === "Sadece kayıt") return 0;
    const type = item.adjustmentType || item.type;
    if (["Mesai", "Prim", "Yol farkı", "Maaş farkı"].includes(type)) return 1;
    if (["Kesinti", "Avans", "Devamsızlık"].includes(type)) return -1;
    if (item.payrollEffect === "Bordroya ekle") return 1;
    if (item.payrollEffect === "Bordrodan düş") return -1;
    return 0;
  }

  private monthlyCode(value: unknown) {
    const raw = String(value || "")
      .trim()
      .toUpperCase();
    if (!raw) return null;
    if (raw.startsWith("AY-")) return `HKN-${raw.slice(3)}`;
    if (raw.startsWith("HKN-")) return raw;
    return `HKN-${raw}`;
  }

  private monthlyCodeNumber(value: unknown) {
    const normalized = this.monthlyCode(value);
    if (!normalized) return null;
    const match = normalized.match(/(\d+)$/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private isLiveMonthlyTestEmployee(row: AnyBody = {}) {
    const fullName = String(row.fullName || row.full_name || "")
      .trim()
      .toLocaleUpperCase("tr-TR");
    const title = String(row.title || "")
      .trim()
      .toLocaleUpperCase("tr-TR");
    const department = String(row.department || "")
      .trim()
      .toLocaleUpperCase("tr-TR");
    return fullName.includes("CANLI IK") || (fullName.includes("CANLI") && (title.includes("TEST") || department.includes("TEST")));
  }

  private async nextMonthlyCode(mainCompanyId: string) {
    const rows = await this.model("hrMonthlyEmployee").findMany({
      where: { mainCompanyId },
      select: { code: true },
    });
    const max = rows.reduce((best: number, row: AnyBody) => {
      const value = this.monthlyCodeNumber(row.code);
      return value && value > best ? value : best;
    }, 0);
    return `HKN-${String(max + 1).padStart(2, "0")}`;
  }

  private monthDateRange(yearInput: unknown, monthInput: unknown) {
    const year = Number(yearInput);
    const month = Number(monthInput);
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
    if (month < 1 || month > 12) return null;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { start, end };
  }

  private monthKey(yearInput: unknown, monthInput: unknown) {
    const year = Number(yearInput || new Date().getFullYear());
    const month = Number(monthInput || new Date().getMonth() + 1);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      return new Date().toISOString().slice(0, 7);
    }
    return `${year}-${String(Math.min(12, Math.max(1, month))).padStart(2, "0")}`;
  }

  private async ensureMonthlyAuditLogTable() {
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS hr_monthly_audit_logs (
        id TEXT PRIMARY KEY,
        main_company_id TEXT NOT NULL,
        period TEXT NOT NULL DEFAULT '',
        employee_id TEXT,
        entity_type TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_hr_monthly_audit_logs_company_period
      ON hr_monthly_audit_logs (main_company_id, period, created_at)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_hr_monthly_audit_logs_employee
      ON hr_monthly_audit_logs (employee_id, created_at)
    `);
  }

  private mapMonthlyAuditLog(row: AnyBody = {}) {
    let details: AnyBody = {};
    try {
      details = JSON.parse(String(row.details_json || "{}"));
    } catch {
      details = {};
    }
    return {
      id: row.id,
      mainCompanyId: row.main_company_id,
      period: row.period || "",
      employeeId: row.employee_id || "",
      entityType: row.entity_type,
      action: row.action,
      summary: row.summary,
      details,
      createdAt: row.created_at,
    };
  }

  private async employeeCompanyId(employeeId: unknown) {
    if (!employeeId) return "mecit-hakan";
    const employee = await this.model("hrMonthlyEmployee").findUnique({
      where: { id: String(employeeId) },
      select: { mainCompanyId: true },
    });
    return employee?.mainCompanyId || "mecit-hakan";
  }

  private async writeMonthlyAuditLog(input: AnyBody = {}) {
    await this.ensureMonthlyAuditLogTable();
    const mainCompanyId = this.canonicalCompanyId(
      input.mainCompanyId || (await this.employeeCompanyId(input.employeeId)),
    );
    const period =
      input.period ||
      (input.year || input.month
        ? this.monthKey(input.year, input.month)
        : input.date
          ? String(input.date).slice(0, 7)
          : "");
    await (this.prisma as any).$executeRawUnsafe(
      `
        INSERT INTO hr_monthly_audit_logs
          (id, main_company_id, period, employee_id, entity_type, action, summary, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      randomUUID(),
      mainCompanyId,
      period,
      input.employeeId || null,
      input.entityType || "IK_AYLIK",
      input.action || "SAVE",
      String(input.summary || "Aylik IK islemi kaydedildi."),
      JSON.stringify(input.details || {}),
    );
  }

  async monthlyAuditLogs(query: AnyBody = {}) {
    await this.ensureMonthlyAuditLogTable();
    const mainCompanyId = this.mainCompanyId(query);
    const wherePeriod = query.year && query.month ? this.monthKey(query.year, query.month) : "";
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `
        SELECT * FROM hr_monthly_audit_logs
        WHERE main_company_id IN (${this.companyIdCandidates({ mainCompanyId })
          .map(() => "?")
          .join(",")})
          AND (? = '' OR period = ?)
          AND (? = '' OR employee_id = ?)
        ORDER BY datetime(created_at) DESC
        LIMIT ?
      `,
      ...this.companyIdCandidates({ mainCompanyId }),
      wherePeriod,
      wherePeriod,
      String(query.employeeId || ""),
      String(query.employeeId || ""),
      Math.min(500, Math.max(1, Number(query.limit || 200))),
    );
    return (rows as AnyBody[]).map((row) => this.mapMonthlyAuditLog(row));
  }

  private async ensureDefaultOfficialHolidays(year?: number) {
    if (year && year !== 2026) return;
    const model = this.model("officialHoliday");
    for (const [date, name] of DEFAULT_2026_OFFICIAL_HOLIDAYS) {
      await model.upsert({
        where: { id: `tr-${date}` },
        update: {
          date: this.dateOnly(date),
          name,
          year: 2026,
          active: true,
        },
        create: {
          id: `tr-${date}`,
          date: this.dateOnly(date),
          name,
          year: 2026,
          active: true,
        },
      });
    }
  }

  private async activeOfficialHolidayMap(year: number) {
    await this.ensureDefaultOfficialHolidays(year);
    const rows = await this.model("officialHoliday").findMany({
      where: { year, active: true },
    });
    return new Map<string, string>(
      rows.map((row: AnyBody) => [this.dateOnlyString(row.date), row.name]),
    );
  }

  private overtimeHourlyRate(employee: AnyBody = {}) {
    const baseHours = Math.max(1, this.number(employee.overtimeHourlyBase || 225));
    return this.number(employee.salary) / baseHours;
  }

  private overtimeMultiplier(dateValue: unknown, holidays: Map<string, string>) {
    const dateText = this.dateOnlyString(dateValue);
    if (holidays.has(dateText)) return 2;
    const parsed = this.dateOnly(dateText);
    const day = parsed.getUTCDay();
    return day === 0 || day === 6 ? 2 : 1.5;
  }

  private async calculateOvertimeAmount(
    employeeId: string,
    dateValue: unknown,
    hoursValue: unknown,
  ) {
    const employee = await this.model("hrMonthlyEmployee").findUnique({
      where: { id: employeeId },
    });
    if (!employee) return 0;
    const dateText = this.dateOnlyString(dateValue);
    const year = Number(dateText.slice(0, 4)) || new Date().getFullYear();
    const holidays = await this.activeOfficialHolidayMap(year);
    const multiplier = this.overtimeMultiplier(dateText, holidays);
    const amount =
      this.overtimeHourlyRate(employee) * this.number(hoursValue) * multiplier;
    return Math.round(amount * 100) / 100;
  }

  async officialHolidays(query: AnyBody = {}) {
    const year = Number(query.year || 2026);
    await this.ensureDefaultOfficialHolidays(year);
    const where: AnyBody = {};
    if (Number.isInteger(year)) where.year = year;
    if (query.active !== undefined) {
      where.active = query.active === true || String(query.active) === "true";
    }
    return this.model("officialHoliday").findMany({
      where,
      orderBy: { date: "asc" },
    });
  }

  async createOfficialHoliday(body: AnyBody = {}) {
    const date = this.dateOnly(body.date || body.tarih);
    const dateText = this.dateOnlyString(date);
    if (!dateText) throw new BadRequestException("Resmi tatil tarihi zorunlu.");
    const saved = await this.model("officialHoliday").upsert({
      where: { date },
      update: {
        name: body.name || body.ad || "Resmi tatil",
        year: Number(body.year || body.yil || dateText.slice(0, 4)),
        active: body.active !== false && body.aktif !== false,
      },
      create: {
        date,
        name: body.name || body.ad || "Resmi tatil",
        year: Number(body.year || body.yil || dateText.slice(0, 4)),
        active: body.active !== false && body.aktif !== false,
      },
    });
    await this.writeMonthlyAuditLog({
      mainCompanyId: this.mainCompanyId(body),
      period: dateText.slice(0, 7),
      entityType: "RESMI_TATIL",
      action: "UPSERT",
      summary: `${dateText} resmi tatil kaydedildi: ${saved.name}`,
      details: saved,
    });
    return saved;
  }

  async updateOfficialHoliday(id: string, body: AnyBody = {}) {
    const data: AnyBody = {};
    if (body.date || body.tarih) {
      const date = this.dateOnly(body.date || body.tarih);
      data.date = date;
      data.year = Number(body.year || body.yil || this.dateOnlyString(date).slice(0, 4));
    }
    if (body.name !== undefined || body.ad !== undefined) {
      data.name = body.name || body.ad || "Resmi tatil";
    }
    if (body.year !== undefined || body.yil !== undefined) {
      data.year = Number(body.year || body.yil);
    }
    if (body.active !== undefined || body.aktif !== undefined) {
      data.active = body.active === true || body.aktif === true || String(body.active ?? body.aktif) === "true";
    }
    const saved = await this.model("officialHoliday").update({ where: { id }, data });
    await this.writeMonthlyAuditLog({
      mainCompanyId: this.mainCompanyId(body),
      period: this.dateOnlyString(saved.date).slice(0, 7),
      entityType: "RESMI_TATIL",
      action: "UPDATE",
      summary: `${this.dateOnlyString(saved.date)} resmi tatil guncellendi: ${saved.name}`,
      details: saved,
    });
    return saved;
  }

  private async ensureMonthlyCodeAvailable(
    mainCompanyId: string,
    code: string | null,
    excludeId = "",
  ) {
    if (!code) return;
    const existing = await this.model("hrMonthlyEmployee").findFirst({
      where: { mainCompanyId, code },
      select: { id: true, fullName: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(
        `${code} personel kodu ${existing.fullName} üzerinde kayıtlı. Aynı kod ikinci kez kullanılamaz.`,
      );
    }
  }

  private normalizedPersonName(value: unknown) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleUpperCase("tr-TR");
  }

  private async ensureMonthlyPersonNameAvailable(
    mainCompanyId: string,
    fullName: string,
    excludeId = "",
  ) {
    const normalizedName = this.normalizedPersonName(fullName);
    if (!normalizedName) {
      throw new BadRequestException("Personel ad soyadı zorunludur.");
    }
    const rows = await this.model("hrMonthlyEmployee").findMany({
      where: { mainCompanyId },
      select: { id: true, code: true, fullName: true, status: true },
    });
    const existing = rows.find(
      (row: AnyBody) =>
        row.id !== excludeId &&
        this.normalizedPersonName(row.fullName) === normalizedName,
    );
    if (existing) {
      throw new BadRequestException(
        `${existing.fullName} adına ait personel kartı zaten mevcut${
          existing.code ? ` (${existing.code})` : ""
        }.`,
      );
    }
  }

  private monthlyStatus(value: unknown) {
    const raw = String(value || "Aktif").trim();
    if (raw.toUpperCase() === "ACTIVE") return "Aktif";
    if (raw.toUpperCase() === "PASSIVE") return "Pasif";
    return raw;
  }

  private normalizeSkillKey(value: unknown) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[ıİIi]/g, "i")
      .replace(/[şŞ]/g, "s")
      .replace(/[ğĞ]/g, "g")
      .replace(/[üÜ]/g, "u")
      .replace(/[öÖ]/g, "o")
      .replace(/[çÇ]/g, "c")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/(lari|leri|lar|ler)$/g, "")
      .replace(/\s+/g, "-");
  }

  private standardSkillName(value: unknown) {
    const key = this.normalizeSkillKey(value);
    if (key === "makinaci" || key === "makinac") return "Makinacı";
    if (key === "serimci") return "Serimci";
    if (key === "boyaci" || key === "boyac") return "Boyacı";
    if (key === "vasifsiz" || key === "vasifsz") return "Vasıfsız";
    if (!key) return "";
    return "Diğer";
  }

  private defaultSkillGroup(name: string) {
    const key = this.normalizeSkillKey(this.standardSkillName(name) || name);
    if (key === "makinaci") return "Makinacı";
    if (key === "serimci") return "Serimciler";
    if (key === "boyaci") return "Boyacı";
    if (key === "vasifsiz") return "Vasıfsız";
    return "Diğer";
  }

  private async ensureSkillTable() {
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS hr_skill_definitions (
        id TEXT PRIMARY KEY,
        main_company_id TEXT NOT NULL,
        name TEXT NOT NULL,
        normalized_key TEXT NOT NULL,
        group_title TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 500,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (main_company_id, normalized_key)
      )
    `);
  }

  private mapSkill(row: any) {
    return {
      id: row.id,
      mainCompanyId: row.main_company_id,
      name: row.name,
      normalizedKey: row.normalized_key,
      groupTitle: row.group_title,
      active: Boolean(row.active),
      sortOrder: Number(row.sort_order || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async seedSkillsFromExisting(mainCompanyId: string) {
    await this.ensureSkillTable();
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `
        SELECT qualification AS name FROM hr_daily_employees
        WHERE main_company_id = ? AND qualification IS NOT NULL AND trim(qualification) <> ''
        UNION
        SELECT title AS name FROM hr_monthly_employees
        WHERE main_company_id = ? AND title IS NOT NULL AND trim(title) <> ''
      `,
      mainCompanyId,
      mainCompanyId,
    );
    for (const row of rows as any[]) {
      const rawName = String(row.name || "").trim();
      const name = this.standardSkillName(rawName) || rawName;
      const normalizedKey = this.normalizeSkillKey(name);
      if (!normalizedKey) continue;
      await (this.prisma as any).$executeRawUnsafe(
        `
          INSERT INTO hr_skill_definitions
            (id, main_company_id, name, normalized_key, group_title, active, sort_order)
          VALUES (?, ?, ?, ?, ?, 1, 500)
          ON CONFLICT (main_company_id, normalized_key) DO NOTHING
        `,
        randomUUID(),
        mainCompanyId,
        name,
        normalizedKey,
        this.defaultSkillGroup(name),
      );
    }
  }

  async skills(query: AnyBody = {}) {
    const mainCompanyId = this.mainCompanyId(query);
    await this.seedSkillsFromExisting(mainCompanyId);
    const whereActive = query.includePassive ? "" : "AND active = true";
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `
        SELECT * FROM hr_skill_definitions
        WHERE main_company_id = ? ${whereActive.replace("true", "1")}
        ORDER BY sort_order ASC, group_title ASC, name ASC
      `,
      mainCompanyId,
    );
    return (rows as any[]).map((row) => this.mapSkill(row));
  }

  async createSkill(body: AnyBody = {}) {
    const mainCompanyId = this.mainCompanyId(body);
    await this.ensureSkillTable();
    const name = this.standardSkillName(body.name) || String(body.name || "").trim();
    if (!name) throw new BadRequestException("Vasıf adı zorunlu.");
    const normalizedKey = this.normalizeSkillKey(name);
    const existing = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM hr_skill_definitions WHERE main_company_id = ? AND normalized_key = ? LIMIT 1`,
      mainCompanyId,
      normalizedKey,
    );
    if ((existing as any[]).length) {
      throw new BadRequestException(
        `Bu vasıf zaten mevcut: ${(existing as any[])[0].name}`,
      );
    }
    const id = randomUUID();
    await (this.prisma as any).$executeRawUnsafe(
      `
        INSERT INTO hr_skill_definitions
          (id, main_company_id, name, normalized_key, group_title, active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      id,
      mainCompanyId,
      name,
      normalizedKey,
      body.groupTitle || this.defaultSkillGroup(name),
      body.active === false ? 0 : 1,
      Number(body.sortOrder || 500),
    );
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM hr_skill_definitions WHERE id = ? LIMIT 1`,
      id,
    );
    return this.mapSkill((rows as any[])[0]);
  }

  async updateSkill(id: string, body: AnyBody = {}) {
    await this.ensureSkillTable();
    const currentRows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM hr_skill_definitions WHERE id = ? LIMIT 1`,
      id,
    );
    const current = (currentRows as any[])[0];
    if (!current) throw new NotFoundException("Vasıf bulunamadı.");
    const name =
      this.standardSkillName(body.name ?? current.name) ||
      String(body.name ?? current.name).trim();
    const normalizedKey = this.normalizeSkillKey(name);
    await (this.prisma as any).$executeRawUnsafe(
      `
        UPDATE hr_skill_definitions
        SET name = ?,
            normalized_key = ?,
            group_title = ?,
            active = ?,
            sort_order = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      name,
      normalizedKey,
      body.groupTitle ?? current.group_title,
      (body.active ?? current.active) ? 1 : 0,
      Number(body.sortOrder ?? current.sort_order),
      id,
    );
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT * FROM hr_skill_definitions WHERE id = ? LIMIT 1`,
      id,
    );
    return this.mapSkill((rows as any[])[0]);
  }

  async skillDuplicates(query: AnyBody = {}) {
    const mainCompanyId = this.mainCompanyId(query);
    await this.seedSkillsFromExisting(mainCompanyId);
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `
        SELECT normalized_key, group_concat(name, ', ') AS names, count(*) AS count
        FROM hr_skill_definitions
        WHERE main_company_id = ?
        GROUP BY normalized_key
        HAVING count(*) > 1
      `,
      mainCompanyId,
    );
    return rows;
  }

  async mergeSkills(body: AnyBody = {}) {
    const sourceId = String(body.sourceId || "");
    const targetId = String(body.targetId || "");
    if (!sourceId || !targetId || sourceId === targetId) {
      throw new BadRequestException("Kaynak ve hedef vasıf seçilmeli.");
    }
    await this.ensureSkillTable();
    return (this.prisma as any).$transaction(async (tx: any) => {
      const sourceRows = await tx.$queryRawUnsafe(
        `SELECT * FROM hr_skill_definitions WHERE id = ? LIMIT 1`,
        sourceId,
      );
      const targetRows = await tx.$queryRawUnsafe(
        `SELECT * FROM hr_skill_definitions WHERE id = ? LIMIT 1`,
        targetId,
      );
      const source = sourceRows[0];
      const target = targetRows[0];
      if (!source || !target) throw new NotFoundException("Vasıf bulunamadı.");
      const daily = await tx.$executeRawUnsafe(
        `UPDATE hr_daily_employees SET qualification = ?, updated_at = CURRENT_TIMESTAMP WHERE main_company_id = ? AND qualification = ?`,
        target.name,
        target.main_company_id,
        source.name,
      );
      const monthly = await tx.$executeRawUnsafe(
        `UPDATE hr_monthly_employees SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE main_company_id = ? AND title = ?`,
        target.name,
        target.main_company_id,
        source.name,
      );
      await tx.$executeRawUnsafe(
        `UPDATE hr_skill_definitions SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        sourceId,
      );
      return { source: this.mapSkill(source), target: this.mapSkill(target), daily, monthly };
    });
  }

  private async skillNameById(id?: string) {
    if (!id) return "";
    await this.ensureSkillTable();
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT name FROM hr_skill_definitions WHERE id = ? LIMIT 1`,
      id,
    );
    return String((rows as any[])[0]?.name || "");
  }

  private monthlyPayload(body: AnyBody = {}) {
    const sgkStatus = this.normalizeSgkStatus(body.sgkStatus);
    const salary = this.number(body.salary);
    const roadAllowance = this.number(body.roadAllowance);
    const requestedPaymentType =
      body.bankPaymentType ||
      body.paymentChannel ||
      body.bankPayment ||
      (sgkStatus === "YOK" ? "Elden" : "Banka + Elden");
    const paymentTotal =
      this.number(body.total) ||
      (this.number(body.bankAmount) + this.number(body.cashAmount) > 0
        ? this.number(body.bankAmount) + this.number(body.cashAmount)
        : salary + roadAllowance);
    const bankAmount = this.resolveBankAmount({
      totalAmount: paymentTotal,
      sgkStatus,
      paymentType: requestedPaymentType,
      bankAmount: body.bankAmount,
    });
    const cashAmount = Math.max(paymentTotal - bankAmount, 0);
    const bankPaymentType =
      bankAmount > 0 && cashAmount > 0
        ? "Banka + Elden"
        : bankAmount > 0
          ? "Banka"
          : "Elden";
    return {
      code: this.monthlyCode(body.code || body.personnelCode),
      fullName: String(body.fullName || body.adSoyad || "").replace(/\s+/g, " ").trim(),
      department: body.department || null,
      title: body.title || null,
      workType: body.workType || "Aylık",
      sgkStatus,
      status: this.monthlyStatus(body.status),
      hireDate:
        body.hireDate || body.startDate
          ? this.date(body.hireDate || body.startDate)
          : null,
      salary,
      roadAllowance,
      bankPaymentType,
      bankAmount,
      cashAmount,
      overtimeHourlyBase: this.number(
        body.overtimeHourlyBase || body.overtimeBaseHours || 225,
      ),
      annualLeaveEntitlement: this.number(
        body.annualLeaveEntitlement ?? body.annualLeaveDays ?? 14,
      ),
      annualLeaveCarryover: this.number(
        body.annualLeaveCarryover ?? body.previousYearLeave ?? 0,
      ),
      note: body.note || null,
    };
  }

  private mapMonthlyEmployee(row: any) {
    return {
      id: row.id,
      mainCompanyId: row.mainCompanyId,
      code: row.code,
      personnelCode: this.monthlyCode(row.code),
      fullName: row.fullName,
      department: row.department || "",
      title: row.title || "",
      workType: row.workType || "Aylık",
      sgkStatus: row.sgkStatus || "VAR",
      status: this.monthlyStatus(row.status),
      hireDate: row.hireDate,
      startDate: row.hireDate ? row.hireDate.toISOString().slice(0, 10) : "",
      salary: this.number(row.salary),
      roadAllowance: this.number(row.roadAllowance),
      paymentChannel: row.bankPaymentType || "Banka + Elden",
      bankPaymentType: row.bankPaymentType || "Banka + Elden",
      bankAmount: this.number(row.bankAmount),
      cashAmount: this.number(row.cashAmount),
      overtimeBaseHours: this.number(row.overtimeHourlyBase || 225),
      overtimeHourlyBase: this.number(row.overtimeHourlyBase || 225),
      annualLeaveEntitlement: this.number(row.annualLeaveEntitlement ?? 14),
      annualLeaveCarryover: this.number(row.annualLeaveCarryover ?? 0),
      note: row.note || "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapLegacyMonthlyEmployee(row: AnyBody) {
    const active = row.is_active !== false && row.is_active !== 0;
    return this.mapMonthlyEmployee({
      id: row.id,
      mainCompanyId: this.canonicalCompanyId(row.main_company_slug),
      code: row.code,
      fullName: row.full_name,
      department: row.department,
      title: row.title,
      workType: "Aylık",
      sgkStatus: row.sgk_status || "VAR",
      status: active ? "Aktif" : "Pasif",
      hireDate: row.hire_date ? this.date(row.hire_date) : null,
      salary: row.monthly_salary,
      roadAllowance: row.monthly_road_fee,
      bankPaymentType:
        row.payment_type === "BANKA"
          ? "Banka"
          : row.payment_type === "ELDEN"
            ? "Elden"
            : "Banka + Elden",
      bankAmount: row.bank_base_amount,
      cashAmount: 0,
      overtimeHourlyBase: row.monthly_hour_base || 225,
      annualLeaveEntitlement: row.current_year_leave_earned ?? 14,
      annualLeaveCarryover: row.previous_year_leave_carry ?? 0,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async monthlyEmployees(query: AnyBody = {}) {
    for (const companyId of this.companyIdCandidates(query)) {
      const where: AnyBody = { mainCompanyId: companyId };
      if (query.status) where.status = query.status;
      const rows = await this.model("hrMonthlyEmployee").findMany({
        where,
        orderBy: { code: "asc" },
      });
      const liveRows = rows.filter((row: AnyBody) => !this.isLiveMonthlyTestEmployee(row));
      if (liveRows.length) return liveRows.map((row: AnyBody) => this.mapMonthlyEmployee(row));
    }
    for (const companyId of this.companyIdCandidates(query)) {
      const legacyRows = await this.model("hr_monthly_personnel").findMany({
        where: {
          main_company_slug: companyId,
          ...(query.status
            ? { is_active: this.monthlyStatus(query.status) !== "Pasif" }
            : {}),
        },
        orderBy: { full_name: "asc" },
      });
      const liveLegacyRows = legacyRows.filter((row: AnyBody) => !this.isLiveMonthlyTestEmployee(row));
      if (liveLegacyRows.length) {
        return liveLegacyRows.map((row: AnyBody) => this.mapLegacyMonthlyEmployee(row));
      }
    }
    return [];
  }

  monthlyEmployee(id: string) {
    return this.model("hrMonthlyEmployee")
      .findUnique({ where: { id } })
      .then((row: any) => (row ? this.mapMonthlyEmployee(row) : row));
  }

  async createMonthlyEmployee(body: AnyBody = {}) {
    const mainCompanyId = this.mainCompanyId(body);
    const payload = this.monthlyPayload(body);
    payload.code = payload.code || (await this.nextMonthlyCode(mainCompanyId));
    await this.ensureMonthlyCodeAvailable(mainCompanyId, payload.code);
    await this.ensureMonthlyPersonNameAvailable(mainCompanyId, payload.fullName);
    const row = await this.model("hrMonthlyEmployee").create({
      data: {
        mainCompanyId,
        ...payload,
      },
    });
    await this.writeMonthlyAuditLog({
      mainCompanyId,
      employeeId: row.id,
      entityType: "PERSONEL",
      action: "CREATE",
      summary: `${row.fullName} aylik personel karti acildi.`,
      details: this.mapMonthlyEmployee(row),
    });
    return this.mapMonthlyEmployee(row);
  }

  async updateMonthlyEmployee(id: string, body: AnyBody = {}) {
    const current = await this.model("hrMonthlyEmployee").findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException("Aylık personel bulunamadı.");
    const payload = this.monthlyPayload({ ...current, ...body });
    await this.ensureMonthlyCodeAvailable(
      current.mainCompanyId,
      payload.code,
      id,
    );
    await this.ensureMonthlyPersonNameAvailable(
      current.mainCompanyId,
      payload.fullName,
      id,
    );
    const row = await this.model("hrMonthlyEmployee").update({
      where: { id },
      data: payload,
    });
    await this.writeMonthlyAuditLog({
      mainCompanyId: row.mainCompanyId,
      employeeId: row.id,
      entityType: "PERSONEL",
      action: "UPDATE",
      summary: `${row.fullName} aylik personel karti guncellendi.`,
      details: { before: current, after: this.mapMonthlyEmployee(row) },
    });
    return this.mapMonthlyEmployee(row);
  }

  async updateMonthlyLeaveBalances(body: AnyBody = {}) {
    const ids = Array.isArray(body.employeeIds)
      ? body.employeeIds.map((id: unknown) => String(id || "")).filter(Boolean)
      : [];
    if (!ids.length) {
      throw new BadRequestException("Guncellenecek personel secilmedi.");
    }
    const data = {
      annualLeaveEntitlement: this.number(
        body.annualLeaveEntitlement ?? body.annualLeaveDays ?? 14,
      ),
      annualLeaveCarryover: this.number(
        body.annualLeaveCarryover ?? body.previousYearLeave ?? 0,
      ),
    };
    await this.model("hrMonthlyEmployee").updateMany({
      where: { id: { in: ids } },
      data,
    });
    const rows = await this.model("hrMonthlyEmployee").findMany({
      where: { id: { in: ids } },
      orderBy: { code: "asc" },
    });
    const mainCompanyId = rows[0]?.mainCompanyId || this.mainCompanyId(body);
    await this.writeMonthlyAuditLog({
      mainCompanyId,
      entityType: "IZIN_BAKIYE",
      action: "BULK_UPDATE",
      summary: `${rows.length} personel izin hak/devir bakiyesi toplu guncellendi.`,
      details: { employeeIds: ids, ...data },
    });
    return rows.map((row: AnyBody) => this.mapMonthlyEmployee(row));
  }

  async deleteMonthlyEmployee(id: string) {
    const current = await this.model("hrMonthlyEmployee").findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException("Aylık personel bulunamadı.");
    const row = await this.model("hrMonthlyEmployee").update({
      where: { id },
      data: { status: "Pasif" },
    });
    await this.writeMonthlyAuditLog({
      mainCompanyId: row.mainCompanyId,
      employeeId: row.id,
      entityType: "PERSONEL",
      action: "PASSIVE",
      summary: `${row.fullName} aylik personel karti pasife alindi.`,
      details: this.mapMonthlyEmployee(row),
    });
    return this.mapMonthlyEmployee(row);
  }

  salaryContracts(employeeId: string) {
    return this.model("hrSalaryContract").findMany({
      where: { employeeId },
      orderBy: { effectiveDate: "desc" },
    });
  }

  async createSalaryContract(employeeId: string, body: AnyBody = {}) {
    const saved = await this.model("hrSalaryContract").create({
      data: {
        employeeId,
        salary: this.number(body.salary),
        roadAllowance: this.number(body.roadAllowance),
        bankPaymentType: body.bankPaymentType || "BANK_CASH",
        bankAmount: this.number(body.bankAmount),
        cashAmount: this.number(body.cashAmount),
        contractType: body.contractType || null,
        contractStart: this.date(body.contractStart || body.contractStartDate),
        contractEnd:
          body.contractEnd || body.contractEndDate
            ? this.date(body.contractEnd || body.contractEndDate)
            : null,
        effectiveDate: this.date(body.effectiveDate),
        note: body.note || null,
      },
    });
    await this.writeMonthlyAuditLog({
      employeeId,
      period: this.dateOnlyString(saved.effectiveDate).slice(0, 7),
      entityType: "MAAS_SOZLESME",
      action: "CREATE",
      summary: `Maas sozlesmesi kaydedildi: ${this.number(saved.salary)} + yol ${this.number(saved.roadAllowance)}.`,
      details: saved,
    });
    return saved;
  }

  private async monthlyEmployeeIds(mainCompanyId: string) {
    const rows = await this.model("hrMonthlyEmployee").findMany({
      where: {
        mainCompanyId: {
          in: this.companyIdCandidates({ mainCompanyId }),
        },
      },
      select: { id: true },
    });
    return rows.map((row: any) => row.id);
  }

  private async monthlyAdjustmentsRaw(employeeIds: string[], range?: { start: Date; end: Date } | null) {
    if (!employeeIds.length) return [];
    const placeholders = employeeIds.map(() => "?").join(",");
    const params: any[] = [...employeeIds];
    let where = `employee_id IN (${placeholders})`;
    if (range) {
      where += ` AND substr(CAST(date AS TEXT), 1, 10) >= ? AND substr(CAST(date AS TEXT), 1, 10) < ?`;
      params.push(range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10));
    }
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT id, employee_id as employeeId, CAST(date AS TEXT) as date, adjustment_type as adjustmentType, hour_or_day as hourOrDay, amount, payroll_effect as payrollEffect, note, status, CAST(created_at AS TEXT) as createdAt
       FROM hr_monthly_adjustments_v2
       WHERE ${where}
       ORDER BY substr(CAST(date AS TEXT), 1, 10) DESC`,
      ...params,
    );
    return rows.map((row: AnyBody) => ({
      ...row,
      date: this.dateOnlyString(row.date) || row.date,
      createdAt: this.dateOnlyString(row.createdAt) || row.createdAt,
    }));
  }

  async leaves(query: AnyBody = {}) {
    const where: AnyBody = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    else
      where.employeeId = {
        in: await this.monthlyEmployeeIds(this.mainCompanyId(query)),
      };
    return this.model("hrLeaveRecord").findMany({
      where,
      orderBy: { startDate: "desc" },
    });
  }

  async createLeave(body: AnyBody = {}) {
    body.recordType = body.recordType || body.type;
    body.effectType = body.effectType || body.effect;
    const saved = await this.model("hrLeaveRecord").create({
      data: {
        employeeId: body.employeeId || body.personId,
        recordType: body.recordType || "Yıllık izin",
        effectType: body.effectType || "Yıllık izinden düş",
        startDate: this.date(body.startDate || body.start),
        endDate: this.date(body.endDate || body.end),
        dayCount: this.number(body.dayCount ?? body.days ?? 1),
        documentPath: body.documentPath || body.document || null,
        note: body.note || body.description || null,
      },
    });
    await this.writeMonthlyAuditLog({
      employeeId: saved.employeeId,
      period: this.dateOnlyString(saved.startDate).slice(0, 7),
      entityType: "IZIN",
      action: "CREATE",
      summary: `${saved.recordType} izin kaydi eklendi: ${this.number(saved.dayCount)} gun.`,
      details: saved,
    });
    return saved;
  }

  async updateLeave(id: string, body: AnyBody = {}) {
    const data: AnyBody = {};
    if (body.employeeId || body.personId)
      data.employeeId = body.employeeId || body.personId;
    if (body.recordType || body.type)
      data.recordType = body.recordType || body.type;
    if (body.effectType || body.effect)
      data.effectType = body.effectType || body.effect;
    if (body.startDate || body.start) data.startDate = this.date(body.startDate || body.start);
    if (body.endDate || body.end) data.endDate = this.date(body.endDate || body.end);
    if (body.dayCount !== undefined || body.days !== undefined)
      data.dayCount = this.number(body.dayCount ?? body.days);
    if (body.documentPath !== undefined || body.document !== undefined)
      data.documentPath = body.documentPath || body.document || null;
    if (body.note !== undefined || body.description !== undefined)
      data.note = body.note || body.description || null;
    const saved = await this.model("hrLeaveRecord").update({ where: { id }, data });
    await this.writeMonthlyAuditLog({
      employeeId: saved.employeeId,
      period: this.dateOnlyString(saved.startDate).slice(0, 7),
      entityType: "IZIN",
      action: "UPDATE",
      summary: `${saved.recordType} izin kaydi guncellendi: ${this.number(saved.dayCount)} gun.`,
      details: saved,
    });
    return saved;
  }
  async deleteLeave(id: string) {
    const deleted = await this.model("hrLeaveRecord").delete({ where: { id } });
    await this.writeMonthlyAuditLog({
      employeeId: deleted.employeeId,
      period: this.dateOnlyString(deleted.startDate).slice(0, 7),
      entityType: "IZIN",
      action: "DELETE",
      summary: `${deleted.recordType} izin kaydi silindi.`,
      details: deleted,
    });
    return deleted;
  }

  async adjustments(query: AnyBody = {}) {
    const employeeIds = query.employeeId
      ? [String(query.employeeId)]
      : await this.monthlyEmployeeIds(this.mainCompanyId(query));
    const range = this.monthDateRange(query.year, query.month);
    return this.monthlyAdjustmentsRaw(employeeIds, range);
  }

  async createAdjustment(body: AnyBody = {}) {
    const adjustmentType = body.adjustmentType || body.type || "Mesai";
    const payrollEffect = this.payrollEffectForType(
      adjustmentType,
      body.payrollEffect,
    );
    const hourOrDay = this.number(body.hourOrDay ?? body.hours);
    const amount =
      payrollEffect === "Yıllık izinden düş"
        ? 0
        : adjustmentType === "Mesai" && body.amountManual !== true
          ? await this.calculateOvertimeAmount(
              body.employeeId || body.personId,
              body.date,
              hourOrDay,
            )
          : this.number(body.amount);
    const saved = await this.model("hrMonthlyAdjustment").create({
      data: {
        employeeId: body.employeeId || body.personId,
        date: this.date(body.date),
        adjustmentType,
        hourOrDay,
        amount,
        payrollEffect,
        note: body.note || body.description || null,
        status: body.status || "DRAFT",
      },
    });
    await this.writeMonthlyAuditLog({
      employeeId: saved.employeeId,
      period: this.dateOnlyString(saved.date).slice(0, 7),
      entityType: "MESAI_AVANS_KESINTI",
      action: "CREATE",
      summary: `${saved.adjustmentType} kaydi eklendi: ${this.number(saved.amount)}.`,
      details: saved,
    });
    return saved;
  }

  async updateAdjustment(id: string, body: AnyBody = {}) {
    const current = await this.model("hrMonthlyAdjustment").findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException("Mesai kaydı bulunamadı.");
    const adjustmentType = body.adjustmentType || body.type || current.adjustmentType;
    const data: AnyBody = {};
    if (body.employeeId || body.personId)
      data.employeeId = body.employeeId || body.personId;
    if (body.date) data.date = this.date(body.date);
    if (adjustmentType) data.adjustmentType = adjustmentType;
    if (body.hourOrDay !== undefined || body.hours !== undefined)
      data.hourOrDay = this.number(body.hourOrDay ?? body.hours);
    if (body.amount !== undefined) data.amount = this.number(body.amount);
    if (body.note !== undefined) data.note = body.note || null;
    if (body.status !== undefined) data.status = body.status || "DRAFT";
    data.payrollEffect = this.payrollEffectForType(
      adjustmentType,
      body.payrollEffect,
    );
    if (data.payrollEffect === "Yıllık izinden düş") {
      data.amount = 0;
    } else if (adjustmentType === "Mesai" && body.amountManual !== true) {
      data.amount = await this.calculateOvertimeAmount(
        data.employeeId || current.employeeId,
        data.date || current.date,
        data.hourOrDay ?? current.hourOrDay,
      );
    }
    const saved = await this.model("hrMonthlyAdjustment").update({
      where: { id },
      data,
    });
    await this.writeMonthlyAuditLog({
      employeeId: saved.employeeId,
      period: this.dateOnlyString(saved.date).slice(0, 7),
      entityType: "MESAI_AVANS_KESINTI",
      action: "UPDATE",
      summary: `${saved.adjustmentType} kaydi guncellendi: ${this.number(saved.amount)}.`,
      details: { before: current, after: saved },
    });
    return saved;
  }
  async deleteAdjustment(id: string) {
    const deleted = await this.model("hrMonthlyAdjustment").delete({ where: { id } });
    await this.writeMonthlyAuditLog({
      employeeId: deleted.employeeId,
      period: this.dateOnlyString(deleted.date).slice(0, 7),
      entityType: "MESAI_AVANS_KESINTI",
      action: "DELETE",
      summary: `${deleted.adjustmentType} kaydi silindi: ${this.number(deleted.amount)}.`,
      details: deleted,
    });
    return deleted;
  }

  async calculatePayroll(body: AnyBody = {}) {
    const mainCompanyId = this.mainCompanyId(body);
    const year = Number(body.year || new Date().getFullYear());
    const month = Number(body.month || new Date().getMonth() + 1);
    const employees = await this.model("hrMonthlyEmployee").findMany({
      where: { mainCompanyId: { in: this.companyIdCandidates(body) } },
    });
    const employeeIds = employees.map((employee: AnyBody) => employee.id);
    const range = this.monthDateRange(year, month);
    const adjustments = await this.monthlyAdjustmentsRaw(employeeIds, range);
    return employees.map((employee: any) =>
      this.payrollRow(employee, adjustments, year, month, mainCompanyId),
    );
  }

  private payrollRow(
    employee: any,
    adjustments: any[],
    year: number,
    month: number,
    mainCompanyId: string,
  ) {
    const own = adjustments.filter((item) => item.employeeId === employee.id);
    const overtimeAmount = own
      .filter((item) =>
        ["Mesai", "Yol farkı", "Maaş farkı"].includes(item.adjustmentType),
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const premiumAmount = own
      .filter((item) => item.adjustmentType === "Prim")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const deductionAmount = own
      .filter((item) => this.adjustmentDirection(item) < 0)
      .filter((item) => item.adjustmentType !== "Avans")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const advanceAmount = own
      .filter((item) => item.adjustmentType === "Avans")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalAmount =
      Number(employee.salary || 0) +
      Number(employee.roadAllowance || 0) +
      overtimeAmount +
      premiumAmount -
      deductionAmount -
      advanceAmount;
    const paymentType = String(employee.bankPaymentType || "");
    const bankAmount = this.resolveBankAmount({
      totalAmount,
      sgkStatus: employee.sgkStatus,
      paymentType,
      bankAmount: employee.bankAmount,
    });
    const cashAmount = Math.max(totalAmount - bankAmount, 0);
    return {
      mainCompanyId,
      year,
      month,
      employeeId: employee.id,
      salary: employee.salary,
      roadAllowance: employee.roadAllowance,
      overtimeAmount,
      premiumAmount,
      deductionAmount,
      advanceAmount,
      bankAmount,
      cashAmount,
      totalAmount,
      status: "DRAFT",
    };
  }

  async savePayroll(body: AnyBody = {}) {
    const rows = Array.isArray(body.rows)
      ? body.rows
      : await this.calculatePayroll(body);
    const saved = [];
    for (const row of rows) {
      saved.push(
        await this.model("hrPayroll").upsert({
          where: {
            mainCompanyId_year_month_employeeId: {
              mainCompanyId: row.mainCompanyId,
              year: Number(row.year),
              month: Number(row.month),
              employeeId: row.employeeId,
            },
          },
          create: row,
          update: row,
        }),
      );
    }
    await this.writeMonthlyAuditLog({
      mainCompanyId: this.mainCompanyId(body),
      period: this.monthKey(body.year || rows[0]?.year, body.month || rows[0]?.month),
      entityType: "BORDRO",
      action: "SAVE",
      summary: `${saved.length} aylik bordro satiri kaydedildi.`,
      details: { count: saved.length },
    });
    return saved;
  }

  payroll(query: AnyBody = {}) {
    return this.model("hrPayroll").findMany({
      where: {
        mainCompanyId: { in: this.companyIdCandidates(query) },
        year: query.year ? Number(query.year) : undefined,
        month: query.month ? Number(query.month) : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async approvePayment(body: AnyBody = {}) {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const result = await this.model("hrPayroll").updateMany({
      where: { id: { in: ids } },
      data: { status: "PAID" },
    });
    await this.writeMonthlyAuditLog({
      mainCompanyId: this.mainCompanyId(body),
      period: this.monthKey(body.year, body.month),
      entityType: "BORDRO_ODEME",
      action: "APPROVE",
      summary: `${result.count || 0} bordro odemesi onaylandi.`,
      details: { ids },
    });
    return result;
  }

  payrollSlips(query: AnyBody = {}) {
    return this.payroll(query);
  }
  payrollControlSheet(query: AnyBody = {}) {
    return this.payroll(query);
  }

  async documents(query: AnyBody = {}) {
    const where: AnyBody = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    else
      where.employeeId = {
        in: await this.monthlyEmployeeIds(this.mainCompanyId(query)),
      };
    return this.model("hrEmployeeDocument").findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }
  async createDocument(body: AnyBody = {}) {
    const saved = await this.model("hrEmployeeDocument").create({
      data: {
        employeeId: body.employeeId || body.personId,
        documentType: body.documentType || body.type || "Evrak",
        fileName: body.fileName || body.file || body.filePath || "evrak",
        filePath: body.filePath || body.file || null,
        date: this.date(body.date),
        status: body.status || "WAITING",
      },
    });
    await this.writeMonthlyAuditLog({
      employeeId: saved.employeeId,
      period: this.dateOnlyString(saved.date).slice(0, 7),
      entityType: "EVRAK",
      action: "CREATE",
      summary: `${saved.documentType} evraki kaydedildi: ${saved.fileName}.`,
      details: saved,
    });
    return saved;
  }
  async deleteDocument(id: string) {
    const deleted = await this.model("hrEmployeeDocument").delete({ where: { id } });
    await this.writeMonthlyAuditLog({
      employeeId: deleted.employeeId,
      period: this.dateOnlyString(deleted.date).slice(0, 7),
      entityType: "EVRAK",
      action: "DELETE",
      summary: `${deleted.documentType} evraki silindi: ${deleted.fileName}.`,
      details: deleted,
    });
    return deleted;
  }

  async monthlyBackupExcel(query: AnyBody = {}) {
    const mainCompanyId = this.mainCompanyId(query);
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    const period = this.monthKey(year, month);
    const employees = await this.monthlyEmployees({ mainCompanyId, includePassive: true });
    const employeeIds = employees.map((employee: AnyBody) => employee.id).filter(Boolean);
    const employeeById = new Map<string, AnyBody>(
      employees.map((employee: AnyBody) => [employee.id, employee]),
    );
    const payrollRows = await this.calculatePayroll({ mainCompanyId, year, month });
    const adjustmentRows = await this.adjustments({ mainCompanyId, year, month });
    const leaveRows = await this.leaves({ mainCompanyId });
    const documentRows = await this.documents({ mainCompanyId });
    const contractRows = employeeIds.length
      ? await this.model("hrSalaryContract").findMany({
          where: { employeeId: { in: employeeIds } },
          orderBy: { effectiveDate: "desc" },
        })
      : [];
    const logs = await this.monthlyAuditLogs({ mainCompanyId, year, month, limit: 500 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "KY ERP";
    workbook.created = new Date();
    workbook.modified = new Date();

    const addSheet = (name: string, columns: AnyBody[], rows: AnyBody[]) => {
      const sheet = workbook.addWorksheet(name);
      sheet.columns = columns;
      rows.forEach((row) => sheet.addRow(row));
      return sheet;
    };
    const employeeName = (id: string) =>
      employeeById.get(id)?.fullName || employeeById.get(id)?.adSoyad || id || "-";

    addSheet(
      "Ozet",
      [
        { header: "Alan", key: "label", width: 28 },
        { header: "Deger", key: "value", width: 28 },
      ],
      [
        { label: "Firma", value: mainCompanyId },
        { label: "Donem", value: period },
        { label: "Personel", value: employees.length },
        { label: "Bordro satiri", value: payrollRows.length },
        { label: "Mesai/avans/kesinti", value: adjustmentRows.length },
        { label: "Izin", value: leaveRows.length },
        { label: "Evrak", value: documentRows.length },
        { label: "Log", value: logs.length },
      ],
    );

    addSheet(
      "Bordro",
      [
        { header: "Kod", key: "code", width: 14 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Maas", key: "salary", width: 14 },
        { header: "Yol", key: "road", width: 14 },
        { header: "Mesai", key: "overtime", width: 14 },
        { header: "Prim", key: "premium", width: 14 },
        { header: "Kesinti", key: "deduction", width: 14 },
        { header: "Avans", key: "advance", width: 14 },
        { header: "Banka", key: "bank", width: 14 },
        { header: "Elden", key: "cash", width: 14 },
        { header: "Toplam", key: "total", width: 14 },
      ],
      payrollRows.map((row: AnyBody) => {
        const person = employeeById.get(row.employeeId) || {};
        return {
          code: person.personnelCode || person.code || "",
          person: employeeName(row.employeeId),
          salary: this.number(row.salary),
          road: this.number(row.roadAllowance),
          overtime: this.number(row.overtimeAmount),
          premium: this.number(row.premiumAmount),
          deduction: this.number(row.deductionAmount),
          advance: this.number(row.advanceAmount),
          bank: this.number(row.bankAmount),
          cash: this.number(row.cashAmount),
          total: this.number(row.totalAmount),
        };
      }),
    );

    addSheet(
      "Personel",
      [
        { header: "Kod", key: "code", width: 14 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Departman", key: "department", width: 20 },
        { header: "Unvan", key: "title", width: 20 },
        { header: "SGK", key: "sgk", width: 10 },
        { header: "Durum", key: "status", width: 12 },
        { header: "Maas", key: "salary", width: 14 },
        { header: "Yol", key: "road", width: 14 },
        { header: "Banka tipi", key: "payment", width: 18 },
        { header: "Banka", key: "bank", width: 14 },
        { header: "Elden", key: "cash", width: 14 },
        { header: "Izin hak", key: "leaveRight", width: 12 },
        { header: "Devir", key: "carry", width: 12 },
      ],
      employees.map((employee: AnyBody) => ({
        code: employee.personnelCode || employee.code || "",
        person: employee.fullName,
        department: employee.department,
        title: employee.title,
        sgk: employee.sgkStatus,
        status: employee.status,
        salary: this.number(employee.salary),
        road: this.number(employee.roadAllowance),
        payment: employee.paymentChannel || employee.bankPaymentType,
        bank: this.number(employee.bankAmount),
        cash: this.number(employee.cashAmount),
        leaveRight: this.number(employee.annualLeaveEntitlement),
        carry: this.number(employee.annualLeaveCarryover),
      })),
    );

    addSheet(
      "Mesai Avans Kesinti",
      [
        { header: "Tarih", key: "date", width: 14 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Tip", key: "type", width: 18 },
        { header: "Saat/Gun", key: "hours", width: 12 },
        { header: "Tutar", key: "amount", width: 14 },
        { header: "Bordro etkisi", key: "effect", width: 20 },
        { header: "Durum", key: "status", width: 14 },
        { header: "Not", key: "note", width: 36 },
      ],
      adjustmentRows.map((row: AnyBody) => ({
        date: this.dateOnlyString(row.date),
        person: employeeName(row.employeeId),
        type: row.adjustmentType,
        hours: this.number(row.hourOrDay),
        amount: this.number(row.amount),
        effect: row.payrollEffect,
        status: row.status,
        note: row.note || "",
      })),
    );

    addSheet(
      "Izin",
      [
        { header: "Baslangic", key: "start", width: 14 },
        { header: "Bitis", key: "end", width: 14 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Tur", key: "type", width: 20 },
        { header: "Etki", key: "effect", width: 22 },
        { header: "Gun", key: "days", width: 10 },
        { header: "Evrak", key: "document", width: 26 },
        { header: "Not", key: "note", width: 36 },
      ],
      leaveRows.map((row: AnyBody) => ({
        start: this.dateOnlyString(row.startDate),
        end: this.dateOnlyString(row.endDate),
        person: employeeName(row.employeeId),
        type: row.recordType,
        effect: row.effectType,
        days: this.number(row.dayCount),
        document: row.documentPath || "",
        note: row.note || "",
      })),
    );

    addSheet(
      "Sozlesmeler",
      [
        { header: "Gecerli tarih", key: "effective", width: 16 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Maas", key: "salary", width: 14 },
        { header: "Yol", key: "road", width: 14 },
        { header: "Banka tipi", key: "payment", width: 18 },
        { header: "Banka", key: "bank", width: 14 },
        { header: "Elden", key: "cash", width: 14 },
        { header: "Tur", key: "type", width: 18 },
        { header: "Not", key: "note", width: 36 },
      ],
      contractRows.map((row: AnyBody) => ({
        effective: this.dateOnlyString(row.effectiveDate),
        person: employeeName(row.employeeId),
        salary: this.number(row.salary),
        road: this.number(row.roadAllowance),
        payment: row.bankPaymentType || "",
        bank: this.number(row.bankAmount),
        cash: this.number(row.cashAmount),
        type: row.contractType || "",
        note: row.note || "",
      })),
    );

    addSheet(
      "Evrak",
      [
        { header: "Tarih", key: "date", width: 14 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Tur", key: "type", width: 18 },
        { header: "Dosya", key: "file", width: 34 },
        { header: "Durum", key: "status", width: 14 },
      ],
      documentRows.map((row: AnyBody) => ({
        date: this.dateOnlyString(row.date),
        person: employeeName(row.employeeId),
        type: row.documentType,
        file: row.fileName,
        status: row.status,
      })),
    );

    addSheet(
      "Log",
      [
        { header: "Zaman", key: "created", width: 22 },
        { header: "Donem", key: "period", width: 12 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Bolum", key: "entity", width: 20 },
        { header: "Islem", key: "action", width: 14 },
        { header: "Ozet", key: "summary", width: 56 },
      ],
      logs.map((row: AnyBody) => ({
        created: String(row.createdAt || ""),
        period: row.period || "",
        person: employeeName(row.employeeId),
        entity: row.entityType,
        action: row.action,
        summary: row.summary,
      })),
    );

    this.styleWorkbook(workbook);
    return workbook.xlsx.writeBuffer();
  }
  private styleWorkbook(workbook: ExcelJS.Workbook) {
    workbook.eachSheet((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    });
  }
}
