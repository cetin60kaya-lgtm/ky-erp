import type { Context, Hono } from "hono";
import { registerAccountingCheckCariRoutes } from "./accounting-check-cari";

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
const roundMoney = (value: unknown) => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const nowIso = () => new Date().toISOString();

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
  return { ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function defaultWeek() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: isoDate(start), to: isoDate(end) };
}

function requestedRange(c: Context<AppEnv>) {
  const fallback = defaultWeek();
  const from = text(c.req.query("from")) || fallback.from;
  const to = text(c.req.query("to")) || fallback.to;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
  return { from, to };
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

async function insertDynamic(c: Context<AppEnv>, table: string, data: Row) {
  const columns = await tableColumns(c, table);
  const entries = Object.entries(data).filter(([key, value]) => columns.has(key) && value !== undefined);
  if (!entries.length) return;
  const names = entries.map(([key]) => `\"${key.replace(/\"/g, "\"\"")}\"`).join(",");
  const sql = `INSERT INTO \"${table}\" (${names}) VALUES (${entries.map(() => "?").join(",")})`;
  await c.env.DB.prepare(sql).bind(...entries.map(([, value]) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "object") return JSON.stringify(value);
    return value;
  })).run();
}

function rawObject(row: Row) {
  const value = row.raw;
  if (value && typeof value === "object") return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
  } catch {
    return {};
  }
}

function recordScopeOf(row: Row) {
  const raw = rawObject(row);
  const value = upper(row.record_type || raw.recordType || raw.recordScope);
  if (value.includes("GAYRI") || value === "INTERNAL" || value === "UNOFFICIAL") return "INTERNAL";
  return "OFFICIAL";
}

function paymentMethodOf(row: Row) {
  const raw = rawObject(row);
  return upper(row.payment_method || raw.paymentMethod || raw.method);
}

function transactionTypeOf(row: Row) {
  const raw = rawObject(row);
  const rawType = upper(raw.transactionType);
  if (rawType) return rawType;
  const movement = upper(row.movement_type);
  if (movement === "ODEME") return "PAYMENT";
  if (movement === "TAHSILAT") return "COLLECTION";
  if (movement === "BORC") return "DEBIT";
  if (movement === "ALACAK") return "CREDIT";
  return movement || "OTHER";
}

async function insertLedger(c: Context<AppEnv>, input: {
  slug: string;
  company: Row;
  date: string;
  type: string;
  amount: number;
  recordScope: string;
  paymentMethod: string;
  description: string;
  movementId: string;
  actor: string;
}) {
  if (!(await tableExists(c, "accounting_ledger_entries"))) return "";
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const debit = input.type === "DEBIT" || input.type === "PAYMENT" ? input.amount : 0;
  const credit = input.type === "CREDIT" || input.type === "COLLECTION" ? input.amount : 0;
  await c.env.DB.prepare(
    `INSERT INTO accounting_ledger_entries(
       id,main_company_slug,entry_date,entry_type,record_scope,company_id,company_name,
       description,debit,credit,currency,payment_method,source_document_id,
       source_payment_plan_id,file_asset_id,note,created_by,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id,
    input.slug,
    input.date,
    input.type === "PAYMENT" ? "ODEME" : input.type === "COLLECTION" ? "TAHSILAT" : input.type === "DEBIT" ? "BORC" : "ALACAK",
    input.recordScope,
    input.company.id,
    text(input.company.name),
    input.description,
    debit,
    credit,
    "TRY",
    input.paymentMethod || null,
    null,
    null,
    null,
    `Cari hareket: ${input.movementId}`,
    input.actor || null,
    timestamp,
    timestamp,
  ).run();
  return id;
}

async function companyBalance(c: Context<AppEnv>, slug: string, companyId: string) {
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(COALESCE(effect,0)),0) AS balance
       FROM current_account_movements
      WHERE main_company_slug=? AND company_id=?`,
  ).bind(slug, companyId).first<Row>();
  return roundMoney(row?.balance);
}

