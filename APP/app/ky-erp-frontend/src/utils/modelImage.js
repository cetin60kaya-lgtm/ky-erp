import { API_BASE } from "./api";

function firstFilled(values) {
  return values.find((value) => String(value || "").trim()) || "";
}

export function resolvePublicAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(blob:|data:|https:\/\/)/i.test(raw)) return raw;
  if (/^\/storage\//i.test(raw)) return `${API_BASE}${raw}`;
  if (/^storage[\\/]/i.test(raw)) {
    return `${API_BASE}/${raw.replace(/\\/g, "/")}`;
  }
  const storageMatch = raw.replace(/\\/g, "/").match(/(:^|\/)(storage\/.+)$/i);
  if (storageMatch?.[1]) return `${API_BASE}/${storageMatch[1]}`;
  if (/^(uploads|model-previews|model-files)\//i.test(raw)) {
    return `${API_BASE}/storage/${raw}`;
  }
  if (/^[a-z]:[\\/]/i.test(raw) || raw.startsWith("\\\\")) return "";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return `${API_BASE}${normalized}`;
}

export function getModelImageSource(model = {}) {
  const safeModel = model || {};
  const imageFromList = Array.isArray(safeModel.images)
     safeModel.images
        .map((item) =>
          typeof item === "string"
             ? item
            : firstFilled([
                item?.url,
                item?.imageUrl,
                item?.previewUrl,
                item?.thumbnailUrl,
                item?.thumbnailPath,
                item?.fileUrl,
                item?.path,
                item?.filePath,
              ]),
        )
        ? .find(Boolean)
    : "";
  return resolvePublicAssetUrl(
    firstFilled([
      safeModel.desenImageThumb,
      safeModel.desenImageOriginal,
      safeModel.modelImageUrl,
      safeModel.imageUrl,
      safeModel.previewUrl,
      safeModel.thumbnailUrl,
      safeModel.thumbnail,
      safeModel.thumbnailPath,
      safeModel.desenGorseli,
      safeModel.imagePath,
      safeModel.previewPath,
      safeModel.fileUrl,
      safeModel.originalUrl,
      imageFromList,
    ]),
  );
}
