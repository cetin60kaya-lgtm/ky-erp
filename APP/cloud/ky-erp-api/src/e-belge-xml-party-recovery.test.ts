import test from "node:test";
import assert from "node:assert/strict";
import {verifiedXmlPartyRecoveryDecision as check} from "./e-belge-xml-party-recovery";
const old={document_no:"TTB2026000002001",party_tax_no:"1234567890",party_name:"ÖRNEK TEKSTİL",issue_date:"2026-06-02",document_type:"GELEN_FATURA",direction:"INCOMING",status:"REVIEW_REQUIRED",record_scope:"OFFICIAL",uuid:"uuid-123",party_company_id:null};
const xml={documentNo:"TTB2026000002001",partyTaxNo:"1234567890",partyName:"ÖRNEK TEKSTİL",issueDate:"2026-06-02",documentType:"GELEN_FATURA",direction:"INCOMING",uuid:"uuid-123",rawMetadata:{ublVerified:true},directionNeedsReview:false};
test("aynı resmi XML: sadece eşleşmeyen açık cari tamamlama izinli",()=>assert.deepEqual(check(old,xml),{ok:true,code:"VERIFIED_XML_RECOVERY_ELIGIBLE"}));
test("yayımlanmış ve kesin mali belge değiştirilemez",()=>{for(const status of ["POSTED","FINALIZING","FINALIZE_RETRY","APPROVED"])assert.equal(check({...old,status},xml).ok,false)});
test("VKN, belge no, tarih, tür, yön veya UUID farkı otomatik cariyi engeller",()=>{
 for(const [property,newValue] of [["documentNo","TTB2026000002002"],["partyTaxNo","1234567891"],["issueDate","2026-06-03"],["documentType","GIDEN_FATURA"],["direction","OUTGOING"],["uuid","uuid-999"]] as const){
  assert.equal(check(old,{...xml,[property]:newValue}).ok,false,property);
 }
});
test("OCR veya XML kimliği kanıtlanmamış belge firmanın otomatik oluşumuna girmez",()=>{
 assert.equal(check(old,{...xml,rawMetadata:{}}).code,"UBL_XML_NOT_VERIFIED");
 assert.equal(check(old,{...xml,directionNeedsReview:true}).code,"XML_DIRECTION_REVIEW");
 assert.equal(check({...old,record_scope:"GAYRIRESMI"},xml).code,"DOCUMENT_NOT_OFFICIAL");
});
test("zaten cari seçilmiş belgenin firma kimliği değiştirilmez",()=>{
 assert.equal(check({...old,party_company_id:"company-1"},xml).code,"COMPANY_ALREADY_LINKED");
});
