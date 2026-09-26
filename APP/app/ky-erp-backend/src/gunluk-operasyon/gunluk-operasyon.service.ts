import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import AdmZip from "adm-zip";
import { randomUUID } from "crypto";
import * as ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";

type AnyBody = Record<string, any>;

@Injectable()
export class GunlukOperasyonService {
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

  private normalizedPersonName(value: unknown) {
      return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleUpperCase("tr-TR");
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

  private async skillNameById(id?: string) {
      if (!id) return "";
      await this.ensureSkillTable();
      const rows = await (this.prisma as any).$queryRawUnsafe(
        `SELECT name FROM hr_skill_definitions WHERE id = ? LIMIT 1`,
        id,
      );
      return String((rows as any[])[0]?.name || "");
    }

  private async ensureDailyEmployeeMetaTable() {
      await (this.prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS hr_daily_employee_meta (
          employee_id TEXT PRIMARY KEY,
          personnel_no TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          updated_at DATETIME NOT NULL
        )
      `);
    }

  private async saveDailyEmployeeMeta(employeeId: string, body: AnyBody = {}) {
      await this.ensureDailyEmployeeMetaTable();
      const currentRows = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT personnel_no, note FROM hr_daily_employee_meta WHERE employee_id = ?`,
        employeeId,
      )) as AnyBody[];
      const current = currentRows[0] || {};
      const hasPersonnelNo =
        Object.prototype.hasOwnProperty.call(body, "personnelNo") ||
        Object.prototype.hasOwnProperty.call(body, "personelNo");
      const hasNote =
        Object.prototype.hasOwnProperty.call(body, "note") ||
        Object.prototype.hasOwnProperty.call(body, "not");
      const requestedPersonnelNo = String(body.personnelNo || body.personelNo || "").trim();
      const requestedNote = String(body.note || body.not || "").trim();
      await (this.prisma as any).$executeRawUnsafe(
        `INSERT INTO hr_daily_employee_meta
          (employee_id, personnel_no, note, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(employee_id)
         DO UPDATE SET
           personnel_no = excluded.personnel_no,
           note = excluded.note,
           updated_at = CURRENT_TIMESTAMP`,
        employeeId,
        hasPersonnelNo ? requestedPersonnelNo : current.personnel_no || "",
        hasNote ? requestedNote : current.note || "",
      );
    }

  private dailyPersonnelCode(index: number) {
      return `HKN${String(index).padStart(3, "0")}`;
    }

  private dailyPersonnelCodeNumber(value: unknown) {
      const match = String(value || "").trim().toUpperCase().match(/^HKN(\d+)$/);
      return match ? Number(match[1]) : 0;
    }

