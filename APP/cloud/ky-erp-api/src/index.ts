import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { registerAuthManagementRoutes } from "./auth-cloud";
import { buildCanonicalAccountingReport, registerCanonicalAccountingReportRoutes } from "./accounting-report-canonical";
import { canonicalAccountingDocumentDetail, listCanonicalAccountingDocuments, mergeCanonicalLegacyAccounting } from "./accounting-canonical-read";
import { ensureAccountingCanonicalReportControls0046 } from "./runtime-migration-0046";
import { ensureMailCommunicationCore0050 } from "./runtime-migration-0050";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type DatabaseRow = Record<string, any>;
type QueryFilter = {
  column: string;
  value: string | number;
  operator?: "=" | ">=" | "<=" | "LIKE";
};

const app = new Hono<AppEnv>();
const columnCache = new Map<string, Set<string>>();

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

const jsonError = (code: string, message: string, details?: unknown) => ({
  ok: false as const,
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

app.use("/api/*", async (c, next) => {
  if (!c.get("requestId")) c.set("requestId", crypto.randomUUID());
  await next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.has(origin) ? origin : undefined),
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"],
    allowHeaders: ["Accept", "Authorization", "Content-Type"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    maxAge: 86400,
    credentials: true,
  }),
);

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: c.get("requestId"),
      path: c.req.path,
      message: error.message,
    }),
  );
  return c.json(
    jsonError("INTERNAL_ERROR", "Beklenmeyen bir sunucu hatası oluştu.", {
      requestId: c.get("requestId"),
    }),
    500,
  );
});

app.notFound((c) =>
  c.json(jsonError("NOT_FOUND", "Endpoint bulunamadı."), 404),
);

function positiveInt(
  value: string | undefined,
  fallback: number,
  maximum = 500,
): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return null;
  }
  return parsed;
}

function nonNegativeInt(value: string | undefined, fallback = 0): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function databaseText(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function databaseNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: unknown): string {
  return databaseText(value)
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonObject(value: unknown): DatabaseRow {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as DatabaseRow;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as DatabaseRow)
      : {};
  } catch {
    return {};
  }
}

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function requestBody(c: Context<AppEnv>): Promise<DatabaseRow> {
  try {
    const payload: unknown = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as DatabaseRow)
      : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: DatabaseRow = {}): string {
  return databaseText(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  ).trim();
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function tableColumns(c: Context<AppEnv>, table: string): Promise<Set<string>> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const result = await c.env.DB.prepare(
    `PRAGMA table_info(${quoteIdentifier(table)})`,
  ).all<{ name: string }>();
  const columns = new Set((result.results || []).map((row) => row.name));
  columnCache.set(table, columns);
  return columns;
}

async function tableExists(c: Context<AppEnv>, table: string): Promise<boolean> {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  )
    .bind(table)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

function sqlValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

async function scopedRows(
  c: Context<AppEnv>,
  table: string,
  options: {
    filters?: QueryFilter[];
    search?: { value: string; columns: string[] };
    orderBy?: string;
    limit?: number;
    offset?: number;
    includeDeleted?: boolean;
    slug?: string;
  } = {},
): Promise<DatabaseRow[]> {
  if (!(await tableExists(c, table))) return [];
  const columns = await tableColumns(c, table);
  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  const slug = options.slug ?? slugOf(c);

  if (slug && columns.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    bindings.push(slug);
  }
  if (!options.includeDeleted && columns.has("deleted_at")) {
    clauses.push("deleted_at IS NULL");
  }
  for (const filter of options.filters || []) {
    if (!columns.has(filter.column)) continue;
    clauses.push(`${quoteIdentifier(filter.column)} ${filter.operator || "="} ?`);
    bindings.push(filter.value);
  }
  const searchValue = options.search?.value?.trim();
  const searchColumns = (options.search?.columns || []).filter((column) =>
    columns.has(column),
  );
  if (searchValue && searchColumns.length) {
    clauses.push(
      `(${searchColumns
        .map((column) => `LOWER(COALESCE(${quoteIdentifier(column)}, '')) LIKE ?`)
        .join(" OR ")})`,
    );
    const term = `%${searchValue.toLocaleLowerCase("tr-TR")}%`;
    bindings.push(...searchColumns.map(() => term));
  }

  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(options.limit ?? 5000, 10000));
  const offset = Math.max(0, options.offset ?? 0);
  const orderBy = options.orderBy || (columns.has("id") ? "id DESC" : "rowid DESC");
  const query = `SELECT * FROM ${quoteIdentifier(table)}${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const result = await c.env.DB.prepare(query)
    .bind(...bindings, limit, offset)
    .all<DatabaseRow>();
  return result.results || [];
}

async function scopedCount(
  c: Context<AppEnv>,
  table: string,
  options: {
    filters?: QueryFilter[];
    search?: { value: string; columns: string[] };
    slug?: string;
  } = {},
): Promise<number> {
  if (!(await tableExists(c, table))) return 0;
  const columns = await tableColumns(c, table);
  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  const slug = options.slug ?? slugOf(c);
  if (slug && columns.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    bindings.push(slug);
  }
  if (columns.has("deleted_at")) clauses.push("deleted_at IS NULL");
  for (const filter of options.filters || []) {
    if (!columns.has(filter.column)) continue;
    clauses.push(`${quoteIdentifier(filter.column)} ${filter.operator || "="} ?`);
    bindings.push(filter.value);
  }
  const searchValue = options.search?.value?.trim();
  const searchColumns = (options.search?.columns || []).filter((column) =>
    columns.has(column),
  );
  if (searchValue && searchColumns.length) {
    clauses.push(
      `(${searchColumns
        .map((column) => `LOWER(COALESCE(${quoteIdentifier(column)}, '')) LIKE ?`)
        .join(" OR ")})`,
    );
    const term = `%${searchValue.toLocaleLowerCase("tr-TR")}%`;
    bindings.push(...searchColumns.map(() => term));
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)}${where}`,
  )
    .bind(...bindings)
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

async function rowByIdScoped(
  c: Context<AppEnv>,
  table: string,
  id: string,
  slug = slugOf(c),
): Promise<DatabaseRow | null> {
  if (!(await tableExists(c, table))) return null;
  const columns = await tableColumns(c, table);
  if (!columns.has("id")) return null;
  const clauses = ["id = ?"];
  const bindings: Array<string | number> = [id];
  if (slug && columns.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    bindings.push(slug);
  }
  if (columns.has("deleted_at")) clauses.push("deleted_at IS NULL");
  return (
    (await c.env.DB.prepare(
      `SELECT * FROM ${quoteIdentifier(table)} WHERE ${clauses.join(" AND ")} LIMIT 1`,
    )
      .bind(...bindings)
      .first<DatabaseRow>()) || null
  );
}

async function insertDynamic(
  c: Context<AppEnv>,
  table: string,
  values: DatabaseRow,
): Promise<void> {
  const columns = await tableColumns(c, table);
  const entries = Object.entries(values).filter(
    ([key, value]) => columns.has(key) && value !== undefined,
  );
  if (!entries.length) return;
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${entries
    .map(([key]) => quoteIdentifier(key))
    .join(", ")}) VALUES (${entries.map(() => "?").join(", ")})`;
  await c.env.DB.prepare(sql)
    .bind(...entries.map(([, value]) => sqlValue(value)))
    .run();
}

async function updateDynamic(
  c: Context<AppEnv>,
  table: string,
  id: string,
  values: DatabaseRow,
  slug = slugOf(c),
): Promise<void> {
  const columns = await tableColumns(c, table);
  const entries = Object.entries(values).filter(
    ([key, value]) => key !== "id" && columns.has(key) && value !== undefined,
  );
  if (!entries.length) return;
  const clauses = ["id = ?"];
  const bindings: Array<string | number | null> = entries.map(([, value]) =>
    sqlValue(value),
  );
  bindings.push(id);
  if (slug && columns.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    bindings.push(slug);
  }
  await c.env.DB.prepare(
    `UPDATE ${quoteIdentifier(table)} SET ${entries
      .map(([key]) => `${quoteIdentifier(key)} = ?`)
      .join(", ")} WHERE ${clauses.join(" AND ")}`,
  )
    .bind(...bindings)
    .run();
}

async function listRowsEndpoint(
  c: Context<AppEnv>,
  table: string,
  options: {
    filters?: QueryFilter[];
    search?: { value: string; columns: string[] };
    orderBy?: string;
  } = {},
) {
  const limit = positiveInt(c.req.query("limit"), 100);
  const offset = nonNegativeInt(c.req.query("offset"), 0);
  if (limit === null || offset === null) {
    return c.json(
      jsonError(
        "INVALID_PAGINATION",
        "limit 1-500, offset ise 0 veya daha büyük olmalıdır.",
      ),
      400,
    );
  }
  const [data, total] = await Promise.all([
    scopedRows(c, table, { ...options, limit, offset }),
    scopedCount(c, table, options),
  ]);
  return c.json({ ok: true, data, pagination: { limit, offset, total } });
}

async function jsonStoreList(
  c: Context<AppEnv>,
  scope: string,
  slug = slugOf(c),
): Promise<Array<DatabaseRow & { storeId: string; fileName: string }>> {
  if (!(await tableExists(c, "json_store"))) return [];
  const columns = await tableColumns(c, "json_store");
  const clauses = ["scope = ?"];
  const bindings: Array<string | number> = [scope];
  if (slug && columns.has("main_company_slug")) {
    clauses.push("(main_company_slug = ? OR main_company_slug IS NULL)");
    bindings.push(slug);
  }
  const result = await c.env.DB.prepare(
    `SELECT * FROM json_store WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC, id DESC`,
  )
    .bind(...bindings)
    .all<DatabaseRow>();
  return (result.results || []).map((row) => ({
    ...jsonObject(row.data),
    storeId: databaseText(row.id),
    fileName: databaseText(row.file_name),
  }));
}

async function jsonStoreGet(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug = slugOf(c),
): Promise<(DatabaseRow & { storeId: string; fileName: string }) | null> {
  if (!(await tableExists(c, "json_store"))) return null;
  const columns = await tableColumns(c, "json_store");
  const clauses = ["scope = ?", "file_name = ?"];
  const bindings: Array<string | number> = [scope, fileName];
  if (slug && columns.has("main_company_slug")) {
    clauses.push("(main_company_slug = ? OR main_company_slug IS NULL)");
    bindings.push(slug);
  }
  const row = await c.env.DB.prepare(
    `SELECT * FROM json_store WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(...bindings)
    .first<DatabaseRow>();
  if (!row) return null;
  return {
    ...jsonObject(row.data),
    storeId: databaseText(row.id),
    fileName: databaseText(row.file_name),
  };
}

