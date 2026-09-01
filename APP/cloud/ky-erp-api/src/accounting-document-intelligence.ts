// @ts-nocheck
// Provider-neutral document intelligence for scanned/image/PDF accounting documents.
// Azure Document Intelligence v4 is the first adapter; callers consume one canonical result.
// structured fields + line items + confidence
import type { Context } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const upper = (v: unknown) => text(v).toLocaleUpperCase("tr-TR");
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const slugOf = (c: Context<AppEnv>) => text(
  c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || c.req.header("X-KYERP-Tenant-Slug") || "mecit-hakan",
);
const normalize = (v: unknown) => upper(v).replace(/İ/g,"I").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9ÇĞÖŞÜ]+/g," ").replace(/\s+/g," ").trim();

function fieldValue(field: any): any {
  if (!field || typeof field !== "object") return undefined;
  if (field.valueString !== undefined) return field.valueString;
  if (field.valueNumber !== undefined) return field.valueNumber;
  if (field.valueDate !== undefined) return field.valueDate;
  if (field.valueTime !== undefined) return field.valueTime;
  if (field.valuePhoneNumber !== undefined) return field.valuePhoneNumber;
  if (field.valueCurrency?.amount !== undefined) return field.valueCurrency.amount;
  if (field.valueAddress) return field.valueAddress;
  if (field.content !== undefined) return field.content;
  return undefined;
}

function confidence(field: any) {
  const n = Number(field?.confidence ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function itemValue(item: any, key: string) {
  return fieldValue(item?.valueObject?.[key]);
}

function trAmount(value: unknown) {
  let s=text(value).replace(/[₺$€\s]/g,"").replace(/[^0-9,.-]/g,"");
  const comma=s.lastIndexOf(","), dot=s.lastIndexOf("."), idx=Math.max(comma,dot);
  if(comma>=0&&dot>=0) s=`${s.slice(0,idx).replace(/[,.]/g,"")}.${s.slice(idx+1).replace(/[,.]/g,"")}`;
  else if(comma>=0) s=s.replace(/\./g,"").replace(",",".");
  const n=Number(s); return Number.isFinite(n)?n:0;
}

function labelValue(content: string, labels: string[], valuePattern = "[^\\n\\r]{1,120}") {
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\n|\\r)\\s*(?:${label})\\s*[:#-]?\\s*(${valuePattern})`, "im");
    const m = content.match(re);
    if (m?.[1]) return text(m[1]);
  }
  return "";
}

function dateFromContent(content: string) {
  const labeled=labelValue(content,["FATURA\\s*TAR[Iİ]H[Iİ]","[İI]RSAL[Iİ]YE\\s*TAR[Iİ]H[Iİ]","BELGE\\s*TAR[Iİ]H[Iİ]","TAR[Iİ]H"],"(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})");
  const raw=labeled||text(content.match(/\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)?.[0]);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const m=raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);if(!m)return raw;
  const y=m[3].length===2?`20${m[3]}`:m[3];return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
}

function taxNoFromContent(content: string) {
  const labeled=labelValue(content,["VKN","VERG[Iİ]\\s*(?:NO|NUMARASI|K[Iİ]ML[Iİ]K\\s*NO)","TCKN"],"\\d[\\d\\s]{8,14}").replace(/\D/g,"");
  if(labeled.length===10||labeled.length===11)return labeled;
  const m=content.match(/\b\d{10,11}\b/);return text(m?.[0]);
}

