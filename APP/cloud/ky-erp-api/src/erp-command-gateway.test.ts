import assert from "node:assert/strict";
import test from "node:test";
import { resolveCommandPolicy } from "./erp-command-gateway.ts";

const owner = {
  id: "owner-1",
  email: "owner@example.com",
  role: "SUPER_ADMIN",
  permissions: [],
};

const accountant = {
  id: "accounting-1",
  email: "accounting@example.com",
  role: "USER",
  permissions: [
    { moduleKey: "MUHASEBE", canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: false },
    { moduleKey: "IK", canView: false, canCreate: false, canUpdate: false, canDelete: false, canApprove: false },
  ],
};

const enabled = { enabled: true, readEnabled: true, writeEnabled: true, approveEnabled: false };

test("owner can preview HR advance write and confirmation is required", () => {
  const result = resolveCommandPolicy(owner, "Çetin Kaya'ya Eylül ayında 2.000 TL avans yaz", { ...enabled, approveEnabled: true });
  assert.equal(result.allowed, true);
  assert.equal(result.moduleKey, "IK");
  assert.equal(result.mode, "WRITE");
  assert.equal(result.requiresConfirmation, true);
});

test("accountant can read accounting data", () => {
  const result = resolveCommandPolicy(accountant, "Kozbey Kimya'dan bu ay ne faturası geldi?", enabled);
  assert.equal(result.allowed, true);
  assert.equal(result.moduleKey, "MUHASEBE");
  assert.equal(result.mode, "READ");
});

test("accountant cannot write HR advance", () => {
  const result = resolveCommandPolicy(accountant, "Çetin Kaya'ya 2.000 TL avans yaz", enabled);
  assert.equal(result.allowed, false);
  assert.equal(result.moduleKey, "IK");
  assert.equal(result.reason, "MODULE_WRITE_FORBIDDEN");
});

test("chat write switch blocks writes even when ERP permission exists", () => {
  const result = resolveCommandPolicy(owner, "2.000 TL avans yaz", { ...enabled, writeEnabled: false, approveEnabled: true });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "CHAT_WRITE_DISABLED");
});

test("ordinary accounting user cannot approve official send without approve permission", () => {
  const result = resolveCommandPolicy(accountant, "e-faturayı onayla ve gönder", { ...enabled, approveEnabled: true });
  assert.equal(result.allowed, false);
  assert.equal(result.requiresStrongConfirmation, true);
});
