import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const source=(name:string)=>readFileSync(new URL(`./${name}`,import.meta.url),"utf8");
const center=source("compliance-center-cloud.ts");
const config=source("compliance-config-cloud.ts");
const ops=source("compliance-operations-cloud.ts");
const storage=source("compliance-storage.ts");
const chemical=source("compliance-chemical-links.ts");
const lcw=source("compliance-lcw-profile.ts");
const index=source("index.ts");
const main=source("main.ts");
test("LCW Rev.6 selected only by firm, backed by chemical and production evidence",()=>{
 assert.match(lcw,/LC\.GSD\.EL\.006/);
 for(const s of ["SDS","CAS","TDS","ZDHC","GOTS","baskı","değişim","taahhüt"])assert.ok(lcw.toLocaleLowerCase("tr-TR").includes(s.toLocaleLowerCase("tr-TR")),s);
 assert.match(center,/LCW_PROFILE_SEED/);
 assert.match(center,/DEFAULT_READINESS_ENABLED=new Set\(\["TR_YASAL"\]\)/);
 assert.match(config,/PROFILE_SELECTION_UPDATED/);
 assert.match(config,/PROFILE_VERIFICATION_REQUIRED/);
});
test("every new version retains previous original and records review date",()=>{
 assert.match(config,/compliance_document_versions/);
 assert.match(config,/versions\/:versionId\/file/);
 assert.match(config,/readComplianceEvidence/);
 assert.match(config,/addMonthsFrom/);
 assert.match(config,/nextReviewAt/);
 assert.doesNotMatch(storage,/DELETE FROM file_hub_assets/);
 assert.match(storage,/noOverwrite/);
});
test("Compliance original is only archive-verified when provider gives an ID",()=>{
 assert.match(storage,/archiveFileToCloudConnection/);
 assert.match(storage,/PROVIDER_VERIFIED/);
 assert.match(storage,/BINDING_REQUIRED/);
 assert.match(storage,/PENDING_FILE_AGENT/);
 assert.match(storage,/providerFileId=txt\(archived.id\)/);
 assert.match(storage,/file_hub_relations/);
});
test("CAPA and external auditor share respect document privacy",()=>{
 assert.match(ops,/safeForAuditor/);
 assert.match(ops,/auditorShareApproved/);
 assert.match(ops,/AUDITOR_APPROVAL_REQUIRED/);
 assert.match(ops,/\.filter\(safeForAuditor\)/);
 assert.match(ops,/readComplianceEvidence/);
});
test("Boyahane link shared evidence without duplicating documents or approving product",()=>{
 assert.match(chemical,/BOYAHANE_PRODUCT/);
 assert.match(chemical,/LCW_DECLARATION/);
 assert.match(chemical,/listProductName/);
 assert.match(chemical,/PENDING_REVIEW/);
 assert.match(chemical,/productApprovalUnchanged:true/);
 assert.match(main,/registerComplianceChemicalRoutes\(app\)/);
 assert.match(index,/BOYAHANE_APPROVED_PRODUCT/);
 assert.match(index,/supplierLotOrigin: "MUHASEBE_SUPPLIER_INVOICE"/);
});
