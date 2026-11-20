// Safe, stable error classification for NetteFatura portal access.
// Never forward raw provider HTML, usernames, cookies, passwords, or IDs to UI/logs.
export function classifyIsnetPortalFailure(error: unknown) {
  const reason = String(error instanceof Error ? error.message : "").toLocaleLowerCase("tr-TR");
  const formUnavailable = /giriş sayfası|doğrulama anahtarı|zaman aşımı|timeout|fetch failed|network/i.test(reason);
  const companyUnverified = /firma listesi|yetkili firma|yetki listesi/i.test(reason);
  const selectionUnverified = /firma seçimi|firma oturumu|oturumu doğrulanamadı/i.test(reason);
  const securityChallenge = /ek güvenlik|captcha|doğrulama kodu/i.test(reason);
  if (formUnavailable) return {
    code: "ISNET_PORTAL_FORM_UNAVAILABLE",
    message: "İşNet giriş formuna KY ERP bulut sunucusundan erişilemedi. Şifre yanlış olarak değerlendirilmedi.",
  };
  if (companyUnverified) return {
    code: "ISNET_PORTAL_COMPANIES_UNVERIFIED",
    message: "İşNet portalında yetkili firma listesi alınamadı. Oturum ve çerez doğrulaması gerekli.",
  };
  if (selectionUnverified) return {
    code: "ISNET_PORTAL_COMPANY_SESSION_UNVERIFIED",
    message: "Firma seçimi veya portal oturumu doğrulanamadı. Kaydedilmiş firma kaydı korunuyor.",
  };
  if (securityChallenge) return {
    code: "ISNET_PORTAL_SECURITY_CHALLENGE",
    message: "İşNet ek güvenlik doğrulaması istiyor; otomatik oturum doğrulanamadı.",
  };
  return {
    code: "ISNET_PORTAL_SESSION_UNVERIFIED",
    message: "İşNet bulut portal oturumu doğrulanamadı. Şifrenin yanlış olduğu kanıtlanmadı.",
  };
}
