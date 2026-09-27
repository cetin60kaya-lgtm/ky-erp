import type { Context } from "hono";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };
type Row = Record<string, any>;

const ANALYSIS_VERSION = 3;
const ANALYSIS_MODE = "CLOUDFLARE_AI_VISION_OCR";
const MAX_DESCRIPTION = 7000;

const text = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).trim();
const nowIso = () => new Date().toISOString();

function uniq(values: string[], limit = 80) {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const value of values) {
    const item = text(value).replace(/\s+/g, " ");
    if (!item) continue;
    const key = item.toLocaleUpperCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
    if (rows.length >= limit) break;
  }
  return rows;
}

function normalizeForSearch(value: unknown) {
  return text(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}#-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelText(model: Row) {
  const operationText = (Array.isArray(model.operations) ? model.operations : [])
    .flatMap((operation: Row) => [
      operation.printAreaName,
      ...(Array.isArray(operation.channels) ? operation.channels : []).flatMap((channel: Row) => [
        channel.rawName,
        channel.normalizedName,
        channel.colorCode,
        channel.groupKey,
      ]),
    ])
    .filter(Boolean)
    .join(" ");
  return [
    model.modelName,
    model.modelCode,
    model.designName,
    model.groundColor,
    model.companyName,
    model.notes,
    operationText,
  ]
    .filter(Boolean)
    .join(" ");
}

