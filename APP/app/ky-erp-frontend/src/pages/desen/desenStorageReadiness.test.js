import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDesenStorageTargets, canOfferPlacementBinding, canOfferOutgoingCloudBinding } from "./desenStorageReadiness.js";

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

test("firma varsayılanına düşen yerleşim bağlantısı 4/4 bağlı sayılmaz", () => {
  const state = analyzeDesenStorageTargets([
    { ...connected("MODEL_IMAGE"), exact: true },
    { ...connected("MODEL_SOURCE"), exact: true },
    { ...connected("PLACEMENT"), exact: false },
    { ...connected("OUTGOING_DESIGN"), exact: true, syncMode: "AGENT" },
  ]);
  assert.equal(state.connected.length, 3);
});

test("yerleşim ataması yalnız doğrulanmış MODELLER kökünden ve aynı bağlantıdan önerilir", () => {
  const source = {
    ...connected("MODEL_SOURCE"), exact: true, syncEnabled: true,
    connectionId: "conn-1", rootPath: "modeller",
  };
  const placement = {
    ...connected("PLACEMENT"), exact: false,
    connectionId: "conn-1",
  };
  assert.equal(canOfferPlacementBinding([source, placement]), true);
  assert.equal(canOfferPlacementBinding([source, { ...placement, connectionId: "conn-2" }]), false);
  assert.equal(canOfferPlacementBinding([{ ...source, rootPath: "farkli" }, placement]), false);
  assert.equal(canOfferPlacementBinding([{ ...source, connectionStatus: "ERROR" }, placement]), false);
  assert.equal(canOfferPlacementBinding([source, { ...placement, exact: true }]), false);
});

test("giden PSD yalnız çalışmayan Drive AGENT atamasından, onaylı kaynak bağlantısına geçirilebilir", () => {
  const source = { ...connected("MODEL_SOURCE"), exact: true, syncEnabled: true, connectionId: "cloud-1", rootPath: "modeller" };
  const outgoing = { ...connected("OUTGOING_DESIGN"), exact: true, syncEnabled: true,
    provider: "GOOGLE_DRIVE", syncMode: "AGENT", connectionStatus: "UNKNOWN", connectionId: "old-agent", rootPath: "giden desenler" };
  assert.equal(canOfferOutgoingCloudBinding([source, outgoing]), true);
  assert.equal(canOfferOutgoingCloudBinding([source, { ...outgoing, connectionStatus: "CONNECTED" }]), false);
  assert.equal(canOfferOutgoingCloudBinding([source, { ...outgoing, syncMode: "CLOUD_API" }]), false);
  assert.equal(canOfferOutgoingCloudBinding([source, { ...outgoing, provider: "LOCAL_FOLDER" }]), false);
  assert.equal(canOfferOutgoingCloudBinding([{ ...source, rootPath: "baska" }, outgoing]), false);
  assert.equal(canOfferOutgoingCloudBinding([{ ...source, remoteRootId: "" }, outgoing]), false);
  assert.equal(canOfferOutgoingCloudBinding([{ ...source, connectionStatus: "ERROR" }, outgoing]), false);
  assert.equal(canOfferOutgoingCloudBinding([source, { ...outgoing, syncEnabled: false }]), false);
});
