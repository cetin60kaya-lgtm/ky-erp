/**
 * File Hub yönetiminde geçerli oturumun kendi ana firma bağlamını esas al.
 * Genel uygulama sahibi başka firma adına seçilmiş tenant parametresiyle işlem yapamaz.
 * Roller yalnız getAuthenticatedUser tarafından doğrulanan sunucu oturumundan alınır.
 */
const text = (value: unknown) => value == null ? "" : String(value).trim();
const roleOf = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const slugOf = (value: unknown) => text(value).toLowerCase(); // Firma slug'ı ASCII/URL anahtarıdır; tr-TR dotless-I kullanma.

/** Firma içi okuma yetkisi: kullanıcının doğrulanmış oturumundaki firma kimliği esas alınır.
 * İstek başlığı, URL veya JSON gövdesindeki ana firma seçimi yetki vermez.
 */
export function canReadOwnCompanyStorage(user: Record<string, any> | null | undefined, requestedCompanySlug: unknown): boolean {
  if (!user) return false;
  const signedCompanySlug = slugOf(user.mainCompanySlug || user.main_company_slug || user.security?.main_company_slug);
  const requestedSlug = slugOf(requestedCompanySlug);
  return Boolean(signedCompanySlug && requestedSlug && signedCompanySlug === requestedSlug);
}

export function canManageOwnCompanyStorage(user: Record<string, any> | null | undefined, requestedCompanySlug: unknown): boolean {
  if (!user || !["COMPANY_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(roleOf(user.role))) return false;
  const signedCompanySlug = slugOf(user.mainCompanySlug || user.main_company_slug || user.security?.main_company_slug);
  const selectedCompanySlug = slugOf(requestedCompanySlug);
  return Boolean(signedCompanySlug && selectedCompanySlug && signedCompanySlug === selectedCompanySlug);
}
