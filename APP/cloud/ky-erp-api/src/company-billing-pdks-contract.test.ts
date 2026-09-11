import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const source=(name:string)=>readFileSync(resolve(here,name),"utf8");
const migration=(name:string)=>readFileSync(resolve(here,"../migrations",name),"utf8");
const frontend=(name:string)=>readFileSync(resolve(here,"../../../app/ky-erp-frontend/src",name),"utf8");
const billing=source("company-billing-cloud.ts"),ai=source("ai-cloud.ts"),pdks=source("ik-pdks-guard.ts"),sql=migration("0038_company_ai_billing.sql"),billingPage=frontend("pages/admin/AdminCompanyBilling.jsx"),adminPage=frontend("pages/modules/AdminPage.jsx"),registry=frontend("app/moduleRegistry.js"),shell=frontend("layouts/AppShellV3.jsx");

test("company billing migration remains additive and preserves existing tenants",()=>{assert.match(sql,/CREATE TABLE IF NOT EXISTS company_billing_profiles/);assert.match(sql,/CREATE TABLE IF NOT EXISTS company_billing_ledger/);assert.match(sql,/INSERT OR IGNORE INTO company_billing_profiles/);assert.doesNotMatch(sql,/\bDROP\s+TABLE\b/i);assert.doesNotMatch(sql,/\bDELETE\s+FROM\b/i)});

test("customer packages are duration based: monthly, six months and twelve months",()=>{assert.match(billing,/PACKAGE_TERMS[\s\S]*MONTHLY:\s*1[\s\S]*SIX_MONTHS:\s*6[\s\S]*TWELVE_MONTHS:\s*12/);assert.match(billing,/addCalendarMonths/);assert.match(billing,/daysRemaining/);assert.match(billing,/packageTermMonths/);assert.match(billing,/periodEnd = addCalendarMonths/);for(const label of ["Aylık","6 Aylık","12 Aylık","Kalan Süre","Paket Liste Fiyatı","Firma Özel Paket Fiyatı","Süre Uzatma"])assert.match(billingPage,new RegExp(label))});

test("calendar package terms clamp month-end dates instead of overflowing",()=>{assert.match(billing,/const originalDay = d\.getUTCDate\(\)/);assert.match(billing,/d\.setUTCDate\(1\)/);assert.match(billing,/const lastDay = new Date\(Date\.UTC\(d\.getUTCFullYear\(\), d\.getUTCMonth\(\) \+ 1, 0\)\)\.getUTCDate\(\)/);assert.match(billing,/d\.setUTCDate\(Math\.min\(originalDay, lastDay\)\)/);assert.match(billingPage,/const day=date\.getUTCDate\(\)/);assert.match(billingPage,/date\.setUTCDate\(1\)/);assert.match(billingPage,/Math\.min\(day,lastDay\)/)});

test("AI token usage is metered but never hard-limits customer usage",()=>{assert.match(billing,/Deliberately no token hard-limit check/);assert.doesNotMatch(billing,/AI_MONTHLY_LIMIT_REACHED/);assert.match(billing,/included_tokens=0,monthly_token_limit=0/);assert.match(billing,/overage_price_per_million_minor=0/);assert.match(billingPage,/token kotasıyla kapanmaz/);assert.match(billingPage,/Teknik AI Kullanım \/ Maliyet Takibi/)});

