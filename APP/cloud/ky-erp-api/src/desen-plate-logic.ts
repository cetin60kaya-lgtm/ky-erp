/** Pure, conservative shared-screen/plate classification. Never changes PSD filenames or model identity. */
export type PlateSize = "SMALL" | "LARGE" | "ONE_SIZE" | "UNSPECIFIED";
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
  const small = /\b(KUCUK|K BOY|K BEDEN|SMALL|XS S|XS S M)\b/.test(normalized);
  const large = /\b(BUYUK|B BOY|B BEDEN|LARGE|M 3XL|L 3XL|XL 3XL)\b/.test(normalized);
  const pair = /\b(K B|K VE B|KUCUK BUYUK|BUYUK KUCUK)\s*(BOY|BEDEN)?\b/.test(normalized);
  const one = /\b(TEK BOY|TEK BEDEN|STANDART BOY|ONE SIZE)\b/.test(normalized);
  if (pair || (small && large)) return [
    {sizeCode:"SMALL",sizeLabel:"Küçük boy"},
    {sizeCode:"LARGE",sizeLabel:"Büyük boy"},
  ];
  if (small) return [{sizeCode:"SMALL",sizeLabel:"Küçük boy"}];
  if (large) return [{sizeCode:"LARGE",sizeLabel:"Büyük boy"}];
  if (one) return [{sizeCode:"ONE_SIZE",sizeLabel:"Tek boy"}];
  return [{sizeCode:"UNSPECIFIED",sizeLabel:"Boy belirtilmemiş"}];
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
  if (!Array.isArray(raw) || raw.length > 60) return {ok:false,error:"En çok 60 model/boy satırı girilebilir."};
  const rows: PlateEntry[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") return {ok:false,error:"Kalıp satırı geçersiz."};
    const modelId = String(row.modelId ?? "").trim();
    const sizeCode = String(row.sizeCode ?? "").trim().toUpperCase() as PlateSize;
    const sizeLabel = String(row.sizeLabel ?? "").trim();
    const printArea = String(row.printArea ?? "").trim().toUpperCase();
    if (!/^[a-zA-Z0-9-]{8,90}$/.test(modelId) ||
        !["SMALL","LARGE","ONE_SIZE","UNSPECIFIED"].includes(sizeCode) ||
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
