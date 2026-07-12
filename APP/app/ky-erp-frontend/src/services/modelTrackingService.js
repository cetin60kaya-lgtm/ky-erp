import {
  API_BASE,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiUpload,
} from "../utils/api";
import { normalizeList } from "../utils/normalizeList";

const MODEL_LIST_ERROR =
  "Model listesi yüklenemedi. API bağlantısını kontrol edin.";

function requireCompany(activeMainCompany) {
  const slug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  const id = activeMainCompany?.id || activeMainCompany?.mainCompanyId || "";
  if (!slug) throw new Error("Ana firma seçmeden model takibi görüntülenemez.");
  return id
     ? { mainCompanySlug: slug, mainCompanyId: id }
    : { mainCompanySlug: slug };
}

function unwrap(payload) {
  // TODO: Backend tamamen { ok, data, message } standardına geçene kadar
  // doğrudan array/object dönen model endpointlerini kırmadan destekliyoruz.
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
     ? payload?.data
    : payload;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value) {
  const raw = String(value || "").toLocaleLowerCase("tr-TR");
  if (raw.includes("tamam")) return "Tamamlandı";
  if (raw.includes("kısmi") && raw.includes("fatura")) return "Kısmi Faturalı";
  if (raw.includes("üret") || raw.includes("imalat")) return "Üretimde";
  if (raw.includes("aktif")) return "Bekleyen";
  if (raw.includes("taslak")) return "Taslak";
  return value || "Bekleyen";
}

function modelSortTime(row = {}) {
  const raw =
    row?.createdAt ||
    row?.created_at ||
    row?.updatedAt ||
    row?.updated_at ||
    row?.sonIslemTarihi ||
    row?.lastDispatchDate ||
    row?.date ||
    "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function sortModelsNewestFirst(rows = []) {
  return [...rows].sort((a, b) => {
    const diff = modelSortTime(b) - modelSortTime(a);
    if (diff) return diff;
    return String(a.modelName || a.modelAdi || a.model || "").localeCompare(
      String(b.modelName || b.modelAdi || b.model || ""),
      "tr",
      { sensitivity: "base" },
    );
  });
}

function resolveAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) return "";
  if (/^(blob:|data:|https:\/\/)/i.test(raw)) return raw;
  if (/^(uploads|model-previews|model-files)\//i.test(raw)) {
    return `${String(API_BASE || "").replace(/\/+$/, "")}/storage/${raw}`;
  }
  if (/^storage\//i.test(raw)) {
    return `${String(API_BASE || "").replace(/\/+$/, "")}/${raw}`;
  }
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return `${String(API_BASE || "").replace(/\/+$/, "")}${normalized}`;
}

export function normalizeModelImages(images = [], fallbackImage = "") {
  const source = [
    fallbackImage,
    ...(Array.isArray(images) ? images : []),
  ].filter(Boolean);
  const seen = new Set();
  return source
    .map((item, index) => {
      const rawUrl =
        typeof item === "string"
           ? item
          : item?.url ||
            item?.path ||
            item?.filePath ||
            item?.thumbnailPath ||
            item?.previewUrl ||
            item?.desenGorseli ||
            "";
      const url = resolveAssetUrl(rawUrl);
      if (!url || seen.has(url)) return null;
      seen.add(url);
      return {
        id:
          (typeof item === "object" && item?.id) ||
          `model-image-${index}-${seen.size}`,
        url,
        path:
          typeof item === "object"
             ? item?.path || item?.filePath || item?.thumbnailPath || rawUrl
            : rawUrl,
        name: (typeof item === "object" && item?.name) || `Görsel ${seen.size}`,
      };
    })
    .filter(Boolean);
}

async function compressImageFile(file) {
  return file;
}

