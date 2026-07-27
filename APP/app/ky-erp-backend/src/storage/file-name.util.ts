import * as path from "path";

function normalizeTurkish(value: string) {
  return value
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c");
}

export function sanitizeFileName(fileName: string) {
  const parsed = path.parse(String(fileName || "").trim());
  const normalizedName = normalizeTurkish(parsed.name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 120);
  const normalizedExt = normalizeTurkish(parsed.ext || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^.a-z0-9]+/g, "");
  const safeBaseName = normalizedName || "dosya";
  return `${safeBaseName}${normalizedExt}`;
}

export function uniqueStoredFileName(fileName: string, fileHash?: string) {
  const sanitized = sanitizeFileName(fileName);
  const parsed = path.parse(sanitized);
  const hashSuffix = String(fileHash || "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-f0-9]+/g, "")
    .slice(0, 12);
  const suffix = hashSuffix || Date.now().toString(36);
  const safeBaseName = (parsed.name || "dosya")
    .replace(/[-._]+$/g, "")
    .slice(0, 80);
  return `${safeBaseName}-${suffix}${parsed.ext.toLocaleLowerCase("tr-TR")}`;
}
