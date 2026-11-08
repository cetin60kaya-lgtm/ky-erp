/**
 * Eski XLSM_IMPORT / canonical model kayıtlarında logs alanı gelmeyebilir.
 * Model ayrıntıları bu alanın yokluğu yüzünden React hata ekranına düşmemeli.
 * Gerçek olaylara dokunulmaz; eksik günlük için kayıt uydurulmaz.
 */
export function safeModelLogRows(value) {
  return Array.isArray(value)
    ? value.filter((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry))
    : [];
}
