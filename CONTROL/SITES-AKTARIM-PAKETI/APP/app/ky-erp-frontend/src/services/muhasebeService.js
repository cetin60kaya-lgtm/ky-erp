import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";
import { normalizeList } from "../utils/normalizeList";

function requireCompany(activeMainCompany) {
  const slug = activeMainCompany?.slug || "";
  const id = activeMainCompany?.id || "";
  if (!slug || !id) throw new Error("Ana firma zorunludur.");
  return { mainCompanySlug: slug, mainCompanyId: id };
}

function unwrap(payload) {
  // TODO: Backend tamamen { ok, data, message } formatına geçene kadar
  // doğrudan array/object dönen muhasebe endpointlerini kırmadan destekliyoruz.
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
     ? payload?.data
    : payload;
}

export async function fetchMuhasebeOverview(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/muhasebe/dashboard-summary",
      requireCompany(activeMainCompany),
    ),
  );
}

export async function fetchCompanies(activeMainCompany) {
  return normalizeList(
    unwrap(
      await apiGet(
        "/muhasebe/firma-kartlari",
        requireCompany(activeMainCompany),
      ),
    ),
  );
}

export async function saveCompany(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/firma-kartlari", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchProducts(activeMainCompany) {
  return normalizeList(
    unwrap(
      await apiGet("/muhasebe/urunler", {
        ...requireCompany(activeMainCompany),
        limit: 1000,
      }),
    ),
  );
}

export async function saveProduct(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/urunler", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function updateMuhasebeProduct(activeMainCompany, id, payload) {
  return unwrap(
    await apiPatch(`/muhasebe/urunler/${encodeURIComponent(id)}`, {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function deleteMuhasebeProduct(activeMainCompany, id) {
  return unwrap(
    await apiDelete(
      `/muhasebe/urunler/${encodeURIComponent(id)}`,
      requireCompany(activeMainCompany),
    ),
  );
}

export async function getMuhasebeProducts(activeMainCompany) {
  return fetchProducts(activeMainCompany);
}

export async function createMuhasebeProduct(activeMainCompany, payload) {
  return saveProduct(activeMainCompany, payload);
}

export async function getProductAliases(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/muhasebe/product-aliases",
      requireCompany(activeMainCompany),
    ),
  );
}

export async function createProductAlias(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/product-aliases", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function uploadDocuments(activeMainCompany, files) {
  const company = requireCompany(activeMainCompany);
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append("files", file));
  formData.set("mainCompanySlug", company?.mainCompanySlug);
  formData.set("mainCompanyId", company?.mainCompanyId);
  return unwrap(await apiUpload("/muhasebe/document-upload", formData));
}

export async function uploadDocumentsInChunks(
  activeMainCompany,
  files,
  options = {},
) {
  const chunkSize = Number(options.chunkSize || 20);
  const allFiles = Array.from(files || []);
  const results = [];
  for (let index = 0; index < allFiles.length; index += chunkSize) {
    const chunk = allFiles.slice(index, index + chunkSize);
    const response = await uploadDocuments(activeMainCompany, chunk);
    results.push(...(Array.isArray(response.results) ? response.results : []));
    if (typeof options.onProgress === "function") {
      options.onProgress({
        done: Math.min(index + chunk.length, allFiles.length),
        total: allFiles.length,
        response,
      });
    }
  }
  return { ok: true, results };
}

export async function fetchUploadHistory(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/muhasebe/document-upload/history",
      requireCompany(activeMainCompany),
    ),
  );
}

export async function fetchUploadSummary(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/muhasebe/document-upload/summary",
      requireCompany(activeMainCompany),
    ),
  );
}

export async function fetchIncomingDeliveryPool(activeMainCompany) {
  return normalizeList(
    unwrap(
      await apiGet(
        "/muhasebe/incoming-deliveries/pool",
        requireCompany(activeMainCompany),
      ),
    ),
  );
}

