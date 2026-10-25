import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentAccountingMonth, validAccountingMonth, managementOverviewValues } from "./managementOverviewPeriod.js";

test("ay doğrulaması 2026-01..12 aralığındadır", () => {
  assert.match(currentAccountingMonth(), /^\d{4}-(0[1-9]|1[0-2])$/);
  for (const value of ["2026-01", "2026-12"]) assert.equal(validAccountingMonth(value), true);
  for (const value of ["2026-00", "2026-13", "2026-1", "2026-10-25", ""]) assert.equal(validAccountingMonth(value), false);
});
test("özet sıfır değerini kaynak yoktan ayırır, hatalı sayı gizlenmez", () => {
  assert.deepEqual(managementOverviewValues({}), { receivable:null, payable:null,incoming:null,outgoing:null,upcomingChecks:null,incomingVat:null,outgoingVat:null });
  const values=managementOverviewValues({toplamAlacak:0,toplamBorc:25,buAyGelenFatura:100,buAyKesilenFatura:200, gelenKdv:20,gidenKdv:40,yaklasanCekToplami:0});
  assert.equal(values.receivable,0);
  assert.equal(values.incoming,100);
  assert.equal(values.outgoingVat,40);
  assert.equal(managementOverviewValues({toplamAlacak:"abc"}).receivable,null);
});
test("ana firma, dönemsellik ve eski yanıt koruması yönetim görünümüne bağlıdır",()=>{
  const ui=readFileSync(new URL("./ManagementOverviewWorkspace.jsx",import.meta.url),"utf8");
  assert.match(ui,/!activeMainCompany\?\.slug && !activeMainCompany\?\.id/);
  assert.match(ui,/year: Number\(period\.slice\(0, 4\)\)/);
  assert.match(ui,/month: Number\(period\.slice\(5, 7\)\)/);
  assert.match(ui,/ticket !== seq\.current/);
  assert.match(ui,/invoicePeriod !== period/);
  assert.match(ui,/Güncel toplam alacak/);
  assert.match(ui,/Seçili dönem gelen KDV/);
});
