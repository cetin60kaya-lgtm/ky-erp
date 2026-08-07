import type { Context, Hono } from "hono";

type AppEnv = {
  Bindings: Cloudflare.Env;
  Variables: { requestId: string };
};

type Row = Record<string, any>;
type CenterModel = Row & {
  id: string;
  modelId: string;
  modelName: string;
  companyId: string;
  companyName: string;
  orderNo: string;
  defaultDispatchNo: string;
  expectedQty: number;
  modelCode?: string;
  groundColor?: string;
  status?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  printRegions: Array<{ id?: string; regionName: string; regionCode?: string; sortOrder?: number }>;
  isVirtual: boolean;
  raw: Row;
};

const columnsCache = new Map<string, Set<string>>();

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    const decimalIndex = Math.max(comma, dot);
    normalized = `${raw.slice(0, decimalIndex).replace(/[,.]/g, "")}.${raw
      .slice(decimalIndex + 1)
      .replace(/[,.]/g, "")}`;
  } else if (comma >= 0) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0) {
    const after = raw.slice(dot + 1);
    const dotCount = (raw.match(/\./g) || []).length;
    if (dotCount > 1 || after.length === 3) normalized = raw.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalized(value: unknown): string {
  return text(value)
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ş/g, "S")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function objectValue(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function first(...values: unknown[]): any {
  return values.find((value) => value !== undefined && value !== null && text(value) !== "");
}

function isoDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function isoDateTime(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function companySlug(c: Context<AppEnv>, body: Row = {}): string {
  return text(
    c.req.header("X-KYERP-Tenant-Slug") ||
      body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

function jsonError(code: string, message: string, details?: unknown) {
  return {
    ok: false as const,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function requestBody(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

async function tableExists(c: Context<AppEnv>, table: string): Promise<boolean> {
  const row = await c.env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  )
    .bind(table)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

async function tableColumns(c: Context<AppEnv>, table: string): Promise<Set<string>> {
  const cached = columnsCache.get(table);
  if (cached) return cached;
  if (!(await tableExists(c, table))) return new Set();
  const result = await c.env.DB.prepare(`PRAGMA table_info(${quote(table)})`).all<{ name: string }>();
  const columns = new Set((result.results || []).map((row) => row.name));
  columnsCache.set(table, columns);
  return columns;
}

async function tableRows(
  c: Context<AppEnv>,
  table: string,
  slug: string,
  limit = 10000,
): Promise<Row[]> {
  const columns = await tableColumns(c, table);
  if (!columns.size) return [];
  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  if (slug && columns.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    bindings.push(slug);
  }
  if (columns.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const orderColumn = columns.has("updated_at")
    ? "updated_at"
    : columns.has("created_at")
      ? "created_at"
      : columns.has("production_date")
        ? "production_date"
        : columns.has("date")
          ? "date"
          : columns.has("id")
            ? "id"
            : "rowid";
  const result = await c.env.DB.prepare(
    `SELECT * FROM ${quote(table)}${where} ORDER BY ${quote(orderColumn)} DESC LIMIT ?`,
  )
    .bind(...bindings, Math.max(1, Math.min(limit, 20000)))
    .all<Row>();
  return result.results || [];
}

async function insertDynamic(c: Context<AppEnv>, table: string, values: Row): Promise<void> {
  const columns = await tableColumns(c, table);
  const entries = Object.entries(values).filter(
    ([key, value]) => columns.has(key) && value !== undefined,
  );
  if (!entries.length) throw new Error(`${table} tablosuna yazılabilecek alan bulunamadı.`);
  await c.env.DB.prepare(
    `INSERT INTO ${quote(table)} (${entries.map(([key]) => quote(key)).join(", ")}) VALUES (${entries
      .map(() => "?")
      .join(", ")})`,
  )
    .bind(...entries.map(([, value]) => sqlValue(value)))
    .run();
}

async function updateDynamic(
  c: Context<AppEnv>,
  table: string,
  id: string,
  values: Row,
  slug: string,
): Promise<void> {
  const columns = await tableColumns(c, table);
  const entries = Object.entries(values).filter(
    ([key, value]) => key !== "id" && columns.has(key) && value !== undefined,
  );
  if (!entries.length || !columns.has("id")) return;
  const clauses = ["id = ?"];
  const bindings: Array<string | number | null> = entries.map(([, value]) => sqlValue(value));
  bindings.push(id);
  if (slug && columns.has("main_company_slug")) {
    clauses.push("main_company_slug = ?");
    bindings.push(slug);
  }
  await c.env.DB.prepare(
    `UPDATE ${quote(table)} SET ${entries
      .map(([key]) => `${quote(key)} = ?`)
      .join(", ")} WHERE ${clauses.join(" AND ")}`,
  )
    .bind(...bindings)
    .run();
}

async function jsonStoreList(c: Context<AppEnv>, scope: string, slug: string): Promise<Row[]> {
  const columns = await tableColumns(c, "json_store");
  if (!columns.size) return [];
  const clauses = ["scope = ?"];
  const bindings: Array<string | number> = [scope];
  if (slug && columns.has("main_company_slug")) {
    clauses.push("(main_company_slug = ? OR main_company_slug IS NULL)");
    bindings.push(slug);
  }
  const order = columns.has("updated_at") ? "updated_at DESC" : "id DESC";
  const result = await c.env.DB.prepare(
    `SELECT * FROM json_store WHERE ${clauses.join(" AND ")} ORDER BY ${order}`,
  )
    .bind(...bindings)
    .all<Row>();
  return (result.results || []).map((row) => ({
    ...objectValue(row.data),
    _storeId: row.id,
    _scope: row.scope,
    fileName: row.file_name,
  }));
}

async function jsonStoreGet(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
): Promise<Row | null> {
  const rows = await jsonStoreList(c, scope, slug);
  return rows.find((row) => text(row.fileName) === fileName) || null;
}

async function jsonStorePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: Row,
  slug: string,
): Promise<Row> {
  const columns = await tableColumns(c, "json_store");
  if (!columns.size) throw new Error("json_store tablosu bulunamadı.");
  const existing = await jsonStoreGet(c, scope, fileName, slug);
  const now = new Date().toISOString();
  const payload = { ...data, updatedAt: now };
  if (existing?._storeId) {
    await updateDynamic(c, "json_store", text(existing._storeId), { data: payload, updated_at: now }, slug);
    return payload;
  }
  await insertDynamic(c, "json_store", {
    id: crypto.randomUUID(),
    scope,
    main_company_slug: slug || null,
    file_name: fileName,
    data: payload,
    created_at: now,
    updated_at: now,
  });
  return payload;
}

function stableId(parts: unknown[]): string {
  const source = parts.map((part) => normalized(part)).join("|");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `virtual-${(hash >>> 0).toString(16)}`;
}

function documentKind(row: Row): "SUPPLIER_INVOICE" | "CUSTOMER_INVOICE" | "DISPATCH" | "OTHER" {
  const raw = { ...objectValue(row.metadata), ...objectValue(row.raw) };
  const value = normalized(
    `${row.document_type || ""} ${row.target_type || ""} ${row.detected_type || ""} ${raw.documentKind || ""} ${raw.belgeTuru || ""}`,
  );
  if (/IRSALIYE|DISPATCH/.test(value)) return "DISPATCH";
  if (/TEDARIK|ALIS|SUPPLIER/.test(value)) return "SUPPLIER_INVOICE";
  if (/SATIS|CUSTOMER/.test(value) && /FATURA|INVOICE/.test(value)) return "CUSTOMER_INVOICE";
  if (/FATURA|INVOICE/.test(value)) {
    const direction = normalized(raw.direction || raw.yon || raw.sourceType || row.source_type);
    return /INCOMING|GELEN|ALIS/.test(direction) ? "SUPPLIER_INVOICE" : "CUSTOMER_INVOICE";
  }
  return "OTHER";
}

function dispatchDirection(row: Row): "INCOMING" | "OUTGOING" {
  const raw = { ...objectValue(row.metadata), ...objectValue(row.raw) };
  const direction = normalized(
    `${raw.direction || ""} ${raw.yon || ""} ${raw.documentDirection || ""} ${row.source_type || ""} ${row.document_type || ""}`,
  );
  return /GIDEN|OUTGOING|SATIS|OUR DISPATCH/.test(direction) ? "OUTGOING" : "INCOMING";
}

function lineRowsFromRaw(raw: Row): Row[] {
  const source = first(raw.lines, raw.items, raw.satirlar, raw.invoiceLines, raw.dispatchLines);
  return arrayValue(source).map((value, index) => ({
    ...objectValue(value),
    id: first(objectValue(value).id, `raw-line-${index}`),
  }));
}

function mapDocumentLine(row: Row): Row {
  const raw = { ...objectValue(row.metadata), ...objectValue(row.raw) };
  const name = text(
    first(
      row.model_name,
      raw.modelName,
      raw.modelAdi,
      row.product_name,
      raw.productName,
      row.description,
      raw.description,
    ),
  );
  return {
    id: text(first(row.id, raw.id, crypto.randomUUID())),
    documentId: text(first(row.document_id, raw.documentId)),
    modelId: text(first(row.model_id, raw.modelId, raw.modelKaydiId)),
    modelName: name,
    orderNo: text(first(row.order_no, raw.orderNo, raw.siparisNo)),
    dispatchNo: text(first(row.dispatch_no, raw.dispatchNo, raw.irsaliyeNo)),
    quantity: numberValue(first(row.quantity, raw.quantity, raw.adet, raw.miktar)),
    unit: text(first(row.unit, raw.unit, raw.birim)),
    unitPrice: numberValue(first(row.unit_price, raw.unitPrice)),
    lineTotal: numberValue(first(row.line_total, row.subtotal, raw.lineTotal, raw.subtotal)),
    printArea: text(first(row.print_area, raw.printArea, raw.baskiBolgesi)),
    rawName: text(first(row.product_name, row.description, raw.rawName, name)),
    raw,
  };
}

function mapProductionRow(row: Row): Row {
  const raw = { ...objectValue(row.metadata), ...objectValue(row.raw) };
  const gross = numberValue(
    first(row.total_quantity, row.quantity, row.uretim_adedi, raw.totalQuantity, raw.quantity, raw.uretimAdedi, raw.adet),
  );
  const printDefect = numberValue(
    first(row.print_defect, row.print_defect_qty, raw.printDefect, raw.printDefectQty, raw.baskiHatasiAdet),
  );
  const fabricDefect = numberValue(
    first(row.fabric_defect, row.fabric_defect_qty, raw.fabricDefect, raw.fabricDefectQty, raw.kumasHatasiAdet),
  );
  const testQty = numberValue(first(row.test_qty, raw.testQty, raw.testAdedi, raw.numuneAdedi));
  return {
    id: text(first(row.id, raw.id, crypto.randomUUID())),
    modelId: text(first(row.model_id, raw.modelId, raw.modelKaydiId)),
    modelName: text(first(row.model_name, raw.modelName, raw.modelAdi)),
    orderNo: text(first(row.order_no, raw.orderNo, raw.siparisNo)),
    dispatchNo: text(first(row.dispatch_no, raw.dispatchNo, raw.irsaliyeNo, raw.musteriIrsaliyeNo)),
    date: isoDate(first(row.production_date, row.date, raw.date, raw.tarih, row.created_at)),
    printArea: text(first(row.print_area, raw.printArea, raw.printRegion, raw.baskiBolgesi, raw.grup)),
    batchNo: text(first(row.batch_no, raw.batchNo, raw.partiNo, raw.seriNo, raw.dispatchNo, raw.irsaliyeNo)) || "GENEL",
    machineId: text(first(row.machine_id, raw.machineId, raw.makineNo, raw.makinaId)),
    machineName: text(first(row.machine_name, raw.machineName, raw.makineAdi, raw.makina)),
    shift: text(first(row.shift, raw.shift, raw.vardiya)),
    operatorName: text(first(row.machinist, raw.operatorName, raw.makinaci, raw.sorumluPersonel)),
    grossQty: gross,
    printDefectQty: printDefect,
    fabricDefectQty: fabricDefect,
    testQty,
    netQty: Math.max(0, gross - printDefect - fabricDefect - testQty),
    note: text(first(row.note, raw.note, raw.not, raw.aciklama)),
    requestId: text(first(raw.requestId, row.request_id)),
    clientId: text(first(raw.clientId, row.client_id)),
    createdAt: isoDateTime(first(row.created_at, raw.createdAt, row.production_date)),
    raw,
  };
}

function modelImage(row: Row, raw: Row): string {
  return text(
    first(
      row.image_url,
      row.thumbnail,
      row.thumbnail_path,
      row.design_image,
      row.desen_image_thumb,
      raw.imageUrl,
      raw.thumbnail,
      raw.desenImageThumb,
      raw.desenGorseli,
      raw.modelImageUrl,
    ),
  );
}

function rawRegions(row: Row, raw: Row): CenterModel["printRegions"] {
  const values = arrayValue(first(row.print_regions, raw.printRegions, raw.baskiBolgeleri, raw.print_regions));
  return values
    .map((value, index) => {
      const item = typeof value === "string" ? { regionName: value } : objectValue(value);
      const regionName = text(first(item.regionName, item.name, item.label, item.baskiBolgesi));
      return regionName
        ? {
            id: text(item.id),
            regionName,
            regionCode: text(first(item.regionCode, item.code)),
            sortOrder: numberValue(first(item.sortOrder, index)),
          }
        : null;
    })
    .filter(Boolean) as CenterModel["printRegions"];
}

function normalizeModelRow(row: Row, companyById: Map<string, Row>): CenterModel {
  const raw = { ...objectValue(row.metadata), ...objectValue(row.raw) };
  const id = text(first(row.id, raw.id, row.fileName));
  const companyId = text(first(row.company_id, row.customer_id, raw.companyId, raw.customerId, raw.firmaId));
  const company = companyById.get(companyId) || {};
  const modelName = text(first(row.model_name, row.name, row.model_adi, raw.modelName, raw.modelAdi, raw.model));
  return {
    id,
    modelId: id,
    modelName,
    modelCode: text(first(row.model_code, raw.modelCode, raw.modelKodu)),
    companyId,
    companyName: text(
      first(company.name, row.customer_name, row.company_name, raw.companyName, raw.customerName, raw.firmaAdi, raw.firma),
    ),
    orderNo: text(first(row.order_no, row.model_order_no, raw.orderNo, raw.siparisNo)),
    defaultDispatchNo: text(
      first(row.source_dispatch_no, row.customer_dispatch_no, raw.defaultDispatchNo, raw.dispatchNo, raw.irsaliyeNo),
    ),
    expectedQty: numberValue(
      first(row.incoming_qty, row.incoming_quantity, row.expected_qty, row.quantity, raw.incomingQty, raw.expectedQty, raw.gelenAdet),
    ),
    groundColor: text(first(row.ground_color, row.ground, raw.groundColor, raw.zemin, raw.zeminRenk)),
    status: text(first(row.status, row.durum, raw.status, raw.durum)) || "ACTIVE",
    imageUrl: modelImage(row, raw),
    printRegions: rawRegions(row, raw),
    createdAt: isoDateTime(first(row.created_at, raw.createdAt)),
    updatedAt: isoDateTime(first(row.updated_at, raw.updatedAt, row.created_at)),
    isVirtual: false,
    raw,
  };
}

function virtualModel(seed: Row, companyById: Map<string, Row>): CenterModel {
  const companyId = text(seed.companyId);
  const company = companyById.get(companyId) || {};
  const id = stableId([seed.modelName, companyId, seed.orderNo, seed.dispatchNo]);
  return {
    id,
    modelId: id,
    modelName: text(seed.modelName) || "Model eşleşmesi bekliyor",
    modelCode: "",
    companyId,
    companyName: text(first(company.name, seed.companyName)),
    orderNo: text(seed.orderNo),
    defaultDispatchNo: text(seed.dispatchNo),
    expectedQty: numberValue(seed.expectedQty),
    groundColor: "",
    status: "MODEL_WAITING",
    imageUrl: "",
    printRegions: [],
    createdAt: isoDateTime(seed.createdAt),
    updatedAt: isoDateTime(seed.createdAt),
    isVirtual: true,
    raw: { source: seed.source || "UNMATCHED_SOURCE" },
  };
}

function uniqueById<T extends Row>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = text(row.id || row.fileName);
    if (!id) continue;
    if (!map.has(id)) map.set(id, row);
  }
  return [...map.values()];
}

function resolveModel(
  seed: Row,
  models: CenterModel[],
  explicitLinks: Map<string, string>,
): { model?: CenterModel; status: "EXACT" | "AMBIGUOUS" | "UNMATCHED" } {
  const explicitId = text(seed.modelId || explicitLinks.get(text(seed.sourceId)));
  if (explicitId) {
    const direct = models.find((model) => model.id === explicitId);
    if (direct) return { model: direct, status: "EXACT" };
  }
  const wantedName = normalized(seed.modelName);
  if (!wantedName) return { status: "UNMATCHED" };
  let candidates = models.filter((model) => normalized(model.modelName) === wantedName);
  const companyId = text(seed.companyId);
  if (companyId) {
    const scoped = candidates.filter((model) => model.companyId === companyId);
    if (scoped.length) candidates = scoped;
  }
  const orderNo = normalized(seed.orderNo || seed.dispatchNo);
  if (orderNo) {
    const scoped = candidates.filter(
      (model) =>
        normalized(model.orderNo) === orderNo || normalized(model.defaultDispatchNo) === orderNo,
    );
    if (scoped.length) candidates = scoped;
  }
  if (candidates.length === 1) return { model: candidates[0], status: "EXACT" };
  if (candidates.length > 1) return { status: "AMBIGUOUS" };
  return { status: "UNMATCHED" };
}

function productionMetrics(entries: Row[], requiredRegions: string[], incomingQty: number) {
  const observedRegions = [...new Set(entries.map((entry) => text(entry.printArea)).filter(Boolean))];
  const regions = requiredRegions.length ? requiredRegions : observedRegions;
  const batches = new Map<string, Map<string, { gross: number; net: number }>>();
  let totalGross = 0;
  let totalPrintDefect = 0;
  let totalFabricDefect = 0;
  let totalTest = 0;

  for (const entry of entries) {
    totalGross += numberValue(entry.grossQty);
    totalPrintDefect += numberValue(entry.printDefectQty);
    totalFabricDefect += numberValue(entry.fabricDefectQty);
    totalTest += numberValue(entry.testQty);
    const batch = text(entry.batchNo || entry.dispatchNo || entry.orderNo) || "GENEL";
    const region = text(entry.printArea) || (regions.length === 1 ? regions[0] : "Genel");
    const regionMap = batches.get(batch) || new Map();
    const current = regionMap.get(region) || { gross: 0, net: 0 };
    current.gross += numberValue(entry.grossQty);
    current.net += numberValue(entry.netQty);
    regionMap.set(region, current);
    batches.set(batch, regionMap);
  }

  let completedGrossQty = 0;
  let completedNetQty = 0;
  if (!regions.length) {
    completedGrossQty = totalGross;
    completedNetQty = Math.max(0, totalGross - totalPrintDefect - totalFabricDefect - totalTest);
  } else {
    for (const regionMap of batches.values()) {
      const grossValues = regions.map((region) => numberValue(regionMap.get(region)?.gross));
      const netValues = regions.map((region) => numberValue(regionMap.get(region)?.net));
      completedGrossQty += grossValues.length ? Math.min(...grossValues) : 0;
      completedNetQty += netValues.length ? Math.min(...netValues) : 0;
    }
  }

  const operationRows = (regions.length ? regions : ["Genel"]).map((region) => {
    const regionEntries = entries.filter((entry) => {
      const entryRegion = text(entry.printArea) || (regions.length === 1 ? regions[0] : "Genel");
      return entryRegion === region;
    });
    const producedQty = regionEntries.reduce((sum, entry) => sum + numberValue(entry.grossQty), 0);
    const netQty = regionEntries.reduce((sum, entry) => sum + numberValue(entry.netQty), 0);
    return {
      region,
      producedQty,
      netQty,
      remainingQty: Math.max(0, incomingQty - producedQty),
      overQty: Math.max(0, producedQty - incomingQty),
      status:
        incomingQty <= 0
          ? "DISPATCH_WAITING"
          : producedQty > incomingQty
            ? "OVER_PRODUCTION"
            : producedQty < incomingQty
              ? "PRODUCTION_OPEN"
              : "COMPLETED",
    };
  });

  return {
    totalGross,
    completedGrossQty,
    completedNetQty,
    totalPrintDefect,
    totalFabricDefect,
    totalTest,
    totalDefectQty: totalPrintDefect + totalFabricDefect + totalTest,
    operationRows,
  };
}

function statusForCard(card: Row): string {
  if (card.isVirtual) return "MODEL_WAITING";
  if (card.incomingQty <= 0 && (card.completedGrossQty > 0 || card.invoicedQty > 0)) {
    return "DISPATCH_WAITING";
  }
  if (card.overProducedQty > 0) return "OVER_PRODUCTION";
  if (card.overInvoicedQty > 0) return "OVER_INVOICED";
  if (card.productionRemainingQty > 0) return "PRODUCTION_OPEN";
  if (card.invoiceRemainingQty > 0) return "INVOICE_OPEN";
  if (card.incomingQty > 0 && card.invoiceRemainingQty === 0) return "COMPLETED";
  return "NEW_MODEL";
}

function timelineFor(card: Row): Row[] {
  const rows: Row[] = [];
  if (card.createdAt) {
    rows.push({
      id: `model-${card.id}`,
      date: card.createdAt,
      type: "MODEL",
      title: "Model kaydı açıldı",
      description: card.modelName,
    });
  }
  for (const dispatch of card.dispatches || []) {
    rows.push({
      id: `dispatch-${dispatch.documentId}-${dispatch.lineId}`,
      date: dispatch.date,
      type: "DISPATCH",
      title: `Gelen irsaliye: ${dispatch.documentNo || "Belge"}`,
      description: `${numberValue(dispatch.quantity).toLocaleString("tr-TR")} ${dispatch.unit || "adet"}`,
    });
  }
  for (const entry of card.productionEntries || []) {
    rows.push({
      id: `production-${entry.id}`,
      date: entry.date || entry.createdAt,
      type: "PRODUCTION",
      title: `${entry.printArea || "Üretim"}: ${numberValue(entry.grossQty).toLocaleString("tr-TR")} brüt`,
      description: `${entry.machineName || entry.machineId || "Makine yok"} · ${entry.shift || "Vardiya yok"} · ${entry.operatorName || "Makinacı yok"}`,
    });
  }
  for (const invoice of card.invoices || []) {
    rows.push({
      id: `invoice-${invoice.documentId}-${invoice.lineId}`,
      date: invoice.date,
      type: "INVOICE",
      title: `Kesilen fatura: ${invoice.documentNo || "Belge"}`,
      description: `${numberValue(invoice.quantity).toLocaleString("tr-TR")} ${invoice.unit || "adet"}`,
    });
  }
  return rows.sort((left, right) => text(right.date).localeCompare(text(left.date)));
}

async function loadCompanies(c: Context<AppEnv>, slug: string): Promise<Map<string, Row>> {
  const rows = await tableRows(c, "companies", slug);
  return new Map(rows.map((row) => [text(row.id), row]));
}

async function loadModels(c: Context<AppEnv>, slug: string, companyById: Map<string, Row>) {
  const sources: Row[] = [];
  for (const table of ["model_records", "models"]) {
    sources.push(...(await tableRows(c, table, slug)));
  }
  for (const scope of ["PRODUCTION_CENTER_MODEL", "model-takip", "desen.modeller"]) {
    sources.push(...(await jsonStoreList(c, scope, slug)));
  }
  return uniqueById(
    sources
      .map((row) => normalizeModelRow(row, companyById))
      .filter((model) => model.id && model.modelName),
  );
}

async function loadPrintRegions(c: Context<AppEnv>, slug: string): Promise<Map<string, CenterModel["printRegions"]>> {
  const rows = await tableRows(c, "model_print_regions", slug);
  const map = new Map<string, CenterModel["printRegions"]>();
  for (const row of rows) {
    if (row.is_active === 0 || row.is_active === false) continue;
    const modelId = text(first(row.model_record_id, row.model_id));
    const regionName = text(first(row.region_name, row.name));
    if (!modelId || !regionName) continue;
    const current = map.get(modelId) || [];
    current.push({
      id: text(row.id),
      regionName,
      regionCode: text(row.region_code),
      sortOrder: numberValue(row.sort_order),
    });
    map.set(modelId, current);
  }
  for (const [modelId, regions] of map) {
    map.set(
      modelId,
      regions.sort((left, right) => numberValue(left.sortOrder) - numberValue(right.sortOrder)),
    );
  }
  return map;
}

async function loadLinks(c: Context<AppEnv>, slug: string) {
  const [documentLinks, productionLinks] = await Promise.all([
    tableRows(c, "model_document_links", slug),
    tableRows(c, "model_production_links", slug),
  ]);
  return {
    document: new Map(
      documentLinks.map((row) => [text(row.document_id), text(row.model_id)]),
    ),
    production: new Map(
      productionLinks.map((row) => [text(row.production_record_id), text(row.model_id)]),
    ),
  };
}

async function loadDocuments(c: Context<AppEnv>, slug: string, companyById: Map<string, Row>) {
  const [documents, itemRows] = await Promise.all([
    tableRows(c, "documents", slug),
    tableRows(c, "invoice_items", slug),
  ]);
  const itemsByDocument = new Map<string, Row[]>();
  for (const item of itemRows.map(mapDocumentLine)) {
    const current = itemsByDocument.get(item.documentId) || [];
    current.push(item);
    itemsByDocument.set(item.documentId, current);
  }
  return documents.map((row) => {
    const raw = { ...objectValue(row.metadata), ...objectValue(row.raw) };
    const companyId = text(first(row.company_id, raw.companyId, raw.firmId));
    const company = companyById.get(companyId) || {};
    let lines = itemsByDocument.get(text(row.id)) || [];
    if (!lines.length) {
      lines = lineRowsFromRaw(raw).map((line) =>
        mapDocumentLine({ ...line, document_id: row.id }),
      );
    }
    if (!lines.length && first(raw.modelName, raw.modelAdi)) {
      lines = [
        mapDocumentLine({
          id: `${row.id}-summary`,
          document_id: row.id,
          model_id: raw.modelId,
          model_name: first(raw.modelName, raw.modelAdi),
          quantity: first(raw.quantity, raw.adet),
          unit: first(raw.unit, raw.birim),
          raw,
        }),
      ];
    }
    return {
      id: text(row.id),
      documentNo: text(first(row.document_no, raw.documentNo, raw.belgeNo)),
      date: isoDate(first(row.date, raw.issueDate, raw.tarih, row.created_at)),
      kind: documentKind(row),
      direction: dispatchDirection(row),
      companyId,
      companyName: text(first(company.name, raw.companyName, raw.customerName, raw.firma)),
      status: text(first(row.status, raw.status)),
      sourceType: text(first(row.source_type, raw.sourceType, raw.source)),
      lines,
      raw,
    };
  });
}

async function loadProductionRows(c: Context<AppEnv>, slug: string): Promise<Row[]> {
  const rows = (await tableRows(c, "production_records", slug)).map(mapProductionRow);
  const jsonRows: Row[] = [];
  for (const scope of ["PRODUCTION_CENTER_ENTRY", "uretim.kayitlar", "URETIM_ENTRY"]) {
    jsonRows.push(...(await jsonStoreList(c, scope, slug)).map(mapProductionRow));
  }
  return uniqueById([...rows, ...jsonRows]);
}

async function loadMachines(c: Context<AppEnv>, slug: string): Promise<Row[]> {
  const rows = await tableRows(c, "machine_shift_defaults", slug);
  const jsonRows: Row[] = [];
  for (const scope of ["PRODUCTION_MACHINE", "uretim.makinalar", "IMALAT_MACHINE"]) {
    jsonRows.push(...(await jsonStoreList(c, scope, slug)));
  }
  return uniqueById([...rows, ...jsonRows].map((row, index) => {
    const raw = { ...objectValue(row.metadata), ...objectValue(row.raw) };
    const machineNo = text(first(row.machine_no, row.makine_no, row.no, raw.machineNo, raw.makineNo, row.id));
    return {
      id: text(first(row.id, machineNo, `machine-${index}`)),
      machineNo,
      no: machineNo,
      machineName: text(first(row.machine_name, row.makine_adi, row.name, raw.machineName, raw.makineAdi, raw.ad)),
      dayOperator: text(first(row.day_operator, row.gunduz_makinaci, raw.dayOperator, raw.gunduzMakinaci, row.operator)),
      nightOperator: text(first(row.night_operator, row.gece_makinaci, raw.nightOperator, raw.geceMakinaci, row.operator)),
      isActive: first(row.is_active, row.active, raw.isActive) !== false && first(row.is_active, row.active) !== 0,
      sortOrder: numberValue(first(row.sort_order, raw.sortOrder, index + 1)),
    };
  }).filter((row) => row.machineNo && row.isActive !== false));
}

async function buildCenter(
  c: Context<AppEnv>,
  forcedSlug = companySlug(c),
) {
  const slug = forcedSlug;
  const companyById = await loadCompanies(c, slug);
  const [baseModels, regionsByModel, links, documents, productionEntries, machines] = await Promise.all([
    loadModels(c, slug, companyById),
    loadPrintRegions(c, slug),
    loadLinks(c, slug),
    loadDocuments(c, slug, companyById),
    loadProductionRows(c, slug),
    loadMachines(c, slug),
  ]);

  const models = baseModels.map((model) => ({
    ...model,
    printRegions: regionsByModel.get(model.id)?.length
      ? regionsByModel.get(model.id) || []
      : model.printRegions,
  }));
  const modelMap = new Map(models.map((model) => [model.id, model]));
  const dispatchesByModel = new Map<string, Row[]>();
  const invoicesByModel = new Map<string, Row[]>();
  const productionByModel = new Map<string, Row[]>();
  let ambiguousMatchCount = 0;
  let unmatchedSourceCount = 0;

  function ensureModel(seed: Row, sourceId: string, explicitLinks: Map<string, string>) {
    const resolved = resolveModel({ ...seed, sourceId }, [...modelMap.values()], explicitLinks);
    if (resolved.model) return resolved.model;
    if (resolved.status === "AMBIGUOUS") ambiguousMatchCount += 1;
    else unmatchedSourceCount += 1;
    const virtual = virtualModel({ ...seed, source: resolved.status }, companyById);
    const existing = modelMap.get(virtual.id);
    if (existing) return existing;
    modelMap.set(virtual.id, virtual);
    return virtual;
  }

  for (const document of documents) {
    if (document.kind === "SUPPLIER_INVOICE" || document.kind === "OTHER") continue;
    if (document.kind === "DISPATCH" && document.direction === "OUTGOING") continue;
    for (const line of document.lines || []) {
      const model = ensureModel(
        {
          modelId: line.modelId,
          modelName: line.modelName,
          companyId: document.companyId,
          companyName: document.companyName,
          orderNo: line.orderNo || document.raw.orderNo || document.raw.siparisNo,
          dispatchNo: line.dispatchNo || document.documentNo,
          expectedQty: line.quantity,
          createdAt: document.date,
        },
        document.id,
        links.document,
      );
      const mapped = {
        documentId: document.id,
        lineId: line.id,
        documentNo: document.documentNo,
        date: document.date,
        companyId: document.companyId,
        companyName: document.companyName,
        orderNo: line.orderNo || document.raw.orderNo || document.raw.siparisNo || "",
        quantity: line.quantity,
        unit: line.unit,
        status: document.status,
        sourceType: document.sourceType,
        rawName: line.rawName,
      };
      const target = document.kind === "DISPATCH" ? dispatchesByModel : invoicesByModel;
      const current = target.get(model.id) || [];
      current.push(mapped);
      target.set(model.id, current);
    }
  }

  for (const entry of productionEntries) {
    const model = ensureModel(
      {
        modelId: entry.modelId,
        modelName: entry.modelName,
        orderNo: entry.orderNo,
        dispatchNo: entry.dispatchNo,
        createdAt: entry.date,
      },
      entry.id,
      links.production,
    );
    const current = productionByModel.get(model.id) || [];
    current.push({ ...entry, modelId: model.id, modelName: model.modelName });
    productionByModel.set(model.id, current);
  }

  const cards = [...modelMap.values()].map((model) => {
    const dispatches = dispatchesByModel.get(model.id) || [];
    const invoices = invoicesByModel.get(model.id) || [];
    const entries = productionByModel.get(model.id) || [];
    const incomingFromDocuments = dispatches.reduce(
      (sum, row) => sum + numberValue(row.quantity),
      0,
    );
    const incomingQty = incomingFromDocuments > 0 ? incomingFromDocuments : numberValue(model.expectedQty);
    const requiredRegions = model.printRegions.map((region) => region.regionName).filter(Boolean);
    const metrics = productionMetrics(entries, requiredRegions, incomingQty);
    const invoicedQty = invoices.reduce((sum, row) => sum + numberValue(row.quantity), 0);
    const invoiceableQty = metrics.completedNetQty;
    const productionRemainingQty = Math.max(0, incomingQty - metrics.completedGrossQty);
    const invoiceRemainingQty = Math.max(0, invoiceableQty - invoicedQty);
    const overProducedQty = Math.max(0, metrics.completedGrossQty - incomingQty);
    const overInvoicedQty = Math.max(0, invoicedQty - invoiceableQty);
    const card: Row = {
      ...model,
      incomingQty,
      dispatchCount: new Set(dispatches.map((row) => row.documentId)).size,
      grossOperationQty: metrics.totalGross,
      completedGrossQty: metrics.completedGrossQty,
      printDefectQty: metrics.totalPrintDefect,
      fabricDefectQty: metrics.totalFabricDefect,
      testQty: metrics.totalTest,
      defectQty: metrics.totalDefectQty,
      completedNetQty: metrics.completedNetQty,
      invoiceableQty,
      invoicedQty,
      productionRemainingQty,
      invoiceRemainingQty,
      overProducedQty,
      overInvoicedQty,
      operationRows: metrics.operationRows,
      dispatches,
      productionEntries: entries.sort((left, right) => text(right.date).localeCompare(text(left.date))),
      invoices,
      lastActivityAt: [
        model.updatedAt,
        ...dispatches.map((row) => row.date),
        ...entries.map((row) => row.date || row.createdAt),
        ...invoices.map((row) => row.date),
      ]
        .filter(Boolean)
        .sort()
        .at(-1) || "",
    };
    card.status = statusForCard(card);
    card.timeline = timelineFor(card);
    return card;
  });

  cards.sort((left, right) => text(right.lastActivityAt).localeCompare(text(left.lastActivityAt)));
  const summary = {
    modelCount: cards.length,
    openModelCount: cards.filter((row) => row.status !== "COMPLETED").length,
    modelWaitingCount: cards.filter((row) => row.status === "MODEL_WAITING").length,
    dispatchWaitingCount: cards.filter((row) => row.status === "DISPATCH_WAITING").length,
    productionOpenCount: cards.filter((row) => row.status === "PRODUCTION_OPEN").length,
    invoiceOpenCount: cards.filter((row) => row.status === "INVOICE_OPEN").length,
    controlCount: cards.filter((row) => ["MODEL_WAITING", "DISPATCH_WAITING", "OVER_PRODUCTION", "OVER_INVOICED"].includes(row.status)).length,
    totalIncomingQty: cards.reduce((sum, row) => sum + numberValue(row.incomingQty), 0),
    totalCompletedNetQty: cards.reduce((sum, row) => sum + numberValue(row.completedNetQty), 0),
    totalInvoicedQty: cards.reduce((sum, row) => sum + numberValue(row.invoicedQty), 0),
    totalInvoiceRemainingQty: cards.reduce((sum, row) => sum + numberValue(row.invoiceRemainingQty), 0),
    ambiguousMatchCount,
    unmatchedSourceCount,
  };
  return {
    slug,
    cards,
    summary,
    machines,
    companies: [...companyById.values()].map((row) => ({
      id: text(row.id),
      name: text(row.name),
      type: text(first(row.company_type, row.type)),
      isActive: row.is_active !== 0 && row.is_active !== false,
    })),
  };
}

function listCard(card: Row): Row {
  const { dispatches, productionEntries, invoices, timeline, raw, ...rest } = card;
  return {
    ...rest,
    dispatchPreview: (dispatches || []).slice(0, 3),
    invoicePreview: (invoices || []).slice(0, 3),
    raw: undefined,
  };
}

function filterCards(cards: Row[], query: Row): Row[] {
  const search = normalized(query.search || query.q);
  const status = normalized(query.status);
  const companyId = text(query.companyId);
  return cards.filter((card) => {
    if (status && status !== "ALL" && normalized(card.status) !== status) return false;
    if (companyId && card.companyId !== companyId) return false;
    if (!search) return true;
    return normalized(
      `${card.modelName || ""} ${card.companyName || ""} ${card.orderNo || ""} ${card.defaultDispatchNo || ""}`,
    ).includes(search);
  });
}

async function saveProductionBatch(c: Context<AppEnv>, body: Row) {
  const slug = companySlug(c, body);
  const requestId = text(body.requestId) || crypto.randomUUID();
  const existingRequest = await jsonStoreGet(c, "PRODUCTION_CENTER_REQUEST", requestId, slug).catch(() => null);
  if (existingRequest?.result) return { ...existingRequest.result, idempotent: true };
  const center = await buildCenter(c, slug);
  const cardsById = new Map(center.cards.map((card) => [text(card.id), card]));
  const sourceEntries = Array.isArray(body.entries) ? body.entries : [body];
  const success: Row[] = [];
  const failed: Row[] = [];

  for (const source of sourceEntries) {
    const entry = objectValue(source);
    const clientId = text(entry.clientId || entry.id) || crypto.randomUUID();
    const modelId = text(entry.modelId || entry.modelKaydiId);
    const card = cardsById.get(modelId);
    const grossQty = numberValue(first(entry.quantity, entry.adet, entry.uretimAdedi));
    const printDefectQty = numberValue(first(entry.printDefectQty, entry.baskiHatasiAdet));
    const fabricDefectQty = numberValue(first(entry.fabricDefectQty, entry.kumasHatasiAdet));
    const testQty = numberValue(first(entry.testQty, entry.testAdedi));
    const printArea = text(first(entry.printRegion, entry.printArea, entry.baskiBolgesi));
    const date = isoDate(first(entry.date, entry.tarih)) || new Date().toISOString().slice(0, 10);
    const errors: string[] = [];
    if (!card || card.isVirtual) errors.push("Kayıtlı tek merkez model seçilmelidir.");
    if (!(grossQty > 0)) errors.push("Brüt üretim adedi sıfırdan büyük olmalıdır.");
    if (printDefectQty + fabricDefectQty + testQty > grossQty) {
      errors.push("Sakat ve test toplamı brüt üretimi aşamaz.");
    }
    if (!printArea) errors.push("Baskı bölgesi zorunludur.");
    if (!text(entry.machineId || entry.machineName || entry.makineNo)) errors.push("Makine zorunludur.");
    if (!text(entry.operatorName || entry.operatorId || entry.makinaci)) errors.push("Makinacı zorunludur.");
    if (card && card.incomingQty > 0 && !body.allowOverProduction) {
      const operation = (card.operationRows || []).find(
        (row: Row) => normalized(row.region) === normalized(printArea),
      );
      if (numberValue(operation?.producedQty) + grossQty > numberValue(card.incomingQty)) {
        errors.push("Bu kayıt baskı bölgesi üretimini gelen irsaliye adedinin üzerine çıkarır.");
      }
    }
    if (card) {
      const duplicate = (card.productionEntries || []).some(
        (row: Row) =>
          isoDate(row.date) === date &&
          normalized(row.printArea) === normalized(printArea) &&
          numberValue(row.grossQty) === grossQty &&
          normalized(row.machineId || row.machineName) ===
            normalized(entry.machineId || entry.machineName || entry.makineNo) &&
          normalized(row.operatorName) === normalized(entry.operatorName || entry.operatorId || entry.makinaci),
      );
      if (duplicate) errors.push("Aynı üretim kaydı daha önce girilmiş görünüyor.");
    }
    if (errors.length) {
      failed.push({ clientId, error: errors.join(" ") });
      continue;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const raw = {
      requestId,
      clientId,
      modelId,
      modelName: card?.modelName,
      companyId: card?.companyId,
      companyName: card?.companyName,
      dispatchNo: text(first(entry.dispatchNo, entry.irsaliyeNo, card?.defaultDispatchNo)),
      orderNo: text(first(entry.orderNo, entry.siparisNo, card?.orderNo)),
      batchNo: text(first(entry.batchNo, entry.partiNo, entry.dispatchNo, card?.defaultDispatchNo)) || "GENEL",
      printRegion: printArea,
      quantity: grossQty,
      printDefectQty,
      fabricDefectQty,
      testQty,
      ground: text(first(entry.ground, entry.zemin, card?.groundColor)),
      machineId: text(first(entry.machineId, entry.makineNo)),
      machineName: text(first(entry.machineName, entry.makineAdi, entry.makineNo)),
      shift: text(first(entry.shift, entry.vardiya)),
      operatorName: text(first(entry.operatorName, entry.operatorId, entry.makinaci)),
      note: text(first(entry.note, entry.not)),
      source: "PRODUCTION_CENTER",
      createdAt: now,
    };
    let storage = "production_records";
    try {
      if (!(await tableExists(c, "production_records"))) throw new Error("production_records yok");
      await insertDynamic(c, "production_records", {
        id,
        main_company_slug: slug,
        model_id: modelId,
        model_name: card?.modelName,
        order_no: raw.orderNo,
        ground_color: raw.ground,
        machine_name: raw.machineName || raw.machineId,
        total_quantity: grossQty,
        machinist: raw.operatorName,
        print_area: printArea,
        fabric_defect: String(fabricDefectQty),
        print_defect: String(printDefectQty),
        shift: raw.shift,
        production_date: `${date}T12:00:00.000Z`,
        note: raw.note,
        raw,
        created_at: now,
        updated_at: now,
      });
      if (await tableExists(c, "model_production_links")) {
        await insertDynamic(c, "model_production_links", {
          id: crypto.randomUUID(),
          main_company_slug: slug,
          model_id: modelId,
          production_record_id: id,
          raw: { source: "PRODUCTION_CENTER", requestId, clientId },
          created_at: now,
          updated_at: now,
        }).catch(() => undefined);
      }
    } catch {
      storage = "json_store";
      await jsonStorePut(c, "PRODUCTION_CENTER_ENTRY", id, { id, ...raw, date, grossQty, printArea }, slug);
    }
    success.push({ clientId, id, storage });
  }

  const result = { requestId, success, failed, successCount: success.length, failedCount: failed.length };
  await jsonStorePut(c, "PRODUCTION_CENTER_REQUEST", requestId, { requestId, result }, slug).catch(() => undefined);
  return result;
}

async function createModel(c: Context<AppEnv>, body: Row) {
  const slug = companySlug(c, body);
  const modelName = text(first(body.modelName, body.modelAdi));
  if (!modelName) throw new Error("Model adı zorunludur.");
  const center = await buildCenter(c, slug);
  const companyId = text(first(body.companyId, body.firmaId));
  const orderNo = text(first(body.orderNo, body.siparisNo));
  const duplicate = center.cards.find(
    (card) =>
      !card.isVirtual &&
      normalized(card.modelName) === normalized(modelName) &&
      (!companyId || card.companyId === companyId) &&
      (!orderNo || normalized(card.orderNo) === normalized(orderNo)),
  );
  if (duplicate) return { ...duplicate, duplicate: true };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const company: Row = center.companies.find((row: Row) => row.id === companyId) || {};
  const regions = String(first(body.printRegions, body.printArea, body.baskiBolgesi, "Ön"))
    .split(/[,;|]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const raw = {
    modelName,
    companyId,
    companyName: text(first(company.name, body.companyName, body.firmaAdi)),
    orderNo,
    dispatchNo: text(first(body.dispatchNo, body.irsaliyeNo)),
    expectedQty: numberValue(first(body.expectedQty, body.gelenAdet)),
    printRegions: regions.map((regionName, index) => ({ regionName, sortOrder: index + 1 })),
    source: text(body.sourceModule) || "PRODUCTION_CENTER",
    createdAt: now,
  };
  let storage = "model_records";
  try {
    if (!(await tableExists(c, "model_records"))) throw new Error("model_records yok");
    await insertDynamic(c, "model_records", {
      id,
      main_company_slug: slug,
      model_name: modelName,
      model_code: text(body.modelCode),
      order_no: orderNo,
      company_id: companyId || null,
      customer_id: companyId || null,
      customer_name: raw.companyName,
      source_dispatch_no: raw.dispatchNo,
      customer_dispatch_no: raw.dispatchNo,
      incoming_qty: raw.expectedQty,
      incoming_quantity: raw.expectedQty,
      remaining_quantity: raw.expectedQty,
      status: "ACTIVE",
      raw,
      created_at: now,
      updated_at: now,
    });
  } catch {
    storage = "json_store";
    await jsonStorePut(c, "PRODUCTION_CENTER_MODEL", id, { id, ...raw }, slug);
  }
  if (await tableExists(c, "model_print_regions")) {
    for (const [index, regionName] of regions.entries()) {
      await insertDynamic(c, "model_print_regions", {
        id: crypto.randomUUID(),
        main_company_slug: slug,
        main_company_id: text(body.mainCompanyId) || null,
        model_record_id: id,
        model_id: id,
        region_code: normalized(regionName).replace(/\s+/g, "_").slice(0, 40),
        region_name: regionName,
        sort_order: index + 1,
        is_active: 1,
        created_at: now,
        updated_at: now,
      }).catch(() => undefined);
    }
  }
  return { id, modelId: id, storage, ...raw };
}

async function saveMachine(c: Context<AppEnv>, body: Row, forcedId = "") {
  const slug = companySlug(c, body);
  const machineNo = text(first(body.machineNo, body.makineNo, body.no, forcedId));
  if (!machineNo) throw new Error("Makine numarası zorunludur.");
  const id = forcedId || text(body.id) || machineNo;
  const now = new Date().toISOString();
  const data = {
    id,
    machineNo,
    machineName: text(first(body.machineName, body.makineAdi, body.name, machineNo)),
    dayOperator: text(first(body.dayOperator, body.gunduzMakinaci, body.operator)),
    nightOperator: text(first(body.nightOperator, body.geceMakinaci, body.operator)),
    isActive: body.isActive !== false,
    sortOrder: numberValue(body.sortOrder) || 1,
  };
  try {
    if (!(await tableExists(c, "machine_shift_defaults"))) throw new Error("machine_shift_defaults yok");
    const existing = (await tableRows(c, "machine_shift_defaults", slug)).find(
      (row) => text(row.id) === id || text(row.machine_no) === machineNo,
    );
    if (existing) {
      await updateDynamic(c, "machine_shift_defaults", text(existing.id), {
        machine_no: machineNo,
        machine_name: data.machineName,
        day_operator: data.dayOperator,
        night_operator: data.nightOperator,
        is_active: data.isActive,
        sort_order: data.sortOrder,
        updated_at: now,
      }, slug);
    } else {
      await insertDynamic(c, "machine_shift_defaults", {
        id,
        main_company_slug: slug,
        machine_no: machineNo,
        machine_name: data.machineName,
        day_operator: data.dayOperator,
        night_operator: data.nightOperator,
        is_active: data.isActive,
        sort_order: data.sortOrder,
        created_at: now,
        updated_at: now,
      });
    }
  } catch {
    await jsonStorePut(c, "PRODUCTION_MACHINE", id, data, slug);
  }
  return data;
}

export function registerProductionCenterRoutes(app: Hono<AppEnv>) {
  app.get("/api/production-center", async (c) => {
    const center = await buildCenter(c);
    const filtered = filterCards(center.cards, {
      search: c.req.query("search"),
      status: c.req.query("status"),
      companyId: c.req.query("companyId"),
    });
    const page = Math.max(1, numberValue(c.req.query("page")) || 1);
    const pageSize = Math.max(10, Math.min(500, numberValue(c.req.query("pageSize")) || 100));
    const start = (page - 1) * pageSize;
    return c.json({
      ok: true,
      success: true,
      data: {
        rows: filtered.slice(start, start + pageSize).map(listCard),
        summary: center.summary,
        pagination: { page, pageSize, total: filtered.length },
      },
    });
  });

  app.get("/api/production-center/models/:id", async (c) => {
    const center = await buildCenter(c);
    const card = center.cards.find((row) => text(row.id) === c.req.param("id"));
    return card
      ? c.json({ ok: true, success: true, data: card })
      : c.json(jsonError("MODEL_NOT_FOUND", "Model ve üretim kartı bulunamadı."), 404);
  });

  app.get("/api/production-center/dictionaries", async (c) => {
    const center = await buildCenter(c);
    return c.json({
      ok: true,
      success: true,
      data: {
        models: center.cards.map((card) => ({
          id: card.id,
          modelId: card.id,
          modelName: card.modelName,
          modelAdi: card.modelName,
          companyId: card.companyId,
          companyName: card.companyName,
          defaultDispatchNo: card.defaultDispatchNo || card.dispatchPreview?.[0]?.documentNo || "",
          defaultOrderNo: card.orderNo,
          expectedQty: card.incomingQty,
          defaultPrintArea: card.printRegions?.[0]?.regionName || card.operationRows?.[0]?.region || "",
          printRegions: card.printRegions,
          modelImageUrl: card.imageUrl,
          isVirtual: card.isVirtual,
        })),
        machines: center.machines,
        operators: [...new Set(center.machines.flatMap((machine: Row) => [machine.dayOperator, machine.nightOperator]).filter(Boolean))].map((name) => ({ id: name, name })),
        companies: center.companies,
      },
    });
  });

  app.get("/api/production-center/recent", async (c) => {
    const center = await buildCenter(c);
    const limit = Math.max(1, Math.min(200, numberValue(c.req.query("limit")) || 20));
    const rows = center.cards
      .flatMap((card) =>
        (card.productionEntries || []).map((entry: Row) => ({
          ...entry,
          model: card.modelName,
          modelName: card.modelName,
          modelImageUrl: card.imageUrl,
          baskiBolgesi: entry.printArea,
          adet: entry.grossQty,
          makinaNo: entry.machineId,
          makinaAdi: entry.machineName,
          vardiya: entry.shift,
          makinaci: entry.operatorName,
          tarih: entry.date,
        })),
      )
      .sort((left, right) => text(right.date || right.createdAt).localeCompare(text(left.date || left.createdAt)))
      .slice(0, limit);
    return c.json({ ok: true, success: true, data: rows });
  });

  app.post("/api/production-center/entries/bulk", async (c) => {
    const body = await requestBody(c);
    const result = await saveProductionBatch(c, body);
    return c.json({ ok: true, success: true, data: result }, 201);
  });

  app.post("/api/production-center/entries", async (c) => {
    const body = await requestBody(c);
    const result = await saveProductionBatch(c, {
      ...body,
      entries: [body],
      requestId: text(body.requestId) || crypto.randomUUID(),
    });
    return result.failedCount
      ? c.json(jsonError("PRODUCTION_ENTRY_REJECTED", text(result.failed[0]?.error), result), 409)
      : c.json({ ok: true, success: true, data: result.success[0] }, 201);
  });

  app.post("/api/production-center/models", async (c) => {
    const body = await requestBody(c);
    try {
      const result = await createModel(c, body);
      return c.json({ ok: true, success: true, data: result }, "duplicate" in result && result.duplicate ? 200 : 201);
    } catch (error) {
      return c.json(
        jsonError("MODEL_CREATE_FAILED", error instanceof Error ? error.message : String(error)),
        400,
      );
    }
  });

  app.get("/api/production-center/machines", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: center.machines });
  });

  app.post("/api/production-center/machines", async (c) => {
    const body = await requestBody(c);
    try {
      return c.json({ ok: true, success: true, data: await saveMachine(c, body) }, 201);
    } catch (error) {
      return c.json(
        jsonError("MACHINE_SAVE_FAILED", error instanceof Error ? error.message : String(error)),
        400,
      );
    }
  });

  app.put("/api/production-center/machines/:id", async (c) => {
    const body = await requestBody(c);
    try {
      return c.json({
        ok: true,
        success: true,
        data: await saveMachine(c, body, c.req.param("id")),
      });
    } catch (error) {
      return c.json(
        jsonError("MACHINE_SAVE_FAILED", error instanceof Error ? error.message : String(error)),
        400,
      );
    }
  });

  // Eski üretim ekranlarının aynı tek merkez veri kaynağında çalışması için uyumluluk rotaları.
  app.get("/api/model-flow/models", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: { rows: center.cards.map(listCard), summary: center.summary } });
  });
  app.get("/api/model-flow/reconciliation", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: { rows: center.cards, summary: center.summary } });
  });
  app.get("/api/model-flow/timeline", async (c) => {
    const center = await buildCenter(c);
    const modelId = text(c.req.query("modelId"));
    const rows = modelId
      ? center.cards.find((card) => card.id === modelId)?.timeline || []
      : center.cards.flatMap((card) => card.timeline || []);
    return c.json({ ok: true, success: true, data: rows });
  });
  app.post("/api/model-flow/quick-create", async (c) => {
    const body = await requestBody(c);
    try {
      const result = await createModel(c, body);
      return c.json({ ok: true, success: true, data: { model: result, planLines: [] } }, 201);
    } catch (error) {
      return c.json(jsonError("MODEL_CREATE_FAILED", error instanceof Error ? error.message : String(error)), 400);
    }
  });

  app.get("/api/production/parser-dictionaries", async (c) => {
    const center = await buildCenter(c);
    return c.json({
      ok: true,
      success: true,
      data: {
        models: center.cards.map((card) => ({
          id: card.id,
          modelName: card.modelName,
          modelAdi: card.modelName,
          companyName: card.companyName,
          defaultDispatchNo: card.defaultDispatchNo,
          defaultOrderNo: card.orderNo,
          expectedQty: card.incomingQty,
          printRegions: card.printRegions,
          modelImageUrl: card.imageUrl,
          isVirtual: card.isVirtual,
        })),
        machines: center.machines,
        operators: [...new Set(center.machines.flatMap((machine: Row) => [machine.dayOperator, machine.nightOperator]).filter(Boolean))].map((name) => ({ id: name, name })),
      },
    });
  });
  app.get("/api/production/recent", async (c) => {
    const center = await buildCenter(c);
    const rows = center.cards
      .flatMap((card) => (card.productionEntries || []).map((entry: Row) => ({
        ...entry,
        model: card.modelName,
        modelName: card.modelName,
        modelImageUrl: card.imageUrl,
        baskiBolgesi: entry.printArea,
        adet: entry.grossQty,
        makinaNo: entry.machineId,
        makinaAdi: entry.machineName,
        vardiya: entry.shift,
        makinaci: entry.operatorName,
        tarih: entry.date,
      })))
      .sort((left, right) => text(right.date).localeCompare(text(left.date)))
      .slice(0, Math.max(1, Math.min(200, numberValue(c.req.query("limit")) || 20)));
    return c.json({ ok: true, success: true, data: rows });
  });
  app.post("/api/production/bulk-create", async (c) => {
    const body = await requestBody(c);
    return c.json({ ok: true, success: true, data: await saveProductionBatch(c, body) }, 201);
  });
  app.post("/api/imalat/kayitlar", async (c) => {
  const body = await requestBody(c);
  const mappedEntry = {
    ...body,
    modelId: first(body.modelId, body.modelKaydiId),
    quantity: first(body.quantity, body.adet, body.uretimAdedi),
    printRegion: first(body.printRegion, body.baskiBolgesi),
    machineId: first(body.machineId, body.makineNo, body.makina),
    machineName: first(
      body.machineName,
      body.makineAdi,
      body.makinaAdi,
      body.makineNo,
      body.makina,
    ),
    operatorName: first(
      body.operatorName,
      body.makinaci,
      body.sorumluPersonel,
    ),
    date: first(body.date, body.tarih),
    shift: first(body.shift, body.vardiya),
    dispatchNo: first(
      body.dispatchNo,
      body.irsaliyeNo,
      body.musteriIrsaliyeNo,
    ),
    orderNo: first(body.orderNo, body.siparisNo),
    batchNo: first(body.batchNo, body.partiNo),
    printDefectQty: first(
      body.printDefectQty,
      body.baskiHatasiAdet,
    ),
    fabricDefectQty: first(
      body.fabricDefectQty,
      body.kumasHatasiAdet,
    ),
    testQty: first(body.testQty, body.testAdedi),
  };
  const result = await saveProductionBatch(c, {
    ...body,
    entries: [mappedEntry],
    requestId: text(body.requestId) || crypto.randomUUID(),
  });
  return result.failedCount
    ? c.json(
        jsonError(
"PRODUCTION_ENTRY_REJECTED",
          text(result.failed[0]?.error),
          result,
        ),
        409,
      )
    : c.json(
        { ok: true, success: true, data: result.success[0] },
        201,
      );
});

  app.get("/api/uretim/seri/summary", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: center.summary });
  });
  app.get("/api/uretim/seri/model-search", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: filterCards(center.cards, { search: c.req.query("q") }).map(listCard) });
  });
  app.get("/api/uretim/seri/work-cards", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: center.cards });
  });
  app.get("/api/uretim/seri/incoming-dispatches", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: center.cards.flatMap((card) => card.dispatches || []) });
  });
  app.get("/api/uretim/seri/entries", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: center.cards.flatMap((card) => card.productionEntries || []) });
  });
  app.get("/api/uretim/seri/report", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: { rows: center.cards, summary: center.summary } });
  });
  app.post("/api/uretim/seri/entry", async (c) => {
    const body = await requestBody(c);
    const result = await saveProductionBatch(c, { ...body, entries: [body], requestId: crypto.randomUUID() });
    return result.failedCount
      ? c.json(jsonError("PRODUCTION_ENTRY_REJECTED", text(result.failed[0]?.error), result), 409)
      : c.json({ ok: true, success: true, data: result.success[0] }, 201);
  });
  app.get("/api/uretim/seri/machines", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: center.machines });
  });
  app.post("/api/uretim/seri/machines", async (c) => {
    const body = await requestBody(c);
    return c.json({ ok: true, success: true, data: await saveMachine(c, body) }, 201);
  });
  app.put("/api/uretim/seri/machines/:id", async (c) => {
    const body = await requestBody(c);
    return c.json({ ok: true, success: true, data: await saveMachine(c, body, c.req.param("id")) });
  });
}
