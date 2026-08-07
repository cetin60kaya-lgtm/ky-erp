import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const COLOR_SCOPE = "BOYAHANE_REGISTERED_COLOR";
const JOB_COLOR_SCOPE = "BOYAHANE_JOB_COLOR";

const text = (value: unknown) => value === undefined || value === null ? "" : String(value).trim();
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
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row) {
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
  }));
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const now = new Date().toISOString();
  const storeId = crypto.randomUUID();
  const payload = { ...data, updatedAt: now };
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

export function registerBoyahaneColorResolveRoutes(app: Hono<AppEnv>) {
  app.post("/api/boyahane/registered-colors", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const pantoneKey = normalize(body.pantone);
    const nameKey = normalize(body.colorName);
    const paintKey = normalize(body.paintType || body.dyeType);
    const jobColors = await storeList(c, JOB_COLOR_SCOPE, slug);
    const exactContext = jobColors.find((row) =>
      (!pantoneKey || normalize(row.pantone) === pantoneKey) &&
      (!nameKey || normalize(row.colorName) === nameKey) &&
      (!paintKey || normalize(row.paintType || row.dyeType) === paintKey),
    );
    const fallbackContext = jobColors.find((row) =>
      (!nameKey || normalize(row.colorName) === nameKey) &&
      (!paintKey || normalize(row.paintType || row.dyeType) === paintKey),
    );
    const context = exactContext || fallbackContext;
    const merged = { ...context, ...body };
    const sourceType = sourceTypeOf(merged);
    const colorName = text(merged.colorName);
    const paintType = text(merged.paintType || merged.dyeType || "SUBAZLI");
    const colorHex = text(context?.colorHex || merged.colorHex);
    const realPantone = sourceType === "REFERENCE"
      ? text(context?.basePantone || context?.pantone || merged.basePantone || merged.pantone)
      : text(merged.pantone);
    const candidate: Row = {
      colorName,
      pantone: sourceType === "VISUAL" ? "" : realPantone,
      basePantone: sourceType === "REFERENCE" ? realPantone : "",
      paintType,
      dyeType: paintType,
      sourceType,
      colorSource: sourceType,
      referenceName: text(context?.referenceName || merged.referenceName),
      referenceCode: text(context?.referenceCode || merged.referenceCode),
      referenceNote: text(context?.referenceNote || merged.referenceNote),
      referenceImageUrl: text(context?.referenceImageUrl || merged.referenceImageUrl),
      colorHex,
      colorFamily: text(context?.colorFamily || merged.colorFamily) || colorFamilyFromHex(colorHex),
    };

    if (!colorName) {
      return c.json({ ok: false, success: false, error: { code: "COLOR_NAME_REQUIRED", message: "Renk adı zorunludur." } }, 400);
    }
    if (sourceType === "PANTONE" && !candidate.pantone) {
      return c.json({ ok: false, success: false, error: { code: "PANTONE_REQUIRED", message: "Pantoneye göre kayıtta Pantone zorunludur." } }, 400);
    }
    if (sourceType === "REFERENCE" && !candidate.referenceName && !candidate.referenceCode) {
      return c.json({ ok: false, success: false, error: { code: "REFERENCE_REQUIRED", message: "Referans adı veya kodu zorunludur." } }, 400);
    }
    if (sourceType === "VISUAL" && !/^#?[0-9a-f]{6}$/i.test(colorHex)) {
      return c.json({ ok: false, success: false, error: { code: "COLOR_HEX_REQUIRED", message: "Görsel/RGB renk kutusu seçilmelidir." } }, 400);
    }

    const existing = (await storeList(c, COLOR_SCOPE, slug)).find(
      (row) => identityKey(row) === identityKey(candidate),
    );
    if (existing) {
      return c.json({ ok: true, success: true, reused: true, data: existing });
    }

    const id = crypto.randomUUID();
    const created = await storePut(c, COLOR_SCOPE, id, {
      id,
      ...candidate,
      colorHex: colorHex && !colorHex.startsWith("#") ? `#${colorHex}` : colorHex,
      isPantoneExact: sourceType === "PANTONE",
      status: "ACTIVE",
      isActive: true,
      createdAt: new Date().toISOString(),
    }, slug);
    return c.json({ ok: true, success: true, reused: false, data: created }, 201);
  });
}
