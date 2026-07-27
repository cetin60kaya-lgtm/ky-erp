import { decimal, ensureMainCompany, findJsonFiles, normalizeSearchText, normalizeText, prisma, readJsonArray, runScript, slugFromPath } from "./import-utils";

runScript("import-payments", async () => {
  let imported = 0;
  let skipped = 0;
  for (const filePath of findJsonFiles("payments")) {
    const mainCompanySlug = slugFromPath(filePath);
    await ensureMainCompany(mainCompanySlug);
    for (const row of readJsonArray(filePath)) {
      const legacyId = normalizeText(row.id || row.legacyId);
      const companyName = normalizeText(row.firma || row.companyName);
      if (!legacyId || !companyName) {
        skipped += 1;
        continue;
      }
      const company = await prisma.company.upsert({
        where: { mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName: normalizeSearchText(companyName) } },
        create: { mainCompanySlug, name: companyName, normalizedName: normalizeSearchText(companyName) },
        update: {},
      });
      const exists = await prisma.payment.findFirst({ where: { mainCompanySlug, legacyId } });
      if (exists) {
        await prisma.payment.update({ where: { id: exists.id }, data: { raw: row } });
      } else {
        await prisma.payment.create({
          data: {
            mainCompanySlug,
            companyId: company.id,
            paymentDate: row.tarih ? new Date(String(row.tarih).slice(0, 10)) : new Date(),
            paymentType: normalizeText(row.odemeTuru || row.paymentType || "Odeme"),
            direction: normalizeText(row.direction || "OUT"),
            amount: decimal(row.tutar || row.amount || 0),
            description: normalizeText(row.aciklama || row.description) || null,
            legacyId,
            raw: row,
          },
        });
      }
      imported += 1;
    }
  }
  return { imported, skipped };
});
