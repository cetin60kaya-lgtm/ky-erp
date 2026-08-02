import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const COLOR_SCOPE = "BOYAHANE_REGISTERED_COLOR";
const RECIPE_SCOPE = "BOYAHANE_RECIPE";
const PRODUCTION_SCOPE = "BOYAHANE_PRODUCTION";
const JOB_COLOR_SCOPE = "BOYAHANE_JOB_COLOR";

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
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

function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

async function bodyOf(c: Context<AppEnv>): Promise<Row> {
  try {
    const payload = await c.req.json();
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Row : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string): Promise<Row[]> {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row) => ({
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  }));
}

async function storeGet(c: Context<AppEnv>, scope: string, fileName: string, slug: string): Promise<Row | null> {
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC
      LIMIT 1`,
  ).bind(scope, fileName, slug).first<Row>();
  if (!row) return null;
  return {
    ...objectOf(row.data),
    storeId: text(row.id),
    fileName: text(row.file_name),
    createdAt: text(objectOf(row.data).createdAt || row.created_at),
    updatedAt: text(objectOf(row.data).updatedAt || row.updated_at),
  };
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string): Promise<Row> {
  const current = await storeGet(c, scope, fileName, slug);
  const updatedAt = nowIso();
  const payload = { ...data, updatedAt };
  if (current?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data = ?, updated_at = ?
        WHERE id = ? AND (main_company_slug = ? OR main_company_slug IS NULL)`,
    ).bind(JSON.stringify(payload), updatedAt, current.storeId, slug).run();
    return { ...payload, storeId: current.storeId, fileName };
  }
  const storeId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO json_store
      (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(storeId, scope, slug || null, fileName, JSON.stringify(payload), updatedAt, updatedAt).run();
  return { ...payload, storeId, fileName };
}

function normalizedSource(value: unknown, pantone: string, colorHex: string) {
  const source = normalize(value);
  if (["REFERENCE", "RENK REFERANSI", "KUMAS REFERANSI", "KUMAŞ REFERANSI"].includes(source)) return "REFERENCE";
  if (["VISUAL", "RGB", "HEX", "GORSEL", "GÖRSEL"].includes(source)) return "VISUAL";
  if (["PANTONE", "STANDARD"].includes(source)) return "PANTONE";
  if (colorHex && !pantone) return "VISUAL";
  return "PANTONE";
}

function colorFamilyFromHex(value: unknown) {
  const hex = text(value).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "DİĞER";
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const light = (max + min) / 2;
  if (delta < 0.06) {
    if (light > 0.9) return "BEYAZ";
    if (light < 0.12) return "SİYAH";
    return "GRİ";
  }
  let hue = 0;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  if (hue < 15 || hue >= 345) return "KIRMIZI";
  if (hue < 45) return "TURUNCU";
  if (hue < 70) return "SARI";
  if (hue < 165) return "YEŞİL";
  if (hue < 195) return "TURKUAZ";
  if (hue < 255) return "MAVİ";
  if (hue < 290) return "MOR";
  if (hue < 345) return "PEMBE";
  return "DİĞER";
}

function sourceLabel(sourceType: string) {
  return sourceType === "REFERENCE"
    ? "Renk referansına göre"
    : sourceType === "VISUAL"
      ? "Görsel / RGB’ye göre"
      : "Pantoneye göre";
}

function inferLegacySource(row: Row) {
  const pantone = text(row.pantone || row.basePantone);
  const colorHex = text(row.colorHex || row.hex);
  const sourceType = normalizedSource(row.sourceType || row.colorSource, pantone, colorHex);
  const colorFamily = text(row.colorFamily) || colorFamilyFromHex(colorHex);
  return {
    ...row,
    id: text(row.id || row.fileName),
    sourceType,
    colorSource: sourceType,
    isPantoneExact: sourceType === "PANTONE",
    sourceLabel: sourceLabel(sourceType),
    pantone,
    basePantone: text(row.basePantone || pantone),
    referenceName: text(row.referenceName || row.fabricReference || row.customerReference),
    referenceCode: text(row.referenceCode || row.customerColorCode),
    referenceNote: text(row.referenceNote),
    referenceImageUrl: text(row.referenceImageUrl),
    colorHex: colorHex ? (colorHex.startsWith("#") ? colorHex : `#${colorHex}`) : "",
    colorFamily,
    displayCode: sourceType === "REFERENCE"
      ? text(row.referenceCode || row.referenceName || row.customerColorCode || pantone || "REFERANS")
      : sourceType === "VISUAL"
        ? text(row.colorHex || row.hex || row.colorName || "RGB")
        : pantone,
  };
}

