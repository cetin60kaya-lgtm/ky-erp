import assert from "node:assert/strict";
import test from "node:test";
import { IsnetSourceWorkflowService } from "./isnet-source-workflow.service";

function baseIntake(overrides: Record<string, any> = {}) {
  return {
    id: "source-1",
    companyId: "company-1",
    companyName: "Taha Giyim",
    companyRole: "CUSTOMER",
    modelId: "model-1",
    modelName: "Magic",
    orderNo: "ORD-1",
    note: "Ön baskı",
    issueDate: "2026-07-28",
    capacity: { outgoingRemaining: 100 },
    outgoingDispatchDrafts: [],
    ...overrides,
  };
}

test("portal taslak numarası doğrulanmadan kaynak adedini tamamlanmış saymaz", async () => {
  const sequence: string[] = [];
  const sourceIntakes = {
    detail: async () => baseIntake(),
    prepareOutgoingDispatch: async () => {
      sequence.push("local-draft");
      return { draft: { id: "local-draft-1" } };
    },
    completeOutgoingDispatch: async () => {
      sequence.push("complete");
      return {
        intake: { outgoingDispatchQuantity: 40 },
        capacity: { outgoingRemaining: 60 },
      };
    },
  };
  const operations = {
    recipientSearch: async () => ({ rows: [{ id: "recipient-1", name: "Taha Giyim" }] }),
    createManualDispatchDraft: async (body: any) => {
      sequence.push("portal-draft");
      assert.equal(body.externalId, "KYERP-SOURCE-source-1-local-draft-1");
      return { ok: true, draftNo: "HKN2026001" };
    },
  };
  const service = new IsnetSourceWorkflowService(
    sourceIntakes as any,
    operations as any,
    {} as any,
    {} as any,
  );

  const result = await service.createOutgoingDraft("source-1", {
    mainCompanySlug: "mecit-hakan",
    quantity: 40,
  });

  assert.deepEqual(sequence, ["local-draft", "portal-draft", "complete"]);
  assert.equal(result.portalDraft.draftNo, "HKN2026001");
  assert.equal(result.capacity.outgoingRemaining, 60);
});

test("belirsiz eski portal isteğinde otomatik ikinci taslak oluşturmaz", async () => {
  let portalCalled = false;
  const sourceIntakes = {
    detail: async () =>
      baseIntake({
        outgoingDispatchDrafts: [
          { id: "pending-1", status: "DRAFT", quantity: 40 },
        ],
      }),
  };
  const operations = {
    recipientSearch: async () => ({ rows: [] }),
    createManualDispatchDraft: async () => {
      portalCalled = true;
      return {};
    },
  };
  const service = new IsnetSourceWorkflowService(
    sourceIntakes as any,
    operations as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      service.createOutgoingDraft("source-1", {
        mainCompanySlug: "mecit-hakan",
        quantity: 40,
      }),
    /otomatik ikinci istek engellendi/,
  );
  assert.equal(portalCalled, false);
});
