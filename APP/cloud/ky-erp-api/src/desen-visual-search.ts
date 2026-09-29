import type { Context, Hono } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const MODEL_SCOPE = "DESEN_WORKFLOW_MODEL";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BATCH_SIZE = 70;
const RESULT_LIMIT = 8;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}#-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values: string[], limit = 80) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = text(raw).replace(/\s+/g, " ");
    if (!value) continue;
    const key = value.toLocaleUpperCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function pantones(value: string) {
  return uniq(
    (value.match(/\b\d{2}-\d{4}(?:\s*(?:TCX|TPX|TPG|C|U))?\b/gi) || []).map((row) =>
      row.toLocaleUpperCase("tr-TR"),
    ),
    40,
  );
}

function words(value: string) {
  const stop = new Set(
    "bir bu şu ve veya ile için gibi olan olarak görsel görselde desen tasarım baskı model renk zemin arka plan yer alıyor bulunan vardır the and with from image design print".split(" "),
  );
  return uniq(
    normalize(value)
      .split(" ")
      .filter((row) => row.length >= 3 && !stop.has(row) && !/^\d+$/.test(row)),
    100,
  );
}

function slugOf(c: Context<AppEnv>, form: Row = {}) {
  return text(
    form.mainCompanySlug ||
      form.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.header("X-KYERP-Tenant-Slug") ||
      "mecit-hakan",
  );
}

