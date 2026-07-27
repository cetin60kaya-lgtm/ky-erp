import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type AnyBody = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return new Prisma.Decimal(number(value));
}

function date(value: unknown, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function iso(value: unknown) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function normalizeName(value: unknown) {
  return text(value).toLocaleUpperCase("tr-TR");
}

function normalizeKey(value: unknown) {
  return normalizeName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function firmType(value: unknown) {
  const raw = text(value).toUpperCase();
  if (["CUSTOMER", "MUSTERI", "MÜŞTERİ"].includes(raw)) return "CUSTOMER";
  if (["SUPPLIER", "SATICI", "TEDARIKCI", "TEDARİKÇİ"].includes(raw)) return "SUPPLIER";
  return "BOTH";
}

function workType(value: unknown) {
  const raw = text(value).toUpperCase();
  if (["UNOFFICIAL", "GAYRI", "GAYRİ"].includes(raw)) return "UNOFFICIAL";
  if (raw === "BOTH") return "BOTH";
  return "OFFICIAL";
}

function movementType(value: unknown) {
  const raw = text(value).toLocaleLowerCase("tr-TR");
  return /alacak|credit|tahsilat|ödeme|odeme/.test(raw) ? "CREDIT" : "DEBIT";
}

function paymentType(value: unknown) {
  const raw = text(value).toLocaleLowerCase("tr-TR");
  if (raw.includes("çek") || raw.includes("cek") || raw.includes("check")) return "CHECK";
  if (raw.includes("kart") || raw.includes("card")) return "CARD";
  if (raw.includes("nakit") || raw.includes("cash")) return "CASH";
  return "TRANSFER";
}

function response(data: unknown) {
  return { ok: true, data };
}

function openPaymentStatus(status: unknown) {
  const raw = text(status).toUpperCase();
  return !["PAID", "CANCELLED", "IPTAL", "ODENDI", "ÖDENDI", "ÖDENDİ"].includes(raw);
}

function paymentStatusForAmount(amount: number, openAmount: number) {
  return amount >= openAmount ? "PAID" : "WAITING";
}

@Injectable()
export class AccountingApiService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(input: AnyBody = {}) {
    return text(input.mainCompanySlug || input.mainCompanyId || "mecit-hakan");
  }

  private async ensureMainCompany(slug: string) {
    await this.prisma.mainCompany.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
  }

  private documentVatDirection(document: any): "IN" | "OUT" | null {
    const raw = objectValue(document?.raw);
    const key = normalizeKey(
      [
        document?.documentType,
        document?.sourceType,
        document?.detectedType,
        document?.targetType,
        raw.documentKind,
        raw.flowType,
        raw.sourceKind,
        raw.source,
      ].join(" "),
    );
    if (
      /SATIS_FATURA|BIZIM_FATURA|BIZIM_KESTIGIMIZ_FATURA|OUR_INVOICE|GIDEN_FATURA|SALES_INVOICE_IMPORT|FATURA_KESIM/.test(
        key,
      )
    ) {
      return "OUT";
    }
    if (
      /ALIS_FATURA|GELEN_FATURA|SUPPLIER_INVOICE|EXPENSE_INVOICE|TEDARIKCI_GELEN_FATURA|PURCHASE/.test(
        key,
      )
    ) {
      return "IN";
    }
    const companyType = normalizeKey(document?.company?.type || objectValue(document?.company?.raw).type);
    if (companyType === "MUSTERI" || companyType === "CUSTOMER") return "OUT";
    if (["SATICI", "TEDARIKCI", "SUPPLIER"].includes(companyType)) return "IN";
    return null;
  }

  private documentAllowsVat(document: any) {
    const documentRaw = objectValue(document?.raw);
    const companyRaw = objectValue(document?.company?.raw);
    const officialType = normalizeKey(
      documentRaw.resmiGayri ||
        documentRaw.officialType ||
        document?.company?.defaultRecordType ||
        companyRaw.resmiGayri ||
        "RESMI",
    );
    const defaultVatType = normalizeKey(
      companyRaw.defaultVatType || companyRaw.varsayilanKdvTipi || "INDIRILECEK_KDV",
    );
    return !officialType.includes("GAYRI") && defaultVatType !== "KDV_YOK";
  }

  private async syncVatRecordsFromDocuments(slug: string, year: number, month: number) {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const documents = await this.prisma.document.findMany({
      where: {
        mainCompanySlug: slug,
        deletedAt: null,
        companyId: { not: null },
        date: { gte: start, lte: end },
        vatTotal: { gt: 0 },
      },
      include: { company: true },
      take: 3000,
      orderBy: { date: "asc" },
    });
    if (!documents.length) return;

    const documentIds = documents.map((document) => document.id);
    const existingRows = await this.prisma.vatRecord.findMany({
      where: { mainCompanySlug: slug, documentId: { in: documentIds } },
    });
    const existingByDocumentId = new Map(
      existingRows
        .filter((row) => row.documentId)
        .map((row) => [row.documentId as string, row]),
    );

    for (const document of documents) {
      const direction = this.documentVatDirection(document);
      if (!direction || !this.documentAllowsVat(document)) continue;
      const periodDate = document.date || new Date();
      const subtotal = number(document.subtotal);
      const vatTotal = number(document.vatTotal);
      const grandTotal = number(document.grandTotal);
      const vatRate = subtotal > 0 && vatTotal > 0 ? (vatTotal / subtotal) * 100 : 0;
      const payload = {
        mainCompanySlug: slug,
        companyId: document.companyId,
        firmId: document.companyId,
        documentId: document.id,
        direction: direction === "OUT" ? "OUT" : "IN",
        workType: "OFFICIAL",
        date: periodDate,
        subtotal: money(subtotal),
        total: money(grandTotal),
        periodMonth: month,
        periodYear: year,
        vatDirection: direction,
        vatRate: money(vatRate),
        baseAmount: money(subtotal),
        vatAmount: money(vatTotal),
        documentNo: document.documentNo,
        documentDate: periodDate,
        incomingVat: money(direction === "IN" ? vatTotal : 0),
        outgoingVat: money(direction === "OUT" ? vatTotal : 0),
        carryVat: money(0),
        raw: {
          ...objectValue(document.raw),
          source: "KDV_DOCUMENT_SYNC",
          vatRule:
            direction === "OUT"
              ? "KESILEN_FATURA_HESAPLANAN_KDV"
              : "GELEN_FATURA_INDIRILECEK_KDV",
        },
      };
      const existing = existingByDocumentId.get(document.id);
      if (existing) {
        const incoming = number(existing.incomingVat);
        const outgoing = number(existing.outgoingVat);
        const needsUpdate =
          existing.vatDirection !== direction ||
          (direction === "IN" && (incoming !== vatTotal || outgoing !== 0)) ||
          (direction === "OUT" && (outgoing !== vatTotal || incoming !== 0));
        if (needsUpdate) {
          await this.prisma.vatRecord.update({
            where: { id: existing.id },
            data: payload,
          });
        }
        continue;
      }
      await this.prisma.vatRecord.create({ data: payload });
    }
  }

  private async firmOrThrow(id: string) {
    const firm = await this.prisma.firm.findUnique({ where: { id } });
    if (!firm) throw new NotFoundException("Firma bulunamadı.");
    return firm;
  }

  private async syncCompaniesToFirms(slug: string) {
    const companies = await this.prisma.company.findMany({
      where: { mainCompanySlug: slug, deletedAt: null },
      take: 500,
      orderBy: { name: "asc" },
    });
    const existingFirms = await this.prisma.firm.findMany({
      where: { OR: [{ mainCompanySlug: slug }, { mainCompanyId: slug }] },
      select: { id: true, normalizedName: true, taxNo: true },
    });
    const existingById = new Set(existingFirms.map((firm) => firm.id));
    const existingByKey = new Map(
      existingFirms.map((firm) => [`${firm.normalizedName || ""}|${firm.taxNo || ""}`, firm]),
    );
    for (const company of companies) {
      const uniqueKey = `${company.normalizedName || normalizeName(company.name)}|${company.taxNo || ""}`;
      if (existingById.has(company.id)) {
        await this.prisma.firm.update({
          where: { id: company.id },
          data: {
            mainCompanyId: slug,
            mainCompanySlug: slug,
            name: company.name,
            shortName: company.legacyId,
            normalizedName: company.normalizedName || normalizeName(company.name),
            taxNo: company.taxNo,
            taxOffice: company.taxOffice,
            firmType: firmType(company.type) as any,
            workType: workType(company.defaultRecordType) as any,
            officialType: company.defaultRecordType || "OFFICIAL",
            defaultVatRate: company.defaultVatRate,
            openingBalance: company.openingBalance,
            address: company.address,
            phone: company.phone,
            email: company.email,
            note: company.note,
            isActive: company.isActive,
            deletedAt: company.deletedAt,
          },
        });
        continue;
      }
      if (existingByKey.has(uniqueKey)) {
        continue;
      }
      await this.prisma.firm.create({
        data: {
          id: company.id,
          mainCompanyId: slug,
          mainCompanySlug: slug,
          name: company.name,
          shortName: company.legacyId,
          normalizedName: company.normalizedName || normalizeName(company.name),
          taxNo: company.taxNo,
          taxOffice: company.taxOffice,
          firmType: firmType(company.type) as any,
          workType: workType(company.defaultRecordType) as any,
          officialType: company.defaultRecordType || "OFFICIAL",
          defaultVatRate: company.defaultVatRate,
          openingBalance: company.openingBalance,
          address: company.address,
          phone: company.phone,
          email: company.email,
          note: company.note,
          isActive: company.isActive,
          deletedAt: company.deletedAt,
        },
      });
      existingById.add(company.id);
      existingByKey.set(uniqueKey, { id: company.id, normalizedName: company.normalizedName || normalizeName(company.name), taxNo: company.taxNo });
    }
  }

  async listFirms(query: AnyBody = {}) {
    const slug = this.slug(query);
    await this.ensureMainCompany(slug);
    await this.syncCompaniesToFirms(slug);
    const search = text(query.search || query.q).toLocaleLowerCase("tr-TR");
    const activeFilter = text(query.active || query.isActive || "active");
    const where: Prisma.FirmWhereInput = {
      OR: [{ mainCompanySlug: slug }, { mainCompanyId: slug }],
      deletedAt: activeFilter === "all" || activeFilter === "" ? undefined : null,
      isActive:
        activeFilter === "all" || activeFilter === ""
          ? undefined
          : activeFilter === "false" || activeFilter === "passive"
            ? false
            : true,
      firmType: query.firmType ? (firmType(query.firmType) as any) : undefined,
      workType: query.workType || query.officialType ? (workType(query.workType || query.officialType) as any) : undefined,
      AND: search
        ? [
            {
              OR: [
                { name: { contains: search } },
                { shortName: { contains: search } },
                { taxNo: { contains: search } },
                { normalizedName: { contains: search } },
              ],
            },
          ]
        : undefined,
    };
    const data = await this.prisma.firm.findMany({
      where,
      include: { contacts: { where: { deletedAt: null } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: 500,
    });
    return response(data);
  }

  async getFirm(id: string) {
    const data = await this.prisma.firm.findUnique({ where: { id }, include: { contacts: true } });
    if (!data) throw new NotFoundException("Firma bulunamadı.");
    return response(data);
  }

  async createFirm(body: AnyBody = {}) {
    const slug = this.slug(body);
    await this.ensureMainCompany(slug);
    const name = text(body.name || body.firmaAdi);
    if (!name) throw new BadRequestException("Firma adı zorunludur.");
    const data = await this.prisma.firm.create({
      data: {
        mainCompanyId: slug,
        mainCompanySlug: slug,
        name,
        shortName: text(body.shortName || body.kisaAd) || null,
        normalizedName: normalizeName(name),
        taxNo: text(body.taxNo || body.taxNumber || body.vergiNo) || null,
        taxOffice: text(body.taxOffice || body.vergiDairesi) || null,
        firmType: firmType(body.firmType || body.firmaTipi) as any,
        workType: workType(body.workType || body.officialType || body.resmiGayri) as any,
        officialType: text(body.officialType || body.workType || body.resmiGayri || "OFFICIAL"),
        defaultVatRate: money(body.defaultVatRate ?? body.varsayilanKdv ?? 20),
        openingBalance: money(body.openingBalance ?? body.acilisBakiyesi),
        openingBalanceDate: body.openingBalanceDate ? date(body.openingBalanceDate) : null,
        openingBalanceDirection: text(body.openingBalanceDirection || body.borcAlacakYonu || "BORC"),
        openingVatAmount: money(body.openingVatAmount ?? body.devredenKdv),
        openingVatPeriod: text(body.openingVatPeriod || body.devredenKdvAyi) || null,
        dueDay: body.dueDay === "" || body.dueDay == null ? null : Number(body.dueDay),
        riskLimit: money(body.riskLimit ?? body.riskLimiti),
        address: text(body.address || body.adres) || null,
        phone: text(body.phone || body.telefon) || null,
        email: text(body.email) || null,
        note: text(body.note || body.not) || null,
        isActive: body.isActive ?? body.aktif ?? true,
      },
    });
    return response(data);
  }

  async updateFirm(id: string, body: AnyBody = {}) {
    await this.firmOrThrow(id);
    const name = body.name ?? body.firmaAdi;
    const data = await this.prisma.firm.update({
      where: { id },
      data: {
        name: name === undefined ? undefined : text(name),
        shortName: body.shortName ?? body.kisaAd,
        normalizedName: name === undefined ? undefined : normalizeName(name),
        taxNo: body.taxNo ?? body.taxNumber ?? body.vergiNo,
        taxOffice: body.taxOffice ?? body.vergiDairesi,
        firmType: body.firmType || body.firmaTipi ? (firmType(body.firmType || body.firmaTipi) as any) : undefined,
        workType: body.workType || body.officialType || body.resmiGayri ? (workType(body.workType || body.officialType || body.resmiGayri) as any) : undefined,
        officialType: body.officialType ?? body.workType ?? body.resmiGayri,
        defaultVatRate: body.defaultVatRate ?? body.varsayilanKdv === undefined ? undefined : money(body.defaultVatRate ?? body.varsayilanKdv),
        openingBalance: body.openingBalance ?? body.acilisBakiyesi === undefined ? undefined : money(body.openingBalance ?? body.acilisBakiyesi),
        openingBalanceDate: body.openingBalanceDate ? date(body.openingBalanceDate) : body.openingBalanceDate === null ? null : undefined,
        openingBalanceDirection: body.openingBalanceDirection ?? body.borcAlacakYonu,
        openingVatAmount: body.openingVatAmount ?? body.devredenKdv === undefined ? undefined : money(body.openingVatAmount ?? body.devredenKdv),
        openingVatPeriod: body.openingVatPeriod ?? body.devredenKdvAyi,
        dueDay: body.dueDay === "" ? null : body.dueDay === undefined ? undefined : Number(body.dueDay),
        riskLimit: body.riskLimit ?? body.riskLimiti === undefined ? undefined : money(body.riskLimit ?? body.riskLimiti),
        address: body.address ?? body.adres,
        phone: body.phone ?? body.telefon,
        email: body.email,
        note: body.note ?? body.not,
        isActive: body.isActive ?? body.aktif,
      },
    });
    return response(data);
  }

  async deleteFirm(id: string) {
    const data = await this.prisma.firm.update({
      where: { id },
      data: { isActive: false, status: "PASSIVE", deletedAt: new Date() },
    });
    return response(data);
  }

  async listContacts(firmId: string) {
    if (firmId === "_none") return response([]);
    const data = await this.prisma.firmContact.findMany({
      where: { firmId, deletedAt: null },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    });
    return response(data);
  }

  async createContact(firmId: string, body: AnyBody = {}) {
    const firm = await this.firmOrThrow(firmId);
    const fullName = text(body.fullName || body.adSoyad || body.name);
    if (!fullName) throw new BadRequestException("Kişi adı zorunludur.");
    const data = await this.prisma.firmContact.create({
      data: {
        mainCompanyId: firm.mainCompanyId,
        firmId,
        fullName,
        email: text(body.email) || null,
        phone: text(body.phone || body.telefon) || null,
        department: text(body.department || body.departman) || null,
        title: text(body.title || body.gorev || body.unvan) || null,
        isActive: body.isActive ?? body.aktif ?? true,
        canReceiveInvoice: Boolean(body.canReceiveInvoice ?? body.faturaYetkilisi),
        canReceiveDispatch: Boolean(body.canReceiveDispatch ?? body.irsaliyeYetkilisi),
        canReceiveStatement: Boolean(body.canReceiveStatement ?? body.ekstreYetkilisi),
        canReceivePaymentReminder: Boolean(body.canReceivePaymentReminder ?? body.odemeYetkilisi),
        canReceiveGeneralAccounting: Boolean(body.canReceiveGeneralAccounting ?? body.isGeneralAccountingCc ?? body.genelMuhasebeYetkilisi),
        canBeModelResponsible: Boolean(body.canBeModelResponsible ?? body.modelSorumlusuOlabilir),
        note: text(body.note || body.not) || null,
      },
    });
    return response(data);
  }

  async updateContact(contactId: string, body: AnyBody = {}) {
    const data = await this.prisma.firmContact.update({
      where: { id: contactId },
      data: {
        fullName: body.fullName ?? body.adSoyad,
        email: body.email,
        phone: body.phone ?? body.telefon,
        department: body.department ?? body.departman,
        title: body.title ?? body.gorev ?? body.unvan,
        isActive: body.isActive ?? body.aktif,
        canReceiveInvoice: body.canReceiveInvoice ?? body.faturaYetkilisi,
        canReceiveDispatch: body.canReceiveDispatch ?? body.irsaliyeYetkilisi,
        canReceiveStatement: body.canReceiveStatement ?? body.ekstreYetkilisi,
        canReceivePaymentReminder: body.canReceivePaymentReminder ?? body.odemeYetkilisi,
        canReceiveGeneralAccounting: body.canReceiveGeneralAccounting ?? body.isGeneralAccountingCc ?? body.genelMuhasebeYetkilisi,
        canBeModelResponsible: body.canBeModelResponsible ?? body.modelSorumlusuOlabilir,
        note: body.note ?? body.not,
      },
    });
    return response(data);
  }

  async deleteContact(contactId: string) {
    const data = await this.prisma.firmContact.update({
      where: { id: contactId },
      data: { isActive: false, status: "PASSIVE", deletedAt: new Date() },
    });
    return response(data);
  }

  async currentAccountFirms(query: AnyBody = {}) {
    const firms = (await this.listFirms({ ...query, active: query.active || "active" })).data as any[];
    const ids = firms.map((firm) => firm.id);
    const totals = ids.length
      ? await this.prisma.cariMovement.groupBy({
          by: ["firmId"],
          where: { firmId: { in: ids }, deletedAt: null },
          _sum: { debit: true, credit: true },
          _max: { date: true },
        })
      : [];
    const byFirm = new Map(totals.map((row) => [row.firmId, row]));
    return response(
      firms.map((firm) => {
        const total = byFirm.get(firm.id);
        const opening = number(firm.openingBalance) * (firm.openingBalanceDirection === "ALACAK" ? -1 : 1);
        const debit = number(total?._sum?.debit);
        const credit = number(total?._sum?.credit);
        return {
          id: firm.id,
          firmaId: firm.id,
          firmaAdi: firm.name,
          kisaAd: firm.shortName,
          vergiNo: firm.taxNo,
          telefon: firm.phone,
          firmaTipi: firm.firmType,
          resmiGayri: firm.officialType || firm.workType,
          acilisBakiyesi: number(firm.openingBalance),
          borc: debit,
          alacak: credit,
          bakiye: opening + debit - credit,
          sonHareketTarihi: iso(total?._max?.date || firm.updatedAt),
        };
      }),
    );
  }

  async paymentCenterFirms(query: AnyBody = {}) {
    const search = text(query.search || query.q).toLocaleLowerCase("tr-TR");
    const firmQuery = search ? { ...query, search: "", q: "" } : query;
    const base = (await this.currentAccountFirms(firmQuery)).data as any[];
    const firmIds = base.map((firm) => firm.id).filter(Boolean);
    const [payments, cardMovements] = firmIds.length
      ? await Promise.all([
          this.prisma.paymentRecord.findMany({
            where: { firmId: { in: firmIds }, deletedAt: null },
            select: { firmId: true, relatedDocumentId: true, paymentType: true, status: true, amount: true, checkNo: true },
          }),
          this.prisma.creditCardMovement.findMany({
            where: { companyId: { in: firmIds } },
            select: { companyId: true, amount: true },
          }),
        ])
      : [[], []];
    const checkCount = new Map<string, number>();
    const cardCount = new Map<string, number>();
    const cashCount = new Map<string, number>();
    for (const row of payments) {
      if (row.paymentType === "CHECK" && !row.relatedDocumentId && openPaymentStatus(row.status)) {
        checkCount.set(row.firmId, (checkCount.get(row.firmId) || 0) + 1);
      } else if (row.paymentType === "CARD" && !row.relatedDocumentId) {
        cardCount.set(row.firmId, (cardCount.get(row.firmId) || 0) + 1);
      } else if (row.paymentType === "CASH" || row.paymentType === "TRANSFER") {
        cashCount.set(row.firmId, (cashCount.get(row.firmId) || 0) + 1);
      }
    }
    for (const row of cardMovements) {
      if (row.companyId) cardCount.set(row.companyId, (cardCount.get(row.companyId) || 0) + 1);
    }
    const checkNosByFirm = new Map<string, string[]>();
    for (const row of payments) {
      if (row.checkNo) {
        const list = checkNosByFirm.get(row.firmId) || [];
        list.push(row.checkNo);
        checkNosByFirm.set(row.firmId, list);
      }
    }
    const enriched = base.map((firm) => ({
        ...firm,
        cariTipi: firm.firmaTipi,
        officialType: firm.resmiGayri,
        openCheckCount: checkCount.get(firm.id) || 0,
        creditCardMovementCount: cardCount.get(firm.id) || 0,
        cashTransferMovementCount: cashCount.get(firm.id) || 0,
        openDebtCount: number(firm.bakiye) > 0 ? 1 : 0,
        openDebtTotal: Math.max(0, number(firm.bakiye)),
        cekNolari: checkNosByFirm.get(firm.id) || [],
      }));
    const unique = new Map<string, any>();
    for (const firm of enriched) {
      const key = text(firm.id || firm.firmaId || firm.vergiNo || firm.taxNo || normalizeName(firm.firmaAdi || firm.name));
      const existing = unique.get(key);
      if (!existing) {
        unique.set(key, { ...firm, duplicateCount: 1 });
        continue;
      }
      unique.set(key, {
        ...existing,
        duplicateCount: number(existing.duplicateCount || 1) + 1,
        bakiye: number(existing.bakiye) + number(firm.bakiye),
        currentBalance: number(existing.currentBalance) + number(firm.currentBalance || firm.bakiye),
        openCheckCount: number(existing.openCheckCount) + number(firm.openCheckCount),
        creditCardMovementCount: number(existing.creditCardMovementCount) + number(firm.creditCardMovementCount),
        cashTransferMovementCount: number(existing.cashTransferMovementCount) + number(firm.cashTransferMovementCount),
        openDebtCount: number(existing.openDebtCount) + number(firm.openDebtCount),
        openDebtTotal: number(existing.openDebtTotal) + number(firm.openDebtTotal),
        cekNolari: [...(existing.cekNolari || []), ...(firm.cekNolari || [])],
        sonHareketTarihi:
          String(firm.sonHareketTarihi || "") > String(existing.sonHareketTarihi || "")
            ? firm.sonHareketTarihi
            : existing.sonHareketTarihi,
      });
    }
    const sorted = [...unique.values()].sort((a, b) => {
      const score = (firm: any) => {
        const balance = Math.abs(number(firm.bakiye || firm.currentBalance));
        const assets = number(firm.openCheckCount) + number(firm.creditCardMovementCount) + number(firm.openDebtCount);
        const recent = firm.sonHareketTarihi ? 1 : 0;
        return (balance > 0 ? 1000 : 0) + (assets > 0 ? 500 : 0) + recent * 100;
      };
      return score(b) - score(a) || String(a.firmaAdi || "").localeCompare(String(b.firmaAdi || ""), "tr");
    });
    return response(
      search
        ? sorted.filter((firm) =>
            [
              firm.firmaAdi,
              firm.kisaAd,
              firm.firmaKodu,
              firm.cariKodu,
              firm.vergiNo,
              firm.telefon,
              ...(firm.cekNolari || []),
            ]
              .join(" ")
              .toLocaleLowerCase("tr-TR")
              .includes(search),
          )
        : sorted,
    );
  }

  async paymentCenterFirmSummary(firmId: string) {
    const summary = (await this.currentAccountSummary(firmId)).data as any;
    const checks = (await this.paymentCenterFirmChecks(firmId)).data as any[];
    const cards = (await this.paymentCenterFirmCards(firmId)).data as any[];
    const movements = (await this.firmMovements(firmId)).data as any[];
    const openDebtTotal = Math.max(0, number(summary.guncelBakiye));
    return response({
      ...summary,
      bakiye: number(summary.guncelBakiye),
      currentBalance: number(summary.guncelBakiye),
      openDebtCount: openDebtTotal > 0 ? 1 : 0,
      openDebtTotal,
      acikBorcToplami: openDebtTotal,
      openCheckCount: checks.filter((row) => row.open).length,
      openCheckTotal: checks.filter((row) => row.open).reduce((sum, row) => sum + number(row.kalanTutar ?? row.tutar), 0),
      openCardCount: cards.filter((row) => number(row.acikTutar) > 0).length,
      lastMovementDate: movements.at(-1)?.tarih || summary.sonIslemTarihi || "",
    });
  }

  async paymentCenterFirmChecks(firmId: string) {
    const rows = await this.prisma.paymentRecord.findMany({
      where: { firmId, deletedAt: null, paymentType: "CHECK", relatedDocumentId: null },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    const payments = await this.prisma.paymentRecord.findMany({
      where: { firmId, deletedAt: null, relatedDocumentId: { in: rows.map((row) => row.id) } },
      select: { relatedDocumentId: true, amount: true },
    });
    const paidBySource = new Map<string, number>();
    for (const row of payments) {
      if (!row.relatedDocumentId) continue;
      paidBySource.set(row.relatedDocumentId, (paidBySource.get(row.relatedDocumentId) || 0) + number(row.amount));
    }
    return response(
      rows.map((row) => {
        const total = number(row.amount);
        const paid = row.status === "PAID" ? total : paidBySource.get(row.id) || 0;
        const remaining = Math.max(0, total - paid);
        return {
          id: row.id,
          firmId: row.firmId,
          cekNo: row.checkNo || "",
          banka: row.bankName || "",
          sube: "",
          vade: iso(row.dueDate),
          tutar: total,
          odenen: paid,
          kalanTutar: remaining,
          cekTuru: "Tedarikçiye Verilen",
          durum: remaining <= 0 ? "PAID" : row.status,
          aciklama: row.note || "",
          open: remaining > 0 && openPaymentStatus(row.status),
        };
      })
    );
  }

  async paymentCenterFirmCards(firmId: string) {
    const movements = await this.prisma.creditCardMovement.findMany({
      where: { companyId: firmId },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    const cardIds = [...new Set(movements.map((row) => row.creditCardId).filter(Boolean))];
    const cards = cardIds.length
      ? await this.prisma.creditCard.findMany({ where: { id: { in: cardIds } } })
      : await this.prisma.creditCard.findMany({
          where: {
            isActive: true,
            OR: [
              { raw: { path: "$.firmId", equals: firmId } as any },
              { raw: { path: "$.companyId", equals: firmId } as any },
            ],
          },
          take: 100,
        });
    const movementByCard = new Map<string, any[]>();
    for (const row of movements) {
      const list = movementByCard.get(row.creditCardId) || [];
      list.push(row);
      movementByCard.set(row.creditCardId, list);
    }
    return response(
      cards.map((card) => {
        const list = movementByCard.get(card.id) || [];
        const movementTotal = list.reduce((sum, row) => sum + number(row.amount), 0);
        return {
          id: card.id,
          kartAdi: card.cardName,
          banka: card.bankName || "",
          son4Hane: card.lastFourDigits || "",
          limit: number((card.raw as any)?.limit || 0),
          kullanilabilir: number((card.raw as any)?.availableLimit || 0),
          sonIslem: iso(list[0]?.movementDate || card.updatedAt),
          acikTutar: movementTotal || number(card.totalDebt),
          durum: card.isActive ? "AKTIF" : "PASIF",
        };
      }),
    );
  }

  async paymentCenterFirmCashTransfers(firmId: string) {
    const rows = await this.prisma.paymentRecord.findMany({
      where: { firmId, deletedAt: null, paymentType: { in: ["CASH", "TRANSFER"] } },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    return response(
      rows.map((row) => ({
        id: row.id,
        tarih: iso(row.dueDate || row.createdAt),
        islemTuru: row.paymentType === "CASH" ? "Nakit Ödeme" : "Havale / EFT Ödeme",
        kasaBanka: row.bankName || "",
        aciklama: row.note || "",
        tutar: number(row.amount),
        borcAlacak: "Alacak",
        durum: row.status,
      })),
    );
  }

  async paymentCenterOpenDebts(firmId: string) {
    const movements = (await this.firmMovements(firmId)).data as any[];
    const checks = (await this.paymentCenterFirmChecks(firmId)).data as any[];
    const movementIds = movements.map((row) => row.id).filter(Boolean);
    const linkedPayments = movementIds.length
      ? await this.prisma.paymentRecord.findMany({
          where: { firmId, deletedAt: null, relatedDocumentId: { in: movementIds } },
          select: { relatedDocumentId: true, amount: true },
        })
      : [];
    const paidByMovement = new Map<string, number>();
    for (const row of linkedPayments) {
      if (!row.relatedDocumentId) continue;
      paidByMovement.set(row.relatedDocumentId, (paidByMovement.get(row.relatedDocumentId) || 0) + number(row.amount));
    }
    const openMovements = movements
      .filter((row) => number(row.borc) > number(row.alacak))
      .map((row) => {
        const paid = number(row.alacak) + (paidByMovement.get(row.id) || 0);
        return {
          id: `movement-${row.id}`,
          sourceId: row.id,
          kaynak: row.kaynak || "Cari",
          tarih: row.tarih,
          belgeNo: row.belgeNo,
          aciklama: row.aciklama,
          ilkTutar: number(row.borc),
          odenen: paid,
          kalan: Math.max(0, number(row.borc) - paid),
          vade: row.vade,
          type: "CARI",
        };
      });
    const openChecks = checks
      .filter((row) => row.open)
      .map((row) => ({
        id: `check-${row.id}`,
        sourceId: row.id,
        kaynak: "Çek",
        tarih: row.vade,
        belgeNo: row.cekNo,
        aciklama: row.aciklama || row.banka,
        ilkTutar: number(row.tutar),
        odenen: number(row.odenen),
        kalan: number(row.kalanTutar),
        vade: row.vade,
        type: "CHECK",
      }));
    return response([...openMovements, ...openChecks].filter((row) => row.kalan > 0));
  }

  async createPaymentCenterFirm(body: AnyBody = {}) {
    const slug = this.slug(body);
    const name = text(body.name || body.firmaAdi);
    const type = firmType(body.firmType || body.firmaTipi || body.cariTipi);
    const existing = await this.prisma.firm.findFirst({
      where: {
        OR: [{ mainCompanySlug: slug }, { mainCompanyId: slug }],
        deletedAt: null,
        normalizedName: normalizeName(name),
        firmType: type as any,
      },
    });
    if (existing) throw new BadRequestException("Aynı firma adı ve cari tipiyle kayıt zaten var.");
    return this.createFirm({
      ...body,
      firmType: type,
      workType: body.workType || body.officialType || body.resmiyet || body.resmiGayri,
    });
  }

  async createPaymentCenterCheck(body: AnyBody = {}) {
    const slug = this.slug(body);
    const firmId = text(body.firmId || body.firmaId || body.companyId);
    const checkNo = text(body.checkNo || body.cekNo);
    const bankName = text(body.bankName || body.banka);
    if (!firmId) throw new BadRequestException("Çek için firma seçimi zorunludur.");
    if (!checkNo) throw new BadRequestException("Çek no zorunludur.");
    const existing = await this.prisma.paymentRecord.findFirst({
      where: { mainCompanyId: slug, firmId, paymentType: "CHECK", checkNo, bankName, deletedAt: null },
    });
    if (existing) throw new BadRequestException("Aynı firma, banka ve çek no ile kayıt zaten var.");
    return this.createPayment({ ...body, firmId, paymentType: "CHECK", status: body.status || "PLANNED" });
  }

  updatePaymentCenterCheck(id: string, body: AnyBody = {}) {
    return this.updatePayment(id, { ...body, paymentType: "CHECK" });
  }

  async createPaymentCenterCard(body: AnyBody = {}) {
    const slug = this.slug(body);
    const firmId = text(body.firmId || body.firmaId || body.companyId);
    const cardName = text(body.cardName || body.kartAdi);
    const lastFourDigits = text(body.lastFourDigits || body.son4Hane).slice(-4);
    if (!firmId) throw new BadRequestException("Kart için firma seçimi zorunludur.");
    if (!cardName || !lastFourDigits) throw new BadRequestException("Kart adı ve son 4 hane zorunludur.");
    const existing = await this.prisma.creditCard.findFirst({
      where: {
        mainCompanySlug: slug,
        cardName,
        lastFourDigits,
        isActive: true,
        raw: { path: ["firmId"], equals: firmId } as any,
      },
    });
    if (existing) throw new BadRequestException("Aynı firma için bu kredi kartı zaten kayıtlı.");
    const data = await this.prisma.creditCard.create({
      data: {
        mainCompanySlug: slug,
        cardName,
        bankName: text(body.bankName || body.banka) || null,
        lastFourDigits,
        totalDebt: money(body.totalDebt || body.acikTutar || 0),
        minimumPayment: money(body.minimumPayment || 0),
        dueDate: body.dueDate || body.sonOdemeTarihi ? date(body.dueDate || body.sonOdemeTarihi) : null,
        note: text(body.note || body.aciklama) || null,
        raw: { firmId, companyId: firmId, limit: number(body.limit), availableLimit: number(body.availableLimit) },
      },
    });
    return response(data);
  }

  async updatePaymentCenterCard(id: string, body: AnyBody = {}) {
    const data = await this.prisma.creditCard.update({
      where: { id },
      data: {
        cardName: body.cardName ?? body.kartAdi,
        bankName: body.bankName ?? body.banka,
        lastFourDigits: body.lastFourDigits ?? body.son4Hane,
        totalDebt: body.totalDebt ?? body.acikTutar === undefined ? undefined : money(body.totalDebt ?? body.acikTutar),
        minimumPayment: body.minimumPayment === undefined ? undefined : money(body.minimumPayment),
        dueDate: body.dueDate || body.sonOdemeTarihi ? date(body.dueDate || body.sonOdemeTarihi) : undefined,
        note: body.note ?? body.aciklama,
      },
    });
    return response(data);
  }

  async savePaymentCenterTransaction(body: AnyBody = {}) {
    const slug = this.slug(body);
    const firmId = text(body.firmId || body.firmaId || body.companyId);
    const paymentMethod = paymentType(body.paymentMethod || body.odemeSekli || body.paymentType);
    const amount = number(body.amount || body.tutar);
    const openAmount = number(body.openAmount || body.acikTutar || amount);
    const sourceType = text(body.sourceType || body.kaynakTipi || "CARI").toUpperCase();
    const sourceId = text(body.sourceId || body.paymentRecordId || body.kalemId);
    const direction = text(body.transactionDirection || body.islemYonu || body.direction || "PAYMENT_OUT").toUpperCase();
    const movementKind = direction === "ADD_DEBT" || direction === "BORC_EKLE" ? "DEBIT" : "CREDIT";
    if (!firmId) throw new BadRequestException("Firma seçimi zorunludur.");
    if (amount <= 0) throw new BadRequestException("Ödeme tutarı 0'dan büyük olmalıdır.");
    if (sourceId && amount > openAmount && !body.allowOverpay) {
      throw new BadRequestException("Ödeme tutarı açık bakiyeden büyük. Fazla ödeme/avans için onay gereklidir.");
    }
    return (this.prisma as any).$transaction(async (tx: any) => {
      const firm = await tx.firm.findUnique({ where: { id: firmId } });
      if (!firm) throw new NotFoundException("Firma bulunamadı.");
      const status = sourceId ? paymentStatusForAmount(amount, openAmount) : "PAID";
      const existingTotals = await tx.cariMovement.aggregate({
        where: { firmId, deletedAt: null },
        _sum: { debit: true, credit: true },
      });
      const opening = number(firm.openingBalance) * (firm.openingBalanceDirection === "ALACAK" ? -1 : 1);
      const currentBalance = opening + number(existingTotals?._sum?.debit) - number(existingTotals?._sum?.credit);
      const balanceEffect = movementKind === "DEBIT" ? amount : -amount;
      const balanceAfter = currentBalance + balanceEffect;
      const payment = await tx.paymentRecord.create({
        data: {
          mainCompanyId: slug,
          firmId,
          relatedDocumentId: sourceId || null,
          paymentType: paymentMethod as any,
          workType: firm.workType,
          checkNo: text(body.checkNo || body.cekNo) || null,
          bankName: text(body.bankName || body.banka || body.kasaBanka) || null,
          dueDate: date(body.paymentDate || body.tarih || new Date()),
          amount: money(amount),
          status: status as any,
          note: text(body.description || body.aciklama || (status === "WAITING" ? "Kısmi ödeme" : "Tam ödeme")) || null,
        },
      });
      const movement = await tx.cariMovement.create({
        data: {
          mainCompanyId: slug,
          firmId,
          documentId: payment.id,
          movementType: movementKind,
          workType: firm.workType,
          date: date(body.paymentDate || body.tarih || new Date()),
          description: text(body.description || body.aciklama || `Ödeme / ${paymentMethod}`) || null,
          debit: money(movementKind === "DEBIT" ? amount : 0),
          credit: money(movementKind === "CREDIT" ? amount : 0),
          balanceAfter: money(balanceAfter),
          status: "ACTIVE",
        },
      });
      if (sourceType === "CHECK") {
        const sourceCheck = await tx.paymentRecord.findUnique({ where: { id: sourceId } });
        const paidTotal = await tx.paymentRecord.aggregate({
          where: { firmId, deletedAt: null, relatedDocumentId: sourceId },
          _sum: { amount: true },
        });
        const sourceAmount = number(sourceCheck?.amount || openAmount);
        const nextStatus = number(paidTotal?._sum?.amount) >= sourceAmount ? "PAID" : "WAITING";
        await tx.paymentRecord.update({
          where: { id: sourceId },
          data: { status: nextStatus as any },
        });
      }
      if (sourceType === "CARI" && sourceId) {
        await tx.cariMovement.update({
          where: { id: sourceId },
          data: { status: status as any },
        }).catch(() => null);
      }
      await tx.company.update({
        where: { id: firmId },
        data: { currentBalance: money(balanceAfter) },
      }).catch(() => null);
      if (paymentMethod === "CARD" && text(body.creditCardId || body.cardId)) {
        await tx.creditCardMovement.create({
          data: {
            mainCompanySlug: slug,
            creditCardId: text(body.creditCardId || body.cardId),
            movementDate: date(body.paymentDate || body.tarih || new Date()),
            amount: money(amount),
            description: text(body.description || body.aciklama || "Kartla ödeme") || null,
            companyId: firmId,
            documentId: sourceId,
            currentAccountMovementId: movement.id,
            raw: { paymentRecordId: payment.id, paymentMethod },
          },
        });
      }
      return response({
        payment,
        cariMovement: movement,
        status,
        partial: status === "WAITING",
        remainingAmount: Math.max(0, openAmount - amount),
      });
    });
  }

  listCari(query: AnyBody = {}) {
    return this.currentAccountFirms(query);
  }

  async currentAccountSummary(firmId: string) {
    const firm = await this.firmOrThrow(firmId);
    const movements = await this.prisma.cariMovement.findMany({ where: { firmId, deletedAt: null }, orderBy: { date: "asc" } });
    const borc = movements.reduce((sum, row) => sum + number(row.debit), 0);
    const alacak = movements.reduce((sum, row) => sum + number(row.credit), 0);
    const opening = number(firm.openingBalance) * (firm.openingBalanceDirection === "ALACAK" ? -1 : 1);
    return response({
      firmaId: firm.id,
      firmaAdi: firm.name,
      acilisBakiyesi: number(firm.openingBalance),
      toplamBorc: borc,
      toplamAlacak: alacak,
      guncelBakiye: opening + borc - alacak,
      vadesiGecen: movements.filter((row) => row.dueDate && row.dueDate < new Date()).reduce((sum, row) => sum + number(row.debit) - number(row.credit), 0),
      sonIslemTarihi: iso(movements.at(-1)?.date),
    });
  }

  async firmMovements(firmId: string) {
    if (firmId === "_none") return response([]);
    const rows = await this.prisma.cariMovement.findMany({
      where: { firmId, deletedAt: null },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
    let balance = 0;
    return response(
      rows.map((row) => {
        balance += number(row.debit) - number(row.credit);
        return {
          id: row.id,
          tarih: iso(row.date),
          belgeNo: row.documentId || "",
          kaynak: row.documentId ? "BELGE" : "MANUEL",
          resmiGayri: row.workType,
          aciklama: row.description || "",
          borc: number(row.debit),
          alacak: number(row.credit),
          bakiye: number(row.balanceAfter ?? balance),
          vade: iso(row.dueDate),
          durum: row.status,
          manual: !row.documentId,
        };
      }),
    );
  }

  async createManualCari(firmIdOrBody: string | AnyBody, body: AnyBody = {}) {
    const payload = typeof firmIdOrBody === "object" ? firmIdOrBody : body;
    const firmId = typeof firmIdOrBody === "object" ? text(firmIdOrBody.firmId || firmIdOrBody.firmaId) : firmIdOrBody;
    const slug = this.slug(body);
    const firm = await this.firmOrThrow(firmId);
    const amount = number(payload.amount || payload.tutar);
    if (amount <= 0) throw new BadRequestException("Tutar zorunludur.");
    const type = movementType(payload.movementType || payload.islemTipi);
    const data = await this.prisma.cariMovement.create({
      data: {
        mainCompanyId: firm.mainCompanyId || slug,
        firmId,
        documentId: text(payload.documentId) || null,
        movementType: type as any,
        workType: workType(payload.workType || payload.resmiGayri || firm.workType) as any,
        date: date(payload.date || payload.tarih),
        dueDate: payload.dueDate || payload.vade ? date(payload.dueDate || payload.vade) : null,
        description: text(payload.description || payload.aciklama) || null,
        debit: money(type === "DEBIT" ? amount : 0),
        credit: money(type === "CREDIT" ? amount : 0),
        status: "ACTIVE",
      },
    });
    return response(data);
  }

  createManualCariLegacy(body: AnyBody = {}) {
    return this.createManualCari(text(body.firmId || body.firmaId), body);
  }

  async updateCariMovement(id: string, body: AnyBody = {}) {
    const existing = await this.prisma.cariMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Cari hareket bulunamadı.");
    if (existing.documentId) throw new BadRequestException("Belgeden gelen cari hareket düzenlenemez.");
    const amount = number(body.amount || body.tutar || body.debit || body.credit);
    const type = body.movementType || body.islemTipi ? movementType(body.movementType || body.islemTipi) : null;
    const data = await this.prisma.cariMovement.update({
      where: { id },
      data: {
        date: body.date || body.tarih ? date(body.date || body.tarih) : undefined,
        dueDate: body.dueDate || body.vade ? date(body.dueDate || body.vade) : undefined,
        description: body.description ?? body.aciklama,
        movementType: type as any,
        debit: type ? money(type === "DEBIT" ? amount : 0) : body.debit === undefined ? undefined : money(body.debit),
        credit: type ? money(type === "CREDIT" ? amount : 0) : body.credit === undefined ? undefined : money(body.credit),
        workType: body.workType || body.resmiGayri ? (workType(body.workType || body.resmiGayri) as any) : undefined,
        status: body.status,
      },
    });
    return response(data);
  }

  async deleteCariMovement(id: string) {
    const existing = await this.prisma.cariMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Cari hareket bulunamadı.");
    if (existing.documentId) throw new BadRequestException("Belgeden gelen cari hareket pasife alınamaz.");
    const data = await this.prisma.cariMovement.update({ where: { id }, data: { status: "PASSIVE", deletedAt: new Date() } });
    return response(data);
  }

  async vatSummary(query: AnyBody = {}) {
    const firms = (await this.vatFirms(query)).data as any[];
    const indirilecekKdv = firms.reduce((sum, row) => sum + row.gelenKdv, 0);
    const hesaplananKdv = firms.reduce((sum, row) => sum + row.gidenKdv, 0);
    const devredenKdv = firms.reduce((sum, row) => sum + row.devredenKdv, 0);
    const duzeltmeKdv = firms.reduce((sum, row) => sum + row.duzeltmeKdv, 0);
    const netKdv = hesaplananKdv - indirilecekKdv - devredenKdv + duzeltmeKdv;
    return response({
      gelenKdv: indirilecekKdv,
      gidenKdv: hesaplananKdv,
      indirilecekKdv,
      hesaplananKdv,
      devredenKdv,
      duzeltmeKdv,
      netKdv,
      odenecekKdv: netKdv > 0 ? netKdv : 0,
      devredecekKdv: netKdv < 0 ? Math.abs(netKdv) : 0,
      belgeSayisi: firms.reduce((sum, row) => sum + row.belgeSayisi, 0),
      liste: firms,
    });
  }

  kdvSummary(query: AnyBody = {}) {
    return this.vatSummary(query);
  }

  kdvRecords(query: AnyBody = {}) {
    return this.vatSummary(query);
  }

  async vatFirms(query: AnyBody = {}) {
    const slug = this.slug(query);
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    await this.syncVatRecordsFromDocuments(slug, year, month);
    const rows = await this.prisma.vatRecord.findMany({
      where: { mainCompanySlug: slug, periodYear: year, periodMonth: month },
      include: { company: true },
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
      take: 1000,
    });
    const firms = await this.prisma.firm.findMany({ where: { OR: [{ mainCompanySlug: slug }, { mainCompanyId: slug }], deletedAt: null } });
    const byFirm = new Map<string, any>();
    for (const row of rows) {
      const key = text(row.firmId || row.companyId || row.company?.name || "unknown");
      const current = byFirm.get(key) || { firmId: row.firmId || row.companyId || "", firma: row.company?.name || "Firma eşleşmemiş", gelenMatrah: 0, gelenKdv: 0, gidenMatrah: 0, gidenKdv: 0, devredenKdv: 0, duzeltmeKdv: 0, belgeSayisi: 0, sonBelgeTarihi: "" };
      const incoming = number(row.incomingVat || (row.vatDirection === "IN" ? row.vatAmount : 0));
      const outgoing = number(row.outgoingVat || (row.vatDirection === "OUT" ? row.vatAmount : 0));
      const isAdjustment = ["ADJUSTMENT", "DUZELTME"].includes(
        text(row.vatDirection || row.direction).toUpperCase(),
      );
      if (incoming) {
        current.gelenMatrah += number(row.baseAmount || row.subtotal);
        current.gelenKdv += incoming;
      }
      if (outgoing) {
        current.gidenMatrah += number(row.baseAmount || row.subtotal);
        current.gidenKdv += outgoing;
      }
      if (isAdjustment) current.duzeltmeKdv += number(row.vatAmount);
      current.devredenKdv += number(row.carryVat);
      current.belgeSayisi += row.documentId ? 1 : 0;
      current.sonBelgeTarihi ||= iso(row.documentDate || row.date);
      byFirm.set(key, current);
    }
    for (const firm of firms) {
      if (!byFirm.has(firm.id) && number(firm.openingVatAmount)) {
        byFirm.set(firm.id, { firmId: firm.id, firma: firm.name, gelenMatrah: 0, gelenKdv: 0, gidenMatrah: 0, gidenKdv: 0, devredenKdv: number(firm.openingVatAmount), duzeltmeKdv: 0, belgeSayisi: 0, sonBelgeTarihi: "" });
      }
    }
    return response(
      Array.from(byFirm.values()).map((row) => ({
        ...row,
        netKdv: row.gidenKdv - row.gelenKdv - row.devredenKdv + row.duzeltmeKdv,
        durum: "Kontrol edildi",
      })),
    );
  }

  async vatFirmDetail(firmId: string, query: AnyBody = {}) {
    const slug = this.slug(query);
    const year = Number(query.year || new Date().getFullYear());
    const month = Number(query.month || new Date().getMonth() + 1);
    await this.syncVatRecordsFromDocuments(slug, year, month);
    const records = await this.prisma.vatRecord.findMany({
      where: { mainCompanySlug: slug, periodYear: year, periodMonth: month, OR: [{ firmId }, { companyId: firmId }] },
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
    });
    return response({
      firmId,
      year,
      month,
      gelenBelgeler: records.filter((row) => number(row.incomingVat) > 0),
      gidenBelgeler: records.filter((row) => number(row.outgoingVat) > 0),
      matrahToplami: records.reduce((sum, row) => sum + number(row.baseAmount || row.subtotal), 0),
      kdvToplami: records.reduce((sum, row) => sum + number(row.vatAmount || row.incomingVat || row.outgoingVat), 0),
      indirilecekKdv: records.reduce((sum, row) => sum + number(row.incomingVat || (row.vatDirection === "IN" ? row.vatAmount : 0)), 0),
      hesaplananKdv: records.reduce((sum, row) => sum + number(row.outgoingVat || (row.vatDirection === "OUT" ? row.vatAmount : 0)), 0),
      devredenKdv: records.reduce((sum, row) => sum + number(row.carryVat), 0),
      duzeltmeKdv: records
        .filter((row) => ["ADJUSTMENT", "DUZELTME"].includes(text(row.vatDirection || row.direction).toUpperCase()))
        .reduce((sum, row) => sum + number(row.vatAmount), 0),
    });
  }

  async vatOpening(body: AnyBody = {}) {
    const data = await this.prisma.vatRecord.create({
      data: {
        mainCompanySlug: this.slug(body),
        firmId: text(body.firmId) || null,
        periodYear: Number(body.year || new Date().getFullYear()),
        periodMonth: Number(body.month || new Date().getMonth() + 1),
        direction: "CARRY",
        vatDirection: "CARRY",
        workType: text(body.officialType || body.workType || "OFFICIAL"),
        date: new Date(),
        carryVat: money(body.openingVat || body.amount || body.carryVat),
        raw: { source: "vat-period-opening", note: text(body.note) },
      },
    });
    return response(data);
  }

  async vatAdjustment(firmId: string, body: AnyBody = {}) {
    const sign = /eksi|minus|azalt/i.test(text(body.adjustmentType || body.type)) ? -1 : 1;
    const data = await this.prisma.vatRecord.create({
      data: {
        mainCompanySlug: this.slug(body),
        firmId,
        periodYear: Number(body.year || new Date().getFullYear()),
        periodMonth: Number(body.month || new Date().getMonth() + 1),
        direction: "ADJUSTMENT",
        vatDirection: "ADJUSTMENT",
        workType: text(body.officialType || "OFFICIAL"),
        date: new Date(),
        vatAmount: money(sign * number(body.amount)),
        raw: { source: "vat-firm-adjustment", adjustmentType: text(body.adjustmentType), note: text(body.note) },
      },
    });
    return response(data);
  }

  async listPayments(query: AnyBody = {}) {
    const slug = this.slug(query);
    const rows = await this.prisma.paymentRecord.findMany({ where: { mainCompanyId: slug, deletedAt: null, status: query.status as any }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 500 });
    const firmIds = [...new Set(rows.map((row) => row.firmId).filter(Boolean))];
    const firms = firmIds.length ? await this.prisma.firm.findMany({ where: { id: { in: firmIds } } }) : [];
    const firmById = new Map(firms.map((firm) => [firm.id, firm]));
    const data = rows.map((row) => ({
      id: row.id,
      firmId: row.firmId,
      firma: firmById.get(row.firmId)?.name || "",
      bagliBelge: row.relatedDocumentId || "",
      cekNo: row.checkNo || "",
      banka: row.bankName || "",
      odemeTipi: row.paymentType,
      vadeTarihi: iso(row.dueDate),
      tutar: number(row.amount),
      resmiGayri: row.workType,
      durum: row.status,
      onGorsel: row.frontImagePath || "",
      arkaGorsel: row.backImagePath || "",
    }));
    return response({ liste: data, yaklasan: data, bugun: data.filter((row) => row.vadeTarihi === iso(new Date())), vadesiGecmis: data.filter((row) => row.vadeTarihi && row.vadeTarihi < iso(new Date())) });
  }

  listModelMailAssignments(query: AnyBody = {}) {
    return response([]);
  }

  createModelMailAssignment(body: AnyBody = {}) {
    void body;
    return response(null);
  }

  updateModelMailAssignment(id: string, body: AnyBody = {}) {
    void id;
    void body;
    return response(null);
  }

  deleteModelMailAssignment(id: string) {
    void id;
    return response(null);
  }

  resolveRecipients(body: AnyBody = {}) {
    return this.mailTrackingDetail(text(body.firmId), body).catch(() => response({ status: "MISSING_RECIPIENT", to: [], cc: [] }));
  }

  listMailTasks(query: AnyBody = {}) {
    return this.mailTracking(query);
  }

  createMailTask(body: AnyBody = {}) {
    return this.createMailDraft(body);
  }

  updateMailTask(id: string, body: AnyBody = {}) {
    void body;
    return this.mailTrackingDetail(id, body);
  }

  markMailSent(id: string) {
    void id;
    return response({ status: "SENT" });
  }

  sendMailTask(id: string) {
    return this.markMailSent(id);
  }

  compareStatement(body: AnyBody = {}) {
    return response({ uploadedFile: text(body.fileName || body.filePath), result: [] });
  }

  missingInvoices(firmId: string) {
    void firmId;
    return response([]);
  }

  async getPayment(id: string) {
    const data = await this.prisma.paymentRecord.findUnique({ where: { id } });
    if (!data) throw new NotFoundException("Çek/ödeme kaydı bulunamadı.");
    return response(data);
  }

  async createPayment(body: AnyBody = {}) {
    const data = await this.prisma.paymentRecord.create({
      data: {
        mainCompanyId: this.slug(body),
        firmId: text(body.firmId || body.firmaId),
        relatedDocumentId: text(body.documentId || body.bagliBelge) || null,
        paymentType: paymentType(body.paymentType || body.odemeTipi) as any,
        workType: workType(body.workType || body.resmiGayri) as any,
        checkNo: text(body.checkNo || body.cekNo) || null,
        bankName: text(body.bankName || body.banka) || null,
        dueDate: body.dueDate || body.vadeTarihi ? date(body.dueDate || body.vadeTarihi) : null,
        amount: money(body.amount || body.tutar),
        status: text(body.status || body.durum || "PLANNED").toUpperCase() as any,
        note: text(body.description || body.aciklama || body.note) || null,
        frontImagePath: text(body.frontImagePath || body.onGorsel) || null,
        backImagePath: text(body.backImagePath || body.arkaGorsel) || null,
      },
    });
    return response(data);
  }

  async updatePayment(id: string, body: AnyBody = {}) {
    const data = await this.prisma.paymentRecord.update({
      where: { id },
      data: {
        firmId: body.firmId ?? body.firmaId,
        relatedDocumentId: body.documentId ?? body.bagliBelge,
        paymentType: body.paymentType || body.odemeTipi ? (paymentType(body.paymentType || body.odemeTipi) as any) : undefined,
        workType: body.workType || body.resmiGayri ? (workType(body.workType || body.resmiGayri) as any) : undefined,
        checkNo: body.checkNo ?? body.cekNo,
        bankName: body.bankName ?? body.banka,
        dueDate: body.dueDate || body.vadeTarihi ? date(body.dueDate || body.vadeTarihi) : undefined,
        amount: body.amount || body.tutar ? money(body.amount || body.tutar) : undefined,
        status: body.status || body.durum ? text(body.status || body.durum).toUpperCase() as any : undefined,
        note: body.description ?? body.aciklama ?? body.note,
      },
    });
    return response(data);
  }

  async deletePayment(id: string) {
    const data = await this.prisma.paymentRecord.update({ where: { id }, data: { status: "CANCELLED", deletedAt: new Date() } });
    return response(data);
  }

  async uploadPaymentImage(id: string, side: "front" | "back", body: AnyBody = {}) {
    const path = text(body.filePath || body.path || body.url);
    if (!path) throw new BadRequestException("Dosya yolu zorunludur.");
    const data = await this.prisma.paymentRecord.update({
      where: { id },
      data: side === "front" ? { frontImagePath: path } : { backImagePath: path },
    });
    return response(data);
  }

  async paymentStatus(id: string, body: AnyBody = {}) {
    const status = text(body.status || body.durum || "PAID").toUpperCase();
    const data = await this.prisma.paymentRecord.update({ where: { id }, data: { status: status as any } });
    return response(data);
  }

  async mailTracking(query: AnyBody = {}) {
    const slug = this.slug(query);
    const firms = await this.prisma.firm.findMany({
      where: { OR: [{ mainCompanyId: slug }, { mainCompanySlug: slug }], deletedAt: null },
      include: { contacts: { where: { deletedAt: null, isActive: true } } },
      orderBy: { name: "asc" },
      take: 500,
    });
    const liste = firms.map((firm) => {
      const to = firm.contacts.filter((contact) => contact.canReceiveInvoice || contact.canReceiveDispatch || contact.canReceiveStatement).map((contact) => contact.email).filter(Boolean);
      const cc = firm.contacts.filter((contact) => contact.canReceiveGeneralAccounting).map((contact) => contact.email).filter(Boolean);
      return {
        id: firm.id,
        firmId: firm.id,
        firma: firm.name,
        model: "",
        faturaNo: "",
        irsaliyeNo: "",
        tutar: 0,
        mailAliciKarari: to.length ? "Firma yetkilileri kullanıldı" : "Alıcı eksik",
        to,
        cc,
        genelMuhasebeCc: cc,
        eksikKontrol: to.length ? "Eksik yok" : "Alıcı eksik",
        ekstreKarsilastirma: "Kontrol edilmedi",
        ekler: [],
        status: to.length ? "gonderilecek" : "alici_eksik",
      };
    });
    return response({
      gonderilecek: liste.filter((row) => row.status === "gonderilecek").length,
      gonderildi: 0,
      aliciEksik: liste.filter((row) => row.status === "alici_eksik").length,
      ekstedeVar: 0,
      ekstreFarki: 0,
      liste,
      seciliKayitDetay: liste[0] || null,
      mailOnizleme: this.mailPreview(liste[0]),
    });
  }

  async mailTrackingDetail(id: string, query: AnyBody = {}) {
    const data = await this.mailTracking(query);
    const row = (data.data as any).liste.find((item: any) => item.id === id);
    if (!row) throw new NotFoundException("Mail takip kaydı bulunamadı.");
    return response(row);
  }

  async createMailDraft(body: AnyBody = {}) {
    const id = text(body.id || body.firmId || body.documentId);
    const detail = id ? await this.mailTrackingDetail(id, body) : null;
    const row: any = detail ? detail.data : {};
    return response({
      to: row.to || [],
      cc: row.cc || [],
      konu: `${row.firma || "Muhasebe"} belge/ekstre takibi`,
      govde: this.mailPreview(row),
      ekler: row.ekler || [],
      status: (row.to || []).length ? "READY" : "MISSING_RECIPIENT",
    });
  }

  private mailPreview(row: any) {
    if (!row) return "";
    return `Merhaba,\n${row.firma || "Firma"} cari belge/ekstre takibi için bilgilerinize sunulur.\nİyi çalışmalar.`;
  }
}
