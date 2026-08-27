import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCompanySlug, resolveCompanyIdentity } from "./companyIdentity.js";

test("Mecit Hakan tenant aliasları tek canonical slug'a çözülür", () => {
  for (const value of ["mecit-hakan", "main-mecit-hakan", "mecit-hakan-gursu", "hakan-baski"]) {
    assert.equal(canonicalCompanySlug(value), "mecit-hakan");
  }
});

test("mainCompanyId ve mainCompanySlug birlikte canonical kimliğe dönüşür", () => {
  assert.deepEqual(
    resolveCompanyIdentity({ mainCompanyId: "main-mecit-hakan" }),
    { mainCompanyId: "main-mecit-hakan", mainCompanySlug: "mecit-hakan" },
  );
});
