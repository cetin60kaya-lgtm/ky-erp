function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nestedImageValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return (
    stringValue(value.url) ||
    stringValue(value.src) ||
    stringValue(value.href) ||
    stringValue(value.previewUrl) ||
    stringValue(value.thumbnailUrl)
  );
}

export function getModelImageSource(model) {
  if (!model || typeof model !== "object") return "";

  const raw = model.raw && typeof model.raw === "object" ? model.raw : {};
  const candidates = [
    model.imageUrl,
    model.imageURL,
    model.thumbnailUrl,
    model.thumbnailURL,
    model.desenImageThumb,
    model.previewUrl,
    model.gorselUrl,
    model.gorselURL,
    model.image,
    model.thumbnail,
    raw.imageUrl,
    raw.imageURL,
    raw.thumbnailUrl,
    raw.thumbnailURL,
    raw.desenImageThumb,
    raw.previewUrl,
    raw.gorselUrl,
    raw.gorselURL,
    raw.image,
    raw.thumbnail,
  ];

  for (const candidate of candidates) {
    const direct = stringValue(candidate);
    if (direct) return direct;
    const nested = nestedImageValue(candidate);
    if (nested) return nested;
  }

  return "";
}

export default getModelImageSource;