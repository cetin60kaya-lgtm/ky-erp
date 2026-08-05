import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHrCompanyId,
  hrDateOnly,
  hrListResponse,
} from "./ik-relational-cloud.ts";

test("mecit-hakan tenant aliases normalize to one canonical id", () => {
  assert.equal(canonicalHrCompanyId("mecit-hakan"), "mecit-hakan");
  assert.equal(canonicalHrCompanyId("main-mecit-hakan"), "mecit-hakan");
  assert.equal(canonicalHrCompanyId("MAIN_MECIT_HAKAN"), "mecit-hakan");
  assert.equal(canonicalHrCompanyId(undefined), "mecit-hakan");
});

test("SQLite millisecond and ISO dates map to frontend date-only values", () => {
  assert.equal(hrDateOnly(1781827200000), "2026-06-19");
  assert.equal(hrDateOnly("2026-08-05T09:30:00.000Z"), "2026-08-05");
  assert.equal(hrDateOnly(null), "");
});

test("list responses expose both frontend-compatible list keys", () => {
  const rows = [{ id: "one" }];
  const response = hrListResponse(rows);
  assert.deepEqual(response, {
    ok: true,
    success: true,
    data: rows,
    items: rows,
  });
  assert.equal(response.data, response.items);
});
