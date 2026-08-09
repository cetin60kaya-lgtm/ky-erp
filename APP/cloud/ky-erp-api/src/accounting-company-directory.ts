import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      body.mainCompanyId ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch {
    return {};
  }
}

function roleOf(value: unknown) {
  const role = upper(value);
  if (role === "BOTH") return "BOTH";
  if (["CUSTOMER", "MUSTERI", "MÜŞTERİ"].includes(role)) return "CUSTOMER";
  return "SUPPLIER";
}

function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["0", "FALSE", "HAYIR", "NO", "OFF"].includes(upper(value));
}

function errorBody(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function tableColumns(c: Context<AppEnv>, table: string) {
  const result = await c.env.DB.prepare(
    `PRAGMA table_info(${quoteIdentifier(table)})`,
  ).all<Row>();
  return new Set((result.results || []).map((row) => text(row.name)));
}

async function companyReferences(c: Context<AppEnv>, companyId: string, slug: string) {
  const tables = await c.env.DB.prepare(
    `SELECT name
       FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE '_cf_%'`,
  ).all<Row>();
  const referenceColumns = new Set([
    "company_id",
    "firm_id",
    "customer_company_id",
    "supplier_company_id",
    "buyer_company_id",
    "seller_company_id",
  ]);
  const ownedMetadataTables = new Set(["company_aliases"]);
  const blockers: Array<{ table: string; column: string; count: number }> = [];

  for (const row of tables.results || []) {
    const table = text(row.name);
    if (!table || table === "companies" || ownedMetadataTables.has(table)) continue;
    const columns = await tableColumns(c, table);
    const matchedColumns = [...referenceColumns].filter((column) => columns.has(column));
    for (const column of matchedColumns) {
      const scoped = columns.has("main_company_slug");
      const countRow = await c.env.DB.prepare(
        `SELECT COUNT(*) AS total
           FROM ${quoteIdentifier(table)}
          WHERE ${quoteIdentifier(column)} = ?${scoped ? " AND main_company_slug = ?" : ""}`,
      )
        .bind(...(scoped ? [companyId, slug] : [companyId]))
        .first<Row>();
      const count = Number(countRow?.total || 0);
      if (count > 0) blockers.push({ table, column, count });
    }
  }
  return blockers;
}

export function registerAccountingCompanyDirectoryRoutes(app: Hono<AppEnv>) {
  app.post("/api/muhasebe/firmalar", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const companyName = text(body.companyName || body.firmaAdi || body.name);
    if (!companyName) {
      return c.json(errorBody("COMPANY_NAME_REQUIRED", "Firma adı zorunludur."), 400);
    }

    const normalizedName = normalize(companyName);
    const taxNo = text(body.taxNo || body.tax_no).replace(/\s+/g, "");
    const existing = await c.env.DB.prepare(
      `SELECT id, name
         FROM companies
        WHERE main_company_slug = ?
          AND deleted_at IS NULL
          AND (
            normalized_name = ?
            OR UPPER(name) = UPPER(?)
            OR (? <> '' AND COALESCE(tax_no, '') = ?)
          )
        LIMIT 1`,
    )
      .bind(slug, normalizedName, companyName, taxNo, taxNo)
      .first<Row>();
    if (existing?.id) {
      return c.json(
        errorBody("COMPANY_ALREADY_EXISTS", `${text(existing.name) || companyName} firma kartı zaten var.`),
        409,
      );
    }

    const role = roleOf(body.companyType || body.type);
    const defaultRecordType = upper(body.defaultRecordType || body.recordType).includes("GAYRI")
      ? "GAYRI_RESMI"
      : "RESMI";
    const paymentMode = role === "CUSTOMER"
      ? "CASH"
      : upper(body.paymentMode) === "CREDIT"
        ? "CREDIT"
        : "CASH";
    const supplierDebtTracking =
      role !== "CUSTOMER" &&
      paymentMode === "CREDIT" &&
      booleanValue(body.supplierDebtTracking, false);
    const customerReceivableTracking =
      role !== "SUPPLIER" &&
      booleanValue(body.customerReceivableTracking, true);
    const vatTrackingEnabled =
      defaultRecordType === "RESMI" && booleanValue(body.vatTrackingEnabled, true);

    const id = text(body.id) || crypto.randomUUID();
    const timestamp = nowIso();
    await c.env.DB.prepare(
      `INSERT INTO companies (
        id, main_company_slug, name, normalized_name, company_type, type,
        tax_no, tax_office, phone, email, address,
        current_balance, opening_balance, default_record_type, note, is_active,
        supplier_debt_tracking, customer_receivable_tracking, payment_mode,
        vat_tracking_enabled, expense_category, created_at, updated_at, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        0, 0, ?, ?, 1,
        ?, ?, ?, ?, ?, ?, ?, NULL
      )`,
    )
      .bind(
        id,
        slug,
        companyName,
        normalizedName,
        role,
        role,
        taxNo || null,
        text(body.taxOffice || body.tax_office) || null,
        text(body.phone) || null,
        text(body.email) || null,
        text(body.address) || null,
        defaultRecordType,
        text(body.note) || null,
        supplierDebtTracking ? 1 : 0,
        customerReceivableTracking ? 1 : 0,
        paymentMode,
        vatTrackingEnabled ? 1 : 0,
        text(body.expenseCategory) || null,
        timestamp,
        timestamp,
      )
      .run();

    await c.env.DB.prepare(
      `INSERT INTO company_aliases (
        id, main_company_slug, company_id, raw_name, normalized_name,
        is_active, source, tax_no, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, 1, 'MANUAL', ?, ?, ?, NULL)
      ON CONFLICT(main_company_slug, normalized_name)
      DO UPDATE SET
        company_id = excluded.company_id,
        raw_name = excluded.raw_name,
        is_active = 1,
        tax_no = COALESCE(excluded.tax_no, company_aliases.tax_no),
        deleted_at = NULL,
        updated_at = excluded.updated_at`,
    )
      .bind(
        crypto.randomUUID(),
        slug,
        id,
        companyName,
        normalizedName,
        taxNo || null,
        timestamp,
        timestamp,
      )
      .run();

    return c.json({
      ok: true,
      success: true,
      data: {
        id,
        firmaAdi: companyName,
        companyName,
        companyType: role,
        type: role,
        defaultRecordType,
        paymentMode,
        supplierDebtTracking,
        customerReceivableTracking,
        vatTrackingEnabled,
        expenseCategory: text(body.expenseCategory),
        taxNo,
        taxOffice: text(body.taxOffice || body.tax_office),
        phone: text(body.phone),
        email: text(body.email),
        address: text(body.address),
        note: text(body.note),
        currentBalance: 0,
        openingBalance: 0,
        aliasCount: 1,
        isActive: true,
      },
    }, 201);
  });

  app.delete("/api/muhasebe/firmalar/:id", async (c) => {
    const slug = slugOf(c);
    const companyId = text(c.req.param("id"));
    const company = await c.env.DB.prepare(
      `SELECT id, name, current_balance, opening_balance
         FROM companies
        WHERE id = ?
          AND main_company_slug = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(companyId, slug)
      .first<Row>();
    if (!company) {
      return c.json(errorBody("COMPANY_NOT_FOUND", "Firma kartı bulunamadı."), 404);
    }

    const balance = Number(company.current_balance || 0);
    const openingBalance = Number(company.opening_balance || 0);
    if (Math.abs(balance) > 0.00001 || Math.abs(openingBalance) > 0.00001) {
      return c.json(
        errorBody(
          "COMPANY_HAS_BALANCE",
          "Bu firmanın bakiyesi var. Kesin silmeden önce bakiyeyi kapatın.",
          { balance, openingBalance },
        ),
        409,
      );
    }

    const blockers = await companyReferences(c, companyId, slug);
    if (blockers.length) {
      return c.json(
        errorBody(
          "COMPANY_HAS_LINKED_RECORDS",
          "Bu firma kartına bağlı belge, cari hareket, model veya başka işlem kaydı var. Veri kaybını önlemek için kesin silme engellendi.",
          { blockers },
        ),
        409,
      );
    }

    await c.env.DB.prepare(
      `DELETE FROM company_aliases
        WHERE company_id = ? AND main_company_slug = ?`,
    )
      .bind(companyId, slug)
      .run();
    await c.env.DB.prepare(
      `DELETE FROM companies
        WHERE id = ? AND main_company_slug = ?`,
    )
      .bind(companyId, slug)
      .run();

    return c.json({
      ok: true,
      success: true,
      data: {
        id: companyId,
        companyName: text(company.name),
        deletedPermanently: true,
        deletedAt: nowIso(),
      },
    });
  });
}
