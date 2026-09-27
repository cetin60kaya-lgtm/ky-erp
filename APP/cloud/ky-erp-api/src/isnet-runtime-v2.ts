// @ts-nocheck
import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const SCOPE = {
  settings: "ISNET_SETTINGS",
  portalDocument: "ISNET_PORTAL_DOCUMENT",
  documentState: "ISNET_DOCUMENT_STATE",
  business: "ISNET_BUSINESS_SETTINGS",
  department: "ISNET_DEPARTMENT",
  contact: "ISNET_CONTACT",
  modelMapping: "ISNET_MODEL_MAPPING",
  autoFlow: "ISNET_AUTO_FLOW",
  sourceIntake: "ISNET_INTAKE",
  draft: "ISNET_DRAFT",
} as const;

const API_BASE = "https://einvoiceapi.isnet.net.tr";
const PORTAL_BASE = "https://nettefatura.isnet.net.tr";
const nowIso = () => new Date().toISOString();
const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const normalize = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const taxKey = (value: unknown) => text(value).replace(/\D/g, "");

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function arrayOf(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function errorBody(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Row : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
  ).bind(table).first<Row>();
  return Boolean(row?.name);
}

async function columns(c: Context<AppEnv>, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const result = await c.env.DB.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all<Row>();
  return new Set((result.results || []).map((row) => text(row.name)));
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return [];
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope=? AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  }));
}

async function storeGet(c: Context<AppEnv>, scope: string, fileName: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope=? AND file_name=?
        AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  if (!row) return null;
  return {
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  };
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  if (!(await tableExists(c, "json_store"))) throw new Error("json_store tablosu bulunamadı.");
  const existing = await storeGet(c, scope, fileName, slug);
  const timestamp = nowIso();
  const payload = {
    ...data,
    updatedAt: timestamp,
    createdAt: data.createdAt || existing?.createdAt || timestamp,
  };
  if (existing?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data=?, updated_at=? WHERE id=?`,
    ).bind(JSON.stringify(payload), timestamp, existing.storeId).run();
    return { ...payload, storeId: existing.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, scope, slug || null, fileName, JSON.stringify(payload), timestamp, timestamp).run();
  return { ...payload, storeId: id, fileName };
}

async function storeDelete(c: Context<AppEnv>, scope: string, fileName: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return;
  await c.env.DB.prepare(
    `DELETE FROM json_store WHERE scope=? AND file_name=?
      AND (main_company_slug=? OR main_company_slug IS NULL)`,
  ).bind(scope, fileName, slug).run();
}

function normalizeCompanies(payload: any) {
  const source = Array.isArray(payload?.CompanyList)
    ? payload.CompanyList
    : Array.isArray(payload?.companyList)
      ? payload.companyList
      : Array.isArray(payload?.Companies)
        ? payload.Companies
        : Array.isArray(payload?.companies)
          ? payload.companies
          : Array.isArray(payload?.options)
            ? payload.options
            : Array.isArray(payload)
              ? payload
              : [];
  const seen = new Set<string>();
  return source
    .map((row: Row) => ({
      id: text(row.IdFirma ?? row.idFirma ?? row.CompanyId ?? row.companyId ?? row.Id ?? row.id),
      parentId: text(row.IdAnaFirma ?? row.idAnaFirma ?? row.ParentId ?? row.parentId),
      name: text(row.FirmaAdi ?? row.firmaAdi ?? row.CompanyName ?? row.companyName ?? row.Name ?? row.name),
      schemaName: text(row.SchemaName ?? row.schemaName),
      hasRole: row.UserHasRole !== false && row.hasRole !== false,
    }))
    .filter((row: Row) => {
      if (!row.id || !row.name || !row.hasRole || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}

function payloadMessage(payload: any, fallback = "İşNet isteği başarısız oldu.") {
  const raw = payload?.ErrorMessage || payload?.errorMessage || payload?.Message || payload?.message || payload?.error?.message;
  if (Array.isArray(raw)) return raw.map(text).filter(Boolean).join(", ") || fallback;
  if (raw && typeof raw === "object") return Object.values(raw).flat().map(text).filter(Boolean).join(", ") || fallback;
  return text(raw) || fallback;
}

async function loginApi(username: string, password: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${API_BASE}/api/Account/Login`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ IdentificationNumber: username, Password: password }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: any = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`İşNet API JSON yerine farklı yanıt döndürdü (${response.status}).`); }
    if (!response.ok) throw new Error(`İşNet API HTTP ${response.status}: ${payloadMessage(payload, response.statusText)}`);
    const errorMessage = text(payload?.ErrorMessage ?? payload?.errorMessage ?? payload?.Message ?? payload?.message);
    if (errorMessage) throw new Error(errorMessage);
    const token = text(payload?.Token ?? payload?.token);
    const companies = normalizeCompanies(payload);
    if (!token) throw new Error("İşNet API giriş tokenı alınamadı.");
    if (!companies.length) throw new Error("İşNet API yetkili firma listesi döndürmedi.");
    return {
      token,
      expiresOn: text(payload?.ExpiresOn || payload?.expiresOn) || null,
      companies,
      mode: "api",
      diagnostics: { api: "Bağlandı", portal: "Denenmedi" },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function verificationToken(html: string) {
  return text(
    html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i)?.[1],
  );
}

function mergeCookies(response: Response, jar: Map<string, string>) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() || (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  for (const value of values) {
    const pair = text(value.split(";", 1)[0]);
    const separator = pair.indexOf("=");
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function loginPortal(username: string, password: string) {
  const jar = new Map<string, string>();
  const request = async (path: string, init: RequestInit = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    try {
      const response = await fetch(path.startsWith("http") ? path : `${PORTAL_BASE}${path}`, {
        ...init,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/json",
          "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Cloud/4.0",
          ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
          ...(init.headers || {}),
        },
        redirect: "manual",
        signal: controller.signal,
      });
      mergeCookies(response, jar);
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };

  const loginPaths = ["/account/login/Login", "/Account/Login", "/account/login"];
  let loginPath = "";
  let loginHtml = "";
  let token = "";
  for (const candidate of loginPaths) {
    try {
      const response = await request(candidate);
      const html = await response.text();
      const nextToken = verificationToken(html);
      if (response.ok && nextToken) {
        loginPath = candidate;
        loginHtml = html;
        token = nextToken;
        break;
      }
    } catch { /* next */ }
  }
  if (!loginPath || !token) throw new Error("İşNet portal giriş ekranı açılamadı.");
  const inputNames = [...loginHtml.matchAll(/<input[^>]*name=["']([^"']+)["']/gi)].map((m) => text(m[1])).filter(Boolean);
  const usernameField = inputNames.find((name) => /(identificationnumber|vkntckn|tckn|username|user_name)/i.test(name)) || "VknTckn";
  const passwordField = inputNames.find((name) => /(password|sifre|şifre)/i.test(name)) || "Password";
  const form = new URLSearchParams();
  form.set(usernameField, username);
  form.set(passwordField, password);
  form.set("RememberMe", "false");
  form.set("__RequestVerificationToken", token);
  const loginResponse = await request(loginPath, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: PORTAL_BASE,
      Referer: `${PORTAL_BASE}${loginPath}`,
    },
    body: form.toString(),
  });
  const loginText = await loginResponse.text();
  const companyPaths = ["/Account/GetCompanyList", "/account/GetCompanyList", "/account/login/GetCompanyList"];
  for (const candidate of companyPaths) {
    try {
      const response = await request(candidate, {
        method: "POST",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: PORTAL_BASE,
          Referer: `${PORTAL_BASE}${loginPath}`,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams({ q: "" }).toString(),
      });
      const raw = await response.text();
      let payload: any = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
      const companies = normalizeCompanies(payload);
      if (companies.length) {
        return {
          token: "",
          expiresOn: null,
          companies,
          mode: "portal",
          diagnostics: { api: "Başarısız", portal: "Bağlandı" },
        };
      }
    } catch { /* next */ }
  }
  const cleanText = loginText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (/captcha|güvenlik kodu|kullanıcı adı|şifre|hatalı giriş/i.test(cleanText)) {
    throw new Error("İşNet portalı kullanıcı/TCKN veya şifre bilgisini kabul etmedi.");
  }
  throw new Error("Portal girişi açıldı ancak yetkili firma listesi alınamadı.");
}

