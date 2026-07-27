import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(value: unknown) {
  return cleanText(value)
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function decimalToNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isActiveMovement(row: any) {
  const raw = asObject(row?.raw);
  const status = normalizeToken(raw.status || raw.durum || "ISLENDI");
  if (raw.active === false) return false;
  return !["PASIF", "PASSIVE", "IPTAL", "CANCELLED"].includes(status);
}

function openingSigned(company: any) {
  const raw = asObject(company?.raw);
  const direction = normalizeToken(
    raw.openingBalanceDirection || raw.borcAlacakYonu || "BORC",
  );
  const opening = Math.abs(decimalToNumber(company?.openingBalance));
  return direction === "ALACAK" ? -opening : opening;
}

const PAYMENT_TOKENS = new Set([
  "ODEME",
  "TAHSILAT",
  "ALACAK",
  "KREDI_KARTI_ODEMESI",
  "CEK_GIRISI",
  "CEK_ODEMESI",
  "CEK_TAHSILATI",
]);

async function recalculateCompanyBalance(tx: PrismaClient, mainCompanySlug: string, companyId: string) {
  const company = await tx.company.findFirst({
    where: { id: companyId, mainCompanySlug },
  });
  if (!company) throw new Error("Firma bulunamadı.");
  let balance = openingSigned(company);
  const rows = await tx.currentAccountMovement.findMany({
    where: { mainCompanySlug, companyId },
    orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
  });
  for (const row of rows) {
    if (!isActiveMovement(row)) continue;
    balance += decimalToNumber(row.debit) - decimalToNumber(row.credit);
    await tx.currentAccountMovement.update({
      where: { id: row.id },
      data: { balanceAfter: balance },
    });
  }
  await tx.company.update({
    where: { id: companyId },
    data: { currentBalance: balance },
  });
  return balance;
}

function formatMovement(row: any) {
  return {
    id: row.id,
    tarih: row.movementDate?.toISOString?.().slice(0, 10) || row.movementDate,
    islemTipi: row.movementType,
    borc: decimalToNumber(row.debit),
    alacak: decimalToNumber(row.credit),
    kaynak: row.sourceType,
    sourceId: row.documentId || asObject(row.raw).reportManualExpenseId || "",
    aciklama: row.description || "",
    effect: decimalToNumber(row.effect),
    bakiye: decimalToNumber(row.balanceAfter),
    aktif: isActiveMovement(row),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mainCompanySlug = "mecit-hakan";
  const company = await prisma.company.findFirst({
    where: {
      mainCompanySlug,
      normalizedName: "koli bantci",
    },
  });
  if (!company) {
    throw new Error("KOLİ BANTCI firması bulunamadı.");
  }

  const movements = await prisma.currentAccountMovement.findMany({
    where: { mainCompanySlug, companyId: company.id },
    orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
  });
  const manualRows = await prisma.muhasebeRaporManuelKalem.findMany({
    where: { mainCompanySlug, firmaId: company.id, deletedAt: null },
    orderBy: [{ createdAt: "asc" }],
  });

  console.log("Firma:", {
    id: company.id,
    name: company.name,
    currentBalance: decimalToNumber(company.currentBalance),
    openingBalance: decimalToNumber(company.openingBalance),
  });
  console.log("Hareketler:");
  console.table(movements.map(formatMovement));

  if (manualRows.length) {
    console.log("Bağlı manuel gider / gelir satırları:");
    console.table(
      manualRows.map((row) => ({
        id: row.id,
        tarih: row.tarih?.toISOString?.().slice(0, 10) || "",
        tutar: decimalToNumber(row.tutar),
        kdv: decimalToNumber(row.kdv),
        raporaDahil: row.raporaDahil,
        cariyeEkle: row.cariyeEkle,
        cariHareketId: row.cariHareketId || "",
        aciklama: row.aciklama || row.ad,
      })),
    );
  }

  const wrongDirectionRows = movements.filter((row) => {
    const token = normalizeToken(row.movementType);
    return PAYMENT_TOKENS.has(token) && decimalToNumber(row.debit) > 0 && decimalToNumber(row.credit) === 0;
  });
  const duplicateGroups = new Map<string, any[]>();
  for (const row of movements) {
    const raw = asObject(row.raw);
    const linkedManualId = cleanText(raw.reportManualExpenseId);
    const sourceId = cleanText(row.documentId || linkedManualId);
    if (!sourceId) continue;
    const key = `${row.sourceType}:${sourceId}`;
    const list = duplicateGroups.get(key) || [];
    list.push(row);
    duplicateGroups.set(key, list);
  }
  const duplicates = [...duplicateGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      ids: rows.map((row) => row.id),
      descriptions: rows.map((row) => row.description || ""),
    }));

  console.log("Yanlış ödeme yönü adayları:", wrongDirectionRows.map((row) => row.id));
  console.log("Mükerrer kaynak grupları:", duplicates);

  if (!apply) {
    console.log("Rapor modu tamamlandı. Düzeltme için --apply ile tekrar çalıştırın.");
    return;
  }

  if (!wrongDirectionRows.length) {
    console.log("Düzeltilecek yanlış ödeme yönü kaydı bulunmadı.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const row of wrongDirectionRows) {
      const amount = Math.max(decimalToNumber(row.debit), decimalToNumber(row.credit), decimalToNumber(row.amount), Math.abs(decimalToNumber(row.effect)));
      await tx.currentAccountMovement.update({
        where: { id: row.id },
        data: {
          debit: 0,
          credit: amount,
          amount,
          effect: -amount,
          raw: {
            ...asObject(row.raw),
            correctionReason: "PAYMENT_DIRECTION_FIX",
            correctedAt: new Date().toISOString(),
            correctedByScript: "fix-koli-bantci-current-account",
          },
        },
      });
    }
    const balance = await recalculateCompanyBalance(tx as any, mainCompanySlug, company.id);
    console.log("Yeni bakiye:", balance);
  });

  const refreshed = await prisma.company.findUnique({ where: { id: company.id } });
  console.log("Uygulama tamamlandı. Güncel bakiye:", decimalToNumber(refreshed?.currentBalance));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });