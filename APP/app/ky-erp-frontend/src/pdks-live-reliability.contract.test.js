import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pdksLivePresentation } from "./services/pdksLivePresentation.js";

test("offline terminal never certifies all 18 people absent", () => {
  const view = pdksLivePresentation({ activePersonnel:18, absent:18, deviceCount:1, onlineDevices:0 }, "", new Date());
  assert.equal(view.fresh,true);
  assert.equal(view.terminalsOffline,true);
  assert.equal(view.provisionalAbsence,true);
  assert.equal(view.absenceValue,"—");
  assert.match(view.absenceDetail,/18 devamsızlık adayı/);
  assert.match(view.badge,/terminal çevrimdışı/);
});
test("fresh online terminal retains real metric; failed API never presents fresh totals",()=>{
  const ok = pdksLivePresentation({ activePersonnel:18, absent:2, deviceCount:1, onlineDevices:1 },"",new Date());
  assert.equal(ok.absenceValue,2);
  assert.equal(ok.provisionalAbsence,false);
  const failed = pdksLivePresentation({ activePersonnel:18, absent:18, deviceCount:1, onlineDevices:1 },"network error",new Date());
  assert.equal(failed.fresh,false);
  assert.equal(failed.absenceValue,"—");
  assert.equal(failed.badge,"API hatası");
  const initial = pdksLivePresentation({}, "", null);
  assert.equal(initial.fresh,false);
  assert.equal(initial.absenceValue,"—");
});
test("live screen bypasses IndexedDB and HTTP caches",()=>{
  const api=readFileSync("src/services/pdksApi.js","utf8");
  const ui=readFileSync("src/pages/pdks/PdksLiveHome.jsx","utf8");
  const start=api.indexOf("export async function getPdksLiveDashboard");
  const end=api.indexOf("export async function getPdksModernConfig",start);
  const fn=api.slice(start,end);
  assert.ok(start>=0);
  assert.match(fn,/apiGet\("\/ik\/personnel-control\/dashboard-live"/);
  assert.match(fn,/forceFresh: true/);
  assert.doesNotMatch(fn,/pdksCachedGet/);
  assert.match(ui,/display\.terminalsOffline/);
  assert.match(ui,/Eski kart kayıtları canlı veri olarak gösterilmiyor/);
});
