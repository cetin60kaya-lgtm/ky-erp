import { decimal, ensureMainCompany, findJsonFiles, normalizeSearchText, normalizeText, prisma, readJsonArray, runScript, slugFromPath } from "./import-utils";

runScript("import-companies", async () => {
  let imported = 0;
  let skipped = 0;
  for (const filePath of findJsonFiles("companies")) {
    const mainCompanySlug = slugFromPath(filePath);
    await ensureMainCompany(mainCompanySlug);
    for (const row of readJsonArray(filePath)) {
      const name = normalizeText(row.name || row.firma || row.unvan);
      if (!name) {
        skipped += 1;
        continue;
      }
      const normalizedName = normalizeSearchText(row.normalizedName || name);
      const legacyId = normalizeText(row.id || row.legacyId) || null;
      const existing = await prisma.company.findFirst({
        where: {
          mainCompanySlug,
          OR: [
            ...(legacyId ? [{ legacyId }] : []),
            { normalizedName },
          ],
        },
      });
      if (existing) {
        await prisma.company.update({
          where: { id: existing.id },
          data: {
            name,
            normalizedName: existing.normalizedName || normalizedName,
            taxNo: normalizeText(row.taxNo || row.vergiNo) || undefined,
            phone: normalizeText(row.phone || row.telefon) || undefined,
            email: normalizeText(row.email || row.eposta) || undefined,
            raw: row,
          },
        });
      } else {
        await prisma.company.create({
          data: {
          mainCompanySlug,
          legacyId,
          name,
          normalizedName,
          type: normalizeText(row.type || row.tip || "SATICI") || "SATICI",
          taxNo: normalizeText(row.taxNo || row.vergiNo) || null,
          taxOffice: normalizeText(row.taxOffice || row.vergiDairesi) || null,
          phone: normalizeText(row.phone || row.telefon) || null,
          email: normalizeText(row.email || row.eposta) || null,
          address: normalizeText(row.address || row.adres) || null,
          currentBalance: decimal(row.currentBalance ?? row.mevcutBakiye ?? row.bakiye ?? 0),
          openingBalance: decimal(row.openingBalance ?? row.acilisBakiye ?? 0),
          raw: row,
          },
        });
      }
      imported += 1;
    }
  }
  return { imported, skipped };
});
