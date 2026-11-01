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
  MODEL_SOURCE: ["PSD", "PSB", "AI", "PDF", "TIF", "TIFF", "SVG", "EPS"],
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
