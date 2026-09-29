import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(resolve(here, name), "utf8");
const migration = readFileSync(resolve(here, "../migrations/0039_file_hub_agent_tenant_credentials.sql"), "utf8");
const storage = read("admin-storage-cloud.ts");
const auth = read("file-hub-agent-auth.ts");
const agent = read("file-hub-agent-public.ts");
const scan = read("file-hub-agent-scan.ts");
const admin = read("file-hub-agent-admin.ts");

test("File Hub tenant credential migration is additive", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS file_hub_agent_credentials/);
  assert.match(migration, /main_company_slug TEXT NOT NULL UNIQUE/);
  assert.match(migration, /secret_hash TEXT NOT NULL/);
  assert.doesNotMatch(migration, /\bDROP\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});

test("non-owner File Hub requests cannot select another tenant", () => {
  assert.match(storage, /FILE_HUB_TENANT_FORBIDDEN/);
  assert.match(storage, /requested&&requested!==own/);
  assert.match(storage, /FILE_HUB_TENANT_REQUIRED/);
  assert.match(storage, /userTenant\(user\)/);
});

test("public File Agent endpoints use tenant-scoped credential verification", () => {
  assert.match(agent, /verifyFileHubAgentCredential/);
  assert.match(scan, /verifyFileHubAgentCredential/);
  assert.match(agent, /Bu firma için File Agent anahtarı geçersiz/);
  assert.match(scan, /Bu firma için File Agent anahtarı geçersiz/);
});

test("legacy global agent key is compatible only with canonical tenant", () => {
  assert.match(auth, /LEGACY_CANONICAL_TENANT = "mecit-hakan"/);
  assert.match(auth, /tenant !== LEGACY_CANONICAL_TENANT/);
  assert.match(auth, /if \(credential\)/);
  assert.match(auth, /wrong key[\s\S]*never falls back/i);
});

test("tenant agent key is hashed at rest and raw secret is one-time rotation output", () => {
  assert.match(admin, /hashFileHubAgentSecret\(secret\)/);
  assert.match(admin, /secret_hash/);
  assert.match(admin, /\/api\/file-hub\/agent-credential\/rotate/);
  assert.match(admin, /warning: "Bu anahtar yalnız bu yanıtta gösterilir/);
  const getRoute = admin.slice(admin.indexOf('app.get("/api/file-hub/agent-credential"'), admin.indexOf('app.post("/api/file-hub/agent-credential/rotate"'));
  assert.doesNotMatch(getRoute, /secret_hash/);
  assert.doesNotMatch(getRoute, /\bsecret\s*:/);
});
