export const DEFAULT_PRODUCTION_REGIONS = Object.freeze([
  "Ön", "Arka", "Kol", "Sağ Kol", "Sol Kol", "Yan", "Ön + Arka", "Kol + Arka",
]);
const text = (value) => String(value ?? "").trim();
const norm = (value) => text(value).toLocaleUpperCase("tr-TR");
export function availableProductionRegions(model) {
  const fromModel = (model?.printRegions || [])
    .map((region) => text(typeof region === "string" ? region : region.regionName || region.name || region.printAreaName))
    .filter(Boolean);
  // Modelin Desen kartında belirli bölgeler varsa başka baskı bölgesi teklif etme.
  // Sadece bölge tanımı hiç yoksa genel üretim bölgeleri kullanılabilir.
  return [...new Set(fromModel.length ? fromModel : DEFAULT_PRODUCTION_REGIONS)];
}
export function filterProductionModels(models, query, limit = 9) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const matches = (Array.isArray(models) ? models : []).filter((model) => {
    if (!model || model.isVirtual) return false;
    const source = norm([model.id, model.modelId, model.modelName, model.modelAdi, model.modelCode, model.companyName, model.companyId].join(" "));
    return words.every((word) => source.includes(word));
  });
  matches.sort((a, b) => {
    const aName = norm(a.modelName || a.modelAdi);
    const bName = norm(b.modelName || b.modelAdi);
    const q = norm(query);
    const aRank = norm(a.id || a.modelId) === q ? -1 : aName === q ? 0 : aName.startsWith(q) ? 1 : 2;
    const bRank = norm(b.id || b.modelId) === q ? -1 : bName === q ? 0 : bName.startsWith(q) ? 1 : 2;
    return aRank - bRank || aName.localeCompare(bName, "tr-TR");
  });
  return matches.slice(0, Math.max(0, limit));
}
export function productionLineNet(row) {
  return Number(row?.quantity || 0) - Number(row?.printDefectQty || 0) - Number(row?.fabricDefectQty || 0);
}
