import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IsnetOperationsService } from "./isnet-operations.service";

type AnyRow = Record<string, any>;

const DISPATCH_TYPES = new Set([
  "CUSTOMER_DISPATCH",
  "MUSTERI_IRSALIYE",
  "MUSTERI_IRSALIYESI",
  "MUSTERIDEN_GELEN_IRSALIYE",
]);

const INVOICE_TYPES = new Set([
  "OUR_INVOICE",
  "BIZIM_GIDEN_FATURA",
  "BIZIM_KESTIGIMIZ_FATURA",
  "SATIS_FATURA",
  "SATIS_FATURASI",
]);

const GENERIC_WORDS = new Set([
  "ADET",
  "BASKI",
  "SEVK",
  "KESIMDEN",
  "BASKIYA",
  "URUN",
  "MODEL",
  "MAL",
  "HIZMET",
]);

const NON_BILLABLE_CATEGORIES = new Set([
  "TEST_SAMPLE",
  "FABRIC_DEFECT",
  "PRINT_DEFECT",
  "OTHER_NON_BILLABLE",
]);

const NON_BILLABLE_DELIVERY_METHODS = new Set([
  "ELDEN_TESLIM",
  "IRSALIYE_EKI",
  "DIGER_UCRETSIZ",
]);

function json(value: any): AnyRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value: any): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function upper(value: any): string {
  return String(value || "").trim().toLocaleUpperCase("tr-TR");
}

