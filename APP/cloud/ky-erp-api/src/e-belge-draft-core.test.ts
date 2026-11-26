import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeDraft} from "./e-belge-draft-core.ts";
const line={description:"Emprime",unit:"C62",quantity:"100",price:"10",vatRate:"20",discountRate:"0"};
const base={issueDate:"2026-11-26",partyId:"fixture",scenario:"TEMELFATURA",currency:"TRY",lines:[line]};
test("100 × 10 and 20% VAT; free sample and defects do not add amount",()=>{const r=normalizeDraft({...base,lines:[line,...["SAMPLE","FABRIC_DEFECT","PRINT_DEFECT"].map((freeKind,i)=>({...line,quantity:i?"5":"10",price:"0",vatRate:"0",freeKind}))]},"INVOICE");assert.equal(r.net,"1000.00");assert.equal(r.vat,"200.00");assert.equal(r.total,"1200.00");assert.ok(r.warnings.length);});
test("decimal comma and rounding",()=>{const r=normalizeDraft({...base,lines:[{...line,quantity:"1,005",price:"10",discountRate:"10"}]},"INVOICE");assert.equal(r.net,"9.04");assert.equal(r.vat,"1.81");assert.equal(r.total,"10.85");});
test("invalid values are blocked",()=>{for(const patch of [{quantity:"0"},{vatRate:"101"},{freeKind:"SAMPLE"},{catalogId:"OTHER:x"},{price:"1,2,3"}])assert.throws(()=>normalizeDraft({...base,lines:[{...line,...patch}]},"INVOICE"));assert.throws(()=>normalizeDraft({...base,issueDate:"2026-02-30"},"INVOICE"));});
test("dispatch quantity and delivery fields, no invoice pricing",()=>{const r=normalizeDraft({...base,scenario:"TEMELIRSALIYE",dispatchDate:"2026-11-26",dispatchTime:"10:30",deliveryAddress:"Fixture",driver:"Fixture",plate:"Fixture"},"DISPATCH");assert.equal(r.total,"0.00");assert.equal(r.lines[0].quantity,"100.000");assert.equal(r.warnings.length,0);});
