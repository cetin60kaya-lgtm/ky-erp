import test from "node:test";
import assert from "node:assert/strict";
import {operatorDraftPdfDefinition} from "./eBelgeDraftPdf.js";
test("saved A4 working draft is clearly not a provider original",()=>{
 const d=operatorDraftPdfDefinition({companyName:"Fixture",draft:{kind:"INVOICE",version:1,payload:{partyName:"Fixture",issueDate:"2026-11-26",scenario:"TEMELFATURA",currency:"TRY",net:"100.00",vat:"20.00",total:"120.00",lines:[{description:"Ürün",quantity:"10.000",unit:"C62",price:"10.00",net:"100.00",vat:"20.00"}]}}});
 assert.equal(d.pageSize,"A4");assert.match(d.content[0].text,/RESMÎ BELGE DEĞİLDİR/);assert.ok(JSON.stringify(d).includes("120,00"));assert.ok(JSON.stringify(d).includes("ADET"));
});
