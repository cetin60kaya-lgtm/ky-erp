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
  "https://ky-erp-frontend.pages.dev",
]);

const jsonError = (code: string, message: string) => ({ ok: false as const, error: { code, message } });
const ok = (data: unknown) => ({ ok: true as const, success: true as const, data });

app.use("/api/*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.has(origin) ? origin : undefined),
    allowMethods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Accept", "Authorization", "Content-Type"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    maxAge: 86400,
    credentials: true,
  }),
);

app.onError((error, c) => {
  console.error(JSON.stringify({ level: "error", requestId: c.get("requestId"), path: c.req.path, message: error.message }));
  return c.json(jsonError("INTERNAL_ERROR", "Beklenmeyen bir sunucu hatası oluştu."), 500);
});

app.notFound((c) => c.json(jsonError("NOT_FOUND", "Endpoint bulunamadı."), 404));

function positiveInt(value: string | undefined, fallback: number, maximum = 500): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function nonNegativeInt(value: string | undefined, fallback = 0): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function tableExists(c: Context<AppEnv>, table: string): Promise<boolean> {
  const row = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
  return Boolean(row);
}

async function safeCount(c: Context<AppEnv>, table: string): Promise<number> {
  if (!(await tableExists(c, table))) return 0;
  const row = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>();
  return Number(row?.total || 0);
}

async function safeRows(c: Context<AppEnv>, table: string, orderBy = "id DESC", limit = 500): Promise<Record<string, unknown>[]> {
  if (!(await tableExists(c, table))) return [];
  const result = await c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT ?`).bind(limit).all<Record<string, unknown>>();
  return result.results || [];
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
  if (!(await tableExists(c, table))) return c.json({ ...ok([]), pagination: { limit: 100, offset: 0, total: 0 } });
  const limit = positiveInt(c.req.query("limit"), 100);
  const offset = nonNegativeInt(c.req.query("offset"), 0);
  if (limit === null || offset === null) return c.json(jsonError("INVALID_PAGINATION", "limit 1-500, offset 0 veya daha büyük olmalıdır."), 400);

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
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const orderBy = options.orderBy || "id DESC";
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM ${table}${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table}${where}`).bind(...bindings).first<{ total: number }>(),
  ]);
  return c.json({ ...ok(rows.results || []), pagination: { limit, offset, total: Number(count?.total || 0) } });
}

async function accountingSummary(c: Context<AppEnv>) {
  const [companyCount, documentCount, invoiceItemCount, movementCount, vatRecordCount] = await Promise.all([
    safeCount(c, "companies"),
    safeCount(c, "documents"),
    safeCount(c, "invoice_items"),
    safeCount(c, "current_account_movements"),
    safeCount(c, "vat_records"),
  ]);
  return c.json(ok({
    generatedAt: new Date().toISOString(),
    companyCount,
    documentCount,
    invoiceItemCount,
    movementCount,
    vatRecordCount,
    cards: [
      { key: "companies", label: "Firma", value: companyCount },
      { key: "documents", label: "Belge", value: documentCount },
      { key: "movements", label: "Cari Hareket", value: movementCount },
      { key: "vat", label: "KDV Kaydı", value: vatRecordCount },
    ],
    alerts: [],
    recentMovements: [],
    totals: { receivable: 0, payable: 0, balance: 0, income: 0, expense: 0, vatIncoming: 0, vatOutgoing: 0, vatPayable: 0 },
  }));
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function adminToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return `${base64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${base64Url(JSON.stringify({ sub: "bootstrap-admin", username: "admin", role: "ADMIN", iat: now, exp: now + 86400 }))}.kyerp`;
}

const adminUser = { id: "bootstrap-admin", username: "admin", fullName: "Sistem Admin", role: "ADMIN", mustChangePassword: false, permissions: [] };

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => ({}));
  if (String(body.username || "").trim().toLowerCase() !== "admin" || String(body.password || "") !== "2582") {
    return c.json(jsonError("UNAUTHORIZED", "Kullanıcı adı veya şifre hatalı."), 401);
  }
  return c.json({ ok: true, token: adminToken(), user: adminUser });
});
app.get("/api/auth/me", (c) => c.json({ ok: true, user: adminUser }));
app.post("/api/auth/logout", (c) => c.json({ ok: true }));

app.get("/api/health", (c) => c.json({ ok: true, service: "ky-erp-api", database: "d1" }));
app.get("/api/health/db", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ ok: true, database: "ky-erp-db", connected: true });
});
app.get("/api/system/status", async (c) => {
  const [tables, personnel, companies, documents, invoiceItems, attendance, jsonStore] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").first<{ total: number }>(),
    safeCount(c, "personnel"), safeCount(c, "companies"), safeCount(c, "documents"), safeCount(c, "invoice_items"), safeCount(c, "hr_daily_attendance"), safeCount(c, "json_store"),
  ]);
  return c.json(ok({ tables: Number(tables?.total || 0), personnel, companies, documents, invoice_items: invoiceItems, hr_daily_attendance: attendance, json_store: jsonStore }));
});

