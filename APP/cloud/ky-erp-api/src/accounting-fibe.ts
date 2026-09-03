import type { Context, Hono } from "hono";
import { registerAccountingQuickControlRoutes } from "./accounting-quick-control";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);
const money = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      body.mainCompanyId ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      c.req.header("X-KYERP-Tenant-Slug") ||
      "mecit-hakan",
  );
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Row : {};
  } catch {
    return {};
  }
}

function errorBody(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(table).first<Row>();
  return Boolean(row?.name);
}

async function tableColumns(c: Context<AppEnv>, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const result = await c.env.DB.prepare(`PRAGMA table_info(\"${table.replace(/\"/g, "\"\"")}\")`).all<Row>();
  return new Set((result.results || []).map((row) => text(row.name)));
}

async function companyOf(c: Context<AppEnv>, companyId: string, slug: string) {
  return c.env.DB.prepare(
    `SELECT * FROM companies
      WHERE id=? AND main_company_slug=? AND deleted_at IS NULL
      LIMIT 1`,
  ).bind(companyId, slug).first<Row>();
}

function settingsView(company: Row) {
  const openingAccrual = money(company.fibe_opening_accrual);
  const openingPaid = money(company.fibe_opening_paid);
  return {
    enabled: Number(company.fibe_enabled || 0) === 1,
    rate: money(company.fibe_rate),
    startDate: text(company.fibe_start_date),
    openingAccrual,
    openingPaid,
    openingBalance: money(openingAccrual - openingPaid),
    note: text(company.fibe_note),
  };
}

