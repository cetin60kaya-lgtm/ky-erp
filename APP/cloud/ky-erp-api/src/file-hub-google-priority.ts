/**
 * Ayni Google Drive tenant'inda once guncel isletme belgeleri, sonra tarihsel
 * arsiv taranir. Bu sira yalniz tarama onceligidir; dosya tasima/silme yapmaz.
 */
export function googleFolderScanPriority(input: unknown): number {
  const path = String(input ?? "").normalize("NFC").replace(/\\/g,"/").replace(/^\/+|\/+$/g,"").toLocaleLowerCase("tr-TR");
  if (!path) return -100;
  if (path === "görsel/2026" || path.startsWith("görsel/2026/")) return -90;
  if (path === "görsel") return -80;
  if (path === "yerleşim dosyaları" || path.startsWith("yerleşim dosyaları/")) return -70;
  if (path === "giden desenler" || path.startsWith("giden desenler/")) return -60;
  if (path.startsWith("görsel/")) return -50;
  if (path === "modeller" || path.startsWith("modeller/")) return 0;
  return 10;
}

export function prioritizeGoogleScanQueue<T extends {path?:unknown}>(queue: T[]): T[] {
  return queue.sort((a,b)=>googleFolderScanPriority(a.path)-googleFolderScanPriority(b.path));
}
