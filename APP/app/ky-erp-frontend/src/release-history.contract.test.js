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


test("KY ERP TEST preparation only removes privileges and preserves canonical MFA",()=>{
  const panel=readFileSync("src/pages/admin/AdminUsersPanelV2.jsx","utf8");
  assert.match(panel,/selectedRole==="VIEWER"/);
  assert.match(panel,/selectedUser\?\.mainCompanySlug\|\|""\)==="kyerp-test"/);
  assert.match(panel,/selectedUser\?\.username\|\|""\)/);
  assert.match(panel,/isOwner \|\| !isQaTestAccount/);
  assert.match(panel,/moduleKey!=="ADMIN"/);
  assert.match(panel,/canCreate:false,canUpdate:false,canDelete:false,canApprove:false/);
  assert.match(panel,/updateUserPermissions\(selectedUser.id,readOnly\)/);
  assert.match(panel,/persisted=normalizePermissions\(await getUserPermissions\(selectedUser.id\)\)/);
  assert.match(panel,/revokeAllUserSessions\(selectedUser.id\)/);
  assert.match(panel,/MFA tüm hesaplarda korunur/);
  assert.doesNotMatch(panel,/Sadece Parolayı Etkinleştir/);
  assert.doesNotMatch(panel,/<option value="PASSWORD_ONLY"/);
});
test("all normal login settings use enforced second factor, never bypass MFA",()=>{
  const panel=readFileSync("src/pages/admin/AdminUsersPanelV2.jsx","utf8");
  assert.match(panel,/loginPolicy:createForm.loginPolicy==="PASSWORD_ONLY"\?"ANY_MFA"/);
  assert.match(panel,/sessionSeconds:36000,approvalRequired/);
  assert.match(panel,/Canlı D1 güvenlik kuralı yalnız parolalı girişi yasaklıyor/);
  assert.match(panel,/KY Güvenlik \/ Google \/ Microsoft doğrulaması korunur/);
});

test("KY ERP TEST signed-in company never falls back to Hakan Emprime", async () => {
  const {maySwitchCompany,companyForRestrictedUser,permittedCompanySelection}=await import("./utils/companyAccessScope.js");
  const viewer={id:"qa",username:"test",role:"VIEWER",mainCompanySlug:"kyerp-test"};
  assert.equal(maySwitchCompany("SUPER_ADMIN"),true);
  assert.equal(maySwitchCompany("ADMIN"),true);
  assert.equal(maySwitchCompany("VIEWER"),false);
  assert.equal(maySwitchCompany("COMPANY_ADMIN"),false);
  const restricted=permittedCompanySelection(viewer,[{slug:"mecit-hakan",name:"Hakan Emprime"}],"mecit-hakan");
  assert.equal(restricted.companies.length,1);
  assert.equal(restricted.active.slug,"kyerp-test");
  assert.equal(restricted.active.name,"KY ERP TEST");
  assert.equal(restricted.locked,true);
  assert.equal(companyForRestrictedUser({role:"VIEWER",mainCompanySlug:""}),null);
  assert.equal(permittedCompanySelection({role:"VIEWER",mainCompanySlug:""},[{slug:"mecit-hakan"}],"mecit-hakan").active,null);
  assert.equal(permittedCompanySelection({role:"SUPER_ADMIN"},[{slug:"mecit-hakan"}],"mecit-hakan").active.slug,"mecit-hakan");
  const context=readFileSync("src/context/ActiveCompanyContext.jsx","utf8");
  assert.match(context,/permittedCompanySelection\(user, companies, activeCompanySlug\)/);
  assert.match(context,/if \(!globalNavigation\)/);
  assert.match(context,/if \(!globalNavigation && requested !== ownCompany\?\.slug\) return/);
  assert.match(context,/setApiActiveMainCompany\(activeCompany\)/);
});
test("accounting access-denied is not retried as a production fault for read-only QA",()=>{
  const screen=readFileSync("src/pages/modules/muhasebe/ManagementOverviewWorkspace.jsx","utf8");
  const parent=readFileSync("src/pages/modules/MuhasebePage.jsx","utf8");
  assert.match(screen,/Bu hesabın finansal yönetim özetine erişim yetkisi bulunmuyor/);
  assert.match(screen,/!state.denied && <button/);
  assert.match(parent,/auth_error: restrictedUser \? "Kısıtlı erişim"/);
  assert.match(parent,/!restrictedUser && <div className="accounting-quick-wrap"/);
});
