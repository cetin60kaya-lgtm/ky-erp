// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;

const PROFILE_TABLE = "company_billing_profiles";
const LEDGER_TABLE = "company_billing_ledger";
const BILLING_STATUSES = new Set(["TRIAL", "ACTIVE", "PAUSED", "CANCELLED"]);
const ACTIVE_STATUSES = new Set(["TRIAL", "ACTIVE"]);
const PACKAGE_TERMS: Record<string, number> = { MONTHLY: 1, SIX_MONTHS: 6, TWELVE_MONTHS: 12 };

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const nonNegativeInt = (value: unknown, fallback = 0) => { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback; };
const signedInt = (value: unknown, fallback = 0) => { const number = Number(value); return Number.isFinite(number) ? Math.round(number) : fallback; };
const isOwner = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));

function jsonError(code: string, message: string, details?: unknown) { return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } }; }
async function bodyOf(c: any): Promise<Row> { try { const value = await c.req.json(); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; } }
async function tableExists(db: any, table: string) { const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<Row>(); return Boolean(row?.name); }
async function schemaReady(db: any) { return (await tableExists(db, PROFILE_TABLE)) && (await tableExists(db, LEDGER_TABLE)); }
async function ownerCurrent(c: any) { const user = await getAuthenticatedUser(c); return user && isOwner(user.role) ? user : null; }
async function companyById(db: any, id: string) { return db.prepare("SELECT id,slug,name,is_active FROM main_companies WHERE id=? LIMIT 1").bind(id).first<Row>(); }
async function companyBySlug(db: any, slug: string) { return db.prepare("SELECT id,slug,name,is_active FROM main_companies WHERE slug=? LIMIT 1").bind(slug).first<Row>(); }

function monthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
function safeIso(value: unknown, fallback: string) { const raw = text(value); if (!raw) return fallback; const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString(); }
function addCalendarMonths(value: string, months: number) {
  const d = new Date(value);
  const originalDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(originalDay, lastDay));
  return d.toISOString();
}
function addCalendarDays(value: string, days: number) { const d = new Date(value); d.setUTCDate(d.getUTCDate() + days); return d.toISOString(); }
function daysRemaining(end: string) { const diff = Date.parse(end) - Date.now(); return Math.max(0, Math.ceil(diff / 86_400_000)); }
function packageCodeOf(value: unknown) { const code = upper(value); return PACKAGE_TERMS[code] ? code : "MONTHLY"; }
function packageMonthsOf(value: unknown) { return PACKAGE_TERMS[packageCodeOf(value)] || 1; }

function normalizedProfile(row: Row | null | undefined, company: Row) {
  const window = monthWindow();
  const start = safeIso(row?.period_start, window.start);
  let end = safeIso(row?.period_end, window.end);
  if (Date.parse(end) <= Date.parse(start)) end = window.end;
  const custom = row?.custom_monthly_price_minor === null || row?.custom_monthly_price_minor === undefined ? null : nonNegativeInt(row.custom_monthly_price_minor);
  const packageCode = packageCodeOf(row?.package_code);
  const packagePriceMinor = nonNegativeInt(row?.base_monthly_price_minor);
  const customPackagePriceMinor = custom;
  return {
    mainCompanyId: text(company.id), mainCompanySlug: text(company.slug), companyName: text(company.name),
    companyActive: Number(company.is_active ?? 1) !== 0,
    packageCode, packageTermMonths: packageMonthsOf(packageCode),
    status: BILLING_STATUSES.has(upper(row?.status)) ? upper(row?.status) : "ACTIVE",
    // Legacy token quota fields remain readable for old audit data only. New plan
    // management is duration based and never blocks AI by token quantity.
    includedTokens: nonNegativeInt(row?.included_tokens), monthlyTokenLimit: nonNegativeInt(row?.monthly_token_limit),
    baseMonthlyPriceMinor: packagePriceMinor, customMonthlyPriceMinor: customPackagePriceMinor,
    packagePriceMinor, customPackagePriceMinor,
    overagePricePerMillionMinor: nonNegativeInt(row?.overage_price_per_million_minor),
    currency: upper(row?.currency || "TRY").slice(0, 3) || "TRY",
    periodStart: start, periodEnd: end, nextRenewalAt: safeIso(row?.next_renewal_at, end),
    daysRemaining: daysRemaining(end), expired: Date.parse(end) < Date.now(),
    note: text(row?.note), createdAt: row?.created_at || null, updatedAt: row?.updated_at || null,
  };
}