function pickAsset(model: Row): Row | null {
  const files = Array.isArray(model.files) ? model.files : [];
  return (
    files.find((row: Row) => row.role === "MODEL_IMAGE" && row.storageKey) ||
    files.find((row: Row) => /^image\//i.test(text(row.contentType)) && row.storageKey) ||
    files.find((row: Row) => row.storageKey) ||
    (model.mainImage?.storageKey ? model.mainImage : null)
  );
}

function extFromType(contentType: string) {
  if (/webp/i.test(contentType)) return ".webp";
  if (/png/i.test(contentType)) return ".png";
  if (/jpe?g/i.test(contentType)) return ".jpg";
  if (/pdf/i.test(contentType)) return ".pdf";
  return ".webp";
}

function pantones(source: string) {
  const values = source.match(/\b\d{2}-\d{4}(?:\s*(?:TCX|TPX|TPG|C|U))?\b/gi) || [];
  return uniq(values.map((value) => value.toLocaleUpperCase("tr-TR")), 50);
}

function quotedText(source: string) {
  const result: string[] = [];
  const rx = /["“”'‘’]([^"“”'‘’\r\n]{2,160})["“”'‘’]/g;
  for (const match of source.matchAll(rx)) result.push(match[1]);
  const uppercase = source.match(/\b[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9 '&!?.-]{3,60}\b/g) || [];
  return uniq([...result, ...uppercase], 30);
}

function matchLexicon(source: string, entries: Array<[string, RegExp]>, limit = 30) {
  return uniq(entries.filter(([, rx]) => rx.test(source)).map(([label]) => label), limit);
}

const CHARACTER_LEXICON: Array<[string, RegExp]> = [
  ["Garfield", /\bgarfield\b/i],
  ["Mickey Mouse", /\bmickey\b/i],
  ["Minnie Mouse", /\bminnie\b/i],
  ["Hello Kitty", /\bhello\s+kitty\b/i],
  ["Stitch", /\bstitch\b/i],
  ["Snoopy", /\bsnoopy\b/i],
  ["Winnie the Pooh", /\bwinnie|pooh\b/i],
  ["Tweety", /\btweety\b/i],
  ["Spider-Man", /\bspider[- ]?man\b/i],
  ["Batman", /\bbatman\b/i],
  ["Superman", /\bsuperman\b/i],
  ["Marvel", /\bmarvel\b/i],
  ["Sonic", /\bsonic\b/i],
  ["Barbie", /\bbarbie\b/i],
  ["Tom ve Jerry", /\btom\s+(?:and|ve|&)\s+jerry\b/i],
  ["Looney Tunes", /\blooney\s+tunes\b/i],
  ["Disney", /\bdisney\b/i],
];

const THEME_LEXICON: Array<[string, RegExp]> = [
  ["kedi", /\bkedi\b/i], ["köpek", /\bköpek\b/i], ["ayı", /\bayı\b/i],
  ["tavşan", /\btavşan\b/i], ["fare", /\bfare\b/i], ["kuş", /\bkuş\b/i],
  ["çiçek", /\bçiçek\b/i], ["meyve", /\bmeyve\b/i], ["çilek", /\bçilek\b/i],
  ["kelebek", /\bkelebek\b/i], ["yıldız", /\byıldız\b/i], ["kalp", /\bkalp\b/i],
  ["gökkuşağı", /\bgökkuşağı\b/i], ["bulut", /\bbulut\b/i], ["araba", /\baraba\b/i],
  ["spor", /\bspor\b/i], ["futbol", /\bfutbol\b/i], ["basketbol", /\bbasketbol\b/i],
  ["tipografi", /\btipografi|yazı tasarımı\b/i], ["çizgi film", /\bçizgi film|karikatür\b/i],
  ["çocuk", /\bçocuk\b/i], ["retro", /\bretro\b/i], ["vintage", /\bvintage\b/i],
  ["şehir", /\bşehir\b/i], ["Los Angeles", /\blos\s+angeles\b/i],
];

const SHAPE_LEXICON: Array<[string, RegExp]> = [
  ["kalp", /\bkalp\b/i], ["yıldız", /\byıldız\b/i], ["daire", /\bdaire\b/i],
  ["kare", /\bkare\b/i], ["üçgen", /\büçgen\b/i], ["çiçek", /\bçiçek\b/i],
  ["bulut", /\bbulut\b/i], ["gökkuşağı", /\bgökkuşağı\b/i],
];

const COLOR_LEXICON: Array<[string, RegExp]> = [
  ["beyaz", /\bbeyaz\b/i], ["siyah", /\bsiyah\b/i], ["kırmızı", /\bkırmızı\b/i],
  ["pembe", /\bpembe\b/i], ["mavi", /\bmavi\b/i], ["lacivert", /\blacivert\b/i],
  ["yeşil", /\byeşil\b/i], ["sarı", /\bsarı\b/i], ["turuncu", /\bturuncu\b/i],
  ["mor", /\bmor\b/i], ["kahverengi", /\bkahverengi\b/i], ["bej", /\bbej\b/i],
  ["ekru", /\bekru\b/i], ["gri", /\bgri\b/i], ["bordo", /\bbordo\b/i],
];

const STOP_WORDS = new Set(
  "bir bu şu ve veya ile için gibi olan olarak görsel görselde desen tasarım üzerinde altında üstünde yanında yer alıyor yer alan vardır bulunuyor bulunan renk renkli zemin arka plan ön arka model baskı figür resim görüntü ayrıca daha çok çoklu çeşitli bazı şekilde şeklinde the and with from image design print".split(" "),
);

function keywords(source: string) {
  const tokens = normalizeForSearch(source)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOP_WORDS.has(item) && !/^\d+$/.test(item));
  return uniq(tokens, 70);
}

function metadataFallback(model: Row, reason = "") {
  const base = modelText(model);
  const codes = pantones(base);
  return {
    pantoneCodes: codes,
    characters: [],
    themes: [],
    shapes: [],
    colors: [],
    writtenText: [],
    keywords: keywords(base),
    description: text(model.notes),
    summary: text(model.notes),
    searchText: normalizeForSearch(`${base} ${codes.join(" ")}`),
    analyzedAt: nowIso(),
    ocrStatus: "NO_IMAGE",
    visionStatus: "NO_IMAGE",
    analysisMode: "METADATA_FALLBACK",
    analysisVersion: ANALYSIS_VERSION,
    provider: "KYERP",
    note: reason || "Analiz edilecek görsel bulunamadı.",
  };
}

export function needsAiAnalysis(model: Row) {
  const analysis = model?.metadata?.analysis || {};
  return analysis.analysisMode !== ANALYSIS_MODE || Number(analysis.analysisVersion || 0) < ANALYSIS_VERSION;
}

export async function analyzeDesignWithAi(c: Context<AppEnv>, model: Row) {
  const asset = pickAsset(model);
  if (!asset?.storageKey) return metadataFallback(model);

  const ai = (c.env as any).AI;
  if (!ai?.toMarkdown) {
    return {
      ...metadataFallback(model, "Cloudflare Workers AI binding bulunamadı."),
      ocrStatus: "FAILED",
      visionStatus: "FAILED",
      analysisMode: "AI_UNAVAILABLE",
    };
  }

  const object = await c.env.FILES.get(text(asset.storageKey));
  if (!object) {
    return {
      ...metadataFallback(model, "R2 görseli bulunamadı."),
      ocrStatus: "FAILED",
      visionStatus: "FAILED",
      analysisMode: "R2_IMAGE_MISSING",
    };
  }

  try {
    const contentType = text(asset.contentType || object.httpMetadata?.contentType || "image/webp");
    const fileName = text(asset.fileName || asset.originalFileName) || `${text(model.modelName) || "desen"}${extFromType(contentType)}`;
    const buffer = await object.arrayBuffer();
    const converted = await ai.toMarkdown(
      {
        name: fileName,
        blob: new Blob([buffer], { type: contentType }),
      },
      {
        conversionOptions: {
          image: { descriptionLanguage: "tr" },
          output: { format: "text" },
        },
      },
    );
    const item = Array.isArray(converted) ? converted[0] : converted;
    if (!item || item.format === "error") {
      throw new Error(text(item?.error) || "Görsel analizi sonuç üretmedi.");
    }
    const description = text(item.data).slice(0, MAX_DESCRIPTION);
    if (!description) throw new Error("Görsel açıklaması boş döndü.");

    const combined = `${description}\n${modelText(model)}`;
    const codes = pantones(combined);
    const characters = matchLexicon(combined, CHARACTER_LEXICON);
    const themes = matchLexicon(combined, THEME_LEXICON);
    const shapes = matchLexicon(combined, SHAPE_LEXICON);
    const colors = matchLexicon(combined, COLOR_LEXICON);
    const visibleText = quotedText(description);
    const keyRows = keywords(combined);
    const searchText = normalizeForSearch(
      [combined, codes.join(" "), characters.join(" "), themes.join(" "), shapes.join(" "), colors.join(" "), visibleText.join(" "), keyRows.join(" ")].join(" "),
    );

    return {
      pantoneCodes: codes,
      characters,
      themes,
      shapes,
      colors,
      writtenText: visibleText,
      keywords: keyRows,
      description,
      summary: description.slice(0, 900),
      searchText,
      analyzedAt: nowIso(),
      ocrStatus: "COMPLETED",
      visionStatus: "COMPLETED",
      analysisMode: ANALYSIS_MODE,
      analysisVersion: ANALYSIS_VERSION,
      provider: "CLOUDFLARE_WORKERS_AI",
      sourceFileId: text(asset.id),
      sourceStorageKey: text(asset.storageKey),
      tokens: Number(item.tokens || 0),
      note: "Görsel OCR, nesne/figür açıklaması ve aranabilir desen indeksi otomatik üretildi.",
    };
  } catch (error) {
    const fallback = metadataFallback(model, error instanceof Error ? error.message : "Görsel analizi başarısız.");
    return {
      ...fallback,
      ocrStatus: "FAILED",
      visionStatus: "FAILED",
      analysisMode: "AI_FAILED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
