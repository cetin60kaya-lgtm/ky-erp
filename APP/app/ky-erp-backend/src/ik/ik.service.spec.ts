import assert from "node:assert/strict";
import test from "node:test";
import { IkService } from "./ik.service";

function dailyService(options: {
  mainCompanyId?: string;
  dayWage?: number;
  nightWage?: number;
} = {}) {
  const upserts: any[] = [];
  const employee = {
    id: "employee-1",
    mainCompanyId: options.mainCompanyId || "mecit-hakan",
    fullName: "Test Personel",
    dayWage: options.dayWage ?? 1000,
    nightWage: options.nightWage ?? 1200,
  };
  const tx = {
    hrDailyEmployee: {
      findUnique: async () => employee,
    },
    hrDailyAttendance: {
      deleteMany: async () => ({ count: 0 }),
      upsert: async (payload: any) => {
        upserts.push(payload);
        return {
          id: "attendance-1",
          ...payload.create,
        };
      },
      count: async () => upserts.length,
    },
  };
  const prisma = {
    $transaction: async (callback: (transaction: any) => Promise<any>) =>
      callback(tx),
  };
  return {
    service: new IkService(prisma as any),
    upserts,
  };
}

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

test("günlük giriş geçersiz takvim tarihini reddeder", async () => {
  const { service } = dailyService();
  await assert.rejects(
    () =>
      service.saveDailyRange({
        mainCompanyId: "mecit-hakan",
        rows: [
          {
            employeeId: "employee-1",
            workDate: "2026-02-31",
            dayShift: true,
          },
        ],
      }),
    /geçerli bir çalışma tarihi/,
  );
});

test("seçili vardiyada ücret sıfırsa günlük kaydı reddeder", async () => {
  const { service } = dailyService({ dayWage: 0 });
  await assert.rejects(
    () =>
      service.saveDailyRange({
        mainCompanyId: "mecit-hakan",
        rows: [
          {
            employeeId: "employee-1",
            workDate: "2026-07-26",
            dayShift: true,
          },
        ],
      }),
    /gündüz ücreti girilmeden/,
  );
});

test("aynı personel ve günün tekrar satırlarını tek kayıtta birleştirir", async () => {
  const { service, upserts } = dailyService();
  const result = await service.saveDailyRange({
    mainCompanyId: "mecit-hakan",
    rows: [
      {
        employeeId: "employee-1",
        workDate: "2026-07-26",
        dayShift: true,
      },
      {
        employeeId: "employee-1",
        workDate: "2026-07-26",
        nightShift: true,
      },
    ],
  });

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].create.dayShift, true);
  assert.equal(upserts[0].create.nightShift, true);
  assert.equal(result.length, 1);
});

test("başka ana firmaya ait günlük personeli kaydetmez", async () => {
  const { service } = dailyService({ mainCompanyId: "diger-firma" });
  await assert.rejects(
    () =>
      service.saveDailyRange({
        mainCompanyId: "mecit-hakan",
        rows: [
          {
            employeeId: "employee-1",
            workDate: "2026-07-26",
            dayShift: true,
          },
        ],
      }),
    /aktif ana firmaya ait değil/,
  );
});

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