app.get("/api/companies", (c) => listRows(c, "companies", { orderBy: "name COLLATE NOCASE ASC" }));
app.get("/api/firms", (c) => listRows(c, "firms", { orderBy: "name COLLATE NOCASE ASC" }));
app.get("/api/personnel", (c) => listRows(c, "personnel", { orderBy: "full_name COLLATE NOCASE ASC" }));
app.get("/api/documents", (c) => listRows(c, "documents", { orderBy: "date DESC, id DESC" }));
app.get("/api/invoice-items", (c) => listRows(c, "invoice_items", { orderBy: "id DESC" }));
app.get("/api/vat-records", (c) => listRows(c, "vat_records", { orderBy: "date DESC, id DESC" }));
app.get("/api/current-account-movements", (c) => listRows(c, "current_account_movements", { orderBy: "movement_date DESC, id DESC" }));
app.get("/api/cari-movements", (c) => listRows(c, "cari_movements", { orderBy: "date DESC, id DESC" }));
app.get("/api/hr/daily-attendance", (c) => listRows(c, "hr_daily_attendance", { orderBy: "work_date DESC, id DESC" }));
app.get("/api/hr/payrolls", (c) => listRows(c, "hr_payrolls_v2", { orderBy: "year DESC, month DESC, id DESC" }));

app.get("/api/muhasebe/dashboard", accountingSummary);
app.get("/api/muhasebe/preview", accountingSummary);
app.get("/api/muhasebe/yonetim-ozeti", accountingSummary);
app.get("/api/muhasebe/reports/management-summary", accountingSummary);
app.get("/api/muhasebe/firmalar", (c) => listRows(c, "companies", { orderBy: "name COLLATE NOCASE ASC" }));
app.get("/api/muhasebe/cari-hareketler", (c) => listRows(c, "current_account_movements", { orderBy: "movement_date DESC, id DESC" }));
app.get("/api/muhasebe/kdv", (c) => listRows(c, "vat_records", { orderBy: "date DESC, id DESC" }));
app.get("/api/muhasebe/cekler", (c) => c.json(ok([])));
app.get("/api/muhasebe/cheques", (c) => c.json(ok([])));
app.get("/api/muhasebe/mail-ekstre", (c) => c.json(ok([])));
app.get("/api/muhasebe/raporlar", accountingSummary);

// İK çevrim içi okuma uçları
app.get("/api/ik/personel", (c) => listRows(c, "personnel", { orderBy: "full_name COLLATE NOCASE ASC" }));
app.get("/api/ik/monthly-employees", (c) => listRows(c, "personnel", { orderBy: "full_name COLLATE NOCASE ASC" }));
app.get("/api/ik/daily-employees", (c) => listRows(c, "personnel", { orderBy: "full_name COLLATE NOCASE ASC" }));
app.get("/api/ik/daily-attendance", (c) => listRows(c, "hr_daily_attendance", { orderBy: "work_date DESC, id DESC" }));
app.get("/api/ik/gunluk-personel/gun-kayitlari", (c) => listRows(c, "hr_daily_attendance", { orderBy: "work_date DESC, id DESC" }));
app.get("/api/ik/gunluk-personel/liste", (c) => listRows(c, "personnel", { orderBy: "full_name COLLATE NOCASE ASC" }));
app.get("/api/ik/gunluk-personel/ozet", async (c) => {
  const [personnelCount, attendanceCount] = await Promise.all([safeCount(c, "personnel"), safeCount(c, "hr_daily_attendance")]);
  return c.json(ok({ personnelCount, attendanceCount, rows: [] }));
});
app.get("/api/ik/leaves", async (c) => c.json(ok(await safeRows(c, "hr_leaves", "id DESC"))));
app.get("/api/ik/monthly-adjustments", async (c) => c.json(ok(await safeRows(c, "hr_monthly_adjustments", "id DESC"))));
app.get("/api/ik/monthly-audit-logs", async (c) => c.json(ok(await safeRows(c, "hr_audit_logs", "id DESC"))));
app.get("/api/ik/official-holidays", async (c) => c.json(ok(await safeRows(c, "hr_official_holidays", "id DESC"))));
app.get("/api/ik/documents", async (c) => c.json(ok(await safeRows(c, "hr_documents", "id DESC"))));
app.get("/api/ik/skills", async (c) => c.json(ok(await safeRows(c, "hr_skills", "id DESC"))));
app.get("/api/ik/raporlar", async (c) => {
  const [personnelCount, attendanceCount, payrollCount] = await Promise.all([safeCount(c, "personnel"), safeCount(c, "hr_daily_attendance"), safeCount(c, "hr_payrolls_v2")]);
  return c.json(ok({ personnelCount, attendanceCount, payrollCount, rows: [] }));
});
app.get("/api/ik/advanced/month", async (c) => c.json(ok({ employees: await safeRows(c, "personnel", "full_name COLLATE NOCASE ASC"), attendance: await safeRows(c, "hr_daily_attendance", "work_date DESC, id DESC"), payrolls: await safeRows(c, "hr_payrolls_v2", "year DESC, month DESC, id DESC") })));
app.get("/api/ik/advanced/quick-list", async (c) => c.json(ok(await safeRows(c, "personnel", "full_name COLLATE NOCASE ASC"))));
app.get("/api/ik/advanced/control-matrix", (c) => c.json(ok({ rows: [], alerts: [] })));
app.get("/api/ik/advanced/exception-history", (c) => c.json(ok([])));
app.get("/api/ik/advanced/audit-logs", (c) => c.json(ok([])));
app.get("/api/ik/advanced/payroll", async (c) => c.json(ok(await safeRows(c, "hr_payrolls_v2", "year DESC, month DESC, id DESC"))));
app.get("/api/ik/advanced/leave-center", (c) => c.json(ok({ rows: [], policies: [] })));
app.get("/api/ik/monthly-employees/:id/salary-contracts", (c) => c.json(ok([])));