async function incomingVatTotal(c: Context<AppEnv>, slug: string, companyId: string, startDate: string) {
  const columns = await tableColumns(c, "vat_records");
  if (!columns.has("incoming_vat")) return 0;

  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  if (columns.has("main_company_slug")) {
    clauses.push("main_company_slug=?");
    bindings.push(slug);
  }
  if (columns.has("company_id") && columns.has("firm_id")) {
    clauses.push("COALESCE(NULLIF(company_id,''),firm_id)=?");
    bindings.push(companyId);
  } else if (columns.has("company_id")) {
    clauses.push("company_id=?");
    bindings.push(companyId);
  } else if (columns.has("firm_id")) {
    clauses.push("firm_id=?");
    bindings.push(companyId);
  } else {
    return 0;
  }

  if (startDate) {
    if (columns.has("date")) {
      clauses.push("substr(CAST(date AS TEXT),1,10)>=?");
      bindings.push(startDate);
    } else if (columns.has("period_year") && columns.has("period_month")) {
      const year = Number(startDate.slice(0, 4));
      const month = Number(startDate.slice(5, 7));
      if (year > 0 && month > 0) {
        clauses.push("(period_year*100+period_month)>=?");
        bindings.push(year * 100 + month);
      }
    } else if (columns.has("created_at")) {
      clauses.push("substr(CAST(created_at AS TEXT),1,10)>=?");
      bindings.push(startDate);
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(COALESCE(incoming_vat,0)),0) AS total FROM vat_records ${where}`,
  ).bind(...bindings).first<Row>();
  return money(row?.total);
}

async function movementTotals(c: Context<AppEnv>, slug: string, companyId: string) {
  if (!(await tableExists(c, "accounting_fibe_movements"))) {
    return { accrualNet: 0, paidNet: 0 };
  }
  const result = await c.env.DB.prepare(
    `SELECT movement_type, COALESCE(SUM(amount),0) AS total
       FROM accounting_fibe_movements
      WHERE main_company_slug=? AND company_id=? AND deleted_at IS NULL
      GROUP BY movement_type`,
  ).bind(slug, companyId).all<Row>();

  let accrualNet = 0;
  let paidNet = 0;
  for (const row of result.results || []) {
    const amount = num(row.total);
    switch (upper(row.movement_type)) {
      case "ACCRUAL": accrualNet += amount; break;
      case "ACCRUAL_REVERSAL": accrualNet -= amount; break;
      case "PAYMENT": paidNet += amount; break;
      case "PAYMENT_REVERSAL": paidNet -= amount; break;
      default: break;
    }
  }
  return { accrualNet: money(accrualNet), paidNet: money(paidNet) };
}

async function summaryOf(c: Context<AppEnv>, company: Row, slug: string) {
  const settings = settingsView(company);
  const vatTotal = settings.enabled
    ? await incomingVatTotal(c, slug, text(company.id), settings.startDate)
    : 0;
  const movement = await movementTotals(c, slug, text(company.id));
  const automaticAccrual = settings.enabled ? money(vatTotal * settings.rate / 100) : 0;
  const totalAccrual = money(settings.openingAccrual + automaticAccrual + movement.accrualNet);
  const totalPaid = money(settings.openingPaid + movement.paidNet);
  const remainingBalance = money(totalAccrual - totalPaid);

  return {
    ...settings,
    incomingVatTotal: vatTotal,
    automaticAccrual,
    manualAccrualNet: movement.accrualNet,
    movementPaidNet: movement.paidNet,
    totalAccrual,
    totalPaid,
    remainingBalance,
    payableBalance: Math.max(remainingBalance, 0),
    overpaidBalance: Math.max(-remainingBalance, 0),
  };
}

async function movementsOf(c: Context<AppEnv>, slug: string, companyId: string, limit = 500) {
  if (!(await tableExists(c, "accounting_fibe_movements"))) return [];
  const result = await c.env.DB.prepare(
    `SELECT * FROM accounting_fibe_movements
      WHERE main_company_slug=? AND company_id=? AND deleted_at IS NULL
      ORDER BY movement_date DESC, created_at DESC
      LIMIT ?`,
  ).bind(slug, companyId, Math.max(1, Math.min(limit, 1000))).all<Row>();
  return result.results || [];
}

async function insertInternalLedger(c: Context<AppEnv>, input: {
  slug: string;
  company: Row;
  movementId: string;
  date: string;
  movementType: string;
  amount: number;
  paymentMethod: string;
  description: string;
  note: string;
  createdBy: string;
}) {
  if (!(await tableExists(c, "accounting_ledger_entries"))) return "";
  const ledgerType = {
    PAYMENT: "FIBE_ODEME",
    PAYMENT_REVERSAL: "FIBE_ODEME_IPTAL",
    ACCRUAL: "FIBE_HAKEDIS",
    ACCRUAL_REVERSAL: "FIBE_HAKEDIS_IPTAL",
  }[input.movementType] || "FIBE_HAREKET";
  const ledgerId = crypto.randomUUID();
  const ts = nowIso();
  const isPayment = input.movementType === "PAYMENT";
  const isPaymentReversal = input.movementType === "PAYMENT_REVERSAL";
  const isAccrual = input.movementType === "ACCRUAL";

  await c.env.DB.prepare(
    `INSERT INTO accounting_ledger_entries(
       id,main_company_slug,entry_date,entry_type,record_scope,company_id,company_name,
       description,debit,credit,currency,payment_method,source_document_id,
       source_payment_plan_id,file_asset_id,note,created_by,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    ledgerId,
    input.slug,
    input.date,
    ledgerType,
    "INTERNAL",
    input.company.id,
    text(input.company.name),
    input.description || ledgerType,
    isPayment || isAccrual ? input.amount : 0,
    isPaymentReversal || input.movementType === "ACCRUAL_REVERSAL" ? input.amount : 0,
    "TRY",
    input.paymentMethod || null,
    null,
    null,
    null,
    [input.note, `FIBE hareketi: ${input.movementId}`].filter(Boolean).join(" · ") || null,
    input.createdBy || null,
    ts,
    ts,
  ).run();
  return ledgerId;
}

export function registerAccountingFibeRoutes(app: Hono<AppEnv>) {
  registerAccountingQuickControlRoutes(app);

  app.get("/api/muhasebe/fibe/:companyId", async (c) => {
    const slug = slugOf(c);
    const companyId = text(c.req.param("companyId"));
    const company = await companyOf(c, companyId, slug);
    if (!company) return c.json(errorBody("COMPANY_NOT_FOUND", "Firma kartı bulunamadı."), 404);
    const summary = await summaryOf(c, company, slug);
    const movements = await movementsOf(c, slug, companyId, Number(c.req.query("limit") || 500));
    return c.json({
      ok: true,
      success: true,
      data: {
        companyId,
        companyName: text(company.name),
        summary,
        movements,
      },
    });
  });

  app.post("/api/muhasebe/fibe/:companyId/hareketler", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const companyId = text(c.req.param("companyId"));
    const company = await companyOf(c, companyId, slug);
    if (!company) return c.json(errorBody("COMPANY_NOT_FOUND", "Firma kartı bulunamadı."), 404);
    if (Number(company.fibe_enabled || 0) !== 1) {
      return c.json(errorBody("FIBE_DISABLED", "Bu firma için FİBE takibi açık değil."), 409);
    }

    const movementType = upper(body.movementType || body.type || "PAYMENT");
    const allowed = new Set(["PAYMENT", "PAYMENT_REVERSAL", "ACCRUAL", "ACCRUAL_REVERSAL"]);
    if (!allowed.has(movementType)) {
      return c.json(errorBody("INVALID_FIBE_MOVEMENT", "FİBE hareket türü geçersiz."), 400);
    }
    const amount = money(body.amount);
    if (!(amount > 0)) {
      return c.json(errorBody("AMOUNT_REQUIRED", "FİBE hareket tutarı sıfırdan büyük olmalıdır."), 400);
    }
    const movementDate = text(body.date || body.movementDate) || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) {
      return c.json(errorBody("INVALID_DATE", "FİBE tarihi YYYY-AA-GG formatında olmalıdır."), 400);
    }
    const paymentMethod = upper(body.paymentMethod || body.method);
    if (["PAYMENT", "PAYMENT_REVERSAL"].includes(movementType) && !paymentMethod) {
      return c.json(errorBody("PAYMENT_METHOD_REQUIRED", "FİBE ödemesinde ödeme şekli zorunludur."), 400);
    }

    const movementId = crypto.randomUUID();
    const ts = nowIso();
    const description = text(body.description) || {
      PAYMENT: "FİBE ödemesi",
      PAYMENT_REVERSAL: "FİBE ödeme düzeltmesi",
      ACCRUAL: "FİBE ek hakediş",
      ACCRUAL_REVERSAL: "FİBE hakediş düzeltmesi",
    }[movementType] || "FİBE hareketi";
    const note = text(body.note);
    const createdBy = text(body.createdBy || body.actor);

    await c.env.DB.prepare(
      `INSERT INTO accounting_fibe_movements(
         id,main_company_slug,company_id,movement_date,movement_type,amount,payment_method,
         source_document_id,source_type,description,note,created_by,created_at,updated_at,deleted_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
    ).bind(
      movementId,
      slug,
      companyId,
      movementDate,
      movementType,
      amount,
      paymentMethod || null,
      text(body.sourceDocumentId) || null,
      text(body.sourceType) || "MANUAL",
      description,
      note || null,
      createdBy || null,
      ts,
      ts,
    ).run();

    let ledgerEntryId = "";
    try {
      ledgerEntryId = await insertInternalLedger(c, {
        slug,
        company,
        movementId,
        date: movementDate,
        movementType,
        amount,
        paymentMethod,
        description,
        note,
        createdBy,
      });
    } catch {
      // FIBE ana kaydı korunur; iç defter kopyası yardımcı kayıttır.
    }

    return c.json({
      ok: true,
      success: true,
      data: {
        id: movementId,
        ledgerEntryId: ledgerEntryId || null,
        summary: await summaryOf(c, company, slug),
      },
    }, 201);
  });
}
