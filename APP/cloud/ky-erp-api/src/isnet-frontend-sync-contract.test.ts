import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const frontend = (...parts: string[]) => readFileSync(resolve(root, "APP/app/ky-erp-frontend/src", ...parts), "utf8");

const service = frontend("services", "isnetApi.js");
const management = frontend("pages", "modules", "isnet", "IsnetManagementCenterPage.jsx");

test("IsNet frontend requires an explicit active main company for outgoing recovery and sync", () => {
  assert.match(service, /getApiActiveMainCompanySlug/);
  assert.match(service, /MAIN_COMPANY_REQUIRED/);
  assert.match(service, /const mainCompanySlug = resolveMainCompanySlug\(payload\)/);
  assert.match(service, /\{ \.\.\.payload, mainCompanySlug, startDate:/);
  assert.match(management, /İşNet ekranı için ana firma seçimi zorunludur/);
  assert.match(management, /startDailySync\(\{ \.\.\.range, mainCompanySlug \}\)/);
  assert.doesNotMatch(management, /activeMainCompany\?\.slug \|\| activeMainCompany\?\.id \|\| ["']main["']/);
});

test("partial outgoing coverage can never be rendered as completed success", () => {
  assert.match(service, /function reviewRequired/);
  assert.match(service, /status: partial \? "PARTIAL_REVIEW_REQUIRED"/);
  assert.match(service, /requiresReview: partial/);
  assert.match(service, /outgoingInvoices:/);
  assert.match(service, /outgoingDispatches:/);
  assert.match(management, /function syncNeedsReview/);
  assert.match(management, /tone: needsReview \? "warning" : "success"/);
  assert.match(management, /İşlem tamamlandı sayılmadı/);
  assert.match(management, /giden fatura/);
  assert.match(management, /giden irsaliye/);
});

test("management center disables tenant-bound actions when no main company is selected", () => {
  assert.match(management, /disabled=\{busy \|\| !mainCompanySlug\}/);
  assert.match(management, /disabled=\{!mainCompanySlug\}/);
});
