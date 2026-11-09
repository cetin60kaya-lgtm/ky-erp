/**
 * Tek PSD/PSB dosyasinin birden fazla model, BOY ve baski bolgesine
 * baglanmasinin saf veri sozlesmesi. Beden etiketi kullanilmaz.
 * Dosya File Hub'da tek kalir; kartlar ayri iliskii kaydi tasir.
 */
export type PsdBoyCode = "KUCUK_BOY" | "BUYUK_BOY" | "OZEL_BOY";
export type PsdModelLink = {
  modelId: string;
  boyCode: PsdBoyCode;
  printAreaCode: string;
  boyLabel?: string;
};

const AREA_CODES = new Set([
  "FRONT", "BACK", "NECK", "NECK_LABEL", "LEFT_SLEEVE",
  "RIGHT_SLEEVE", "LEFT_LEG", "RIGHT_LEG", "POCKET",
  "COLLAR", "FRONT_HEM", "BACK_HEM", "HOOD",
  "SIDE_PANEL", "STRIP", "OTHER",
]);

const txt = (value: unknown) => value == null ? "" : String(value).trim();
const key = (value: unknown) => txt(value).toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
const boyOf = (value: unknown): PsdBoyCode | null => {
  const valueKey = key(value).replace(/[\s-]+/g, "_");
  if (["KUCUK_BOY", "K_BOY", "KUCUK"].includes(valueKey)) return "KUCUK_BOY";
  if (["BUYUK_BOY", "B_BOY", "BUYUK"].includes(valueKey)) return "BUYUK_BOY";
  if (["OZEL_BOY", "OZEL"].includes(valueKey)) return "OZEL_BOY";
  return null;
};

/** Kasti kullanici secimi disinda model ve boy tahminiyle kesin bag kurma. */
export function normalizePsdModelLinks(raw: unknown): PsdModelLink[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 30) {
    throw new Error("1-30 arasi model, boy ve baski bolgesi secilmelidir.");
  }
  const result: PsdModelLink[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Her baglanti icin model ve boy secimi zorunludur.");
    }
    const item = value as Record<string, unknown>;
    const modelId = txt(item.modelId);
    if (!/^[a-zA-Z0-9_-]{2,100}$/.test(modelId)) {
      throw new Error("Gecerli model kimligi secilmelidir.");
    }
    const boyCode = boyOf(item.boyCode);
    if (!boyCode) throw new Error("Kucuk Boy, Buyuk Boy veya Ozel Boy secilmelidir.");
    const printAreaCode = key(item.printAreaCode);
    if (!AREA_CODES.has(printAreaCode)) {
      throw new Error("Gecerli baski bolgesi secilmelidir.");
    }
    const boyLabel = txt(item.boyLabel).slice(0, 80);
    if (boyCode === "OZEL_BOY" && !boyLabel) {
      throw new Error("Ozel Boy icin aciklama zorunludur.");
    }
    const itemKey = [modelId, boyCode, printAreaCode, boyLabel].join("|");
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    result.push({
      modelId, boyCode, printAreaCode,
      ...(boyLabel ? { boyLabel } : {}),
    });
  }
  return result;
}

export function mergePsdModelMetadata(metadata: unknown, additions: PsdModelLink[]) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown> : {};
  const existing = Array.isArray(source.placements) ? source.placements : [];
  const placements: Array<Omit<PsdModelLink, "modelId">> = [];
  const seen = new Set<string>();
  for (const row of [...existing, ...additions]) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const candidate = row as Record<string, unknown>;
    const boyCode = boyOf(candidate.boyCode);
    const printAreaCode = key(candidate.printAreaCode);
    if (!boyCode || !AREA_CODES.has(printAreaCode)) continue;
    const boyLabel = txt(candidate.boyLabel).slice(0, 80);
    if (boyCode === "OZEL_BOY" && !boyLabel) continue;
    const duplicateKey = [boyCode, printAreaCode, boyLabel].join("|");
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);
    placements.push({ boyCode, printAreaCode, ...(boyLabel ? { boyLabel } : {}) });
  }
  return { ...source, placements, relationVersion: 1 };
}
