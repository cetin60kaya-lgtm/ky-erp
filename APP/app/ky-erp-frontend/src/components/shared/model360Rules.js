// Model id is canonical. A document may belong to several models; never infer
// a model by matching a whole document's name or by splitting its total amount.
const normalized = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
export const MODEL360_TABS = [
  ["general", "Genel"], ["design", "DESEN"], ["production", "İmalat"],
  ["dyehouse", "Boyahane"], ["documents", "Muhasebe & Belgeler"],
  ["mail", "Fatura Mail"], ["history", "İşlem Geçmişi"],
];
const elevated = new Set(["SUPER_ADMIN", "ADMIN", "OWNER", "COMPANY_OWNER", "COMPANY_ADMIN"]);
const sections = {
  design: ["DESEN"], production: ["URETIM", "IMALAT"],
  dyehouse: ["BOYAHANE"], documents: ["MUHASEBE", "E-BELGE"],
  mail: ["MUHASEBE", "ILETISIM"],
};
export function model360Access(user, section, write = false) {
  if (!user) return false;
  if (elevated.has(normalized(user.role))) return true;
  const keys = sections[section] || [];
  if (section === "general" || section === "history") return Boolean(
    Object.keys(sections).some((name) => model360Access(user, name, false)));
  return (Array.isArray(user.permissions) ? user.permissions : []).some((p) => {
    if (!keys.includes(normalized(p.moduleKey || p.module_key))) return false;
    return write
      ? Boolean(p.canCreate ?? p.can_create ?? p.canUpdate ?? p.can_update ?? p.canWrite ?? p.can_write)
      : Boolean(p.canView ?? p.can_view ?? p.canCreate ?? p.can_create ?? p.canUpdate ?? p.can_update);
  });
}
export function model360LinkedInvoices(items) {
  return (Array.isArray(items) ? items : [])
    .filter((row) => normalized(row.kind) === "FATURA" && normalized(row.direction) === "OUTGOING"
      && /^HKN[0-9]{8,18}$/.test(normalized(row.number)))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
export function model360DeliveryForInvoice(invoice, items) {
  const related = new Set((invoice?.relatedDocuments || []).map((row) => String(row.id || "")));
  const matches = (Array.isArray(items) ? items : []).filter((row) =>
    related.has(String(row.id)) && normalized(row.kind) === "IRSALIYE"
    && normalized(row.direction) === "OUTGOING"
    && /^DDM[0-9]{8,18}$/.test(normalized(row.number)));
  // Ambiguity is never resolved by "first matching" or newest file.
  return matches.length === 1 ? matches[0].number : "";
}
export function model360Warnings(model, design, documents) {
  const notes = [];
  if (model?.isVirtual) notes.push("Bu kaynak sanal model adayıdır; kesin model kartına bağlanmadan işlem yapılamaz.");
  if (!model?.imageUrl && !design?.mainImage?.previewUrl && !design?.mainImage?.thumbnailUrl)
    notes.push("Model görseli eksik. DESEN dosyalarından gerçek model görseli ekleyin.");
  if (model && Number(model.overInvoicedQty || 0) > 0) notes.push("Faturalama miktarı model sınırını aşıyor; kontrol edin.");
  if (model && Number(model.overProducedQty || 0) > 0) notes.push("Üretilen miktar gelen adedi aşıyor; kontrol edin.");
  if (Array.isArray(documents) && !documents.length) notes.push("Bu modelin doğrulanmış belge bağlantısı bulunamadı.");
  return notes;
}
