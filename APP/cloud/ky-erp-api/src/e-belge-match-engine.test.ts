import assert from "node:assert/strict";
import test from "node:test";
import { compareEBelgeProducts, reconcileEBelgeInvoice } from "./e-belge-match-engine";

const line = (id: string, description: string, quantity: number, productId = "", unitCode = "ADET") => ({
  id,
  description,
  quantity,
  productId,
  unitCode,
});

const doc = (overrides: Record<string, any> = {}) => ({
  id: overrides.id || crypto.randomUUID(),
  documentNo: overrides.documentNo || "",
  partyCompanyId: overrides.partyCompanyId || "firm-a",
  partyTaxNo: overrides.partyTaxNo || "1111111111",
  direction: overrides.direction || "INCOMING",
  issueDate: overrides.issueDate || "2026-09-01",
  lines: overrides.lines || [],
});

test("farklı firma kartları vergi numarası benzer olsa bile eşleşmez", () => {
  const invoice = doc({ id: "inv", partyCompanyId: "firm-a", lines: [line("i1", "ÜRÜN A", 10)] });
  const dispatch = doc({ id: "d1", documentNo: "IRS-1", partyCompanyId: "firm-b", partyTaxNo: "1111111111", lines: [line("d1l", "ÜRÜN A", 10)] });
  const result = reconcileEBelgeInvoice(invoice, [dispatch]);
  assert.equal(result.status, "UNMATCHED");
  assert.equal(result.linkedDispatches.length, 0);
});

test("giden belgelerde farklı müşteriler birbirine karışmaz", () => {
  const invoice = doc({ id: "inv", direction: "OUTGOING", partyCompanyId: "customer-a", partyTaxNo: "2222222222", lines: [line("i1", "MODEL 34 ÖN", 100)] });
  const wrong = doc({ id: "wrong", direction: "OUTGOING", partyCompanyId: "customer-b", partyTaxNo: "3333333333", lines: [line("w1", "MODEL 34 ÖN", 100)] });
  const right = doc({ id: "right", documentNo: "IRS-22", direction: "OUTGOING", partyCompanyId: "customer-a", partyTaxNo: "2222222222", lines: [line("r1", "MODEL 34 ÖN", 100)] });
  const result = reconcileEBelgeInvoice(invoice, [wrong, right]);
  assert.equal(result.status, "MATCHED");
  assert.deepEqual(result.linkedDispatches.map((row) => row.id), ["right"]);
});

test("tek fatura birden fazla irsaliyedeki miktarı güvenli dağıtır", () => {
  const invoice = doc({ id: "inv", lines: [line("i1", "MODEL X", 120, "p1")] });
  const d1 = doc({ id: "d1", documentNo: "IRS-1", lines: [line("l1", "MODEL X", 70, "p1")] });
  const d2 = doc({ id: "d2", documentNo: "IRS-2", lines: [line("l2", "MODEL X", 50, "p1")] });
  const result = reconcileEBelgeInvoice(invoice, [d1, d2], ["IRS-1", "IRS-2"]);
  assert.equal(result.status, "MATCHED");
  assert.equal(result.lines[0].dispatchedQuantity, 120);
  assert.equal(result.linkedDispatches.length, 2);
});

test("fatura miktarı irsaliyeyi aşarsa kontrol durumu üretir", () => {
  const invoice = doc({ id: "inv", lines: [line("i1", "MODEL X", 120, "p1")] });
  const dispatch = doc({ id: "d1", documentNo: "IRS-1", lines: [line("l1", "MODEL X", 100, "p1")] });
  const result = reconcileEBelgeInvoice(invoice, [dispatch], ["IRS-1"]);
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.lines[0].status, "OVER_INVOICED");
  assert.equal(result.lines[0].difference, 20);
});

test("aynı ürün kodu en güçlü kimliklerden biridir", () => {
  const result = compareEBelgeProducts(
    { productCode: "ABC-123", description: "Başka açıklama" },
    { productCode: "ABC-123", description: "Farklı açıklama" },
  );
  assert.equal(result.score, 98);
  assert.equal(result.source, "PRODUCT_CODE");
});

test("farklı yönlü belgeler aynı firma olsa bile eşleşmez", () => {
  const invoice = doc({ id: "inv", direction: "INCOMING", lines: [line("i1", "ÜRÜN A", 10)] });
  const dispatch = doc({ id: "d1", direction: "OUTGOING", lines: [line("d1l", "ÜRÜN A", 10)] });
  const result = reconcileEBelgeInvoice(invoice, [dispatch]);
  assert.equal(result.status, "UNMATCHED");
});
