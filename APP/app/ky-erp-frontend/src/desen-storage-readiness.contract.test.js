import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bar = readFileSync(new URL("./pages/desen/DesenFolderSettingsBar.jsx", import.meta.url), "utf8");

test("Desen storage status does not call an AGENT registration a direct cloud connection", () => {
  assert.match(bar, /syncMode === "CLOUD_API"/);
  assert.match(bar, /connectionStatus === "CONNECTED"/);
  assert.match(bar, /remoteRootId/);
  assert.match(bar, /Doğrudan bulut bağlantısı tamamlanmadı/);
  assert.match(bar, /Bulut kaydı Agent modunda/);
  assert.doesNotMatch(bar, />Google Drive aktif</);
});

test("Desen storage status exposes last sync and provider errors", () => {
  assert.match(bar, /lastSyncAt/);
  assert.match(bar, /lastError/);
  assert.match(bar, /henüz senkron yok/);
});
