import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cloud = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) =>
  readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("monthly IK exposes one canonical seven-tab workspace", () => {
  const registry = frontend("app/moduleRegistryBase.js");
  const app = frontend("AppV3.jsx");
  const finance = frontend("pages/modules/ik/monthly/IkFinancePage.jsx");

  for (const tab of [
    "İK Özet",
    "Personel Kartları",
    "Maaş / Yol / Banka / Elden",
    "Mesai / Avans / Kesinti",
    "Yıllık İzin / İzin Sicili",
    "Bordro & Ödeme",
    "SGK / Evrak / Ay Sonu",
  ]) assert.ok(registry.includes(tab), `Eksik İK sekmesi: ${tab}`);

  assert.match(app, /IkPersonnelFinancePage/);
  assert.match(app, /IkFinancePage/);
  assert.match(finance, /openModule=\{openModule\}/);
});

test("monthly actions navigate to canonical workspace tabs instead of hidden duplicate screens", () => {
  const page = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");

  assert.match(page, /personel:\s*"personel-kartlari"/);
  assert.match(page, /ucret:\s*"ucret-odeme-plani"/);
  assert.match(page, /hareket:\s*"mesai-avans"/);
  assert.match(page, /izin:\s*"yillik-izin"/);
  assert.match(page, /bordro:\s*"bordro-odeme"/);
  assert.match(page, /evrak:\s*"sgk-evrak-kontrol"/);
  assert.match(page, /openModule\("ik", \{ tabKey: tabByTarget\[target\] \}\)/);
});

test("personnel master and PDKS populations remain intentionally separate", () => {
  const personnel = cloud("ik-personnel-control.ts");
  const pdks = frontend("services/pdksApi.js");

  assert.match(personnel, /if \(auth\.audit && !\(await auditVisibleForPeriod/);
  assert.doesNotMatch(personnel, /if \(!auth\.audit.*sgk/i);
  assert.match(pdks, /=== "VAR"/);
  assert.doesNotMatch(pdks, /!== "YOK"/);
});

test("monthly filters are real controls and filter personnel and finance movement rows", () => {
  const page = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");

  assert.match(page, /employeeStatusFilter/);
  assert.match(page, /sgkFilter/);
  assert.match(page, /movementTypeFilter/);
  assert.match(page, /movementEffectFilter/);
  assert.match(page, /const filteredMovements = useMemo/);
  assert.match(page, /filteredMovements\.map/);
  assert.match(page, /SGK'lı/);
  assert.match(page, /SGK'sız/);
  assert.match(page, /Bordroya Yansır/);
  assert.match(page, /Sadece Kayıt/);
});

test("employment period and payroll snapshot safety stay enforced", () => {
  const relational = cloud("ik-relational-cloud.ts");
  const personnel = cloud("ik-personnel-control.ts");
  const page = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");

  assert.match(relational, /advancedEmployeeVisible/);
  assert.match(relational, /applyHistoricalEmployeeValues/);
  assert.match(relational, /PAYMENT_TOTAL_MISMATCH/);
  assert.match(personnel, /effectiveExitDate/);
  assert.match(personnel, /EXIT_BEFORE_HIRE/);
  assert.match(page, /paidLocked: upper\(saved\.status\) === "PAID"/);
  assert.match(page, /sourceChangedSinceSave/);
});

test("monthly live sync is enabled on both personnel and finance screens", () => {
  const personnelPage = frontend("pages/modules/ik/monthly/IkPersonnelFinancePage.jsx");
  const financePage = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");

  for (const source of [personnelPage, financePage]) {
    assert.match(source, /BroadcastChannel/);
    assert.match(source, /IK_LIVE_SYNC_INTERVAL_MS = 1500/);
    assert.match(source, /getIkAdvancedSyncState/);
  }
});

test("payroll outputs and SGK close controls remain present", () => {
  const page = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");
  for (const label of [
    "Ödeme Listesi / PDF",
    "Ödeme Listesi / Excel",
    "10’lu Toplu Fiş / PDF",
    "Tek Kişi Fişi",
    "Ay Sonu Kontrol",
    "Dönemi Kapat",
  ]) assert.ok(page.includes(label), `Eksik çıktı/kapanış kontrolü: ${label}`);

  assert.match(page, /printHtmlDocument/);
  assert.match(page, /exportRowsToExcelFile/);
  assert.match(page, /runIkAdvancedCloseCheck/);
});

test("PDKS card-import compatibility stays outside the monthly HR screens", () => {
  const api = frontend("services/ik/monthlyApi.js");
  const monthly = frontend("pages/modules/ik/monthly/IkAdvancedMonthly.jsx");
  const pdks = frontend("pages/modules/PdksPageV2.jsx");
  assert.match(api, /\/ik\/advanced\/card\/preview/);
  assert.match(api, /\/ik\/advanced\/card\/confirm/);
  assert.doesNotMatch(monthly, /previewIkAdvancedCard|confirmIkAdvancedCard/);
  assert.match(pdks, /previewIkAdvancedCard/);
  assert.match(pdks, /confirmIkAdvancedCard/);
});
