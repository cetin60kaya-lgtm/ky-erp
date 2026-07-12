import { Context, Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };

const app = new Hono<AppEnv>();

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

const jsonError = (code: string, message: string) => ({
  ok: false as const,
  error: { code, message },
});

app.use("/api/*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.has(origin) ? origin : undefined),
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    allowHeaders: ["Accept", "Authorization", "Content-Type"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    maxAge: 86400,
    credentials: true,
  }),
);

app.onError((error, c) => {
  console.error(JSON.stringify({
    level: "error",
    requestId: c.get("requestId"),
    path: c.req.path,
    message: error.message,
  }));
  return c.json(jsonError("INTERNAL_ERROR", "Beklenmeyen bir sunucu hatası oluştu."), 500);
});

app.notFound((c) => c.json(jsonError("NOT_FOUND", "Endpoint bulunamadı."), 404));

function positiveInt(value: string | undefined, fallback: number, maximum = 500): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) return null;
  return parsed;
}

function nonNegativeInt(value: string | undefined, fallback = 0): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

async function listRows(
  c: Context<AppEnv>,
  table: string,
  options: {
    filters?: Array<{ sql: string; value: string | number }>;
    search?: { value: string; columns: string[] };
    orderBy?: string;
  } = {},
) {
  const limit = positiveInt(c.req.query("limit"), 100);
  const offset = nonNegativeInt(c.req.query("offset"), 0);
  if (limit === null || offset === null) {
    return c.json(jsonError("INVALID_PAGINATION", "limit 1-500, offset ise 0 veya daha büyük olmalıdır."), 400);
  }

  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  for (const filter of options.filters || []) {
    clauses.push(filter.sql);
    bindings.push(filter.value);
  }
  if (options.search?.value) {
    clauses.push(`(${options.search.columns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    const term = `%${options.search.value}%`;
    bindings.push(...options.search.columns.map(() => term));
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const orderBy = options.orderBy || "id DESC";
  const query = `SELECT * FROM ${table}${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) AS total FROM ${table}${where}`;
  const [dataResult, countRow] = await Promise.all([
    c.env.DB.prepare(query).bind(...bindings, limit, offset).all<Record<string, unknown>>(),
    c.env.DB.prepare(countQuery).bind(...bindings).first<{ total: number }>(),
  ]);
  return c.json({
    ok: true,
    data: dataResult.results,
    pagination: { limit, offset, total: Number(countRow?.total || 0) },
  });
}

async function byId(c: Context<AppEnv>, table: string) {
  const id = c.req.param("id");
  if (!id) return c.json(jsonError("INVALID_ID", "Geçerli bir id gereklidir."), 400);
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`).bind(id).first();
  if (!row) return c.json(jsonError("NOT_FOUND", "Kayıt bulunamadı."), 404);
  return c.json({ ok: true, data: row });
}

app.get("/api/health", (c) => c.json({ ok: true, service: "ky-erp-api", database: "d1" }));

app.get("/api/health/db", async (c) => {
  await c.env.DB.prepare("SELECT COUNT(*) AS count FROM main_companies").first();
  return c.json({ ok: true, database: "ky-erp-db", connected: true });
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

app.get("/api/companies", (c) => listRows(c, "companies", {
  search: { value: c.req.query("search")?.trim() || "", columns: ["name", "normalized_name", "tax_no"] },
  orderBy: "name COLLATE NOCASE ASC",
}));
app.get("/api/companies/:id", (c) => byId(c, "companies"));
app.get("/api/firms", (c) => listRows(c, "firms", {
  search: { value: c.req.query("search")?.trim() || "", columns: ["name", "normalized_name", "tax_no"] },
  orderBy: "name COLLATE NOCASE ASC",
}));

app.get("/api/current-account-movements", (c) => {
  const companyId = c.req.query("companyId") || c.req.query("firmId");
  const startDate = c.req.query("startDate") || c.req.query("dateFrom");
  const endDate = c.req.query("endDate") || c.req.query("dateTo");
  const filters = [
    ...(companyId ? [{ sql: "company_id = ?", value: companyId }] : []),
    ...(startDate ? [{ sql: "movement_date >= ?", value: startDate }] : []),
    ...(endDate ? [{ sql: "movement_date <= ?", value: endDate }] : []),
  ];
  return listRows(c, "current_account_movements", { filters, orderBy: "movement_date DESC, id DESC" });
});
app.get("/api/cari-movements", (c) => {
  const filters = [
    ...(c.req.query("companyId") ? [{ sql: "main_company_id = ?", value: c.req.query("companyId")! }] : []),
    ...(c.req.query("firmId") ? [{ sql: "firm_id = ?", value: c.req.query("firmId")! }] : []),
    ...(c.req.query("startDate") ? [{ sql: "date >= ?", value: c.req.query("startDate")! }] : []),
    ...(c.req.query("endDate") ? [{ sql: "date <= ?", value: c.req.query("endDate")! }] : []),
  ];
  return listRows(c, "cari_movements", { filters, orderBy: "date DESC, id DESC" });
});

app.get("/api/personnel", (c) => listRows(c, "personnel", {
  search: { value: c.req.query("search")?.trim() || "", columns: ["full_name", "phone"] },
  orderBy: "full_name COLLATE NOCASE ASC",
}));
app.get("/api/personnel/:id", (c) => byId(c, "personnel"));
app.get("/api/hr/daily-attendance", (c) => {
  const date = c.req.query("date");
  const personnelId = c.req.query("personnelId") || c.req.query("employeeId");
  const filters = [
    ...(date ? [{ sql: "work_date = ?", value: date }] : []),
    ...(personnelId ? [{ sql: "employee_id = ?", value: personnelId }] : []),
  ];
  return listRows(c, "hr_daily_attendance", { filters, orderBy: "work_date DESC, id DESC" });
});
app.get("/api/hr/payrolls", (c) => listRows(c, "hr_payrolls_v2", {
  filters: [
    ...(c.req.query("year") ? [{ sql: "year = ?", value: c.req.query("year")! }] : []),
    ...(c.req.query("month") ? [{ sql: "month = ?", value: c.req.query("month")! }] : []),
    ...(c.req.query("personnelId") ? [{ sql: "employee_id = ?", value: c.req.query("personnelId")! }] : []),
  ],
  orderBy: "year DESC, month DESC, id DESC",
}));

app.get("/api/documents", (c) => listRows(c, "documents", {
  filters: [
    ...(c.req.query("companyId") ? [{ sql: "company_id = ?", value: c.req.query("companyId")! }] : []),
    ...(c.req.query("status") ? [{ sql: "status = ?", value: c.req.query("status")! }] : []),
  ],
  orderBy: "date DESC, id DESC",
}));
app.get("/api/documents/:id", (c) => byId(c, "documents"));
app.get("/api/invoice-items", (c) => listRows(c, "invoice_items", {
  filters: c.req.query("documentId") ? [{ sql: "document_id = ?", value: c.req.query("documentId")! }] : [],
  orderBy: "document_id DESC, line_no ASC, id ASC",
}));
app.get("/api/vat-records", (c) => listRows(c, "vat_records", {
  filters: [
    ...(c.req.query("companyId") ? [{ sql: "company_id = ?", value: c.req.query("companyId")! }] : []),
    ...(c.req.query("firmId") ? [{ sql: "firm_id = ?", value: c.req.query("firmId")! }] : []),
    ...(c.req.query("startDate") ? [{ sql: "date >= ?", value: c.req.query("startDate")! }] : []),
    ...(c.req.query("endDate") ? [{ sql: "date <= ?", value: c.req.query("endDate")! }] : []),
  ],
  orderBy: "date DESC, id DESC",
}));

app.get("/api/json-store", async (c) => {
  const scope = c.req.query("scope")?.trim();
  const fileName = c.req.query("fileName")?.trim();
  if (!scope || !fileName) return c.json(jsonError("MISSING_PARAMETERS", "scope ve fileName zorunludur."), 400);
  const row = await c.env.DB.prepare("SELECT * FROM json_store WHERE scope = ? AND file_name = ? LIMIT 1")
    .bind(scope, fileName).first<Record<string, unknown>>();
  if (!row) return c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
  return c.json({ ok: true, data: row });
});

app.get("/api/json-store/:scope/*", async (c) => {
  const scope = c.req.param("scope");
  const prefix = `/api/json-store/${encodeURIComponent(scope)}/`;
  const fileName = decodeURIComponent(c.req.path.slice(prefix.length));
  if (!fileName) return c.json(jsonError("MISSING_PARAMETERS", "fileName zorunludur."), 400);
  const row = await c.env.DB.prepare("SELECT * FROM json_store WHERE scope = ? AND file_name = ? LIMIT 1")
    .bind(scope, fileName).first<Record<string, unknown>>();
  if (!row) return c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
  return c.json({ ok: true, data: row });
});

app.get("/api/files/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/api/files/".length));
  if (!key) return c.json(jsonError("INVALID_FILE_KEY", "Dosya anahtarı zorunludur."), 400);
  const object = await c.env.FILES.get(key);
  if (!object) return c.json(jsonError("NOT_FOUND", "Dosya bulunamadı."), 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

export default app;
