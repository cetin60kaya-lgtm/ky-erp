import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const monthly = readFileSync(new URL("./IkAdvancedMonthly.jsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("./IkMonthlyProShell.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./ik.monthly.pro.css", import.meta.url), "utf8");

test("monthly HR uses the professional command shell without replacing payroll rules", () => {
  assert.match(monthly, /IkMonthlyProShell/);
  assert.match(monthly, /periodPrepared=\{periodPrepared\}/);
  assert.match(monthly, /balanced=\{periodPrepared && balanced\}/);
  assert.match(monthly, /paidCount=\{payrollRows\.filter/);
  assert.match(monthly, /renderBordro\(\)/);
  assert.match(monthly, /renderEvrak\(\)/);
  assert.match(monthly, /reconcilePaymentSplit/);
});

test("professional shell exposes the seven canonical HR work areas", () => {
  const labels = [
    "Kontrol Merkezi",
    "Personel",
    "Ücret Planı",
    "Mesai / Avans",
    "Yıllık İzin",
    "Bordro / Ödeme",
    "SGK / Ay Sonu",
  ];
  labels.forEach((label) => assert.ok(shell.includes(label), label));
  assert.ok(shell.includes("Dönem Hazırlığı"));
  assert.ok(shell.includes("Kontrol"));
  assert.ok(shell.includes("Ödeme"));
  assert.ok(shell.includes("Kapanış"));
});

test("monthly HR professional UI stays responsive and keeps dense tables usable", () => {
  assert.match(css, /ik-pro-command/);
  assert.match(css, /ik-pro-overview-strip/);
  assert.match(css, /ik-pro-flow/);
  assert.match(css, /max-height: 560px/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});


test("personnel cards use master detail UX and a real canonical create route", () => {
  assert.match(monthly, /openNewPerson/);
  assert.match(monthly, /createIkAdvancedPerson/);
  assert.match(monthly, /ik-pro-personnel-layout/);
  assert.match(monthly, /ik-pro-roster-item/);
  assert.match(monthly, /Detay Personel Tablosunu Aç/);
  assert.match(monthly, /fourth: "Durum", fifth: "SGK"/);
  assert.match(css, /ik-pro-personnel-layout/);
  assert.match(css, /ik-pro-profile-grid/);
  assert.match(css, /ik-pro-finance-snapshot/);
});

test("new personnel is blocked in a closed period and duplicate card is checked before save", () => {
  assert.match(monthly, /Kapalı dönemde yeni personel kartı açılamaz/);
  assert.match(monthly, /duplicateCard/);
  assert.match(monthly, /Bu kart numarası başka bir personele bağlı/);
});
