// @ts-nocheck
import type { Context, Hono } from "hono";
import { enforceAccountingTenant } from "./accounting-tenant-guard";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;
const text = (value: unknown) => value == null ? "" : String(value).trim();
const num = (value: unknown) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; };
const now = () => new Date().toISOString();
const slugOf = (c: Context<AppEnv>) => text(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || c.req.header("X-KYERP-Tenant-Slug") || "mecit-hakan");
const ok = (c: Context<AppEnv>, data: unknown, status = 200) => c.json({ ok: true, data }, status as any);
const fail = (c: Context<AppEnv>, status: number, code: string, message: string) => c.json({ ok: false, error: { code, message } }, status as any);
const periodNow = () => new Date().toISOString().slice(0, 7);
const safePeriod = (value: unknown) => /^\d{4}-\d{2}$/.test(text(value)) ? text(value) : periodNow();

const EXTRA_WATCH_TABLES = [
  "companies", "company_aliases", "current_account_movements",
  "vat_records", "sales_invoice_states", "checks", "payments",
];
let schemaReady = false;
async function ensureWorkspaceSchema(c: Context<AppEnv>) {
  if (schemaReady) return;
  await c.env.DB.exec(`
    CREATE TABLE IF NOT EXISTS accounting_live_revision (
      main_company_slug TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounting_financial_accounts (
      id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL, account_type TEXT NOT NULL,
      name TEXT NOT NULL, bank_name TEXT, iban TEXT, currency TEXT NOT NULL DEFAULT 'TRY',
      opening_balance REAL NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
      note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_financial_accounts_name
      ON accounting_financial_accounts(main_company_slug, name);
    CREATE TABLE IF NOT EXISTS accounting_reconciliations (
      id TEXT PRIMARY KEY, main_company_slug TEXT NOT NULL, company_id TEXT NOT NULL,
      period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'WAITING', erp_balance REAL NOT NULL DEFAULT 0,
      counterparty_balance REAL, difference REAL, note TEXT, confirmed_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_reconciliations_period
      ON accounting_reconciliations(main_company_slug, company_id, period);
  `);
  const placeholders = EXTRA_WATCH_TABLES.map(() => "?").join(",");
  const existing = await c.env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'accounting_%' OR name IN (${placeholders}))`,
  ).bind(...EXTRA_WATCH_TABLES).all<Row>();
  for (const row of existing.results || []) {
    const table = text(row.name);
    if (!table || table === "accounting_live_revision") continue;
    const columns = await c.env.DB.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all<Row>();
    if (!(columns.results || []).some((column) => text(column.name) === "main_company_slug")) continue;
    const base = table.replace(/[^A-Za-z0-9_]/g, "_");
    for (const [event, ref] of [["INSERT", "NEW"], ["UPDATE", "NEW"], ["DELETE", "OLD"]] as const) {
      const trigger = `trg_${base}_accounting_live_${event.toLowerCase()}`;
      await c.env.DB.exec(`CREATE TRIGGER IF NOT EXISTS ${trigger} AFTER ${event} ON "${table}"
        WHEN ${ref}.main_company_slug IS NOT NULL AND TRIM(${ref}.main_company_slug) <> ''
        BEGIN
          INSERT INTO accounting_live_revision(main_company_slug,revision,updated_at)
          VALUES(${ref}.main_company_slug,1,CURRENT_TIMESTAMP)
          ON CONFLICT(main_company_slug) DO UPDATE SET revision=revision+1,updated_at=CURRENT_TIMESTAMP;
        END;`);
    }
  }
  schemaReady = true;
}

async function readBody(c: Context<AppEnv>): Promise<Row> {
  try { const value = await c.req.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
  catch { return {}; }
}
async function liveState(c: Context<AppEnv>) {
  await ensureWorkspaceSchema(c);
  const slug = slugOf(c);
  let row = await c.env.DB.prepare(
    `SELECT revision,updated_at FROM accounting_live_revision WHERE main_company_slug=? LIMIT 1`,
  ).bind(slug).first<Row>();
  if (!row) {
    const ts = now();
    await c.env.DB.prepare(`INSERT OR IGNORE INTO accounting_live_revision(main_company_slug,revision,updated_at) VALUES(?,0,?)`).bind(slug, ts).run();
    row = { revision: 0, updated_at: ts };
  }
  return ok(c, { revision: num(row.revision), updatedAt: row.updated_at, serverTime: now() });
}

async function listFinancialAccounts(c: Context<AppEnv>) {
  await ensureWorkspaceSchema(c);
  const slug = slugOf(c);
  const rows = await c.env.DB.prepare(`SELECT a.*,
    a.opening_balance + COALESCE((SELECT SUM(COALESCE(l.credit,0)-COALESCE(l.debit,0))
      FROM accounting_ledger_entries l WHERE l.main_company_slug=a.main_company_slug
      AND l.bank_account_id=a.id AND l.deleted_at IS NULL),0) AS current_balance
    FROM accounting_financial_accounts a WHERE a.main_company_slug=?
    ORDER BY a.is_active DESC,a.account_type,a.name`).bind(slug).all<Row>();
  return ok(c, rows.results || []);
}

async function createFinancialAccount(c: Context<AppEnv>) {
  await ensureWorkspaceSchema(c);
  const body = await readBody(c), slug = slugOf(c), name = text(body.name);
  const accountType = String(body.accountType || body.account_type || "BANK").toUpperCase() === "CASH" ? "CASH" : "BANK";
  if (!name) return fail(c, 400, "ACCOUNT_NAME_REQUIRED", "Hesap adı zorunludur.");
  const id = crypto.randomUUID(), ts = now();
  try {
    await c.env.DB.prepare(`INSERT INTO accounting_financial_accounts
      (id,main_company_slug,account_type,name,bank_name,iban,currency,opening_balance,is_active,note,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`).bind(
        id, slug, accountType, name, text(body.bankName) || null, text(body.iban).replace(/\s/g, "") || null,
        text(body.currency) || "TRY", num(body.openingBalance), text(body.note) || null, ts, ts,
      ).run();
  } catch (error) {
    if (/UNIQUE/i.test(String(error))) return fail(c, 409, "ACCOUNT_NAME_EXISTS", "Bu isimde banka/kasa hesabı zaten var.");
    throw error;
  }
  return ok(c, { id, accountType, name }, 201);
}

async function updateFinancialAccount(c: Context<AppEnv>) {
  await ensureWorkspaceSchema(c);
  const body = await readBody(c), slug = slugOf(c), id = c.req.param("id");
  const current = await c.env.DB.prepare(`SELECT * FROM accounting_financial_accounts WHERE id=? AND main_company_slug=? LIMIT 1`).bind(id, slug).first<Row>();
  if (!current) return fail(c, 404, "ACCOUNT_NOT_FOUND", "Banka/kasa hesabı bulunamadı.");
  const type = String(body.accountType ?? current.account_type).toUpperCase() === "CASH" ? "CASH" : "BANK";
  const name = text(body.name ?? current.name);
  if (!name) return fail(c, 400, "ACCOUNT_NAME_REQUIRED", "Hesap adı zorunludur.");
  await c.env.DB.prepare(`UPDATE accounting_financial_accounts SET account_type=?,name=?,bank_name=?,iban=?,currency=?,opening_balance=?,is_active=?,note=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(
    type, name, text(body.bankName ?? current.bank_name) || null, text(body.iban ?? current.iban).replace(/\s/g, "") || null,
    text(body.currency ?? current.currency) || "TRY", num(body.openingBalance ?? current.opening_balance),
    body.isActive === undefined ? Number(current.is_active !== 0) : (body.isActive ? 1 : 0),
    text(body.note ?? current.note) || null, now(), id, slug,
  ).run();
  return ok(c, { id });
}
async function listReconciliations(c: Context<AppEnv>) {
  await ensureWorkspaceSchema(c);
  const slug = slugOf(c), period = safePeriod(c.req.query("period"));
  const rows = await c.env.DB.prepare(`SELECT c.id AS company_id,c.name AS company_name,COALESCE(c.current_balance,0) AS erp_balance,
    COALESCE(r.status,'WAITING') AS status,r.counterparty_balance,r.difference,r.note,r.confirmed_at,r.updated_at
    FROM companies c LEFT JOIN accounting_reconciliations r
      ON r.main_company_slug=c.main_company_slug AND r.company_id=c.id AND r.period=?
    WHERE c.main_company_slug=? AND c.deleted_at IS NULL ORDER BY c.name`).bind(period, slug).all<Row>();
  return ok(c, { period, rows: rows.results || [] });
}

