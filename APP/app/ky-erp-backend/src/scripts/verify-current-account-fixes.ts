import assert from "node:assert/strict";
import { PrismaService } from "../prisma/prisma.service";
import { FirmaKartlariDbService } from "../muhasebe/firma-kartlari-db.service";

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new FirmaKartlariDbService(prisma);
  const slug = "verify-current-account-fixes";

  await prisma.activityLog.deleteMany({ where: { mainCompanySlug: slug } });
  await prisma.currentAccountMovement.deleteMany({ where: { mainCompanySlug: slug } });
  await prisma.muhasebeRaporManuelKalem.deleteMany({ where: { mainCompanySlug: slug } });
  await prisma.company.deleteMany({ where: { mainCompanySlug: slug } });
  await prisma.mainCompany.upsert({
    where: { slug },
    create: { slug, name: slug },
    update: {},
  });

  const supplier = await prisma.company.create({
    data: {
      mainCompanySlug: slug,
      name: "Test Tedarikçi",
      normalizedName: normalizeName("Test Tedarikçi"),
      type: "SATICI",
      defaultRecordType: "GAYRI",
      raw: {},
    },
  });
  const customer = await prisma.company.create({
    data: {
      mainCompanySlug: slug,
      name: "Test Müşteri",
      normalizedName: normalizeName("Test Müşteri"),
      type: "MUSTERI",
      defaultRecordType: "RESMI",
      raw: {},
    },
  });

  await service.createCurrentAccountMovement(slug, {
    companyId: supplier.id,
    islemTipi: "BORC",
    tutar: 12750,
    tarih: "2026-06-01",
    aciklama: "Tedarikçi borç",
  });
  await service.createCurrentAccountMovement(slug, {
    companyId: supplier.id,
    islemTipi: "ODEME",
    tutar: 12750,
    tarih: "2026-06-24",
    aciklama: "Tedarikçi ödeme",
  });
  const supplierSummary = await service.getCompanySummary(slug, supplier.id);
  assert.equal(number(supplierSummary.data.guncelBakiye), 0, "Tedarikçi ödeme bakiyeyi sıfırlamalı.");

  await service.createCurrentAccountMovement(slug, {
    companyId: customer.id,
    islemTipi: "BORC",
    tutar: 20000,
    tarih: "2026-06-01",
    aciklama: "Müşteri satış borcu",
  });
  await service.createCurrentAccountMovement(slug, {
    companyId: customer.id,
    islemTipi: "TAHSILAT",
    tutar: 5000,
    tarih: "2026-06-10",
    aciklama: "Müşteri tahsilat",
  });
  const customerSummary = await service.getCompanySummary(slug, customer.id);
  assert.equal(number(customerSummary.data.guncelBakiye), 15000, "Müşteri tahsilatı bakiyeyi azaltmalı.");

  const manualCreated = await service.saveManualReportItem(slug, {
    ad: "Manuel gider",
    islemTuru: "GIDER",
    tarih: "2026-06-05",
    firmaId: supplier.id,
    tutar: 1000,
    kdv: 200,
    raporaDahil: true,
    postToLedger: true,
    aciklama: "Tek cari hareket üret",
  });
  const manualId = manualCreated.data.id;
  await service.saveManualReportItem(slug, {
    id: manualId,
    ad: "Manuel gider",
    islemTuru: "GIDER",
    tarih: "2026-06-05",
    firmaId: supplier.id,
    tutar: 1000,
    kdv: 200,
    raporaDahil: true,
    postToLedger: true,
    aciklama: "Tek cari hareket güncelle",
  });
  const manualLedgerRows = await prisma.currentAccountMovement.findMany({
    where: { mainCompanySlug: slug, sourceType: "RAPOR_MANUEL_GIDER" },
  });
  const linkedManualRows = manualLedgerRows.filter(
    (row) => (row.raw as any)?.reportManualExpenseId === manualId,
  );
  assert.equal(linkedManualRows.length, 1, "Aynı manuel gider yalnız bir cari hareket üretmeli.");

  const supplierBeforeOverride = number((await service.getCompanySummary(slug, supplier.id)).data.guncelBakiye);
  await service.saveReportRecordOverride(slug, "MANUEL_GENEL_GIDER", manualId, {
    reportIncluded: false,
  });
  const supplierAfterOverride = number((await service.getCompanySummary(slug, supplier.id)).data.guncelBakiye);
  assert.equal(supplierAfterOverride, supplierBeforeOverride, "Rapor dahil/hariç değişimi cari bakiyeyi değiştirmemeli.");

  const noopAdjustCompany = await prisma.company.create({
    data: {
      mainCompanySlug: slug,
      name: "Noop Bakiye",
      normalizedName: normalizeName("Noop Bakiye"),
      type: "SATICI",
      defaultRecordType: "RESMI",
      raw: {},
    },
  });
  const adjustResult = await service.adjustBalance(slug, noopAdjustCompany.id, {
    targetBalance: 0,
    description: "Noop bakiye testi",
  });
  assert.equal(Boolean((adjustResult as any).skipped), true, "Eşit hedef bakiyede yeni hareket oluşmamalı.");
  const noopCount = await prisma.currentAccountMovement.count({
    where: { mainCompanySlug: slug, companyId: noopAdjustCompany.id },
  });
  assert.equal(noopCount, 0, "Noop bakiye düzeltmede hareket sayısı değişmemeli.");

  console.log("All checks passed:", {
    supplierBalance: number(supplierSummary.data.guncelBakiye),
    customerBalance: number(customerSummary.data.guncelBakiye),
    manualLedgerRows: linkedManualRows.length,
    supplierAfterOverride,
    noopCount,
  });

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});