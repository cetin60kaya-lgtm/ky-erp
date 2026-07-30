import assert from "node:assert/strict";
import { test } from "node:test";
import { CheckCenterService } from "./check-center.service";

function fakePrisma() {
  const stored: any[] = [];
  return {
    stored,
    firm: {
      findFirst: async ({ where }: any) =>
        where.id === "firm-1"
          ? {
              id: "firm-1",
              name: "TAHA GİYİM",
              mainCompanySlug: "mecit-hakan",
            }
          : null,
      findMany: async () => [{ id: "firm-1", name: "TAHA GİYİM" }],
    },
    paymentRecord: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        const row = {
          id: "check-1",
          ...data,
          relatedDocumentId: null,
          frontImagePath: null,
          backImagePath: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        stored.push(row);
        return row;
      },
      findMany: async () => stored,
      findUnique: async ({ where }: any) =>
        stored.find((row) => row.id === where.id) || null,
      update: async ({ where, data }: any) => {
        const row = stored.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
  };
}

test("çek kaydı firma, tarih, hesap ve çek türü metadata'sını korur", async () => {
  const prisma = fakePrisma();
  const service = new CheckCenterService(prisma as any);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const result: any = await service.create({
    mainCompanySlug: "mecit-hakan",
    firmId: "firm-1",
    issueDate: "2026-07-30",
    dueDate: tomorrow,
    bankName: "HALK",
    accountNo: "45",
    checkNo: "1667001",
    amount: "700.000,00",
    checkOwnership: "OWN_CHECK",
    checkDirection: "GIVEN",
    workType: "OFFICIAL",
    note: "Uras Kimya ödemesi",
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.issueDate, "2026-07-30");
  assert.equal(result.data.accountNo, "45");
  assert.equal(result.data.checkOwnership, "OWN_CHECK");
  assert.equal(result.data.checkDirection, "GIVEN");
  assert.equal(Number(result.data.amount), 700000);
});

test("çek özeti açık toplamı ve firma adını tek merkezde döndürür", async () => {
  const prisma = fakePrisma();
  const service = new CheckCenterService(prisma as any);
  const dueDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  await service.create({
    mainCompanySlug: "mecit-hakan",
    firmId: "firm-1",
    dueDate,
    bankName: "AKBANK",
    accountNo: "1841",
    checkNo: "Z1035931",
    amount: 100000,
    checkOwnership: "CUSTOMER_CHECK",
    checkDirection: "RECEIVED",
  });

  const result: any = await service.overview({
    mainCompanySlug: "mecit-hakan",
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.summary.openTotal, 100000);
  assert.equal(result.data.summary.openCount, 1);
  assert.equal(result.data.rows[0].firmaAdi, "TAHA GİYİM");
  assert.equal(result.data.rows[0].checkOwnership, "CUSTOMER_CHECK");
  assert.equal(result.data.months.length, 1);
});
