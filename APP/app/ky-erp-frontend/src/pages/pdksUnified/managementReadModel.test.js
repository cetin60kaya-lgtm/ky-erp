import test from "node:test";
import assert from "node:assert/strict";
import {
  isManager,isOwner,scopeCompanies,scopeUsers,normalizePermissions,
  backupHealth,projectCloudEvents,projectLocalHealth,
} from "./managementReadModel.mjs";
test("owner and tenant management roles stay explicit",()=>{
  assert.equal(isManager("DENETIM"),false);
  assert.equal(isManager("IK"),false);
  assert.equal(isManager("COMPANY_ADMIN"),true);
  assert.equal(isOwner("COMPANY_ADMIN"),false);
});
test("non-owner is tenant filtered; owner account never displayed",()=>{
  const companies=[{slug:"firm-a"},{slug:"firm-b"}];
  assert.deepEqual(scopeCompanies(companies,"firm-a","COMPANY_ADMIN"),[companies[0]]);
  const users=[{role:"IK",mainCompanySlug:"firm-a"},
               {role:"VIEWER",mainCompanySlug:"firm-b"},
               {role:"SUPER_ADMIN",mainCompanySlug:"firm-a"}];
  assert.deepEqual(scopeUsers(users,"firm-a","COMPANY_ADMIN"),[users[0]]);
  assert.equal(scopeUsers(users,"firm-a","ADMIN").length,2);
  assert.throws(()=>scopeUsers(users,"firm-a","DENETIM"));
});
test("permissions are read from API, never inferred from role preset",()=>{
  assert.deepEqual(normalizePermissions([{moduleKey:"PDKS",canView:true,canApprove:false}]),[{
    moduleKey:"PDKS",canView:true,canCreate:false,canUpdate:false,
    canDelete:false,canApprove:false,
  }]);
  assert.throws(()=>normalizePermissions({unknown:true}));
});
test("backup status needs explicit integrity proof",()=>{
  assert.equal(backupHealth({status:"COMPLETED"}),"Tamamlandı · bütünlük kanıtı yok");
  assert.equal(backupHealth({status:"FAILED",verified:true}),"Hata");
  assert.equal(backupHealth({status:"COMPLETED",verified:true}),"Sağlama doğrulandı");
});
test("Cloud incident events expose code only, never raw payload",()=>{
  const output=projectCloudEvents({complete:true,source:"D1_UNIFIED_OUTBOX_ONLY",
    productionApproved:false,recent:[{state:"FAILED",attempts:3,errorCode:"<script>SECRET</script>",
      rawPayload:"PRIVATE_PAYROLL",createdAt:"2026-10-10T01:00:00Z"}]});
  assert.equal(output[0].code,"REDACTED");
  assert.equal(JSON.stringify(output).includes("PRIVATE_PAYROLL"),false);
  assert.throws(()=>projectCloudEvents({complete:false,recent:[]}));
});
test("local diagnostic contract fails closed",()=>{
  const input={schema:"KY_PDKS_LOCAL_DIAGNOSTICS_V1",scope:"LOCAL_ONLY",
    liveWritesEnabled:false,heartbeat:"RECENT",lastResult:"NO_PENDING_COMMAND",
    lastCompletedAt:"2026-10-10T01:00:00Z",received:1,applied:1,pendingAcks:0,localErrors:0,
    secret:"NEVER_OUTPUT"};
  const result=projectLocalHealth(input);
  assert.equal(result.heartbeat,"Son heartbeat mevcut");
  assert.equal(JSON.stringify(result).includes("NEVER_OUTPUT"),false);
  assert.throws(()=>projectLocalHealth({...input,liveWritesEnabled:true}));
});
