import test from "node:test";
import assert from "node:assert/strict";
import { selectAuthorizedIsnetCompany, requireAuthorizedIsnetCompany } from "./isnet-company-selection.mjs";

const companies = [
  {id:"A",name:"Yetkili A",hasRole:true},
  {id:"B",name:"Yetkili B",hasRole:true},
];
test("tek yetkili firma kendiliğinden seçilir",()=>{
  assert.equal(selectAuthorizedIsnetCompany([companies[0]])?.id,"A");
});
test("birden çok firmada eski seçimin tam kimlik eşleşmesi zorunlu",()=>{
  assert.equal(selectAuthorizedIsnetCompany(companies),null);
  assert.equal(selectAuthorizedIsnetCompany(companies,"B")?.name,"Yetkili B");
  assert.equal(selectAuthorizedIsnetCompany(companies,"C"),null);
});
test("firmayı sahte ad veya role göre seçerek yetki atlanamaz",()=>{
  assert.equal(requireAuthorizedIsnetCompany(companies,"A","Başka"),false);
  assert.equal(requireAuthorizedIsnetCompany(companies,"A","Yetkili A"),true);
  assert.equal(requireAuthorizedIsnetCompany([{id:"A",name:"Yetkili A",hasRole:false}],"A","Yetkili A"),false);
  assert.equal(selectAuthorizedIsnetCompany([{id:"A",name:"Yetkili A",hasRole:false}]),null);
});
test("iki firma aynı ID döndürürse otomatik seçime izin verilmez",()=>{
  assert.equal(selectAuthorizedIsnetCompany([companies[0],{...companies[0]}],"A"),null);
});
