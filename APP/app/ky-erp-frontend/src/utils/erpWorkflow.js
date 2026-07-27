export function detectMissingFields(record = {}, requiredFields = []) {
  return requiredFields
    .filter((field) => {
      const value = record[field.key] ?? record[field.name];
      if (Array.isArray(value)) return value.length === 0;
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((field) => field.label || field.name || field.key);
}

export function getRecordStatus(record = {}, missingFields = []) {
  if (record.closed || record.status === "Kapalı" || record.durum === "Kapalı") {
    return "Kapalı";
  }
  if (missingFields.length > 0) return "Eksik Veri";
  return record.status || record.durum || "İşlem Bekliyor";
}

export function getNextAction(record = {}, actionRules = [], missingFields = []) {
  const matchedRule = actionRules.find((rule) => rule.when?.(record, missingFields));
  if (matchedRule) return matchedRule.label;
  if (missingFields.length > 0) return "Bilgiyi tamamla";
  return record.nextAction || record.siradakiAksiyon || "Kapat";
}

export function calculateDashboardStats(records = [], cards = []) {
  return cards.map((card) => ({
    ...card,
    value:
      typeof card.value === "function"
         ? card.value(records)
        : records.filter((record) => card.filter?.(record)).length,
  }));
}

export function createDraftRecord(defaults = {}) {
  return {
    id: `draft-${Date.now()}`,
    status: "Taslak",
    history: ["Taslak oluşturuldu"],
    ...defaults,
  };
}

export function saveCurrentRecord(record, updater) {
  if (typeof updater === "function") return updater(record);
  return { ...record, updatedAt: new Date().toISOString() };
}

export function runCurrentAction(record, action) {
  return {
    ...record,
    lastAction: action,
    history: [...(record.history || []), `${action} çalıştırıldı`],
  };
}

export function closeWork(record) {
  return {
    ...record,
    closed: true,
    status: "Kapalı",
    history: [...(record.history || []), "İş kapatıldı"],
  };
}

export function reopenWork(record) {
  return {
    ...record,
    closed: false,
    status: "Tekrar Açık",
    history: [...(record.history || []), "İş tekrar açıldı"],
  };
}

export function buildReportData(records = [], options = {}) {
  return {
    generatedAt: new Date().toISOString(),
    period: options.period || "Güncel",
    rows: records,
    totals: options.totals || {},
  };
}

export function handlePrintReport() {
  window.print();
}

export function handleExportReport(fileName = "ky-erp-rapor.csv", rows = []) {
  const headers = Object.keys(rows[0] || { bilgi: "Kayıt yok" });
  const body = rows.length ? rows : [{ bilgi: "Kayıt yok" }];
  const csv = [
    headers.join(";"),
    ...body.map((row) =>
      headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(";"),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  try {
    document.body.appendChild(link);
    link?.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export function getAiContextForRecord(record = {}, moduleKey = "") {
  return {
    moduleKey,
    recordId: record.id,
    status: record.status || record.durum,
    missingFields: record.missingFields || [],
    nextAction: record.nextAction,
    safeSummary: record,
  };
}

export function getAiSuggestedActions(record = {}) {
  const missingFields = record.missingFields || [];
  if (missingFields.length) {
    return [{ type: "COMPLETE_FIELDS", label: "Eksik veriyi öner", confirm: false }];
  }
  return [{ type: "NEXT_ACTION", label: record.nextAction || "Sıradaki aksiyonu öner", confirm: false }];
}

export async function runAiApprovedAction(recordId, action, payload = {}, service) {
  if (action.critical && payload?.confirm !== true) {
    throw new Error("Kritik AI işlemi kullanıcı onayı olmadan çalıştırılamaz.");
  }
  if (typeof service === "function") {
    return service(recordId, action, { ...payload, confirm: Boolean(payload?.confirm) });
  }
  return { ok: true, recordId, action, payload };
}
