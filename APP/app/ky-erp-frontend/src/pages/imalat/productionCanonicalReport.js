// İmalat raporu tek gerçek merkezden: model, üretim fişi ve kanonik belge bağları.
// Raporlama yan etkisizdir: stok, cari, KDV veya fatura hareketi oluşturmaz.
const value = (x) => String(x ?? "").trim();
const num = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;
const search = (x, q) => value(x).toLocaleUpperCase("tr-TR").includes(value(q).toLocaleUpperCase("tr-TR"));
const group = (array, key) => {
  const result = new Map();
  for (const row of array) {
    const id = key(row);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
  }
  return [...result.entries()];
};
function dateOnly(x) { return value(x).slice(0, 10); }
function inDate(date, filters) {
  if (!date) return !filters.baslangic && !filters.bitis;
  return (!filters.baslangic || date >= filters.baslangic) &&
    (!filters.bitis || date <= filters.bitis);
}
function statusLabel(status, hasEntry, planned, produced) {
  if (["OVER_PRODUCTION", "OVER_INVOICED", "MODEL_WAITING"].includes(status)) return "Kontrol Gerekli";
  if (planned <= 0) return hasEntry ? "Kontrol Gerekli" : "Bekliyor";
  if (!hasEntry) return "Bekliyor";
  if (produced > planned) return "Kontrol Gerekli";
  return produced >= planned ? "Tamam" : "Eksik Operasyon";
}

