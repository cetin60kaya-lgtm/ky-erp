import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("Hızlı Muhasebe exposes the already-implemented FIBE workspace", () => {
  const quick = frontend("pages/modules/muhasebe/QuickAccountingBar.jsx");
  assert.match(quick, /onClick=\{\(\) => setMode\("FIBE"\)\}/);
  assert.match(quick, /<CircleDollarSign size=\{16\} \/> FİBE/);
  assert.match(quick, /mode === "FIBE"/);
  assert.match(quick, /FİBE ödemesi ayrı FİBE hesabına işlendi; normal cari değişmedi\./);
});

test("Firma kartı keeps FIBE optional and separate from the normal current account", () => {
  const companies = frontend("pages/modules/muhasebe/CompaniesCurrentWorkspace.jsx");
  const section = frontend("pages/modules/muhasebe/CompanyFibeSection.jsx");
  const backend = readFileSync(resolve(here, "accounting-fibe.ts"), "utf8");
  assert.match(companies, /<CompanyFibeSection/);
  assert.match(section, /Bu firma için FİBE takibini aç/);
  assert.match(section, /Normal cariden tamamen ayrı firma bazlı ek ödeme hesabı/);
  assert.match(section, /Normal cari bakiyesi değişmedi/);
  assert.match(backend, /FIBE_DISABLED/);
  assert.match(backend, /accounting_fibe_movements/);
  assert.match(backend, /"INTERNAL"/);
  assert.doesNotMatch(backend, /UPDATE companies SET current_balance/);
});

test("weekly current-account control keeps official, internal, cash and FIBE totals distinct", () => {
  const backend = readFileSync(resolve(here, "accounting-quick-control.ts"), "utf8");
  assert.match(backend, /\/api\/muhasebe\/hizli-cari\/hafta/);
  assert.match(backend, /cashOutgoing/);
  assert.match(backend, /officialFlow/);
  assert.match(backend, /internalFlow/);
  assert.match(backend, /fibeRemaining/);
  assert.match(backend, /source: "FIBE"/);
  assert.match(backend, /recordScope: "INTERNAL"/);
});