test("package duration extension is owner-only and append-only",()=>{assert.match(billing,/app\.post\("\/api\/admin\/company-billing\/:id\/extend"/);assert.match(billing,/OWNER_ONLY/);assert.match(billing,/TERM_EXTENSION/);assert.match(billing,/COMPANY_PACKAGE_EXTENDED/);assert.match(billing,/days < 1 \|\| days > 3650/);assert.match(billingPage,/\[7,30,90\]\.map\(days=>/);assert.match(billingPage,/>\+\{days\} Gün<\/button>/)});

test("billing administration stays owner-only and ledger has no edit/delete endpoint",()=>{assert.match(billing,/registerCompanyBillingRoutes/);assert.match(billing,/ownerCurrent/);assert.match(billing,/app\.get\("\/api\/admin\/company-billing"/);assert.match(billing,/app\.put\("\/api\/admin\/company-billing\/:id"/);assert.match(billing,/\/fee-adjustment"/);assert.doesNotMatch(billing,/app\.(?:delete|patch)\("\/api\/admin\/company-billing\/[^"\n]*ledger/i);assert.match(sql,/UNIQUE INDEX IF NOT EXISTS idx_company_billing_ledger_source_ref/)});

test("AI uses authenticated tenant scope and provider-side usage",()=>{assert.match(ai,/registerCompanyBillingRoutes\(app\)/);assert.match(ai,/TENANT_SCOPE_FORBIDDEN/);assert.match(ai,/requested&&requested!==own/);assert.match(ai,/checkCompanyAiAllowance\(c\.env\.DB,slug\)/);const runAt=ai.indexOf("c.env.AI.run"),allowanceAt=ai.indexOf("checkCompanyAiAllowance(c.env.DB,slug)");assert.ok(allowanceAt>=0&&runAt>allowanceAt);assert.match(ai,/const usage=\(result as Row\)\?\.usage\|\|null/);assert.match(ai,/recordCompanyAiUsage\(c\.env\.DB,\{mainCompanySlug:slug,usage/);assert.doesNotMatch(ai,/recordCompanyAiUsage\([^\n]*body\.usage/);assert.match(billing,/"AI_USAGE"/);assert.match(billing,/"WORKERS_AI"/)});

test("AI conversation and action records are exact-tenant scoped",()=>{assert.doesNotMatch(ai,/main_company_slug=\? OR main_company_slug IS NULL/);assert.match(ai,/main_company_slug=\?/);assert.match(ai,/secureSlugOf/)});

test("PDKS central guard rejects cross-tenant access and requires IK permissions",()=>{assert.match(pdks,/enforcePdksTenantAndPermission/);assert.match(pdks,/PDKS_TENANT_FORBIDDEN/);assert.match(pdks,/requested && requested !== own/);assert.match(pdks,/PDKS_TENANT_NOT_ACTIVE/);assert.match(pdks,/PDKS_PERMISSION_DENIED/);assert.match(pdks,/app\.use\("\/api\/ik\/personnel-control\/\*", enforcePdksTenantAndPermission\)/)});

test("PDKS audit account remains monthly-SGK + card filtered and read-only",()=>{assert.match(pdks,/isAuditRole/);assert.match(pdks,/\["GET", "HEAD"\]\.includes\(method\)/);assert.match(pdks,/ik_person_monthly_compliance/);assert.match(pdks,/mc\.sgk_covered=1/);assert.match(pdks,/TRIM\(COALESCE\(s\.card_no,''\)\)<>''/);assert.match(pdks,/enforceAuditReadScope/)});

test("company billing workspace is reachable from Yönetim",()=>{assert.match(registry,/firma-ucretlendirme/);assert.match(registry,/Firma Paket \/ Kullanım/);assert.match(adminPage,/AdminCompanyBilling/);assert.match(adminPage,/activeTab === "firma-ucretlendirme"/);assert.match(adminPage,/owner \? <AdminCompanyBilling/)});

test("owner-only admin workspaces stay hidden and direct routes guarded",()=>{assert.match(shell,/OWNER_ONLY_ADMIN_TABS = new Set\(\["uygulama-sahibi", "firma-ucretlendirme", "eslestirmeler", "surum-merkezi"\]\)/);assert.match(shell,/return isOwnerUser\(user\)/);assert.match(adminPage,/activeTab === "uygulama-sahibi"/);assert.match(adminPage,/owner \? <>\s*<AdminOwnerSecurity \/>\s*<SecurityCenterPanel \/>\s*<\/>/)});

test("billing amount parser supports comma and dot decimal forms",()=>{assert.match(billingPage,/raw\.includes\(","\)&&raw\.includes\("\."\)/);assert.match(billingPage,/raw\.lastIndexOf\(","\)>raw\.lastIndexOf\("\."\)/);assert.match(billingPage,/raw\.replace\(\/\\\.\/g,""\)\.replace\(",","\."\)/);assert.match(billingPage,/raw\.replace\(",","\."\)/)});
