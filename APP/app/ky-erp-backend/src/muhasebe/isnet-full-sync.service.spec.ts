import assert from "node:assert/strict";
import test from "node:test";
import { IsnetFullSyncService } from "./isnet-full-sync.service";

test("tam senkronizasyon kalan belge sıfır olana kadar bütün partileri işler", async () => {
  const calls: any[] = [];
  const operations = {
    sync: async (body: any) => {
      calls.push(body);
      return calls.length === 1
        ? {
            automation: {
              downloaded: 50,
              processed: 30,
              markedRead: 20,
              newDocuments: 50,
              remaining: 2,
              errors: [],
            },
          }
        : {
            automation: {
              downloaded: 2,
              processed: 2,
              markedRead: 2,
              newDocuments: 52,
              remaining: 0,
              errors: [],
            },
          };
    },
  };
  const saved: any[] = [];
  const prisma = {
    isnetDocumentState: { findMany: async () => [] },
    setting: {
      upsert: async (input: any) => {
        saved.push(input);
        return input;
      },
    },
  };
  const service = new IsnetFullSyncService(
    prisma as any,
    operations as any,
    { upload: async () => ({}) } as any,
  );

  const result = await service.run({
    mainCompanySlug: "mecit-hakan",
    startDate: "2026-07-01",
    endDate: "2026-07-28",
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].batchSize, 50);
  assert.equal(result.automation.downloaded, 52);
  assert.equal(result.automation.remaining, 0);
  assert.equal(result.fullSync, true);
  assert.equal(saved.length, 1);
});

test("senkronizasyon ilerlemiyorsa sonsuz döngü yerine güvenli hata verir", async () => {
  const operations = {
    sync: async () => ({
      automation: {
        downloaded: 0,
        processed: 0,
        markedRead: 0,
        remaining: 3,
        errors: [{ documentNo: "ABC", message: "PDF indirilemedi" }],
      },
    }),
  };
  const prisma = {
    isnetDocumentState: { findMany: async () => [] },
    setting: { upsert: async () => ({}) },
  };
  const service = new IsnetFullSyncService(
    prisma as any,
    operations as any,
    { upload: async () => ({}) } as any,
  );

  await assert.rejects(
    () => service.run({ mainCompanySlug: "mecit-hakan" }),
    /ilerleyemedi/,
  );
});
