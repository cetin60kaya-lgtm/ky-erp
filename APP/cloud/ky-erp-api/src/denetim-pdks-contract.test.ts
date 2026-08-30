import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const api = (name: string) => readFileSync(resolve(here, name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");
const migration = (name: string) => readFileSync(resolve(here, "../migrations", name), "utf8");

test("DENETIM UI is fixed to IK view-only and cannot enable other modules", () => {
  const source = frontend("pages/admin/AdminUsersPanel.jsx");
  assert.match(source, /const AUDIT_VIEW_MODULES=new Set\(\["IK"\]\)/);
  assert.match(source, /selectedRole==="DENETIM"\?permissionPreset\("DENETIM"\)/);
  assert.match(source, /selectedRole==="DENETIM"\)return/);
  assert.match(source, /const clean=selectedRole==="DENETIM"\?permissionPreset\("DENETIM"\)/);
  assert.match(source, /Sabit DENETİM \/ PDKS/);
  assert.match(source, /Günlük personel ve diğer modüller kapalıdır/);
});

test("DENETIM API can read only the strict SGK-card audit namespace", () => {
  const main = api("main.ts");
  const audit = api("ik-audit-readonly.ts");
  assert.match(main, /if \(!path\.startsWith\("\/api\/ik\/audit\/"\)\)/);
  assert.match(main, /!\["GET", "HEAD"\]\.includes\(method\)/);
  assert.match(audit, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\) = 'VAR'/);
  assert.match(audit, /TRIM\(COALESCE\(s\.card_no,''\)\) <> ''/);
});

test("DENETIM system account bootstrap is active, unknown-password, identity-locked and IK-only", () => {
  const source = migration("0024_denetime_pdks_system_user.sql");
  assert.match(source, /'system-denetim'/);
  assert.match(source, /'denetim'/);
  assert.match(source, /'DENETIM'/);
  assert.match(source, /'IK'/);
  assert.match(source, /1,0,0,0,0/);
  assert.match(source, /'AUDIT'/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS ik_user_hr_scope/);
  assert.match(source, /must_change_password/);
  assert.match(source, /DROP TRIGGER IF EXISTS trg_denetime_system_identity_guard/);
  assert.match(source, /CREATE TRIGGER trg_denetime_system_identity_guard/);
  assert.match(source, /AFTER UPDATE OF username,role ON auth_users/);
  assert.match(source, /username='denetim'/);
  assert.match(source, /role='DENETIM'/);
  assert.match(source, /DROP TRIGGER IF EXISTS trg_denetime_security_role_guard/);
  assert.match(source, /CREATE TRIGGER trg_denetime_security_role_guard/);
  assert.match(source, /AFTER UPDATE OF role_override ON auth_user_security/);
  assert.match(source, /role_override=NULL/);
});
