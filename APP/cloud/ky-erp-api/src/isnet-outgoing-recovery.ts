// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const API_BASE = "https://einvoiceapi.isnet.net.tr";
const SETTINGS_SCOPE = "ISNET_SETTINGS";
const PORTAL_SCOPE = "ISNET_PORTAL_DOCUMENT";
const STATE_SCOPE = "ISNET_DOCUMENT_STATE";
const PORTAL_BASES = ["https://efatura.isnet.net.tr", "https://nettefatura.isnet.net.tr"];

const text = (value: unknown) => value == null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
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

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug || body.main_company_slug ||
    c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") ||
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
  const documentNo = text(deepValue(row, invoice
    ? ["InvoiceNumber", "FaturaNo", "DocumentNo", "BelgeNo", "Number"]
    : ["DespatchNumber", "DespatchAdviceNumber", "IrsaliyeNo", "DocumentNo", "BelgeNo", "Number"]));
  const date = text(deepValue(row, invoice
    ? ["InvoiceDate", "FaturaTarihiFormated", "FaturaTarihi", "IssueDate", "Date"]
    : ["DespatchDate", "IrsaliyeTarihiFormated", "IrsaliyeTarihi", "IssueDate", "Date"]));
  const partnerName = text(deepValue(row, [
    "RecipientCompanyName", "AliciAdi", "MusteriAdi", "FirmaAdi", "CompanyName", "RecipientName",
  ]));
  const partnerTaxNo = text(deepValue(row, ["AliciVkn", "VknTckn", "VNKTCKN", "VKN", "TCKN", "RecipientVkn"]));
  const amount = invoice ? num(deepValue(row, [
    "PayableAmount", "InvoiceTotalLineAmount", "OdenecekTutar", "GrandTotal", "TotalAmount",
  ])) : 0;
  const currency = invoice ? text(deepValue(row, ["CurrencyCode", "DovizKodu", "Currency"])) : "";
  const statusText = text(deepValue(row, ["Status", "DurumAdi", "GonderimDurumAdi", "ReportStatus"]));
  const uuid = text(deepValue(row, ["Ettn", "ETTN", "UUID", "Uuid"]));
  return {
    id: `outgoing-${kind}-${sourceId || documentNo}`,
    sourceId: sourceId || documentNo,
    kind,
    direction: "outgoing",
    documentNo,
    dateText: date,
    transferDateText: date,
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
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : text(value);
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
    try {
      for (let page = 1; page <= 20; page += 1) {
        const payload = await apiPost(settings, call.endpoint, { ...call.base, PageIndex: page, PageSize: 250 });
        const rows = Array.isArray(payload?.[call.listKey]) ? payload[call.listKey] : Array.isArray(payload?.data) ? payload.data : [];
        for (const row of rows) results.push(normalizeOutgoing(call.kind, row, `API:${call.endpoint}`));
        count += rows.length;
        if (rows.length < 250) break;
      }
      diagnostics.push({ endpoint: call.endpoint, ok: true, count });
    } catch (error: any) {
      diagnostics.push({ endpoint: call.endpoint, ok: false, count, error: text(error?.message) });
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
  const base = PORTAL_BASES.includes(text(settings.portalBase)) ? text(settings.portalBase) : (text(settings.portalBase) || PORTAL_BASES[0]);
  if (!cookie || !companyId || settings.portalCompanySelected !== true) throw new Error("İşNet portal oturumu hazır değil.");
  const sources = [
    { kind: "invoice" as const, page: `/OutgoingInvoice/OutgoingInvoiceList?minDate=${startDate}`, endpoint: "/OutgoingInvoice/AllOutgoingInvoiceByFilter" },
    { kind: "dispatch" as const, page: "/OutgoingDespatch/OutgoingDespatchList", endpoint: "/OutgoingDespatch/AllOutgoingDespatchByFilter" },
  ];
  const docs: Row[] = [];
  const diagnostics: Row[] = [];
  for (const source of sources) {
    try {
      const pageResponse = await portalRequest(base, cookie, source.page);
      const html = await pageResponse.text();
      const token = verificationToken(html);
      if (!pageResponse.ok || !token || /type=["']password["']/i.test(html)) throw new Error("Portal oturumu sona ermiş olabilir.");
      let count = 0;
      for (let start = 0; start < 5000; start += 300) {
        const form: Record<string, string> = {
          draw: "1", start: String(start), length: "300", "search[value]": "", "search[regex]": "false",
          CompanyIdFilter: companyId, __RequestVerificationToken: token,
          IlkTarih: apiDate(startDate), SonTarih: apiDate(endDate),
        };
        if (source.kind === "invoice") {
          form.FaturaIlkTarihi = apiDate(startDate); form.FaturaSonTarihi = apiDate(endDate);
        } else {
          form.IrsaliyeIlkTarihi = apiDate(startDate); form.IrsaliyeSonTarihi = apiDate(endDate);
        }
        const response = await portalRequest(base, cookie, source.endpoint, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: `${base}${source.page}`, "X-Requested-With": "XMLHttpRequest" },
          body: new URLSearchParams(form).toString(),
        });
        const raw = await response.text();
        let payload: any = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.Data) ? payload.Data : Array.isArray(payload?.aaData) ? payload.aaData : [];
        if (!response.ok) throw new Error(`Portal HTTP ${response.status}`);
        for (const row of rows) docs.push(normalizeOutgoing(source.kind, row, `PORTAL:${source.endpoint}`));
        count += rows.length;
        const total = num(payload.recordsFiltered || payload.recordsTotal || count);
        if (rows.length < 300 || start + 300 >= total) break;
      }
      diagnostics.push({ endpoint: source.endpoint, ok: true, count });
    } catch (error: any) {
      diagnostics.push({ endpoint: source.endpoint, ok: false, count: 0, error: text(error?.message) });
    }
  }
  if (!diagnostics.some((row) => row.ok)) throw new Error(diagnostics.map((row) => `${row.endpoint}: ${row.error || "başarısız"}`).join(" | "));
  return { docs, diagnostics };
}

