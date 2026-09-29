import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appV3 = readFileSync(new URL("./AppV3.jsx", import.meta.url), "utf8");
const registry = readFileSync(new URL("./app/moduleRegistry.js", import.meta.url), "utf8");

test("Günlük Operasyon AppV3 içinde gerçek çalışma ekranına bağlanır", () => {
  assert.match(appV3, /const DailyHrWorkspace = lazyWithRetry\(\(\) => import\("\.\/pages\/modules\/ik\/DailyHrWorkspace"\)/);
  assert.match(appV3, /"gunluk-operasyon": \(\) => import\("\.\/pages\/modules\/ik\/DailyHrWorkspace"\)/);
  assert.match(appV3, /activeModule\?\.key === "gunluk-operasyon"\) return <DailyHrWorkspace/);
});

test("Günlük Operasyon canonical route daily-entry olarak kayıtlıdır", () => {
  assert.match(registry, /key: "gunluk-operasyon"/);
  assert.match(registry, /\["daily-entry", "Günlük Operasyon", "takvim"\]/);
});