async function profileRow(db: any, companyId: string) { return db.prepare(`SELECT * FROM ${PROFILE_TABLE} WHERE main_company_id=? LIMIT 1`).bind(companyId).first<Row>(); }
async function periodAggregate(db: any, slug: string, start: string, end: string) {
  const row = await db.prepare(`SELECT COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(total_tokens),0) total_tokens,COALESCE(SUM(credit_tokens_delta),0) credit_tokens_delta,COALESCE(SUM(CASE WHEN movement_type='FEE_ADJUSTMENT' THEN amount_minor ELSE 0 END),0) fee_adjustment_minor,COUNT(CASE WHEN movement_type='AI_USAGE' THEN 1 END) ai_requests FROM ${LEDGER_TABLE} WHERE main_company_slug=? AND created_at>=? AND created_at<?`).bind(slug, start, end).first<Row>();
  return { inputTokens: nonNegativeInt(row?.input_tokens), outputTokens: nonNegativeInt(row?.output_tokens), totalTokens: nonNegativeInt(row?.total_tokens), creditTokensDelta: signedInt(row?.credit_tokens_delta), feeAdjustmentMinor: signedInt(row?.fee_adjustment_minor), aiRequests: nonNegativeInt(row?.ai_requests) };
}

function pricingSummary(profile: Row, aggregate: Row) {
  const effectivePackagePriceMinor = profile.customPackagePriceMinor === null || profile.customPackagePriceMinor === undefined ? nonNegativeInt(profile.packagePriceMinor) : nonNegativeInt(profile.customPackagePriceMinor);
  const feeAdjustmentMinor = signedInt(aggregate.feeAdjustmentMinor);
  return {
    ...aggregate,
    // Compatibility fields intentionally remain, but customer billing is no
    // longer quota/overage based.
    availableTokens: 0, remainingTokens: 0, overageTokens: 0, limitRemainingTokens: null, overageAmountMinor: 0,
    monthlyPriceMinor: effectivePackagePriceMinor,
    packagePriceMinor: effectivePackagePriceMinor,
    feeAdjustmentMinor,
    invoiceAmountMinor: Math.max(0, effectivePackagePriceMinor + feeAdjustmentMinor),
  };
}

async function companyBillingView(db: any, company: Row) { const row = await profileRow(db, text(company.id)); const profile = normalizedProfile(row, company); const aggregate = await periodAggregate(db, profile.mainCompanySlug, profile.periodStart, profile.periodEnd); return { ...profile, usage: pricingSummary(profile, aggregate) }; }

async function recentMovements(db: any, slug: string, limit = 200) {
  const result = await db.prepare(`SELECT id,movement_type,source,source_ref,input_tokens,output_tokens,total_tokens,credit_tokens_delta,amount_minor,model,actor_user_id,note,created_at FROM ${LEDGER_TABLE} WHERE main_company_slug=? ORDER BY created_at DESC LIMIT ?`).bind(slug, Math.min(Math.max(1, limit), 500)).all<Row>();
  return (result.results || []).map((row: Row) => ({ id: text(row.id), movementType: upper(row.movement_type), source: upper(row.source), sourceRef: text(row.source_ref), inputTokens: nonNegativeInt(row.input_tokens), outputTokens: nonNegativeInt(row.output_tokens), totalTokens: nonNegativeInt(row.total_tokens), creditTokensDelta: signedInt(row.credit_tokens_delta), amountMinor: signedInt(row.amount_minor), model: text(row.model), actorUserId: text(row.actor_user_id), note: text(row.note), createdAt: row.created_at || null }));
}
async function monthlyUsage(db: any, slug: string) {
  const result = await db.prepare(`SELECT substr(created_at,1,7) period_key,COALESCE(SUM(input_tokens),0) input_tokens,COALESCE(SUM(output_tokens),0) output_tokens,COALESCE(SUM(total_tokens),0) total_tokens,COALESCE(SUM(credit_tokens_delta),0) credit_tokens_delta,COALESCE(SUM(CASE WHEN movement_type='FEE_ADJUSTMENT' THEN amount_minor ELSE 0 END),0) fee_adjustment_minor,COUNT(CASE WHEN movement_type='AI_USAGE' THEN 1 END) ai_requests FROM ${LEDGER_TABLE} WHERE main_company_slug=? GROUP BY substr(created_at,1,7) ORDER BY period_key DESC LIMIT 12`).bind(slug).all<Row>();
  return (result.results || []).map((row: Row) => ({ periodKey: text(row.period_key), inputTokens: nonNegativeInt(row.input_tokens), outputTokens: nonNegativeInt(row.output_tokens), totalTokens: nonNegativeInt(row.total_tokens), creditTokensDelta: signedInt(row.credit_tokens_delta), feeAdjustmentMinor: signedInt(row.fee_adjustment_minor), aiRequests: nonNegativeInt(row.ai_requests) }));
}

