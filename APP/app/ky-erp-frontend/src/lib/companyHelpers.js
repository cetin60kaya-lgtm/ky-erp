import {
  filterByActiveCompany,
  injectCompanyCode,
} from "../context/ActiveCompanyContext";

export function getFilteredByCompany(rows, activeCompanyCode) {
  return filterByActiveCompany(rows, activeCompanyCode);
}

export function withActiveCompany(payload, activeCompanyCode) {
  return injectCompanyCode(payload, activeCompanyCode);
}

export function normalizeCompanyText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("tr-TR");
}

export function getSelectableCompanies(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(
      (item) =>
        item &&
        item?.hiddenFromMainList !== true &&
        item?.isAliasMerged !== true &&
        item?.aktif !== false,
    )
    .sort((a, b) => {
      if (Boolean(a.favori) !== Boolean(b.favori)) return a.favori ? -1 : 1;
      return String(a.firma || "").localeCompare(String(b.firma || ""), "tr", {
        sensitivity: "base",
      });
    });
}

export function findCompanyByName(rows, value) {
  const normalized = normalizeCompanyText(value);
  if (!normalized) return null;
  return (
    (Array.isArray(rows) ? rows : []).find(
      (item) => normalizeCompanyText(item?.firma) === normalized,
    ) || null
  );
}

export function filterCompaniesByQuery(rows, query) {
  const selectable = getSelectableCompanies(rows);
  const normalizedQuery = String(query || "")
    .trim()
    .toLocaleLowerCase("tr-TR");
  if (!normalizedQuery) return selectable;
  return selectable.filter((item) =>
    String(item?.firma || "")
      .toLocaleLowerCase("tr-TR")
      .includes(normalizedQuery),
  );
}

/**
 * Fuzzy/best-effort company matching.
 * Tries exact match first, then partial, then contains.
 * Useful for PDF-extracted company names that may be abbreviated.
 */
export function findBestCompanyMatch(rows, value) {
  const selectable = getSelectableCompanies(rows);
  if (!value || !selectable.length) return null;

  const queryNorm = normalizeCompanyText(value);

  // 1. Exact match (normalized)
  const exactMatch = selectable.find(
    (item) => normalizeCompanyText(item?.firma) === queryNorm,
  );
  if (exactMatch) return exactMatch;

  // 2. Starts with match
  const startsWithMatch = selectable.find((item) =>
    normalizeCompanyText(item?.firma).startsWith(queryNorm),
  );
  if (startsWithMatch) return startsWithMatch;

  // 3. Contains match - query is contained in company name (e.g. "TAHA" in "TAHA GİYİM SAN. VE TİC")
  const containsMatch = selectable.find((item) =>
    normalizeCompanyText(item?.firma).includes(queryNorm),
  );
  if (containsMatch) return containsMatch;

  // 4. Reverse contains - company name is contained in query (e.g. PDF says "TAHA GİYİM..." and firm card says "TAHA")
  const reverseMatch = selectable.find(
    (item) =>
      normalizeCompanyText(item?.firma).length > 2 &&
      queryNorm.includes(normalizeCompanyText(item?.firma)),
  );
  if (reverseMatch) return reverseMatch;

  // No match found
  return null;
}
