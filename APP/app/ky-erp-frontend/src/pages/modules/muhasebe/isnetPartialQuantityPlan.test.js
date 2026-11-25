import test from "node:test";
import assert from "node:assert/strict";
import { quantityPlan } from "./isnetPartialQuantityPlan.js";
test("5500 → 5000 + 500; ikinci sevk kalan 500",()=>{const first=quantityPlan([{id:"x",remaining:5500}],{x:5000},{x:2},{x:20});assert.equal(first.lines[0].after,500);assert.equal(first.total,12000);const second=quantityPlan([{id:"x",remaining:500}],{x:500},{x:2},{});assert.equal(second.lines[0].after,0);assert.equal(second.total,1200);});
test("fazla/negatif miktar, boş fiyat, boş sevk reddedilir",()=>{const l=[{id:"x",remaining:500}];for(const q of [501,-1,0,""])assert.throws(()=>quantityPlan(l,{x:q},{x:2},{}));assert.throws(()=>quantityPlan(l,{x:1},{x:""},{}));});