  private async ensureDailyEmployeeCodes(rows: AnyBody[] = []) {
      if (!rows.length) return;
      await this.ensureDailyEmployeeMetaTable();
      const metaRows = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT employee_id, personnel_no, note FROM hr_daily_employee_meta`,
      )) as AnyBody[];
      const metaById = new Map<string, AnyBody>(
        metaRows.map((row) => [String(row.employee_id), row]),
      );
      const used = new Set(
        metaRows
          .map((row) => String(row.personnel_no || "").trim().toUpperCase())
          .filter(Boolean),
      );
      let nextNumber = Math.max(
        0,
        ...metaRows.map((row) => this.dailyPersonnelCodeNumber(row.personnel_no)),
      );
      for (const row of [...rows].sort((left, right) =>
        String(left.fullName || "").localeCompare(String(right.fullName || ""), "tr"),
      )) {
        const employeeId = String(row.id || "");
        if (!employeeId) continue;
        const current = metaById.get(employeeId) || {};
        if (String(current.personnel_no || "").trim()) continue;
        let code = "";
        do {
          nextNumber += 1;
          code = this.dailyPersonnelCode(nextNumber);
        } while (used.has(code));
        used.add(code);
        await (this.prisma as any).$executeRawUnsafe(
          `INSERT INTO hr_daily_employee_meta
            (employee_id, personnel_no, note, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(employee_id)
           DO UPDATE SET personnel_no = excluded.personnel_no, updated_at = CURRENT_TIMESTAMP`,
          employeeId,
          code,
          current.note || "",
        );
      }
    }

  async dailyEmployees(query: AnyBody = {}) {
      await this.ensureDailyEmployeeMetaTable();
      let rows: AnyBody[] = [];
      for (const companyId of this.companyIdCandidates(query)) {
        const where: AnyBody = { mainCompanyId: companyId };
        if (query.status) where.status = query.status;
        else if (!query.includePassive) where.status = "ACTIVE";
        rows = await this.model("hrDailyEmployee").findMany({
          where,
          orderBy: { fullName: "asc" },
        });
        if (rows.length) break;
      }
      if (!rows.length) {
        for (const companyId of this.companyIdCandidates(query)) {
          const legacyRows = await this.model("hr_daily_personnel").findMany({
            where: {
              main_company_slug: companyId,
              ...(query.status || !query.includePassive
                ? { is_active: String(query.status || "ACTIVE").toUpperCase() !== "PASSIVE" }
                : {}),
            },
            orderBy: { full_name: "asc" },
          });
          if (legacyRows.length) {
            rows = legacyRows.map((row: AnyBody) => ({
              id: row.id,
              mainCompanyId: this.canonicalCompanyId(row.main_company_slug),
              fullName: row.full_name,
              qualification: row.skill,
              dayWage: row.day_wage,
              nightWage: row.night_wage,
              broker: row.has_broker ? "Aracı" : "",
              status: row.is_active === false || row.is_active === 0 ? "PASSIVE" : "ACTIVE",
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }));
            break;
          }
        }
      }
      await this.ensureDailyEmployeeCodes(rows);
      const metaRows = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT employee_id, personnel_no, note FROM hr_daily_employee_meta`,
      )) as AnyBody[];
      const metaById = new Map<string, AnyBody>(
        metaRows.map((row) => [String(row.employee_id), row]),
      );
      return rows.map((row: AnyBody) => {
        const meta = metaById.get(String(row.id)) || {};
        return {
          ...row,
          personnelNo: meta.personnel_no || "",
          note: meta.note || "",
          qualification: this.standardSkillName(row.qualification) || row.qualification,
        };
      });
    }

  private async dailyEmployeePayload(body: AnyBody = {}, mainCompanyId?: string) {
      const skillName = await this.skillNameById(body.skillId || body.qualificationId);
      const qualification = this.standardSkillName(
        skillName || body.qualification || body.role,
      );
      return {
        mainCompanyId: mainCompanyId || this.mainCompanyId(body),
        fullName: String(body.fullName || body.name || "").replace(/\s+/g, " ").trim(),
        qualification: qualification || null,
        dayWage: this.number(body.dayWage ?? body.dayRate),
        nightWage: this.number(body.nightWage ?? body.nightRate),
        broker: body.broker || null,
        status:
          String(body.status || body.active || "ACTIVE").toUpperCase() ===
          "PASSIVE"
            ? "PASSIVE"
            : "ACTIVE",
      };
    }

  async createDailyEmployee(body: AnyBody = {}) {
      const payload = await this.dailyEmployeePayload(body);
      if (!payload.fullName) {
        throw new BadRequestException("Günlük personel ad soyadı zorunludur.");
      }
      const normalizedName = String(payload.fullName || "")
        .trim()
        .toLocaleUpperCase("tr-TR");
      const rows = await this.model("hrDailyEmployee").findMany({
        where: { mainCompanyId: payload.mainCompanyId },
      });
      const existing = rows.find(
        (row: AnyBody) =>
          String(row.fullName || "").trim().toLocaleUpperCase("tr-TR") ===
          normalizedName,
      );
      if (existing) {
        const updated = await this.model("hrDailyEmployee").update({
          where: { id: existing.id },
          data: { ...payload, status: "ACTIVE" },
        });
        await this.saveDailyEmployeeMeta(updated.id, body);
        return updated;
      }
      const created = await this.model("hrDailyEmployee").create({
        data: payload,
      });
      await this.saveDailyEmployeeMeta(created.id, body);
      return created;
    }

  async updateDailyEmployee(id: string, body: AnyBody = {}) {
      const current = await this.model("hrDailyEmployee").findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException("Günlük personel bulunamadı.");
      const payload = await this.dailyEmployeePayload(
        { ...current, ...body },
        current.mainCompanyId,
      );
      if (!payload.fullName) {
        throw new BadRequestException("Günlük personel ad soyadı zorunludur.");
      }
      const duplicateRows = await this.model("hrDailyEmployee").findMany({
        where: { mainCompanyId: current.mainCompanyId },
        select: { id: true, fullName: true },
      });
      const duplicate = duplicateRows.find(
        (row: AnyBody) =>
          row.id !== id &&
          this.normalizedPersonName(row.fullName) ===
            this.normalizedPersonName(payload.fullName),
      );
      if (duplicate) {
        throw new BadRequestException(
          `${duplicate.fullName} adına ait günlük personel kartı zaten mevcut.`,
        );
      }
      const updated = await this.model("hrDailyEmployee").update({
        where: { id },
        data: payload,
      });
      await this.saveDailyEmployeeMeta(id, body);
      return updated;
    }

  async deleteDailyEmployee(id: string) {
      const current = await this.model("hrDailyEmployee").findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException("Günlük personel bulunamadı.");
      return this.model("hrDailyEmployee").update({
        where: { id },
        data: { status: "PASSIVE" },
      });
    }

  async dailyAttendance(query: AnyBody = {}) {
      const where: AnyBody = {};
      if (query.employeeId) where.employeeId = query.employeeId;
      else {
        const employees = await this.model("hrDailyEmployee").findMany({
          where: {
            mainCompanyId: {
              in: this.companyIdCandidates(query),
            },
          },
          select: { id: true },
        });
        where.employeeId = { in: employees.map((row: any) => row.id) };
      }
      if (query.start || query.end || query.dateFrom || query.dateTo) {
        where.workDate = {};
        if (query.start || query.dateFrom) {
          where.workDate.gte = this.dateOnly(query.start || query.dateFrom);
        }
        if (query.end || query.dateTo) {
          where.workDate.lte = this.dateOnly(query.end || query.dateTo);
        }
      }
      return this.model("hrDailyAttendance").findMany({
        where,
        orderBy: { workDate: "desc" },
      }).then((rows: any[]) =>
        rows.map((row) => ({
          ...row,
          workDate: this.dateOnlyString(row.workDate),
          date: this.dateOnlyString(row.workDate),
        })),
      );
    }

  async saveDailyRange(body: AnyBody = {}) {
      const rawRows = Array.isArray(body.rows) ? body.rows : [];
      const enforceCompany =
        Boolean(body.mainCompanyId) || Boolean(body.mainCompanySlug);
      const allowedCompanyIds = enforceCompany
        ? new Set(this.companyIdCandidates(body))
        : null;
      const rowMap = new Map<string, AnyBody>();
      for (const row of rawRows) {
        const employeeId = String(row.employeeId || "");
        const workDate = this.requireDateOnlyString(
          row.workDate,
          "Günlük girişte geçerli bir çalışma tarihi zorunludur.",
        );
        if (!employeeId || !workDate) continue;
        const key = `${employeeId}-${workDate}`;
        const current = rowMap.get(key) || {};
        rowMap.set(key, {
          ...current,
          ...row,
          employeeId,
          workDate,
          dayShift: Boolean(current.dayShift) || Boolean(row.dayShift),
          nightShift: Boolean(current.nightShift) || Boolean(row.nightShift),
          dayWage: row.dayWage ?? current.dayWage,
          nightWage: row.nightWage ?? current.nightWage,
        });
      }
      const rows = [...rowMap.values()];
      const deleteEmptyRows = Boolean(body.deleteEmptyRows);
      return (this.prisma as any).$transaction(async (tx: any) => {
        const saved = [];
        for (const row of rows) {
          const employee = await tx.hrDailyEmployee.findUnique({
            where: { id: row.employeeId },
          });
          if (!employee) throw new NotFoundException("Günlük personel bulunamadı.");
          if (
            allowedCompanyIds &&
            !allowedCompanyIds.has(String(employee.mainCompanyId))
          ) {
            throw new BadRequestException(
              "Seçilen günlük personel aktif ana firmaya ait değil.",
            );
          }
          const dayShift = Boolean(row.dayShift);
          const nightShift = Boolean(row.nightShift);
          const dayWage = this.number(row.dayWage ?? employee.dayWage);
          const nightWage = this.number(row.nightWage ?? employee.nightWage);
          if (dayShift && dayWage <= 0) {
            throw new BadRequestException(
              `${employee.fullName} için gündüz ücreti girilmeden kayıt yapılamaz.`,
            );
          }
          if (nightShift && nightWage <= 0) {
            throw new BadRequestException(
              `${employee.fullName} için gece ücreti girilmeden kayıt yapılamaz.`,
            );
          }
          const totalAmount =
            (dayShift ? dayWage : 0) + (nightShift ? nightWage : 0);
          if (deleteEmptyRows && !dayShift && !nightShift) {
            await tx.hrDailyAttendance.deleteMany({
              where: {
                employeeId: row.employeeId,
                workDate: this.dateOnly(row.workDate),
              },
            });
            continue;
          }
          saved.push(
            await tx.hrDailyAttendance.upsert({
              where: {
                employeeId_workDate: {
                  employeeId: row.employeeId,
                  workDate: this.dateOnly(row.workDate),
                },
              },
              create: {
                employeeId: row.employeeId,
                workDate: this.dateOnly(row.workDate),
                dayShift,
                nightShift,
                dayWage,
                nightWage,
                totalAmount,
                paymentStatus: "WAITING",
              },
              update: { dayShift, nightShift, dayWage, nightWage, totalAmount },
            }),
          );
        }
        const savedIds = [...new Set(saved.map((row: AnyBody) => row.id))];
        const persistedCount = savedIds.length
          ? await tx.hrDailyAttendance.count({
              where: { id: { in: savedIds } },
            })
          : 0;
        if (persistedCount !== savedIds.length) {
          throw new BadRequestException("Günlük giriş DB sayım kontrolü başarısız.");
        }
        return saved.map((row: AnyBody) => ({
          ...row,
          workDate: this.dateOnlyString(row.workDate),
          date: this.dateOnlyString(row.workDate),
        }));
      });
    }

  private async ensureDailyAttendanceNotesTable() {
      await (this.prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS hr_daily_attendance_notes (
          id TEXT PRIMARY KEY,
          main_company_id TEXT NOT NULL,
          employee_id TEXT NOT NULL,
          work_date DATETIME NOT NULL,
          shift TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          updated_at DATETIME NOT NULL,
          UNIQUE(main_company_id, employee_id, work_date, shift)
        )
      `);
      await (this.prisma as any).$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS hr_daily_attendance_notes_lookup_idx
        ON hr_daily_attendance_notes(main_company_id, work_date, shift)
      `);
    }

  private async ensureDailyRangeRosterTable() {
      await (this.prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS hr_daily_range_roster (
          id TEXT PRIMARY KEY,
          main_company_id TEXT NOT NULL,
          start_date DATETIME NOT NULL,
          end_date DATETIME NOT NULL,
          employee_id TEXT NOT NULL,
          created_at DATETIME NOT NULL,
          UNIQUE(main_company_id, start_date, end_date, employee_id)
        )
      `);
      await (this.prisma as any).$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS hr_daily_range_roster_lookup_idx
        ON hr_daily_range_roster(main_company_id, start_date, end_date)
      `);
    }

  private async focusedWorkedEmployeeIds(mainCompanyId: string, startDate: string, endDate: string) {
      const attendance = await this.dailyAttendance({
        mainCompanyId,
        start: startDate,
        end: endDate,
      });
      return [
        ...new Set(
          attendance
            .filter((row: AnyBody) => row.dayShift || row.nightShift)
            .map((row: AnyBody) => String(row.employeeId)),
        ),
      ];
    }

  async focusedDailyRoster(query: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(query);
      const startDate = this.dateOnlyString(query.startDate || query.start);
      const endDate = this.dateOnlyString(query.endDate || query.end || startDate);
      if (!startDate || !endDate) {
        throw new BadRequestException("Geçerli tarih aralığı seçilmedi.");
      }
      await this.ensureDailyRangeRosterTable();
      const rows = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT employee_id
         FROM hr_daily_range_roster
         WHERE main_company_id = ? AND start_date = ? AND end_date = ?
         ORDER BY created_at ASC`,
        mainCompanyId,
        startDate,
        endDate,
      )) as AnyBody[];
      const rosterEmployeeIds = rows.map((row) => String(row.employee_id));
      const workedEmployeeIds = await this.focusedWorkedEmployeeIds(mainCompanyId, startDate, endDate);
      const employeeIds = [...new Set([...rosterEmployeeIds, ...workedEmployeeIds])];
      if (employeeIds.length !== rosterEmployeeIds.length) {
        for (const employeeId of employeeIds) {
          await (this.prisma as any).$executeRawUnsafe(
            `INSERT OR IGNORE INTO hr_daily_range_roster
              (id, main_company_id, start_date, end_date, employee_id, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            randomUUID(),
            mainCompanyId,
            startDate,
            endDate,
            employeeId,
          );
        }
      }
      return {
        startDate,
        endDate,
        employeeIds,
      };
    }

  async saveFocusedDailyRoster(body: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(body);
      const startDate = this.dateOnlyString(body.startDate || body.start);
      const endDate = this.dateOnlyString(body.endDate || body.end || startDate);
      const requestedEmployeeIds = [
        ...new Set(
          (Array.isArray(body.employeeIds) ? body.employeeIds : [])
            .map((id: unknown) => String(id || "").trim())
            .filter(Boolean),
        ),
      ];
      if (!startDate || !endDate) {
        throw new BadRequestException("Geçerli tarih aralığı seçilmedi.");
      }
      await this.ensureDailyRangeRosterTable();
      const workedEmployeeIds = await this.focusedWorkedEmployeeIds(mainCompanyId, startDate, endDate);
      const employeeIds = [...new Set([...requestedEmployeeIds, ...workedEmployeeIds])];
      await (this.prisma as any).$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM hr_daily_range_roster
           WHERE main_company_id = ? AND start_date = ? AND end_date = ?`,
          mainCompanyId,
          startDate,
          endDate,
        );
        for (const employeeId of employeeIds) {
          await tx.$executeRawUnsafe(
            `INSERT INTO hr_daily_range_roster
              (id, main_company_id, start_date, end_date, employee_id, created_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            randomUUID(),
            mainCompanyId,
            startDate,
            endDate,
            employeeId,
          );
        }
      });
      return { startDate, endDate, employeeIds };
    }

  private focusedShift(value: unknown) {
      const normalized = String(value || "")
        .trim()
        .toUpperCase();
      if (["N", "NIGHT", "GECE"].includes(normalized)) return "night";
      return "day";
    }

  private excelCellText(value: any) {
      if (value == null) return "";
      if (value instanceof Date) return this.dateOnlyString(value);
      if (typeof value === "object") {
        if (Array.isArray(value.richText)) {
          return value.richText.map((part: any) => part?.text || "").join("");
        }
        if (value.text) return String(value.text);
        if (value.result != null) return this.excelCellText(value.result);
        if (value.hyperlink && value.text) return String(value.text);
      }
      return String(value).trim();
    }

  private excelHeaderKey(value: any) {
      return this.slugText(this.excelCellText(value));
    }

  private excelNumber(value: any, fallback = 0) {
      const text = this.excelCellText(value);
      if (!text) return fallback;
      const parsed = this.number(text);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

  private excelYes(value: any) {
      if (typeof value === "number") return value > 0;
      const text = this.excelCellText(value).trim().toLocaleUpperCase("tr-TR");
      if (/^-?\d+([.,]\d+)?$/.test(text)) return this.number(text) > 0;
      return ["1", "E", "EVET", "G", "N", "X", "TRUE", "VAR", "AKTIF", "AKTİF"].includes(text);
    }

  private excelShiftState(value: any) {
      if (value === null || value === undefined) return { selected: false, ambiguous: false };
      if (typeof value === "number") {
        if (value === 0) return { selected: false, ambiguous: false };
        return { selected: true, ambiguous: false };
      }
      const text = this.excelCellText(value).trim().toLocaleUpperCase("tr-TR");
      if (!text) return { selected: false, ambiguous: false };
      if (/^-?\d+([.,]\d+)?$/.test(text)) {
        const numberValue = this.number(text);
        if (numberValue === 0) return { selected: false, ambiguous: false };
        if (Number.isFinite(numberValue)) return { selected: numberValue > 0, ambiguous: false };
      }
      const selected = ["E", "EVET", "G", "N", "X", "TRUE", "VAR", "AKTIF", "AKTİF"].includes(text);
      const empty = ["HAYIR", "YOK", "FALSE", "PASIF", "PASİF", "-"].includes(text);
      return { selected, ambiguous: !selected && !empty, raw: text };
    }

  private excelDate(value: any) {
      if (value instanceof Date) return this.dateOnlyString(value);
      const text = this.excelCellText(value);
      const iso = this.dateOnlyString(text);
      if (iso) return iso;
      const tr = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      if (tr) {
        return `${tr[3]}-${String(tr[2]).padStart(2, "0")}-${String(tr[1]).padStart(2, "0")}`;
      }
      return "";
    }

  private normalizeUploadedXlsx(buffer: Buffer) {
      try {
        const zip = new AdmZip(buffer);
        let changed = false;
        for (const entry of zip.getEntries()) {
          if (!entry.entryName.endsWith(".xml")) continue;
          let xml = entry.getData().toString("utf8");
          let next = xml
            .replace(/(<\/?)x:/g, "$1")
            .replace(/\sxmlns:x=/g, " xmlns=");
          if (
            entry.entryName === "[Content_Types].xml" &&
            !next.includes('PartName="/xl/workbook.xml"')
          ) {
            next = next.replace(
              "</Types>",
              '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" /></Types>',
            );
          }
          if (next !== xml) {
            zip.updateFile(entry.entryName, Buffer.from(next, "utf8"));
            changed = true;
          }
        }
        return { buffer: changed ? zip.toBuffer() : buffer, changed };
      } catch {
        return { buffer, changed: false };
      }
    }

  private async loadUploadedWorkbook(buffer: Buffer) {
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(buffer as any);
        return workbook;
      } catch {
        const normalized = this.normalizeUploadedXlsx(buffer);
        if (normalized.changed) {
          try {
            const retryWorkbook = new ExcelJS.Workbook();
            await retryWorkbook.xlsx.load(normalized.buffer as any);
            return retryWorkbook;
          } catch {
            // Return the stable validation error below.
          }
        }
        throw new BadRequestException(
          "Excel dosyası okunamadı. Lütfen uygulamadan indirilen .xlsx şablonunu yükleyin.",
        );
      }
    }

  private excelHeaders(sheet: ExcelJS.Worksheet) {
      const headers = new Map<string, number>();
      sheet.getRow(1).eachCell((cell, col) => {
        headers.set(this.excelHeaderKey(cell.value), col);
      });
      return headers;
    }

  private excelValue(row: ExcelJS.Row, headers: Map<string, number>, keys: string[]) {
      for (const key of keys) {
        const col = headers.get(this.slugText(key));
        if (col) return row.getCell(col).value;
      }
      return "";
    }

  private dailyDateRange(start: string, end: string) {
      const dates: string[] = [];
      const startDate = this.dateOnly(start);
      const endDate = this.dateOnly(end || start);
      for (
        let cursor = new Date(startDate.getTime());
        cursor.getTime() <= endDate.getTime();
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      ) {
        dates.push(cursor.toISOString().slice(0, 10));
      }
      return dates;
    }

  private styleWorkbook(workbook: ExcelJS.Workbook) {
      workbook.eachSheet((sheet) => {
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
      });
    }

  async dailyEmployeesExcel(query: AnyBody = {}) {
      const employees = await this.dailyEmployees({ ...query, includePassive: true });
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Personel Kartları");
      sheet.columns = [
        { header: "Personel Kodu", key: "personnelNo", width: 16 },
        { header: "Ad Soyad", key: "fullName", width: 30 },
        { header: "Vasıf", key: "qualification", width: 18 },
        { header: "Aracı", key: "broker", width: 16 },
        { header: "Gündüz ücret", key: "dayWage", width: 16 },
        { header: "Gece ücret", key: "nightWage", width: 16 },
        { header: "Durum", key: "status", width: 12 },
        { header: "Not", key: "note", width: 28 },
      ];
      employees.forEach((employee: AnyBody) => {
        sheet.addRow({
          fullName: employee.fullName,
          qualification: this.standardSkillName(employee.qualification) || employee.qualification || "",
          broker: employee.broker || "Direkt",
          dayWage: this.number(employee.dayWage),
          nightWage: this.number(employee.nightWage),
          status: employee.status === "PASSIVE" ? "Pasif" : "Aktif",
          personnelNo: employee.personnelNo || "",
          note: employee.note || "",
        });
      });
      this.styleWorkbook(workbook);
      return workbook.xlsx.writeBuffer();
    }

  async importDailyEmployeesExcel(file: any, body: AnyBody = {}) {
      if (!file?.buffer) throw new BadRequestException("Excel dosyası bulunamadı.");
      const mainCompanyId = this.mainCompanyId(body);
      const workbook = await this.loadUploadedWorkbook(file.buffer);
      const sheet = workbook.getWorksheet("Personel Kartları") || workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("Excel sayfası okunamadı.");
      const headers = this.excelHeaders(sheet);
      const existing = await this.dailyEmployees({ mainCompanyId, includePassive: true });
      const existingById = new Map(existing.map((row: AnyBody) => [String(row.id), row]));
      const existingByPersonnelNo = new Map(
        existing
          .filter((row: AnyBody) => String(row.personnelNo || "").trim())
          .map((row: AnyBody) => [String(row.personnelNo).trim().toUpperCase(), row]),
      );
      let count = 0;
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const id = this.excelCellText(this.excelValue(row, headers, ["Personel ID", "ID"]));
        const personnelNo = this.excelCellText(this.excelValue(row, headers, ["Personel Kodu", "Personel No"]));
        const fullName = this.excelCellText(this.excelValue(row, headers, ["Ad Soyad", "Personel"]));
        if (!fullName) continue;
        const statusText = this.excelCellText(this.excelValue(row, headers, ["Durum"])).toLocaleLowerCase("tr-TR");
        const payload = {
          mainCompanyId,
          fullName,
          qualification: this.excelCellText(this.excelValue(row, headers, ["Vasıf", "Vasif", "Rol"])),
          broker: this.excelCellText(this.excelValue(row, headers, ["Aracı", "Araci"])) || "Direkt",
          dayWage: this.excelNumber(this.excelValue(row, headers, ["Gündüz ücret", "Gunduz ucret", "Gündüz Ücret"])),
          nightWage: this.excelNumber(this.excelValue(row, headers, ["Gece ücret", "Gece Ücret"])),
          status: statusText.includes("pasif") || statusText === "passive" ? "PASSIVE" : "ACTIVE",
          personnelNo,
          note: this.excelCellText(this.excelValue(row, headers, ["Not"])),
        };
        const existingByCode = existingByPersonnelNo.get(personnelNo.trim().toUpperCase());
        if (existingByCode?.id) await this.updateDailyEmployee(existingByCode.id, payload);
        else if (id && existingById.has(id)) await this.updateDailyEmployee(id, payload);
        else await this.createDailyEmployee(payload);
        count += 1;
      }
      return {
        count,
        employees: await this.dailyEmployees({ mainCompanyId, includePassive: true }),
      };
    }

  async focusedDailyRecords(query: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(query);
      const date = this.dateOnlyString(query.date || query.selectedDate);
      if (!date) throw new BadRequestException("Geçerli tarih seçilmedi.");
      const shift = this.focusedShift(query.shift);
      await this.ensureDailyAttendanceNotesTable();
      const rows = await this.dailyAttendance({
        mainCompanyId,
        start: date,
        end: date,
      });
      const employees = await this.dailyEmployees({
        mainCompanyId,
        includePassive: true,
      });
      const employeeById = new Map<string, AnyBody>(
        employees.map((employee: AnyBody) => [String(employee.id), employee]),
      );
      const notes = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT employee_id, shift, note
         FROM hr_daily_attendance_notes
         WHERE main_company_id = ? AND work_date = ?`,
        mainCompanyId,
        date,
      )) as AnyBody[];
      const noteByKey = new Map<string, string>(
        notes.map((row) => [
          `${row.employee_id}-${String(row.shift).toLowerCase()}`,
          row.note || "",
        ]),
      );
      return rows.map((row: AnyBody) => {
        const employee = employeeById.get(String(row.employeeId)) || {};
        return {
          ...row,
          employee,
          shift,
          selected: shift === "day" ? Boolean(row.dayShift) : Boolean(row.nightShift),
          note: noteByKey.get(`${row.employeeId}-${shift}`) || "",
        };
      });
    }

  async focusedDailyPeople(query: AnyBody = {}) {
      const role = String(query.role || "").trim().toLocaleLowerCase("tr-TR");
      const search = String(query.search || "").trim().toLocaleLowerCase("tr-TR");
      const rows = await this.dailyEmployees(query);
      return rows.filter((row: AnyBody) => {
        const qualification = String(row.qualification || "").toLocaleLowerCase("tr-TR");
        const haystack = `${row.fullName || ""} ${qualification} ${row.broker || ""}`
          .toLocaleLowerCase("tr-TR");
        return (!role || qualification === role) && (!search || haystack.includes(search));
      });
    }

  async saveFocusedDailyRecords(body: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(body);
      const date = this.dateOnlyString(body.date || body.selectedDate);
      if (!date) throw new BadRequestException("Geçerli tarih seçilmedi.");
      const shift = this.focusedShift(body.shift);
      const entries = Array.isArray(body.personnelEntries)
        ? body.personnelEntries
        : [];
      if (!entries.length) {
        throw new BadRequestException("Kaydedilecek personel seçilmedi.");
      }
      await this.ensureDailyAttendanceNotesTable();
      const currentRows = await this.dailyAttendance({
        mainCompanyId,
        start: date,
        end: date,
      });
      const currentByEmployee = new Map<string, AnyBody>(
        currentRows.map((row: AnyBody) => [String(row.employeeId), row]),
      );
      const employees = await this.model("hrDailyEmployee").findMany({
        where: {
          id: { in: entries.map((entry: AnyBody) => String(entry.personelId || entry.employeeId)) },
          mainCompanyId,
        },
      });
      const employeeById = new Map<string, AnyBody>(
        employees.map((employee: AnyBody) => [String(employee.id), employee]),
      );
      const rows = entries.map((entry: AnyBody) => {
        const employeeId = String(entry.personelId || entry.employeeId || "");
        const employee = employeeById.get(employeeId) as AnyBody | undefined;
        if (!employee) {
          throw new BadRequestException("Personel seçili firmada bulunamadı.");
        }
        const current = (currentByEmployee.get(employeeId) || {}) as AnyBody;
        const enabled = entry.status !== "REMOVE" && entry.status !== false;
        if (shift === "night" && enabled && this.number(employee.nightWage) <= 0) {
          throw new BadRequestException(
            `${employee.fullName}: Gece ücreti tanımlı olmadığı için gece kaydı açılamaz.`,
          );
        }
        return {
          employeeId,
          workDate: date,
          dayShift: shift === "day" ? enabled : Boolean(current.dayShift),
          nightShift: shift === "night" ? enabled : Boolean(current.nightShift),
          dayWage:
            shift === "day" && entry.overrideAmount != null
              ? this.number(entry.overrideAmount)
              : this.number(current.dayWage ?? employee.dayWage),
          nightWage:
            shift === "night" && entry.overrideAmount != null
              ? this.number(entry.overrideAmount)
              : this.number(current.nightWage ?? employee.nightWage),
        };
      });
      const saved = await this.saveDailyRange({
        mainCompanyId,
        rows,
        deleteEmptyRows: true,
      });
      for (const entry of entries) {
        const employeeId = String(entry.personelId || entry.employeeId || "");
        await (this.prisma as any).$executeRawUnsafe(
          `INSERT INTO hr_daily_attendance_notes
            (id, main_company_id, employee_id, work_date, shift, note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(main_company_id, employee_id, work_date, shift)
           DO UPDATE SET note = excluded.note, updated_at = CURRENT_TIMESTAMP`,
          randomUUID(),
          mainCompanyId,
          employeeId,
          date,
          shift,
          String(entry.note || "").trim(),
        );
      }
      return {
        date,
        shift,
        count: saved.length,
        rows: await this.focusedDailyRecords({ mainCompanyId, date, shift }),
      };
    }

  async patchFocusedDailyRecord(id: string, body: AnyBody = {}) {
      const current = await this.model("hrDailyAttendance").findUnique({
        where: { id },
      });
      if (!current) throw new NotFoundException("Günlük kayıt bulunamadı.");
      const employee = await this.model("hrDailyEmployee").findUnique({
        where: { id: current.employeeId },
      });
      if (!employee) throw new NotFoundException("Günlük personel bulunamadı.");
      return this.saveFocusedDailyRecords({
        ...body,
        mainCompanyId: employee.mainCompanyId,
        date: this.dateOnlyString(current.workDate),
        personnelEntries: [
          {
            personelId: current.employeeId,
            note: body.note,
            status: body.status,
            overrideAmount: body.overrideAmount,
          },
        ],
      });
    }

  async deleteFocusedDailyRecord(id: string, body: AnyBody = {}) {
      return this.patchFocusedDailyRecord(id, { ...body, status: "REMOVE" });
    }

  async focusedDailySummary(query: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(query);
      const start = this.dateOnlyString(query.startDate || query.start);
      const end = this.dateOnlyString(query.endDate || query.end || start);
      const selectedDate = this.dateOnlyString(query.selectedDate || start);
      const employees = await this.dailyEmployees({ mainCompanyId });
      const employeeById = new Map<string, AnyBody>(
        employees.map((employee: AnyBody) => [String(employee.id), employee]),
      );
      const rows = await this.dailyAttendance({
        mainCompanyId,
        start,
        end,
      });
      const days = new Map<string, AnyBody>();
      for (const row of rows) {
        const date = this.dateOnlyString(row.workDate);
        const employee = (employeeById.get(String(row.employeeId)) || {}) as AnyBody;
        const summary = days.get(date) || {
          date,
          dayCount: 0,
          nightCount: 0,
          dayTotal: 0,
          nightTotal: 0,
          total: 0,
        };
        if (row.dayShift) {
          summary.dayCount += 1;
          summary.dayTotal += this.number(row.dayWage);
        }
        if (row.nightShift) {
          summary.nightCount += 1;
          summary.nightTotal += this.number(row.nightWage);
        }
        summary.total = summary.dayTotal + summary.nightTotal;
        summary.employeeCount = new Set([
          ...(summary.employeeIds || []),
          row.employeeId,
        ]).size;
        summary.employeeIds = [
          ...new Set([...(summary.employeeIds || []), row.employeeId]),
        ];
        summary.skills = summary.skills || {};
        const skill = this.standardSkillName(employee.qualification) || "Diğer";
        if (row.dayShift || row.nightShift) {
          summary.skills[skill] = (summary.skills[skill] || 0) + 1;
        }
        days.set(date, summary);
      }
      return {
        startDate: start,
        endDate: end,
        selectedDate,
        days: [...days.values()].map(({ employeeIds, ...day }) => day),
        selected:
          days.get(selectedDate) || {
            date: selectedDate,
            dayCount: 0,
            nightCount: 0,
            dayTotal: 0,
            nightTotal: 0,
            total: 0,
            employeeCount: 0,
            skills: {},
          },
      };
    }

  async focusedDailyExcel(query: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(query);
      const start = this.dateOnlyString(query.startDate || query.start);
      const end = this.dateOnlyString(query.endDate || query.end || start);
      const employees = await this.dailyEmployees({
        mainCompanyId,
        includePassive: true,
      });
      const employeeById = new Map<string, AnyBody>(
        employees.map((employee: AnyBody) => [String(employee.id), employee]),
      );
      const attendance = await this.dailyAttendance({ mainCompanyId, start, end });
      const workbook = new ExcelJS.Workbook();
      const entriesSheet = workbook.addWorksheet("Günlük Girişler");
      entriesSheet.columns = [
        { header: "Tarih", key: "date", width: 14 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Vasıf", key: "skill", width: 18 },
        { header: "Vardiya", key: "shift", width: 12 },
        { header: "Gündüz ücret", key: "dayWage", width: 16 },
        { header: "Gece ücret", key: "nightWage", width: 16 },
        { header: "Günlük tutar", key: "amount", width: 16 },
        { header: "Durum", key: "status", width: 14 },
      ];
      for (const row of attendance) {
        const employee = (employeeById.get(String(row.employeeId)) || {}) as AnyBody;
        if (row.dayShift) {
          entriesSheet.addRow({
            date: this.dateOnlyString(row.workDate),
            person: employee.fullName || "-",
            skill: this.standardSkillName(employee.qualification) || "Diğer",
            shift: "Gündüz",
            dayWage: this.number(row.dayWage),
            nightWage: this.number(row.nightWage),
            amount: this.number(row.dayWage),
            status: "Kaydedildi",
          });
        }
        if (row.nightShift) {
          entriesSheet.addRow({
            date: this.dateOnlyString(row.workDate),
            person: employee.fullName || "-",
            skill: this.standardSkillName(employee.qualification) || "Diğer",
            shift: "Gece",
            dayWage: this.number(row.dayWage),
            nightWage: this.number(row.nightWage),
            amount: this.number(row.nightWage),
            status: "Kaydedildi",
          });
        }
      }
      const summary = await this.focusedDailySummary({
        mainCompanyId,
        startDate: start,
        endDate: end,
      });
      const summarySheet = workbook.addWorksheet("Günlük Özet");
      summarySheet.addRow([
        "Tarih",
        "Gündüz kişi",
        "Gece kişi",
        "Gündüz toplam",
        "Gece toplam",
        "Genel toplam",
      ]);
      summary.days.forEach((day: AnyBody) =>
        summarySheet.addRow([
          day.date,
          day.dayCount,
          day.nightCount,
          day.dayTotal,
          day.nightTotal,
          day.total,
        ]),
      );
      const personSheet = workbook.addWorksheet("Personel Toplamları");
      personSheet.addRow(["Personel", "Gündüz", "Gece", "Toplam"]);
      const personTotals = new Map<string, AnyBody>();
      attendance.forEach((row: AnyBody) => {
        const employee = (employeeById.get(String(row.employeeId)) || {}) as AnyBody;
        const current = personTotals.get(row.employeeId) || {
          name: employee.fullName || "-",
          day: 0,
          night: 0,
        };
        current.day += row.dayShift ? this.number(row.dayWage) : 0;
        current.night += row.nightShift ? this.number(row.nightWage) : 0;
        personTotals.set(row.employeeId, current);
      });
      personTotals.forEach((row) =>
        personSheet.addRow([row.name, row.day, row.night, row.day + row.night]),
      );
      const skillSheet = workbook.addWorksheet("Vasıf Toplamları");
      skillSheet.addRow(["Vasıf", "Gündüz", "Gece", "Toplam"]);
      const skillTotals = new Map<string, AnyBody>();
      attendance.forEach((row: AnyBody) => {
        const employee = (employeeById.get(String(row.employeeId)) || {}) as AnyBody;
        const skill = this.standardSkillName(employee.qualification) || "Diğer";
        const current = skillTotals.get(skill) || { day: 0, night: 0 };
        current.day += row.dayShift ? this.number(row.dayWage) : 0;
        current.night += row.nightShift ? this.number(row.nightWage) : 0;
        skillTotals.set(skill, current);
      });
      skillTotals.forEach((row, skill) =>
        skillSheet.addRow([skill, row.day, row.night, row.day + row.night]),
      );
      workbook.eachSheet((sheet) => {
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
      });
      return workbook.xlsx.writeBuffer();
    }

  async focusedDailyExcelTemplate(query: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(query);
      const start = this.dateOnlyString(query.startDate || query.start);
      const end = this.dateOnlyString(query.endDate || query.end || start);
      if (!start || !end) throw new BadRequestException("Geçerli tarih aralığı seçilmedi.");
      const employees = await this.dailyEmployees({ mainCompanyId, includePassive: true });
      const employeeById = new Map<string, AnyBody>(
        employees.map((employee: AnyBody) => [String(employee.id), employee]),
      );
      const roster = await this.focusedDailyRoster({ mainCompanyId, startDate: start, endDate: end });
      const rosterIds = roster.employeeIds.length
        ? roster.employeeIds
        : employees.filter((employee: AnyBody) => employee.status !== "PASSIVE").map((employee: AnyBody) => String(employee.id));
      const attendance = await this.dailyAttendance({ mainCompanyId, start, end });
      const attendanceByKey = new Map(
        attendance.map((row: AnyBody) => [`${row.employeeId}-${this.dateOnlyString(row.workDate)}`, row]),
      );
      await this.ensureDailyAttendanceNotesTable();
      const noteRows = (await (this.prisma as any).$queryRawUnsafe(
        `SELECT employee_id, work_date, shift, note
         FROM hr_daily_attendance_notes
         WHERE main_company_id = ? AND work_date >= ? AND work_date <= ?`,
        mainCompanyId,
        this.dateOnly(start),
        this.dateOnly(end),
      )) as AnyBody[];
      const noteByKey = new Map(
        noteRows.map((row) => [
          `${row.employee_id}-${this.dateOnlyString(row.work_date)}-${String(row.shift).toLowerCase()}`,
          row.note || "",
        ]),
      );
      const workbook = new ExcelJS.Workbook();
      const entriesSheet = workbook.addWorksheet("Günlük Giriş Şablonu");
      entriesSheet.columns = [
        { header: "Personel Kodu", key: "personnelNo", width: 16 },
        { header: "Tarih", key: "date", width: 14 },
        { header: "Personel", key: "person", width: 28 },
        { header: "Vasıf", key: "skill", width: 18 },
        { header: "Aracı", key: "broker", width: 16 },
        { header: "Gündüz", key: "dayShift", width: 12 },
        { header: "Gece", key: "nightShift", width: 12 },
        { header: "Gündüz ücret", key: "dayWage", width: 16 },
        { header: "Gece ücret", key: "nightWage", width: 16 },
        { header: "Gündüz not", key: "dayNote", width: 24 },
        { header: "Gece not", key: "nightNote", width: 24 },
      ];
      for (const date of this.dailyDateRange(start, end)) {
        for (const employeeId of rosterIds) {
          const employee = (employeeById.get(String(employeeId)) || {}) as AnyBody;
          if (!employee.id) continue;
          const row = (attendanceByKey.get(`${employeeId}-${date}`) || {}) as AnyBody;
          entriesSheet.addRow({
            personnelNo: employee.personnelNo || "",
            date,
            person: employee.fullName || "-",
            skill: this.standardSkillName(employee.qualification) || "Diğer",
            broker: employee.broker || "Direkt",
            dayShift: row.dayShift ? "EVET" : "",
            nightShift: row.nightShift ? "EVET" : "",
            dayWage: this.number(row.dayWage ?? employee.dayWage),
            nightWage: this.number(row.nightWage ?? employee.nightWage),
            dayNote: noteByKey.get(`${employeeId}-${date}-day`) || "",
            nightNote: noteByKey.get(`${employeeId}-${date}-night`) || "",
          });
        }
      }
      const summary = await this.focusedDailySummary({ mainCompanyId, startDate: start, endDate: end });
      const summarySheet = workbook.addWorksheet("Günlük Özet");
      summarySheet.addRow(["Tarih", "Gündüz kişi", "Gece kişi", "Gündüz toplam", "Gece toplam", "Genel toplam"]);
      summary.days.forEach((day: AnyBody) =>
        summarySheet.addRow([day.date, day.dayCount, day.nightCount, day.dayTotal, day.nightTotal, day.total]),
      );
      const personSheet = workbook.addWorksheet("Personel Toplamları");
      personSheet.addRow(["Personel", "Gündüz", "Gece", "Toplam"]);
      const personTotals = new Map<string, AnyBody>();
      attendance.forEach((row: AnyBody) => {
        const employee = (employeeById.get(String(row.employeeId)) || {}) as AnyBody;
        const current = personTotals.get(row.employeeId) || { name: employee.fullName || "-", day: 0, night: 0 };
        current.day += row.dayShift ? this.number(row.dayWage) : 0;
        current.night += row.nightShift ? this.number(row.nightWage) : 0;
        personTotals.set(row.employeeId, current);
      });
      personTotals.forEach((row) => personSheet.addRow([row.name, row.day, row.night, row.day + row.night]));
      const skillSheet = workbook.addWorksheet("Vasıf Toplamları");
      skillSheet.addRow(["Vasıf", "Gündüz", "Gece", "Toplam"]);
      const skillTotals = new Map<string, AnyBody>();
      attendance.forEach((row: AnyBody) => {
        const employee = (employeeById.get(String(row.employeeId)) || {}) as AnyBody;
        const skill = this.standardSkillName(employee.qualification) || "Diğer";
        const current = skillTotals.get(skill) || { day: 0, night: 0 };
        current.day += row.dayShift ? this.number(row.dayWage) : 0;
        current.night += row.nightShift ? this.number(row.nightWage) : 0;
        skillTotals.set(skill, current);
      });
      skillTotals.forEach((row, skill) => skillSheet.addRow([skill, row.day, row.night, row.day + row.night]));
      this.styleWorkbook(workbook);
      return workbook.xlsx.writeBuffer();
    }

  private async parseFocusedDailyExcel(file: any, body: AnyBody = {}) {
      if (!file?.buffer) throw new BadRequestException("Excel dosyası bulunamadı.");
      const mainCompanyId = this.mainCompanyId(body);
      const workbook = await this.loadUploadedWorkbook(file.buffer);
      const sheet = workbook.getWorksheet("Günlük Giriş Şablonu") || workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("Excel sayfası okunamadı.");
      const headers = this.excelHeaders(sheet);
      const employees = await this.dailyEmployees({ mainCompanyId, includePassive: true });
      const employeeById = new Map(employees.map((employee: AnyBody) => [String(employee.id), employee]));
      const employeeByPersonnelNo = new Map(
        employees
          .filter((employee: AnyBody) => String(employee.personnelNo || "").trim())
          .map((employee: AnyBody) => [
            String(employee.personnelNo || "").trim().toUpperCase(),
            employee,
          ]),
      );
      const employeeByName = new Map(
        employees.map((employee: AnyBody) => [
          String(employee.fullName || "").trim().toLocaleUpperCase("tr-TR"),
          employee,
        ]),
      );
      const parsedRows: AnyBody[] = [];
      const dates: string[] = [];
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const personnelNoText = this.excelCellText(this.excelValue(row, headers, ["Personel Kodu", "Personel No"]));
        const employeeIdText = this.excelCellText(this.excelValue(row, headers, ["Personel ID", "ID"]));
        const personName = this.excelCellText(this.excelValue(row, headers, ["Personel", "Ad Soyad"]));
        const workDate = this.excelDate(this.excelValue(row, headers, ["Tarih"]));
        if (!personnelNoText && !employeeIdText && !personName && !workDate) continue;
        const employee =
          employeeByPersonnelNo.get(personnelNoText.trim().toUpperCase()) ||
          employeeById.get(employeeIdText) ||
          employeeByName.get(personName.trim().toLocaleUpperCase("tr-TR"));
        const dayState = this.excelShiftState(this.excelValue(row, headers, ["Gündüz", "Gunduz"]));
        const nightState = this.excelShiftState(this.excelValue(row, headers, ["Gece"]));
        const dayNoteRaw = this.excelValue(row, headers, ["Gündüz not", "Gunduz not"]);
        const nightNoteRaw = this.excelValue(row, headers, ["Gece not"]);
        if (workDate) dates.push(workDate);
        parsedRows.push({
          rowNumber,
          key: `${rowNumber}-${employee?.id || personnelNoText || personName}-${workDate}`,
          employeeId: employee?.id || "",
          personnelNo: employee?.personnelNo || personnelNoText,
          excelName: personName,
          personName: employee?.fullName || personName,
          qualification: employee ? (this.standardSkillName(employee.qualification) || employee.qualification || "") : "",
          workDate,
          dayShift: dayState.selected,
          nightShift: nightState.selected,
          dayWage: employee
            ? this.excelNumber(this.excelValue(row, headers, ["Gündüz ücret", "Gunduz ucret"]), this.number(employee.dayWage))
            : 0,
          nightWage: employee
            ? this.excelNumber(this.excelValue(row, headers, ["Gece ücret"]), this.number(employee.nightWage))
            : 0,
          dayNote: typeof dayNoteRaw === "string" ? this.excelCellText(dayNoteRaw) : "",
          nightNote: typeof nightNoteRaw === "string" ? this.excelCellText(nightNoteRaw) : "",
          matched: Boolean(employee),
          warnings: [
            ...(!employee ? [`Personel bulunamadi: ${personnelNoText || personName || rowNumber}`] : []),
            ...(!workDate ? ["Tarih okunamadi"] : []),
            ...(dayState.ambiguous ? [`Gunduz hucresi okunamadi: ${dayState.raw}`] : []),
            ...(nightState.ambiguous ? [`Gece hucresi okunamadi: ${nightState.raw}`] : []),
          ],
        });
      }
      if (!parsedRows.length) throw new BadRequestException("Excel içinde okunacak satır bulunamadı.");
      const sortedDates = [...dates].sort();
      const startDate = this.dateOnlyString(body.startDate || body.start) || sortedDates[0];
      const endDate = this.dateOnlyString(body.endDate || body.end) || sortedDates[sortedDates.length - 1] || startDate;
      const mergedParsedRows = new Map<string, AnyBody>();
      const passthroughRows: AnyBody[] = [];
      for (const row of parsedRows) {
        if (!row.employeeId || !row.workDate) {
          passthroughRows.push(row);
          continue;
        }
        const key = `${row.employeeId}-${row.workDate}`;
        const current = mergedParsedRows.get(key);
        if (!current) {
          mergedParsedRows.set(key, row);
          continue;
        }
        mergedParsedRows.set(key, {
          ...current,
          ...row,
          dayShift: Boolean(current.dayShift) || Boolean(row.dayShift),
          nightShift: Boolean(current.nightShift) || Boolean(row.nightShift),
          dayNote: row.dayNote || current.dayNote,
          nightNote: row.nightNote || current.nightNote,
          warnings: [...(current.warnings || []), ...(row.warnings || [])],
        });
      }
      const normalizedParsedRows = [...passthroughRows, ...mergedParsedRows.values()];
      const currentRows = await this.dailyAttendance({ mainCompanyId, start: startDate, end: endDate });
      const currentByKey = new Map(
        currentRows.map((row: AnyBody) => [`${row.employeeId}-${this.dateOnlyString(row.workDate)}`, row]),
      );
      const rows: AnyBody[] = normalizedParsedRows.map((row: AnyBody) => {
        const current = (currentByKey.get(`${row.employeeId}-${row.workDate}`) || {}) as AnyBody;
        const currentDay = Boolean(current.dayShift);
        const currentNight = Boolean(current.nightShift);
        const blocked = !row.matched || !row.workDate || row.warnings.length > 0;
        let action = "same";
        if (blocked) action = "control";
        else if (!currentDay && !currentNight && (row.dayShift || row.nightShift)) action = "add";
        else if ((currentDay || currentNight) && !row.dayShift && !row.nightShift) action = "remove";
        else if (currentDay !== row.dayShift || currentNight !== row.nightShift) action = "change";
        return {
          ...row,
          currentDay,
          currentNight,
          action,
          enabled: !blocked && action !== "same",
        };
      });
      const parsedKeys = new Set(
        rows
          .filter((row: AnyBody) => row.employeeId && row.workDate)
          .map((row: AnyBody) => `${row.employeeId}-${row.workDate}`),
      );
      for (const current of currentRows) {
        const workDate = this.dateOnlyString(current.workDate);
        const key = `${current.employeeId}-${workDate}`;
        if (parsedKeys.has(key)) continue;
        if (!current.dayShift && !current.nightShift) continue;
        const employee = employeeById.get(String(current.employeeId)) || {};
        rows.push({
          rowNumber: 0,
          key: `remove-${key}`,
          employeeId: current.employeeId,
          personnelNo: employee.personnelNo || "",
          excelName: "",
          personName: employee.fullName || "",
          qualification: employee.qualification || "",
          workDate,
          dayShift: false,
          nightShift: false,
          dayWage: this.number(current.dayWage || employee.dayWage),
          nightWage: this.number(current.nightWage || employee.nightWage),
          dayNote: "",
          nightNote: "",
          matched: true,
          warnings: [],
          currentDay: Boolean(current.dayShift),
          currentNight: Boolean(current.nightShift),
          action: "remove",
          enabled: true,
        });
      }
      const counts = rows.reduce(
        (acc, row: AnyBody) => {
          acc.total += 1;
          acc[row.action] = (acc[row.action] || 0) + 1;
          if (row.warnings.length) acc.warning += 1;
          return acc;
        },
        { total: 0, add: 0, remove: 0, change: 0, same: 0, control: 0, warning: 0 },
      );
      return { mode: "preview", startDate, endDate, rows, counts };
    }

  async previewFocusedDailyExcel(file: any, body: AnyBody = {}) {
      return this.parseFocusedDailyExcel(file, body);
    }

  async applyFocusedDailyExcel(body: AnyBody = {}) {
      const mainCompanyId = this.mainCompanyId(body);
      const inputRows = Array.isArray(body.rows) ? body.rows : [];
      const rows = inputRows
        .filter((row: AnyBody) => row?.enabled !== false && row?.employeeId && row?.workDate)
        .map((row: AnyBody) => ({
          employeeId: String(row.employeeId),
          workDate: this.dateOnlyString(row.workDate),
          dayShift: Boolean(row.dayShift),
          nightShift: Boolean(row.nightShift),
          dayWage: this.number(row.dayWage),
          nightWage: this.number(row.nightWage),
        }));
      if (!rows.length) throw new BadRequestException("Uygulanacak Excel satırı seçilmedi.");
      const savedRows = await this.saveDailyRange({
        mainCompanyId,
        rows,
        deleteEmptyRows: true,
      });
      await this.ensureDailyAttendanceNotesTable();
      const notes = inputRows.filter((row: AnyBody) => row?.enabled !== false && row?.employeeId && row?.workDate);
      for (const note of notes) {
        for (const shift of ["day", "night"]) {
          await (this.prisma as any).$executeRawUnsafe(
            `INSERT INTO hr_daily_attendance_notes
              (id, main_company_id, employee_id, work_date, shift, note, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(main_company_id, employee_id, work_date, shift)
             DO UPDATE SET note = excluded.note, updated_at = CURRENT_TIMESTAMP`,
            randomUUID(),
            mainCompanyId,
            note.employeeId,
            this.dateOnly(note.workDate),
            shift,
            shift === "day" ? String(note.dayNote || "") : String(note.nightNote || ""),
          );
        }
      }
      const dates = rows.map((row) => row.workDate).sort();
      const startDate = this.dateOnlyString(body.startDate || body.start) || dates[0];
      const endDate = this.dateOnlyString(body.endDate || body.end) || dates[dates.length - 1] || startDate;
      const employeeIds = [
        ...new Set(rows.filter((row) => row.dayShift || row.nightShift).map((row) => row.employeeId)),
      ];
      await this.saveFocusedDailyRoster({ mainCompanyId, startDate, endDate, employeeIds });
      return { count: savedRows.length, startDate, endDate, employeeIds };
    }

  async importFocusedDailyExcel(file: any, body: AnyBody = {}) {
      if (!file?.buffer) throw new BadRequestException("Excel dosyası bulunamadı.");
      const mainCompanyId = this.mainCompanyId(body);
      const workbook = await this.loadUploadedWorkbook(file.buffer);
      const sheet = workbook.getWorksheet("Günlük Giriş Şablonu") || workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("Excel sayfası okunamadı.");
      const headers = this.excelHeaders(sheet);
      const employees = await this.dailyEmployees({ mainCompanyId, includePassive: true });
      const employeeById = new Map(employees.map((employee: AnyBody) => [String(employee.id), employee]));
      const employeeByPersonnelNo = new Map(
        employees
          .filter((employee: AnyBody) => String(employee.personnelNo || "").trim())
          .map((employee: AnyBody) => [
            String(employee.personnelNo || "").trim().toUpperCase(),
            employee,
          ]),
      );
      const employeeByName = new Map(
        employees.map((employee: AnyBody) => [
          String(employee.fullName || "").trim().toLocaleUpperCase("tr-TR"),
          employee,
        ]),
      );
      const rows: AnyBody[] = [];
      const notes: AnyBody[] = [];
      const employeeIds = new Set<string>();
      const dates: string[] = [];
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const personnelNoText = this.excelCellText(this.excelValue(row, headers, ["Personel Kodu", "Personel No"]));
        const employeeIdText = this.excelCellText(this.excelValue(row, headers, ["Personel ID", "ID"]));
        const personName = this.excelCellText(this.excelValue(row, headers, ["Personel", "Ad Soyad"]));
        const employee =
          employeeByPersonnelNo.get(personnelNoText.trim().toUpperCase()) ||
          employeeById.get(employeeIdText) ||
          employeeByName.get(personName.trim().toLocaleUpperCase("tr-TR"));
        const workDate = this.excelDate(this.excelValue(row, headers, ["Tarih"]));
        if (!employee || !workDate) continue;
        const employeeId = String(employee.id);
        rows.push({
          employeeId,
          workDate,
          dayShift: this.excelYes(this.excelValue(row, headers, ["Gündüz", "Gunduz"])),
          nightShift: this.excelYes(this.excelValue(row, headers, ["Gece"])),
          dayWage: this.excelNumber(this.excelValue(row, headers, ["Gündüz ücret", "Gunduz ucret"]), this.number(employee.dayWage)),
          nightWage: this.excelNumber(this.excelValue(row, headers, ["Gece ücret"]), this.number(employee.nightWage)),
        });
        notes.push({
          employeeId,
          workDate,
          dayNote: this.excelCellText(this.excelValue(row, headers, ["Gündüz not", "Gunduz not"])),
          nightNote: this.excelCellText(this.excelValue(row, headers, ["Gece not"])),
        });
        employeeIds.add(employeeId);
        dates.push(workDate);
      }
      if (!rows.length) throw new BadRequestException("Excel içinde uygulanacak satır bulunamadı.");
      const sortedDates = [...dates].sort();
      const startDate = this.dateOnlyString(body.startDate || body.start) || sortedDates[0];
      const endDate = this.dateOnlyString(body.endDate || body.end) || sortedDates[sortedDates.length - 1] || startDate;
      await this.saveDailyRange({
        mainCompanyId,
        rows,
        deleteEmptyRows: true,
      });
      await this.ensureDailyAttendanceNotesTable();
      for (const note of notes) {
        for (const shift of ["day", "night"]) {
          await (this.prisma as any).$executeRawUnsafe(
            `INSERT INTO hr_daily_attendance_notes
              (id, main_company_id, employee_id, work_date, shift, note, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(main_company_id, employee_id, work_date, shift)
             DO UPDATE SET note = excluded.note, updated_at = CURRENT_TIMESTAMP`,
            randomUUID(),
            mainCompanyId,
            note.employeeId,
            this.dateOnly(note.workDate),
            shift,
            shift === "day" ? note.dayNote : note.nightNote,
          );
        }
      }
      await this.saveFocusedDailyRoster({ mainCompanyId, startDate, endDate, employeeIds: [...employeeIds] });
      return { count: rows.length, startDate, endDate, employeeIds: [...employeeIds] };
    }

  async weeklySummary(query: AnyBody = {}) {
      const rows = (await this.dailyAttendance(query)).filter(
        (row: any) =>
          row.dayShift || row.nightShift || Number(row.totalAmount || 0) > 0,
      );
      return rows.reduce((acc: any[], row: any) => {
        const existing = acc.find(
          (item) => item.employeeId === row.employeeId,
        ) || {
          employeeId: row.employeeId,
          dayCount: 0,
          nightCount: 0,
          dayTotal: 0,
          nightTotal: 0,
          totalAmount: 0,
        };
        if (!acc.includes(existing)) acc.push(existing);
        existing.dayCount += row.dayShift ? 1 : 0;
        existing.nightCount += row.nightShift ? 1 : 0;
        existing.dayTotal += row.dayShift ? Number(row.dayWage || 0) : 0;
        existing.nightTotal += row.nightShift ? Number(row.nightWage || 0) : 0;
        existing.totalAmount += Number(row.totalAmount || 0);
        return acc;
      }, []);
    }

  paymentSlips(query: AnyBody = {}) {
      return this.weeklySummary(query);
    }

  markDailyPaid(body: AnyBody = {}) {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      return this.model("hrDailyAttendance").updateMany({
        where: { id: { in: ids } },
        data: { paymentStatus: "PAID" },
      });
    }
}
