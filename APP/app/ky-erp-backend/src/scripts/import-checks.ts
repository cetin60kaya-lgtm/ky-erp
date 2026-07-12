import { decimal, ensureMainCompany, findJsonFiles, normalizeSearchText, normalizeText, prisma, readJsonArray, runScript, slugFromPath } from "./import-utils";

runScript("import-checks", async () => {
  let imported = 0;
  let skipped = 0;
  for (const filePath of findJsonFiles("checks")) {
    const mainCompanySlug = slugFromPath(filePath);
    await ensureMainCompany(mainCompanySlug);
    for (const row of readJsonArray(filePath)) {
      const legacyId = normalizeText(row.id || row.legacyId);
      const checkNo = normalizeText(row.cekNo || row.checkNo);
      if (!legacyId && !checkNo) {
        skipped += 1;
        continue;
      }
      let companyId: string | null = null;
      const companyName = normalizeText(row.firma || row.companyName);
      if (companyName) {
        const company = await prisma.company.upsert({
          where: { mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName: normalizeSearchText(companyName) } },
          create: { mainCompanySlug, name: companyName, normalizedName: normalizeSearchText(companyName) },
          update: {},
        });
        companyId = company.id;
      }
      const exists = legacyId ? await prisma.check.findFirst({ where: { mainCompanySlug, legacyId } }) : null;
      const data = {
        mainCompanySlug,
        companyId,
        checkNo: checkNo || legacyId,
        bankName: normalizeText(row.banka || row.bankName) || null,
        branchName: normalizeText(row.sube || row.branchName) || null,
        dueDate: row.vadeTarihi || row.dueDate ? new Date(String(row.vadeTarihi || row.dueDate).slice(0, 10)) : new Date(),
        amount: decimal(row.tutar || row.amount || 0),
        status: normalizeText(row.status || row.durum || "bekliyor"),
        direction: normalizeText(row.direction || row.yon || "IN"),
        description: normalizeText(row.aciklama || row.description) || null,
        reminderDate: row.hatirlatmaTarihi ? new Date(String(row.hatirlatmaTarihi).slice(0, 10)) : null,
        legacyId: legacyId || null,
        raw: row,
      };
      if (exists) await prisma.check.update({ where: { id: exists.id }, data });
      else await prisma.check.create({ data });
      imported += 1;
    }
  }
  return { imported, skipped };
});
