/**
 * File Hub yönetiminde geçerli oturumun kendi ana firma bağlamını esas al.
 * Genel uygulama sahibi başka firma adına seçilmiş tenant parametresiyle işlem yapamaz.
 * Roller yalnız getAuthenticatedUser tarafından doğrulanan sunucu oturumundan alınır.
 */
const text = (value: unknown) => value == null ? "" : String(value).trim();
const roleOf = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");
const slugOf = (value: unknown) => text(value).toLowerCase(); // Firma slug'ı ASCII/URL anahtarıdır; tr-TR dotless-I kullanma.

export function canManageOwnCompanyStorage(user: Record<string, any> | null | undefined, requestedCompanySlug: unknown): boolean {
  if (!user || !["COMPANY_ADMIN", "SUPER_ADMIN", "ADMIN"].includes(roleOf(user.role))) return false;
  const signedCompanySlug = slugOf(user.mainCompanySlug || user.main_company_slug || user.security?.main_company_slug);
  const selectedCompanySlug = slugOf(requestedCompanySlug);
  return Boolean(signedCompanySlug && selectedCompanySlug && signedCompanySlug === selectedCompanySlug);
}
