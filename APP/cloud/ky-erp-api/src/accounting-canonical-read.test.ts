import test from "node:test";
import assert from "node:assert/strict";
import { accountingReadDedupeKey, mergeCanonicalLegacyAccounting, listCanonicalAccountingDocuments, canonicalAccountingDocumentDetail } from "./accounting-canonical-read.ts";

test("canonical belge legacy kopyanın önüne geçer", () => {
  const canonical = [{
    id: "canonical-1",
    sourceSystem: "CANONICAL",
    documentKind: "CUSTOMER_INVOICE",
    documentNo: "FTR-001",
    companyId: "firm-1",
    issueDate: "2026-09-06",
    grandTotal: 1180,
  }];
  const legacy = [{
    id: "legacy-1",
    documentKind: "CUSTOMER_INVOICE",
    documentNo: "FTR-001",
    companyId: "firm-1",
    issueDate: "2026-09-06",
    grandTotal: 1180,
  }];
  const merged = mergeCanonicalLegacyAccounting(canonical, legacy);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "canonical-1");
});

test("canonical karşılığı olmayan tarihsel legacy belge korunur", () => {
  const canonical = [{
    id: "canonical-1",
    documentKind: "SUPPLIER_INVOICE",
    documentNo: "ALI-NEW",
    companyId: "firm-1",
    issueDate: "2026-09-06",
  }];
  const legacy = [{
    id: "legacy-old",
    documentKind: "SUPPLIER_INVOICE",
    documentNo: "ALI-OLD",
    companyId: "firm-1",
    issueDate: "2026-07-01",
  }];
  const merged = mergeCanonicalLegacyAccounting(canonical, legacy);
  assert.deepEqual(merged.map((row) => row.id), ["canonical-1", "legacy-old"]);
});

test("dedupe anahtarı belge türü firma ve tarihi birlikte kullanır", () => {
  const key = accountingReadDedupeKey({
    documentKind: "SUPPLIER_INVOICE",
    documentNo: " ABC-001 ",
    companyId: "firm-1",
    issueDate: "2026-09-06T11:00:00Z",
  });
  assert.equal(key, "SUPPLIER_INVOICE|ABC 001|firm-1|2026-09-06");
});

function mockReadContext(options: { list?: any; first?: any; fail?: string } = {}) {
  return { env: { DB: { prepare(sql: string) {
    return { bind(..._params: unknown[]) { return this; },
      async first() {
        if (options.fail === "first") throw new Error("synthetic D1 error");
        return options.first ?? null;
      },
      async all() {
        if (options.fail === "all" || (options.fail === "files" && sql.includes("file_hub_relations")))
          throw new Error("synthetic D1 error");
        return options.list ?? {success: true, results: []};
      }
    };
  } } } } as any;
}
test("canonical list distinguishes empty from D1 failure", async () => {
  assert.deepEqual(await listCanonicalAccountingDocuments(mockReadContext(), "firm-a"), []);
  await assert.rejects(listCanonicalAccountingDocuments(mockReadContext({fail:"all"}), "firm-a"), /synthetic D1 error/);
  await assert.rejects(listCanonicalAccountingDocuments(mockReadContext({list:{success:false,results:[]}}), "firm-a"), /doğrulanamadı/);
});
test("canonical list rejects incomplete result beyond safety limit", async () => {
  await assert.rejects(listCanonicalAccountingDocuments(mockReadContext({list:{success:true,results:Array(20001).fill({})}}), "firm-a"), /sınırı aşıldı/);
});
test("canonical detail only falls back when absent, not on failed reads", async () => {
  assert.equal(await canonicalAccountingDocumentDetail(mockReadContext(), "firm-a", "doc"), null);
  await assert.rejects(canonicalAccountingDocumentDetail(mockReadContext({fail:"first"}), "firm-a", "doc"), /synthetic D1 error/);
  await assert.rejects(canonicalAccountingDocumentDetail(mockReadContext({first:{id:"doc"},fail:"files"}), "firm-a", "doc"), /synthetic D1 error/);
});
