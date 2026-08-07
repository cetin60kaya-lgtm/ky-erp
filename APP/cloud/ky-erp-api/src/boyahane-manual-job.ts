import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const JOB_SCOPE = "BOYAHANE_JOB";
const COLOR_SCOPE = "BOYAHANE_JOB_COLOR";
const LOG_SCOPE = "BOYAHANE_WORKFLOW_LOG";

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const normalize = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  })) as Row[];
}

async function storePut(
  c: Context<AppEnv>,
  scope: string,
  fileName: string,
  data: Row,
  slug: string,
) {
  const existing = await c.env.DB.prepare(
    `SELECT id FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      LIMIT 1`,
  )
    .bind(scope, fileName, slug)
    .first<Row>();
  const now = new Date().toISOString();
  const payload = { ...data, updatedAt: now };
  if (existing?.id) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(JSON.stringify(payload), now, existing.id)
      .run();
    return { ...payload, storeId: text(existing.id), fileName };
  }
  const storeId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      storeId,
      scope,
      slug || null,
      fileName,
      JSON.stringify(payload),
      now,
      now,
    )
    .run();
  return { ...payload, storeId, fileName };
}

export function registerBoyahaneManualJobRoutes(app: Hono<AppEnv>) {
  app.post("/api/boyahane/jobs/manual", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const modelName = text(body.modelName);
    const companyName = text(body.companyName);
    const orderNo = text(body.orderNo);
    const jobType = ["SAMPLE", "TRIAL"].includes(upper(body.jobType))
      ? "SAMPLE"
      : "PRODUCTION";

    if (!modelName) {
      return c.json(
        errorBody("MODEL_NAME_REQUIRED", "Model veya desen adı zorunludur."),
        400,
      );
    }

    const jobs = await storeList(c, JOB_SCOPE, slug);
    const duplicate = jobs.find(
      (row) =>
        !["COMPLETED", "CANCELLED"].includes(upper(row.status)) &&
        upper(row.jobType || row.workflowType || row.type || "PRODUCTION") === jobType &&
        normalize(row.modelName) === normalize(modelName) &&
        (!orderNo || normalize(row.orderNo) === normalize(orderNo)),
    );
    if (duplicate) {
      return c.json(
        errorBody(
          "BOYAHANE_JOB_EXISTS",
          "Bu model için aynı tür açık Boyahane işi zaten bulunuyor.",
          { jobId: duplicate.id || duplicate.fileName },
        ),
        409,
      );
    }

    const now = new Date().toISOString();
    const jobId = text(body.id || crypto.randomUUID());
    const job = await storePut(
      c,
      JOB_SCOPE,
      jobId,
      {
        id: jobId,
        source: "BOYAHANE_MANUAL",
        manualEntry: true,
        jobType,
        workflowType: jobType,
        type: jobType,
        status: "WAITING",
        priority: upper(body.priority || "NORMAL"),
        modelName,
        companyName,
        orderNo,
        imageUrl: text(body.imageUrl),
        printRegion: text(body.printRegion || "Tüm baskı bölgeleri"),
        channelCount: Math.max(1, numberValue(body.channelCount || 1)),
        uniqueColorCount: Math.max(1, numberValue(body.uniqueColorCount || 1)),
        plannedQuantity: numberValue(body.plannedQuantity),
        createdAt: now,
        createdBy: text(body.actor || "KY ERP"),
      },
      slug,
    );

    const colorName = text(body.colorName || "İlk Renk");
    const colorId = crypto.randomUUID();
    const color = await storePut(
      c,
      COLOR_SCOPE,
      colorId,
      {
        id: colorId,
        jobId,
        dyehouseModelId: jobId,
        jobType,
        colorName,
        pantone: text(body.pantone),
        paintType: text(body.paintType || "SUBAZLI"),
        printRegion: text(body.printRegion || "Tüm baskı bölgeleri"),
        plannedKg: numberValue(body.plannedKg),
        status: "WAITING",
        createdAt: now,
      },
      slug,
    );

    const logId = crypto.randomUUID();
    await storePut(
      c,
      LOG_SCOPE,
      logId,
      {
        id: logId,
        module: "BOYAHANE",
        entityType: "DYEHOUSE_JOB",
        entityId: jobId,
        action: "MANUAL_JOB_CREATED",
        actionType: "MANUAL_JOB_CREATED",
        description: `${modelName} için ${jobType === "SAMPLE" ? "numune" : "imalat boya"} işi Boyahane ekranından doğrudan açıldı.`,
        actor: text(body.actor || "KY ERP"),
        createdAt: now,
      },
      slug,
    );

    return c.json(
      {
        ok: true,
        success: true,
        data: {
          ...job,
          colors: [color],
          preparedColorCount: 0,
          pendingColorCount: 1,
        },
      },
      201,
    );
  });
}
