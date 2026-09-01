import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const migration = (name: string) => readFileSync(resolve(here, "../migrations", name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

test("PDKS period/shift guard is registered before personnel-control routes", () => {
  const main = api("main.ts");
  assert.match(main, /import \{ registerIkPdksGuardRoutes \} from "\.\/ik-pdks-guard"/);
  const guard = main.indexOf("registerIkPdksGuardRoutes(app)");
  const personnel = main.indexOf("registerIkPersonnelControlRoutes(app)");
  assert.ok(guard > 0 && personnel > guard, "PDKS guard must wrap personnel-control routes");
});

test("PDKS guard blocks locked D1 periods and normalizes attendance with D1 shift", () => {
  const source = api("ik-pdks-guard.ts");
  assert.match(source, /SELECT is_locked FROM ik_monthly_close/);
  assert.match(source, /PDKS_PERIOD_LOCKED/);
  assert.match(source, /ik_pdks_employee_groups/);
  assert.match(source, /ik_pdks_work_groups/);
  assert.match(source, /lateTolerance/);
  assert.match(source, /earlyTolerance/);
  assert.match(source, /overtimeMinutes/);
});

test("PDKS D1 master schema contains shift, service and employee assignments", () => {
  const source = migration("0025_pdks_single_data_masters.sql");
  for (const table of ["ik_pdks_work_groups", "ik_pdks_employee_groups", "ik_pdks_services", "ik_pdks_employee_services"])
    assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(source, /UNIQUE\(main_company_id, code\)/);
});

test("Web PDKS is a separate module and keeps Hedef-era operational sections", () => {
  const source = frontend("app/pdksModuleRegistryPatch.js");
  assert.match(source, /key: "pdks"/);
  assert.match(source, /label: "PDKS"/);
  for (const label of ["Bilgi Aktar", "Giriş \/ Çıkışlar", "Personel Bilgileri", "Puantaj Sonuçları", "İzinler", "Bordro", "Avanslar", "Gruplar \/ Vardiyalar", "Puantaj Kuralları", "Servisler", "Saat \/ Terminal", "Yıllık TEMP \/ Denetim"])
    assert.match(source, new RegExp(label));
});
