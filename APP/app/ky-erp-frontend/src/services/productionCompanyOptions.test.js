import test from "node:test";
import assert from "node:assert/strict";
import { selectableProductionCompanies } from "./productionCompanyOptions.js";

test("İmalat Muhasebe aktif firma ID'lerini rolüne bakmadan listeler", () => {
  const all = [
    { id:"taha-short",name:"TAHA",type:"SUPPLIER",isActive:true },
    { id:"taha-real",name:"TAHA GİYİM SANAYİ VE TİCARET A.Ş.",type:"SUPPLIER",isActive:true },
    { id:"real-customer",name:"Müşteri",type:"CUSTOMER",isActive:true },
    { id:"passive",name:"Pasif",type:"CUSTOMER",isActive:false },
    { id:"deleted",name:"Silinmiş",deleted_at:"2026-10-29",isActive:true },
  ];
  const selected = selectableProductionCompanies(all);
  assert.deepEqual(selected.map(row=>row.id),["real-customer","taha-short","taha-real"]);
  assert.ok(selected.every(row=>row.id));
});
test("boş ve yanlış veri firma listesine dönüşmez", () => {
  assert.deepEqual(selectableProductionCompanies(null), []);
  assert.deepEqual(selectableProductionCompanies([{name:"No ID"},{id:"",name:"Empty"}]),[]);
});
