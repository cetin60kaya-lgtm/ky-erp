import type { Context, Hono } from "hono";
import { analyzeDesignWithAi, needsAiAnalysis } from "./desen-ai";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const MODEL_SCOPE = "DESEN_WORKFLOW_MODEL";
const INBOX_SCOPE = "DESEN_INBOX_FILE";
const BOYAHANE_JOB_SCOPE = "BOYAHANE_JOB";
const BOYAHANE_COLOR_SCOPE = "BOYAHANE_JOB_COLOR";
const REGISTERED_COLOR_SCOPE = "BOYAHANE_REGISTERED_COLOR";

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
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
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

function stableId(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return `dsg-${(hash >>> 0).toString(36)}`;
}

function safeName(value: unknown) {
  return text(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function storeList(
  c: Context<AppEnv>,
  scope: string,
  slug: string,
): Promise<Row[]> {
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
): Promise<Row | null> {
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
): Promise<Row> {
  const existing = await storeGet(c, scope, fileName, slug);
  const timestamp = nowIso();
  const payload = { ...data, updatedAt: timestamp };
  if (existing?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store
          SET data = ?, updated_at = ?
        WHERE id = ?
          AND (main_company_slug = ? OR main_company_slug IS NULL)`,
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
  await c.env.DB.prepare(
    `DELETE FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)`,
  )
    .bind(scope, fileName, slug)
    .run();
}

function inferArea(fileName: string) {
  const value = normalize(fileName);
  if (/ARKA|BACK/.test(value)) return ["BACK", "Arka"];
  if (/ENSE ETIKET|NECK LABEL/.test(value)) return ["NECK_LABEL", "Ense Etiket"];
  if (/ENSE|NECK/.test(value)) return ["NECK", "Ense"];
  if (/SOL KOL|LEFT SLEEVE/.test(value)) return ["LEFT_SLEEVE", "Sol Kol"];
  if (/SAG KOL|RIGHT SLEEVE/.test(value)) return ["RIGHT_SLEEVE", "Sağ Kol"];
  if (/SOL PACA|LEFT LEG/.test(value)) return ["LEFT_LEG", "Sol Paça"];
  if (/SAG PACA|RIGHT LEG/.test(value)) return ["RIGHT_LEG", "Sağ Paça"];
  if (/CEP|POCKET/.test(value)) return ["POCKET", "Cep"];
  return ["FRONT", "Ön"];
}

function inferRole(fileName: string) {
  const value = normalize(fileName);
  if (/KANAL|CHANNEL|SEPARATION/.test(value)) return "CHANNEL_IMAGE";
  if (/KALIP|MOLD|LAYOUT|YERLESIM/.test(value)) return "PLACEMENT_FILE";
  return "MODEL_IMAGE";
}

function modelRoot(fileName: string) {
  const base = safeName(fileName.replace(/\.[^.]+$/, ""));
  return base
    .replace(/\b(ON|ÖN|ARKA|BACK|KANAL|CHANNEL|KALIP|MOLD|SOL KOL|SAG KOL|SAĞ KOL|ENSE|PACA|PAÇA)\b.*$/i, "")
    .replace(/[-_]+$/g, "")
    .trim() || base;
}

function normalizeChannel(channel: Row, index: number): Row {
  const rawName = text(channel.rawName || channel.name || `Kanal ${index + 1}`);
  const normalizedName = text(channel.normalizedName || rawName);
  return {
    ...channel,
    id: text(channel.id || crypto.randomUUID()),
    sequence: num(channel.sequence || index + 1),
    rawName,
    normalizedName,
    channelType: text(channel.channelType || inferChannelType(rawName)),
    colorCode: text(channel.colorCode),
    included: channel.included !== false,
    groupKey: text(channel.groupKey),
    colorGroupId: text(channel.colorGroupId),
    registeredColorId: text(channel.registeredColorId),
  };
}

function inferChannelType(value: unknown) {
  const name = normalize(value);
  if (/SEFFAF|ŞEFFAF|TRANSPARENT/.test(name)) return "TRANSPARENT";
  if (/BEYAZ FON|WHITE BASE/.test(name)) return "WHITE_BASE";
  if (/BEYAZ|WHITE/.test(name)) return "WHITE";
  if (/SIYAH|SİYAH|BLACK/.test(name)) return "BLACK";
  if (/SIM|SİM|GLITTER/.test(name)) return "GLITTER";
  if (/KABARAN|PUFF/.test(name)) return "PUFF";
  if (/VARAK|FOIL/.test(name)) return "FOIL_BASE";
  if (/FLOCK/.test(name)) return "FLOCK_BASE";
  if (/PANTONE|\b\d{2}-\d{4}\b/.test(name)) return "PANTONE";
  return "OTHER";
}

function normalizeOperation(operation: Row, index: number): Row {
  const channels = (Array.isArray(operation.channels) ? operation.channels : []).map(
    normalizeChannel,
  );
  const groups = Array.isArray(operation.colorGroups)
    ? operation.colorGroups.map((group: Row) => ({
        ...group,
        id: text(group.id || crypto.randomUUID()),
        groupKey: text(group.groupKey || group.displayName || group.colorCode),
        displayName: text(group.displayName || group.groupKey || group.colorCode),
        colorCode: text(group.colorCode),
        moldCount: num(group.moldCount || 1),
        registeredColorId: text(group.registeredColorId),
      }))
    : [];
  return {
    ...operation,
    id: text(operation.id || crypto.randomUUID()),
    printAreaCode: text(operation.printAreaCode || "FRONT"),
    printAreaName: text(operation.printAreaName || "Ön"),
    sequence: num(operation.sequence || index + 1),
    moldType: text(operation.moldType || "UNDEFINED"),
    placementStatus: text(operation.placementStatus || "WAITING"),
    dyehouseStatus: text(operation.dyehouseStatus || "WAITING"),
    productionReady: operation.productionReady === true,
    channels,
    colorGroups: groups,
  };
}

function calculateTotals(operations: Row[]) {
  const channels = operations.flatMap((operation) =>
    (operation.channels || []).filter((channel: Row) => channel.included !== false),
  );
  const groups = operations.flatMap((operation) => operation.colorGroups || []);
  const groupKeys = new Set(
    channels
      .map((channel: Row) => text(channel.colorGroupId || channel.groupKey))
      .filter(Boolean),
  );
  groups.forEach((group: Row) => {
    if (group.id || group.groupKey) groupKeys.add(text(group.id || group.groupKey));
  });
  const registeredIds = new Set(
    [
      ...groups.map((group: Row) => text(group.registeredColorId)),
      ...channels.map((channel: Row) => text(channel.registeredColorId)),
    ].filter(Boolean),
  );
  return {
    operationCount: operations.length,
    activeChannelCount: channels.length,
    totalMoldCount: channels.reduce(
      (sum: number, channel: Row) => sum + Math.max(1, num(channel.moldCount || 1)),
      0,
    ),
    uniqueColorCount: groupKeys.size,
    registeredColorCount: registeredIds.size,
    unresolvedColorCount: Math.max(0, groupKeys.size - registeredIds.size),
  };
}

function fileView(file: Row): Row {
  const id = text(file.id || file.fileName || stableId(text(file.storageKey)));
  return {
    ...file,
    id,
    previewUrl:
      text(file.previewUrl) || `/api/desen/workflow/files/${encodeURIComponent(id)}/preview`,
  };
}

function modelView(model: Row): Row {
  const operations = (Array.isArray(model.operations) ? model.operations : [])
    .map(normalizeOperation)
    .map((operation) => ({
      ...operation,
      totals: calculateTotals([operation]),
    }));
  const files = (Array.isArray(model.files) ? model.files : []).map(fileView);
  const mainImage =
    files.find((file) => file.role === "MODEL_IMAGE") ||
    files.find((file) => /image\//i.test(text(file.contentType))) ||
    model.mainImage ||
    null;
  const sourceModifiedAt = text(
    model.sourceModifiedAt ||
      mainImage?.sourceModifiedAt ||
      mainImage?.metadata?.sourceModifiedAt ||
      "",
  );
  return {
    ...model,
    id: text(model.id || model.fileName),
    modelCode: text(model.modelCode || model.modelName),
    modelName: text(model.modelName || model.modelCode || "Adsız Model"),
    companyId: text(model.companyId),
    companyName: text(model.companyName),
    status: text(model.status || "NEW_ARRIVAL"),
    sourceType: text(model.sourceType || "MANUAL_UPLOAD"),
    operations,
    files,
    mainImage,
    sourceModifiedAt,
    totals: calculateTotals(operations),
    metadata: objectOf(model.metadata),
  };
}

async function getModel(
  c: Context<AppEnv>,
  id: string,
  slug: string,
): Promise<Row | null> {
  const row = await storeGet(c, MODEL_SCOPE, id, slug);
  return row ? modelView(row) : null;
}

async function saveModel(
  c: Context<AppEnv>,
  id: string,
  data: Row,
  slug: string,
): Promise<Row> {
  const current = await storeGet(c, MODEL_SCOPE, id, slug);
  const operations = (
    Array.isArray(data.operations)
      ? data.operations
      : Array.isArray(current?.operations)
        ? current.operations
        : []
  ).map(normalizeOperation);
  const saved = await storePut(
    c,
    MODEL_SCOPE,
    id,
    {
      ...current,
      ...data,
      id,
      operations,
      files: Array.isArray(data.files) ? data.files.map(fileView) : current?.files || [],
      createdAt: current?.createdAt || data.createdAt || nowIso(),
    },
    slug,
  );
  return modelView(saved);
}

function parseChannelsText(value: unknown) {
  return text(value)
    .split(/\r?\n|,|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) =>
      normalizeChannel(
        {
          rawName: line,
          normalizedName: line,
          colorCode: line.match(/\b\d{2}-\d{4}\b/)?.[0] || "",
        },
        index,
      ),
    );
}

async function updateOperationInModel(
  c: Context<AppEnv>,
  operationId: string,
  slug: string,
  updater: (operation: Row, model: Row) => Row | null,
): Promise<Row | null> {
  const models = await storeList(c, MODEL_SCOPE, slug);
  for (const raw of models) {
    const model = modelView(raw);
    const index = model.operations.findIndex((operation: Row) => operation.id === operationId);
    if (index < 0) continue;
    const next = updater(model.operations[index], model);
    const operations = [...model.operations];
    if (next === null) operations.splice(index, 1);
    else operations[index] = normalizeOperation(next, index);
    return saveModel(c, model.id, { ...model, operations }, slug);
  }
  return null;
}

async function findChannel(
  c: Context<AppEnv>,
  channelId: string,
  slug: string,
) {
  const models = await storeList(c, MODEL_SCOPE, slug);
  for (const raw of models) {
    const model = modelView(raw);
    for (const operation of model.operations) {
      const index = operation.channels.findIndex((row: Row) => row.id === channelId);
      if (index >= 0) return { model, operation, index };
    }
  }
  return null;
}

async function findGroup(c: Context<AppEnv>, groupId: string, slug: string) {
  const models = await storeList(c, MODEL_SCOPE, slug);
  for (const raw of models) {
    const model = modelView(raw);
    for (const operation of model.operations) {
      const index = operation.colorGroups.findIndex((row: Row) => row.id === groupId);
      if (index >= 0) return { model, operation, index };
    }
  }
  return null;
}

async function scanInbox(c: Context<AppEnv>, slug: string) {
  const prefix = `desen/inbox/${slug}/`;
  const listed = await c.env.FILES.list({ prefix, limit: 1000 });
  const current = await storeList(c, INBOX_SCOPE, slug);
  const byKey = new Map(current.map((row) => [text(row.storageKey), row]));
  const rows: Row[] = [];
  for (const object of listed.objects) {
    const fileName = object.key.slice(prefix.length);
    if (!fileName || fileName.endsWith("/")) continue;
    const previous = byKey.get(object.key);
    const id = text(previous?.id || stableId(object.key));
    const area = inferArea(fileName);
    const row = await storePut(
      c,
      INBOX_SCOPE,
      id,
      {
        ...previous,
        id,
        storageKey: object.key,
        fileName,
        fileSize: object.size,
        etag: object.etag,
        uploadedAt: object.uploaded?.toISOString?.() || previous?.uploadedAt || nowIso(),
        suggestedRole: inferRole(fileName),
        suggestedPrintAreaCode: area[0],
        suggestedPrintAreaName: area[1],
        modelName: modelRoot(fileName),
        status: previous?.status && previous.status !== "MISSING" ? previous.status : "READY",
        metadata: {
          ...(object.customMetadata || {}),
          imagePreview: /\.(png|jpe?g|webp|gif)$/i.test(fileName),
        },
        previewUrl: `/api/desen/workflow/inbox/${encodeURIComponent(id)}/preview`,
      },
      slug,
    );
    rows.push(row);
  }
  for (const previous of current) {
    if (!rows.some((row) => row.storageKey === previous.storageKey) && previous.status === "READY") {
      await storePut(c, INBOX_SCOPE, text(previous.id), { ...previous, status: "MISSING" }, slug);
    }
  }
  return inboxPayload(rows.filter((row) => !["IGNORED", "PROCESSED"].includes(row.status)), prefix);
}

function inboxPayload(rows: Row[], folderPath: string) {
  const groupsMap = new Map<string, Row[]>();
  rows.forEach((row) => {
    const key = normalize(row.modelName) || text(row.id);
    const current = groupsMap.get(key) || [];
    current.push(row);
    groupsMap.set(key, current);
  });
  const groups = [...groupsMap.entries()].map(([key, files]) => {
    const roles = new Set(files.map((file) => file.suggestedRole));
    const statuses = new Set(files.map((file) => file.status));
    const status = statuses.has("ERROR")
      ? "ERROR"
      : roles.has("MODEL_IMAGE") && roles.has("CHANNEL_IMAGE")
        ? "READY"
        : "INCOMPLETE";
    return {
      id: stableId(`group:${key}`),
      modelName: files[0]?.modelName || key,
      fileCount: files.length,
      hasModelImage: roles.has("MODEL_IMAGE"),
      hasChannelImage: roles.has("CHANNEL_IMAGE"),
      status,
      files,
    };
  });
  return {
    items: rows,
    groups,
    summary: {
      readyFiles: rows.filter((row) => row.status === "READY").length,
      suggestedGroups: groups.length,
      missingModelImage: groups.filter((group) => !group.hasModelImage).length,
      missingChannelImage: groups.filter((group) => !group.hasChannelImage).length,
      duplicates: rows.filter((row) => row.status === "DUPLICATE").length,
      errors: rows.filter((row) => ["ERROR", "UNSUPPORTED"].includes(row.status)).length,
    },
    folderPath,
    lastScanAt: nowIso(),
    storageMode: "R2",
  };
}

async function moveObject(
  c: Context<AppEnv>,
  sourceKey: string,
  targetKey: string,
) {
  const source = await c.env.FILES.get(sourceKey);
  if (!source) return false;
  await c.env.FILES.put(targetKey, source.body, {
    httpMetadata: source.httpMetadata,
    customMetadata: source.customMetadata,
  });
  await c.env.FILES.delete(sourceKey);
  return true;
}

async function processInboxModel(c: Context<AppEnv>, body: Row, slug: string) {
  const modelName = text(body.modelName || body.modelCode);
  if (!modelName) throw new Error("Model adı zorunludur.");
  const id = text(body.id || crypto.randomUUID());
  const queueIds = Array.isArray(body.queueIds) ? body.queueIds.map(text) : [];
  const inboxRows = await storeList(c, INBOX_SCOPE, slug);
  const selected = inboxRows.filter((row) => queueIds.includes(text(row.id)));
  const files: Row[] = [];
  for (const item of selected) {
    const targetKey = `desen/models/${slug}/${id}/${safeName(item.fileName)}`;
    await moveObject(c, text(item.storageKey), targetKey);
    const fileId = crypto.randomUUID();
    files.push(
      fileView({
        id: fileId,
        fileName: item.fileName,
        storageKey: targetKey,
        role:
          body.files?.find?.((file: Row) => text(file.queueId) === text(item.id))?.role ||
          item.suggestedRole,
        printAreaCode:
          body.files?.find?.((file: Row) => text(file.queueId) === text(item.id))?.printAreaCode ||
          item.suggestedPrintAreaCode,
        contentType: item.metadata?.contentType || "",
        createdAt: nowIso(),
      }),
    );
    await storePut(c, INBOX_SCOPE, text(item.id), { ...item, status: "PROCESSED", modelId: id }, slug);
  }
  const saved = await saveModel(
    c,
    id,
    {
      ...body,
      id,
      modelName,
      modelCode: text(body.modelCode || modelName),
      status: text(body.status || "CHANNEL_REVIEW_PENDING"),
      sourceType: text(body.sourceType || "FOLDER_SCAN"),
      files,
      createdAt: nowIso(),
    },
    slug,
  );
  return analyzeAndSave(c, saved, slug);
}

function analysisFromModel(model: Row) {
  const source = normalize(
    `${model.modelName} ${model.modelCode} ${model.designName} ${model.groundColor} ${model.notes} ${model.operations
      .flatMap((operation: Row) => operation.channels || [])
      .map((channel: Row) => `${channel.rawName} ${channel.colorCode}`)
      .join(" ")}`,
  );
  const pantoneCodes = [...new Set(source.match(/\b\d{2}-\d{4}\b/g) || [])];
  const characters = [...new Set(source.match(/\b[A-Z]{2,}\b/g) || [])].slice(0, 20);
  return {
    pantoneCodes,
    characters,
    themes: [],
    shapes: [],
    analyzedAt: nowIso(),
    analysisMode: "METADATA_INDEX",
    note: "Görsel OCR yapılmadı; model, kanal ve açıklama metinleri indekslendi.",
  };
}

async function analyzeAndSave(c: Context<AppEnv>, model: Row, slug: string) {
  const view = modelView(model);
  const analysis = await analyzeDesignWithAi(c, view);
  return saveModel(
    c,
    view.id,
    {
      ...view,
      metadata: { ...view.metadata, analysis },
    },
    slug,
  );
}

async function syncDyehouse(c: Context<AppEnv>, model: Row, slug: string) {
  const jobId = `design-${model.id}`;
  const operations = model.operations || [];
  const colorSources: Row[] = [];
  for (const operation of operations) {
    const groups = operation.colorGroups?.length
      ? operation.colorGroups
      : (operation.channels || [])
          .filter((channel: Row) => channel.included !== false)
          .map((channel: Row) => ({
            id: channel.id,
            groupKey: channel.groupKey || channel.id,
            displayName: channel.normalizedName || channel.rawName,
            colorCode: channel.colorCode,
            registeredColorId: channel.registeredColorId,
            moldCount: channel.moldCount || 1,
          }));
    groups.forEach((group: Row) =>
      colorSources.push({ ...group, printRegion: operation.printAreaName }),
    );
  }
  const job = await storePut(
    c,
    BOYAHANE_JOB_SCOPE,
    jobId,
    {
      id: jobId,
      designId: model.id,
      modelCardId: model.id,
      modelName: model.modelName,
      companyId: model.companyId,
      companyName: model.companyName,
      orderNo: model.orderNo || "",
      printRegion: operations.map((row: Row) => row.printAreaName).filter(Boolean).join(", "),
      plannedQuantity: num(model.plannedQuantity),
      channelCount: model.totals.activeChannelCount,
      uniqueColorCount: model.totals.uniqueColorCount,
      moldCount: model.totals.totalMoldCount,
      imageUrl: model.mainImage?.thumbnailUrl || model.mainImage?.previewUrl || "",
      status: "WAITING",
      priority: "NORMAL",
      source: "DESEN_WORKFLOW",
      createdAt: nowIso(),
    },
    slug,
  );
  const existingColors = (await storeList(c, BOYAHANE_COLOR_SCOPE, slug)).filter(
    (row) => text(row.jobId || row.dyehouseModelId) === jobId,
  );
  const activeKeys = new Set<string>();
  for (const source of colorSources) {
    const key = text(source.id || source.groupKey || stableId(JSON.stringify(source)));
    activeKeys.add(key);
    const id = `design-color-${stableId(`${model.id}:${key}`).slice(4)}`;
    const current = existingColors.find(
      (row) => text(row.sourceChannelKey) === `design:${key}` || text(row.id) === id,
    );
    await storePut(
      c,
      BOYAHANE_COLOR_SCOPE,
      id,
      {
        ...current,
        id,
        jobId,
        dyehouseModelId: jobId,
        registeredColorId: text(source.registeredColorId) || null,
        sourceChannelKey: `design:${key}`,
        colorName: text(source.displayName || source.colorCode || "Tanımsız Renk"),
        pantone: text(source.colorCode),
        paintType: text(current?.paintType || "SUBAZLI"),
        recipeId: current?.recipeId || null,
        printRegion: text(source.printRegion),
        plannedKg: num(current?.plannedKg),
        status: current?.status || "WAITING",
        moldCount: num(source.moldCount || 1),
        createdAt: current?.createdAt || nowIso(),
      },
      slug,
    );
  }
  for (const old of existingColors) {
    const key = text(old.sourceChannelKey).replace(/^design:/, "");
    if (key && !activeKeys.has(key) && !["COMPLETED", "CANCELLED"].includes(upper(old.status))) {
      await storePut(c, BOYAHANE_COLOR_SCOPE, text(old.id), { ...old, status: "CANCELLED" }, slug);
    }
  }
  const updatedOperations = operations.map((operation: Row) => ({
    ...operation,
    dyehouseStatus: model.totals.unresolvedColorCount === 0 ? "READY" : "WAITING",
  }));
  await saveModel(
    c,
    model.id,
    {
      ...model,
      operations: updatedOperations,
      status:
        model.totals.unresolvedColorCount === 0
          ? "DYEHOUSE_READY"
          : "COLOR_MATCH_MISSING",
      dyehouseJobId: jobId,
      dyehouseSyncedAt: nowIso(),
    },
    slug,
  );
  return { job, jobId, colorCount: colorSources.length };
}


function isoDateKey(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function filterModelRows(c: Context<AppEnv>, rows: Row[]) {
  const q = normalize(c.req.query("q"));
  const companyId = text(c.req.query("companyId"));
  const status = text(c.req.query("status"));
  const printAreaCode = text(c.req.query("printAreaCode"));
  const placementStatus = text(c.req.query("placementStatus"));
  const dyehouseStatus = text(c.req.query("dyehouseStatus"));
  const dateField = text(c.req.query("dateField") || "createdAt");
  const dateFrom = text(c.req.query("dateFrom"));
  const dateTo = text(c.req.query("dateTo"));
  const sort = text(c.req.query("sort") || "created_desc");

  const filtered = rows
    .filter((row) => row.status !== "ARCHIVE" || status === "ARCHIVE")
    .filter(
      (row) =>
        !q ||
        normalize(
          `${row.modelName} ${row.modelCode} ${row.companyName} ${JSON.stringify(row.metadata)}`,
        ).includes(q),
    )
    .filter((row) => !companyId || row.companyId === companyId)
    .filter((row) => !status || row.status === status)
    .filter(
      (row) =>
        !printAreaCode ||
        row.operations.some((operation: Row) => operation.printAreaCode === printAreaCode),
    )
    .filter(
      (row) =>
        !placementStatus ||
        row.operations.some(
          (operation: Row) => operation.placementStatus === placementStatus,
        ),
    )
    .filter(
      (row) =>
        !dyehouseStatus ||
        row.operations.some(
          (operation: Row) => operation.dyehouseStatus === dyehouseStatus,
        ),
    )
    .filter((row) => {
      if (!dateFrom && !dateTo) return true;
      const value =
        dateField === "sourceModifiedAt"
          ? row.sourceModifiedAt
          : dateField === "updatedAt"
            ? row.updatedAt
            : row.createdAt;
      const key = isoDateKey(value);
      if (!key) return false;
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      return true;
    });

  const byTime = (value: unknown) => {
    const ms = Date.parse(text(value));
    return Number.isFinite(ms) ? ms : 0;
  };
  filtered.sort((a, b) => {
    if (sort === "name_asc")
      return text(a.modelName).localeCompare(text(b.modelName), "tr");
    if (sort === "source_desc")
      return byTime(b.sourceModifiedAt) - byTime(a.sourceModifiedAt);
    if (sort === "updated_desc")
      return byTime(b.updatedAt) - byTime(a.updatedAt);
    return byTime(b.createdAt) - byTime(a.createdAt);
  });
  return filtered;
}

function designSummary(rows: Row[]) {
  const newArrival = rows.filter((row) => row.status === "NEW_ARRIVAL").length;
  const channelImageMissing = rows.filter(
    (row) => row.status === "CHANNEL_IMAGE_MISSING",
  ).length;
  const channelReviewPending = rows.filter(
    (row) => row.status === "CHANNEL_REVIEW_PENDING",
  ).length;
  const colorMatchMissing = rows.filter(
    (row) => row.status === "COLOR_MATCH_MISSING",
  ).length;
  const placementWaiting = rows.filter((row) =>
    row.operations.some(
      (operation: Row) => operation.placementStatus !== "READY",
    ),
  ).length;
  const dyehouseReady = rows.filter(
    (row) => row.status === "DYEHOUSE_READY",
  ).length;
  const productionReady = rows.filter(
    (row) => row.status === "PRODUCTION_READY",
  ).length;
  const unresolvedColorCount = rows.reduce(
    (sum, row) => sum + num(row.totals.unresolvedColorCount),
    0,
  );
  return {
    totalModels: rows.length,
    modelCount: rows.length,
    newArrival,
    channelImageMissing,
    channelReviewPending,
    colorMatchMissing,
    placementWaiting,
    dyehouseReady,
    readyForDyehouse: dyehouseReady,
    productionReady,
    unresolvedColorCount,
  };
}

export function registerDesenWorkflowRoutes(app: Hono<AppEnv>) {
  app.get("/api/desen/workflow/inbox", async (c) => {
    const slug = slugOf(c);
    const rows = (await storeList(c, INBOX_SCOPE, slug)).filter(
      (row) => !["IGNORED", "PROCESSED", "MISSING"].includes(row.status),
    );
    return c.json({
      ok: true,
      success: true,
      data: inboxPayload(rows, `R2/desen/inbox/${slug}`),
    });
  });

  app.post("/api/desen/workflow/inbox/scan", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const data = await scanInbox(c, slug);
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/desen/workflow/inbox/:id/preview", async (c) => {
    const slug = slugOf(c);
    const row = await storeGet(c, INBOX_SCOPE, c.req.param("id"), slug);
    if (!row?.storageKey) return c.json(errorBody("NOT_FOUND", "Desen dosyası bulunamadı."), 404);
    const object = await c.env.FILES.get(text(row.storageKey));
    if (!object) return c.json(errorBody("NOT_FOUND", "R2 desen dosyası bulunamadı."), 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=60");
    return new Response(object.body, { headers });
  });

  app.post("/api/desen/workflow/inbox/process", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    try {
      const data = await processInboxModel(c, body, slug);
      return c.json({ ok: true, success: true, data }, 201);
    } catch (error) {
      return c.json(
        errorBody("INBOX_PROCESS_FAILED", error instanceof Error ? error.message : "Desen kaydedilemedi."),
        400,
      );
    }
  });

  app.post("/api/desen/workflow/inbox/process-bulk", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const groups = Array.isArray(body.groups) ? body.groups : [];
    const saved: Row[] = [];
    const errors: Row[] = [];
    for (const group of groups) {
      try {
        saved.push(
          await processInboxModel(
            c,
            {
              ...group,
              companyId: body.companyId,
              companyName: body.companyName,
            },
            slug,
          ),
        );
      } catch (error) {
        errors.push({
          modelName: group.modelName,
          message: error instanceof Error ? error.message : "Kayıt başarısız.",
        });
      }
    }
    return c.json({
      ok: errors.length === 0,
      success: errors.length === 0,
      data: { saved: saved.length, failed: errors.length, rows: saved, errors },
    });
  });

  app.post("/api/desen/workflow/inbox/ignore", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const ids = Array.isArray(body.ids) ? body.ids.map(text) : [];
    for (const id of ids) {
      const row = await storeGet(c, INBOX_SCOPE, id, slug);
      if (row) await storePut(c, INBOX_SCOPE, id, { ...row, status: "IGNORED" }, slug);
    }
    return c.json({ ok: true, success: true, data: { updated: ids.length } });
  });

  app.post("/api/desen/workflow/inbox/move-to-error", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const ids = Array.isArray(body.ids) ? body.ids.map(text) : [];
    for (const id of ids) {
      const row = await storeGet(c, INBOX_SCOPE, id, slug);
      if (!row) continue;
      const target = `desen/error/${slug}/${safeName(row.fileName)}`;
      await moveObject(c, text(row.storageKey), target);
      await storePut(
        c,
        INBOX_SCOPE,
        id,
        { ...row, storageKey: target, status: "ERROR", errorReason: text(body.reason) },
        slug,
      );
    }
    return c.json({ ok: true, success: true, data: { updated: ids.length } });
  });

  app.get("/api/desen/workflow/models", async (c) => {
    const slug = slugOf(c);
    const limit = Math.min(
      2000,
      Math.max(1, num(c.req.query("limit") || 1000)),
    );
    const allRows = filterModelRows(
      c,
      (await storeList(c, MODEL_SCOPE, slug)).map(modelView),
    );
    const rows = allRows.slice(0, limit);
    return c.json({
      ok: true,
      success: true,
      data: { rows, total: allRows.length, returned: rows.length },
    });
  });

  app.get("/api/desen/workflow/models/:id", async (c) => {
    const row = await getModel(c, c.req.param("id"), slugOf(c));
    if (!row) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: row });
  });

  app.post("/api/desen/workflow/models", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const modelName = text(body.modelName || body.modelCode);
    if (!modelName) return c.json(errorBody("MODEL_NAME_REQUIRED", "Model adı zorunludur."), 400);
    const duplicate = (await storeList(c, MODEL_SCOPE, slug)).find(
      (row) =>
        normalize(row.modelName) === normalize(modelName) &&
        text(row.companyId) === text(body.companyId) &&
        row.status !== "ARCHIVE",
    );
    if (duplicate) {
      return c.json(
        errorBody("MODEL_EXISTS", "Aynı firma ve model adıyla aktif kayıt zaten var.", {
          modelId: duplicate.id,
        }),
        409,
      );
    }
    const id = text(body.id || crypto.randomUUID());
    const row = await saveModel(
      c,
      id,
      {
        ...body,
        id,
        modelName,
        modelCode: text(body.modelCode || modelName),
        status: text(body.status || "NEW_ARRIVAL"),
        sourceType: text(body.sourceType || "MANUAL_UPLOAD"),
        createdAt: nowIso(),
      },
      slug,
    );
    return c.json({ ok: true, success: true, data: row }, 201);
  });

  app.put("/api/desen/workflow/models/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await getModel(c, c.req.param("id"), slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    const row = await saveModel(c, current.id, { ...current, ...body, id: current.id }, slug);
    return c.json({ ok: true, success: true, data: row });
  });

  app.post("/api/desen/workflow/models/:id/archive", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await getModel(c, c.req.param("id"), slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    const row = await saveModel(
      c,
      current.id,
      { ...current, status: "ARCHIVE", archivedAt: nowIso() },
      slug,
    );
    return c.json({ ok: true, success: true, data: row });
  });

  app.post("/api/desen/workflow/models/:id/files", async (c) => {
    const slug = slugOf(c);
    const model = await getModel(c, c.req.param("id"), slug);
    if (!model) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json(errorBody("FILE_REQUIRED", "Yüklenecek dosya zorunludur."), 400);
    }
    const fileId = crypto.randomUUID();
    const storageKey = `desen/models/${slug}/${model.id}/${fileId}-${safeName(file.name)}`;
    await c.env.FILES.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: {
        modelId: model.id,
        operationId: text(form.operationId),
        fileRole: text(form.fileRole || "OTHER"),
      },
    });
    const row = fileView({
      id: fileId,
      fileName: file.name,
      storageKey,
      role: text(form.fileRole || "OTHER"),
      operationId: text(form.operationId),
      contentType: file.type,
      size: file.size,
      createdAt: nowIso(),
    });
    const saved = await saveModel(c, model.id, { ...model, files: [...model.files, row] }, slug);
    const analyzed = await analyzeAndSave(c, saved, slug);
    return c.json({ ok: true, success: true, data: { file: row, model: analyzed } }, 201);
  });

  app.get("/api/desen/workflow/files/:id/preview", async (c) => {
    const slug = slugOf(c);
    const models = await storeList(c, MODEL_SCOPE, slug);
    let file: Row | null = null;
    for (const model of models.map(modelView)) {
      file = model.files.find((row: Row) => row.id === c.req.param("id")) || null;
      if (file) break;
    }
    if (!file?.storageKey) return c.json(errorBody("NOT_FOUND", "Desen görseli bulunamadı."), 404);
    const object = await c.env.FILES.get(text(file.storageKey));
    if (!object) return c.json(errorBody("NOT_FOUND", "R2 görseli bulunamadı."), 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=300");
    return new Response(object.body, { headers });
  });

  app.post("/api/desen/workflow/models/:id/operations", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const model = await getModel(c, c.req.param("id"), slug);
    if (!model) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    const operation = normalizeOperation(body, model.operations.length);
    if (model.operations.some((row: Row) => row.printAreaCode === operation.printAreaCode)) {
      return c.json(errorBody("OPERATION_EXISTS", "Bu baskı bölgesi modelde zaten var."), 409);
    }
    const saved = await saveModel(
      c,
      model.id,
      { ...model, operations: [...model.operations, operation] },
      slug,
    );
    return c.json({ ok: true, success: true, data: saved }, 201);
  });

  app.put("/api/desen/workflow/operations/:operationId", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const model = await updateOperationInModel(c, c.req.param("operationId"), slug, (operation) => ({
      ...operation,
      ...body,
      id: operation.id,
      channels: body.channels === undefined ? operation.channels : body.channels,
      colorGroups:
        body.colorGroups === undefined ? operation.colorGroups : body.colorGroups,
    }));
    if (!model) return c.json(errorBody("NOT_FOUND", "Baskı bölgesi bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: model });
  });

  app.delete("/api/desen/workflow/operations/:operationId", async (c) => {
    const slug = slugOf(c);
    const operationId = c.req.param("operationId");
    const model = await updateOperationInModel(c, operationId, slug, (_operation, parent) => {
      if (parent.operations.length <= 1) throw new Error("Modelde en az bir baskı bölgesi kalmalıdır.");
      return null;
    }).catch((error) => ({ error }));
    if (!model) return c.json(errorBody("NOT_FOUND", "Baskı bölgesi bulunamadı."), 404);
    if ((model as Row).error) {
      return c.json(errorBody("LAST_OPERATION", (model as Row).error.message), 409);
    }
    return c.json({ ok: true, success: true, data: model });
  });

  app.post("/api/desen/workflow/operations/:operationId/channels/parse", async (c) => {
    const body = await bodyOf(c);
    return c.json({
      ok: true,
      success: true,
      data: {
        operationId: c.req.param("operationId"),
        channels: parseChannelsText(body.text),
      },
    });
  });

  app.post("/api/desen/workflow/operations/:operationId/channels", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const channels = (Array.isArray(body.channels) ? body.channels : []).map(
      normalizeChannel,
    );
    const model = await updateOperationInModel(c, c.req.param("operationId"), slug, (operation) => ({
      ...operation,
      channels,
    }));
    if (!model) return c.json(errorBody("NOT_FOUND", "Baskı bölgesi bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: model });
  });

  app.put("/api/desen/workflow/channels/:channelId", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const found = await findChannel(c, c.req.param("channelId"), slug);
    if (!found) return c.json(errorBody("NOT_FOUND", "Kanal bulunamadı."), 404);
    const channels = [...found.operation.channels];
    channels[found.index] = normalizeChannel(
      { ...channels[found.index], ...body, id: channels[found.index].id },
      found.index,
    );
    const model = await updateOperationInModel(c, found.operation.id, slug, (operation) => ({
      ...operation,
      channels,
    }));
    return c.json({ ok: true, success: true, data: model });
  });

  app.post("/api/desen/workflow/operations/:operationId/color-groups", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const id = text(body.id || crypto.randomUUID());
    const model = await updateOperationInModel(c, c.req.param("operationId"), slug, (operation) => {
      const groups = [...(operation.colorGroups || [])];
      const index = groups.findIndex((row: Row) => row.id === id || row.groupKey === body.groupKey);
      const group = {
        ...body,
        id,
        groupKey: text(body.groupKey || body.displayName || body.colorCode || id),
        displayName: text(body.displayName || body.groupKey || body.colorCode || "Renk"),
        moldCount: num(body.moldCount || 1),
      };
      if (index >= 0) groups[index] = { ...groups[index], ...group };
      else groups.push(group);
      return { ...operation, colorGroups: groups };
    });
    if (!model) return c.json(errorBody("NOT_FOUND", "Baskı bölgesi bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: model });
  });

  app.post("/api/desen/workflow/color-groups/:groupId/link-registered-color", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const found = await findGroup(c, c.req.param("groupId"), slug);
    if (!found) return c.json(errorBody("NOT_FOUND", "Renk grubu bulunamadı."), 404);
    const color = body.registeredColorId
      ? await storeGet(c, REGISTERED_COLOR_SCOPE, text(body.registeredColorId), slug)
      : null;
    if (body.registeredColorId && !color) {
      return c.json(errorBody("COLOR_NOT_FOUND", "Kayıtlı Boyahane rengi bulunamadı."), 404);
    }
    const groups = [...found.operation.colorGroups];
    groups[found.index] = {
      ...groups[found.index],
      registeredColorId: color?.id || "",
      registeredColorName: color?.colorName || "",
      colorCode: groups[found.index].colorCode || color?.pantone || "",
    };
    const model = await updateOperationInModel(c, found.operation.id, slug, (operation) => ({
      ...operation,
      colorGroups: groups,
    }));
    return c.json({ ok: true, success: true, data: model });
  });

  app.get("/api/desen/workflow/registered-colors", async (c) => {
    const slug = slugOf(c);
    const q = normalize(c.req.query("q"));
    const rows = (await storeList(c, REGISTERED_COLOR_SCOPE, slug)).filter(
      (row) => !q || normalize(`${row.colorName} ${row.pantone} ${row.dyeType}`).includes(q),
    );
    return c.json({ ok: true, success: true, data: rows });
  });

  app.get("/api/desen/workflow/analysis/status", async (c) => {
    const slug = slugOf(c);
    const rows = (await storeList(c, MODEL_SCOPE, slug)).map(modelView);
    return c.json({
      ok: true,
      success: true,
      data: {
        total: rows.length,
        analyzed: rows.filter((row) => !needsAiAnalysis(row) && row.metadata?.analysis?.visionStatus === "COMPLETED").length,
        pending: rows.filter((row) => needsAiAnalysis(row)).length,
        failed: rows.filter((row) => row.metadata?.analysis?.visionStatus === "FAILED").length,
        mode: "CLOUDFLARE_AI_VISION_OCR",
      },
    });
  });

  app.post("/api/desen/workflow/analyze", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const ids = Array.isArray(body.ids) ? body.ids.map(text) : [];
    const models = (await storeList(c, MODEL_SCOPE, slug)).map(modelView);
    const targets = ids.length ? models.filter((row) => ids.includes(row.id)) : models;
    let analyzed = 0;
    let errors = 0;
    for (let index = 0; index < targets.length; index += 4) {
      const batch = targets.slice(index, index + 4);
      const results = await Promise.all(
        batch.map(async (model) => {
          try {
            const saved = await analyzeAndSave(c, model, slug);
            return saved.metadata?.analysis?.visionStatus === "COMPLETED";
          } catch {
            return false;
          }
        }),
      );
      analyzed += results.filter(Boolean).length;
      errors += results.filter((value) => !value).length;
    }
    return c.json({
      ok: true,
      success: true,
      data: { analyzed, errors, mode: "CLOUDFLARE_AI_VISION_OCR" },
    });
  });

  app.post("/api/desen/workflow/models/:id/analyze", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const model = await getModel(c, c.req.param("id"), slug);
    if (!model) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    const saved = await analyzeAndSave(c, model, slug);
    return c.json({ ok: true, success: true, data: saved });
  });

  app.post("/api/desen/workflow/models/:id/sync-dyehouse", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const model = await getModel(c, c.req.param("id"), slug);
    if (!model) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    const data = await syncDyehouse(c, model, slug);
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/desen/workflow/models/:id/production-summary", async (c) => {
    const slug = slugOf(c);
    const model = await getModel(c, c.req.param("id"), slug);
    if (!model) return c.json(errorBody("NOT_FOUND", "Desen modeli bulunamadı."), 404);
    const jobs = (await storeList(c, BOYAHANE_JOB_SCOPE, slug)).filter(
      (row) => text(row.designId || row.modelCardId) === model.id,
    );
    return c.json({
      ok: true,
      success: true,
      data: {
        modelId: model.id,
        dyehouseJobs: jobs,
        dyehouseReady: model.operations.every(
          (operation: Row) => operation.dyehouseStatus === "READY",
        ),
      },
    });
  });

  app.get("/api/desen/workflow/reports", async (c) => {
    const slug = slugOf(c);
    const rows = filterModelRows(
      c,
      (await storeList(c, MODEL_SCOPE, slug)).map(modelView),
    );
    return c.json({
      ok: true,
      success: true,
      data: { summary: designSummary(rows), rows },
    });
  });

  app.get("/api/desen/workflow/reports/export", async (c) => {
    const slug = slugOf(c);
    const rows = filterModelRows(
      c,
      (await storeList(c, MODEL_SCOPE, slug)).map(modelView),
    );
    const escape = (value: unknown) => `"${text(value).replace(/"/g, '""')}"`;
    const lines = [
      [
        "Model",
        "Firma",
        "Durum",
        "Baskı Bölgeleri",
        "Kanal",
        "Kalıp",
        "Benzersiz Renk",
        "Eksik Renk",
        "ERP Eklenme",
        "Dosya Tarihi",
        "Son Güncelleme",
      ].map(escape).join(";"),
      ...rows.map((row) =>
        [
          row.modelName,
          row.companyName,
          row.status,
          row.operations.map((operation: Row) => operation.printAreaName).join(", "),
          row.totals.activeChannelCount,
          row.totals.totalMoldCount,
          row.totals.uniqueColorCount,
          row.totals.unresolvedColorCount,
          row.createdAt,
          row.sourceModifiedAt,
          row.updatedAt,
        ]
          .map(escape)
          .join(";"),
      ),
    ];
    return new Response(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="desen-raporu-${nowIso().slice(0, 10)}.csv"`,
      },
    });
  });
}
