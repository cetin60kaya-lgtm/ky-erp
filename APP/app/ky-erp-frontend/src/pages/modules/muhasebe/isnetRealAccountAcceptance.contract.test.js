import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const screen=readFileSync(new URL("./IsnetLiveAcceptanceQA.jsx",import.meta.url),"utf8");
const parent=readFileSync(new URL("./EBelgeIsnetPortalSync.jsx",import.meta.url),"utf8");
test("gerçek İşNet kabulü: kullanıcı girişi → firma seç → belge listele",()=>{
 assert.match(screen,/type="password" autoComplete="off"/);
 assert.match(screen,/connectionMode: "api"/);
 assert.match(screen,/apiPost\("\/isnet\/settings\/test"/);
 assert.match(screen,/apiPut\("\/isnet\/settings"/);
 assert.match(screen,/apiGet\("\/isnet\/qa\/documents"/);
 assert.match(screen,/login\.companies\.map/);
 assert.match(parent,/onConnected=\{\(\) => void refresh\(\)\}/);
});
test("En fazla iki gerçek belge, XML ve PDF seçili indirme, D1/R2 yazımı yok",()=>{
 assert.match(screen,/selected\.length < 2/);
 assert.match(screen,/download\(row, "xml"\)/);
 assert.match(screen,/download\(row, "pdf"\)/);
 assert.match(screen,/apiFetch\("\/isnet\/qa\/download"/);
 assert.match(screen,/responseType: "blob"/);
 assert.match(screen,/saveFile\(blob, fileName\)/);
 assert.doesNotMatch(screen,/127\.0\.0\.1|localStorage|sessionStorage|api\/Invoice\/Send|api\/Invoice\/Approve/);
});
