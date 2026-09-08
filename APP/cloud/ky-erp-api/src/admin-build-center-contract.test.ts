import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./admin-build-center-cloud.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("build center uses existing R2 FILES binding and avoids D1 migration", () => {
  assert.match(source, /build-center\//);
  assert.match(source, /c\.env\.FILES/);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|INSERT INTO|UPDATE .*build/i);
});

test("owner build center and agent token are separated", () => {
  assert.match(source, /ownerCurrent/);
  assert.match(source, /X-KYERP-Build-Agent-Token/);
  assert.match(source, /SHA-256/);
  assert.match(source, /\/api\/admin\/build-center\/jobs/);
  assert.match(source, /\/api\/build-agent\/next/);
});

test("large Setup upload uses R2 multipart chunks", () => {
  assert.match(source, /createMultipartUpload/);
  assert.match(source, /resumeMultipartUpload/);
  assert.match(source, /uploadPart/);
  assert.match(source, /complete\(/);
  assert.match(source, /abort\(/);
});

test("build agent routes bypass user session only behind their own token gate", () => {
  assert.match(main, /path\.startsWith\("\/api\/build-agent\/"\)/);
  assert.match(main, /registerAdminBuildCenterRoutes/);
  assert.match(source, /requireAgent/);
});
