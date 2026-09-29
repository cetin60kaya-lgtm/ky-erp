import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appV3 = readFileSync(new URL("./AppV3.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("./app/moduleRegistry.js", import.meta.url), "utf8");
const workspace = readFileSync(new URL("./pages/modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("./services/dailyOpsApi.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Günlük Operasyon AppV3 içinde bağımsız çalışma alanına bağlanır", () => {
  assert.match(appV3, /const DailyHrWorkspace = lazyWithRetry\(\(\) => import\("\.\/pages\/modules\/ik\/DailyHrWorkspace"\)/);
  assert.match(appV3, /"gunluk-operasyon": \(\) => import\("\.\/pages\/modules\/ik\/DailyHrWorkspace"\)/);
  assert.match(appV3, /activeModule\?\.key === "gunluk-operasyon"\) return <DailyHrWorkspace activeTab=\{activeTab\}/);
});

test("Günlük Operasyon dört canonical sayfayı sol menüden açar", () => {
  assert.match(registry, /key: "gunluk-operasyon"/);
  assert.match(registry, /\["daily-entry", "Günlük Giriş", "takvim"\]/);
  assert.match(registry, /\["daily-cards", "Personel Kartları", "users"\]/);
  assert.match(registry, /\["daily-weekly", "Haftalık Özet", "raporlar"\]/);
  assert.match(registry, /\["daily-payments", "Ödeme Fişleri", "odemeler"\]/);
});

test("Günlük Operasyon legacy IkPage ve ikApi bağı olmadan çalışır", () => {
  assert.doesNotMatch(workspace, /IkPage/);
  assert.doesNotMatch(workspace, /services\/ikApi/);
  assert.match(workspace, /services\/dailyOpsApi/);
  assert.match(workspace, /activeTab/);
});

test("Günlük Operasyon yalnız canonical api yollarını kullanır", () => {
  assert.match(api, /const ROOT = "\/gunluk-operasyon"/);
  assert.doesNotMatch(api, /"\/ik\//);
  assert.match(api, /attendance\/mark-paid/);
  assert.match(api, /\/records/);
  assert.match(api, /\/roster/);
});

test("Günlük Operasyon runtime patch scriptleri index.html içinde yüklenmez", () => {
  for (const legacy of [
    "ik-daily-payment-enhancer",
    "ik-print-engine",
    "gunluk-ops-ui",
    "ik-weekly-default-guard",
    "ik-daily-concurrency-guard",
    "ik-daily-device-consistency",
    "gunluk-ops-safety-v2",
    "ik-daily-period-lock-ui",
    "ik-current-week",
  ]) {
    assert.doesNotMatch(html, new RegExp(legacy));
  }
});
