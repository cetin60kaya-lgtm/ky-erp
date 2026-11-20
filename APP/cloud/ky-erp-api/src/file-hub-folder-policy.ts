/** Firma köküne GÖRE göreli yol. Fiziksel dosyaya veya cihaza doğrudan müdahale etmez. */
export function normalizeFileHubBindingPath(value: unknown): string {
  const raw = String(value ?? "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.includes("\0") || raw.includes("?") || raw.includes("#"))
    throw new Error("Güvensiz veya mutlak klasör yolu.");
  const segments = raw.split("/").filter((segment) => segment.length > 0);
  if (segments.length > 32 || segments.some((p) => p === "." || p === ".." || p.trim() !== p || p.includes(":")))
    throw new Error("Klasör yolu firma kökünün dışına çıkamaz.");
  const result = segments.join("/");
  if (result.length > 600) throw new Error("Klasör yolu çok uzun.");
  return result;
}
export function normalizeFileHubRouteCode(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase().replace(/İ/g, "I");
  if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(code)) throw new Error("Geçersiz bölüm veya dosya amacı.");
  return code;
}
export function normalizeFileHubPriority(value: unknown): number {
  const priority = Number(value ?? 100);
  if (!Number.isInteger(priority) || priority < 0 || priority > 9999)
    throw new Error("Öncelik 0 ile 9999 arasında tam sayı olmalı.");
  return priority;
}
/** Fiziksel kopyalama yoktur: aynı firma+bağlantı+yol ikinci kez bağlanamaz. */
export function fileHubBindingKey(row: {main_company_slug?:unknown; module_code?:unknown; purpose_code?:unknown; storage_connection_id?:unknown; root_path?:unknown}): string {
  return [row.main_company_slug,row.module_code,row.purpose_code,row.storage_connection_id,
    normalizeFileHubBindingPath(row.root_path).toLocaleLowerCase("tr-TR")].map((x)=>String(x??"").trim()).join("|");
}
