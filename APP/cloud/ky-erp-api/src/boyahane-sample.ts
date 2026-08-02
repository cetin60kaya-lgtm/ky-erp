// @ts-nocheck
import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const MODEL_SCOPE = "DESEN_WORKFLOW_MODEL";
const JOB_SCOPE = "BOYAHANE_JOB";
const COLOR_SCOPE = "BOYAHANE_JOB_COLOR";

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();

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

function stableId(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Row)
      : {};
  } catch {
    return {};
  }
}

async function storeGet(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  slug: string,
) {
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ? AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
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

async function storeList(c: Context<AppEnv>, scope: string, slug: string) {
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

async function storePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: Row,
  slug: string,
) {
  const current = await storeGet(c, scope, fileName, slug);
  const timestamp = nowIso();
  const payload = { ...data, updatedAt: timestamp };
  if (current?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data = ?, updated_at = ?
        WHERE id = ? AND (main_company_slug = ? OR main_company_slug IS NULL)`,
    )
      .bind(JSON.stringify(payload), timestamp, current.storeId, slug)
      .run();
    return { ...payload, storeId: current.storeId, fileName };
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, scope, slug || null, fileName, JSON.stringify(payload), timestamp, timestamp)
    .run();
  return { ...payload, storeId: id, fileName };
}

function modelImage(model: Row) {
  if (model.mainImage?.previewUrl) return text(model.mainImage.previewUrl);
  const files = Array.isArray(model.files) ? model.files : [];
  const image =
    files.find((row: Row) => row.role === "MODEL_IMAGE") ||
    files.find((row: Row) => /image\//i.test(text(row.contentType)));
  return text(image?.previewUrl);
}

function colorSources(model: Row) {
  const rows: Row[] = [];
  for (const operation of Array.isArray(model.operations) ? model.operations : []) {
    const groups = Array.isArray(operation.colorGroups) && operation.colorGroups.length
      ? operation.colorGroups
      : (Array.isArray(operation.channels) ? operation.channels : [])
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
      rows.push({ ...group, printRegion: text(operation.printAreaName) }),
    );
  }
  return rows;
}

export function registerBoyahaneSampleRoutes(app: Hono<AppEnv>) {
  app.post("/api/boyahane/sample-jobs/from-design/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const modelId = c.req.param("id");
    const model = await storeGet(c, MODEL_SCOPE, modelId, slug);
    if (!model) {
      return c.json(
        { ok: false, success: false, error: { code: "DESIGN_MODEL_NOT_FOUND", message: "Numune işi açılacak Desen modeli bulunamadı." } },
        404,
      );
    }

    const jobId = `sample-${modelId}`;
    const currentJob = await storeGet(c, JOB_SCOPE, jobId, slug);
    const operations = Array.isArray(model.operations) ? model.operations : [];
    const sources = colorSources(model);
    const job = await storePut(
      c,
      JOB_SCOPE,
      jobId,
      {
        ...currentJob,
        id: jobId,
        designId: modelId,
        modelCardId: modelId,
        modelName: text(model.modelName || model.modelCode || "Adsız Model"),
        companyId: text(model.companyId),
        companyName: text(model.companyName),
        orderNo: text(model.orderNo),
        printRegion: operations.map((row: Row) => text(row.printAreaName)).filter(Boolean).join(", "),
        plannedQuantity: num(model.plannedQuantity),
        channelCount: operations.reduce(
          (sum: number, row: Row) =>
            sum + (Array.isArray(row.channels) ? row.channels.filter((channel: Row) => channel.included !== false).length : 0),
          0,
        ),
        uniqueColorCount: sources.length,
        moldCount: sources.reduce((sum, row) => sum + Math.max(1, num(row.moldCount || 1)), 0),
        imageUrl: modelImage(model),
        jobType: "SAMPLE",
        workflowType: "SAMPLE",
        status: currentJob?.status || "WAITING",
        priority: currentJob?.priority || "NORMAL",
        source: "DESEN_WORKFLOW_SAMPLE",
        createdAt: currentJob?.createdAt || nowIso(),
      },
      slug,
    );

    const existingColors = (await storeList(c, COLOR_SCOPE, slug)).filter(
      (row) => text(row.jobId || row.dyehouseModelId) === jobId,
    );
    const activeIds = new Set<string>();
    for (const source of sources) {
      const sourceKey = text(source.id || source.groupKey || stableId(JSON.stringify(source)));
      const colorId = `sample-color-${stableId(`${modelId}:${sourceKey}`)}`;
      activeIds.add(colorId);
      const current = existingColors.find((row) => text(row.id) === colorId);
      await storePut(
        c,
        COLOR_SCOPE,
        colorId,
        {
          ...current,
          id: colorId,
          jobId,
          dyehouseModelId: jobId,
          jobType: "SAMPLE",
          registeredColorId: text(source.registeredColorId) || null,
          sourceChannelKey: `sample-design:${sourceKey}`,
          colorName: text(source.displayName || source.colorCode || "Tanımsız Renk"),
          pantone: text(source.colorCode),
          paintType: text(current?.paintType || "SUBAZLI"),
          recipeId: current?.recipeId || null,
          printRegion: text(source.printRegion),
          plannedKg: num(current?.plannedKg),
          status: current?.status || "WAITING",
          moldCount: Math.max(1, num(source.moldCount || 1)),
          createdAt: current?.createdAt || nowIso(),
        },
        slug,
      );
    }

    for (const old of existingColors) {
      if (!activeIds.has(text(old.id)) && !["COMPLETED", "CANCELLED"].includes(text(old.status).toUpperCase())) {
        await storePut(c, COLOR_SCOPE, text(old.id), { ...old, status: "CANCELLED" }, slug);
      }
    }

    return c.json({
      ok: true,
      success: true,
      data: { job, jobId, colorCount: sources.length, workflowType: "SAMPLE" },
    }, currentJob ? 200 : 201);
  });
}