function normalizeModelRow(row, index = 0) {
  const incoming = toNumber(
    row?.musteriIrsaliyeAdedi ??
      row?.totalIncomingQty ??
      row?.gelenAdet ??
      row?.incomingQty,
  );
  const production = toNumber(
    row?.uretimAdedi ??
      row?.toplamUretimAdedi ??
      row?.toplamUretim ??
      row?.productionQty,
  );
  const outgoing = toNumber(row?.bizimIrsaliyeAdedi ?? row?.outgoingDispatchQty);
  const invoiced = toNumber(
    row?.faturaAdedi ??
      row?.kesilenFaturaAdedi ??
      row?.totalInvoiceQty ??
      row?.toplamFaturaAdedi ??
      row?.invoicedQty,
  );
  const remaining =
    row?.kalanAdet ?? row?.remainingQty ?? Math.max(incoming - invoiced, 0);
  const modelAdi =
    row?.modelAdi || row?.model || row?.modelName || row?.modelKodu || "-";
  const musteri =
    row?.musteri ||
    row?.musteriFirma ||
    row?.firmaAdi ||
    row?.firma ||
    row?.customer ||
    "Firma Seçilmedi";
  const zeminRenk =
    row?.zeminRenk || row?.zemin || row?.floor || row?.ground || "-";
  const thumbnail = resolveAssetUrl(
    row?.thumbnail ||
      row?.thumbnailPath ||
      row?.desenGorseli ||
      row?.imageUrl ||
      "",
  );
  const images = normalizeModelImages(row?.images, thumbnail);
  const cover = images[0].url || thumbnail;

  const status = normalizeStatus(row?.durum || row?.aktifDurum || row?.status);
  const emptyDocumentState =
    incoming <= 0 && production <= 0 && outgoing <= 0 && invoiced <= 0;

  return {
    ...row,
    id: String(
      row?.id || row?.modelId || row?.modelKaydiId || `${modelAdi}-${index}`,
    ),
    mainCompanySlug: row?.mainCompanySlug || "",
    modelAdi,
    siparisNo:
      row?.siparisNo || row?.musteriIrsaliyeNo || row?.sonIrsaliyeNo || "",
    musteri,
    zeminRenk,
    durum: emptyDocumentState ? "Kayıt Yok" : status,
    thumbnail,
    musteriIrsaliyeAdedi: incoming,
    uretimAdedi: production,
    bizimIrsaliyeAdedi: outgoing,
    faturaAdedi: invoiced,
    kalanAdet: toNumber(remaining),
    desenDurumu: row?.desenDurumu || "eksik",
    belgeDurumu: row?.belgeDurumu || row?.documentStatus || "",
    sonIslemTarihi:
      row?.sonIslemTarihi || row?.updatedAt || row?.tarih || row?.createdAt || "",
    desenBaglantilari: Array.isArray(row?.desenBaglantilari)
       ? row?.desenBaglantilari
      : [],
    belgeBaglantilari: Array.isArray(row?.belgeBaglantilari)
       ? row?.belgeBaglantilari
      : [],
    uretimBaglantilari: Array.isArray(row?.uretimBaglantilari)
       ? row?.uretimBaglantilari
      : [],
    model: modelAdi,
    modelName: modelAdi,
    customer: musteri,
    lastDispatchNo:
      row?.sonIrsaliyeNo || row?.musteriIrsaliyeNo || row?.dispatchNo || "-",
    lastDispatchDate: row?.sonIrsaliyeTarihi || row?.tarih || row?.createdAt || "",
    incomingQty: incoming,
    productionQty: production,
    invoicedQty: invoiced,
    remainingQty: toNumber(remaining),
    floor: zeminRenk,
    status: emptyDocumentState ? "Kayıt Yok" : status,
    imageUrl: cover,
    images,
    folderName: row?.folderName || row?.klasorAdi || "",
    modelFolderPath: row?.modelFolderPath || row?.klasorYolu || "",
    files: Array.isArray(row?.files) ? row?.files : [],
    customerDispatches: Array.isArray(row?.customerDispatches)
       ? row?.customerDispatches
      : Array.isArray(row?.musteriIrsaliyeleri)
         ? row?.musteriIrsaliyeleri
        : [],
    outgoingDispatches: Array.isArray(row?.outgoingDispatches)
       ? row?.outgoingDispatches
      : Array.isArray(row?.gidenIrsaliyeler)
         ? row?.gidenIrsaliyeler
        : [],
    invoices: Array.isArray(row?.invoices)
       ? row?.invoices
      : Array.isArray(row?.gidenFaturalar)
         ? row?.gidenFaturalar
        : [],
    documentHistory: Array.isArray(row?.documentHistory)
       ? row?.documentHistory
      : [],
    productionHistory: Array.isArray(row?.productionHistory)
       ? row?.productionHistory
      : [],
  };
}

