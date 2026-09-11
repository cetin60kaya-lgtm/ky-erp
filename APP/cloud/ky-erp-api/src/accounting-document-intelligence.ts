// @ts-nocheck
// Provider-neutral document intelligence for scanned/image/PDF accounting documents.
// Azure Document Intelligence v4 is the first adapter; callers consume one canonical result.
// structured fields + line items + confidence
import type { Context } from "hono";
import { analyzeAccountingImageWithWorkersAi, workersAiAccountingDocumentStatus } from "./accounting-document-workers-ai.ts";

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

export function accountingDocumentIntelligenceStatus(env:any){
  const endpoint=text(env?.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || env?.KYERP_DOCINTEL_ENDPOINT).replace(/\/$/,"");
  const keyPresent=Boolean(text(env?.AZURE_DOCUMENT_INTELLIGENCE_KEY || env?.KYERP_DOCINTEL_KEY));
  const azureConfigured=Boolean(endpoint && keyPresent),workersAi=workersAiAccountingDocumentStatus(env);
  const invoiceModel=text(env?.KYERP_DOCINTEL_INVOICE_MODEL) || "prebuilt-invoice";
  const dispatchModel=text(env?.KYERP_DOCINTEL_DISPATCH_MODEL) || "prebuilt-layout";
  const apiVersion=text(env?.KYERP_DOCINTEL_API_VERSION) || "2024-11-30";
  return{provider:azureConfigured?"AZURE_DOCUMENT_INTELLIGENCE":workersAi.configured?workersAi.provider:"NONE",configured:Boolean(azureConfigured||workersAi.configured),azureConfigured,workersAiConfigured:workersAi.configured,workersAiModel:workersAi.model,endpointConfigured:Boolean(endpoint),keyConfigured:keyPresent,invoiceModel,dispatchModel,apiVersion};
}

export function inferAccountingDocumentKind(rawText: unknown, requestedKind = "AUTO") {
  const requested = upper(requestedKind);
  if (/IRSALIYE|DISPATCH|DESPATCH/.test(requested)) return "IRSALIYE";
  if (/FATURA|INVOICE|ARSIV/.test(requested) && requested !== "AUTO") return "FATURA";
  const content = normalize(rawText);
  const dispatchTokens = ["SEVK IRSALIYESI","E IRSALIYE","IRSALIYE NO","IRSALIYE NUMARASI","IRSALIYE TARIHI","DESPATCH","DESPATCH ADVICE"];
  const invoiceTokens = ["E FATURA","E ARSIV","FATURA NO","FATURA NUMARASI","FATURA TARIHI","INVOICE","ODENECEK TUTAR"];
  const dispatchScore = dispatchTokens.reduce((score, token) => score + (content.includes(token) ? 1 : 0), 0);
  const invoiceScore = invoiceTokens.reduce((score, token) => score + (content.includes(token) ? 1 : 0), 0);
  return dispatchScore > invoiceScore ? "IRSALIYE" : "FATURA";
}

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

export function extractAccountingLot(value: unknown) {
  const source = text(value);
  const match = source.match(/\b(?:LOT|PART[Iİ]|BATCH)\s*(?:NO|NUMARASI|NUMBER)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{1,50})/i);
  return text(match?.[1]);
}

export function scoreAccountingExtraction(row: Row) {
  const confidenceScore=Math.max(0,Math.min(1,num(row?.extractionConfidence)))*50;
  const fieldScore=[
    text(row?.documentNo),
    text(row?.partyTaxNo),
    text(row?.issueDate),
    num(row?.payableTotal)>0?"1":"",
    Array.isArray(row?.lines)&&row.lines.length?"1":"",
  ].filter(Boolean).length*9;
  const partyScore=text(row?.partyName)?5:0;
  return Math.min(100,confidenceScore+fieldScore+partyScore);
}

