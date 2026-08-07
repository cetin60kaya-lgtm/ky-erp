// @ts-nocheck
import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const SCOPES = {
  settings: "ISNET_SETTINGS",
  portalDocument: "ISNET_PORTAL_DOCUMENT",
  documentState: "ISNET_DOCUMENT_STATE",
  intake: "ISNET_INTAKE",
  draft: "ISNET_DRAFT",
  mail: "ISNET_MAIL_PACKAGE",
  template: "ISNET_INVOICE_TEMPLATE",
  sync: "ISNET_SYNC_RUN",
  model: "DESEN_WORKFLOW_MODEL",
} as const;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const normalize = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Row)
      : {};
  } catch {
    return {};
  }
}

function arrayOf(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
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
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Row)
      : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    c.req.header("X-KYERP-Tenant-Slug") ||
      body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

function safeUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

async function tableExists(c: Context<AppEnv>, table: string) {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  )
    .bind(table)
    .first<Row>();
  return Boolean(row?.name);
}

async function columns(c: Context<AppEnv>, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const result = await c.env.DB.prepare(`PRAGMA table_info("${table}")`).all<Row>();
  return new Set((result.results || []).map((row) => text(row.name)));
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return [];
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  )
    .bind(scope, slug)
    .all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  }));
}

async function storeGet(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1`,
  )
    .bind(scope, fileName, slug)
    .first<Row>();
  if (!row) return null;
  return {
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  };
}

async function storePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: Row,
  slug: string,
) {
  const existing = await storeGet(c, scope, fileName, slug);
  const timestamp = nowIso();
  const payload = { ...data, updatedAt: timestamp };
  if (existing?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data = ?, updated_at = ?
        WHERE id = ? AND (main_company_slug = ? OR main_company_slug IS NULL)`,
    )
      .bind(JSON.stringify(payload), timestamp, existing.storeId, slug)
      .run();
    return { ...payload, storeId: existing.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      scope,
      slug || null,
      fileName,
      JSON.stringify(payload),
      timestamp,
      timestamp,
    )
    .run();
  return { ...payload, storeId: id, fileName };
}

async function storeDelete(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
) {
  if (!(await tableExists(c, "json_store"))) return;
  await c.env.DB.prepare(
    `DELETE FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)`,
  )
    .bind(scope, fileName, slug)
    .run();
}

async function settingsOf(c: Context<AppEnv>, slug: string) {
  const stored = (await storeGet(c, SCOPES.settings, slug, slug)) || {};
  const apiBase = safeUrl(stored.apiBase);
  const syncEndpoint = safeUrl(stored.syncEndpoint);
  const submitEndpoint = safeUrl(stored.submitEndpoint);
  const outlookDraftEndpoint = safeUrl(stored.outlookDraftEndpoint);
  return {
    username: text(stored.username),
    companyId: text(stored.companyId),
    companyName: text(stored.companyName),
    apiBase,
    syncEndpoint,
    submitEndpoint,
    outlookDraftEndpoint,
    hasPassword: Boolean(stored.passwordCipher || stored.accessToken),
    companies: Array.isArray(stored.companies) ? stored.companies : [],
    connectionMode: apiBase ? "api" : "local",
    lastTestAt: stored.lastTestAt || null,
    lastTestStatus: stored.lastTestStatus || "NOT_TESTED",
    note: text(stored.note),
  };
}

function capabilities(settings: Row) {
  return {
    localDocumentArchive: true,
    localDraft: true,
    portalSync: Boolean(settings.syncEndpoint || settings.apiBase),
    submitOfficialInvoice: Boolean(settings.submitEndpoint),
    outlookDraft: Boolean(settings.outlookDraftEndpoint),
    markMailSent: true,
    printQueue: true,
    modelAssignment: true,
    cloudStorage: true,
  };
}

async function documentRows(c: Context<AppEnv>, slug: string) {
  if (!(await tableExists(c, "documents"))) return [];
  const cols = await columns(c, "documents");
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (cols.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    values.push(slug);
  }
  if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const result = await c.env.DB.prepare(
    `SELECT * FROM documents${where} ORDER BY COALESCE(date, created_at) DESC LIMIT 5000`,
  )
    .bind(...values)
    .all<Row>();
  return result.results || [];
}

async function companyRows(c: Context<AppEnv>, slug: string) {
  if (!(await tableExists(c, "companies"))) return [];
  const cols = await columns(c, "companies");
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (cols.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    values.push(slug);
  }
  if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const result = await c.env.DB.prepare(
    `SELECT * FROM companies${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY COALESCE(name, company_name) ASC LIMIT 3000`,
  )
    .bind(...values)
    .all<Row>();
  return result.results || [];
}

async function itemRows(c: Context<AppEnv>, documentId: string, slug: string) {
  if (!(await tableExists(c, "invoice_items"))) return [];
  const cols = await columns(c, "invoice_items");
  const clauses = ["document_id = ?"];
  const values: Array<string | number> = [documentId];
  if (cols.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    values.push(slug);
  }
  const result = await c.env.DB.prepare(
    `SELECT * FROM invoice_items WHERE ${clauses.join(" AND ")}
      ORDER BY COALESCE(line_no, id) ASC LIMIT 1000`,
  )
    .bind(...values)
    .all<Row>();
  return result.results || [];
}

function docMeta(row: Row) {
  return {
    ...objectOf(row.raw),
    ...objectOf(row.metadata),
  };
}

function inferKind(row: Row, meta: Row) {
  const value = normalize(
    `${row.document_type} ${row.target_type} ${row.detected_type} ${meta.documentKind} ${meta.kind}`,
  );
  return /IRSALIYE|DISPATCH|DESPATCH/.test(value) ? "dispatch" : "invoice";
}

function inferDirection(row: Row, meta: Row) {
  const explicit = normalize(meta.direction || row.direction);
  if (/OUT|OUTGOING|GIDEN/.test(explicit)) return "outgoing";
  if (/IN|INCOMING|GELEN/.test(explicit)) return "incoming";
  const value = normalize(
    `${row.document_type} ${row.target_type} ${row.detected_type} ${row.source_type}`,
  );
  if (/ISSUED|SALES|SALE|GIDEN|OUTGOING/.test(value)) return "outgoing";
  return "incoming";
}

function dateOnly(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : raw;
}

function fileKeys(row: Row, meta: Row) {
  return {
    pdfKey: text(
      meta.pdfKey ||
        meta.pdfR2Key ||
        meta.pdfPath ||
        row.pdf_key ||
        row.pdf_path ||
        (normalize(row.file_type) === "PDF" ? row.storage_key || row.file_key : ""),
    ),
    xmlKey: text(
      meta.xmlKey ||
        meta.xmlR2Key ||
        meta.xmlPath ||
        row.xml_key ||
        row.xml_path ||
        (normalize(row.file_type) === "XML" ? row.storage_key || row.file_key : ""),
    ),
  };
}

