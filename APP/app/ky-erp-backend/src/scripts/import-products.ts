import { decimal, ensureMainCompany, findJsonFiles, normalizeSearchText, normalizeText, prisma, readJsonArray, runScript, slugFromPath } from "./import-utils";

runScript("import-products", async () => {
  let imported = 0;
  let skipped = 0;
  for (const filePath of findJsonFiles("products")) {
    const mainCompanySlug = slugFromPath(filePath);
    await ensureMainCompany(mainCompanySlug);
    for (const row of readJsonArray(filePath)) {
      const name = normalizeText(row.name || row.urunAdi || row.productName);
      if (!name) {
        skipped += 1;
        continue;
      }
      const normalizedName = normalizeSearchText(row.normalizedName || name);
      await prisma.product.upsert({
        where: { mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName } },
        create: {
          mainCompanySlug,
          legacyId: normalizeText(row.id || row.legacyId) || null,
          name,
          normalizedName,
          unit: normalizeText(row.unit || row.birim) || null,
          defaultVatRate: decimal(row.defaultVatRate ?? row.kdvOrani ?? 0),
          raw: row,
        },
        update: {
          name,
          unit: normalizeText(row.unit || row.birim) || undefined,
          defaultVatRate: decimal(row.defaultVatRate ?? row.kdvOrani ?? 0),
          raw: row,
        },
      });
      imported += 1;
    }
  }
  return { imported, skipped };
});
