import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../migrations/0064_file_hub_provider_identity_index.sql",import.meta.url),"utf8");
test("provider identity migration is a single additive non-unique tenant scoped index",()=>{const statements=sql.replace(/--[^\n]*/g,"").split(";").map(x=>x.trim()).filter(Boolean);assert.deepEqual(statements,["CREATE INDEX IF NOT EXISTS idx_file_hub_locations_provider_identity ON file_hub_locations(main_company_slug,storage_connection_id,provider_file_id)"]);});
