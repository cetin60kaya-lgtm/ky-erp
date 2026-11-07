/**
 * Drive dosyalarini canonical model kartina baglamak icin guvenli ve test edilebilir karar.
 * Genel firma koku, GENEL/IK/muhasebe klasorleri veya uzantisi uymayan dosyalar
 * DESEN model kaydi olusturamaz.
 */
export type CloudModelBinding = {
  module_code: string;
  purpose_code: string;
  root_path: string | null;
};

const extensionsByPurpose: Readonly<Record<string, readonly string[]>> = Object.freeze({
  MODEL_IMAGE: ["JPG", "JPEG", "PNG", "WEBP"],
  MODEL_SOURCE: ["PSD", "PSB", "AI", "PDF", "TIF", "TIFF", "SVG", "EPS", "JPG", "JPEG", "PNG", "WEBP"],
  PLACEMENT: ["AI", "PDF", "PSD", "PSB", "SVG", "EPS"],
  OUTGOING_DESIGN: ["AI", "PDF", "PSD", "PSB", "SVG", "EPS", "JPG", "JPEG", "PNG"],
  RIP_PDF: ["PDF"],
});

export function normalizeFileHubFolder(value: unknown): string {
  return String(value ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLocaleLowerCase("tr-TR");
}

export function canUseModelImageFolder(rootPath: unknown): boolean {
  return normalizeFileHubFolder(rootPath).length > 0;
}

export function selectCloudModelBinding(
  bindings: readonly CloudModelBinding[],
  relativePath: string,
  fileName: string,
): CloudModelBinding | null {
  const filePath = normalizeFileHubFolder(relativePath);
  const extension = String(fileName ?? "").split(".").pop()?.toUpperCase() ?? "";
  const modules = new Set(["DESEN", "DTF", "IMALAT"]);
  const matching = bindings.filter((row) => {
    if (!modules.has(String(row.module_code ?? "").toUpperCase())) return false;
    const root = normalizeFileHubFolder(row.root_path);
    if (!root || !(filePath === root || filePath.startsWith(root + "/"))) return false;
    const supported = extensionsByPurpose[String(row.purpose_code ?? "").toUpperCase()];
    return Boolean(supported && supported.includes(extension));
  });
  matching.sort((a,b) => normalizeFileHubFolder(b.root_path).length - normalizeFileHubFolder(a.root_path).length);
  return matching[0] ?? null;
}


/**
 * Dosya adı tek başına model değildir. Önce doğrulanmış klasör yolunu inceler,
 * ardından var olan model adlarını okur. Fiziksel dosyayı taşımaz veya yeni
 * model üretmez. Çoklu model PSD'leri ayrı ilişkiler olarak korunabilir.
 */
export function normalizeDesignModelKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "I").replace(/[çÇ]/g, "C")
    .replace(/[ğĞ]/g, "G").replace(/[öÖ]/g, "O")
    .replace(/[şŞ]/g, "S").replace(/[üÜ]/g, "U")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function classifyDesignSourcePath(
  binding: CloudModelBinding,
  relativePath: string,
): { purposeCode: string; folderModelName: string; isDtf: boolean } {
  const root = normalizeFileHubFolder(binding.root_path);
  const path = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const normalizedPath = normalizeFileHubFolder(path);
  const remainder = normalizedPath.startsWith(root + "/")
    ? path.slice(root.length + 1)
    : "";
  const parts = remainder.split("/").filter(Boolean);
  const firstFolder = parts.length > 1 ? parts[0].trim() : "";
  const isModelFolder = String(binding.purpose_code || "").toUpperCase() === "MODEL_SOURCE";
  const isDtf = isModelFolder && /(?:\s|[-_])DTF$/i.test(firstFolder);
  const folderModelName = isModelFolder
    ? firstFolder.replace(/(?:\s|[-_])DTF$/i, "").trim()
    : "";
  return {
    purposeCode: isDtf && /\.PDF$/i.test(path) ? "RIP_PDF" : String(binding.purpose_code || "").toUpperCase(),
    folderModelName,
    isDtf,
  };
}

/**
 * Sonradan eklenen Drive RGB görselleri yalnız mevcut, görseli boş TEKİL model
 * kartına bağlanabilir. Aynı isimli iki model veya daha önce atanmış önizleme
 * varsa yeni model açma ve mevcut görselin üzerine yazma.
 */
export function findUniqueMissingDesignImageModel(
  records: readonly {
    id?: unknown; model_name?: unknown; model_code?: unknown;
    image_url?: unknown; deleted_at?: unknown;
  }[],
  fileName: string,
): string | null {
  if (!/\.(jpe?g|png|webp)$/i.test(fileName)) return null;
  const key = normalizeDesignModelKey(fileName.replace(/\.[^.]+$/, ""));
  if (!key) return null;
  const ids = new Set<string>();
  for (const row of records) {
    const id = String(row?.id ?? "").trim();
    if (!id || String(row?.deleted_at ?? "").trim() || String(row?.image_url ?? "").trim()) continue;
    const modelName = normalizeDesignModelKey(row.model_name);
    const modelCode = normalizeDesignModelKey(row.model_code);
    if (key === modelName || key === modelCode) ids.add(id);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

/** Yalnız mevcut model sözlüğündeki kesin adları seç; hiçbir parçadan yeni model uydurma. */
export function matchExistingDesignModelNames(
  knownNames: readonly string[],
  sourceName: string,
  options: { multi?: boolean } = {},
): string[] {
  const stem = String(sourceName || "").replace(/\.[^.]+$/, "");
  const haystack = " " + normalizeDesignModelKey(stem) + " ";
  const candidates = [...new Set(knownNames.map((value) => String(value || "").trim()).filter(Boolean))]
    .map((name) => ({ name, key: normalizeDesignModelKey(name) }))
    .filter((row) => row.key && (row.key.length >= 4 || haystack.trim() === row.key))
    .sort((a, b) => b.key.length - a.key.length || a.name.localeCompare(b.name, "tr"));
  const used: Array<[number, number]> = [];
  const result: string[] = [];
  for (const candidate of candidates) {
    const match = " " + candidate.key + " ";
    const at = haystack.indexOf(match);
    if (at < 0) continue;
    const from = at + 1, to = from + candidate.key.length;
    if (used.some(([start, end]) => from < end && to > start)) continue;
    used.push([from, to]);
    result.push(candidate.name);
    if (!options.multi) break;
  }
  return result;
}
