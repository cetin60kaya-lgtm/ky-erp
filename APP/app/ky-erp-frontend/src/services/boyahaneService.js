import { apiDelete, apiGet, apiPatch, apiPost } from "../utils/api";
import { normalizeList } from "../utils/normalizeList";

const COMPANY_REQUIRED_MESSAGE =
  "Ana firma seçmeden boyahane verileri görüntülenemez.";

function requireCompany(activeMainCompany) {
  const mainCompanySlug = String(
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "",
  ).trim();
  if (!mainCompanySlug) {
    throw new Error(COMPANY_REQUIRED_MESSAGE);
  }
  return {
    mainCompanySlug,
    mainCompanyId: activeMainCompany?.id || activeMainCompany?.mainCompanyId,
  };
}

function unwrap(payload, fallback = null) {
  if (payload && typeof payload === "object" && payload.ok === true) {
    return payload?.data ?? fallback;
  }
  // TODO: Backend endpointleri tamamen { ok, data, message } formatına taşınınca
  // doğrudan array/object cevap desteği kaldırılacak.
  return payload ?? fallback;
}

function normalizePaintType(category) {
  const value = String(category || "").toLocaleLowerCase("tr-TR");
  if (value.includes("pigment") || value.includes("fluores")) {
    return "Pigment Baskı";
  }
  if (value.includes("subaz")) return "Subazlı";
  if (value.includes("silik")) return "Silikon";
  if (value.includes("ecoplast")) return "Ecoplast";
  if (value.includes("aşınd") || value.includes("asindir")) return "Aşındırma";
  return "Subazlı";
}

function normalizePackage(value) {
  const text = String(value || "").trim();
  if (!text) return "20 KG";
  if (/kg$/i.test(text)) return text.toUpperCase();
  return `${text} KG`;
}

