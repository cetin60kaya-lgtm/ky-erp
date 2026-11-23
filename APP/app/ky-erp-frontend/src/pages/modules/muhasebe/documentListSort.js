// All Muhasebe document tables share e-Belge server-side ordering.
const allowed = new Set(["DATE", "DOCUMENT_NO", "PARTY", "SOURCE", "TOTAL", "STATUS"]);
export const DEFAULT_DOCUMENT_SORT = Object.freeze({ sortBy: "DATE", sortDirection: "DESC" });
export function nextDocumentSort(current, key) {
  const column = String(key || "").toUpperCase();
  if (!allowed.has(column)) return DEFAULT_DOCUMENT_SORT;
  if (current?.sortBy === column) return { sortBy: column,
    sortDirection: current.sortDirection === "ASC" ? "DESC" : "ASC" };
  return { sortBy: column, sortDirection: ["DATE", "TOTAL"].includes(column) ? "DESC" : "ASC" };
}
