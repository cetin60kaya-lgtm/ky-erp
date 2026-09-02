// @ts-nocheck
import { getAuthenticatedUser } from "./auth-cloud";

type Row = Record<string, any>;

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const nowIso = () => new Date().toISOString();
const isOwner = (role: unknown) => ["SUPER_ADMIN", "ADMIN"].includes(upper(role));
const isCompanyAdmin = (role: unknown) => upper(role) === "COMPANY_ADMIN";
const int = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

function fail(c: any, status: number, code: string, message: string) {
  return c.json({ ok: false, error: { code, message } }, status);
}

async function bodyOf(c: any) {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function tenantOf(user: Row) {
  return text(user.mainCompanySlug || user.main_company_slug || user.security?.main_company_slug).toLocaleLowerCase("tr-TR");
}

async function companyBySlug(c: any, slug: string) {
  return c.env.DB.prepare("SELECT slug,name,COALESCE(is_active,1) AS is_active FROM main_companies WHERE slug=? LIMIT 1")
    .bind(slug).first<Row>();
}

async function authorizeCompany(c: any, requested: string, write = false) {
  const current = await getAuthenticatedUser(c);
  if (!current) return { error: fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.") };
  const owner = isOwner(current.role);
  const companyAdmin = isCompanyAdmin(current.role);
  if (write && !owner) return { error: fail(c, 403, "OWNER_ONLY", "Paket, fiyat ve kredi değişikliği yalnız uygulama sahibine açıktır.") };
  if (!owner && !companyAdmin) return { error: fail(c, 403, "BILLING_FORBIDDEN", "Ücretlendirme bilgisine erişim yetkiniz yok.") };
  const tenant = tenantOf(current as Row);
  const company = text(requested).toLocaleLowerCase("tr-TR");
  if (!company) return { error: fail(c, 400, "COMPANY_REQUIRED", "Firma zorunludur.") };
  if (!owner && company !== tenant) return { error: fail(c, 403, "TENANT_FORBIDDEN", "Yalnız kendi firmanızın kullanım bilgisini görebilirsiniz.") };
  const found = await companyBySlug(c, company);
  if (!found) return { error: fail(c, 404, "COMPANY_NOT_FOUND", "Firma bulunamadı.") };
  return { current, owner, company, found };
}

async function audit(c: any, action: string, actorId: string, company: string, detail: Row = {}) {
  try {
    const exists = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_security_audit' LIMIT 1").first<Row>();
    if (!exists?.name) return;
    await c.env.DB.prepare(`INSERT INTO auth_security_audit
      (id,actor_user_id,target_user_id,main_company_slug,action,session_id,ip_address,detail,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), actorId || null, null, company, action, null,
        text(c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For")?.split(",")[0]) || null,
        JSON.stringify(detail), nowIso()).run();
  } catch {}
}

async function summaryOf(c: any, company: string) {
  const account = await c.env.DB.prepare(`SELECT
      main_company_id AS mainCompanyId,plan_code AS planCode,status,currency,
      included_credits AS includedCredits,monthly_spend_limit_minor AS monthlySpendLimitMinor,
      overage_price_minor_per_1k AS overagePriceMinorPer1k,custom_price_json AS customPriceJson,
      period_start AS periodStart,period_end AS periodEnd,next_renewal_at AS nextRenewalAt,
      created_at AS createdAt,updated_at AS updatedAt
    FROM company_billing_accounts WHERE main_company_id=? LIMIT 1`).bind(company).first<Row>();
  const usage = await c.env.DB.prepare(`SELECT
      COALESCE(SUM(input_tokens),0) AS inputTokens,
      COALESCE(SUM(output_tokens),0) AS outputTokens,
      COALESCE(SUM(total_tokens),0) AS totalTokens,
      COALESCE(SUM(credit_delta),0) AS creditDelta,
      COALESCE(SUM(amount_minor),0) AS amountMinor
    FROM company_ai_usage_ledger WHERE main_company_id=?`).bind(company).first<Row>();
  const billing = await c.env.DB.prepare(`SELECT
      COALESCE(SUM(credit_delta),0) AS creditDelta,
      COALESCE(SUM(amount_minor),0) AS amountMinor
    FROM company_billing_ledger WHERE main_company_id=?`).bind(company).first<Row>();
  const [usageRows, billingRows] = await Promise.all([
    c.env.DB.prepare(`SELECT id,occurred_at AS occurredAt,provider,model,input_tokens AS inputTokens,
      output_tokens AS outputTokens,total_tokens AS totalTokens,credit_delta AS creditDelta,
      amount_minor AS amountMinor,source_type AS sourceType,source_id AS sourceId,metadata_json AS metadataJson
      FROM company_ai_usage_ledger WHERE main_company_id=? ORDER BY occurred_at DESC LIMIT 100`).bind(company).all<Row>(),
    c.env.DB.prepare(`SELECT id,movement_type AS movementType,credit_delta AS creditDelta,amount_minor AS amountMinor,
      currency,note,reference_type AS referenceType,reference_id AS referenceId,created_by_user_id AS createdByUserId,
      created_at AS createdAt FROM company_billing_ledger WHERE main_company_id=? ORDER BY created_at DESC LIMIT 100`).bind(company).all<Row>(),
  ]);
  const included = int(account?.includedCredits || 0);
  const usageCredit = int(usage?.creditDelta || 0);
  const billingCredit = int(billing?.creditDelta || 0);
  return {
    account: account || {
      mainCompanyId: company, planCode: "STANDARD", status: "ACTIVE", currency: "TRY",
      includedCredits: 0, monthlySpendLimitMinor: 0, overagePriceMinorPer1k: 0,
      customPriceJson: "{}", periodStart: null, periodEnd: null, nextRenewalAt: null,
    },
    usage: {
      inputTokens: int(usage?.inputTokens), outputTokens: int(usage?.outputTokens), totalTokens: int(usage?.totalTokens),
      creditDelta: usageCredit, amountMinor: int(usage?.amountMinor),
    },
    billing: { creditDelta: billingCredit, amountMinor: int(billing?.amountMinor) },
    availableCredits: included + usageCredit + billingCredit,
    usageLedger: usageRows.results || [],
    billingLedger: billingRows.results || [],
  };
}

export function registerAdminBillingRoutes(app: any) {
  app.get("/api/admin/billing/companies", async (c: any) => {
    const current = await getAuthenticatedUser(c);
    if (!current) return fail(c, 401, "UNAUTHORIZED", "Oturum doğrulanamadı.");
    const owner = isOwner(current.role);
    const companyAdmin = isCompanyAdmin(current.role);
    if (!owner && !companyAdmin) return fail(c, 403, "BILLING_FORBIDDEN", "Ücretlendirme bilgisine erişim yetkiniz yok.");
    const tenant = tenantOf(current as Row);
    const result = owner
      ? await c.env.DB.prepare("SELECT slug,name,COALESCE(is_active,1) AS isActive FROM main_companies ORDER BY COALESCE(is_active,1) DESC,name").all<Row>()
      : await c.env.DB.prepare("SELECT slug,name,COALESCE(is_active,1) AS isActive FROM main_companies WHERE slug=? LIMIT 1").bind(tenant).all<Row>();
    return c.json({ ok: true, data: result.results || [], owner });
  });

  app.get("/api/admin/billing/companies/:companyId", async (c: any) => {
    const auth = await authorizeCompany(c, c.req.param("companyId"), false);
    if (auth.error) return auth.error;
    const summary = await summaryOf(c, auth.company);
    return c.json({ ok: true, data: { company: { slug: auth.found.slug, name: auth.found.name }, ...summary }, owner: auth.owner });
  });

  app.put("/api/admin/billing/companies/:companyId/account", async (c: any) => {
    const auth = await authorizeCompany(c, c.req.param("companyId"), true);
    if (auth.error) return auth.error;
    const body = await bodyOf(c);
    const planCode = upper(body.planCode || "STANDARD").replace(/[^A-Z0-9_-]+/g, "_").slice(0, 50) || "STANDARD";
    const status = ["ACTIVE", "TRIAL", "PAUSED", "CANCELLED"].includes(upper(body.status)) ? upper(body.status) : "ACTIVE";
    const currency = /^[A-Z]{3}$/.test(upper(body.currency)) ? upper(body.currency) : "TRY";
    const includedCredits = Math.max(0, int(body.includedCredits));
    const monthlySpendLimitMinor = Math.max(0, int(body.monthlySpendLimitMinor));
    const overagePriceMinorPer1k = Math.max(0, int(body.overagePriceMinorPer1k));
    const customPriceJson = typeof body.customPriceJson === "string" ? body.customPriceJson : JSON.stringify(body.customPrice || {});
    try { JSON.parse(customPriceJson || "{}"); } catch { return fail(c, 400, "CUSTOM_PRICE_INVALID", "Özel fiyat JSON bilgisi geçersiz."); }
    const stamp = nowIso();
    await c.env.DB.prepare(`INSERT INTO company_billing_accounts
      (main_company_id,plan_code,status,currency,included_credits,monthly_spend_limit_minor,overage_price_minor_per_1k,
       custom_price_json,period_start,period_end,next_renewal_at,created_at,updated_at,updated_by_user_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(main_company_id) DO UPDATE SET plan_code=excluded.plan_code,status=excluded.status,currency=excluded.currency,
       included_credits=excluded.included_credits,monthly_spend_limit_minor=excluded.monthly_spend_limit_minor,
       overage_price_minor_per_1k=excluded.overage_price_minor_per_1k,custom_price_json=excluded.custom_price_json,
       period_start=excluded.period_start,period_end=excluded.period_end,next_renewal_at=excluded.next_renewal_at,
       updated_at=excluded.updated_at,updated_by_user_id=excluded.updated_by_user_id`)
      .bind(auth.company,planCode,status,currency,includedCredits,monthlySpendLimitMinor,overagePriceMinorPer1k,
        customPriceJson || "{}",text(body.periodStart)||null,text(body.periodEnd)||null,text(body.nextRenewalAt)||null,
        stamp,stamp,text(auth.current.id)).run();
    await audit(c,"COMPANY_BILLING_ACCOUNT_UPDATED",text(auth.current.id),auth.company,{planCode,status,currency,includedCredits,monthlySpendLimitMinor,overagePriceMinorPer1k});
    return c.json({ ok: true, data: await summaryOf(c, auth.company) });
  });

  app.post("/api/admin/billing/companies/:companyId/credits", async (c: any) => {
    const auth = await authorizeCompany(c, c.req.param("companyId"), true);
    if (auth.error) return auth.error;
    const body = await bodyOf(c);
    const movementType = upper(body.movementType || "ADJUSTMENT");
    if (!["GRANT", "ADJUSTMENT", "REFUND", "CHARGE"].includes(movementType)) return fail(c, 400, "MOVEMENT_INVALID", "Kredi hareket tipi geçersiz.");
    const creditDelta = int(body.creditDelta);
    const amountMinor = int(body.amountMinor);
    if (creditDelta === 0 && amountMinor === 0) return fail(c, 400, "MOVEMENT_EMPTY", "Kredi veya tutar değişikliği girilmelidir.");
    const account = await c.env.DB.prepare("SELECT currency FROM company_billing_accounts WHERE main_company_id=? LIMIT 1").bind(auth.company).first<Row>();
    const currency = /^[A-Z]{3}$/.test(upper(body.currency)) ? upper(body.currency) : text(account?.currency || "TRY");
    const id = crypto.randomUUID();
    const stamp = nowIso();
    await c.env.DB.prepare(`INSERT INTO company_billing_ledger
      (id,main_company_id,movement_type,credit_delta,amount_minor,currency,note,reference_type,reference_id,created_by_user_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,auth.company,movementType,creditDelta,amountMinor,currency,text(body.note),text(body.referenceType),text(body.referenceId),text(auth.current.id),stamp).run();
    await audit(c,"COMPANY_BILLING_CREDIT_MOVEMENT",text(auth.current.id),auth.company,{id,movementType,creditDelta,amountMinor,currency,note:text(body.note)});
    return c.json({ ok: true, data: await summaryOf(c, auth.company) }, 201);
  });
}
