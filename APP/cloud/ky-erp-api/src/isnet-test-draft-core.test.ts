import test from "node:test";import assert from "node:assert/strict";import {transition} from "./isnet-test-draft-core.ts";
test("5500 partial draft chain and send forbidden",()=>{const transport={driver:"TEST",plate:"TEST",date:"2026-11-25",time:"10:00"};const a={kind:"SAVE_DISPATCH",source:"DEMO_INCOMING",quantity:5000,transport};let state=transition({drafts:[]},a,"d1","t");assert.throws(()=>transition(state,{...a,quantity:501},"d2","t"));state=transition(state,{...a,quantity:500},"d2","t");state=transition(state,{kind:"SAVE_INVOICE",dispatchId:"d1",quantity:1,price:2,vatRate:20,scenario:"TICARI",issueDate:"2026-11-25"},"i1","t");assert.equal(state.drafts[2].total,12000);assert.equal(state.drafts[2].officialSent,false);assert.throws(()=>transition(state,{kind:"SEND",id:"i1"},"x","t"));assert.throws(()=>transition(state,{kind:"CANCEL",id:"d1"},"x","t"));});

test("multiple lines, locked source, per-line tax and legacy read compatibility",()=>{
 const transport={driver:"TEST",plate:"TEST",date:"2026-11-26",time:"10:00"};
 const lines=[{description:"TEST A",quantity:100,unit:"ADET"},{description:"TEST B",quantity:5,unit:"KG"}];
 let state=transition({drafts:[]},{kind:"SAVE_DISPATCH",source:"MANUAL",party:"TEST_B",issueDate:"2026-11-25",transport,lines},"d","2026-11-25T10:00:00Z");
 assert.equal(state.drafts[0].lines.length,2);assert.equal(state.drafts[0].unit,"KARIŞIK");
 const a={kind:"SAVE_INVOICE",dispatchId:"d",party:"TEST_A",issueDate:"2026-11-26",scenario:"TICARI",invoiceType:"SATIS",lines:[{...lines[0],price:10,vatRate:20},{...lines[1],price:20,vatRate:10}]};
 assert.throws(()=>transition(state,{...a,lines:[{...a.lines[0],quantity:99},a.lines[1]]},"bad","2026-11-26"));
 assert.throws(()=>transition(state,{...a,invoiceType:"IADE"},"bad","2026-11-26"));
 state=transition(state,a,"i","2026-11-26");assert.equal(state.drafts[1].party,"TEST_B");assert.equal(state.drafts[1].net,1100);assert.equal(state.drafts[1].vat,210);assert.equal(state.drafts[1].total,1310);assert.equal(state.drafts[1].officialSent,false);
 assert.throws(()=>transition(state,{...a},"duplicate","2026-11-26"));
});
test("rejects real company IDs, invalid dates and excess demo quantities",()=>{const a={kind:"SAVE_DISPATCH",source:"MANUAL",party:"real",issueDate:"2026-11-25",transport:{driver:"TEST",plate:"TEST",date:"2026-11-26",time:"10:00"},lines:[{description:"TEST",quantity:1,unit:"ADET"}]};assert.throws(()=>transition({drafts:[]},a,"d","2026-11-25"));assert.throws(()=>transition({drafts:[]},{...a,party:"TEST_A",issueDate:"2026-02-30"},"d","2026-11-25"));assert.throws(()=>transition({drafts:[]},{...a,party:"TEST_A",source:"DEMO_INCOMING",lines:[{description:"TEST",quantity:5501,unit:"ADET"}]},"d","2026-11-25"));});
