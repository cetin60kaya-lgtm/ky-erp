import test from "node:test";
import assert from "node:assert/strict";
import { dailyTenant, dailyAuthorized } from "./gunluk-operasyon-access.ts";
const user={role:"USER",permissions:[{moduleKey:"IK",canView:true,canCreate:true,canUpdate:true,canApprove:false,canDelete:false}]};
test("daily tenants match existing aliases; empty is not an authorized company",()=>{
  assert.equal(dailyTenant("main-hakan-baski"),"mecit-hakan");
  assert.equal(dailyTenant("mecit-hakan"),"mecit-hakan");
  assert.equal(dailyTenant(""),"");
  assert.equal(dailyTenant("özel-firma"),"özel-firma");
});
test("daily read and entry need explicit IK grants",()=>{
  assert.equal(dailyAuthorized(user,"GET","/api/gunluk-operasyon/employees"),true);
  assert.equal(dailyAuthorized(user,"POST","/api/gunluk-operasyon/records"),true);
  assert.equal(dailyAuthorized({...user,permissions:[]},"GET","/api/gunluk-operasyon/employees"),false);
  assert.equal(dailyAuthorized({...user,role:"DENETIM"},"POST","/api/gunluk-operasyon/records"),false);
});
test("payment or period approval needs approve or update; deletion needs delete",()=>{
  assert.equal(dailyAuthorized({role:"USER",permissions:[{moduleKey:"IK",canView:true,canCreate:true}]},"POST","/api/gunluk-operasyon/payments"),false);
  assert.equal(dailyAuthorized(user,"POST","/api/gunluk-operasyon/payments"),true);
  assert.equal(dailyAuthorized(user,"POST","/api/gunluk-operasyon/period-lock"),true);
  assert.equal(dailyAuthorized(user,"DELETE","/api/gunluk-operasyon/employees/e1"),false);
  assert.equal(dailyAuthorized({...user,role:"SUPER_ADMIN",permissions:[]},"DELETE","/api/gunluk-operasyon/employees/e1"),true);
});
