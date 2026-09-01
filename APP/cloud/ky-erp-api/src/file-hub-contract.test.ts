import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fileHub = readFileSync(resolve(here, "file-hub.ts"), "utf8");
const agent = readFileSync(resolve(here, "file-hub-agent-public.ts"), "utf8");
const adminStorage = readFileSync(resolve(here, "admin-storage-cloud.ts"), "utf8");
const ai = readFileSync(resolve(here, "ai-cloud.ts"), "utf8");
// Production 0027-0029 İşNet/auth guard zinciri için ayrılmıştır; File Hub 0030-0033 aralığındadır.
const migration = readFileSync(resolve(here, "../migrations/0030_file_hub_multistorage.sql"), "utf8");
const teamMigration = readFileSync(resolve(here, "../migrations/0031_file_hub_outgoing_team_links.sql"), "utf8");

test("File Hub schema is tenant scoped and separates assets, locations, bindings and relations", () => {
  for (const table of ["file_hub_connections","file_hub_bindings","file_hub_assets","file_hub_locations","file_hub_relations","file_hub_revisions","file_hub_events","file_hub_agent_status"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /main_company_slug TEXT NOT NULL/g);
  assert.match(migration, /provider_type TEXT NOT NULL/);
});

test("Google Drive and OneDrive are selectable providers, never hardcoded as the single storage", () => {
  assert.match(fileHub, /GOOGLE_DRIVE/);
  assert.match(fileHub, /ONEDRIVE/);
  assert.match(fileHub, /LOCAL_FOLDER/);
  assert.match(fileHub, /SHAREPOINT/);
  assert.match(fileHub, /resolve-storage/);
});

test("agent transport is protected by an agent key and is reachable through public auth transport", () => {
  assert.match(agent, /FILE_HUB_AGENT_KEY/);
  assert.match(agent, /X-KYERP-Agent-Key/);
  assert.match(agent, /\/api\/auth\/file-hub-agent\/heartbeat/);
  assert.match(agent, /\/api\/auth\/file-hub-agent\/ingest/);
  assert.match(agent, /\/api\/auth\/file-hub-agent\/missing/);
  assert.match(adminStorage, /registerPublicFileHubAgentRoutes/);
});

test("outgoing design packages create model teammate knowledge for assistant queries", () => {
  assert.match(agent, /OUTGOING_PACKAGE/);
  assert.match(agent, /PACKAGE_MEMBER/);
  assert.match(teamMigration, /MODEL_TEAMMATE/);
  assert.match(teamMigration, /TEAMMATE/);
});

test("KY ERP assistant consumes File Hub context and does not invent file existence", () => {
  assert.match(ai, /File Hub dosya\/ilişki bağlamı/);
  assert.match(ai, /dosya varlığını uydurma/);
  assert.match(ai, /status=MISSING/);
  assert.match(ai, /fileHubSourceCount/);
});

test("legacy admin storage is a compatibility view, not R2 as physical source of truth", () => {
  assert.match(adminStorage, /storageMode:"FILE_HUB"/);
  assert.match(adminStorage, /R2 yalnız preview\/cache katmanıdır/);
  assert.doesNotMatch(adminStorage, /const STORAGE_ROOT = "R2:/);
});
