export function productionQuantityIssue(gross: number, defects: number[], incoming: number, existing: number, batch: number, allowOver: boolean) {
  if (!Number.isFinite(gross) || gross <= 0) return "Brüt üretim adedi sıfırdan büyük olmalıdır.";
  if (defects.some(value => !Number.isFinite(value) || value < 0)) return "Sakat ve test adetleri negatif olamaz.";
  if (defects.reduce((sum, value) => sum + value, 0) > gross) return "Sakat ve test toplamı brüt üretimi aşamaz.";
  if (incoming > 0 && !allowOver && existing + batch + gross > incoming) return "Bu kayıt baskı bölgesi üretimini gelen irsaliye adedinin üzerine çıkarır.";
  return "";
}

export function reserveLotKg(remaining: number, required: number) {
  if (!Number.isFinite(remaining) || !Number.isFinite(required) || required <= 0 || required > remaining + 1e-9) return null;
  return Math.max(0, remaining - required);
}

export function designJobState(current: Record<string, any> | null, hasNewPendingColor: boolean) {
  if (!current) return {status:"WAITING", priority:"NORMAL"};
  if (String(current.status || "").toUpperCase() === "COMPLETED" && hasNewPendingColor)
    return {status:"WAITING", priority:current.priority || "NORMAL", completedAt:null};
  return {status:current.status || "WAITING", priority:current.priority || "NORMAL"};
}

export function isRemovedDesignColor(sourceKey: unknown, activeKeys: Set<string>, status: unknown) {
  const key = String(sourceKey || "");
  return key.startsWith("design:") && key.length > 7 && !activeKeys.has(key.slice(7)) &&
    !["COMPLETED","CANCELLED"].includes(String(status || "").toUpperCase());
}