async function normalizedDocuments(c: Context<AppEnv>, slug: string) {
  const [rows, portalRows, states, intakes] = await Promise.all([
    documentRows(c, slug),
    storeList(c, SCOPES.portalDocument, slug),
    storeList(c, SCOPES.documentState, slug),
    storeList(c, SCOPES.intake, slug),
  ]);
  const stateMap = new Map(states.map((row) => [text(row.automationKey || row.fileName), row]));
  const intakeMap = new Map(intakes.map((row) => [text(row.documentId), row]));
  const local = rows.map((row) => {
    const meta = docMeta(row);
    const kind = inferKind(row, meta);
    const direction = inferDirection(row, meta);
    const id = text(row.id || crypto.randomUUID());
    const automationKey = text(meta.automationKey || `${kind}:${direction}:${id}`);
    const state = stateMap.get(automationKey) || {};
    const intake = intakeMap.get(id);
    const keys = fileKeys(row, meta);
    const partnerName = text(
      row.company_name ||
        row.supplier_name ||
        row.customer_name ||
        meta.companyName ||
        meta.partnerName,
    );
    const modelName = text(meta.modelName || row.model_name);
    const documentNo = text(
      row.document_no || row.invoice_no || row.dispatch_no || meta.documentNo || id,
    );
    const dateValue = text(row.date || row.issue_date || row.created_at || meta.issueDate);
    return {
      id,
      sourceId: id,
      automationKey,
      documentNo,
      dateText: dateOnly(dateValue),
      issueDate: dateValue.slice(0, 10),
      partnerName,
      companyName: partnerName,
      companyId: text(row.company_id || meta.companyId),
      companyType: text(meta.companyType || row.company_type || ""),
      kind,
      direction,
      documentTypeText: `${direction === "incoming" ? "Gelen" : "Giden"} ${kind === "invoice" ? "Fatura" : "İrsaliye"}`,
      statusText: text(row.status || meta.statusText || "Yerel Arşiv"),
      portalStatusText: text(meta.portalStatusText || row.status || "Yerel kayıt"),
      scenarioText: text(meta.scenarioText || meta.scenario || row.scenario),
      subtypeText: text(meta.subtypeText || meta.documentSubtype || row.subtype),
      status: text(row.status || "LOCAL"),
      subtotal: num(row.subtotal || meta.subtotal),
      vatTotal: num(row.vat_total || meta.vatTotal),
      grandTotal: num(row.grand_total || meta.grandTotal),
      modelName,
      modelId: text(meta.modelId || intake?.modelId),
      modelApplicable:
        meta.modelApplicable === false
          ? false
          : !/SUPPLIER|TEDARIKCI/.test(normalize(meta.companyType || row.company_type)),
      intakeId: text(intake?.id),
      hasPdf: Boolean(keys.pdfKey),
      hasXml: Boolean(keys.xmlKey),
      pdfKey: keys.pdfKey,
      xmlKey: keys.xmlKey,
      filesReady: Boolean(keys.pdfKey && (kind === "invoice" ? keys.xmlKey : true)),
      downloadedAt: text(meta.downloadedAt || row.updated_at),
      appReadAt: state.readAt || null,
      localReadAt: state.readAt || null,
      localUnread: !state.readAt,
      isNew: !state.readAt,
      printedAt: state.printedAt || null,
      metadata: meta,
      sourceType: text(row.source_type || "LOCAL"),
    };
  });
  const known = new Set(local.map((row) => row.automationKey));
  const portal = portalRows
    .filter((row) => !known.has(text(row.automationKey)))
    .map((row) => ({
      ...row,
      id: text(row.id || row.fileName),
      sourceId: text(row.sourceId || row.id || row.fileName),
      automationKey: text(
        row.automationKey ||
          `${row.kind || "document"}:${row.direction || "incoming"}:${row.id || row.fileName}`,
      ),
      localUnread: !stateMap.get(text(row.automationKey))?.readAt,
      isNew: !stateMap.get(text(row.automationKey))?.readAt,
      localReadAt: stateMap.get(text(row.automationKey))?.readAt || null,
      appReadAt: stateMap.get(text(row.automationKey))?.readAt || null,
      printedAt: stateMap.get(text(row.automationKey))?.printedAt || null,
    }));
  return [...local, ...portal].sort((a, b) =>
    text(b.issueDate || b.dateText).localeCompare(text(a.issueDate || a.dateText)),
  );
}

async function updateDocumentMeta(
  c: Context<AppEnv>,
  id: string,
  slug: string,
  patch: Row,
) {
  if (!(await tableExists(c, "documents"))) return null;
  const cols = await columns(c, "documents");
  if (!cols.has("id") || !cols.has("metadata")) return null;
  const clauses = ["id = ?"];
  const values: Array<string | number> = [id];
  if (cols.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    values.push(slug);
  }
  const row = await c.env.DB.prepare(
    `SELECT metadata, raw FROM documents WHERE ${clauses.join(" AND ")} LIMIT 1`,
  )
    .bind(...values)
    .first<Row>();
  if (!row) return null;
  const metadata = { ...objectOf(row.raw), ...objectOf(row.metadata), ...patch };
  const set = ["metadata = ?"];
  const bindings: Array<string | number | null> = [JSON.stringify(metadata)];
  if (cols.has("updated_at")) {
    set.push("updated_at = ?");
    bindings.push(nowIso());
  }
  bindings.push(...values);
  await c.env.DB.prepare(
    `UPDATE documents SET ${set.join(", ")} WHERE ${clauses.join(" AND ")}`,
  )
    .bind(...bindings)
    .run();
  return metadata;
}

async function findDocument(c: Context<AppEnv>, slug: string, identity: Row) {
  const docs = await normalizedDocuments(c, slug);
  const candidates = [
    identity.id,
    identity.sourceId,
    identity.automationKey,
    identity.documentNo,
  ]
    .map(text)
    .filter(Boolean);
  return (
    docs.find((row) =>
      candidates.some((value) =>
        [row.id, row.sourceId, row.automationKey, row.documentNo].includes(value),
      ),
    ) || null
  );
}

async function r2File(c: Context<AppEnv>, key: string) {
  if (!key) return null;
  return c.env.FILES.get(key);
}

function objectResponse(object: any, fallbackType: string) {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  if (!headers.get("content-type")) headers.set("content-type", fallbackType);
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=60");
  return new Response(object.body, { headers });
}

