import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(resolve(here, relative), "utf8");

test("phone and tablet keep every core desktop shell action reachable", () => {
  const shell = read("./layouts/AppShellV3.jsx");
  const css = read("./styles/shell-v3.css");
  const responsive = read("./styles/responsive-core.css");

  assert.match(shell, /shell-v3-user-avatar/);
  assert.match(shell, /shell-v3-mobile-utilities/);
  assert.match(shell, /Hızlı İşlem/);
  assert.match(shell, /Bildirim Merkezi/);
  assert.match(shell, /Telefon Onayı/);
  assert.match(shell, /Ekran ve Görünüm/);
  assert.match(shell, /Güvenli Çıkış/);
  assert.match(css, /shell-v3-mobile-utilities-backdrop/);
  assert.match(responsive, /shell-v3-user > \.shell-v3-user-avatar/);
  assert.match(responsive, /shell-v3-icon\.notification[\s\S]*display: grid/);
});

test("all modules inherit Android touch targets, scrolling and software keyboard safety", () => {
  const responsive = read("./styles/responsive-core.css");
  const runtime = read("./utils/installAndroidRuntimeBridge.js");
  const main = read("./main.jsx");

  assert.match(responsive, /@media \(pointer: coarse\)/);
  assert.match(responsive, /min-height: 44px/);
  assert.match(responsive, /overflow-x: auto !important/);
  assert.match(responsive, /data-ky-keyboard-open/);
  assert.match(runtime, /visualViewport/);
  assert.match(runtime, /scrollIntoView/);
  assert.match(runtime, /data-ky-android/);
  assert.match(main, /installAndroidRuntimeBridge\(\)/);
});

test("async İşNet PDF and print buttons survive Android popup blocking", () => {
  const fileApi = read("./services/isnetLocalFileApi.js");
  const documentCenter = read("./pages/modules/isnet/IsnetDocumentCenterPage.jsx");
  const printPage = read("./pages/modules/isnet/IsnetSelectedPrintPage.jsx");

  assert.match(fileApi, /reserveBlobTab/);
  assert.match(fileApi, /window\.location\.assign\(url\)/);
  assert.match(documentCenter, /const preview = reserveBlobTab\(\)/);
  assert.match(documentCenter, /openBlobInNewTab\(blob, preview\)/);
  assert.match(printPage, /const preview = reserveBlobTab\(\)/);
  assert.match(printPage, /openBlobInNewTab\(blob, preview\)/);
});

test("desktop double-click shortcuts have a single-tap path on touch screens", () => {
  const desen = read("./pages/desen/DesenModeller.jsx");
  const reports = read("./pages/modules/muhasebe/MuhasebeReportsWorkspace.jsx");

  assert.match(desen, /runTouchRowAction/);
  assert.match(desen, /onClick=\{\(event\) => runTouchRowAction/);
  assert.match(reports, /runTouchRowAction/);
  assert.match(reports, /onClick=\{\(event\) =>/);
});
