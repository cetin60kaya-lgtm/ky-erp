import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./IkAdvancedMonthly.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./ik.monthly.pro.css", import.meta.url), "utf8");
const api = readFileSync(new URL("../../../../services/ik/monthlyApi.js", import.meta.url), "utf8");

test("annual leave is an employee-centered workspace", () => {
  assert.match(source, /Yıllık İzin & Personel İzin Dosyası/);
  assert.match(source, /ik-leave-workspace/);
  assert.match(source, /Özet & Hızlı İzin/);
  assert.match(source, /Sicil & Gün Dökümü/);
  assert.match(source, /Takvim & Ekip/);
  assert.match(source, /Hakediş & Ayarlar/);
});

test("annual leave exposes explainable balance and PDKS evidence", () => {
  assert.match(source, /Kanuni Hak/);
  assert.match(source, /Devreden/);
  assert.match(source, /Kullanılan \/ Onaylı/);
  assert.match(source, /Planlanan/);
  assert.match(source, /PDKS kartlı gün/);
  assert.match(source, /Gün Gün İzin Dökümü/);
});

test("leave cash request is recorded separately from leave balance", () => {
  assert.match(source, /İzin Ücreti \/ Talep/);
  assert.match(source, /yıllık izin bakiyesini otomatik düşürmez/);
  assert.match(api, /saveIkAdvancedLeaveCashRequest/);
  assert.match(api, /saveIkAdvancedLeaveProfile/);
});

test("annual leave workspace remains touch friendly", () => {
  assert.match(css, /IK_LEAVE_EMPLOYEE_CENTER_V3/);
  assert.match(css, /ik-leave-roster-row/);
  assert.match(css, /min-height:\s*44px/);
});


test("annual leave mobile fields use 16px controls", () => {
  assert.match(css, /ik-leave-quick-form textarea/);
  assert.match(css, /ik-leave-settings-form textarea/);
  assert.match(css, /ik-leave-cash-form textarea/);
  assert.match(css, /font-size:\s*16px/);
});


test("final polish keeps leave workspace compact and focused", () => {
  assert.match(source, /ik-leave-page-head/);
  assert.match(source, /ik-leave-filterbar/);
  assert.match(css, /IK_YILLIK_IZIN_FINAL_POLISH_2026_10_06/);
  assert.match(css, /grid-template-columns:\s*minmax\(238px, 250px\) minmax\(0, 1fr\)/);
  assert.match(css, /ik-leave-overview-grid[\s\S]*1\.32fr/);
});