export function compareAccountingExtractions(primary: Row, secondary: Row) {
  const discrepancies:any[]=[];
  const add=(code:string,primaryValue:unknown,secondaryValue:unknown,severity="WARNING")=>discrepancies.push({code,severity,primary:primaryValue,secondary:secondaryValue});
  const pNo=normalize(primary?.documentNo),sNo=normalize(secondary?.documentNo);
  if(pNo&&sNo&&pNo!==sNo)add("DOCUMENT_NO_MISMATCH",primary.documentNo,secondary.documentNo,"ERROR");
  const pTax=text(primary?.partyTaxNo).replace(/\D/g,""),sTax=text(secondary?.partyTaxNo).replace(/\D/g,"");
  if(pTax&&sTax&&pTax!==sTax)add("PARTY_TAX_NO_MISMATCH",primary.partyTaxNo,secondary.partyTaxNo,"ERROR");
  const pDate=text(primary?.issueDate).slice(0,10),sDate=text(secondary?.issueDate).slice(0,10);
  if(pDate&&sDate&&pDate!==sDate)add("ISSUE_DATE_MISMATCH",pDate,sDate,"WARNING");
  const pTotal=num(primary?.payableTotal),sTotal=num(secondary?.payableTotal),totalTolerance=Math.max(.05,Math.max(Math.abs(pTotal),Math.abs(sTotal))*.002);
  if(pTotal>0&&sTotal>0&&Math.abs(pTotal-sTotal)>totalTolerance)add("PAYABLE_TOTAL_MISMATCH",pTotal,sTotal,"ERROR");
  const pVat=num(primary?.taxTotal),sVat=num(secondary?.taxTotal),vatTolerance=Math.max(.05,Math.max(Math.abs(pVat),Math.abs(sVat))*.005);
  if(pVat>0&&sVat>0&&Math.abs(pVat-sVat)>vatTolerance)add("VAT_TOTAL_MISMATCH",pVat,sVat,"WARNING");
  const pLines=Array.isArray(primary?.lines)?primary.lines.length:0,sLines=Array.isArray(secondary?.lines)?secondary.lines.length:0;
  if(pLines&&sLines&&pLines!==sLines)add("LINE_COUNT_MISMATCH",pLines,sLines,"WARNING");
  return discrepancies;
}

