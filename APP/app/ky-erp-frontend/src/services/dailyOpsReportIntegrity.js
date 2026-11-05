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
    if (![baseAmount, additions, deductions, netAmount].every(Number.isFinite))
      throw new Error("Haftalık mali sonuçta geçersiz tutar var.");
    if (Math.abs(Math.round((baseAmount + additions - deductions) * 100) - Math.round(netAmount * 100)) > 1)
      throw new Error("Haftalık ek ödeme/kesinti tutarı net hakedişle uyuşmuyor.");
    const old = byId.get(id) || {};
    byId.set(id, {
      ...old,
      employeeId: id,
      name: old.name || row.name || row.fullName || "Personel",
      role: old.role || row.qualification || "-",
      personnelNo: old.personnelNo || row.personnelNo || "",
      days: old.days || {},
      dayCount: Number(row.dayCount ?? old.dayCount ?? 0),
      nightCount: Number(row.nightCount ?? old.nightCount ?? 0),
      dayTotal: Number(old.dayTotal ?? 0),
      nightTotal: Number(old.nightTotal ?? 0),
      baseAmount, additions, deductions, totalAmount: netAmount,
      financialVerified: true,
    });
  }
  return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
}
