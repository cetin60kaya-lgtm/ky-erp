import { PrismaService } from "../prisma/prisma.service";
import { IsnetOperationsService } from "../muhasebe/isnet-operations.service";

async function main() {
  const mainCompanySlug = String(process.argv[2] || "").trim();
  if (!mainCompanySlug) throw new Error("Ana firma slug parametresi zorunludur.");
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const service = new IsnetOperationsService(prisma, {} as any, {} as any, {} as any);
    const measurements = [];
    for (let index = 0; index < 5; index += 1) {
      const startedAt = performance.now();
      const result = await service.localDocuments({
        mainCompanySlug,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        page: 1,
        pageSize: 50,
      });
      measurements.push({
        run: index + 1,
        wallMs: Math.round((performance.now() - startedAt) * 100) / 100,
        ...result.performance,
        totalRows: result.totalLocal,
        returnedRows: result.documents.length,
      });
    }
    process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
