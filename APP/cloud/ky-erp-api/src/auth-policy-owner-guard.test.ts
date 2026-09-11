import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./auth-policy-owner-guard.ts", import.meta.url), "utf8");

test("ordinary admin routes reject owner roles", () => {
  assert.match(source, /function isOwnerRole\(role: unknown\)/);
  assert.match(source, /\["SUPER_ADMIN", "ADMIN"\]\.includes\(upper\(role\)\)/);
  assert.match(source, /export function ordinaryAdminRequestsOwnerRole\(value: unknown\)/);
  assert.match(source, /return isOwnerRole\(value\)/);
});

test("ordinary admin routes keep non-owner roles available", () => {
  assert.match(source, /function isCompanyAdminRole\(role: unknown\)/);
  assert.match(source, /upper\(role\) === "COMPANY_ADMIN"/);
  assert.doesNotMatch(source, /\["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"\]\.includes\(upper\(role\)\)/);
});
