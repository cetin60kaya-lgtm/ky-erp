import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const JOB_SCOPE = "BOYAHANE_JOB";
const COLOR_SCOPE = "BOYAHANE_JOB_COLOR";

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const num = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;
const upper = (value: unknown) => text(value).toUpperCase();

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

function slugOf(c: Context<AppEnv>) {
  return text(c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string): Promise<Row[]> {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at FROM json_store
      WHERE scope = ? AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    id: text(objectOf(row.data).id || row.file_name),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  }));
}

function effectiveColor(row: Row) {
  const status = upper(row.status || "WAITING");
  const hasRecipe = Boolean(text(row.recipeId));
  const effectiveStatus = status === "COMPLETED" && !hasRecipe ? "WAITING" : status;
  const sourceType = upper(row.sourceType || row.colorSource || (row.pantone ? "PANTONE" : "VISUAL"));
  const displayCode = sourceType === "VISUAL"
    ? text(row.colorHex || row.pantone || "RGB")
    : sourceType === "REFERENCE"
      ? text(row.pantone || row.basePantone || row.referenceCode || row.referenceName)
      : text(row.pantone);
  return {
    ...row,
    pantone: displayCode,
    sourceType,
    colorSource: sourceType,
    isPantoneExact: sourceType === "PANTONE",
    status: effectiveStatus,
    integrityWarning: status === "COMPLETED" && !hasRecipe ? "RECIPE_MISSING" : row.integrityWarning,
  };
}

function jobView(job: Row, allColors: Row[]) {
  const colors = allColors
    .filter((row) => text(row.jobId || row.dyehouseModelId) === text(job.id))
    .map(effectiveColor)
    .sort((a, b) => text(a.createdAt).localeCompare(text(b.createdAt)));
  const activeColors = colors.filter((row) => upper(row.status) !== "CANCELLED");
  const prepared = activeColors.filter((row) => upper(row.status) === "COMPLETED").length;
  const pending = activeColors.filter((row) => upper(row.status) !== "COMPLETED").length;
  return {
    ...job,
    id: text(job.id || job.fileName),
    colors,
    preparedColorCount: prepared,
    pendingColorCount: pending,
    plannedPaintKg: activeColors.reduce((sum, row) => sum + num(row.plannedKg), 0),
    channelCount: num(job.channelCount || job.totalChannelCount),
    uniqueColorCount: num(job.uniqueColorCount || activeColors.length),
    moldCount: num(job.moldCount || job.totalMoldCount),
  };
}

export function registerBoyahaneJobIntegrityRoutes(app: Hono<AppEnv>) {
  app.get("/api/boyahane/jobs", async (c) => {
    const slug = slugOf(c);
    const status = upper(c.req.query("status"));
    const [jobs, colors] = await Promise.all([
      storeList(c, JOB_SCOPE, slug),
      storeList(c, COLOR_SCOPE, slug),
    ]);
    const data = jobs.map((job) => jobView(job, colors));
    return c.json({
      ok: true,
      success: true,
      data: status ? data.filter((row) => upper(row.status) === status) : data,
    });
  });

  app.get("/api/boyahane/jobs/:id", async (c) => {
    const slug = slugOf(c);
    const [jobs, colors] = await Promise.all([
      storeList(c, JOB_SCOPE, slug),
      storeList(c, COLOR_SCOPE, slug),
    ]);
    const job = jobs.find((row) => text(row.id) === c.req.param("id"));
    if (!job) {
      return c.json({ ok: false, success: false, error: { code: "NOT_FOUND", message: "Boyahane işi bulunamadı." } }, 404);
    }
    return c.json({ ok: true, success: true, data: jobView(job, colors) });
  });
}
