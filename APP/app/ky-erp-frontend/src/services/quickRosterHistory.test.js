import assert from "node:assert/strict";
import test from "node:test";
import { rankQuickRosterCandidates } from "./quickRosterHistory.js";

const people = [
 {id:"a",name:"Ahmet",active:true,role:"Serimci"},
 {id:"b",name:"Burak",active:true,role:"Makinacı"},
 {id:"c",name:"Eski",active:false,role:"Serimci"},
];
test("son 7 ve 14 gün gerçek gündüz vardiyaları sıralanır", ()=>{
 const rows=[
  {employeeId:"a",workDate:"2026-11-18",dayShift:1,nightShift:0},
  {employeeId:"a",workDate:"2026-11-17",dayShift:1,nightShift:0},
  {employeeId:"a",workDate:"2026-11-06",dayShift:1,nightShift:0},
  {employeeId:"b",workDate:"2026-11-11",dayShift:1,nightShift:0},
  {employeeId:"c",workDate:"2026-11-16",dayShift:1,nightShift:0},
 ];
 const result=rankQuickRosterCandidates(people,rows,"2026-11-19","day");
 assert.deepEqual(result.map(x=>x.person.id),["a","b"]);
 assert.deepEqual(result.map(x=>[x.last7,x.last14]),[[2,3],[0,1]]);
});
test("havuz dışı öneride başka vardiya, gelecek gün ve çift satır sayılmaz", ()=>{
 const rows=[
  {employeeId:"a",workDate:"2026-11-18",dayShift:"1",nightShift:"0"},
  {employeeId:"a",workDate:"2026-11-18",dayShift:"1",nightShift:"0"},
  {employeeId:"b",workDate:"2026-11-18",dayShift:0,nightShift:1},
  {employeeId:"b",workDate:"2026-11-20",dayShift:1,nightShift:0},
 ];
 const day=rankQuickRosterCandidates(people,rows,"2026-11-19","day");
 assert.equal(day[0].person.id,"a");
 assert.equal(day[0].last7,1);
 assert.equal(day.find(x=>x.person.id==="b").last14,0);
 const night=rankQuickRosterCandidates(people,rows,"2026-11-19","night");
 assert.equal(night[0].person.id,"b");
});
test("aynı vardiya havuz dışı personel listesi yoksa sıralama boştur", ()=>{
 assert.deepEqual(rankQuickRosterCandidates([],[], "2026-11-19","day"),[]);
 assert.deepEqual(rankQuickRosterCandidates(people,[],"","night"),[]);
});