async function jsonStorePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: DatabaseRow,
  slug = slugOf(c),
): Promise<DatabaseRow> {
  if (!(await tableExists(c, "json_store"))) {
    throw new Error("json_store tablosu bulunamadı.");
  }
  const existing = await jsonStoreGet(c, scope, fileName, slug);
  const now = new Date().toISOString();
  const payload = { ...data, updatedAt: now };
  if (existing?.storeId) {
    await updateDynamic(
      c,
      "json_store",
      existing.storeId,
      { data: payload, updated_at: now },
      slug,
    );
    return { ...payload, storeId: existing.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await insertDynamic(c, "json_store", {
    id,
    scope,
    main_company_slug: slug || null,
    file_name: fileName,
    data: payload,
    created_at: now,
    updated_at: now,
  });
  return { ...payload, storeId: id, fileName };
}

function documentKind(
  row: DatabaseRow,
): "SUPPLIER_INVOICE" | "CUSTOMER_INVOICE" | "DISPATCH" | "OTHER" {
  const raw = { ...jsonObject(row.metadata), ...jsonObject(row.raw) };
  const value = normalizeText(
    `${row.document_type || ""} ${row.target_type || ""} ${row.detected_type || ""} ${raw.documentKind || ""} ${raw.belgeTuru || ""}`,
  );
  if (/IRSALIYE|DISPATCH/.test(value)) return "DISPATCH";
  if (/TEDARIK|ALIS|SUPPLIER/.test(value)) return "SUPPLIER_INVOICE";
  if (/SATIS|CUSTOMER/.test(value) && /FATURA|INVOICE/.test(value)) {
    return "CUSTOMER_INVOICE";
  }
  if (/FATURA|INVOICE/.test(value)) {
    const direction = normalizeText(raw.direction || raw.yon || raw.sourceType);
    if (/INCOMING|GELEN|ALIS/.test(direction)) return "SUPPLIER_INVOICE";
    return "CUSTOMER_INVOICE";
  }
  return "OTHER";
}

function mapInvoiceLine(row: DatabaseRow): DatabaseRow {
  const raw = { ...jsonObject(row.raw), ...jsonObject(row.metadata) };
  return {
    id: row.id,
    lineNo: row.line_no,
    rawName: row.product_name || row.description || raw.rawName || "Kalem",
    description: row.description || row.product_name || raw.description || "",
    quantity: databaseNumber(row.quantity || raw.quantity),
    unit: row.unit || raw.unit || "",
    unitPrice: databaseNumber(row.unit_price || raw.unitPrice),
    subtotal: databaseNumber(row.subtotal || row.line_total || raw.subtotal),
    vatRate: databaseNumber(row.vat_rate || raw.vatRate),
    vatAmount: databaseNumber(row.vat_amount || raw.vatAmount),
    lineTotal: databaseNumber(row.line_total || raw.lineTotal || row.subtotal),
    productId: row.product_id || raw.productId || null,
    productName: raw.productName || row.product_name || "",
    lotNo: row.lot_no || raw.lotNo || "",
    raw,
  };
}

function mapAccountingDocument(
  row: DatabaseRow,
  companies: Map<string, DatabaseRow>,
  lines: DatabaseRow[] = [],
): DatabaseRow {
  const raw = { ...jsonObject(row.metadata), ...jsonObject(row.raw) };
  const kind = documentKind(row);
  const companyId = databaseText(row.company_id || raw.companyId || raw.firmId);
  const company = companies.get(companyId) || {};
  const missingFields = Array.isArray(raw.missingFields)
    ? raw.missingFields
    : Array.isArray(raw.eksikBilgiler)
      ? raw.eksikBilgiler
      : [];
  return {
    id: row.id,
    documentKind: kind,
    documentNo: row.document_no || raw.documentNo || raw.belgeNo || "",
    invoiceNo: row.document_no || raw.invoiceNo || "",
    issueDate: row.date || raw.issueDate || raw.tarih || row.created_at,
    companyId: companyId || null,
    firmId: companyId || null,
    supplierName:
      company.name || raw.supplierName || raw.firma || "Firma eşleşmesi bekliyor",
    companyName: company.name || raw.companyName || raw.firma || "",
    companyType: company.company_type || company.type || "",
    subtotal: databaseNumber(row.subtotal || raw.subtotal || raw.matrah),
    vatTotal: databaseNumber(row.vat_total || raw.vatTotal || raw.kdv),
    grandTotal: databaseNumber(row.grand_total || raw.grandTotal || raw.toplam),
    sourceType: row.source_type || raw.sourceType || raw.source || "MANUAL",
    status: row.status || raw.status || "CONTROL_WAITING",
    processedAt: row.processed_at || raw.processedAt || null,
    missingFields,
    firmMatchStatus:
      row.firm_match_status || raw.firmMatchStatus || (companyId ? "MATCHED" : "PENDING"),
    mailStatus: raw.mailStatus || raw.mailDurumu || "BEKLIYOR",
    modelName: raw.modelName || raw.modelAdi || "",
    orderNo: raw.orderNo || raw.siparisNo || "",
    quantity: databaseNumber(raw.quantity || raw.adet),
    boyahaneTransferStatus: raw.boyahaneTransferStatus || "NOT_REQUIRED",
    boyahaneLotIds: jsonArray(raw.boyahaneLotIds),
    lines: lines.map(mapInvoiceLine),
    raw,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function companyMap(c: Context<AppEnv>, slug = slugOf(c)) {
  const rows = await scopedRows(c, "companies", {
    slug,
    orderBy: "name COLLATE NOCASE ASC",
    limit: 10000,
  });
  return new Map(rows.map((row) => [databaseText(row.id), row]));
}

async function accountingDocuments(
  c: Context<AppEnv>,
  options: { kind?: string; search?: string; status?: string } = {},
): Promise<DatabaseRow[]> {
  const [documents, companies] = await Promise.all([
    scopedRows(c, "documents", {
      orderBy: "date DESC, id DESC",
      limit: 10000,
    }),
    companyMap(c),
  ]);
  const search = normalizeText(options.search);
  const status = normalizeText(options.status);
  return documents
    .map((row) => mapAccountingDocument(row, companies))
    .filter((row) => !options.kind || row.documentKind === options.kind)
    .filter((row) => !status || status === "ALL" || normalizeText(row.status) === status)
    .filter((row) => {
      if (!search) return true;
      return normalizeText(
        `${row.documentNo || ""} ${row.companyName || ""} ${row.supplierName || ""} ${row.modelName || ""}`,
      ).includes(search);
    });
}


async function accountingReadDocuments(
  c: Context<AppEnv>,
  options: { kind?: string; search?: string; status?: string } = {},
): Promise<DatabaseRow[]> {
  const slug = slugOf(c);
  const [canonical, legacy] = await Promise.all([
    listCanonicalAccountingDocuments(c, slug, options),
    accountingDocuments(c, options),
  ]);
  return mergeCanonicalLegacyAccounting(canonical, legacy);
}

async function accountingReadDocumentDetail(
  c: Context<AppEnv>,
  id: string,
): Promise<DatabaseRow | null> {
  const canonical = await canonicalAccountingDocumentDetail(c, slugOf(c), id);
  return canonical || accountingDocumentDetail(c, id);
}

async function accountingDocumentDetail(
  c: Context<AppEnv>,
  id: string,
): Promise<DatabaseRow | null> {
  const slug = slugOf(c);
  const [row, companies, lines] = await Promise.all([
    rowByIdScoped(c, "documents", id, slug),
    companyMap(c, slug),
    scopedRows(c, "invoice_items", {
      slug,
      filters: [{ column: "document_id", value: id }],
      orderBy: "line_no ASC, id ASC",
      limit: 10000,
    }),
  ]);
  if (!row) return null;
  const mapped = mapAccountingDocument(row, companies, lines);
  const companyId = databaseText(mapped.companyId);
  const [profile, aliases] = companyId
    ? await Promise.all([
        chemicalProfile(c, companyId, slug),
        chemicalAliases(c, companyId, slug),
      ])
    : [defaultChemicalProfile(""), []];
  return { ...mapped, chemicalSupplierProfile: profile, productAliases: aliases };
}

function defaultChemicalProfile(companyId: string): DatabaseRow {
  return {
    companyId,
    isChemicalSupplier: false,
    defaultWarehouse: "BOYAHANE",
    defaultUnit: "KG",
    requireLot: true,
    allowNegativeStock: false,
  };
}

async function chemicalProfile(
  c: Context<AppEnv>,
  companyId: string,
  slug = slugOf(c),
): Promise<DatabaseRow> {
  const stored = await jsonStoreGet(
    c,
    "MUHASEBE_CHEMICAL_SUPPLIER",
    companyId,
    slug,
  );
  return stored ? { ...defaultChemicalProfile(companyId), ...stored } : defaultChemicalProfile(companyId);
}

async function chemicalAliases(
  c: Context<AppEnv>,
  companyId: string,
  slug = slugOf(c),
): Promise<DatabaseRow[]> {
  const aliases = await jsonStoreList(c, "MUHASEBE_PRODUCT_ALIAS", slug);
  return aliases.filter((row) => databaseText(row.companyId) === companyId);
}

async function accountingSummary(c: Context<AppEnv>) {
  const slug = slugOf(c);
  const [companies, documents, movements, vatSummary, cheques] = await Promise.all([
    scopedRows(c, "companies", {
      slug,
      orderBy: "name COLLATE NOCASE ASC",
      limit: 10000,
    }),
    accountingReadDocuments(c),
    scopedRows(c, "current_account_movements", {
      slug,
      orderBy: "movement_date DESC, id DESC",
      limit: 10,
    }),
    buildVatSummary(c),
    jsonStoreList(c, "MUHASEBE_CHEQUE", slug),
  ]);
  const companyNames = new Map(
    companies.map((item) => [databaseText(item.id), databaseText(item.name)]),
  );
  const receivable = companies
    .filter((item) => databaseNumber(item.current_balance) > 0)
    .reduce((sum, item) => sum + databaseNumber(item.current_balance), 0);
  const payable = companies
    .filter((item) => databaseNumber(item.current_balance) < 0)
    .reduce((sum, item) => sum + Math.abs(databaseNumber(item.current_balance)), 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthDocuments = documents.filter((item) =>
    databaseText(item.issueDate || item.createdAt).startsWith(monthKey),
  );
  const supplierDocuments = monthDocuments.filter(
    (item) => item.documentKind === "SUPPLIER_INVOICE",
  );
  const customerDocuments = monthDocuments.filter(
    (item) => item.documentKind === "CUSTOMER_INVOICE",
  );
  const aggregate = (source: DatabaseRow[]) => {
    const grouped = new Map<string, DatabaseRow>();
    for (const item of source) {
      const name = databaseText(item.companyName || item.supplierName || "Eşleşmeyen firma");
      const current = grouped.get(name) || { firma: name, belgeSayisi: 0, toplam: 0 };
      current.belgeSayisi = databaseNumber(current.belgeSayisi) + 1;
      current.toplam = databaseNumber(current.toplam) + databaseNumber(item.grandTotal);
      grouped.set(name, current);
    }
    return [...grouped.values()]
      .sort((left, right) => databaseNumber(right.toplam) - databaseNumber(left.toplam))
      .slice(0, 10);
  };
  const pendingDocuments = documents.filter(
    (item) => !/PROCESSED|APPROVED|ISLENDI|ISLENDI/.test(normalizeText(item.status)),
  );
  const today = new Date();
  const upcomingCheques: DatabaseRow[] = cheques
    .filter((row) => normalizeText(row.status) !== "ODENDI")
    .map((row) => ({ ...row, dueMs: new Date(databaseText(row.dueDate || row.vadeTarihi)).getTime() }))
    .filter((row) => Number.isFinite(row.dueMs) && row.dueMs >= today.getTime())
    .sort((a, b) => a.dueMs - b.dueMs)
    .slice(0, 10);

  const data = {
    generatedAt: new Date().toISOString(),
    companyCount: companies.length,
    documentCount: documents.length,
    movementCount: await scopedCount(c, "current_account_movements", { slug }),
    vatRecordCount: vatSummary.recordCount,
    toplamAlacak: receivable,
    toplamBorc: payable,
    netBakiye: receivable - payable,
    buAyGelenFatura: supplierDocuments.reduce(
      (sum, item) => sum + databaseNumber(item.grandTotal),
      0,
    ),
    buAyKesilenFatura: customerDocuments.reduce(
      (sum, item) => sum + databaseNumber(item.grandTotal),
      0,
    ),
    gelenKdv: vatSummary.incomingVat,
    gidenKdv: vatSummary.outgoingVat,
    netKdv: vatSummary.netVat,
    odenecekKdv: vatSummary.payableVat,
    devredenKdv: vatSummary.carryForwardVat,
    kontrolBekleyenBelge: pendingDocuments.length,
    onayBekleyenBelge: pendingDocuments.length,
    isnetSonSenkronizasyon:
      documents
        .filter((item) => /ISNET/.test(normalizeText(item.sourceType)))
        .map((item) => databaseText(item.updatedAt || item.createdAt))
        .sort()
        .at(-1) || null,
    recentMovements: movements.map((item) => ({
      id: item.id,
      tarih: item.movement_date,
      firma: companyNames.get(databaseText(item.company_id)) || "",
      aciklama: item.description || item.movement_type || "",
      tutar: databaseNumber(item.amount || item.debit || item.credit),
    })),
    sonCariHareketler: movements.map((item) => ({
      id: item.id,
      tarih: item.movement_date,
      firma: companyNames.get(databaseText(item.company_id)) || "",
      aciklama: item.description || item.movement_type || "",
      tutar: databaseNumber(item.amount || item.debit || item.credit),
    })),
    enYuksekTedarikciler: aggregate(supplierDocuments),
    enYuksekMusteriler: aggregate(customerDocuments),
    yaklasanCekler: upcomingCheques,
    yaklasanCekToplami: upcomingCheques.reduce(
      (sum, row) => sum + databaseNumber(row.amount || row.tutar),
      0,
    ),
    eksikBelgeler: pendingDocuments.slice(0, 10).map((item) => ({
      id: item.id,
      belgeNo: item.documentNo,
      firma: item.companyName || item.supplierName || "Eşleşmeyen firma",
      durum: item.status || "Kontrol bekliyor",
      eksik: Array.isArray(item.missingFields)
        ? (item.missingFields as unknown[]).join(", ")
        : "Kontrol bekliyor",
    })),
    totals: {
      receivable,
      payable,
      balance: receivable - payable,
      income: customerDocuments.reduce(
        (sum, item) => sum + databaseNumber(item.grandTotal),
        0,
      ),
      expense: supplierDocuments.reduce(
        (sum, item) => sum + databaseNumber(item.grandTotal),
        0,
      ),
      vatIncoming: vatSummary.incomingVat,
      vatOutgoing: vatSummary.outgoingVat,
      vatPayable: vatSummary.payableVat,
      vatCarryForward: vatSummary.carryForwardVat,
    },
  };
  return c.json({ ok: true, success: true, data });
}

async function buildVatSummary(c: Context<AppEnv>, forcedFirmId = "") {
  const slug = slugOf(c);
  const year = Number(c.req.query("year") || c.req.query("periodYear") || 0);
  const month = Number(c.req.query("month") || c.req.query("periodMonth") || 0);
  const [records, companies, documents] = await Promise.all([
    scopedRows(c, "vat_records", {
      slug,
      orderBy: "id DESC",
      limit: 10000,
    }),
    companyMap(c, slug),
    accountingReadDocuments(c),
  ]);
  const selected = records.filter((record) => {
    const recordYear = Number(
      record.period_year ||
        databaseText(record.date || record.created_at).slice(0, 4) ||
        0,
    );
    const recordMonth = Number(
      record.period_month ||
        databaseText(record.date || record.created_at).slice(5, 7) ||
        0,
    );
    const firmId = databaseText(record.company_id || record.firm_id);
    if (forcedFirmId && firmId !== forcedFirmId) return false;
    if (year && recordYear !== year) return false;
    if (month && recordMonth !== month) return false;
    return true;
  });
  const grouped = new Map<string, DatabaseRow>();
  for (const record of selected) {
    const firmId = databaseText(record.company_id || record.firm_id);
    const current = grouped.get(firmId) || {
      firmId,
      firma: companies.get(firmId)?.name || "Firma eşleşmesi bekliyor",
      gelenKdv: 0,
      gidenKdv: 0,
      devredenKdv: 0,
      gelenMatrah: 0,
      gidenMatrah: 0,
      belgeSayisi: 0,
    };
    const raw = jsonObject(record.raw);
    current.gelenKdv =
      databaseNumber(current.gelenKdv) + databaseNumber(record.incoming_vat);
    current.gidenKdv =
      databaseNumber(current.gidenKdv) + databaseNumber(record.outgoing_vat);
    current.devredenKdv =
      databaseNumber(current.devredenKdv) + databaseNumber(record.carry_vat);
    current.gelenMatrah =
      databaseNumber(current.gelenMatrah) + databaseNumber(raw.incomingBase || raw.gelenMatrah);
    current.gidenMatrah =
      databaseNumber(current.gidenMatrah) + databaseNumber(raw.outgoingBase || raw.gidenMatrah);
    current.belgeSayisi = databaseNumber(current.belgeSayisi) + 1;
    grouped.set(firmId, current);
  }
  const incomingVat = selected.reduce(
    (sum, row) => sum + databaseNumber(row.incoming_vat),
    0,
  );
  const outgoingVat = selected.reduce(
    (sum, row) => sum + databaseNumber(row.outgoing_vat),
    0,
  );
  const previousCarryVat = selected.reduce(
    (sum, row) => sum + databaseNumber(row.carry_vat),
    0,
  );
  const netVat = outgoingVat - incomingVat - previousCarryVat;
  const periodDocuments = documents.filter((doc) => {
    const date = databaseText(doc.issueDate || doc.createdAt);
    if (year && Number(date.slice(0, 4)) !== year) return false;
    if (month && Number(date.slice(5, 7)) !== month) return false;
    if (forcedFirmId && databaseText(doc.companyId) !== forcedFirmId) return false;
    return true;
  });
  return {
    recordCount: selected.length,
    year: year || null,
    month: month || null,
    incomingVat,
    outgoingVat,
    previousCarryVat,
    netVat,
    payableVat: Math.max(0, netVat),
    carryForwardVat: Math.max(0, -netVat),
    liste: [...grouped.values()].sort(
      (a, b) => databaseNumber(b.gidenKdv) - databaseNumber(a.gidenKdv),
    ),
    incomingDocuments: periodDocuments.filter(
      (row) => row.documentKind === "SUPPLIER_INVOICE",
    ),
    outgoingDocuments: periodDocuments.filter(
      (row) => row.documentKind === "CUSTOMER_INVOICE",
    ),
  };
}

function documentDateInRange(row: DatabaseRow, startDate: string, endDate: string) {
  const value = databaseText(row.issueDate || row.createdAt).slice(0, 10);
  if (startDate && value < startDate) return false;
  if (endDate && value > endDate) return false;
  return true;
}

async function buildProfitLoss(c: Context<AppEnv>) {
  return buildCanonicalAccountingReport(c);
}

async function buildChequeDashboard(c: Context<AppEnv>) {
  const rows = await jsonStoreList(c, "MUHASEBE_CHEQUE");
  const normalized = rows
    .map((row) => {
      const dueDate = databaseText(row.dueDate || row.vadeTarihi);
      const dueMs = new Date(dueDate).getTime();
      const remainingDays = Number.isFinite(dueMs)
        ? Math.ceil((dueMs - Date.now()) / 86400000)
        : null;
      return {
        ...row,
        id: row.id || row.fileName,
        dueDate,
        amount: databaseNumber(row.amount || row.tutar),
        remainingDays,
        status:
          row.status ||
          (remainingDays !== null && remainingDays < 0
            ? "GECIKTI"
            : remainingDays !== null && remainingDays <= 7
              ? "YAKLASIYOR"
              : "ACIK"),
      };
    })
    .sort((a, b) => databaseText(a.dueDate).localeCompare(databaseText(b.dueDate)));
  const monthMap = new Map<string, DatabaseRow>();
  for (const row of normalized) {
    const month = databaseText(row.dueDate).slice(0, 7) || "TARİHSİZ";
    const current = monthMap.get(month) || {
      month,
      count: 0,
      total: 0,
      overdue: 0,
      paid: 0,
    };
    current.count = databaseNumber(current.count) + 1;
    current.total = databaseNumber(current.total) + databaseNumber(row.amount);
    if (normalizeText(row.status) === "GECIKTI") current.overdue = databaseNumber(current.overdue) + 1;
    if (normalizeText(row.status) === "ODENDI") current.paid = databaseNumber(current.paid) + 1;
    monthMap.set(month, current);
  }
  return {
    rows: normalized,
    months: [...monthMap.values()].sort((a, b) =>
      databaseText(a.month).localeCompare(databaseText(b.month)),
    ),
    summary: {
      total: normalized.reduce((sum, row) => sum + databaseNumber(row.amount), 0),
      count: normalized.length,
      overdue: normalized.filter((row) => normalizeText(row.status) === "GECIKTI").length,
      paid: normalized.filter((row) => normalizeText(row.status) === "ODENDI").length,
    },
  };
}

async function buildMailTracking(c: Context<AppEnv>) {
  const [companies, tracking] = await Promise.all([
    scopedRows(c, "companies", {
      orderBy: "name COLLATE NOCASE ASC",
      limit: 10000,
    }),
    jsonStoreList(c, "MUHASEBE_MAIL_TRACKING"),
  ]);
  const trackingMap = new Map(
    tracking.map((row) => [databaseText(row.companyId), row]),
  );
  const liste = companies.map((company) => {
    const state: DatabaseRow =
      trackingMap.get(databaseText(company.id)) || {};
    const email = databaseText(company.email || state.email);
    const status = state.status || (email ? "EKSTRE_ISTENECEK" : "MAIL_EKSIK");
    return {
      companyId: company.id,
      firma: company.name,
      email,
      bakiye: databaseNumber(company.current_balance),
      sonEkstre: state.lastStatementAt || null,
      sonIstek: state.lastRequestAt || null,
      status,
      note: state.note || "",
    };
  });
  return {
    gonderilecek: liste.filter((row) => row.status === "EKSTRE_ISTENECEK").length,
    gonderildi: liste.filter((row) => row.status === "GONDERILDI").length,
    aliciEksik: liste.filter((row) => row.status === "MAIL_EKSIK").length,
    ekstedeVar: liste.filter((row) => row.status === "EKSTRE_GELDI").length,
    liste,
    seciliKayitDetay: null,
    mailOnizleme: "",
    ekstreKarsilastirmaSonucu: {},
  };
}

async function buildDispatchControl(c: Context<AppEnv>) {
  const documents = await accountingDocuments(c);
  const dispatches = documents.filter((row) => row.documentKind === "DISPATCH");
  const invoices = documents.filter((row) => row.documentKind === "CUSTOMER_INVOICE");
  const rows = dispatches.map((dispatch) => {
    const match = invoices.find(
      (invoice) =>
        databaseText(invoice.companyId) === databaseText(dispatch.companyId) &&
        ((dispatch.modelName && invoice.modelName === dispatch.modelName) ||
          (dispatch.orderNo && invoice.orderNo === dispatch.orderNo)),
    );
    const dispatchQuantity = databaseNumber(dispatch.quantity);
    const invoiceQuantity = databaseNumber(match?.quantity);
    const remaining = Math.max(0, dispatchQuantity - invoiceQuantity);
    return {
      id: dispatch.id,
      companyId: dispatch.companyId,
      companyName: dispatch.companyName,
      modelName: dispatch.modelName,
      orderNo: dispatch.orderNo,
      dispatchNo: dispatch.documentNo,
      dispatchQuantity,
      invoiceId: match?.id || null,
      invoiceNo: match?.documentNo || "",
      invoiceQuantity,
      remaining,
      status: !match
        ? "INVOICE_WAITING"
        : remaining > 0
          ? "PARTIAL"
          : invoiceQuantity > dispatchQuantity
            ? "OVER_INVOICED"
            : "COMPLETED",
    };
  });
  return {
    rows,
    total: rows.length,
    summary: {
      dispatchWithoutInvoice: rows.filter((row) => row.status === "INVOICE_WAITING").length,
      invoiceWithoutDispatch: invoices.filter(
        (invoice) =>
          !dispatches.some(
            (dispatch) =>
              databaseText(dispatch.companyId) === databaseText(invoice.companyId) &&
              ((dispatch.modelName && dispatch.modelName === invoice.modelName) ||
                (dispatch.orderNo && dispatch.orderNo === invoice.orderNo)),
          ),
      ).length,
      quantityDifference: rows.filter((row) =>
        ["PARTIAL", "OVER_INVOICED"].includes(databaseText(row.status)),
      ).length,
      modelPending: rows.filter((row) => !row.modelName).length,
      completed: rows.filter((row) => row.status === "COMPLETED").length,
    },
  };
}

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "ky-erp-api", database: "d1" }),
);

app.get("/api/health/db", async (c) => {
  const migration0046 = await ensureAccountingCanonicalReportControls0046(c.env.DB);
  const migration0050 = await ensureMailCommunicationCore0050(c.env.DB);
  await c.env.DB.prepare("SELECT COUNT(*) AS count FROM main_companies").first();
  return c.json({
    ok: true,
    database: "ky-erp-db",
    connected: true,
    canonicalAccountingControls: migration0046.state,
    mailCommunicationCore: migration0050.state,
  });
});

app.get("/api/system/status", async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') AS tables,
      (SELECT COUNT(*) FROM personnel) AS personnel,
      (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM documents) AS documents,
      (SELECT COUNT(*) FROM invoice_items) AS invoice_items,
      (SELECT COUNT(*) FROM hr_daily_attendance) AS hr_daily_attendance,
      (SELECT COUNT(*) FROM json_store) AS json_store
  `).first();
  return c.json({ ok: true, data: row });
});

app.get("/api/companies", (c) =>
  listRowsEndpoint(c, "companies", {
    search: {
      value: c.req.query("search")?.trim() || "",
      columns: ["name", "normalized_name", "tax_no"],
    },
    orderBy: "name COLLATE NOCASE ASC",
  }),
);
app.get("/api/companies/:id", async (c) => {
  const row = await rowByIdScoped(c, "companies", c.req.param("id"));
  return row
    ? c.json({ ok: true, data: row })
    : c.json(jsonError("NOT_FOUND", "Firma bulunamadı."), 404);
});
app.get("/api/firms", (c) =>
  listRowsEndpoint(c, "firms", {
    search: {
      value: c.req.query("search")?.trim() || "",
      columns: ["name", "normalized_name", "tax_no"],
    },
    orderBy: "name COLLATE NOCASE ASC",
  }),
);
app.get("/api/current-account-movements", (c) =>
  listRowsEndpoint(c, "current_account_movements", {
    filters: [
      ...(c.req.query("companyId") || c.req.query("firmId")
        ? [
            {
              column: "company_id",
              value: c.req.query("companyId") || c.req.query("firmId") || "",
            },
          ]
        : []),
      ...(c.req.query("startDate") || c.req.query("dateFrom")
        ? [
            {
              column: "movement_date",
              operator: ">=" as const,
              value: c.req.query("startDate") || c.req.query("dateFrom") || "",
            },
          ]
        : []),
      ...(c.req.query("endDate") || c.req.query("dateTo")
        ? [
            {
              column: "movement_date",
              operator: "<=" as const,
              value: c.req.query("endDate") || c.req.query("dateTo") || "",
            },
          ]
        : []),
    ],
    orderBy: "movement_date DESC, id DESC",
  }),
);
app.get("/api/cari-movements", (c) =>
  listRowsEndpoint(c, "cari_movements", {
    orderBy: "date DESC, id DESC",
  }),
);
app.get("/api/personnel", (c) =>
  listRowsEndpoint(c, "personnel", {
    search: {
      value: c.req.query("search")?.trim() || "",
      columns: ["full_name", "phone"],
    },
    orderBy: "full_name COLLATE NOCASE ASC",
  }),
);
app.get("/api/personnel/:id", async (c) => {
  const row = await rowByIdScoped(c, "personnel", c.req.param("id"));
  return row
    ? c.json({ ok: true, data: row })
    : c.json(jsonError("NOT_FOUND", "Personel bulunamadı."), 404);
});
app.get("/api/hr/daily-attendance", (c) =>
  listRowsEndpoint(c, "hr_daily_attendance", {
    filters: [
      ...(c.req.query("date")
        ? [{ column: "work_date", value: c.req.query("date") || "" }]
        : []),
      ...(c.req.query("personnelId") || c.req.query("employeeId")
        ? [
            {
              column: "employee_id",
              value: c.req.query("personnelId") || c.req.query("employeeId") || "",
            },
          ]
        : []),
    ],
    orderBy: "work_date DESC, id DESC",
  }),
);
app.get("/api/hr/payrolls", (c) =>
  listRowsEndpoint(c, "hr_payrolls_v2", {
    filters: [
      ...(c.req.query("year")
        ? [{ column: "year", value: c.req.query("year") || "" }]
        : []),
      ...(c.req.query("month")
        ? [{ column: "month", value: c.req.query("month") || "" }]
        : []),
      ...(c.req.query("personnelId")
        ? [{ column: "employee_id", value: c.req.query("personnelId") || "" }]
        : []),
    ],
    orderBy: "year DESC, month DESC, id DESC",
  }),
);
app.get("/api/documents", (c) =>
  listRowsEndpoint(c, "documents", {
    filters: [
      ...(c.req.query("companyId")
        ? [{ column: "company_id", value: c.req.query("companyId") || "" }]
        : []),
      ...(c.req.query("status")
        ? [{ column: "status", value: c.req.query("status") || "" }]
        : []),
    ],
    orderBy: "date DESC, id DESC",
  }),
);
app.get("/api/documents/:id", async (c) => {
  const row = await rowByIdScoped(c, "documents", c.req.param("id"));
  return row
    ? c.json({ ok: true, data: row })
    : c.json(jsonError("NOT_FOUND", "Belge bulunamadı."), 404);
});
app.get("/api/invoice-items", (c) =>
  listRowsEndpoint(c, "invoice_items", {
    filters: c.req.query("documentId")
      ? [{ column: "document_id", value: c.req.query("documentId") || "" }]
      : [],
    orderBy: "document_id DESC, line_no ASC, id ASC",
  }),
);
app.get("/api/vat-records", (c) =>
  listRowsEndpoint(c, "vat_records", {
    orderBy: "id DESC",
  }),
);

app.get("/api/muhasebe/dashboard", accountingSummary);
app.get("/api/muhasebe/preview", accountingSummary);
app.get("/api/muhasebe/yonetim-ozeti", accountingSummary);
app.get("/api/muhasebe/reports/management-summary", accountingSummary);

app.get("/api/muhasebe/firmalar", async (c) => {
  const search = c.req.query("search")?.trim() || "";
  const rows = await scopedRows(c, "companies", {
    search: { value: search, columns: ["name", "normalized_name", "tax_no"] },
    orderBy: "name COLLATE NOCASE ASC",
    limit: 10000,
  });
  const data = await Promise.all(
    rows.map(async (row) => {
      const profile = await chemicalProfile(c, databaseText(row.id));
      return {
        id: row.id,
        firmaAdi: row.name,
        type: row.type,
        companyType: row.company_type,
        defaultRecordType: row.default_record_type,
        taxNo: row.tax_no,
        taxOffice: row.tax_office,
        phone: row.phone,
        email: row.email,
        address: row.address,
        currentBalance: databaseNumber(row.current_balance),
        openingBalance: databaseNumber(row.opening_balance),
        isActive: row.is_active !== 0 && row.is_active !== false,
        note: row.note,
        isChemicalSupplier: Boolean(profile.isChemicalSupplier),
        updatedAt: row.updated_at,
      };
    }),
  );
  return c.json({ ok: true, success: true, data });
});

app.get("/api/muhasebe/cari-hareketler", (c) =>
  listRowsEndpoint(c, "current_account_movements", {
    filters: [
      ...(c.req.query("companyId") || c.req.query("firmId")
        ? [
            {
              column: "company_id",
              value: c.req.query("companyId") || c.req.query("firmId") || "",
            },
          ]
        : []),
      ...(c.req.query("startDate")
        ? [
            {
              column: "movement_date",
              operator: ">=" as const,
              value: c.req.query("startDate") || "",
            },
          ]
        : []),
      ...(c.req.query("endDate")
        ? [
            {
              column: "movement_date",
              operator: "<=" as const,
              value: c.req.query("endDate") || "",
            },
          ]
        : []),
    ],
    orderBy: "movement_date DESC, id DESC",
  }),
);


app.post("/api/muhasebe/belge-import/upload", async (c) => {
  const form = await c.req.formData();
  const slug = databaseText(
    form.get("mainCompanySlug") ||
      form.get("mainCompanyId") ||
      c.req.query("mainCompanySlug") ||
      "mecit-hakan",
  ).trim();
  const files = form
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) {
    return c.json(
      jsonError("FILES_REQUIRED", "Yüklenecek PDF, XML veya ZIP dosyası seçilmedi."),
      400,
    );
  }
  const allowedExtensions = new Set(["pdf", "xml", "zip"]);
  const maximumFileSize = 25 * 1024 * 1024;
  const created: DatabaseRow[] = [];
  const rejected: DatabaseRow[] = [];
  const dateFolder = new Date().toISOString().slice(0, 10);

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("tr-TR") || "";
    if (!allowedExtensions.has(extension)) {
      rejected.push({ fileName: file.name, reason: "Yalnız PDF, XML veya ZIP kabul edilir." });
      continue;
    }
    if (file.size > maximumFileSize) {
      rejected.push({ fileName: file.name, reason: "Dosya boyutu 25 MB sınırını aşıyor." });
      continue;
    }
    const id = crypto.randomUUID();
    const safeName =
      file.name
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || `${id}.${extension}`;
    const objectKey = `${slug}/muhasebe/gelen-faturalar/manual/${dateFolder}/${id}-${safeName}`;
    await c.env.FILES.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
        contentDisposition: `attachment; filename="${safeName.replace(/"/g, "")}"`,
      },
      customMetadata: {
        mainCompanySlug: slug,
        source: "MANUAL_UPLOAD",
        originalName: file.name,
      },
    });
    const now = new Date().toISOString();
    const documentNo = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
    const metadata = {
      fileKey: objectKey,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      extension,
      sourceType: "MANUAL_UPLOAD",
      reviewRequired: true,
      uploadedAt: now,
      missingFields: ["Firma ve fatura bilgileri kontrol edilmeli"],
    };
    await insertDynamic(c, "documents", {
      id,
      main_company_slug: slug,
      document_type: "SUPPLIER_INVOICE",
      detected_type: "SUPPLIER_INVOICE",
      target_type: "SUPPLIER_INVOICE",
      document_no: documentNo,
      date: now.slice(0, 10),
      source_type: "MANUAL_UPLOAD",
      status: "CONTROL_WAITING",
      firm_match_status: "PENDING",
      subtotal: 0,
      vat_total: 0,
      grand_total: 0,
      metadata,
      raw: metadata,
      created_at: now,
      updated_at: now,
    });
    if (await tableExists(c, "document_files")) {
      await insertDynamic(c, "document_files", {
        id: crypto.randomUUID(),
        main_company_slug: slug,
        document_id: id,
        file_name: file.name,
        file_key: objectKey,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        source_type: "MANUAL_UPLOAD",
        created_at: now,
        updated_at: now,
      });
    }
    created.push({
      id,
      documentNo,
      fileName: file.name,
      fileKey: objectKey,
      status: "CONTROL_WAITING",
    });
  }

  if (!created.length) {
    return c.json(
      jsonError("UPLOAD_REJECTED", "Seçilen dosyaların hiçbiri yüklenemedi.", rejected),
      400,
    );
  }
  return c.json(
    {
      ok: true,
      success: true,
      data: {
        created,
        rejected,
        createdCount: created.length,
        rejectedCount: rejected.length,
      },
    },
    201,
  );
});

