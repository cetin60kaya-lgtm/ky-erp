import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./modules/ik/DailyHrWorkspace.jsx", import.meta.url), "utf8");
const first = source.indexOf("function printDailyPaymentSlips(range, rows = []) {");
const last = source.indexOf("\nfunction wageRangeLabel(", first);
assert.ok(first >= 0 && last > first, "A4 hakediş çıktısı fonksiyonu bulunamadı.");

const printSlips = runInNewContext(
  "(" + source.slice(first, last).trim() + ")",
  {
    number: (value) => Number(value || 0),
    money: (value) => "TL " + Number(value || 0).toFixed(2),
    dateText: (value) => String(value || ""),
    escapeHtml: (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    printHtmlDocument: (opts) => opts,
  },
);
const period = { start: "2026-10-12", end: "2026-10-18" };
const makeRows = (count) => Array.from({ length: count }, (_, n) => ({
  name: "ÖRNEK " + (n + 1),
  qualification: "Serimci",
  dayCount: 2,
  nightCount: 5,
  dayTotal: 3600,
  nightTotal: 6750,
  additions: 150,
  deductions: 50,
  totalAmount: 10450,
  items: [
    { workDate: "2026-10-12", shift: "day", amount: 1800, active: true },
    { workDate: "2026-10-13", shift: "day", amount: 1800, active: true },
    ...Array.from({ length: 5 }, (_, d) => ({ workDate: "2026-10-" + (12 + d), shift: "night", amount: 1350, active: true })),
  ],
}));
const countMatches = (value, token) => value.split(token).length - 1;

for (const count of [1, 9, 10, 11, 19, 20, 26, 29, 30]) {
  test("A4 " + count + " kişide sayfa sayısı doğru, genel toplam yalnız son sayfada", () => {
    const result = printSlips(period, makeRows(count));
    const pages = result.html.split('<section class="pay-page">').slice(1);
    assert.equal(pages.length, Math.ceil(count / 10));
    assert.equal(countMatches(result.html, '<article class="pay-card">'), count);
    assert.equal(countMatches(result.html, '<footer class="page-grand">'), 1, "genel toplam yalnız bir defa");
    for (let i = 0; i < pages.length; i++) {
      assert.equal(countMatches(pages[i], '<article class="pay-card">'), Math.min(10, count - i * 10));
      assert.equal(pages[i].includes('<footer class="page-grand">'), i === pages.length - 1);
      assert.ok(pages[i].includes("Sayfa " + (i + 1) + " / " + pages.length));
    }
  });
}

test("Fiş üç sütun ücret, adet, toplam aynı satırda; gece 1350 × 5 = 6750", () => {
  const result = printSlips(period, makeRows(1));
  assert.match(result.html, /VARDİYA<\/span><span>ÜCRET<\/span><span>ADET<\/span><span>TOPLAM/);
  assert.match(result.html, /GÜNDÜZ<\/span><b>TL 1800.00<\/b><small>2<\/small><strong>TL 3600.00<\/strong>/);
  assert.match(result.html, /GECE<\/span><b>TL 1350.00<\/b><small>5<\/small><strong>TL 6750.00<\/strong>/);
  assert.match(result.html, /NET HAKEDİŞ<\/span><strong>TL 10450.00<\/strong>/);
  assert.match(result.html, /GENEL TOPLAM · 1 PERSONEL/);
  assert.doesNotMatch(result.html, /class="pay-print"><p style=/);
});

test("Sabit A4: beş 45mm sıra + 4×2.5mm ara ve alt genel toplam A4 alanına sığar", () => {
  const { css } = printSlips(period, makeRows(26));
  assert.match(css, /@page\{size:A4 portrait;margin:5mm\}/);
  assert.match(css, /\.pay-page\{width:200mm;height:286mm/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-rows:repeat\(5,45mm\)/);
  assert.match(css, /\.page-grand\{margin-top:auto;min-height:12mm/);
  // 297 - (2*5) = 287 printable mm; page 286 leaves 1mm browser rounding tolerance.
  const occupied = 13 + 2 + (5 * 45) + (4 * 2.5) + 12;
  assert.ok(occupied <= 286, "A4 başlık + 10 kart + alt toplam sayfa yüksekliğini aşamaz.");
});

test("Boş dönemde fiş üretiminde sahte kişi, sahte genel toplam veya boş A4 sayfası yok", () => {
  const result = printSlips(period, []);
  assert.equal(countMatches(result.html, '<section class="pay-page">'), 0);
  assert.equal(countMatches(result.html, '<footer class="page-grand">'), 0);
  assert.match(result.html, /Kayıt yok/);
});

test("Dönem içinde ücret değiştiyse tek uydurma ücret yerine gerçek ücret aralığı gösterilir", () => {
  const row = makeRows(1)[0];
  row.items[2].amount = 1100;
  row.nightTotal = 6500;
  row.totalAmount = 10200;
  const result = printSlips(period, [row]);
  assert.match(result.html, /TL 1100.00 – TL 1350.00/);
  assert.match(result.html, /GECE<\/span><b>TL 1100.00 – TL 1350.00<\/b><small>5<\/small><strong>TL 6500.00<\/strong>/);
});
