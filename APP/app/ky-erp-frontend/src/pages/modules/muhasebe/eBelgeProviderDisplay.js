export function providerDisplayStatus(provider = {}) {
  const key = String(provider.key || "").toUpperCase();
  const status = String(provider.status || "UNKNOWN").toUpperCase();
  if (key === "ISNET") {
    const connected = provider.connected === true && status === "CONNECTED";
    const descriptions = {
      CONFIGURED: "AYARLI · DOĞRULANMADI",
      UNVERIFIED: "DOĞRULANAMADI",
      SESSION_INVALID: "OTURUM GEÇERSİZ",
      SESSION_EXPIRED: "OTURUM SÜRESİ DOLMUŞ",
      TIMEOUT: "DOĞRULAMA ZAMAN AŞIMI",
      VERIFYING: "DOĞRULANIYOR",
      ERROR: "BAĞLANTI HATASI",
      NOT_CONFIGURED: "BAĞLI DEĞİL",
    };
    return { active: connected, label: connected ? "BAĞLI" : descriptions[status] || "DOĞRULANAMADI" };
  }
  if (key === "MANUAL") {
    const active = ["XML_ACTIVE_OCR_NOT_CONFIGURED", "OCR_ACTIVE"].includes(status);
    return { active, label: status === "OCR_ACTIVE" ? "XML + OCR HAZIR" : active ? "YALNIZ XML HAZIR" : "KULLANILAMAZ" };
  }
  return { active: false, label: status === "READY_FOR_ADAPTER" ? "ADAPTÖR BEKLİYOR" : "BAĞLI DEĞİL" };
}
