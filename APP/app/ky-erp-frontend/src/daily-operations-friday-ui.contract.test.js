import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "pages/modules/ik/DailyHrWorkspace.jsx"), "utf8");
const css = readFileSync(resolve(here, "pages/modules/ik/daily-hr-workspace.css"), "utf8");

test("daily operations keeps Friday rich main workspace", () => {
  for (const text of ["Günlük Personel Girişi", "Hızlı Giriş", "Kayıtlı Seçimi Yükle", "Log", "Dönemi Kapat", "Seçili Gün Kontrolü", "Personel Havuzu"]) assert.match(page, new RegExp(text));
  assert.match(page, /Personel \/ Giriş \/ Durum/);
  assert.match(page, /Gündüz Ücret/);
  assert.match(page, /Gece Ücret/);
});

test("quick entry is focused day and shift with group control", () => {
  for (const text of ["TEK GÜN GÜVENLİ HIZLI GİRİŞ", "Kontrol Edildi", "Kontrol Bekleyen", "Vasıfın Tümünü Seç", "Kaydet ve Sonraki Gün"]) assert.match(page, new RegExp(text));
  assert.match(page, /baseline/);
  assert.match(page, /sameSet/);
  assert.match(page, /changeQuickFocus/);
  assert.match(css, /quick-person-grid/);
  assert.match(css, /quick-person\.checked/);
});

test("log and payment flows stay on standalone daily operations owner", () => {
  for (const text of ["Log + Özet", "Gelişmiş Arama", "Personel Kontrol", "ÖDENDİ · Bu kayıt ödenmiştir", "markDailyPaid", "getDailyAudit"]) assert.ok(page.includes(text), `missing ${text}`);
  assert.doesNotMatch(page, /IkPage/);
  assert.doesNotMatch(page, /\/api\/ik/);
  assert.match(page, /services\/dailyOpsApi/);
});
