// Expose only safe, stable codes from the Google OAuth callback.
// Provider error_description, identity data and access tokens never reach UI.
const MESSAGES = Object.freeze({
  GOOGLE_OAUTH_DENIED: "Google izin ekranında erişim reddedildi. Hesap yetkisini kontrol edin.",
  GOOGLE_OAUTH_STATE_INVALID: "Google yetkilendirme oturumunun süresi doldu. Aynı hesaptan yeni bağlantı isteği başlatılabilir.",
  GOOGLE_OAUTH_CODE_INVALID: "Google tek kullanımlık onay kodu geçersiz veya süresi dolmuş. Yeni bir yetkilendirme gerekli.",
  GOOGLE_OAUTH_CLIENT_INVALID: "Google OAuth uygulama kimliği veya üretim ayarı geçersiz. Google Cloud istemci ayarları kontrol edilmeli.",
  GOOGLE_MAIL_CONFIG_MISSING: "Sunucuda Gmail OAuth uygulama ayarı eksik. Mevcut hesabı silmeyin.",
  GOOGLE_TOKEN_FAILED: "Google kodu erişim anahtarına çevirmeyi reddetti. OAuth istemci ve dönüş adresi ayarları kontrol edilmeli.",
  GOOGLE_IDENTITY_FAILED: "Google hesabının kimliği doğrulanamadı. Google OAuth izinlerini kontrol edin.",
  GOOGLE_ACCOUNT_MISMATCH: "Seçilen Google hesabının e-posta adresi bu posta kutusuyla eşleşmiyor. Aynı hesabı seçin.",
  GOOGLE_REFRESH_TOKEN_MISSING: "Google kalıcı yenileme izni vermedi. Eski bağlantı silinmedi; OAuth erişimi yeniden incelenmeli.",
  GOOGLE_GMAIL_API_DISABLED: "Gmail API, bu OAuth istemcisinin bağlı olduğu Google Cloud projesinde etkin değil. Başka bir projedeki etkin Gmail API bu istemci için geçerli değildir.",
  GOOGLE_GMAIL_FAILED: "Google hesabı seçildi fakat Gmail API posta kutusunu doğrulamadı. Gmail API'nin açık ve gerekli izinlerin verilmiş olduğundan emin olun.",
  GMAIL_CREDENTIAL_SAVE_FAILED: "Google izni alındı fakat KY ERP güvenli bağlantı kasasına kaydedilemedi. Sunucu kaydı kontrol edilmeli.",
  GMAIL_ACCOUNT_UPDATE_FAILED: "Google bağlantı bilgisi alındı fakat KY ERP hesap durumu güncellenemedi. Hesabı silmeyin.",
  GOOGLE_OAUTH_FAILED: "Gmail bağlantısı tamamlanamadı. Güvenli bağlantı kayıtları kontrol edilmeli."
});
export function gmailOAuthFeedback(params) {
  const provider = String(params?.get?.("mailProvider") || "").trim().toUpperCase();
  if (provider !== "GMAIL") return null;
  if (params?.get?.("mailConnected") === "1") return { ok:true, code:"GOOGLE_CONNECTED", text:"Google Gmail yetkilendirmesi KY ERP hesabına kaydedildi. Tam klasör senkronu henüz ayrıca doğrulanmalıdır." };
  const raw = String(params?.get?.("mailError") || "");
  if (!raw) return null;
  const code=raw.split(":")[0].trim().toUpperCase();
  return { ok:false, code: Object.hasOwn(MESSAGES, code) ? code : "GOOGLE_OAUTH_FAILED", text: MESSAGES[code] || MESSAGES.GOOGLE_OAUTH_FAILED };
}
