// @ts-nocheck
import type { Context, Hono } from "hono";
import { getAuthenticatedUser } from "./auth-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const API_BASE = "https://einvoiceapi.isnet.net.tr";
const SETTINGS_SCOPE = "ISNET_SETTINGS";
const PORTAL_SCOPE = "ISNET_PORTAL_DOCUMENT";
const STATE_SCOPE = "ISNET_DOCUMENT_STATE";
const PORTAL_BASES = ["https://efatura.isnet.net.tr", "https://nettefatura.isnet.net.tr"];
const API_PAGE_SIZE = 250;
const API_MAX_PAGES = 20;
const PORTAL_PAGE_SIZE = 300;
const PORTAL_MAX_START = 5000;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const moneyNum = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = text(value).replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    raw = raw.replace(/,/g, ".");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) => text(value)
  .toLocaleUpperCase("tr-TR")
  .replace(/İ/g, "I")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

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

function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

async function bodyOf(c: Context<AppEnv>) {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Row : {};
  } catch {
    return {};
  }
}

function isOwnerRole(value: unknown) {
  const role = text(value).toUpperCase().replace(/İ/g, "I");
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

async function companyContext(c: Context<AppEnv>, body: Row = {}) {
  const current = await getAuthenticatedUser(c);
  if (!current) {
    return { ok: false as const, status: 401, error: errorBody("UNAUTHORIZED", "Geçerli oturum gereklidir.") };
  }
  const requested = text(
    body.mainCompanySlug || body.main_company_slug ||
    c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") ||
    c.req.header("X-KYERP-Tenant-Slug"),
  );
  const ownSlug = text(current.mainCompanySlug || current.main_company_slug);
  const slug = requested || ownSlug;
  if (!slug) {
    return { ok: false as const, status: 400, error: errorBody("MAIN_COMPANY_REQUIRED", "Ana firma bağlamı zorunludur.") };
  }
  if (!isOwnerRole(current.role) && ownSlug && slug !== ownSlug) {
    return { ok: false as const, status: 403, error: errorBody("MAIN_COMPANY_FORBIDDEN", "Başka ana firmanın İşNet verisine erişilemez.") };
  }
  return { ok: true as const, slug, current };
}

function validYmd(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function canonicalDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    return validYmd(year, month, day) ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : "";
  }

  const dmy = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:[T\s].*)?$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (!validYmd(year, month, day)) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const msDate = raw.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/i);
  if (msDate) {
    const parsed = new Date(Number(msDate[1]));
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "";
  }

  return "";
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

async function settingRow(c: Context<AppEnv>, slug: string) {
  if (!(await tableExists(c, "json_store"))) return {};
  const row = await c.env.DB.prepare(
    `SELECT data FROM json_store
      WHERE scope=? AND file_name=?
        AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY CASE WHEN main_company_slug=? THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1`,
  ).bind(SETTINGS_SCOPE, slug, slug, slug).first<Row>();
  return objectOf(row?.data);
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, slug: string, data: Row) {
  if (!(await tableExists(c, "json_store"))) return;
  const row = await c.env.DB.prepare(
    `SELECT id,data FROM json_store
      WHERE scope=? AND file_name=?
        AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY CASE WHEN main_company_slug=? THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1`,
  ).bind(scope, fileName, slug, slug).first<Row>();
  const timestamp = nowIso();
  const payload = JSON.stringify({ ...objectOf(row?.data), ...data, updatedAt: timestamp });
  if (row?.id) {
    await c.env.DB.prepare(
      "UPDATE json_store SET main_company_slug=?,data=?,updated_at=? WHERE id=?",
    ).bind(slug, payload, timestamp, row.id).run();
    return;
  }
  await c.env.DB.prepare(
    "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), scope, slug, fileName, payload, timestamp, timestamp).run();
}

function deepValue(value: unknown, keys: string[], depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > 3) return undefined;
  const row = value as Row;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && text(row[key])) return row[key];
  }
  for (const child of Object.values(row)) {
    if (!child || typeof child !== "object") continue;
    const found = deepValue(child, keys, depth + 1);
    if (found !== undefined && found !== null && text(found)) return found;
  }
  return undefined;
}

