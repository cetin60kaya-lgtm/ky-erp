import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const load=name=>readFileSync(resolve(here,name),"utf8");

test("Personnel 360 is registered only beneath authenticated PDKS guards",()=>{
  const guard=load("ik-pdks-guard.ts");
  const module=load("ik-pdks-personnel-360.ts");
  assert.match(guard,/app\.use\("\/api\/ik\/personnel-control\/\*", enforcePdksTenantAndPermission\)/);
  assert.match(guard,/registerIkPdksPersonnel360Routes\(app\)/);
  assert.match(module,/getAuthenticatedUser/);
  assert.match(module,/get\?\.\("pdksCompany"\)/);
  assert.match(module,/PDKS_AUDIT_READ_ONLY/);
  assert.match(module,/PDKS_PERSONNEL_ADMIN_REQUIRED/);
});

test("card change uses expected previous card, collision rejection and durable history",()=>{
  const module=load("ik-pdks-personnel-360.ts");
  assert.match(module,/EXPECTED_CARD_REQUIRED/);
  assert.match(module,/CARD_STALE/);
  assert.match(module,/CARD_CONFLICT/);
  assert.match(module,/employee_id<>\?/);
  assert.match(module,/SELECT \?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\? WHERE changes\(\)=1/);
  assert.match(module,/terminalWritten: false/);
  assert.match(load("ik-personnel-control.ts"),/USE_CARD_ASSIGNMENT/);
});

test("documents link only confirmed tenant File Hub assets, unlink does not delete binary",()=>{
  const module=load("ik-pdks-personnel-360.ts");
  assert.match(module,/DOCUMENT_TYPES = new Set\(\["PERSONNEL_DOCUMENT", "CONTRACT"\]\)/);
  assert.match(module,/a\.main_company_slug=\?/);
  assert.match(module,/b\.module_code='IK'/);
  assert.match(module,/INSERT OR IGNORE INTO file_hub_relations/);
  assert.match(module,/DELETE FROM file_hub_relations/);
  assert.doesNotMatch(module,/FILES\.delete|DROP TABLE|DELETE FROM file_hub_assets|DELETE FROM ik_time_clock_events/);
});
