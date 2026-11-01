import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {STORAGE_MODULES,STORAGE_PURPOSES_BY_MODULE,STORAGE_DOCUMENT_TYPES,isSensitiveStoragePurpose} from "./StorageDocumentCatalog.js";
const page=readFileSync(new URL("./AdminStorageCenter.jsx",import.meta.url),"utf8");
const css=readFileSync(new URL("./StorageOperationsPolish.css",import.meta.url),"utf8");

test("tek merkez bütün KY ERP belgelerinin bölüm ve belge türlerini tanımlar",()=>{
 for(const module of ["DESEN","DTF","IMALAT","BOYAHANE","MUHASEBE","EBELGE","CARI","KASA","IK","PDKS","DENETIM","STOK","FIRMA","GENEL"]){
  assert.ok(STORAGE_MODULES.includes(module),module);
  assert.ok(STORAGE_PURPOSES_BY_MODULE[module]?.length,module);
 }
 const values=new Set(STORAGE_DOCUMENT_TYPES.map(([id])=>id));
 for(const code of ["INVOICE","DELIVERY_NOTE","E_INVOICE_XML","E_DELIVERY_NOTE","CHEQUE","PROMISSORY_NOTE","BANK_RECEIPT","EXPENSE_RECEIPT","PERSONNEL_DOCUMENT","EMPLOYEE_ID","EMPLOYEE_LEAVE","EMPLOYEE_PAYROLL","EMPLOYEE_MEDICAL","ATTENDANCE_REPORT","AUDIT_REPORT","AUDIT_EVIDENCE","MODEL_IMAGE"]){
  assert.ok(values.has(code),code);
 }
 assert.equal(values.size,STORAGE_DOCUMENT_TYPES.length);
});
test("hassas personel, banka ve denetim türlerinde başlangıç yazma ve senkron pasif",()=>{
 for(const purpose of ["EMPLOYEE_ID","EMPLOYEE_MEDICAL","EMPLOYEE_PAYROLL","CHEQUE","AUDIT_EVIDENCE"])
 assert.equal(isSensitiveStoragePurpose(purpose),true);
 assert.match(page,/writeEnabled:!isSensitiveStoragePurpose\(purposeCode\)/);
 assert.match(page,/syncEnabled:!isSensitiveStoragePurpose\(purposeCode\)/);
 assert.match(page,/storage-sensitive-warning/);
});
test("gerçek kimlik doğrulamalı önizleme/indirme, mobil kart ve dosya kapsamı",()=>{
 assert.match(page,/apiFetch\(\x60\/file-hub\/files\//);
 assert.match(page,/responseType:"blob"/);
 assert.match(page,/\/file-hub\/cloud\/files\//);
 assert.match(page,/downloadFile\(path,\{mainCompanySlug:slug\}/);
 assert.match(page,/storage-mobile-files/);
 assert.match(page,/storage-preview-panel/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.storage-mobile-file/);
 assert.match(page,/rootPath:v\.path\?\?""/);
});
