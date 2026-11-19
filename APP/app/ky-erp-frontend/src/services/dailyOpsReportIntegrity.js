/**
 * Günlük Operasyon log and financial report contract.
 * A log row belongs to the selected WORK date; the action timestamp is only a
 * display value. Date scope cannot be inferred from createdAt.
 */
export function dailyWorkDateInRange(row, start, end) {
  const value = String(row?.workDate || row?.date || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Boolean(start && end && start <= end)
    && value >= start && value <= end;
}

/**
 * D1 weekly summary is authoritative for money; attendance is authoritative
 * only for the day/night matrix and check marks.
 * Missing financial rows are identified, never silently called verified net.
 */
export function reconcileDailyWeeklyReport(matrixRows, financialRows) {
  if (!Array.isArray(matrixRows) || !Array.isArray(financialRows))
    throw new Error("Haftalık mali sonuç için sunucudan geçersiz veri alındı.");
  const byId = new Map();
  for (const row of matrixRows) {
    const id = String(row.employeeId || "");
    if (id) byId.set(id, { ...row, baseAmount: Number(row.totalAmount || 0),
      additions: 0, deductions: 0, financialVerified: false });
  }
  for (const row of financialRows) {
    const id = String(row.employeeId || "");
    if (!id) throw new Error("Haftalık mali sonuçta personel kimliği eksik.");
    const baseAmount = Number(row.baseAmount ?? 0);
    const additions = Number(row.additions ?? 0);
    const deductions = Number(row.deductions ?? 0);
    const netAmount = Number(row.totalAmount ?? row.total);
    const hasShiftTotals = row.dayTotal != null && row.nightTotal != null;
    const dayTotal = Number(hasShiftTotals ? row.dayTotal : byId.get(id)?.dayTotal ?? 0);
    const nightTotal = Number(hasShiftTotals ? row.nightTotal : byId.get(id)?.nightTotal ?? 0);
    if (![baseAmount, additions, deductions, netAmount, dayTotal, nightTotal].every(Number.isFinite)
        || baseAmount < 0 || additions < 0 || deductions < 0 || dayTotal < 0 || nightTotal < 0)
      throw new Error("Haftalık mali sonuçta geçersiz tutar var.");
    const cents = (value) => Math.round(value * 100);
    if (hasShiftTotals && Math.abs(cents(dayTotal) + cents(nightTotal) - cents(baseAmount)) > 1)
      throw new Error("D1 gündüz/gece alt toplamı baz hakedişle uyuşmuyor.");
    if (cents(baseAmount) + cents(additions) - cents(deductions) !== cents(netAmount))
      throw new Error("Haftalık ek ödeme/kesinti tutarı net hakedişle uyuşmuyor.");
    const old = byId.get(id) || {};
    if (byId.has(id)) {
      // Haftalık yazdırmada vardiya sayısı ve baz hakediş iki ayrı kaynaktan
      // farklı geliyorsa yanlış çıktıyı engelle; kişi kartındaki güncel
      // ücretten geçmiş çalışma tutarı tahmin edilmez.
      const dayCount = Number(row.dayCount ?? old.dayCount ?? 0);
      const nightCount = Number(row.nightCount ?? old.nightCount ?? 0);
      if (![dayCount, nightCount].every(Number.isSafeInteger) || dayCount < 0 || nightCount < 0
        || dayCount !== Number(old.dayCount ?? 0) || nightCount !== Number(old.nightCount ?? 0))
        throw new Error("Haftalık vardiya sayıları D1 hakediş özetiyle uyuşmuyor.");
      const matrixCents = Math.round(Number(old.totalAmount ?? 0) * 100);
      if (!Number.isFinite(matrixCents)
        || Math.abs(matrixCents - Math.round(baseAmount * 100)) > 1)
        throw new Error("Gündüz/gece ücret toplamı D1 baz hakedişiyle uyuşmuyor.");
    }
    byId.set(id, {
      ...old,
      employeeId: id,
      name: old.name || row.name || row.fullName || "Personel",
      role: old.role || row.qualification || "-",
      personnelNo: old.personnelNo || row.personnelNo || "",
      days: old.days || {},
      dayCount: Number(row.dayCount ?? old.dayCount ?? 0),
      nightCount: Number(row.nightCount ?? old.nightCount ?? 0),
      dayTotal, nightTotal,
      baseAmount, additions, deductions, totalAmount: netAmount,
      financialVerified: true,
    });
  }
  return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
}

/** A4 yatay haftalık listede 26 kişiden fazlası kesilmeden ayrı sayfaya geçer. */
export function paginateDailyPrintRows(rows, perPage = 26) {
  if (!Array.isArray(rows)) throw new Error("Yazdırılacak personel listesi geçersiz.");
  const size = Math.max(1, Math.min(50, Math.trunc(Number(perPage)) || 26));
  const result = [];
  for (let start = 0; start < rows.length; start += size) result.push(rows.slice(start, start + size));
  return result;
}
