import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function assertNotProduction() {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  const url = String(process.env.DATABASE_URL || "").toLowerCase();
  if (
    env === "production" ||
    url.includes("production") ||
    url.includes("prod")
  ) {
    throw new Error(
      "Production ortamında muhasebe temizleme scripti çalışmaz.",
    );
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function decimalZero() {
  return 0;
}

function resolveSafePath(filePath: string) {
  const value = normalizeText(filePath);
  if (!value) return "";
  const backendRoot = process.cwd();
  const workspaceRoot = path.resolve(backendRoot, "..", "..");
  const absolutePath = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(backendRoot, value);
  if (
    absolutePath === workspaceRoot ||
    absolutePath.startsWith(`${workspaceRoot}${path.sep}`)
  ) {
    return absolutePath;
  }
  return "";
}

function deletePhysicalFiles(pathsToDelete: string[]) {
  const uniquePaths = [
    ...new Set(pathsToDelete.map(resolveSafePath).filter(Boolean)),
  ];
  let deletedCount = 0;
  for (const filePath of uniquePaths) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      fs.unlinkSync(filePath);
      deletedCount += 1;
    } catch {
      // Fiziksel dosya silme başarısız olsa da DB temizliği devam etsin.
    }
  }
  return deletedCount;
}

async function deleteManyIfExists(
  tx: any,
  modelName: string,
  where: Record<string, unknown>,
) {
  const model = tx[modelName];
  if (!model?.deleteMany) return 0;
  const result = await model.deleteMany({ where });
  return Number(result?.count || 0);
}

async function updateManyIfExists(
  tx: any,
  modelName: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  const model = tx[modelName];
  if (!model?.updateMany) return 0;
  const result = await model.updateMany({ where, data });
  return Number(result?.count || 0);
}