function genericTables(result: Row) {
  const tables=Array.isArray(result?.analyzeResult?.tables)?result.analyzeResult.tables:[];
  const out:any[]=[];
  for(const table of tables){
    const rows=new Map<number,Map<number,string>>();
    for(const cell of table?.cells||[]){if(!rows.has(cell.rowIndex))rows.set(cell.rowIndex,new Map());rows.get(cell.rowIndex)?.set(cell.columnIndex,text(cell.content));}
    const matrix=[...rows.entries()].sort((a,b)=>a[0]-b[0]).map(([,cols])=>[...cols.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v));
    if(matrix.length<2)continue;
    const headers=matrix[0].map(normalize);
    const idx=(keys:string[])=>headers.findIndex(h=>keys.some(k=>h.includes(k)));
    const di=idx(["ACIKLAMA","URUN","MAL HIZMET","DESCRIPTION","ITEM"]), qi=idx(["MIKTAR","ADET","QTY","QUANTITY"]), ui=idx(["BIRIM","UNIT"]), pi=idx(["BIRIM FIYAT","FIYAT","PRICE"]), ti=idx(["TUTAR","TOPLAM","AMOUNT","TOTAL"]), vi=idx(["KDV","VERGI","VAT"]), ci=idx(["KOD","CODE"]);
    if(di<0&&qi<0&&pi<0&&ti<0)continue;
    for(let r=1;r<matrix.length;r++){
      const row=matrix[r];const description=di>=0?text(row[di]):"", quantity=qi>=0?trAmount(row[qi]):0, unitPrice=pi>=0?trAmount(row[pi]):0, lineTotal=ti>=0?trAmount(row[ti]):0;
      if(!description&&!quantity&&!unitPrice&&!lineTotal)continue;
      out.push({lineNo:out.length+1,productCode:ci>=0?text(row[ci]):"",supplierProductCode:ci>=0?text(row[ci]):"",description,quantity,unitCode:ui>=0?text(row[ui]):"",unitPrice,taxRate:vi>=0?trAmount(row[vi]):0,taxAmount:0,discountTotal:0,lineTotal:lineTotal||quantity*unitPrice,extractionConfidence:.55});
    }
  }
  return out;
}

function compactRaw(result: Row, requestedModel: string) {
  return {
    providerStatus:text(result?.status),
    modelId:requestedModel,
    contentLength:text(result?.analyzeResult?.content||result?.content).length,
    pageCount:Array.isArray(result?.analyzeResult?.pages)?result.analyzeResult.pages.length:0,
    tableCount:Array.isArray(result?.analyzeResult?.tables)?result.analyzeResult.tables.length:0,
    documentCount:Array.isArray(result?.analyzeResult?.documents)?result.analyzeResult.documents.length:0,
  };
}

