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

test("PDKS guard owns canonical operations, assistant, device, media and D1 shift normalization once", () => {
  const source = api("ik-pdks-guard.ts");
  const master = api("ik-pdks-master.ts");
  assert.match(source, /SELECT is_locked FROM ik_monthly_close/);
  assert.match(source, /PDKS_PERIOD_LOCKED/);
  assert.match(source, /strictAuditEmployeeIds/);
  assert.match(source, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\)='VAR'/);
  assert.match(source, /ik_pdks_employee_groups/);
  assert.match(source, /ik_pdks_work_groups/);
  assert.match(source, /lateTolerance/);
  assert.match(source, /earlyTolerance/);
  assert.match(source, /overtimeMinutes/);
  for (const registrar of ["registerIkPdksOperationRoutes", "registerIkPdksCardBridgeRoutes", "registerIkPdksAdjustmentRoutes", "registerIkPdksAssistantRoutes", "registerIkPdksDeviceRoutes", "registerIkPersonnelMediaRoutes"])
    assert.match(source, new RegExp(`${registrar}\\(app\\)`));
  assert.doesNotMatch(master, /registerIkPdksOperationRoutes/);
  assert.doesNotMatch(master, /registerIkPdksAdjustmentRoutes/);
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

test("PDKS enrolled Windows device schema and headless HTTPS sync are explicit", () => {
  const schema = migration("0037_pdks_device_sync.sql");
  const device = api("ik-pdks-device.ts");
  for (const table of ["ik_pdks_devices", "ik_pdks_device_sync_logs"])
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(device, /\/api\/ik\/personnel-control\/device\/enroll/);
  assert.match(device, /\/api\/auth\/pdks-device\/heartbeat/);
  assert.match(device, /\/api\/auth\/pdks-device\/time-events\/import/);
  assert.match(device, /X-KYERP-PDKS-Device/);
  assert.match(device, /X-KYERP-PDKS-Secret/);
  assert.match(device, /secret_hash/);
  assert.match(device, /INSERT INTO ik_time_clock_events/);
  assert.match(device, /PDKS_AGENT:/);
  assert.match(device, /Dönem kilitli/);
});

test("PDKS quick assistant is preview-first, D1-backed and audit logged", () => {
  const source = api("ik-pdks-assistant.ts");
  assert.match(source, /\/api\/ik\/personnel-control\/assistant\/command/);
  assert.match(source, /body\.commit === true/);
  assert.match(source, /PDKS_ASSISTANT_COMMAND_UNCLEAR/);
  assert.match(source, /KART_YOK/);
  assert.match(source, /KYERP_PDKS_ASSISTANT/);
  assert.match(source, /hr_monthly_adjustments_v2/);
  assert.match(source, /PDKS_ASSISTANT_/);
});

test("Canonical personnel photo is shared by employee id and R2 instead of second PDKS person data", () => {
  const source = api("ik-personnel-media.ts");
  assert.match(source, /IK_PERSONNEL_PHOTO/);
  assert.match(source, /ik\/personnel-photos/);
  assert.match(source, /c\.env\.FILES\.put/);
  assert.match(source, /people\/:employeeId\/photo/);
  assert.match(source, /5 \* 1024 \* 1024/);
  assert.match(source, /PDKS_AUDIT_READ_ONLY/);
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
  assert.match(service, /const OPS = "\/ik\/personnel-control\/operations"/);
  for (const tail of ["month", "payroll", "leaves", "audit-logs", "leave", "advance", "period-close", "holidays"])
    assert.match(service, new RegExp(`\\$\\{OPS\\}/${tail}`));
  assert.doesNotMatch(service, /\/ik\/advanced\//);
});

test("Web PDKS uses canonical left navigation and keeps finance inside IK", () => {
  const registry = frontend("app/moduleRegistry.js");
  const ikRegistry = frontend("app/moduleRegistryBase.js");
  const shell = frontend("pages/modules/PdksPage.jsx");
  const desk = frontend("pages/pdks/PdksPersonnelDesk.jsx");
  const app = frontend("AppV3.jsx");

  assert.match(registry, /const PDKS_MODULE/);
  assert.match(registry, /key: "pdks"/);
  assert.match(registry, /label: "PDKS"/);
  for (const item of [
    "Ana Ekran", "Personel", "Giriş / Çıkış", "Puantaj",
    "İzinler", "Vardiya & Kurallar", "Cihaz / Senkron", "Raporlar",
  ]) assert.ok(registry.includes(item), `PDKS left menu missing: ${item}`);

  assert.doesNotMatch(shell, /pdks-command-nav/);
  assert.match(shell, /Finans \/ maaş \/ bordro işlemleri İK bölümündedir/);
  assert.match(shell, /MovedToIk/);
  assert.doesNotMatch(desk, /getPdksPayroll/);
  assert.doesNotMatch(desk, /Kazanç \/ Kesinti/);

  for (const ikItem of [
    "Personel Kartları", "Maaş / Yol / Banka / Elden",
    "Mesai / Avans / Kesinti", "Bordro & Ödeme", "SGK / Evrak / Ay Sonu",
  ]) assert.ok(ikRegistry.includes(ikItem), `IK menu missing: ${ikItem}`);
  assert.doesNotMatch(ikRegistry, /\["puantaj-izin", "Yıllık İzin \/ Günlük Durum"/);
  assert.match(app, /IkPersonnelFinancePage/);
  assert.doesNotMatch(app, /IkPdksSyncPage/);
});