export type DocumentKind =
  | "OUR_INVOICE"
  | "OUR_DISPATCH"
  | "CUSTOMER_DISPATCH"
  | "SUPPLIER_INVOICE"
  | "EXPENSE_INVOICE"
  | "UNKNOWN";

export type DocumentDirection = "INCOMING" | "OUTGOING" | "UNKNOWN";

export type DocumentIntakeStatus =
  | "UPLOADED"
  | "PARSED"
  | "CONTROL_WAITING"
  | "MISSING_INFO"
  | "READY"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED";

export type MatchStatus = "MATCHED" | "SUGGESTED" | "NEW_DRAFT" | "MISSING" | "PENDING";

export class DocumentIntakeQueryDto {
  status?: string;
  documentKind?: string;
  firmId?: string;
  modelId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  mainCompanySlug?: string;
  mainCompanyId?: string;
  limit?: string;
  pageSize?: string;
  offset?: string;
}

export class DocumentIntakeFixDto {
  firmId?: string;
  modelId?: string;
  documentKind?: DocumentKind;
  lines?: Array<{
    lineId: string;
    productId?: string;
    lotNo?: string;
    createProduct?: boolean;
  }>;
}

export class CreateFirmDraftDto {
  firmType?: "SUPPLIER" | "CUSTOMER" | "BOTH" | string;
  confirm?: boolean;
}

export class CreateProductDraftDto {
  confirm?: boolean;
  productGroup?: string;
  unit?: string;
}

export class ApproveDocumentIntakeDto {
  confirm?: boolean;
  mainCompanySlug?: string;
  mainCompanyId?: string;
  manualApproval?: boolean;
  manualApprovalReason?: string;
  approvedBy?: string;
}

export class BulkApproveDocumentIntakeDto extends ApproveDocumentIntakeDto {
  ids?: string[];
}

export type ParsedDocumentLine = {
  lineId?: string;
  lineNo: number;
  rawName: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  priceDerived?: boolean;
  priceSource?: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  lotNo?: string;
  modelGuess?: string;
  sellerItemId?: string;
  manufacturerItemId?: string;
  standardItemId?: string;
  additionalItemIds?: string[];
  orderNo?: string;
  productCode?: string;
  color?: string;
  region?: string;
  sourceNote?: string;
  productId?: string | null;
  productDraftJson?: Record<string, unknown> | null;
  productMatchStatus?: MatchStatus;
  missingFields?: string[];
};

export type ParsedDocument = {
  originalFileName: string;
  filePath: string;
  fileHash: string;
  mimeType: string;
  rawText: string;
  sourceType: "PDF" | "XML" | "IMAGE_AI" | "IMAGE_OCR" | "UNKNOWN";
  documentNo: string;
  invoiceNo: string;
  dispatchNo: string;
  scenario: string;
  documentType: string;
  issueDate: string;
  dueDate?: string;
  issuerName: string;
  issuerTaxNo: string;
  receiverName: string;
  receiverTaxNo: string;
  currency: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  modelGuess: string;
  lines: ParsedDocumentLine[];
  taxBreakdown?: Record<string, unknown>;
  controlSummary?: Record<string, unknown>;
  parseRawJson: Record<string, unknown>;
};