function canonicalFromAzure(result: Row, documentKind: string, requestedModel: string) {
  const doc = result?.analyzeResult?.documents?.[0] || result?.documents?.[0] || {};
  const fields = doc?.fields || {};
  const content=text(result?.analyzeResult?.content||result?.content);
  const items = Array.isArray(fields?.Items?.valueArray) ? fields.Items.valueArray : [];
  const partyName = text(fieldValue(fields.VendorName) || fieldValue(fields.SupplierName) || fieldValue(fields.MerchantName) || labelValue(content,["SATICI","TEDAR[Iİ]KÇ[Iİ]","G[ÖO]NDEREN","F[Iİ]RMA","UNVAN"]));
  const partyTaxNo = text(fieldValue(fields.VendorTaxId) || fieldValue(fields.SupplierTaxId) || fieldValue(fields.TaxId) || taxNoFromContent(content)).replace(/\s+/g, "");
  const documentNo = text(fieldValue(fields.InvoiceId) || fieldValue(fields.InvoiceNumber) || fieldValue(fields.DocumentId) || labelValue(content,["FATURA\\s*(?:NO|NUMARASI)","[İI]RSAL[Iİ]YE\\s*(?:NO|NUMARASI)","BELGE\\s*(?:NO|NUMARASI)"],"[A-Z0-9./_-]{2,60}"));
  const issueDate = text(fieldValue(fields.InvoiceDate) || fieldValue(fields.DocumentDate) || dateFromContent(content));
  const dueDate = text(fieldValue(fields.DueDate));
  const subtotal = num(fieldValue(fields.SubTotal)) || trAmount(labelValue(content,["MATRAH","ARA\\s*TOPLAM","VERG[Iİ]\\s*HAR[Iİ]Ç\\s*TOPLAM"],"[0-9., ]{1,30}"));
  const taxTotal = num(fieldValue(fields.TotalTax)) || trAmount(labelValue(content,["TOPLAM\\s*KDV","KDV\\s*TOPLAMI","VERG[Iİ]\\s*TOPLAMI"],"[0-9., ]{1,30}"));
  const payableTotal = num(fieldValue(fields.InvoiceTotal) || fieldValue(fields.AmountDue) || fieldValue(fields.Total)) || trAmount(labelValue(content,["GENEL\\s*TOPLAM","[ÖO]DENECEK\\s*TUTAR","FATURA\\s*TOPLAMI","TOPLAM\\s*TUTAR"],"[0-9., ]{1,30}"));
  const currency = text(fields.InvoiceTotal?.valueCurrency?.currencyCode || fields.AmountDue?.valueCurrency?.currencyCode || (content.match(/\b(?:TRY|TL|USD|EUR|GBP)\b/i)?.[0])) || "TRY";

  let lines = items.map((item: any, index: number) => ({
    lineNo: index + 1,
    productCode: text(itemValue(item, "ProductCode") || itemValue(item, "ItemCode")),
    supplierProductCode: text(itemValue(item, "ProductCode") || itemValue(item, "ItemCode")),
    description: text(itemValue(item, "Description") || itemValue(item, "Name")),
    quantity: num(itemValue(item, "Quantity")),
    unitCode: text(itemValue(item, "Unit") || itemValue(item, "UnitOfMeasure")),
    unitPrice: num(itemValue(item, "UnitPrice")),
    taxRate: num(itemValue(item, "TaxRate")),
    taxAmount: num(itemValue(item, "Tax")),
    discountTotal: num(itemValue(item, "Discount")),
    lineTotal: num(itemValue(item, "Amount") || itemValue(item, "TotalPrice")),
    extractionConfidence: Number(item?.confidence || 0),
  }));
  if(!lines.length) lines=genericTables(result);

  const criticalConfidences = [confidence(fields.VendorName),confidence(fields.InvoiceId),confidence(fields.InvoiceDate),confidence(fields.InvoiceTotal)].filter((x) => x > 0);
  let documentConfidence = criticalConfidences.length ? criticalConfidences.reduce((a, b) => a + b, 0) / criticalConfidences.length : Number(doc?.confidence || 0);
  if(!documentConfidence){const present=[partyName,partyTaxNo,documentNo,issueDate,payableTotal?"1":"",lines.length?"1":""].filter(Boolean).length;documentConfidence=Math.min(.72,present/6*.72);}

  return {
    extractor: "AZURE_DOCUMENT_INTELLIGENCE",
    extractorModel: requestedModel || text(doc?.docType) || documentKind,
    extractionConfidence: documentConfidence,
    partyName,partyTaxNo,partyTaxOffice:"",partyIban:"",documentNo,uuid:"",issueDate,dueDate,currency,
    subtotal,taxTotal,discountTotal:num(fieldValue(fields.TotalDiscount)),payableTotal,lines,
    rawText: content.slice(0,20000),
    rawResult: compactRaw(result,requestedModel),
  };
}

