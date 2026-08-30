import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const deployRoot = resolve(here, "../../../../DEPLOY");
const canonical = readFileSync(resolve(deployRoot, "KYERP_DIRECT_PRODUCTION.ps1"), "utf8");
const v4 = readFileSync(resolve(deployRoot, "KYERP_DIRECT_PRODUCTION_V4.ps1"), "utf8");

test("canonical production deploy delegates to Pages auto-resolving V4", () => {
  assert.match(canonical, /\$script = Join-Path \$PSScriptRoot "KYERP_DIRECT_PRODUCTION_V4\.ps1"/);
  assert.match(canonical, /KYERP_DIRECT_PRODUCTION_V3\.ps1 remains the guarded Worker\/D1\/Pages production engine/);
});

test("V4 resolves the real Pages project from Cloudflare instead of assuming one fixed project", () => {
  assert.match(v4, /wrangler pages project list --json/);
  assert.match(v4, /kyerp\.net/);
  assert.match(v4, /app\.kyerp\.net/);
  assert.match(v4, /Project-Domains/);
  assert.match(v4, /Project-RepoMatches/);
  assert.match(v4, /\$pages = Resolve-Pages-Project/);
  assert.match(v4, /\$pages\.Name/);
  assert.match(v4, /\$pages\.ProductionBranch/);
  assert.match(v4, /iki farkli Pages projesine bagli/);
  assert.match(v4, /\$newDeploy = 'wrangler pages deploy dist --project-name=/);
  assert.match(v4, /\$source\.Replace\(\$oldDeploy, \$newDeploy\)/);
});

test("V4 keeps full auth integration in the canonical runtime preflight", () => {
  assert.match(v4, /\$source\.Replace\('npm run test:unit', 'npm test'\)/);
  assert.match(v4, /Worker tam unit\/auth integration testleri basarisiz/);
});
