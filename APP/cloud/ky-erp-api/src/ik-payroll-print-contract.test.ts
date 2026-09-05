import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("IK payroll report and payment slips use the canonical print service contract", () => {
  const service = frontend("services/printService.js");
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");

  assert.match(service, /printHtmlDocument\(optionsOrHtml/);
  assert.match(service, /normalizePrintOptions/);
  assert.match(service, /buildPrintableDocument/);
  assert.match(service, /fullDocument/);
  assert.match(service, /win\.print\(\)/);

  assert.ok(page.includes("Toplu Rapor / PDF"));
  assert.ok(page.includes("Toplu Fiş / PDF"));
  assert.ok(page.includes("Tek Kisi Fisi"));
  assert.ok(page.includes("printHtmlDocument({ title: `İK Aylık Bordro"));
  assert.ok(page.includes("printHtmlDocument({ title: `Toplu Personel Ödeme Fişleri"));
  assert.ok(page.includes("printHtmlDocument({ title: `Ödeme Fişi"));
  assert.doesNotMatch(page, /printHtmlDocument\(html,/);
});

test("IK bulk slip output keeps A4 pagination and selected-person filtering", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  assert.match(page, /selectedPayrollIds\.includes\(row\.employee\.id\)/);
  assert.match(page, /for \(let index = 0; index < rows\.length; index \+= 4\)/);
  assert.match(page, /@page\{size:A4 portrait/);
  assert.match(page, /grid-template-columns:1fr 1fr/);
  assert.match(page, /grid-template-rows:1fr 1fr/);
});


test("IK finance movement keeps the selected employee and supports legal overtime multipliers", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  const cloud = readFileSync(resolve(here, "ik-relational-cloud.ts"), "utf8");

  assert.ok(page.includes("Hafta içi %50 (x1,5)"));
  assert.ok(page.includes("Hafta sonu %100 (x2)"));
  assert.ok(page.includes("overtimeMultiplier"));
  assert.match(page, /draft\.adjustmentType === "Toplu avans"\) payload\.employeeIds/);
  assert.match(page, /else payload\.employeeId = draft\.employeeId/);

  assert.match(cloud, /const isBulkAdvance =/);
  assert.match(cloud, /const singleEmployeeId = text\(body\.employeeId\)/);
  assert.match(cloud, /SINGLE_EMPLOYEE_ONLY/);
  assert.match(cloud, /overtimeAmountForEmployee/);
  assert.match(cloud, /calculateOvertimeAmount/);
  assert.match(cloud, /employee_id=\?,date=\?,adjustment_type=/);
  assert.match(cloud, /advancedEmployeeVisible/);
});

test("IK bulk slips are readable four-up A4 cards", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  assert.ok(page.includes("NET / TOPLAM ÖDENECEK"));
  assert.ok(page.includes("Personel İmza"));
  assert.ok(page.includes("Ödeme Yapan"));
  assert.match(page, /index \+= 4/);
  assert.match(page, /grid-template-rows:1fr 1fr/);
});


test("IK refresh uses canonical personnel and latest-wins request guard", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  const cloud = readFileSync(resolve(here, "ik-relational-cloud.ts"), "utf8");

  assert.match(page, /loadRequestRef = useRef/);
  assert.match(page, /if \(activeRequest\.promise\) \{/);
  assert.match(page, /if \(!force && activeRequest\.key === requestKey\) return activeRequest\.promise/);
  assert.match(page, /loadRequestRef\.current\.seq !== requestId/);
  assert.match(page, /canonicalEmployeeIds/);
  assert.match(page, /currentIds\.has\(item\.employeeId\)/);

  assert.match(cloud, /rawEmployees: employees/);
  assert.match(cloud, /visibleEmployeeIds/);
  assert.match(cloud, /payroll: payroll\.filter/);
});

test("IK base salary reference uses raw employees and overtime metadata is stripped on type change", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  const cloud = readFileSync(resolve(here, "ik-relational-cloud.ts"), "utf8");

  assert.match(page, /baseEmployeeId \? rawEmployees\.find/);
  assert.match(page, /const employee = rawEmployees\.find/);
  assert.match(cloud, /new Map\(rawEmployees\.map/);
  assert.match(cloud, /text\(body\.note \?\? overtimeMetaFromNote\(current\.note\)\.note\)/);
  assert.match(cloud, /exit_date=COALESCE\(ik_person_card_settings\.exit_date, excluded\.exit_date\)/);
});


