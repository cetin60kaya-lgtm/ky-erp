import type { Context, Hono } from "hono";
import { registerAccountingFibeRoutes } from "./accounting-fibe";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const numberValue = (value: unknown, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (value: unknown, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["0", "FALSE", "HAYIR", "NO", "OFF"].includes(upper(value));
};
const normalize = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const nowIso = () => new Date().toISOString();
const validEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const data = await c.req.json();
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Row) : {};
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

async function companyOf(c: Context<AppEnv>, id: string, slug: string) {
  return c.env.DB.prepare(
    `SELECT * FROM companies
      WHERE id = ?
        AND main_company_slug = ?
        AND deleted_at IS NULL
      LIMIT 1`,
  )
    .bind(id, slug)
    .first<Row>();
}

async function fibeIncomingVatTotal(
  c: Context<AppEnv>,
  slug: string,
  companyId: string,
  startDate: string,
  beforeDate = "",
) {
  if (!startDate) return 0;
  const beforeClause = beforeDate ? " AND substr(CAST(date AS TEXT),1,10) < ?" : "";
  const statement = c.env.DB.prepare(
    `SELECT COALESCE(SUM(COALESCE(incoming_vat,0)),0) AS total
       FROM vat_records
      WHERE main_company_slug=?
        AND COALESCE(NULLIF(company_id,''),firm_id)=?
        AND substr(CAST(date AS TEXT),1,10) >= ?${beforeClause}`,
  );
  const row = beforeDate
    ? await statement.bind(slug, companyId, startDate, beforeDate).first<Row>()
    : await statement.bind(slug, companyId, startDate).first<Row>();
  return numberValue(row?.total, 0);
}

async function fibeMovementCount(c: Context<AppEnv>, slug: string, companyId: string) {
  const exists = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='accounting_fibe_movements' LIMIT 1",
  ).first<Row>();
  if (!exists?.name) return 0;
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM accounting_fibe_movements
      WHERE main_company_slug=? AND company_id=? AND deleted_at IS NULL`,
  ).bind(slug, companyId).first<Row>();
  return Number(row?.total || 0);
}

function roleOf(row: Row) {
  const value = upper(row.company_type || row.type);
  if (value === "BOTH") return "BOTH";
  if (["CUSTOMER", "MUSTERI", "MÜŞTERİ"].includes(value)) return "CUSTOMER";
  return "SUPPLIER";
}

function profileView(row: Row, aliasCount = 0) {
  const role = roleOf(row);
  const fibeOpeningAccrual = Number(row.fibe_opening_accrual || 0);
  const fibeOpeningPaid = Number(row.fibe_opening_paid || 0);
  return {
    id: text(row.id),
    companyName: text(row.name),
    companyType: role,
    supplierDebtTracking:
      role !== "CUSTOMER" && Number(row.supplier_debt_tracking || 0) === 1,
    customerReceivableTracking:
      role !== "SUPPLIER" && Number(row.customer_receivable_tracking || 0) === 1,
    paymentMode: upper(row.payment_mode || "CASH") === "CREDIT" ? "CREDIT" : "CASH",
    vatTrackingEnabled: Number(row.vat_tracking_enabled ?? 1) !== 0,
    expenseCategory: text(row.expense_category),
    defaultRecordType: text(row.default_record_type || "RESMI"),
    taxNo: text(row.tax_no),
    taxOffice: text(row.tax_office),
    phone: text(row.phone),
    email: text(row.email),
    address: text(row.address),
    note: text(row.note),
    fibeEnabled: Number(row.fibe_enabled || 0) === 1,
    fibeRate: Number(row.fibe_rate || 0),
    fibeStartDate: text(row.fibe_start_date),
    fibeOpeningAccrual,
    fibeOpeningPaid,
    fibeOpeningBalance: fibeOpeningAccrual - fibeOpeningPaid,
    fibeNote: text(row.fibe_note),
    aliasCount,
    accountingMode:
      role === "SUPPLIER" && Number(row.supplier_debt_tracking || 0) === 1
        ? "SUPPLIER_CARI"
        : role === "CUSTOMER" && Number(row.customer_receivable_tracking || 0) === 1
          ? "CUSTOMER_CARI"
          : role === "BOTH"
            ? "BOTH"
            : "CASH_ONLY",
  };
}

async function aliasesOf(c: Context<AppEnv>, companyId: string, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT id, company_id, raw_name, normalized_name, tax_no, source, is_active, created_at, updated_at
       FROM company_aliases
      WHERE main_company_slug = ?
        AND company_id = ?
        AND deleted_at IS NULL
      ORDER BY raw_name COLLATE NOCASE ASC`,
  )
    .bind(slug, companyId)
    .all<Row>();
  return result.results || [];
}

