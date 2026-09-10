import assert from "node:assert/strict";
import test from "node:test";
import {
  requiredLotCoverageComplete,
  resolveAllocatedLotEvidence,
} from "./accounting-lot-allocation.ts";

test("100 KG invoice can be allocated to dispatch LOT-A 60 + LOT-B 40", () => {
  const result = resolveAllocatedLotEvidence({
    policy: "REQUIRED",
    invoicedQuantity: 100,
    allocations: [
      { dispatchId: "d1", dispatchLineId: "d1-1", quantity: 60, lotNo: "LOT-A" },
      { dispatchId: "d2", dispatchLineId: "d2-1", quantity: 40, lotNo: "LOT-B" },
    ],
  });
  assert.equal(result.status, "FROM_DISPATCH_MULTI");
  assert.equal(result.multiLot, true);
  assert.equal(result.completePhysicalAllocation, true);
  assert.equal(result.canPostStock, true);
  assert.equal(result.lotAllocations.length, 2);
});

test("single invoice lot conflicts with two different dispatch lots", () => {
  const result = resolveAllocatedLotEvidence({
    policy: "REQUIRED",
    invoiceLotNo: "LOT-A",
    invoicedQuantity: 100,
    allocations: [
      { dispatchId: "d1", dispatchLineId: "d1-1", quantity: 60, lotNo: "LOT-A" },
      { dispatchId: "d2", dispatchLineId: "d2-1", quantity: 40, lotNo: "LOT-B" },
    ],
  });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.canPostStock, false);
  assert.equal(result.requiresReview, true);
});

test("required multi allocation blocks when one allocated segment has no lot", () => {
  const result = resolveAllocatedLotEvidence({
    policy: "REQUIRED",
    invoicedQuantity: 100,
    allocations: [
      { dispatchId: "d1", dispatchLineId: "d1-1", quantity: 60, lotNo: "LOT-A" },
      { dispatchId: "d2", dispatchLineId: "d2-1", quantity: 40, lotNo: "" },
    ],
  });
  assert.equal(result.status, "MISSING_REQUIRED");
  assert.equal(result.canPostStock, false);
});

test("required lot coverage accepts allocation sum when no single lot exists", () => {
  assert.equal(
    requiredLotCoverageComplete({
      policy: "REQUIRED",
      quantity: 100,
      lotAllocations: [
        { quantity: 60, lotNo: "A" },
        { quantity: 40, lotNo: "B" },
      ],
    }),
    true,
  );
  assert.equal(
    requiredLotCoverageComplete({
      policy: "REQUIRED",
      quantity: 100,
      lotAllocations: [{ quantity: 60, lotNo: "A" }],
    }),
    false,
  );
});
