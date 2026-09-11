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
  assert.match(shell, /shell-v3-install-button/);
  assert.match(shell, /shell-v3-icon notification/);
  assert.match(shell, /shell-v3-user-trigger/);
  assert.match(shell, /shell-v3-user-menu/);
  assert.match(shell, /Telefon Onayı/);
  assert.match(shell, /shell-v3-display-button/);
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

test("async İşNet PDF/XML and print buttons survive Android popup blocking", () => {
  const fileApi = read("./services/isnetLocalFileApi.js");
  const documentCenter = read("./pages/modules/isnet/IsnetDocumentCenterPage.jsx");
  const printPage = read("./pages/modules/isnet/IsnetSelectedPrintPage.jsx");

  assert.match(fileApi, /reserveBlobTab/);
  assert.match(fileApi, /preview\.opener = null/);
  assert.match(fileApi, /window\.location\.assign\(url\)/);
  assert.match(documentCenter, /const preview = reserveBlobTab\(\)/);
  assert.match(documentCenter, /openBlobInNewTab\(blob, preview\)/);
  assert.match(printPage, /const preview = reserveBlobTab\(\)/);
  assert.match(printPage, /openBlobInNewTab\(blob, preview\)/);
});

test("desktop double-click shortcuts keep a single-tap path on touch screens", () => {
  const desen = read("./pages/desen/DesenModeller.jsx");
  const reports = read("./pages/modules/muhasebe/MuhasebeReportsWorkspace.jsx");

  assert.match(desen, /runTouchRowAction/);
  assert.match(desen, /onClick=\{\(event\) => runTouchRowAction/);
  assert.match(reports, /runTouchRowAction/);
  assert.match(reports, /onClick=\{\(event\) =>/);
});
