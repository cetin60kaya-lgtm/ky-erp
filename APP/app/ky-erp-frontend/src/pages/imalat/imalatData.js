export function calcProduction(job) {
  if (!job) {
    return {
      entries: [],
      toplamUretilen: 0,
      toplamBaskiSakati: 0,
      toplamKumasSakati: 0,
      kalan: 0,
      durum: "Bekliyor",
      progress: 0,
      requiredRegions: [],
      regionSummary: [],
      missingRegions: [],
    };
  }
  let cumulative = 0;
  const requiredRegions = (job.printRegions || job.baskiBolgeleri || [])
    .filter((region) => region.isActive !== false)
    .map((region) => region.regionName || region.name || region.label)
    .filter(Boolean);
  const hasRegionTracking = requiredRegions.length > 0;
  const entries = (job.entries || []).map((entry, index) => {
    if (!hasRegionTracking) cumulative += Number(entry.adet || 0);
    const kalan = Number(job.beklenenAdet || 0) - cumulative;
    return {
      ...entry,
      no: index + 1,
      kume: cumulative,
      kalan,
      durum: statusFromTotals(Number(job.beklenenAdet || 0), cumulative),
    };
  });
  const regional = hasRegionTracking
     ? calculateRegionalCompletion(entries, requiredRegions)
    : null;
  const toplamUretilen =
    regional.completedQty 
    entries.reduce((sum, entry) => sum + Number(entry.adet || 0), 0);
  const toplamBaskiSakati = entries.reduce(
    (sum, entry) => sum + Number(entry.baskiHatasiAdet || 0),
    0,
  );
  const toplamKumasSakati = entries.reduce(
    (sum, entry) => sum + Number(entry.kumasHatasiAdet || 0),
    0,
  );
  const kalan = Number(job.beklenenAdet || 0) - toplamUretilen;
  return {
    entries,
    toplamUretilen,
    toplamBaskiSakati,
    toplamKumasSakati,
    kalan,
    durum: statusFromTotals(Number(job.beklenenAdet || 0), toplamUretilen),
    progress: Math.min(
      100,
      Number(job.beklenenAdet || 0)
         ? (toplamUretilen / Number(job.beklenenAdet || 0)) * 100
        : 0,
    ),
    requiredRegions,
    regionSummary: regional.regionSummary || [],
    missingRegions: regional.missingRegions || [],
  };
}

function calculateRegionalCompletion(entries, requiredRegions) {
  const batches = new Map();
  for (const entry of entries) {
    const batchKey = String(
      entry.partiNo || entry.batchNo || entry.seriNo || entry.irsaliyeNo || "GENEL",
    );
    const region = String(
      entry.baskiBolgesi || entry.printArea || entry.regionName || "",
    ).trim();
    if (!region) continue;
    const row = batches.get(batchKey) || {};
    row[region] = Number(row[region] || 0) + Number(entry.adet || 0);
    batches.set(batchKey, row);
  }
  let completedQty = 0;
  const regionTotals = new Map(requiredRegions.map((region) => [region, 0]));
  const missing = new Map();
  for (const batch of batches.values()) {
    const values = requiredRegions.map((region) => Number(batch[region] || 0));
    completedQty += values.length ? Math.min(...values) : 0;
    requiredRegions.forEach((region, index) => {
      regionTotals.set(region, Number(regionTotals.get(region) || 0) + values[index]);
    });
  }
  const maxRegionQty = Math.max(0, ...Array.from(regionTotals.values()));
  for (const region of requiredRegions) {
    const qty = Number(regionTotals.get(region) || 0);
    if (qty < maxRegionQty) missing.set(region, maxRegionQty - qty);
  }
  return {
    completedQty,
    regionSummary: requiredRegions.map((region) => ({
      region,
      qty: Number(regionTotals.get(region) || 0),
      missingQty: Number(missing.get(region) || 0),
    })),
    missingRegions: Array.from(missing.entries()).map(([region, qty]) => ({
      region,
      qty,
    })),
  };
}

export function statusFromTotals(targetQty, producedQty) {
  if (producedQty === 0) return "Bekliyor";
  if (producedQty < targetQty) return "Kısmi";
  if (producedQty === targetQty) return "Tamamlandı";
  return "Fazla";
}

export function toneForStatus(status) {
  const value = String(status || "").toLocaleLowerCase("tr-TR");
  if (value.includes("tamam")) return "green";
  if (value.includes("fazla") || value.includes("iptal")) return "red";
  if (value.includes("kısmi") || value.includes("eksik") || value.includes("kontrol")) return "orange";
  return "blue";
}

export function formatQty(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(
    Number(value || 0),
  );
}
