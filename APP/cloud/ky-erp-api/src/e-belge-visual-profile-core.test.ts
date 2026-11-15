import test from "node:test";
import assert from "node:assert/strict";
import {inspectUblVisual,visualOutputFormat,visualLayout,selectVisualSource} from "./e-belge-visual-profile-core.ts";
const invoice='<?xml version="1.0"?><Invoice><cbc:ID>HKN2026000000999</cbc:ID><cbc:IssueDate>2026-11-15</cbc:IssueDate><cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification></cac:Party></cac:AccountingSupplierParty></Invoice>';
const dispatch='<?xml version="1.0"?><DespatchAdvice><cbc:ID>DDM2026000000999</cbc:ID><cbc:IssueDate>2026-11-15</cbc:IssueDate><cac:DespatchSupplierParty><cac:Party><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:Party></cac:DespatchSupplierParty></DespatchAdvice>';
test("Firma VKN+belge türü profili ayrılır ve başka firmaya taşınmaz",()=>{
 const a=inspectUblVisual(invoice),b=inspectUblVisual(dispatch);
 assert.equal(a.profileKey,"1234567890:INVOICE");
 assert.equal(b.profileKey,"1234567890:DISPATCH");
 assert.equal(selectVisualSource(a,{issuerTaxNo:"9999999999",kind:"INVOICE",approved:true}).templateSource,"REVIEW_REQUIRED");
 assert.equal(selectVisualSource(a,{issuerTaxNo:"1234567890",kind:"INVOICE",approved:true}).templateSource,"APPROVED_FIRM_LAYOUT");
});
test("İmza/QR içeren XSLT yalnız kaynak belgeden alınır; otomatik mail izni verilmez",()=>{
 const a=inspectUblVisual(invoice.replace("</Invoice>",'<cbc:EmbeddedDocumentBinaryObject mimeCode="application/xml">QQ==</cbc:EmbeddedDocumentBinaryObject></Invoice>'));
 assert.equal(a.hasDocumentXslt,true);
 assert.equal(selectVisualSource(a,null).templateSource,"DOCUMENT_OWN_XSLT");
 assert.equal(selectVisualSource(a,null).mayAutoSend,false);
});
test("Çıktı biçimleri ve yerleşim düzenlemeleri sınırlandırılır",()=>{
 assert.equal(visualOutputFormat("jpeg"),"JPEG");
 assert.equal(visualOutputFormat("pdf"),"PDF");
 assert.throws(()=>visualOutputFormat("html"));
 assert.deepEqual(visualLayout({marginTop:999,tableFontSize:7,showQr:false}).marginTop,30);
 assert.equal(visualLayout({marginSide:33.48}).marginSide,33.5);
 assert.throws(()=>inspectUblVisual("<!DOCTYPE Invoice><Invoice/>"));
});
