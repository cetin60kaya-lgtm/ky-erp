import assert from "node:assert/strict";
import test from "node:test";
import {
  physicalReceiptKey,
  reconcileLotEvidence,
  resolveProductLotPolicy,
  samePhysicalReceipt,
} from "./accounting-lot-reconciliation-core.ts";

test("product lot policy is product-level, not supplier-level", () => {
  assert.equal(resolveProductLotPolicy({ lotPolicy: "REQUIRED" }, "EXPENSE"), "REQUIRED");
  assert.equal(resolveProductLotPolicy({ lotPolicy: "NONE" }, "BOYAHANE"), "NONE");
  assert.equal(resolveProductLotPolicy({}, "BOYAHANE"), "REQUIRED");
  assert.equal(resolveProductLotPolicy({}, "STOCK"), "OPTIONAL");
  assert.equal(resolveProductLotPolicy({}, "EXPENSE"), "NONE");
});

test("dispatch lot wins when invoice has no lot", () => {
  const result = reconcileLotEvidence({
    policy: "REQUIRED",
    dispatchLotNo: "LOT-A",
    invoiceLotNo: "",
  });
  assert.equal(result.status, "FROM_DISPATCH");
  assert.equal(result.resolvedLotNo, "LOT-A");
  assert.equal(result.canPostStock, true);
});

test("invoice lot is accepted when dispatch has no lot", () => {
  const result = reconcileLotEvidence({
    policy: "REQUIRED",
    dispatchLotNo: "",
    invoiceLotNo: "LOT-B",
  });
  assert.equal(result.status, "FROM_INVOICE");
  assert.equal(result.resolvedLotNo, "LOT-B");
  assert.equal(result.canPostStock, true);
});

test("same invoice and dispatch lot is verified", () => {
  const result = reconcileLotEvidence({
    policy: "REQUIRED",
    dispatchLotNo: " ab-123 ",
    invoiceLotNo: "AB-123",
  });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.requiresReview, false);
});

test("different invoice and dispatch lots block stock posting", () => {
  const result = reconcileLotEvidence({
    policy: "REQUIRED",
    dispatchLotNo: "LOT-A",
    invoiceLotNo: "LOT-B",
  });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.canPostStock, false);
  assert.equal(result.requiresReview, true);
});

test("required product without lot waits; optional/none can continue", () => {
  assert.equal(
    reconcileLotEvidence({ policy: "REQUIRED" }).status,
    "MISSING_REQUIRED",
  );
  assert.equal(
    reconcileLotEvidence({ policy: "OPTIONAL" }).status,
    "NO_LOT",
  );
  assert.equal(
    reconcileLotEvidence({ policy: "NONE" }).status,
    "NO_LOT",
  );
});

test("physical receipt key prefers dispatch line and is stable", () => {
  const key = physicalReceiptKey({
    tenant: "mecit-hakan",
    supplierId: "supplier-1",
    productId: "product-1",
    dispatchLineId: "d-line-1",
    invoiceLineId: "i-line-1",
    lotNo: " lot-77 ",
    quantity: 60,
    unit: "kg",
  });
  assert.match(key, /D:d-line-1/);
  assert.doesNotMatch(key, /I:i-line-1/);
});

test("same physical receipt is detected before duplicate stock insert", () => {
  assert.equal(
    samePhysicalReceipt(
      { dispatchLineId: "d1", productId: "p1", lotNo: "L1", quantity: 60, unit: "KG" },
      { dispatchLineId: "d1", productId: "p1", lotNo: "DIFFERENT", quantity: 60, unit: "KG" },
    ),
    true,
  );

  assert.equal(
    samePhysicalReceipt(
      { productId: "p1", companyId: "s1", lotNo: "L1", quantity: 60, unit: "KG" },
      { productId: "p1", companyId: "s1", lotNo: "L1", entryKg: 60, unit: "kg" },
    ),
    true,
  );
});
