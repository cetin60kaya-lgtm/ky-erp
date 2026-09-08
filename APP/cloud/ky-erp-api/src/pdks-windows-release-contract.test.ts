import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pdks = (name: string) => readFileSync(resolve(here, "../../../desktop/ky-pdks", name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("KY PDKS Pro 1.9.0 release chain is standalone and version-locked", () => {
  assert.equal(pdks("VERSION").trim(), "1.9.0");
  const build = pdks("BUILD_PDKS_PRO_SETUP.ps1");
  assert.match(build, /\$Version = '1\.9\.0'/);
  assert.match(build, /npm test/);
  assert.match(build, /npm run lint/);
  assert.match(build, /npm run build/);
  assert.match(build, /Frontend test/);
  assert.match(build, /dotnet test/);
  assert.match(build, /ProductMode=PDKS/);
  assert.match(build, /KY PDKS Pro\.exe/);
  assert.match(build, /KYERP\.PDKS\.Agent\.exe/);
  assert.match(build, /MicrosoftEdgeWebview2Setup\.exe/);
  assert.match(build, /Get-FileHash/);
});

test("PDKS installer owns Agent, WebView2 and legacy-brand cleanup but ERP installer does not own Agent", () => {
  const installer = pdks("installer/KY-PDKS.iss");
  const erp = pdks("installer/KY-ERP.iss");
  const service = pdks("installer/install-pdks-agent.ps1");
  assert.match(installer, /AppName=\{#MyAppName\}/);
  assert.match(installer, /KY-PDKS-Pro-Setup-/);
  assert.match(installer, /MicrosoftEdgeWebview2Setup\.exe/);
  assert.match(installer, /install-pdks-agent\.ps1/);
  assert.match(installer, /KY PDKS Desktop\.exe/);
  assert.doesNotMatch(erp, /KYERP\.PDKS\.Agent/);
  assert.match(erp, /MicrosoftEdgeWebview2Setup\.exe/);
  assert.match(service, /Wait-ServiceGone/);
  assert.match(service, /Status -eq 'Running'/);
  assert.match(service, /failureflag/);
});

test("one-click bootstrap avoids scalar Count bug and verifies installed Agent", () => {
  const source = pdks("KY_PDKS_PRO_190_BUILD_INSTALL.ps1");
  assert.match(source, /@\(\(Get-Command \$Name -ErrorAction SilentlyContinue\)\)\.Count/);
  assert.match(source, /\$innoCandidates=@\(\$innoCandidates\)/);
  assert.match(source, /BUILD_PDKS_PRO_SETUP\.ps1/);
  assert.match(source, /Get-FileHash/);
  assert.match(source, /Get-Service -Name 'KYERP\.PDKS\.Agent'/);
  assert.match(source, /WaitForStatus\('Running'/);
  assert.match(source, /Start-Process -FilePath \$appPath/);
});

test("standalone first run keeps local terminal setup available while D1 enrollment retries", () => {
  const desktop = pdks("src/KyPdks.Desktop/KyErpDesktopWindow.xaml.cs");
  assert.match(desktop, /sessionStorage\.getItem\('kyerp_auth_token'\)/);
  assert.match(desktop, /_pdksFirstRunWizardShown/);
  assert.match(desktop, /PdksTerminalSetupWindow/);
  assert.match(desktop, /D1 cihaz yetkilendirmesi bekliyor/);
  assert.match(desktop, /EnsurePdksAgentEnrollmentAsync/);
  assert.match(desktop, /localStorage\.getItem\('kyerp\.activeCompany'\)/);
  assert.match(desktop, /current\.Company, activeCompanySlug/);
  assert.match(desktop, /EnrollAsync\(token, _pdksPaths, activeCompanySlug, ct\)/);
});

test("standalone frontend registers PDKS before module visibility is computed", () => {
  const app = frontend("AppV3.jsx");
  assert.match(app, /import "\.\/app\/pdksModuleRegistryPatch";/);
  assert.match(app, /standaloneProduct === "PDKS"/);
  assert.match(app, /allowed\.filter\(\(item\) => item\.key === "pdks"\)/);
});


test("PDKS enrollment monitor stays alive after successful heartbeat for tenant switches", () => {
  const desktop = pdks("src/KyPdks.Desktop/KyErpDesktopWindow.xaml.cs");
  assert.doesNotMatch(desktop, /if \(await EnsurePdksAgentEnrollmentAsync\([^\n]+\)\) return;/);
  assert.match(desktop, /await EnsurePdksAgentEnrollmentAsync\(token, _lifetime\.Token\);/);
});

test("PDKS 1.9 release workflow remains manual-only", () => {
  const workflow = readFileSync(resolve(here, "../../../../.github/workflows/ky-pdks-pro-190-release.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
});
