import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(here, name), "utf8");
const migration = (name: string) => readFileSync(resolve(here, "../migrations", name), "utf8");
const frontend = (name: string) => readFileSync(resolve(here, "../../../app/ky-erp-frontend/src", name), "utf8");

const billing = source("company-billing-cloud.ts");
const ai = source("ai-cloud.ts");
const pdks = source("ik-pdks-guard.ts");
const sql = migration("0038_company_ai_billing.sql");
const billingPage = frontend("pages/admin/AdminCompanyBilling.jsx");
const adminPage = frontend("pages/modules/AdminPage.jsx");
const registry = frontend("app/moduleRegistry.js");
const shell = frontend("layouts/AppShellV3.jsx");

test("company billing migration is additive and preserves existing tenants", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS company_billing_profiles/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS company_billing_ledger/);
  assert.match(sql, /INSERT OR IGNORE INTO company_billing_profiles/);
  assert.match(sql, /'CUSTOM', 'ACTIVE'/);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /reset/i);
});

test("company billing profile supports package quota custom pricing and billing periods", () => {
  for (const token of [
    "package_code", "status", "included_tokens", "monthly_token_limit",
    "base_monthly_price_minor", "custom_monthly_price_minor",
    "overage_price_per_million_minor", "period_start", "period_end", "next_renewal_at",
  ]) assert.match(sql, new RegExp(token));
  assert.match(billing, /TRIAL/);
  assert.match(billing, /ACTIVE/);
  assert.match(billing, /PAUSED/);
  assert.match(billing, /CANCELLED/);
  assert.match(billing, /AI_MONTHLY_LIMIT_REACHED/);
});

test("billing administration is owner-only and usage ledger has no edit/delete endpoint", () => {
  assert.match(billing, /registerCompanyBillingRoutes/);
  assert.match(billing, /ownerCurrent/);
  assert.match(billing, /OWNER_ONLY/);
  assert.match(billing, /app\.get\("\/api\/admin\/company-billing"/);
  assert.match(billing, /app\.put\("\/api\/admin\/company-billing\/:id"/);
  assert.match(billing, /\/credit"/);
  assert.match(billing, /\/fee-adjustment"/);
  assert.doesNotMatch(billing, /app\.(?:delete|patch)\("\/api\/admin\/company-billing\/[^"\n]*ledger/i);
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS idx_company_billing_ledger_source_ref/);
});

test("AI uses authenticated tenant scope and server-side provider usage for billing", () => {
  assert.match(ai, /registerCompanyBillingRoutes\(app\)/);
  assert.match(ai, /TENANT_SCOPE_FORBIDDEN/);
  assert.match(ai, /requested&&requested!==own/);
  assert.match(ai, /checkCompanyAiAllowance\(c\.env\.DB,slug\)/);
  const runAt = ai.indexOf("c.env.AI.run");
  const allowanceAt = ai.indexOf("checkCompanyAiAllowance(c.env.DB,slug)");
  assert.ok(allowanceAt >= 0 && runAt > allowanceAt, "allowance check must happen before Workers AI request");
  assert.match(ai, /const usage=\(result as Row\)\?\.usage\|\|null/);
  assert.match(ai, /recordCompanyAiUsage\(c\.env\.DB,\{mainCompanySlug:slug,usage/);
  assert.match(ai, /sourceRef:text\(c\.get\?\.\("requestId"\)\)/);
  assert.doesNotMatch(ai, /recordCompanyAiUsage\([^\n]*body\.usage/);
  assert.match(billing, /movement_type.*AI_USAGE|"AI_USAGE"/s);
  assert.match(billing, /"WORKERS_AI"/);
});

test("AI conversation and action records are exact-tenant scoped", () => {
  assert.doesNotMatch(ai, /main_company_slug=\? OR main_company_slug IS NULL/);
  assert.match(ai, /main_company_slug=\?/);
  assert.match(ai, /secureSlugOf/);
});

test("PDKS central guard rejects cross-tenant access and requires IK permissions", () => {
  assert.match(pdks, /enforcePdksTenantAndPermission/);
  assert.match(pdks, /PDKS_TENANT_FORBIDDEN/);
  assert.match(pdks, /requested && requested !== own/);
  assert.match(pdks, /SELECT slug,is_active FROM main_companies WHERE slug=\?/);
  assert.match(pdks, /PDKS_TENANT_NOT_ACTIVE/);
  assert.match(pdks, /PDKS_PERMISSION_DENIED/);
  assert.match(pdks, /upper\(row\?\.moduleKey \|\| row\?\.module_key\) === "IK"/);
  assert.match(pdks, /app\.use\("\/api\/ik\/personnel-control\/\*", enforcePdksTenantAndPermission\)/);
});

test("PDKS audit account remains SGK+card filtered and read-only", () => {
  assert.match(pdks, /isAuditRole/);
  assert.match(pdks, /\["GET", "HEAD"\]\.includes\(method\)/);
  assert.match(pdks, /UPPER\(TRIM\(COALESCE\(e\.sgk_status,''\)\)\)='VAR'/);
  assert.match(pdks, /TRIM\(COALESCE\(s\.card_no,''\)\)<>''/);
  assert.match(pdks, /enforceAuditReadScope/);
});

test("company billing workspace is reachable from Yönetim and shows required controls", () => {
  assert.match(registry, /firma-ucretlendirme/);
  assert.match(registry, /Firma Paket \/ Kullanım/);
  assert.match(adminPage, /AdminCompanyBilling/);
  assert.match(adminPage, /activeTab === "firma-ucretlendirme"/);
  assert.match(adminPage, /owner \? <AdminCompanyBilling/);
  for (const label of [
    "Pakete Dahil Token", "Aylık Sert Limit", "Firma Özel Aylık Fiyat",
    "1 Milyon Aşım Token Fiyatı", "Ek Token / Kredi", "Ücret Düzeltmesi",
    "Kullanım / Kredi / Ücret Hareketleri", "Aylık Kullanım Özeti",
  ]) assert.match(billingPage, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("owner-only admin workspaces are hidden for non-owner menu users and direct routes are guarded", () => {
  assert.match(shell, /OWNER_ONLY_ADMIN_TABS = new Set\(\["uygulama-sahibi", "firma-ucretlendirme"\]\)/);
  assert.match(shell, /return isOwnerUser\(user\)/);
  assert.match(shell, /visibleGroups\(module, user\)/);
  assert.match(adminPage, /activeTab === "uygulama-sahibi"/);
  assert.match(adminPage, /owner \? <AdminOwnerSecurity \/>/);
});

test("billing amount parser supports comma and dot decimal forms", () => {
  assert.match(billingPage, /raw\.includes\(","\) && raw\.includes\("\."\)/);
  assert.match(billingPage, /raw\.lastIndexOf\(","\) > raw\.lastIndexOf\("\."\)/);
  assert.match(billingPage, /raw\.replace\(\/\\\.\/g, ""\)\.replace\(",", "\."\)/);
  assert.match(billingPage, /raw\.replace\(",", "\."\)/);
});
