const MECIT_HAKAN_ALIASES = new Set([
  "mecit-hakan",
  "main-mecit-hakan",
  "mecit-hakan-gursu",
  "hakan-baski",
  "main-hakan",
  "main-hakan-baski",
  "hkn-baski",
]);

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

export function canonicalCompanySlug(value) {
  const candidate = value && typeof value === "object"
    ? value.slug || value.mainCompanySlug || value.id || value.mainCompanyId
    : value;
  const slug = normalized(candidate);
  return MECIT_HAKAN_ALIASES.has(slug) ? "mecit-hakan" : slug;
}

export function resolveCompanyIdentity(value = {}) {
  const source = value && typeof value === "object" ? value : { slug: value };
  const slug = canonicalCompanySlug(source);
  const rawId = String(source.id || source.mainCompanyId || "").trim();
  return {
    mainCompanyId: slug === "mecit-hakan" ? "main-mecit-hakan" : rawId || slug,
    mainCompanySlug: slug,
  };
}
