import test from "node:test";
import assert from "node:assert/strict";
import { accountingTenantReadAllowed } from "./accounting-access-policy.ts";

test("Haftalık cari: firma yöneticisi farklı tenant ekstresini okuyamaz", () => {
  assert.equal(accountingTenantReadAllowed({role:"COMPANY_ADMIN",mainCompanySlug:"mecit-hakan"},"baska-firma"),false);
  assert.equal(accountingTenantReadAllowed({role:"COMPANY_OWNER",mainCompanySlug:"mecit-hakan"},"baska-firma"),false);
  assert.equal(accountingTenantReadAllowed({role:"MUHASEBE",permissions:[{moduleKey:"MUHASEBE",canView:true}]},"mecit-hakan"),false);
});

test("Haftalık cari: kendi firma yetkisi ve normalleştirilmiş firma kodu korunur", () => {
  assert.equal(accountingTenantReadAllowed({role:"COMPANY_ADMIN",mainCompanySlug:"mecit-hakan"},"MECIT-HAKAN"),true);
  assert.equal(accountingTenantReadAllowed({role:"MUHASEBE",security:{main_company_slug:"mecit-hakan"}},"mecit-hakan"),true);
  assert.equal(accountingTenantReadAllowed({role:"COMPANY_ADMIN",mainCompanySlug:"mecit-hakan"},""),false);
});

test("Haftalık cari: yalnız global yöneticiler başka tenant kapsamına geçebilir", () => {
  assert.equal(accountingTenantReadAllowed({role:"SUPER_ADMIN"},"baska-firma"),true);
  assert.equal(accountingTenantReadAllowed({role:"ADMIN"},"baska-firma"),true);
  assert.equal(accountingTenantReadAllowed({role:"COMPANY_ADMIN"},"baska-firma"),false);
  assert.equal(accountingTenantReadAllowed({role:"SUPER_ADMIN"},""),false);
});
