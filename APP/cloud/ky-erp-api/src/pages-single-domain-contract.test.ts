import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const deployRoot = resolve(here, "../../../../DEPLOY");
const repoRoot = resolve(here, "../../../..");
const canonical = readFileSync(resolve(deployRoot, "KYERP_DIRECT_PRODUCTION.ps1"), "utf8");
const v5 = readFileSync(resolve(deployRoot, "KYERP_DIRECT_PRODUCTION_V5.ps1"), "utf8");
const agents = readFileSync(resolve(repoRoot, "AGENTS.md"), "utf8");

test("repository exposes a machine-readable one-public-app contract", () => {
  assert.match(agents, /KYERP_PUBLIC_APP=https:\/\/kyerp\.net\//);
});

test("canonical production entrypoint delegates to V5 single-address deploy", () => {
  assert.match(canonical, /KYERP_DIRECT_PRODUCTION_V5\.ps1/);
  assert.match(canonical, /Tek kullanici uygulama adresi: https:\/\/kyerp\.net\//);
  assert.doesNotMatch(canonical, /KYERP_DIRECT_PRODUCTION_V4\.ps1/);
});

test("V5 uses kyerp.net as the one public frontend and keeps api.kyerp.net as backend", () => {
  assert.match(v5, /\$PUBLIC_DOMAIN = "kyerp\.net"/);
  assert.match(v5, /Public app : https:\/\/\$PUBLIC_DOMAIN\//);
  assert.match(v5, /https:\/\/api\.kyerp\.net \(backend\)/);
  assert.match(v5, /Tek kullanici uygulama adresi/);
});

test("V5 can safely recover a missing Pages project after preflight", () => {
  assert.match(v5, /wrangler auth token --json/);
  assert.match(v5, /\/pages\/projects/);
  assert.match(v5, /production_branch = \$BRANCH/);
  assert.match(v5, /Resolve-Or-Create-KyPagesProject/);
  assert.match(v5, /Cloudflare root-domain Worker cakismasi: YOK/);
  assert.match(v5, /Ensure-KySinglePublicDomain/);
  assert.match(v5, /Pages custom domain: ACTIVE/);
});

test("V5 keeps full Worker auth integration and injects Pages preparation before the D1 stage", () => {
  assert.match(v5, /\$source\.Replace\('npm run test:unit', 'npm test'\)/);
  assert.match(v5, /Worker tam unit\/auth integration testleri basarisiz/);
  assert.match(v5, /\$d1Marker = 'Write-Host "=== 5\/11 D1 YEDEK \+ HEDEFLI UYUMLULUK ===" -ForegroundColor Cyan'/);
  assert.match(v5, /\$pagesInit = @'/);
  assert.match(v5, /Resolve-Or-Create-KyPagesProject/);
  assert.match(v5, /\$source = \$source\.Replace\(\$d1Marker, \$pagesInit \+ "`r`n" \+ \$d1Marker\)/);
  assert.match(v5, /Runtime deploy scriptinde ikinci frontend domain referansi kaldi/);
  assert.match(v5, /=== 9\/11 TEK DOMAIN ASSET DOGRULAMA ===/);

  const d1MarkerDefinition = v5.indexOf("$d1Marker =");
  const pagesInitDefinition = v5.indexOf("$pagesInit =");
  const d1Injection = v5.indexOf("$source = $source.Replace($d1Marker");
  assert.ok(d1MarkerDefinition >= 0);
  assert.ok(pagesInitDefinition > d1MarkerDefinition);
  assert.ok(d1Injection > pagesInitDefinition);
});
