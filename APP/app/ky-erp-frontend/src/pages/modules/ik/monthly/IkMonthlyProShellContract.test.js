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
