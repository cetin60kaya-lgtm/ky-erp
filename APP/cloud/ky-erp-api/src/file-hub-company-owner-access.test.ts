import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canManageOwnCompanyStorage } from "./file-hub-company-owner-access.ts";

test("firma sahibi ve uygulama sahibi yalnız kendi ana firma depolamasını yönetebilir", () => {
  for (const role of ["COMPANY_ADMIN", "SUPER_ADMIN", "ADMIN"]) {
    assert.equal(canManageOwnCompanyStorage({ role, mainCompanySlug: "mecit-hakan" }, "mecit-hakan"), true);
    assert.equal(canManageOwnCompanyStorage({ role, mainCompanySlug: "mecit-hakan" }, "baska-firma"), false);
  }
});

test("genel kullanıcılar ve eksik tenant bilgisi File Hub yönetimini açamaz", () => {
  for (const role of ["VIEWER", "USER", "ACCOUNTANT", "", "SALES"]) {
    assert.equal(canManageOwnCompanyStorage({ role, mainCompanySlug: "mecit-hakan" }, "mecit-hakan"), false);
  }
  assert.equal(canManageOwnCompanyStorage(null, "mecit-hakan"), false);
  assert.equal(canManageOwnCompanyStorage({ role: "SUPER_ADMIN" }, "mecit-hakan"), false);
  assert.equal(canManageOwnCompanyStorage({ role: "SUPER_ADMIN", mainCompanySlug: "mecit-hakan" }, ""), false);
});

test("rol yalnız doğrulanmış oturum kullanıcısından, tenant yalnız ilgili ana firmadan alınır", () => {
  assert.equal(canManageOwnCompanyStorage({ role: "SUPER_ADMIN", security: { main_company_slug: "mecit-hakan" } }, "mecit-hakan"), true);
  assert.equal(canManageOwnCompanyStorage({ role: "SUPER_ADMIN", mainCompanySlug: "mecit-hakan" }, "MECIT-HAKAN"), true);
  const cloud = readFileSync(new URL("./file-hub-cloud-oauth.ts", import.meta.url), "utf8");
  const hub = readFileSync(new URL("./file-hub.ts", import.meta.url), "utf8");
  assert.match(cloud, /canManageOwnCompanyStorage\(user, slug\)/);
  assert.match(hub, /canManageOwnCompanyStorage\(u, slugOf\(c, body\)\)/);
  assert.match(cloud, /TENANT_FORBIDDEN/);
});