function jsonObject(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Row) : {};
  } catch {
    return {};
  }
}

function documentIdentity(row: Row) {
  const raw = { ...jsonObject(row.metadata), ...jsonObject(row.raw) };
  const name = text(
    raw.companyName ||
      raw.supplierName ||
      raw.customerName ||
      raw.firma ||
      raw.firmaAdi ||
      raw.senderName ||
      raw.receiverName,
  );
  const taxNo = text(
    raw.taxNo ||
      raw.supplierTaxNo ||
      raw.customerTaxNo ||
      raw.vkn ||
      raw.vergiNo ||
      raw.taxNumber,
  );
  return { name, taxNo };
}

async function rematchPendingDocuments(
  c: Context<AppEnv>,
  company: Row,
  aliases: Row[],
  slug: string,
) {
  const result = await c.env.DB.prepare(
    `SELECT id, metadata, raw
       FROM documents
      WHERE main_company_slug = ?
        AND (company_id IS NULL OR company_id = '')
      ORDER BY created_at DESC
      LIMIT 2000`,
  )
    .bind(slug)
    .all<Row>();
  const names = new Set([
    normalize(company.name),
    ...aliases.map((row) => normalize(row.raw_name)),
    ...aliases.map((row) => normalize(row.normalized_name)),
  ].filter(Boolean));
  const taxNos = new Set([
    text(company.tax_no),
    ...aliases.map((row) => text(row.tax_no)),
  ].filter(Boolean));
  let matched = 0;
  for (const row of result.results || []) {
    const identity = documentIdentity(row);
    const nameMatched = identity.name && names.has(normalize(identity.name));
    const taxMatched = identity.taxNo && taxNos.has(identity.taxNo);
    if (!nameMatched && !taxMatched) continue;
    await c.env.DB.prepare(
      `UPDATE documents
          SET company_id = ?, firm_match_status = 'MATCHED', updated_at = ?
        WHERE id = ? AND main_company_slug = ?`,
    )
      .bind(company.id, nowIso(), row.id, slug)
      .run();
    matched += 1;
  }
  return matched;
}

