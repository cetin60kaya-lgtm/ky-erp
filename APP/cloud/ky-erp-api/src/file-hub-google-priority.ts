/**
 * Bir firmanın TEK ortak File Hub indeksinin tarama sırası.
 * Gerçek bölüm klasörü kullanıcıya göre değişebilir; e-Belge kökleri
 * yalnız bu firmanın D1 klasör atamalarından gelir. Fiziksel dosya taşımaz.
 * Stable Unicode casing avoids Turkish dotless-I changing KY-ISNET into a different key.
 */
const normalizeFolder = (input: unknown): string =>
  String(input ?? "").normalize("NFC").replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "").toLocaleLowerCase("en-US");

export function googleFolderScanPriority(input: unknown, preferredPaths: readonly string[] = []): number {
  const path = normalizeFolder(input);
  if (!path) return -100;
  for (const raw of preferredPaths) {
    const root = normalizeFolder(raw);
    if (!root) continue;
    if (path === root || path.startsWith(root + "/")) return -98;
    // Önce bağlı hedefin üst klasörüne ulaş, sonra onun alt ağacını tara.
    if (root.startsWith(path + "/")) return -97;
  }
  // Yalnız eski arşivler için geriye uyum; hiçbir firmaya sabit kök yolu yok.
  if (path === "ky-isnet-belgeler" || path.startsWith("ky-isnet-belgeler/")) return -96;
  if (path === "muhasebe/e-belgeler" || path.startsWith("muhasebe/e-belgeler/")) return -95;
  if (path === "görsel/2026" || path.startsWith("görsel/2026/")) return -90;
  if (path === "görsel") return -80;
  if (path === "yerleşim dosyaları" || path.startsWith("yerleşim dosyaları/")) return -70;
  if (path === "giden desenler" || path.startsWith("giden desenler/")) return -60;
  if (path.startsWith("görsel/")) return -50;
  if (path === "modeller" || path.startsWith("modeller/")) return 0;
  return 10;
}

export function prioritizeGoogleScanQueue<T extends {path?:unknown}>(queue: T[], preferredPaths: readonly string[] = []): T[] {
  // Array.sort stable: aynı öncelikteki sayfa imleçleri silinmez/atılmaz.
  return queue.sort((a,b)=>googleFolderScanPriority(a.path, preferredPaths)-googleFolderScanPriority(b.path, preferredPaths));
}
