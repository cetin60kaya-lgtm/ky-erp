import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assertNotProduction() {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  const url = String(process.env.DATABASE_URL || "").toLowerCase();
  if (env === "production" || url.includes("production") || url.includes("prod")) {
    throw new Error("Production ortamında test verisi temizleme scripti çalışmaz.");
  }
}

async function countAndDelete(modelName: string, where: any) {
  const model = (prisma as any)[modelName];
  if (!model) return { modelName, count: 0, skipped: true };
  const count = await model.count({ where });
  console.log(`${modelName}: ${count} SMOKE_TEST kayıt bulundu.`);
  if (count > 0) await model.deleteMany({ where });
  return { modelName, count, skipped: false };
}

async function main() {
  assertNotProduction();
  console.log("Sadece SMOKE_TEST ile açıkça işaretlenmiş muhasebe test kayıtları temizlenecek.");
  const smokeNote = { note: "SMOKE_TEST" };
  const jobs = [
    ["muhasebeContactPerson", { OR: [smokeNote] }],
    ["muhasebeContactDepartment", { OR: [{ usageNote: "SMOKE_TEST" }] }],
    ["muhasebeMailSendLog", { OR: [smokeNote] }],
    ["muhasebeStatementCompareResult", { OR: [smokeNote] }],
    ["muhasebeStatementImport", { OR: [smokeNote] }],
    ["muhasebeSupplierInvoiceLot", { OR: [smokeNote] }],
    [
      "muhasebeManualCustomerDispatch",
      {
        OR: [
          smokeNote,
          { rawDescription: { contains: "SMOKE_TEST" } },
          { dispatchNo: { startsWith: "SMOKE-" } },
          { dispatchNo: { startsWith: "SMOKE-MGI-" } },
          { dispatchNo: { startsWith: "SMOKE-LINK-" } },
        ],
      },
    ],
    ["creditCard", { OR: [smokeNote] }],
    ["payment", { OR: [{ description: "SMOKE_TEST" }, { sourceType: "SMOKE_TEST" }] }],
    ["check", { OR: [{ description: "SMOKE_TEST" }] }],
  ];
  const results = [];
  for (const [modelName, where] of jobs) {
    results.push(await countAndDelete(String(modelName), where));
  }
  const total = results.reduce((sum, item) => sum + item.count, 0);
  console.log(`Toplam temizlenen SMOKE_TEST kayıt: ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