export function selectAccountingExtraction(primary: Row, secondary: Row): Row {
  const primaryScore=scoreAccountingExtraction(primary),secondaryScore=scoreAccountingExtraction(secondary),discrepancies=compareAccountingExtractions(primary,secondary);
  const chosen=secondaryScore>primaryScore+2?secondary:primary;
  return {
    ...chosen,
    primaryExtractionScore:primaryScore,
    secondaryExtractionScore:secondaryScore,
    fallbackCompared:true,
    fallbackSelected:chosen===secondary,
    extractionDiscrepancies:discrepancies,
    needsManualReview:discrepancies.some(item=>item.severity==="ERROR"),
  };
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
    const di=idx(["ACIKLAMA","URUN","MAL HIZMET","DESCRIPTION","ITEM"]), qi=idx(["MIKTAR","ADET","QTY","QUANTITY"]), ui=idx(["BIRIM","UNIT"]), pi=idx(["BIRIM FIYAT","FIYAT","PRICE"]), ti=idx(["TUTAR","TOPLAM","AMOUNT","TOTAL"]), vi=idx(["KDV","VERGI","VAT"]), ci=idx(["KOD","CODE"]), li=idx(["LOT","PARTI","BATCH"]);
    if(di<0&&qi<0&&pi<0&&ti<0)continue;
    for(let r=1;r<matrix.length;r++){
      const row=matrix[r];const description=di>=0?text(row[di]):"", quantity=qi>=0?trAmount(row[qi]):0, unitPrice=pi>=0?trAmount(row[pi]):0, lineTotal=ti>=0?trAmount(row[ti]):0;
      if(!description&&!quantity&&!unitPrice&&!lineTotal)continue;
      out.push({lineNo:out.length+1,productCode:ci>=0?text(row[ci]):"",supplierProductCode:ci>=0?text(row[ci]):"",description,quantity,unitCode:ui>=0?text(row[ui]):"",unitPrice,taxRate:vi>=0?trAmount(row[vi]):0,taxAmount:0,discountTotal:0,lineTotal:lineTotal||quantity*unitPrice,lotNo:li>=0?text(row[li]):extractAccountingLot(description),extractionConfidence:.55});
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
    lotNo: text(itemValue(item, "LotNo") || itemValue(item, "LotNumber") || itemValue(item, "BatchNumber")) || extractAccountingLot(itemValue(item, "Description") || itemValue(item, "Name")),
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
  const status=accountingDocumentIntelligenceStatus(env);
  if (!status.configured) throw Object.assign(new Error("Belge yapay zeka servisi yapılandırılmamış."), { code: "DOCINTEL_NOT_CONFIGURED", detail:{endpointConfigured:status.endpointConfigured,keyConfigured:status.keyConfigured} });
  const endpoint = text(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || env.KYERP_DOCINTEL_ENDPOINT).replace(/\/$/, "");
  const key = text(env.AZURE_DOCUMENT_INTELLIGENCE_KEY || env.KYERP_DOCINTEL_KEY);
  const model = modelOverride || (/IRSALIYE|DISPATCH|DESPATCH/i.test(documentKind) ? status.dispatchModel : status.invoiceModel);
  const apiVersion = status.apiVersion;
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

  const requested=upper(documentKind)||"AUTO",env=c.env as any,readiness=accountingDocumentIntelligenceStatus(env);
  if(!readiness.configured)throw Object.assign(new Error("Belge yapay zeka servisi yapılandırılmamış."),{code:"DOCINTEL_NOT_CONFIGURED",detail:{provider:readiness.provider,endpointConfigured:readiness.endpointConfigured,keyConfigured:readiness.keyConfigured,workersAiConfigured:readiness.workersAiConfigured}});
  const useAzure=readiness.azureConfigured===true;
  let resolvedKind=inferAccountingDocumentKind("",requested),first:Row,autoLayout:Row|null=null;

  if(useAzure&&requested==="AUTO"){
    autoLayout=await azureAnalyze(c,file,"IRSALIYE");
    resolvedKind=inferAccountingDocumentKind(autoLayout.rawText,"AUTO");
    if(resolvedKind==="FATURA"){try{first=await azureAnalyze(c,file,"FATURA")}catch{first={...autoLayout,autoInvoiceRefineFailed:true}}}else first=autoLayout;
    first={...first,inferredDocumentKind:resolvedKind,autoDetected:true,autoDetectionSource:"OCR_TEXT"};
  }else if(useAzure){
    first=await azureAnalyze(c,file,resolvedKind);
  }else{
    first=await analyzeAccountingImageWithWorkersAi(c,file,requested);
    resolvedKind=/IRSALIYE|DISPATCH|DESPATCH/i.test(text(first.inferredDocumentKind))?"IRSALIYE":"FATURA";
    first={...first,inferredDocumentKind:resolvedKind,autoDetected:requested==="AUTO",autoDetectionSource:"WORKERS_AI_VISION"};
  }

  const profile=await extractionProfile(c,text(first.partyTaxNo),text(first.partyName),resolvedKind);
  const customModel=text(profile?.provider_model_id),threshold=num(profile?.min_confidence)||num(env.KYERP_DOCINTEL_REVIEW_THRESHOLD)||0.75;
  let candidate:Row={...first,inferredDocumentKind:resolvedKind,autoDetected:requested==="AUTO",profileId:profile?.id||null,profileThreshold:threshold};

  if(useAzure&&customModel&&upper(profile?.provider_type)==="AZURE_DOCUMENT_INTELLIGENCE"){
    try{const refined=await azureAnalyze(c,file,resolvedKind,customModel);await c.env.DB.prepare(`UPDATE accounting_extraction_profiles SET successful_samples=successful_samples+1,last_used_at=?,updated_at=? WHERE id=? AND main_company_slug=?`).bind(new Date().toISOString(),new Date().toISOString(),profile.id,slugOf(c)).run();candidate={...refined,inferredDocumentKind:resolvedKind,autoDetected:requested==="AUTO",fallbackExtractionConfidence:first.extractionConfidence,profileId:profile.id,profileThreshold:threshold};}catch{candidate={...candidate,customModelFallbackUsed:true}}
  }

  const missingCritical=!text(candidate.documentNo)||!text(candidate.issueDate)||num(candidate.payableTotal)<=0||!Array.isArray(candidate.lines)||candidate.lines.length===0;
  const lowConfidence=num(candidate.extractionConfidence)<threshold,shouldFallback=lowConfidence||missingCritical;
  let secondary:Row|null=null;
  if(useAzure&&shouldFallback&&autoLayout&&candidate.extractorModel!==autoLayout.extractorModel)secondary=autoLayout;
  if(useAzure&&shouldFallback&&!secondary){const configuredSecondary=text(env.KYERP_DOCINTEL_SECONDARY_MODEL),defaultSecondary=resolvedKind==="FATURA"?(text(env.KYERP_DOCINTEL_DISPATCH_MODEL)||"prebuilt-layout"):"",secondaryModel=configuredSecondary||defaultSecondary;if(secondaryModel&&secondaryModel!==text(candidate.extractorModel)){try{secondary=await azureAnalyze(c,file,resolvedKind,secondaryModel)}catch(error:any){candidate={...candidate,secondaryFallbackFailed:true,secondaryFallbackError:text(error?.code)||"DOCINTEL_SECONDARY_FAILED"}}}}
  if(secondary)candidate={...selectAccountingExtraction(candidate,secondary),inferredDocumentKind:resolvedKind,autoDetected:requested==="AUTO",secondaryFallbackModel:text(secondary.extractorModel)};

  const finalScore=scoreAccountingExtraction(candidate);
  return{...candidate,extractionQualityScore:finalScore,lowConfidence:lowConfidence||finalScore<70,needsManualReview:Boolean(candidate.needsManualReview||missingCritical||finalScore<60),manualReviewReasons:[...(missingCritical?["CRITICAL_FIELDS_MISSING"]:[]),...(finalScore<60?["EXTRACTION_QUALITY_LOW"]:[]),...((candidate.extractionDiscrepancies||[]).filter((item:any)=>item.severity==="ERROR").map((item:any)=>item.code))]};
}
