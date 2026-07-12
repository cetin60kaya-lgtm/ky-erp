import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

type Shift = "GUNDUZ" | "GECE";

@Injectable()
export class PersonelService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(input: any = {}) {
    return String(input.mainCompanySlug || input.mainCompanyId || "mecit-hakan")
      .trim()
      .toLocaleLowerCase("tr-TR")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "mecit-hakan";
  }

  private text(value: unknown) {
    return String(value ?? "").trim();
  }

  private num(value: unknown) {
    const cleaned = String(value ?? "")
      .replace(/[₺\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  private dateOnly(value: unknown) {
    const raw = this.text(value);
    const dotted = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dotted) {
      const [, day, month, year] = dotted;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw
      : new Date().toISOString().slice(0, 10);
  }

  private dateRange(start?: unknown, end?: unknown) {
    const endDate = this.dateOnly(end);
    const fallbackStart = new Date(`${endDate}T00:00:00.000Z`);
    fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 6);
    const startDate = this.text(start)
      ? this.dateOnly(start)
      : fallbackStart.toISOString().slice(0, 10);
    return {
      startDate,
      endDate,
      gte: new Date(`${startDate}T00:00:00.000Z`),
      lte: new Date(`${endDate}T23:59:59.999Z`),
    };
  }

  private shift(value: unknown): Shift {
    return this.text(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/Ü/g, "U") === "GECE"
      ? "GECE"
      : "GUNDUZ";
  }

  private normalizeKey(value: unknown) {
    return this.text(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .replace(/İ/g, "I")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "");
  }

  private normalizeSkill(value: unknown) {
    const raw = this.normalizeKey(value);
    if (raw === "SERIMCI") return "SERIMCI";
    if (raw === "VASIFSZ" || raw === "VASIFSIZ") return "VASIFSIZ";
    if (raw === "MAKINACI") return "MAKINACI";
    return raw || "VASIFSIZ";
  }

  private async ensureCompany(slug: string) {
    await this.prisma.mainCompany.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
  }

  private cardDto(row: any) {
    const raw = (row.raw || {}) as Record<string, any>;
    return {
      id: row.id,
      personelNo: raw.personelNo || "",
      adSoyad: row.fullName,
      fullName: row.fullName,
      telefon: row.phone || "",
      phone: row.phone || "",
      aktif: row.isActive,
      varsayilanDurum: row.isActive ? "Aktif" : "Pasif",
      vasif: raw.vasif || raw.skill || "",
      araci: raw.araci || "",
      gunduzUcreti: this.num(raw.gunduzUcreti || raw.dayWage),
      geceUcreti: this.num(raw.geceUcreti || raw.nightWage),
      defaultShift: raw.defaultShift || raw.varsayilanVardiya || "NONE",
      varsayilanVardiya: raw.defaultShift || raw.varsayilanVardiya || "NONE",
      anaFirma: row.mainCompanySlug,
      mainCompanyId: row.mainCompanySlug,
      mainCompanyName: row.mainCompanySlug,
      not: raw.not || raw.note || "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private entryDto(row: any) {
    const raw = (row.raw || {}) as Record<string, any>;
    return {
      id: row.id,
      date: row.entryDate?.toISOString?.().slice(0, 10) || raw.date || "",
      tarih: row.entryDate?.toISOString?.().slice(0, 10) || raw.date || "",
      personId: raw.personId || raw.personnelId || "",
      personelNo: raw.personelNo || "",
      personName: raw.personName || "",
      vardiya: row.shift === "GECE" ? "GECE" : "GUNDUZ",
      vasif: raw.vasif || "",
      ucret: this.num(raw.ucret || raw.amount),
      birimUcret: this.num(raw.birimUcret || raw.ucret || raw.amount),
      gunlukTutar: this.num(raw.gunlukTutar || raw.amount),
      tutar: this.num(raw.tutar || raw.gunlukTutar || raw.amount),
      araci: raw.araci || "",
      mainCompanyId: row.mainCompanySlug,
      mainCompanyName: row.mainCompanySlug,
      status: raw.status || "Bekliyor",
      calisti: raw.calisti ?? true,
      isPaid: Boolean(raw.isPaid || raw.paymentSlipId),
      paymentSlipId: raw.paymentSlipId || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getPersoneller(query: any = {}) {
    const mainCompanySlug = this.slug(query);
    await this.ensureCompany(mainCompanySlug);
    const activeFilter = this.text(query.active || query.aktif || query.status);
    const where: any = { mainCompanySlug };
    if (["true", "aktif", "AKTIF"].includes(activeFilter)) where.isActive = true;
    if (["false", "pasif", "PASIF"].includes(activeFilter)) where.isActive = false;
    const rows = await this.prisma.personnel.findMany({
      where,
      orderBy: { fullName: "asc" },
    });
    return rows.map((row) => this.cardDto(row));
  }

  async createPersonel(body: any = {}) {
    const mainCompanySlug = this.slug(body);
    await this.ensureCompany(mainCompanySlug);
    const row = await this.prisma.personnel.create({
      data: {
        mainCompanySlug,
        fullName: this.text(body.adSoyad || body.fullName || body.personName),
        phone: this.text(body.telefon || body.phone) || null,
        isActive: body.aktif !== false && body.varsayilanDurum !== "Pasif",
        raw: {
          ...body,
          defaultShift: body.defaultShift || body.varsayilanVardiya || "NONE",
          varsayilanVardiya: body.defaultShift || body.varsayilanVardiya || "NONE",
        },
      },
    });
    return this.cardDto(row);
  }

  async updatePersonel(id: number | string, body: any = {}) {
    const row = await this.prisma.personnel.findFirst({
      where: { id: String(id) },
    });
    if (!row) throw new NotFoundException("Personel bulunamadı.");
    const updated = await this.prisma.personnel.update({
      where: { id: row.id },
      data: {
        fullName: this.text(body.adSoyad || body.fullName || row.fullName),
        phone: this.text(body.telefon || body.phone || row.phone) || null,
        isActive:
          body.aktif !== undefined
            ? Boolean(body.aktif)
            : body.varsayilanDurum
              ? body.varsayilanDurum !== "Pasif"
              : row.isActive,
        raw: {
          ...((row.raw || {}) as object),
          ...body,
          defaultShift: body.defaultShift || body.varsayilanVardiya || "NONE",
          varsayilanVardiya: body.defaultShift || body.varsayilanVardiya || "NONE",
        },
      },
    });
    return this.cardDto(updated);
  }

  async deletePersonel(id: number | string) {
    const row = await this.prisma.personnel.findFirst({
      where: { id: String(id) },
    });
    if (!row) throw new NotFoundException("Personel bulunamadı.");
    const updated = await this.prisma.personnel.update({
      where: { id: row.id },
      data: { isActive: false },
    });
    return this.cardDto(updated);
  }

  async getGunlukKayitlar(query: any = {}) {
    const mainCompanySlug = this.slug(query);
    const where: any = { mainCompanySlug };
    const date = query.date || query.tarih;
    const start = query.start || query.startDate;
    const end = query.end || query.endDate;
    if (date) {
      where.entryDate = new Date(`${this.dateOnly(date)}T00:00:00.000Z`);
    } else if (start || end) {
      where.entryDate = {};
      if (start) where.entryDate.gte = new Date(`${this.dateOnly(start)}T00:00:00.000Z`);
      if (end) where.entryDate.lte = new Date(`${this.dateOnly(end)}T00:00:00.000Z`);
    }
    const rows = await this.prisma.dailyWageEntry.findMany({
      where,
      orderBy: { entryDate: "desc" },
    });
    return rows.map((row) => this.entryDto(row));
  }

  async saveGunluk(body: any = {}) {
    const mainCompanySlug = this.slug(body);
    await this.ensureCompany(mainCompanySlug);
    const date = this.dateOnly(body.date || body.tarih);
    const shift = this.shift(body.vardiya);
    const existing = await this.findDailyEntry({
      mainCompanySlug,
      date,
      shift,
      personelNo: body.personelNo,
      personId: body.personId || body.personnelId,
      personName: body.personName || body.adSoyad,
    });
    const raw = {
      ...body,
      date,
      tarih: date,
      vardiya: shift,
      isPaid: false,
      paymentSlipId: body.paymentSlipId ?? null,
    };
    const data = {
      mainCompanySlug,
      entryDate: new Date(`${date}T00:00:00.000Z`),
      shift,
      note: this.text(body.aciklama || body.note) || null,
      raw,
    };
    const row = existing
      ? await this.prisma.dailyWageEntry.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.dailyWageEntry.create({
      data: {
        ...data,
      },
    });
    return this.entryDto(row);
  }

  private async findDailyEntry(args: {
    mainCompanySlug: string;
    date: string;
    shift: Shift;
    personelNo?: unknown;
    personId?: unknown;
    personName?: unknown;
  }) {
    const rows = await this.prisma.dailyWageEntry.findMany({
      where: {
        mainCompanySlug: args.mainCompanySlug,
        entryDate: new Date(`${args.date}T00:00:00.000Z`),
        shift: args.shift,
      },
    });
    const personelNo = this.text(args.personelNo);
    const personId = this.text(args.personId);
    const nameKey = this.normalizeKey(args.personName);
    return rows.find((row) => {
      const raw = (row.raw || {}) as Record<string, any>;
      if (personelNo && this.text(raw.personelNo) === personelNo) return true;
      if (personId && this.text(raw.personId || raw.personnelId) === personId) return true;
      return Boolean(nameKey && this.normalizeKey(raw.personName || raw.adSoyad) === nameKey);
    });
  }

  async saveGunlukHavuz(body: any = {}) {
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const removedEntries = Array.isArray(body.removedEntries) ? body.removedEntries : [];
    const blocked = [];
    let removed = 0;

    for (const item of removedEntries) {
      const id = this.text(item?.id || item);
      if (!id) continue;
      const row = await this.prisma.dailyWageEntry.findFirst({ where: { id } });
      if (!row) continue;
      const raw = (row.raw || {}) as Record<string, any>;
      if (raw.paymentSlipId || raw.isPaid) {
        blocked.push(this.entryDto(row));
        continue;
      }
      await this.prisma.dailyWageEntry.delete({ where: { id } });
      removed++;
    }

    const saved = [];
    for (const entry of entries) {
      saved.push(await this.saveGunluk({ ...body, ...entry }));
    }
    return {
      date: body.date || body.tarih,
      count: saved.length,
      removed,
      blocked,
      rows: saved,
    };
  }

  async clearGunlukDay(dateRaw: string) {
    const date = this.dateOnly(dateRaw);
    const deleted = await this.prisma.dailyWageEntry.deleteMany({
      where: { entryDate: new Date(`${date}T00:00:00.000Z`) },
    });
    return { date, count: deleted.count };
  }

  private dailyUnit(row: any, shift: Shift) {
    const raw = (row?.raw || row || {}) as Record<string, any>;
    return this.num(
      shift === "GECE"
        ? raw.geceUcreti || raw.nightWage || raw.ucret || raw.amount
        : raw.gunduzUcreti || raw.dayWage || raw.ucret || raw.amount,
    );
  }

  private slipDto(row: any) {
    const raw = (row.raw || {}) as Record<string, any>;
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    return {
      id: row.id,
      paymentDate: raw.paymentDate || row.createdAt?.toISOString?.().slice(0, 10),
      startDate: raw.startDate,
      endDate: raw.endDate,
      period: row.week,
      mainCompanyName: raw.mainCompanyName || row.mainCompanySlug,
      type: raw.paymentType || raw.type || "Nakit",
      dayCount: this.num(raw.dayCount),
      dayTotal: this.num(raw.dayTotal),
      nightCount: this.num(raw.nightCount),
      nightTotal: this.num(raw.nightTotal),
      grandTotal: this.num(row.amount),
      note: raw.note || raw.description || "",
      rows,
      entryIds: raw.entryIds || [],
    };
  }

  async getWeeklySummary(start?: string, end?: string, query: any = {}) {
    const mainCompanySlug = this.slug(query);
    const range = this.dateRange(start, end);
    const paidSlips = await this.prisma.weeklyPaymentSlip.findMany({
      where: { mainCompanySlug },
    });
    const paidEntryIds = new Set<string>();
    for (const slip of paidSlips) {
      const raw = (slip.raw || {}) as Record<string, any>;
      for (const id of Array.isArray(raw.entryIds) ? raw.entryIds : []) {
        paidEntryIds.add(String(id));
      }
    }

    const entries = await this.prisma.dailyWageEntry.findMany({
      where: {
        mainCompanySlug,
        entryDate: { gte: range.gte, lte: range.lte },
      },
      orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
    });
    const personnel = await this.prisma.personnel.findMany({
      where: { mainCompanySlug },
    });
    const personById = new Map(personnel.map((p) => [String(p.id), p]));
    const grouped = new Map<string, any>();

    for (const entry of entries) {
      if (paidEntryIds.has(String(entry.id))) continue;
      const raw = (entry.raw || {}) as Record<string, any>;
      const personId = this.text(raw.personId || raw.personnelId || raw.id);
      if (!personId) continue;
      const person = personById.get(personId);
      const shift = this.shift(entry.shift || raw.vardiya);
      const unit = this.dailyUnit(raw, shift);
      const row =
        grouped.get(personId) ||
        {
          key: personId,
          personId,
          personName: raw.personName || person?.fullName || "-",
          vasif: raw.vasif || raw.skill || ((person?.raw || {}) as any)?.vasif || "",
          araci: raw.araci || ((person?.raw || {}) as any)?.araci || "",
          gunduzAdet: 0,
          geceAdet: 0,
          gunduzBirim: this.num(raw.gunduzUcreti || ((person?.raw || {}) as any)?.gunduzUcreti || unit),
          geceBirim: this.num(raw.geceUcreti || ((person?.raw || {}) as any)?.geceUcreti || unit),
          gunduzTutar: 0,
          geceTutar: 0,
          toplamGun: 0,
          toplamOdeme: 0,
          odenen: 0,
          kalan: 0,
          odemeDurumu: "Bekliyor",
          entryIds: [],
        };
      if (shift === "GECE") {
        row.geceAdet += 1;
        row.geceBirim = row.geceBirim || unit;
        row.geceTutar += unit;
      } else {
        row.gunduzAdet += 1;
        row.gunduzBirim = row.gunduzBirim || unit;
        row.gunduzTutar += unit;
      }
      row.entryIds.push(entry.id);
      row.toplamGun = row.gunduzAdet + row.geceAdet;
      row.toplamOdeme = row.gunduzTutar + row.geceTutar;
      row.kalan = row.toplamOdeme;
      grouped.set(personId, row);
    }

    const rows = [...grouped.values()];
    const toplamlar = {
      personelSayisi: rows.length,
      toplamGun: rows.reduce((s, r) => s + this.num(r.toplamGun), 0),
      gunduzTutar: rows.reduce((s, r) => s + this.num(r.gunduzTutar), 0),
      geceTutar: rows.reduce((s, r) => s + this.num(r.geceTutar), 0),
      genelToplam: rows.reduce((s, r) => s + this.num(r.toplamOdeme), 0),
    };
    return { rows, toplamlar, startDate: range.startDate, endDate: range.endDate };
  }

  getReceiptRows(..._args: any[]) {
    return [];
  }

  getOdemeler(_query: any = {}) {
    return [];
  }

  saveOdeme(body: any = {}) {
    return { id: randomUUID(), ...body };
  }

  saveTopluOdemeler(body: any = {}) {
    return { ok: true, ...body };
  }

  getLogs(_query: any = {}) {
    return [];
  }

  saveLog(body: any = {}) {
    return { id: randomUUID(), createdAt: new Date().toISOString(), ...body };
  }

  private parseDailyTableLine(line: string, index: number) {
    const cleaned = line.replace(/\u00a0/g, " ").trim();
    if (!cleaned) return null;
    const tabParts = cleaned.split(/\t+/).map((part) => part.trim()).filter(Boolean);
    let parts: string[] | null = null;
    if (tabParts.length >= 7) {
      parts = tabParts;
    } else {
      const match = cleaned.match(
        /^(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+(\S+)\s+(.+?)\s+(GÜNDÜZ|GUNDUZ|GECE)\s+([₺\d.,]+)\s+(\S+)(?:\s+(\S+))?$/iu,
      );
      if (match) parts = match.slice(1);
    }
    if (!parts) {
      return { error: { line: index + 1, text: line, message: "Satır formatı okunamadı." } };
    }
    const [dateRaw, personelNoRaw, nameRaw, shiftRaw, wageRaw, skillRaw, shortWageRaw] = parts;
    const date = this.dateOnly(dateRaw);
    const adSoyad = this.text(nameRaw).replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
    const vardiya = this.shift(shiftRaw);
    const ucret = this.num(wageRaw);
    if (!adSoyad || !ucret) {
      return { error: { line: index + 1, text: line, message: "Ad soyad veya ücret eksik." } };
    }
    return {
      row: {
        date,
        personelNo: this.text(personelNoRaw),
        adSoyad,
        vardiya,
        ucret,
        vasif: this.normalizeSkill(skillRaw),
        kisaUcret: this.num(shortWageRaw),
      },
    };
  }

  private async findPersonnelForImport(mainCompanySlug: string, row: any) {
    const rows = await this.prisma.personnel.findMany({ where: { mainCompanySlug } });
    const no = this.text(row.personelNo);
    const nameKey = this.normalizeKey(row.adSoyad);
    return rows.find((person) => {
      const raw = (person.raw || {}) as Record<string, any>;
      if (no && this.text(raw.personelNo) === no) return true;
      return !no && this.normalizeKey(person.fullName) === nameKey;
    });
  }

  async importDailyPersonelDataset(body: any = {}, _replaceActiveList = false) {
    const mainCompanySlug = this.slug(body);
    await this.ensureCompany(mainCompanySlug);
    const text = this.text(body.text || body.tableText || body.rowsText);
    const lines = text.split(/\r?\n/).filter((line) => this.text(line));
    const errors: any[] = [];
    const parsedRows: any[] = [];
    lines.forEach((line, index) => {
      const parsed = this.parseDailyTableLine(line, index);
      if (!parsed) return;
      if ("error" in parsed) errors.push(parsed.error);
      else parsedRows.push(parsed.row);
    });

    let personnelCreated = 0;
    let personnelUpdated = 0;
    let dailyCreated = 0;
    let dailyUpdated = 0;

    parsedRows.sort((a, b) => a.date.localeCompare(b.date));

    for (const parsed of parsedRows) {
      const existingPerson = await this.findPersonnelForImport(mainCompanySlug, parsed);
      const existingRaw = ((existingPerson?.raw || {}) as Record<string, any>) || {};
      const nextRaw = {
        ...existingRaw,
        personelNo: parsed.personelNo || existingRaw.personelNo || "",
        vasif: parsed.vasif,
        skill: parsed.vasif,
        gunduzUcreti:
          parsed.vardiya === "GUNDUZ"
            ? parsed.ucret
            : this.num(existingRaw.gunduzUcreti || existingRaw.dayWage || parsed.ucret),
        geceUcreti:
          parsed.vardiya === "GECE"
            ? parsed.ucret
            : this.num(existingRaw.geceUcreti || existingRaw.nightWage || parsed.ucret),
        kisaUcret: parsed.kisaUcret,
        araci: existingRaw.araci || "",
        durum: "AKTIF",
        defaultShift: existingRaw.defaultShift || existingRaw.varsayilanVardiya || "NONE",
        varsayilanVardiya: existingRaw.defaultShift || existingRaw.varsayilanVardiya || "NONE",
      };
      const person = existingPerson
        ? await this.prisma.personnel.update({
            where: { id: existingPerson.id },
            data: {
              fullName: parsed.adSoyad,
              isActive: true,
              raw: nextRaw,
            },
          })
        : await this.prisma.personnel.create({
            data: {
              mainCompanySlug,
              fullName: parsed.adSoyad,
              isActive: true,
              raw: {
                ...nextRaw,
                mainCompanySlug,
                mainCompanyId: body.mainCompanyId || mainCompanySlug,
              },
            },
          });
      existingPerson ? personnelUpdated++ : personnelCreated++;

      const before = await this.findDailyEntry({
        mainCompanySlug,
        date: parsed.date,
        shift: parsed.vardiya,
        personelNo: parsed.personelNo,
        personId: person.id,
        personName: parsed.adSoyad,
      });
      await this.saveGunluk({
        mainCompanySlug,
        mainCompanyId: body.mainCompanyId || mainCompanySlug,
        personId: person.id,
        personnelId: person.id,
        personelNo: parsed.personelNo,
        personName: parsed.adSoyad,
        adSoyad: parsed.adSoyad,
        date: parsed.date,
        tarih: parsed.date,
        vardiya: parsed.vardiya,
        vasif: parsed.vasif,
        birimUcret: parsed.ucret,
        ucret: parsed.ucret,
        tutar: parsed.ucret,
        gunlukTutar: parsed.ucret,
        araci: nextRaw.araci || "",
        paymentSlipId: null,
        isPaid: false,
      });
      before ? dailyUpdated++ : dailyCreated++;
    }

    return {
      rowsRead: lines.length,
      personnelCreated,
      personnelUpdated,
      dailyCreated,
      dailyUpdated,
      errors,
      message: `${lines.length} satır okundu. ${personnelCreated + personnelUpdated} personel eklendi/güncellendi. ${dailyCreated + dailyUpdated} günlük giriş işlendi. ${errors.length} hata.`,
    };
  }

  async getDailyPaymentHistory(query: any = {}) {
    const mainCompanySlug = this.slug(query);
    const rows = await this.prisma.weeklyPaymentSlip.findMany({
      where: { mainCompanySlug },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => this.slipDto(row));
  }

  async getDailyPaymentHistoryDetail(id: number | string) {
    const row = await this.prisma.weeklyPaymentSlip.findFirst({
      where: { id: String(id) },
    });
    if (!row) throw new NotFoundException("Ödeme fişi bulunamadı.");
    return this.slipDto(row);
  }

  async createDailyWeeklySlip(body: any = {}) {
    const mainCompanySlug = this.slug(body);
    await this.ensureCompany(mainCompanySlug);
    const summary = await this.getWeeklySummary(body.startDate, body.endDate, body);
    const selected = new Set((body.personIds || []).map((id: any) => String(id)));
    const rows = summary.rows.filter(
      (row: any) => !selected.size || selected.has(String(row.personId)),
    );
    const entryIds = [...new Set(rows.flatMap((row: any) => row.entryIds || []))];
    const dayCount = rows.reduce((s: number, r: any) => s + this.num(r.gunduzAdet), 0);
    const nightCount = rows.reduce((s: number, r: any) => s + this.num(r.geceAdet), 0);
    const dayTotal = rows.reduce((s: number, r: any) => s + this.num(r.gunduzTutar), 0);
    const nightTotal = rows.reduce((s: number, r: any) => s + this.num(r.geceTutar), 0);
    const amount = dayTotal + nightTotal;
    const raw = {
      startDate: summary.startDate,
      endDate: summary.endDate,
      paymentDate: body.paymentDate || new Date().toISOString().slice(0, 10),
      paymentType: body.paymentType || body.type || "Nakit",
      mainCompanyName: body.mainCompanyName || body.anaFirma || mainCompanySlug,
      note: body.note || body.description || "",
      dayCount,
      nightCount,
      dayTotal,
      nightTotal,
      entryIds,
      rows,
    };
    const slip = await this.prisma.weeklyPaymentSlip.create({
      data: {
        mainCompanySlug,
        week: `${summary.startDate} - ${summary.endDate}`,
        amount,
        raw,
      },
    });
    return this.slipDto(slip);
  }

  excel(type: string) {
    return Buffer.from(`KY ERP ${type}`, "utf8");
  }
}