function identityKey(row: Row) {
  const normalizedRow = inferLegacySource(row);
  const paint = normalize(row.dyeType || row.paintType || "SUBAZLI");
  if (normalizedRow.sourceType === "REFERENCE") {
    return `REFERENCE|${paint}|${normalize(normalizedRow.basePantone)}|${normalize(normalizedRow.referenceCode || normalizedRow.referenceName)}`;
  }
  if (normalizedRow.sourceType === "VISUAL") {
    return `VISUAL|${paint}|${normalize(normalizedRow.colorHex)}|${normalize(row.colorName)}`;
  }
  return `PANTONE|${paint}|${normalize(normalizedRow.pantone)}`;
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

function recipeView(row: Row) {
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

async function nearestJobColorContext(c: Context<AppEnv>, slug: string, body: Row) {
  const pantone = normalize(body.pantone);
  const name = normalize(body.colorName);
  const paint = normalize(body.paintType || body.dyeType);
  return (await storeList(c, JOB_COLOR_SCOPE, slug)).find((row) =>
    (!pantone || normalize(row.pantone) === pantone) &&
    (!name || normalize(row.colorName) === name) &&
    (!paint || normalize(row.paintType || row.dyeType) === paint),
  ) || null;
}

export function registerBoyahaneColorIdentityRoutes(app: Hono<AppEnv>) {
  app.get("/api/boyahane/registered-colors", async (c) => {
    const slug = slugOf(c);
    const query = normalize(c.req.query("q"));
    const sourceFilter = normalizedSource(c.req.query("sourceType"), "", "");
    const rawSource = text(c.req.query("sourceType"));
    const family = normalize(c.req.query("colorFamily"));
    const colors = (await storeList(c, COLOR_SCOPE, slug)).map(inferLegacySource);
    const recipes = await storeList(c, RECIPE_SCOPE, slug);
    const data = colors
      .filter((row) => row.isActive !== false)
      .filter((row) => !rawSource || row.sourceType === sourceFilter)
      .filter((row) => !family || normalize(row.colorFamily) === family)
      .filter((row) => !query || normalize([
        row.colorName,
        row.pantone,
        row.basePantone,
        row.referenceName,
        row.referenceCode,
        row.colorHex,
        row.colorFamily,
        row.dyeType,
        row.sourceLabel,
      ].join(" ")).includes(query))
      .map((row) => ({
        ...row,
        paintTypes: [...new Set(recipes
          .filter((recipe) => text(recipe.registeredColorId) === text(row.id))
          .map((recipe) => text(recipe.dyeType || recipe.paintType))
          .filter(Boolean))],
        recipeCount: recipes.filter((recipe) => text(recipe.registeredColorId) === text(row.id)).length,
      }));
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
    return c.json({ ok: true, success: true, data: { ...inferLegacySource(color), recipes, productions } });
  });

  app.post("/api/boyahane/registered-colors", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const context = await nearestJobColorContext(c, slug, body);
    const merged = { ...context, ...body };
    const colorName = text(merged.colorName);
    const paintType = text(merged.paintType || merged.dyeType || "SUBAZLI");
    const pantone = text(merged.pantone || merged.basePantone);
    const colorHex = text(merged.colorHex || merged.hex);
    const sourceType = normalizedSource(merged.sourceType || merged.colorSource, pantone, colorHex);
    const referenceName = text(merged.referenceName || merged.fabricReference || merged.customerReference);
    const referenceCode = text(merged.referenceCode || merged.customerColorCode);

    if (!colorName) return c.json(errorBody("COLOR_NAME_REQUIRED", "Renk adı zorunludur."), 400);
    if (sourceType === "PANTONE" && !pantone) {
      return c.json(errorBody("PANTONE_REQUIRED", "Pantoneye göre kayıtta Pantone zorunludur."), 400);
    }
    if (sourceType === "REFERENCE" && !referenceName && !referenceCode) {
      return c.json(errorBody("REFERENCE_REQUIRED", "Renk referansına göre kayıtta referans adı veya kodu zorunludur."), 400);
    }
    if (sourceType === "VISUAL" && !/^#?[0-9a-f]{6}$/i.test(colorHex)) {
      return c.json(errorBody("COLOR_HEX_REQUIRED", "Görsel/RGB kaydında geçerli bir renk kutusu seçilmelidir."), 400);
    }

    const candidate = inferLegacySource({
      ...merged,
      colorName,
      dyeType: paintType,
      paintType,
      pantone,
      basePantone: pantone,
      colorHex,
      sourceType,
      referenceName,
      referenceCode,
    });
    const existing = (await storeList(c, COLOR_SCOPE, slug))
      .map(inferLegacySource)
      .find((row) => identityKey(row) === identityKey(candidate));
    if (existing) {
      return c.json(errorBody("COLOR_EXISTS", "Bu renk kaynağı, boya türü ve kimlikle kayıtlı renk zaten var.", { colorId: existing.id }), 409);
    }

    const id = crypto.randomUUID();
    const created = await storePut(c, COLOR_SCOPE, id, {
      id,
      colorName,
      pantone: sourceType === "VISUAL" ? "" : pantone,
      basePantone: sourceType === "REFERENCE" ? pantone : "",
      dyeType: paintType,
      paintType,
      sourceType,
      colorSource: sourceType,
      isPantoneExact: sourceType === "PANTONE",
      referenceName,
      referenceCode,
      referenceNote: text(merged.referenceNote),
      referenceImageUrl: text(merged.referenceImageUrl),
      colorHex: colorHex ? (colorHex.startsWith("#") ? colorHex : `#${colorHex}`) : "",
      colorFamily: text(merged.colorFamily) || colorFamilyFromHex(colorHex),
      status: "ACTIVE",
      isActive: true,
      createdAt: nowIso(),
    }, slug);
    return c.json({ ok: true, success: true, data: inferLegacySource(created) }, 201);
  });

  app.patch("/api/boyahane/registered-colors/:id", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = await storeGet(c, COLOR_SCOPE, c.req.param("id"), slug);
    if (!current) return c.json(errorBody("NOT_FOUND", "Kayıtlı renk bulunamadı."), 404);
    const merged = inferLegacySource({ ...current, ...body, id: c.req.param("id") });
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
      .map(inferLegacySource)
      .find((row) => row.id !== c.req.param("id") && identityKey(row) === identityKey(merged));
    if (duplicate) return c.json(errorBody("COLOR_EXISTS", "Aynı renk kimliği başka kartta kayıtlıdır.", { colorId: duplicate.id }), 409);
    const saved = await storePut(c, COLOR_SCOPE, c.req.param("id"), {
      ...current,
      ...body,
      ...merged,
      id: c.req.param("id"),
      colorFamily: text(body.colorFamily) || colorFamilyFromHex(merged.colorHex),
    }, slug);
    return c.json({ ok: true, success: true, data: inferLegacySource(saved) });
  });
}
