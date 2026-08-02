import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const JOB_SCOPE = "BOYAHANE_JOB";
const JOB_COLOR_SCOPE = "BOYAHANE_JOB_COLOR";
const REGISTERED_SCOPE = "BOYAHANE_REGISTERED_COLOR";
const LOG_SCOPE = "BOYAHANE_WORKFLOW_LOG";

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const normalize = (value: unknown) => upper(value)
  .replace(/İ/g, "I")
  .replace(/[^A-Z0-9ÇĞÖŞÜ#]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const nowIso = () => new Date().toISOString();

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Row : {};
  } catch {
    return {};
  }
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Row : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row) {
  return text(body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string): Promise<Row[]> {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data FROM json_store
      WHERE scope = ? AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    id: text(objectOf(row.data).id || row.file_name),
    storeId: text(row.id),
    fileName: text(row.file_name),
  }));
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const now = nowIso();
  const current = await c.env.DB.prepare(
    `SELECT id FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  const payload = { ...data, updatedAt: now };
  if (current?.id) {
    await c.env.DB.prepare(`UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(payload), now, current.id).run();
    return { ...payload, storeId: text(current.id), fileName };
  }
  const storeId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(storeId, scope, slug || null, fileName, JSON.stringify(payload), now, now).run();
  return { ...payload, storeId, fileName };
}

function sourceTypeOf(body: Row) {
  const value = normalize(body.sourceType || body.colorSource);
  if (value === "REFERENCE" || value.includes("REFERANS")) return "REFERENCE";
  if (["VISUAL", "RGB", "HEX", "GORSEL", "GÖRSEL"].includes(value)) return "VISUAL";
  return "PANTONE";
}

function identityKey(row: Row) {
  const sourceType = sourceTypeOf(row);
  const paintType = normalize(row.paintType || row.dyeType || "SUBAZLI");
  if (sourceType === "REFERENCE") {
    return `REFERENCE|${paintType}|${normalize(row.basePantone || row.pantone)}|${normalize(row.referenceCode || row.referenceName)}`;
  }
  if (sourceType === "VISUAL") {
    return `VISUAL|${paintType}|${normalize(row.colorHex)}|${normalize(row.colorName)}`;
  }
  return `PANTONE|${paintType}|${normalize(row.pantone)}`;
}

async function ensureRegistered(c: Context<AppEnv>, slug: string, body: Row) {
  const sourceType = sourceTypeOf(body);
  const paintType = text(body.paintType || "SUBAZLI");
  const candidate: Row = {
    colorName: text(body.colorName),
    pantone: sourceType === "VISUAL" ? "" : text(body.pantone),
    basePantone: sourceType === "REFERENCE" ? text(body.basePantone || body.pantone) : "",
    paintType,
    dyeType: paintType,
    sourceType,
    colorSource: sourceType,
    isPantoneExact: sourceType === "PANTONE",
    referenceName: text(body.referenceName),
    referenceCode: text(body.referenceCode),
    referenceNote: text(body.referenceNote),
    referenceImageUrl: text(body.referenceImageUrl),
    colorHex: text(body.colorHex),
    colorFamily: text(body.colorFamily),
  };
  const existing = (await storeList(c, REGISTERED_SCOPE, slug)).find(
    (row) => identityKey(row) === identityKey(candidate),
  );
  if (existing) return existing;
  const id = crypto.randomUUID();
  return storePut(c, REGISTERED_SCOPE, id, {
    id,
    ...candidate,
    status: "ACTIVE",
    isActive: true,
    createdAt: nowIso(),
  }, slug);
}

