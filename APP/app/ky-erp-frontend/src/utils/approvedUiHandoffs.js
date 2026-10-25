// KY ERP onaylı HTML tasarımından gerçek modüllere güvenli işlem geçişleri.
// Sekme anahtarları canonical moduleRegistry ile aynı tutulur.
export const MAIL_TEMPLATES_REQUEST_KEY = "kyerp:mail-templates:open";

export function getPdksCompanyId(company) {
  const value = company?.slug ?? company?.id;
  return value == null ? "" : String(value).trim();
}

export function buildSecurityInstallUrl(platform) {
  const url = new URL("https://security.kyerp.net/ky-guvenlik/");
  url.searchParams.set("install", "1");
  url.searchParams.set("platform", platform === "ios" ? "ios" : "android");
  return url.toString();
}

export function queueMailTemplatesOpen(storage) {
  try {
    storage?.setItem(MAIL_TEMPLATES_REQUEST_KEY, "1");
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function consumeMailTemplatesOpen(storage) {
  try {
    if (storage?.getItem(MAIL_TEMPLATES_REQUEST_KEY) !== "1") return false;
    storage.removeItem(MAIL_TEMPLATES_REQUEST_KEY);
    return true;
  } catch {
    return false;
  }
}
