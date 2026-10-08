import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const staff=read("src/mobile/MobilePersonnel.jsx");
const mobile=read("src/mobile/MobileApp.jsx");
const login=read("src/mobile/MobileLogin.jsx");
const api=read("src/services/employeePortalApi.js");
const admin=read("src/pages/admin/AdminCompanyUsersPanel.jsx");
const panel=read("src/pages/admin/AdminCompanyPersonnelPanel.jsx");

test("mobile staff never renders manager navigation",()=>{
  assert.match(mobile,/if \(personnel\) return <MobilePersonnel \/>/);
  assert.match(mobile,/isPersonnelSession/);
  assert.match(login,/personnelMode/);
  assert.match(login,/turnstileToken/);
  assert.match(login,/employee-portal\/companies/);
});
test("staff only views own PDKS and leave; occupation form separated",()=>{
  assert.match(staff,/employee-portal\/me/);
  assert.match(staff,/employee-portal\/work/);
  assert.match(staff,/Kendi Bilgilerim/);
  assert.match(staff,/İş Formum/);
  assert.match(staff,/usedPreviousYear/);
  assert.doesNotMatch(staff,/mobileApiGet\(["']ik\/monthly/);
});
test("device public key registered while private key never exported",()=>{
  assert.match(api,/indexedDB\.open/);
  assert.match(api,/exportKey\("jwk",pair\.publicKey\)/);
  assert.doesNotMatch(api,/exportKey\("jwk",pair\.privateKey\)/);
  assert.match(api,/KYERP-EMP-DEVICE-V1/);
  assert.match(api,/X-KYERP-Employee-Signature/);
});
test("company users are separated from employee access",()=>{
  assert.match(admin,/AdminCompanyPersonnelPanel/);
  assert.match(panel,/employeeId:selected/);
  assert.match(panel,/workplaceEnabled/);
  assert.match(panel,/devices\/.*\/decision/);
});
