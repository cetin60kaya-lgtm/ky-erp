import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("PDKS screens are code-split to keep unrelated modules out of every menu transition", () => {
  const shell = source("../pages/modules/PdksPage.jsx");
  assert.match(shell, /lazy\(\(\) => import\("\.\.\/pdks\/PdksPersonnelDesk"\)\)/);
  assert.match(shell, /lazy\(\(\) => import\("\.\/PdksPageV2"\)\)/);
  assert.match(shell, /<Suspense fallback=/);
});

test("Legacy PDKS menu loads leave holiday and audit data only on their own tab", () => {
  const page = source("../pages/modules/PdksPageV2.jsx");
  assert.match(page, /activeTab === "tatiller" \? getPdksHolidays/);
  assert.match(page, /activeTab === "izinler" \? getPdksLeaveCenter/);
  assert.match(page, /activeTab === "raporlar" \? getPdksAuditLogs/);
  assert.match(page, /"ana-ekran", "giris-cikislar", "puantaj", "calisma-tarihi"\]\.includes\(activeTab\)/);
});

test("Person switching rejects stale responses and leave requests are lazy", () => {
  const page = source("../pages/pdks/PdksPersonnelDesk.jsx");
  assert.match(page, /\+\+detailRequest\.current/);
  assert.match(page, /request!==detailRequest\.current/);
  assert.match(page, /activeKey&&loadedKey===activeKey\?attendance:null/);
  assert.match(page, /centerTab!=="izin"&&modal!=="leave"/);
});

test("Offline PDKS cannot silently mark admin writes successful or replay old writes", () => {
  const store = source("./pdksOfflineStore.js");
  assert.match(store, /PDKS_ONLINE_CONFIRMATION_REQUIRED/);
  assert.match(store, /automaticReplayDisabled: true/);
  assert.doesNotMatch(store, /offlineQueued: true/);
  assert.match(store, /if \(!networkFailure\(error\) \|\| !scope \|\| !OFFLINE_READ_KEYS\.test\(key\)\) throw error/);
  assert.match(store, /if \(Number\(error\?\.status \|\| 0\) >= 400\) return false/);
});

test("Incomplete monthly reports cannot be exported as correct payroll evidence", () => {
  const page = source("../pages/pdks/PdksReportCenter.jsx");
  assert.match(page, /const exportReady=!busy&&!error&&!incompleteCount/);
  assert.match(page, /disabled=\{!exportReady\}/);
  assert.match(page, /row\.loadError\?"—"/);
  assert.match(page, /setProgress\(output\.length\)/);
});