async function statePatch(
  c: Context<AppEnv>,
  slug: string,
  automationKey: string,
  patch: Row,
) {
  const current = (await storeGet(c, SCOPES.documentState, automationKey, slug)) || {};
  return storePut(
    c,
    SCOPES.documentState,
    automationKey,
    { ...current, automationKey, ...patch },
    slug,
  );
}

async function createDraft(c: Context<AppEnv>, slug: string, body: Row, type: string) {
  const requestId = text(body.requestId || crypto.randomUUID());
  const current = await storeGet(c, SCOPES.draft, requestId, slug);
  if (current) return { ...current, idempotent: true };
  const draftNo = text(
    body.draftNo ||
      `${type === "INVOICE" ? "FAT" : "IRS"}-TASLAK-${new Date()
        .toISOString()
        .replace(/\D/g, "")
        .slice(0, 14)}`,
  );
  return storePut(
    c,
    SCOPES.draft,
    requestId,
    {
      ...body,
      id: requestId,
      requestId,
      draftId: requestId,
      draftNo,
      type,
      status: "VERIFIED_LOCAL_DRAFT",
      draftVersion: "1",
      verified: true,
      approved: false,
      officialInvoiceNumber: "",
      officialUuid: "",
      createdAt: nowIso(),
    },
    slug,
  );
}

function draftResult(draft: Row, message: string) {
  return {
    ok: true,
    success: true,
    verified: draft.verified === true,
    requestId: draft.requestId,
    draftId: draft.draftId || draft.id,
    draftNo: draft.draftNo,
    draftVersion: draft.draftVersion || "1",
    status: draft.status,
    verification: { differences: [] },
    message,
  };
}

async function authHeaders(c: Context<AppEnv>, slug: string) {
  const raw = (await storeGet(c, SCOPES.settings, slug, slug)) || {};
  const headers: Record<string, string> = { accept: "application/json" };
  if (raw.accessToken) headers.authorization = `Bearer ${raw.accessToken}`;
  else if (raw.username && raw.passwordCipher && raw.passwordEncoding === "plain-disabled") {
    headers.authorization = `Basic ${btoa(`${raw.username}:${raw.passwordCipher}`)}`;
  }
  return headers;
}

