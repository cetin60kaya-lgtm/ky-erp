import assert from "node:assert/strict";
import test from "node:test";
import {
  movementDirection,
  normalizeBoyahaneMovementReason,
} from "./boyahane-lot-movement-v2.ts";

test("production, sample, fire and supplier return are stock outputs", () => {
  for (const input of ["PRODUCTION", "SAMPLE", "FIRE", "RETURN", "OUT", "ADJUSTMENT_OUT", "CORRECTION_OUT"]) {
    const reason = normalizeBoyahaneMovementReason(input);
    assert.ok(reason);
    assert.equal(movementDirection(reason!), "OUT");
  }
});

test("inbound adjustments and corrections increase stock", () => {
  for (const input of ["IN", "ADJUSTMENT_IN", "CORRECTION_IN"]) {
    const reason = normalizeBoyahaneMovementReason(input);
    assert.ok(reason);
    assert.equal(movementDirection(reason!), "IN");
  }
});

test("Turkish aliases normalize correctly", () => {
  assert.equal(normalizeBoyahaneMovementReason("ÜRETİM"), "PRODUCTION");
  assert.equal(normalizeBoyahaneMovementReason("NUMUNE"), "SAMPLE");
  assert.equal(normalizeBoyahaneMovementReason("FİRE"), "FIRE");
  assert.equal(normalizeBoyahaneMovementReason("İADE"), "RETURN");
});

test("unknown movement reason is rejected", () => {
  assert.equal(normalizeBoyahaneMovementReason("SIL"), null);
});
