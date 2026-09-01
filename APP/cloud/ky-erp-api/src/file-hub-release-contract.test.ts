import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(process.cwd(), "../../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
test("File Hub + accounting production path is explicit and targeted", () => {
  const migrate = read("DEPLOY/KYERP_FILE_HUB_ACCOUNTING_PRODUCTION_MIGRATE.ps1");
  const preflight = read("DEPLOY/KYERP_FILE_HUB_ACCOUNTING_PREFLIGHT.ps1");
  const launcher = read("KY ERP CANLIYA YUKLE.bat");
  for (const migration of ["0029_file_hub_multistorage.sql","0030_file_hub_outgoing_team_links.sql","0031_file_hub_provider_defaults.sql","0032_file_hub_primary_location_failover.sql","0033_accounting_document_core.sql","0034_accounting_intelligence_profiles.sql","0035_accounting_document_archive_queue.sql"]) { assert.match(migrate, new RegExp(migration.replaceAll(".", "\\."))); assert.match(preflight, new RegExp(migration.replaceAll(".", "\\."))); }
  assert.match(migrate, /wrangler d1 export/); assert.match(migrate, /FILE_HUB_AGENT_KEY/); assert.match(migrate, /AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/); assert.match(migrate, /AZURE_DOCUMENT_INTELLIGENCE_KEY/); assert.match(migrate, /RESEND_API_KEY/); assert.doesNotMatch(migrate, /\bd1\s+migrations\s+apply\b/i); assert.doesNotMatch(migrate, /\bwrangler\s+deploy\b/i); assert.doesNotMatch(migrate, /\bwrangler\s+pages\s+deploy\b/i);
  assert.match(preflight, /npm run typecheck/); assert.match(preflight, /npm test/); assert.match(preflight, /npm run build/); assert.match(preflight, /--local/); assert.doesNotMatch(preflight, /--remote/);
  assert.match(launcher, /KYERP_FILE_HUB_ACCOUNTING_PREFLIGHT\.ps1/); assert.match(launcher, /KYERP_FILE_HUB_ACCOUNTING_PRODUCTION_MIGRATE\.ps1/);
  const migrationRun = launcher.lastIndexOf("KYERP_FILE_HUB_ACCOUNTING_PRODUCTION_MIGRATE.ps1"); const deployRun = launcher.lastIndexOf("KYERP_DIRECT_PRODUCTION.ps1"); assert.ok(migrationRun >= 0); assert.ok(deployRun >= 0); assert.ok(migrationRun < deployRun, "targeted D1 migration must complete before Worker/Pages deploy");
});
