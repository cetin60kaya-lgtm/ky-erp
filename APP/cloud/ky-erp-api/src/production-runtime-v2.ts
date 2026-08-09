import type { Context, Hono } from "hono";

type AppEnv = {
  Bindings: Cloudflare.Env;
  Variables: { requestId: string };
};

type Row = Record<string, any>;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

const num = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = text(value).replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    normalized = `${raw.slice(0, decimal).replace(/[,.]/g, "")}.${raw
      .slice(decimal + 1)
      .replace(/[,.]/g, "")}`;
  } else if (comma >= 0) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0 && (raw.match(/\./g) || []).length > 1) {
    normalized = raw.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalize = (value: unknown) =>
  text(value)
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

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
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
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Row) : {};
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

function isoDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function rowRaw(row: Row) {
  return { ...objectOf(row.raw), ...objectOf(row.metadata) };
}

async function loadCompanies(c: Context<AppEnv>, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT * FROM companies
      WHERE main_company_slug = ?
        AND deleted_at IS NULL
      ORDER BY name`,
  )
    .bind(slug)
    .all<Row>();
  return result.results || [];
}

async function loadMachines(c: Context<AppEnv>, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT * FROM machine_shift_defaults
      WHERE main_company_slug = ?
        AND deleted_at IS NULL
      ORDER BY sort_order, machine_no, id`,
  )
    .bind(slug)
    .all<Row>();
  return (result.results || [])
    .map((row, index) => ({
      id: text(row.id || row.machine_no || row.machine_id),
      machineNo: text(row.machine_no || row.machine_id || row.id),
      no: text(row.machine_no || row.machine_id || row.id),
      machineName: text(row.machine_name || row.machine_no || row.machine_id || row.id),
      dayOperator: text(row.day_operator),
      nightOperator: text(row.night_operator || row.day_operator),
      isActive: row.is_active !== 0 && row.is_active !== false,
      sortOrder: num(row.sort_order || index + 1),
    }))
    .filter((row) => row.machineNo);
}

async function loadModels(c: Context<AppEnv>, slug: string) {
  const [modelsResult, regionsResult, companies] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM model_records
        WHERE main_company_slug = ?
          AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC`,
    )
      .bind(slug)
      .all<Row>(),
    c.env.DB.prepare(
      `SELECT * FROM model_print_regions
        WHERE main_company_slug = ?
          AND deleted_at IS NULL
          AND COALESCE(is_active, 1) = 1
        ORDER BY sort_order, region_name`,
    )
      .bind(slug)
      .all<Row>(),
    loadCompanies(c, slug),
  ]);
  const companyMap = new Map(companies.map((row) => [text(row.id), row]));
  const regions = new Map<string, Row[]>();
  for (const row of regionsResult.results || []) {
    const modelId = text(row.model_id || row.model_record_id);
    if (!modelId) continue;
    const current = regions.get(modelId) || [];
    current.push({
      id: row.id,
      regionName: text(row.region_name),
      regionCode: text(row.region_code),
      sortOrder: num(row.sort_order),
    });
    regions.set(modelId, current);
  }
  return (modelsResult.results || [])
    .map((row) => {
      const raw = rowRaw(row);
      const companyId = text(row.company_id || row.customer_id || raw.companyId);
      const company = companyMap.get(companyId) || {};
      const rawRegions = Array.isArray(raw.printRegions) ? raw.printRegions : [];
      return {
        id: text(row.id),
        modelId: text(row.id),
        designModelId: text(raw.designModelId),
        modelName: text(row.model_name || raw.modelName),
        modelCode: text(row.model_code || raw.modelCode),
        companyId,
        companyName: text(row.customer_name || company.name || raw.companyName),
        orderNo: text(row.order_no || raw.orderNo),
        defaultDispatchNo: text(row.source_dispatch_no || row.customer_dispatch_no || raw.dispatchNo),
        expectedQty: num(row.incoming_qty || row.incoming_quantity || raw.expectedQty),
        groundColor: text(row.ground_color || raw.groundColor),
        imageUrl: text(row.image_url || raw.imageUrl),
        status: text(row.status || "ACTIVE"),
        printRegions:
          regions.get(text(row.id)) ||
          rawRegions.map((item: Row, index: number) => ({
            id: text(item.id || `${row.id}-${index}`),
            regionName: text(item.regionName || item.printAreaName || item.name),
            regionCode: text(item.regionCode || item.printAreaCode),
            sortOrder: num(item.sortOrder || index + 1),
          })),
        createdAt: text(row.created_at || raw.createdAt),
        updatedAt: text(row.updated_at || raw.updatedAt),
        isVirtual: false,
      };
    })
    .filter((row) => row.id && row.modelName);
}

function mapEntry(row: Row) {
  const raw = rowRaw(row);
  const gross = num(row.total_quantity || raw.quantity || raw.grossQty || raw.adet);
  const printDefectQty = num(row.print_defect || raw.printDefectQty || raw.baskiHatasiAdet);
  const fabricDefectQty = num(row.fabric_defect || raw.fabricDefectQty || raw.kumasHatasiAdet);
  const testQty = num(raw.testQty || raw.testAdedi);
  return {
    id: text(row.id),
    modelId: text(row.model_id || raw.modelId),
    modelName: text(row.model_name || raw.modelName),
    orderNo: text(row.order_no || raw.orderNo),
    dispatchNo: text(raw.dispatchNo),
    batchNo: text(raw.batchNo || raw.partiNo || raw.dispatchNo || "GENEL"),
    date: isoDate(row.production_date || raw.date || raw.tarih || row.created_at),
    printArea: text(row.print_area || raw.printRegion || raw.printArea || raw.baskiBolgesi || "Ön"),
    grossQty: gross,
    printDefectQty,
    fabricDefectQty,
    testQty,
    netQty: Math.max(0, gross - printDefectQty - fabricDefectQty - testQty),
    machineId: text(raw.machineId || raw.makineNo || row.machine_name),
    machineName: text(row.machine_name || raw.machineName || raw.makineAdi || raw.machineId),
    shift: text(row.shift || raw.shift || raw.vardiya),
    operatorName: text(row.machinist || raw.operatorName || raw.makinaci),
    ground: text(row.ground_color || raw.ground),
    note: text(row.note || raw.note),
    createdAt: text(row.created_at || raw.createdAt),
    updatedAt: text(row.updated_at),
  };
}

async function loadEntries(c: Context<AppEnv>, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT * FROM production_records
      WHERE main_company_slug = ?
        AND deleted_at IS NULL
      ORDER BY production_date DESC, created_at DESC`,
  )
    .bind(slug)
    .all<Row>();
  return (result.results || []).map(mapEntry);
}