async function externalJson(
  c: Context<AppEnv>,
  slug: string,
  url: string,
  options: RequestInit = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...(await authHeaders(c, slug)), ...(options.headers || {}) },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("json")
      ? await response.json()
      : { text: await response.text() };
    if (!response.ok) {
      throw new Error(
        text(payload?.message || payload?.error || payload?.text) ||
          `Harici İşNet adaptörü HTTP ${response.status} döndürdü.`,
      );
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function savePortalDocuments(c: Context<AppEnv>, slug: string, rows: Row[]) {
  let saved = 0;
  for (const raw of rows) {
    const sourceId = text(raw.id || raw.sourceId || raw.uuid || raw.documentNo);
    if (!sourceId) continue;
    const kind = /IRSALIYE|DISPATCH/.test(normalize(raw.kind || raw.documentType))
      ? "dispatch"
      : "invoice";
    const direction = /GIDEN|OUT/.test(normalize(raw.direction))
      ? "outgoing"
      : "incoming";
    const automationKey = `${kind}:${direction}:${sourceId}`;
    await storePut(
      c,
      SCOPES.portalDocument,
      automationKey,
      {
        ...raw,
        id: sourceId,
        sourceId,
        automationKey,
        kind,
        direction,
        documentNo: text(raw.documentNo || raw.number || sourceId),
        dateText: dateOnly(raw.issueDate || raw.date),
        issueDate: text(raw.issueDate || raw.date).slice(0, 10),
        partnerName: text(raw.partnerName || raw.companyName || raw.issuerName),
        statusText: text(raw.statusText || raw.status || "Portal kaydı"),
        portalStatusText: text(raw.portalStatusText || raw.status || "Portal kaydı"),
        scenarioText: text(raw.scenarioText || raw.scenario),
        subtypeText: text(raw.subtypeText || raw.subtype),
        downloadedAt: nowIso(),
        sourceType: "ISNET_ADAPTER",
      },
      slug,
    );
    saved += 1;
  }
  return saved;
}

function defaultTemplate() {
  return {
    scenarioType: "TICARI",
    invoiceType: "SATIS",
    currency: "TRY",
    measureUnitId: 67,
    vatRate: 20,
    notes: [],
  };
}

export function registerIsnetCloudRoutes(app: Hono<AppEnv>) {
  app.get("/api/isnet/configuration", async (c) => {
    const slug = slugOf(c);
    const settings = await settingsOf(c, slug);
    return c.json({
      ok: true,
      success: true,
      data: {
        apiConfigured: Boolean(settings.apiBase || settings.syncEndpoint),
        connectionMode: settings.connectionMode,
        companyId: settings.companyId,
        companyName: settings.companyName,
        capabilities: capabilities(settings),
        warning:
          settings.apiBase || settings.syncEndpoint
            ? ""
            : "İşNet resmî adaptörü yapılandırılmadı; yerel arşiv ve taslak akışları kullanılabilir.",
      },
    });
  });

  app.get("/api/isnet/dashboard", async (c) => {
    const slug = slugOf(c);
    const [settings, docs, mailQueue, drafts, syncRuns] = await Promise.all([
      settingsOf(c, slug),
      normalizedDocuments(c, slug),
      storeList(c, SCOPES.mail, slug),
      storeList(c, SCOPES.draft, slug),
      storeList(c, SCOPES.sync, slug),
    ]);
    const incomingDispatches = docs.filter(
      (row) => row.kind === "dispatch" && row.direction === "incoming",
    );
    return c.json({
      ok: true,
      success: true,
      data: {
        configuration: {
          apiConfigured: Boolean(settings.apiBase || settings.syncEndpoint),
          connectionMode: settings.connectionMode,
          companyId: settings.companyId,
          companyName: settings.companyName,
          capabilities: capabilities(settings),
        },
        summary: {
          totalDocuments: docs.length,
          unreadDocuments: docs.filter((row) => row.localUnread).length,
          incomingDispatches: incomingDispatches.length,
          modelWaiting: incomingDispatches.filter(
            (row) => row.modelApplicable !== false && !row.modelId,
          ).length,
          issuedDocuments: docs.filter((row) => row.direction === "outgoing").length,
          missingFiles: docs.filter((row) => !row.filesReady).length,
          mailWaiting: mailQueue.filter((row) => !row.sent).length,
          draftCount: drafts.length,
        },
        recentDocuments: docs.slice(0, 12),
        lastSync: syncRuns[0] || null,
        warnings: [
          ...(!settings.apiBase && !settings.syncEndpoint
            ? ["Resmî İşNet adaptörü bağlı değil."]
            : []),
          ...(docs.some((row) => !row.filesReady)
            ? ["PDF/XML dosyası eksik belgeler var."]
            : []),
        ],
      },
    });
  });

  app.get("/api/isnet/settings", async (c) => {
    const slug = slugOf(c);
    const settings = await settingsOf(c, slug);
    return c.json({ ok: true, success: true, data: settings });
  });

  app.put("/api/isnet/settings", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = (await storeGet(c, SCOPES.settings, slug, slug)) || {};
    const apiBase = body.apiBase === undefined ? current.apiBase : safeUrl(body.apiBase);
    const syncEndpoint =
      body.syncEndpoint === undefined
        ? current.syncEndpoint
        : safeUrl(body.syncEndpoint);
    const submitEndpoint =
      body.submitEndpoint === undefined
        ? current.submitEndpoint
        : safeUrl(body.submitEndpoint);
    const outlookDraftEndpoint =
      body.outlookDraftEndpoint === undefined
        ? current.outlookDraftEndpoint
        : safeUrl(body.outlookDraftEndpoint);
    if (body.apiBase && !apiBase) {
      return c.json(
        errorBody("HTTPS_REQUIRED", "İşNet API adresi geçerli bir HTTPS adresi olmalıdır."),
        400,
      );
    }
    const password = text(body.password);
    const accessToken = text(body.accessToken);
    const data = await storePut(
      c,
      SCOPES.settings,
      slug,
      {
        ...current,
        username: text(body.username ?? current.username),
        companyId: text(body.companyId ?? current.companyId),
        companyName: text(body.companyName ?? current.companyName),
        companies: Array.isArray(body.companies) ? body.companies : current.companies || [],
        apiBase,
        syncEndpoint,
        submitEndpoint,
        outlookDraftEndpoint,
        accessToken: accessToken || current.accessToken || "",
        // Parola şifreleme anahtarı tanımlı olmayan Worker'da düz metin parola tutulmaz.
        passwordCipher: password ? "" : current.passwordCipher || "",
        passwordEncoding: password ? "not-stored" : current.passwordEncoding || "",
        note: text(body.note ?? current.note),
        updatedAt: nowIso(),
      },
      slug,
    );
    return c.json({
      ok: true,
      success: true,
      data: {
        ...(await settingsOf(c, slug)),
        passwordAccepted: !password,
        warning: password
          ? "Parola düz metin saklanmadı. Resmî API için güvenli erişim anahtarı kullanın."
          : "",
      },
    });
  });

  app.post("/api/isnet/settings/test", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = (await storeGet(c, SCOPES.settings, slug, slug)) || {};
    const apiBase = safeUrl(body.apiBase || current.apiBase);
    if (!apiBase) {
      return c.json({
        ok: true,
        success: true,
        data: {
          connected: false,
          connectionMode: "local",
          companies: current.companies || [],
          diagnostics: {
            api: "Yapılandırılmadı",
            portal: "Cloudflare Worker tarayıcı otomasyonu çalıştırmaz",
            localArchive: "Bağlı",
          },
          message:
            "Yerel İşNet arşivi çalışıyor; resmî HTTPS API adaptörü henüz tanımlı değil.",
        },
      });
    }
    try {
      const payload = await externalJson(c, slug, apiBase, { method: "GET" });
      const companies =
        arrayOf(payload?.companies).length > 0
          ? arrayOf(payload.companies)
          : current.companies || [];
      await storePut(
        c,
        SCOPES.settings,
        slug,
        {
          ...current,
          apiBase,
          companies,
          lastTestAt: nowIso(),
          lastTestStatus: "CONNECTED",
        },
        slug,
      );
      return c.json({
        ok: true,
        success: true,
        data: {
          connected: true,
          connectionMode: "api",
          companies,
          diagnostics: { api: "Bağlandı", portal: "Kullanılmıyor", localArchive: "Bağlı" },
          message: "İşNet HTTPS adaptörü doğrulandı.",
        },
      });
    } catch (error) {
      await storePut(
        c,
        SCOPES.settings,
        slug,
        {
          ...current,
          apiBase,
          lastTestAt: nowIso(),
          lastTestStatus: "FAILED",
        },
        slug,
      );
      return c.json(
        errorBody(
          "ISNET_CONNECTION_FAILED",
          error instanceof Error ? error.message : "İşNet bağlantısı doğrulanamadı.",
        ),
        502,
      );
    }
  });

  app.post("/api/isnet/daily-sync", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const settings = await settingsOf(c, slug);
    const endpoint = settings.syncEndpoint ||
      (settings.apiBase ? `${settings.apiBase}/documents` : "");
    if (!endpoint) {
      return c.json(
        errorBody(
          "ISNET_ADAPTER_NOT_CONFIGURED",
          "Resmî İşNet senkronizasyonu için HTTPS adaptör adresi tanımlanmalıdır.",
        ),
        409,
      );
    }
    const url = new URL(endpoint);
    ["startDate", "endDate"].forEach((key) => {
      if (body[key]) url.searchParams.set(key, text(body[key]));
    });
    const payload = await externalJson(c, slug, url.toString(), { method: "GET" });
    const rows = Array.isArray(payload)
      ? payload
      : arrayOf(payload.documents || payload.rows || payload.items);
    const saved = await savePortalDocuments(c, slug, rows);
    const run = await storePut(
      c,
      SCOPES.sync,
      crypto.randomUUID(),
      {
        id: crypto.randomUUID(),
        status: "COMPLETED",
        receivedCount: rows.length,
        savedCount: saved,
        startDate: body.startDate || null,
        endDate: body.endDate || null,
        createdAt: nowIso(),
      },
      slug,
    );
    return c.json({
      ok: true,
      success: true,
      data: {
        ...run,
        message: `${saved} İşNet belgesi bulut arşivine senkronlandı.`,
      },
    });
  });

  app.get("/api/isnet/portal/documents", async (c) => {
    const slug = slugOf(c);
    const startDate = text(c.req.query("startDate"));
    const endDate = text(c.req.query("endDate"));
    const docs = (await normalizedDocuments(c, slug)).filter((row) => {
      const date = text(row.issueDate);
      if (startDate && date && date < startDate) return false;
      if (endDate && date && date > endDate) return false;
      return true;
    });
    return c.json({
      ok: true,
      success: true,
      data: {
        documents: docs,
        total: docs.length,
        sourceMode: "LOCAL_AND_ADAPTER",
        fetchedAt: nowIso(),
      },
    });
  });

  app.post("/api/isnet/portal/documents/:id/backfill", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const document = await findDocument(c, slug, { id: c.req.param("id"), ...body });
    if (!document) return c.json(errorBody("NOT_FOUND", "İşNet belgesi bulunamadı."), 404);
    if (document.sourceType !== "ISNET_ADAPTER") {
      return c.json({
        ok: true,
        success: true,
        data: { document, backfilled: false, message: "Belge zaten yerel arşivde." },
      });
    }
    return c.json({
      ok: true,
      success: true,
      data: {
        document,
        backfilled: false,
        message:
          "Portal belgesi listede. PDF/XML dosyası adaptör tarafından sağlandığında R2 arşivine alınabilir.",
      },
    });
  });

  app.post("/api/isnet/portal/documents/:automationKey/read", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const automationKey = decodeURIComponent(c.req.param("automationKey"));
    const state = await statePatch(c, slug, automationKey, {
      readAt: body.isRead === false ? null : nowIso(),
    });
    return c.json({ ok: true, success: true, data: state });
  });

  app.post("/api/isnet/portal/documents/read/bulk", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const keys = Array.isArray(body.automationKeys)
      ? body.automationKeys.map(text).filter(Boolean)
      : [];
    for (const key of keys) {
      await statePatch(c, slug, key, {
        readAt: body.isRead === false ? null : nowIso(),
      });
    }
    return c.json({
      ok: true,
      success: true,
      data: { updatedCount: keys.length, missingDocumentIds: [] },
    });
  });

  app.get("/api/isnet/portal/documents/:id/file", async (c) => {
    const slug = slugOf(c);
    const format = text(c.req.query("format") || "pdf").toLowerCase();
    const document = await findDocument(c, slug, { id: c.req.param("id") });
    if (!document) return c.json(errorBody("NOT_FOUND", "İşNet belgesi bulunamadı."), 404);
    const key = format === "xml" ? document.xmlKey : document.pdfKey;
    const object = await r2File(c, key);
    if (!object) {
      return c.json(
        errorBody(
          "DOCUMENT_FILE_MISSING",
          `${format.toUpperCase()} dosyası R2 arşivinde bulunamadı.`,
        ),
        404,
      );
    }
    return objectResponse(
      object,
      format === "xml" ? "application/xml; charset=utf-8" : "application/pdf",
    );
  });

  app.get("/api/isnet/incoming-dispatches", async (c) => {
    const slug = slugOf(c);
    const docs = (await normalizedDocuments(c, slug)).filter(
      (row) => row.kind === "dispatch" && row.direction === "incoming",
    );
    const rows = docs.map((row) => ({
      ...row,
      quantity: num(row.metadata?.quantity || row.metadata?.totalQuantity),
      lastUnitPrice: num(row.metadata?.lastUnitPrice),
      vatRate: num(row.metadata?.vatRate || 20),
      invoiceStatus: row.metadata?.invoiceStatus || "WAITING",
    }));
    return c.json({ ok: true, success: true, data: rows });
  });

  app.post("/api/isnet/incoming-dispatches/:id/import", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const document = await findDocument(c, slug, { id: c.req.param("id"), ...body });
    if (!document || document.kind !== "dispatch") {
      return c.json(errorBody("NOT_FOUND", "Gelen irsaliye bulunamadı."), 404);
    }
    const current = (await storeList(c, SCOPES.intake, slug)).find(
      (row) => text(row.documentId) === document.id,
    );
    const lines = (await itemRows(c, document.id, slug)).map((row, index) => ({
      id: text(row.id || `${document.id}-${index + 1}`),
      lineNo: num(row.line_no || index + 1),
      rawName: text(row.product_name || row.description),
      description: text(row.description || row.product_name),
      productCode: text(row.product_code || row.code),
      quantity: num(row.quantity),
      unit: text(row.unit || "ADET"),
      orderNo: text(row.order_no),
      color: text(row.color),
      region: text(row.region),
      modelGuess: text(row.model_name || document.modelName),
    }));
    const intake = current ||
      (await storePut(
        c,
        SCOPES.intake,
        crypto.randomUUID(),
        {
          id: crypto.randomUUID(),
          documentId: document.id,
          documentNo: document.documentNo,
          issuerName: document.partnerName,
          companyId: document.companyId,
          modelGuess: document.modelName || lines[0]?.modelGuess || "",
          modelId: document.modelId || "",
          status: document.modelApplicable === false ? "MODEL_NOT_APPLICABLE" : "MODEL_WAITING",
          lines,
          createdAt: nowIso(),
        },
        slug,
      ));
    await updateDocumentMeta(c, document.id, slug, { intakeId: intake.id });
    return c.json({
      ok: true,
      success: true,
      data: {
        message: `${document.documentNo} işleme alındı.`,
        intake,
        files: { pdf: document.hasPdf, xml: document.hasXml },
      },
    });
  });

  app.get("/api/isnet/intake/:id", async (c) => {
    const row = await storeGet(c, SCOPES.intake, c.req.param("id"), slugOf(c));
    if (!row) return c.json(errorBody("NOT_FOUND", "İrsaliye işlem kaydı bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: row });
  });

  app.get("/api/isnet/intake/:id/models", async (c) => {
    const slug = slugOf(c);
    const intake = await storeGet(c, SCOPES.intake, c.req.param("id"), slug);
    if (!intake) return c.json(errorBody("NOT_FOUND", "İrsaliye işlem kaydı bulunamadı."), 404);
    const query = normalize(c.req.query("q") || intake.modelGuess);
    const models = (await storeList(c, SCOPES.model, slug)).filter(
      (row) => row.status !== "ARCHIVE",
    );
    const suggestions = models
      .map((row) => {
        const haystack = normalize(`${row.modelName} ${row.modelCode} ${row.companyName}`);
        const exact = query && haystack.includes(query);
        return {
          id: text(row.id || row.fileName),
          modelName: text(row.modelName || row.modelCode),
          modelCode: text(row.modelCode),
          companyName: text(row.companyName),
          source: "DESEN_HAVUZU",
          score: exact ? 100 : query ? 40 : 20,
        };
      })
      .filter((row) => !query || row.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
    return c.json({
      ok: true,
      success: true,
      data: {
        suggestions,
        currentModelId: intake.modelId || "",
        requiresModel: intake.status !== "MODEL_NOT_APPLICABLE" && !intake.modelId,
      },
    });
  });

  app.post("/api/isnet/intake/:id/model", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const intake = await storeGet(c, SCOPES.intake, c.req.param("id"), slug);
    if (!intake) return c.json(errorBody("NOT_FOUND", "İrsaliye işlem kaydı bulunamadı."), 404);
    const candidateId = text(body.candidateId || body.modelId);
    const model = await storeGet(c, SCOPES.model, candidateId, slug);
    if (!model) return c.json(errorBody("MODEL_NOT_FOUND", "Desen havuzu modeli bulunamadı."), 404);
    const updated = await storePut(
      c,
      SCOPES.intake,
      text(intake.id || intake.fileName),
      { ...intake, modelId: candidateId, modelName: model.modelName, status: "MODEL_ASSIGNED" },
      slug,
    );
    await updateDocumentMeta(c, text(intake.documentId), slug, {
      modelId: candidateId,
      modelName: model.modelName,
    });
    return c.json({ ok: true, success: true, data: { intake: updated, model } });
  });

  app.post("/api/isnet/intake/:id/model/create", async (c) => {
    const slug = slugOf(c);
    const intake = await storeGet(c, SCOPES.intake, c.req.param("id"), slug);
    if (!intake) return c.json(errorBody("NOT_FOUND", "İrsaliye işlem kaydı bulunamadı."), 404);
    let body: Row = {};
    let image: File | null = null;
    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.parseBody();
      body = Object.fromEntries(
        Object.entries(form).filter(([, value]) => !(value instanceof File)),
      );
      image = form.image instanceof File ? form.image : null;
    } else {
      body = await bodyOf(c);
    }
    const modelName = text(body.modelName || intake.modelGuess);
    if (!modelName) return c.json(errorBody("MODEL_NAME_REQUIRED", "Yeni model adı zorunludur."), 400);
    const id = crypto.randomUUID();
    const files: Row[] = [];
    if (image) {
      const key = `desen/models/${slug}/${id}/${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
      await c.env.FILES.put(key, image.stream(), {
        httpMetadata: { contentType: image.type || "application/octet-stream" },
      });
      files.push({
        id: crypto.randomUUID(),
        fileName: image.name,
        storageKey: key,
        role: "MODEL_IMAGE",
        contentType: image.type,
        previewUrl: "",
      });
    }
    const model = await storePut(
      c,
      SCOPES.model,
      id,
      {
        id,
        modelName,
        modelCode: text(body.modelCode || modelName),
        companyId: text(intake.companyId || body.companyId),
        companyName: text(body.companyName || intake.issuerName),
        orderNo: text(body.orderNo),
        status: "NEW_ARRIVAL",
        sourceType: "ISNET_INTAKE",
        files,
        operations: [],
        metadata: { description: text(body.description), color: text(body.color), region: text(body.region), note: text(body.note) },
        createdAt: nowIso(),
      },
      slug,
    );
    const updated = await storePut(
      c,
      SCOPES.intake,
      text(intake.id || intake.fileName),
      { ...intake, modelId: id, modelName, status: "MODEL_ASSIGNED" },
      slug,
    );
    await updateDocumentMeta(c, text(intake.documentId), slug, { modelId: id, modelName });
    return c.json({ ok: true, success: true, data: { intake: updated, model } }, 201);
  });

  app.get("/api/isnet/incoming-dispatches/:id/draft", async (c) => {
    const slug = slugOf(c);
    const document = await findDocument(c, slug, { id: c.req.param("id") });
    if (!document) return c.json(errorBody("NOT_FOUND", "Gelen irsaliye bulunamadı."), 404);
    const lines = await itemRows(c, document.id, slug);
    return c.json({
      ok: true,
      success: true,
      data: {
        sourceId: document.id,
        dispatchNo: document.documentNo,
        recipientId: document.companyId,
        recipientName: document.partnerName,
        modelName: document.modelName,
        issueDate: document.issueDate,
        lines: lines.map((row, index) => ({
          lineNo: index + 1,
          productName: text(row.product_name || row.description),
          description: text(row.description || row.product_name),
          quantity: num(row.quantity),
          unitPrice: num(row.unit_price),
          vatRate: num(row.vat_rate || 20),
          measureUnitId: num(row.measure_unit_id || 67),
        })),
      },
    });
  });

  app.get("/api/isnet/dispatches/:id/invoice-draft", async (c) => {
    const slug = slugOf(c);
    const document = await findDocument(c, slug, { id: c.req.param("id") });
    if (!document || document.kind !== "dispatch") {
      return c.json(errorBody("NOT_FOUND", "İrsaliye bulunamadı."), 404);
    }
    const lines = await itemRows(c, document.id, slug);
    const template = {
      ...defaultTemplate(),
      ...((await storeGet(c, SCOPES.template, slug, slug)) || {}),
    };
    return c.json({
      ok: true,
      success: true,
      data: {
        mode: "dispatch",
        sourceId: document.id,
        dispatchNo: document.documentNo,
        recipientId: document.companyId,
        recipientName: document.partnerName,
        modelName: document.modelName,
        issueDate: new Date().toISOString().slice(0, 10),
        departmentNo: text(document.metadata?.departmentNo),
        scenarioType: template.scenarioType,
        invoiceType: template.invoiceType,
        currency: template.currency,
        measureUnitId: template.measureUnitId,
        notes: template.notes,
        lines: lines.map((row, index) => ({
          lineNo: index + 1,
          productName: text(row.product_name || row.description || document.modelName),
          description: text(row.description || row.product_name || document.modelName),
          quantity: num(row.quantity),
          unitPrice: num(row.unit_price),
          vatRate: num(row.vat_rate || template.vatRate || 20),
          measureUnitId: num(row.measure_unit_id || template.measureUnitId || 67),
        })),
      },
    });
  });

  app.post("/api/isnet/drafts/dispatch", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    if (!text(body.recipientId) || !text(body.modelName)) {
      return c.json(errorBody("DRAFT_FIELDS_REQUIRED", "Alıcı ve model adı zorunludur."), 400);
    }
    const draft = await createDraft(c, slug, body, "DISPATCH");
    return c.json({
      ok: true,
      success: true,
      data: draftResult(
        draft,
        "İrsaliye KY ERP taslağı kaydedildi. Resmî gönderim adaptörü ayrıca onaylanmalıdır.",
      ),
    }, 201);
  });

  app.post("/api/isnet/drafts/invoice", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    if (!text(body.recipientId) || !Array.isArray(body.lines) || !body.lines.length) {
      return c.json(errorBody("DRAFT_FIELDS_REQUIRED", "Alıcı ve fatura satırı zorunludur."), 400);
    }
    const draft = await createDraft(c, slug, body, "INVOICE");
    return c.json({
      ok: true,
      success: true,
      data: draftResult(
        draft,
        "Fatura KY ERP taslağı kaydedildi. Resmî gönderim yapılmadı.",
      ),
    }, 201);
  });

  app.post("/api/isnet/dispatches/:id/create-invoice", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const document = await findDocument(c, slug, { id: c.req.param("id") });
    if (!document) return c.json(errorBody("NOT_FOUND", "İrsaliye bulunamadı."), 404);
    const draft = await createDraft(
      c,
      slug,
      { ...body, sourceId: document.id, dispatchNo: document.documentNo },
      "INVOICE",
    );
    return c.json({
      ok: true,
      success: true,
      data: draftResult(
        draft,
        "İrsaliyeye bağlı fatura taslağı doğrulandı ve yerel olarak kaydedildi.",
      ),
    }, 201);
  });

  app.post("/api/isnet/drafts/:id/validate", async (c) => {
    const slug = slugOf(c);
    const draft = await storeGet(c, SCOPES.draft, c.req.param("id"), slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Taslak bulunamadı."), 404);
    const differences: string[] = [];
    if (!text(draft.recipientId || draft.recipientName)) differences.push("Alıcı eksik.");
    if (!Array.isArray(draft.lines) || !draft.lines.length) differences.push("Belge satırı eksik.");
    return c.json({
      ok: true,
      success: true,
      data: { verified: differences.length === 0, differences, draft },
    });
  });

  app.post("/api/isnet/drafts/:id/prepare", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await storeGet(c, SCOPES.draft, c.req.param("id"), slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Taslak bulunamadı."), 404);
    const draft = await storePut(
      c,
      SCOPES.draft,
      text(current.id || current.fileName),
      { ...current, ...body, status: "VERIFIED_LOCAL_DRAFT", verified: true },
      slug,
    );
    return c.json({ ok: true, success: true, data: draftResult(draft, "Taslak hazırlandı.") });
  });

  app.post("/api/isnet/drafts/:id/approve", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await storeGet(c, SCOPES.draft, c.req.param("id"), slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Taslak bulunamadı."), 404);
    if (body.confirmationText && body.confirmationText !== "FATURAYI GÖNDER") {
      return c.json(errorBody("CONFIRMATION_TEXT_INVALID", "Onay metni geçersiz."), 400);
    }
    const draft = await storePut(
      c,
      SCOPES.draft,
      text(current.id || current.fileName),
      { ...current, approved: body.approved !== false, approvedAt: nowIso(), status: "APPROVED_LOCAL_DRAFT" },
      slug,
    );
    return c.json({ ok: true, success: true, data: draft });
  });

  app.get("/api/isnet/drafts/:id/status", async (c) => {
    const row = await storeGet(c, SCOPES.draft, c.req.param("id"), slugOf(c));
    if (!row) return c.json(errorBody("NOT_FOUND", "Taslak bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: row });
  });

  app.post("/api/isnet/drafts/:id/submit", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const settings = await settingsOf(c, slug);
    const draft = await storeGet(c, SCOPES.draft, c.req.param("id"), slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Taslak bulunamadı."), 404);
    if (!settings.submitEndpoint) {
      return c.json(
        errorBody(
          "OFFICIAL_SUBMIT_ADAPTER_NOT_CONFIGURED",
          "Resmî fatura gönderim adaptörü bağlı değil. Taslak gönderilmiş olarak işaretlenmedi.",
        ),
        409,
      );
    }
    if (draft.approved !== true) {
      return c.json(errorBody("DRAFT_NOT_APPROVED", "Taslak açık onay bekliyor."), 409);
    }
    const payload = await externalJson(c, slug, settings.submitEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const officialInvoiceNumber = text(
      payload.officialInvoiceNumber || payload.invoiceNo || payload.documentNo,
    );
    const officialUuid = text(payload.officialUuid || payload.uuid);
    if (!officialInvoiceNumber) {
      return c.json(
        errorBody(
          "OFFICIAL_RESULT_UNVERIFIED",
          "Adaptör resmî fatura numarası döndürmedi; gönderim tamamlandı sayılmadı.",
        ),
        502,
      );
    }
    const updated = await storePut(
      c,
      SCOPES.draft,
      text(draft.id || draft.fileName),
      {
        ...draft,
        status: "COMPLETED",
        officialInvoiceNumber,
        officialUuid,
        submittedAt: nowIso(),
        officialResponse: payload,
      },
      slug,
    );
    return c.json({ ok: true, success: true, data: updated });
  });

  app.post("/api/isnet/drafts/:id/retry-closure", async (c) => {
    const slug = slugOf(c);
    const draft = await storeGet(c, SCOPES.draft, c.req.param("id"), slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Taslak bulunamadı."), 404);
    if (!draft.officialInvoiceNumber) {
      return c.json(
        errorBody(
          "OFFICIAL_RESULT_MISSING",
          "Resmî fatura sonucu yok; yerel kapanış yapılamaz.",
        ),
        409,
      );
    }
    const updated = await storePut(
      c,
      SCOPES.draft,
      text(draft.id || draft.fileName),
      { ...draft, status: "COMPLETED", closureCompletedAt: nowIso() },
      slug,
    );
    return c.json({ ok: true, success: true, data: updated });
  });

  app.get("/api/isnet/issued-documents", async (c) => {
    const docs = (await normalizedDocuments(c, slugOf(c))).filter(
      (row) => row.direction === "outgoing",
    );
    return c.json({ ok: true, success: true, data: docs });
  });

  app.get("/api/isnet/issued-documents/:id/file", async (c) => {
    const slug = slugOf(c);
    const format = text(c.req.query("format") || "pdf").toLowerCase();
    const document = await findDocument(c, slug, { id: c.req.param("id") });
    if (!document) return c.json(errorBody("NOT_FOUND", "Kesilen belge bulunamadı."), 404);
    const object = await r2File(c, format === "xml" ? document.xmlKey : document.pdfKey);
    if (!object) return c.json(errorBody("DOCUMENT_FILE_MISSING", "Belge dosyası R2 arşivinde bulunamadı."), 404);
    return objectResponse(object, format === "xml" ? "application/xml" : "application/pdf");
  });

  app.post("/api/isnet/documents/:id/complete", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const document = await findDocument(c, slug, { id: c.req.param("id") });
    if (!document) return c.json(errorBody("NOT_FOUND", "Belge bulunamadı."), 404);
    if (!document.filesReady) {
      return c.json(
        errorBody(
          "FILES_NOT_READY",
          "PDF/XML dosyaları tamamlanmadan belge arşivi kapatılamaz.",
        ),
        409,
      );
    }
    const metadata = await updateDocumentMeta(c, document.id, slug, {
      archiveCompletedAt: nowIso(),
      archiveStatus: "COMPLETED",
    });
    return c.json({ ok: true, success: true, data: { ...document, metadata } });
  });

  app.get("/api/isnet/mail-queue", async (c) => {
    const rows = (await storeList(c, SCOPES.mail, slugOf(c))).map((row) => ({
      ...row,
      id: text(row.id || row.fileName),
      recipientCount: Array.isArray(row.recipients) ? row.recipients.length : num(row.recipientCount),
      attachmentCount: Array.isArray(row.attachments) ? row.attachments.length : num(row.attachmentCount),
      attachmentsReady:
        row.attachmentsReady === true ||
        (Array.isArray(row.attachments) && row.attachments.length >= 1),
      sent: Boolean(row.sentAt || row.sent),
      statusText: row.sentAt || row.sent ? "Gönderildi" : "Hazırlanıyor",
    }));
    return c.json({ ok: true, success: true, data: rows });
  });

  app.post("/api/isnet/mail-queue/:id/outlook-draft", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const settings = await settingsOf(c, slug);
    const row = await storeGet(c, SCOPES.mail, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Mail paketi bulunamadı."), 404);
    if (!settings.outlookDraftEndpoint) {
      return c.json(
        errorBody(
          "OUTLOOK_ADAPTER_NOT_CONFIGURED",
          "Outlook taslak adaptörü bağlı değil; taslak oluşturulmuş gibi işaretlenmedi.",
        ),
        409,
      );
    }
    const result = await externalJson(c, slug, settings.outlookDraftEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
    });
    const updated = await storePut(
      c,
      SCOPES.mail,
      text(row.id || row.fileName),
      { ...row, outlookDraftId: result.id || result.draftId, draftCreatedAt: nowIso() },
      slug,
    );
    return c.json({ ok: true, success: true, data: updated });
  });

  app.post("/api/isnet/mail-queue/:id/mark-sent", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const row = await storeGet(c, SCOPES.mail, c.req.param("id"), slug);
    if (!row) return c.json(errorBody("NOT_FOUND", "Mail paketi bulunamadı."), 404);
    const updated = await storePut(
      c,
      SCOPES.mail,
      text(row.id || row.fileName),
      { ...row, sent: true, sentAt: nowIso(), sentConfirmation: "USER_CONFIRMED" },
      slug,
    );
    return c.json({ ok: true, success: true, data: updated });
  });

  app.get("/api/isnet/recipients", async (c) => {
    const slug = slugOf(c);
    const query = normalize(c.req.query("q"));
    const rows = (await companyRows(c, slug))
      .map((row) => ({
        id: text(row.id),
        localCompanyId: text(row.id),
        name: text(row.name || row.company_name),
        taxNo: text(row.tax_no || row.tax_number),
        email: text(row.email),
        phone: text(row.phone),
        type: text(row.company_type || row.type),
      }))
      .filter((row) => !query || normalize(`${row.name} ${row.taxNo}`).includes(query))
      .slice(0, 100);
    return c.json({ ok: true, success: true, data: { rows } });
  });

  app.get("/api/isnet/recipients/:id/context", async (c) => {
    const slug = slugOf(c);
    const row = (await companyRows(c, slug)).find(
      (company) => text(company.id) === c.req.param("id"),
    );
    if (!row) return c.json(errorBody("NOT_FOUND", "Firma bulunamadı."), 404);
    const rawContacts = [
      ...arrayOf(row.contacts),
      ...arrayOf(objectOf(row.raw).contacts),
    ];
    const contacts = rawContacts.map((item, index) => ({
      id: text(item.id || `${row.id}-${index + 1}`),
      name: text(item.name || item.fullName),
      email: text(item.email),
      phone: text(item.phone),
      departmentNo: text(item.departmentNo || item.department),
    }));
    return c.json({
      ok: true,
      success: true,
      data: {
        recipient: {
          id: text(row.id),
          localCompanyId: text(row.id),
          name: text(row.name || row.company_name),
          taxNo: text(row.tax_no || row.tax_number),
        },
        departments: arrayOf(row.departments || objectOf(row.raw).departments),
        contacts,
      },
    });
  });

  app.get("/api/isnet/invoice-assistant/template", async (c) => {
    const slug = slugOf(c);
    const template = {
      ...defaultTemplate(),
      ...((await storeGet(c, SCOPES.template, slug, slug)) || {}),
    };
    return c.json({ ok: true, success: true, data: template });
  });

  app.put("/api/isnet/invoice-assistant/template", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const template = await storePut(
      c,
      SCOPES.template,
      slug,
      { ...defaultTemplate(), ...body },
      slug,
    );
    return c.json({ ok: true, success: true, data: template });
  });

  app.get("/api/isnet/print-queue", async (c) => {
    const docs = await normalizedDocuments(c, slugOf(c));
    const rows = docs
      .filter((row) => row.hasPdf)
      .map((row) => ({
        ...row,
        key: row.automationKey,
        modelName: row.modelName,
      }));
    return c.json({
      ok: true,
      success: true,
      data: {
        rows,
        waiting: rows.filter((row) => !row.printedAt).length,
      },
    });
  });

  app.get("/api/isnet/print-queue/:kind/:id/pdf", async (c) => {
    const slug = slugOf(c);
    const document = await findDocument(c, slug, {
      id: c.req.param("id"),
      kind: c.req.param("kind"),
    });
    if (!document) return c.json(errorBody("NOT_FOUND", "Çıktı belgesi bulunamadı."), 404);
    const object = await r2File(c, document.pdfKey);
    if (!object) return c.json(errorBody("PDF_MISSING", "PDF dosyası R2 arşivinde bulunamadı."), 404);
    return objectResponse(object, "application/pdf");
  });

  app.post("/api/isnet/print-queue/bulk/pdf", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length !== 1) {
      return c.json(
        errorBody(
          "PDF_MERGE_NOT_AVAILABLE",
          "Bulut Worker'da çoklu PDF birleştirme etkin değil. Belgeleri tek tek açın veya yazdırın.",
        ),
        409,
      );
    }
    const document = await findDocument(c, slug, items[0]);
    if (!document) return c.json(errorBody("NOT_FOUND", "Çıktı belgesi bulunamadı."), 404);
    const object = await r2File(c, document.pdfKey);
    if (!object) return c.json(errorBody("PDF_MISSING", "PDF dosyası R2 arşivinde bulunamadı."), 404);
    return objectResponse(object, "application/pdf");
  });

  app.post("/api/isnet/print-queue/:kind/:id/mark-printed", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const document = await findDocument(c, slug, { id: c.req.param("id") });
    if (!document) return c.json(errorBody("NOT_FOUND", "Çıktı belgesi bulunamadı."), 404);
    const state = await statePatch(c, slug, document.automationKey, {
      printedAt: nowIso(),
    });
    return c.json({ ok: true, success: true, data: state });
  });

  app.post("/api/isnet/print-queue/bulk/mark-printed", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const items = Array.isArray(body.items) ? body.items : [];
    let updatedCount = 0;
    for (const item of items) {
      const document = await findDocument(c, slug, item);
      if (!document) continue;
      await statePatch(c, slug, document.automationKey, { printedAt: nowIso() });
      updatedCount += 1;
    }
    return c.json({ ok: true, success: true, data: { updatedCount } });
  });
}
