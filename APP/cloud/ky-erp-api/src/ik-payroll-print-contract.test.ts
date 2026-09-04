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
  assert.match(page, /for \(let index = 0; index < rows\.length; index \+= 10\)/);
  assert.match(page, /@page\{size:A4 portrait/);
  assert.match(page, /grid-template-columns:1fr 1fr/);
  assert.match(page, /grid-template-rows:repeat\(5,1fr\)/);
});