export function registerAccountingCompanyProfileRoutes(app: Hono<AppEnv>) {
  registerAccountingFibeRoutes(app);

  app.get("/api/muhasebe/firma-profilleri", async (c) => {
    const slug = slugOf(c);
    const result = await c.env.DB.prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM company_aliases a
                WHERE a.main_company_slug = c.main_company_slug
                  AND a.company_id = c.id
                  AND a.deleted_at IS NULL) AS alias_count
         FROM companies c
        WHERE c.main_company_slug = ?
          AND c.deleted_at IS NULL
        ORDER BY c.name COLLATE NOCASE ASC`,
    )
      .bind(slug)
      .all<Row>();
    return c.json({
      ok: true,
      success: true,
      data: (result.results || []).map((row) => profileView(row, Number(row.alias_count || 0))),
    });
  });

  app.get("/api/muhasebe/firma-profilleri/:id", async (c) => {
    const slug = slugOf(c);
    const row = await companyOf(c, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Firma bulunamadı."), 404);
    const aliases = await aliasesOf(c, text(row.id), slug);
    return c.json({ ok: true, success: true, data: { ...profileView(row, aliases.length), aliases } });
  });

  app.patch("/api/muhasebe/firma-profilleri/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const row = await companyOf(c, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Firma bulunamadı."), 404);

    const email = body.email === undefined ? text(row.email) : text(body.email).toLocaleLowerCase("tr-TR");
    if (!validEmail(email)) {
      return c.json(errorBody("INVALID_EMAIL", "Geçerli bir firma e-posta adresi girin."), 400);
    }

    const requestedRole = upper(body.companyType || row.company_type || row.type);
    const role = requestedRole === "BOTH"
      ? "BOTH"
      : ["CUSTOMER", "MUSTERI", "MÜŞTERİ"].includes(requestedRole)
        ? "CUSTOMER"
        : "SUPPLIER";
    const paymentMode = upper(body.paymentMode || row.payment_mode || "CASH") === "CREDIT"
      ? "CREDIT"
      : "CASH";
    const supplierDebtTracking =
      role !== "CUSTOMER" &&
      paymentMode === "CREDIT" &&
      bool(body.supplierDebtTracking, Number(row.supplier_debt_tracking || 0) === 1);
    const customerReceivableTracking =
      role !== "SUPPLIER" &&
      bool(body.customerReceivableTracking, Number(row.customer_receivable_tracking || 0) === 1);
    const vatTrackingEnabled = bool(
      body.vatTrackingEnabled,
      Number(row.vat_tracking_enabled ?? 1) !== 0,
    );
    const defaultRecordType = upper(body.defaultRecordType || row.default_record_type || "RESMI").includes("GAYRI")
      ? "GAYRI_RESMI"
      : "RESMI";
    const phone = body.phone === undefined ? text(row.phone) : text(body.phone);
    const address = body.address === undefined ? text(row.address) : text(body.address);
    const note = body.note === undefined ? text(row.note) : text(body.note);

    const oldFibeEnabled = Number(row.fibe_enabled || 0) === 1;
    const oldFibeRate = numberValue(row.fibe_rate, 0);
    const oldFibeStartDate = text(row.fibe_start_date);
    const fibeEnabled = bool(body.fibeEnabled, oldFibeEnabled);
    const fibeRate = numberValue(body.fibeRate, oldFibeRate);
    if (fibeRate < 0 || fibeRate > 100) {
      return c.json(errorBody("INVALID_FIBE_RATE", "FİBE oranı 0 ile 100 arasında olmalıdır."), 400);
    }
    const requestedFibeStartDate = body.fibeStartDate === undefined ? oldFibeStartDate : text(body.fibeStartDate);
    let fibeStartDate = requestedFibeStartDate || (fibeEnabled ? nowIso().slice(0, 10) : "");
    if (!validDate(fibeStartDate)) {
      return c.json(errorBody("INVALID_FIBE_START_DATE", "FİBE başlangıç tarihi YYYY-AA-GG formatında olmalıdır."), 400);
    }
    let fibeOpeningAccrual = numberValue(body.fibeOpeningAccrual, Number(row.fibe_opening_accrual || 0));
    const fibeOpeningPaid = numberValue(body.fibeOpeningPaid, Number(row.fibe_opening_paid || 0));
    if (fibeOpeningAccrual < 0 || fibeOpeningPaid < 0) {
      return c.json(errorBody("INVALID_FIBE_OPENING", "FİBE başlangıç hakedişi ve ödeneni negatif olamaz."), 400);
    }
    const rateChanged = oldFibeEnabled && fibeEnabled && Math.abs(fibeRate - oldFibeRate) > 0.000001;
    if (rateChanged) {
      const effectiveDate = nowIso().slice(0, 10);
      if (oldFibeStartDate && oldFibeStartDate < effectiveDate) {
        const previousVat = await fibeIncomingVatTotal(c, slug, text(row.id), oldFibeStartDate, effectiveDate);
        const frozenAccrual = Math.round((previousVat * oldFibeRate / 100 + Number.EPSILON) * 100) / 100;
        fibeOpeningAccrual = Math.round((fibeOpeningAccrual + frozenAccrual + Number.EPSILON) * 100) / 100;
      }
      fibeStartDate = effectiveDate;
    } else if (oldFibeEnabled && fibeEnabled && oldFibeStartDate && fibeStartDate !== oldFibeStartDate) {
      const [referenceVat, movementCount] = await Promise.all([
        fibeIncomingVatTotal(c, slug, text(row.id), oldFibeStartDate),
        fibeMovementCount(c, slug, text(row.id)),
      ]);
      const hasHistory = referenceVat > 0 || movementCount > 0 || Number(row.fibe_opening_accrual || 0) > 0 || Number(row.fibe_opening_paid || 0) > 0;
      if (hasHistory) {
        return c.json(errorBody("FIBE_START_DATE_LOCKED", "FİBE hareketi başladıktan sonra başlangıç tarihi geriye dönük değiştirilemez. Oran değişikliği yeni dönem olarak otomatik başlatılır."), 409);
      }
    }
    const fibeNote = body.fibeNote === undefined ? text(row.fibe_note) : text(body.fibeNote);
    const timestamp = nowIso();

    await c.env.DB.prepare(
      `UPDATE companies
          SET type = ?,
              company_type = ?,
              supplier_debt_tracking = ?,
              customer_receivable_tracking = ?,
              payment_mode = ?,
              vat_tracking_enabled = ?,
              expense_category = ?,
              default_record_type = ?,
              phone = ?,
              email = ?,
              address = ?,
              note = ?,
              fibe_enabled = ?,
              fibe_rate = ?,
              fibe_start_date = ?,
              fibe_opening_accrual = ?,
              fibe_opening_paid = ?,
              fibe_note = ?,
              updated_at = ?
        WHERE id = ? AND main_company_slug = ?`,
    )
      .bind(
        role,
        role,
        supplierDebtTracking ? 1 : 0,
        customerReceivableTracking ? 1 : 0,
        paymentMode,
        vatTrackingEnabled ? 1 : 0,
        body.expenseCategory === undefined ? (text(row.expense_category) || null) : (text(body.expenseCategory) || null),
        defaultRecordType,
        phone || null,
        email || null,
        address || null,
        note || null,
        fibeEnabled ? 1 : 0,
        fibeRate,
        fibeStartDate || null,
        fibeOpeningAccrual,
        fibeOpeningPaid,
        fibeNote || null,
        timestamp,
        row.id,
        slug,
      )
      .run();

    const updated = await companyOf(c, text(row.id), slug);
    return c.json({ ok: true, success: true, data: profileView(updated || row) });
  });

  app.get("/api/muhasebe/firma-profilleri/:id/aliases", async (c) => {
    const slug = slugOf(c);
    const row = await companyOf(c, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Firma bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: await aliasesOf(c, text(row.id), slug) });
  });

  app.post("/api/muhasebe/firma-profilleri/:id/aliases", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const company = await companyOf(c, c.req.param("id"), slug);
    if (!company) return c.json(errorBody("NOT_FOUND", "Firma bulunamadı."), 404);
    const rawName = text(body.rawName || body.alias);
    if (!rawName) return c.json(errorBody("ALIAS_REQUIRED", "Alias/firma eşleşme adı zorunludur."), 400);
    const normalizedName = normalize(rawName);
    const id = text(body.id || crypto.randomUUID());
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO company_aliases
        (id, main_company_slug, company_id, raw_name, normalized_name, is_active, source, tax_no, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 'MANUAL', ?, ?, ?)
       ON CONFLICT(main_company_slug, normalized_name)
       DO UPDATE SET company_id = excluded.company_id,
                     raw_name = excluded.raw_name,
                     is_active = 1,
                     tax_no = COALESCE(excluded.tax_no, company_aliases.tax_no),
                     deleted_at = NULL,
                     updated_at = excluded.updated_at`,
    )
      .bind(id, slug, company.id, rawName, normalizedName, text(body.taxNo) || null, timestamp, timestamp)
      .run();
    const aliases = await aliasesOf(c, text(company.id), slug);
    const matchedDocuments = await rematchPendingDocuments(c, company, aliases, slug);
    return c.json({
      ok: true,
      success: true,
      data: { aliases, matchedDocuments },
    }, 201);
  });

  app.delete("/api/muhasebe/firma-profilleri/:id/aliases/:aliasId", async (c) => {
    const slug = slugOf(c);
    const company = await companyOf(c, c.req.param("id"), slug);
    if (!company) return c.json(errorBody("NOT_FOUND", "Firma bulunamadı."), 404);
    await c.env.DB.prepare(
      `UPDATE company_aliases
          SET deleted_at = ?, is_active = 0, updated_at = ?
        WHERE id = ? AND company_id = ? AND main_company_slug = ?`,
    )
      .bind(nowIso(), nowIso(), c.req.param("aliasId"), company.id, slug)
      .run();
    return c.json({ ok: true, success: true, data: await aliasesOf(c, text(company.id), slug) });
  });
}