export function registerAccountingQuickControlRoutes(app: Hono<AppEnv>) {
  registerAccountingCheckCariRoutes(app);

  app.post("/api/muhasebe/hizli-cari/hareket", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const companyId = text(body.companyId || body.firmId);
    if (!companyId) return c.json(errorBody("COMPANY_REQUIRED", "Firma seçimi zorunludur."), 400);
    const company = await c.env.DB.prepare(
      `SELECT * FROM companies WHERE id=? AND main_company_slug=? AND deleted_at IS NULL LIMIT 1`,
    ).bind(companyId, slug).first<Row>();
    if (!company) return c.json(errorBody("COMPANY_NOT_FOUND", "Firma kartı bulunamadı."), 404);
    if (Number(company.supplier_debt_tracking || 0) !== 1 && Number(company.customer_receivable_tracking || 0) !== 1) {
      return c.json(errorBody("CARI_DISABLED", "Bu firma cari takipsiz tanımlı; normal cari hareket oluşturulamaz."), 409);
    }

    const transactionType = upper(body.transactionType || body.type);
    if (!["DEBIT", "CREDIT", "PAYMENT", "COLLECTION"].includes(transactionType)) {
      return c.json(errorBody("INVALID_TRANSACTION_TYPE", "Cari işlem türü geçersiz."), 400);
    }
    if (transactionType === "PAYMENT" && Number(company.supplier_debt_tracking || 0) !== 1) {
      return c.json(errorBody("PAYABLE_TRACKING_DISABLED", "Firmaya ödeme için tedarikçi borç takibi açık olmalıdır."), 409);
    }
    if (transactionType === "COLLECTION" && Number(company.customer_receivable_tracking || 0) !== 1) {
      return c.json(errorBody("RECEIVABLE_TRACKING_DISABLED", "Firmadan tahsilat için müşteri alacak takibi açık olmalıdır."), 409);
    }

    const amount = roundMoney(body.amount);
    if (!(amount > 0)) return c.json(errorBody("AMOUNT_REQUIRED", "İşlem tutarı sıfırdan büyük olmalıdır."), 400);
    const date = text(body.date || body.movementDate) || nowIso().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json(errorBody("INVALID_DATE", "İşlem tarihi YYYY-AA-GG formatında olmalıdır."), 400);

    const recordScope = upper(body.recordType || body.recordScope) === "RESMI" || upper(body.recordScope) === "OFFICIAL"
      ? "OFFICIAL"
      : "INTERNAL";
    const normalizedRecordType = recordScope === "OFFICIAL" ? "RESMI" : "GAYRI_RESMI";
    const paymentMethod = upper(body.paymentMethod || body.method);
    if (["PAYMENT", "COLLECTION"].includes(transactionType) && !paymentMethod) {
      return c.json(errorBody("PAYMENT_METHOD_REQUIRED", "Ödeme / tahsilatta ödeme şekli zorunludur."), 400);
    }

    const movementType = {
      DEBIT: "BORC",
      CREDIT: "ALACAK",
      PAYMENT: "ODEME",
      COLLECTION: "TAHSILAT",
    }[transactionType] || transactionType;
    const effect = transactionType === "DEBIT" || transactionType === "PAYMENT" ? amount : -amount;
    const movementId = crypto.randomUUID();
    const timestamp = nowIso();
    const previousBalance = await companyBalance(c, slug, companyId);
    const balanceAfter = roundMoney(previousBalance + effect);
    const description = text(body.description) || movementType;
    const actor = text(body.actor || body.createdBy || "USER");

    await insertDynamic(c, "current_account_movements", {
      id: movementId,
      main_company_slug: slug,
      company_id: companyId,
      movement_date: date,
      movement_type: movementType,
      source_type: ["PAYMENT", "COLLECTION"].includes(transactionType) ? "PAYMENT" : "MANUAL",
      document_no: text(body.documentNo) || movementId,
      description,
      debit: transactionType === "DEBIT" || transactionType === "PAYMENT" ? amount : 0,
      credit: transactionType === "CREDIT" || transactionType === "COLLECTION" ? amount : 0,
      amount,
      effect,
      balance_after: balanceAfter,
      record_type: normalizedRecordType,
      payment_method: paymentMethod || null,
      raw: {
        transactionType,
        recordType: normalizedRecordType,
        recordScope,
        paymentMethod: paymentMethod || null,
        actor,
      },
      created_at: timestamp,
      updated_at: timestamp,
    });

    const recalculated = await companyBalance(c, slug, companyId);
    await c.env.DB.prepare(
      `UPDATE companies SET current_balance=?,updated_at=? WHERE id=? AND main_company_slug=?`,
    ).bind(recalculated, timestamp, companyId, slug).run();

    let ledgerEntryId = "";
    try {
      ledgerEntryId = await insertLedger(c, {
        slug,
        company,
        date,
        type: transactionType,
        amount,
        recordScope,
        paymentMethod,
        description,
        movementId,
        actor,
      });
    } catch {
      // Ana cari hareket basariliysa yardimci defter kopyasi hatasi cari bakiyeyi bozmaz.
    }

    return c.json({
      ok: true,
      success: true,
      data: { id: movementId, companyId, transactionType, amount, balanceAfter: recalculated, ledgerEntryId: ledgerEntryId || null },
    }, 201);
  });

  app.get("/api/muhasebe/hizli-cari/hafta", async (c) => {
    const slug = slugOf(c);
    const range = requestedRange(c);
    if (!range) return c.json(errorBody("INVALID_RANGE", "Haftalık tarih aralığı geçersiz."), 400);

    const companyRows = await c.env.DB.prepare(
      `SELECT id,name,company_type,type,current_balance,supplier_debt_tracking,customer_receivable_tracking,
              fibe_enabled,fibe_rate,fibe_start_date,fibe_opening_accrual,fibe_opening_paid,is_active
         FROM companies
        WHERE main_company_slug=? AND deleted_at IS NULL
        ORDER BY ABS(COALESCE(current_balance,0)) DESC,name COLLATE NOCASE ASC`,
    ).bind(slug).all<Row>();

    const movementRows = await c.env.DB.prepare(
      `SELECT m.*,c.name AS company_name
         FROM current_account_movements m
         LEFT JOIN companies c ON c.id=m.company_id AND c.main_company_slug=m.main_company_slug
        WHERE m.main_company_slug=?
          AND substr(CAST(m.movement_date AS TEXT),1,10) BETWEEN ? AND ?
        ORDER BY m.movement_date DESC,m.created_at DESC
        LIMIT 1000`,
    ).bind(slug, range.from, range.to).all<Row>();

    let fibeResults: Row[] = [];
    if (await tableExists(c, "accounting_fibe_movements")) {
      const fibeRows = await c.env.DB.prepare(
        `SELECT f.*,c.name AS company_name
           FROM accounting_fibe_movements f
           LEFT JOIN companies c ON c.id=f.company_id AND c.main_company_slug=f.main_company_slug
          WHERE f.main_company_slug=? AND f.deleted_at IS NULL
            AND substr(CAST(f.movement_date AS TEXT),1,10) BETWEEN ? AND ?
          ORDER BY f.movement_date DESC,f.created_at DESC
          LIMIT 1000`,
      ).bind(slug, range.from, range.to).all<Row>();
      fibeResults = fibeRows.results || [];
    }

    const normalMovements = (movementRows.results || []).map((row) => {
      const transactionType = transactionTypeOf(row);
      const method = paymentMethodOf(row);
      const recordScope = recordScopeOf(row);
      return {
        id: text(row.id),
        source: "CARI",
        companyId: text(row.company_id),
        companyName: text(row.company_name),
        date: text(row.movement_date).slice(0, 10),
        transactionType,
        movementType: text(row.movement_type),
        amount: roundMoney(row.amount || Math.max(num(row.debit), num(row.credit))),
        debit: roundMoney(row.debit),
        credit: roundMoney(row.credit),
        balanceAfter: roundMoney(row.balance_after),
        recordScope,
        paymentMethod: method,
        description: text(row.description),
      };
    });

    const fibeMovements = fibeResults.map((row: Row) => ({
      id: text(row.id),
      source: "FIBE",
      companyId: text(row.company_id),
      companyName: text(row.company_name),
      date: text(row.movement_date).slice(0, 10),
      transactionType: upper(row.movement_type),
      movementType: text(row.movement_type),
      amount: roundMoney(row.amount),
      debit: upper(row.movement_type) === "PAYMENT" ? roundMoney(row.amount) : 0,
      credit: upper(row.movement_type) === "PAYMENT_REVERSAL" ? roundMoney(row.amount) : 0,
      balanceAfter: null,
      recordScope: "INTERNAL",
      paymentMethod: upper(row.payment_method),
      description: text(row.description),
    }));

    const allMovements = [...normalMovements, ...fibeMovements]
      .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));
    const normalPayable = (companyRows.results || [])
      .filter((row) => num(row.current_balance) < 0)
      .reduce((sum, row) => sum + Math.abs(num(row.current_balance)), 0);
    const normalReceivable = (companyRows.results || [])
      .filter((row) => num(row.current_balance) > 0)
      .reduce((sum, row) => sum + num(row.current_balance), 0);
    const incoming = allMovements
      .filter((row) => row.source === "CARI" && row.transactionType === "COLLECTION")
      .reduce((sum, row) => sum + row.amount, 0);
    const outgoing = allMovements
      .filter((row) => (row.source === "CARI" && row.transactionType === "PAYMENT") || (row.source === "FIBE" && row.transactionType === "PAYMENT"))
      .reduce((sum, row) => sum + row.amount, 0);
    const cashOutgoing = allMovements
      .filter((row) => row.paymentMethod === "CASH" && ((row.source === "CARI" && row.transactionType === "PAYMENT") || (row.source === "FIBE" && row.transactionType === "PAYMENT")))
      .reduce((sum, row) => sum + row.amount, 0);
    const officialFlow = allMovements
      .filter((row) => row.recordScope === "OFFICIAL")
      .reduce((sum, row) => sum + row.amount, 0);
    const internalFlow = allMovements
      .filter((row) => row.recordScope === "INTERNAL")
      .reduce((sum, row) => sum + row.amount, 0);

    return c.json({
      ok: true,
      success: true,
      data: {
        range,
        summary: {
          normalPayable: roundMoney(normalPayable),
          normalReceivable: roundMoney(normalReceivable),
          incoming: roundMoney(incoming),
          outgoing: roundMoney(outgoing),
          cashOutgoing: roundMoney(cashOutgoing),
          officialFlow: roundMoney(officialFlow),
          internalFlow: roundMoney(internalFlow),
        },
        debts: (companyRows.results || []).filter((row) => num(row.current_balance) < 0).map((row) => ({ id: row.id, name: row.name, balance: roundMoney(row.current_balance) })),
        receivables: (companyRows.results || []).filter((row) => num(row.current_balance) > 0).map((row) => ({ id: row.id, name: row.name, balance: roundMoney(row.current_balance) })),
        movements: allMovements,
      },
    });
  });
}