test("payroll print HTML escapes employee-entered text and shows every payment component", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");

  assert.match(page, /function escapeHtml\(value\)/);
  assert.match(page, /replaceAll\("&", "&amp;"\)/);
  assert.match(page, /escapeHtml\(row\.employee\.fullName\)/);
  assert.match(page, /escapeHtml\(row\.employee\.code \|\| "-"\)/);
  assert.match(page, /escapeHtml\(row\.employee\.department \|\| "Bölüm yok"\)/);

  for (const label of ["Maaş", "Yol", "EK", "Mesai", "Avans", "Kesinti", "İcra/Haciz", "BANKADAN", "ELDEN", "NET / TOPLAM ÖDENECEK"]) {
    assert.ok(page.includes(label), `Eksik fiş/rapor alanı: ${label}`);
  }
});

test("payroll payment balance cannot be bypassed and backend enforces the same contract", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  const cloud = readFileSync(resolve(here, "ik-relational-cloud.ts"), "utf8");

  assert.ok(page.includes("Banka + elden toplamı net ödenecek tutara eşit olmalıdır."));
  assert.doesNotMatch(page, /Banka \+ elden net odeme ile eslesmiyor\. Devam edilsin mi/);
  assert.match(cloud, /PAYMENT_TOTAL_MISMATCH/);
  assert.match(cloud, /calculatePayrollAmounts/);
});

test("payroll report and Excel use the same canonical payrollRows data", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");

  assert.match(page, /const exportPayroll = \(\) =>/);
  assert.match(page, /payrollRows\.map\(\(row\) =>/);
  assert.match(page, /const printPayrollReport = async \(\) =>/);
  assert.match(page, /const rows = payrollRows\.filter/);
  assert.match(page, /<th>Maaş<\/th><th>Yol<\/th><th>EK<\/th><th>Mesai<\/th>/);
  assert.match(page, /<th>Avans<\/th><th>Kesinti<\/th><th>İcra\/Haciz<\/th><th>Banka<\/th><th>Elden<\/th><th>Net<\/th>/);
});


test("single slip targets the selected payroll row and bulk page five starts a new page", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");

  assert.match(page, /const printSlip = async \(row = payrollRows\.find\(\(item\) => item\.employee\.id === selected\?\.id\)\)/);
  assert.match(page, /onClick=\{\(\) => printSlip\(row\)\}/);
  assert.match(page, /for \(let index = 0; index < rows\.length; index \+= 4\) pages\.push\(rows\.slice\(index, index \+ 4\)\)/);
  assert.match(page, /page-break-after:always/);
  assert.match(page, /\.page:last-child\{page-break-after:auto\}/);
});

test("bordro Excel exports the same core amounts shown on screen", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");

  for (const field of [
    "maas: row.salary",
    "yol: row.road",
    "ek: row.extra",
    "mesai: row.overtime",
    "avans: row.advance",
    "kesinti: row.deduction",
    "hukukiKesinti: row.garnishment",
    "netOdenecek: row.net",
    "banka: row.bank",
    "elden: row.cash",
  ]) {
    assert.ok(page.includes(field), `Eksik Excel bordro alanı: ${field}`);
  }
});


test("forced refresh waits for an active read before starting the canonical reread", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");

  assert.match(page, /const load = useCallback\(async \(\{ force = false \} = \{\}\) =>/);
  assert.match(page, /if \(!force && activeRequest\.key === requestKey\) return activeRequest\.promise/);
  assert.match(page, /await activeRequest\.promise/);
  assert.match(page, /await load\(\{ force: true \}\)/);
  assert.match(page, /const go = \(target\) => \{[\s\S]*load\(\{ force: true \}\)/);
});


test("serialized refresh stays single-active across period changes", () => {
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  assert.match(page, /if \(activeRequest\.promise\) \{/);
  assert.match(page, /try \{ await activeRequest\.promise; \}/);
  assert.match(page, /loadRequestRef\.current\.seq !== requestId/);
});
