/**
 * One canonical e-document can have both an original provider PDF and UBL XML.
 * Prefer neither synthesized PDFs nor unrelated attachments for original slots.
 */
export function selectOriginalEBelgeFiles(value) {
  const files = Array.isArray(value) ? value.filter((file) => file && file.id) : [];
  const ext = (file) => {
    const name = String(file.file_name || file.fileName || "");
    return name.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || String(file.extension || file.ext || "").toUpperCase();
  };
  const pdf = files.find((file) => ext(file) === "PDF") || null;
  const xml = files.find((file) => ext(file) === "XML") || null;
  const other = files.filter((file) => file.id !== pdf?.id && file.id !== xml?.id);
  return { pdf, xml, other };
}
