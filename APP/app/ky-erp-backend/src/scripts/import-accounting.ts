import { decimal, ensureMainCompany, findJsonFiles, normalizeSearchText, normalizeText, prisma, readJsonArray, runScript, slugFromPath } from "./import-utils";

runScript("import-accounting", async () => {
  let movements = 0;
  for (const filePath of findJsonFiles("cari-movements")) {
    const mainCompanySlug = slugFromPath(filePath);
    await ensureMainCompany(mainCompanySlug);
    for (const row of readJsonArray(filePath)) {
      const legacyId = normalizeText(row.id || row.legacyId);
      const companyName = normalizeText(row.companyName || row.firma || row.cari);
      if (!legacyId || !companyName) continue;
      const normalizedName = normalizeSearchText(companyName);
      const company = await prisma.company.upsert({
        where: { mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName } },
        create: { mainCompanySlug, name: companyName, normalizedName },
        update: {},
      });
      const exists = await prisma.currentAccountMovement.findFirst({ where: { mainCompanySlug, legacyId } });
      if (exists) continue;
      const effect = Number(row.effect ?? row.etkisi ?? row.amount ?? row.tutar ?? 0) || 0;
      await prisma.currentAccountMovement.create({
        data: {
          mainCompanySlug,
          companyId: company.id,
          legacyId,
          movementDate: row.date || row.tarih ? new Date(String(row.date || row.tarih).slice(0, 10)) : new Date(),
          movementType: normalizeText(row.movementType || row.islemTipi || "IMPORT"),
          sourceType: normalizeText(row.sourceType || "JSON_IMPORT"),
          documentNo: normalizeText(row.documentNo || row.belge) || null,
          description: normalizeText(row.description || row.aciklama) || null,
          debit: decimal(effect > 0 ? effect : 0),
          credit: decimal(effect < 0 ? Math.abs(effect) : 0),
          amount: decimal(Math.abs(effect)),
          effect: decimal(effect),
          balanceAfter: decimal(row.balanceAfter ?? row.bakiye ?? 0),
          raw: row,
        },
      });
      movements += 1;
    }
  }
  return { movements };
});
