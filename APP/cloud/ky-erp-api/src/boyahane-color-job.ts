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
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) => text(value)
  .toLocaleUpperCase("tr-TR")
  .replace(/İ/g, "I")
  .replace(/[^A-Z0-9ÇĞÖŞÜ#]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

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

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string): Promise<Row[]> {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at FROM json_store
      WHERE scope = ? AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
  }));
}

async function storeGet(c: Context<AppEnv>, scope: string, fileName: string, slug: string): Promise<Row | null> {
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  if (!row) return null;
  return { ...objectOf(row.data), storeId: text(row.id), fileName: text(row.file_name) };
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const now = nowIso();
  const existing = await c.env.DB.prepare(
    `SELECT id FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  const payload = { ...data, updatedAt: now };
  if (existing?.id) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?`,
    ).bind(JSON.stringify(payload), now, existing.id).run();
    return { ...payload, storeId: text(existing.id), fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, scope, slug || null, fileName, JSON.stringify(payload), now, now).run();
  return { ...payload, storeId: id, fileName };
}

function errorBody(code: string, message: string) {
  return { ok: false, success: false, error: { code, message } };
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

async function ensureRegisteredColor(c: Context<AppEnv>, slug: string, body: Row) {
  if (body.registeredColorId) {
    const selected = await storeGet(c, REGISTERED_SCOPE, text(body.registeredColorId), slug);
    if (selected) return selected;
  }

  const sourceType = sourceTypeOf(body);
  const candidate = {
    colorName: text(body.colorName),
    pantone: sourceType === "VISUAL" ? "" : text(body.pantone),
    basePantone: sourceType === "REFERENCE" ? text(body.basePantone || body.pantone) : "",
    paintType: text(body.paintType || "SUBAZLI"),
    dyeType: text(body.paintType || "SUBAZLI"),
    sourceType,
    colorSource: sourceType,
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
    isPantoneExact: sourceType === "PANTONE",
    status: "ACTIVE",
    isActive: true,
    activeVersion: "",
    recipeCount: 0,
    createdAt: nowIso(),
  }, slug);
}

export function registerBoyahaneColorJobRoutes(app: Hono<AppEnv>) {
  app.post("/api/boyahane/jobs/:id/colors", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const jobId = c.req.param("id");
    const job = await storeGet(c, JOB_SCOPE, jobId, slug);
    if (!job) return c.json(errorBody("NOT_FOUND", "Boyahane işi bulunamadı."), 404);

    const colorName = text(body.colorName);
    if (!colorName) return c.json(errorBody("COLOR_NAME_REQUIRED", "Renk adı zorunludur."), 400);
    const sourceType = sourceTypeOf(body);
    if (sourceType === "PANTONE" && !text(body.pantone)) {
      return c.json(errorBody("PANTONE_REQUIRED", "Pantoneye göre renkte Pantone zorunludur."), 400);
    }
    if (sourceType === "REFERENCE" && !text(body.referenceName || body.referenceCode)) {
      return c.json(errorBody("REFERENCE_REQUIRED", "Renk referansına göre kayıtta referans adı veya kodu zorunludur."), 400);
    }
    if (sourceType === "VISUAL" && !/^#?[0-9a-f]{6}$/i.test(text(body.colorHex))) {
      return c.json(errorBody("COLOR_HEX_REQUIRED", "Görsel/RGB kaydında renk kutusu seçilmelidir."), 400);
    }

    const registered = await ensureRegisteredColor(c, slug, body);
    const id = crypto.randomUUID();
    const row = await storePut(c, JOB_COLOR_SCOPE, id, {
      id,
      jobId,
      dyehouseModelId: jobId,
      registeredColorId: registered.id || registered.fileName,
      sourceChannelKey: `manual:${Date.now()}`,
      colorName: text(registered.colorName || colorName),
      pantone: text(registered.pantone || body.pantone),
      basePantone: text(registered.basePantone || body.basePantone || body.pantone),
      paintType: text(registered.dyeType || registered.paintType || body.paintType || "SUBAZLI"),
      recipeId: body.recipeId || null,
      sourceType,
      colorSource: sourceType,
      isPantoneExact: sourceType === "PANTONE",
      referenceName: text(registered.referenceName || body.referenceName),
      referenceCode: text(registered.referenceCode || body.referenceCode),
      referenceNote: text(registered.referenceNote || body.referenceNote),
      referenceImageUrl: text(registered.referenceImageUrl || body.referenceImageUrl),
      colorHex: text(registered.colorHex || body.colorHex),
      colorFamily: text(registered.colorFamily || body.colorFamily),
      printRegion: text(body.printRegion || job.printRegion),
      plannedKg: num(body.plannedKg),
      status: "WAITING",
      createdAt: nowIso(),
    }, slug);

    const logId = crypto.randomUUID();
    await storePut(c, LOG_SCOPE, logId, {
      id: logId,
      module: "BOYAHANE",
      entityType: "DYEHOUSE_COLOR",
      entityId: id,
      action: "COLOR_ADDED",
      actionType: "COLOR_ADDED",
      description: `${colorName} işe ${sourceType === "REFERENCE" ? "renk referansına göre" : sourceType === "VISUAL" ? "görsel/RGB’ye göre" : "Pantoneye göre"} eklendi ve Kayıtlı Renkler kartı oluşturuldu.`,
      actor: text(body.actor || "KY ERP"),
      createdAt: nowIso(),
    }, slug);

    return c.json({ ok: true, success: true, data: row }, 201);
  });
}
