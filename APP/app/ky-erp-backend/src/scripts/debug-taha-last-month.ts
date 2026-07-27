import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousMonthRangeUtc(ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

function d(value: any) {
  return Number(value || 0);
}

async function main() {
  const { start, end } = previousMonthRangeUtc();
  const companies = await prisma.company.findMany({
    where: {
      deletedAt: null,
      name: {
        contains: "taha",
      },
    },
    select: {
      id: true,
      name: true,
      mainCompanySlug: true,
      varsayilanRaporKategoriId: true,
      defaultRecordType: true,
      raw: true,
    },
    take: 50,
  });

  console.log(
    JSON.stringify(
      {
        month: `${toISODate(start)}..${toISODate(end)}`,
        companyCount: companies.length,
      },
      null,
      2,
    ),
  );

  for (const company of companies) {
    const docs = await prisma.document.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        OR: [
          { date: { gte: start, lte: end } },
          { processedAt: { gte: start, lte: end } },
          { createdAt: { gte: start, lte: end } },
        ],
      },
      select: {
        id: true,
        date: true,
        processedAt: true,
        createdAt: true,
        documentNo: true,
        
        subtotal: true,
        vatTotal: true,
        grandTotal: true,
        raporKategoriId: true,
        raw: true,
      },
      take: 500,
    });

    const movements = await prisma.currentAccountMovement.findMany({
      where: {
        companyId: company.id,
        movementDate: { gte: start, lte: end },
      },
      select: {
        id: true,
        movementDate: true,
        movementType: true,
        amount: true,
        effect: true,
        debit: true,
        credit: true,
        documentId: true,
        documentNo: true,
        description: true,
        raw: true,
      },
      take: 1000,
    });

    const standalone = movements.filter((m) => !m.documentId);
    const incomingStandalone = standalone.filter((m) => d(m.credit) > d(m.debit));

    const docsGrandTotal = docs.reduce((sum, row) => sum + d(row.grandTotal), 0);
    const docsSubtotal = docs.reduce((sum, row) => sum + d(row.subtotal), 0);
    const incomingStandaloneTotal = incomingStandalone.reduce(
      (sum, row) => sum + Math.abs(d(row.amount) || d(row.effect) || d(row.credit) || d(row.debit)),
      0,
    );

    const sampleIncoming = incomingStandalone.slice(0, 15).map((row) => {
      const raw = (row.raw || {}) as Record<string, any>;
      return {
        id: row.id,
        date: toISODate(row.movementDate),
        documentNo: row.documentNo,
        amount: d(row.amount),
        effect: d(row.effect),
        debit: d(row.debit),
        credit: d(row.credit),
        description: row.description,
        source: raw.source || raw.kaynak || "",
        sourceType: raw.sourceType || raw.kaynakTipi || "",
        sourceId: raw.sourceId || raw.kaynakId || "",
        invoiceId: raw.documentId || raw.invoiceId || "",
        reportCategoryId: raw.reportCategoryId || raw.kategoriId || "",
      };
    });

    console.log(
      JSON.stringify(
        {
          company: {
            id: company.id,
            name: company.name,
            mainCompanySlug: company.mainCompanySlug,
            varsayilanRaporKategoriId: company.varsayilanRaporKategoriId,
            defaultRecordType: company.defaultRecordType,
            raw: company.raw,
          },
          documents: {
            count: docs.length,
            subtotal: docsSubtotal,
            grandTotal: docsGrandTotal,
            sample: docs.slice(0, 10).map((row) => ({
              id: row.id,
              date: row.date ? toISODate(row.date) : null,
              processedAt: row.processedAt ? toISODate(row.processedAt) : null,
              createdAt: toISODate(row.createdAt),
              documentNo: row.documentNo,
              routeType: (row.raw as any)?.routeType,
              subtotal: d(row.subtotal),
              vatTotal: d(row.vatTotal),
              grandTotal: d(row.grandTotal),
              raporKategoriId: row.raporKategoriId,
            })),
          },
          currentAccount: {
            count: movements.length,
            standaloneCount: standalone.length,
            incomingStandaloneCount: incomingStandalone.length,
            incomingStandaloneTotal,
            sampleIncoming,
          },
          possibleDoubleCountSignal: {
            docsVsIncomingStandaloneDelta: Math.abs(docsGrandTotal - incomingStandaloneTotal),
            docsGrandPlusIncomingStandalone: docsGrandTotal + incomingStandaloneTotal,
          },
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