async function saveReconciliation(c: Context<AppEnv>) {
  await ensureWorkspaceSchema(c);
  const body = await readBody(c), slug = slugOf(c), companyId = text(body.companyId), period = safePeriod(body.period);
  if (!companyId) return fail(c, 400, "COMPANY_REQUIRED", "Mutabakat için firma seçimi zorunludur.");
  const company = await c.env.DB.prepare(`SELECT id,name,COALESCE(current_balance,0) current_balance FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`).bind(companyId, slug).first<Row>();
  if (!company) return fail(c, 404, "COMPANY_NOT_FOUND", "Firma bulunamadı.");
  const statusRaw = String(body.status || "WAITING").toUpperCase();
  const status = ["MATCHED", "DIFFERENCE"].includes(statusRaw) ? statusRaw : "WAITING";
  const erpBalance = num(company.current_balance), hasCounterparty = body.counterpartyBalance !== "" && body.counterpartyBalance != null;
  const counterpartyBalance = hasCounterparty ? num(body.counterpartyBalance) : null;
  const difference = counterpartyBalance == null ? null : counterpartyBalance - erpBalance;
  const ts = now(), id = text(body.id) || crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO accounting_reconciliations
    (id,main_company_slug,company_id,period,status,erp_balance,counterparty_balance,difference,note,confirmed_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(main_company_slug,company_id,period) DO UPDATE SET status=excluded.status,erp_balance=excluded.erp_balance,
      counterparty_balance=excluded.counterparty_balance,difference=excluded.difference,note=excluded.note,
      confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at`).bind(
    id, slug, companyId, period, status, erpBalance, counterpartyBalance, difference, text(body.note) || null,
    status === "WAITING" ? null : ts, ts, ts,
  ).run();
  return ok(c, { companyId, period, status, erpBalance, counterpartyBalance, difference });
}
async function companyWidget(c: Context<AppEnv>) {
  await ensureWorkspaceSchema(c);
  const slug = slugOf(c), companyId = text(c.req.query("companyId")), period = safePeriod(c.req.query("period"));
  if (!companyId) return fail(c, 400, "COMPANY_REQUIRED", "Firma özeti için firma seçimi zorunludur.");
  const company = await c.env.DB.prepare(`SELECT id,name,COALESCE(current_balance,0) current_balance FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`).bind(companyId, slug).first<Row>();
  if (!company) return fail(c, 404, "COMPANY_NOT_FOUND", "Firma bulunamadı.");
  const [incoming, outgoing, ledger, lastDoc, lastLedger] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) count,COALESCE(SUM(payable_total),0) total FROM accounting_documents WHERE main_company_slug=? AND party_company_id=? AND document_type='GELEN_FATURA' AND substr(COALESCE(issue_date,created_at),1,7)=? AND deleted_at IS NULL`).bind(slug, companyId, period).first<Row>(),
    c.env.DB.prepare(`SELECT COUNT(*) count,COALESCE(SUM(payable_total),0) total FROM accounting_documents WHERE main_company_slug=? AND party_company_id=? AND document_type='GIDEN_FATURA' AND substr(COALESCE(issue_date,created_at),1,7)=? AND deleted_at IS NULL`).bind(slug, companyId, period).first<Row>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN entry_type='TAHSILAT' THEN credit ELSE 0 END),0) tahsilat,COALESCE(SUM(CASE WHEN entry_type='ODEME' THEN debit ELSE 0 END),0) odeme FROM accounting_ledger_entries WHERE main_company_slug=? AND company_id=? AND substr(entry_date,1,7)=? AND deleted_at IS NULL`).bind(slug, companyId, period).first<Row>(),
    c.env.DB.prepare(`SELECT COALESCE(issue_date,created_at) date,document_no label FROM accounting_documents WHERE main_company_slug=? AND party_company_id=? AND deleted_at IS NULL ORDER BY COALESCE(issue_date,created_at) DESC LIMIT 1`).bind(slug, companyId).first<Row>(),
    c.env.DB.prepare(`SELECT entry_date date,COALESCE(description,entry_type) label FROM accounting_ledger_entries WHERE main_company_slug=? AND company_id=? AND deleted_at IS NULL ORDER BY entry_date DESC,created_at DESC LIMIT 1`).bind(slug, companyId).first<Row>(),
  ]);
  const candidates = [lastDoc, lastLedger].filter(Boolean).sort((a, b) => text(b?.date).localeCompare(text(a?.date)));
  return ok(c, {
    period, companyId, companyName: company.name, currentBalance: num(company.current_balance),
    incomingInvoiceCount: num(incoming?.count), incomingInvoiceTotal: num(incoming?.total),
    outgoingInvoiceCount: num(outgoing?.count), outgoingInvoiceTotal: num(outgoing?.total),
    collectionTotal: num(ledger?.tahsilat), paymentTotal: num(ledger?.odeme), lastOperation: candidates[0] || null,
  });
}

export function registerAccountingWorkspaceCoreRoutes(app: Hono<AppEnv>) {
  app.use("/api/muhasebe/workspace/*", enforceAccountingTenant);
  app.get("/api/muhasebe/workspace/live-state", liveState);
  app.get("/api/muhasebe/workspace/financial-accounts", listFinancialAccounts);
  app.post("/api/muhasebe/workspace/financial-accounts", createFinancialAccount);
  app.patch("/api/muhasebe/workspace/financial-accounts/:id", updateFinancialAccount);
  app.get("/api/muhasebe/workspace/reconciliations", listReconciliations);
  app.post("/api/muhasebe/workspace/reconciliations", saveReconciliation);
  app.get("/api/muhasebe/workspace/company-widget", companyWidget);
}