function docKind(row: Row) {
  const raw = rowRaw(row);
  const value = normalize(
    `${row.document_type || ""} ${row.target_type || ""} ${row.detected_type || ""} ${raw.documentKind || ""} ${raw.belgeTuru || ""}`,
  );
  if (/IRSALIYE|DISPATCH/.test(value)) return "DISPATCH";
  if (/FATURA|INVOICE/.test(value)) return "INVOICE";
  return "OTHER";
}

function incomingDirection(row: Row) {
  const raw = rowRaw(row);
  const value = normalize(
    `${raw.direction || ""} ${raw.yon || ""} ${raw.documentDirection || ""} ${row.source_type || ""}`,
  );
  return !/GIDEN|OUTGOING|SATIS/.test(value);
}

async function loadDocumentActivity(c: Context<AppEnv>, slug: string, models: Row[]) {
  if (!models.length) return { dispatches: new Map<string, Row[]>(), invoices: new Map<string, Row[]>() };
  const [docsResult, itemsResult, linksResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM documents
        WHERE main_company_slug = ?
          AND deleted_at IS NULL
        ORDER BY date DESC, created_at DESC`,
    )
      .bind(slug)
      .all<Row>(),
    c.env.DB.prepare(
      `SELECT * FROM invoice_items
        WHERE main_company_slug = ?
          AND deleted_at IS NULL`,
    )
      .bind(slug)
      .all<Row>(),
    c.env.DB.prepare(
      `SELECT * FROM model_document_links
        WHERE main_company_slug = ?
          AND deleted_at IS NULL`,
    )
      .bind(slug)
      .all<Row>(),
  ]);
  const itemsByDoc = new Map<string, Row[]>();
  for (const item of itemsResult.results || []) {
    const current = itemsByDoc.get(text(item.document_id)) || [];
    current.push(item);
    itemsByDoc.set(text(item.document_id), current);
  }
  const linkMap = new Map((linksResult.results || []).map((row) => [text(row.document_id), text(row.model_id)]));
  const modelById = new Map(models.map((model) => [model.id, model]));
  const dispatches = new Map<string, Row[]>();
  const invoices = new Map<string, Row[]>();

  for (const doc of docsResult.results || []) {
    const kind = docKind(doc);
    if (kind === "OTHER") continue;
    if (kind === "DISPATCH" && !incomingDirection(doc)) continue;
    const raw = rowRaw(doc);
    let items = itemsByDoc.get(text(doc.id)) || [];
    if (!items.length && (raw.modelName || raw.modelAdi)) {
      items = [{
        id: `${doc.id}-summary`,
        model_id: raw.modelId,
        model_name: raw.modelName || raw.modelAdi,
        quantity: raw.quantity || raw.adet,
        order_no: raw.orderNo || raw.siparisNo,
      }];
    }
    for (const item of items) {
      const itemRaw = rowRaw(item);
      const explicitId = text(item.model_id || itemRaw.modelId || linkMap.get(text(doc.id)));
      let model = explicitId ? modelById.get(explicitId) : undefined;
      const wantedName = normalize(
        item.model_name || item.product_name || item.description || itemRaw.modelName || itemRaw.modelAdi,
      );
      if (!model && wantedName) {
        const candidates = models.filter((candidate) => normalize(candidate.modelName) === wantedName);
        if (candidates.length === 1) model = candidates[0];
      }
      if (!model) continue;
      const activity = {
        documentId: text(doc.id),
        lineId: text(item.id),
        documentNo: text(doc.document_no || raw.documentNo || raw.belgeNo),
        date: isoDate(doc.date || raw.issueDate || doc.created_at),
        companyId: text(doc.company_id),
        companyName: text(raw.companyName || raw.customerName || model.companyName),
        orderNo: text(item.order_no || itemRaw.orderNo || model.orderNo),
        quantity: num(item.quantity || itemRaw.quantity || itemRaw.adet),
        unit: text(item.unit || itemRaw.unit || "adet"),
        status: text(doc.status),
        sourceType: text(doc.source_type),
        rawName: text(item.model_name || item.product_name || item.description || model.modelName),
      };
      const target = kind === "DISPATCH" ? dispatches : invoices;
      const current = target.get(model.id) || [];
      current.push(activity);
      target.set(model.id, current);
    }
  }
  return { dispatches, invoices };
}

function entryMetrics(entries: Row[], regions: string[], incomingQty: number) {
  const actualRegions = regions.length
    ? regions
    : [...new Set(entries.map((row) => text(row.printArea)).filter(Boolean))];
  const regionRows = (actualRegions.length ? actualRegions : ["Ön"]).map((region) => {
    const related = entries.filter((entry) => normalize(entry.printArea || "Ön") === normalize(region));
    const producedQty = related.reduce((sum, row) => sum + num(row.grossQty), 0);
    const netQty = related.reduce((sum, row) => sum + num(row.netQty), 0);
    return {
      region,
      producedQty,
      netQty,
      remainingQty: incomingQty > 0 ? Math.max(0, incomingQty - producedQty) : 0,
      overQty: incomingQty > 0 ? Math.max(0, producedQty - incomingQty) : 0,
      status:
        incomingQty <= 0
          ? producedQty > 0
            ? "DISPATCH_WAITING"
            : "NEW_MODEL"
          : producedQty > incomingQty
            ? "OVER_PRODUCTION"
            : producedQty < incomingQty
              ? "PRODUCTION_OPEN"
              : "COMPLETED",
    };
  });
  const grossOperationQty = entries.reduce((sum, row) => sum + num(row.grossQty), 0);
  const printDefectQty = entries.reduce((sum, row) => sum + num(row.printDefectQty), 0);
  const fabricDefectQty = entries.reduce((sum, row) => sum + num(row.fabricDefectQty), 0);
  const testQty = entries.reduce((sum, row) => sum + num(row.testQty), 0);
  const completedGrossQty = actualRegions.length
    ? Math.min(...regionRows.map((row) => row.producedQty))
    : grossOperationQty;
  const completedNetQty = actualRegions.length
    ? Math.min(...regionRows.map((row) => row.netQty))
    : entries.reduce((sum, row) => sum + num(row.netQty), 0);
  return {
    grossOperationQty,
    completedGrossQty: Number.isFinite(completedGrossQty) ? completedGrossQty : 0,
    completedNetQty: Number.isFinite(completedNetQty) ? completedNetQty : 0,
    printDefectQty,
    fabricDefectQty,
    testQty,
    defectQty: printDefectQty + fabricDefectQty + testQty,
    operationRows: regionRows,
  };
}

function timelineFor(card: Row) {
  const rows: Row[] = [];
  rows.push({
    id: `model-${card.id}`,
    date: card.createdAt,
    type: "MODEL",
    title: "Model üretime açıldı",
    description: card.modelName,
  });
  for (const entry of card.productionEntries || []) {
    rows.push({
      id: `production-${entry.id}`,
      date: entry.date || entry.createdAt,
      type: "PRODUCTION",
      title: `${entry.printArea || "Üretim"}: ${num(entry.grossQty).toLocaleString("tr-TR")} adet`,
      description: `${entry.machineName || "Makine yok"} · ${entry.shift || "Vardiya yok"} · ${entry.operatorName || "Makinacı yok"}`,
    });
  }
  for (const row of card.dispatches || []) {
    rows.push({
      id: `dispatch-${row.documentId}-${row.lineId}`,
      date: row.date,
      type: "DISPATCH",
      title: `Gelen irsaliye: ${row.documentNo || "Belge"}`,
      description: `${num(row.quantity).toLocaleString("tr-TR")} ${row.unit || "adet"}`,
    });
  }
  for (const row of card.invoices || []) {
    rows.push({
      id: `invoice-${row.documentId}-${row.lineId}`,
      date: row.date,
      type: "INVOICE",
      title: `Kesilen fatura: ${row.documentNo || "Belge"}`,
      description: `${num(row.quantity).toLocaleString("tr-TR")} ${row.unit || "adet"}`,
    });
  }
  return rows.filter((row) => row.date).sort((a, b) => text(b.date).localeCompare(text(a.date)));
}

async function buildCenter(c: Context<AppEnv>, slug = slugOf(c)) {
  const [models, entries, machines, companies] = await Promise.all([
    loadModels(c, slug),
    loadEntries(c, slug),
    loadMachines(c, slug),
    loadCompanies(c, slug),
  ]);
  const documentActivity = await loadDocumentActivity(c, slug, models);
  const entriesByModel = new Map<string, Row[]>();
  for (const entry of entries) {
    if (!entry.modelId) continue;
    const current = entriesByModel.get(entry.modelId) || [];
    current.push(entry);
    entriesByModel.set(entry.modelId, current);
  }
  const cards = models.map((model) => {
    const productionEntries = entriesByModel.get(model.id) || [];
    const dispatches = documentActivity.dispatches.get(model.id) || [];
    const invoices = documentActivity.invoices.get(model.id) || [];
    const dispatchQty = dispatches.reduce((sum, row) => sum + num(row.quantity), 0);
    const incomingQty = dispatchQty > 0 ? dispatchQty : num(model.expectedQty);
    const regions = model.printRegions.map((row: Row) => text(row.regionName)).filter(Boolean);
    const metrics = entryMetrics(productionEntries, regions, incomingQty);
    const invoicedQty = invoices.reduce((sum, row) => sum + num(row.quantity), 0);
    const invoiceableQty = metrics.completedNetQty;
    const productionRemainingQty = incomingQty > 0 ? Math.max(0, incomingQty - metrics.completedGrossQty) : 0;
    const invoiceRemainingQty = Math.max(0, invoiceableQty - invoicedQty);
    const overProducedQty = incomingQty > 0 ? Math.max(0, metrics.completedGrossQty - incomingQty) : 0;
    const overInvoicedQty = Math.max(0, invoicedQty - invoiceableQty);
    let status = "NEW_MODEL";
    if (overProducedQty > 0) status = "OVER_PRODUCTION";
    else if (overInvoicedQty > 0) status = "OVER_INVOICED";
    else if (incomingQty <= 0 && metrics.grossOperationQty > 0) status = "DISPATCH_WAITING";
    else if (incomingQty > 0 && productionRemainingQty > 0) status = "PRODUCTION_OPEN";
    else if (invoiceRemainingQty > 0) status = "INVOICE_OPEN";
    else if (incomingQty > 0 && invoiceRemainingQty === 0 && productionRemainingQty === 0) status = "COMPLETED";
    const card: Row = {
      ...model,
      incomingQty,
      dispatchCount: new Set(dispatches.map((row) => row.documentId)).size,
      ...metrics,
      invoiceableQty,
      invoicedQty,
      productionRemainingQty,
      invoiceRemainingQty,
      overProducedQty,
      overInvoicedQty,
      dispatches,
      productionEntries: [...productionEntries].sort((a, b) => text(b.date).localeCompare(text(a.date))),
      invoices,
      status,
      lastActivityAt: [
        model.updatedAt,
        ...productionEntries.map((row) => row.date || row.createdAt),
        ...dispatches.map((row) => row.date),
        ...invoices.map((row) => row.date),
      ]
        .filter(Boolean)
        .sort()
        .at(-1) || model.createdAt,
    };
    card.timeline = timelineFor(card);
    return card;
  });
  cards.sort((a, b) => text(b.lastActivityAt).localeCompare(text(a.lastActivityAt)));
  const summary = {
    modelCount: cards.length,
    openModelCount: cards.filter((row) => row.status !== "COMPLETED").length,
    modelWaitingCount: 0,
    dispatchWaitingCount: cards.filter((row) => row.status === "DISPATCH_WAITING").length,
    productionOpenCount: cards.filter((row) => row.status === "PRODUCTION_OPEN").length,
    invoiceOpenCount: cards.filter((row) => row.status === "INVOICE_OPEN").length,
    controlCount: cards.filter((row) => ["OVER_PRODUCTION", "OVER_INVOICED"].includes(row.status)).length,
    totalIncomingQty: cards.reduce((sum, row) => sum + num(row.incomingQty), 0),
    totalCompletedNetQty: cards.reduce((sum, row) => sum + num(row.completedNetQty), 0),
    totalInvoicedQty: cards.reduce((sum, row) => sum + num(row.invoicedQty), 0),
    totalInvoiceRemainingQty: cards.reduce((sum, row) => sum + num(row.invoiceRemainingQty), 0),
    ambiguousMatchCount: 0,
    unmatchedSourceCount: 0,
  };
  return {
    cards,
    machines,
    companies: companies.map((row) => ({
      id: text(row.id),
      name: text(row.name),
      type: text(row.company_type || row.type),
      isActive: row.is_active !== 0 && row.is_active !== false,
    })),
    summary,
  };
}

function filterCards(cards: Row[], query: Row) {
  const search = normalize(query.search || query.q || query.model || query.firma);
  const status = normalize(query.status || query.durum);
  const companyId = text(query.companyId);
  return cards.filter((card) => {
    if (status && status !== "ALL" && normalize(card.status) !== status) return false;
    if (companyId && card.companyId !== companyId) return false;
    if (!search) return true;
    return normalize(`${card.modelName} ${card.companyName} ${card.orderNo} ${card.defaultDispatchNo}`).includes(search);
  });
}

async function saveRegions(c: Context<AppEnv>, slug: string, modelId: string, regionsInput: unknown) {
  const values = Array.isArray(regionsInput)
    ? regionsInput
    : text(regionsInput || "Ön").split(/[,;|]/);
  const regions = values
    .map((value: any) => text(value?.regionName || value?.printAreaName || value?.name || value))
    .filter(Boolean);
  await c.env.DB.prepare(
    `DELETE FROM model_print_regions WHERE main_company_slug = ? AND model_id = ?`,
  )
    .bind(slug, modelId)
    .run();
  for (const [index, regionName] of [...new Set(regions.length ? regions : ["Ön"])].entries()) {
    await c.env.DB.prepare(
      `INSERT INTO model_print_regions
        (id, main_company_slug, model_record_id, model_id, region_code, region_name, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        slug,
        modelId,
        modelId,
        normalize(regionName).replace(/\s+/g, "_").slice(0, 40),
        regionName,
        index + 1,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
  }
}

async function saveModel(c: Context<AppEnv>, body: Row, forcedId = "") {
  const slug = slugOf(c, body);
  const modelName = text(body.modelName || body.modelAdi);
  if (!modelName) throw new Error("Model adı zorunludur.");
  const companyId = text(body.companyId || body.firmaId);
  const center = await buildCenter(c, slug);
  const duplicate = center.cards.find(
    (row) =>
      normalize(row.modelName) === normalize(modelName) &&
      (!companyId || !row.companyId || row.companyId === companyId),
  );
  if (duplicate && !forcedId) return { ...duplicate, duplicate: true };
  const id = forcedId || text(body.id) || crypto.randomUUID();
  const now = new Date().toISOString();
  const existing = center.cards.find((row) => row.id === id);
  const company = center.companies.find((row) => row.id === companyId);
  const raw = {
    ...(existing ? { designModelId: existing.designModelId } : {}),
    designModelId: text(body.designModelId || existing?.designModelId),
    modelName,
    companyId,
    companyName: text(body.companyName || body.firmaAdi || company?.name || existing?.companyName),
    orderNo: text(body.orderNo || body.siparisNo || existing?.orderNo),
    dispatchNo: text(body.dispatchNo || body.irsaliyeNo || existing?.defaultDispatchNo),
    expectedQty: num(body.expectedQty ?? body.gelenAdet ?? existing?.incomingQty),
    imageUrl: text(body.imageUrl || body.modelImageUrl || existing?.imageUrl),
    source: text(body.sourceModule || "PRODUCTION_V2"),
    updatedAt: now,
  };
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE model_records
          SET model_name = ?, model_code = ?, order_no = ?, company_id = ?, customer_id = ?, customer_name = ?,
              source_dispatch_no = ?, customer_dispatch_no = ?, incoming_qty = ?, incoming_quantity = ?,
              remaining_quantity = ?, ground_color = ?, image_url = ?, status = 'ACTIVE', raw = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ? AND main_company_slug = ?`,
    )
      .bind(
        modelName,
        text(body.modelCode || existing.modelCode),
        raw.orderNo,
        companyId || null,
        companyId || null,
        raw.companyName,
        raw.dispatchNo,
        raw.dispatchNo,
        raw.expectedQty,
        raw.expectedQty,
        Math.max(0, raw.expectedQty - num(existing.completedGrossQty)),
        text(body.groundColor || body.zemin || existing.groundColor),
        raw.imageUrl,
        JSON.stringify(raw),
        now,
        id,
        slug,
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO model_records
        (id, main_company_slug, model_name, model_code, order_no, company_id, customer_id, customer_name,
         source_dispatch_no, customer_dispatch_no, incoming_qty, incoming_quantity, remaining_quantity,
         ground_color, image_url, status, raw, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    )
      .bind(
        id,
        slug,
        modelName,
        text(body.modelCode),
        raw.orderNo,
        companyId || null,
        companyId || null,
        raw.companyName,
        raw.dispatchNo,
        raw.dispatchNo,
        raw.expectedQty,
        raw.expectedQty,
        raw.expectedQty,
        text(body.groundColor || body.zemin),
        raw.imageUrl,
        JSON.stringify(raw),
        now,
        now,
      )
      .run();
  }
  await saveRegions(c, slug, id, body.printRegions || body.baskiBolgesi || existing?.printRegions || "Ön");
  return { id, modelId: id, ...raw, duplicate: false };
}

async function saveMachine(c: Context<AppEnv>, body: Row, forcedId = "") {
  const slug = slugOf(c, body);
  const machineNo = text(body.machineNo || body.makineNo || body.no || forcedId);
  if (!machineNo) throw new Error("Makine numarası zorunludur.");
  const id = forcedId || text(body.id) || machineNo;
  const machineName = text(body.machineName || body.makineAdi || body.name || machineNo);
  const dayOperator = text(body.dayOperator || body.gunduzMakinaci || body.operator);
  const nightOperator = text(body.nightOperator || body.geceMakinaci || dayOperator);
  if (!machineName || !dayOperator) throw new Error("Makine adı ve gündüz makinacısı zorunludur.");
  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    `SELECT id FROM machine_shift_defaults WHERE main_company_slug = ? AND (id = ? OR machine_no = ?) LIMIT 1`,
  )
    .bind(slug, id, machineNo)
    .first<Row>();
  if (existing?.id) {
    await c.env.DB.prepare(
      `UPDATE machine_shift_defaults
          SET machine_no = ?, machine_name = ?, day_operator = ?, night_operator = ?, is_active = ?, sort_order = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ? AND main_company_slug = ?`,
    )
      .bind(
        machineNo,
        machineName,
        dayOperator,
        nightOperator,
        body.isActive === false || body.durum === "Pasif" ? 0 : 1,
        num(body.sortOrder) || 1,
        now,
        text(existing.id),
        slug,
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO machine_shift_defaults
        (id, main_company_slug, machine_id, machine_no, machine_name, day_operator, night_operator, is_active, sort_order, raw, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        slug,
        machineNo,
        machineNo,
        machineName,
        dayOperator,
        nightOperator,
        body.isActive === false || body.durum === "Pasif" ? 0 : 1,
        num(body.sortOrder) || 1,
        JSON.stringify({ source: "PRODUCTION_V2" }),
        now,
        now,
      )
      .run();
  }
  return {
    id,
    machineNo,
    no: machineNo,
    machineName,
    dayOperator,
    nightOperator,
    isActive: body.isActive !== false && body.durum !== "Pasif",
    sortOrder: num(body.sortOrder) || 1,
  };
}

async function saveEntry(c: Context<AppEnv>, body: Row, forcedId = "") {
  const slug = slugOf(c, body);
  const center = await buildCenter(c, slug);
  const modelId = text(body.modelId || body.modelKaydiId);
  const model = center.cards.find((row) => row.id === modelId);
  if (!model) throw new Error("Üretim için Desenlerden veya Yeni Model'den açılmış bir model seçilmelidir.");
  const quantity = num(body.quantity || body.adet || body.uretimAdedi);
  const printDefectQty = num(body.printDefectQty || body.baskiHatasiAdet);
  const fabricDefectQty = num(body.fabricDefectQty || body.kumasHatasiAdet);
  const testQty = num(body.testQty || body.testAdedi);
  const printArea = text(body.printRegion || body.printArea || body.baskiBolgesi || "Ön");
  const machineId = text(body.machineId || body.makineNo || body.makina);
  const machineName = text(body.machineName || body.makineAdi || body.makinaAdi || machineId);
  const operatorName = text(body.operatorName || body.makinaci || body.sorumluPersonel);
  const shift = text(body.shift || body.vardiya || "Gündüz");
  const date = isoDate(body.date || body.tarih) || new Date().toISOString().slice(0, 10);
  if (!(quantity > 0)) throw new Error("Üretim adedi sıfırdan büyük olmalıdır.");
  if (!machineId || !operatorName) throw new Error("Makine ve makinacı zorunludur.");
  if (printDefectQty + fabricDefectQty + testQty > quantity) {
    throw new Error("Sakat ve test toplamı üretim adedini aşamaz.");
  }
  const id = forcedId || text(body.id) || crypto.randomUUID();
  const now = new Date().toISOString();
  const raw = {
    modelId,
    modelName: model.modelName,
    companyId: model.companyId,
    companyName: model.companyName,
    designModelId: model.designModelId,
    dispatchNo: text(body.dispatchNo || body.irsaliyeNo || model.defaultDispatchNo),
    orderNo: text(body.orderNo || body.siparisNo || model.orderNo),
    batchNo: text(body.batchNo || body.partiNo || body.dispatchNo || model.defaultDispatchNo || "GENEL"),
    printRegion: printArea,
    quantity,
    printDefectQty,
    fabricDefectQty,
    testQty,
    machineId,
    machineName,
    shift,
    operatorName,
    note: text(body.note || body.not),
    date,
    source: "PRODUCTION_V2",
  };
  const duplicate = model.productionEntries?.some(
    (row: Row) =>
      row.id !== id &&
      isoDate(row.date) === date &&
      normalize(row.printArea) === normalize(printArea) &&
      num(row.grossQty) === quantity &&
      normalize(row.machineId || row.machineName) === normalize(machineId || machineName) &&
      normalize(row.operatorName) === normalize(operatorName),
  );
  if (duplicate) throw new Error("Aynı üretim kaydı daha önce girilmiş görünüyor.");

  const existing = forcedId
    ? await c.env.DB.prepare(
        `SELECT id FROM production_records WHERE id = ? AND main_company_slug = ? AND deleted_at IS NULL LIMIT 1`,
      )
        .bind(forcedId, slug)
        .first<Row>()
    : null;
  if (existing?.id) {
    await c.env.DB.prepare(
      `UPDATE production_records
          SET model_id = ?, model_name = ?, order_no = ?, ground_color = ?, machine_name = ?, total_quantity = ?,
              machinist = ?, print_area = ?, fabric_defect = ?, print_defect = ?, shift = ?, production_date = ?, note = ?, raw = ?, updated_at = ?
        WHERE id = ? AND main_company_slug = ?`,
    )
      .bind(
        modelId,
        model.modelName,
        raw.orderNo,
        text(body.ground || body.zemin || model.groundColor),
        machineName,
        quantity,
        operatorName,
        printArea,
        String(fabricDefectQty),
        String(printDefectQty),
        shift,
        `${date}T12:00:00.000Z`,
        raw.note,
        JSON.stringify(raw),
        now,
        id,
        slug,
      )
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO production_records
        (id, main_company_slug, model_id, model_name, order_no, ground_color, machine_name, total_quantity,
         machinist, print_area, fabric_defect, print_defect, shift, production_date, note, raw, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        slug,
        modelId,
        model.modelName,
        raw.orderNo,
        text(body.ground || body.zemin || model.groundColor),
        machineName,
        quantity,
        operatorName,
        printArea,
        String(fabricDefectQty),
        String(printDefectQty),
        shift,
        `${date}T12:00:00.000Z`,
        raw.note,
        JSON.stringify(raw),
        now,
        now,
      )
      .run();
    await c.env.DB.prepare(
      `INSERT INTO model_production_links
        (id, main_company_slug, model_id, production_record_id, raw, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), slug, modelId, id, JSON.stringify({ source: "PRODUCTION_V2" }), now, now)
      .run();
  }
  return { id, modelId, modelName: model.modelName, date, printArea, quantity, netQty: Math.max(0, quantity - printDefectQty - fabricDefectQty - testQty), machineId, machineName, shift, operatorName };
}