function normalizeOutgoing(kind: "invoice" | "dispatch", row: Row, source: string) {
  const invoice = kind === "invoice";
  const sourceId = text(deepValue(row, invoice
    ? ["InvoiceId", "IdFatura", "IdFaturaGiden", "IdFaturaCikan", "Id", "id"]
    : ["DespatchId", "DespatchAdviceId", "IdIrsaliye", "IdIrsaliyeGiden", "IdIrsaliyeCikan", "Id", "id"]));
  const rawDocumentNo = text(deepValue(row, invoice
    ? ["InvoiceNumber", "FaturaNo", "DocumentNo", "BelgeNo", "Number"]
    : ["DespatchNumber", "DespatchAdviceNumber", "IrsaliyeNo", "DocumentNo", "BelgeNo", "Number"]));
  const rawDateText = text(deepValue(row, invoice
    ? ["InvoiceDate", "FaturaTarihiFormated", "FaturaTarihi", "IssueDate", "Date"]
    : ["DespatchDate", "IrsaliyeTarihiFormated", "IrsaliyeTarihi", "IssueDate", "Date"]));
  const partnerName = text(deepValue(row, [
    "RecipientCompanyName", "AliciAdi", "MusteriAdi", "FirmaAdi", "CompanyName", "RecipientName",
  ]));
  const partnerTaxNo = text(deepValue(row, ["AliciVkn", "VknTckn", "VNKTCKN", "VKN", "TCKN", "RecipientVkn"]));
  const amount = invoice ? moneyNum(deepValue(row, [
    "PayableAmount", "InvoiceTotalLineAmount", "OdenecekTutar", "GrandTotal", "TotalAmount",
  ])) : 0;
  const currency = invoice ? text(deepValue(row, ["CurrencyCode", "DovizKodu", "Currency"])) : "";
  const statusText = text(deepValue(row, ["Status", "DurumAdi", "GonderimDurumAdi", "ReportStatus"]));
  const uuid = text(deepValue(row, ["Ettn", "ETTN", "UUID", "Uuid"]));
  const stableIdentity = rawDocumentNo || sourceId || uuid;
  const documentNo = rawDocumentNo || sourceId || uuid;
  const dateText = canonicalDate(rawDateText);
  return {
    id: stableIdentity ? `outgoing-${kind}-${stableIdentity}` : `outgoing-${kind}-unidentified`,
    identifiable: Boolean(stableIdentity),
    sourceId: sourceId || uuid || rawDocumentNo,
    kind,
    direction: "outgoing",
    documentNo,
    rawDocumentNo,
    dateText,
    rawDateText,
    transferDateText: dateText,
    partnerName,
    partnerTaxNo,
    scenarioText: text(deepValue(row, ["ScenarioName", "SenaryoAdi", "Scenario"])),
    subtypeText: text(deepValue(row, invoice ? ["InvoiceTypeName", "FaturaTipiAdi", "InvoiceType"] : ["DespatchTypeName", "IrsaliyeTipiAdi", "DespatchAdviceType"])),
    statusText,
    amount,
    amountText: amount ? String(amount) : "",
    currency,
    uuid,
    recoverySource: source,
    raw: row,
  };
}

function apiDate(value: string) {
  const normalized = canonicalDate(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function reportedTotal(payload: Row) {
  const candidates = [
    payload?.recordsFiltered,
    payload?.recordsTotal,
    payload?.total,
    payload?.Total,
    payload?.totalCount,
    payload?.TotalCount,
    payload?.TotalRecordCount,
  ];
  for (const candidate of candidates) {
    const value = num(candidate);
    if (value > 0) return value;
  }
  return 0;
}

async function apiPost(settings: Row, endpoint: string, body: Row) {
  const token = text(settings.accessToken);
  if (!token) throw new Error("İşNet API oturumu yok.");
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Token: token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`İşNet API JSON yerine farklı yanıt döndürdü (${response.status}).`); }
  const error = text(payload?.ErrorMessage || payload?.errorMessage || payload?.Message || payload?.message);
  if (!response.ok || error) throw new Error(error || `İşNet API HTTP ${response.status}`);
  return payload;
}

