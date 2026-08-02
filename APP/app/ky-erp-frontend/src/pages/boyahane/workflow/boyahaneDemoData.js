const now = new Date();
const iso = (hoursAgo = 0) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();

function svgThumb(title, accent = "#1769e0", secondary = "#10233f") {
  const safe = String(title || "MODEL").replace(/[<>&]/g, "").slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${secondary}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="900" height="1100" fill="#f6f8fc"/><rect x="70" y="70" width="760" height="820" rx="44" fill="url(#g)"/><circle cx="450" cy="360" r="190" fill="#fff" opacity=".13"/><path d="M270 600c75-180 285-180 360 0-40 135-95 225-180 225s-140-90-180-225Z" fill="#fff" opacity=".92"/><path d="M330 360c30-120 210-120 240 0-45 80-75 120-120 120s-75-40-120-120Z" fill="${accent}"/><text x="450" y="960" text-anchor="middle" font-family="Arial" font-size="68" font-weight="700" fill="${secondary}">${safe}</text><text x="450" y="1020" text-anchor="middle" font-family="Arial" font-size="28" fill="#667085">HAKAN EMPRİME BOYAHANE</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export const DEMO_PRODUCTS = [
  { id: "demo-product-clear", productName: "S 10 CLEAR", tradeName: "Clear Base 10", code: "S10", supplierName: "URAS", dyeType: "Su Bazlı", approvalStatus: "APPROVED", currentPrice: 3.2, currency: "USD", minimumStockKg: 10, documents: [{ name: "MSDS", status: "VALID" }, { name: "TDS", status: "VALID" }, { name: "ZDHC", status: "VALID" }] },
  { id: "demo-product-white", productName: "S 20 WHITE", tradeName: "White Base 20", code: "S20", supplierName: "URAS", dyeType: "Su Bazlı", approvalStatus: "APPROVED", currentPrice: 3.85, currency: "USD", minimumStockKg: 12, documents: [{ name: "MSDS", status: "VALID" }, { name: "TDS", status: "VALID" }, { name: "LCW", status: "VALID" }] },
  { id: "demo-product-red", productName: "KIRMIZI PİGMENT", tradeName: "Red KBT 1663", code: "KBT-R", supplierName: "KBT", dyeType: "Pigment", approvalStatus: "APPROVED", currentPrice: 12.4, currency: "USD", minimumStockKg: 3, documents: [{ name: "MSDS", status: "VALID" }, { name: "SVL", status: "VALID" }] },
  { id: "demo-product-blue", productName: "MAVİ PİGMENT", tradeName: "Blue KBT 4151", code: "KBT-B", supplierName: "KBT", dyeType: "Pigment", approvalStatus: "REVIEW_REQUIRED", currentPrice: 11.9, currency: "USD", minimumStockKg: 3, documents: [{ name: "MSDS", status: "VALID" }, { name: "TDS", status: "WAITING" }] },
  { id: "demo-product-fix", productName: "FİKSATÖR", tradeName: "Fix 90", code: "FIX90", supplierName: "URAS", dyeType: "Katkı", approvalStatus: "APPROVED", currentPrice: 4.15, currency: "EUR", minimumStockKg: 5, documents: [{ name: "MSDS", status: "VALID" }, { name: "TDS", status: "VALID" }] },
];

export const DEMO_LOTS = [
  { id: "demo-lot-clear", inventoryId: "demo-product-clear", productId: "demo-product-clear", productName: "S 10 CLEAR", lotNo: "260105001", supplierName: "URAS", entryKg: 25, usedKg: 18.5, remainingKg: 6.5, entryDate: iso(240), usageStartedAt: iso(220), status: "AVAILABLE", isDefault: true, source: "MUHASEBE", invoiceNo: "URS202600000051" },
  { id: "demo-lot-white", inventoryId: "demo-product-white", productId: "demo-product-white", productName: "S 20 WHITE", lotNo: "260105200", supplierName: "URAS", entryKg: 25, usedKg: 8.2, remainingKg: 16.8, entryDate: iso(210), usageStartedAt: iso(200), status: "AVAILABLE", isDefault: true, source: "MUHASEBE", invoiceNo: "URS202600000052" },
  { id: "demo-lot-red", inventoryId: "demo-product-red", productId: "demo-product-red", productName: "KIRMIZI PİGMENT", lotNo: "260106093", supplierName: "KBT", entryKg: 5, usedKg: 1.4, remainingKg: 3.6, entryDate: iso(180), usageStartedAt: iso(170), status: "AVAILABLE", isDefault: true, source: "HIZLI_LOT" },
  { id: "demo-lot-old", inventoryId: "demo-product-clear", productId: "demo-product-clear", productName: "S 10 CLEAR", lotNo: "251220014", supplierName: "URAS", entryKg: 25, usedKg: 25, remainingKg: 0, entryDate: iso(900), usageStartedAt: iso(880), usageEndedAt: iso(300), status: "DEPLETED", isDefault: false, source: "MUHASEBE" },
  { id: "demo-lot-waiting", inventoryId: "demo-product-blue", productId: "demo-product-blue", productName: "MAVİ PİGMENT", lotNo: "", supplierName: "KBT", entryKg: 5, usedKg: 0, remainingKg: 5, entryDate: iso(8), status: "LOT_WAITING", isDefault: false, source: "MUHASEBE", invoiceNo: "KBT202600000144", documentNo: "KBT202600000144" },
];

const sonicImage = svgThumb("SONIC 19", "#1463e8", "#07185f");
const safariImage = svgThumb("SAFARİ", "#d71d3f", "#481020");
const openedImage = svgThumb("X-OPENED", "#efb21a", "#4d3510");
const mestunImage = svgThumb("MESTUN", "#149160", "#0a3f2c");
const mervodImage = svgThumb("MERVOD", "#7d4ac7", "#301756");

function jobColor(id, colorName, pantone, status, plannedKg, registeredColorId, extra = {}) {
  return { id, colorName, pantone, paintType: "SUBAZLI", status, plannedKg, registeredColorId, moldCount: 1, ...extra };
}

export const DEMO_JOBS = [
  { id: "sample-demo-sonic", designId: "design-sonic", jobType: "SAMPLE", workflowType: "SAMPLE", status: "WAITING", priority: "HIGH", modelName: "SONIC 19", companyName: "TAHA GİYİM", orderNo: "SP-2608-014", imageUrl: sonicImage, channelCount: 11, uniqueColorCount: 11, createdAt: iso(3), updatedAt: iso(2), lastActor: "Ali", colors: [jobColor("sample-sonic-red", "Kırmızı", "18-1663", "WAITING", 0.25, "color-red"), jobColor("sample-sonic-blue", "Saks", "19-4151", "WAITING", 0.25, "color-blue"), jobColor("sample-sonic-ten", "Ten", "13-1030", "WAITING", 0.25, "color-ten")] },
  { id: "sample-demo-safari", designId: "design-safari", jobType: "SAMPLE", workflowType: "SAMPLE", status: "ACTIVE", priority: "NORMAL", modelName: "SAFARİ", companyName: "REN FASHION", orderNo: "SP-2608-009", imageUrl: safariImage, channelCount: 6, uniqueColorCount: 6, createdAt: iso(30), updatedAt: iso(1), lastActor: "Murat", colors: [jobColor("sample-safari-red", "Kırmızı", "18-1663", "COMPLETED", 0.25, "color-red"), jobColor("sample-safari-white", "Beyaz", "BEYAZ", "DRAFT", 0.25, "color-white"), jobColor("sample-safari-black", "Siyah", "19-0303", "WAITING", 0.25, "color-black")] },
  { id: "production-demo-opened", designId: "design-opened", jobType: "PRODUCTION", workflowType: "PRODUCTION", status: "WAITING", priority: "HIGH", modelName: "X-OPENED", companyName: "MİND TEKSTİL", orderNo: "SP-2608-021", imageUrl: openedImage, channelCount: 4, uniqueColorCount: 4, createdAt: iso(6), updatedAt: iso(4), lastActor: "Ali", colors: [jobColor("prod-opened-red", "Kırmızı", "18-1663", "WAITING", 9, "color-red"), jobColor("prod-opened-blue", "Saks", "19-4151", "WAITING", 8, "color-blue"), jobColor("prod-opened-white", "Beyaz", "BEYAZ", "COMPLETED", 12, "color-white")] },
  { id: "production-demo-mestun", designId: "design-mestun", jobType: "PRODUCTION", workflowType: "PRODUCTION", status: "ACTIVE", priority: "NORMAL", modelName: "MESTUN", companyName: "TAHA GİYİM", orderNo: "SP-2607-188", imageUrl: mestunImage, channelCount: 6, uniqueColorCount: 6, createdAt: iso(720), updatedAt: iso(18), lastActor: "Murat", colors: [jobColor("prod-mestun-red", "Kırmızı", "18-1663", "COMPLETED", 8, "color-red"), jobColor("prod-mestun-blue", "Saks", "19-4151", "COMPLETED", 9, "color-blue", { rfUsage: [{ id: "rf-demo-1", sourceJobId: "production-demo-mervod", sourceModelName: "MERVOD", targetJobId: "production-demo-mestun", targetModelName: "MESTUN", colorName: "Saks", usedKg: 3.2, tlValue: 5840, status: "RF", createdAt: iso(20) }] }), jobColor("prod-mestun-white", "Beyaz", "BEYAZ", "COMPLETED", 10, "color-white")] },
  { id: "production-demo-active", designId: "design-mervod", jobType: "PRODUCTION", workflowType: "PRODUCTION", status: "ACTIVE", priority: "HIGH", modelName: "MERVOD POLO", companyName: "REN FASHION", orderNo: "SP-2608-006", imageUrl: mervodImage, channelCount: 5, uniqueColorCount: 5, enteredProductionAt: iso(10), manufacturingStatus: "ACTIVE", createdAt: iso(60), updatedAt: iso(1), lastActor: "Ali", colors: [jobColor("prod-mervod-red", "Kırmızı", "18-1663", "COMPLETED", 7.5, "color-red"), jobColor("prod-mervod-blue", "Saks", "19-4151", "COMPLETED", 8.5, "color-blue")] },
  { id: "production-demo-completed", designId: "design-completed", jobType: "PRODUCTION", workflowType: "PRODUCTION", status: "COMPLETED", priority: "NORMAL", modelName: "SONIC 12", companyName: "TAHA GİYİM", orderNo: "SP-2606-101", imageUrl: sonicImage, channelCount: 4, uniqueColorCount: 4, enteredProductionAt: iso(1500), manufacturingStatus: "COMPLETED", createdAt: iso(1600), updatedAt: iso(1400), lastActor: "Murat", colors: [jobColor("prod-complete-red", "Kırmızı", "18-1663", "COMPLETED", 6, "color-red")] },
];

export const DEMO_PRODUCTIONS = [
  { id: "production-row-1", requestId: "demo-request-1", jobId: "production-demo-opened", jobColorId: "prod-opened-white", jobType: "PRODUCTION", modelSnapshot: "X-OPENED", modelName: "X-OPENED", companySnapshot: "MİND TEKSTİL", colorNameSnapshot: "Beyaz", pantoneSnapshot: "BEYAZ", paintTypeSnapshot: "SUBAZLI", versionSnapshot: "V1", productionTotalKg: 12, imageUrl: openedImage, createdAt: iso(1), actor: "Ali", lines: [{ productId: "demo-product-white", productName: "S 20 WHITE", referenceGram: 800, lotId: "demo-lot-white" }, { productId: "demo-product-clear", productName: "S 10 CLEAR", referenceGram: 200, lotId: "demo-lot-clear" }] },
  { id: "production-row-2", requestId: "demo-request-2", jobId: "production-demo-mestun", jobColorId: "prod-mestun-red", jobType: "PRODUCTION", modelSnapshot: "MESTUN", modelName: "MESTUN", companySnapshot: "TAHA GİYİM", colorNameSnapshot: "Kırmızı", pantoneSnapshot: "18-1663", paintTypeSnapshot: "SUBAZLI", versionSnapshot: "V2", productionTotalKg: 8, imageUrl: mestunImage, createdAt: iso(2), actor: "Murat", lines: [{ productId: "demo-product-clear", productName: "S 10 CLEAR", referenceGram: 200, lotId: "demo-lot-clear" }, { productId: "demo-product-red", productName: "KIRMIZI PİGMENT", referenceGram: 15, lotId: "demo-lot-red" }] },
  { id: "sample-row-1", requestId: "demo-sample-1", jobId: "sample-demo-safari", jobColorId: "sample-safari-red", jobType: "SAMPLE", modelSnapshot: "SAFARİ", modelName: "SAFARİ", companySnapshot: "REN FASHION", colorNameSnapshot: "Kırmızı", pantoneSnapshot: "18-1663", paintTypeSnapshot: "SUBAZLI", versionSnapshot: "V2", productionTotalKg: 0.25, imageUrl: safariImage, createdAt: iso(20), actor: "Murat", lines: [{ productId: "demo-product-clear", productName: "S 10 CLEAR", referenceGram: 200, lotId: "demo-lot-clear" }, { productId: "demo-product-red", productName: "KIRMIZI PİGMENT", referenceGram: 15, lotId: "demo-lot-red" }] },
];

const recipeRed = { id: "recipe-red-v2", colorId: "color-red", paintType: "SUBAZLI", dyeType: "SUBAZLI", version: "V2", status: "ACTIVE", totalGr: 250, createdAt: iso(20), lines: [{ id: "recipe-red-clear", productId: "demo-product-clear", productName: "S 10 CLEAR", referenceGram: 200 }, { id: "recipe-red-white", productId: "demo-product-white", productName: "S 20 WHITE", referenceGram: 30 }, { id: "recipe-red-pigment", productId: "demo-product-red", productName: "KIRMIZI PİGMENT", referenceGram: 20 }] };

export const DEMO_COLORS = [
  { id: "color-red", pantone: "18-1663", colorName: "Kırmızı", colorHex: "#c62032", paintTypes: ["SUBAZLI"], dyeType: "SUBAZLI", activeVersion: "V2", status: "ACTIVE", lastModelName: "MESTUN", usageCount: 14, recipes: [recipeRed, { ...recipeRed, id: "recipe-red-v1", version: "V1", status: "PASSIVE", createdAt: iso(1200) }], productions: DEMO_PRODUCTIONS.filter((row) => row.pantoneSnapshot === "18-1663") },
  { id: "color-blue", pantone: "19-4151", colorName: "Saks", colorHex: "#173b77", paintTypes: ["SUBAZLI"], dyeType: "SUBAZLI", activeVersion: "V2", status: "ACTIVE", lastModelName: "MERVOD POLO", usageCount: 11, recipes: [{ id: "recipe-blue-v2", colorId: "color-blue", paintType: "SUBAZLI", version: "V2", status: "ACTIVE", totalGr: 250, createdAt: iso(48), lines: [{ id: "blue-clear", productId: "demo-product-clear", productName: "S 10 CLEAR", referenceGram: 220 }, { id: "blue-pigment", productId: "demo-product-blue", productName: "MAVİ PİGMENT", referenceGram: 25 }, { id: "blue-fix", productId: "demo-product-fix", productName: "FİKSATÖR", referenceGram: 5 }] }], productions: [] },
  { id: "color-ten", pantone: "13-1030", colorName: "Ten", colorHex: "#f0c27b", paintTypes: ["SUBAZLI"], dyeType: "SUBAZLI", activeVersion: "V1", status: "ACTIVE", lastModelName: "SONIC 19", usageCount: 6, recipes: [], productions: [] },
  { id: "color-white", pantone: "BEYAZ", colorName: "Beyaz", colorHex: "#ffffff", paintTypes: ["SUBAZLI"], dyeType: "SUBAZLI", activeVersion: "V3", status: "ACTIVE", lastModelName: "X-OPENED", usageCount: 22, recipes: [], productions: DEMO_PRODUCTIONS.filter((row) => row.pantoneSnapshot === "BEYAZ") },
];

export const DEMO_LOGS = [
  { id: "log-1", actor: "Ali", actionType: "PRODUCTION_PREPARED", description: "X-OPENED modeli için Beyaz imalat boyası hazırlandı.", entityType: "BOYAHANE_PRODUCTION", createdAt: iso(1) },
  { id: "log-2", actor: "Murat", actionType: "RF", description: "MERVOD boyasından MESTUN modelinde 3,20 KG RF kullanıldı.", entityType: "BOYAHANE_RF", createdAt: iso(2) },
  { id: "log-3", actor: "Ayşe", actionType: "LOT_CREATED", description: "KIRMIZI PİGMENT için 260106093 lotu varsayılan yapıldı.", entityType: "BOYAHANE_LOT", createdAt: iso(3) },
  { id: "log-4", actor: "Murat", actionType: "SAMPLE_APPROVED", description: "SAFARİ 18-1663 numunesi V2 olarak onaylandı.", entityType: "BOYAHANE_SAMPLE", createdAt: iso(20) },
];

export const DEMO_MOVEMENTS = [
  { id: "movement-1", productId: "demo-product-clear", productName: "S 10 CLEAR", lotId: "demo-lot-clear", lotNo: "260105001", type: "PRODUCTION", quantityKg: -6.5, modelName: "MESTUN", actor: "Murat", source: "BOYAHANE_PRODUCTION", createdAt: iso(2) },
  { id: "movement-2", productId: "demo-product-white", productName: "S 20 WHITE", lotId: "demo-lot-white", lotNo: "260105200", type: "PRODUCTION", quantityKg: -9.6, modelName: "X-OPENED", actor: "Ali", source: "BOYAHANE_PRODUCTION", createdAt: iso(1) },
  { id: "movement-3", productId: "demo-product-red", productName: "KIRMIZI PİGMENT", lotId: "demo-lot-red", lotNo: "260106093", type: "IN", quantityKg: 5, modelName: "", actor: "Ayşe", source: "HIZLI_LOT", createdAt: iso(180) },
];

export const DEMO_REPORT = {
  summary: {
    sampleCount: 1,
    approvedColorCount: 4,
    productionCount: 2,
    preparedKg: 20,
    pendingColors: 5,
    rfKg: 3.2,
    rfTl: 5840,
    fireKg: 0,
    exchangeRates: {
      USD: { rate: 42.18, source: "Yerel test kaydı", updatedAt: iso(1) },
      EUR: { rate: 49.04, source: "Yerel test kaydı", updatedAt: iso(1) },
      GBP: { rate: 56.32, source: "Yerel test kaydı", updatedAt: iso(1) },
    },
  },
  jobs: DEMO_JOBS,
  productions: DEMO_PRODUCTIONS,
  expenses: [],
};

export const DEMO_STOCK_SUMMARY = {
  summary: {
    totalEntryKg: DEMO_LOTS.reduce((sum, row) => sum + Number(row.entryKg || 0), 0),
    totalRemainingKg: DEMO_LOTS.reduce((sum, row) => sum + Number(row.remainingKg || 0), 0),
  },
  products: DEMO_PRODUCTS,
  lots: DEMO_LOTS,
  movements: DEMO_MOVEMENTS,
  pendingLots: DEMO_LOTS.filter((row) => !String(row.lotNo || "").trim()),
};

export function demoRegisteredColorDetail(id) {
  return DEMO_COLORS.find((row) => row.id === id) || null;
}

export function demoJobDetail(id) {
  return DEMO_JOBS.find((row) => row.id === id) || null;
}
