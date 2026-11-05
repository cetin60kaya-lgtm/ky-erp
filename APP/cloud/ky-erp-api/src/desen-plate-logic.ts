/** Pure, conservative shared-screen/plate classification. Never changes PSD filenames or model identity. */
export type PlateSize = string; // Existing labels and any number of custom boy groups are valid.
export type PlateEntry = {
  modelId: string; sizeCode: PlateSize; sizeLabel: string; printArea: string;
};

export function canonicalPlateText(input: unknown): string {
  return String(input ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "I").replace(/[çÇ]/g, "C").replace(/[ğĞ]/g, "G")
    .replace(/[öÖ]/g, "O").replace(/[şŞ]/g, "S").replace(/[üÜ]/g, "U")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function suggestedPlateSizes(segment: string): {sizeCode: PlateSize; sizeLabel: string}[] {
  const normalized = " " + canonicalPlateText(segment) + " ";
  const clues: {sizeCode: PlateSize; sizeLabel: string}[] = [];
  const add = (sizeCode: string, sizeLabel: string) => {
    if (!clues.some(row => row.sizeCode === sizeCode)) clues.push({sizeCode,sizeLabel});
  };
  // A plate may have one, three, six or more independently named sizes.
  // Detect only explicit, delimited size tokens; a mere "3 BOY" is a count,
  // not proof that any specific 3 sizes are present.
  const list = String(segment).toUpperCase().replace(/(\\b(?:BOY|BEDEN|SIZE)\\b)/g, " ");
  // Multi-size lists must have explicit separators (XS/S/M) to avoid
  // accidentally treating ordinary model-name letters as garment sizes.
  for (const candidate of list.matchAll(/\\b(?:XS|S|M|L|XL|XXL|XXXL|[2-9]XL)(?:\\s*[/+,;]\\s*(?:XS|S|M|L|XL|XXL|XXXL|[2-9]XL))+\\b/g)) {
    for (const token of candidate[0].split(/\\s*[/+,;]\\s*/)) add(token === "XXL" ? "2XL" : token === "XXXL" ? "3XL" : token,token);
  }
  const numbered = /\\b(?:BOY|BEDEN)\\s*(\\d{1,3})\\b|\\b(\\d{1,3})\\s*(?:\\.|-)\\s*(?:BOY|BEDEN)\\b/g;
  for (const hit of normalized.matchAll(numbered)) {
    const n = hit[1] || hit[2];
    add("BOY_"+n, n+". boy");
  }
  if (clues.length) return clues;
  const small = /\\b(KUCUK|K BOY|K BEDEN|SMALL)\\b/.test(normalized);
  const large = /\\b(BUYUK|B BOY|B BEDEN|LARGE)\\b/.test(normalized);
  const pair = /\\b(K B|K VE B|KUCUK BUYUK|BUYUK KUCUK)\\s*(BOY|BEDEN)?\\b/.test(normalized);
  const one = /\\b(TEK BOY|TEK BEDEN|STANDART BOY|ONE SIZE)\\b/.test(normalized);
  if (pair || (small && large)) {
    add("SMALL","Küçük boy");
    add("LARGE","Büyük boy");
  } else if (small) add("SMALL","Küçük boy");
  else if (large) add("LARGE","Büyük boy");
  else if (one) add("ONE_SIZE","Tek boy");
  return clues.length ? clues : [{sizeCode:"UNSPECIFIED",sizeLabel:"Boy doğrulanmadı"}];
}

/** Size clues are advisory only. Filename may describe a combined placement differently. */
export function suggestPlateMembership(
  originalFileName: string,
  models: readonly {modelId: string; modelName: string}[],
): {modelId: string; sizeCode: PlateSize; sizeLabel: string; printArea: string; evidence: string}[] {
  const stem = String(originalFileName).replace(/\.(psd|psb|pdf|ai)$/i, "");
  const hay = " " + canonicalPlateText(stem) + " ";
  const found = models.map((model) => {
    const key = canonicalPlateText(model.modelName);
    const at = key ? hay.indexOf(" " + key + " ") : -1;
    return {...model, key, at: at < 0 ? -1 : at + 1};
  }).filter((row) => row.at >= 0).sort((a,b) => a.at-b.at || b.key.length-a.key.length);
  const matches: typeof found = [];
  for (const candidate of found) {
    if (matches.some((other) => candidate.at < other.at+other.key.length && other.at < candidate.at+candidate.key.length)) continue;
    matches.push(candidate);
  }
  const rows: ReturnType<typeof suggestPlateMembership> = [];
  matches.forEach((model, i) => {
    const start = model.at + model.key.length;
    const end = matches[i+1]?.at ?? hay.length;
    const segment = hay.slice(start, end);
    const area = /\b(ARKA|BACK)\b/.test(segment) ? "BACK"
      : /\b(ON|FRONT)\b/.test(segment) ? "FRONT" : "";
    for (const size of suggestedPlateSizes(segment)) {
      rows.push({modelId:model.modelId, ...size, printArea:area, evidence:"FILENAME_SUGGESTION"});
    }
  });
  return rows;
}

export function validatePlateEntries(
  raw: unknown,
): {ok: true; entries: PlateEntry[]} | {ok: false; error: string} {
  if (!Array.isArray(raw)) return {ok:false,error:"Kalıp boy satırları bir dizi olmalıdır."};
  // Safety bound is the request payload size, never a fixed number of sizes.
  if (JSON.stringify(raw).length > 256_000) return {ok:false,error:"Çok büyük eşleştirme isteği. Kaydı küçük partilerde düzenleyin."};
  const rows: PlateEntry[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") return {ok:false,error:"Kalıp satırı geçersiz."};
    const modelId = String(row.modelId ?? "").trim();
    const sizeCode = String(row.sizeCode ?? "").trim().toUpperCase() as PlateSize;
    const sizeLabel = String(row.sizeLabel ?? "").trim();
    const printArea = String(row.printArea ?? "").trim().toUpperCase();
    if (!/^[a-zA-Z0-9-]{8,90}$/.test(modelId) ||
        !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(sizeCode) ||
        !sizeLabel || sizeLabel.length > 80 ||
        printArea.length > 40 || !/^[A-Z0-9_]*$/.test(printArea))
      return {ok:false,error:"Model, boy veya baskı bölgesi bilgisi hatalı."};
    const id = [modelId,sizeCode,canonicalPlateText(sizeLabel),printArea].join("|");
    if (seen.has(id)) return {ok:false,error:"Aynı model ve boy kalıba iki defa eklenemez."};
    seen.add(id);
    rows.push({modelId,sizeCode,sizeLabel,printArea});
  }
  return {ok:true,entries:rows};
}

export function describeSharedPlate(entries: readonly PlateEntry[], modelId: string) {
  const groups = [...new Set(entries.filter(row=>row.modelId===modelId).map(row => row.sizeCode+"|"+canonicalPlateText(row.sizeLabel)))];
  return {modelSizeCount:groups.length, sharedModelCount:new Set(entries.map(row=>row.modelId)).size};
}
