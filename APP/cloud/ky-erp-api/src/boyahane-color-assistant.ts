import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

type Lab = { l: number; a: number; b: number };

const COLOR_SCOPE = "BOYAHANE_REGISTERED_COLOR";
const RECIPE_SCOPE = "BOYAHANE_RECIPE";
const JOB_COLOR_SCOPE = "BOYAHANE_JOB_COLOR";
const PRODUCTION_SCOPE = "BOYAHANE_PRODUCTION";
const FEEDBACK_SCOPE = "BOYAHANE_COLOR_AI_FEEDBACK";

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
  return text(body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan");
}

async function storeList(c: Context<AppEnv>, scope: string, slug: string): Promise<Row[]> {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at FROM json_store
      WHERE scope = ? AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  ).bind(scope, slug).all<Row>();
  return (result.results || []).map((row) => {
    const parsed = objectOf(row.data);
    return {
      ...parsed,
      id: text(parsed.id || row.file_name),
      storeId: text(row.id),
      fileName: text(row.file_name),
      createdAt: text(parsed.createdAt || row.created_at),
      updatedAt: text(parsed.updatedAt || row.updated_at),
    };
  });
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const now = nowIso();
  const current = await c.env.DB.prepare(
    `SELECT id FROM json_store WHERE scope = ? AND file_name = ?
      AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  ).bind(scope, fileName, slug).first<{ id: string }>();
  const payload = { ...data, id: fileName, updatedAt: now };
  if (current?.id) {
    await c.env.DB.prepare("UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(payload), now, current.id).run();
    return payload;
  }
  await c.env.DB.prepare(
    `INSERT INTO json_store (id, scope, main_company_slug, file_name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), scope, slug || null, fileName, JSON.stringify(payload), now, now).run();
  return payload;
}