function emptyDocuments() {
  return {
    customerDispatches: [],
    outgoingDispatches: [],
    invoices: [],
    documentHistory: [],
    productionHistory: [],
    images: [],
  };
}

export async function fetchSharedModels(activeMainCompany) {
  try {
    const payload = await apiGet("/model-takip/models/shared-list", {
      ...requireCompany(activeMainCompany),
      page: 1,
    pageSize: 5000,
    limit: 5000,
    });
    const data = unwrap(payload);
    return sortModelsNewestFirst(normalizeList(data).map(normalizeModelRow));
  } catch (error) {
    if (error.message === "Ana firma seçmeden model takibi görüntülenemez.")
      throw error;
    throw new Error(error?.message || MODEL_LIST_ERROR);
  }
}

export async function fetchModelById(activeMainCompany, id) {
  const payload = await apiGet(
    `/model-takip/models/shared-list/${encodeURIComponent(id)}`,
    requireCompany(activeMainCompany),
  );
  return normalizeModelRow(unwrap(payload));
}

export async function createModel(activeMainCompany, data = {}) {
  const company = requireCompany(activeMainCompany);
  const result = unwrap(
    await apiPost("/model-takip/models", { ...data, ...company }),
  );
  return normalizeModelRow(result);
}

export async function updateModel(activeMainCompany, id, data = {}) {
  if (!id) throw new Error("Güncellenecek model seçilmedi.");
  const company = requireCompany(activeMainCompany);
  const result = unwrap(
    await apiPatch(`/model-takip/models/${encodeURIComponent(id)}`, {
      ...data,
      ...company,
    }),
  );
  return normalizeModelRow(result);
}

export async function deleteModelTrackingItem(
  activeMainCompany,
  id,
  model = {},
) {
  if (!id) throw new Error("Silinecek model seçilmedi.");
  const company = requireCompany(activeMainCompany);
  return unwrap(
    await apiDelete(`/model-takip/models/${encodeURIComponent(id)}`, {
      ...company,
      modelName: model?.modelName || model?.modelAdi || model?.model || "",
      musteri:
        model?.musteri ||
        model?.musteriFirma ||
        model?.customerName ||
        model?.customer ||
        "",
      customerName:
        model?.customerName ||
        model?.customer ||
        model?.musteriFirma ||
        model?.musteri ||
        "",
      belgeNo:
        model?.belgeNo ||
        model?.documentNo ||
        model?.lastDispatchNo ||
        model?.siparisNo ||
        "",
      irsaliyeNo:
        model?.irsaliyeNo ||
        model?.musteriIrsaliyeNo ||
        model?.lastDispatchNo ||
        "",
      sourceKey: model?.sourceKey || model?.docModelKey || model?.id || "",
      docModelKey: model?.docModelKey || model?.id || "",
      sourceType: model?.sourceType || model?.source || "",
      displayName:
        model?.displayName ||
        model?.cardTitle ||
        [
          model?.modelName || model?.modelAdi || model?.model,
          model?.lastDispatchNo || model?.irsaliyeNo || model?.belgeNo,
        ]
          .filter(Boolean)
          .join(" - "),
      cardTitle: model?.cardTitle || model?.displayName || "",
      zemin: model?.zemin || model?.ground || model?.floor || "",
      givenQty: model?.givenQty || model?.gelenAdet || model?.quantity || "",
    }),
  );
}