function errorBody(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function loadModels(c: Context<AppEnv>, slug: string) {
  const result = await c.env.DB.prepare(
    `SELECT id, file_name, data, created_at, updated_at
       FROM json_store
      WHERE scope = ?
        AND (main_company_slug = ? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC, id DESC`,
  )
    .bind(MODEL_SCOPE, slug)
    .all<Row>();

  return (result.results || [])
    .map((row) => {
      const model = objectOf(row.data);
      const metadata = objectOf(model.metadata);
      const analysis = objectOf(metadata.analysis);
      const files = Array.isArray(model.files) ? model.files : [];
      const mainImage =
        files.find((file: Row) => text(file.role) === "MODEL_IMAGE") ||
        files.find((file: Row) => /^image\//i.test(text(file.contentType))) ||
        objectOf(model.mainImage);
      const searchable = [
        model.modelName,
        model.modelCode,
        model.designName,
        model.companyName,
        model.groundColor,
        model.notes,
        analysis.description,
        analysis.summary,
        analysis.searchText,
        ...(Array.isArray(analysis.pantoneCodes) ? analysis.pantoneCodes : []),
        ...(Array.isArray(analysis.characters) ? analysis.characters : []),
        ...(Array.isArray(analysis.themes) ? analysis.themes : []),
        ...(Array.isArray(analysis.shapes) ? analysis.shapes : []),
        ...(Array.isArray(analysis.colors) ? analysis.colors : []),
        ...(Array.isArray(analysis.writtenText) ? analysis.writtenText : []),
        ...(Array.isArray(analysis.keywords) ? analysis.keywords : []),
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 7000);
      return {
        ...model,
        id: text(model.id || row.file_name || row.id),
        modelName: text(model.modelName || model.modelCode || "Adsız Model"),
        companyName: text(model.companyName),
        status: text(model.status || "NEW_ARRIVAL"),
        metadata,
        analysis,
        searchable,
        mainImage,
      } as Row;
    })
    .filter((row) => row.status !== "ARCHIVE");
}

async function describeQueryImage(c: Context<AppEnv>, file: File) {
  const ai = (c.env as any).AI;
  if (!ai?.toMarkdown) throw new Error("Workers AI görsel analizi kullanılamıyor.");
  const converted = await ai.toMarkdown(
    { name: file.name || "aranan-desen.jpg", blob: file },
    {
      conversionOptions: {
        image: { descriptionLanguage: "tr" },
        output: { format: "text" },
      },
    },
  );
  const item = Array.isArray(converted) ? converted[0] : converted;
  if (!item || item.format === "error") {
    throw new Error(text(item?.error) || "Görsel açıklaması üretilemedi.");
  }
  const description = text(item.data).slice(0, 7000);
  if (!description) throw new Error("Görsel açıklaması boş döndü.");
  return {
    description,
    pantoneCodes: pantones(description),
    keywords: words(description),
  };
}

function parseSemanticScores(payload: any, length: number) {
  const rows =
    payload?.response ||
    payload?.result?.response ||
    payload?.data?.response ||
    payload?.data ||
    payload?.result ||
    payload;
  const scores = new Array<number>(length).fill(0);
  if (Array.isArray(rows)) {
    rows.forEach((row: any, index: number) => {
      if (typeof row === "number") scores[index] = row;
      else {
        const id = Number(row?.id ?? row?.index ?? index);
        const score = Number(row?.score ?? row?.similarity ?? row?.value ?? 0);
        if (Number.isInteger(id) && id >= 0 && id < length && Number.isFinite(score)) {
          scores[id] = Math.max(0, Math.min(1, score));
        }
      }
    });
  }
  return scores;
}

async function semanticRank(c: Context<AppEnv>, query: string, models: Row[]) {
  const ai = (c.env as any).AI;
  if (!ai?.run || !models.length) return models.map(() => 0);
  const scores = new Array<number>(models.length).fill(0);
  const batches: Array<{ offset: number; rows: Row[] }> = [];
  for (let offset = 0; offset < models.length; offset += BATCH_SIZE) {
    batches.push({ offset, rows: models.slice(offset, offset + BATCH_SIZE) });
  }

  for (let cursor = 0; cursor < batches.length; cursor += 3) {
    const group = batches.slice(cursor, cursor + 3);
    const results = await Promise.all(
      group.map(async ({ rows }) => {
        try {
          const payload = await ai.run("@cf/baai/bge-m3", {
            query: query.slice(0, 6500),
            contexts: rows.map((model) => ({ text: text(model.searchable).slice(0, 3500) || model.modelName })),
            truncate_inputs: true,
          });
          return parseSemanticScores(payload, rows.length);
        } catch (error) {
          console.error("DESEN_VISUAL_BGE_M3_FAILED", error);
          return rows.map(() => 0);
        }
      }),
    );
    group.forEach(({ offset, rows }, groupIndex) => {
      const batchScores = results[groupIndex];
      rows.forEach((_row, index) => {
        scores[offset + index] = batchScores[index] || 0;
      });
    });
  }
  return scores;
}

function lexicalScore(queryDescription: string, queryPantones: string[], model: Row) {
  const queryWords = words(queryDescription);
  const modelWords = new Set(words(model.searchable));
  const overlap = queryWords.filter((word) => modelWords.has(word));
  const modelPantones = new Set(
    (Array.isArray(model.analysis?.pantoneCodes) ? model.analysis.pantoneCodes : pantones(model.searchable)).map((row: string) =>
      row.toLocaleUpperCase("tr-TR"),
    ),
  );
  const pantoneOverlap = queryPantones.filter((row) => modelPantones.has(row.toLocaleUpperCase("tr-TR")));
  const wordScore = queryWords.length ? Math.min(1, overlap.length / Math.min(18, queryWords.length)) : 0;
  const pantoneScore = queryPantones.length ? Math.min(1, pantoneOverlap.length / queryPantones.length) : 0;
  return {
    score: Math.min(1, wordScore * 0.55 + pantoneScore * 0.45),
    matchedWords: overlap.slice(0, 12),
    matchedPantones: pantoneOverlap,
  };
}

function confidence(score: number) {
  if (score >= 0.86) return "Çok yüksek";
  if (score >= 0.72) return "Yüksek";
  if (score >= 0.56) return "Orta";
  return "Düşük";
}

export function registerDesenVisualSearchRoutes(app: Hono<AppEnv>) {
  app.post("/api/desen/visual-search", async (c) => {
    let form: Record<string, string | File>;
    try {
      form = await c.req.parseBody();
    } catch {
      return c.json(errorBody("INVALID_FORM", "Görsel yükleme formu okunamadı."), 400);
    }
    const file = form.image || form.file;
    if (!(file instanceof File)) {
      return c.json(errorBody("IMAGE_REQUIRED", "Aranacak desen görseli zorunludur."), 400);
    }
    if (!/^image\//i.test(file.type || "")) {
      return c.json(errorBody("IMAGE_ONLY", "Yalnız görsel dosyası yükleyin."), 415);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return c.json(errorBody("IMAGE_TOO_LARGE", "Görsel en fazla 10 MB olabilir."), 413);
    }

    const slug = slugOf(c, form as Row);
    try {
      const [query, models] = await Promise.all([describeQueryImage(c, file), loadModels(c, slug)]);
      if (!models.length) {
        return c.json({
          ok: true,
          success: true,
          data: { query, totalModels: 0, matches: [] },
        });
      }

      const semanticScores = await semanticRank(c, query.description, models);
      const ranked = models
        .map((model, index) => {
          const lexical = lexicalScore(query.description, query.pantoneCodes, model);
          const semantic = semanticScores[index] || 0;
          const finalScore = Math.min(1, semantic * 0.78 + lexical.score * 0.22);
          const analysis = objectOf(model.analysis);
          const thumb = text(
            model.mainImage?.thumbnailUrl ||
              model.mainImage?.previewUrl ||
              (model.mainImage?.id
                ? `/api/desen/workflow/files/${encodeURIComponent(text(model.mainImage.id))}/preview`
                : ""),
          );
          return {
            id: model.id,
            modelName: model.modelName,
            companyName: model.companyName,
            status: model.status,
            score: Number(finalScore.toFixed(4)),
            percent: Math.round(finalScore * 100),
            confidence: confidence(finalScore),
            semanticScore: Number(semantic.toFixed(4)),
            matchedPantones: lexical.matchedPantones,
            matchedWords: lexical.matchedWords,
            pantoneCodes: Array.isArray(analysis.pantoneCodes) ? analysis.pantoneCodes : [],
            characters: Array.isArray(analysis.characters) ? analysis.characters : [],
            themes: Array.isArray(analysis.themes) ? analysis.themes : [],
            summary: text(analysis.summary || analysis.description || model.notes).slice(0, 300),
            thumbnailUrl: thumb,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, RESULT_LIMIT);

      return c.json({
        ok: true,
        success: true,
        data: {
          query: {
            description: query.description,
            pantoneCodes: query.pantoneCodes,
            keywords: query.keywords.slice(0, 30),
          },
          totalModels: models.length,
          matches: ranked,
          bestMatch: ranked[0] || null,
          mode: "VISION_OCR_PLUS_BGE_M3_RERANK",
        },
      });
    } catch (error) {
      console.error("DESEN_VISUAL_SEARCH_FAILED", error);
      return c.json(
        errorBody(
          "VISUAL_SEARCH_FAILED",
          error instanceof Error ? error.message : "Görsel desen araması tamamlanamadı.",
        ),
        500,
      );
    }
  });
}