async function audit(c: any, action: string, actorId: string, company: Row, detail: Row = {}) {
  try {
    if (!(await tableExists(c.env.DB, "auth_security_audit"))) return;
    await c.env.DB.prepare(`INSERT INTO auth_security_audit (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), actorId || null, null, text(company.slug) || null, action, null, text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]) || null, JSON.stringify(detail || {}), nowIso()).run();
  } catch {}
}
function usageTokens(usage: Row = {}) { const input = nonNegativeInt(usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.promptTokens); const output = nonNegativeInt(usage.output_tokens ?? usage.completion_tokens ?? usage.outputTokens ?? usage.completionTokens); const explicitTotal = nonNegativeInt(usage.total_tokens ?? usage.totalTokens); return { input, output, total: explicitTotal || input + output }; }

export async function checkCompanyAiAllowance(db: any, slug: string) {
  const companySlug = text(slug);
  if (!companySlug || !(await schemaReady(db))) return { allowed: true, metered: false, reason: "BILLING_SCHEMA_NOT_ACTIVE" };
  const company = await companyBySlug(db, companySlug);
  if (!company || Number(company.is_active ?? 1) === 0) return { allowed: false, metered: true, code: "COMPANY_INACTIVE", message: "Ana firma pasif olduğu için KY ERP AI kullanımı kapalıdır." };
  const profile = normalizedProfile(await profileRow(db, text(company.id)), company);
  if (!ACTIVE_STATUSES.has(profile.status)) return { allowed: false, metered: true, code: "COMPANY_AI_PLAN_INACTIVE", message: "Firma paketi yönetici tarafından pasif duruma alınmış." };
  const aggregate = await periodAggregate(db, profile.mainCompanySlug, profile.periodStart, profile.periodEnd);
  const summary = pricingSummary(profile, aggregate);
  // Deliberately no token hard-limit check. AI usage is metered for owner-side
  // cost visibility only and cannot exhaust the customer's application access.
  return { allowed: true, metered: true, profile, usage: summary };
}

export async function recordCompanyAiUsage(db: any, options: Row = {}) {
  const slug = text(options.mainCompanySlug);
  if (!slug || !(await schemaReady(db))) return { recorded: false, reason: "BILLING_SCHEMA_NOT_ACTIVE" };
  const company = await companyBySlug(db, slug); if (!company) return { recorded: false, reason: "COMPANY_NOT_FOUND" };
  const tokens = usageTokens(options.usage || {}); if (tokens.total <= 0) return { recorded: false, reason: "PROVIDER_USAGE_MISSING" };
  const sourceRef = text(options.sourceRef || options.requestId || crypto.randomUUID()), id = crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO ${LEDGER_TABLE} (id,main_company_id,main_company_slug,movement_type,source,source_ref,input_tokens,output_tokens,total_tokens,credit_tokens_delta,amount_minor,model,actor_user_id,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, text(company.id), text(company.slug), "AI_USAGE", "WORKERS_AI", sourceRef, tokens.input, tokens.output, tokens.total, 0, 0, text(options.model), text(options.actorUserId), text(options.note), nowIso()).run();
    return { recorded: true, id, ...tokens };
  } catch (error) {
    const message = text(error instanceof Error ? error.message : error); if (/UNIQUE|constraint/i.test(message)) return { recorded: false, duplicate: true, reason: "SOURCE_REF_EXISTS" }; throw error;
  }
}

export function registerCompanyBillingRoutes(app: any) {
  app.get("/api/admin/company-billing", async (c: any) => {
    const current = await ownerCurrent(c); if (!current) return c.json(jsonError("OWNER_ONLY", "Firma paket ve ücretlendirme yönetimi yalnız uygulama sahibine açıktır."), 403);
    if (!(await schemaReady(c.env.DB))) return c.json(jsonError("BILLING_SCHEMA_MISSING", "Firma ücretlendirme şeması henüz uygulanmamış."), 503);
    const result = await c.env.DB.prepare("SELECT id,slug,name,is_active FROM main_companies ORDER BY is_active DESC,name COLLATE NOCASE").all<Row>(); const data = [];
    for (const company of result.results || []) data.push(await companyBillingView(c.env.DB, company)); return c.json({ ok: true, data });
  });

  app.get("/api/admin/company-billing/:id", async (c: any) => {
    const current = await ownerCurrent(c); if (!current) return c.json(jsonError("OWNER_ONLY", "Firma ücret bilgisi yalnız uygulama sahibine açıktır."), 403);
    if (!(await schemaReady(c.env.DB))) return c.json(jsonError("BILLING_SCHEMA_MISSING", "Firma ücretlendirme şeması henüz uygulanmamış."), 503);
    const company = await companyById(c.env.DB, text(c.req.param("id"))); if (!company) return c.json(jsonError("COMPANY_NOT_FOUND", "Ana firma bulunamadı."), 404);
    const data = await companyBillingView(c.env.DB, company); return c.json({ ok: true, data: { ...data, movements: await recentMovements(c.env.DB, text(company.slug)), monthlyUsage: await monthlyUsage(c.env.DB, text(company.slug)) } });
  });

  app.put("/api/admin/company-billing/:id", async (c: any) => {
    const current = await ownerCurrent(c); if (!current) return c.json(jsonError("OWNER_ONLY", "Firma paket ve fiyat ayarını yalnız uygulama sahibi değiştirebilir."), 403);
    if (!(await schemaReady(c.env.DB))) return c.json(jsonError("BILLING_SCHEMA_MISSING", "Firma ücretlendirme şeması henüz uygulanmamış."), 503);
    const company = await companyById(c.env.DB, text(c.req.param("id"))); if (!company) return c.json(jsonError("COMPANY_NOT_FOUND", "Ana firma bulunamadı."), 404);
    const body = await bodyOf(c), packageCode = packageCodeOf(body.packageCode), status = upper(body.status || "ACTIVE");
    if (!BILLING_STATUSES.has(status)) return c.json(jsonError("BILLING_STATUS_INVALID", "Paket durumu TRIAL, ACTIVE, PAUSED veya CANCELLED olmalıdır."), 400);
    const window = monthWindow(), periodStart = safeIso(body.periodStart, window.start), periodEnd = addCalendarMonths(periodStart, packageMonthsOf(packageCode)), nextRenewalAt = periodEnd;
    const packagePriceMinor = nonNegativeInt(body.packagePriceMinor ?? body.baseMonthlyPriceMinor);
    const customPackagePriceMinor = body.customPackagePriceMinor === null || body.customPackagePriceMinor === undefined || body.customPackagePriceMinor === "" ? null : nonNegativeInt(body.customPackagePriceMinor);
    const currency = upper(body.currency || "TRY").replace(/[^A-Z]/g, "").slice(0, 3) || "TRY", timestamp = nowIso(), existing = await profileRow(c.env.DB, text(company.id));
    await c.env.DB.prepare(`INSERT INTO ${PROFILE_TABLE} (main_company_id,main_company_slug,package_code,status,included_tokens,monthly_token_limit,base_monthly_price_minor,custom_monthly_price_minor,overage_price_per_million_minor,currency,period_start,period_end,next_renewal_at,note,created_by_user_id,updated_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(main_company_id) DO UPDATE SET main_company_slug=excluded.main_company_slug,package_code=excluded.package_code,status=excluded.status,included_tokens=0,monthly_token_limit=0,base_monthly_price_minor=excluded.base_monthly_price_minor,custom_monthly_price_minor=excluded.custom_monthly_price_minor,overage_price_per_million_minor=0,currency=excluded.currency,period_start=excluded.period_start,period_end=excluded.period_end,next_renewal_at=excluded.next_renewal_at,note=excluded.note,updated_by_user_id=excluded.updated_by_user_id,updated_at=excluded.updated_at`).bind(text(company.id), text(company.slug), packageCode, status, 0, 0, packagePriceMinor, customPackagePriceMinor, 0, currency, periodStart, periodEnd, nextRenewalAt, text(body.note), text(existing?.created_by_user_id || current.id), text(current.id), text(existing?.created_at || timestamp), timestamp).run();
    const effectivePrice = customPackagePriceMinor === null ? packagePriceMinor : customPackagePriceMinor;
    await c.env.DB.prepare(`INSERT INTO ${LEDGER_TABLE} (id,main_company_id,main_company_slug,movement_type,source,source_ref,input_tokens,output_tokens,total_tokens,credit_tokens_delta,amount_minor,model,actor_user_id,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), text(company.id), text(company.slug), "PLAN_UPDATE", "ADMIN", crypto.randomUUID(), 0, 0, 0, 0, effectivePrice, "", text(current.id), JSON.stringify({ packageCode, packageTermMonths: packageMonthsOf(packageCode), status, currency, periodStart, periodEnd, nextRenewalAt, note: text(body.note) }), timestamp).run();
    await audit(c, "COMPANY_BILLING_UPDATED", text(current.id), company, { packageCode, packageTermMonths: packageMonthsOf(packageCode), status, effectivePrice, currency, periodStart, periodEnd });
    return c.json({ ok: true, data: await companyBillingView(c.env.DB, company) });
  });

  app.post("/api/admin/company-billing/:id/extend", async (c: any) => {
    const current = await ownerCurrent(c); if (!current) return c.json(jsonError("OWNER_ONLY", "Paket süresini yalnız uygulama sahibi uzatabilir."), 403);
    if (!(await schemaReady(c.env.DB))) return c.json(jsonError("BILLING_SCHEMA_MISSING", "Firma ücretlendirme şeması henüz uygulanmamış."), 503);
    const company = await companyById(c.env.DB, text(c.req.param("id"))); if (!company) return c.json(jsonError("COMPANY_NOT_FOUND", "Ana firma bulunamadı."), 404);
    const body = await bodyOf(c), days = nonNegativeInt(body.days), note = text(body.note);
    if (days < 1 || days > 3650) return c.json(jsonError("PACKAGE_EXTENSION_INVALID", "Süre uzatma 1 ile 3650 gün arasında olmalıdır."), 400);
    if (!note) return c.json(jsonError("MOVEMENT_NOTE_REQUIRED", "Süre uzatma açıklaması zorunludur."), 400);
    const existing = await profileRow(c.env.DB, text(company.id)); if (!existing) return c.json(jsonError("BILLING_PROFILE_NOT_FOUND", "Önce firma paketini kaydedin."), 404);
    const profile = normalizedProfile(existing, company), base = Date.parse(profile.periodEnd) > Date.now() ? profile.periodEnd : nowIso(), newEnd = addCalendarDays(base, days), timestamp = nowIso();
    await c.env.DB.prepare(`UPDATE ${PROFILE_TABLE} SET period_end=?,next_renewal_at=?,updated_by_user_id=?,updated_at=? WHERE main_company_id=?`).bind(newEnd, newEnd, text(current.id), timestamp, text(company.id)).run();
    await c.env.DB.prepare(`INSERT INTO ${LEDGER_TABLE} (id,main_company_id,main_company_slug,movement_type,source,source_ref,input_tokens,output_tokens,total_tokens,credit_tokens_delta,amount_minor,model,actor_user_id,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), text(company.id), text(company.slug), "TERM_EXTENSION", "ADMIN", crypto.randomUUID(), 0, 0, 0, 0, 0, "", text(current.id), JSON.stringify({ days, note, previousEnd: profile.periodEnd, newEnd }), timestamp).run();
    await audit(c, "COMPANY_PACKAGE_EXTENDED", text(current.id), company, { days, previousEnd: profile.periodEnd, newEnd, note });
    return c.json({ ok: true, data: await companyBillingView(c.env.DB, company) }, 201);
  });

  // Legacy token-credit endpoint is kept for API compatibility and historical
  // ledger corrections. It is intentionally not exposed in the new package UI.
  app.post("/api/admin/company-billing/:id/credit", async (c: any) => {
    const current = await ownerCurrent(c); if (!current) return c.json(jsonError("OWNER_ONLY", "Teknik AI kullanım düzeltmesi yalnız uygulama sahibi tarafından girilebilir."), 403);
    if (!(await schemaReady(c.env.DB))) return c.json(jsonError("BILLING_SCHEMA_MISSING", "Firma ücretlendirme şeması henüz uygulanmamış."), 503);
    const company = await companyById(c.env.DB, text(c.req.param("id"))); if (!company) return c.json(jsonError("COMPANY_NOT_FOUND", "Ana firma bulunamadı."), 404);
    const body = await bodyOf(c), tokens = signedInt(body.tokens), note = text(body.note); if (!tokens) return c.json(jsonError("TOKEN_CREDIT_REQUIRED", "Teknik token düzeltmesi sıfır olamaz."), 400); if (!note) return c.json(jsonError("MOVEMENT_NOTE_REQUIRED", "Teknik kullanım düzeltmesinde açıklama zorunludur."), 400);
    const movementType = tokens > 0 ? "TOKEN_CREDIT" : "TOKEN_DEBIT", id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO ${LEDGER_TABLE} (id,main_company_id,main_company_slug,movement_type,source,source_ref,input_tokens,output_tokens,total_tokens,credit_tokens_delta,amount_minor,model,actor_user_id,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, text(company.id), text(company.slug), movementType, "ADMIN", crypto.randomUUID(), 0, 0, 0, tokens, 0, "", text(current.id), note, nowIso()).run();
    await audit(c, "COMPANY_TOKEN_CREDIT_ADJUSTED", text(current.id), company, { tokens, movementType, note }); return c.json({ ok: true, data: { id, movementType, tokens, summary: await companyBillingView(c.env.DB, company) } }, 201);
  });

  app.post("/api/admin/company-billing/:id/fee-adjustment", async (c: any) => {
    const current = await ownerCurrent(c); if (!current) return c.json(jsonError("OWNER_ONLY", "Ücret düzeltmesi yalnız uygulama sahibi tarafından girilebilir."), 403);
    if (!(await schemaReady(c.env.DB))) return c.json(jsonError("BILLING_SCHEMA_MISSING", "Firma ücretlendirme şeması henüz uygulanmamış."), 503);
    const company = await companyById(c.env.DB, text(c.req.param("id"))); if (!company) return c.json(jsonError("COMPANY_NOT_FOUND", "Ana firma bulunamadı."), 404);
    const body = await bodyOf(c), amountMinor = signedInt(body.amountMinor), note = text(body.note); if (!amountMinor) return c.json(jsonError("FEE_ADJUSTMENT_REQUIRED", "Ücret düzeltmesi sıfır olamaz."), 400); if (!note) return c.json(jsonError("MOVEMENT_NOTE_REQUIRED", "Ücret düzeltmesinde açıklama zorunludur."), 400);
    const id = crypto.randomUUID(); await c.env.DB.prepare(`INSERT INTO ${LEDGER_TABLE} (id,main_company_id,main_company_slug,movement_type,source,source_ref,input_tokens,output_tokens,total_tokens,credit_tokens_delta,amount_minor,model,actor_user_id,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, text(company.id), text(company.slug), "FEE_ADJUSTMENT", "ADMIN", crypto.randomUUID(), 0, 0, 0, 0, amountMinor, "", text(current.id), note, nowIso()).run();
    await audit(c, "COMPANY_FEE_ADJUSTED", text(current.id), company, { amountMinor, note }); return c.json({ ok: true, data: { id, amountMinor, summary: await companyBillingView(c.env.DB, company) } }, 201);
  });
}
