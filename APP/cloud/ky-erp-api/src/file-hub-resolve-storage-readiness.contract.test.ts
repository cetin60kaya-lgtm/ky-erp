import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./file-hub.ts", import.meta.url), "utf8");

test("resolve-storage returns connection sync readiness fields for Desen UI", () => {
  const marker = 'app.get("/api/file-hub/resolve-storage"';
  const start = source.indexOf(marker);
  assert.ok(start >= 0, "resolve-storage route must exist");
  const block = source.slice(start, source.indexOf('app.get("/api/file-hub/files"', start));
  for (const field of ["sync_mode", "connection_status", "last_sync_at", "last_error", "remote_root_id"]) {
    assert.match(block, new RegExp(field));
  }
});
