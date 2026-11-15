import assert from "node:assert/strict";
import { test } from "node:test";
import { splitManualBankPayment } from "./ikPayrollManualBank.js";

test("SGK monthly bank input accepts manual amount without Excel and sets cash remainder", () => {
  assert.deepEqual(splitManualBankPayment(52750.50, "25850.35", true), {
    valid: true, bank: 25850.35, cash: 26900.15, paymentType: "BANKA_ELDEN",
  });
});
test("SGK non-insured worker uses full net cash", () => {
  assert.deepEqual(splitManualBankPayment(35000, "0", false), {
    valid: true, bank: 0, cash: 35000, paymentType: "Elden",
  });
  assert.equal(splitManualBankPayment(35000, "10", false).code, "SGK_DISI_BANK_PAYMENT");
});
test("invalid blank, negative, excessive and nonnumeric amounts never silently clamp", () => {
  assert.equal(splitManualBankPayment(30000, "", true).code, "BANK_AMOUNT_REQUIRED");
  assert.equal(splitManualBankPayment(30000, "-1", true).code, "BANK_AMOUNT_OUT_OF_RANGE");
  assert.equal(splitManualBankPayment(30000, "30000.01", true).code, "BANK_AMOUNT_OUT_OF_RANGE");
  assert.equal(splitManualBankPayment(30000, "abc", true).code, "BANK_AMOUNT_REQUIRED");
});
test("the two payment channels reconcile cents exactly for full-bank and zero-net cases", () => {
  assert.deepEqual(splitManualBankPayment(42500, 42500, true), { valid: true, bank: 42500, cash: 0, paymentType: "Banka" });
  assert.deepEqual(splitManualBankPayment(0, 0, false), { valid: true, bank: 0, cash: 0, paymentType: "Elden" });
});
