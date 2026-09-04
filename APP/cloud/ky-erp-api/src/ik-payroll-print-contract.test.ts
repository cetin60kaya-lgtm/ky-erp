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
  assert.match(page, /for \\(let index = 0; index < rows\\.length; index \\+= 4\\)/);
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
  assert.match(page, /payload\.adjustmentType !== "Toplu avans"/);
  assert.match(page, /delete payload\.employeeIds/);

  assert.match(cloud, /const isBulkAdvance =/);
  assert.match(cloud, /\[singleEmployeeId\]\.filter\(Boolean\)/);
  assert.match(cloud, /overtimeAmountForEmployee/);
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
