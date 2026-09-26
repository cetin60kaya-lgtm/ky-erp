import assert from "node:assert/strict";
import test from "node:test";
import { IkService } from "./ik.service";

function monthlyAdjustmentService(employee: Record<string, any>) {
  const created: any[] = [];
  const prisma = {
    hrMonthlyEmployee: {
      findUnique: async () => employee,
    },
    officialHoliday: {
      upsert: async (payload: any) => payload,
      findMany: async () => [],
    },
    hrMonthlyAdjustment: {
      create: async ({ data }: any) => {
        const row = { id: `adjustment-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      },
    },
    $executeRawUnsafe: async () => 1,
  };
  return { service: new IkService(prisma as any), created };
}

function monthlyPayrollService(employees: Record<string, any>[], adjustments: any[] = []) {
  const prisma = {
    hrMonthlyEmployee: {
      findMany: async () => employees,
    },
    $queryRawUnsafe: async (query: string) =>
      query.includes("hr_monthly_adjustments_v2") ? adjustments : [],
  };
  return new IkService(prisma as any);
}

test("aylık mesaiyi 225 saat tabanı ve hafta içi çarpanı ile hesaplar", async () => {
  const { service, created } = monthlyAdjustmentService({
    id: "monthly-225",
    mainCompanyId: "mecit-hakan",
    fullName: "225 Saat Personel",
    salary: 45000,
    overtimeHourlyBase: 225,
  });

  const saved = await service.createAdjustment({
    mainCompanyId: "mecit-hakan",
    employeeId: "monthly-225",
    date: "2026-07-27",
    adjustmentType: "Mesai",
    hours: 2,
    amountManual: false,
  });

  assert.equal(saved.amount, 600);
  assert.equal(created[0].hourOrDay, 2);
  assert.equal(created[0].payrollEffect, "Bordroya ekle");
});

test("aylık mesaiyi 300 saat tabanı ve hafta sonu çarpanı ile hesaplar", async () => {
  const { service } = monthlyAdjustmentService({
    id: "monthly-300",
    mainCompanyId: "mecit-hakan",
    fullName: "300 Saat Personel",
    salary: 45000,
    overtimeHourlyBase: 300,
  });

  const saved = await service.createAdjustment({
    mainCompanyId: "mecit-hakan",
    employeeId: "monthly-300",
    date: "2026-07-26",
    adjustmentType: "Mesai",
    hours: 3,
    amountManual: false,
  });

  assert.equal(saved.amount, 900);
});

test("SGK durumuna göre banka ve elden bordro dağılımını zorunlu uygular", async () => {
  const service = monthlyPayrollService([
    {
      id: "sgk-var",
      mainCompanyId: "mecit-hakan",
      fullName: "SGK Var",
      salary: 40000,
      roadAllowance: 3000,
      sgkStatus: "VAR",
      bankPaymentType: "Banka + Elden",
      bankAmount: 28075.5,
    },
    {
      id: "sgk-yok",
      mainCompanyId: "mecit-hakan",
      fullName: "SGK Yok",
      salary: 35000,
      roadAllowance: 2000,
      sgkStatus: "YOK",
      bankPaymentType: "Banka + Elden",
      bankAmount: 28075.5,
    },
  ]);

  const rows = await service.calculatePayroll({
    mainCompanyId: "mecit-hakan",
    year: 2026,
    month: 7,
  });
  const sgkVar = rows.find((row: any) => row.employeeId === "sgk-var");
  const sgkYok = rows.find((row: any) => row.employeeId === "sgk-yok");

  assert.equal(sgkVar.totalAmount, 43000);
  assert.equal(sgkVar.bankAmount, 28075.5);
  assert.equal(sgkVar.cashAmount, 14924.5);
  assert.equal(sgkYok.totalAmount, 37000);
  assert.equal(sgkYok.bankAmount, 0);
  assert.equal(sgkYok.cashAmount, 37000);
});
