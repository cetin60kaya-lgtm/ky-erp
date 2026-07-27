import { decimal, ensureMainCompany, findJsonFiles, normalizeText, prisma, readJsonArray, runScript, slugFromPath } from "./import-utils";

runScript("import-credit-cards", async () => {
  let imported = 0;
  let skipped = 0;
  for (const filePath of findJsonFiles("credit-cards")) {
    const mainCompanySlug = slugFromPath(filePath);
    await ensureMainCompany(mainCompanySlug);
    for (const row of readJsonArray(filePath)) {
      const legacyId = normalizeText(row.id || row.legacyId);
      const cardName = normalizeText(row.kartAdi || row.cardName);
      if (!legacyId && !cardName) {
        skipped += 1;
        continue;
      }
      const exists = legacyId ? await prisma.creditCard.findFirst({ where: { mainCompanySlug, legacyId } }) : null;
      const data = {
        mainCompanySlug,
        bankName: normalizeText(row.banka || row.bankName) || null,
        cardName: cardName || legacyId,
        lastFourDigits: normalizeText(row.son4Hane || row.lastFourDigits) || null,
        period: normalizeText(row.donem || row.period) || null,
        totalDebt: decimal(row.toplamBorc || row.totalDebt || 0),
        minimumPayment: decimal(row.asgariOdeme || row.minimumPayment || 0),
        dueDate: row.sonOdemeTarihi || row.dueDate ? new Date(String(row.sonOdemeTarihi || row.dueDate).slice(0, 10)) : null,
        isActive: row.aktif !== false && row.isActive !== false,
        note: normalizeText(row.not || row.note) || null,
        legacyId: legacyId || null,
        raw: row,
      };
      if (exists) await prisma.creditCard.update({ where: { id: exists.id }, data });
      else await prisma.creditCard.create({ data });
      imported += 1;
    }
  }
  return { imported, skipped };
});
