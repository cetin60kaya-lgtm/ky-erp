import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Hono } from "hono";

const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const canonical = readFileSync(new URL("./production-center.ts", import.meta.url), "utf8");
const legacy = readFileSync(new URL("./production-runtime-v2.ts", import.meta.url), "utf8");

test("canonical production-center routes precede duplicate legacy runtime routes", () => {
  const first = main.indexOf("registerProductionCenterRoutes(app);");
  const second = main.indexOf("registerProductionRuntimeV2Routes(app);");
  assert.ok(first > 0 && second > first, "eski runtime GET /api/production-center rotasını gölgelememeli");
  assert.match(canonical, /app\.get\("\/api\/production-center",/);
  assert.match(canonical, /poolContract: PRODUCTION_POOL_CONTRACT/);
  assert.match(canonical, /appliedPool: normalized\(c\.req\.query\("pool"\) \|\| "IMALATTA"\)/);
  assert.match(legacy, /app\.get\("\/api\/production-center",/);
});

test("Hono selects the first registered matching path without calling next", async () => {
  const app = new Hono();
  app.get("/api/production-center", (c) => c.json({
    ok: true, data: { poolContract: "kyerp-production-pools-v3", appliedPool: c.req.query("pool") },
  }));
  app.get("/api/production-center", (c) => c.json({ ok: true, data: { rows: ["eski"] } }));
  const result = await app.request("/api/production-center?pool=TAMAMLANAN");
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.data.poolContract, "kyerp-production-pools-v3");
  assert.equal(payload.data.appliedPool, "TAMAMLANAN");
  assert.equal(payload.data.rows, undefined);
});
