// Deterministic routing helpers. No AI inference and no automatic mail submission.
const normalized = (value) => String(value || "").trim().toUpperCase().replace(/\u0130/g, "I");
export const documentKey = (value) => normalized(value).replace(/[^A-Z0-9]/g, "");

export function matchingPdfFiles(files, number, prefix) {
  const wanted = documentKey(number);
  if (!new RegExp("^" + prefix + "[0-9]{8,18}$").test(wanted)) return [];
  return (Array.isArray(files) ? files : []).filter((file) => {
    const name = String(file?.file_name || file?.fileName || "").trim();
    const doc = normalized(name).match(new RegExp("^" + prefix + "[0-9]{8,18}(?![0-9])"));
    return Boolean(doc && doc[0] === wanted && /\.pdf$/i.test(name)
      && normalized(file?.status) === "AVAILABLE");
  });
}

export function matchingRecipientRoutes(routes, groupCode, plannerName = "") {
  const group = normalized(groupCode).replace(/\s+/g, "");
  const planner = normalized(plannerName).replace(/\s+/g, " ");
  const matches = (Array.isArray(routes) ? routes : []).filter((row) =>
    normalized(row?.groupCode).replace(/\s+/g, "") === group);
  return planner ? matches.filter((row) => normalized(row?.plannerName).replace(/\s+/g, " ") === planner) : matches;
}

export function parseRecipientEmails(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/);
  const emails = source.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  if (!emails.length || emails.length > 12 || emails.some((item) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(item))) {
    throw new Error("Alıcı e-posta adreslerini kontrol edin.");
  }
  return [...new Set(emails)];
}

export function makeInvoiceMailContent(modelName, invoiceNo, deliveryNo) {
  const model = String(modelName || "").trim();
  const hkn = documentKey(invoiceNo);
  const ddm = documentKey(deliveryNo);
  if (!/^HKN[0-9]{8,18}$/.test(hkn) || !/^DDM[0-9]{8,18}$/.test(ddm) || !model) {
    throw new Error("Model, HKN fatura ve DDM irsaliye numarası zorunludur.");
  }
  return {
    subject: model + " MODEL FTR VE İRS",
    bodyText: "Merhaba,\n\n" + model + " modelimizin " + hkn + " numaralı faturası ve " + ddm + " numaralı irsaliyesi ektedir.\n\nİyi çalışmalar.",
  };
}
