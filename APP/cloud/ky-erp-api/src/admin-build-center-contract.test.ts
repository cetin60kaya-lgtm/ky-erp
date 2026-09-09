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

test("agent enrollment is one-time and reusable secrets stay device-bound", () => {
  assert.match(source, /ENROLLMENT_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(source, /\/api\/admin\/build-center\/agent-enrollment/);
  assert.match(source, /\/api\/build-agent\/enroll/);
  assert.match(source, /codeHash:await sha256\(enrollmentCode\)/);
  assert.match(source, /tokenHash:await sha256\(agentToken\)/);
  assert.match(source, /X-KYERP-Build-Agent-Id/);
});

test("R2 job transitions use conditional ETag compare and state guards", () => {
  assert.match(source, /onlyIf:\{ etagMatches:etag \}/);
  assert.match(source, /updateJobAtomic/);
  assert.match(source, /transitionAllowed/);
  assert.match(source, /\["QUEUED"\]/);
  assert.match(source, /BUILD_STATE_CONFLICT/);
});

test("queue selection does not truncate queued jobs before claim", () => {
  assert.match(source, /listJobObjects/);
  assert.match(source, /jobs:jobs\.slice\(0,MAX_JOBS\)/);
  assert.doesNotMatch(source, /return rows\.sort\([^\n]+\)\.slice\(0,MAX_JOBS\)/);
});

test("large Setup upload uses R2 multipart chunks and verifies declared size", () => {
  assert.match(source, /createMultipartUpload/);
  assert.match(source, /resumeMultipartUpload/);
  assert.match(source, /uploadPart/);
  assert.match(source, /expectedArtifactBytes/);
  assert.match(source, /BUILD_ARTIFACT_SIZE_MISMATCH/);
  assert.match(source, /expectedArtifactSha256/);
});

test("queued builds are active and duplicate requests are rejected server-side", () => {
  assert.match(source, /ACTIVE_JOB_STATUSES = new Set\(\["QUEUED","CLAIMED","BUILDING","TESTING","PACKAGING","UPLOADING"\]\)/);
  assert.match(source, /BUILD_ALREADY_ACTIVE/);
  assert.match(source, /ACTIVE_JOB_STATUSES\.has\(upper\(row\.status\)\)/);
});

test("heartbeat is considered connected only while fresh and last timestamp stays available for diagnostics", () => {
  assert.match(source, /HEARTBEAT_STALE_MS = 45 \* 1000/);
  assert.match(source, /heartbeatAgeMs/);
  assert.match(source, /lastHeartbeat/);
  assert.match(source, /heartbeatStaleMs:HEARTBEAT_STALE_MS/);
});

test("build agent routes bypass user session only behind enrollment or agent secret", () => {
  assert.match(main, /path\.startsWith\("\/api\/build-agent\/"\)/);
  assert.match(main, /registerAdminBuildCenterRoutes/);
  assert.match(source, /requireAgent/);
  assert.match(source, /BUILD_AGENT_UNAUTHORIZED/);
});
