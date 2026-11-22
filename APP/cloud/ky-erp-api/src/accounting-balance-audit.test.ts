import assert from "node:assert/strict";
import test from "node:test";
import { auditCompanyBalance, summarizeCompanyBalanceAudit } from "./accounting-balance-audit";

test("legacy positive opening balance is a real current balance, not an automatic error", () => {
  const row = auditCompanyBalance({ id: "one", name: "Firma", opening_balance: 50000, current_balance: 50000, movement_net: 0, debit_credit_net: 0, movement_count: 0 });
  assert.equal(row.expectedBalance, 50000);
  assert.equal(row.hasDiscrepancy, false);
});
test("stored orphan balance is flagged without changing data", () => {
  const row = auditCompanyBalance({ id: "two", opening_balance: 0, current_balance: 50000, movement_net: 0, debit_credit_net: 0 });
  assert.equal(row.discrepancy, 50000);
  assert.equal(row.hasDiscrepancy, true);
});
test("opening and net movement reconcile and round to cents", () => {
  const row = auditCompanyBalance({ id: "three", opening_balance: 100, current_balance: 80.1, movement_net: -19.9, debit_credit_net: -19.9 });
  assert.equal(row.discrepancy, 0);
  assert.equal(row.expectedBalance, 80.1);
});
test("historical effect mismatch is highlighted separately", () => {
  const row = auditCompanyBalance({ id: "four", opening_balance: 0, current_balance: 10, movement_net: 10, debit_credit_net: 20 });
  assert.equal(row.hasDiscrepancy, false);
  assert.equal(row.movementEncodingDiscrepancy, true);
});
test("summary uses only stored real balances and counts inconsistencies", () => {
  const rows = [
    auditCompanyBalance({id: "a", opening_balance: 50000, current_balance: 50000, movement_net: 0, debit_credit_net: 0}),
    auditCompanyBalance({id: "b", opening_balance: 0, current_balance: -250, movement_net: 0, debit_credit_net: 0}),
  ];
  assert.deepEqual(summarizeCompanyBalanceAudit(rows), {
    companyCount: 2, storedReceivable: 50000, storedPayable: 250,
    discrepancyCount: 1, movementEncodingDiscrepancyCount: 0,
  });
});
