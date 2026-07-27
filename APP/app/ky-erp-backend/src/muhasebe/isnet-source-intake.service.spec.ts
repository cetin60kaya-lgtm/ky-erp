import assert from "node:assert/strict";
import test from "node:test";
import { IsnetSourceIntakeService } from "./isnet-source-intake.service";

function memoryService() {
  const stores = new Map<string, any[]>();
  const prisma = {
    jsonStore: {
      findUnique: async ({ where }: any) => {
        const key = where.scope_mainCompanySlug_fileName.mainCompanySlug;
        return stores.has(key) ? { data: stores.get(key) } : null;
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.scope_mainCompanySlug_fileName.mainCompanySlug;
        stores.set(key, update?.data || create?.data || []);
        return { data: stores.get(key) };
      },
    },
    company: {
      findFirst: async ({ where }: any) =>
        where.id === "company-1"
          ? {
              id: "company-1",
              name: "Taha Giyim",
              companyType: "CUSTOMER",
              type: "MUSTERI",
              raw: {},
            }
          : null,
    },
    companyAlias: {
      findFirst: async () => null,
    },
  };
  return new IsnetSourceIntakeService(prisma as any);
}

test("giden irsaliye taslağı gerçekleşen adedi portal doğrulamasından önce artırmaz", async () => {
  const service = memoryService();
  const intake = await service.create("mecit-hakan", {
    sourceType: "NO_CUSTOMER_DISPATCH",
    companyId: "company-1",
    companyName: "Taha Giyim",
    modelId: "model-1",
    modelName: "Magic",
    issueDate: "2026-07-26",
    quantity: 100,
  });

  const prepared = await service.prepareOutgoingDispatch(
    "mecit-hakan",
    intake.id,
    { quantity: 40 },
  );
  assert.equal(prepared.intake.outgoingDispatchQuantity, 0);
  assert.equal(prepared.capacity.outgoingDispatchQuantity, 40);
  assert.equal(prepared.capacity.outgoingRemaining, 60);

  await assert.rejects(
    () =>
      service.completeOutgoingDispatch(
        "mecit-hakan",
        intake.id,
        prepared.draft.id,
        { confirmed: false, documentNo: "HKN2026001" },
      ),
    /Portal belgesi doğrulanmadan/,
  );

  const completed = await service.completeOutgoingDispatch(
    "mecit-hakan",
    intake.id,
    prepared.draft.id,
    { confirmed: true, documentNo: "HKN2026001" },
  );
  assert.equal(completed.intake.outgoingDispatchQuantity, 40);
  assert.equal(completed.capacity.outgoingRemaining, 60);

  const repeated = await service.completeOutgoingDispatch(
    "mecit-hakan",
    intake.id,
    prepared.draft.id,
    { confirmed: true, documentNo: "HKN2026001" },
  );
  assert.equal(repeated.intake.outgoingDispatchQuantity, 40);
});
