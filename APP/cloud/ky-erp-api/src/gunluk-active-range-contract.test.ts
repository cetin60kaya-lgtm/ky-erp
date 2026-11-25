import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker=readFileSync(new URL("./gunluk-operasyon-cloud.ts",import.meta.url),"utf8");
const api=readFileSync(new URL("../../../app/ky-erp-frontend/src/services/dailyOpsApi.js",import.meta.url),"utf8");
const ui=readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/modules/ik/DailyHrWorkspace.jsx",import.meta.url),"utf8");

test("aktif dönem firma bazında tek D1 kaydı; personel, vardiya ve ödeme tablolarına bağlı değil",()=>{
 assert.match(worker,/CREATE TABLE IF NOT EXISTS hr_daily_active_range/);
 assert.match(worker,/main_company_id TEXT PRIMARY KEY/);
 assert.match(worker,/version INTEGER NOT NULL DEFAULT 1/);
 assert.match(worker,/app.get\("\/api\/gunluk-operasyon\/active-range", protect\(getActiveDailyRange\)\)/);
 assert.match(worker,/app.post\("\/api\/gunluk-operasyon\/active-range", protect\(saveActiveDailyRange\)\)/);
 const write=worker.split("async function saveActiveDailyRange")[1]?.split("async function listRoster")[0];
 assert.ok(write);
 assert.match(write,/ON CONFLICT\(main_company_id\) DO UPDATE/);
 assert.match(write,/WHERE hr_daily_active_range\.version=\?/);
 assert.match(write,/SHARED_RANGE_CONFLICT/);
 assert.doesNotMatch(write,/DELETE FROM|hr_daily_range_roster|hr_daily_attendance|hr_daily_payment_items/);
});
test("14–22 Kasım gibi 9 günlük özel dönem tek kayıtta korunur; otomatik hafta sıfırlaması yok",()=>{
 assert.match(api,/export async function getDailyActiveRange/);
 assert.match(api,/export async function saveDailyActiveRange/);
 assert.match(ui,/const \[rangeDraft, setRangeDraft\] = useState\(readRange\)/);
 assert.match(ui,/expectedVersion: sharedVersionRef\.current/);
 assert.match(ui,/await saveDailyActiveRange\(/);
 assert.match(ui,/applyVerifiedRange\(data, initial \? "initial" : "remote"\)/);
 assert.match(ui,/onClick=\{\(\) => void setSafeRange\(rangeDraft\)\}/);
 assert.match(ui,/window\.setInterval\(\(\) => \{ if \(!document\.hidden\) void refreshSharedRange\(\); \}, 30000\)/);
 assert.match(ui,/const weeklyFinancialReady = sharedRangeReady && sharedRangeConfigured/);
 assert.match(ui,/const rosterWriteBlocked = Boolean\(dailyWriteGate/);
});

test("stale nonzero version cannot initialize missing range and readback matches requested dates",()=>{
 assert.match(worker,/SELECT \?,\?,\?,1,CURRENT_TIMESTAMP WHERE \?=0 OR EXISTS/);
 assert.match(worker,/\.bind\(companyId,start,end,expected,companyId,expected,expected\)/);
 assert.match(worker,/dateOnly\(saved\.start_date\)!==start \|\| dateOnly\(saved\.end_date\)!==end/);
});
