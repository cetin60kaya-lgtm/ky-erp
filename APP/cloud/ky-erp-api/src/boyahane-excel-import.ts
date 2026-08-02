// @ts-nocheck
import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const PRODUCT_SCOPE = "BOYAHANE_APPROVED_PRODUCT";
const COLOR_SCOPE = "BOYAHANE_REGISTERED_COLOR";
const RECIPE_SCOPE = "BOYAHANE_RECIPE";
const LOT_SCOPE = "BOYAHANE_LOT";
const SOURCE = "RENK_KAYIT_XLSM";

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalize = (value: unknown) =>
  text(value)
    .toLocaleUpperCase("tr-TR")
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

function localRequest(c: Context<AppEnv>) {
  const host = new URL(c.req.url).hostname;
  return host === "127.0.0.1" || host === "localhost";
}

async function stableId(prefix: string, value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(value),
  );
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 18);
  return `${prefix}-${hex}`;
}

async function storeRows(c: Context<AppEnv>, scope: string, slug: string) {
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
) {
  const row = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND file_name = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
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
) {
  const current = await storeGet(c, scope, fileName, slug);
  const now = new Date().toISOString();
  const payload = { ...data, updatedAt: now };
  if (current?.storeId) {
    await c.env.DB.prepare(
      `UPDATE json_store SET data = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(JSON.stringify(payload), now, current.storeId)
      .run();
    return { ...payload, storeId: current.storeId, fileName };
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
      text(data.createdAt || now),
      now,
    )
    .run();
  return { ...payload, storeId, fileName };
}

function splitProductName(value: string) {
  const source = text(value).replace(/\s+/g, " ");
  const suppliers = ["URAS KİMYA", "URAS", "TURAN", "İNKUİN", "İNKON", "MAGNA"];
  for (const supplier of suppliers) {
    if (normalize(source).endsWith(normalize(supplier))) {
      const productName = source
        .slice(0, Math.max(0, source.length - supplier.length))
        .trim();
      return { productName: productName || source, supplierName: supplier };
    }
  }
  return { productName: source, supplierName: "" };
}

function productType(value: string) {
  const key = normalize(value);
  if (key.includes("ECOPLAST") || key.includes("YÜKSEK ECOPLAST")) {
    return "ECO YÜKSEK";
  }
  if (key.includes("SİLİKON") || key.startsWith("SLC ")) return "SİLİKON";
  if (
    key.startsWith("S 10 ") ||
    key.startsWith("S 20 ") ||
    key.startsWith("SW 10 ") ||
    key.startsWith("SW 20 ")
  ) {
    return "SUBAZLI";
  }
  if (
    key.includes("RETARDER") ||
    key.includes("İNCELTİCİ") ||
    key.includes("SİM PATI") ||
    key.includes("FOSFOR TOZU") ||
    key.includes("SEDEF") ||
    key.includes("METAL SİM") ||
    key.includes("GÜMÜŞ SİM")
  ) {
    return "KATKI";
  }
  return "PİGMENT";
}

function starterInfo(value: string) {
  const key = normalize(value);
  if (key.includes("S 10 ŞEFFAF") || key.includes("S 10 CLEAR")) {
    return {
      isRecipeDefault: true,
      defaultRecipeOrder: 1,
      code: "S10",
      tradeName: "ECOFLEX S-10 CLEAR",
    };
  }
  if (key.includes("S 20 BEYAZ") || key.includes("S 20 WHITE")) {
    return {
      isRecipeDefault: true,
      defaultRecipeOrder: 2,
      code: "S20",
      tradeName: "ECOFLEX S-20 WHITE",
    };
  }
  return {
    isRecipeDefault: false,
    defaultRecipeOrder: 0,
    code: "",
    tradeName: text(value),
  };
}

function dateIso(value: unknown) {
  const source = text(value);
  if (!source) return "2020-01-01T09:00:00.000Z";
  return /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? `${source}T09:00:00.000Z`
    : source;
}

export function registerBoyahaneExcelImportRoutes(app: Hono<AppEnv>) {
  app.get("/api/boyahane/import/recipes/status", async (c) => {
    if (!localRequest(c)) {
      return c.json({ ok: false, error: { code: "LOCAL_ONLY", message: "Bu aktarım yalnız yerel test ortamında çalışır." } }, 403);
    }
    const slug = slugOf(c);
    const [products, colors, recipes] = await Promise.all([
      storeRows(c, PRODUCT_SCOPE, slug),
      storeRows(c, COLOR_SCOPE, slug),
      storeRows(c, RECIPE_SCOPE, slug),
    ]);
    return c.json({
      ok: true,
      success: true,
      data: {
        products: products.filter((row) => row.source === SOURCE).length,
        colors: colors.filter((row) => row.source === SOURCE).length,
        recipes: recipes.filter((row) => row.source === SOURCE).length,
      },
    });
  });

  app.post("/api/boyahane/import/recipes/batch", async (c) => {
    if (!localRequest(c)) {
      return c.json({ ok: false, error: { code: "LOCAL_ONLY", message: "Bu aktarım yalnız yerel test ortamında çalışır." } }, 403);
    }

    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const rows = (Array.isArray(body.rows) ? body.rows : [])
      .filter((row) => row && Array.isArray(row.ingredients))
      .sort(
        (a, b) =>
          text(a.sourceDate || "9999-99-99").localeCompare(
            text(b.sourceDate || "9999-99-99"),
          ) || numberValue(a.sourceRow) - numberValue(b.sourceRow),
      );

    if (!rows.length) {
      return c.json({ ok: false, error: { code: "ROWS_REQUIRED", message: "Aktarılacak reçete satırı bulunamadı." } }, 400);
    }

    const existingProducts = await storeRows(c, PRODUCT_SCOPE, slug);
    const productByKey = new Map<string, Row>();
    existingProducts.forEach((row) => {
      [row.sourceName, row.productName, row.tradeName, row.code]
        .filter(Boolean)
        .forEach((value) => productByKey.set(normalize(value), row));
    });

    const existingColors = await storeRows(c, COLOR_SCOPE, slug);
    const colorByKey = new Map<string, Row>();
    existingColors.forEach((row) => {
      const key = `${normalize(row.pantone || row.colorName)}|${normalize(
        row.dyeType || row.paintType || safeArray(row.paintTypes)[0],
      )}`;
      if (key !== "|") colorByKey.set(key, row);
    });

    const existingRecipes = await storeRows(c, RECIPE_SCOPE, slug);
    const recipeBySourceRow = new Map(
      existingRecipes
        .filter((row) => row.source === SOURCE && numberValue(row.sourceRow) > 0)
        .map((row) => [numberValue(row.sourceRow), row]),
    );
    const recipeCountByColor = new Map<string, number>();
    existingRecipes.forEach((row) => {
      const colorId = text(row.colorId);
      if (!colorId) return;
      recipeCountByColor.set(
        colorId,
        Math.max(recipeCountByColor.get(colorId) || 0, Number(String(row.version || "").match(/\d+/)?.[0] || 0)),
      );
    });

    let productsCreated = 0;
    let colorsCreated = 0;
    let recipesCreated = 0;
    const touchedColors = new Map<string, Row>();

    async function ensureProduct(sourceName: string) {
      const key = normalize(sourceName);
      const existing = productByKey.get(key);
      if (existing) return existing;

      const { productName, supplierName } = splitProductName(sourceName);
      const starter = starterInfo(sourceName);
      const id = await stableId("rk-product", key);
      const data = await storePut(
        c,
        PRODUCT_SCOPE,
        id,
        {
          id,
          productName,
          name: productName,
          tradeName: starter.tradeName || sourceName,
          sourceName,
          code: starter.code,
          supplierName,
          dyeType: productType(sourceName),
          unit: "KG",
          approvalStatus: "APPROVED",
          isActive: true,
          isRecipeDefault: starter.isRecipeDefault,
          defaultRecipeOrder: starter.defaultRecipeOrder,
          recipeOrder: starter.defaultRecipeOrder,
          source: SOURCE,
          documents: [],
          createdAt: new Date().toISOString(),
        },
        slug,
      );
      productsCreated += 1;
      [sourceName, productName, starter.tradeName, starter.code]
        .filter(Boolean)
        .forEach((value) => productByKey.set(normalize(value), data));
      return data;
    }

    for (const row of rows) {
      const sourceRow = numberValue(row.sourceRow);
      if (sourceRow > 0 && recipeBySourceRow.has(sourceRow)) continue;

      const pantone = text(row.pantone);
      const colorName = text(row.colorName);
      const paintType = text(row.paintType || "GENEL");
      const colorKey = `${normalize(pantone || colorName)}|${normalize(paintType)}`;
      if (colorKey === "|") continue;

      let color = colorByKey.get(colorKey);
      if (!color) {
        const id = await stableId("rk-color", colorKey);
        color = await storePut(
          c,
          COLOR_SCOPE,
          id,
          {
            id,
            pantone,
            colorName,
            dyeType: paintType,
            paintType,
            paintTypes: [paintType],
            activeVersion: "V0",
            latestVersion: "V0",
            versionCount: 0,
            status: "ACTIVE",
            lastModelName: text(row.modelName),
            usageCount: 0,
            source: SOURCE,
            createdAt: dateIso(row.sourceDate),
          },
          slug,
        );
        colorsCreated += 1;
        colorByKey.set(colorKey, color);
      }

      const lines: Row[] = [];
      for (const ingredient of row.ingredients) {
        const grams = numberValue(ingredient.grams);
        const ingredientName = text(ingredient.productName || ingredient.name);
        if (!ingredientName || grams <= 0) continue;
        const product = await ensureProduct(ingredientName);
        lines.push({
          id: `${sourceRow || "row"}-${lines.length + 1}`,
          inventoryId: product.id,
          productId: product.id,
          productName: product.productName,
          sourceProductName: ingredientName,
          referenceGram: grams,
          totalGr: grams,
          trialTotalGr: grams,
          lotId: "",
        });
      }
      if (!lines.length) continue;

      const versionNumber = (recipeCountByColor.get(color.id) || 0) + 1;
      recipeCountByColor.set(color.id, versionNumber);
      const recipeId =
        sourceRow > 0
          ? `rk-recipe-${sourceRow}`
          : await stableId(
              "rk-recipe",
              `${color.id}|${versionNumber}|${text(row.modelName)}|${text(row.sourceDate)}`,
            );

      const activeRecipes = existingRecipes.filter(
        (item) =>
          text(item.colorId) === text(color.id) &&
          String(item.status).toUpperCase() === "ACTIVE",
      );
      for (const active of activeRecipes) {
        await storePut(
          c,
          RECIPE_SCOPE,
          text(active.id || active.fileName),
          { ...active, status: "HISTORY" },
          slug,
        );
        active.status = "HISTORY";
      }

      const recipe = await storePut(
        c,
        RECIPE_SCOPE,
        recipeId,
        {
          id: recipeId,
          colorId: color.id,
          version: `V${versionNumber}`,
          status: "ACTIVE",
          dyeType: paintType,
          paintType,
          lines,
          totalGr: lines.reduce(
            (sum, line) => sum + numberValue(line.referenceGram),
            0,
          ),
          source: SOURCE,
          sourceRow,
          sourceDate: text(row.sourceDate),
          sourceModel: text(row.modelName),
          recordType: text(row.recordType),
          createdAt: dateIso(row.sourceDate),
        },
        slug,
      );
      existingRecipes.push(recipe);
      if (sourceRow > 0) recipeBySourceRow.set(sourceRow, recipe);
      recipesCreated += 1;

      color = await storePut(
        c,
        COLOR_SCOPE,
        color.id,
        {
          ...color,
          pantone: pantone || color.pantone,
          colorName: colorName || color.colorName,
          dyeType: paintType,
          paintType,
          paintTypes: [paintType],
          activeVersion: recipe.version,
          latestVersion: recipe.version,
          versionCount: versionNumber,
          usageCount: versionNumber,
          lastModelName: text(row.modelName || color.lastModelName),
          status: "ACTIVE",
          source: SOURCE,
        },
        slug,
      );
      colorByKey.set(colorKey, color);
      touchedColors.set(color.id, color);
    }

    if (body.seedKnownLots === true) {
      const knownLots = [
        { search: "S 10 ŞEFFAF", lotNo: "260105001", entryKg: 25, usedKg: 18.5, remainingKg: 6.5 },
        { search: "S 20 BEYAZ", lotNo: "260105200", entryKg: 25, usedKg: 8.2, remainingKg: 16.8 },
        { search: "KIRMIZI KGC", lotNo: "260106093", entryKg: 5, usedKg: 1.4, remainingKg: 3.6 },
      ];
      for (const spec of knownLots) {
        const product = [...productByKey.values()].find((row) =>
          normalize(`${row.productName} ${row.sourceName}`).includes(
            normalize(spec.search),
          ),
        );
        if (!product) continue;
        const lotId = await stableId("rk-lot", `${product.id}|${spec.lotNo}`);
        await storePut(
          c,
          LOT_SCOPE,
          lotId,
          {
            id: lotId,
            productId: product.id,
            inventoryId: product.id,
            productName: product.productName,
            lotNo: spec.lotNo,
            supplierName: product.supplierName || "URAS",
            entryKg: spec.entryKg,
            usedKg: spec.usedKg,
            remainingKg: spec.remainingKg,
            status: "AVAILABLE",
            isDefault: true,
            source: "LOCAL_RENK_KAYIT",
            createdAt: "2026-07-20T09:00:00.000Z",
          },
          slug,
        );
      }
    }

    return c.json({
      ok: true,
      success: true,
      data: {
        received: rows.length,
        productsCreated,
        colorsCreated,
        recipesCreated,
        colorsTouched: touchedColors.size,
      },
    });
  });
}
