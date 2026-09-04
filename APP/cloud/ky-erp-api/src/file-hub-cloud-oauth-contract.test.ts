import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(resolve(here, name), "utf8");
const migration = readFileSync(resolve(here, "../migrations/0044_file_hub_cloud_oauth.sql"), "utf8");
const cloud = read("file-hub-cloud-oauth.ts");
const adminStorage = read("admin-storage-cloud.ts");
const main = read("main.ts");
const release = readFileSync(resolve(here, "../../../../.github/workflows/production-release.yml"), "utf8");

test("File Hub OAuth schema is additive and encrypted-token based", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS file_hub_oauth_accounts/);
  assert.match(migration, /access_token_cipher TEXT NOT NULL/);
  assert.match(migration, /refresh_token_cipher TEXT/);
  assert.doesNotMatch(migration, /\bDROP\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
});

test("cloud OAuth uses AES-GCM and expiring one-time state", () => {
  assert.match(cloud, /FILE_HUB_OAUTH_KEY/);
  assert.match(cloud, /AES-GCM/);
  assert.match(cloud, /10 \* 60 \* 1000/);
  assert.match(cloud, /\/api\/auth\/file-hub\/oauth\/google\/callback/);
  assert.match(cloud, /\/api\/auth\/file-hub\/oauth\/microsoft\/callback/);
});

test("cloud management is registered behind File Hub tenant-owner guard", () => {
  const guard = adminStorage.indexOf('app.use("/api/file-hub/*"');
  const register = adminStorage.indexOf("registerFileHubCloudOauthRoutes(app)");
  assert.ok(guard >= 0 && register > guard);
  assert.match(adminStorage, /path\.startsWith\("\/api\/file-hub\/cloud\/"\)/);
  assert.doesNotMatch(main, /registerFileHubPreviewRoutes/);
});

test("production release backs up D1 before targeted 0044 and checks OAuth secrets", () => {
  const backup = release.indexOf("Canli D1 tam yedegini al");
  const oauth = release.indexOf("0044 File Hub cloud OAuth semasi");
  assert.ok(backup >= 0 && oauth > backup);
  for (const key of ["FILE_HUB_OAUTH_KEY","GOOGLE_DRIVE_CLIENT_ID","GOOGLE_DRIVE_CLIENT_SECRET","MICROSOFT_GRAPH_CLIENT_ID","MICROSOFT_GRAPH_CLIENT_SECRET"]) {
    assert.match(release, new RegExp(key));
  }
  assert.match(release, /file_hub_cloud_connection_accounts/);
});