function reportFilter(rows: Row[], query: Row) {
  const start = isoDate(query.baslangic || query.startDate);
  const end = isoDate(query.bitis || query.endDate);
  const model = normalize(query.model);
  const company = normalize(query.firma);
  const machine = normalize(query.makine);
  const operator = normalize(query.makinaci);
  const shift = normalize(query.vardiya);
  const area = normalize(query.baskiBolgesi);
  return rows.filter((row) => {
    const date = isoDate(row.tarih || row.date);
    if (start && date < start) return false;
    if (end && date > end) return false;
    if (model && !normalize(row.model).includes(model)) return false;
    if (company && !normalize(row.firma).includes(company)) return false;
    if (machine && !normalize(`${row.makineNo} ${row.makineAdi}`).includes(machine)) return false;
    if (operator && !normalize(row.makinaci).includes(operator)) return false;
    if (shift && normalize(row.vardiya) !== shift) return false;
    if (area && !normalize(row.baskiBolgesi).includes(area)) return false;
    return true;
  });
}

function reportPayload(center: Row, query: Row) {
  const allRows = center.cards.flatMap((card: Row) =>
    (card.productionEntries || []).map((entry: Row) => ({
      id: entry.id,
      tarih: entry.date,
      firma: card.companyName,
      model: card.modelName,
      partiNo: entry.batchNo,
      baskiBolgesi: entry.printArea,
      basilan: entry.grossQty,
      net: entry.netQty,
      makineNo: entry.machineId,
      makineAdi: entry.machineName,
      vardiya: entry.shift,
      makinaci: entry.operatorName,
      durum: "Tamam",
    })),
  );
  const rows = reportFilter(allRows, query);
  const machineMap = new Map<string, Row>();
  const operatorMap = new Map<string, Row>();
  for (const row of rows) {
    const machineKey = `${row.makineNo}|${row.makineAdi}`;
    const machine = machineMap.get(machineKey) || {
      id: machineKey,
      makineNo: row.makineNo,
      makineAdi: row.makineAdi,
      operasyonAdedi: 0,
      tamamlananModelAdedi: 0,
      eksik: 0,
    };
    machine.operasyonAdedi += 1;
    machine.tamamlananModelAdedi += num(row.basilan);
    machineMap.set(machineKey, machine);
    const operatorKey = `${row.makinaci}|${row.vardiya}`;
    const operatorRow = operatorMap.get(operatorKey) || {
      id: operatorKey,
      makinaci: row.makinaci,
      vardiya: row.vardiya,
      basilanBolgeAdedi: 0,
      operasyonAdedi: 0,
      tamamlananModelAdedi: 0,
    };
    operatorRow.basilanBolgeAdedi += 1;
    operatorRow.operasyonAdedi += 1;
    operatorRow.tamamlananModelAdedi += num(row.basilan);
    operatorMap.set(operatorKey, operatorRow);
  }
  const modelRows = center.cards.flatMap((card: Row) =>
    (card.operationRows || []).map((operation: Row) => ({
      id: `${card.id}-${operation.region}`,
      model: card.modelName,
      firma: card.companyName,
      baskiBolgesi: operation.region,
      operasyonAdedi: (card.productionEntries || []).filter((entry: Row) => normalize(entry.printArea) === normalize(operation.region)).length,
      tamamlananModelAdedi: operation.producedQty,
      eksik: operation.remainingQty,
      durum:
        operation.overQty > 0
          ? "Kontrol Gerekli"
          : operation.remainingQty > 0
            ? "Eksik Operasyon"
            : operation.producedQty > 0
              ? "Tamam"
              : "Bekliyor",
    })),
  );
  const today = new Date().toISOString().slice(0, 10);
  return {
    summary: {
      eksikOperasyon: modelRows.filter((row: Row) => num(row.eksik) > 0).length,
      bugunBasilanAdet: rows.filter((row: Row) => row.tarih === today).reduce((sum: number, row: Row) => sum + num(row.basilan), 0),
      aktifMakine: center.machines.filter((row: Row) => row.isActive !== false).length,
      tamamlananModelAdedi: center.cards.filter((row: Row) => row.status === "COMPLETED").length,
    },
    rows,
    machineRows: [...machineMap.values()],
    operatorRows: [...operatorMap.values()],
    modelRows,
  };
}