async function loginIsnet(username: string, password: string) {
  if (!username || !password) throw new Error("İşNet kullanıcı adı/TCKN ve şifre zorunludur.");
  let apiMessage = "";
  try {
    return await loginApi(username, password);
  } catch (error: any) {
    apiMessage = text(error?.message) || "API bağlantısı kurulamadı.";
  }
  try {
    const portal = await loginPortal(username, password);
    return { ...portal, diagnostics: { api: apiMessage, portal: "Bağlandı" } };
  } catch (error: any) {
    const portalMessage = text(error?.message) || "Portal bağlantısı kurulamadı.";
    throw new Error(`İşNet bağlantısı kurulamadı. API: ${apiMessage} Portal: ${portalMessage}`);
  }
}

async function settingsRaw(c: Context<AppEnv>, slug: string) {
  return (await storeGet(c, SCOPE.settings, slug, slug)) || {};
}

function publicSettings(settings: Row) {
  return {
    username: text(settings.username),
    companyId: text(settings.companyId),
    companyName: text(settings.companyName),
    companies: Array.isArray(settings.companies) ? settings.companies : [],
    connectionMode: text(settings.connectionMode || "api") || "api",
    hasPassword: false,
    sessionReady: Boolean(text(settings.accessToken)),
    tokenExpiresOn: settings.tokenExpiresOn || null,
    requiresPasswordForSync: settings.requiresPasswordForSync === true,
    testedAt: settings.testedAt || null,
    diagnostics: settings.diagnostics || null,
    securityNote: "İşNet şifresi D1 veritabanına kaydedilmez. API tokenı varsa yalnız oturum tokenı saklanır.",
  };
}

async function isnetApiRequest(c: Context<AppEnv>, slug: string, endpoint: string, body?: Row, method: "GET" | "POST" = "POST") {
  const settings = await settingsRaw(c, slug);
  const token = text(settings.accessToken);
  if (!token) throw new Error("İşNet API oturumu yok. Ayarlardan bağlantıyı tekrar test edin.");
  const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}`, Token: token };
  if (method !== "GET") headers["Content-Type"] = "application/json";
  const response = await fetch(`${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method,
    headers,
    ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
  });
  const raw = await response.text();
  let payload: any = raw;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { /* text */ }
  if (!response.ok) throw new Error(`İşNet API ${response.status}: ${payloadMessage(payload, response.statusText)}`);
  const result = payload?.Result ?? payload?.result;
  if (result !== undefined && result !== null && ![0, "0", "success", "Success", true].includes(result)) {
    throw new Error(payloadMessage(payload));
  }
  return payload;
}

