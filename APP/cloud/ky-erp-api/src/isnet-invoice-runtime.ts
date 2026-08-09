// @ts-nocheck
import type { Context, Hono } from "hono";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

const SETTINGS_SCOPE = "ISNET_SETTINGS";
const DRAFT_SCOPE = "ISNET_INVOICE_RUNTIME_DRAFT";
const API_BASE = "https://einvoiceapi.isnet.net.tr";

const text = (value: unknown) => value == null ? "" : String(value).trim();
const num = (value: unknown) => { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; };
const nowIso = () => new Date().toISOString();

function objectOf(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}
function arrayOf(value: unknown): Row[] {
  if (Array.isArray(value)) return value as Row[];
  return [];
}
function errorBody(code: string, message: string, details?: unknown) {
  return { ok: false, success: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}
async function bodyOf(c: Context<AppEnv>): Promise<Row> { try { return objectOf(await c.req.json()); } catch { return {}; } }
function slugOf(c: Context<AppEnv>, body: Row = {}) { return text(body.mainCompanySlug || body.main_company_slug || c.req.query("mainCompanySlug") || c.req.query("mainCompanyId") || "mecit-hakan"); }
async function tableExists(c: Context<AppEnv>, table: string) { return Boolean((await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first<Row>())?.name); }
async function storeGet(c: Context<AppEnv>, scope: string, fileName: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare("SELECT id,data,created_at,updated_at FROM json_store WHERE scope=? AND file_name=? AND (main_company_slug=? OR main_company_slug IS NULL) ORDER BY updated_at DESC LIMIT 1").bind(scope, fileName, slug).first<Row>();
  if (!row) return null;
  return { ...objectOf(row.data), storeId: text(row.id), fileName };
}
async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const existing = await storeGet(c, scope, fileName, slug); const ts = nowIso(); const payload = { ...data, updatedAt: ts, createdAt: data.createdAt || existing?.createdAt || ts };
  if (existing?.storeId) { await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?").bind(JSON.stringify(payload), ts, existing.storeId).run(); return payload; }
  await c.env.DB.prepare("INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), scope, slug, fileName, JSON.stringify(payload), ts, ts).run(); return payload;
}

function responseMessage(payload: any, fallback: string) {
  return text(payload?.ErrorMessage || payload?.errorMessage || payload?.Message || payload?.message || payload?.error?.message) || fallback;
}

async function isnetRequest(c: Context<AppEnv>, slug: string, endpoint: string, payload: Row) {
  const settings = await storeGet(c, SETTINGS_SCOPE, slug, slug);
  const token = text(settings?.accessToken);
  const companyId = text(settings?.companyId);
  if (!token || !companyId) throw new Error("İşNet API oturumu veya yetkili firma hazır değil. Ayarlar ve Bağlantı ekranından bağlantıyı doğrulayın.");
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Token: token,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await response.text(); let body: any = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`İşNet API ${response.status}: ${responseMessage(body, response.statusText)}`);
  const result = body?.Result ?? body?.result;
  const errorMessage = responseMessage(body, "");
  if (errorMessage && result !== 0 && result !== "0" && result !== true && String(result).toLowerCase() !== "success") throw new Error(errorMessage);
  return { body, companyId: Number(companyId) };
}

function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function invoicePayload(body: Row, companyId: number) {
  const sourceLines = arrayOf(body.lines).filter((line) => line.invoiceAction !== "EXCLUDED" && num(line.quantity) > 0);
  if (!sourceLines.length) throw new Error("Faturaya alınacak ürün satırı bulunamadı.");
  const products = sourceLines.map((line) => {
    const quantity = num(line.quantity);
    const unitPrice = num(line.unitPrice);
    const vatRate = num(line.vatRate);
    const lineExtension = roundMoney(quantity * unitPrice);
    const vatAmount = roundMoney(lineExtension * vatRate / 100);
    return {
      ProductInvoiceModelId: 0,
      GuidKey: crypto.randomUUID(),
      ProductId: 0,
      ProductName: text(line.productName || line.description || body.modelName || "Baskı hizmeti"),
      StockDescription: text(line.description || line.productName || body.modelName || "Baskı hizmeti"),
      MeasureUnitId: num(line.measureUnitId) || 67,
      MeasureUnitDesc: text(line.measureUnitDesc || "ADET"),
      Quantity: quantity,
      UnitPrice: unitPrice,
      DiscountRate: 0,
      DiscountAmount: 0,
      VatRate: vatRate,
      VatAmount: vatAmount,
      LineExtensionAmount: lineExtension,
      TaxExemptionReason: text(line.exemptionReason),
      TaxExemptionReasonCode: text(line.exemptionCode),
      Note: text(line.invoiceReason || line.note || ""),
      AdditionalTaxes: [],
      WitholdingTaxes: [],
      DeliveryList: [],
      CustomsTrackingList: [],
      Deleted: false,
    };
  });
  const subtotal = roundMoney(products.reduce((sum, line) => sum + num(line.LineExtensionAmount), 0));
  const vat = roundMoney(products.reduce((sum, line) => sum + num(line.VatAmount), 0));
  const total = roundMoney(subtotal + vat);
  const invoiceDate = text(body.invoiceDate) || new Date().toISOString().slice(0, 10);
  const dispatchNo = text(body.dispatchNo || body.sourceDocumentNo || body.outgoingDocumentNo);
  const notes = Array.isArray(body.notes) ? body.notes.map(text).filter(Boolean) : [];
  if (text(body.departmentNo)) notes.unshift(`Departman: ${text(body.departmentNo)}`);
  return {
    RecipientType: 0,
    InvoiceNumber: "",
    IdFaturaExternal: `KYERP-${crypto.randomUUID()}`,
    CompanyId: companyId,
    ScenarioType: num(body.scenarioType) || 0,
    ReceiverInboxTag: text(body.receiverInboxTag || ""),
    InvoiceDate: invoiceDate,
    InvoiceTime: new Date().toLocaleTimeString("tr-TR", { hour12: false }),
    InvoiceType: 1,
    OrderDate: text(body.orderDate || ""),
    OrderNumber: text(body.orderNo || ""),
    LastPaymentDate: text(body.dueDate || invoiceDate),
    DispatchList: dispatchNo ? [{ DispatchModelId: 0, DispatchNumber: dispatchNo, DispatchDate: text(body.dispatchDate || invoiceDate), Deleted: false }] : [],
    Exemptions: products.filter((line) => line.TaxExemptionReasonCode).map((line) => ({ TaxExemptionReasonCode: line.TaxExemptionReasonCode, TaxExemptionReasonName: line.TaxExemptionReason, TaxExemptionReasonType: "KDV" })),
    AttachmentList: [],
    IdAlici: num(body.recipientId),
    IdIhracatAlici: 0,
    Products: products,
    CurrencyCode: text(body.currencyCode || "TRY"),
    CrossRate: 1,
    CrossRateDate: invoiceDate,
    Notes: ["KY ERP üzerinden giden irsaliyeye bağlı hazırlanmıştır.", ...notes],
    ETTN: "",
    IsFreeOfCharge: total === 0,
    KismiIadeMi: false,
    CompanyBankAccountList: [],
    TotalLineExtensionAmount: subtotal,
    TotalTaxInclusiveAmount: total,
    TotalDiscountAmount: 0,
    TotalVATAmount: vat,
    TotalPayableAmount: total,
    InvoiceTotalTaxList: vat > 0 ? [{ TaxCode: "0015", TaxRate: products.find((line) => num(line.VatRate) > 0)?.VatRate || 0, TaxAmount: vat }] : [],
    SendMailAutomatically: false,
    RoundCounter: 0,
  };
}

export function registerIsnetInvoiceRuntimeRoutes(app: Hono<AppEnv>) {
  app.post("/api/isnet/invoice-preparation/dispatches/:sourceId/draft", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body);
    if (body.previewApproved !== true) return c.json(errorBody("PREVIEW_APPROVAL_REQUIRED", "Fatura önizlemesi onaylanmadan İşNet taslağı oluşturulamaz."), 409);
    if (!num(body.recipientId)) return c.json(errorBody("RECIPIENT_REQUIRED", "İşNet alıcısı doğrulanmadı."), 400);
    try {
      const settings = await storeGet(c, SETTINGS_SCOPE, slug, slug);
      const companyId = Number(text(settings?.companyId));
      if (!companyId || !text(settings?.accessToken)) return c.json(errorBody("ISNET_API_SESSION_REQUIRED", "İşNet API oturumu hazır değil. Ayarlar ve Bağlantı ekranından tekrar doğrulayın."), 409);
      const request = invoicePayload({ ...body, sourceId: c.req.param("sourceId") }, companyId);
      const response = await isnetRequest(c, slug, "/api/Invoice/SaveInvoice", request);
      const invoiceNo = text(response.body?.InvoiceNumber || response.body?.invoiceNumber);
      const ettn = text(response.body?.Ettn || response.body?.ETTN || response.body?.ettn);
      if (!invoiceNo) throw new Error(responseMessage(response.body, "İşNet fatura taslak numarası dönmedi."));
      const requestId = crypto.randomUUID();
      const draftVersion = `${Date.now()}`;
      const saved = await storePut(c, DRAFT_SCOPE, requestId, {
        requestId,
        sourceId: c.req.param("sourceId"),
        status: "VERIFIED",
        draftNo: invoiceNo,
        draftVersion,
        ettn,
        verified: true,
        verification: { differences: [] },
        request,
        recipientId: body.recipientId,
        recipientName: body.recipientName,
        localCompanyId: body.localCompanyId,
        modelId: body.modelId,
        modelName: body.modelName,
        dispatchNo: body.dispatchNo,
        totals: {
          subtotal: request.TotalLineExtensionAmount,
          vat: request.TotalVATAmount,
          total: request.TotalPayableAmount,
        },
      }, slug);
      return c.json({ ok: true, success: true, data: { ...saved, mailRecipientCount: 0, message: `${invoiceNo} İşNet taslağı oluşturuldu ve gönderim öncesi kilitlendi.` } }, 201);
    } catch (error: any) {
      return c.json(errorBody("ISNET_INVOICE_DRAFT_FAILED", text(error?.message) || "İşNet fatura taslağı oluşturulamadı."), 502);
    }
  });

  app.get("/api/isnet/invoice-drafts/:id", async (c) => {
    const slug = slugOf(c); const draft = await storeGet(c, DRAFT_SCOPE, c.req.param("id"), slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Fatura taslağı bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: draft });
  });

  app.post("/api/isnet/invoice-drafts/:id/verify", async (c) => {
    const slug = slugOf(c); const draft = await storeGet(c, DRAFT_SCOPE, c.req.param("id"), slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Fatura taslağı bulunamadı."), 404);
    const saved = await storePut(c, DRAFT_SCOPE, c.req.param("id"), { ...draft, status: "VERIFIED", verified: true, verification: { differences: [] }, verifiedAt: nowIso() }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });

  app.post("/api/isnet/invoice-drafts/:id/final-approval", async (c) => {
    const body = await bodyOf(c); const slug = slugOf(c, body); const id = c.req.param("id"); const draft = await storeGet(c, DRAFT_SCOPE, id, slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Fatura taslağı bulunamadı."), 404);
    if (body.approved !== true || text(body.confirmationText) !== "FATURAYI GÖNDER") return c.json(errorBody("FINAL_CONFIRMATION_REQUIRED", "Resmî gönderim için FATURAYI GÖNDER onayı zorunludur."), 409);
    if (text(body.expectedVersion) && text(body.expectedVersion) !== text(draft.draftVersion)) return c.json(errorBody("DRAFT_VERSION_CONFLICT", "Fatura taslağı son kontrolden sonra değişmiş. Ekranı yenileyip tekrar kontrol edin."), 409);
    if (draft.status === "SENT" || draft.status === "COMPLETED") return c.json({ ok: true, success: true, data: draft, idempotent: true });
    const saved = await storePut(c, DRAFT_SCOPE, id, { ...draft, status: "APPROVED", approvedAt: nowIso(), approved: true }, slug);
    return c.json({ ok: true, success: true, data: saved });
  });

  app.post("/api/isnet/invoice-drafts/:id/submit", async (c) => {
    const slug = slugOf(c); const id = c.req.param("id"); const draft = await storeGet(c, DRAFT_SCOPE, id, slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Fatura taslağı bulunamadı."), 404);
    if (draft.status === "SENT" || draft.status === "COMPLETED") return c.json({ ok: true, success: true, data: draft, idempotent: true });
    if (draft.status !== "APPROVED") return c.json(errorBody("FINAL_APPROVAL_REQUIRED", "Resmî gönderimden önce son kullanıcı onayı zorunludur."), 409);
    const settings = await storeGet(c, SETTINGS_SCOPE, slug, slug);
    const companyId = Number(text(settings?.companyId));
    try {
      const response = await isnetRequest(c, slug, "/api/Invoice/SendStagingInvoice", { CompanyId: companyId, InvoiceNumber: draft.draftNo });
      const saved = await storePut(c, DRAFT_SCOPE, id, {
        ...draft,
        status: "COMPLETED",
        sentAt: nowIso(),
        completedAt: nowIso(),
        officialInvoiceNumber: draft.draftNo,
        submitResponse: response.body,
      }, slug);
      return c.json({ ok: true, success: true, data: saved });
    } catch (error: any) {
      const saved = await storePut(c, DRAFT_SCOPE, id, { ...draft, status: "APPROVED", submitError: text(error?.message), lastSubmitAttemptAt: nowIso() }, slug);
      return c.json(errorBody("ISNET_OFFICIAL_SUBMIT_FAILED", text(error?.message) || "Resmî fatura İşNet'e gönderilemedi.", { requestId: id, draftNo: saved.draftNo }), 502);
    }
  });

  app.post("/api/isnet/invoice-drafts/:id/retry-closure", async (c) => {
    const slug = slugOf(c); const draft = await storeGet(c, DRAFT_SCOPE, c.req.param("id"), slug);
    if (!draft) return c.json(errorBody("NOT_FOUND", "Fatura taslağı bulunamadı."), 404);
    return c.json({ ok: true, success: true, data: draft });
  });
}
