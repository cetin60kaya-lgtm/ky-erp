import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const policy = JSON.parse(read("./FileHubFolderPolicy.v1.json"));
const release = JSON.parse(read("./KyErpDesktopReleaseManifest.v1.json"));
const ui = read("./AdminStorageCenter.jsx");

test("all company folder rules are purpose-based and versioned, not hard-coded to one company", () => {
  assert.equal(policy.schemaVersion, "1.0.0");
  assert.equal(policy.initialModulePurposeAssignments.length, 52);
  assert.equal(policy.activationStatus, "DESIGN_ONLY_NEW_ITEMS_NOT_YET_DEPLOYED");
  assert.ok(!policy.initialModulePurposeAssignments.some(item => JSON.stringify(item).includes("Hakan Emp")));
  const ids = policy.initialModulePurposeAssignments.map(p => p.moduleCode + "/" + p.purposeCode);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of policy.initialModulePurposeAssignments) {
    assert.ok(item.moduleCode && item.purposeCode && item.label);
    assert.match(item.implementationStatus, /^(KOD_KATALOG|PLAN_YENI)$/);
    assert.equal(Object.hasOwn(item, "rootPath"), false);
  }
});

test("model card shared views never expose original PSD to other modules", () => {
  const select=(m,p)=>policy.initialModulePurposeAssignments.find(x=>x.moduleCode===m&&x.purposeCode===p);
  assert.equal(select("DESEN","MODEL_IMAGE").implementationStatus,"KOD_KATALOG");
  assert.ok(select("DESEN","PLACEMENT").readContext.includes("IMALAT"));
  assert.equal(select("DESEN","MODEL_SOURCE").readContext,"DESEN");
  assert.equal(select("DESEN","MODEL_PSD_PREVIEW").implementationStatus,"PLAN_YENI");
  assert.equal(select("IMALAT","CUSTOMER_DISPATCH").accessPolicy,"BELGE_MODELE_GORE");
  assert.equal(select("MUHASEBE","INVOICE").readContext,"MUHASEBE");
  assert.equal(select("IK","EMPLOYEE_MEDICAL").accessPolicy,"IK_HASSAS");
});

test("app exposes per-company purpose map but disables unsupported purposes", () => {
  assert.match(ui,/import fileHubFolderPolicy from "\.\/FileHubFolderPolicy\.v1\.json"/);
  assert.match(ui,/\["map","Klasör Haritası"\]/);
  assert.match(ui,/mapModule==="ALL"\|\|x\.moduleCode===mapModule/);
  assert.match(ui,/STORAGE_PURPOSES_BY_MODULE\[item\.moduleCode\]\?\.includes\(item\.purposeCode\)/);
  assert.match(ui,/if\(matched\)\{selectBinding\(matched\)\}/);
  assert.match(ui,/moduleCode:item\.moduleCode,purposeCode:item\.purposeCode/);
  assert.match(ui,/Gerçek bağlantılar firma D1 kaydından alınır/);
});

test("admin can unlink one folder binding with confirmation without deleting files", () => {
  assert.match(ui,/async function removeCurrentBinding\(\)/);
  assert.match(ui,/window\.confirm\(question\)/);
  assert.match(ui,/method:"DELETE"/);
  assert.match(ui,/mainCompanySlug="\+encodeURIComponent\(slug\)/);
  assert.match(ui,/Fiziksel dosyalar ve diğer bölüm bağlantıları korundu/);
  assert.match(ui,/Bağlantıyı Kaldır \(Dosyayı Silmez\)/);
});

test("desktop setup download cannot activate without real release URL and SHA", () => {
  assert.equal(release.releaseStatus,"TEST_LOCAL_ONLY");
  assert.equal(release.downloadUrl,null);
  assert.equal(release.setupSha256,null);
  assert.match(release.risk,/PDKS/i);
  assert.match(ui,/desktopRelease\.releaseStatus==="PUBLISHED"/);
  assert.match(ui,/\^\[a-f0-9\]\{64\}\$/i);
  assert.match(ui,/\["desktop","Masaüstü Kurulum"\]/);
});
