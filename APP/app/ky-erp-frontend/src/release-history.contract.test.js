import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {changeStatus,releaseEvidence,releaseKind,verifiedRelease,firstVerifiedRun,moduleOf,QA_MODULES} from "./services/releaseHistory.js";

const front={ready:true,shas:new Set(["merged-both","merged-web"])};
const worker={ready:true,shas:new Set(["merged-both","merged-worker"])};
test("release type is tied only to known production workflows",()=>{
  assert.equal(releaseKind({name:"KY ERP Frontend Canonical Deploy"}),"FRONTEND");
  assert.equal(releaseKind({name:"KY ERP Worker Canli Yayin"}),"WORKER");
  assert.equal(releaseKind({name:"KY ERP Canli Yayin - Hedefli D1 + Worker + Pages"}),"BOTH");
  assert.equal(releaseKind({name:"KY ERP Canonical UI Acceptance"}),"OTHER");
});
test("CI passing or a queued workflow cannot be represented as a live release",()=>{
  assert.equal(verifiedRelease({name:"KY ERP Canonical UI Acceptance",status:"completed",conclusion:"success"}),false);
  assert.equal(verifiedRelease({name:"KY ERP Frontend Canonical Deploy",status:"queued",conclusion:null}),false);
  assert.equal(verifiedRelease({name:"KY ERP Frontend Canonical Deploy",status:"completed",conclusion:"failure"}),false);
  assert.equal(verifiedRelease({name:"KY ERP Frontend Canonical Deploy",status:"completed",conclusion:"success"}),true);
});
test("merged PR is not proof of production; published ancestry determines status",()=>{
  assert.equal(changeStatus({draft:true,merged_at:null},front,worker).level,"draft");
  assert.equal(changeStatus({state:"open",merged_at:null},front,worker).level,"open");
  assert.equal(changeStatus({merged_at:"2026-10-09",merge_commit_sha:"not-deployed"},front,worker).level,"merged");
  assert.equal(changeStatus({merged_at:"2026-10-09",merge_commit_sha:"merged-web"},front,worker).level,"partial");
  assert.equal(changeStatus({merged_at:"2026-10-09",merge_commit_sha:"merged-both"},front,worker).level,"live");
  assert.equal(releaseEvidence("merged-worker",front,worker).api,true);
});
test("unavailable GitHub ancestry fails closed to no live claim",()=>{
  assert.equal(releaseEvidence("merged-both",{ready:false,shas:new Set(["merged-both"])},{ready:false,shas:new Set(["merged-both"])}).level,"unknown");
  assert.equal(firstVerifiedRun([{name:"KY ERP Worker Canli Yayin",status:"completed",conclusion:"failure"}],"WORKER"),null);
});
test("module classification and real owner menu present",()=>{
  assert.equal(moduleOf("PDKS cihaz ve puantaj"),"PDKS");
  assert.equal(moduleOf("İK yıllık izin"),"İK");
  const hub=readFileSync("src/pages/admin/AdminPlatformHub.jsx","utf8");
  const screen=readFileSync("src/pages/admin/AdminReleaseHistory.jsx","utf8");
  const registry=readFileSync("src/app/moduleRegistryBase.js","utf8");
  assert.match(hub,/Güncelleme Geçmişi/);
  assert.match(hub,/AdminReleaseHistory/);
  assert.match(screen,/GitHub'dan Yenile/);
  assert.match(screen,/\/actions\/runs/);
  assert.match(screen,/\/commits\?sha=/);
  assert.match(registry,/guncelleme-gecmisi/);
});

test("common Turkish words do not falsely turn platform release into accounting",()=>{
  assert.equal(moduleOf("feat: Güncelleme Geçmişi — gerçek GitHub PR ve canlı yayın"),"Platform");
  assert.notEqual(moduleOf("gerçek site kontrolü"),"Muhasebe");
  assert.equal(moduleOf("İK yıllık izin sicili"),"İK");
  assert.equal(moduleOf("çek ödemesi cari mahsup"),"Muhasebe");
  assert.equal(moduleOf("Günlük Operasyon PDKS dışı çalışma kaydı"),"Günlük Operasyon");
});
test("entire canonical module inventory is in management QA dashboard without false E2E pass",()=>{
  assert.equal(QA_MODULES.length,14);
  assert.equal(new Set(QA_MODULES.map(row=>row.name)).size,14);
  assert.ok(QA_MODULES.every(row=>row.route.startsWith("/")&&row.check));
  const screen=readFileSync("src/pages/admin/AdminReleaseHistory.jsx","utf8");
  assert.match(screen,/QA_MODULES.map/);
  assert.match(screen,/Modül Kontrolleri/);
  assert.match(screen,/Yetkili uçtan uca test bekliyor/);
  assert.match(screen,/moduleOf\(pr.title\)===module/);
});

test("existing KY ERP TEST account has an explicitly scoped owner-only safe test control",()=>{
  const panel=readFileSync("src/pages/admin/AdminUsersPanelV2.jsx","utf8");
  assert.match(panel,/selectedRole==="VIEWER"/);
  assert.match(panel,/selectedUser\?\.mainCompanySlug\|\|""\)==="kyerp-test"/);
  assert.match(panel,/selectedUser\?\.username\|\|""\)/);
  assert.match(panel,/isOwner \|\| !isQaTestAccount/);
  assert.match(panel,/moduleKey!==["']ADMIN["']/);
  assert.match(panel,/canCreate:false,canUpdate:false,canDelete:false,canApprove:false/);
  assert.match(panel,/updateUserPermissions\(selectedUser.id,readOnly\)/);
  assert.match(panel,/updateLoginSecurityPolicy\(selectedUser.id,\{loginPolicy:"PASSWORD_ONLY"/);
  assert.match(panel,/KY ERP TEST · Güvenli Testi Hazırla/);
});
test("general users still have enforced MFA selection",()=>{
  const panel=readFileSync("src/pages/admin/AdminUsersPanelV2.jsx","utf8");
  assert.match(panel,/isQaTestAccount&&qaReadOnlyReady&&<option value="PASSWORD_ONLY"/);
  assert.match(panel,/loginPolicy:createForm.loginPolicy==="PASSWORD_ONLY"\?"ANY_MFA"/);
});