function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function registerBoyahaneManualJobV2Routes(app: Hono<AppEnv>) {
  app.post("/api/boyahane/jobs/manual", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const modelName = text(body.modelName);
    const colorName = text(body.colorName);
    const orderNo = text(body.orderNo);
    const jobType = ["SAMPLE", "TRIAL"].includes(upper(body.jobType)) ? "SAMPLE" : "PRODUCTION";
    const sourceType = sourceTypeOf(body);

    if (!modelName) return c.json(errorBody("MODEL_NAME_REQUIRED", "Model veya desen adı zorunludur."), 400);
    if (!colorName) return c.json(errorBody("COLOR_NAME_REQUIRED", "İlk renk adı zorunludur."), 400);
    if (sourceType === "PANTONE" && !text(body.pantone)) {
      return c.json(errorBody("PANTONE_REQUIRED", "Pantoneye göre renkte Pantone zorunludur."), 400);
    }
    if (sourceType === "REFERENCE" && !text(body.referenceName || body.referenceCode)) {
      return c.json(errorBody("REFERENCE_REQUIRED", "Renk referansına göre kayıtta referans adı veya kodu zorunludur."), 400);
    }
    if (sourceType === "VISUAL" && !/^#?[0-9a-f]{6}$/i.test(text(body.colorHex))) {
      return c.json(errorBody("COLOR_HEX_REQUIRED", "Görsel/RGB kaydında renk kutusu seçilmelidir."), 400);
    }

    const duplicate = (await storeList(c, JOB_SCOPE, slug)).find((row) =>
      !["COMPLETED", "CANCELLED"].includes(upper(row.status)) &&
      upper(row.jobType || row.workflowType || row.type || "PRODUCTION") === jobType &&
      normalize(row.modelName) === normalize(modelName) &&
      (!orderNo || normalize(row.orderNo) === normalize(orderNo)),
    );
    if (duplicate) {
      return c.json(errorBody("BOYAHANE_JOB_EXISTS", "Bu model için aynı tür açık Boyahane işi zaten bulunuyor.", { jobId: duplicate.id }), 409);
    }

    const registered = await ensureRegistered(c, slug, body);
    const now = nowIso();
    const jobId = crypto.randomUUID();
    const job = await storePut(c, JOB_SCOPE, jobId, {
      id: jobId,
      source: "BOYAHANE_MANUAL",
      manualEntry: true,
      jobType,
      workflowType: jobType,
      type: jobType,
      status: "WAITING",
      priority: upper(body.priority || "NORMAL"),
      modelName,
      companyName: text(body.companyName),
      orderNo,
      imageUrl: text(body.imageUrl),
      printRegion: text(body.printRegion || "Tüm baskı bölgeleri"),
      channelCount: Math.max(1, num(body.channelCount || 1)),
      uniqueColorCount: Math.max(1, num(body.uniqueColorCount || 1)),
      plannedQuantity: num(body.plannedQuantity),
      createdAt: now,
      createdBy: text(body.actor || "KY ERP"),
    }, slug);

    const colorId = crypto.randomUUID();
    const displayPantone = sourceType === "VISUAL"
      ? text(body.colorHex)
      : text(body.pantone || body.referenceCode || body.referenceName);
    const color = await storePut(c, JOB_COLOR_SCOPE, colorId, {
      id: colorId,
      jobId,
      dyehouseModelId: jobId,
      jobType,
      registeredColorId: registered.id,
      colorName,
      pantone: displayPantone,
      basePantone: text(body.basePantone || body.pantone),
      paintType: text(body.paintType || "SUBAZLI"),
      sourceType,
      colorSource: sourceType,
      isPantoneExact: sourceType === "PANTONE",
      referenceName: text(body.referenceName),
      referenceCode: text(body.referenceCode),
      referenceNote: text(body.referenceNote),
      referenceImageUrl: text(body.referenceImageUrl),
      colorHex: text(body.colorHex),
      colorFamily: text(body.colorFamily),
      printRegion: text(body.printRegion || "Tüm baskı bölgeleri"),
      plannedKg: num(body.plannedKg),
      status: "WAITING",
      createdAt: now,
    }, slug);

    const logId = crypto.randomUUID();
    await storePut(c, LOG_SCOPE, logId, {
      id: logId,
      module: "BOYAHANE",
      entityType: "DYEHOUSE_JOB",
      entityId: jobId,
      action: "MANUAL_JOB_CREATED",
      actionType: "MANUAL_JOB_CREATED",
      description: `${modelName} için ${jobType === "SAMPLE" ? "numune" : "imalat boya"} işi ve ${colorName} kayıtlı renk kartı oluşturuldu.`,
      actor: text(body.actor || "KY ERP"),
      createdAt: now,
    }, slug);

    return c.json({ ok: true, success: true, data: {
      ...job,
      colors: [color],
      preparedColorCount: 0,
      pendingColorCount: 1,
    } }, 201);
  });
}
