// @ts-nocheck
import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const COLOR_SCOPE = "BOYAHANE_REGISTERED_COLOR";
const RECIPE_SCOPE = "BOYAHANE_RECIPE";
const PRODUCTION_SCOPE = "BOYAHANE_PRODUCTION";

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
const normalize = (value: unknown) => text(value)
  .toLocaleUpperCase("tr-TR")
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
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(c.req.header("X-KYERP-Tenant-Slug") || body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
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
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
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
  return {
    ...objectOf(row.data),
    id: text(objectOf(row.data).id || row.file_name),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  };
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string): Promise<Row> {
  const current = await storeGet(c, scope, fileName, slug);
  const now = nowIso();
  const payload = { ...data, id: fileName, updatedAt: now };
  if (current?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?`,
    ).bind(JSON.stringify(payload), now, current.storeId).run();
    return { ...payload, storeId: current.storeId, fileName };
  }
  const storeId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(storeId, scope, slug || null, fileName, JSON.stringify(payload), now, now).run();
  return { ...payload, storeId, fileName };
}

function sourceTypeOf(row: Row) {
  const value = normalize(row.sourceType || row.colorSource);
  if (value === "REFERENCE" || value.includes("REFERANS")) return "REFERENCE";
  if (["VISUAL", "RGB", "HEX", "GORSEL", "GÖRSEL"].includes(value)) return "VISUAL";
  return "PANTONE";
}

function colorFamilyFromHex(value: unknown) {
  const hex = text(value).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "DİĞER";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 18) return max > 230 ? "BEYAZ" : max < 35 ? "SİYAH" : "GRİ";
  if (r >= g && r >= b) return g > 150 ? "SARI" : b > 125 ? "PEMBE" : "KIRMIZI";
  if (g >= r && g >= b) return b > 150 ? "TURKUAZ" : "YEŞİL";
  return r > 130 ? "MOR" : "MAVİ";
}

function sourceLabel(sourceType: string) {
  return sourceType === "REFERENCE"
    ? "Renk referansına göre"
    : sourceType === "VISUAL"
      ? "Görsel / RGB’ye göre"
      : "Pantoneye göre";
}

function colorView(row: Row): Row {
  const sourceType = sourceTypeOf(row);
  const pantone = text(row.pantone || row.basePantone);
  const colorHex = text(row.colorHex || row.hex);
  const normalizedHex = colorHex ? (colorHex.startsWith("#") ? colorHex : `#${colorHex}`) : "";
  const referenceName = text(row.referenceName || row.fabricReference || row.customerReference);
  const referenceCode = text(row.referenceCode || row.customerColorCode);
  return {
    ...row,
    id: text(row.id || row.fileName),
    sourceType,
    colorSource: sourceType,
    isPantoneExact: sourceType === "PANTONE",
    sourceLabel: sourceLabel(sourceType),
    pantone,
    basePantone: text(row.basePantone || (sourceType === "REFERENCE" ? pantone : "")),
    referenceName,
    referenceCode,
    referenceNote: text(row.referenceNote),
    referenceImageUrl: text(row.referenceImageUrl),
    colorHex: normalizedHex,
    colorFamily: text(row.colorFamily) || colorFamilyFromHex(normalizedHex),
    displayCode: sourceType === "REFERENCE"
      ? referenceCode || referenceName || pantone || "REFERANS"
      : sourceType === "VISUAL"
        ? normalizedHex || text(row.colorName) || "RGB"
        : pantone,
  };
}

function recipeLines(value: unknown) {
  return (Array.isArray(value) ? value : []).map((line: Row, index) => ({
    ...line,
    id: text(line.id || `line-${index + 1}`),
    productId: text(line.productId || line.inventoryId),
    inventoryId: text(line.inventoryId || line.productId),
    productName: text(line.productName),
    referenceGram: Number(line.referenceGram ?? line.trialTotalGr ?? line.totalGr ?? 0),
  }));
}

function recipeView(row: Row): Row {
  const lines = recipeLines(row.lines);
  return {
    ...row,
    id: text(row.id || row.fileName),
    version: text(row.version || "V1"),
    status: text(row.status || "ACTIVE"),
    dyeType: text(row.dyeType || row.paintType || "SUBAZLI"),
    paintType: text(row.paintType || row.dyeType || "SUBAZLI"),
    lines,
    totalGr: lines.reduce((sum, line) => sum + Number(line.referenceGram || 0), 0),
  };
}

function identityKey(row: Row) {
  const view = colorView(row);
  const paint = normalize(row.dyeType || row.paintType || "SUBAZLI");
  if (view.sourceType === "REFERENCE") {
    return `REFERENCE|${paint}|${normalize(view.basePantone)}|${normalize(view.referenceCode || view.referenceName)}`;
  }
  if (view.sourceType === "VISUAL") {
    return `VISUAL|${paint}|${normalize(view.colorHex)}|${normalize(row.colorName)}`;
  }
  return `PANTONE|${paint}|${normalize(view.pantone)}`;
}

function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function registerBoyahaneColorIdentityRoutes(app: Hono<AppEnv>) {
  app.get("/api/boyahane/registered-colors", async (c) => {
    const slug = slugOf(c);
    const query = normalize(c.req.query("q"));
    const rawSource = text(c.req.query("sourceType"));
    const family = normalize(c.req.query("colorFamily"));
    const colors = (await storeList(c, COLOR_SCOPE, slug)).map(colorView);
    const recipes = await storeList(c, RECIPE_SCOPE, slug);
    const data = colors
      .filter((row) => row.isActive !== false)
      .filter((row) => !rawSource || row.sourceType === sourceTypeOf({ sourceType: rawSource }))
      .filter((row) => !family || normalize(row.colorFamily) === family)
      .filter((row) => !query || normalize([
        row.colorName, row.pantone, row.basePantone, row.referenceName,
        row.referenceCode, row.colorHex, row.colorFamily, row.dyeType, row.sourceLabel,
      ].join(" ")).includes(query))
      .map((row) => {
        const colorRecipes = recipes.filter((recipe) => text(recipe.registeredColorId) === text(row.id));
        return {
          ...row,
          paintTypes: [...new Set(colorRecipes.map((recipe) => text(recipe.dyeType || recipe.paintType)).filter(Boolean))],
          recipeCount: colorRecipes.length,
        };
      });
    return c.json({ ok: true, success: true, data });
  });

  app.get("/api/boyahane/registered-colors/:id", async (c) => {
    const slug = slugOf(c);
    const color = await storeGet(c, COLOR_SCOPE, c.req.param("id"), slug);
    if (!color) return c.json(errorBody("NOT_FOUND", "Kayıtlı renk bulunamadı."), 404);
    const recipes = (await storeList(c, RECIPE_SCOPE, slug))
      .filter((row) => text(row.registeredColorId) === c.req.param("id"))
      .map(recipeView)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const productions = (await storeList(c, PRODUCTION_SCOPE, slug))
      .filter((row) => text(row.colorId || row.registeredColorId) === c.req.param("id"));
    return c.json({ ok: true, success: true, data: { ...colorView(color), recipes, productions } });
  });

  app.patch("/api/boyahane/registered-colors/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await storeGet(c, COLOR_SCOPE, c.req.param("id"), slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Kayıtlı renk bulunamadı."), 404);
    const merged = colorView({ ...current, ...body, id: c.req.param("id") });
    if (!text(merged.colorName)) return c.json(errorBody("COLOR_NAME_REQUIRED", "Renk adı zorunludur."), 400);
    if (merged.sourceType === "PANTONE" && !text(merged.pantone)) {
      return c.json(errorBody("PANTONE_REQUIRED", "Pantoneye göre kayıtta Pantone zorunludur."), 400);
    }
    if (merged.sourceType === "REFERENCE" && !text(merged.referenceName || merged.referenceCode)) {
      return c.json(errorBody("REFERENCE_REQUIRED", "Referans adı veya kodu zorunludur."), 400);
    }
    if (merged.sourceType === "VISUAL" && !/^#[0-9a-f]{6}$/i.test(text(merged.colorHex))) {
      return c.json(errorBody("COLOR_HEX_REQUIRED", "Geçerli bir renk kutusu seçilmelidir."), 400);
    }
    const duplicate = (await storeList(c, COLOR_SCOPE, slug))
      .map(colorView)
      .find((row) => row.id !== c.req.param("id") && identityKey(row) === identityKey(merged));
    if (duplicate) return c.json(errorBody("COLOR_EXISTS", "Aynı renk kimliği başka kartta kayıtlıdır.", { colorId: duplicate.id }), 409);
    const saved = await storePut(c, COLOR_SCOPE, c.req.param("id"), {
      ...current,
      ...body,
      ...merged,
      id: c.req.param("id"),
      colorFamily: text(body.colorFamily) || colorFamilyFromHex(merged.colorHex),
    }, slug);
    return c.json({ ok: true, success: true, data: colorView(saved) });
  });
}
