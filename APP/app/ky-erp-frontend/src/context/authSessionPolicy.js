const SESSION_INVALID_CODES = new Set([
  "UNAUTHORIZED",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "SESSION_INVALID",
  "INVALID_SESSION",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "AUTH_SESSION_INVALID",
]);

export function shouldClearStoredAuthForStatus(status, code = "", requestPath = "") {
  if (Number(status || 0) !== 401) return false;

  const normalizedCode = String(code || "").trim().toUpperCase();
  const rawPath = String(requestPath || "").trim();

  if (SESSION_INVALID_CODES.has(normalizedCode)) return true;

  // AuthContext'in doğrudan /auth/me restore kontrolü eski çağrı imzasıyla
  // yalnız status gönderebilir. Başka bağlam bilgisi hiç yoksa bu 401 mevcut
  // saklı oturumun doğrulanamadığı anlamına gelir ve temizlenmelidir.
  if (!normalizedCode && !rawPath) return true;

  // /auth/me doğrudan mevcut tokenın geçerlilik sözleşmesidir.
  // Buradaki 401, payload code eksik olsa bile mevcut oturumun artık geçerli
  // olmadığını kanıtlar. Diğer iş/MFA endpointlerinin 401 cevapları ise
  // yanlış kod, step-up, challenge vb. olabilir ve tüm uygulamadan çıkarmamalıdır.
  const path = rawPath.split("?")[0].replace(/^https?:\/\/[^/]+/i, "");
  return /\/(?:api\/)?auth\/me$/i.test(path);
}

export function isSessionInvalidCode(code) {
  return SESSION_INVALID_CODES.has(String(code || "").trim().toUpperCase());
}
