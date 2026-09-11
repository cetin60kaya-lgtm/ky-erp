import test from "node:test";
import assert from "node:assert/strict";
import {
  detectAccountingActionKind,
  detectAccountingPaymentMethod,
  detectAccountingRecordScope,
  parseAccountingAmount,
  parseAccountingDate,
} from "./accounting-ai-write.ts";

test("12 bin lira ödeme komutu güvenli muhasebe actionına ayrılır", () => {
  const message = "ABC Kimya'ya bugün 12 bin lira ödeme gir, iç kayıt, nakit";
  assert.equal(detectAccountingActionKind(message), "PAYMENT");
  assert.equal(parseAccountingAmount(message), 12000);
  assert.equal(detectAccountingRecordScope(message), "INTERNAL");
  assert.equal(detectAccountingPaymentMethod(message), "NAKIT");
});

test("tahsilat ve banka ödeme yöntemi doğru algılanır", () => {
  assert.equal(detectAccountingActionKind("ABC firmasından 18.500 TL tahsilat gir"), "COLLECTION");
  assert.equal(parseAccountingAmount("ABC firmasından 18.500 TL tahsilat gir"), 18500);
  assert.equal(detectAccountingPaymentMethod("banka havale ile tahsilat"), "BANKA");
});

test("açılış bakiyesi ayrı allowlist actionıdır", () => {
  assert.equal(detectAccountingActionKind("ABC açılış bakiye 3500 TL borç"), "OPENING_BALANCE");
  assert.equal(parseAccountingAmount("ABC açılış bakiye 3.500 TL borç"), 3500);
});

test("resmî/iç kayıt ayrımı legacy veri değerinden bağımsız çözümlenir", () => {
  assert.equal(detectAccountingRecordScope("iç kayıt olarak gir"), "INTERNAL");
  assert.equal(detectAccountingRecordScope("resmi kayıt olarak gir"), "OFFICIAL");
});

test("Türkçe tarih DD.MM.YYYY ISO tarihe çevrilir", () => {
  assert.equal(parseAccountingDate("11.09.2026 tarihinde ödeme", new Date("2026-01-01T00:00:00Z")), "2026-09-11");
  assert.equal(parseAccountingDate("tarih yok", new Date("2026-09-11T12:00:00Z")), "2026-09-11");
});
