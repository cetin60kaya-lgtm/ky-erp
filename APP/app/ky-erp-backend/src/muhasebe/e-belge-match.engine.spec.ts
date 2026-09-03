import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileEBelgeInvoice } from "./e-belge-match.engine";

const dispatch = (overrides: Record<string, any> = {}) => ({
  id: "dispatch-1",
  documentNo: "IRS202600124",
  dispatchNo: "IRS202600124",
  firmId: "firm-1",
  issuerTaxNo: "1111111111",
  issueDate: "2026-09-01",
  lines: [
    { id: "d1", productId: "white", rawName: "WHITE BASE", quantity: 200, unit: "KG" },
    { id: "d2", productId: "fix", rawName: "A25 FIXATOR", quantity: 25, unit: "KG" },
    { id: "d3", productId: "red", rawName: "RED KGC", quantity: 10, unit: "KG" },
  ],
  ...overrides,
});

const invoice = (overrides: Record<string, any> = {}) => ({
  id: "invoice-1",
  documentNo: "FAT202600455",
  invoiceNo: "FAT202600455",
  dispatchNo: "IRS202600124",
  firmId: "firm-1",
  issuerTaxNo: "1111111111",
  issueDate: "2026-09-03",
  lines: [
    { id: "i1", productId: "white", rawName: "WHITE BASE", quantity: 200, unit: "KG" },
    { id: "i2", productId: "fix", rawName: "FIXATOR A25", quantity: 25, unit: "KG" },
    { id: "i3", productId: "red", rawName: "RED KGC", quantity: 10, unit: "KG" },
  ],
  ...overrides,
});

test("fatura irsaliye referansi + urun + miktar tam ise MATCHED olur", () => {
  const result = reconcileEBelgeInvoice(invoice(), [dispatch()], ["IRS202600124"]);
  assert.equal(result.status, "MATCHED");
  assert.equal(result.exactQuantityLineCount, 3);
  assert.equal(result.unmatchedLineCount, 0);
  assert.equal(result.linkedDispatches[0]?.documentNo, "IRS202600124");
});

test("numara dogru olsa bile irsaliyede olmayan urun varsa MISMATCH olur", () => {
  const result = reconcileEBelgeInvoice(
    invoice({
      lines: [
        { id: "i1", productId: "white", rawName: "WHITE BASE", quantity: 200, unit: "KG" },
        { id: "i4", productId: "silicone", rawName: "SILICONE", quantity: 25, unit: "KG" },
      ],
    }),
    [dispatch()],
    ["IRS202600124"],
  );
  assert.equal(result.status, "MISMATCH");
  assert.equal(result.unmatchedLineCount, 1);
});

test("fatura miktari irsaliyeden fazlaysa PARTIAL olur ve farki verir", () => {
  const result = reconcileEBelgeInvoice(
    invoice({ lines: [{ id: "i1", productId: "white", rawName: "WHITE BASE", quantity: 220, unit: "KG" }] }),
    [dispatch({ lines: [{ id: "d1", productId: "white", rawName: "WHITE BASE", quantity: 200, unit: "KG" }] })],
    ["IRS202600124"],
  );
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.lines[0]?.difference, 20);
  assert.equal(result.lines[0]?.status, "OVER_INVOICED");
});

test("tek fatura iki irsaliyedeki ayni urun miktarini toplayabilir", () => {
  const result = reconcileEBelgeInvoice(
    invoice({ lines: [{ id: "i1", productId: "white", rawName: "WHITE BASE", quantity: 200, unit: "KG" }] }),
    [
      dispatch({ id: "dispatch-1", documentNo: "IRS001", dispatchNo: "IRS001", lines: [{ id: "d1", productId: "white", rawName: "WHITE BASE", quantity: 100, unit: "KG" }] }),
      dispatch({ id: "dispatch-2", documentNo: "IRS002", dispatchNo: "IRS002", lines: [{ id: "d2", productId: "white", rawName: "WHITE BASE", quantity: 100, unit: "KG" }] }),
    ],
    ["IRS001", "IRS002"],
  );
  assert.equal(result.status, "MATCHED");
  assert.equal(result.linkedDispatches.length, 2);
  assert.equal(result.lines[0]?.dispatchedQuantity, 200);
});

test("urun adi alias benzeri olsa bile firma ve miktar kontrolu korunur", () => {
  const result = reconcileEBelgeInvoice(
    invoice({ lines: [{ id: "i1", rawName: "A25 FIXATOR", quantity: 25, unit: "KG", productId: null }] }),
    [dispatch({ lines: [{ id: "d1", rawName: "FIXATOR A25", quantity: 25, unit: "KG", productId: null }] })],
    ["IRS202600124"],
  );
  assert.equal(result.matchedLineCount, 1);
  assert.equal(result.lines[0]?.dispatchedQuantity, 25);
});