app.get("/api/muhasebe/accounting/documents-read", async (c) => {
  const kind = databaseText(c.req.query("kind"));
  const search = c.req.query("search") || "";
  const status = c.req.query("status") || "";
  const firmId = databaseText(c.req.query("firmId") || c.req.query("companyId"));
  const startDate = databaseText(c.req.query("startDate") || c.req.query("dateFrom"));
  const endDate = databaseText(c.req.query("endDate") || c.req.query("dateTo"));
  const all = (await accountingReadDocuments(c, { kind: kind || undefined, search, status }))
    .filter((row) => !firmId || databaseText(row.companyId || row.firmId) === firmId)
    .filter((row) => {
      const date = databaseText(row.issueDate || row.createdAt).slice(0, 10);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    });
  const limit = Math.min(500, positiveInt(c.req.query("limit"), 100) || 100);
  const offset = nonNegativeInt(c.req.query("offset"), 0) || 0;
  return c.json({
    ok: true,
    success: true,
    data: all.slice(offset, offset + limit),
    pagination: { limit, offset, total: all.length },
    readModel: "CANONICAL_FIRST_LEGACY_DEDUPE",
  });
});

app.get("/api/muhasebe/belge-import", async (c) => {
  const all = await accountingDocuments(c, {
    kind: "SUPPLIER_INVOICE",
    search: c.req.query("search") || "",
    status: c.req.query("status") || "",
  });
  const limit = positiveInt(c.req.query("limit"), 50) || 50;
  const offset = nonNegativeInt(c.req.query("offset"), 0) || 0;
  const items = all.slice(offset, offset + limit);
  return c.json({
    ok: true,
    success: true,
    data: items,
    pagination: { limit, offset, total: all.length },
  });
});

