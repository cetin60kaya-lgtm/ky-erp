import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MODULES } from "../../app/moduleRegistryBase.js";

const page = readFileSync(new URL("./ProductionControlCenterPageV2.jsx", import.meta.url), "utf8");
const router = readFileSync(new URL("../modules/UretimPage.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../../../../../cloud/ky-erp-api/src/production-center.ts", import.meta.url), "utf8");

test("İmalat sol menüde dört gerçek ayrı rota; geçmiş yalnız rapor altında", () => {
  const imalat = MODULES.find((module) => module.key === "uretim");
  assert.ok(imalat);
  assert.deepEqual(imalat.groups[0].tabs.map(([key]) => key), [
    "uretim-merkezi", "irsaliye-bekleyen", "uretim-tamamlanan", "fatura-kontrol",
  ]);
  assert.deepEqual(imalat.groups[1].tabs.map(([key]) => key), [
    "uretim-raporlari", "uretim-gecmis-arsiv",
  ]);
  for (const [route, pool] of [["uretim-merkezi","IMALATTA"], ["irsaliye-bekleyen","IRSALIYE"],
    ["uretim-tamamlanan","TAMAMLANAN"], ["fatura-kontrol","FATURA"]]) {
    assert.ok(router.includes(`"${route}": "${pool}"`));
  }
  assert.match(router, /pool="ARSIV"/);
  assert.doesNotMatch(page, /pc2-workspace|setPool\(/);
});

test("Her ekran kendi tablosunu, özetini ve tarih aramasını sunar", () => {
  assert.match(page, /pool === "IMALATTA"/);
  assert.match(page, /pool === "IRSALIYE"/);
  assert.match(page, /pool === "TAMAMLANAN"/);
  assert.match(page, /pool === "FATURA"/);
  assert.match(page, /pool === "ARSIV"/);
  assert.match(page, /periodDates\(next\)/);
  assert.match(page, /productionDateTime\(row\)/);
  assert.match(page, /modalOpen=\{directEntryModalOpen\}/);
  assert.match(page, /getProductionCenter\(activeMainCompany/);
});

test("Eski fişler aktif ve irsaliye havuzlarına sızmaz; fatura hedefi irsaliye öncelikli", () => {
  assert.match(api, /pool === "IMALATTA" && \(legacy \|\| productionComplete\)/);
  assert.match(api, /pool === "IRSALIYE" && \(legacy \|\| card\.dispatchCount > 0/);
  assert.match(api, /pool === "TAMAMLANAN" && !legacy && !productionComplete/);
  assert.match(api, /incomingFromDocuments > 0 \? incomingFromDocuments : Math\.max/);
  assert.match(api, /totalInvoiceRemainingQty: filtered\.reduce/);
  assert.match(api, /totalCompletedGrossQty: filtered\.reduce/);
});
