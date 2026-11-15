import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {makeVisualPdfDefinition} from "./visualUblOutput.js";
import {suggestVisualLayoutFromPdfText} from "./visualReferenceLayoutSuggestion.js";
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

test("Görsel Şablonlar birincil e-Belge menüsüdür, aynı kayıt Havuz ve Test Merkezinden açılır",()=>{
 const moduleRegistry=readFileSync(new URL("../../../app/moduleRegistry.js",import.meta.url),"utf8");
 const app=readFileSync(new URL("../../../AppV3.jsx",import.meta.url),"utf8");
 const testCenter=readFileSync(new URL("./EBelgeIntegrationTestCenter.jsx",import.meta.url),"utf8");
 assert.match(moduleRegistry,/gorsel-sablonlar/);
 assert.match(app,/"gorsel-sablonlar": "visual-templates"/);
 assert.match(main,/view === "visual-templates"/);
 assert.match(main,/openEBelgeTab\("gorsel-sablonlar"\)/);
 assert.match(testCenter,/onOpenVisualStudio/);
 assert.match(ui,/getEBelgeVisualSample/);
 assert.match(ui,/openSaved/);
 assert.match(ui,/profile\.sampleDocumentNo/);
});
test("Firma PDF referansından önerilen metin geometrisi manuel ince ayara açılır",()=>{
 const items=Array.from({length:13},(_,i)=>({
  str:i===0?"e-Fatura":"Ürün kalemi "+i,
  transform:[1,0,0,i===0?15:9,24+i*2,800-i*25],
  height:i===0?15:9,
 }));
 const suggestion=suggestVisualLayoutFromPdfText(items,842);
 assert.ok(suggestion.marginSide>=10);
 assert.ok(suggestion.marginTop>=0);
 assert.ok(suggestion.fontSize>=6);
 assert.equal(suggestion.titleSize,15);
 assert.throws(()=>suggestVisualLayoutFromPdfText([],842),/otomatik ölçülemedi/);
 assert.match(ui,/Referans PDF'den Ölçü Öner/);
 assert.match(ui,/advancedEditable/);
 const approved={kind:"INVOICE",supplier:{name:"Düzenleyen",tax:"1111111111",address:"A"},
 customer:{name:"Alıcı",tax:"2222222222",address:"B"},
 number:"NEW",date:"2026-11-15",uuid:"uuid",lines:[{index:1,description:"Ürün",quantity:"1",unit:"C62",price:"50",total:"50"}],
 currency:"TRY",subtotal:"50",tax:"10",total:"60",images:{logo:null,qr:null},notes:""};
 const def=makeVisualPdfDefinition(approved,{headerGap:24,companyGap:17,tableGap:9,
 totalsWidth:210,cellPadding:6,titleSize:20});
 assert.equal(def.content[0].margin[3],24);
 assert.equal(def.content[1].margin[3],17);
 assert.equal(def.content[2].margin[3],9);
 assert.equal(def.content[0].columns[0].stack[0].fontSize,20);
 assert.equal(def.content[3].columns[1].width,210);
});
