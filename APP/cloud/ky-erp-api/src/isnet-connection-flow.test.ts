import test from "node:test";
import assert from "node:assert/strict";
import { checkedIsnetCompanySave, normalizeIsnetConnectionMode } from "./isnet-connection-flow.ts";

const clock=Date.parse("2026-11-14T14:00:00Z");
const current={username:"TEST_USER",connectionMode:"portal",testedAt:new Date(clock-60_000).toISOString(),
 companies:[{id:"100",name:"Örnek Firma A"},{id:"200",name:"Örnek Firma B"}]};
test("İşNet: tek testten sonra sadece yetkili firma seçimi kaydedilebilir",()=>{
 const got=checkedIsnetCompanySave(current,{username:"TEST_USER",connectionMode:"portal",companyId:"200"},clock);
 assert.deepEqual(got,{ok:true,username:"TEST_USER",companyId:"200",companyName:"Örnek Firma B",mode:"portal"});
});
test("İşNet: test yoksa, eskiyse, hesap veya mod değiştiyse kayıt bloke",()=>{
 const body={username:"TEST_USER",connectionMode:"portal",companyId:"100"};
 for(const entry of [
  {...current,testedAt:""},
  {...current,testedAt:new Date(clock-601_000).toISOString()},
  {...current,username:"DIFFERENT"},
  {...current,connectionMode:"api"},
  {...current,companies:[]}
 ]) assert.equal(checkedIsnetCompanySave(entry,body,clock).ok,false);
 assert.equal(checkedIsnetCompanySave(current,{...body,username:"WRONG"},clock).ok,false);
});
test("İşNet: bilinmeyen şirket ID'si ve eksik şirket reddedilir",()=>{
 const body={username:"TEST_USER",connectionMode:"portal",companyId:"12345"};
 assert.equal(checkedIsnetCompanySave(current,body,clock).ok,false);
 assert.equal(checkedIsnetCompanySave(current,{...body,companyId:""},clock).ok,false);
});
test("İşNet: API ve portal modu açıkça ayrılır",()=>{
 assert.equal(normalizeIsnetConnectionMode("api"),"api");
 assert.equal(normalizeIsnetConnectionMode("portal"),"portal");
 assert.equal(normalizeIsnetConnectionMode("random"),"portal");
 assert.equal(checkedIsnetCompanySave({...current,connectionMode:"api"},{
 username:"TEST_USER",connectionMode:"api",companyId:"100"},clock).ok,true);
});
