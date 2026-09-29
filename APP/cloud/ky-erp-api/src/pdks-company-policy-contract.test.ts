import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const api=(name:string)=>readFileSync(resolve(here,name),"utf8");
const frontend=(name:string)=>readFileSync(resolve(here,"../../../app/ky-erp-frontend/src",name),"utf8");
const migration=(name:string)=>readFileSync(resolve(here,"../migrations",name),"utf8");
const deploy=()=>readFileSync(resolve(here,"../../../../DEPLOY/KYERP_DIRECT_PRODUCTION_V3.ps1"),"utf8");
test("PDKS business-hour policy is company/group based and additive",()=>{
  const policy=api("ik-pdks-policy.ts"); const modern=api("ik-pdks-modern.ts"); const ui=frontend("pages/admin/AdminCompanySettings.jsx"); const sql=migration("0052_pdks_company_policy_hierarchy.sql");
  assert.match(sql,/ik_pdks_company_policy/); assert.match(sql,/ik_pdks_personnel_groups/); assert.match(sql,/ik_pdks_employee_policy_overrides/);
  assert.match(policy,/MONTHLY_DIV_30/); assert.match(policy,/resolveEmployeePdksPolicy/); assert.match(modern,/profileConfigured/); assert.match(ui,/Firma PDKS Profili/);
  for(const source of [policy,modern,ui]) assert.doesNotMatch(source,/\b13500\b|\b225\b|\b450\b/);
});
test("production deploy explicitly applies additive PDKS policy migration",()=>{const source=deploy(); assert.match(source,/0052_pdks_company_policy_hierarchy\.sql/); assert.match(source,/\$PDKS_POLICY_FILE/); assert.match(source,/wrangler d1 execute \$DB_NAME --remote --config \$DB_CONFIG --file \$PDKS_POLICY_FILE/);});