function extractRows(payload: any) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["Recipients", "recipients", "Despatches", "despatches", "Invoices", "invoices", "Data", "data", "Items", "items", "Value", "value", "List", "list"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

async function recipients(c: Context<AppEnv>, slug: string) {
  const settings = await settingsRaw(c, slug);
  const companyId = text(settings.companyId);
  if (!companyId) return [];
  const payload = await isnetApiRequest(c, slug, "/api/Company/GetRecipientList", { CompanyId: Number(companyId) });
  return extractRows(payload).map((row: Row) => ({
    id: text(row.IdAlici || row.idAlici || row.Id || row.id),
    name: text(row.Unvan_Ad_Soyad || row.FirmaAdi || row.RecipientCompanyName || row.ReceiverName || row.Name),
    taxNo: text(row.VknTckn || row.VKN || row.TCKN),
    eInvoice: text(row.EFaturaDurumu || row.InvoiceStatus || row.EInvoiceStatus),
    eDespatch: text(row.EIrsaliyeDurumu || row.DespatchStatus || row.EDespatchStatus),
  })).filter((row: Row) => row.id && row.name);
}

async function companyCatalog(c: Context<AppEnv>, slug: string) {
  if (!(await tableExists(c, "companies"))) return { rows: [], byId: new Map(), aliases: [] };
  const cols = await columns(c, "companies");
  const where = [cols.has("main_company_slug") ? "main_company_slug=?" : "1=1"];
  const binds: any[] = cols.has("main_company_slug") ? [slug] : [];
  if (cols.has("deleted_at")) where.push("deleted_at IS NULL");
  const result = await c.env.DB.prepare(`SELECT * FROM companies WHERE ${where.join(" AND ")} ORDER BY name COLLATE NOCASE`).bind(...binds).all<Row>();
  const rows = result.results || [];
  let aliases: Row[] = [];
  if (await tableExists(c, "company_aliases")) {
    const aCols = await columns(c, "company_aliases");
    const clauses = [aCols.has("main_company_slug") ? "main_company_slug=?" : "1=1"];
    const aBinds: any[] = aCols.has("main_company_slug") ? [slug] : [];
    if (aCols.has("deleted_at")) clauses.push("deleted_at IS NULL");
    if (aCols.has("is_active")) clauses.push("is_active=1");
    const aResult = await c.env.DB.prepare(`SELECT * FROM company_aliases WHERE ${clauses.join(" AND ")}`).bind(...aBinds).all<Row>();
    aliases = aResult.results || [];
  }
  return { rows, byId: new Map(rows.map((row) => [text(row.id), row])), aliases };
}

function companyRole(company: Row) {
  const value = normalize(company.company_type || company.type || company.companyType);
  if (/BOTH|HER IKISI/.test(value)) return "BOTH";
  if (/CUSTOMER|MUSTERI|ALICI/.test(value)) return "CUSTOMER";
  if (/SUPPLIER|TEDARIK|SATICI|VENDOR/.test(value)) return "SUPPLIER";
  return "UNKNOWN";
}

function matchCompany(catalog: Awaited<ReturnType<typeof companyCatalog>>, row: Row) {
  const direct = text(row.companyId || row.company_id || row.firmId || row.firm_id);
  if (direct && catalog.byId.has(direct)) return catalog.byId.get(direct) || null;
  const raw = objectOf(row.raw);
  const metadata = objectOf(row.metadata);
  const tax = taxKey(row.partnerTaxNo || row.taxNo || row.vkn || raw.partnerTaxNo || raw.taxNo || raw.vkn || metadata.partnerTaxNo || metadata.taxNo || metadata.vkn);
  if (tax) {
    const found = catalog.rows.find((company) => taxKey(company.tax_no || company.taxNo) === tax);
    if (found) return found;
  }
  const name = normalize(row.partnerName || row.companyName || row.supplierName || row.customerName || raw.partnerName || raw.companyName || raw.firma || metadata.partnerName || metadata.companyName || metadata.firma);
  if (name) {
    const directName = catalog.rows.find((company) => normalize(company.name) === name || normalize(company.normalized_name) === name);
    if (directName) return directName;
    const alias = catalog.aliases.find((item) => normalize(item.raw_name || item.normalized_name) === name);
    if (alias && catalog.byId.has(text(alias.company_id))) return catalog.byId.get(text(alias.company_id)) || null;
  }
  return null;
}

function inferKind(row: Row) {
  const explicit = normalize(row.kind);
  if (explicit === "INVOICE") return "invoice";
  if (explicit === "DISPATCH" || explicit === "DESPATCH") return "dispatch";
  const raw = objectOf(row.raw);
  const meta = objectOf(row.metadata);
  const value = normalize(`${row.document_type || row.documentType || ""} ${row.target_type || ""} ${row.detected_type || ""} ${row.documentKind || ""} ${raw.documentKind || ""} ${meta.documentKind || ""}`);
  if (/IRSALIYE|DISPATCH|DESPATCH/.test(value)) return "dispatch";
  if (/FATURA|INVOICE/.test(value)) return "invoice";
  return "other";
}

function inferDirection(row: Row, kind: string) {
  const explicit = normalize(row.direction || objectOf(row.raw).direction || objectOf(row.metadata).direction);
  if (/OUT|GIDEN/.test(explicit)) return "outgoing";
  if (/IN|GELEN/.test(explicit)) return "incoming";
  const type = normalize(`${row.document_type || row.documentType || ""} ${row.target_type || ""} ${row.detected_type || ""} ${row.documentKind || ""}`);
  if (/CUSTOMER INVOICE|SATIS FATURA|SATIS INVOICE/.test(type)) return "outgoing";
  if (/SUPPLIER INVOICE|TEDARIK|ALIS FATURA/.test(type)) return "incoming";
  if (kind === "dispatch" && /CUSTOMER DISPATCH|MUSTERI IRSALIYE/.test(type)) return "incoming";
  return "incoming";
}

function documentCategory(kind: string, direction: string, role: string) {
  if (direction === "outgoing" && kind === "dispatch") return "OUR_OUTGOING_DISPATCH";
  if (direction === "outgoing" && kind === "invoice") return "OUR_OUTGOING_INVOICE";
  if (direction === "incoming" && kind === "invoice") {
    return role === "CUSTOMER" ? "OTHER_INCOMING_INVOICE" : "SUPPLIER_INCOMING_INVOICE";
  }
  if (direction === "incoming" && kind === "dispatch") {
    if (role === "SUPPLIER") return "SUPPLIER_INCOMING_DISPATCH";
    if (role === "CUSTOMER" || role === "BOTH") return "CUSTOMER_INCOMING_DISPATCH";
    return "UNMATCHED_INCOMING_DISPATCH";
  }
  return "OTHER_DOCUMENT";
}

function categoryLabel(category: string) {
  return {
    CUSTOMER_INCOMING_DISPATCH: "Müşteriden Gelen İrsaliye",
    SUPPLIER_INCOMING_DISPATCH: "Tedarikçiden Gelen İrsaliye",
    SUPPLIER_INCOMING_INVOICE: "Tedarikçiden Gelen Fatura",
    OUR_OUTGOING_DISPATCH: "Bizim Giden İrsaliyemiz",
    OUR_OUTGOING_INVOICE: "Bizim Kesilen Faturamız",
    UNMATCHED_INCOMING_DISPATCH: "Firma Eşleşmesi Bekleyen İrsaliye",
    OTHER_INCOMING_INVOICE: "Diğer Gelen Fatura",
  }[category] || "İşNet Belgesi";
}

async function physicalDocuments(c: Context<AppEnv>, slug: string) {
  if (!(await tableExists(c, "documents"))) return [];
  const cols = await columns(c, "documents");
  const clauses: string[] = [];
  const values: any[] = [];
  if (cols.has("main_company_slug")) { clauses.push("main_company_slug=?"); values.push(slug); }
  if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const result = await c.env.DB.prepare(`SELECT * FROM documents${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY ${cols.has("date") ? "date" : "created_at"} DESC LIMIT 10000`).bind(...values).all<Row>();
  return result.results || [];
}

async function invoiceLines(c: Context<AppEnv>, slug: string, documentId: string) {
  if (!(await tableExists(c, "invoice_items"))) return [];
  const cols = await columns(c, "invoice_items");
  const clauses = ["document_id=?"];
  const values: any[] = [documentId];
  if (cols.has("main_company_slug")) { clauses.push("main_company_slug=?"); values.push(slug); }
  if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const result = await c.env.DB.prepare(`SELECT * FROM invoice_items WHERE ${clauses.join(" AND ")} ORDER BY ${cols.has("line_no") ? "line_no" : "id"} ASC`).bind(...values).all<Row>();
  return (result.results || []).map((line, index) => ({
    id: text(line.id || `${documentId}-${index + 1}`),
    lineNo: num(line.line_no || index + 1),
    productName: text(line.product_name || line.description),
    description: text(line.description || line.product_name),
    quantity: num(line.quantity),
    unit: text(line.unit || "ADET"),
    unitPrice: num(line.unit_price),
    vatRate: num(line.vat_rate),
    lineTotal: num(line.line_total || line.subtotal),
  }));
}

async function normalizedDocuments(c: Context<AppEnv>, slug: string) {
  const [portal, states, physical, catalog] = await Promise.all([
    storeList(c, SCOPE.portalDocument, slug),
    storeList(c, SCOPE.documentState, slug),
    physicalDocuments(c, slug),
    companyCatalog(c, slug),
  ]);
  const stateByKey = new Map(states.map((row) => [text(row.automationKey || row.fileName), row]));
  const physicalByNo = new Map<string, Row[]>();
  for (const row of physical) {
    const no = text(row.document_no || objectOf(row.metadata).documentNo || objectOf(row.raw).documentNo);
    if (!no) continue;
    physicalByNo.set(no, [...(physicalByNo.get(no) || []), row]);
  }
  const combined: Row[] = [];
  const seen = new Set<string>();
  const add = (source: Row, sourceType: string) => {
    const kind = inferKind(source);
    if (kind === "other") return;
    const direction = inferDirection(source, kind);
    const raw = objectOf(source.raw);
    const metadata = objectOf(source.metadata);
    const documentNo = text(source.documentNo || source.document_no || source.invoiceNo || source.dispatchNo || raw.documentNo || metadata.documentNo || source.sourceId || source.id);
    const key = text(source.automationKey) || `${kind}:${direction}:${documentNo}`;
    if (!documentNo || seen.has(key)) return;
    seen.add(key);
    const matches = physicalByNo.get(documentNo) || [];
    const physicalRow = sourceType === "D1" ? source : matches[0] || {};
    const company = matchCompany(catalog, { ...physicalRow, ...source });
    const role = companyRole(company || {});
    const category = documentCategory(kind, direction, role);
    const state = stateByKey.get(key) || {};
    const mergedRaw = { ...objectOf(physicalRow.raw), ...objectOf(physicalRow.metadata), ...raw, ...metadata };
    const companyId = text(company?.id || source.companyId || physicalRow.company_id || mergedRaw.companyId);
    const modelId = text(source.modelId || mergedRaw.modelId);
    const modelName = text(source.modelName || mergedRaw.modelName || mergedRaw.modelAdi);
    const pdfKey = text(source.pdfKey || state.pdfKey || state.pdfR2Key || mergedRaw.pdfKey || mergedRaw.pdfR2Key || physicalRow.pdf_key);
    const xmlKey = text(source.xmlKey || state.xmlKey || state.xmlR2Key || mergedRaw.xmlKey || mergedRaw.xmlR2Key || physicalRow.xml_key);
    combined.push({
      id: text(source.id || physicalRow.id || key),
      sourceId: text(source.sourceId || source.id || physicalRow.id || key),
      automationKey: key,
      documentNo,
      kind,
      direction,
      category,
      categoryLabel: categoryLabel(category),
      dateText: text(source.dateText || source.issueDate || physicalRow.date || physicalRow.created_at || source.createdAt).slice(0, 10),
      partnerName: text(company?.name || source.partnerName || source.companyName || source.supplierName || mergedRaw.partnerName || mergedRaw.companyName || mergedRaw.firma),
      partnerTaxNo: text(source.partnerTaxNo || company?.tax_no || mergedRaw.partnerTaxNo || mergedRaw.taxNo || mergedRaw.vkn),
      companyId,
      companyRole: role,
      companyType: role,
      modelApplicable: category === "CUSTOMER_INCOMING_DISPATCH",
      modelId,
      modelName,
      amount: num(source.amount || physicalRow.grand_total || mergedRaw.grandTotal || mergedRaw.toplam),
      scenarioText: text(source.scenarioText || mergedRaw.scenarioText || mergedRaw.scenario),
      subtypeText: text(source.subtypeText || mergedRaw.subtypeText || mergedRaw.subtype),
      statusText: text(source.statusText || physicalRow.status || mergedRaw.status || "Kayıtlı"),
      accountingImported: Boolean(physicalRow?.id),
      accountingDocumentId: text(physicalRow?.id),
      accountingStatus: text(physicalRow?.status),
      pdfKey,
      xmlKey,
      pdfSaved: Boolean(pdfKey || state.pdfSaved || state.pdfPath),
      xmlSaved: Boolean(xmlKey || state.xmlSaved || state.xmlPath),
      downloaded: Boolean(state.completed || source.downloadedAt || pdfKey || xmlKey),
      downloadedAt: state.downloadedAt || source.downloadedAt || null,
      raw: mergedRaw,
      sourceType,
    });
  };
  for (const row of portal) add(row, "PORTAL");
  for (const row of physical) add(row, "D1");
  return combined.sort((a, b) => text(b.dateText).localeCompare(text(a.dateText)) || text(b.documentNo).localeCompare(text(a.documentNo), "tr-TR", { numeric: true }));
}

function dateInRange(row: Row, startDate: string, endDate: string) {
  const date = text(row.dateText || row.date).slice(0, 10);
  if (startDate && date && date < startDate) return false;
  if (endDate && date && date > endDate) return false;
  return true;
}

function actionNeeded(row: Row) {
  if (row.category === "CUSTOMER_INCOMING_DISPATCH") return !row.modelId;
  if (row.category === "SUPPLIER_INCOMING_INVOICE") return !row.accountingImported || !/PROCESSED|APPROVED|ISLENDI/.test(normalize(row.accountingStatus));
  if (row.category === "UNMATCHED_INCOMING_DISPATCH") return true;
  return false;
}

function businessDefaults() {
  return {
    carrier: {},
    mailTemplate: {},
    nonBillableRules: {
      TEST_NUMUNESI: { invoiceBehavior: "ZERO_PRICE_EXEMPT", exemptionCode: "", exemptionReason: "" },
      BASKI_SAKATI: { invoiceBehavior: "DO_NOT_INVOICE" },
      KUMAS_SAKATI: { invoiceBehavior: "DO_NOT_INVOICE" },
    },
    modelDepartmentMappings: [],
  };
}

async function businessBundle(c: Context<AppEnv>, slug: string) {
  const settings = { ...businessDefaults(), ...((await storeGet(c, SCOPE.business, slug, slug)) || {}) };
  const [departments, contacts, mappings] = await Promise.all([
    storeList(c, SCOPE.department, slug),
    storeList(c, SCOPE.contact, slug),
    storeList(c, SCOPE.modelMapping, slug),
  ]);
  return { settings: { ...settings, modelDepartmentMappings: mappings }, departments, contacts, modelDepartmentMappings: mappings };
}

async function resolveBusiness(c: Context<AppEnv>, slug: string, query: Row) {
  const bundle = await businessBundle(c, slug);
  const companyId = text(query.companyId || query.firmId);
  const modelId = text(query.modelId);
  const mapping = bundle.modelDepartmentMappings.find((row: Row) => (!companyId || text(row.companyId) === companyId) && (!modelId || text(row.modelId) === modelId)) || null;
  const departmentCode = text(mapping?.departmentCode || query.departmentCode);
  const department = bundle.departments.find((row: Row) => (!companyId || text(row.firmId) === companyId) && (!departmentCode || text(row.departmentCode) === departmentCode)) || null;
  const contact = bundle.contacts.find((row: Row) => text(row.id) === text(mapping?.responsibleContactId)) || bundle.contacts.find((row: Row) => (!companyId || text(row.firmId) === companyId) && (!departmentCode || text(row.departmentCode) === departmentCode)) || null;
  return {
    carrier: bundle.settings.carrier || {},
    mailTemplate: bundle.settings.mailTemplate || {},
    nonBillableRules: bundle.settings.nonBillableRules || businessDefaults().nonBillableRules,
    mapping,
    department,
    contact,
  };
}

async function modelRows(c: Context<AppEnv>, slug: string) {
  const rows: Row[] = [];
  for (const scope of ["DESEN_WORKFLOW_MODEL", "DESEN_MODEL"]) {
    for (const item of await storeList(c, scope, slug)) {
      rows.push({
        id: text(item.id || item.modelId || item.fileName),
        name: text(item.modelName || item.name || item.modelAdi || item.desenAdi),
        modelName: text(item.modelName || item.name || item.modelAdi || item.desenAdi),
        companyId: text(item.companyId || item.firmId),
        companyName: text(item.companyName || item.firmaAdi),
      });
    }
  }
  if (await tableExists(c, "products")) {
    const cols = await columns(c, "products");
    const clauses: string[] = [];
    const vals: any[] = [];
    if (cols.has("main_company_slug")) { clauses.push("main_company_slug=?"); vals.push(slug); }
    if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
    const result = await c.env.DB.prepare(`SELECT * FROM products${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY name COLLATE NOCASE LIMIT 5000`).bind(...vals).all<Row>();
    for (const item of result.results || []) rows.push({ id: text(item.id), name: text(item.name), modelName: text(item.name), companyId: text(item.company_id) });
  }
  const seen = new Set<string>();
  return rows.filter((row) => row.id && row.name && !seen.has(row.id) && seen.add(row.id));
}

async function flowPreview(c: Context<AppEnv>, slug: string, flow: Row) {
  const physical = (await physicalDocuments(c, slug)).find((row) => text(row.id) === text(flow.sourceDocumentId) || text(row.document_no) === text(flow.sourceDocumentNo));
  const lines = physical?.id ? await invoiceLines(c, slug, text(physical.id)) : arrayOf(flow.lines);
  const quantity = num(flow.sourceQuantity || lines.reduce((sum, line) => sum + num(line.quantity), 0));
  const preparationLines = lines.length ? lines.map((line, index) => ({
    sourceLineId: text(line.id || index + 1),
    category: "MAIN",
    productName: text(flow.modelName || line.productName || line.description || "Baskı hizmeti"),
    description: text(flow.modelName || line.description || line.productName || "Baskı hizmeti"),
    quantity: num(line.quantity),
    sourceQuantity: num(line.quantity),
    measureUnitId: "67",
    unitPrice: 0,
    lockedDescription: true,
  })) : [{
    sourceLineId: "MAIN",
    category: "MAIN",
    productName: text(flow.modelName || "Baskı hizmeti"),
    description: text(flow.modelName || "Baskı hizmeti"),
    quantity,
    sourceQuantity: quantity,
    measureUnitId: "67",
    unitPrice: 0,
    lockedDescription: true,
  }];
  return {
    remainingQuantity: num(flow.remainingQuantity ?? quantity),
    sourceQuantity: quantity,
    defaultIssueDate: new Date().toISOString().slice(0, 10),
    defaultIssueTime: new Date().toLocaleTimeString("tr-TR", { hour12: false }),
    preparationLines,
    businessContext: await resolveBusiness(c, slug, { companyId: flow.companyId, modelId: flow.modelId }),
  };
}

async function matchRecipient(c: Context<AppEnv>, slug: string, companyName: string, taxNo = "") {
  const list = await recipients(c, slug);
  const tax = taxKey(taxNo);
  if (tax) {
    const exact = list.find((row) => taxKey(row.taxNo) === tax);
    if (exact) return exact;
  }
  const name = normalize(companyName);
  if (!name) return null;
  return list.find((row) => normalize(row.name) === name) || list.find((row) => normalize(row.name).includes(name) || name.includes(normalize(row.name))) || null;
}

async function createApiDespatchDraft(c: Context<AppEnv>, slug: string, params: Row) {
  const settings = await settingsRaw(c, slug);
  const companyId = text(settings.companyId);
  if (!companyId) throw new Error("İşNet yetkili firma seçilmemiş.");
  const recipient = params.recipient || await matchRecipient(c, slug, text(params.companyName || params.partnerName), text(params.partnerTaxNo));
  if (!recipient?.id) throw new Error("İşNet alıcısı bulunamadı. Firma VKN/ünvan eşleşmesini kontrol edin.");
  const issueDate = text(params.issueDate) || new Date().toISOString().slice(0, 10);
  const issueTime = text(params.issueTime) || new Date().toLocaleTimeString("tr-TR", { hour12: false });
  const number = text(params.despatchAdviceNumber) || `KYERP-TASLAK-${Date.now()}`;
  const lines = arrayOf(params.lines).filter((line) => num(line.quantity) > 0);
  const payload = {
    DespatchAdviceNumber: number,
    IdIrsaliyeExternal: `KYERP-${crypto.randomUUID()}`,
    CompanyId: Number(companyId),
    ScenarioType: 0,
    DespatchAdviceDate: issueDate,
    DespatchAdviceTime: issueTime,
    ActualDespatchAdviceDate: issueDate,
    ActualDespatchAdviceTime: issueTime,
    DespatchAdviceType: 1,
    OrderNumber: text(params.orderNo || ""),
    Notes: ["KY ERP üzerinden kontrollü taslak", ...(text(params.note) ? [text(params.note)] : [])],
    IdAlici: Number(recipient.id),
    Products: lines.map((line) => ({
      ProductName: text(line.productName || line.description || params.modelName || "Baskı hizmeti"),
      StockDescription: text(line.description || line.productName || params.modelName || "Baskı hizmeti"),
      Quantity: num(line.quantity),
      MeasureUnitDesc: "ADET",
      UnitPrice: 0,
      VatRate: 0,
      VatAmount: 0,
      LineExtensionAmount: 0,
      Note: text(line.description || ""),
    })),
  };
  const response = await isnetApiRequest(c, slug, "/api/Invoice/SaveDespatchAdvice", payload);
  return {
    recipient,
    response,
    draftNo: text(response?.DespatchNumber || response?.DespatchAdviceNumber || number),
    ettn: text(response?.Ettn || response?.ETTN),
    externalId: payload.IdIrsaliyeExternal,
  };
}

function intakeCapacity(row: Row) {
  const source = num(row.quantity);
  const outgoing = num(row.outgoingQuantity || row.sentQuantity);
  const invoiced = num(row.invoicedQuantity);
  return {
    sourceQuantity: source,
    outgoingQuantity: outgoing,
    outgoingRemaining: Math.max(0, source - outgoing),
    invoicedQuantity: invoiced,
    invoiceRemaining: Math.max(0, outgoing - invoiced),
  };
}

export function registerIsnetRuntimeV2Routes(app: Hono<AppEnv>) {
  const getSettings = async (c: Context<AppEnv>) => {
    const slug = slugOf(c);
    return c.json({ ok: true, success: true, data: publicSettings(await settingsRaw(c, slug)) });
  };
  app.get("/api/isnet/settings", getSettings);
  app.get("/api/isnet/connection", getSettings);

  const testSettings = async (c: Context<AppEnv>) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await settingsRaw(c, slug);
    const username = text(body.username || current.username);
    const password = text(body.password);
    if (!username || !password) {
      if (current.accessToken && Array.isArray(current.companies) && current.companies.length) {
        return c.json({ ok: true, success: true, data: { ...publicSettings(current), companies: current.companies, message: "Kayıtlı İşNet API oturumu kullanılabilir." } });
      }
      return c.json(errorBody("ISNET_CREDENTIALS_REQUIRED", "İşNet kullanıcı adı/TCKN ve şifre zorunludur."), 400);
    }
    try {
      const result = await loginIsnet(username, password);
      const saved = await storePut(c, SCOPE.settings, slug, {
        ...current,
        username,
        companies: result.companies,
        connectionMode: result.mode,
        accessToken: result.token || "",
        tokenExpiresOn: result.expiresOn,
        testedAt: nowIso(),
        diagnostics: result.diagnostics,
        requiresPasswordForSync: result.mode === "portal" && !result.token,
        passwordStored: false,
      }, slug);
      return c.json({
        ok: true,
        success: true,
        data: {
          ...publicSettings(saved),
          companies: result.companies,
          authorizedCompanies: result.companies,
          connectionMode: result.mode,
          testedAt: saved.testedAt,
          message: result.mode === "api"
            ? "İşNet API bağlantısı doğrulandı. Yetkili firmayı seçip kaydedin."
            : "NetteFatura portal girişi doğrulandı. Güvenlik nedeniyle şifre saklanmadı; otomatik senkronizasyon için API oturumu tercih edilir.",
        },
      });
    } catch (error: any) {
      return c.json(errorBody("ISNET_LOGIN_FAILED", text(error?.message) || "İşNet bağlantısı kurulamadı."), 502);
    }
  };
  app.post("/api/isnet/settings/test", testSettings);
  app.post("/api/isnet/connection/test", testSettings);

  const saveSettings = async (c: Context<AppEnv>) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    let current = await settingsRaw(c, slug);
    if (text(body.password)) {
      try {
        const result = await loginIsnet(text(body.username || current.username), text(body.password));
        current = await storePut(c, SCOPE.settings, slug, {
          ...current,
          username: text(body.username || current.username),
          companies: result.companies,
          connectionMode: result.mode,
          accessToken: result.token || "",
          tokenExpiresOn: result.expiresOn,
          testedAt: nowIso(),
          diagnostics: result.diagnostics,
          requiresPasswordForSync: result.mode === "portal" && !result.token,
          passwordStored: false,
        }, slug);
      } catch (error: any) {
        return c.json(errorBody("ISNET_LOGIN_FAILED", text(error?.message) || "İşNet bağlantısı doğrulanamadı."), 502);
      }
    }
    const username = text(body.username || current.username);
    const companyId = text(body.companyId || current.companyId);
    const companies = Array.isArray(current.companies) ? current.companies : [];
    const selected = companies.find((row: Row) => text(row.id) === companyId);
    if (!username) return c.json(errorBody("ISNET_USERNAME_REQUIRED", "İşNet kullanıcı adı/TCKN zorunludur."), 400);
    if (!companyId || !selected) return c.json(errorBody("ISNET_COMPANY_REQUIRED", "Önce bağlantıyı test edin ve yetkili firmayı seçin."), 400);
    const saved = await storePut(c, SCOPE.settings, slug, {
      ...current,
      username,
      companyId,
      companyName: text(selected.name || selected.companyName),
      connectionMode: text(current.connectionMode || body.connectionMode || "api"),
      savedAt: nowIso(),
      passwordStored: false,
    }, slug);
    return c.json({ ok: true, success: true, data: { ...publicSettings(saved), savedAt: saved.savedAt, message: "İşNet firması ve güvenli oturum bilgisi kaydedildi." } });
  };
  app.put("/api/isnet/settings", saveSettings);
  app.put("/api/isnet/connection", saveSettings);

  app.get("/api/isnet/business-settings", async (c) => {
    const data = await businessBundle(c, slugOf(c));
    return c.json({ ok: true, success: true, data });
  });
  app.put("/api/isnet/business-settings", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = (await storeGet(c, SCOPE.business, slug, slug)) || businessDefaults();
    const saved = await storePut(c, SCOPE.business, slug, { ...current, ...body }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });
  app.post("/api/isnet/business-settings/departments", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = text(body.id || crypto.randomUUID());
    const saved = await storePut(c, SCOPE.department, id, { ...body, id }, slug);
    return c.json({ ok: true, success: true, data: saved }, 201);
  });
  app.patch("/api/isnet/business-settings/departments/:id", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = (await storeGet(c, SCOPE.department, id, slug)) || {};
    const saved = await storePut(c, SCOPE.department, id, { ...current, ...body, id }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });
  app.post("/api/isnet/business-settings/contacts", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = text(body.id || crypto.randomUUID());
    const saved = await storePut(c, SCOPE.contact, id, { ...body, id }, slug);
    return c.json({ ok: true, success: true, data: saved }, 201);
  });
  app.patch("/api/isnet/business-settings/contacts/:id", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = (await storeGet(c, SCOPE.contact, id, slug)) || {};
    const saved = await storePut(c, SCOPE.contact, id, { ...current, ...body, id }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });
  app.post("/api/isnet/business-settings/model-mappings", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = text(body.id || `${body.companyId || "company"}:${body.modelId || crypto.randomUUID()}`);
    const saved = await storePut(c, SCOPE.modelMapping, id, { ...body, id }, slug);
    return c.json({ ok: true, success: true, data: saved }, 201);
  });
  app.delete("/api/isnet/business-settings/model-mappings/:id", async (c) => {
    const slug = slugOf(c); await storeDelete(c, SCOPE.modelMapping, c.req.param("id"), slug);
    return c.json({ ok: true, success: true, data: { deleted: true } });
  });
  app.get("/api/isnet/business-settings/resolve", async (c) => {
    const slug = slugOf(c);
    const data = await resolveBusiness(c, slug, {
      companyId: c.req.query("companyId"), companyName: c.req.query("companyName"), modelId: c.req.query("modelId"), modelName: c.req.query("modelName"), departmentCode: c.req.query("departmentCode"),
    });
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/isnet/model-suggestions", async (c) => {
    const slug = slugOf(c); const query = normalize(c.req.query("query") || c.req.query("search") || "");
    let rows = await modelRows(c, slug);
    if (query) rows = rows.filter((row) => normalize(`${row.name} ${row.modelName}`).includes(query));
    return c.json({ ok: true, success: true, data: rows.slice(0, 100) });
  });

  app.get("/api/isnet/document-center", async (c) => {
    const slug = slugOf(c);
    const startDate = text(c.req.query("startDate"));
    const endDate = text(c.req.query("endDate"));
    const direction = text(c.req.query("direction") || "all");
    const kind = text(c.req.query("kind") || "all");
    const category = text(c.req.query("category") || "all");
    const fileStatus = text(c.req.query("fileStatus") || "all");
    const actionStatus = text(c.req.query("actionStatus") || "all");
    const search = normalize(c.req.query("search") || "");
    const page = Math.max(1, Number(c.req.query("page") || 1));
    const pageSize = [25, 50, 100].includes(Number(c.req.query("pageSize"))) ? Number(c.req.query("pageSize")) : 50;
    const all = (await normalizedDocuments(c, slug)).filter((row) => dateInRange(row, startDate, endDate));
    const filtered = all.filter((row) => {
      if (direction !== "all" && row.direction !== direction) return false;
      if (kind !== "all" && row.kind !== kind) return false;
      if (category !== "all" && row.category !== category) return false;
      if (fileStatus === "complete" && !(row.pdfSaved && row.xmlSaved)) return false;
      if (fileStatus === "missing" && row.pdfSaved && row.xmlSaved) return false;
      if (fileStatus === "pdf-missing" && row.pdfSaved) return false;
      if (fileStatus === "xml-missing" && row.xmlSaved) return false;
      const needed = actionNeeded(row);
      if (actionStatus === "needed" && !needed) return false;
      if (actionStatus === "clear" && needed) return false;
      if (search && !normalize(`${row.documentNo} ${row.partnerName} ${row.modelName} ${row.categoryLabel}`).includes(search)) return false;
      return true;
    }).map((row) => ({ ...row, actionNeeded: actionNeeded(row) }));
    const start = (page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);
    const summarySource = all.map((row) => ({ ...row, actionNeeded: actionNeeded(row) }));
    const summary = {
      total: summarySource.length,
      customerIncomingDispatches: summarySource.filter((row) => row.category === "CUSTOMER_INCOMING_DISPATCH").length,
      supplierIncomingDispatches: summarySource.filter((row) => row.category === "SUPPLIER_INCOMING_DISPATCH").length,
      supplierIncomingInvoices: summarySource.filter((row) => row.category === "SUPPLIER_INCOMING_INVOICE").length,
      ourOutgoingDispatches: summarySource.filter((row) => row.category === "OUR_OUTGOING_DISPATCH").length,
      ourOutgoingInvoices: summarySource.filter((row) => row.category === "OUR_OUTGOING_INVOICE").length,
      incomingInvoices: summarySource.filter((row) => row.direction === "incoming" && row.kind === "invoice").length,
      incomingDispatches: summarySource.filter((row) => row.direction === "incoming" && row.kind === "dispatch").length,
      outgoingDispatches: summarySource.filter((row) => row.direction === "outgoing" && row.kind === "dispatch").length,
      outgoingInvoices: summarySource.filter((row) => row.direction === "outgoing" && row.kind === "invoice").length,
      actionNeeded: summarySource.filter((row) => row.actionNeeded).length,
    };
    const sync = (await storeGet(c, "ISNET_SYNC_RUN", "latest", slug)) || {};
    return c.json({ ok: true, success: true, data: { rows, total: filtered.length, page, pageSize, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)), summary, lastSyncAt: sync.completedAt || sync.updatedAt || null } });
  });

  app.get("/api/isnet/documents/local", async (c) => {
    const slug = slugOf(c);
    const startDate = text(c.req.query("startDate"));
    const endDate = text(c.req.query("endDate"));
    const page = Math.max(1, Number(c.req.query("page") || 1));
    const pageSize = [25, 50, 100].includes(Number(c.req.query("pageSize"))) ? Number(c.req.query("pageSize")) : 50;
    const rows = (await normalizedDocuments(c, slug)).filter((row) => dateInRange(row, startDate, endDate));
    const start = (page - 1) * pageSize;
    return c.json({ ok: true, success: true, data: { rows: rows.slice(start, start + pageSize), documents: rows.slice(start, start + pageSize), total: rows.length, page, pageSize, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) } });
  });

  app.get("/api/isnet/source-intakes", async (c) => {
    const slug = slugOf(c); let rows = await storeList(c, SCOPE.sourceIntake, slug);
    const sourceType = text(c.req.query("sourceType")); const status = text(c.req.query("status")); const companyId = text(c.req.query("companyId")); const modelId = text(c.req.query("modelId")); const search = normalize(c.req.query("search") || "");
    rows = rows.filter((row) => (!sourceType || text(row.sourceType) === sourceType) && (!status || text(row.status) === status) && (!companyId || text(row.companyId) === companyId) && (!modelId || text(row.modelId) === modelId) && (!search || normalize(`${row.companyName} ${row.modelName} ${row.customerDispatchNo}`).includes(search))).map((row) => ({ ...row, capacity: intakeCapacity(row) }));
    return c.json({ ok: true, success: true, data: { rows, total: rows.length } });
  });

  app.post("/api/isnet/source-intakes/no-dispatch", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = crypto.randomUUID();
    if (!text(body.companyId) || !text(body.modelId) || num(body.quantity) <= 0) return c.json(errorBody("SOURCE_FIELDS_REQUIRED", "Firma, model ve sıfırdan büyük adet zorunludur."), 400);
    const row = await storePut(c, SCOPE.sourceIntake, id, { ...body, id, sourceType: "NO_DISPATCH", status: "READY_FOR_OUTGOING_DISPATCH", quantity: num(body.quantity), outgoingQuantity: 0, invoicedQuantity: 0 }, slug);
    return c.json({ ok: true, success: true, data: { ...row, capacity: intakeCapacity(row) } }, 201);
  });

  app.post("/api/isnet/source-intakes/portal", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const docs = await normalizedDocuments(c, slug); const sourceId = text(body.sourceId || body.documentId); const doc = docs.find((row) => text(row.id) === sourceId || text(row.sourceId) === sourceId || text(row.automationKey) === sourceId || text(row.documentNo) === sourceId);
    if (!doc) return c.json(errorBody("NOT_FOUND", "Portal irsaliyesi bulunamadı."), 404);
    if (doc.category !== "CUSTOMER_INCOMING_DISPATCH") return c.json(errorBody("CUSTOMER_DISPATCH_REQUIRED", "Üretim iş akışına yalnız müşteriden gelen irsaliye alınabilir."), 409);
    const id = crypto.randomUUID(); const row = await storePut(c, SCOPE.sourceIntake, id, { id, sourceType: "PORTAL", documentId: doc.id, customerDispatchNo: doc.documentNo, companyId: doc.companyId, companyName: doc.partnerName, modelId: doc.modelId, modelName: doc.modelName, quantity: num(body.quantity || doc.raw?.quantity), status: doc.modelId ? "READY_FOR_OUTGOING_DISPATCH" : "MODEL_WAITING", outgoingQuantity: 0, invoicedQuantity: 0 }, slug);
    return c.json({ ok: true, success: true, data: { ...row, capacity: intakeCapacity(row) } }, 201);
  });

  app.post("/api/isnet/source-intakes/manual-pdf", async (c) => {
    const form = await c.req.formData(); const slug = text(form.get("mainCompanySlug") || form.get("mainCompanyId") || c.req.query("mainCompanySlug") || "mecit-hakan"); const file = form.get("pdf"); const id = crypto.randomUUID();
    const quantity = num(form.get("quantity")); if (!text(form.get("companyId")) || !text(form.get("modelId")) || quantity <= 0) return c.json(errorBody("SOURCE_FIELDS_REQUIRED", "Firma, model ve sıfırdan büyük adet zorunludur."), 400);
    let pdfKey = "";
    if (file instanceof File && file.size > 0) {
      pdfKey = `${slug}/isnet/source-intakes/${id}/${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      await c.env.FILES.put(pdfKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/pdf" }, customMetadata: { source: "MANUAL_PDF", originalName: file.name } });
    }
    const row = await storePut(c, SCOPE.sourceIntake, id, { id, sourceType: "MANUAL_PDF", companyId: text(form.get("companyId")), companyName: text(form.get("companyName")), modelId: text(form.get("modelId")), modelName: text(form.get("modelName")), orderNo: text(form.get("orderNo")), customerDispatchNo: text(form.get("customerDispatchNo")), issueDate: text(form.get("issueDate")), quantity, unit: text(form.get("unit") || "ADET"), note: text(form.get("note")), pdfKey, status: "READY_FOR_OUTGOING_DISPATCH", outgoingQuantity: 0, invoicedQuantity: 0 }, slug);
    return c.json({ ok: true, success: true, data: { ...row, capacity: intakeCapacity(row) } }, 201);
  });

  app.get("/api/isnet/source-intakes/:id", async (c) => {
    const slug = slugOf(c); const row = await storeGet(c, SCOPE.sourceIntake, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Kaynak kayıt bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: { ...row, capacity: intakeCapacity(row) } });
  });

  for (const [suffix, fields] of [["model", ["modelId", "modelName"]], ["customer-dispatch", ["customerDispatchNo", "documentId"]], ["quantities", ["quantity", "outgoingQuantity", "invoicedQuantity"]]] as any) {
    app.patch(`/api/isnet/source-intakes/:id/${suffix}`, async (c) => {
      const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = await storeGet(c, SCOPE.sourceIntake, id, slug);
      if (!current) return c.json(errorBody("NOT_FOUND", "Kaynak kayıt bulunamadı."), 404);
      const patch: Row = {}; for (const field of fields) if (body[field] !== undefined) patch[field] = field.toLowerCase().includes("quantity") ? num(body[field]) : body[field];
      const saved = await storePut(c, SCOPE.sourceIntake, id, { ...current, ...patch, status: text(patch.modelId || current.modelId) ? "READY_FOR_OUTGOING_DISPATCH" : current.status }, slug);
      return c.json({ ok: true, success: true, data: { ...saved, capacity: intakeCapacity(saved) } });
    });
  }

  app.post("/api/isnet/source-workflow/:id/outgoing-dispatch", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const intake = await storeGet(c, SCOPE.sourceIntake, id, slug);
    if (!intake) return c.json(errorBody("NOT_FOUND", "Kaynak kayıt bulunamadı."), 404);
    const total = arrayOf(body.lines).reduce((sum, line) => sum + num(line.quantity), 0); const remaining = intakeCapacity(intake).outgoingRemaining;
    if (total <= 0 || total > remaining + 0.0001) return c.json(errorBody("OUTGOING_QUANTITY_INVALID", "İrsaliye adedi sıfırdan büyük olmalı ve kalan adedi aşmamalıdır."), 400);
    try {
      const apiDraft = await createApiDespatchDraft(c, slug, { ...body, companyName: intake.companyName, modelName: intake.modelName, orderNo: intake.orderNo });
      const saved = await storePut(c, SCOPE.sourceIntake, id, { ...intake, outgoingQuantity: num(intake.outgoingQuantity) + total, outgoingDraftNo: apiDraft.draftNo, outgoingDraftId: apiDraft.externalId, recipientId: apiDraft.recipient.id, recipientName: apiDraft.recipient.name, status: "OUTGOING_SEND_REQUIRED" }, slug);
      return c.json({ ok: true, success: true, data: { ...saved, draftNo: apiDraft.draftNo, capacity: intakeCapacity(saved), message: "Giden irsaliye İşNet taslağı oluşturuldu. Resmî gönderim kullanıcı onayıyla yapılmalıdır." } }, 201);
    } catch (error: any) {
      const draftId = crypto.randomUUID(); await storePut(c, SCOPE.draft, draftId, { id: draftId, type: "DISPATCH", sourceIntakeId: id, ...body, status: "VERIFIED_LOCAL_DRAFT", warning: text(error?.message) }, slug);
      const saved = await storePut(c, SCOPE.sourceIntake, id, { ...intake, outgoingQuantity: num(intake.outgoingQuantity) + total, outgoingDraftId: draftId, status: "OUTGOING_SEND_REQUIRED", warning: text(error?.message) }, slug);
      return c.json({ ok: true, success: true, data: { ...saved, draftId, capacity: intakeCapacity(saved), warning: `İşNet API taslağı oluşturulamadı; yerel kontrollü taslak hazırlandı. ${text(error?.message)}` } }, 201);
    }
  });

  app.post("/api/isnet/source-workflow/:id/invoice", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const intake = await storeGet(c, SCOPE.sourceIntake, id, slug);
    if (!intake) return c.json(errorBody("NOT_FOUND", "Kaynak kayıt bulunamadı."), 404);
    const dispatchNo = text(intake.outgoingDocumentNo || intake.outgoingDraftNo);
    if (!dispatchNo) return c.json(errorBody("OUTGOING_DISPATCH_REQUIRED", "Önce bizim giden irsaliyemiz oluşturulmalı/gönderilmelidir."), 409);
    let recipient = null; try { recipient = await matchRecipient(c, slug, text(intake.companyName), text(intake.partnerTaxNo)); } catch { /* settings missing */ }
    const quantity = Math.max(0, intakeCapacity(intake).invoiceRemaining || num(intake.outgoingQuantity));
    const lines = [{ sourceLineId: "MAIN", category: "MAIN", productName: text(intake.modelName || "Baskı hizmeti"), description: text(intake.modelName || "Baskı hizmeti"), quantity, unitPrice: 0, vatRate: 20, measureUnitId: 67 }];
    return c.json({ ok: true, success: true, data: { sourceId: text(intake.outgoingDraftId || intake.id), intakeId: id, dispatchNo, recipientId: text(recipient?.id), recipientName: text(recipient?.name || intake.companyName), localCompanyId: text(intake.companyId), modelId: text(intake.modelId), modelName: text(intake.modelName), invoiceDate: new Date().toISOString().slice(0, 10), dueDate: new Date().toISOString().slice(0, 10), lines, notes: [], quantity, message: "Bizim giden irsaliyemize bağlı fatura önizlemesi hazırlandı." } });
  });

  app.patch("/api/isnet/source-intakes/:id/outgoing-dispatch/:draftId/complete", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = await storeGet(c, SCOPE.sourceIntake, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Kaynak kayıt bulunamadı."), 404);
    const no = text(body.documentNo || body.outgoingDocumentNo || body.dispatchNo); if (!no) return c.json(errorBody("DOCUMENT_NO_REQUIRED", "Gönderilmiş irsaliye numarası zorunludur."), 400);
    const saved = await storePut(c, SCOPE.sourceIntake, id, { ...current, outgoingDocumentNo: no, status: "READY_FOR_INVOICE" }, slug);
    return c.json({ ok: true, success: true, data: { ...saved, capacity: intakeCapacity(saved) } });
  });

  app.get("/api/isnet/auto-flows", async (c) => {
    const rows = await storeList(c, SCOPE.autoFlow, slugOf(c));
    return c.json({ ok: true, success: true, data: { rows, total: rows.length } });
  });

  app.post("/api/isnet/auto-flows/incoming/:sourceId/prepare", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const sourceId = decodeURIComponent(c.req.param("sourceId")); const docs = await normalizedDocuments(c, slug); const doc = docs.find((row) => [row.id, row.sourceId, row.automationKey, row.documentNo].map(text).includes(sourceId));
    if (!doc) return c.json(errorBody("NOT_FOUND", "Gelen irsaliye bulunamadı."), 404);
    if (doc.category !== "CUSTOMER_INCOMING_DISPATCH") return c.json(errorBody("CUSTOMER_DISPATCH_REQUIRED", "Bu ekran yalnız müşteriden gelen irsaliyeyi model/üretim akışına alır. Tedarikçi irsaliyesi satınalma/muhasebe zincirinde kalır."), 409);
    let flow = (await storeList(c, SCOPE.autoFlow, slug)).find((row) => text(row.sourceDocumentNo) === text(doc.documentNo));
    if (!flow) {
      const lines = doc.accountingDocumentId ? await invoiceLines(c, slug, doc.accountingDocumentId) : [];
      const quantity = num(doc.raw?.quantity || doc.raw?.adet) || lines.reduce((sum, line) => sum + num(line.quantity), 0);
      const id = crypto.randomUUID();
      flow = await storePut(c, SCOPE.autoFlow, id, { id, sourceDocumentId: doc.id, sourceDocumentNo: doc.documentNo, partnerName: doc.partnerName, partnerTaxNo: doc.partnerTaxNo, companyId: doc.companyId, companyName: doc.partnerName, modelId: doc.modelId, modelName: doc.modelName, sourceQuantity: quantity, remainingQuantity: quantity, lines, status: doc.modelId ? "OUTGOING_DRAFT_READY" : "MODEL_REQUIRED" }, slug);
    }
    const preview = await flowPreview(c, slug, flow);
    const requiresModel = !text(flow.modelId);
    return c.json({ ok: true, success: true, data: { ...flow, flow, preview, requiresModel, needsModel: requiresModel, modelQuery: flow.modelName || doc.documentNo } });
  });

  app.post("/api/isnet/auto-flows/:id/model", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = await storeGet(c, SCOPE.autoFlow, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "İş akışı bulunamadı."), 404);
    const modelId = text(body.modelId || body.candidateId); const models = await modelRows(c, slug); const model = models.find((row) => text(row.id) === modelId);
    if (!modelId || !model) return c.json(errorBody("MODEL_REQUIRED", "Geçerli model seçimi zorunludur."), 400);
    const saved = await storePut(c, SCOPE.autoFlow, id, { ...current, modelId, modelName: text(model.modelName || model.name), status: "OUTGOING_DRAFT_READY" }, slug);
    return c.json({ ok: true, success: true, data: { ...saved, flow: saved, model } });
  });

  app.post("/api/isnet/auto-flows/:id/refresh", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const current = await storeGet(c, SCOPE.autoFlow, c.req.param("id"), slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "İş akışı bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: { flow: current, preview: await flowPreview(c, slug, current) } });
  });

  app.post("/api/isnet/auto-flows/:id/outgoing-draft", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = await storeGet(c, SCOPE.autoFlow, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "İş akışı bulunamadı."), 404);
    if (!text(current.modelId)) return c.json(errorBody("MODEL_REQUIRED", "Giden irsaliye için önce model bağlanmalıdır."), 409);
    const total = arrayOf(body.lines).reduce((sum, line) => sum + num(line.quantity), 0); if (total <= 0 || total > num(current.remainingQuantity) + 0.0001) return c.json(errorBody("OUTGOING_QUANTITY_INVALID", "İrsaliye adedi kalan adedi aşamaz."), 400);
    try {
      const apiDraft = await createApiDespatchDraft(c, slug, { ...body, companyName: current.companyName || current.partnerName, partnerTaxNo: current.partnerTaxNo, modelName: current.modelName });
      const saved = await storePut(c, SCOPE.autoFlow, id, { ...current, outgoingDraftNo: apiDraft.draftNo, outgoingDraftId: apiDraft.externalId, recipientId: apiDraft.recipient.id, recipientName: apiDraft.recipient.name, remainingQuantity: Math.max(0, num(current.remainingQuantity) - total), status: "OUTGOING_SEND_REQUIRED" }, slug);
      return c.json({ ok: true, success: true, data: { ...saved, flow: saved, draftNo: apiDraft.draftNo, message: "Bizim giden irsaliye İşNet taslağı oluşturuldu. Gönderim için kullanıcı onayı bekleniyor." } }, 201);
    } catch (error: any) {
      const draftId = crypto.randomUUID(); await storePut(c, SCOPE.draft, draftId, { id: draftId, type: "DISPATCH", autoFlowId: id, ...body, status: "VERIFIED_LOCAL_DRAFT", warning: text(error?.message) }, slug);
      const saved = await storePut(c, SCOPE.autoFlow, id, { ...current, outgoingDraftId: draftId, remainingQuantity: Math.max(0, num(current.remainingQuantity) - total), status: "OUTGOING_SEND_REQUIRED", warning: text(error?.message) }, slug);
      return c.json({ ok: true, success: true, data: { ...saved, flow: saved, draftId, warning: `İşNet API taslağı oluşturulamadı; KY ERP taslağı kaydedildi. ${text(error?.message)}` } }, 201);
    }
  });

  app.patch("/api/isnet/auto-flows/:id/outgoing-document-no", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = await storeGet(c, SCOPE.autoFlow, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "İş akışı bulunamadı."), 404);
    const no = text(body.documentNo || body.outgoingDocumentNo); if (!no) return c.json(errorBody("DOCUMENT_NO_REQUIRED", "Gönderilmiş İşNet irsaliye numarası zorunludur."), 400);
    const saved = await storePut(c, SCOPE.autoFlow, id, { ...current, outgoingDocumentNo: no, status: "PRICE_REQUIRED" }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });

  app.patch("/api/isnet/auto-flows/:id/invoice-state", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const current = await storeGet(c, SCOPE.autoFlow, id, slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "İş akışı bulunamadı."), 404);
    const saved = await storePut(c, SCOPE.autoFlow, id, { ...current, ...body }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });

  app.get("/api/isnet/runtime-v2/status", async (c) => {
    const slug = slugOf(c); const settings = await settingsRaw(c, slug); const docs = await normalizedDocuments(c, slug);
    return c.json({ ok: true, success: true, data: { connection: publicSettings(settings), documentCount: docs.length, categories: Object.fromEntries([...new Set(docs.map((row) => row.category))].map((category) => [category, docs.filter((row) => row.category === category).length])) } });
  });
}
