import assert from "node:assert/strict";
import test from "node:test";
import { IsnetAutoFlowService } from "./isnet-auto-flow.service";

function fixture(options: { draftNo?: string } = {}) {
  let storedRows: any[] = [];
  let createDraftCount = 0;
  let sentState: any = null;
  let sentStates: any[] = [];
  let sentIntakes: any[] = [];
  const draftNo = Object.prototype.hasOwnProperty.call(options, "draftNo")
    ? String(options.draftNo || "")
    : "HKNIRS2026001";

  const prisma = {
    setting: {
      findUnique: async () =>
        storedRows.length ? { value: { rows: storedRows } } : null,
      upsert: async ({ update, create }: any) => {
        const value = update?.value || create?.value || {};
        storedRows = Array.isArray(value.rows) ? value.rows : [];
        return { value };
      },
    },
    isnetDocumentState: {
      findFirst: async () => sentState,
      findMany: async () => sentStates,
    },
    documentIntake: {
      findMany: async () => sentIntakes,
    },
  };

  const operations = {
    importIncomingDispatch: async () => ({
      intake: {
        id: "intake-1",
        documentNo: "TIA2026001",
        dispatchNo: "TIA2026001",
        issuerName: "TAHA GİYİM",
        issueDate: "2026-07-28",
        modelId: "model-1",
        modelGuess: "MAGIC",
        lines: [{ quantity: 100 }],
      },
    }),
    incomingDispatchDraft: async () => ({
      sourceId: "101",
      incomingDispatchNo: "TIA2026001",
      recipient: { id: "recipient-1" },
      recipientName: "TAHA GİYİM",
      modelId: "model-1",
      modelName: "MAGIC",
      issueDate: "2026-07-28",
      lines: [{ productName: "MAGIC", quantity: 100, unitPrice: 0, vatRate: 20 }],
    }),
    createDispatchDraftFromIncoming: async () => {
      createDraftCount += 1;
      return { ok: true, draftNo };
    },
    outgoingDispatchInvoiceDraft: async (sourceId: string) => ({
      sourceId,
      dispatchNo: "HKNIRS2026001",
      recipient: { id: "recipient-1" },
      recipientName: "TAHA GİYİM",
      modelId: "model-1",
      modelName: "MAGIC",
      lines: [{ productName: "MAGIC", quantity: 100, unitPrice: 0, vatRate: 20 }],
    }),
  };

  const fullSync = { run: async () => ({ ok: true }) };
  const service = new IsnetAutoFlowService(
    prisma as any,
    operations as any,
    fullSync as any,
  );

  return {
    service,
    createDraftCount: () => createDraftCount,
    setSentState(value: any) {
      sentState = value;
    },
    setSentCandidates(states: any[], intakes: any[]) {
      sentStates = states;
      sentIntakes = intakes;
    },
  };
}

test("aynı gelen irsaliye için ikinci giden taslak oluşturulmaz", async () => {
  const context = fixture();
  const first: any = await context.service.prepareIncoming("101", {
    mainCompanySlug: "mecit-hakan",
  });
  const repeated: any = await context.service.prepareIncoming("101", {
    mainCompanySlug: "mecit-hakan",
  });

  assert.equal(first.flow.outgoingDraftNo, "HKNIRS2026001");
  assert.equal(repeated.duplicatePrevented, true);
  assert.equal(repeated.flow.id, first.flow.id);
  assert.equal(context.createDraftCount(), 1);
});

test("gönderilmiş irsaliye bulunduğunda akış yalnız fiyat adımına geçer", async () => {
  const context = fixture();
  const first: any = await context.service.prepareIncoming("101", {
    mainCompanySlug: "mecit-hakan",
  });
  context.setSentState({
    sourceId: "202",
    documentNo: "HKNIRS2026001",
    completed: true,
  });

  const result: any = await context.service.refreshAfterDispatch(first.flow.id, {
    mainCompanySlug: "mecit-hakan",
    startDate: "2026-07-28",
    endDate: "2026-07-28",
  });

  assert.equal(result.ready, true);
  assert.equal(result.flow.status, "PRICE_REQUIRED");
  assert.equal(result.sourceId, "202");
  assert.equal(result.invoiceDraft.lines[0].quantity, 100);
  assert.equal(context.createDraftCount(), 1);
});

test("portal taslak numarası dönmese bile tek güvenli gönderilmiş irsaliye otomatik bulunur", async () => {
  const context = fixture({ draftNo: "" });
  const first: any = await context.service.prepareIncoming("101", {
    mainCompanySlug: "mecit-hakan",
  });
  assert.equal(first.flow.outgoingDraftNo, "");

  context.setSentCandidates(
    [
      {
        sourceId: "303",
        documentNo: "HKNIRS2026002",
        partnerName: "TAHA GİYİM",
        modelName: "MAGIC",
        dateText: "2026-07-28",
        downloadedAt: new Date("2026-07-28T12:00:00Z"),
        completed: true,
      },
    ],
    [
      {
        documentNo: "HKNIRS2026002",
        dispatchNo: "HKNIRS2026002",
        issueDate: "2026-07-28",
        modelGuess: "MAGIC",
        lines: [{ quantity: 100 }],
      },
    ],
  );

  const result: any = await context.service.refreshAfterDispatch(first.flow.id, {
    mainCompanySlug: "mecit-hakan",
    startDate: "2026-07-28",
    endDate: "2026-07-28",
  });

  assert.equal(result.ready, true);
  assert.equal(result.sourceId, "303");
  assert.equal(result.documentNo, "HKNIRS2026002");
  assert.equal(result.flow.status, "PRICE_REQUIRED");
  assert.equal(context.createDraftCount(), 1);
});

test("fatura taslağı ve resmî sonuç aynı otomatik akışta devam eder", async () => {
  const context = fixture();
  const first: any = await context.service.prepareIncoming("101", {
    mainCompanySlug: "mecit-hakan",
  });

  const draftFlow: any = await context.service.updateInvoiceState(first.flow.id, {
    mainCompanySlug: "mecit-hakan",
    status: "INVOICE_DRAFT_READY",
    requestId: "request-1",
    draftNo: "HKN2026000000700",
    draftVersion: "version-1",
  });
  assert.equal(draftFlow.status, "INVOICE_DRAFT_READY");
  assert.equal(draftFlow.invoiceRequestId, "request-1");

  const completed: any = await context.service.updateInvoiceState(first.flow.id, {
    mainCompanySlug: "mecit-hakan",
    status: "COMPLETED",
    requestId: "request-1",
    officialInvoiceNo: "HKN2026000000700",
  });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.officialInvoiceNo, "HKN2026000000700");
  assert.equal(context.createDraftCount(), 1);
});