async function apiOutgoing(settings: Row, startDate: string, endDate: string) {
  const companyId = Number(settings.companyId || 0);
  if (!companyId || !text(settings.accessToken)) throw new Error("İşNet API tokenı veya firma seçimi yok.");
  const first = apiDate(startDate);
  const last = apiDate(endDate);
  const results: Row[] = [];
  const calls = [
    {
      kind: "invoice" as const,
      endpoint: "/api/Invoice/GetSentStagingInvoiceList",
      listKey: "Invoices",
      base: { CompanyId: companyId, InvoiceNumber: "", FirstInvoiceDate: first, LastInvoiceDate: last, AliciAdi: "", AliciVkn: "", IsArchiveIncluded: true },
    },
    {
      kind: "invoice" as const,
      endpoint: "/api/Invoice/GetEArchiveInvoiceList",
      listKey: "Invoices",
      base: { CompanyId: companyId, InvoiceNumber: "", FirstInvoiceDate: first, LastInvoiceDate: last, AliciAdi: "", AliciVkn: "", IsArchiveIncluded: true },
    },
    {
      kind: "dispatch" as const,
      endpoint: "/api/Invoice/GetSentStagingDespatchList",
      listKey: "Despatches",
      base: { CompanyId: companyId, DespatchNumber: "", FirstDespatchDate: first, LastDespatchDate: last, AliciAdi: "", AliciVkn: "" },
    },
  ];
  const diagnostics: Row[] = [];
  for (const call of calls) {
    let count = 0;
    let partial = false;
    let exhaustedNaturally = false;
    let total = 0;
    try {
      for (let page = 1; page <= API_MAX_PAGES; page += 1) {
        const payload = await apiPost(settings, call.endpoint, { ...call.base, PageIndex: page, PageSize: API_PAGE_SIZE });
        const rows = Array.isArray(payload?.[call.listKey]) ? payload[call.listKey] : Array.isArray(payload?.data) ? payload.data : [];
        for (const row of rows) results.push(normalizeOutgoing(call.kind, row, `API:${call.endpoint}`));
        count += rows.length;
        total = Math.max(total, reportedTotal(payload));
        if (rows.length < API_PAGE_SIZE) {
          exhaustedNaturally = true;
          break;
        }
        if (total > 0 && count >= total) {
          exhaustedNaturally = true;
          break;
        }
        if (page === API_MAX_PAGES) partial = true;
      }
      if (!exhaustedNaturally && count >= API_PAGE_SIZE * API_MAX_PAGES) partial = true;
      diagnostics.push({
        endpoint: call.endpoint,
        kind: call.kind,
        ok: true,
        count,
        partial,
        reportedTotal: total || null,
        pageSize: API_PAGE_SIZE,
        maxPages: API_MAX_PAGES,
      });
    } catch (error: any) {
      diagnostics.push({ endpoint: call.endpoint, kind: call.kind, ok: false, count, partial: true, error: text(error?.message) });
    }
  }
  if (!diagnostics.some((row) => row.ok)) {
    throw new Error(diagnostics.map((row) => `${row.endpoint}: ${row.error || "başarısız"}`).join(" | "));
  }
  return { docs: results, diagnostics };
}

function verificationToken(html: string) {
  return text(
    html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
    html.match(/value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i)?.[1],
  );
}

