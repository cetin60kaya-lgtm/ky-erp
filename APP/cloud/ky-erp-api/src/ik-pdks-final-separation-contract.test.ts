import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("IK visible navigation is personnel and finance only; PDKS attendance duplicates are removed", () => {
  const registry = frontend("app/moduleRegistryBase.js");

  for (const label of [
    "İK Özet",
    "Personel Kartları",
    "Maaş / Yol / Banka / Elden",
    "Mesai / Avans / Kesinti",
    "Bordro & Ödeme",
    "SGK / Evrak / Ay Sonu",
  ]) assert.ok(registry.includes(label), `Eksik İK menüsü: ${label}`);

  assert.doesNotMatch(registry, /\["puantaj-izin",\s*"Yıllık İzin \/ Günlük Durum"/);
  assert.doesNotMatch(registry, /label:\s*"Günlük Personel"/);
  assert.match(registry, /"puantaj-izin":\s*"personel-kartlari"/);
  assert.match(registry, /"gunluk-giris":\s*"personel-kartlari"/);
});

test("IK rendering never mounts a second PDKS or puantaj workspace", () => {
  const app = frontend("AppV3.jsx");

  assert.match(app, /IkPersonnelFinancePage/);
  assert.match(app, /IkFinancePage/);
  assert.doesNotMatch(app, /IkPdksSyncPage/);
  assert.doesNotMatch(app, /IkPersonnelCenterPage/);
  assert.doesNotMatch(app, /import IkPage from/);
});

test("monthly IK overview does not fetch or render live PDKS operations", () => {
  const monthly = frontend("pages/modules/IkAdvancedMonthly.jsx");

  assert.doesNotMatch(monthly, /getPdksLiveDashboard/);
  assert.doesNotMatch(monthly, /Bugünkü PDKS Hareketi/);
  assert.doesNotMatch(monthly, /Bugün kart basan/);
  assert.doesNotMatch(monthly, /Bugün gelmeyen/);
  assert.doesNotMatch(monthly, /Eksik basım/);
  assert.match(monthly, /PDKS işlemi içermez; yalnız İK finans ve bordro aksiyonları/);
  assert.match(monthly, /İzin, rapor ve günlük devam hareketleri PDKS bölümünden yönetilir/);
});

test("IK personnel card exposes authoritative annual leave entitlement, used and remaining balance", () => {
  const page = frontend("pages/modules/ik/IkPersonnelFinancePage.jsx");
  const service = frontend("services/ikPersonnelControlApi.js");

  assert.match(page, /getIkControlLeaveEntitlement/);
  assert.match(service, /people\/\$\{encodeURIComponent\(employeeId\)\}\/leave-entitlement/);
  for (const label of [
    "Yıllık İzin Hakediş / Bakiye",
    "Hakediş",
    "Devreden",
    "Toplam Hak",
    "Kullanılan",
    "Kalan",
    "Hakediş Geçmişi",
  ]) assert.ok(page.includes(label), `Eksik yıllık izin alanı: ${label}`);

  assert.match(page, /leaveEntitlement\.remaining/);
  assert.match(page, /leaveEntitlement\?\.used/);
  assert.match(page, /leaveLedgerRows/);
});

test("annual leave used balance and IK leave history use modern PDKS plus legacy history without exact duplicates", () => {
  const modern = api("ik-pdks-modern.ts");
  const personnel = api("ik-personnel-control.ts");

  assert.match(modern, /async function annualLeaveUsed/);
  assert.match(modern, /FROM ik_leave_plans/);
  assert.match(modern, /FROM hr_leave_records_v2/);
  assert.match(modern, /const seen = new Set<string>\(\)/);
  assert.match(modern, /const used = await annualLeaveUsed/);

  assert.match(personnel, /modernLeaves/);
  assert.match(personnel, /legacyLeaves/);
  assert.match(personnel, /FROM ik_leave_plans/);
  assert.match(personnel, /FROM hr_leave_records_v2/);
  assert.match(personnel, /const leaveKeys = new Set<string>\(\)/);
});

test("PDKS remains the operational owner of leave movement and attendance", () => {
  const pdks = frontend("services/pdksApi.js");
  assert.match(pdks, /previewPdksLeaveV2/);
  assert.match(pdks, /savePdksLeaveV2/);
  assert.match(pdks, /getPdksAttendance/);
  assert.match(pdks, /getPdksLeaveEntitlement/);
});

test("IK payment outputs keep EK visible and A4 list readable", () => {
  const monthly = frontend("pages/modules/IkAdvancedMonthly.jsx");

  assert.match(monthly, /A4 yatay okunaklı ödeme özeti/);
  assert.match(monthly, /Personel \/ HKN/);
  assert.match(monthly, /class="ek-positive"/);
  assert.match(monthly, /extra-coupon/);
  assert.match(monthly, /compact-extra/);
  assert.match(monthly, /✂ EK ÖDEME/);
  assert.match(monthly, /index \+= 10/);
  assert.match(monthly, /A4 başına 10 adet kesimli toplu ödeme fişi/);
});
