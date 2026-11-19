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

export function parseDeliveryNumbers(value) {
  const parts=(Array.isArray(value)?value:String(value||"").split(/[;,\n]+/))
    .map(v=>documentKey(v)).filter(Boolean);
  if(!parts.length||parts.length>9||parts.some(n=>!/^DDM[0-9]{8,18}$/.test(n))||new Set(parts).size!==parts.length)
    throw new Error("Bir ile dokuz farklı DDM irsaliye numarası gerekir.");
  return parts;
}

// Subject and message are independent editable fields; selecting a preset never sends mail.
export const INVOICE_MAIL_TEMPLATES = Object.freeze([
  { id: "STANDARD", label: "Standart fatura bildirimi" },
  { id: "ACCOUNTING", label: "Muhasebe işlem rica" },
  { id: "SHORT", label: "Kısa bildirim" },
]);

export function makeInvoiceMailContent(modelName, invoiceNo, deliveryNo, templateId = "STANDARD") {
  const hkn=documentKey(invoiceNo),ddm=parseDeliveryNumbers(deliveryNo);
  if(!/^HKN[0-9]{8,18}$/.test(hkn))throw new Error("Kesin HKN fatura numarası gerekir.");
  // HKN can include several models. Do not misrepresent the entire invoice
  // as belonging only to the single model currently open in Model 360.
  const detail=ddm.join(", ");
  const plural=ddm.length===1?"irsaliyemiz":"irsaliyelerimiz";
  const message={
    STANDARD:"Merhaba,\n\n"+hkn+" numaralı faturamız ve "+detail+" numaralı "+plural+" ektedir.\n\nMuhasebe işlemlerine almanızı rica ederiz.\n\nİyi çalışmalar.",
    ACCOUNTING:"Merhaba,\n\n"+hkn+" numaralı faturamız ile "+detail+" numaralı ilgili irsaliye belgeleri ektedir. Muhasebe kayıtlarına alınmasını rica ederiz.\n\nİyi çalışmalar.",
    SHORT:"Merhaba,\n\n"+hkn+" numaralı faturamız ve ilgili "+detail+" numaralı irsaliye belgeleri ektedir.\n\nİyi çalışmalar.",
  };
  if(!Object.hasOwn(message,templateId))throw new Error("Bilinmeyen fatura mail şablonu.");
  return {subject:hkn+" Fatura",bodyText:message[templateId]};
}

const contactKey = (value) => String(value || "").trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
export function contactsForInvoiceRoute(contacts, route) {
  if (!route) return [];
  return (Array.isArray(contacts) ? contacts : [])
    .filter((person) => contactKey(person.customerName) === contactKey(route.customerName)
      && contactKey(person.groupCode).replace(/\s+/g, "") === contactKey(route.groupCode).replace(/\s+/g, ""))
    .sort((a,b) => (String(a.firstName || "") + " " + String(a.lastName || "")).localeCompare(
      String(b.firstName || "") + " " + String(b.lastName || ""), "tr-TR"));
}

export function routeContactRecipients(contacts, route) {
  const all=contactsForInvoiceRoute(contacts,route);
  const active=all.filter((person)=>person.active !== false && /^\S+@\S+\.\S+$/.test(String(person.email || "")));
  const byKind=(kind)=>[...new Set(active.filter((p)=>
    String(p.recipientKind || "TO").toUpperCase() === kind).map((p)=>String(p.email).toLowerCase()))];
  // If a department has a managed roster, never silently fall back to old addresses
  // after every contact in that roster is made inactive.
  return all.length ? {to:byKind("TO"),cc:byKind("CC"),managed:true}
    : {to:Array.isArray(route?.to)?route.to:[],cc:Array.isArray(route?.cc)?route.cc:[],managed:false};
}

export function makeCariReminderContent(modelName, invoiceNo, template = "STANDARD") {
  const hkn=documentKey(invoiceNo);
  if (!/^HKN[0-9]{8,18}$/.test(hkn)) throw new Error("Hatırlatma için kesin HKN fatura numarası gerekli.");
  const model=String(modelName || "").trim();
  const ref=model ? model+" - "+hkn : hkn;
  const body=template === "STANDARD"
    ? `Merhaba,\n\n${ref} numaralı faturamız gönderdiğiniz güncel cari ekstrede görünmemektedir. Kontrol ederek muhasebe kaydına alınması konusunda yardımınızı rica ederiz.\n\nTeşekkürler, iyi çalışmalar.`
    : template === "CHECK"
      ? `Merhaba,\n\n${ref} faturamızın güncel cari ekstrenizde yer alıp almadığını kontrol etmenizi rica ederiz. Fatura ekstreye yansımışsa bilgi verebilir misiniz?\n\nİyi çalışmalar.`
      : null;
  if (!body) throw new Error("Bilinmeyen cari hatırlatma şablonu.");
  return {subject:(model ? model+" " : "")+"Fatura Cari Kontrol",bodyText:body};
}

/**
 * One HKN = one canonical send. Legacy HKN:DDM jobs are checked server-side.
 * The DDM list is package evidence, not part of the mail send identity.
 */
export function invoiceMailEventId(companySlug, invoiceNo, deliveryNo) {
  const tenant=String(companySlug||"").trim().toLocaleLowerCase("tr-TR"),hkn=documentKey(invoiceNo);
  parseDeliveryNumbers(deliveryNo);
  if(!tenant||!/^HKN[0-9]{8,18}$/.test(hkn))throw new Error("Gönderim için ana firma ve HKN zorunludur.");
  return ["MODEL_INVOICE_MAIL",tenant,hkn].join(":");
}
