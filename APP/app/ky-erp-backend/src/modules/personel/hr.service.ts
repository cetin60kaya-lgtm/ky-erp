import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

type Resource =
  | "personel"
  | "puantaj"
  | "izinler"
  | "bordro-havuz"
  | "bordro-hazirlik"
  | "maas-hesaplari"
  | "odemeler"
  | "evraklar"
  | "logs"
  | "settings";

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  private resourceMap: Record<Resource, string> = {
    personel: "hr_monthly_personnel",
    puantaj: "hr_overtime_records",
    izinler: "hr_leave_records",
    "bordro-havuz": "hr_payrolls",
    "bordro-hazirlik": "hr_payrolls",
    "maas-hesaplari": "hr_payrolls",
    odemeler: "hr_payment_approvals",
    evraklar: "documentFile",
    logs: "activityLog",
    settings: "permission",
  };

  private slug(input: any = {}) {
    return (
      String(input.mainCompanySlug || input.mainCompanyId || "mecit-hakan")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "mecit-hakan"
    );
  }

  private num(value: unknown) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    let cleaned = String(value ?? "")
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
    return this.normalizeKey(value || "VAR") === "YOK" ? "YOK" : "VAR";
  }

  private isCashOnlyPaymentType(value: unknown) {
    const text = this.normalizeKey(value);
    return text.includes("ELDEN") && !text.includes("BANKA");
  }

  private splitMonthlyPayment(input: {
    totalAmount: number;
    sgkStatus?: unknown;
    paymentType?: unknown;
    bankAmount?: unknown;
    cashAmount?: unknown;
  }) {
    const totalAmount = Math.max(0, this.num(input.totalAmount));
    if (this.normalizeSgkStatus(input.sgkStatus) === "YOK" || this.isCashOnlyPaymentType(input.paymentType)) {
      return { bankAmount: 0, cashAmount: totalAmount };
    }
    const enteredBank = this.num(input.bankAmount);
    const bankAmount = Math.min(totalAmount, Math.max(0, enteredBank));
    const fallbackCash = this.num(input.cashAmount);
    return {
      bankAmount,
      cashAmount: bankAmount > 0 ? Math.max(totalAmount - bankAmount, 0) : fallbackCash,
    };
  }

  private text(value: unknown) {
    return String(value ?? "").trim();
  }

  private cleanName(value: unknown) {
    return this.text(value).replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
  }

  private normalizeKey(value: unknown) {
    return this.cleanName(value)
      .replace(/İ/g, "I")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "");
  }

  private status(value: unknown) {
    const key = this.normalizeKey(value || "AKTIF");
    return key === "PASIF" ? "PASIF" : "AKTIF";
  }

  private date(value: unknown) {
    const raw = this.text(value);
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw
      : new Date().toISOString().slice(0, 10);
    return new Date(`${iso}T00:00:00.000Z`);
  }

  private monthKey(input: any = {}) {
    const raw = this.text(
      input.period || input.donem || input.ay || input.monthKey,
    );
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    const year = this.text(input.year);
    const month = this.text(input.month).padStart(2, "0");
    return year && month
      ? `${year}-${month}`
      : new Date().toISOString().slice(0, 7);
  }

  private delegate(resource: Resource, options: { optional?: boolean } = {}) {
    const model = this.resourceMap[resource];
    const candidates =
      model === "hr_monthly_personnel"
        ? [model, "hr_monthly_personel", "hrMonthlyPersonel"]
        : [model];
    const delegate = candidates
      .map((candidate) => (this.prisma as any)[candidate])
      .find(Boolean);
    if (!delegate && options.optional) return null;
    if (!delegate)
      throw new BadRequestException(`SQL modeli bulunamadı: ${model}`);
    return delegate;
  }

  private normalizeResourceName(resourceRaw: string): Resource {
    const resource = String(resourceRaw || "").trim() as Resource;
    if (!this.resourceMap[resource]) {
      throw new BadRequestException(`Bilinmeyen HR kaynağı: ${resourceRaw}`);
    }
    return resource;
  }

  private async ensureCompany(slug: string) {
    await this.prisma.mainCompany.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
  }

  private monthlyDto(row: any) {
    const totalAmount = this.num(row.monthly_salary) + this.num(row.monthly_road_fee);
    const payment = this.splitMonthlyPayment({
      totalAmount,
      sgkStatus: row.sgk_status,
      paymentType: row.payment_type,
      bankAmount: row.bank_base_amount,
      cashAmount: Math.max(0, totalAmount - this.num(row.bank_base_amount)),
    });
    return {
      id: row.id,
      mainCompanyId: row.main_company_slug,
      mainCompanyName: row.main_company_slug,
      fullName: row.full_name,
      adSoyad: row.full_name,
      personnelCode: row.code || "",
      department: row.department || "",
      title: row.title || "",
      sgkStatus: this.normalizeSgkStatus(row.sgk_status),
      status: row.is_active ? "AKTIF" : "PASIF",
      startDate: row.hire_date?.toISOString?.().slice(0, 10) || "",
      salary: this.num(row.monthly_salary),
      roadAllowance: this.num(row.monthly_road_fee),
      bankAmount: payment.bankAmount,
      cashAmount: payment.cashAmount,
      totalAmount,
      paymentChannel: row.payment_type,
      iban: row.iban || "",
      overtimeBaseHours: this.num(row.monthly_hour_base),
      note: row.note || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private monthlyPayload(payload: any = {}) {
    const sgkStatus = this.normalizeSgkStatus(
      payload.sgkStatus || payload.sgkSskDurumu || "VAR",
    );
    const paymentType = this.text(
      payload.paymentChannel || payload.bankaEldenTercihi || "BANKA_ELDEN",
    ).toUpperCase();
    const salary = this.num(payload.salary || payload.maas);
    const roadAllowance = this.num(payload.roadAllowance || payload.yolUcreti);
    const totalAmount =
      this.num(payload.totalAmount || payload.total) ||
      (this.num(payload.bankAmount || payload.banka) + this.num(payload.cashAmount || payload.nakit) > 0
        ? this.num(payload.bankAmount || payload.banka) + this.num(payload.cashAmount || payload.nakit)
        : salary + roadAllowance);
    const payment = this.splitMonthlyPayment({
      totalAmount,
      sgkStatus,
      paymentType,
      bankAmount: payload.bankAmount || payload.banka,
      cashAmount: payload.cashAmount || payload.nakit,
    });
    return {
      code: this.text(payload.personnelCode || payload.personelKodu) || null,
      full_name: this.cleanName(payload.fullName || payload.adSoyad),
      department: this.text(payload.department || payload.departman) || null,
      title:
        this.text(payload.title || payload.gorev || payload.gorevUnvan) || null,
      hire_date:
        payload.startDate || payload.iseGirisTarihi
          ? this.date(payload.startDate || payload.iseGirisTarihi)
          : null,
      is_active:
        this.status(payload.status || payload.aktifPasif || "AKTIF") !==
        "PASIF",
      sgk_status: sgkStatus,
      payment_type:
        payment.bankAmount > 0 && payment.cashAmount > 0
          ? "BANKA_ELDEN"
          : payment.bankAmount > 0
            ? "BANKA"
            : "ELDEN",
      iban: this.text(payload.iban) || null,
      monthly_salary: salary,
      monthly_road_fee: roadAllowance,
      bank_base_amount: payment.bankAmount,
      monthly_hour_base: this.num(
        payload.overtimeBaseHours || payload.mesaiSaatTabani || 225,
      ),
      note: this.text(payload.note || payload.not) || null,
      updated_at: new Date(),
    };
  }

  private overtimePayload(payload: any = {}) {
    return {
      personnel_id: this.text(payload.personnelId || payload.personelId),
      record_date: this.date(
        payload.recordDate || payload.tarih || payload.date,
      ),
      record_type: this.text(
        payload.recordType || payload.tip || "WEEKDAY_OVERTIME",
      ).toUpperCase(),
      hour: this.num(payload.hour || payload.saat),
      day_count: this.num(payload.dayCount || payload.gun),
      multiplier: this.num(payload.multiplier || payload.carpan || 1),
      reflect_to_payroll: payload.reflectToPayroll !== false,
      note: this.text(payload.note || payload.aciklama) || null,
      updated_at: new Date(),
    };
  }

  private leavePayload(payload: any = {}) {
    return {
      personnel_id: this.text(payload.personnelId || payload.personelId),
      leave_type: this.text(payload.leaveType || payload.izinTipi || "YILLIK"),
      start_date: this.date(
        payload.startDate || payload.baslangic || payload.tarih,
      ),
      end_date: this.date(payload.endDate || payload.bitis || payload.tarih),
      day_count: this.num(payload.dayCount || payload.gun || 1),
      is_paid_leave: payload.isPaidLeave !== false,
      deduct_from_salary: Boolean(payload.deductFromSalary),
      reflect_to_payroll: payload.reflectToPayroll !== false,
      note: this.text(payload.note || payload.aciklama) || null,
      updated_at: new Date(),
    };
  }

  private payrollPayload(payload: any = {}) {
    return {
      period: this.monthKey(payload),
      personnel_id: this.text(
        payload.personnelId || payload.personelId || payload.id,
      ),
      base_salary: this.num(
        payload.baseSalary || payload.maas || payload.salary,
      ),
      road_fee: this.num(payload.roadFee || payload.yolUcreti),
      overtime_amount: this.num(payload.overtimeAmount || payload.mesaiTutari),
      missing_day_amount: this.num(
        payload.missingDayAmount || payload.eksikGunTutari,
      ),
      advance_amount: this.num(payload.advanceAmount || payload.avans),
      deduction_amount: this.num(payload.deductionAmount || payload.kesinti),
      manual_adjustment_amount: this.num(
        payload.manualAdjustmentAmount || payload.duzeltme,
      ),
      net_amount: this.num(payload.netAmount || payload.net),
      bank_amount: this.num(payload.bankAmount || payload.banka),
      cash_amount: this.num(payload.cashAmount || payload.nakit),
      status: this.text(payload.status || "DRAFT").toUpperCase(),
      note: this.text(payload.note || payload.aciklama) || null,
      updated_at: new Date(),
    };
  }

  async bootstrap() {
    const [personel, puantaj, izinler, bordro, odemeler, logs] =
      await Promise.all([
        this.list("personel", {}),
        this.list("puantaj", {}),
        this.list("izinler", {}),
        this.list("bordro-hazirlik", {}),
        this.list("odemeler", {}),
        this.list("logs", {}),
      ]);
    return {
      personel,
      puantaj,
      izinler,
      bordroHavuz: bordro,
      bordroHazirlik: bordro,
      maasHesaplari: bordro,
      odemeler,
      evraklar: [],
      logs,
      settings: [],
    };
  }

  private emptyOverview() {
    return {
      monthlyPersonnel: [],
      dailyPersonnel: [],
      cards: [],
      summary: {
        monthlyCount: 0,
        activeMonthlyCount: 0,
        dailyCount: 0,
        payrollReadyCount: 0,
        monthlyPaymentCount: 0,
        dailyPaymentCount: 0,
      },
    };
  }

  private async safeList(resource: Resource, query: any = {}) {
    try {
      return await this.list(resource, query);
    } catch {
      return [];
    }
  }

  private async dailyCards(query: any = {}) {
    try {
      const mainCompanySlug = this.slug(query);
      const rows = await this.prisma.personnel.findMany({
        where: { mainCompanySlug },
        orderBy: { fullName: "asc" },
      });
      return rows.map((row: any) => ({
        id: row.id,
        adSoyad: row.fullName,
        fullName: row.fullName,
        telefon: row.phone || "",
        phone: row.phone || "",
        aktif: row.isActive,
        status: row.isActive ? "AKTIF" : "PASIF",
        mainCompanySlug: row.mainCompanySlug,
        mainCompanyId: row.mainCompanySlug,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ...(row.raw && typeof row.raw === "object" ? row.raw : {}),
      }));
    } catch {
      return [];
    }
  }

  private async dailyPersonnel(query: any = {}) {
    try {
      const mainCompanySlug = this.slug(query);
      const rows = await this.prisma.dailyWageEntry.findMany({
        where: { mainCompanySlug },
        orderBy: { entryDate: "desc" },
        take: 500,
      });
      return rows;
    } catch {
      return [];
    }
  }

  async overview(query: any = {}) {
    const fallback = this.emptyOverview();
    const [
      monthlyPersonnel,
      dailyPersonnel,
      cards,
      bordroHazirlik,
      odemeler,
      logs,
    ] = await Promise.all([
      this.safeList("personel", query),
      this.dailyPersonnel(query),
      this.dailyCards(query),
      this.safeList("bordro-hazirlik", query),
      this.safeList("odemeler", query),
      this.safeList("logs", query),
    ]);
    const summary = {
      ...fallback.summary,
      monthlyCount: monthlyPersonnel.length,
      activeMonthlyCount: monthlyPersonnel.filter(
        (p: any) => p.status !== "PASIF",
      ).length,
      dailyCount: dailyPersonnel.length || cards.length,
      payrollReadyCount: bordroHazirlik.length,
      monthlyPaymentCount: odemeler.length,
    };
    return {
      ok: true,
      data: {
        monthlyPersonnel,
        dailyPersonnel,
        cards,
        summary,
        ...summary,
        bootstrapStatus: "sql",
        legacyStatus: "disabled",
        recentLogs: logs.slice(0, 8),
        upcomingTasks: [],
      },
    };
  }

  async list(resourceRaw: string, query: any = {}) {
    const resource = this.normalizeResourceName(resourceRaw);
    const mainCompanySlug = this.slug(query);
    const delegate = this.delegate(resource);

    if (resource === "logs") {
      return delegate.findMany({
        where: { mainCompanySlug },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }

    const where: any =
      resource === "settings"
        ? { mainCompanySlug }
        : { main_company_slug: mainCompanySlug };
    if (resource === "personel") {
      const durum = this.normalizeKey(query.durum || query.status || "AKTIF");
      if (durum === "PASIF") where.is_active = false;
      else if (durum !== "HEPSI") where.is_active = true;
    }
    const rows = await delegate.findMany({
      where,
      orderBy:
        resource === "settings"
          ? { createdAt: "desc" }
          : { created_at: "desc" },
      take: 500,
    });
    return resource === "personel"
      ? rows.map((row: any) => this.monthlyDto(row))
      : rows;
  }

  async create(resourceRaw: string, payload: any = {}) {
    const resource = this.normalizeResourceName(resourceRaw);
    const mainCompanySlug = this.slug(payload);
    await this.ensureCompany(mainCompanySlug);
    const delegate = this.delegate(resource);
    const id = randomUUID();
    let data: any;
    if (resource === "personel")
      data = {
        id,
        main_company_slug: mainCompanySlug,
        created_at: new Date(),
        ...this.monthlyPayload(payload),
      };
    else if (resource === "puantaj")
      data = {
        id,
        main_company_slug: mainCompanySlug,
        created_at: new Date(),
        ...this.overtimePayload(payload),
      };
    else if (resource === "izinler")
      data = {
        id,
        main_company_slug: mainCompanySlug,
        created_at: new Date(),
        ...this.leavePayload(payload),
      };
    else if (
      ["bordro-havuz", "bordro-hazirlik", "maas-hesaplari"].includes(resource)
    ) {
      data = {
        id,
        main_company_slug: mainCompanySlug,
        created_at: new Date(),
        ...this.payrollPayload(payload),
      };
      const row = await delegate.upsert({
        where: {
          main_company_slug_period_personnel_id: {
            main_company_slug: mainCompanySlug,
            period: data.period,
            personnel_id: data.personnel_id,
          },
        },
        create: data,
        update: data,
      });
      return row;
    } else
      throw new BadRequestException(
        `${resource} için genel create SQL'e bağlanmadı.`,
      );
    const row = await delegate.create({ data });
    return resource === "personel" ? this.monthlyDto(row) : row;
  }

  async update(resourceRaw: string, id: string, payload: any = {}) {
    const resource = this.normalizeResourceName(resourceRaw);
    const delegate = this.delegate(resource);
    let data: any;
    if (resource === "personel") data = this.monthlyPayload(payload);
    else if (resource === "puantaj") data = this.overtimePayload(payload);
    else if (resource === "izinler") data = this.leavePayload(payload);
    else if (
      ["bordro-havuz", "bordro-hazirlik", "maas-hesaplari"].includes(resource)
    )
      data = this.payrollPayload(payload);
    else
      throw new BadRequestException(
        `${resource} için genel update SQL'e bağlanmadı.`,
      );
    const row = await delegate
      .update({ where: { id }, data })
      .catch(() => null);
    if (!row) throw new NotFoundException("Kayıt bulunamadı.");
    return resource === "personel" ? this.monthlyDto(row) : row;
  }

  async remove(resourceRaw: string, id: string) {
    const resource = this.normalizeResourceName(resourceRaw);
    const delegate = this.delegate(resource);
    if (resource === "personel") {
      await delegate.update({
        where: { id },
        data: { is_active: false, updated_at: new Date() },
      });
    } else {
      await delegate.delete({ where: { id } });
    }
    return { ok: true, id };
  }

  async updateMonthlyStatus(id: string, body: any = {}) {
    const delegate = this.delegate("personel");
    const status = this.status(body.durum || body.status || "PASIF");
    const row = await delegate
      .update({
        where: { id },
        data: {
          is_active: status !== "PASIF",
          updated_at: new Date(),
        },
      })
      .catch(() => null);
    if (!row) throw new NotFoundException("Kayıt bulunamadı.");
    return this.monthlyDto(row);
  }

  private parseMonthlyImportLine(line: string, index: number) {
    const cleaned = line.replace(/\u00a0/g, " ").trim();
    if (!cleaned) return null;
    const parts = cleaned.split(/\t+/).map((part) => part.trim());
    if (
      parts.length < 2 ||
      this.normalizeKey(parts[0]).includes("PERSONELLISTESI")
    ) {
      return null;
    }
    if (parts.length < 7) {
      return {
        error: { line: index + 1, text: line, message: "Satır formatı eksik." },
      };
    }
    const [
      fullName,
      salary,
      roadAllowance,
      bankAmount,
      cashAmount,
      totalAmount,
      status,
      note = "",
    ] = parts;
    const name = this.cleanName(fullName);
    if (!name) {
      return {
        error: { line: index + 1, text: line, message: "Personel adı boş." },
      };
    }
    return {
      row: {
        fullName: name,
        salary: this.num(salary),
        roadAllowance: this.num(roadAllowance),
        bankAmount: this.num(bankAmount),
        cashAmount: this.num(cashAmount),
        totalAmount: this.num(totalAmount),
        status: this.status(status || "AKTIF"),
        note: this.text(note),
      },
    };
  }

  async importMonthly(body: any = {}) {
    const mainCompanySlug = this.slug(body);
    await this.ensureCompany(mainCompanySlug);
    const delegate = this.delegate("personel");
    const text = this.text(body.text || body.tableText || body.rowsText);
    const lines = text.split(/\r?\n/).filter((line) => this.text(line));
    const errors: any[] = [];
    const parsedRows: any[] = [];
    lines.forEach((line, index) => {
      const parsed = this.parseMonthlyImportLine(line, index);
      if (!parsed) return;
      if ("error" in parsed) errors.push(parsed.error);
      else parsedRows.push(parsed.row);
    });

    let monthlyCreated = 0;
    let monthlyUpdated = 0;
    for (const parsed of parsedRows) {
      const existingRows = await delegate.findMany({
        where: { main_company_slug: mainCompanySlug },
        take: 1000,
      });
      const nameKey = this.normalizeKey(parsed.fullName);
      const existing = existingRows.find(
        (row: any) => this.normalizeKey(row.full_name) === nameKey,
      );
      const payload = {
        mainCompanySlug,
        fullName: parsed.fullName,
        salary: parsed.salary,
        roadAllowance: parsed.roadAllowance,
        bankAmount: parsed.bankAmount,
        status: parsed.status,
        note: parsed.note,
        paymentChannel:
          parsed.bankAmount > 0 && parsed.cashAmount > 0
            ? "KARISIK"
            : parsed.bankAmount > 0
              ? "BANKA"
              : "ELDEN",
      };
      if (existing) {
        await delegate.update({
          where: { id: existing.id },
          data: this.monthlyPayload(payload),
        });
        monthlyUpdated++;
      } else {
        await delegate.create({
          data: {
            id: randomUUID(),
            main_company_slug: mainCompanySlug,
            created_at: new Date(),
            ...this.monthlyPayload(payload),
          },
        });
        monthlyCreated++;
      }
    }

    return {
      rowsRead: lines.length,
      monthlyCreated,
      monthlyUpdated,
      errors,
      message: `${lines.length} satır okundu. ${monthlyCreated + monthlyUpdated} aylık personel güncellendi. ${errors.length} hata.`,
    };
  }

  listMonthly() {
    return this.list("personel", {});
  }
  createMonthly(body: any) {
    return this.create("personel", body);
  }
  updateMonthly(id: string, body: any) {
    return this.update("personel", id, body);
  }
  removeMonthly(id: string) {
    return this.remove("personel", id);
  }
  overtimeLeave(query: any) {
    return Promise.all([
      this.list("puantaj", query),
      this.list("izinler", query),
    ]).then(([overtime, leave]) => ({ ok: true, data: { overtime, leave } }));
  }
  createOvertime(body: any) {
    return this.create("puantaj", body).then((data) => ({ ok: true, data }));
  }
  updateOvertime(id: string, body: any) {
    return this.update("puantaj", id, body).then((data) => ({
      ok: true,
      data,
    }));
  }
  removeOvertime(id: string) {
    return this.remove("puantaj", id);
  }
  createLeave(body: any) {
    return this.create("izinler", body).then((data) => ({ ok: true, data }));
  }
  updateLeave(id: string, body: any) {
    return this.update("izinler", id, body).then((data) => ({
      ok: true,
      data,
    }));
  }
  removeLeave(id: string) {
    return this.remove("izinler", id);
  }
  leaveSummary(_query: any = {}) {
    return Promise.resolve({
      ok: true,
      data: { yillikIzinHakki: 0, kullanilanIzin: 0, kalanIzin: 0 },
    });
  }
  payrollCandidates(query: any) {
    return this.list("personel", query).then((data) => ({ ok: true, data }));
  }
  payrollPool(query: any) {
    return this.list("bordro-havuz", query).then((data) => ({
      ok: true,
      data,
    }));
  }
  payrollPoolAdd(body: any) {
    return this.create("bordro-havuz", body).then((data) => ({
      ok: true,
      data,
    }));
  }
  payrollCalculate(body: any) {
    return Promise.resolve({ ok: true, data: body });
  }
  payrollSave(body: any) {
    return this.create("bordro-hazirlik", body).then((data) => ({
      ok: true,
      data,
    }));
  }
  paymentControl(query: any) {
    return this.list("bordro-havuz", query).then((data) => ({
      ok: true,
      data,
    }));
  }
  paymentControlCalculate(body: any) {
    return Promise.resolve({ ok: true, data: body });
  }
  paymentControlSave(body: any) {
    return this.payrollSave(body);
  }
  paymentControlExportExcel(body: any) {
    return Promise.resolve({
      ok: true,
      data: { requested: true, payload: body },
    });
  }
  paymentControlCreateSlip(body: any) {
    return Promise.resolve({ ok: true, data: { id: randomUUID(), ...body } });
  }
  calculateAllBordro(body: any) {
    return this.payrollCalculate(body);
  }
  fillBordroHavuz(body: any) {
    return this.payrollPoolAdd(body);
  }
  removeFromBordroHavuz(id: string) {
    return this.remove("bordro-havuz", id);
  }
  clearBordroHavuz(_body: any = {}) {
    return Promise.resolve({ ok: true, data: { cleared: false } });
  }
  calculatePoolBordro(body: any) {
    return this.payrollCalculate(body);
  }
  savePoolBordro(body: any) {
    return this.payrollSave(body);
  }
}
