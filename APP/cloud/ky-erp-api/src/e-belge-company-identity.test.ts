import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseExactCompanyByTax, verifiedContactEmail, verifiedContactPhone } from "./e-belge-company-identity";

test("Yalnız tekil gerçek VKN/TCKN firma kartına otomatik bağlar",()=>{
  const firms=[
    {id:"a",name:"ÖRNEK KİMYA LTD",tax_no:"1234567890"},
    {id:"b",name:"ÖRNEK KİMYA LTD",tax_no:"1098765432"},
  ];
  const match=chooseExactCompanyByTax(firms,"1234567890");
  assert.equal(match.status,"EXACT_VKN");
  assert.equal(match.company?.id,"a");
  assert.equal(chooseExactCompanyByTax(firms,"1000000000").company,null);
  assert.equal(chooseExactCompanyByTax(firms,"").status,"TAX_REVIEW_REQUIRED");
});
test("Aynı VKN iki kartta ise rastgele ilk kaydı seçmez",()=>{
  const check=chooseExactCompanyByTax([{id:"a",tax_no:"1234567890"},{id:"b",tax_no:"1234567890"}],"1234567890");
  assert.equal(check.status,"DUPLICATE_VKN_REVIEW");
  assert.equal(check.company,null);
});
test("İlk XML'den firma iletişim alanı kontrollü alınır",()=>{
  assert.equal(verifiedContactEmail("ilgili@example.invalid"),"ilgili@example.invalid");
  assert.equal(verifiedContactEmail("yanlis-adres"),"");
  assert.equal(verifiedContactPhone("+90 (212) 555 01 02"),"+90 (212) 555 01 02");
  assert.equal(verifiedContactPhone("abc-yanlis"),"");
});
