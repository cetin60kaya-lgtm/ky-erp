import { PrismaService } from "../prisma/prisma.service";
import { FirmaKartlariDbService } from "../muhasebe/firma-kartlari-db.service";

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  try {
    const service = new FirmaKartlariDbService(prisma);
    const result: any = await service.buildReportControl("mecit-hakan", {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
    const rows = (result?.data?.records || [])
      .filter((row: any) => row.reportIncluded === true && row.transactionType === "GELIR")
      .map((row: any) => ({
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        companyName: row.companyName,
        date: row.date,
        reportAmount: Number(row.reportAmount || 0),
        category: row.category,
        reportStatus: row.reportStatus,
        sourceOfDecision: row.sourceOfDecision,
        description: row.description,
      }))
      .sort((a: any, b: any) => b.reportAmount - a.reportAmount);
    const total = rows.reduce((sum: number, row: any) => sum + Number(row.reportAmount || 0), 0);
    console.log(JSON.stringify({
      count: rows.length,
      totalIncome: total,
      rows,
    }, null, 2));
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
