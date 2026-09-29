// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const text = (value: unknown) => value == null ? "" : String(value).trim();
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
const now = () => new Date().toISOString();
const slugOf = (c: Context<AppEnv>, body: Row = {}) => text(
  body.mainCompanySlug || body.main_company_slug || body.mainCompanyId ||
  c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") ||
  c.req.header("X-KYERP-Tenant-Slug") || "mecit-hakan",
);
const error = (code: string, message: string) => ({ ok: false, success: false, error: { code, message } });
async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Row : {};
  } catch { return {}; }
}

export function registerAccountingFinanceCoreRoutes(app: Hono<AppEnv>) {
  app.get("/api/muhasebe/odeme-plani", async (c) => {
    const slug = slugOf(c), from = text(c.req.query("from")), to = text(c.req.query("to"));
    const where = ["main_company_slug=?", "status<>'CANCELLED'"];
    const args: any[] = [slug];
    if (from) { where.push("COALESCE(planned_date,due_date)>=?"); args.push(from); }
    if (to) { where.push("COALESCE(planned_date,due_date)<=?"); args.push(to); }
    const result = await c.env.DB.prepare(`SELECT * FROM accounting_payment_plans WHERE ${where.join(" AND ")} ORDER BY COALESCE(planned_date,due_date),priority DESC`).bind(...args).all<Row>();
    return c.json({ ok: true, data: result.results || [] });
  });
  app.post("/api/muhasebe/odeme-plani", async (c) => {
    const body = await bodyOf(c), slug = slugOf(c, body), id = crypto.randomUUID(), timestamp = now();
    if (!text(body.counterpartyName)) return c.json(error("COUNTERPARTY_REQUIRED", "Ödeme yapılacak kişi/firma zorunludur."), 400);
    await c.env.DB.prepare(`INSERT INTO accounting_payment_plans(id,main_company_slug,counterparty_type,counterparty_id,counterparty_name,amount,currency,planned_date,due_date,priority,payment_method,bank_account_id,status,description,source_document_id,source_type,reminder_enabled,reminder_at,paid_amount,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, slug, text(body.counterpartyType) || "COMPANY", text(body.counterpartyId) || null,
      text(body.counterpartyName), num(body.amount), text(body.currency) || "TRY",
      text(body.plannedDate) || null, text(body.dueDate) || null, text(body.priority) || "NORMAL",
      text(body.paymentMethod) || null, text(body.bankAccountId) || null, "PLANNED",
      text(body.description) || null, text(body.sourceDocumentId) || null, text(body.sourceType) || "MANUAL",
      body.reminderEnabled ? 1 : 0, text(body.reminderAt) || null, 0, text(body.createdBy) || null,
      timestamp, timestamp,
    ).run();
    return c.json({ ok: true, data: { id, status: "PLANNED" } }, 201);
  });

  app.get("/api/muhasebe/defter", async (c) => {
    const slug = slugOf(c), take = Math.min(500, Math.max(1, Number(c.req.query("take") || 200)));
    const result = await c.env.DB.prepare(`SELECT * FROM accounting_ledger_entries WHERE main_company_slug=? AND deleted_at IS NULL ORDER BY entry_date DESC,created_at DESC LIMIT ?`).bind(slug, take).all<Row>();
    return c.json({ ok: true, data: result.results || [] });
  });
  app.post("/api/muhasebe/defter", async (c) => {
    const body = await bodyOf(c), slug = slugOf(c, body), id = crypto.randomUUID(), timestamp = now();
    await c.env.DB.prepare(`INSERT INTO accounting_ledger_entries(id,main_company_slug,entry_date,entry_type,record_scope,company_id,company_name,description,debit,credit,currency,payment_method,bank_account_id,source_document_id,source_payment_plan_id,file_asset_id,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, slug, text(body.entryDate) || timestamp.slice(0, 10), text(body.entryType).toUpperCase() || "DIGER",
      text(body.recordScope).toUpperCase() === "INTERNAL" ? "INTERNAL" : "OFFICIAL",
      text(body.companyId) || null, text(body.companyName) || null, text(body.description) || null,
      num(body.debit), num(body.credit), text(body.currency) || "TRY", text(body.paymentMethod) || null,
      text(body.bankAccountId) || null, text(body.sourceDocumentId) || null, text(body.sourcePaymentPlanId) || null,
      text(body.fileAssetId) || null, text(body.note) || null, text(body.createdBy) || null, timestamp, timestamp,
    ).run();
    return c.json({ ok: true, data: { id } }, 201);
  });
}