app.get("/api/muhasebe/belge-import/:id", async (c) => {
  const row = await accountingDocumentDetail(c, c.req.param("id"));
  return row
    ? c.json({ ok: true, success: true, data: row })
    : c.json(jsonError("NOT_FOUND", "Fatura kaydı bulunamadı."), 404);
});

app.post("/api/muhasebe/belge-import/:id/approve", async (c) => {
  const body = await requestBody(c);
  const slug = slugOf(c, body);
  const id = c.req.param("id");
  const detail = await accountingDocumentDetail(c, id);
  if (!detail || detail.documentKind !== "SUPPLIER_INVOICE") {
    return c.json(jsonError("NOT_FOUND", "Tedarikçi faturası bulunamadı."), 404);
  }
  if (!detail.companyId) {
    return c.json(jsonError("COMPANY_REQUIRED", "Fatura firma ile eşleştirilmeden işlenemez."), 409);
  }
  const profile = await chemicalProfile(c, databaseText(detail.companyId), slug);
  if (
    profile.isChemicalSupplier &&
    databaseText(detail.boyahaneTransferStatus) !== "COMPLETED"
  ) {
    return c.json(
      jsonError(
        "BOYAHANE_TRANSFER_REQUIRED",
        "Boya/kimyasal tedarikçisi faturası önce lot bilgileriyle boyahaneye aktarılmalıdır.",
      ),
      409,
    );
  }
  if (/PROCESSED|APPROVED|ISLENDI/.test(normalizeText(detail.status))) {
    return c.json({ ok: true, success: true, data: detail, idempotent: true });
  }
  const company = await rowByIdScoped(c, "companies", databaseText(detail.companyId), slug);
  if (!company) {
    return c.json(jsonError("COMPANY_NOT_FOUND", "Firma kaydı bulunamadı."), 404);
  }
  const total = databaseNumber(detail.grandTotal);
  const currentBalance = databaseNumber(company.current_balance);
  const balanceAfter = currentBalance - total;
  const movementId = crypto.randomUUID();
  const existingMovement = (
    await scopedRows(c, "current_account_movements", {
      slug,
      filters: [{ column: "document_id", value: id }],
      limit: 1,
    })
  )[0];
  if (!existingMovement) {
    await insertDynamic(c, "current_account_movements", {
      id: movementId,
      main_company_slug: slug,
      company_id: detail.companyId,
      movement_date: detail.issueDate || new Date().toISOString(),
      movement_type: "FATURA",
      source_type: "SUPPLIER_INVOICE",
      document_no: detail.documentNo,
      document_id: id,
      description: `${detail.documentNo || "Tedarikçi faturası"} cari kaydı`,
      debit: 0,
      credit: total,
      amount: total,
      effect: -total,
      balance_after: balanceAfter,
      raw: { source: detail.sourceType, processedBy: body.actor || "SYSTEM" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await updateDynamic(c, "companies", databaseText(detail.companyId), {
      current_balance: balanceAfter,
      updated_at: new Date().toISOString(),
    }, slug);
  }
  const existingVat = (
    await scopedRows(c, "vat_records", {
      slug,
      filters: [{ column: "document_id", value: id }],
      limit: 1,
    })
  )[0];
  if (!existingVat && databaseNumber(detail.vatTotal) >= 0) {
    const dateValue = databaseText(detail.issueDate || new Date().toISOString());
    await insertDynamic(c, "vat_records", {
      id: crypto.randomUUID(),
      main_company_slug: slug,
      company_id: detail.companyId,
      firm_id: detail.companyId,
      document_id: id,
      date: dateValue,
      period_year: Number(dateValue.slice(0, 4)) || new Date().getFullYear(),
      period_month: Number(dateValue.slice(5, 7)) || new Date().getMonth() + 1,
      incoming_vat: databaseNumber(detail.vatTotal),
      outgoing_vat: 0,
      carry_vat: 0,
      raw: {
        documentNo: detail.documentNo,
        incomingBase: databaseNumber(detail.subtotal),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  const originalRow = await rowByIdScoped(c, "documents", id, slug);
  const raw = { ...jsonObject(originalRow?.metadata), ...jsonObject(originalRow?.raw) };
  await updateDynamic(c, "documents", id, {
    status: "PROCESSED",
    processed_at: new Date().toISOString(),
    metadata: {
      ...raw,
      status: "PROCESSED",
      processedAt: new Date().toISOString(),
      accountingMovementId: databaseText(existingMovement?.id || movementId),
    },
    updated_at: new Date().toISOString(),
  }, slug);
  const updated = await accountingDocumentDetail(c, id);
  return c.json({ ok: true, success: true, data: updated });
});

app.get("/api/muhasebe/kesilen-faturalar", async (c) => {
  const all = await accountingReadDocuments(c, {
    kind: "CUSTOMER_INVOICE",
    search: c.req.query("search") || "",
    status: c.req.query("status") || "",
  });
  const limit = positiveInt(c.req.query("limit"), 50) || 50;
  const offset = nonNegativeInt(c.req.query("offset"), 0) || 0;
  const items = all.slice(offset, offset + limit);
  return c.json({
    ok: true,
    success: true,
    data: {
      items,
      total: all.length,
      summary: {
        total: all.length,
        totalAmount: all.reduce(
          (sum, row) => sum + databaseNumber(row.grandTotal),
          0,
        ),
      },
    },
    pagination: { limit, offset, total: all.length },
  });
});

app.get("/api/muhasebe/kesilen-faturalar/:id", async (c) => {
  const row = await accountingReadDocumentDetail(c, c.req.param("id"));
  return row && row.documentKind === "CUSTOMER_INVOICE"
    ? c.json({ ok: true, success: true, data: row })
    : c.json(jsonError("NOT_FOUND", "Kesilen fatura bulunamadı."), 404);
});

app.get("/api/muhasebe/kdv", async (c) => {
  const data = await buildVatSummary(c);
  return c.json({ ok: true, success: true, data });
});
app.get("/api/vat/summary", async (c) => {
  const data = await buildVatSummary(c);
  return c.json({ ok: true, success: true, data });
});
app.get("/api/muhasebe/kdv-kontrol", async (c) => {
  const data = await buildVatSummary(c);
  return c.json({ ok: true, success: true, data });
});
app.get("/api/vat/firms/:id/detail", async (c) => {
  const data = await buildVatSummary(c, c.req.param("id"));
  return c.json({
    ok: true,
    success: true,
    data: {
      gelenBelgeler: data.incomingDocuments,
      gidenBelgeler: data.outgoingDocuments,
      hesaplananKdv: data.outgoingVat,
      indirilecekKdv: data.incomingVat,
      oncekiDevredenKdv: data.previousCarryVat,
      odenecekKdv: data.payableVat,
      devredenKdv: data.carryForwardVat,
      netKdv: data.netVat,
    },
  });
});

app.get("/api/muhasebe/accounting/manual-expenses", async (c) => {
  const startDate = c.req.query("startDate") || "";
  const endDate = c.req.query("endDate") || "";
  const data = (await jsonStoreList(c, "MUHASEBE_MANUAL_EXPENSE")).filter((row) => {
    const date = databaseText(row.date || row.createdAt).slice(0, 10);
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  });
  return c.json({ ok: true, success: true, data });
});
app.post("/api/muhasebe/accounting/manual-expenses", async (c) => {
  const body = await requestBody(c);
  const amount = databaseNumber(body.amount);
  const date = databaseText(body.date).slice(0, 10);
  if (!date || amount <= 0 || !databaseText(body.category).trim()) {
    return c.json(
      jsonError(
        "INVALID_EXPENSE",
        "Tarih, kategori ve sıfırdan büyük gider tutarı zorunludur.",
      ),
      400,
    );
  }
  const id = databaseText(body.id || crypto.randomUUID());
  const data = await jsonStorePut(
    c,
    "MUHASEBE_MANUAL_EXPENSE",
    id,
    {
      id,
      date,
      companyId: body.companyId || null,
      companyName: body.companyName || "Genel gider",
      category: body.category,
      amount,
      vatAmount: databaseNumber(body.vatAmount),
      recordType: body.recordType || "RESMI",
      description: body.description || "",
      type: "EXPENSE",
      createdAt: new Date().toISOString(),
    },
    slugOf(c, body),
  );
  return c.json({ ok: true, success: true, data }, 201);
});

app.get("/api/muhasebe/accounting/reports/records", async (c) => {
  const data = await buildProfitLoss(c);
  return c.json({ ok: true, success: true, data });
});
app.get("/api/muhasebe/kar-zarar", async (c) => {
  const data = await buildProfitLoss(c);
  return c.json({ ok: true, success: true, data });
});
app.get("/api/muhasebe/accounting/fixed-expenses", async (c) => {
  const data = await jsonStoreList(c, "MUHASEBE_FIXED_EXPENSE");
  return c.json({ ok: true, success: true, data });
});
app.post("/api/muhasebe/accounting/fixed-expenses", async (c) => {
  const body = await requestBody(c);
  const id = databaseText(body.id || crypto.randomUUID());
  const data = await jsonStorePut(c, "MUHASEBE_FIXED_EXPENSE", id, {
    ...body,
    id,
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data }, 201);
});

app.get("/api/muhasebe/cekler", async (c) => {
  const data = await buildChequeDashboard(c);
  return c.json({ ok: true, success: true, data: data.rows });
});
app.get("/api/muhasebe/cheques", async (c) => {
  const data = await buildChequeDashboard(c);
  return c.json({ ok: true, success: true, data: data.rows });
});
app.get("/api/muhasebe/odeme/cekler", async (c) => {
  const data = await buildChequeDashboard(c);
  return c.json({ ok: true, success: true, data });
});
app.post("/api/muhasebe/odeme/cekler", async (c) => {
  const body = await requestBody(c);
  const id = databaseText(body.id || crypto.randomUUID());
  const data = await jsonStorePut(c, "MUHASEBE_CHEQUE", id, {
    ...body,
    id,
    amount: databaseNumber(body.amount || body.tutar),
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data }, 201);
});

app.get("/api/mail-tracking", async (c) => {
  const data = await buildMailTracking(c);
  return c.json({ ok: true, success: true, data });
});
app.get("/api/muhasebe/mail-ekstre", async (c) => {
  const data = await buildMailTracking(c);
  return c.json({ ok: true, success: true, data });
});
app.patch("/api/muhasebe/mail-ekstre/:companyId", async (c) => {
  const body = await requestBody(c);
  const companyId = c.req.param("companyId");
  const data = await jsonStorePut(c, "MUHASEBE_MAIL_TRACKING", companyId, {
    ...body,
    companyId,
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data });
});

app.get("/api/muhasebe/rapor-kategorileri", (c) =>
  c.json({
    ok: true,
    success: true,
    data: [
      { key: "cari", label: "Cari Raporları" },
      { key: "fatura", label: "Fatura Raporları" },
      { key: "kdv", label: "KDV Raporları" },
      { key: "cek", label: "Çek Raporları" },
      { key: "gelir-gider", label: "Gelir / Gider Raporları" },
      { key: "firma", label: "Firma Raporları" },
      { key: "aylik", label: "Aylık Karşılaştırmalar" },
    ],
  }),
);
app.get("/api/muhasebe/raporlar", async (c) => {
  const [profitLoss, vat, cheques] = await Promise.all([
    buildProfitLoss(c),
    buildVatSummary(c),
    buildChequeDashboard(c),
  ]);
  return c.json({ ok: true, success: true, data: { profitLoss, vat, cheques } });
});

app.get("/api/muhasebe/mail/templates", async (c) => {
  const data = await jsonStoreList(c, "MUHASEBE_MAIL_TEMPLATE");
  return c.json({ ok: true, success: true, data });
});
app.get("/api/muhasebe/mail/templates/drafts/list", async (c) => {
  const data = await jsonStoreList(c, "MUHASEBE_MAIL_TEMPLATE_DRAFT");
  return c.json({ ok: true, success: true, data });
});
app.post("/api/muhasebe/mail/templates", async (c) => {
  const body = await requestBody(c);
  const id = databaseText(body.id || crypto.randomUUID());
  const data = await jsonStorePut(c, "MUHASEBE_MAIL_TEMPLATE", id, {
    ...body,
    id,
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data }, 201);
});

app.get("/api/muhasebe/customer-dispatches/summary", async (c) => {
  const data = await buildDispatchControl(c);
  return c.json({ ok: true, success: true, data: data.summary });
});
app.get("/api/muhasebe/customer-dispatches", async (c) => {
  const data = await buildDispatchControl(c);
  return c.json({ ok: true, success: true, data });
});

app.get("/api/models", async (c) => {
  const products = await scopedRows(c, "products", {
    orderBy: "name COLLATE NOCASE ASC",
    limit: 10000,
  });
  return c.json({
    ok: true,
    success: true,
    data: products.map((row) => ({
      id: row.id,
      name: row.name,
      modelName: row.name,
      code: row.code || row.legacy_id || "",
      unit: row.unit || "",
      raw: jsonObject(row.raw),
    })),
  });
});
app.get("/api/desen/modeller", async (c) => {
  const products = await scopedRows(c, "products", {
    orderBy: "name COLLATE NOCASE ASC",
    limit: 10000,
  });
  return c.json({ ok: true, success: true, data: products });
});

app.post("/api/muhasebe/odeme/firma", async (c) => {
  const body = await requestBody(c);
  const slug = slugOf(c, body);
  const name = databaseText(body.name || body.firmaAdi).trim();
  if (!name) {
    return c.json(jsonError("FIRM_NAME_REQUIRED", "Firma adı zorunludur."), 400);
  }
  const id = databaseText(body.id || crypto.randomUUID());
  const now = new Date().toISOString();
  await insertDynamic(c, "companies", {
    id,
    main_company_slug: slug,
    name,
    normalized_name: normalizeText(name),
    type: body.firmType || body.type || "CUSTOMER",
    company_type: body.firmType || body.type || "CUSTOMER",
    default_record_type: body.workType || body.defaultRecordType || "OFFICIAL",
    tax_no: body.taxNo || null,
    phone: body.phone || null,
    email: body.email || null,
    note: body.note || null,
    current_balance: 0,
    opening_balance: 0,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });
  return c.json({
    ok: true,
    success: true,
    data: { id, firmaId: id, firmaAdi: name },
  }, 201);
});

app.post("/api/muhasebe/odeme/cek-v3", async (c) => {
  const body = await requestBody(c);
  const amount = databaseNumber(body.amount || body.tutar);
  const firmId = databaseText(body.firmId || body.companyId);
  const checkNo = databaseText(body.checkNo || body.chequeNo || body.cekNo).trim();
  const bankName = databaseText(body.bankName || body.bank || body.banka).trim();
  if (!firmId || !checkNo || !bankName || amount <= 0) {
    return c.json(
      jsonError("INVALID_CHEQUE", "Firma, banka, çek no ve sıfırdan büyük tutar zorunludur."),
      400,
    );
  }
  const id = databaseText(body.id || crypto.randomUUID());
  const company = await rowByIdScoped(c, "companies", firmId, slugOf(c, body));
  if (!company) {
    return c.json(jsonError("COMPANY_NOT_FOUND", "Firma kaydı bulunamadı."), 404);
  }
  const data = await jsonStorePut(c, "MUHASEBE_CHEQUE", id, {
    id,
    firmId,
    companyId: firmId,
    firmaAdi: company.name,
    companyName: company.name,
    issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
    dueDate: body.dueDate || body.vadeTarihi,
    bankName,
    bank: bankName,
    accountNo: body.accountNo || body.account || "",
    checkNo,
    chequeNo: checkNo,
    amount,
    checkOwnership: body.checkOwnership || "CUSTOMER_CHECK",
    checkDirection: body.checkDirection || "RECEIVED",
    checkType: body.checkType || "MUSTERI_CEKI_ALINAN",
    workType: body.workType || "OFFICIAL",
    note: body.note || "",
    status: body.status || "OPEN",
    open: true,
    createdAt: new Date().toISOString(),
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data }, 201);
});

app.post("/api/muhasebe/odeme/kart", async (c) => {
  const body = await requestBody(c);
  const firmId = databaseText(body.firmId || body.companyId);
  const cardName = databaseText(body.cardName).trim();
  const lastFourDigits = databaseText(body.lastFourDigits).trim();
  if (!firmId || !cardName || !/^\d{4}$/.test(lastFourDigits)) {
    return c.json(
      jsonError("INVALID_CARD", "Firma, kart adı ve dört haneli kart sonu zorunludur."),
      400,
    );
  }
  const id = databaseText(body.id || crypto.randomUUID());
  const data = await jsonStorePut(c, "MUHASEBE_CARD", id, {
    id,
    firmId,
    companyId: firmId,
    cardName,
    bankName: body.bankName || "",
    lastFourDigits,
    totalDebt: databaseNumber(body.totalDebt),
    limit: databaseNumber(body.limit),
    availableLimit: databaseNumber(body.availableLimit),
    dueDate: body.dueDate || null,
    note: body.note || "",
    active: true,
    createdAt: new Date().toISOString(),
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data }, 201);
});

app.post("/api/muhasebe/odeme/islem", async (c) => {
  const body = await requestBody(c);
  const slug = slugOf(c, body);
  const firmId = databaseText(body.firmId || body.companyId);
  const amount = databaseNumber(body.amount);
  if (!firmId || amount <= 0) {
    return c.json(jsonError("INVALID_PAYMENT", "Firma ve sıfırdan büyük tutar zorunludur."), 400);
  }
  const company = await rowByIdScoped(c, "companies", firmId, slug);
  if (!company) {
    return c.json(jsonError("COMPANY_NOT_FOUND", "Firma kaydı bulunamadı."), 404);
  }
  const direction = normalizeText(body.transactionDirection || "PAYMENT_OUT");
  const isIncoming = /TAHSIL|RECEIPT|PAYMENT IN|INCOMING/.test(direction);
  const effect = isIncoming ? amount : -amount;
  const balanceAfter = databaseNumber(company.current_balance) + effect;
  const id = databaseText(body.id || crypto.randomUUID());
  const paymentDate = body.paymentDate || new Date().toISOString().slice(0, 10);
  const data = await jsonStorePut(c, "MUHASEBE_PAYMENT", id, {
    id,
    firmId,
    companyId: firmId,
    companyName: company.name,
    transactionDirection: body.transactionDirection || "PAYMENT_OUT",
    paymentMethod: body.paymentMethod || "TRANSFER",
    paymentDate,
    amount,
    description: body.description || "",
    bankName: body.bankName || "",
    createdAt: new Date().toISOString(),
  }, slug);
  await insertDynamic(c, "current_account_movements", {
    id: crypto.randomUUID(),
    main_company_slug: slug,
    company_id: firmId,
    movement_date: paymentDate,
    movement_type: isIncoming ? "TAHSILAT" : "ODEME",
    source_type: "PAYMENT",
    document_no: id,
    description: body.description || (isIncoming ? "Tahsilat" : "Ödeme"),
    debit: isIncoming ? amount : 0,
    credit: isIncoming ? 0 : amount,
    amount,
    effect,
    balance_after: balanceAfter,
    raw: data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await updateDynamic(c, "companies", firmId, {
    current_balance: balanceAfter,
    updated_at: new Date().toISOString(),
  }, slug);
  return c.json({ ok: true, success: true, data }, 201);
});

app.post("/api/muhasebe/odeme/cek/:id/dosyalar", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.formData();
  const slug = databaseText(
    form.get("mainCompanySlug") || form.get("mainCompanyId") || c.req.query("mainCompanySlug") || "mecit-hakan",
  ).trim();
  const cheque = await jsonStoreGet(c, "MUHASEBE_CHEQUE", id, slug);
  if (!cheque) return c.json(jsonError("NOT_FOUND", "Çek kaydı bulunamadı."), 404);
  const fileKeys: DatabaseRow = { ...(jsonObject(cheque.fileKeys)) };
  for (const side of ["front", "back", "receipt"] as const) {
    const value = form.get(side);
    if (!(value instanceof File) || value.size <= 0) continue;
    if (value.size > 15 * 1024 * 1024) {
      return c.json(jsonError("FILE_TOO_LARGE", "Çek dosyası 15 MB sınırını aşıyor."), 400);
    }
    const extension = value.name.split(".").pop()?.toLowerCase() || "bin";
    const key = `${slug}/muhasebe/cekler/${id}/${side}.${extension}`;
    await c.env.FILES.put(key, await value.arrayBuffer(), {
      httpMetadata: { contentType: value.type || "application/octet-stream" },
      customMetadata: { chequeId: id, side, originalName: value.name },
    });
    fileKeys[side] = key;
  }
  const data = await jsonStorePut(c, "MUHASEBE_CHEQUE", id, {
    ...cheque,
    fileKeys,
  }, slug);
  return c.json({ ok: true, success: true, data });
});

app.get("/api/muhasebe/odeme/cek/:id/dosya/:side", async (c) => {
  const cheque = await jsonStoreGet(c, "MUHASEBE_CHEQUE", c.req.param("id"));
  if (!cheque) return c.json(jsonError("NOT_FOUND", "Çek kaydı bulunamadı."), 404);
  const key = databaseText(jsonObject(cheque.fileKeys)[c.req.param("side")]);
  if (!key) return c.json(jsonError("NOT_FOUND", "Çek dosyası bulunamadı."), 404);
  const object = await c.env.FILES.get(key);
  if (!object) return c.json(jsonError("NOT_FOUND", "Çek dosyası bulunamadı."), 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

app.get("/api/muhasebe/odeme/firmalar", async (c) => {
  const companies = await scopedRows(c, "companies", {
    orderBy: "name COLLATE NOCASE ASC",
    limit: 10000,
  });
  return c.json({
    ok: true,
    success: true,
    data: companies.map((row) => ({
      id: row.id,
      firmaId: row.id,
      firmaAdi: row.name,
      taxNo: row.tax_no,
      balance: databaseNumber(row.current_balance),
    })),
  });
});
app.get("/api/muhasebe/odeme/firmalar/:id/:view", async (c) => {
  const id = c.req.param("id");
  const view = c.req.param("view");
  const [movements, cheques, cards, payments] = await Promise.all([
    scopedRows(c, "current_account_movements", {
      filters: [{ column: "company_id", value: id }],
      orderBy: "movement_date DESC, id DESC",
      limit: 10000,
    }),
    jsonStoreList(c, "MUHASEBE_CHEQUE"),
    jsonStoreList(c, "MUHASEBE_CARD"),
    jsonStoreList(c, "MUHASEBE_PAYMENT"),
  ]);
  const firmCheques = cheques.filter((row) => databaseText(row.firmId || row.companyId) === id);
  const firmCards = cards.filter((row) => databaseText(row.firmId || row.companyId) === id);
  const firmPayments = payments.filter((row) => databaseText(row.firmId || row.companyId) === id);
  let data: unknown;
  if (view === "ozet") {
    data = {
      firmId: id,
      totalDebt: movements.reduce((sum, row) => sum + databaseNumber(row.debit), 0),
      totalCredit: movements.reduce((sum, row) => sum + databaseNumber(row.credit), 0),
      balance: movements.at(0)?.balance_after || 0,
      openChequeTotal: firmCheques
        .filter((row) => !/PAID|CANCELLED|ODENDI|IPTAL/.test(normalizeText(row.status)))
        .reduce((sum, row) => sum + databaseNumber(row.amount), 0),
      cardDebt: firmCards.reduce((sum, row) => sum + databaseNumber(row.totalDebt), 0),
    };
  } else if (view === "cekler") data = firmCheques;
  else if (view === "kartlar") data = firmCards;
  else if (view === "nakit-havale") data = firmPayments;
  else if (view === "acik-kalemler") {
    data = movements.filter((row) => databaseNumber(row.balance_after) !== 0);
  } else data = movements;
  return c.json({ ok: true, success: true, data });
});

app.get("/api/muhasebe/chemical-suppliers", async (c) => {
  const [profiles, companies] = await Promise.all([
    jsonStoreList(c, "MUHASEBE_CHEMICAL_SUPPLIER"),
    companyMap(c),
  ]);
  const data = profiles
    .filter((row) => Boolean(row.isChemicalSupplier))
    .map((row) => ({
      ...row,
      companyName: companies.get(databaseText(row.companyId))?.name || "",
    }));
  return c.json({ ok: true, success: true, data });
});
app.get("/api/muhasebe/chemical-suppliers/:companyId/profile", async (c) => {
  const data = await chemicalProfile(c, c.req.param("companyId"));
  return c.json({ ok: true, success: true, data });
});
app.patch("/api/muhasebe/chemical-suppliers/:companyId/profile", async (c) => {
  const body = await requestBody(c);
  const companyId = c.req.param("companyId");
  const company = await rowByIdScoped(c, "companies", companyId, slugOf(c, body));
  if (!company) {
    return c.json(jsonError("COMPANY_NOT_FOUND", "Firma kaydı bulunamadı."), 404);
  }
  const data = await jsonStorePut(c, "MUHASEBE_CHEMICAL_SUPPLIER", companyId, {
    ...defaultChemicalProfile(companyId),
    ...body,
    companyId,
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data });
});
app.get("/api/muhasebe/chemical-suppliers/:companyId/aliases", async (c) => {
  const data = await chemicalAliases(c, c.req.param("companyId"));
  return c.json({ ok: true, success: true, data });
});
app.post("/api/muhasebe/chemical-suppliers/:companyId/aliases", async (c) => {
  const body = await requestBody(c);
  const companyId = c.req.param("companyId");
  const rawName = databaseText(body.rawName).trim();
  if (!rawName) {
    return c.json(jsonError("RAW_NAME_REQUIRED", "Faturadaki ürün adı zorunludur."), 400);
  }
  const key = `${companyId}:${normalizeText(rawName).replace(/\s+/g, "-")}`;
  const data = await jsonStorePut(c, "MUHASEBE_PRODUCT_ALIAS", key, {
    id: body.id || crypto.randomUUID(),
    companyId,
    rawName,
    normalizedRawName: normalizeText(rawName),
    aliasName: body.aliasName || body.productName || rawName,
    productId: body.productId || null,
    productName: body.productName || body.aliasName || rawName,
    unit: body.unit || "",
    isActive: body.isActive !== false,
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data }, 201);
});

app.post("/api/muhasebe/belge-import/:id/boyahane-transfer", async (c) => {
  const body = await requestBody(c);
  const slug = slugOf(c, body);
  const id = c.req.param("id");
  const detail = await accountingDocumentDetail(c, id);
  if (!detail || detail.documentKind !== "SUPPLIER_INVOICE") {
    return c.json(jsonError("NOT_FOUND", "Tedarikçi faturası bulunamadı."), 404);
  }
  const companyId = databaseText(detail.companyId);
  const profile = await chemicalProfile(c, companyId, slug);
  if (!profile.isChemicalSupplier) {
    return c.json(
      jsonError(
        "NOT_CHEMICAL_SUPPLIER",
        "Lot aktarımı yalnız boya/kimyasal tedarikçisi olarak işaretlenen firmalarda kullanılabilir.",
      ),
      409,
    );
  }
  const lines = Array.isArray(body.lines) ? (body.lines as DatabaseRow[]) : [];
  if (!lines.length) {
    return c.json(jsonError("LINES_REQUIRED", "Aktarılacak fatura kalemi bulunamadı."), 400);
  }
  const errors: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (!databaseText(line.lotNo).trim()) errors.push(`${index + 1}. satır: lot numarası eksik.`);
    if (databaseNumber(line.quantity) <= 0) errors.push(`${index + 1}. satır: miktar sıfır olamaz.`);
    if (!databaseText(line.productId || line.productName).trim()) {
      errors.push(`${index + 1}. satır: sistem ürünü seçilmedi.`);
    }
  }
  if (errors.length) {
    return c.json(jsonError("LOT_VALIDATION_FAILED", "Lot bilgileri eksik.", errors), 400);
  }
  const existingLots = await jsonStoreList(c, "BOYAHANE_LOT", slug);
  const createdLots: DatabaseRow[] = [];
  for (const line of lines) {
    const lineId = databaseText(line.lineId || line.id || crypto.randomUUID());
    const duplicate = existingLots.find(
      (lot) =>
        databaseText(lot.documentId) === id &&
        databaseText(lot.invoiceItemId) === lineId,
    );
    if (duplicate) {
      createdLots.push({ ...duplicate, idempotent: true });
      continue;
    }
    const lotId = crypto.randomUUID();
    const quantity = databaseNumber(line.quantity);
    const unitPrice = databaseNumber(line.unitPrice);
    const lot = await jsonStorePut(c, "BOYAHANE_LOT", lotId, {
      id: lotId,
      mainCompanySlug: slug,
      documentId: id,
      documentNo: detail.documentNo,
      invoiceItemId: lineId,
      companyId,
      companyName: detail.companyName || detail.supplierName,
      productId: line.productId || null,
      productName: line.productName || line.aliasName || line.rawName,
      rawName: line.rawName || line.description || "",
      aliasName: line.aliasName || line.productName || line.rawName,
      lotNo: databaseText(line.lotNo).trim(),
      quantity,
      remainingQuantity: quantity,
      unit: line.unit || profile.defaultUnit || "KG",
      warehouse: line.warehouse || profile.defaultWarehouse || "BOYAHANE",
      productionDate: line.productionDate || null,
      expiryDate: line.expiryDate || null,
      unitCost: unitPrice,
      totalCost: databaseNumber(line.totalCost || quantity * unitPrice),
      status: line.status || "AVAILABLE",
      source: "SUPPLIER_INVOICE",
      createdAt: new Date().toISOString(),
    }, slug);
    await jsonStorePut(c, "BOYAHANE_STOCK_MOVEMENT", crypto.randomUUID(), {
      id: crypto.randomUUID(),
      lotId,
      type: "IN",
      quantity,
      unit: lot.unit,
      documentId: id,
      documentNo: detail.documentNo,
      note: "Tedarikçi faturası üzerinden boyahane lot girişi",
      createdAt: new Date().toISOString(),
    }, slug);
    if (line.rawName) {
      const aliasKey = `${companyId}:${normalizeText(line.rawName).replace(/\s+/g, "-")}`;
      await jsonStorePut(c, "MUHASEBE_PRODUCT_ALIAS", aliasKey, {
        id: crypto.randomUUID(),
        companyId,
        rawName: line.rawName,
        normalizedRawName: normalizeText(line.rawName),
        aliasName: line.aliasName || line.productName || line.rawName,
        productId: line.productId || null,
        productName: line.productName || line.aliasName || line.rawName,
        unit: line.unit || profile.defaultUnit || "KG",
        isActive: true,
      }, slug);
    }
    createdLots.push(lot);
  }
  const originalRow = await rowByIdScoped(c, "documents", id, slug);
  const metadata = { ...jsonObject(originalRow?.metadata), ...jsonObject(originalRow?.raw) };
  await updateDynamic(c, "documents", id, {
    metadata: {
      ...metadata,
      boyahaneTransferStatus: "COMPLETED",
      boyahaneTransferredAt: new Date().toISOString(),
      boyahaneLotIds: createdLots.map((lot) => lot.id || lot.fileName),
    },
    updated_at: new Date().toISOString(),
  }, slug);
  return c.json({
    ok: true,
    success: true,
    data: {
      status: "COMPLETED",
      lots: createdLots,
      transferredCount: createdLots.length,
    },
  });
});

app.get("/api/boyahane/lots", async (c) => {
  const search = normalizeText(c.req.query("search"));
  const companyId = databaseText(c.req.query("companyId"));
  const status = normalizeText(c.req.query("status"));
  const rows = (await jsonStoreList(c, "BOYAHANE_LOT"))
    .filter((row) => !companyId || databaseText(row.companyId) === companyId)
    .filter((row) => !status || status === "ALL" || normalizeText(row.status) === status)
    .filter((row) => {
      if (!search) return true;
      return normalizeText(
        `${row.productName || ""} ${row.companyName || ""} ${row.aliasName || ""} ${row.lotNo || ""}`,
      ).includes(search);
    })
    .sort((a, b) => databaseText(b.createdAt).localeCompare(databaseText(a.createdAt)));
  return c.json({ ok: true, success: true, data: rows });
});
app.get("/api/boyahane/lots/:id", async (c) => {
  const lot = await jsonStoreGet(c, "BOYAHANE_LOT", c.req.param("id"));
  if (!lot) return c.json(jsonError("NOT_FOUND", "Lot bulunamadı."), 404);
  const movements = (await jsonStoreList(c, "BOYAHANE_STOCK_MOVEMENT")).filter(
    (row) => databaseText(row.lotId) === databaseText(lot.id || lot.fileName),
  );
  return c.json({ ok: true, success: true, data: { ...lot, movements } });
});
app.post("/api/boyahane/lots/:id/consume", async (c) => {
  const body = await requestBody(c);
  const id = c.req.param("id");
  const lot = await jsonStoreGet(c, "BOYAHANE_LOT", id, slugOf(c, body));
  if (!lot) return c.json(jsonError("NOT_FOUND", "Lot bulunamadı."), 404);
  const quantity = databaseNumber(body.quantity);
  const remaining = databaseNumber(lot.remainingQuantity);
  if (quantity <= 0) {
    return c.json(jsonError("INVALID_QUANTITY", "Sarf miktarı sıfırdan büyük olmalıdır."), 400);
  }
  if (quantity > remaining) {
    return c.json(
      jsonError("INSUFFICIENT_STOCK", "Lot bakiyesi sarf miktarından düşük.", {
        remaining,
        requested: quantity,
      }),
      409,
    );
  }
  const updated = await jsonStorePut(c, "BOYAHANE_LOT", id, {
    ...lot,
    remainingQuantity: remaining - quantity,
    status: remaining - quantity === 0 ? "DEPLETED" : "AVAILABLE",
  }, slugOf(c, body));
  const movementId = crypto.randomUUID();
  await jsonStorePut(c, "BOYAHANE_STOCK_MOVEMENT", movementId, {
    id: movementId,
    lotId: id,
    type: "OUT",
    quantity,
    unit: lot.unit,
    recipeId: body.recipeId || null,
    productionId: body.productionId || null,
    note: body.note || "Boyahane sarf hareketi",
    createdAt: new Date().toISOString(),
  }, slugOf(c, body));
  return c.json({ ok: true, success: true, data: updated });
});

app.get("/api/json-store", async (c) => {
  const scope = c.req.query("scope")?.trim();
  const fileName = c.req.query("fileName")?.trim();
  if (!scope || !fileName) {
    return c.json(
      jsonError("MISSING_PARAMETERS", "scope ve fileName zorunludur."),
      400,
    );
  }
  const row = await jsonStoreGet(c, scope, fileName);
  return row
    ? c.json({ ok: true, data: row })
    : c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
});
app.get("/api/json-store/:scope/*", async (c) => {
  const scope = c.req.param("scope");
  const prefix = `/api/json-store/${encodeURIComponent(scope)}/`;
  const fileName = decodeURIComponent(c.req.path.slice(prefix.length));
  if (!fileName) {
    return c.json(jsonError("MISSING_PARAMETERS", "fileName zorunludur."), 400);
  }
  const row = await jsonStoreGet(c, scope, fileName);
  return row
    ? c.json({ ok: true, data: row })
    : c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
});

app.get("/api/files/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/api/files/".length));
  if (!key) {
    return c.json(jsonError("INVALID_FILE_KEY", "Dosya anahtarı zorunludur."), 400);
  }
  const object = await c.env.FILES.get(key);
  if (!object) return c.json(jsonError("NOT_FOUND", "Dosya bulunamadı."), 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

registerCanonicalAccountingReportRoutes(app);
registerAuthManagementRoutes(app);

export default app;
