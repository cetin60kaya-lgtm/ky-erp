// Model id is canonical. A document may belong to several models; never infer
// a model by matching a whole document's name or by splitting its total amount.
const normalized = (value) => String(value ?? "").trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
export const MODEL360_TABS = [
  ["general", "Genel"], ["design", "DESEN"], ["production", "İmalat"],
  ["dyehouse", "Boyahane"], ["documents", "Muhasebe & Belgeler"],
  ["mail", "Fatura Mail"], ["review", "Adet & Belge Kontrolü"], ["history", "İşlem Geçmişi"],
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
      ? Boolean(p.canCreate || p.can_create || p.canUpdate || p.can_update || p.canWrite || p.can_write)
      : Boolean(p.canView || p.can_view || p.canCreate || p.can_create || p.canUpdate || p.can_update);
  });
}
export function model360LinkedInvoices(items) {
  return (Array.isArray(items) ? items : [])
    .filter((row) => normalized(row.kind) === "FATURA" && normalized(row.direction) === "OUTGOING"
      && /^HKN[0-9]{8,18}$/.test(normalized(row.number)))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
export function model360DeliveriesForInvoice(invoice,items){
  const related=new Set((invoice?.relatedDocuments||[]).map(row=>String(row.id||"")));
  return [...new Set((Array.isArray(items)?items:[]).filter(row=>related.has(String(row.id))&&
    normalized(row.kind)==="IRSALIYE"&&normalized(row.direction)==="OUTGOING"&&
    /^DDM[0-9]{8,18}$/.test(normalized(row.number))).map(row=>normalized(row.number)))].sort();
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
export function model360Warnings(model, design, documents, identity = null) {
  const notes = [];
  if (model?.isVirtual) notes.push("Bu kaynak sanal model adayıdır; kesin model kartına bağlanmadan işlem yapılamaz.");
  if (!model?.imageUrl && !design?.mainImage?.previewUrl && !design?.mainImage?.thumbnailUrl && !identity?.imageUrl)
    notes.push("Model görseli eksik. DESEN dosyalarından gerçek model görseli ekleyin.");
  if (model && Number(model.overInvoicedQty || 0) > 0) notes.push("Faturalama miktarı model sınırını aşıyor; kontrol edin.");
  if (model && Number(model.overProducedQty || 0) > 0) notes.push("Üretilen miktar gelen adedi aşıyor; kontrol edin.");
  if (Array.isArray(documents) && !documents.length) notes.push("Bu modelin doğrulanmış belge bağlantısı bulunamadı.");
  return notes;
}

// No synthetic model allocation: a multi-model document stays one document.
// Quantity is taken ONLY from the canonical production center's model-linked
// document lines, not the invoice header or another model's quantity.
export function model360QuantityReview(model, documents = null) {
  if (!model || model.isVirtual) return {ready:false,reason:"Kalıcı canonical model/imalat kaydı doğrulanamadı.",lines:[],checks:[]};
  const rawLines = Array.isArray(model.invoices) ? model.invoices : [];
  const seen = new Set();
  const lines = rawLines.filter(row => {
    const documentId = String(row.documentId || "").trim();
    const lineId = String(row.lineId || "").trim();
    if (!documentId || !lineId) return false;
    const key = documentId + ":" + lineId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(row=>({
    documentId:String(row.documentId),
    lineId:String(row.lineId),
    documentNo:String(row.documentNo||""),
    quantity:Number(row.quantity||0),
    unit:String(row.unit||""),
    date:String(row.date||""),
  }));
  const validLines = lines.filter(row => Number.isFinite(row.quantity) && row.quantity >= 0);
  const billed = validLines.reduce((sum,row)=>sum+row.quantity,0);
  const expected = Number(model.incomingQty||0);
  const receivedFromDispatch = Number(model.dispatchQty||0);
  const producedNet = Number(model.completedNetQty||0);
  const producedGross = Number(model.completedGrossQty||0);
  const actualBilled = Number(model.invoicedQty||0);
  const checks = [];
  if (!Number.isFinite(expected) || expected <= 0)
    checks.push({kind:"review",message:"Gelen müşteri irsaliyesi veya planlanan adet doğrulanmalı."});
  if (receivedFromDispatch <= 0)
    checks.push({kind:"review",message:"Müşteriden gelen irsaliye adedi yok; plan adedi gerçek giriş sayılmamalı."});
  if (producedNet > producedGross)
    checks.push({kind:"error",message:"Net sağlam üretim brüt üretimi aşıyor."});
  if (receivedFromDispatch > 0 && producedNet > receivedFromDispatch)
    checks.push({kind:"review",message:"Net üretim gelen müşteri irsaliyesi adedini aşıyor."});
  if (producedNet > 0 && actualBilled > producedNet)
    checks.push({kind:"review",message:"Faturalanan adet net sağlam üretimden fazla; test/hata ve sevk kontrolü gerekir."});
  if (rawLines.length !== validLines.length)
    checks.push({kind:"review",message:"Bazı fatura kalemlerinde kimlik veya miktar eksik; tahmini dağıtım yapılmadı."});
  if (validLines.length && Math.abs(actualBilled - billed) > 0.0001)
    checks.push({kind:"review",message:"Model kalemi faturalanan miktarı üretim merkezinin toplamıyla uyuşmuyor."});
  if (Array.isArray(documents)) {
    const invoiceIds = new Set(documents.filter(row=>String(row.kind)==="FATURA"&&String(row.direction)==="OUTGOING").map(row=>String(row.id)));
    if (validLines.some(row=>!invoiceIds.has(row.documentId)))
      checks.push({kind:"review",message:"İmalatın fatura kalemi ile model-belge arşivinin bağlantısı farklı; belge eşleştirmesi incelenmeli."});
  }
  const documentsCount = Array.isArray(documents)?new Set(documents.map(row=>String(row.id))).size:null;
  return {ready:true,receivedFromDispatch,expected,producedGross,producedNet,
    invoiced:actualBilled,invoiceLineTotal:billed,remainingFromProduction:producedNet-actualBilled,
    documentCount:documentsCount,lines:validLines,checks};
}
