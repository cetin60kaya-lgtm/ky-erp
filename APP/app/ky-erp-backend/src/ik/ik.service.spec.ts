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
