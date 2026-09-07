import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(resolve(here, "ik-relational-cloud.ts"), "utf8");
const frontend = readFileSync(resolve(here, "../../../app/ky-erp-frontend/src/pages/modules/IkAdvancedMonthly.jsx"), "utf8");

test("IK mesai ve kesinti saat bolenleri D1 migration gerektirmeden ayridir", () => {
  assert.match(worker, /IK_PERSON_CARD_CALC_SCOPE = "IK_PERSON_CARD_CALC"/);
  assert.match(worker, /json_store WHERE scope=\? AND file_name=\?/);
  assert.doesNotMatch(worker, /s\.deduction_hourly_base/);
  assert.doesNotMatch(worker, /deduction_hourly_base=excluded/);
  assert.match(frontend, /label="Mesai Saat Böleni"/);
  assert.match(frontend, /label="Kesinti Saat Böleni"/);
  assert.match(frontend, />1 Gün Eksik<\/button>/);
  assert.match(frontend, />Saat Eksik<\/button>/);
});

test("IK devamsizlik kesintisi gun ve saat formullerini ayri uygular", () => {
  assert.match(worker, /const salaryDaily = Math\.round\(\(salary \/ 30\)/);
  assert.match(worker, /const roadDaily = Math\.round\(\(road \/ 30\)/);
  assert.match(worker, /const salaryHourly = Math\.round\(\(salary \/ deductionDivisor\)/);
  assert.match(worker, /const roadCut = hours >= 10 \? roadDaily : 0/);
  assert.match(frontend, /1 gün eksik: maaş \/ 30 \+ yol \/ 30/);
  assert.match(frontend, /gerçek maaş \/ kesinti saat böleni/);
});
