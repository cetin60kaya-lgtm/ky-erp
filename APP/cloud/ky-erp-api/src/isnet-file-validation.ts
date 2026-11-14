/**
 * Provider portal responses can be a 200 HTML login page or JSON error even
 * at a guessed PDF/XML download route. No opaque response is archived until
 * its bytes prove the expected format.
 * Does not validate invoice authenticity or certify the endpoint itself.
 */
export type IsnetFileFormat = "pdf" | "xml";
export const MAX_ISNET_DOCUMENT_BYTES = 40 * 1024 * 1024;

export function verifyIsnetDownloadedFile(
  format: IsnetFileFormat,
  buffer: ArrayBuffer,
  responseContentType: string,
): string {
  const bytes = new Uint8Array(buffer);
  const mime = String(responseContentType || "").toLowerCase();
  if (!bytes.length || bytes.length > MAX_ISNET_DOCUMENT_BYTES) {
    throw new Error("İşNet belge dosyası boş veya izin verilen boyutun üzerinde.");
  }
  if (/text\/html|application\/(?:json|javascript)/i.test(mime)) {
    throw new Error("İşNet PDF/XML yerine oturum veya hata sayfası döndürdü.");
  }
  const prefix = new TextDecoder("utf-8").decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const normalized = prefix.replace(/^\uFEFF/, "").trimStart();

  if (format === "pdf") {
    if (!normalized.startsWith("%PDF-") || !/^%PDF-\d\.\d/.test(normalized)) {
      throw new Error("İşNet yanıtı gerçek PDF başlığı taşımıyor; arşive alınmadı.");
    }
    return "application/pdf";
  }

  // Only the two official document roots understood by the UBL-TR
  // canonical importer are accepted. Never treat a login HTML, ZIP
  // or service exception as XML document content.
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(prefix) ||
      !/^(?:<\?xml\b[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z0-9_.-]+:)?(?:Invoice|DespatchAdvice)\b/i.test(normalized)) {
    throw new Error("İşNet yanıtı UBL-TR fatura/irsaliye XML'i değil; arşive alınmadı.");
  }
  return "application/xml";
}