export async function fetchModelHistory(activeMainCompany, id) {
  const company = requireCompany(activeMainCompany);
  try {
    const payload = await apiGet(
      `/model-takip/models/${encodeURIComponent(id)}/history`,
      company,
    );
    const rows = unwrap(payload);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function linkModelDocument(activeMainCompany, modelId, payload) {
  return unwrap(
    await apiPost(
      `/model-takip/models/${encodeURIComponent(modelId)}/documents`,
      {
        ...payload,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function linkModelProduction(activeMainCompany, modelId, payload) {
  return unwrap(
    await apiPost(
      `/model-takip/models/${encodeURIComponent(modelId)}/production`,
      {
        ...payload,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function linkModelDesen(activeMainCompany, modelId, payload) {
  return unwrap(
    await apiPost(`/model-takip/models/${encodeURIComponent(modelId)}/desen`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function getModelTrackingItems(activeMainCompany) {
  const payload = await apiGet(
    "/model-takip/model-genel-takip",
    requireCompany(activeMainCompany),
  );
  const rows = unwrap(payload);
  return Array.isArray(rows)
     ? sortModelsNewestFirst(rows.map(normalizeModelRow))
    : [];
}

export async function getModelTrackingSummary(activeMainCompany) {
  const items = await getModelTrackingItems(activeMainCompany);
  return items.reduce(
    (acc, item) => {
      acc.totalModel += 1;
      acc.totalIncoming += toNumber(item?.incomingQty);
      acc.totalProduction += toNumber(item?.productionQty);
      acc.totalInvoiced += toNumber(item?.invoicedQty);
      acc.totalRemaining += toNumber(item?.remainingQty);
      if (item.status === "Bekleyen") acc.waiting += 1;
      if (item.status === "Üretimde") acc.inProduction += 1;
      if (item.status === "Kısmi Faturalı") acc.partialInvoiced += 1;
      if (item.status === "Tamamlandı") acc.completed += 1;
      return acc;
    },
    {
      totalModel: 0,
      waiting: 0,
      inProduction: 0,
      partialInvoiced: 0,
      completed: 0,
      totalIncoming: 0,
      totalProduction: 0,
      totalInvoiced: 0,
      totalRemaining: 0,
    },
  );
}

export async function getIncomingModelDispatches(activeMainCompany) {
  const payload = await apiGet(
    "/muhasebe/incoming-deliveries/pool",
    requireCompany(activeMainCompany),
  );
  const rows = unwrap(payload);
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 50).map((item, index) => ({
    id: String(item?.id || item?.documentId || `incoming-${index}`),
    documentNo:
      item?.irsaliyeNo || item?.documentNo || item?.header.documentNo || "-",
    company: item?.firma || item?.musteri || item?.header.firmName || "-",
    date: item?.tarih || item?.documentDate || item?.createdAt || "",
    incomingQty: toNumber(
      item?.gelenAdet || item?.quantity || item?.header.irsaliyeAdedi,
    ),
    status: item?.durum || item?.status || "Havuzda",
  }));
}

export async function getModelDocuments(modelId, activeMainCompany) {
  if (!modelId) return emptyDocuments();
  const company = requireCompany(activeMainCompany);
  const [history, documents, production, desen] = await Promise.allSettled([
    apiGet(
      `/model-takip/models/${encodeURIComponent(modelId)}/history`,
      company,
    ),
    apiGet(
      `/model-takip/models/${encodeURIComponent(modelId)}/documents`,
      company,
    ),
    apiGet(
      `/model-takip/models/${encodeURIComponent(modelId)}/production`,
      company,
    ),
    apiGet(`/model-takip/models/${encodeURIComponent(modelId)}/desen`, company),
  ]);
  const historyRows =
    history.status === "fulfilled" ? unwrap(history.value) : [];
  const documentRows =
    documents.status === "fulfilled" ? unwrap(documents?.value) : [];
  const productionRows =
    production.status === "fulfilled" ? unwrap(production.value) : [];
  const desenRows = desen.status === "fulfilled" ? unwrap(desen.value) : [];
  return {
    customerDispatches: Array.isArray(documentRows)
      ? documentRows.filter((row) =>
          String(row?.type || row?.belgeTuru || "")
            .toLocaleLowerCase("tr-TR")
            .includes("irsaliye"),
        )
      : [],
    outgoingDispatches: [],
    invoices: Array.isArray(documentRows)
      ? documentRows.filter((row) =>
          String(row?.type || row?.belgeTuru || "")
            .toLocaleLowerCase("tr-TR")
            .includes("fatura"),
        )
      : [],
    documentHistory: Array.isArray(historyRows)
       ? historyRows
      : Array.isArray(documentRows)
         ? documentRows
        : [],
    productionHistory: Array.isArray(productionRows) ? productionRows : [],
    images: Array.isArray(desenRows)
      ? desenRows
          .map((row) => row?.thumbnail || row?.desenGorseli || row?.previewPath)
          .filter(Boolean)
      : [],
  };
}

export async function getCompletedModelArchive(activeMainCompany) {
  const items = await getModelTrackingItems(activeMainCompany);
  return items
    .filter((item) => item.status === "Tamamlandı")
    .map((item) => ({
      ...item,
      closingDate:
        item?.closingDate || item?.sonIslemTarihi || item?.lastDispatchDate || "",
      lastInvoiceNo: item?.lastInvoiceNo || "-",
      status: "Tamamlandı",
      remainingQty: 0,
    }));
}

export async function updateModelImages(modelId, files, activeMainCompany) {
  const fileList = Array.from(files || []);
  if (!fileList.length) return { ok: true, images: [] };
  const company = requireCompany(activeMainCompany);
  const formData = new FormData();
  const optimizedFiles = await Promise.all(
    fileList.map((file) => compressImageFile(file)),
  );
  optimizedFiles.forEach((file) => formData.append("images", file));
  Object.entries(company).forEach(([key, value]) => formData.set(key, value));
  const query = new URLSearchParams(company).toString();
  const payload = await apiUpload(
    `/model-takip/models/${encodeURIComponent(modelId)}/images${query}`,
    formData,
  );
  const data = unwrap(payload);
  if (Array.isArray(data?.images)) {
    return {
      ok: true,
      images: data.images.map((image) => ({
        ...image,
        url: resolveAssetUrl(image?.url || image?.path),
      })),
    };
  }
  if (Array.isArray(data)) {
    return {
      ok: true,
      images: data.map((image) => ({
        ...image,
        url: resolveAssetUrl(image?.url || image?.path),
      })),
    };
  }
  throw new Error("Model görselleri backend tarafından kaydedilemedi.");
}

export async function uploadModelFiles(modelId, files, activeMainCompany) {
  const fileList = Array.from(files || []);
  if (!fileList.length) return { ok: true, files: [] };
  const company = requireCompany(activeMainCompany);
  const formData = new FormData();
  fileList.forEach((file) => formData.append("files", file));
  Object.entries(company).forEach(([key, value]) => formData.set(key, value));
  const query = new URLSearchParams(company).toString();
  const payload = await apiUpload(
    `/model-takip/models/${encodeURIComponent(modelId)}/files${query}`,
    formData,
  );
  const data = unwrap(payload);
  return {
    ok: true,
    files: Array.isArray(data?.files) ? data?.files : [],
    model: data?.model ? normalizeModelRow(data?.model) : null,
  };
}
