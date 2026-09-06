import test from "node:test";
import assert from "node:assert/strict";
import { eBelgeProductRouting, selectEBelgeExpenseRule } from "./e-belge-product-store.ts";

test("normal eşleşmeyen tedarikçi kalemi gider olarak kalır ve LOT istemez", () => {
  const result = eBelgeProductRouting(null, { description: "Nakliye hizmet bedeli" }, {
    isChemicalSupplier: false,
    requireLot: false,
  });
  assert.equal(result.routing, "EXPENSE");
  assert.equal(result.lotRequired, false);
  assert.equal(result.expenseCategoryName, "Mal ve Hizmet Alımı");
});

test("ürün kartındaki STOCK kuralı stok girişine yönlendirir", () => {
  const result = eBelgeProductRouting(
    { id: "p1", name: "Koli", raw: { routingType: "STOCK", requiresLot: false } },
    { description: "Koli" },
    {},
  );
  assert.equal(result.routing, "STOCK");
  assert.equal(result.lotRequired, false);
});

test("Boyahane ürünü LOT zorunlu olur", () => {
  const result = eBelgeProductRouting(
    { id: "p2", name: "White Pigment", raw: { routingType: "BOYAHANE" } },
    { description: "White Pigment" },
    {},
  );
  assert.equal(result.routing, "BOYAHANE");
  assert.equal(result.chemical, true);
  assert.equal(result.lotRequired, true);
});

test("kimya tedarikçisiyle eşleşmiş ürün Boyahane ve LOT akışına alınır", () => {
  const result = eBelgeProductRouting(
    { id: "p3", name: "Ürün X", raw: {} },
    { description: "Ürün X" },
    { isChemicalSupplier: true, requireLot: true, defaultWarehouse: "BOYAHANE", defaultUnit: "KG" },
  );
  assert.equal(result.routing, "BOYAHANE");
  assert.equal(result.lotRequired, true);
  assert.equal(result.defaultUnit, "KG");
});


test("firma + ürün gider hafızası global açıklama kuralından önceliklidir", () => {
  const result = selectEBelgeExpenseRule([
    { id: "global-desc", normalized_description: "NAKLIYE HIZMETI", category_name: "Dış Hizmet", priority: 100, is_active: 1 },
    { id: "firm-product", company_id: "firm-1", product_id: "product-1", category_name: "Nakliye", priority: 100, is_active: 1 },
  ], {
    companyId: "firm-1",
    productId: "product-1",
    description: "Nakliye hizmeti",
  });
  assert.equal(result?.id, "firm-product");
  assert.equal(result?.categoryName, "Nakliye");
});

test("başka firmanın özel gider kuralı uygulanmaz", () => {
  const result = selectEBelgeExpenseRule([
    { id: "wrong-firm", company_id: "firm-2", product_id: "product-1", category_name: "Yemek", priority: 1, is_active: 1 },
    { id: "global-product", product_id: "product-1", category_name: "Ambalaj", priority: 100, is_active: 1 },
  ], {
    companyId: "firm-1",
    productId: "product-1",
    description: "Ürün",
  });
  assert.equal(result?.id, "global-product");
  assert.equal(result?.categoryName, "Ambalaj");
});
