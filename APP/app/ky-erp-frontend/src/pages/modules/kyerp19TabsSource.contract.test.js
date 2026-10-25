// 19-sekme onaylı HTML -> mevcut route -> gerçek JSX/API kaynak ilişkisinin regresyonu.
// Bu test bir yetkili browser E2E, canlı İşNet, D1 mutasyonu veya mali fiş testi değildir.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const registry = read("../../app/moduleRegistry.js");
const baseRegistry = read("../../app/moduleRegistryBase.js");
const accounting = read("./MuhasebePage.jsx");
const ebelge = read("./muhasebe/EBelgeCenterPage.jsx");

const specs = [
  { section: "Muhasebe", tab: "yonetim-ozeti", path: "./muhasebe/ManagementOverviewWorkspace.jsx", requires: ["/muhasebe/yonetim-ozeti", "ManagementOverviewWorkspace"], shell: accounting },
  { section: "Muhasebe", tab: "firma-kartlari", path: "./muhasebe/CompaniesCurrentWorkspace.jsx", requires: ["/muhasebe/firmalar", "firma-profilleri"], shell: accounting },
  { section: "Muhasebe", tab: "tedarikci-faturalar", path: "./muhasebe/SupplierDocumentsWorkspace.jsx", requires: ["getEBelgePool", "INCOMING_DISPATCH"], shell: accounting },
  { section: "Muhasebe", tab: "musteri-belgeleri", path: "./muhasebe/CustomerDocumentsWorkspace.jsx", requires: ["getEBelgePool", "OUTGOING_INVOICE"], shell: accounting },
  { section: "Muhasebe", tab: "finans-islemleri", path: "./muhasebe/FinanceOperationsWorkspace.jsx", requires: ["PaymentPlannerPanel"], shell: accounting },
  { section: "Muhasebe", tab: "mail-ekstre", path: "./muhasebe/MailAccountingWorkspace.jsx", requires: ["ReconciliationPanel"], shell: accounting },
  { section: "Muhasebe", tab: "mali-kontrol", path: "./muhasebe/FinancialControlWorkspace.jsx", requires: ["AccountingReportsListWorkspace", "ProfitLossWorkspace", "VatComparisonWorkspace"], shell: accounting },
  { section: "e-Belge", tab: "genel-bakis", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ["getEBelgeDashboard"], shell: ebelge },
  { section: "e-Belge", tab: "gelen-belgeler", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ['"INCOMING"', "getEBelgePool"], shell: ebelge },
  { section: "e-Belge", tab: "giden-belgeler", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ['"OUTGOING"', "getEBelgePool"], shell: ebelge },
  { section: "e-Belge", tab: "belge-havuzu", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ["uploadEBelge", "getEBelgePool"], shell: ebelge },
  { section: "e-Belge", tab: "eslestirmeler", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ["reconcileAllEBelge", "matchingApproved"], shell: ebelge },
  { section: "e-Belge", tab: "onay-sorunlar", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ["finalizeEBelge", "resolveEBelgeIssue"], shell: ebelge },
  { section: "e-Belge", tab: "is-akislari", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ["InvoiceDispatchControlWorkspace"], shell: ebelge },
  { section: "e-Belge", tab: "arsiv-cikti", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ["getEBelgeFilePreview", "openEBelgeBlob"], shell: ebelge },
  { section: "e-Belge", tab: "entegrasyonlar", path: "./muhasebe/EBelgeCenterPage.jsx", requires: ["EBelgeIntegrationsWorkspace", "providerDisplayStatus"], shell: ebelge },
  { section: "İmalat", tab: "uretim-merkezi", path: "../imalat/ProductionControlCenterPageV2.jsx", requires: ["getProductionCenter", "createProductionCenterEntry", "requestId"], shell: baseRegistry },
  { section: "İmalat", tab: "uretim-raporlari", path: "../imalat/ImalatKontrolRapor.jsx", requires: ["getImalatOperasyonRaporu", "imalatReportTsv"], shell: baseRegistry },
  { section: "İmalat", tab: "uretim-ayarlari", path: "../imalat/ProductionSettingsPage.jsx", requires: ["getImalatMakineler", "saveImalatMakine"], shell: baseRegistry },
];

test("tam 7 Muhasebe, 9 e-Belge, 3 İmalat ekranı kabul sözleşmesi", () => {
  assert.equal(specs.length, 19);
  assert.equal(specs.filter(s => s.section === "Muhasebe").length, 7);
  assert.equal(specs.filter(s => s.section === "e-Belge").length, 9);
  assert.equal(specs.filter(s => s.section === "İmalat").length, 3);
  assert.equal(new Set(specs.map(s => s.section + "/" + s.tab)).size, 19);
});
for(const item of specs) {
  test(`Onaylı 19 kaynak: ${item.section}/${item.tab}`, () => {
    const source = read(item.path);
    const reg = item.section === "İmalat" ? baseRegistry : registry;
    assert.ok(reg.includes('"' + item.tab + '"'), "Menüde route yok: " + item.tab);
    assert.ok(item.shell.includes('"' + (item.section === "e-Belge" ? ({
      "genel-bakis": "overview", "gelen-belgeler": "incoming", "giden-belgeler": "outgoing",
      "belge-havuzu": "pool", "eslestirmeler": "matching", "onay-sorunlar": "issues",
      "is-akislari": "workflow", "arsiv-cikti": "archive", "entegrasyonlar": "integrations",
    })[item.tab] : item.tab) + '"'), "Hedef sekme görünümüne bağlı değil");
    for(const marker of item.requires) assert.ok(source.includes(marker), item.tab + " API kaynağı eksik: " + marker);
    assert.doesNotMatch(source, /Yer tutucu veri|Örnek cari kayıtları|mockInvoices\s*=/);
  });
}
