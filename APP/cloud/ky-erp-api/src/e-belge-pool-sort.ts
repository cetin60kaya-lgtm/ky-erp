// Canonical e-Belge pool ordering. Never concatenate untrusted query values into SQL.
const SORT_COLUMNS: Record<string, string> = {
  DATE: "COALESCE(d.issue_date,d.created_at)",
  DOCUMENT_NO: "COALESCE(d.document_no,'') COLLATE NOCASE",
  PARTY: "COALESCE(d.party_name,'') COLLATE NOCASE",
  SOURCE: "COALESCE(d.source_type,'') COLLATE NOCASE",
  TOTAL: "COALESCE(d.payable_total,0)",
  STATUS: "COALESCE(d.status,'') COLLATE NOCASE",
};

export function eBelgePoolOrderBy(sortBy: unknown, sortDirection: unknown): string {
  const key = String(sortBy || "DATE").trim().toUpperCase();
  const column = Object.prototype.hasOwnProperty.call(SORT_COLUMNS, key)
    ? SORT_COLUMNS[key]
    : SORT_COLUMNS.DATE;
  const direction = String(sortDirection || "").toUpperCase() === "ASC" ? "ASC" : "DESC";
  // Tie-breaker guarantees stable page traversal with same date, total, or name.
  return `${column} ${direction}, d.id DESC`;
}
