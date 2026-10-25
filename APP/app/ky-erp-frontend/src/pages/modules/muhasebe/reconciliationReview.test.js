import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewDraft } from "./reconciliationReview.js";

const row = { company_id: "firm-1", company_name: "Örnek Cari", erp_balance: 100.25 };
test("mutabakat MATCHED yalnız aynı bakiyede onaya girebilir", () => {
  const result = reviewDraft(row, { status: "MATCHED", counterpartyBalance: "100.25", note: "Teyit" }, "2026-10");
  assert.equal(result.status, "MATCHED");
  assert.equal(result.difference, 0);
  assert.equal(result.companyId, "firm-1");
  assert.match(reviewDraft(row, { status: "MATCHED", counterpartyBalance: "90.24" }, "2026-10").error, /farklı/);
  assert.match(reviewDraft(row, { status: "MATCHED", counterpartyBalance: "" }, "2026-10").error, /zorunlu/);
});
test("Fark Var gerçekten fark ister ve bekliyor boş karşı bakiye kabul eder", () => {
  assert.equal(reviewDraft(row, { status: "DIFFERENCE", counterpartyBalance: "100.25" }, "2026-10").error.includes("aynı"), true);
  assert.equal(reviewDraft(row, { status: "DIFFERENCE", counterpartyBalance: "105.25" }, "2026-10").difference, 5);
  assert.equal(reviewDraft(row, { status: "WAITING", counterpartyBalance: "" }, "2026-10").counterpartyBalance, "");
});
test("dönem ve finans değeri doğrulanır; çift-submit kilidi UI'da bulunur", () => {
  for (const bad of ["2026-00", "2026-13", "x"]) assert.ok(reviewDraft(row, { status: "WAITING" }, bad).error);
  for (const bad of ["abc", "Infinity", "1.001", "--10"]) assert.ok(reviewDraft(row, { status: "MATCHED", counterpartyBalance: bad }, "2026-10").error);
  const ui = readFileSync(new URL("./ReconciliationPanel.jsx", import.meta.url), "utf8");
  assert.match(ui, /saveLock\.current = true/);
  assert.match(ui, /onClick=\{confirmSave\}/);
  assert.match(ui, /role="dialog" aria-modal="true"/);
  assert.match(ui, /reviewDraft\(row, drafts\[row\.company_id\]/);
  assert.doesNotMatch(ui, /onClick=\{\(\) => save\(row\)\}/);
});
