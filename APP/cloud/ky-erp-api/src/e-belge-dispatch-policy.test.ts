import test from "node:test";
import assert from "node:assert/strict";
import {dispatchRequirement as decide} from "./e-belge-dispatch-policy";
const line=(routingType:string)=>({raw_metadata:JSON.stringify({routingType})});
test("yalnız gider: doğalgaz/elektrik faturası için irsaliye zorunlu değil",()=>{
 assert.deepEqual(decide([], [line("EXPENSE"),line("EXPENSE")]),{required:false,reason:"EXPENSE_ONLY"});
});
test("XML irsaliye referansı varsa hizmet faturasında dahi kontrol korunur",()=>{
 assert.equal(decide(["DDM202600001"],[line("EXPENSE")]).required,true);
});
test("stok, boyahane, sarf ya da LOT olan belgede irsaliye kontrolü sürer",()=>{
 for(const kind of ["STOCK","BOYAHANE","CONSUMABLE"])assert.equal(decide([], [line("EXPENSE"),line(kind)]).required,true);
 assert.equal(decide([], [{raw_metadata:{routingType:"EXPENSE",lotRequired:true}}]).required,true);
});
test("eksik ve belirsiz kalem bilgisi sessizce muaf sayılmaz",()=>{
 assert.equal(decide([],[]).required,true);
 assert.equal(decide([],[{raw_metadata:"not-json"}]).required,true);
});
