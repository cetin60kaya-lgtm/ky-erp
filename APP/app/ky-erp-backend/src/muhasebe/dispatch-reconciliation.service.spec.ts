import assert from "node:assert/strict";
import { test } from "node:test";
import { companyIdentityKey, invoiceNonBillableCategory, invoiceStatus, isCustomerSalesFlowCompany, isCustomerSalesFlowRecord, sameCompanyIdentity } from "./dispatch-reconciliation.service";

const customerDispatch = (companyType: string | null, id = "company") => ({
  id: "document",
  documentType: "CUSTOMER_DISPATCH",
  deletedAt: null,
  company: id ? { id, companyType } : null,
});

test("fatura kesme yardimcisi yalniz CUSTOMER ve BOTH firmalari kabul eder", () => {
  assert.equal(isCustomerSalesFlowCompany({ id: "taha", companyType: "CUSTOMER" }), true);
  assert.equal(isCustomerSalesFlowCompany({ id: "both", companyType: "BOTH" }), true);
  assert.equal(isCustomerSalesFlowCompany({ id: "can", companyType: "SUPPLIER" }), false);
  assert.equal(isCustomerSalesFlowCompany({ id: "legacy", companyType: null }), false);
  assert.equal(isCustomerSalesFlowCompany(null), false);
});

test("supplier ve firma karti olmayan irsaliyeler satis akisina girmez", () => {
  assert.equal(isCustomerSalesFlowRecord(customerDispatch("CUSTOMER")), true);
  assert.equal(isCustomerSalesFlowRecord(customerDispatch("BOTH")), true);
  assert.equal(isCustomerSalesFlowRecord(customerDispatch("SUPPLIER")), false);
  assert.equal(isCustomerSalesFlowRecord(customerDispatch(null)), false);
  assert.equal(isCustomerSalesFlowRecord(customerDispatch("CUSTOMER", "")), false);
});

test("bedelsiz adet toplam kapanisa dahil edilir", () => {
  assert.equal(invoiceStatus(2760, 2750, 10), "CLOSED_WITH_NON_BILLABLE");
});

test("bedelsiz kayit yoksa eksik fatura kismi kalir", () => {
  assert.equal(invoiceStatus(2760, 2750, 0), "PARTIAL");
});

test("tam ticari fatura kendi durumunu korur", () => {
  assert.equal(invoiceStatus(2760, 2760, 0), "INVOICED");
});

test("fatura ve bedelsiz toplam irsaliyeyi asamaz", () => {
  assert.equal(invoiceStatus(2760, 2755, 10), "REVIEW_REQUIRED");
});

test("faturadaki sifir TL test ve sakat satirlari siniflandirilir", () => {
  assert.equal(invoiceNonBillableCategory({ description: "TEST NUMUNESİ", quantity: 10, unitPrice: 0, lineTotal: 0 }), "TEST_SAMPLE");
  assert.equal(invoiceNonBillableCategory({ description: "KUMAŞ SAKATI", quantity: 11, unitPrice: 0, lineTotal: 0 }), "FABRIC_DEFECT");
  assert.equal(invoiceNonBillableCategory({ description: "BASKI SAKATI", quantity: 4, unitPrice: 0, lineTotal: 0 }), "PRINT_DEFECT");
});

test("ucretli satir bedelsiz sayilmaz", () => {
  assert.equal(invoiceNonBillableCategory({ description: "TEST NUMUNESİ", quantity: 10, unitPrice: 4.5, lineTotal: 45 }), null);
});

test("ayni vergi numarali eski firma kartlari ayni firma kabul edilir", () => {
  const activeCard = { companyId: "active", company: { taxNo: "8160150864", name: "TAHA GIYIM" } };
  const oldCard = { companyId: "old", company: { taxNo: "8160150864", name: "TAHA GIYIM A.S." } };
  assert.equal(sameCompanyIdentity(activeCard, oldCard), true);
  assert.equal(companyIdentityKey(activeCard), companyIdentityKey(oldCard));
});

test("farkli vergi numaralari firma karti kimligi farkliysa eslesmez", () => {
  assert.equal(sameCompanyIdentity(
    { companyId: "a", company: { taxNo: "1111111111" } },
    { companyId: "b", company: { taxNo: "2222222222" } },
  ), false);
});
