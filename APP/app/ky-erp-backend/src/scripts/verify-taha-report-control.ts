import { PrismaService } from "../prisma/prisma.service";
import { FirmaKartlariDbService } from "../muhasebe/firma-kartlari-db.service";

function toDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function previousMonthRangeUtc(ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const service = new FirmaKartlariDbService(prisma);
  try {
    const { start, end } = previousMonthRangeUtc();
    const company = await prisma.company.findFirst({
      where: { deletedAt: null, name: { contains: "TAHA" } },
      select: { id: true, name: true, mainCompanySlug: true },
    });
    if (!company) {
      console.log(JSON.stringify({ ok: false, reason: "TAHA company not found" }, null, 2));
      return;
    }

    const result: any = await service.buildReportControl(company.mainCompanySlug, {
      startDate: start,
      endDate: end,
      firmId: company.id,
      search: "",
    });

    const rows = Array.isArray(result?.data?.records) ? result.data.records : [];
    const included = rows.filter((row: any) => row.reportIncluded === true);
    const sourceSummary = new Map<string, { count: number; included: number; amount: number; includedAmount: number }>();

    for (const row of rows) {
      const key = row.sourceType || "UNKNOWN";
      const data = sourceSummary.get(key) || { count: 0, included: 0, amount: 0, includedAmount: 0 };
      data.count += 1;
      data.amount += Number(row.reportAmount || 0);
      if (row.reportIncluded === true) {
        data.included += 1;
        data.includedAmount += Number(row.reportAmount || 0);
      }
      sourceSummary.set(key, data);
    }

    const currentAccountRows = rows
      .filter((row: any) => row.sourceType === "CURRENT_ACCOUNT")
      .map((row: any) => ({
        sourceId: row.sourceId,
        date: row.date,
        reportIncluded: row.reportIncluded,
        reportStatus: row.reportStatus,
        transactionType: row.transactionType,
        reportAmount: Number(row.reportAmount || 0),
        category: row.category,
        sourceOfDecision: row.sourceOfDecision,
        description: row.description,
      }));

    const summary = {
      month: `${start}..${end}`,
      company,
      totalRows: rows.length,
      includedRows: included.length,
      totalIncomeIncluded: included
        .filter((row: any) => row.transactionType === "GELIR")
        .reduce((sum: number, row: any) => sum + Number(row.reportAmount || 0), 0),
      totalExpenseIncluded: included
        .filter((row: any) => row.transactionType === "GIDER")
        .reduce((sum: number, row: any) => sum + Number(row.reportAmount || 0), 0),
      sourceSummary: [...sourceSummary.entries()].map(([sourceType, data]) => ({ sourceType, ...data })),
      currentAccountRows,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
