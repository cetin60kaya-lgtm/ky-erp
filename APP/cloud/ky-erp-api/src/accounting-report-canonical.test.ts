import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCanonicalReportOverride,
  deriveCanonicalExpenseCategory,
} from "./accounting-report-canonical.ts";

test("e-Belge gider kalemi routing türünden kategori üretir", () => {
  assert.deepEqual(
    deriveCanonicalExpenseCategory({ raw_metadata: JSON.stringify({ routingType: "BOYAHANE" }) }),
    { name: "Kimya / Boya", routing: "BOYAHANE" },
  );
  assert.deepEqual(
    deriveCanonicalExpenseCategory({ raw_metadata: JSON.stringify({ routingType: "STOCK" }) }),
    { name: "Stok / Malzeme Alımı", routing: "STOCK" },
  );
  assert.deepEqual(
    deriveCanonicalExpenseCategory({ raw_metadata: JSON.stringify({ routingType: "EXPENSE", expenseCategoryName: "Nakliye" }) }),
    { name: "Nakliye", routing: "EXPENSE" },
  );
});

test("yalnız kategori override edilince rapora dahil kararı bozulmaz", () => {
  const categories = new Map([
    ["cat-nakliye", { id: "cat-nakliye", name: "Nakliye" }],
  ]);
  const base = {
    reportIncluded: true,
    reportStatus: "DAHIL",
    categoryId: "cat-eski",
    category: "Diğer",
    reportAmount: 1200,
    reportVatAmount: 200,
    officialType: "RESMI",
    expenseStatus: "GENEL_GIDER",
  };
  const result = applyCanonicalReportOverride(base, {
    report_category_id: "cat-nakliye",
    override_mask: JSON.stringify(["reportCategoryId"]),
  }, categories);
  assert.equal(result.reportIncluded, true);
  assert.equal(result.reportStatus, "DAHIL");
  assert.equal(result.categoryId, "cat-nakliye");
  assert.equal(result.category, "Nakliye");
});

test("dahil-hariç override rapor durumunu ve tutar aliaslarını günceller", () => {
  const result = applyCanonicalReportOverride({
    reportIncluded: true,
    reportStatus: "DAHIL",
    reportAmount: 500,
    reportVatAmount: 90,
    amount: 500,
    vatAmount: 90,
    officialType: "RESMI",
    expenseStatus: "GENEL_GIDER",
  }, {
    report_included: 0,
    report_amount: 450,
    override_mask: JSON.stringify(["reportIncluded", "reportAmount"]),
  }, new Map());
  assert.equal(result.reportIncluded, false);
  assert.equal(result.reportStatus, "HARIC");
  assert.equal(result.reportAmount, 450);
  assert.equal(result.amount, 450);
});
