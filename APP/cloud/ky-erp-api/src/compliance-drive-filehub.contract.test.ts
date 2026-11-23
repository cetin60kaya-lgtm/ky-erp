import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read=(name:string)=>readFileSync(new URL("./"+name,import.meta.url),"utf8");
const b=read("compliance-file-hub-bridge.ts");
const center=read("compliance-center-cloud.ts");
const config=read("compliance-config-cloud.ts");
const storage=read("compliance-storage.ts");
const main=read("main.ts");
const ui=readFileSync(new URL("../../../app/ky-erp-frontend/src/pages/modules/compliance/ComplianceCenterPage.jsx",import.meta.url),"utf8");

test("Denetim yalnız firma bazında File Hub dosyası ve bağlantı atamasını görür",()=>{
 assert.match(b,/getAuthenticatedUser/);
 assert.match(b,/TENANT_FORBIDDEN/);
 assert.match(b,/ownerOnly/);
 assert.match(b,/b\.main_company_slug=\?/);
 assert.match(b,/a\.main_company_slug=\?/);
 assert.match(b,/module_code='DENETIM'/);
 for(const purpose of ["AUDIT_EVIDENCE","AUDIT_REPORT","MSDS","TDS","PERIODIC_MAINTENANCE"])
  assert.ok(b.includes(purpose),purpose);
});
test("Mevcut orijinal dosya bağlama, fiziksel kopya ve dosya taşıma yapmaz",()=>{
 assert.match(b,/attach-file-hub/);
 assert.match(b,/streamComplianceFileHubAsset/);
 assert.match(b,/await probe\.body\?\.cancel\(\)/);
 assert.match(b,/c\.env\.DB\.batch\(statements\)/);
 assert.match(b,/copyCreated:false/);
 assert.match(b,/physicalMove:false,physicalCopy:false/);
 assert.doesNotMatch(b,/\.FILES\.put\(/);
 assert.match(b,/file_hub_locations/);
 assert.match(b,/PENDING/);
});
test("Revizyonlar ve arşiv geçmişindeki dosya okuma korunur",()=>{
 assert.match(center,/archived=c\.req\.query\("archived"\)==="true"/);
 assert.match(center,/archived\?"archived_at IS NOT NULL":"archived_at IS NULL"/);
 assert.match(center,/app\.post\("\/api\/compliance\/documents\/:id\/archive"/);
 assert.match(config,/compliance_document_versions/);
 assert.match(config,/versions\/:versionId\/file/);
 assert.match(config,/approvalStatus:'PENDING',auditorShareApproved:false/);
 assert.match(storage,/noOverwrite/);
 assert.doesNotMatch(storage,/DROP TABLE|DELETE FROM compliance_document_versions/i);
});
test("Ayarlar ekranında fiziksel File Hub atamaları ve mevcut dosya bağlantısı gösterilir",()=>{
 assert.match(ui,/compliance\/file-hub\/readiness/);
 assert.match(ui,/compliance\/file-hub\/candidates/);
 assert.match(ui,/attach-file-hub/);
 assert.match(ui,/Arşivdekiler/);
 assert.match(ui,/File Hub \/ DENETIM Fiziksel Klasör Atamaları/);
 assert.match(main,/registerComplianceFileHubBridgeRoutes\(app\)/);
});