function auditPayload(center: Row, query: Row) {
  const report = reportPayload(center, query);
  const rows = center.cards.flatMap((card: Row) =>
    (card.operationRows || []).map((operation: Row) => {
      const recent = (card.productionEntries || []).find((entry: Row) => normalize(entry.printArea) === normalize(operation.region)) || {};
      return {
        id: `${card.id}-${operation.region}`,
        model: card.modelName,
        firma: card.companyName,
        partiNo: recent.batchNo || card.defaultDispatchNo || "-",
        baskiBolgesi: operation.region,
        planlanan: card.incomingQty,
        basilan: operation.producedQty,
        eksik: operation.remainingQty,
        makineNo: recent.machineId || "",
        makineAdi: recent.machineName || "",
        vardiya: recent.shift || "",
        makinaci: recent.operatorName || "",
        zemin: recent.ground || card.groundColor || "",
        durum:
          operation.overQty > 0
            ? "Kontrol Gerekli"
            : operation.remainingQty > 0
              ? "Eksik Operasyon"
              : operation.producedQty > 0
                ? "Tamam"
                : "Bekliyor",
        modelImageUrl: card.imageUrl || "",
      };
    }),
  );
  return {
    summary: {
      acikParti: center.cards.filter((row: Row) => row.status !== "COMPLETED").length,
      kontrolGereken: rows.filter((row: Row) => row.durum === "Kontrol Gerekli").length,
      eksikBolge: rows.filter((row: Row) => row.durum === "Eksik Operasyon").length,
      bugunBasilanAdet: report.summary.bugunBasilanAdet,
    },
    rows,
  };
}

