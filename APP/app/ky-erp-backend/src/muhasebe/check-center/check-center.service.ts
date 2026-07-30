import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { getStorageRoot } from "../../storage/storage-path.util";

type AnyBody = Record<string, any>;

const META_PREFIX = "KYERP_CHECK_META:";

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/[₺\s]/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown, fallback = new Date()) {
  const parsed = value ? new Date(String(value)) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function iso(value: unknown) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

function openStatus(value: unknown) {
  return ![
    "PAID",
    "CANCELLED",
    "IPTAL",
    "ODENDI",
    "ÖDENDI",
    "ÖDENDİ",
  ].includes(text(value).toLocaleUpperCase("tr-TR"));
}

function workType(value: unknown): "OFFICIAL" | "UNOFFICIAL" {
  const key = text(value).toLocaleUpperCase("tr-TR");
  return key.includes("GAYRI") || key.includes("UNOFFICIAL")
    ? "UNOFFICIAL"
    : "OFFICIAL";
}

function metaFrom(value: unknown) {
  const raw = text(value);
  const empty = {
    note: raw,
    receiptPath: "",
    issueDate: "",
    accountNo: "",
    checkOwnership: "CUSTOMER_CHECK",
    checkDirection: "RECEIVED",
  };
  if (!raw.startsWith(META_PREFIX)) return empty;
  try {
    const parsed = JSON.parse(raw.slice(META_PREFIX.length));
    return {
      note: text(parsed?.note),
      receiptPath: text(parsed?.receiptPath),
      issueDate: text(parsed?.issueDate),
      accountNo: text(parsed?.accountNo),
      checkOwnership: text(parsed?.checkOwnership || "CUSTOMER_CHECK"),
      checkDirection: text(parsed?.checkDirection || "RECEIVED"),
    };
  } catch {
    return empty;
  }
}

function metaText(value: AnyBody) {
  return `${META_PREFIX}${JSON.stringify({
    note: text(value.note),
    receiptPath: text(value.receiptPath),
    issueDate: text(value.issueDate),
    accountNo: text(value.accountNo),
    checkOwnership: text(value.checkOwnership || "CUSTOMER_CHECK"),
    checkDirection: text(value.checkDirection || "RECEIVED"),
  })}`;
}

@Injectable()
export class CheckCenterService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(input: AnyBody = {}) {
    const slug = text(input.mainCompanySlug || input.mainCompanyId);
    if (!slug) throw new BadRequestException("Ana firma zorunludur.");
    return slug;
  }

  private async firmOrThrow(slug: string, firmId: string) {
    const firm = await this.prisma.firm.findFirst({
      where: {
        id: firmId,
        deletedAt: null,
        OR: [{ mainCompanySlug: slug }, { mainCompanyId: slug }],
      },
    });
    if (!firm) throw new NotFoundException("Firma/cari bulunamadı.");
    return firm;
  }

  async create(body: AnyBody = {}) {
    const slug = this.slug(body);
    const firmId = text(body.firmId || body.firmaId || body.companyId);
    const checkNo = text(body.checkNo || body.cekNo);
    const bankName = text(body.bankName || body.banka);
    const amount = numeric(body.amount || body.tutar);
    if (!firmId) throw new BadRequestException("Çek için firma seçimi zorunludur.");
    if (!checkNo) throw new BadRequestException("Çek no zorunludur.");
    if (!bankName) throw new BadRequestException("Banka zorunludur.");
    if (amount <= 0) throw new BadRequestException("Çek tutarı 0'dan büyük olmalıdır.");
    await this.firmOrThrow(slug, firmId);
    const duplicate = await this.prisma.paymentRecord.findFirst({
      where: {
        mainCompanyId: slug,
        firmId,
        paymentType: "CHECK",
        checkNo,
        bankName,
        deletedAt: null,
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        "Aynı firma, banka ve çek no ile kayıt zaten var.",
      );
    }
    const data = await this.prisma.paymentRecord.create({
      data: {
        mainCompanyId: slug,
        firmId,
        paymentType: "CHECK",
        workType: workType(body.workType || body.resmiGayri),
        checkNo,
        bankName,
        dueDate: dateValue(body.dueDate || body.vadeTarihi),
        amount: new Prisma.Decimal(amount),
        status: "PLANNED",
        note: metaText({
          note: body.note || body.description || body.aciklama,
          issueDate: body.issueDate || body.verilenTarih,
          accountNo: body.accountNo || body.hesapNo,
          checkOwnership: body.checkOwnership || body.cekSahibi,
          checkDirection: body.checkDirection || body.islemYonu,
          receiptPath: "",
        }),
      },
    });
    return { ok: true, data: { ...data, ...metaFrom(data.note) } };
  }

  async overview(query: AnyBody = {}) {
    const slug = this.slug(query);
    const now = new Date();
    const rows = await this.prisma.paymentRecord.findMany({
      where: {
        mainCompanyId: slug,
        paymentType: "CHECK",
        relatedDocumentId: null,
        deletedAt: null,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 2000,
    });
    const firmIds = [...new Set(rows.map((row) => row.firmId).filter(Boolean))];
    const firms = firmIds.length
      ? await this.prisma.firm.findMany({
          where: { id: { in: firmIds } },
          select: { id: true, name: true },
        })
      : [];
    const firmById = new Map(firms.map((firm) => [firm.id, firm.name]));
    const normalized = rows.map((row) => {
      const meta = metaFrom(row.note);
      const due = row.dueDate || row.createdAt;
      const dueDay = new Date(
        due.getFullYear(),
        due.getMonth(),
        due.getDate(),
        12,
      );
      const todayDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        12,
      );
      const amount = numeric(row.amount);
      return {
        id: row.id,
        firmId: row.firmId,
        firmaAdi: firmById.get(row.firmId) || "",
        workType: row.workType,
        checkNo: row.checkNo || "",
        bankName: row.bankName || "",
        dueDate: iso(due),
        issueDate: meta.issueDate || iso(row.createdAt),
        accountNo: meta.accountNo,
        checkOwnership: meta.checkOwnership,
        checkDirection: meta.checkDirection,
        amount,
        status: row.status,
        note: meta.note,
        frontImagePath: row.frontImagePath || "",
        backImagePath: row.backImagePath || "",
        receiptPath: meta.receiptPath,
        open: openStatus(row.status),
        daysRemaining: Math.ceil(
          (dueDay.getTime() - todayDay.getTime()) / 86400000,
        ),
        monthKey: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`,
        createdAt: row.createdAt,
      };
    });
    const openRows = normalized.filter((row) => row.open);
    const monthMap = new Map<
      string,
      { monthKey: string; label: string; total: number; count: number }
    >();
    for (const row of openRows) {
      const due = new Date(`${row.dueDate}T12:00:00`);
      const current = monthMap.get(row.monthKey) || {
        monthKey: row.monthKey,
        label: due.toLocaleDateString("tr-TR", {
          month: "long",
          year: "numeric",
        }),
        total: 0,
        count: 0,
      };
      current.total += row.amount;
      current.count += 1;
      monthMap.set(row.monthKey, current);
    }
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfFollowingMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 2,
      1,
    );
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
    const inRange = (value: string, start: Date, end: Date) => {
      const parsed = new Date(`${value}T12:00:00`);
      return parsed >= start && parsed < end;
    };
    const sum = (items: Array<{ amount: number }>) =>
      items.reduce((total, row) => total + row.amount, 0);
    const thisMonth = openRows.filter((row) =>
      inRange(row.dueDate, startOfMonth, startOfNextMonth),
    );
    const nextMonth = openRows.filter((row) =>
      inRange(row.dueDate, startOfNextMonth, startOfFollowingMonth),
    );
    const overdue = openRows.filter((row) => row.daysRemaining < 0);
    const yearRows = normalized.filter((row) =>
      inRange(row.dueDate, startOfYear, endOfYear),
    );
    return {
      ok: true,
      data: {
        summary: {
          thisMonthTotal: sum(thisMonth),
          thisMonthCount: thisMonth.length,
          nextMonthTotal: sum(nextMonth),
          nextMonthCount: nextMonth.length,
          overdueTotal: sum(overdue),
          overdueCount: overdue.length,
          openTotal: sum(openRows),
          openCount: openRows.length,
          yearTotal: sum(yearRows),
          yearCount: yearRows.length,
        },
        months: [...monthMap.values()]
          .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
          .slice(0, 18),
        rows: normalized,
      },
    };
  }

  async saveAttachments(id: string, paths: AnyBody = {}) {
    const current = await this.prisma.paymentRecord.findUnique({ where: { id } });
    if (!current || current.paymentType !== "CHECK") {
      throw new NotFoundException("Çek kaydı bulunamadı.");
    }
    const meta = metaFrom(current.note);
    const data = await this.prisma.paymentRecord.update({
      where: { id },
      data: {
        frontImagePath: text(paths.frontPath) || current.frontImagePath,
        backImagePath: text(paths.backPath) || current.backImagePath,
        note: metaText({
          ...meta,
          receiptPath: text(paths.receiptPath) || meta.receiptPath,
        }),
      },
    });
    return { ok: true, data: { ...data, ...metaFrom(data.note) } };
  }

  async filePath(id: string, side: string) {
    const row = await this.prisma.paymentRecord.findUnique({ where: { id } });
    if (!row || row.paymentType !== "CHECK") {
      throw new NotFoundException("Çek kaydı bulunamadı.");
    }
    const meta = metaFrom(row.note);
    const candidate =
      side === "front"
        ? row.frontImagePath
        : side === "back"
          ? row.backImagePath
          : side === "receipt"
            ? meta.receiptPath
            : "";
    if (!candidate) throw new NotFoundException("Çek dosyası bulunamadı.");
    const storageRoot = path.resolve(getStorageRoot());
    const resolved = path.resolve(candidate);
    if (
      resolved !== storageRoot &&
      !resolved.startsWith(`${storageRoot}${path.sep}`)
    ) {
      throw new BadRequestException("Geçersiz çek dosya yolu.");
    }
    if (!fs.existsSync(resolved)) {
      throw new NotFoundException("Çek dosyası bulunamadı.");
    }
    return resolved;
  }
}
