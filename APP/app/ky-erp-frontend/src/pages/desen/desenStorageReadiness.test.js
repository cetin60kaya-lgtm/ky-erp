import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDesenStorageTargets } from "./desenStorageReadiness.js";

const connected = (purposeCode) => ({
  purposeCode, ok: true, provider: "GOOGLE_DRIVE", syncMode: "CLOUD_API",
  connectionStatus: "CONNECTED", remoteRootId: "root-1",
});

test("üç Drive bulut kaynağı sağlıklı ve giden desen AGENT belirsizse bulut hata uyarısı üretmez", () => {
  const rows = ["MODEL_IMAGE", "MODEL_SOURCE", "PLACEMENT"].map(connected);
  rows.push({ ...connected("OUTGOING_DESIGN"), syncMode: "AGENT", connectionStatus: "UNKNOWN" });
  const state = analyzeDesenStorageTargets(rows);
  assert.equal(state.directReady, true);
  assert.equal(state.cloudPending.length, 0);
  assert.equal(state.agentPending.length, 1);
  assert.equal(state.agentPending[0].purposeCode, "OUTGOING_DESIGN");
});

test("OAuth kökü eksikse doğrudan bulut kaynağını gerçekten bekleyen gösterir", () => {
  const rows = [{ ...connected("PLACEMENT"), remoteRootId: "" }];
  const state = analyzeDesenStorageTargets(rows);
  assert.equal(state.directReady, false);
  assert.equal(state.cloudPending.length, 1);
  assert.equal(state.agentPending.length, 0);
});

test("AGENT bağlıysa yanlış bulut uyarısı ya da belirsiz agent uyarısı çıkmaz", () => {
  const state = analyzeDesenStorageTargets([{
    ...connected("OUTGOING_DESIGN"), syncMode: "AGENT", connectionStatus: "CONNECTED",
  }]);
  assert.equal(state.cloudPending.length, 0);
  assert.equal(state.agentPending.length, 0);
  assert.equal(state.agentRows.length, 1);
});

test("atanmamış kaynağı bağlandı gibi göstermez", () => {
  const state = analyzeDesenStorageTargets([
    connected("MODEL_IMAGE"),
    { purposeCode: "MODEL_SOURCE", ok: false, provider: "GOOGLE_DRIVE" },
  ]);
  assert.equal(state.connected.length, 1);
});
