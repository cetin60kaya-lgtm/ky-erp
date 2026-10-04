import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const source=(name:string)=>readFileSync(resolve(here,name),"utf8");
const publicFile=(name:string)=>readFileSync(resolve(here,"../../../app/ky-erp-frontend/public/guvenlik",name),"utf8");

const mobile=source("auth-security-mobile-control.ts");
const push=source("auth-push-cloud.ts");
const html=publicFile("index.html");
const app=publicFile("app.js");
const workspace=publicFile("security-workspace.js");

test("KY Security v4 enforces system company and self login code scopes",()=>{
  assert.match(push,/SECURITY_APP_VERSION = "security-v4\.0"/);
  assert.match(push,/companyScope/);
  assert.match(push,/scopeType: systemScope \? "SYSTEM" : \(companyScope \? "COMPANY" : "SELF"\)/);
  assert.match(push,/upper\(row\.scopeType\) === "COMPANY"/);
  assert.match(push,/targetCompanySlug/);
});

test("company owner mobile control stays tenant scoped and cannot close protected administrators",()=>{
  assert.match(mobile,/scopeType\(actor: AnyRow\)/);
  assert.match(mobile,/return "COMPANY"/);
  assert.match(mobile,/text\(row\.main_company_slug\) !== text\(actor\.companySlug\)/);
  assert.match(mobile,/!\["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"\]\.includes/);
  assert.match(mobile,/hasCap\(actor, "SESSION_CLOSE"\)/);
  assert.match(mobile,/companyControl/);
});

test("normal device workspace exposes personal notes and private direct chat",()=>{
  assert.match(mobile,/workspace\/notes/);
  assert.match(mobile,/workspace\/chat\/users/);
  assert.match(mobile,/workspace\/chat\/messages/);
  assert.match(mobile,/text\(current\.userId\)!==text\(actor\.userId\)/);
  assert.match(mobile,/recipientUserId/);
  assert.match(workspace,/Notlar/);
  assert.match(workspace,/chat\/messages/);
});

test("security PWA exposes company console notes and chat without widening normal security controls",()=>{
  assert.match(html,/id="companyAdminConsole"/);
  assert.match(html,/data-control-only/);
  assert.match(html,/data-tab="notes"/);
  assert.match(html,/data-tab="chat"/);
  assert.match(html,/security-workspace\.js/);
  assert.match(app,/controlScope=ownerControl\|\|companyApprover/);
  assert.match(app,/scopeType==="COMPANY"/);
});