async function portalRequest(base: string, cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Outgoing-Recovery/1.0",
      ...(init.headers || {}),
      Cookie: cookie,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

async function portalOutgoing(settings: Row, startDate: string, endDate: string) {
  const cookie = text(settings.portalCookie);
  const companyId = text(settings.companyId);
  const configuredBase = text(settings.portalBase);
  const base = PORTAL_BASES.includes(configuredBase) ? configuredBase : PORTAL_BASES[0];
  if (!cookie || !companyId || settings.portalCompanySelected !== true) throw new Error("İşNet portal oturumu hazır değil.");
  const sources = [
    { kind: "invoice" as const, page: `/OutgoingInvoice/OutgoingInvoiceList?minDate=${startDate}`, endpoint: "/OutgoingInvoice/AllOutgoingInvoiceByFilter" },
    { kind: "dispatch" as const, page: "/OutgoingDespatch/OutgoingDespatchList", endpoint: "/OutgoingDespatch/AllOutgoingDespatchByFilter" },
  ];
  const docs: Row[] = [];
  const diagnostics: Row[] = [];
  for (const source of sources) {
    let count = 0;
    let total = 0;
    let partial = false;
    let exhaustedNaturally = false;
    try {
      const pageResponse = await portalRequest(base, cookie, source.page);
      const html = await pageResponse.text();
      const token = verificationToken(html);
      if (!pageResponse.ok || !token || /type=["']password["']/i.test(html)) throw new Error("Portal oturumu sona ermiş olabilir.");

      for (let start = 0; start < PORTAL_MAX_START; start += PORTAL_PAGE_SIZE) {
        const form: Record<string, string> = {
          draw: "1",
          start: String(start),
          length: String(PORTAL_PAGE_SIZE),
          "search[value]": "",
          "search[regex]": "false",
          CompanyIdFilter: companyId,
          __RequestVerificationToken: token,
          IlkTarih: apiDate(startDate),
          SonTarih: apiDate(endDate),
        };
        if (source.kind === "invoice") {
          form.FaturaIlkTarihi = apiDate(startDate);
          form.FaturaSonTarihi = apiDate(endDate);
        } else {
          form.IrsaliyeIlkTarihi = apiDate(startDate);
          form.IrsaliyeSonTarihi = apiDate(endDate);
        }
        const response = await portalRequest(base, cookie, source.endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Referer: `${base}${source.page}`,
            "X-Requested-With": "XMLHttpRequest",
          },
          body: new URLSearchParams(form).toString(),
        });
        const raw = await response.text();
        let payload: any = {};
        try { payload = raw ? JSON.parse(raw) : {}; }
        catch { throw new Error(`Portal JSON yerine farklı yanıt döndürdü (${response.status}).`); }
        if (!response.ok) throw new Error(`Portal HTTP ${response.status}`);

        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.Data) ? payload.Data : Array.isArray(payload?.aaData) ? payload.aaData : [];
        for (const row of rows) docs.push(normalizeOutgoing(source.kind, row, `PORTAL:${source.endpoint}`));
        count += rows.length;
        total = Math.max(total, reportedTotal(payload));

        if (rows.length < PORTAL_PAGE_SIZE) {
          exhaustedNaturally = true;
          break;
        }
        if (total > 0 && count >= total) {
          exhaustedNaturally = true;
          break;
        }
      }

      if (!exhaustedNaturally) partial = true;
      diagnostics.push({
        endpoint: source.endpoint,
        kind: source.kind,
        ok: true,
        count,
        partial,
        reportedTotal: total || null,
        pageSize: PORTAL_PAGE_SIZE,
        maxStart: PORTAL_MAX_START,
      });
    } catch (error: any) {
      diagnostics.push({ endpoint: source.endpoint, kind: source.kind, ok: false, count, partial: true, error: text(error?.message) });
    }
  }
  if (!diagnostics.some((row) => row.ok)) {
    throw new Error(diagnostics.map((row) => `${row.endpoint}: ${row.error || "başarısız"}`).join(" | "));
  }
  return { docs, diagnostics };
}

