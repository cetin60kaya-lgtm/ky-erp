export function legacyAuthPath() {
  // Production auth artik yalniz canonical /api/auth/* rotalarini kullanir.
  // Eski /api/auth/v2/* fallback'i ikinci POST/challenge ve yanlis 404/405
  // siniflandirmasi uretebildigi icin kalici olarak kapatilmistir.
  return "";
}

export function shouldTryLegacyAuth() {
  return false;
}
