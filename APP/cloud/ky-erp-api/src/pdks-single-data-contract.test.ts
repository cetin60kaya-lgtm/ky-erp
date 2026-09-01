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

test("PDKS guard blocks locked D1 periods, strict audit reads and normalizes D1 shift", () => {
  const source = api("ik-pdks-guard.ts");
  assert.match(source, /SELECT is_locked FROM ik_monthly_close/);
  assert.match(source, /PDKS_PERIOD_LOCKED/);
  assert.match(source, /strictAuditEmployeeIds/);
  assert.match(source, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\)='VAR'/);
  assert.match(source, /ik_pdks_employee_groups/);
  assert.match(source, /ik_pdks_work_groups/);
  assert.match(source, /lateTolerance/);
  assert.match(source, /earlyTolerance/);
  assert.match(source, /overtimeMinutes/);
  assert.match(source, /registerIkPdksOperationRoutes\(app\)/);
  assert.match(source, /registerIkPdksCardBridgeRoutes\(app\)/);
});

test("PDKS D1 master schema contains shift, service and employee assignments", () => {
  const source = migration("0025_pdks_single_data_masters.sql");
  for (const table of ["ik_pdks_work_groups", "ik_pdks_employee_groups", "ik_pdks_services", "ik_pdks_employee_services"])
    assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(source, /UNIQUE\(main_company_id, code\)/);
});

test("PDKS D1 operation schema is migration-backed and idempotent", () => {
  const source = migration("0026_pdks_operation_core.sql");
  for (const table of ["hr_monthly_adjustments_v2", "hr_payrolls_v2", "ik_monthly_close", "ik_monthly_close_logs", "ik_audit_logs"])
    assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(source, /UNIQUE\(main_company_id,year,month,employee_id\)/);
  assert.match(source, /UNIQUE\(main_company_id,period_year,period_month\)/);
});

test("PDKS canonical operations use tenant-first D1 paths and protect business rules", () => {
  const source = api("ik-pdks-operations.ts");
  assert.match(source, /X-KYERP-Tenant-Slug/);
  assert.match(source, /requestedCompany\(c, body\) \|\|/);
  assert.match(source, /PDKS_PERIOD_LOCKED/);
  assert.match(source, /PDKS_PERIOD_NOT_FINISHED/);
  assert.match(source, /LEAVE_BALANCE_INSUFFICIENT/);
  assert.match(source, /LEAVE_DEPARTMENT_CONFLICT/);
  assert.match(source, /if \(day === 0\) return false/);
  assert.doesNotMatch(source, /payment_method/);
});

test("PDKS Hedef card bridge parses text, enforces strict people/lock and writes only D1 clock events", () => {
  const source = api("ik-pdks-card-bridge.ts");
  assert.match(source, /\/api\/ik\/advanced\/card\/preview/);
  assert.match(source, /\/api\/ik\/advanced\/card\/confirm/);
  assert.match(source, /PDKS_TEXT_CARD_FILE_REQUIRED/);
  assert.match(source, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\)='VAR'/);
  assert.match(source, /SELECT is_locked FROM ik_monthly_close/);
  assert.match(source, /INSERT OR IGNORE INTO ik_time_clock_events/);
  assert.match(source, /KYERP_WEB_PDKS_FILE/);
  assert.doesNotMatch(source, /json_store/);
});

test("Web PDKS uses personnel-control operations, not legacy advanced endpoints for business operations", () => {
  const service = frontend("services/pdksApi.js");
  assert.match(service, /personnel-control\/operations\/month/);
  assert.match(service, /personnel-control\/operations\/leave/);
  assert.match(service, /personnel-control\/operations\/advance/);
  assert.match(service, /personnel-control\/operations\/payroll/);
  assert.match(service, /personnel-control\/operations\/period-close/);
  assert.doesNotMatch(service, /\/ik\/advanced\//);
});

test("Web PDKS is a separate module and keeps Hedef-era operational sections", () => {
  const source = frontend("app/pdksModuleRegistryPatch.js");
  assert.match(source, /key: "pdks"/);
  assert.match(source, /label: "PDKS"/);
  for (const label of ["Bilgi Aktar", "Giriş \/ Çıkışlar", "Personel Bilgileri", "Puantaj Sonuçları", "İzinler", "Bordro", "Avanslar", "Gruplar \/ Vardiyalar", "Puantaj Kuralları", "Servisler", "Saat \/ Terminal", "Yıllık TEMP \/ Denetim"])
    assert.match(source, new RegExp(label));
});
