import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiUpload,
  buildApiUrl,
} from "../utils/api";
import { normalizeList } from "../utils/normalizeList";
import { getModelImageSource } from "../utils/modelImage";

export function companyQuery(activeMainCompany) {
  const slug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  return `mainCompanySlug=${encodeURIComponent(slug)}`;
}

export function unwrap(payload) {
  return payload?.data ?? payload;
}

function unwrapRows(payload) {
  const data = unwrap(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data?.rows;
  if (Array.isArray(data?.items)) return data?.items;
  return [];
}

function requireCompanySlug(activeMainCompany) {
  const slug =
    activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || "";
  if (!slug) throw new Error("Ana firma zorunludur.");
  return slug;
}

export async function fetchSharedModels(activeMainCompany) {
  return normalizeList(
    unwrapRows(
      await apiGet("/model-takip/models/shared-list", {
        mainCompanySlug: requireCompanySlug(activeMainCompany),
        page: 1,
        pageSize: 50,
      }),
    ),
  ).map((model) => {
    const imageUrl = getModelImageSource(model);
    return imageUrl ? { ...model, imageUrl } : model;
  });
}

export async function fetchSelectedModel(activeMainCompany, modelId) {
  return unwrap(
    await apiGet(
      `/model-takip/models/shared-list/${encodeURIComponent(modelId)}`,
      { mainCompanySlug: requireCompanySlug(activeMainCompany) },
    ),
  );
}

export async function createSharedModel(activeMainCompany, payload) {
  return unwrap(
    await apiPost("/model-takip/models", {
      ...payload,
      mainCompanySlug: requireCompanySlug(activeMainCompany),
    }),
  );
}

export async function fetchDesenRecords(activeMainCompany) {
  return unwrap(
    await apiGet("/desen/records", {
      mainCompanySlug: requireCompanySlug(activeMainCompany),
    }),
  );
}

export async function saveDesenRecord(activeMainCompany, payload) {
  const body = {
    ...payload,
    mainCompanySlug: requireCompanySlug(activeMainCompany),
  };
  if (payload?.id) {
    return unwrap(
      await apiPatch(`/desen/records/${encodeURIComponent(payload?.id)}`, body),
    );
  }
  return unwrap(await apiPost("/desen/records", body));
}

export async function uploadDesenFile(
  activeMainCompany,
  desenId,
  file,
  fields,
) {
  const slug = requireCompanySlug(activeMainCompany);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mainCompanySlug", slug);
  Object.entries(fields || {}).forEach(([key, value]) =>
    formData.append(key, value ?? ""),
  );
  return unwrap(
    await apiUpload(
      `/desen/records/${encodeURIComponent(desenId)}/files`,
      formData,
    ),
  );
}

export function filePreviewUrl(activeMainCompany, fileId) {
  if (!fileId) return "";
  return buildApiUrl(
    `/desen/files/${encodeURIComponent(fileId)}/preview${companyQuery(activeMainCompany)}`,
  );
}

export function fileDownloadUrl(activeMainCompany, fileId) {
  if (!fileId) return "";
  return buildApiUrl(
    `/desen/files/${encodeURIComponent(fileId)}/download${companyQuery(activeMainCompany)}`,
  );
}

export async function deleteDesenFile(activeMainCompany, fileId) {
  return unwrap(
    await apiDelete(`/desen/files/${encodeURIComponent(fileId)}`, {
      mainCompanySlug: requireCompanySlug(activeMainCompany),
    }),
  );
}

export async function fetchYerlesim(activeMainCompany, desenId) {
  return unwrap(
    await apiGet(`/desen/records/${encodeURIComponent(desenId)}/yerlesim`, {
      mainCompanySlug: requireCompanySlug(activeMainCompany),
    }),
  );
}

export async function saveYerlesim(activeMainCompany, desenId, payload) {
  return unwrap(
    await apiPost(`/desen/records/${encodeURIComponent(desenId)}/yerlesim`, {
      ...payload,
      mainCompanySlug: requireCompanySlug(activeMainCompany),
    }),
  );
}

export async function parseKalipFileName(activeMainCompany, desenId, fileName) {
  return unwrap(
    await apiPost(
      `/desen/records/${encodeURIComponent(desenId)}/kalip-yerlesim/parse-file-name`,
      {
        mainCompanySlug: requireCompanySlug(activeMainCompany),
        fileName,
      },
    ),
  );
}

export async function nextKalipCode(activeMainCompany, desenId, kalipEbatti) {
  return unwrap(
    await apiPost(
      `/desen/records/${encodeURIComponent(desenId)}/kalip-yerlesim/next-code`,
      {
        mainCompanySlug: requireCompanySlug(activeMainCompany),
        kalipEbatti,
      },
    ),
  );
}

export async function fetchKalipYerlesim(activeMainCompany, desenId) {
  return unwrap(
    await apiGet(
      `/desen/records/${encodeURIComponent(desenId)}/kalip-yerlesim`,
      {
        mainCompanySlug: requireCompanySlug(activeMainCompany),
      },
    ),
  );
}

export async function saveKalipYerlesim(activeMainCompany, desenId, payload) {
  return unwrap(
    await apiPost(
      `/desen/records/${encodeURIComponent(desenId)}/kalip-yerlesim`,
      {
        ...payload,
        mainCompanySlug: requireCompanySlug(activeMainCompany),
      },
    ),
  );
}

export async function approveKalipCard(
  activeMainCompany,
  desenId,
  kalipId,
  cardId,
) {
  return unwrap(
    await apiPost(
      `/desen/records/${encodeURIComponent(desenId)}/kalip-yerlesim/${encodeURIComponent(kalipId)}/approve-card`,
      {
        mainCompanySlug: requireCompanySlug(activeMainCompany),
        cardId,
      },
    ),
  );
}

export async function approveAllKalipCards(
  activeMainCompany,
  desenId,
  kalipId,
) {
  return unwrap(
    await apiPost(
      `/desen/records/${encodeURIComponent(desenId)}/kalip-yerlesim/${encodeURIComponent(kalipId)}/approve-all`,
      {
        mainCompanySlug: requireCompanySlug(activeMainCompany),
      },
    ),
  );
}