function normalize(value: any): string {
  return upper(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: any): string[] {
  return normalize(value)
    .split(" ")
    .filter((item) => item.length > 1 && !GENERIC_WORDS.has(item));
}

function similarity(left: any, right: any): number {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.max(a.size, b.size);
}

function productCodes(value: any): string[] {
  return [...new Set(normalize(value).match(/\b\d{6,}\b/g) || [])];
}

function hasSharedProductCode(left: any, right: any): boolean {
  const rightCodes = new Set(productCodes(right));
  return productCodes(left).some((code) => rightCodes.has(code));
}

export function invoiceNonBillableCategory(line: AnyRow): string | null {
  if (Math.abs(number(line.unitPrice)) > 0.0001 || Math.abs(number(line.lineTotal)) > 0.0001) return null;
  const description = normalize([line.description, line.productName].filter(Boolean).join(" "));
  if (description.includes("TEST") || description.includes("NUMUNE")) return "TEST_SAMPLE";
  if (description.includes("KUMAS") && (description.includes("SAKAT") || description.includes("HATA"))) return "FABRIC_DEFECT";
  if (description.includes("BASKI") && (description.includes("SAKAT") || description.includes("HATA"))) return "PRINT_DEFECT";
  return null;
}

function dateDistanceDays(dispatchDocument: AnyRow, invoiceDocument: AnyRow): number | null {
  if (!dispatchDocument.date || !invoiceDocument.date) return null;
  const dispatchTime = new Date(dispatchDocument.date).getTime();
  const invoiceTime = new Date(invoiceDocument.date).getTime();
  if (!Number.isFinite(dispatchTime) || !Number.isFinite(invoiceTime)) return null;
  return Math.round((invoiceTime - dispatchTime) / 86400000);
}

function pick(source: AnyRow, paths: string[]): any {
  for (const path of paths) {
    let value: any = source;
    for (const key of path.split(".")) value = value?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function typeOf(document: AnyRow): string {
  const raw = json(document.raw);
  const metadata = json(document.metadata);
  return normalize(
    document.targetType ||
      document.documentType ||
      document.detectedType ||
      raw.documentKind ||
      raw.documentType ||
      raw.belgeTipi ||
      metadata.documentKind ||
      metadata.documentType,
  ).replace(/ /g, "_");
}

function isDispatch(document: AnyRow): boolean {
  const type = typeOf(document);
  return DISPATCH_TYPES.has(type) || (type.includes("MUSTERI") && type.includes("IRSALIYE"));
}

function isInvoice(document: AnyRow): boolean {
  const type = typeOf(document);
  return INVOICE_TYPES.has(type) ||
    ((type.includes("BIZIM") || type.includes("SATIS") || type.includes("OUR")) && type.includes("FATURA"));
}

export function isCustomerSalesFlowCompany(company: AnyRow): boolean {
  const companyType = upper(company?.companyType);
  return Boolean(company?.id) && (companyType === "CUSTOMER" || companyType === "BOTH");
}

export function isCustomerSalesFlowRecord(document: AnyRow): boolean {
  if (!document || document.deletedAt || !isCustomerSalesFlowCompany(document.company)) return false;
  return isDispatch(document) || isInvoice(document);
}

export function sameCompanyIdentity(left: AnyRow, right: AnyRow): boolean {
  if (left?.companyId && right?.companyId && left.companyId === right.companyId) return true;
  const leftTax = normalize(left?.company?.taxNo);
  const rightTax = normalize(right?.company?.taxNo);
  if (leftTax && rightTax) return leftTax === rightTax;
  if (left?.companyId && right?.companyId) return false;
  return normalize(left?.company?.name) === normalize(right?.company?.name);
}

export function companyIdentityKey(document: AnyRow): string {
  const taxNo = normalize(document?.company?.taxNo);
  if (taxNo) return `TAX:${taxNo}`;
  if (document?.companyId) return `ID:${document.companyId}`;
  return `NAME:${normalize(document?.company?.name)}`;
}

function refs(document: AnyRow, line?: AnyRow) {
  const raw = json(document.raw);
  const metadata = json(document.metadata);
  const lineRaw = json(line?.raw);
  const joined = [
    document.documentNo,
    line?.description,
    line?.productName,
    pick(lineRaw, ["dispatchNo", "irsaliyeNo", "orderNo", "siparisNo", "piyonNo", "description", "rawName"]),
    pick(raw, ["dispatchNo", "irsaliyeNo", "orderNo", "siparisNo", "piyonNo", "taslakAlanlar.irsaliyeNo", "taslakAlanlar.siparisNo", "taslakAlanlar.piyonNo"]),
    pick(metadata, ["dispatchNo", "irsaliyeNo", "orderNo", "siparisNo", "piyonNo"]),
    String(raw.rawText || metadata.rawText || "").slice(0, 2000),
  ].join(" ");
  return {
    dispatchNo: String(
      pick({ document, raw, metadata, lineRaw }, [
        "lineRaw.dispatchNo",
        "lineRaw.irsaliyeNo",
        "raw.dispatchNo",
        "raw.irsaliyeNo",
        "raw.taslakAlanlar.irsaliyeNo",
        "metadata.dispatchNo",
      ]) || "",
    ),
    orderNo: String(
      pick({ raw, metadata, lineRaw }, [
        "lineRaw.orderNo",
        "lineRaw.siparisNo",
        "lineRaw.piyonNo",
        "raw.orderNo",
        "raw.siparisNo",
        "raw.piyonNo",
        "raw.taslakAlanlar.siparisNo",
        "raw.taslakAlanlar.piyonNo",
        "metadata.orderNo",
      ]) || "",
    ),
    joined: normalize(joined),
  };
}

export function invoiceStatus(
  dispatchQty: number,
  invoicedQty: number,
  nonBillableQty = 0,
  review = false,
  duplicate = false,
) {
  if (duplicate) return "DUPLICATE_REVIEW";
  if (review) return "REVIEW_REQUIRED";
  const coveredQty = invoicedQty + nonBillableQty;
  if (coveredQty <= 0 && dispatchQty > 0) return "INVOICE_PENDING";
  if (coveredQty < dispatchQty - 0.0001) return "PARTIAL";
  if (coveredQty > dispatchQty + 0.0001) return "REVIEW_REQUIRED";
  if (nonBillableQty > 0) return "CLOSED_WITH_NON_BILLABLE";
  return "INVOICED";
}

@Injectable()
export class DispatchReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly isnetOperations: IsnetOperationsService,
  ) {}

  private requireSlug(value: any) {
    const slug = String(value || "").trim();
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return slug;
  }

  private async source(slugValue: string) {
    const slug = this.requireSlug(slugValue);
    const [documents, customerCompanies] = await Promise.all([
      this.prisma.document.findMany({
      where: {
        mainCompanySlug: slug,
        deletedAt: null,
        companyId: { not: null },
        company: { is: { isActive: true, deletedAt: null, companyType: { in: ["CUSTOMER", "BOTH"] } } },
        OR: [
          { targetType: { in: ["MUSTERIDEN_GELEN_IRSALIYE", "CUSTOMER_DISPATCH", "BIZIM_GIDEN_FATURA", "OUR_INVOICE"] } },
          { documentType: { in: ["musteriden_gelen_irsaliye", "musteri_irsaliye", "customer_dispatch", "CUSTOMER_DISPATCH", "SATIS_FATURA", "BIZIM_FATURA", "BIZIM_KESTIGIMIZ_FATURA", "GIDEN_FATURA"] } },
        ],
      },
      include: { company: true, files: { where: { deletedAt: null } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.company.findMany({
        where: { mainCompanySlug: slug, isActive: true, deletedAt: null, companyType: { in: ["CUSTOMER", "BOTH"] } },
        select: { id: true, name: true, normalizedName: true, taxNo: true, companyType: true },
      }),
    ]);
    const safeDocuments = documents.filter(isCustomerSalesFlowRecord);
    const dispatchDocuments = safeDocuments.filter(isDispatch);
    const invoiceDocuments = safeDocuments.filter(isInvoice);
    const docById = new Map(safeDocuments.map((row) => [row.id, row]));
    const dispatchDocIds = dispatchDocuments.map((row) => row.id);
    const invoiceDocIds = invoiceDocuments.map((row) => row.id);
    const [dispatchLines, invoiceItems, matches, productionRecords, nonBillableAllocations, isnetStates] = await Promise.all([
      dispatchDocIds.length
        ? this.prisma.customerDispatchLine.findMany({
            where: { mainCompanySlug: slug, documentId: { in: dispatchDocIds }, deletedAt: null },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      invoiceDocIds.length
        ? this.prisma.invoiceItem.findMany({
            where: { mainCompanySlug: slug, documentId: { in: invoiceDocIds } },
            orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
          })
        : Promise.resolve([]),
      this.prisma.dispatchInvoiceMatch.findMany({
        where: { mainCompanySlug: slug },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.productionRecord.findMany({
        where: { mainCompanySlug: slug },
        orderBy: [{ productionDate: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.dispatchNonBillableAllocation.findMany({
        where: { mainCompanySlug: slug, deletedAt: null },
        orderBy: [{ createdAt: "asc" }],
      }),
      this.prisma.isnetDocumentState.findMany({
        where: { mainCompanySlug: slug, documentNo: { not: null } },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    const modelIds = [...new Set([
      ...dispatchLines.map((line) => String(line.modelId || "")),
      ...productionRecords.map((record) => String(record.modelId || "")),
    ].filter(Boolean))];
    const [modelRecords, modelImages] = modelIds.length
      ? await Promise.all([
          this.prisma.modelRecord.findMany({ where: { mainCompanySlug: slug, id: { in: modelIds } } }),
          this.prisma.modelImage.findMany({ where: { mainCompanySlug: slug, modelId: { in: modelIds } }, orderBy: { createdAt: "desc" } }),
        ])
      : [[], []];
    return {
      slug,
      documents: safeDocuments,
      customerCompanies,
      dispatchDocuments,
      invoiceDocuments,
      docById,
      dispatchLines,
      invoiceItems,
      matches,
      productionRecords,
      nonBillableAllocations,
      isnetStates,
      modelRecords,
      modelImages,
    };
  }

  private productionForLine(line: AnyRow, document: AnyRow, records: AnyRow[]) {
    const lineOrder = refs(document).orderNo;
    return records.filter((record) => {
      const raw = json(record.raw);
      if (String(raw.dispatchLineId || "") === line.id) return true;
      if (!line.modelId || String(record.modelId || "") !== String(line.modelId)) return false;
      if (!lineOrder) return false;
      return normalize(record.orderNo) === normalize(lineOrder);
    });
  }

  private compose(
    source: Awaited<ReturnType<DispatchReconciliationService["source"]>>,
    includeProductionOnly = false,
  ) {
    const isnetStateByDocumentNo = new Map<string, AnyRow>();
    for (const state of source.isnetStates) {
      const key = normalize(state.documentNo);
      if (key && !isnetStateByDocumentNo.has(key)) isnetStateByDocumentNo.set(key, state);
    }
    const portalDocument = (document: AnyRow) => {
      const state = isnetStateByDocumentNo.get(normalize(document?.documentNo));
      if (!state?.sourceId || !state?.kind || !state?.direction) return null;
      return {
        id: state.id,
        sourceId: state.sourceId,
        kind: state.kind,
        direction: state.direction,
        documentNo: state.documentNo,
        hasPdf: Boolean(state.pdfPath),
        hasXml: Boolean(state.xmlPath),
      };
    };
    const matchesByLine = new Map<string, AnyRow[]>();
    for (const match of source.matches) {
      const rows = matchesByLine.get(match.dispatchLineId) || [];
      rows.push(match);
      matchesByLine.set(match.dispatchLineId, rows);
    }
    const allocationsByLine = new Map<string, AnyRow[]>();
    for (const allocation of source.nonBillableAllocations) {
      const rows = allocationsByLine.get(allocation.dispatchLineId) || [];
      rows.push(allocation);
      allocationsByLine.set(allocation.dispatchLineId, rows);
    }
    const dispatchRows = source.dispatchLines.map((line) => {
      const document: AnyRow = source.docById.get(line.documentId || "") || {};
      const lineMatches = matchesByLine.get(line.id) || [];
      const activeMatches = lineMatches.filter((row) => ["ACTIVE", "APPROVED"].includes(upper(row.status)));
      const reviewMatches = lineMatches.filter((row) => upper(row.status) === "REVIEW_REQUIRED");
      const duplicateMatches = lineMatches.filter((row) => upper(row.status) === "DUPLICATE_REVIEW");
      const productions = this.productionForLine(line, document, source.productionRecords);
      const dispatchQty = number(line.adet);
      const productionQty = productions.reduce((total, row) => total + number(row.totalQuantity), 0);
      const commercialActiveMatches = activeMatches.filter((match) => {
        const invoiceLine = source.invoiceItems.find((item) => item.id === match.invoiceLineId);
        return !invoiceLine || !invoiceNonBillableCategory(invoiceLine);
      });
      const invoicedQty = commercialActiveMatches.reduce((total, row) => total + number(row.matchedQty), 0);
      const nonBillableAllocations = allocationsByLine.get(line.id) || [];
      const nonBillableQty = nonBillableAllocations.reduce((total, row) => total + number(row.quantity), 0);
      const testSampleQty = nonBillableAllocations.filter((row) => upper(row.category) === "TEST_SAMPLE").reduce((total, row) => total + number(row.quantity), 0);
      const fabricDefectQty = nonBillableAllocations.filter((row) => upper(row.category) === "FABRIC_DEFECT").reduce((total, row) => total + number(row.quantity), 0);
      const printDefectQty = nonBillableAllocations.filter((row) => upper(row.category) === "PRINT_DEFECT").reduce((total, row) => total + number(row.quantity), 0);
      const otherNonBillableQty = nonBillableQty - testSampleQty - fabricDefectQty - printDefectQty;
      const coveredQty = invoicedQty + nonBillableQty;
      const productionRemainingQty = Math.max(dispatchQty - productionQty, 0);
      const invoiceRemainingQty = Math.max(dispatchQty - coveredQty, 0);
      const overProductionQty = Math.max(productionQty - dispatchQty, 0);
      const overInvoicedQty = Math.max(invoicedQty - dispatchQty, 0);
      const overCoveredQty = Math.max(coveredQty - dispatchQty, 0);
      const status = invoiceStatus(dispatchQty, invoicedQty, nonBillableQty, reviewMatches.length > 0, duplicateMatches.length > 0);
      const modelStatus = line.modelId ? "MODEL_LINKED" : "MODEL_PENDING";
      const productionStatus = productionQty <= 0
        ? "PRODUCTION_PENDING"
        : productionQty < dispatchQty
          ? "PRODUCTION_PARTIAL"
          : productionQty > dispatchQty
            ? "PRODUCTION_OVER"
            : "PRODUCTION_COMPLETE";
      const overallStatus =
        Math.abs(dispatchQty - productionQty) < 0.0001 && Math.abs(dispatchQty - coveredQty) < 0.0001
          ? "COMPLETED"
          : status === "REVIEW_REQUIRED" || status === "DUPLICATE_REVIEW" || overProductionQty > 0 || overInvoicedQty > 0 || overCoveredQty > 0
            ? "REVIEW_REQUIRED"
            : "OPEN";
      const documentRaw = json(document.raw);
      const modelRecord = source.modelRecords.find((model) => model.id === line.modelId);
      const modelRaw = json(modelRecord?.raw);
      const modelImage = source.modelImages.find((image) => image.modelId === line.modelId);
      const documentRefs = refs(document);
      const matchedInvoiceIds = new Set(activeMatches.map((match) => match.invoiceId));
      const invoiceNonBillableSuggestions = source.invoiceItems
        .filter((item) => matchedInvoiceIds.has(item.documentId))
        .filter((item) => hasSharedProductCode(line.aciklama || line.modelAdi, item.description || item.productName) || similarity(line.aciklama || line.modelAdi, item.description || item.productName) >= 0.55)
        .map((item) => ({ ...item, category: invoiceNonBillableCategory(item) }))
        .filter((item) => item.category && number(item.quantity) > 0)
        .filter((item) => !nonBillableAllocations.some((allocation) => String(allocation.note || "").includes(`[FATURA_SATIRI:${item.id}]`)))
        .map((item) => ({
          invoiceLineId: item.id,
          invoiceId: item.documentId,
          invoiceNo: source.docById.get(item.documentId)?.documentNo || "",
          description: item.description || item.productName || "",
          quantity: number(item.quantity),
          unitPrice: number(item.unitPrice),
          lineTotal: number(item.lineTotal),
          category: item.category,
        }));
      const invoiceDetectedNonBillableQty = invoiceNonBillableSuggestions.reduce((total, item) => total + item.quantity, 0);
      return {
        id: line.id,
        dispatchLineId: line.id,
        dispatchId: document.id,
        dispatchNo: document.documentNo || pick(documentRaw, ["dispatchNo", "irsaliyeNo", "taslakAlanlar.irsaliyeNo"]),
        dispatchDate: document.date,
        createdAt: document.createdAt,
        updatedAt: line.updatedAt,
        companyId: document.companyId,
        companyName: document.company?.name || pick(documentRaw, ["companyName", "firmaAdi", "taslakAlanlar.firmaAdi"]),
        companyType: document.company?.companyType || "",
        taxNo: document.company?.taxNo || "",
        orderNo: documentRefs.orderNo,
        description: line.aciklama || line.modelAdiOnerisi || "",
        unit: line.birim || "ADET",
        modelId: line.modelId,
        modelName: line.modelAdi,
        modelImageUrl: modelImage?.thumbnailPath || modelImage?.filePath ||
          pick(modelRaw, ["thumbnail", "imageUrl", "desenImageThumb", "previewPath"]),
        modelStatus,
        productionStatus,
        invoiceStatus: status,
        overallStatus,
        dispatchQty,
        productionQty,
        invoicedQty,
        nonBillableQty,
        testSampleQty,
        fabricDefectQty,
        printDefectQty,
        otherNonBillableQty,
        invoiceNonBillableSuggestions,
        invoiceDetectedNonBillableQty,
        invoiceAutoClosable: invoiceRemainingQty > 0 && Math.abs(invoiceRemainingQty - invoiceDetectedNonBillableQty) < 0.0001,
        coveredQty,
        commercialInvoiceGapQty: Math.max(dispatchQty - invoicedQty, 0),
        productionRemainingQty,
        invoiceRemainingQty,
        overProductionQty,
        overInvoicedQty,
        overCoveredQty,
        productionInvoiceDifference: productionQty - coveredQty,
        productionCommercialInvoiceDifference: productionQty - invoicedQty,
        productions,
        nonBillableAllocations,
        matches: lineMatches.filter((match) => !["RECLASSIFIED_NON_BILLABLE", "REVIEW_RESOLVED"].includes(upper(match.status))).map((match) => ({
          ...match,
          invoice: source.docById.get(match.invoiceId)
            ? { ...source.docById.get(match.invoiceId), isnetDocument: portalDocument(source.docById.get(match.invoiceId)) }
            : null,
          invoiceLine: source.invoiceItems.find((item) => item.id === match.invoiceLineId) || null,
        })),
        sourceFiles: document.files || [],
        sourceDocument: { ...document, isnetDocument: portalDocument(document) },
        isnetDocument: portalDocument(document),
        operationSource: "CUSTOMER_DISPATCH",
        needsIncomingDispatch: false,
      };
    });
    if (!includeProductionOnly) return dispatchRows;

    const linkedProductionIds = new Set(
      dispatchRows.flatMap((row) => (row.productions || []).map((record: AnyRow) => record.id)),
    );
    const productionOnlyRows = source.productionRecords
      .filter((record) => !linkedProductionIds.has(record.id))
      .filter((record) => {
        const raw = json(record.raw);
        const companyId = String(pick(raw, ["companyId", "customerId", "firmaId"]) || "");
        const taxNo = normalize(pick(raw, ["taxNo", "vkn", "vergiNo"]));
        const companyName = normalize(pick(raw, ["companyName", "customerName", "firmaAdi", "musteriAdi", "recipientName"]));
        return source.customerCompanies.some((company) =>
          (companyId && company.id === companyId) ||
          (taxNo && normalize(company.taxNo) === taxNo) ||
          (!companyId && !taxNo && companyName && normalize(company.normalizedName || company.name) === companyName),
        );
      })
      .map((record) => {
        const raw = json(record.raw);
        const modelRecord = source.modelRecords.find((model) => model.id === record.modelId);
        const modelRaw = json(modelRecord?.raw);
        const modelImage = source.modelImages.find((image) => image.modelId === record.modelId);
        const productionQty = number(record.totalQuantity);
        const companyName = String(
          pick(raw, ["companyName", "customerName", "firmaAdi", "musteriAdi", "recipientName"]) || "",
        );
        const company = source.customerCompanies.find((item) =>
          (pick(raw, ["companyId", "customerId", "firmaId"]) && item.id === pick(raw, ["companyId", "customerId", "firmaId"])) ||
          (normalize(pick(raw, ["taxNo", "vkn", "vergiNo"])) && normalize(item.taxNo) === normalize(pick(raw, ["taxNo", "vkn", "vergiNo"]))) ||
          normalize(item.normalizedName || item.name) === normalize(companyName),
        );
        return {
          id: `production:${record.id}`,
          dispatchLineId: "",
          dispatchId: "",
          productionRecordId: record.id,
          dispatchNo: "",
          dispatchDate: record.productionDate,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          companyId: pick(raw, ["companyId", "customerId", "firmaId"]),
          companyName,
          companyType: company?.companyType || "",
          taxNo: pick(raw, ["taxNo", "vkn", "vergiNo"]),
          orderNo: record.orderNo || pick(raw, ["orderNo", "siparisNo", "piyonNo"]),
          description: record.modelName || modelRecord?.modelName || "Üretim kaydı",
          unit: "ADET",
          modelId: record.modelId,
          modelName: record.modelName || modelRecord?.modelName || "",
          modelImageUrl: modelImage?.thumbnailPath || modelImage?.filePath ||
            pick(modelRaw, ["thumbnail", "imageUrl", "desenImageThumb", "previewPath"]),
          modelStatus: record.modelId ? "MODEL_LINKED" : "MODEL_PENDING",
          productionStatus: productionQty > 0 ? "PRODUCTION_COMPLETE" : "PRODUCTION_PENDING",
          invoiceStatus: "INVOICE_PENDING",
          overallStatus: "OPEN",
          dispatchQty: 0,
          productionQty,
          invoicedQty: 0,
          nonBillableQty: 0,
          testSampleQty: 0,
          fabricDefectQty: 0,
          printDefectQty: 0,
          otherNonBillableQty: 0,
          coveredQty: 0,
          commercialInvoiceGapQty: productionQty,
          productionRemainingQty: 0,
          invoiceRemainingQty: productionQty,
          overProductionQty: 0,
          overInvoicedQty: 0,
          overCoveredQty: 0,
          productionInvoiceDifference: productionQty,
          productionCommercialInvoiceDifference: productionQty,
          productions: [record],
          nonBillableAllocations: [],
          matches: [],
          sourceFiles: [],
          sourceDocument: null,
          operationSource: "PRODUCTION",
          needsIncomingDispatch: true,
          needsOutgoingDispatch: true,
        };
      });
    return [...dispatchRows, ...productionOnlyRows];
  }

  private filterRows(rowsValue: AnyRow[], query: AnyRow = {}) {
    let rows = [...rowsValue];
    const q = normalize(query.q || query.search);
    if (q) rows = rows.filter((row) => normalize([row.dispatchNo, row.companyName, row.orderNo, row.description, row.modelName].join(" ")).includes(q));
    if (query.companyId) rows = rows.filter((row) => row.companyId === query.companyId);
    if (query.modelId) rows = rows.filter((row) => String(row.modelId || "") === String(query.modelId));
    if (query.invoiceStatus) {
      const requestedStatus = upper(query.invoiceStatus);
      rows = requestedStatus === "COMPLETED"
        ? rows.filter((row) => ["INVOICED", "CLOSED_WITH_NON_BILLABLE"].includes(row.invoiceStatus))
        : rows.filter((row) => row.invoiceStatus === requestedStatus);
    }
    if (query.modelStatus) rows = rows.filter((row) => row.modelStatus === upper(query.modelStatus));
    if (query.productionStatus) rows = rows.filter((row) => row.productionStatus === upper(query.productionStatus));
    if (String(query.openOnly) === "true") rows = rows.filter((row) => row.overallStatus !== "COMPLETED");
    const from = query.dateFrom ? new Date(query.dateFrom) : null;
    const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999`) : null;
    if (from && !Number.isNaN(from.getTime())) rows = rows.filter((row) => row.dispatchDate && new Date(row.dispatchDate) >= from);
    if (to && !Number.isNaN(to.getTime())) rows = rows.filter((row) => row.dispatchDate && new Date(row.dispatchDate) <= to);
    return rows;
  }

  async list(slug: string, query: AnyRow = {}) {
    const source = await this.source(slug);
    const rows = this.filterRows(
      this.compose(source, String(query.operationMode) === "true"),
      query,
    );
    const total = rows.length;
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(250, Math.max(1, Number(query.limit || query.pageSize || 50)));
    return { ok: true, data: { rows: rows.slice((page - 1) * limit, page * limit), total, page, limit } };
  }

  async summary(slug: string, query: AnyRow = {}) {
    const source = await this.source(slug);
    const rows = this.filterRows(
      this.compose(source, String(query.operationMode) === "true"),
      query,
    );
    const count = (status: string) => rows.filter((row) => row.invoiceStatus === status).length;
    const sum = (field: string, filtered = rows) => filtered.reduce((total, row) => total + number(row[field]), 0);
    return {
      ok: true,
      data: {
        total: rows.length,
        totalDispatches: new Set(rows.map((row) => row.dispatchId)).size,
        newCount: rows.filter((row) => Date.now() - new Date(row.createdAt).getTime() < 7 * 86400000).length,
        modelPending: rows.filter((row) => row.modelStatus === "MODEL_PENDING").length,
        productionPending: rows.filter((row) => row.productionStatus !== "PRODUCTION_COMPLETE").length,
        productionWithoutDispatch: rows.filter((row) => row.operationSource === "PRODUCTION").length,
        invoicePending: count("INVOICE_PENDING"),
        partial: count("PARTIAL"),
        invoiced: count("INVOICED"),
        closedWithNonBillable: count("CLOSED_WITH_NON_BILLABLE"),
        overInvoiced: count("OVER_INVOICED"),
        reviewRequired: count("REVIEW_REQUIRED"),
        duplicateReview: count("DUPLICATE_REVIEW"),
        completed: rows.filter((row) => row.overallStatus === "COMPLETED").length,
        uninvoicedQty: sum("invoiceRemainingQty"),
        dispatchQty: sum("dispatchQty"),
        productionQty: sum("productionQty"),
        invoicedQty: sum("invoicedQty"),
        nonBillableQty: sum("nonBillableQty"),
        coveredQty: sum("coveredQty"),
        filteredTotal: rows.length,
      },
    };
  }

  async detail(slug: string, id: string) {
    const source = await this.source(slug);
    const row = this.compose(source).find((item) => item.dispatchLineId === id || item.dispatchId === id);
    if (!row) throw new NotFoundException("İrsaliye kalemi bulunamadı.");
    const logs = await this.prisma.dispatchInvoiceMatchLog.findMany({
      where: { mainCompanySlug: source.slug, dispatchLineId: row.dispatchLineId },
      orderBy: { createdAt: "desc" },
    });
    return { ok: true, data: { ...row, history: logs } };
  }

  private sameCompany(dispatchDocument: AnyRow, invoiceDocument: AnyRow) {
    return sameCompanyIdentity(dispatchDocument, invoiceDocument);
  }

  private companyKey(document: AnyRow) {
    return companyIdentityKey(document);
  }

  private score(
    dispatchLine: AnyRow,
    dispatchDocument: AnyRow,
    invoiceLine: AnyRow,
    invoiceDocument: AnyRow,
    remainingQtyValue?: number,
  ) {
    if (!this.sameCompany(dispatchDocument, invoiceDocument)) return null;
    const dispatchRefs = refs(dispatchDocument, dispatchLine);
    const invoiceRefs = refs(invoiceDocument, invoiceLine);
    const dispatchNo = normalize(dispatchDocument.documentNo);
    const orderNo = normalize(dispatchRefs.orderNo);
    const referenceText = invoiceRefs.joined;
    const dispatchMatch = Boolean(dispatchNo && referenceText.includes(dispatchNo));
    const orderMatch = Boolean(orderNo && referenceText.includes(orderNo));
    const dispatchDescription = dispatchLine.aciklama || dispatchLine.modelAdi;
    const invoiceDescription = invoiceLine.description || invoiceLine.productName;
    const descriptionScore = similarity(dispatchDescription, invoiceDescription);
    const productCodeMatch = hasSharedProductCode(dispatchDescription, invoiceDescription);
    const invoiceQty = number(invoiceLine.quantity);
    const dispatchQty = number(dispatchLine.adet);
    const remainingQty = remainingQtyValue === undefined ? dispatchQty : Math.max(number(remainingQtyValue), 0);
    const qtyMatch = Math.abs(dispatchQty - invoiceQty) < 0.0001;
    const remainingQtyMatch = Math.abs(remainingQty - invoiceQty) < 0.0001;
    const fitsRemaining = invoiceQty > 0 && invoiceQty <= remainingQty + 0.0001;
    const distanceDays = dateDistanceDays(dispatchDocument, invoiceDocument);
    const invoiceBeforeDispatch = distanceDays !== null && distanceDays < 0;
    const matchedFields = ["company"];
    const mismatchFields: string[] = [];
    if (dispatchMatch) matchedFields.push("dispatchNo");
    if (orderMatch) matchedFields.push("orderNo");
    if (productCodeMatch) matchedFields.push("productCode");
    if (descriptionScore >= 0.55) matchedFields.push("description"); else mismatchFields.push("description");
    if (qtyMatch || remainingQtyMatch) matchedFields.push("quantity"); else mismatchFields.push("quantity");
    if (invoiceBeforeDispatch) mismatchFields.push("date");
    if (invoiceBeforeDispatch && (dispatchMatch || orderMatch)) return { matchType: "AUTO_REVIEW", confidence: 70, matchedQty: 0, status: "REVIEW_REQUIRED", matchedFields, mismatchFields, distanceDays };
    if ((qtyMatch || remainingQtyMatch) && (productCodeMatch || descriptionScore >= 0.7) && (dispatchMatch || orderMatch)) return { matchType: "AUTO_EXACT", confidence: 100, matchedQty: invoiceQty, status: "ACTIVE", matchedFields, mismatchFields, distanceDays };
    if ((qtyMatch || remainingQtyMatch) && descriptionScore >= 0.55 && (dispatchMatch || orderMatch)) return { matchType: "AUTO_STRONG", confidence: Math.round(90 + descriptionScore * 9), matchedQty: invoiceQty, status: "ACTIVE", matchedFields, mismatchFields, distanceDays };
    if ((dispatchMatch || orderMatch) && descriptionScore >= 0.55 && fitsRemaining) return { matchType: "AUTO_STRONG", confidence: Math.round(82 + descriptionScore * 8), matchedQty: invoiceQty, status: "ACTIVE", matchedFields, mismatchFields, distanceDays };
    if ((dispatchMatch || orderMatch) && (descriptionScore > 0 || number(invoiceLine.quantity) > 0)) return { matchType: "AUTO_REVIEW", confidence: Math.round(55 + descriptionScore * 20), matchedQty: 0, status: "REVIEW_REQUIRED", matchedFields, mismatchFields, distanceDays };

    // Our sales invoice can reference our own DDM dispatch while the tracked
    // customer dispatch has a TIA number. Same company, a nearby later date and
    // a strong product description are sufficient without matching document IDs.
    const recentInvoice = distanceDays !== null && distanceDays >= 0 && distanceDays <= 120;
    if (recentInvoice && (productCodeMatch || descriptionScore >= 0.7)) {
      matchedFields.push("date");
      const identityScore = productCodeMatch ? 5 : descriptionScore * 3;
      const quantityScore = remainingQtyMatch ? 5 : fitsRemaining ? 2 : 0;
      const confidence = Math.min(99, Math.max(84, Math.round(90 - Math.min(distanceDays, 10) + identityScore + quantityScore)));
      if (fitsRemaining) {
        return { matchType: remainingQtyMatch ? "AUTO_EXACT" : "AUTO_STRONG", confidence, matchedQty: invoiceQty, status: "ACTIVE", matchedFields, mismatchFields, distanceDays, remainingQtyMatch, fitsRemaining, productCodeMatch };
      }
      return { matchType: "AUTO_REVIEW", confidence: Math.min(confidence, 89), matchedQty: 0, status: "REVIEW_REQUIRED", matchedFields, mismatchFields, distanceDays, remainingQtyMatch, fitsRemaining, productCodeMatch };
    }
    if (recentInvoice && descriptionScore >= 0.4 && fitsRemaining) {
      matchedFields.push("date");
      return { matchType: "AUTO_REVIEW", confidence: Math.round(60 + descriptionScore * 25), matchedQty: 0, status: "REVIEW_REQUIRED", matchedFields, mismatchFields, distanceDays, remainingQtyMatch, fitsRemaining, productCodeMatch };
    }
    return null;
  }

  private async balanceCompanionInvoiceLines(
    source: Awaited<ReturnType<DispatchReconciliationService["source"]>>,
    existingInvoiceLines: Set<string>,
    actor: string,
    invoiceDocumentNo = "",
  ) {
    const invoiceItemsByDocument = new Map<string, AnyRow[]>();
    for (const invoiceLine of source.invoiceItems) {
      const rows = invoiceItemsByDocument.get(invoiceLine.documentId) || [];
      rows.push(invoiceLine);
      invoiceItemsByDocument.set(invoiceLine.documentId, rows);
    }

    let balanced = 0;
    for (const [invoiceId, invoiceLines] of invoiceItemsByDocument) {
      const invoiceDocument = source.docById.get(invoiceId);
      if (invoiceDocumentNo && normalize(invoiceDocument?.documentNo) !== invoiceDocumentNo) continue;
      const activeInvoiceMatches = source.matches.filter(
        (row) => row.invoiceId === invoiceId && ["ACTIVE", "APPROVED"].includes(upper(row.status)),
      );
      const targetLineIds = [...new Set(activeInvoiceMatches.map((row) => row.dispatchLineId))];
      if (targetLineIds.length !== 1) continue;

      const dispatchLineId = targetLineIds[0];
      const dispatchLine = source.dispatchLines.find((row) => row.id === dispatchLineId);
      const dispatchDocument = dispatchLine ? source.docById.get(dispatchLine.documentId || "") : null;
      if (!dispatchLine || !dispatchDocument || !invoiceDocument || !this.sameCompany(dispatchDocument, invoiceDocument)) continue;

      const unmatchedLines = invoiceLines.filter((row) => !existingInvoiceLines.has(row.id) && number(row.quantity) > 0);
      if (!unmatchedLines.length) continue;
      const activeDispatchQty = source.matches
        .filter((row) => row.dispatchLineId === dispatchLineId && ["ACTIVE", "APPROVED"].includes(upper(row.status)))
        .reduce((total, row) => total + number(row.matchedQty), 0);
      const remainingDispatchQty = Math.max(number(dispatchLine.adet) - activeDispatchQty, 0);
      const unmatchedInvoiceQty = unmatchedLines.reduce((total, row) => total + number(row.quantity), 0);

      // Only close an exact remainder. This prevents unrelated service/sample
      // lines from being attached when the invoice does not balance the dispatch.
      if (remainingDispatchQty <= 0 || Math.abs(remainingDispatchQty - unmatchedInvoiceQty) > 0.0001) continue;

      for (const invoiceLine of unmatchedLines) {
        const created = await this.prisma.dispatchInvoiceMatch.create({
          data: {
            mainCompanySlug: source.slug,
            dispatchId: dispatchDocument.id,
            dispatchLineId,
            invoiceId,
            invoiceLineId: invoiceLine.id,
            dispatchQty: dispatchLine.adet,
            matchedQty: invoiceLine.quantity,
            matchType: "AUTO_DOCUMENT_BALANCE",
            confidence: 90,
            status: "ACTIVE",
            matchedFieldsJson: ["company", "invoiceDocument", "documentBalance"],
            mismatchFieldsJson: ["description"],
            isManual: false,
          },
        });
        await this.log(source.slug, dispatchLineId, created.id, "AUTO_MATCH", null, created, "Fatura belge toplamı ile otomatik bakiye eşleştirmesi", actor, true);
        source.matches.push(created);
        existingInvoiceLines.add(invoiceLine.id);
        balanced += 1;
      }
    }
    return balanced;
  }

  async recalculate(slugValue: string, actor = "system", options: AnyRow = {}) {
    const source = await this.source(slugValue);
    const invoiceDocumentNo = normalize(options.invoiceDocumentNo || options.invoiceNo);
    const dispatchDocumentNo = normalize(options.dispatchDocumentNo || options.dispatchNo);
    const existingInvoiceLines = new Set(source.matches.filter((row) => upper(row.status) !== "REJECTED").map((row) => row.invoiceLineId));
    const matchedQtyByDispatchLine = new Map<string, number>();
    for (const match of source.matches) {
      if (!["ACTIVE", "APPROVED"].includes(upper(match.status))) continue;
      matchedQtyByDispatchLine.set(
        match.dispatchLineId,
        number(matchedQtyByDispatchLine.get(match.dispatchLineId)) + number(match.matchedQty),
      );
    }
    const linesByCompany = new Map<string, AnyRow[]>();
    for (const dispatchLine of source.dispatchLines) {
      const document = source.docById.get(dispatchLine.documentId || "");
      if (!document) continue;
      const key = this.companyKey(document);
      const rows = linesByCompany.get(key) || [];
      rows.push(dispatchLine);
      linesByCompany.set(key, rows);
    }
    let exact = 0;
    let strong = 0;
    let review = 0;
    for (const invoiceLine of source.invoiceItems) {
      if (existingInvoiceLines.has(invoiceLine.id)) continue;
      const invoiceDocument = source.docById.get(invoiceLine.documentId);
      if (!invoiceDocument) continue;
      if (invoiceDocumentNo && normalize(invoiceDocument.documentNo) !== invoiceDocumentNo) continue;
      const companyLines = linesByCompany.get(this.companyKey(invoiceDocument)) || [];
      const candidates = companyLines
        .map((dispatchLine) => {
          const dispatchDocument = source.docById.get(dispatchLine.documentId || "");
          if (!dispatchDocument) return null;
          if (dispatchDocumentNo && normalize(dispatchDocument.documentNo) !== dispatchDocumentNo) return null;
          const remainingQty = Math.max(number(dispatchLine.adet) - number(matchedQtyByDispatchLine.get(dispatchLine.id)), 0);
          if (remainingQty <= 0) return null;
          const result = this.score(dispatchLine, dispatchDocument, invoiceLine, invoiceDocument, remainingQty);
          return result ? { dispatchLine, dispatchDocument, result } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const confidenceDifference = b.result.confidence - a.result.confidence;
          if (confidenceDifference) return confidenceDifference;
          if (a.result.remainingQtyMatch !== b.result.remainingQtyMatch) return a.result.remainingQtyMatch ? -1 : 1;
          if (a.result.fitsRemaining !== b.result.fitsRemaining) return a.result.fitsRemaining ? -1 : 1;
          return number(a.result.distanceDays ?? 999999) - number(b.result.distanceDays ?? 999999);
        }) as any[];
      if (!candidates.length) continue;
      const best = candidates[0];
      if (
        candidates[1] &&
        ["ACTIVE", "APPROVED"].includes(upper(best.result.status)) &&
        ["ACTIVE", "APPROVED"].includes(upper(candidates[1].result.status)) &&
        Math.abs(number(candidates[1].result.confidence) - number(best.result.confidence)) <= 2
      ) {
        best.result.status = "DUPLICATE_REVIEW";
        best.result.matchedQty = 0;
      }
      const created = await this.prisma.dispatchInvoiceMatch.create({
        data: {
          mainCompanySlug: source.slug,
          dispatchId: best.dispatchDocument.id,
          dispatchLineId: best.dispatchLine.id,
          invoiceId: invoiceDocument.id,
          invoiceLineId: invoiceLine.id,
          dispatchQty: best.dispatchLine.adet,
          matchedQty: best.result.matchedQty,
          matchType: best.result.matchType,
          confidence: best.result.confidence,
          status: best.result.status,
          matchedFieldsJson: best.result.matchedFields,
          mismatchFieldsJson: best.result.mismatchFields,
          isManual: false,
        },
      });
      await this.log(source.slug, best.dispatchLine.id, created.id, "AUTO_MATCH", null, created, "Otomatik fatura eşleştirme", actor, true);
      source.matches.push(created);
      existingInvoiceLines.add(invoiceLine.id);
      if (["ACTIVE", "APPROVED"].includes(upper(created.status))) {
        matchedQtyByDispatchLine.set(
          created.dispatchLineId,
          number(matchedQtyByDispatchLine.get(created.dispatchLineId)) + number(created.matchedQty),
        );
      }
      if (created.status === "REVIEW_REQUIRED" || created.status === "DUPLICATE_REVIEW") review += 1;
      else if (created.matchType === "AUTO_EXACT") exact += 1;
      else strong += 1;
    }
    const balanced = await this.balanceCompanionInvoiceLines(source, existingInvoiceLines, actor, invoiceDocumentNo);
    const autoClosed = await this.autoCloseRecognizedInvoiceDifferences(source, actor);
    return { ok: true, data: { exact, strong, balanced, review, autoClosedCount: autoClosed.count, autoClosedQty: autoClosed.quantity, processed: exact + strong + balanced + review, autoLinked: exact + strong + balanced, needsApproval: review } };
  }

  private async autoCloseRecognizedInvoiceDifferences(
    source: Awaited<ReturnType<DispatchReconciliationService["source"]>>,
    actor: string,
  ) {
    const recognizedMatches = source.matches.filter((match) => {
      if (!["ACTIVE", "APPROVED"].includes(upper(match.status))) return false;
      const invoiceLine = source.invoiceItems.find((item) => item.id === match.invoiceLineId);
      const dispatchLine = source.dispatchLines.find((item) => item.id === match.dispatchLineId);
      if (!invoiceLine || !dispatchLine || !invoiceNonBillableCategory(invoiceLine)) return false;
      const companionCommercialMatch = source.matches.some((candidate) => {
        if (candidate.id === match.id || candidate.invoiceId !== match.invoiceId || candidate.dispatchLineId !== match.dispatchLineId) return false;
        if (!["ACTIVE", "APPROVED"].includes(upper(candidate.status))) return false;
        const candidateLine = source.invoiceItems.find((item) => item.id === candidate.invoiceLineId);
        return Boolean(candidateLine && !invoiceNonBillableCategory(candidateLine));
      });
      return companionCommercialMatch ||
        hasSharedProductCode(dispatchLine.aciklama || dispatchLine.modelAdi, invoiceLine.description || invoiceLine.productName) ||
        similarity(dispatchLine.aciklama || dispatchLine.modelAdi, invoiceLine.description || invoiceLine.productName) >= 0.55;
    });
    for (const match of recognizedMatches) {
      const invoiceLine = source.invoiceItems.find((item) => item.id === match.invoiceLineId)!;
      const category = invoiceNonBillableCategory(invoiceLine)!;
      const alreadyAllocated = source.nonBillableAllocations.some((allocation) => String(allocation.note || "").includes(`[FATURA_SATIRI:${invoiceLine.id}]`));
      const invoiceNo = source.docById.get(match.invoiceId)?.documentNo || "Fatura";
      const [updatedMatch, created] = await this.prisma.$transaction([
        this.prisma.dispatchInvoiceMatch.update({
          where: { id: match.id },
          data: { status: "RECLASSIFIED_NON_BILLABLE", matchedQty: 0, note: "0 TL fatura satırı bedelsiz adede taşındı." },
        }),
        ...(alreadyAllocated ? [] : [this.prisma.dispatchNonBillableAllocation.create({
          data: {
            mainCompanySlug: source.slug,
            dispatchLineId: match.dispatchLineId,
            category,
            quantity: invoiceLine.quantity,
            deliveryMethod: "ELDEN_TESLIM",
            note: `${invoiceNo} üzerindeki 0 TL ${invoiceLine.description || invoiceLine.productName || "bedelsiz"} satırından otomatik tanımlandı. [FATURA_SATIRI:${invoiceLine.id}]`,
            createdBy: actor,
            updatedBy: actor,
          },
        })]),
      ]);
      Object.assign(match, updatedMatch);
      if (created) {
        source.nonBillableAllocations.push(created);
        await this.log(source.slug, match.dispatchLineId, match.id, "INVOICE_LINE_RECLASSIFIED_NON_BILLABLE", match, created, created.note || "0 TL fatura satırı bedelsiz adede taşındı", actor, true);
      }
    }
    const recognizedByInvoice = new Map<string, AnyRow[]>();
    for (const item of source.invoiceItems) {
      const category = invoiceNonBillableCategory(item);
      if (!category || number(item.quantity) <= 0) continue;
      const rows = recognizedByInvoice.get(item.documentId) || [];
      rows.push({ ...item, category });
      recognizedByInvoice.set(item.documentId, rows);
    }
    let count = 0;
    let quantity = 0;
    for (const [invoiceId, recognizedLines] of recognizedByInvoice) {
      const activeMatches = source.matches.filter((match) => match.invoiceId === invoiceId && ["ACTIVE", "APPROVED"].includes(upper(match.status)));
      const dispatchLineIds = [...new Set(activeMatches.map((match) => match.dispatchLineId))];
      const openRows = dispatchLineIds.map((dispatchLineId) => {
        const line = source.dispatchLines.find((item) => item.id === dispatchLineId);
        const invoicedQty = source.matches.filter((match) => match.dispatchLineId === dispatchLineId && ["ACTIVE", "APPROVED"].includes(upper(match.status))).reduce((total, match) => total + number(match.matchedQty), 0);
        const allocatedQty = source.nonBillableAllocations.filter((allocation) => allocation.dispatchLineId === dispatchLineId && !allocation.deletedAt).reduce((total, allocation) => total + number(allocation.quantity), 0);
        return line ? { line, gap: Math.max(number(line.adet) - invoicedQty - allocatedQty, 0) } : null;
      }).filter((row): row is { line: AnyRow; gap: number } => Boolean(row && row.gap > 0.0001));
      if (openRows.length !== 1) continue;
      const target = openRows[0];
      const availableLines = recognizedLines.filter((item) => !source.nonBillableAllocations.some((allocation) => String(allocation.note || "").includes(`[FATURA_SATIRI:${item.id}]`)));
      const detectedQty = availableLines.reduce((total, item) => total + number(item.quantity), 0);
      if (!availableLines.length || Math.abs(target.gap - detectedQty) > 0.0001) continue;
      const invoiceNo = source.docById.get(invoiceId)?.documentNo || "Fatura";
      const createdRows = await this.prisma.$transaction(
        availableLines.map((item) => this.prisma.dispatchNonBillableAllocation.create({
          data: {
            mainCompanySlug: source.slug,
            dispatchLineId: target.line.id,
            category: item.category,
            quantity: item.quantity,
            deliveryMethod: "ELDEN_TESLIM",
            note: `${invoiceNo} üzerindeki 0 TL ${item.description || item.productName || "bedelsiz"} satırından otomatik tanımlandı. [FATURA_SATIRI:${item.id}]`,
            createdBy: actor,
            updatedBy: actor,
          },
        })),
      );
      for (const created of createdRows) {
        source.nonBillableAllocations.push(created);
        await this.log(source.slug, target.line.id, null, "NON_BILLABLE_AUTO_CLOSED_FROM_INVOICE", null, created, created.note || "Faturadaki 0 TL satırından otomatik kapatıldı", actor, true);
        count += 1;
        quantity += number(created.quantity);
      }
    }
    return { count, quantity };
  }

  async approvePartialDifference(slugValue: string, dispatchLineId: string, body: AnyRow = {}, actor = "user") {
    const slug = this.requireSlug(slugValue);
    await this.recalculate(slug, actor);
    const source = await this.source(slug);
    const row = this.compose(source).find((item) => item.dispatchLineId === dispatchLineId);
    if (!row) throw new NotFoundException("Irsaliye kalemi bulunamadi.");
    const remaining = number(row.invoiceRemainingQty);
    if (remaining <= 0) return { ok: true, data: row };
    const context = await this.nonBillableContext(slug, dispatchLineId);
    const maximumQty = Math.max(number(context.line.adet) - context.invoicedQty - context.allocatedQty, 0);
    if (remaining > maximumQty + 0.0001) {
      throw new BadRequestException(`Kısmi fark doğrulanamadı. Kalan ${remaining}, kapatılabilir ${maximumQty}.`);
    }
    if (body.dryRun === true) {
      return { ok: true, data: { dispatchLineId, remainingQty: remaining, maximumQty, eligible: true } };
    }
    const category = NON_BILLABLE_CATEGORIES.has(upper(body.category)) ? upper(body.category) : "OTHER_NON_BILLABLE";
    await this.createNonBillable(slug, dispatchLineId, {
      category,
      quantity: remaining,
      deliveryMethod: "ELDEN_TESLIM",
      note: body.note || `${remaining} adet kısmi fark kullanıcı bilgisi dahilinde onaylanarak kapatıldı.`,
    }, actor);
    return this.detail(slug, dispatchLineId);
  }

  async approvePartialDifferences(slugValue: string, body: AnyRow = {}, actor = "user") {
    const slug = this.requireSlug(slugValue);
    const requestedIds = [...new Set(
      (Array.isArray(body.dispatchLineIds) ? body.dispatchLineIds : [])
        .map((id: any) => String(id || "").trim())
        .filter(Boolean),
    )] as string[];
    if (!requestedIds.length) throw new BadRequestException("Onaylanacak kısmi kayıt seçilmedi.");
    await this.recalculate(slug, actor);
    const source = await this.source(slug);
    const rows = this.compose(source);
    const selectedRows = requestedIds
      .map((id) => rows.find((row) => row.dispatchLineId === id))
      .filter(Boolean) as AnyRow[];
    if (selectedRows.length !== requestedIds.length) throw new BadRequestException("Seçilen kayıtlardan bazıları bulunamadı.");
    const partialRows = selectedRows.filter((row) => row.invoiceStatus === "PARTIAL" && number(row.invoiceRemainingQty) > 0);
    if (!partialRows.length) return { ok: true, data: { approvedCount: 0, approvedQty: 0, skippedCount: selectedRows.length } };
    const createdRows = await this.prisma.$transaction(
      partialRows.map((row) => this.prisma.dispatchNonBillableAllocation.create({
        data: {
          mainCompanySlug: slug,
          dispatchLineId: row.dispatchLineId,
          category: "OTHER_NON_BILLABLE",
          quantity: row.invoiceRemainingQty,
          deliveryMethod: "ELDEN_TESLIM",
          note: `${number(row.invoiceRemainingQty)} adet kısmi fark toplu seçim ile kullanıcı bilgisi dahilinde onaylanarak kapatıldı.`,
          createdBy: actor,
          updatedBy: actor,
        },
      })),
    );
    for (const created of createdRows) {
      await this.log(slug, created.dispatchLineId, null, "PARTIAL_BULK_APPROVED", null, created, created.note || "Kısmi fark toplu onaylandı", actor);
    }
    return {
      ok: true,
      data: {
        approvedCount: createdRows.length,
        approvedQty: createdRows.reduce((total, row) => total + number(row.quantity), 0),
        skippedCount: selectedRows.length - partialRows.length,
      },
    };
  }

  async resolveReview(slugValue: string, dispatchLineId: string, body: AnyRow = {}, actor = "user") {
    const slug = this.requireSlug(slugValue);
    const line = await this.prisma.customerDispatchLine.findFirst({
      where: { id: dispatchLineId, mainCompanySlug: slug, deletedAt: null },
    });
    if (!line) throw new NotFoundException("İrsaliye kalemi bulunamadı.");

    const pending = await this.prisma.dispatchInvoiceMatch.findMany({
      where: { dispatchLineId, mainCompanySlug: slug, status: { in: ["REVIEW_REQUIRED", "DUPLICATE_REVIEW"] } },
      orderBy: { createdAt: "asc" },
    });
    if (!pending.length) throw new BadRequestException("Bu kayıt için bekleyen kontrol önerisi bulunamadı.");

    if (body.dryRun === true) {
      return { ok: true, data: { dispatchLineId, pendingCount: pending.length, eligible: true } };
    }

    const note = String(body.note || "Kontrol kullanıcı tarafından onaylandı; mevcut kesinleşmiş adetler korundu ve bekleyen öneriler kapatıldı.");
    const resolvedAt = new Date();
    await this.prisma.$transaction(
      pending.map((match) => this.prisma.dispatchInvoiceMatch.update({
        where: { id: match.id },
        data: { status: "REVIEW_RESOLVED", matchedQty: 0, approvedBy: actor, approvedAt: resolvedAt, rejectedBy: null, rejectedAt: null, note },
      })),
    );
    for (const match of pending) {
      await this.log(slug, dispatchLineId, match.id, "REVIEW_RESOLVED", match, { ...match, status: "REVIEW_RESOLVED", matchedQty: 0 }, note, actor);
    }
    const refreshed = await this.source(slug);
    const row = this.compose(refreshed).find((item) => item.dispatchLineId === dispatchLineId);
    return { ok: true, data: { dispatchLineId, resolvedCount: pending.length, invoiceStatus: row?.invoiceStatus || "", remainingQty: number(row?.invoiceRemainingQty) } };
  }

  async resolveReviews(slugValue: string, body: AnyRow = {}, actor = "user") {
    const slug = this.requireSlug(slugValue);
    const ids = [...new Set((Array.isArray(body.dispatchLineIds) ? body.dispatchLineIds : []).map((id: any) => String(id || "").trim()).filter(Boolean))];
    if (!ids.length) throw new BadRequestException("Onaylanacak kontrol kaydı seçilmedi.");
    const lines = await this.prisma.customerDispatchLine.findMany({
      where: { id: { in: ids }, mainCompanySlug: slug, deletedAt: null },
      select: { id: true },
    });
    if (lines.length !== ids.length) throw new BadRequestException("Seçilen kontrol kayıtlarından biri bulunamadı veya bu firmaya ait değil.");
    const pending = await this.prisma.dispatchInvoiceMatch.findMany({
      where: { dispatchLineId: { in: ids }, mainCompanySlug: slug, status: { in: ["REVIEW_REQUIRED", "DUPLICATE_REVIEW"] } },
      orderBy: { createdAt: "asc" },
    });
    const approvedLineIds = new Set(pending.map((match) => match.dispatchLineId));
    if (body.dryRun === true) {
      return { ok: true, data: { approvedCount: approvedLineIds.size, resolvedSuggestionCount: pending.length, skippedCount: ids.length - approvedLineIds.size, eligible: true } };
    }
    const note = String(body.note || "Toplu kontrol kullanıcı tarafından onaylandı; mevcut kesinleşmiş adetler korundu ve bekleyen öneriler kapatıldı.");
    const resolvedAt = new Date();
    await this.prisma.$transaction(
      pending.map((match) => this.prisma.dispatchInvoiceMatch.update({
        where: { id: match.id },
        data: { status: "REVIEW_RESOLVED", matchedQty: 0, approvedBy: actor, approvedAt: resolvedAt, rejectedBy: null, rejectedAt: null, note },
      })),
    );
    for (const match of pending) {
      await this.log(slug, match.dispatchLineId, match.id, "REVIEW_RESOLVED", match, { ...match, status: "REVIEW_RESOLVED", matchedQty: 0 }, note, actor);
    }
    return {
      ok: true,
      data: {
        approvedCount: approvedLineIds.size,
        resolvedSuggestionCount: pending.length,
        skippedCount: ids.length - approvedLineIds.size,
      },
    };
  }

  private async log(slug: string, dispatchLineId: string, matchId: string | null, action: string, oldValue: any, newValue: any, description: string, userId: string, isAutomatic = false) {
    return this.prisma.dispatchInvoiceMatchLog.create({
      data: { mainCompanySlug: slug, dispatchLineId, matchId, action, oldValueJson: oldValue ?? undefined, newValueJson: newValue ?? undefined, description, userId, isAutomatic },
    });
  }

  async manualMatch(slugValue: string, dispatchLineId: string, body: AnyRow) {
    const source = await this.source(slugValue);
    const dispatchLine = source.dispatchLines.find((row) => row.id === dispatchLineId);
    const invoiceLine = source.invoiceItems.find((row) => row.id === body.invoiceLineId);
    if (!dispatchLine || !invoiceLine) throw new NotFoundException("İrsaliye veya fatura kalemi bulunamadı.");
    const invoiceDocument = source.docById.get(invoiceLine.documentId);
    const dispatchDocument = source.docById.get(dispatchLine.documentId || "");
    if (!invoiceDocument || !dispatchDocument || !this.sameCompany(dispatchDocument, invoiceDocument)) throw new BadRequestException("Farklı firmalara ait kayıtlar eşleştirilemez.");
    const matchedQty = number(body.matchedQty ?? invoiceLine.quantity);
    if (matchedQty <= 0) throw new BadRequestException("Eşleşen adet sıfırdan büyük olmalıdır.");
    const previous = source.matches.find((row) => row.invoiceLineId === invoiceLine.id);
    const saved = previous
      ? await this.prisma.dispatchInvoiceMatch.update({
          where: { id: previous.id },
          data: { dispatchId: dispatchDocument.id, dispatchLineId, invoiceId: invoiceDocument.id, dispatchQty: dispatchLine.adet, matchedQty, matchType: "MANUAL", confidence: 100, status: "APPROVED", isManual: true, approvedBy: body.userId || body.actor || "user", approvedAt: new Date(), rejectedBy: null, rejectedAt: null, note: body.note || null },
        })
      : await this.prisma.dispatchInvoiceMatch.create({
          data: { mainCompanySlug: source.slug, dispatchId: dispatchDocument.id, dispatchLineId, invoiceId: invoiceDocument.id, invoiceLineId: invoiceLine.id, dispatchQty: dispatchLine.adet, matchedQty, matchType: "MANUAL", confidence: 100, status: "APPROVED", isManual: true, approvedBy: body.userId || body.actor || "user", approvedAt: new Date(), note: body.note || null },
        });
    await this.log(source.slug, dispatchLineId, saved.id, previous ? "MATCH_UPDATED" : "MANUAL_MATCH", previous, saved, body.note || "Manuel fatura eşleştirme", body.userId || body.actor || "user");
    return { ok: true, data: saved };
  }

  async updateMatch(slugValue: string, matchId: string, body: AnyRow) {
    const slug = this.requireSlug(slugValue);
    const previous = await this.prisma.dispatchInvoiceMatch.findFirst({ where: { id: matchId, mainCompanySlug: slug } });
    if (!previous) throw new NotFoundException("Eşleşme bulunamadı.");
    const saved = await this.prisma.dispatchInvoiceMatch.update({
      where: { id: matchId },
      data: { ...(body.matchedQty !== undefined ? { matchedQty: number(body.matchedQty) } : {}), ...(body.note !== undefined ? { note: String(body.note || "") } : {}), status: body.status || previous.status, isManual: true },
    });
    await this.log(slug, saved.dispatchLineId, saved.id, "MATCH_UPDATED", previous, saved, body.note || "Eşleşme güncellendi", body.userId || body.actor || "user");
    return { ok: true, data: saved };
  }

  async decideMatch(slugValue: string, matchId: string, approved: boolean, body: AnyRow = {}) {
    const slug = this.requireSlug(slugValue);
    const previous = await this.prisma.dispatchInvoiceMatch.findFirst({ where: { id: matchId, mainCompanySlug: slug } });
    if (!previous) throw new NotFoundException("Eşleşme bulunamadı.");
    const actor = body.userId || body.actor || "user";
    let approvedQty = 0;
    if (approved) {
      const context = await this.nonBillableContext(slug, previous.dispatchLineId);
      const invoiceLine = await this.prisma.invoiceItem.findFirst({ where: { id: previous.invoiceLineId, mainCompanySlug: slug } });
      if (!invoiceLine) throw new NotFoundException("Fatura kalemi bulunamadı.");
      if (invoiceNonBillableCategory(invoiceLine)) {
        throw new BadRequestException("Bu sıfır TL satırı fatura adedi olarak değil, ücretsiz/test adedi olarak kaydedilmelidir.");
      }
      const maximumQty = Math.max(number(context.line.adet) - number(context.invoicedQty) - number(context.allocatedQty), 0);
      if (maximumQty <= 0) throw new BadRequestException("İrsaliye adedi zaten tamamen kapanmış; bu öneri Kontrolü Onayla ile kapatılmalıdır.");
      const requestedQty = body.matchedQty === undefined || body.matchedQty === null || body.matchedQty === ""
        ? Math.min(number(invoiceLine.quantity), maximumQty)
        : number(body.matchedQty);
      if (requestedQty <= 0) throw new BadRequestException("Onaylanacak fatura adedi sıfırdan büyük olmalıdır.");
      if (requestedQty > maximumQty + 0.0001) {
        throw new BadRequestException(`En fazla ${maximumQty} adet fatura eşleşmesi onaylanabilir.`);
      }
      approvedQty = requestedQty;
    }
    const saved = await this.prisma.dispatchInvoiceMatch.update({
      where: { id: matchId },
      data: approved
        ? { status: "APPROVED", matchedQty: approvedQty, approvedBy: actor, approvedAt: new Date(), rejectedBy: null, rejectedAt: null, note: body.note || previous.note }
        : { status: "REJECTED", matchedQty: 0, rejectedBy: actor, rejectedAt: new Date(), note: body.note || previous.note },
    });
    await this.log(slug, saved.dispatchLineId, saved.id, approved ? "MATCH_APPROVED" : "MATCH_REJECTED", previous, saved, body.note || (approved ? "Eşleşme onaylandı" : "Eşleşme reddedildi"), actor);
    return { ok: true, data: saved };
  }

  async deleteMatch(slugValue: string, matchId: string, body: AnyRow = {}) {
    const slug = this.requireSlug(slugValue);
    const previous = await this.prisma.dispatchInvoiceMatch.findFirst({ where: { id: matchId, mainCompanySlug: slug } });
    if (!previous) throw new NotFoundException("Eşleşme bulunamadı.");
    await this.log(slug, previous.dispatchLineId, previous.id, "MATCH_REMOVED", previous, null, body.note || "Fatura eşleşmesi kaldırıldı", body.userId || body.actor || "user");
    await this.prisma.dispatchInvoiceMatch.delete({ where: { id: matchId } });
    return { ok: true, data: { id: matchId } };
  }

  async updateDispatchLine(slugValue: string, id: string, body: AnyRow) {
    const slug = this.requireSlug(slugValue);
    const previous = await this.prisma.customerDispatchLine.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null } });
    if (!previous) throw new NotFoundException("İrsaliye kalemi bulunamadı.");
    const saved = await this.prisma.customerDispatchLine.update({
      where: { id },
      data: { ...(body.description !== undefined || body.aciklama !== undefined ? { aciklama: String(body.description ?? body.aciklama ?? "") } : {}), ...(body.dispatchQty !== undefined || body.adet !== undefined ? { adet: number(body.dispatchQty ?? body.adet) } : {}), ...(body.unit !== undefined || body.birim !== undefined ? { birim: String(body.unit ?? body.birim ?? "ADET") } : {}) },
    });
    await this.log(slug, id, null, "DISPATCH_LINE_UPDATED", previous, saved, body.note || "İrsaliye kalemi güncellendi", body.userId || body.actor || "user");
    return { ok: true, data: saved };
  }

  private async nonBillableContext(slugValue: string, dispatchLineId: string, excludedAllocationId = "") {
    const slug = this.requireSlug(slugValue);
    const line = await this.prisma.customerDispatchLine.findFirst({
      where: { id: dispatchLineId, mainCompanySlug: slug, deletedAt: null },
    });
    if (!line) throw new NotFoundException("Irsaliye kalemi bulunamadi.");
    const [matches, allocations] = await Promise.all([
      this.prisma.dispatchInvoiceMatch.findMany({
        where: { mainCompanySlug: slug, dispatchLineId, status: { in: ["ACTIVE", "APPROVED"] } },
      }),
      this.prisma.dispatchNonBillableAllocation.findMany({
        where: {
          mainCompanySlug: slug,
          dispatchLineId,
          deletedAt: null,
          ...(excludedAllocationId ? { id: { not: excludedAllocationId } } : {}),
        },
      }),
    ]);
    const invoiceLineIds = matches.map((row) => row.invoiceLineId).filter(Boolean);
    const invoiceLines = invoiceLineIds.length
      ? await this.prisma.invoiceItem.findMany({ where: { id: { in: invoiceLineIds } } })
      : [];
    const invoicedQty = matches
      .filter((match) => {
        const invoiceLine = invoiceLines.find((item) => item.id === match.invoiceLineId);
        return !invoiceLine || !invoiceNonBillableCategory(invoiceLine);
      })
      .reduce((total, row) => total + number(row.matchedQty), 0);
    const allocatedQty = allocations.reduce((total, row) => total + number(row.quantity), 0);
    return { slug, line, invoicedQty, allocatedQty };
  }

  private validateNonBillable(body: AnyRow, maximumQty: number) {
    const category = upper(body.category);
    const deliveryMethod = upper(body.deliveryMethod || "ELDEN_TESLIM");
    const quantity = number(body.quantity);
    if (!NON_BILLABLE_CATEGORIES.has(category)) {
      throw new BadRequestException("Gecersiz ucretsiz adet nedeni.");
    }
    if (!NON_BILLABLE_DELIVERY_METHODS.has(deliveryMethod)) {
      throw new BadRequestException("Gecersiz teslim sekli.");
    }
    if (quantity <= 0) throw new BadRequestException("Ucretsiz adet sifirdan buyuk olmalidir.");
    if (quantity > maximumQty + 0.0001) {
      throw new BadRequestException(`En fazla ${maximumQty} adet ucretsiz olarak kapatilabilir.`);
    }
    return { category, deliveryMethod, quantity, note: String(body.note || "").trim() || null };
  }

  async createNonBillable(slugValue: string, dispatchLineId: string, body: AnyRow, actor = "user") {
    const context = await this.nonBillableContext(slugValue, dispatchLineId);
    const maximumQty = Math.max(number(context.line.adet) - context.invoicedQty - context.allocatedQty, 0);
    const input = this.validateNonBillable(body, maximumQty);
    const saved = await this.prisma.dispatchNonBillableAllocation.create({
      data: {
        mainCompanySlug: context.slug,
        dispatchLineId,
        ...input,
        createdBy: actor,
        updatedBy: actor,
      },
    });
    await this.log(context.slug, dispatchLineId, null, "NON_BILLABLE_CREATED", null, saved, input.note || "Ucretsiz adet kaydi eklendi", actor);
    return { ok: true, data: saved };
  }

  async updateNonBillable(slugValue: string, dispatchLineId: string, allocationId: string, body: AnyRow, actor = "user") {
    const context = await this.nonBillableContext(slugValue, dispatchLineId, allocationId);
    const previous = await this.prisma.dispatchNonBillableAllocation.findFirst({
      where: { id: allocationId, mainCompanySlug: context.slug, dispatchLineId, deletedAt: null },
    });
    if (!previous) throw new NotFoundException("Ucretsiz adet kaydi bulunamadi.");
    const maximumQty = Math.max(number(context.line.adet) - context.invoicedQty - context.allocatedQty, 0);
    const input = this.validateNonBillable({ ...previous, ...body }, maximumQty);
    const saved = await this.prisma.dispatchNonBillableAllocation.update({
      where: { id: allocationId },
      data: { ...input, updatedBy: actor },
    });
    await this.log(context.slug, dispatchLineId, null, "NON_BILLABLE_UPDATED", previous, saved, input.note || "Ucretsiz adet kaydi guncellendi", actor);
    return { ok: true, data: saved };
  }

  async removeNonBillable(slugValue: string, dispatchLineId: string, allocationId: string, actor = "user") {
    const slug = this.requireSlug(slugValue);
    const previous = await this.prisma.dispatchNonBillableAllocation.findFirst({
      where: { id: allocationId, mainCompanySlug: slug, dispatchLineId, deletedAt: null },
    });
    if (!previous) throw new NotFoundException("Ucretsiz adet kaydi bulunamadi.");
    const saved = await this.prisma.dispatchNonBillableAllocation.update({
      where: { id: allocationId },
      data: { deletedAt: new Date(), updatedBy: actor },
    });
    await this.log(slug, dispatchLineId, null, "NON_BILLABLE_REMOVED", previous, saved, "Ucretsiz adet kaydi kaldirildi", actor);
    return { ok: true, data: { id: allocationId } };
  }

  async updateDispatch(slugValue: string, id: string, body: AnyRow) {
    const slug = this.requireSlug(slugValue);
    const previous = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
    });
    if (!previous || !isDispatch(previous)) {
      throw new NotFoundException("Müşteri irsaliyesi bulunamadı.");
    }
    const previousRaw = json(previous.raw);
    const nextRaw = {
      ...previousRaw,
      ...(body.orderNo !== undefined ? { orderNo: String(body.orderNo || "") } : {}),
      ...(body.note !== undefined ? { reconciliationNote: String(body.note || "") } : {}),
    };
    const saved = await this.prisma.document.update({
      where: { id },
      data: {
        ...(body.dispatchNo !== undefined ? { documentNo: String(body.dispatchNo || "") } : {}),
        ...(body.dispatchDate ? { date: new Date(body.dispatchDate) } : {}),
        raw: nextRaw,
        metadata: nextRaw,
      },
    });
    const firstLine = await this.prisma.customerDispatchLine.findFirst({
      where: { mainCompanySlug: slug, documentId: id, deletedAt: null },
    });
    if (firstLine) {
      await this.log(slug, firstLine.id, null, "DISPATCH_UPDATED", previous, saved, body.note || "İrsaliye bilgileri güncellendi", body.userId || body.actor || "user");
    }
    return { ok: true, data: saved };
  }

  async linkModel(slugValue: string, id: string, body: AnyRow, remove = false) {
    const slug = this.requireSlug(slugValue);
    const previous = await this.prisma.customerDispatchLine.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null } });
    if (!previous) throw new NotFoundException("İrsaliye kalemi bulunamadı.");
    let model: AnyRow | null = null;
    if (!remove) {
      const modelId = String(body.modelId || "");
      model = await this.prisma.modelRecord.findFirst({ where: { id: modelId, mainCompanySlug: slug } });
      if (!model) throw new NotFoundException("Model bulunamadı.");
    }
    const saved = await this.prisma.customerDispatchLine.update({
      where: { id },
      data: remove
        ? { modelId: null, modelAdi: null, durum: "MODEL_BAGLANTISI_BEKLIYOR" }
        : { modelId: model!.id, modelAdi: model!.modelName, durum: "MODELE_BAGLI" },
    });
    if (previous.documentId) {
      if (remove && previous.modelId) await this.prisma.modelDocumentLink.deleteMany({ where: { mainCompanySlug: slug, modelId: previous.modelId, documentId: previous.documentId } });
      if (!remove) await this.prisma.modelDocumentLink.upsert({ where: { mainCompanySlug_modelId_documentId: { mainCompanySlug: slug, modelId: model!.id, documentId: previous.documentId } }, create: { mainCompanySlug: slug, modelId: model!.id, documentId: previous.documentId, raw: { source: "customer_dispatch_line", dispatchLineId: id } }, update: { raw: { source: "customer_dispatch_line", dispatchLineId: id } } });
      if (!remove) {
        const document = await this.prisma.document.findUnique({
          where: { id: previous.documentId },
          select: { documentNo: true },
        });
        if (document?.documentNo) {
          await this.isnetOperations.finalizeStagedArchiveByDocumentNo(
            slug,
            document.documentNo,
            model!.modelName,
          );
        }
      }
    }
    await this.log(slug, id, null, remove ? "MODEL_UNLINKED" : "MODEL_LINKED", previous, saved, body.note || (remove ? "Model bağlantısı kaldırıldı" : "Model bağlandı"), body.userId || body.actor || "user");
    return { ok: true, data: saved };
  }

  async createAndLinkModel(slugValue: string, id: string, body: AnyRow) {
    const slug = this.requireSlug(slugValue);
    const line = await this.prisma.customerDispatchLine.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
    });
    if (!line) throw new NotFoundException("Irsaliye kalemi bulunamadi.");
    if (body.confirmed !== true) {
      throw new BadRequestException("Yeni model olusturmak icin kullanici onayi zorunludur.");
    }
    const modelName = String(body.modelName || line.modelAdi || line.aciklama || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!modelName) throw new BadRequestException("Model adi zorunludur.");
    const normalized = normalize(modelName);
    const existingRows = await this.prisma.modelRecord.findMany({
      where: { mainCompanySlug: slug, NOT: { status: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
    });
    const existing = existingRows.find((row) => normalize(row.modelName) === normalized);
    const model = existing || await this.prisma.modelRecord.create({
      data: {
        mainCompanySlug: slug,
        modelName,
        modelCode: String(body.modelCode || "").trim() || null,
        status: "ACTIVE",
        raw: {
          source: "ISNET_DISPATCH_WORKSPACE",
          dispatchLineId: id,
          sourceDescription: line.aciklama || "",
        },
      },
    });
    return this.linkModel(slug, id, {
      ...body,
      modelId: model.id,
      note: body.note || (existing ? "Mevcut model bulundu ve baglandi" : "Yeni model olusturuldu ve baglandi"),
    });
  }

  async addProduction(slugValue: string, id: string, body: AnyRow) {
    const slug = this.requireSlug(slugValue);
    const line = await this.prisma.customerDispatchLine.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null } });
    if (!line) throw new NotFoundException("İrsaliye kalemi bulunamadı.");
    const qty = Math.round(number(body.quantity ?? body.adet));
    if (qty <= 0) throw new BadRequestException("İmalat adedi sıfırdan büyük olmalıdır.");
    const saved = await this.prisma.productionRecord.create({
      data: { mainCompanySlug: slug, modelId: line.modelId, modelName: line.modelAdi, orderNo: body.orderNo || null, machineName: body.machineName || body.makine || null, totalQuantity: qty, machinist: body.machinist || body.makinaci || null, shift: body.shift || body.vardiya || null, printArea: body.printArea || body.bolge || null, productionDate: body.productionDate ? new Date(body.productionDate) : new Date(), note: body.note || null, raw: { dispatchLineId: id, source: "customer_dispatch_workspace" } },
    });
    if (line.modelId) await this.prisma.modelProductionLink.upsert({ where: { mainCompanySlug_modelId_productionRecordId: { mainCompanySlug: slug, modelId: line.modelId, productionRecordId: saved.id } }, create: { mainCompanySlug: slug, modelId: line.modelId, productionRecordId: saved.id, raw: { dispatchLineId: id } }, update: { raw: { dispatchLineId: id } } });
    await this.log(slug, id, null, "PRODUCTION_CREATED", null, saved, body.note || "İmalat kaydı eklendi", body.userId || body.actor || "user");
    return { ok: true, data: saved };
  }

  async history(slugValue: string, dispatchLineId: string) {
    const slug = this.requireSlug(slugValue);
    const rows = await this.prisma.dispatchInvoiceMatchLog.findMany({ where: { mainCompanySlug: slug, dispatchLineId }, orderBy: { createdAt: "desc" } });
    return { ok: true, data: rows };
  }

  async invoiceCandidates(slugValue: string, dispatchLineId: string) {
    const source = await this.source(slugValue);
    const line = source.dispatchLines.find((item) => item.id === dispatchLineId);
    if (!line) throw new NotFoundException("İrsaliye kalemi bulunamadı.");
    const document = source.docById.get(line.documentId || "");
    const used = new Set(
      source.matches
        .filter(
          (row) =>
            row.invoiceLineId &&
            ["ACTIVE", "APPROVED"].includes(upper(row.status)),
        )
        .map((row) => row.invoiceLineId),
    );
    const alreadyMatchedQty = source.matches
      .filter((row) => row.dispatchLineId === dispatchLineId && ["ACTIVE", "APPROVED"].includes(upper(row.status)))
      .reduce((total, row) => total + number(row.matchedQty), 0);
    const remainingQty = Math.max(number(line.adet) - alreadyMatchedQty, 0);
    const rows = source.invoiceItems
      .filter((item) => !used.has(item.id))
      .filter(
        (item) =>
          number(item.quantity) > 0 &&
          (Math.abs(number(item.unitPrice)) > 0.0001 ||
            Math.abs(number(item.lineTotal)) > 0.0001),
      )
      .map((item) => {
        const invoice = source.docById.get(item.documentId) || {};
        const score = this.score(
          line,
          document || {},
          item,
          invoice,
          remainingQty,
        );
        const sameCompany = this.sameCompany(document || {}, invoice);
        return {
          ...item,
          invoice,
          score:
            score ||
            (sameCompany
              ? {
                  matchType: "MANUAL_SELECTION",
                  confidence: 0,
                  matchedQty: 0,
                  status: "MANUAL",
                  matchedFields: ["company"],
                  mismatchFields: ["description", "quantity"],
                  manualOnly: true,
                }
              : null),
        };
      })
      .filter((item) => item.score)
      .sort((a, b) => number(b.score?.confidence) - number(a.score?.confidence) || number(a.score?.distanceDays ?? 999999) - number(b.score?.distanceDays ?? 999999));
    return { ok: true, data: rows };
  }
}