async function main() {
  assertNotProduction();

  const mainCompanySlug = normalizeText(
    process.argv[2] || process.env.MAIN_COMPANY_SLUG || "mecit-hakan",
  );
  const keepFirms = !process.argv.includes("--delete-firms");

  if (!mainCompanySlug) {
    throw new Error("Ana firma slug zorunlu.");
  }

  const documentFiles = await prisma.documentFile.findMany({
    where: { mainCompanySlug },
    select: { filePath: true },
  });
  const intakeFiles = await prisma.documentIntake.findMany({
    where: { mainCompanySlug },
    select: { filePath: true },
  });

  const filePaths = [
    ...documentFiles.map((item) => item.filePath),
    ...intakeFiles.map((item) => item.filePath),
  ].filter(Boolean);

  const summary = await prisma.$transaction(async (tx) => {
    const counts: Record<string, number> = {};
    const scoped = { mainCompanySlug };
    const idScoped = { mainCompanyId: mainCompanySlug };

    counts.documentIntakeMatch = await deleteManyIfExists(
      tx,
      "documentIntakeMatch",
      {
        documentIntake: scoped,
      },
    );
    counts.documentIntakeLine = await deleteManyIfExists(
      tx,
      "documentIntakeLine",
      {
        documentIntake: scoped,
      },
    );
    counts.documentIntake = await deleteManyIfExists(
      tx,
      "documentIntake",
      scoped,
    );

    counts.accountingDocumentModelLink = await deleteManyIfExists(
      tx,
      "accountingDocumentModelLink",
      scoped,
    );
    counts.accountingDocumentLine = await deleteManyIfExists(
      tx,
      "accountingDocumentLine",
      scoped,
    );
    counts.invoiceItem = await deleteManyIfExists(tx, "invoiceItem", scoped);
    counts.documentFile = await deleteManyIfExists(tx, "documentFile", scoped);

    counts.creditCardMovement = await deleteManyIfExists(
      tx,
      "creditCardMovement",
      scoped,
    );
    counts.payment = await deleteManyIfExists(tx, "payment", scoped);
    counts.check = await deleteManyIfExists(tx, "check", scoped);
    counts.creditCard = await deleteManyIfExists(tx, "creditCard", scoped);
    counts.cariMovement = await deleteManyIfExists(
      tx,
      "cariMovement",
      idScoped,
    );
    counts.paymentRecord = await deleteManyIfExists(
      tx,
      "paymentRecord",
      idScoped,
    );
    counts.mailTask = await deleteManyIfExists(tx, "mailTask", idScoped);
    counts.statementCompare = await deleteManyIfExists(
      tx,
      "statementCompare",
      idScoped,
    );
    counts.paymentControlRecord = await deleteManyIfExists(
      tx,
      "paymentControlRecord",
      scoped,
    );
    counts.vatRecord = await deleteManyIfExists(tx, "vatRecord", scoped);
    counts.currentAccountMovement = await deleteManyIfExists(
      tx,
      "currentAccountMovement",
      scoped,
    );
    counts.document = await deleteManyIfExists(tx, "document", scoped);

    counts.mailContact = await deleteManyIfExists(tx, "mailContact", scoped);
    counts.companyContactAuthority = await deleteManyIfExists(
      tx,
      "companyContactAuthority",
      scoped,
    );
    counts.companyContact = await deleteManyIfExists(
      tx,
      "companyContact",
      scoped,
    );
    counts.companyDepartment = await deleteManyIfExists(
      tx,
      "companyDepartment",
      scoped,
    );
    counts.muhasebeContactPerson = await deleteManyIfExists(
      tx,
      "muhasebeContactPerson",
      scoped,
    );
    counts.muhasebeContactDepartment = await deleteManyIfExists(
      tx,
      "muhasebeContactDepartment",
      scoped,
    );
    counts.muhasebeMailSendLog = await deleteManyIfExists(
      tx,
      "muhasebeMailSendLog",
      scoped,
    );
    counts.muhasebeStatementCompareResult = await deleteManyIfExists(
      tx,
      "muhasebeStatementCompareResult",
      scoped,
    );
    counts.muhasebeStatementImport = await deleteManyIfExists(
      tx,
      "muhasebeStatementImport",
      scoped,
    );
    counts.muhasebeSupplierInvoiceLot = await deleteManyIfExists(
      tx,
      "muhasebeSupplierInvoiceLot",
      scoped,
    );
    counts.muhasebeManualCustomerDispatch = await deleteManyIfExists(
      tx,
      "muhasebeManualCustomerDispatch",
      scoped,
    );
    counts.job = await deleteManyIfExists(tx, "job", scoped);

    counts.modelMailAssignment = await deleteManyIfExists(
      tx,
      "modelMailAssignment",
      {
        firm: {
          OR: [{ mainCompanySlug }, { mainCompanyId: mainCompanySlug }],
        },
      },
    );
    counts.firmContact = await deleteManyIfExists(tx, "firmContact", {
      firm: {
        OR: [{ mainCompanySlug }, { mainCompanyId: mainCompanySlug }],
      },
    });

    counts.productAlias = await deleteManyIfExists(tx, "productAlias", scoped);
    counts.product = await deleteManyIfExists(tx, "product", scoped);

    counts.companyReset = await updateManyIfExists(tx, "company", scoped, {
      currentBalance: decimalZero(),
      openingBalance: decimalZero(),
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
    });

    if (keepFirms) {
      counts.firmReset = await updateManyIfExists(
        tx,
        "firm",
        { OR: [{ mainCompanySlug }, { mainCompanyId: mainCompanySlug }] },
        {
          openingBalance: decimalZero(),
          openingBalanceDate: null,
          openingBalanceDirection: "BORC",
          openingVatAmount: decimalZero(),
          openingVatPeriod: null,
          deletedAt: null,
          status: "ACTIVE",
          isActive: true,
        },
      );
    } else {
      counts.firm = await deleteManyIfExists(tx, "firm", {
        OR: [{ mainCompanySlug }, { mainCompanyId: mainCompanySlug }],
      });
      counts.companyAlias = await deleteManyIfExists(
        tx,
        "companyAlias",
        scoped,
      );
      counts.company = await deleteManyIfExists(tx, "company", scoped);
    }

    return counts;
  });

  const deletedFileCount = deletePhysicalFiles(filePaths);

  const postState = {
    documents: await prisma.document.count({ where: { mainCompanySlug } }),
    intakes: await prisma.documentIntake.count({ where: { mainCompanySlug } }),
    movements: await prisma.currentAccountMovement.count({
      where: { mainCompanySlug },
    }),
    vat: await prisma.vatRecord.count({ where: { mainCompanySlug } }),
    payments: await prisma.payment.count({ where: { mainCompanySlug } }),
    checks: await prisma.check.count({ where: { mainCompanySlug } }),
    cards: await prisma.creditCard.count({ where: { mainCompanySlug } }),
    products: await prisma.product.count({ where: { mainCompanySlug } }),
    companies: await prisma.company.count({ where: { mainCompanySlug } }),
    firms: await prisma.firm.count({
      where: { OR: [{ mainCompanySlug }, { mainCompanyId: mainCompanySlug }] },
    }),
  };

  console.log(
    JSON.stringify(
      {
        ok: true,
        mainCompanySlug,
        keepFirms,
        deletedFileCount,
        summary,
        postState,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
