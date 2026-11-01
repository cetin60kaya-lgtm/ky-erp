// Mail & Dosyalar: tek File Hub kimliğini farklı günlük görünümlerde kullanır.
export const FILE_TABS = new Set(["drive-dosyalar", "drive-son-kullanilanlar", "drive-firma-dosyalari"]);

export function fileName(row) {
  return String(row?.file_name || row?.fileName || "İsimsiz dosya");
}
export function fileSize(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "—";
  return size < 1024 ? size + " B" : size < 1024 * 1024 ? (size / 1024).toFixed(1) + " KB" : (size / (1024 * 1024)).toFixed(1) + " MB";
}
export function filePreviewType(row) {
  const mime = String(row?.mime_type || row?.mimeType || "").toLowerCase();
  const ext = fileName(row).split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || /^image\/(png|jpeg|webp|gif)$/.test(mime)) return "image";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["txt", "csv", "json", "xml", "md"].includes(ext) || mime.startsWith("text/")) return "text";
  return "download";
}
export function fileViewTitle(tab) {
  if (tab === "drive-firma-dosyalari") return "ERP ile İlişkili Firma Dosyaları";
  if (tab === "drive-son-kullanilanlar") return "Son Açılan Dosyalar";
  return "Dosya Gezgini";
}
export function fileScope(tab) {
  return tab === "drive-firma-dosyalari" ? "related" : "all";
}
export function recentFileIds(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string" && id.length > 0).slice(0, 30) : [];
  } catch { return []; }
}
export function recordRecentFile(storage, key, fileId) {
  if (!fileId) return [];
  const next = [String(fileId), ...recentFileIds(storage, key).filter((id) => id !== String(fileId))].slice(0, 30);
  try { storage?.setItem(key, JSON.stringify(next)); } catch { /* local browser history is optional */ }
  return next;
}
export function visibleCommunicationFiles(files, activeTab, recentIds = []) {
  const all = Array.isArray(files) ? files : [];
  if (activeTab !== "drive-son-kullanilanlar") return all;
  const byId = new Map(all.map((file) => [String(file.id), file]));
  return recentIds.map((id) => byId.get(id)).filter(Boolean);
}
