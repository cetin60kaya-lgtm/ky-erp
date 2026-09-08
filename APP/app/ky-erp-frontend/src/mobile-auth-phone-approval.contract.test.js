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
  assert.match(shell, /shell-v3-phone-approval-button/);
  assert.match(shell, />Telefon Onayı</);
  assert.match(shell, /setPhoneApprovalOpen\(true\)/);
  assert.match(shellCss, /shell-v3-phone-approval-button/);
  assert.match(shellCss, /data-layout-mode="phone"/);
  assert.match(shellCss, /min-width: 132px !important/);
  assert.match(setupCss, /height:100dvh/);
  assert.match(setupCss, /font-size:16px/);
});


test("phone approval persists device capability and recovers missing local key", () => {
  const setup = read("./components/shell/PhoneApprovalSetup.jsx");
  const inbox = read("./components/shell/PhoneApprovalInboxBridge.jsx");
  const shell = read("./layouts/AppShellV3.jsx");

  assert.match(setup, /persistDeviceCredentials/);
  assert.match(setup, /kyerp-push-security-v1/);
  assert.match(setup, /await persistDeviceCredentials\(deviceCredentials\)/);
  assert.match(inbox, /PUSH_DEVICE_NOT_CONFIGURED/);
  assert.match(inbox, /Telefonu Yeniden Kaydet/);
  assert.match(inbox, /kyerp:open-phone-approval-setup/);
  assert.match(shell, /addEventListener\("kyerp:open-phone-approval-setup"/);
});


test("Android PWA install, phone notifications and tablet naming stay usable", () => {
  const shell = read("./layouts/AppShellV3.jsx");
  const responsive = read("./styles/responsive-core.css");
  const setup = read("./components/shell/PhoneApprovalSetup.jsx");
  const manifest = read("../public/manifest.webmanifest");

  assert.match(shell, /beforeinstallprompt/);
  assert.match(shell, /Uygulamayı Yükle/);
  assert.match(shell, /appinstalled/);
  assert.match(responsive, /data-layout-mode="phone"[\s\S]*shell-v3-icon\.notification/);
  assert.match(responsive, /shell-v3-install-button/);
  assert.match(setup, /Android Telefon/);
  assert.match(setup, /Android Tablet/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"shortcuts"/);
  assert.match(manifest, /Üretim İş Havuzu/);
});