// İşNet çevrim içi okuma uçları. Portal yazma/senkron işlemleri güvenli biçimde kapalıdır.
async function isnetDashboard(c: Context<AppEnv>) {
  const [documentCount, companyCount] = await Promise.all([safeCount(c, "documents"), safeCount(c, "companies")]);
  return c.json(ok({
    configuration: { apiConfigured: false, authConfigured: false, companyConfigured: false, capabilities: { read: true, sync: false, write: false } },
    incomingDispatchCount: 0,
    issuedDocumentCount: documentCount,
    mailWaitingCount: 0,
    archivedDocumentCount: documentCount,
    companyCount,
    oneDriveOk: false,
    storagePath: "Cloudflare R2 / ky-erp-dosyalari",
    workItems: [],
    lastSuccessfulSyncAt: null,
  }));
}
app.get("/api/isnet/dashboard", isnetDashboard);
app.get("/api/isnet/configuration", isnetDashboard);
app.get("/api/isnet/dispatches/incoming", (c) => c.json(ok([])));
app.get("/api/isnet/documents/issued", async (c) => c.json(ok(await safeRows(c, "documents", "date DESC, id DESC"))));
app.get("/api/isnet/documents/local", async (c) => {
  const rows = await safeRows(c, "documents", "date DESC, id DESC", 500);
  return c.json(ok({ documents: rows, rows, total: rows.length, page: 1, pageSize: rows.length || 50 }));
});
app.get("/api/isnet/documents/portal", (c) => c.json(ok({ documents: [], rows: [], total: 0 })));
app.get("/api/isnet/mail/queue", (c) => c.json(ok([])));
app.get("/api/isnet/settings", (c) => c.json(ok({ username: "", password: "", companyId: "", companies: [], connectionMode: "cloud", diagnostics: null })));
app.get("/api/isnet/full-sync/status", (c) => c.json(ok({ running: false, lastSuccessAt: null, processed: 0 })));
app.get("/api/isnet/automation/status", (c) => c.json(ok({ running: false, enabled: false })));
app.get("/api/isnet/print-queue", (c) => c.json(ok({ rows: [], waiting: 0 })));
app.get("/api/isnet/recipients", async (c) => c.json(ok(await safeRows(c, "companies", "name COLLATE NOCASE ASC", 100))));
app.get("/api/isnet/recipients/context", (c) => c.json(ok({ recipient: null, models: [] })));
app.get("/api/isnet/invoice-assistant/template", (c) => c.json(ok({ note: "", lines: [] })));
app.get("/api/isnet/intakes/:id/model-suggestions", (c) => c.json(ok([])));
app.get("/api/isnet/intakes/:id", (c) => c.json(ok(null)));

app.get("/api/json-store", async (c) => {
  const scope = c.req.query("scope")?.trim();
  const fileName = c.req.query("fileName")?.trim();
  if (!scope || !fileName) return c.json(jsonError("MISSING_PARAMETERS", "scope ve fileName zorunludur."), 400);
  if (!(await tableExists(c, "json_store"))) return c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
  const row = await c.env.DB.prepare("SELECT * FROM json_store WHERE scope=? AND file_name=? LIMIT 1").bind(scope, fileName).first();
  return row ? c.json(ok(row)) : c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
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
