// İmalat model görseli önce doğrulanmış URI, sonra File Hub dosya kimliğiyle çözülür.
// Opaque "preview"/isim/boş değer API adresiymiş gibi gösterilmez.
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i;
export function productionImagePath(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (FILE_ID.test(raw)) return `/api/file-hub/files/${encodeURIComponent(raw)}/preview`;
  if (/^(?:https?:\/\/|blob:|data:image\/)/i.test(raw)) return raw;
  if (raw.startsWith("//") || /^(?:javascript|file):/i.test(raw)) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (/^[a-z0-9][\w./%-]*$/i.test(raw) && IMAGE_EXTENSION.test(raw)) return raw;
  return "";
}
