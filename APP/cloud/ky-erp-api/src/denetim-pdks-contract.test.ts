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
  const source = frontend("pages/admin/AdminUsersPanelV2.jsx");
  assert.match(source, /if\(role==="DENETIM"\)view\.add\("IK"\)/);
  assert.match(source, /roleOf\(createForm\.role\)==="DENETIM"/);
  assert.match(source, /selectedRole==="DENETIM"\?permissionPreset\("DENETIM"\)/);
  assert.match(source, /selectedRole==="DENETIM"\)return/);
  assert.match(source, /DENETİM profili sabittir: yalnız İK \/ SGK kartlı PDKS görüntüleme/);
  assert.match(source, /Günlük personel ve diğer modüller kapalıdır/);
});

test("DENETIM API is route-locked to profile, SGK-card people, attendance and PDKS masters", () => {
  const main = api("main.ts");
  const guard = api("ik-pdks-guard.ts");
  const personnel = api("ik-personnel-control.ts");
  assert.match(main, /const pdksRead = path\.startsWith\("\/api\/ik\/personnel-control\/"\) && \["GET", "HEAD"\]\.includes\(method\)/);
  assert.match(guard, /const safeStatic = new Set\(\[/);
  assert.match(guard, /"\/api\/ik\/personnel-control\/profile"/);
  assert.match(guard, /"\/api\/ik\/personnel-control\/people"/);
  assert.match(guard, /"\/api\/ik\/personnel-control\/pdks-masters"/);
  assert.match(guard, /people\\\/\(\[\^\/\]\+\)\\\/attendance/);
  assert.match(guard, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\)='VAR'/);
  assert.match(guard, /TRIM\(COALESCE\(s\.card_no,''\)\)<>''/);
  assert.match(guard, /if \(!safeStatic\.has\(path\) && !attendanceMatch\)/);
  assert.match(personnel, /if \(!audit\) \{/);
  assert.match(personnel, /identityNo:/);
  assert.match(personnel, /salary:/);
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