export function buildProductionCanonicalReport(payload = {}, filters = {}) {
  const cards = Array.isArray(payload.rows) ? payload.rows : [];
  const machines = Array.isArray(payload.machines) ? payload.machines : [];
  const now = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  const records = [];
  const auditRows = [];
  const regionRows = [];
  const activeModels = new Set();
  const completedModelIds = new Set();
  for (const card of cards) {
    if ((filters.firma && !search(card.companyName, filters.firma)) ||
        (filters.model && !search(card.modelName, filters.model))) continue;
    const entries = (Array.isArray(card.productionEntries) ? card.productionEntries : [])
      .filter((e) => inDate(dateOnly(e.date || e.createdAt), filters))
      .filter((e) => !filters.partiNo || search(e.batchNo || e.dispatchNo, filters.partiNo))
      .filter((e) => !filters.makine || search([e.machineId, e.machineName].join(" "), filters.makine))
      .filter((e) => !filters.makinaci || search(e.operatorName, filters.makinaci))
      .filter((e) => !filters.vardiya || search(e.shift, filters.vardiya))
      .filter((e) => !filters.baskiBolgesi || search(e.printArea, filters.baskiBolgesi));
    const hasRecordFilters = ["baslangic", "bitis", "partiNo", "makine", "makinaci", "vardiya", "baskiBolgesi"]
      .some((key) => Boolean(filters[key]));
    if (hasRecordFilters && !entries.length) continue;
    if (entries.length) activeModels.add(value(card.id));
    if (num(card.incomingQty) > 0 && (card.operationRows || []).length > 0 && card.operationRows.every((r) => value(r.status) === 'COMPLETED')) completedModelIds.add(value(card.id));
    for (const entry of entries) {
      records.push({
        id: value(entry.id), modelId: value(card.id),
        tarih: dateOnly(entry.date || entry.createdAt),
        firma: value(card.companyName), model: value(card.modelName),
        partiNo: value(entry.batchNo || entry.dispatchNo) || "GENEL",
        baskiBolgesi: value(entry.printArea) || "Belirtilmedi",
        basilan: num(entry.grossQty), net: num(entry.netQty),
        baskiSakati: num(entry.printDefectQty), kumasSakati: num(entry.fabricDefectQty),
        makineNo: value(entry.machineId), makineAdi: value(entry.machineName),
        vardiya: value(entry.shift), makinaci: value(entry.operatorName),
        zemin: value(entry.raw?.ground || card.groundColor),
        durum: value(card.status),
      });
    }
    const wantedRegions = (card.printRegions || []).map((r) => value(r.regionName || r.name)).filter(Boolean);
    const regions = [...new Set([...wantedRegions, ...entries.map((e) => value(e.printArea)).filter(Boolean)])];
    if (!regions.length) regions.push("Genel");
    for (const region of regions) {
      if (filters.baskiBolgesi && !search(region, filters.baskiBolgesi)) continue;
      const matching = entries.filter((e) => (value(e.printArea) || "Genel") === region);
      if (hasRecordFilters && !matching.length) continue;
      const planned = num(card.incomingQty);
      const produced = matching.reduce((s, e) => s + num(e.grossQty), 0);
      const latest = matching[0] || {};
      const durum = statusLabel(card.status, matching.length > 0, planned, produced);
      const row = {
        id: value(card.id) + ":" + region, modelId: value(card.id),
        model: value(card.modelName), firma: value(card.companyName),
        modelImageUrl: value(card.imageUrl), partiNo: value(latest.batchNo || latest.dispatchNo) || "GENEL",
        baskiBolgesi: region, planlanan: planned, basilan: produced,
        eksik: Math.max(0, planned - produced), makineNo: value(latest.machineId),
        makineAdi: value(latest.machineName), makinaci: value(latest.operatorName),
        vardiya: value(latest.shift), zemin: value(latest.ground || latest.raw?.ground || card.groundColor), durum,
      };
      if (!filters.durum || search(durum, filters.durum)) {
        auditRows.push(row);
        regionRows.push({ ...row, operasyonAdedi: matching.length,
          tamamlananModelAdedi: durum === "Tamam" ? 1 : 0 });
      }
    }
  }
  records.sort((a, b) => b.tarih.localeCompare(a.tarih));
  const machineRows = group(records, (row) => [row.makineNo, row.makineAdi].join("|"))
    .map(([, items]) => ({
      id: items[0].makineNo || items[0].makineAdi || "unknown",
      makineNo: items[0].makineNo, makineAdi: items[0].makineAdi,
      operasyonAdedi: items.length,
      tamamlananModelAdedi: new Set(items.filter((v) => completedModelIds.has(v.modelId)).map((v) => v.modelId)).size,
      eksik: auditRows.filter((r) => items.some((v) => v.model === r.model && v.baskiBolgesi === r.baskiBolgesi))
        .reduce((sum, r) => sum + r.eksik, 0),
    }));
  const operatorRows = group(records, (row) => [row.makinaci, row.vardiya].join("|"))
    .map(([, items]) => ({
      id: [items[0].makinaci, items[0].vardiya].join("|"),
      makinaci: items[0].makinaci, vardiya: items[0].vardiya,
      operasyonAdedi: items.length, basilanBolgeAdedi: new Set(items.map((e) => e.modelId + "|" + e.baskiBolgesi)).size,
      tamamlananModelAdedi: new Set(items.filter((v) => completedModelIds.has(v.modelId)).map((v) => v.modelId)).size,
    }));
  const activeMachines = machines.filter((m) => m.isActive !== false).length;
  const todayTotal = records.filter((r) => r.tarih === now).reduce((sum, r) => sum + r.basilan, 0);
  const auditSummary = {
    acikParti: auditRows.filter((r) => r.durum !== "Tamam" && (r.planlanan > 0 || r.basilan > 0)).length,
    kontrolGereken: auditRows.filter((r) => r.durum === "Kontrol Gerekli").length,
    eksikBolge: auditRows.filter((r) => r.durum === "Eksik Operasyon").length,
    bugunBasilanAdet: todayTotal,
  };
  return {
    audit: { summary: auditSummary, rows: auditRows },
    report: {
      summary: {
        eksikOperasyon: auditSummary.eksikBolge,
        bugunBasilanAdet: todayTotal,
        aktifMakine: activeMachines,
        tamamlananModelAdedi: new Set(auditRows.map((r) => r.modelId).filter((id) => completedModelIds.has(id))).size,
        secilenFiltreUretimAdedi: records.reduce((sum, r) => sum + r.basilan, 0),
      },
      machineRows, operatorRows, modelRows: regionRows, rows: records,
    },
    modelCount: activeModels.size,
  };
}