function normalizeHex(seed = "") {
  const clean = String(seed || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(0, 6);
  if (clean.length === 6) return `#${clean.toUpperCase()}`;
  return "#E2E8F0";
}

function hashText(input) {
  let hash = 0;
  const text = String(input || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeStatus(row = {}) {
  const status = String(row?.status || row?.durum || "").trim();
  if (status) return status;
  const remaining = Number(row?.remainingQuantity ?? row?.availableKg ?? 0);
  return remaining <= 0 ? "Tükendi" : "Aktif";
}

function normalizeRawMaterialLot(row = {}) {
  const productId = String(row?.productId || row?.urunId || "").trim();
  const productName = String(
    row?.productName || row?.urunAdi || row?.matchedProductName || "",
  ).trim();
  const lotNo = String(row?.lotNo || row?.lot || "").trim();
  const materialKey = productId || productName || "unknown";
  const quantity = Number(row?.quantity ?? row?.incomingKg ?? row?.miktar ?? 0);
  const remainingQuantity = Number(
    row?.remainingQuantity ?? row?.availableKg ?? row?.kalanMiktar ?? quantity,
  );
  const reservedKg = Math.max(0, quantity - remainingQuantity);
  const supplierName = String(
    row?.supplierName || row?.supplier || row?.tedarikciFirma || "",
  ).trim();

  return {
    id: String(row?.id || row?.lotId || `${materialKey}-${lotNo}`).trim(),
    mainCompanySlug: row?.mainCompanySlug,
    supplierCompanyId: row?.supplierCompanyId,
    supplierName,
    invoiceId: row?.invoiceId,
    invoiceNo: String(row?.invoiceNo || row?.belgeNo || "").trim(),
    invoiceDate: String(row?.invoiceDate || row?.belgeTarihi || "").trim(),
    productId,
    productName,
    lotNo,
    packaging: normalizePackage(row?.packaging || row?.ambalaj || row?.package),
    quantity,
    unit: String(row?.unit || row?.birim || "KG").trim() || "KG",
    remainingQuantity,
    unitPrice: Number(row?.unitPrice ? row?.birimFiyat ?? 0),
    kdvRate: Number(row?.kdvRate ? row?.kdvOrani ?? 0),
    lineTotal: Number(row?.lineTotal ? row?.satirToplam ?? 0),
    status: normalizeStatus(row),

    rawMaterialId: `mhs-${materialKey}`,
    supplier: supplierName || "-",
    entryDate: String(
      row?.invoiceDate || row?.entryDate || row?.girisTarihi || "",
    ).trim(),
    package: normalizePackage(row?.packaging || row?.ambalaj || row?.package),
    incomingKg: quantity,
    availableKg: remainingQuantity,
    reservedKg,
    note: String(row?.note || row?.not || "").trim(),
    source: "muhasebe",
    sourceProductId: productId,
    sourceLotId: String(row?.id || row?.lotId || "").trim(),
    sourceRawMaterialLot: row,
  };
}

function mapRawLotsToMaterials(rawLots = []) {
  const materials = [];
  const seen = new Set();
  rawLots.forEach((lot) => {
    const key = lot.rawMaterialId;
    if (!key || seen.has(key)) return;
    seen.add(key);
    materials.push({
      id: key,
      productName: lot.productName || "-",
      materialType: normalizePaintType(lot.productName),
      brand: "MUHASEBE",
      supplier: lot.supplier || lot.supplierName || "-",
      packaging: lot.packaging || lot.package || "KG",
      status: lot.status || "Aktif",
      hex: normalizeHex(hashText(lot.productName).toString(16)),
      source: "muhasebe",
      sourceProductId: lot.productId,
      sourceProductPersisted: Boolean(lot.productId),
    });
  });
  return materials;
}

function mergeMaterials(baseMaterials = [], rawLotMaterials = []) {
  const merged = [];
  const seen = new Set();
  [...rawLotMaterials, ...(Array.isArray(baseMaterials) ? baseMaterials : [])]
    .filter(Boolean)
    .forEach((row) => {
      const key = String(row?.id || row?.productName || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(row);
    });
  return merged;
}

function normalizeBootstrapPayload(payload = {}) {
  return {
    colors: Array.isArray(payload?.colors) ? payload?.colors : [],
    recipes: Array.isArray(payload?.recipes) ? payload?.recipes : [],
    materials: Array.isArray(payload?.materials) ? payload?.materials : [],
    lots: Array.isArray(payload?.lots) ? payload?.lots : [],
    movements: Array.isArray(payload?.movements) ? payload?.movements : [],
    runs: Array.isArray(payload?.runs) ? payload?.runs : [],
  };
}

function normalizeDesenChannels(channels = []) {
  if (!Array.isArray(channels)) return [];
  return channels
    .filter((row) => row && row?.aktif !== false)
    .map((row, index) => ({
      id: row?.id || `desen-ch-${index + 1}`,
      channelNo: Number(row?.kanalNo || index + 1),
      colorCode: String(row?.renkKodu || "").trim(),
      colorName: String(row?.kanalAdi || `Kanal ${index + 1}`).trim(),
      paintType: String(row?.boyaTuru || "Subazlı").trim(),
      hex: String(row?.hex || "#E2E8F0").trim() || "#E2E8F0",
      status: row.aktif === false ? "Pasif" : "Aktif",
    }));
}

export async function fetchBoyahaneModels(activeMainCompany, params = {}) {
  const company = requireCompany(activeMainCompany);
  const [modelPayload, desenPayload] = await Promise.all([
    apiGet("/model-takip/models/shared-list", {
      ...company,
      ...params,
    }),
    apiGet("/desen/records", company).catch(() => []),
  ]);
  const models = normalizeList(unwrap(modelPayload, []));
  const desenRows = normalizeList(unwrap(desenPayload, []));
  const desenByModelId = new Map(
    desenRows
      .filter((row) => row?.modelId)
      .map((row) => [String(row?.modelId), row]),
  );

  return models.map((model) => {
    const desen = desenByModelId.get(String(model?.id));
    if (!desen) return model;
    const channelRows = normalizeDesenChannels(desen.kanalBilgileri);
    return {
      ...model,
      channels: channelRows.length ? channelRows : model?.channels || [],
      desenRecordId: desen.id,
      channelCount: Number(desen.kanalSayisi || channelRows.length || 0),
      dyehouseNote: desen.boyahaneNotu || "",
    };
  });
}

export async function fetchRawMaterialLots(activeMainCompany, params = {}) {
  const payload = await apiGet("/muhasebe/raw-material-lots", {
    ...requireCompany(activeMainCompany),
    ...params,
  });
  const rows = unwrap(payload, []);
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeRawMaterialLot);
}

export async function fetchRawMaterialLotsByProduct(
  activeMainCompany,
  productId,
  params = {},
) {
  if (!productId) return [];
  const payload = await apiGet(
    `/muhasebe/raw-material-lots/by-product/${encodeURIComponent(productId)}`,
    {
      ...requireCompany(activeMainCompany),
      ...params,
    },
  );
  const rows = unwrap(payload, []);
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeRawMaterialLot);
}

export async function getBoyahaneBootstrap(activeMainCompany) {
  const company = requireCompany(activeMainCompany);
  const [bootstrapPayload, rawLots] = await Promise.all([
    apiGet("/boyahane/bootstrap", company),
    fetchRawMaterialLots(activeMainCompany),
  ]);
  const normalized = normalizeBootstrapPayload(unwrap(bootstrapPayload, {}));
  const rawLotMaterials = mapRawLotsToMaterials(rawLots);

  return {
    ...normalized,
    materials: mergeMaterials(normalized.materials, rawLotMaterials),
    lots: rawLots,
  };
}

export async function fetchBoyahaneColors(activeMainCompany) {
  return (await getBoyahaneBootstrap(activeMainCompany)).colors;
}

export async function fetchRecipes(activeMainCompany) {
  return (await getBoyahaneBootstrap(activeMainCompany)).recipes;
}

export async function saveRecipe(activeMainCompany, payload) {
  if (payload?.id) {
    return updateBoyahaneRecipe(activeMainCompany, payload?.id, payload);
  }
  return createBoyahaneRecipe(activeMainCompany, payload);
}

export async function fetchRecipeRuns(activeMainCompany) {
  return (await getBoyahaneBootstrap(activeMainCompany)).runs;
}

export async function saveRecipeRun(activeMainCompany, payload) {
  return createBoyahaneRun(activeMainCompany, payload);
}

export async function createTrackedMuhasebeMaterial() {
  throw new Error(
    "Hammadde kartları Muhasebe onaylı ürün/lot akışından gelir.",
  );
}

export async function saveTrackedMuhasebeLot() {
  throw new Error("Lot kayıtları Muhasebe onaylı tedarikçi faturadan gelir.");
}

export async function createBoyahaneColor(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/boyahane/colors", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function updateBoyahaneColor(activeMainCompany, id, payload) {
  return unwrap(
    await apiPatch(`/boyahane/colors/${encodeURIComponent(id)}`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function deleteBoyahaneColor(activeMainCompany, id) {
  return unwrap(
    await apiDelete(`/boyahane/colors/${encodeURIComponent(id)}`, {
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function createBoyahaneRecipe(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/boyahane/recipes", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function updateBoyahaneRecipe(activeMainCompany, id, payload) {
  return unwrap(
    await apiPatch(`/boyahane/recipes/${encodeURIComponent(id)}`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function deleteBoyahaneRecipe(activeMainCompany, id) {
  return unwrap(
    await apiDelete(`/boyahane/recipes/${encodeURIComponent(id)}`, {
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function createBoyahaneMaterial() {
  throw new Error(
    "Boyahane doğrudan hammadde oluşturmaz; kayıt Muhasebe onaylı akıştan gelir.",
  );
}

export async function createBoyahaneLot() {
  throw new Error(
    "Boyahane doğrudan lot oluşturmaz; lotlar Muhasebe onaylı tedarikçi faturadan gelir.",
  );
}

export async function updateBoyahaneLot(activeMainCompany, id, payload) {
  return unwrap(
    await apiPatch(`/boyahane/lots/${encodeURIComponent(id)}`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function createBoyahaneMovement(
  activeMainCompany,
  lotId,
  payload,
) {
  return unwrap(
    await apiPost(`/boyahane/lots/${encodeURIComponent(lotId)}/movements`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function saveLotConsumption(activeMainCompany, payload) {
  // TODO: remainingQuantity düşümü hammadde lot servisinde onaylı tüketim
  // akışı tamamlanınca yapılacak; bu endpoint şimdilik taslak tüketim kaydıdır.
  return unwrap(
    await apiPost("/boyahane/lot-consumptions", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function createBoyahaneRun(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/boyahane/runs", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}