export async function saveIncomingDelivery(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/incoming-deliveries", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function linkIncomingDeliveryToModel(
  activeMainCompany,
  id,
  modelId,
  model = {},
) {
  return unwrap(
    await apiPost(
      `/muhasebe/incoming-deliveries/${encodeURIComponent(id)}/link-model`,
      {
        modelId,
        modelAdi: model?.modelAdi || model?.modelName || model?.name || "",
        modelName: model?.modelName || model?.modelAdi || model?.name || "",
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function fetchOutgoingDocumentsPool(activeMainCompany) {
  return normalizeList(
    unwrap(
      await apiGet(
        "/muhasebe/outgoing-documents/pool",
        requireCompany(activeMainCompany),
      ),
    ),
  );
}

export async function saveOutgoingDocument(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/outgoing-documents", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function suggestModelsForOutgoingDocument(
  activeMainCompany,
  payload,
) {
  return unwrap(
    await apiPost("/muhasebe/outgoing-documents/suggest-models", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function linkOutgoingDocumentToModel(
  activeMainCompany,
  id,
  modelId,
  model = {},
) {
  return unwrap(
    await apiPost(
      `/muhasebe/outgoing-documents/${encodeURIComponent(id)}/link-model`,
      {
        modelId,
        modelAdi: model?.modelAdi || model?.modelName || model?.name || "",
        modelName: model?.modelName || model?.modelAdi || model?.name || "",
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function createModelFromOutgoingDocument(
  activeMainCompany,
  id,
  payload,
) {
  return unwrap(
    await apiPost(
      `/muhasebe/outgoing-documents/${encodeURIComponent(id)}/create-model`,
      {
        ...payload,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function prepareOutgoingMailPackage(
  activeMainCompany,
  id,
  payload = {},
) {
  return unwrap(
    await apiPost(
      `/muhasebe/outgoing-documents/${encodeURIComponent(id)}/mail-package`,
      {
        ...payload,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function prepareMailLog(activeMainCompany, payload = {}) {
  return unwrap(
    await apiPost("/muhasebe/mail-logs/prepare", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchSupplierInvoicePool(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/muhasebe/supplier-invoices/pool",
      requireCompany(activeMainCompany),
    ),
  );
}

export async function saveSupplierInvoice(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/supplier-invoices", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function matchSupplierInvoiceLines(activeMainCompany, id, lines) {
  return unwrap(
    await apiPost(
      `/muhasebe/supplier-invoices/${encodeURIComponent(id)}/match-lines`,
      {
        lines,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function saveSupplierInvoiceLines(activeMainCompany, id, lines) {
  return unwrap(
    await apiPost(
      `/muhasebe/supplier-invoices/${encodeURIComponent(id)}/save-lines`,
      {
        lines,
        ...requireCompany(activeMainCompany),
      },
    ),
  );
}

export async function generateRawMaterialLots(activeMainCompany, id) {
  return unwrap(
    await apiPost(
      `/muhasebe/supplier-invoices/${encodeURIComponent(id)}/generate-lot-records`,
      requireCompany(activeMainCompany),
    ),
  );
}

export async function fetchRawMaterialLots(activeMainCompany) {
  return unwrap(
    await apiGet(
      "/muhasebe/raw-material-lots",
      requireCompany(activeMainCompany),
    ),
  );
}

export async function fetchMuhasebeModels(activeMainCompany) {
  return normalizeList(
    unwrap(
      await apiGet(
        "/model-takip/models/shared-list",
        {
          ...requireCompany(activeMainCompany),
          pageSize: 5000,
          limit: 5000,
        },
      ),
    ),
  );
}

export async function fetchCariRecords(activeMainCompany) {
  return unwrap(
    await apiGet("/muhasebe/cari-kasa", requireCompany(activeMainCompany)),
  );
}

export async function saveCariRecord(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/cari", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}

export async function fetchKdvRecords(activeMainCompany) {
  return unwrap(
    await apiGet("/muhasebe/kdv", requireCompany(activeMainCompany)),
  );
}

export async function saveKdvRecord(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/muhasebe/vat-periods", {
      ...payload,
      ...requireCompany(activeMainCompany),
    }),
  );
}
