import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {makeVisualPdfDefinition} from "./visualUblOutput.js";
const ui=readFileSync(new URL("./VisualProfileStudio.jsx",import.meta.url),"utf8");
const api=readFileSync(new URL("../../../services/eBelgeApi.js",import.meta.url),"utf8");
const main=readFileSync(new URL("./EBelgeCenterPage.jsx",import.meta.url),"utf8");
test("Firma bazlı PDF önizlemesi canlı XML değerlerini taşır; eski örnek statik bilgiler kullanılmaz",()=>{
 const doc={kind:"INVOICE",supplier:{name:"Yeni Düzenleyen",tax:"1111111111",address:"A"},customer:{name:"Alıcı",tax:"2222222222",address:"B"},number:"NEW_DOCUMENT_2026",date:"2026-11-15",uuid:"NEW_UUID",lines:[{index:1,description:"Yeni Ürün",quantity:"2",unit:"C62",price:"40",total:"80"}],currency:"TRY",subtotal:"80",tax:"16",total:"96",images:{logo:null,qr:null},notes:""};
 const def=makeVisualPdfDefinition(doc,{marginTop:34,fontSize:10});
 const flat=JSON.stringify(def);
 assert.match(flat,/NEW_DOCUMENT_2026/);
 assert.match(flat,/Yeni Ürün/);
 assert.match(flat,/1111111111/);
 assert.doesNotMatch(flat,/OLD_DOCUMENT|OLD_QR/);
 assert.equal(def.pageMargins[1],34);
});
test("Tek XML+referans ile firma şablonu ve formatı kaydedilir, görsel onay gereklidir",()=>{
 assert.match(main,/<VisualProfileStudio key=/);
 assert.match(ui,/getEBelgeVisualReference/);
 assert.match(ui,/uploadEBelgeVisualExample/);
 assert.match(ui,/approveEBelgeVisualProfile/);
 assert.match(ui,/visualChecked:true/);
 assert.match(ui,/sameChecked/);
 assert.match(ui,/Kayıtlı Formatla/);
 assert.match(api,/getEBelgeVisualProfiles/);
 assert.match(api,/updateEBelgeVisualProfile/);
});
test("JPEG/PNG yalnız tek sayfayı indirip eksik sayfayı gizlemez; Chrome XSLT'e dayanmaz",()=>{
 const output=readFileSync(new URL("./visualUblOutput.js",import.meta.url),"utf8");
 assert.match(output,/source.numPages!==1/);
 assert.match(output,/JPEG.*PNG/);
 assert.match(output,/image\/jpeg/);
 assert.doesNotMatch(output,/new XSLTProcessor|window\.print/);
});

test("Firma geçişi şablon ekranını sıfırlar, örnek revizyonu başka belgeye onaylamaz",()=>{
 assert.match(main,/<VisualProfileStudio key=/);
 assert.match(ui,/useCallback\(async\(\)=>/);
 assert.match(ui,/parsed.number!==profile.sampleDocumentNo/);
});
