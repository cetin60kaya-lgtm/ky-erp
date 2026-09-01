// Provider-neutral document intelligence for scanned/image/PDF accounting documents.
// Azure Document Intelligence v4 is the first adapter; callers consume one canonical result.
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

function canonicalFromAzure(result: Row, documentKind: string, requestedModel: string) {
  const doc = result?.analyzeResult?.documents?.[0] || result?.documents?.[0] || {};
  const fields = doc?.fields || {};
  const items = Array.isArray(fields?.Items?.valueArray) ? fields.Items.valueArray : [];
  const partyName = text(
    fieldValue(fields.VendorName) || fieldValue(fields.SupplierName) || fieldValue(fields.MerchantName),
  );
  const partyTaxNo = text(
    fieldValue(fields.VendorTaxId) || fieldValue(fields.SupplierTaxId) || fieldValue(fields.TaxId),
  ).replace(/\s+/g, "");
  const documentNo = text(
    fieldValue(fields.InvoiceId) || fieldValue(fields.InvoiceNumber) || fieldValue(fields.DocumentId),
  );
  const issueDate = text(fieldValue(fields.InvoiceDate) || fieldValue(fields.DocumentDate));
  const dueDate = text(fieldValue(fields.DueDate));
  const subtotal = num(fieldValue(fields.SubTotal));
  const taxTotal = num(fieldValue(fields.TotalTax));
  const payableTotal = num(fieldValue(fields.InvoiceTotal) || fieldValue(fields.AmountDue) || fieldValue(fields.Total));
  const currency = text(fields.InvoiceTotal?.valueCurrency?.currencyCode || fields.AmountDue?.valueCurrency?.currencyCode || "TRY") || "TRY";

  const lines = items.map((item: any, index: number) => ({
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

  const criticalConfidences = [
    confidence(fields.VendorName),
    confidence(fields.InvoiceId),
    confidence(fields.InvoiceDate),
    confidence(fields.InvoiceTotal),
  ].filter((x) => x > 0);
  const documentConfidence = criticalConfidences.length
    ? criticalConfidences.reduce((a, b) => a + b, 0) / criticalConfidences.length
    : Number(doc?.confidence || 0);

  return {
    extractor: "AZURE_DOCUMENT_INTELLIGENCE",
    extractorModel: requestedModel || text(doc?.docType) || documentKind,
    extractionConfidence: documentConfidence,
    partyName,
    partyTaxNo,
    partyTaxOffice: "",
    partyIban: "",
    documentNo,
    uuid: "",
    issueDate,
    dueDate,
    currency,
    subtotal,
    taxTotal,
    discountTotal: num(fieldValue(fields.TotalDiscount)),
    payableTotal,
    lines,
    rawText: text(result?.analyzeResult?.content || result?.content),
    rawResult: result,
  };
}

async function azureAnalyze(c: Context<AppEnv>, file: File, documentKind: string, modelOverride = "") {
  const env = c.env as any;
  const endpoint = text(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || env.KYERP_DOCINTEL_ENDPOINT).replace(/\/$/, "");
  const key = text(env.AZURE_DOCUMENT_INTELLIGENCE_KEY || env.KYERP_DOCINTEL_KEY);
  if (!endpoint || !key) {
    throw Object.assign(new Error("Belge yapay zeka servisi yapılandırılmamış."), { code: "DOCINTEL_NOT_CONFIGURED" });
  }
  const invoiceModel = text(env.KYERP_DOCINTEL_INVOICE_MODEL) || "prebuilt-invoice";
  const dispatchModel = text(env.KYERP_DOCINTEL_DISPATCH_MODEL) || "prebuilt-layout";
  const model = modelOverride || (/IRSALIYE|DISPATCH|DESPATCH/i.test(documentKind) ? dispatchModel : invoiceModel);
  const apiVersion = text(env.KYERP_DOCINTEL_API_VERSION) || "2024-11-30";
  const url = `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze?api-version=${encodeURIComponent(apiVersion)}`;
  const bytes = await file.arrayBuffer();
  const initial = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: bytes,
  });
  if (!initial.ok) {
    const detail = await initial.text().catch(() => "");
    throw Object.assign(new Error(`Belge analiz servisi ${initial.status} hatası verdi.`), {
      code: "DOCINTEL_ANALYZE_FAILED",
      detail: detail.slice(0, 1200),
    });
  }
  const operationUrl = initial.headers.get("operation-location");
  if (!operationUrl) {
    throw Object.assign(new Error("Belge analiz servisi işlem adresi döndürmedi."), { code: "DOCINTEL_OPERATION_MISSING" });
  }
  const maxPoll = 30;
  for (let attempt = 0; attempt < maxPoll; attempt += 1) {
    if (attempt) await sleep(Math.min(1000 + attempt * 250, 3000));
    const poll = await fetch(operationUrl, { headers: { "Ocp-Apim-Subscription-Key": key } });
    if (!poll.ok) throw Object.assign(new Error(`Belge analiz sonucu alınamadı (${poll.status}).`), { code: "DOCINTEL_POLL_FAILED" });
    const payload = (await poll.json()) as Row;
    const status = text(payload.status).toLowerCase();
    if (status === "succeeded") return canonicalFromAzure(payload, documentKind, model);
    if (status === "failed" || status === "canceled") {
      throw Object.assign(new Error("Belge yapay zeka analizi tamamlanamadı."), { code: "DOCINTEL_FAILED", detail: payload.error });
    }
  }
  throw Object.assign(new Error("Belge yapay zeka analizi zaman aşımına uğradı."), { code: "DOCINTEL_TIMEOUT" });
}

async function extractionProfile(c: Context<AppEnv>, partyTaxNo: string, documentKind: string) {
  if (!partyTaxNo) return null;
  try {
    return await c.env.DB.prepare(
      `SELECT id, provider_type, provider_model_id, min_confidence
         FROM accounting_extraction_profiles
        WHERE main_company_slug=? AND is_active=1 AND party_tax_no=?
          AND (document_type=? OR document_type='*')
        ORDER BY CASE WHEN document_type=? THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 1`,
    ).bind(slugOf(c), partyTaxNo, documentKind, documentKind).first<Row>();
  } catch {
    return null;
  }
}

export async function analyzeAccountingDocument(c: Context<AppEnv>, file: File, documentKind = "INVOICE") {
  // This is deliberately not a plain OCR call. First pass uses a structured invoice/layout model
  // that returns fields, line items and confidences. Recurrent vendor layouts can then route to a
  // tenant-specific custom model without changing the accounting core.
  const first = await azureAnalyze(c, file, documentKind);
  const profile = await extractionProfile(c, text(first.partyTaxNo), documentKind);
  const customModel = text(profile?.provider_model_id);
  if (!customModel || upper(profile?.provider_type) !== "AZURE_DOCUMENT_INTELLIGENCE") return first;

  const threshold = num(profile?.min_confidence) || 0.75;
  // Always prefer a configured supplier-specific model; it is the deliberate learned layout contract.
  // If it fails, keep the successful generic pass instead of blocking document intake.
  try {
    const refined = await azureAnalyze(c, file, documentKind, customModel);
    await c.env.DB.prepare(
      `UPDATE accounting_extraction_profiles
          SET successful_samples=successful_samples+1,last_used_at=?,updated_at=?
        WHERE id=? AND main_company_slug=?`,
    ).bind(new Date().toISOString(), new Date().toISOString(), profile.id, slugOf(c)).run();
    return {
      ...refined,
      fallbackExtractionConfidence: first.extractionConfidence,
      profileId: profile.id,
      profileThreshold: threshold,
    };
  } catch {
    return {
      ...first,
      profileId: profile.id,
      profileThreshold: threshold,
      customModelFallbackUsed: true,
    };
  }
}