async function companyIdByIdentity(c: Context<AppEnv>, slug: string, name: string, taxNo: string) {
  if (!(await tableExists(c, "companies")) || (!text(name) && !text(taxNo))) return "";
  const cols = await columns(c, "companies");
  const clauses = cols.has("main_company_slug") ? ["main_company_slug=?"] : [];
  const binds: any[] = cols.has("main_company_slug") ? [slug] : [];
  if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const selectTaxNo = cols.has("tax_no") ? "tax_no" : "NULL AS tax_no";
  const result = await c.env.DB.prepare(
    `SELECT id,name,normalized_name,${selectTaxNo} FROM companies${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} LIMIT 5000`,
  ).bind(...binds).all<Row>();
  const wantedTaxNo = text(taxNo).replace(/\D/g, "");
  if (wantedTaxNo) {
    const taxMatch = (result.results || []).find((item) => text(item.tax_no).replace(/\D/g, "") === wantedTaxNo);
    if (taxMatch?.id) return text(taxMatch.id);
  }
  const wanted = normalize(name);
  if (!wanted) return "";
  const nameMatch = (result.results || []).find((item) => normalize(item.name) === wanted || normalize(item.normalized_name) === wanted);
  return text(nameMatch?.id);
}

async function insertDynamic(c: Context<AppEnv>, table: string, values: Row) {
  const cols = await columns(c, table);
  const entries = Object.entries(values).filter(([key]) => cols.has(key));
  if (!entries.length) return;
  await c.env.DB.prepare(`INSERT INTO ${table} (${entries.map(([key]) => `"${key}"`).join(",")}) VALUES (${entries.map(() => "?").join(",")})`)
    .bind(...entries.map(([, value]) => typeof value === "object" && value !== null ? JSON.stringify(value) : value)).run();
}

async function updateDynamic(c: Context<AppEnv>, table: string, id: string, values: Row) {
  const cols = await columns(c, table);
  const entries = Object.entries(values).filter(([key]) => cols.has(key));
  if (!entries.length) return;
  await c.env.DB.prepare(`UPDATE ${table} SET ${entries.map(([key]) => `"${key}"=?`).join(",")} WHERE id=?`)
    .bind(...entries.map(([, value]) => typeof value === "object" && value !== null ? JSON.stringify(value) : value), id).run();
}

async function persistDocument(c: Context<AppEnv>, slug: string, doc: Row) {
  if (!(await tableExists(c, "documents"))) throw new Error("documents tablosu bulunamadı.");
  const documentNo = text(doc.documentNo || doc.sourceId || doc.uuid);
  if (!documentNo) throw new Error("İşNet belgesi güvenli kimlik olmadan kaydedilemez.");
  const documentType = doc.kind === "invoice" ? "CUSTOMER_INVOICE" : "OUTGOING_DISPATCH";
  const existing = await c.env.DB.prepare(
    "SELECT id FROM documents WHERE main_company_slug=? AND document_no=? AND document_type=? LIMIT 1",
  ).bind(slug, documentNo, documentType).first<Row>();
  const companyId = await companyIdByIdentity(c, slug, doc.partnerName, doc.partnerTaxNo);
  const metadata = {
    source: "ISNET_OUTGOING_RECOVERY",
    direction: "outgoing",
    kind: doc.kind,
    documentNo,
    originalDocumentNo: doc.rawDocumentNo,
    companyName: doc.partnerName,
    partnerName: doc.partnerName,
    partnerTaxNo: doc.partnerTaxNo,
    portalSourceId: doc.sourceId,
    automationKey: doc.automationKey,
    uuid: doc.uuid,
    currency: doc.currency,
    recoverySource: doc.recoverySource,
    rawDateText: doc.rawDateText,
    canonicalDate: doc.dateText || null,
  };
  const values = {
    main_company_slug: slug,
    company_id: companyId || null,
    document_type: documentType,
    target_type: documentType,
    detected_type: documentType,
    document_no: documentNo,
    date: canonicalDate(doc.dateText) || null,
    source_type: "ISNET_DIRECT",
    status: doc.statusText || "PROCESSED",
    grand_total: moneyNum(doc.amount),
    metadata,
    raw: { ...metadata, raw: doc.raw },
    updated_at: nowIso(),
  };
  if (existing?.id) {
    await updateDynamic(c, "documents", text(existing.id), values);
    return { created: false, id: text(existing.id) };
  }
  const id = crypto.randomUUID();
  await insertDynamic(c, "documents", { id, ...values, created_at: nowIso() });
  return { created: true, id };
}