function normalizeHex(value: unknown) {
  const raw = text(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : "";
}

function srgbChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function hexToLab(value: unknown): Lab | null {
  const hex = normalizeHex(value);
  if (!hex) return null;
  const r = srgbChannel(parseInt(hex.slice(1, 3), 16));
  const g = srgbChannel(parseInt(hex.slice(3, 5), 16));
  const b = srgbChannel(parseInt(hex.slice(5, 7), 16));

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000;
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
  const f = (v: number) => v > 0.008856 ? Math.cbrt(v) : (7.787 * v) + (16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function degrees(value: number) {
  return (value * 180) / Math.PI;
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

// CIEDE2000: ekran HEX yakınlığını insan algısına daha yakın sıralamak için kullanılır.
function deltaE2000(left: Lab, right: Lab) {
  const l1 = left.l; const a1 = left.a; const b1 = left.b;
  const l2 = right.l; const a2 = right.a; const b2 = right.b;
  const c1 = Math.sqrt(a1 * a1 + b1 * b1);
  const c2 = Math.sqrt(a2 * a2 + b2 * b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = Math.pow(cBar, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + Math.pow(25, 7))));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.sqrt(a1p * a1p + b1 * b1);
  const c2p = Math.sqrt(a2p * a2p + b2 * b2);
  const hp = (a: number, b: number) => {
    let angle = degrees(Math.atan2(b, a));
    if (angle < 0) angle += 360;
    return angle;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);
  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = h2p - h1p;
  if (c1p * c2p === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(radians(dhp / 2));
  const lBar = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBar = h1p + h2p;
  if (c1p * c2p === 0) hBar = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hBar = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hBar = (h1p + h2p + 360) / 2;
  else hBar = (h1p + h2p - 360) / 2;
  const t = 1
    - 0.17 * Math.cos(radians(hBar - 30))
    + 0.24 * Math.cos(radians(2 * hBar))
    + 0.32 * Math.cos(radians(3 * hBar + 6))
    - 0.20 * Math.cos(radians(4 * hBar - 63));
  const dTheta = 30 * Math.exp(-Math.pow((hBar - 275) / 25, 2));
  const rc = 2 * Math.sqrt(Math.pow(cBarP, 7) / (Math.pow(cBarP, 7) + Math.pow(25, 7)));
  const sl = 1 + (0.015 * Math.pow(lBar - 50, 2)) / Math.sqrt(20 + Math.pow(lBar - 50, 2));
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(radians(2 * dTheta)) * rc;
  const lTerm = dLp / sl;
  const cTerm = dCp / sc;
  const hTerm = dHp / sh;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rt * cTerm * hTerm);
}

function colorFamily(value: unknown) {
  const hex = normalizeHex(value);
  if (!hex) return "DİĞER";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.06) {
    if (max > 0.9) return "BEYAZ";
    if (max < 0.13) return "SİYAH";
    return "GRİ";
  }
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = ((b - r) / delta) + 2;
  else hue = ((r - g) / delta) + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue < 18 || hue >= 345) return "KIRMIZI";
  if (hue < 45) return "TURUNCU";
  if (hue < 70) return "SARI";
  if (hue < 165) return "YEŞİL";
  if (hue < 195) return "TURKUAZ";
  if (hue < 255) return "MAVİ";
  if (hue < 300) return "MOR";
  return "PEMBE";
}

function recipeLines(value: unknown) {
  return (Array.isArray(value) ? value : []).map((line: Row, index) => ({
    id: text(line.id || `line-${index + 1}`),
    productId: text(line.productId || line.inventoryId),
    inventoryId: text(line.inventoryId || line.productId),
    productName: text(line.productName || line.productNameSnapshot),
    referenceGram: Number(line.referenceGram ?? line.totalGr ?? line.trialTotalGr ?? 0),
  })).filter((line) => line.productId || line.productName).filter((line) => line.referenceGram > 0);
}

function recipeView(row: Row | null) {
  if (!row) return null;
  const lines = recipeLines(row.lines);
  return {
    id: text(row.id || row.fileName),
    registeredColorId: text(row.registeredColorId || row.colorId),
    version: text(row.version || "V1"),
    status: text(row.status || "ACTIVE"),
    paintType: text(row.paintType || row.dyeType || "SUBAZLI"),
    createdAt: text(row.createdAt),
    lines,
    totalGr: lines.reduce((sum, line) => sum + line.referenceGram, 0),
  };
}

function bestRecipe(recipes: Row[], registeredColorId: string, paintType: string) {
  const paintKey = normalize(paintType);
  return recipes
    .filter((row) => text(row.registeredColorId || row.colorId) === registeredColorId)
    .filter((row) => !paintKey || normalize(row.paintType || row.dyeType) === paintKey)
    .filter((row) => recipeLines(row.lines).length > 0)
    .sort((a, b) => {
      const activeDelta = Number(normalize(b.status) === "ACTIVE") - Number(normalize(a.status) === "ACTIVE");
      if (activeDelta) return activeDelta;
      const bv = Number(text(b.version).match(/\d+/)?.[0] || 0);
      const av = Number(text(a.version).match(/\d+/)?.[0] || 0);
      if (bv !== av) return bv - av;
      return text(b.createdAt).localeCompare(text(a.createdAt));
    })[0] || null;
}

function confidence(delta: number, confirmed: boolean, hasRecipe: boolean) {
  if (confirmed && delta <= 1.5) return { level: "ÇOK YÜKSEK", score: 99 };
  let score = Math.max(0, Math.min(98, Math.round(100 - delta * 6)));
  if (confirmed) score = Math.min(99, score + 5);
  if (hasRecipe) score = Math.min(99, score + 2);
  const level = delta <= 2 ? "ÇOK YÜKSEK" : delta <= 4 ? "YÜKSEK" : delta <= 7 ? "ORTA" : delta <= 12 ? "YAKIN" : "REFERANS";
  return { level, score };
}

function candidateKey(paintType: unknown, pantone: unknown, hex: unknown) {
  return `${normalize(paintType)}|${normalize(pantone)}|${normalizeHex(hex)}`;
}

export function registerBoyahaneColorAssistantRoutes(app: Hono<AppEnv>) {
  app.post("/api/boyahane/color-assistant/suggest", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const inputHex = normalizeHex(body.colorHex || body.hex);
    const inputPantone = normalize(body.pantone);
    const paintType = text(body.paintType || body.dyeType || "SUBAZLI");
    const limit = Math.max(1, Math.min(Number(body.limit || 5), 8));

    if (!inputHex && !inputPantone) {
      return c.json({ ok: false, success: false, error: { code: "COLOR_REQUIRED", message: "HEX renk veya Pantone kodu girilmelidir." } }, 400);
    }

    const [colors, recipes, jobColors, productions, feedback] = await Promise.all([
      storeList(c, COLOR_SCOPE, slug),
      storeList(c, RECIPE_SCOPE, slug),
      storeList(c, JOB_COLOR_SCOPE, slug),
      storeList(c, PRODUCTION_SCOPE, slug),
      storeList(c, FEEDBACK_SCOPE, slug),
    ]);

    const registeredById = new Map(colors.map((row) => [text(row.id || row.fileName), row]));
    const findRegistered = (row: Row) => {
      const direct = registeredById.get(text(row.registeredColorId));
      if (direct) return direct;
      const p = normalize(row.pantone || row.basePantone);
      const paint = normalize(row.paintType || row.dyeType || paintType);
      return colors.find((color) => normalize(color.pantone || color.basePantone) === p && normalize(color.paintType || color.dyeType || "SUBAZLI") === paint) || null;
    };

    const rawCandidates: Row[] = [];
    for (const row of feedback) {
      const hex = normalizeHex(row.colorHex || row.inputHex);
      const pantone = text(row.pantone);
      if (!hex || !pantone) continue;
      const registered = registeredById.get(text(row.registeredColorId)) || findRegistered(row);
      rawCandidates.push({ ...row, ...registered, colorHex: hex, pantone, registeredColorId: text(registered?.id || row.registeredColorId), hexOrigin: "CONFIRMED", confirmed: true, sourcePriority: 4 });
    }
    for (const row of colors) {
      const hex = normalizeHex(row.colorHex || row.hex);
      const pantone = text(row.pantone || row.basePantone);
      if (!pantone) continue;
      rawCandidates.push({ ...row, colorHex: hex, pantone, registeredColorId: text(row.id || row.fileName), hexOrigin: hex ? "REGISTERED_COLOR" : "PANTONE_ONLY", confirmed: false, sourcePriority: 3 });
    }
    for (const row of jobColors) {
      const hex = normalizeHex(row.colorHex || row.hex || row.preview);
      const pantone = text(row.pantone || row.basePantone);
      if (!pantone || !hex) continue;
      const registered = findRegistered(row);
      rawCandidates.push({ ...row, colorHex: hex, pantone, registeredColorId: text(registered?.id || row.registeredColorId), colorName: text(row.colorName || registered?.colorName), hexOrigin: "MODEL_COLOR", confirmed: false, sourcePriority: 2 });
    }

    const deduped = new Map<string, Row>();
    for (const row of rawCandidates) {
      const rowPaint = text(row.paintType || row.dyeType || paintType || "SUBAZLI");
      if (paintType && normalize(rowPaint) !== normalize(paintType)) continue;
      const key = candidateKey(rowPaint, row.pantone, row.colorHex);
      const current = deduped.get(key);
      if (!current || Number(row.sourcePriority || 0) > Number(current.sourcePriority || 0)) deduped.set(key, row);
    }

    const inputLab = inputHex ? hexToLab(inputHex) : null;
    const ranked = [...deduped.values()].map((row) => {
      const candidateHex = normalizeHex(row.colorHex);
      const candidateLab = candidateHex ? hexToLab(candidateHex) : null;
      const exactPantone = Boolean(inputPantone && normalize(row.pantone) === inputPantone);
      const delta = inputLab && candidateLab ? deltaE2000(inputLab, candidateLab) : exactPantone ? 0 : Number.POSITIVE_INFINITY;
      const registeredColorId = text(row.registeredColorId);
      const recipe = recipeView(bestRecipe(recipes, registeredColorId, paintType));
      const productionCount = registeredColorId
        ? productions.filter((production) => text(production.colorId || production.registeredColorId) === registeredColorId).length
        : 0;
      const trust = confidence(Number.isFinite(delta) ? delta : 50, Boolean(row.confirmed), Boolean(recipe?.lines?.length));
      return {
        registeredColorId,
        pantone: text(row.pantone),
        colorName: text(row.colorName),
        colorHex: candidateHex,
        colorFamily: text(row.colorFamily) || colorFamily(candidateHex),
        paintType: text(row.paintType || row.dyeType || paintType || "SUBAZLI"),
        deltaE: Number.isFinite(delta) ? Number(delta.toFixed(2)) : null,
        confidence: trust.level,
        score: exactPantone ? Math.max(99, trust.score) : trust.score,
        exactPantone,
        confirmed: Boolean(row.confirmed),
        hexOrigin: text(row.hexOrigin || "REGISTERED_COLOR"),
        productionCount,
        recipe,
      };
    }).filter((row) => row.exactPantone || row.deltaE !== null)
      .sort((a, b) => {
        if (a.exactPantone !== b.exactPantone) return Number(b.exactPantone) - Number(a.exactPantone);
        const deltaA = a.deltaE ?? 999;
        const deltaB = b.deltaE ?? 999;
        if (deltaA !== deltaB) return deltaA - deltaB;
        return b.score - a.score;
      })
      .slice(0, limit);

    const mappedPantones = new Set(rawCandidates.filter((row) => normalizeHex(row.colorHex)).map((row) => normalize(row.pantone))).size;
    const allPantones = new Set(rawCandidates.map((row) => normalize(row.pantone)).filter(Boolean)).size;
    const response = {
      query: {
        colorHex: inputHex,
        pantone: text(body.pantone),
        paintType,
        colorName: text(body.colorName),
        colorFamily: colorFamily(inputHex),
      },
      catalogStats: {
        registeredColors: colors.length,
        recipes: recipes.length,
        productions: productions.length,
        modelColors: jobColors.length,
        confirmedMappings: feedback.length,
        pantones: allPantones,
        hexMappedPantones: mappedPantones,
        pantoneOnly: Math.max(0, allPantones - mappedPantones),
      },
      suggestions: ranked,
      bestMatch: ranked[0] || null,
      method: "CIEDE2000 + canlı KY ERP renk/reçete geçmişi + kullanıcı doğrulama geri beslemesi",
      warning: "HEX/Pantone ekran yakınlığı fiziksel boya formülünün birebir garantisi değildir. Reçete önerisi geçmiş çalışma için başlangıç referansıdır; üretime yazma ve stok sarfı kullanıcı onayıyla yapılır.",
    };
    return c.json({ ok: true, success: true, data: response });
  });

  app.post("/api/boyahane/color-assistant/confirm", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const colorHex = normalizeHex(body.colorHex || body.hex);
    const pantone = text(body.pantone);
    const paintType = text(body.paintType || body.dyeType || "SUBAZLI");
    if (!colorHex || !pantone) {
      return c.json({ ok: false, success: false, error: { code: "CONFIRM_DATA_REQUIRED", message: "Doğrulama için HEX ve Pantone zorunludur." } }, 400);
    }
    const stable = `${normalize(paintType).replace(/[^A-Z0-9]+/g, "-")}-${normalize(pantone).replace(/[^A-Z0-9]+/g, "-")}-${colorHex.slice(1)}`.replace(/^-+|-+$/g, "").toLowerCase();
    const saved = await storePut(c, FEEDBACK_SCOPE, stable, {
      colorHex,
      pantone,
      paintType,
      colorName: text(body.colorName),
      registeredColorId: text(body.registeredColorId),
      recipeId: text(body.recipeId),
      modelName: text(body.modelName),
      jobId: text(body.jobId),
      jobColorId: text(body.jobColorId),
      deltaE: Number(body.deltaE ?? 0),
      source: "USER_CONFIRMED",
      confirmedAt: nowIso(),
    }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });
}
