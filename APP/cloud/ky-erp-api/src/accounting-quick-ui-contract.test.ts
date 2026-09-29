import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("Firma & Cari exposes FIBE only inside the canonical company workspace", () => {
  const companies = frontend("pages/modules/muhasebe/CompaniesCurrentWorkspace.jsx");
  const section = frontend("pages/modules/muhasebe/CompanyFibeSection.jsx");
  assert.match(companies, /<CompanyFibeSection/);
  assert.match(section, /Bu firma için FİBE takibini aç/);
  assert.match(section, /Normal cariden tamamen ayrı firma bazlı ek ödeme hesabı/);
  assert.doesNotMatch(companies, /QuickAccountingBar/);
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

test("e-Belge final approval refreshes accounting while management overview stays compact", () => {
  const page = frontend("pages/modules/MuhasebePage.jsx");
  const ebelge = frontend("pages/modules/muhasebe/EBelgeCenterPage.jsx");
  const overview = frontend("pages/modules/muhasebe/ManagementOverviewWorkspace.jsx");
  const center = readFileSync(resolve(here, "e-belge-center-cloud.ts"), "utf8");
  const posting = readFileSync(resolve(here, "accounting-document-posting.ts"), "utf8");
  assert.match(page, /kyerp:accounting-refresh/);
  assert.match(ebelge, /CustomEvent\("kyerp:accounting-refresh"/);
  assert.match(overview, /Toplam alacak/);
  assert.match(overview, /Toplam borç/);
  assert.match(overview, /Bu ay gelen fatura/);
  assert.match(overview, /Bu ay kesilen fatura/);
  assert.match(overview, /Yaklaşan çek/);
  assert.doesNotMatch(overview, /e-Belge → Muhasebe Entegrasyonu/);
  assert.doesNotMatch(overview, /Bu ay en yüksek tedarikçiler|Bu ay en yüksek müşteriler|Son cari hareketler/);
  assert.match(center, /idempotent:true/);
  assert.match(posting, /current_account_movements/);
  assert.match(posting, /accounting_ledger_entries/);
  assert.match(posting, /vat_records/);
});