function dedupe(docs: Row[]) {
  const map = new Map<string, Row>();
  let unidentifiedSkipped = 0;
  for (const doc of docs) {
    const identity = text(doc.documentNo || doc.sourceId || doc.uuid);
    if (!identity || doc.identifiable === false) {
      unidentifiedSkipped += 1;
      continue;
    }
    const key = `${doc.kind}:${normalize(identity)}`;
    const current = map.get(key);
    if (!current || String(doc.recoverySource).startsWith("API:")) map.set(key, { ...doc, documentNo: text(doc.documentNo || identity) });
  }
  return { docs: [...map.values()], unidentifiedSkipped };
}

function channelComplete(channel: Row | null | undefined) {
  if (!channel || channel.ok !== true || !Array.isArray(channel.calls) || !channel.calls.length) return false;
  return channel.calls.every((call: Row) => call?.ok === true && call?.partial !== true);
}

export function registerIsnetOutgoingRecoveryRoutes(app: Hono<AppEnv>) {
  app.get("/api/isnet/outgoing/diagnostics", async (c) => {
    const context = await companyContext(c);
    if (!context.ok) return c.json(context.error, context.status as any);
    const slug = context.slug;
    const settings = await settingRow(c, slug);
    const portalRows = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM json_store WHERE scope=? AND main_company_slug=? AND file_name LIKE 'outgoing:%'`,
    ).bind(PORTAL_SCOPE, slug).first<Row>();
    const invoiceRows = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM documents WHERE main_company_slug=? AND document_type='CUSTOMER_INVOICE' AND source_type LIKE 'ISNET%'",
    ).bind(slug).first<Row>();
    const dispatchRows = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM documents WHERE main_company_slug=? AND document_type='OUTGOING_DISPATCH' AND source_type LIKE 'ISNET%'",
    ).bind(slug).first<Row>();
    return c.json({ ok: true, success: true, data: {
      mainCompanySlug: slug,
      apiSessionReady: Boolean(text(settings.accessToken)),
      portalSessionReady: Boolean(text(settings.portalCookie) && settings.portalCompanySelected === true),
      companyId: text(settings.companyId),
      outgoingPortalRows: num(portalRows?.total),
      outgoingInvoiceRows: num(invoiceRows?.total),
      outgoingDispatchRows: num(dispatchRows?.total),
    } });
  });

  app.post("/api/isnet/outgoing/recover", async (c) => {
    const body = await bodyOf(c);
    const context = await companyContext(c, body);
    if (!context.ok) return c.json(context.error, context.status as any);
    const slug = context.slug;
    const settings = await settingRow(c, slug);

    const requestedStartDate = text(body.startDate);
    const requestedEndDate = text(body.endDate);
    const startDate = requestedStartDate ? canonicalDate(requestedStartDate) : "2026-08-01";
    const endDate = requestedEndDate ? canonicalDate(requestedEndDate) : nowIso().slice(0, 10);
    if ((requestedStartDate && !startDate) || (requestedEndDate && !endDate)) {
      return c.json(errorBody("ISNET_DATE_INVALID", "İşNet tarih aralığı geçersiz. Tarih YYYY-MM-DD veya GG.AA.YYYY olmalıdır."), 400);
    }
    if (startDate > endDate) {
      return c.json(errorBody("ISNET_DATE_RANGE_INVALID", "Başlangıç tarihi bitiş tarihinden sonra olamaz."), 400);
    }
    if (!text(settings.companyId)) {
      return c.json(errorBody("ISNET_COMPANY_REQUIRED", "Bu ana firma için İşNet yetkili firma seçilmemiş."), 409);
    }

    const diagnostics: Row = { api: null, portal: null };
    const collected: Row[] = [];
    if (text(settings.accessToken)) {
      try {
        const api = await apiOutgoing(settings, startDate, endDate);
        collected.push(...api.docs);
        diagnostics.api = { ok: true, calls: api.diagnostics };
      } catch (error: any) {
        diagnostics.api = { ok: false, error: text(error?.message) };
      }
    } else {
      diagnostics.api = { ok: false, error: "API tokenı yok." };
    }

    if (text(settings.portalCookie) && settings.portalCompanySelected === true) {
      try {
        const portal = await portalOutgoing(settings, startDate, endDate);
        collected.push(...portal.docs);
        diagnostics.portal = { ok: true, calls: portal.diagnostics };
      } catch (error: any) {
        diagnostics.portal = { ok: false, error: text(error?.message) };
      }
    } else {
      diagnostics.portal = { ok: false, error: "Portal oturumu hazır değil." };
    }

    if (!collected.length && diagnostics.api?.ok !== true && diagnostics.portal?.ok !== true) {
      return c.json(errorBody("ISNET_OUTGOING_RECOVERY_FAILED", "İşNet giden belgeleri alınamadı.", diagnostics), 502);
    }

    const deduped = dedupe(collected);
    const docs = deduped.docs;
    const apiComplete = channelComplete(diagnostics.api);
    const portalComplete = channelComplete(diagnostics.portal);
    const transportComplete = apiComplete || portalComplete;
    const missingDateCount = docs.filter((doc) => !text(doc.dateText)).length;
    const prePersistReviewRequired = !transportComplete || deduped.unidentifiedSkipped > 0 || missingDateCount > 0;

    let created = 0;
    let updated = 0;
    let invoices = 0;
    let dispatches = 0;
    const persistenceErrors: Row[] = [];
    for (const baseDoc of docs) {
      const stableId = text(baseDoc.sourceId || baseDoc.documentNo || baseDoc.uuid);
      const automationKey = `outgoing:${baseDoc.kind}:${stableId}`;
      const doc = { ...baseDoc, automationKey };
      try {
        await storePut(c, PORTAL_SCOPE, automationKey, slug, doc);
        await storePut(c, STATE_SCOPE, automationKey, slug, {
          ...doc,
          completed: false,
          recoveryStatus: prePersistReviewRequired ? "PARTIAL_REVIEW_REQUIRED" : "RECOVERED",
          lastAttemptAt: nowIso(),
        });
        const persisted = await persistDocument(c, slug, doc);
        if (persisted.created) created += 1;
        else updated += 1;
        if (doc.kind === "invoice") invoices += 1;
        else dispatches += 1;
      } catch (error: any) {
        persistenceErrors.push({
          kind: doc.kind,
          documentNo: text(doc.documentNo),
          sourceId: text(doc.sourceId),
          error: text(error?.message) || "Kayıt hatası",
        });
      }
    }

    const requiresReview = prePersistReviewRequired || persistenceErrors.length > 0;
    const status = requiresReview ? "PARTIAL_REVIEW_REQUIRED" : "COMPLETED";
    const warning = requiresReview
      ? "İşNet giden belge kurtarması tam doğrulanamadı. Eksik/limitli kaynak, kimlik-tarih sorunu veya kayıt hatası için daha dar tarih aralığıyla yeniden kontrol edin."
      : "";

    const result = {
      status,
      requiresReview,
      warning: warning || null,
      mainCompanySlug: slug,
      startDate,
      endDate,
      total: docs.length,
      counts: {
        outgoingInvoices: invoices,
        outgoingDispatches: dispatches,
        created,
        updated,
        unidentifiedSkipped: deduped.unidentifiedSkipped,
        missingDate: missingDateCount,
        persistenceErrors: persistenceErrors.length,
      },
      coverage: {
        apiComplete,
        portalComplete,
        transportComplete,
      },
      diagnostics,
      persistenceErrors,
      completedAt: nowIso(),
    };

    if (persistenceErrors.length > 0) {
      return c.json(errorBody(
        "ISNET_OUTGOING_PERSIST_PARTIAL",
        "İşNet belgelerinin bir bölümü alınmış olsa da tüm kayıtlar güvenle yazılamadı. İşlem tamamlandı sayılmadı.",
        result,
      ), 500);
    }

    return c.json({ ok: true, success: true, data: result });
  });
}
