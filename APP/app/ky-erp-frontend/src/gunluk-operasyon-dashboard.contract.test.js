import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "pages/modules/GunlukOperasyonPage.jsx"), "utf8");
const css = readFileSync(resolve(here, "pages/modules/gunluk-operasyon.css"), "utf8");

test("daily operations dashboard exposes fast operational actions", () => {
  assert.match(page, /GÜNLÜK OPERASYON \/ KONTROL MERKEZİ/);
  assert.match(page, /openOperationTab\("gunluk-giris"\)/);
  assert.match(page, /openOperationTab\("personel-kartlari"\)/);
  assert.match(page, /openOperationTab\("haftalik-ozet"\)/);
  assert.match(page, /openOperationTab\("odeme-fisleri"\)/);
});

test("daily operations dashboard supports week day and monthly reporting views", () => {
  assert.match(page, /changeWeek/);
  assert.match(page, /selectedWeekDays/);
  assert.match(page, /VARDİYA DENGESİ/);
  assert.match(page, /Bu Hafta \/ Geçen Hafta/);
  assert.match(page, /type="month"/);
  assert.match(page, /Hafta Hafta/);
  assert.match(page, /downloadMonthlyCsv/);
  assert.match(page, /Gündüz/);
  assert.match(page, /Gece/);
});

test("dashboard stays on canonical daily APIs and contains no demo rows", () => {
  assert.match(page, /getGunlukPersonel/);
  assert.match(page, /getGunlukDurum/);
  assert.doesNotMatch(page, /demoData|mockData|sampleData/i);
  assert.doesNotMatch(page, /getAylikPersonel|getBordro|getLeaves/);
});

test("daily dashboard keeps phone and tablet interaction parity", () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:460px\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /gop-history\{overflow:auto\}/);
  assert.match(css, /gop-filter-pills/);
});
