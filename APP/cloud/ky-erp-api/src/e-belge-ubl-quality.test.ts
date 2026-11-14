import test from "node:test";
import assert from "node:assert/strict";
import { parseCanonicalEBelgeUbl } from "./e-belge-ubl.ts";

const fixture=(extra="",customerTax="9876543210")=>`<?xml version="1.0"?>
<Invoice xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
 <cbc:ID>HKN2026000000999</cbc:ID>
 <cbc:IssueDate>2026-11-14</cbc:IssueDate>
 <cbc:InvoiceTypeCode>IADE</cbc:InvoiceTypeCode>
 <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>1234567890</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Örnek Tedarikçi</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
 <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>${customerTax}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Örnek Alıcı</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
 ${extra}
 <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="NIU">2</cbc:InvoicedQuantity><cac:Item><cbc:Name>Ürün</cbc:Name></cac:Item></cac:InvoiceLine>
</Invoice>`;

test("UBL-TR: iade faturası korunur, doğru tanımlı VKN'ler ile belge doğrulanır",()=>{
 const doc=parseCanonicalEBelgeUbl(fixture(),"INCOMING");
 assert.equal(doc.documentNo,"HKN2026000000999");
 assert.equal(doc.documentType,"IADE_FATURA");
 assert.equal(doc.rawMetadata.ublVerified,true);
 assert.deepEqual(doc.rawMetadata.ublQualityIssues,[]);
});
test("UBL-TR: eksik karşı taraf VKN'si sahte firma kartı onayı üretmez",()=>{
 const doc=parseCanonicalEBelgeUbl(fixture("",""),"INCOMING");
 assert.equal(doc.rawMetadata.ublVerified,false);
 assert.ok(doc.rawMetadata.ublQualityIssues.includes("CUSTOMER_TAX_REVIEW"));
});
test("UBL-TR: belge numarası/tarih/kalem olmadan kayıt oluşturulmaz",()=>{
 for(const xml of [
   fixture().replace("<cbc:ID>HKN2026000000999</cbc:ID>","<cbc:Note>Numarasız</cbc:Note>"),
   fixture().replace("<cbc:IssueDate>2026-11-14</cbc:IssueDate>",""),
   fixture().replace(/<cac:InvoiceLine>[\\s\\S]*?<\\/cac:InvoiceLine>/,""),
 ]){
   assert.throws(()=>parseCanonicalEBelgeUbl(xml,"INCOMING"),
       (e:any)=>e.code==="UBL_TR_REQUIRED_FIELDS_MISSING");
 }
});
test("UBL-TR: DTD/ENTITY içeren belgeler otomatik yüklenmez",()=>{
 assert.throws(()=>parseCanonicalEBelgeUbl("<!DOCTYPE Invoice [<!ENTITY x SYSTEM 'file:///etc/passwd'>]>"+fixture(),"INCOMING"),
     (e:any)=>e.code==="UBL_TR_UNSAFE_XML");
});
