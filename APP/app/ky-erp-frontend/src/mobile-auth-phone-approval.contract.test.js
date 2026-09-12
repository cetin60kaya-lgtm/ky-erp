import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), "utf8");

test("mobile login keeps credentials first and touch friendly", () => {
  const page = read("./pages/LoginPage.jsx");
  const css = read("./pages/LoginPage.css");
  assert.match(page, /auth-mobile-brand/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /\.auth-brand-panel\{display:none!important\}/);
  assert.match(css, /min-height:100dvh!important/);
  assert.match(css, /font-size:16px!important/);
  assert.match(css, /min-height:52px!important/);
});

test("live AppV3 shell exposes Telefon Onayi and mobile setup is full screen", () => {
  const main = read("./main.jsx");
  const appV3 = read("./AppV3.jsx");
  const shell = read("./layouts/AppShellV3.jsx");
  const shellCss = read("./styles/shell-v3.css");
  const setupCss = read("./components/shell/phone-approval-setup.css");

  assert.match(main, /import\("\.\/AppV3\.jsx"\)/);
  assert.match(appV3, /AppShellV3/);
  assert.match(shell, /PhoneApprovalSetup/);
  assert.match(shell, /openPhoneApprovalFromProfile/);
  assert.match(shell, />Telefon Onayı</);
  assert.match(shell, /shell-v3-user-menu/);
  assert.match(shell, /setPhoneApprovalOpen\(true\)/);
  assert.match(shellCss, /shell-v3-phone-approval-button/);
  assert.match(shellCss, /data-layout-mode="phone"/);
  assert.match(shellCss, /min-width: 132px !important/);
  assert.match(setupCss, /height:100dvh/);
  assert.match(setupCss, /font-size:16px/);
});


test("phone approval is handed off to the dedicated KY ERP Security PWA", () => {
  const setup = read("./components/shell/PhoneApprovalDeviceSetup.jsx");
  const securityApp = read("../public/security/app.js");
  const securityWorker = read("../public/security/sw.js");
  const securityManifest = read("../public/security/manifest.webmanifest");

  assert.match(setup, /security-enrollment\/start/);
  assert.match(setup, /Yeni Kurulum Kodu Oluştur/);
  assert.match(setup, /app\.kyerp\.net\/security/);
  assert.match(securityManifest, /"id": "\/security\/"/);
  assert.match(securityWorker, /const TAG="kyerp-security-approval"/);
  assert.match(securityWorker, /tag:TAG/);
  assert.match(securityWorker, /notificationclick/);
  assert.match(securityApp, /signingPrivateKey/);
  assert.match(securityApp, /navigator\.credentials\.get/);
});


test("Android PWA install, phone notifications and tablet naming stay usable", () => {
  const shell = read("./layouts/AppShellV3.jsx");
  const responsive = read("./styles/responsive-core.css");
  const setup = read("./components/shell/PhoneApprovalDeviceSetup.jsx");
  const manifest = read("../public/manifest.webmanifest");
  const securityManifest = read("../public/security/manifest.webmanifest");
  const securityApp = read("../public/security/app.js");

  assert.match(shell, /beforeinstallprompt/);
  assert.match(shell, /KY ERP'yi Bu Cihaza Yükle/);
  assert.match(shell, /appinstalled/);
  assert.match(responsive, /data-layout-mode="phone"[\s\S]*shell-v3-icon\.notification/);
  assert.match(responsive, /shell-v3-install-button/);
  assert.match(setup, /openSecurityInstaller\("android"\)/);
  assert.match(setup, /iPhone\/iPad/);
  assert.match(securityApp, /Android Telefon/);
  assert.match(securityApp, /Android Tablet/);
  assert.match(securityManifest, /"display": "standalone"/);
  assert.match(securityManifest, /"scope": "\/security\/"/);
  assert.match(securityManifest, /kyerp-security-icon\.svg/);
  assert.match(manifest, /"id": "\/"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"shortcuts"/);
  assert.match(manifest, /Üretim İş Havuzu/);
});
