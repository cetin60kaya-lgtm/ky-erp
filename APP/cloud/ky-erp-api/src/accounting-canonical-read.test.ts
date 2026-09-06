import test from "node:test";
import assert from "node:assert/strict";
import { accountingReadDedupeKey, mergeCanonicalLegacyAccounting } from "./accounting-canonical-read.ts";

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
