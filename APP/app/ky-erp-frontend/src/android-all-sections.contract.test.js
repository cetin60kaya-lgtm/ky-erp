import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), "utf8");

test("phone and tablet keep desktop shell actions reachable", () => {
  const shell = read("./layouts/AppShellV3.jsx");
  const responsive = read("./styles/responsive-core.css");

  assert.match(shell, /shell-v3-quick-button/);
  assert.match(shell, /KY ERP'yi Bu Cihaza Yükle/);
  assert.match(shell, /shell-v3-icon notification/);
  assert.match(shell, /shell-v3-user-trigger/);
  assert.match(shell, /shell-v3-user-menu/);
  assert.match(shell, /openPhoneApprovalFromProfile/);
  assert.match(shell, /Telefon Onayı/);
  assert.match(shell, /openDisplaySettingsFromProfile/);
  assert.match(shell, /onLogout/);
  assert.match(responsive, /data-layout-mode="phone"[\s\S]*shell-v3-icon\.notification[\s\S]*display: grid !important/);
  assert.match(responsive, /data-layout-mode="tablet"[\s\S]*shell-v3-user > \.shell-v3-user-trigger/);
});

test("all modules inherit Android touch targets, scrolling and software keyboard safety", () => {
  const responsive = read("./styles/responsive-core.css");
  const runtime = read("./utils/installAndroidRuntimeBridge.js");
  const main = read("./main.jsx");

  assert.match(responsive, /Android \/ dokunmatik bütün-modül erişilebilirlik katmanı/);
  assert.match(responsive, /@media \(pointer: coarse\)/);
  assert.match(responsive, /min-height: 44px/);
  assert.match(responsive, /overflow-x: auto !important/);
  assert.match(responsive, /data-ky-keyboard-open/);
  assert.match(responsive, /calc\(88px \+ var\(--ky-safe-bottom\)\)/);
  assert.match(runtime, /visualViewport/);
  assert.match(runtime, /scrollIntoView/);
  assert.match(runtime, /data-ky-android/);
  assert.match(main, /installAndroidRuntimeBridge\(\)/);
});

test("async e-Belge file preview survives Android popup blocking", () => {
  const api = read("./services/eBelgeApi.js");
  const center = read("./pages/modules/muhasebe/EBelgeCenterPage.jsx");

  assert.match(api, /reserveEBelgePreviewTab/);
  assert.match(api, /preview\.opener = null/);
  assert.match(api, /window\.location\.assign\(url\)/);
  assert.match(center, /const reservedWindow = reserveEBelgePreviewTab\(\)/);
  assert.match(center, /openEBelgeBlob\(await getEBelgeFilePreview\(file\.id\), reservedWindow\)/);
});

test("desktop double-click shortcuts keep a single-tap path on touch screens", () => {
  const desen = read("./pages/desen/DesenModeller.jsx");
  const reports = read("./pages/modules/muhasebe/MuhasebeReportsWorkspace.jsx");

  assert.match(desen, /runTouchRowAction/);
  assert.match(desen, /onClick=\{\(event\) => runTouchRowAction/);
  assert.match(reports, /runTouchRowAction/);
  assert.match(reports, /onClick=\{\(event\) =>/);
});
