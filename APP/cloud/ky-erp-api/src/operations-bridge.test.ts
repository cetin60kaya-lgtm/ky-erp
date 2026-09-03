import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalOperationsCompany,
  normalizeAdjustmentType,
  normalizeOperationsText,
  operationsPermission,
  validateOperationsPeriod,
} from "./operations-bridge.ts";

test("canonical company aliases resolve to production HR tenant", () => {
  assert.equal(canonicalOperationsCompany("main-hakan-baski"), "mecit-hakan");
  assert.equal(canonicalOperationsCompany("mecit-hakan"), "mecit-hakan");
  assert.equal(canonicalOperationsCompany("other-company"), "other-company");
});

test("Turkish operation text is normalized for deterministic matching", () => {
  assert.equal(normalizeOperationsText("  Zeynep   Aslan "), "ZEYNEP ASLAN");
  assert.equal(normalizeOperationsText("Özel kesinti"), "ÖZEL KESINTI");
});

test("adjustment types are restricted to the HR finance vocabulary", () => {
  assert.equal(normalizeAdjustmentType("avans"), "Avans");
  assert.equal(normalizeAdjustmentType("mesai"), "Mesai");
  assert.equal(normalizeAdjustmentType("özel kesinti"), "Ozel kesinti");
  assert.equal(normalizeAdjustmentType("prim"), "");
});

test("period validation rejects invalid months", () => {
  assert.deepEqual(validateOperationsPeriod(2026, 8), {
    year: 2026,
    month: 8,
    key: "2026-08",
  });
  assert.equal(validateOperationsPeriod(2026, 13), null);
  assert.equal(validateOperationsPeriod("x", 8), null);
});

test("owner has full bridge access", () => {
  assert.equal(operationsPermission({ role: "SUPER_ADMIN" }, "IK", "read"), true);
  assert.equal(operationsPermission({ role: "SUPER_ADMIN" }, "MUHASEBE", "write"), true);
});

test("module permissions separate read and write access", () => {
  const user = {
    role: "VIEWER",
    permissions: [
      {
        moduleKey: "IK",
        canView: true,
        canCreate: false,
        canUpdate: false,
      },
      {
        moduleKey: "MUHASEBE",
        canView: true,
        canCreate: true,
        canUpdate: false,
      },
    ],
  };
  assert.equal(operationsPermission(user, "IK", "read"), true);
  assert.equal(operationsPermission(user, "IK", "write"), false);
  assert.equal(operationsPermission(user, "MUHASEBE", "read"), true);
  assert.equal(operationsPermission(user, "MUHASEBE", "write"), true);
});
