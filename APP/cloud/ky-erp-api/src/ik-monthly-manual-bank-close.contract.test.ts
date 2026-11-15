import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = readFileSync(resolve(here, "../../../app/ky-erp-frontend/src/pages/modules/ik/monthly/IkAdvancedMonthly.jsx"), "utf8");
const backend = readFileSync(resolve(here, "ik-relational-cloud.ts"), "utf8");

test("monthly payroll manual bank entry is first-class and Excel import remains optional", () => {
  assert.match(frontend, /splitManualBankPayment/);
  assert.match(frontend, /Bu Ayın Banka Tutarı · Elle Gir/);
  assert.match(frontend, /Elden Kalan · Otomatik/);
  assert.match(frontend, /İsteğe Bağlı: Muhasebe Excel/);
  assert.match(frontend, /Kaydet ve Sonraki Personel/);
  assert.doesNotMatch(frontend, /title: "Resmi SGK bordrosu yok"/);
});

test("accountant review is required before period lock, even for generated payroll rows", () => {
  assert.match(backend, /const reviewedEmployeeIds = new Set/);
  assert.match(backend, /const unreviewed = visible\.filter/);
  assert.match(backend, /const staleAfterReview = /);
  assert.match(backend, /"KISI_SON_KONTROL"/);
  assert.match(backend, /"KAYNAK_GUNCELLIGI"/);
  assert.match(backend, /if \(blocking\.length\) \{\s*return error\(c, 409, "IK_MONTH_CLOSE_BLOCKED"/);
});

test("save only period payroll: approved bank and cash remain a single balanced final control", () => {
  assert.match(frontend, /desired\.bank = manual\.bank/);
  assert.match(frontend, /desired\.cash = manual\.cash/);
  assert.match(frontend, /editor\.paymentType = manual\.paymentType/);
  assert.match(backend, /"PAYMENT_TOTAL_MISMATCH"/);
  assert.match(frontend, /updatePersonnelCard,/);
});
