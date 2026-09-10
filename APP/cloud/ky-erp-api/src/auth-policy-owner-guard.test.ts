import assert from "node:assert/strict";
import test from "node:test";
import { ordinaryAdminRequestsOwnerRole } from "./auth-policy-owner-guard.ts";

test("ordinary admin routes reject owner roles", () => {
  assert.equal(ordinaryAdminRequestsOwnerRole("SUPER_ADMIN"), true);
  assert.equal(ordinaryAdminRequestsOwnerRole("super_admin"), true);
  assert.equal(ordinaryAdminRequestsOwnerRole("ADMIN"), true);
});

test("ordinary admin routes keep non-owner roles available", () => {
  assert.equal(ordinaryAdminRequestsOwnerRole("COMPANY_ADMIN"), false);
  assert.equal(ordinaryAdminRequestsOwnerRole("MUHASEBE"), false);
  assert.equal(ordinaryAdminRequestsOwnerRole("VIEWER"), false);
  assert.equal(ordinaryAdminRequestsOwnerRole(""), false);
});
