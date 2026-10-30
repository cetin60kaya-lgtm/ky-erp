// Muhasebe'deki aktif Cari/Firma kartları. Firma türü otomatik dönüştürülmez.
export function selectableProductionCompanies(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id && row?.isActive !== false && row?.is_active !== 0)
    .filter((row) => !row?.deletedAt && !row?.deleted_at)
    .sort((a, b) => String(a?.name || a?.firmaAdi || "").localeCompare(
      String(b?.name || b?.firmaAdi || ""), "tr",
    ));
}
