import test from "node:test";
import assert from "node:assert/strict";
import { resolveManualEBelgeDirection } from "./e-belge-direction.ts";

const owner = {
  names: ["Hakan Emprime", "Mecit Hakan", "Mecit Hakan Gürsu"],
  taxNos: ["11111111111"],
};

test("manual e-belge marks supplier-owned document as outgoing", () => {
  const result = resolveManualEBelgeDirection({
    requestedDirection: "AUTO",
    owner,
    supplier: { name: "MECİT HAKAN GÜRSU", taxNo: "11111111111" },
    customer: { name: "ÖRNEK MÜŞTERİ A.Ş.", taxNo: "2222222222" },
  });
  assert.equal(result.direction, "OUTGOING");
  assert.equal(result.counterpartyName, "ÖRNEK MÜŞTERİ A.Ş.");
});
test("manual e-belge marks customer-owned document as incoming", () => {
  const result = resolveManualEBelgeDirection({
    requestedDirection: "AUTO",
    owner,
    supplier: { name: "TEDARİKÇİ KİMYA LTD." },
    customer: { name: "Hakan Emprime" },
  });
  assert.equal(result.direction, "INCOMING");
  assert.equal(result.counterpartyName, "TEDARİKÇİ KİMYA LTD.");
});

test("single-company pool never leaves direction AUTO", () => {
  const result = resolveManualEBelgeDirection({
    requestedDirection: "AUTO",
    owner,
    supplier: { name: "A FİRMASI" },
  });
  assert.equal(result.direction, "INCOMING");
  assert.equal(result.resolved, true);
});

test("known outgoing prefix stays outgoing when OCR parties are incomplete", () => {
  const result = resolveManualEBelgeDirection({ requestedDirection: "AUTO", owner, documentNo: "HKN2026000123" });
  assert.equal(result.direction, "OUTGOING");
  assert.equal(result.basis, "DOCUMENT_PREFIX_OUTGOING");
});

test("explicit direction remains available for manual correction", () => {
  const result = resolveManualEBelgeDirection({ requestedDirection: "GIDEN", owner });
  assert.equal(result.direction, "OUTGOING");
  assert.equal(result.basis, "USER_EXPLICIT");
});
