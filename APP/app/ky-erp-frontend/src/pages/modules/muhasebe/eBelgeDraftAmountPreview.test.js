import test from "node:test";
import assert from "node:assert/strict";
import {draftAmountPreview} from "./eBelgeDraftAmountPreview.js";
const row=(values={})=>({description:"Baskı",unit:"C62",quantity:"100",price:"10",vatRate:"20",discountRate:"0",...values});
test("invoice preview calculates exact cents and line discounts",()=>{
 const a=draftAmountPreview([row({discountRate:"10"}),row({quantity:"0,333",price:"1,2345",vatRate:"20"})]);
 assert.deepEqual(a,{gross:"1000.41",discount:"100.00",net:"900.41",vat:"180.08",total:"1080.49",items:[{net:"900.00",vat:"180.00",total:"1080.00"},{net:"0.41",vat:"0.08",total:"0.49"}]});
});
test("incomplete or malformed inputs never become silent zero totals",()=>{
 for(const values of [{vatRate:""},{description:""},{quantity:"0"},{price:"1.23456"},{discountRate:"101"},{freeKind:"SAMPLE"}])assert.equal(draftAmountPreview([row(values)]),null);
 assert.equal(draftAmountPreview([row({freeKind:"SAMPLE",price:"0",vatRate:"0"})]).total,"0.00");
});
