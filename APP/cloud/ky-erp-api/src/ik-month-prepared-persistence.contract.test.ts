import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cloud = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) =>
  readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");
const localBackend = (name: string) =>
  readFileSync(resolve(here, "../../../app/ky-erp-backend/src/ik", name), "utf8");

test("IK monthly preparation is persisted server-side instead of browser-only", () => {
  const relational = cloud("ik-relational-cloud.ts");
  const page = frontend("pages/modules/IkAdvancedMonthly.jsx");
  const api = frontend("services/ikApi.js");

  assert.match(relational, /IK_MONTH_PREPARED_ACTION = "MONTH_PREPARED"/);
  assert.match(relational, /\/api\/ik\/advanced\/period-state/);
  assert.match(relational, /\/api\/ik\/advanced\/period-prepare/);
  assert.match(relational, /hr_monthly_audit_logs/);

  assert.match(api, /getIkAdvancedPeriodState/);
  assert.match(api, /prepareIkAdvancedPeriod/);
  assert.match(page, /const serverPrepared = Boolean\(periodState\?\.prepared\)/);
  assert.match(page, /await prepareIkAdvancedPeriod\(\{ mainCompanyId: companyId, year, month \}\)/);
  assert.match(page, /firma bazında sunucuya kaydedilir ve tekrar hazırlanmaz/);
});

test("local Nest backend exposes the same persistent period contract", () => {
  const controller = localBackend("ik-advanced.controller.ts");
  const service = localBackend("ik-advanced.service.ts");

  assert.match(controller, /@Get\("period-state"\)/);
  assert.match(controller, /@Post\("period-prepare"\)/);
  assert.match(service, /async periodState\(/);
  assert.match(service, /async preparePeriod\(/);
  assert.match(service, /"MONTH_PREPARED"/);
  assert.match(service, /FROM ik_audit_logs/);
});