async function azureAnalyze(c: Context<AppEnv>, file: File, documentKind: string, modelOverride = "") {
  const env = c.env as any;
  const endpoint = text(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || env.KYERP_DOCINTEL_ENDPOINT).replace(/\/$/, "");
  const key = text(env.AZURE_DOCUMENT_INTELLIGENCE_KEY || env.KYERP_DOCINTEL_KEY);
  if (!endpoint || !key) throw Object.assign(new Error("Belge yapay zeka servisi yapılandırılmamış."), { code: "DOCINTEL_NOT_CONFIGURED" });
  const invoiceModel = text(env.KYERP_DOCINTEL_INVOICE_MODEL) || "prebuilt-invoice";
  const dispatchModel = text(env.KYERP_DOCINTEL_DISPATCH_MODEL) || "prebuilt-layout";
  const model = modelOverride || (/IRSALIYE|DISPATCH|DESPATCH/i.test(documentKind) ? dispatchModel : invoiceModel);
  const apiVersion = text(env.KYERP_DOCINTEL_API_VERSION) || "2024-11-30";
  const url = `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze?api-version=${encodeURIComponent(apiVersion)}`;
  const bytes = await file.arrayBuffer();
  const initial = await fetch(url, { method:"POST", headers:{"Ocp-Apim-Subscription-Key":key,"Content-Type":file.type||"application/octet-stream"}, body:bytes });
  if (!initial.ok) { const detail=await initial.text().catch(()=>""); throw Object.assign(new Error(`Belge analiz servisi ${initial.status} hatası verdi.`),{code:"DOCINTEL_ANALYZE_FAILED",detail:detail.slice(0,1200)}); }
  const operationUrl=initial.headers.get("operation-location"); if(!operationUrl)throw Object.assign(new Error("Belge analiz servisi işlem adresi döndürmedi."),{code:"DOCINTEL_OPERATION_MISSING"});
  for(let attempt=0;attempt<30;attempt+=1){
    if(attempt)await sleep(Math.min(1000+attempt*250,3000));
    const poll=await fetch(operationUrl,{headers:{"Ocp-Apim-Subscription-Key":key}});if(!poll.ok)throw Object.assign(new Error(`Belge analiz sonucu alınamadı (${poll.status}).`),{code:"DOCINTEL_POLL_FAILED"});
    const payload=(await poll.json()) as Row,status=text(payload.status).toLowerCase();
    if(status==="succeeded")return canonicalFromAzure(payload,documentKind,model);
    if(status==="failed"||status==="canceled")throw Object.assign(new Error("Belge yapay zeka analizi tamamlanamadı."),{code:"DOCINTEL_FAILED",detail:payload.error});
  }
  throw Object.assign(new Error("Belge yapay zeka analizi zaman aşımına uğradı."),{code:"DOCINTEL_TIMEOUT"});
}

async function extractionProfile(c: Context<AppEnv>, partyTaxNo: string, partyName: string, documentKind: string) {
  try {
    const rows=await c.env.DB.prepare(`SELECT id,provider_type,provider_model_id,min_confidence,party_tax_no,party_name_pattern,document_type
      FROM accounting_extraction_profiles WHERE main_company_slug=? AND is_active=1 AND (document_type=? OR document_type='*')
      ORDER BY CASE WHEN document_type=? THEN 0 ELSE 1 END,updated_at DESC`).bind(slugOf(c),documentKind,documentKind).all<Row>();
    const tax=text(partyTaxNo).replace(/\s/g,""), name=normalize(partyName);
    return (rows.results||[]).find(row=>{const rt=text(row.party_tax_no).replace(/\s/g,"");if(rt&&tax&&rt===tax)return true;const pattern=normalize(row.party_name_pattern);return Boolean(pattern&&name&&name.includes(pattern));})||null;
  } catch { return null; }
}

export async function analyzeAccountingDocument(c: Context<AppEnv>, file: File, documentKind = "INVOICE") {
  if(!file.size)throw Object.assign(new Error("Belge dosyası boş."),{code:"EMPTY_DOCUMENT"});
  if(file.size>40_000_000)throw Object.assign(new Error("Belge dosyası 40 MB sınırını aşıyor."),{code:"DOCUMENT_TOO_LARGE"});
  const first = await azureAnalyze(c, file, documentKind);
  const profile = await extractionProfile(c,text(first.partyTaxNo),text(first.partyName),documentKind);
  const customModel = text(profile?.provider_model_id);
  if (!customModel || upper(profile?.provider_type) !== "AZURE_DOCUMENT_INTELLIGENCE") return first;
  const threshold = num(profile?.min_confidence) || 0.75;
  try {
    const refined = await azureAnalyze(c, file, documentKind, customModel);
    await c.env.DB.prepare(`UPDATE accounting_extraction_profiles SET successful_samples=successful_samples+1,last_used_at=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(new Date().toISOString(),new Date().toISOString(),profile.id,slugOf(c)).run();
    return {...refined,fallbackExtractionConfidence:first.extractionConfidence,profileId:profile.id,profileThreshold:threshold};
  } catch {
    return {...first,profileId:profile.id,profileThreshold:threshold,customModelFallbackUsed:true};
  }
}
