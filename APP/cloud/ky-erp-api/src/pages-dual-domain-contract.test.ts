import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const deployRoot = resolve(here, "../../../../DEPLOY");
const repoRoot = resolve(here, "../../../..");
const canonical = readFileSync(resolve(deployRoot, "KYERP_DIRECT_PRODUCTION.ps1"), "utf8");
const v6 = readFileSync(resolve(deployRoot, "KYERP_DIRECT_PRODUCTION_V6.ps1"), "utf8");
const agents = readFileSync(resolve(repoRoot, "AGENTS.md"), "utf8");

test("repository exposes machine-readable site, app and api contract", () => {
  assert.match(agents, /KYERP_PUBLIC_SITE=https:\/\/kyerp\.net\//);
  assert.match(agents, /KYERP_PUBLIC_APP=https:\/\/app\.kyerp\.net\//);
  assert.match(agents, /KYERP_API_ORIGIN=https:\/\/api\.kyerp\.net/);
});

test("canonical production entrypoint delegates to V6 site + app deploy", () => {
  assert.match(canonical, /KYERP_DIRECT_PRODUCTION_V6\.ps1/);
  assert.match(canonical, /Tanitim sitesi: https:\/\/kyerp\.net\//);
  assert.match(canonical, /ERP uygulamasi: https:\/\/app\.kyerp\.net\//);
  assert.doesNotMatch(canonical, /KYERP_DIRECT_PRODUCTION_V5\.ps1/);
});

test("V6 keeps public site, ERP app and API as separate canonical origins", () => {
  assert.match(v6, /\$SITE_DOMAIN = "kyerp\.net"/);
  assert.match(v6, /\$APP_DOMAIN = "app\.kyerp\.net"/);
  assert.match(v6, /Tanitim : https:\/\/\$SITE_DOMAIN\//);
  assert.match(v6, /ERP     : https:\/\/\$APP_DOMAIN\//);
  assert.match(v6, /API     : https:\/\/api\.kyerp\.net/);
});

test("V6 resolves one Pages project and requires both custom domains active", () => {
  assert.match(v6, /wrangler auth token --json/);
  assert.match(v6, /Resolve-Or-Create-KyPagesProject/);
  assert.match(v6, /Ensure-KyPagesDomain \$SITE_DOMAIN/);
  assert.match(v6, /Ensure-KyPagesDomain \$APP_DOMAIN/);
  assert.match(v6, /Ensure-KyDualPublicDomains/);
  assert.match(v6, /Pages custom domain: ACTIVE/);
});

test("V6 refreshes Wrangler OAuth after Pages deploy before REST domain verification", () => {
  assert.match(v6, /function Get-KyFreshWranglerToken/);
  assert.match(v6, /function Ensure-KyPagesDomain\(\[string\]\$Domain\)[\s\S]*?\$script:CF_TOKEN = Get-KyFreshWranglerToken/);
  assert.doesNotMatch(v6, /\$env:KYERP_CF_TOKEN = \$script:CF_TOKEN/);
  assert.match(v6, /--commit-dirty=true/);
});

test("V6 keeps full Worker auth integration and verifies both frontend assets", () => {
  assert.match(v6, /\$source\.Replace\('npm run test:unit', 'npm test'\)/);
  assert.match(v6, /Worker tam unit\/auth integration testleri basarisiz/);
  assert.match(v6, /Resolve-Or-Create-KyPagesProject/);
  assert.match(v6, /Ensure-KyDualPublicDomains/);
  assert.match(v6, /Origin = "https:\/\/app\.kyerp\.net"/);
  assert.match(v6, /Live-Asset "https:\/\/kyerp\.net"/);
  assert.match(v6, /Live-Asset "https:\/\/app\.kyerp\.net"/);
});
