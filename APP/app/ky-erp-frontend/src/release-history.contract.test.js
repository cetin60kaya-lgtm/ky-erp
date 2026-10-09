import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {changeStatus,releaseEvidence,releaseKind,verifiedRelease,firstVerifiedRun,moduleOf} from "./services/releaseHistory.js";

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
