import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";
import { IsnetFullSyncService } from "./isnet-full-sync.service";

function smartMatchMock() {
  return {
    synchronizeSupplierRouting: async () => ({
      ok: true,
      documents: 0,
      lines: 0,
      stockMovementsCreated: 0,
      lotsCreated: 0,
      lotsLinked: 0,
      pendingProduct: 0,
      pendingLot: 0,
    }),
  };
}

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
    smartMatchMock() as any,
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
  assert.equal(result.supplierRouting.ok, true);
  assert.equal(saved.length, 1);
});

test("İşNet tedarikçi faturası e-Belge havuzuna alınır ama otomatik muhasebeleştirilmez", async () => {
  const uploadCalls: any[] = [];
  const operations = {
    sync: async () => ({
      automation: {
        downloaded: 1,
        processed: 1,
        markedRead: 1,
        newDocuments: 1,
        remaining: 0,
        errors: [],
      },
    }),
  };
  const prisma = {
    isnetDocumentState: {
      findMany: async () => [
        {
          documentNo: "FAT-TEST-1",
          partnerName: "TEST TEDARIKCI",
          xmlPath: path.join(process.cwd(), "package.json"),
          pdfPath: "",
        },
      ],
    },
    document: { findFirst: async () => null },
    currentAccountMovement: { findFirst: async () => null },
    vatRecord: { findFirst: async () => null },
    setting: { upsert: async () => ({}) },
  };
  const service = new IsnetFullSyncService(
    prisma as any,
    operations as any,
    {
      upload: async (_files: any[], body: any) => {
        uploadCalls.push(body);
        return { items: [{ id: "intake-1" }], skipped: [], errors: [] };
      },
    } as any,
    smartMatchMock() as any,
  );

  const result = await service.run({ mainCompanySlug: "mecit-hakan" });

  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].autoApprove, false);
  assert.equal(uploadCalls[0].sourceProvider, "ISNET");
  assert.equal(result.supplierAccounting.stagedForReview, 1);
  assert.equal(result.supplierAccounting.imported, 0);
  assert.equal(result.supplierAccounting.approvalMode, "MANUAL_REVIEW_REQUIRED");
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
    smartMatchMock() as any,
  );

  await assert.rejects(
    () => service.run({ mainCompanySlug: "mecit-hakan" }),
    /ilerleyemedi/,
  );
});