export function registerProductionRuntimeV2Routes(app: Hono<AppEnv>) {
  app.get("/api/production-center", async (c) => {
    const center = await buildCenter(c);
    const filtered = filterCards(center.cards, {
      search: c.req.query("search"),
      status: c.req.query("status"),
      companyId: c.req.query("companyId"),
    });
    const page = Math.max(1, num(c.req.query("page")) || 1);
    const pageSize = Math.max(10, Math.min(500, num(c.req.query("pageSize")) || 100));
    const start = (page - 1) * pageSize;
    return c.json({ ok: true, success: true, data: { rows: filtered.slice(start, start + pageSize), summary: center.summary, pagination: { page, pageSize, total: filtered.length } } });
  });

  app.get("/api/production-center/models/:id", async (c) => {
    const center = await buildCenter(c);
    const card = center.cards.find((row: Row) => row.id === c.req.param("id"));
    return card
      ? c.json({ ok: true, success: true, data: card })
      : c.json(errorBody("MODEL_NOT_FOUND", "Üretim modeli bulunamadı."), 404);
  });

  app.get("/api/production-center/dictionaries", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: {
      models: center.cards.map((card: Row) => ({
        id: card.id,
        modelId: card.id,
        modelName: card.modelName,
        modelAdi: card.modelName,
        companyId: card.companyId,
        companyName: card.companyName,
        defaultDispatchNo: card.defaultDispatchNo,
        defaultOrderNo: card.orderNo,
        expectedQty: card.incomingQty,
        defaultPrintArea: card.printRegions?.[0]?.regionName || card.operationRows?.[0]?.region || "Ön",
        printRegions: card.printRegions,
        modelImageUrl: card.imageUrl,
        isVirtual: false,
      })),
      machines: center.machines.filter((row: Row) => row.isActive !== false),
      operators: [...new Set(center.machines.flatMap((machine: Row) => [machine.dayOperator, machine.nightOperator]).filter(Boolean))].map((name) => ({ id: name, name })),
      companies: center.companies,
    } });
  });

  app.get("/api/production-center/recent", async (c) => {
    const center = await buildCenter(c);
    const limit = Math.max(1, Math.min(200, num(c.req.query("limit")) || 20));
    const rows = center.cards.flatMap((card: Row) => (card.productionEntries || []).map((entry: Row) => ({ ...entry, model: card.modelName, modelName: card.modelName, modelImageUrl: card.imageUrl, baskiBolgesi: entry.printArea, adet: entry.grossQty, makinaNo: entry.machineId, makinaAdi: entry.machineName, vardiya: entry.shift, makinaci: entry.operatorName, tarih: entry.date }))).sort((a: Row, b: Row) => text(b.date).localeCompare(text(a.date))).slice(0, limit);
    return c.json({ ok: true, success: true, data: rows });
  });

  app.post("/api/production-center/models", async (c) => {
    try {
      const result = await saveModel(c, await bodyOf(c));
      return c.json({ ok: true, success: true, data: result }, result.duplicate ? 200 : 201);
    } catch (error) {
      return c.json(errorBody("MODEL_SAVE_FAILED", error instanceof Error ? error.message : String(error)), 400);
    }
  });

  app.put("/api/production-center/models/:id", async (c) => {
    try {
      return c.json({ ok: true, success: true, data: await saveModel(c, await bodyOf(c), c.req.param("id")) });
    } catch (error) {
      return c.json(errorBody("MODEL_SAVE_FAILED", error instanceof Error ? error.message : String(error)), 400);
    }
  });

  app.delete("/api/production-center/models/:id", async (c) => {
    const slug = slugOf(c);
    const id = c.req.param("id");
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM production_records WHERE main_company_slug = ? AND model_id = ? AND deleted_at IS NULL`,
    ).bind(slug, id).first<Row>();
    if (num(count?.count) > 0) return c.json(errorBody("MODEL_HAS_PRODUCTION", "Üretim hareketi olan model silinemez; önce hareketleri silin."), 409);
    const now = new Date().toISOString();
    await c.env.DB.prepare(`UPDATE model_records SET deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND id = ?`).bind(now, now, slug, id).run();
    await c.env.DB.prepare(`UPDATE model_print_regions SET deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND model_id = ?`).bind(now, now, slug, id).run();
    return c.json({ ok: true, success: true, data: { id, deleted: true } });
  });

  app.post("/api/production-center/entries", async (c) => {
    try {
      return c.json({ ok: true, success: true, data: await saveEntry(c, await bodyOf(c)) }, 201);
    } catch (error) {
      return c.json(errorBody("PRODUCTION_ENTRY_REJECTED", error instanceof Error ? error.message : String(error)), 409);
    }
  });

  app.post("/api/production-center/entries/bulk", async (c) => {
    const body = await bodyOf(c);
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const success: Row[] = [];
    const failed: Row[] = [];
    for (const entry of entries) {
      try {
        const saved = await saveEntry(c, { ...body, ...objectOf(entry) });
        success.push({ ...saved, clientId: text(objectOf(entry).clientId || objectOf(entry).id) });
      } catch (error) {
        failed.push({ clientId: text(objectOf(entry).clientId || objectOf(entry).id), error: error instanceof Error ? error.message : String(error) });
      }
    }
    return c.json({ ok: true, success: true, data: { requestId: text(body.requestId), success, failed, successCount: success.length, failedCount: failed.length } }, 201);
  });

  app.patch("/api/production-center/entries/:id", async (c) => {
    try {
      return c.json({ ok: true, success: true, data: await saveEntry(c, await bodyOf(c), c.req.param("id")) });
    } catch (error) {
      return c.json(errorBody("PRODUCTION_ENTRY_UPDATE_FAILED", error instanceof Error ? error.message : String(error)), 409);
    }
  });

  app.delete("/api/production-center/entries/:id", async (c) => {
    const slug = slugOf(c);
    const id = c.req.param("id");
    const now = new Date().toISOString();
    await c.env.DB.prepare(`UPDATE production_records SET deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND id = ?`).bind(now, now, slug, id).run();
    await c.env.DB.prepare(`UPDATE model_production_links SET deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND production_record_id = ?`).bind(now, now, slug, id).run();
    return c.json({ ok: true, success: true, data: { id, deleted: true } });
  });

  app.get("/api/production-center/machines", async (c) => c.json({ ok: true, success: true, data: await loadMachines(c, slugOf(c)) }));
  app.post("/api/production-center/machines", async (c) => {
    try { return c.json({ ok: true, success: true, data: await saveMachine(c, await bodyOf(c)) }, 201); }
    catch (error) { return c.json(errorBody("MACHINE_SAVE_FAILED", error instanceof Error ? error.message : String(error)), 400); }
  });
  app.put("/api/production-center/machines/:id", async (c) => {
    try { return c.json({ ok: true, success: true, data: await saveMachine(c, await bodyOf(c), c.req.param("id")) }); }
    catch (error) { return c.json(errorBody("MACHINE_SAVE_FAILED", error instanceof Error ? error.message : String(error)), 400); }
  });
  app.delete("/api/production-center/machines/:id", async (c) => {
    const slug = slugOf(c); const id = c.req.param("id"); const now = new Date().toISOString();
    await c.env.DB.prepare(`UPDATE machine_shift_defaults SET is_active = 0, deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND id = ?`).bind(now, now, slug, id).run();
    return c.json({ ok: true, success: true, data: { id, deleted: true } });
  });

  // Mevcut İmalat rapor ve ayar ekranlarının temiz runtime ile çalışması için uyumluluk rotaları.
  app.get("/api/imalat/denetim", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: auditPayload(center, Object.fromEntries(new URL(c.req.url).searchParams.entries())) });
  });
  app.get("/api/imalat/rapor", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: reportPayload(center, Object.fromEntries(new URL(c.req.url).searchParams.entries())) });
  });
  app.get("/api/imalat/makineler", async (c) => c.json({ ok: true, success: true, data: await loadMachines(c, slugOf(c)) }));
  app.post("/api/imalat/makineler", async (c) => {
    try { return c.json({ ok: true, success: true, data: await saveMachine(c, await bodyOf(c)) }, 201); }
    catch (error) { return c.json(errorBody("MACHINE_SAVE_FAILED", error instanceof Error ? error.message : String(error)), 400); }
  });
  app.put("/api/imalat/makineler/:id", async (c) => {
    try { return c.json({ ok: true, success: true, data: await saveMachine(c, await bodyOf(c), c.req.param("id")) }); }
    catch (error) { return c.json(errorBody("MACHINE_SAVE_FAILED", error instanceof Error ? error.message : String(error)), 400); }
  });
  app.delete("/api/imalat/makineler/:id", async (c) => {
    const slug = slugOf(c); const id = c.req.param("id"); const now = new Date().toISOString();
    await c.env.DB.prepare(`UPDATE machine_shift_defaults SET is_active = 0, deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND id = ?`).bind(now, now, slug, id).run();
    return c.json({ ok: true, success: true, data: { id, deleted: true } });
  });

  app.post("/api/imalat/kayitlar", async (c) => {
    try { return c.json({ ok: true, success: true, data: await saveEntry(c, await bodyOf(c)) }, 201); }
    catch (error) { return c.json(errorBody("PRODUCTION_ENTRY_REJECTED", error instanceof Error ? error.message : String(error)), 409); }
  });
  app.patch("/api/imalat/kayitlar/:id", async (c) => {
    try { return c.json({ ok: true, success: true, data: await saveEntry(c, await bodyOf(c), c.req.param("id")) }); }
    catch (error) { return c.json(errorBody("PRODUCTION_ENTRY_UPDATE_FAILED", error instanceof Error ? error.message : String(error)), 409); }
  });
  app.delete("/api/imalat/kayitlar/:id", async (c) => {
    const slug = slugOf(c); const id = c.req.param("id"); const now = new Date().toISOString();
    await c.env.DB.prepare(`UPDATE production_records SET deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND id = ?`).bind(now, now, slug, id).run();
    await c.env.DB.prepare(`UPDATE model_production_links SET deleted_at = ?, updated_at = ? WHERE main_company_slug = ? AND production_record_id = ?`).bind(now, now, slug, id).run();
    return c.json({ ok: true, success: true, data: { id, deleted: true } });
  });

  // Akıllı seri giriş eski servis adları da aynı temiz kaynağı kullanır.
  app.get("/api/production/parser-dictionaries", async (c) => {
    const center = await buildCenter(c);
    return c.json({ ok: true, success: true, data: {
      models: center.cards.map((card: Row) => ({ id: card.id, modelName: card.modelName, modelAdi: card.modelName, companyName: card.companyName, defaultDispatchNo: card.defaultDispatchNo, defaultOrderNo: card.orderNo, expectedQty: card.incomingQty, printRegions: card.printRegions, modelImageUrl: card.imageUrl, isVirtual: false })),
      machines: center.machines.filter((row: Row) => row.isActive !== false),
      operators: [...new Set(center.machines.flatMap((machine: Row) => [machine.dayOperator, machine.nightOperator]).filter(Boolean))].map((name) => ({ id: name, name })),
    } });
  });
  app.get("/api/production/recent", async (c) => {
    const center = await buildCenter(c); const limit = Math.max(1, Math.min(200, num(c.req.query("limit")) || 20));
    const rows = center.cards.flatMap((card: Row) => (card.productionEntries || []).map((entry: Row) => ({ ...entry, model: card.modelName, modelName: card.modelName, modelImageUrl: card.imageUrl, baskiBolgesi: entry.printArea, adet: entry.grossQty, makinaNo: entry.machineId, makinaAdi: entry.machineName, vardiya: entry.shift, makinaci: entry.operatorName, tarih: entry.date }))).sort((a: Row, b: Row) => text(b.date).localeCompare(text(a.date))).slice(0, limit);
    return c.json({ ok: true, success: true, data: rows });
  });
  app.post("/api/production/bulk-create", async (c) => {
    const body = await bodyOf(c); const entries = Array.isArray(body.entries) ? body.entries : []; const success: Row[] = []; const failed: Row[] = [];
    for (const entry of entries) { try { const saved = await saveEntry(c, { ...body, ...objectOf(entry) }); success.push({ ...saved, clientId: text(objectOf(entry).clientId || objectOf(entry).id) }); } catch (error) { failed.push({ clientId: text(objectOf(entry).clientId || objectOf(entry).id), error: error instanceof Error ? error.message : String(error) }); } }
    return c.json({ ok: true, success: true, data: { requestId: text(body.requestId), success, failed, successCount: success.length, failedCount: failed.length } }, 201);
  });
}