async function companyIdByName(c: Context<AppEnv>, slug: string, name: string) {
  if (!(await tableExists(c, "companies")) || !text(name)) return "";
  const cols = await columns(c, "companies");
  const clauses = cols.has("main_company_slug") ? ["main_company_slug=?"] : [];
  const binds: any[] = cols.has("main_company_slug") ? [slug] : [];
  if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const result = await c.env.DB.prepare(`SELECT id,name,normalized_name FROM companies${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} LIMIT 5000`).bind(...binds).all<Row>();
  const wanted = normalize(name);
  const row = (result.results || []).find((item) => normalize(item.name) === wanted || normalize(item.normalized_name) === wanted);
  return text(row?.id);
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
  if (!(await tableExists(c, "documents"))) return { created: false, id: "" };
  const documentType = doc.kind === "invoice" ? "CUSTOMER_INVOICE" : "OUTGOING_DISPATCH";
  const existing = await c.env.DB.prepare(
    "SELECT id FROM documents WHERE main_company_slug=? AND document_no=? AND document_type=? LIMIT 1",
  ).bind(slug, doc.documentNo, documentType).first<Row>();
  const companyId = await companyIdByName(c, slug, doc.partnerName);
  const metadata = {
    source: "ISNET_OUTGOING_RECOVERY", direction: "outgoing", kind: doc.kind,
    documentNo: doc.documentNo, companyName: doc.partnerName, partnerName: doc.partnerName,
    partnerTaxNo: doc.partnerTaxNo, portalSourceId: doc.sourceId, automationKey: doc.automationKey,
    uuid: doc.uuid, currency: doc.currency, recoverySource: doc.recoverySource,
  };
  const values = {
    main_company_slug: slug,
    company_id: companyId || null,
    document_type: documentType,
    target_type: documentType,
    detected_type: documentType,
    document_no: doc.documentNo,
    date: doc.dateText || nowIso().slice(0, 10),
    source_type: "ISNET_DIRECT",
    status: doc.statusText || "PROCESSED",
    grand_total: num(doc.amount),
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
  for (const doc of docs) {
    if (!text(doc.documentNo)) continue;
    const key = `${doc.kind}:${normalize(doc.documentNo)}`;
    const current = map.get(key);
    if (!current || String(doc.recoverySource).startsWith("API:")) map.set(key, doc);
  }
  return [...map.values()];
}

export function registerIsnetOutgoingRecoveryRoutes(app: Hono<AppEnv>) {
  app.get("/api/isnet/outgoing/diagnostics", async (c) => {
    const slug = slugOf(c);
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
    const slug = slugOf(c, body);
    const settings = await settingRow(c, slug);
    const endDate = text(body.endDate) || nowIso().slice(0, 10);
    const startDate = text(body.startDate) || "2026-08-01";
    if (!text(settings.companyId)) return c.json(errorBody("ISNET_COMPANY_REQUIRED", "İşNet yetkili firma seçilmemiş."), 409);

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

    const docs = dedupe(collected);
    let created = 0;
    let updated = 0;
    let invoices = 0;
    let dispatches = 0;
    for (const baseDoc of docs) {
      const automationKey = `outgoing:${baseDoc.kind}:${baseDoc.sourceId}`;
      const doc = { ...baseDoc, automationKey };
      await storePut(c, PORTAL_SCOPE, automationKey, slug, doc);
      await storePut(c, STATE_SCOPE, automationKey, slug, { ...doc, completed: false, lastAttemptAt: nowIso() });
      const persisted = await persistDocument(c, slug, doc);
      if (persisted.created) created += 1; else updated += 1;
      if (doc.kind === "invoice") invoices += 1; else dispatches += 1;
    }

    return c.json({ ok: true, success: true, data: {
      status: "COMPLETED",
      startDate,
      endDate,
      total: docs.length,
      counts: { outgoingInvoices: invoices, outgoingDispatches: dispatches, created, updated },
      diagnostics,
      completedAt: nowIso(),
    } });
  });
}
