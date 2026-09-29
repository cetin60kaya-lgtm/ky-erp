import assert from "node:assert/strict";
import test from "node:test";
import { canonicalAccountingRouteGuard } from "./accounting-canonical-route-guard.ts";

test("legacy supplier invoice approval is retired", () => {
  const guard = canonicalAccountingRouteGuard(
    "/api/muhasebe/belge-import/inv-1/approve",
    "POST",
  );
  assert.equal(guard?.replacement, "/api/e-belge/documents/:id/finalize");
});

test("invoice-to-lot transfer variants are retired", () => {
  for (const suffix of ["boyahane-transfer", "boyahane-transfer-v2"]) {
    const guard = canonicalAccountingRouteGuard(
      `/api/muhasebe/belge-import/inv-1/${suffix}`,
      "POST",
    );
    assert.equal(guard?.code, "CANONICAL_ROUTE_REQUIRED");
  }
});

test("legacy lot consumption and movement writes are retired", () => {
  assert.ok(
    canonicalAccountingRouteGuard("/api/boyahane/lots/lot-1/consume", "POST"),
  );
  assert.ok(
    canonicalAccountingRouteGuard(
      "/api/boyahane/workflow/lots/lot-1/movements",
      "POST",
    ),
  );
});

test("canonical and read routes stay available", () => {
  assert.equal(
    canonicalAccountingRouteGuard(
      "/api/e-belge/documents/inv-1/finalize",
      "POST",
    ),
    null,
  );
  assert.equal(
    canonicalAccountingRouteGuard("/api/boyahane/workflow/lots", "GET"),
    null,
  );
});
