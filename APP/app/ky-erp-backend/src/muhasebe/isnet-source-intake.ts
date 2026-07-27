import { createHash } from 'node:crypto';

export type IsnetSourceType = 'PORTAL' | 'MANUAL_PDF' | 'NO_CUSTOMER_DISPATCH';

export type IsnetCompanyRole = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

export interface IsnetSourceIntakeInput {
  sourceType: IsnetSourceType;
  companyId?: string | null;
  companyName: string;
  companyRole?: IsnetCompanyRole | null;
  modelId?: string | null;
  modelName: string;
  orderNo?: string | null;
  customerDispatchNo?: string | null;
  issueDate: string;
  quantity: number;
  unit?: string | null;
  note?: string | null;
  ettn?: string | null;
  portalDocumentId?: string | null;
  pdfBuffer?: Buffer | null;
  pdfFileName?: string | null;
}

export interface NormalizedIsnetSourceIntake {
  sourceType: IsnetSourceType;
  companyId: string | null;
  companyName: string;
  companyRole: IsnetCompanyRole;
  modelId: string | null;
  modelName: string;
  orderNo: string | null;
  customerDispatchNo: string | null;
  issueDate: string;
  quantity: number;
  unit: string;
  note: string | null;
  ettn: string | null;
  portalDocumentId: string | null;
  internalReference: string;
  dedupeKey: string;
  status: 'NEW' | 'MODEL_PENDING' | 'READY_FOR_PRODUCTION' | 'NON_BILLABLE_SUPPLIER';
  customerDispatchMissing: boolean;
  pdfSha256: string | null;
  pdfFileName: string | null;
}

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function upperTr(value: unknown): string {
  return clean(value).toLocaleUpperCase('tr-TR');
}

function normalizeDate(value: string): string {
  const text = clean(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('İşlem tarihi YYYY-AA-GG biçiminde olmalıdır.');
  }
  const date = new Date(`${text}T00:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() + 1 !== Number(match[2]) ||
    date.getDate() !== Number(match[3])
  ) {
    throw new Error('Geçerli bir işlem tarihi girilmelidir.');
  }
  return text;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16).toUpperCase();
}

function hashBuffer(buffer?: Buffer | null): string | null {
  if (!buffer?.length) return null;
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizeRole(role?: IsnetCompanyRole | null): IsnetCompanyRole {
  if (role === 'SUPPLIER' || role === 'BOTH') return role;
  return 'CUSTOMER';
}

export function buildIsnetSourceDedupeKey(input: IsnetSourceIntakeInput): string {
  const sourceType = input.sourceType;
  const company = upperTr(input.companyName);
  const model = upperTr(input.modelName);
  const orderNo = upperTr(input.orderNo);
  const dispatchNo = upperTr(input.customerDispatchNo);
  const date = normalizeDate(input.issueDate);
  const ettn = upperTr(input.ettn);
  const pdfHash = hashBuffer(input.pdfBuffer);

  if (sourceType === 'PORTAL') {
    if (ettn) return `PORTAL:ETTN:${ettn}`;
    if (!dispatchNo) {
      throw new Error('İşNet kaynağında ETTN veya irsaliye numarası zorunludur.');
    }
    return `PORTAL:DOC:${dispatchNo}`;
  }

  if (sourceType === 'MANUAL_PDF') {
    if (!pdfHash) throw new Error('Manuel PDF kaynağında PDF dosyası zorunludur.');
    return `PDF:${pdfHash}`;
  }

  return `NO-DISPATCH:${company}:${model}:${orderNo || '-'}:${date}`;
}

export function normalizeIsnetSourceIntake(
  input: IsnetSourceIntakeInput,
): NormalizedIsnetSourceIntake {
  const companyName = upperTr(input.companyName);
  const modelName = upperTr(input.modelName);
  const orderNo = upperTr(input.orderNo) || null;
  const customerDispatchNo = upperTr(input.customerDispatchNo) || null;
  const issueDate = normalizeDate(input.issueDate);
  const quantity = Number(input.quantity);
  const companyRole = normalizeRole(input.companyRole);

  if (!companyName) throw new Error('Firma zorunludur.');
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Adet sıfırdan büyük olmalıdır.');
  }
  if (input.sourceType === 'NO_CUSTOMER_DISPATCH' && customerDispatchNo) {
    throw new Error('İrsaliyesiz talimatta müşteri irsaliye numarası girilemez.');
  }

  const dedupeKey = buildIsnetSourceDedupeKey(input);
  const customerDispatchMissing = input.sourceType === 'NO_CUSTOMER_DISPATCH';
  const internalReference = customerDispatchMissing
    ? `KYI-${issueDate.replaceAll('-', '')}-${shortHash(dedupeKey).slice(0, 8)}`
    : customerDispatchNo || upperTr(input.ettn) || `KYI-${shortHash(dedupeKey).slice(0, 10)}`;

  const status = companyRole === 'SUPPLIER'
    ? 'NON_BILLABLE_SUPPLIER'
    : !input.modelId
      ? 'MODEL_PENDING'
      : 'READY_FOR_PRODUCTION';

  return {
    sourceType: input.sourceType,
    companyId: clean(input.companyId) || null,
    companyName,
    companyRole,
    modelId: clean(input.modelId) || null,
    modelName,
    orderNo,
    customerDispatchNo,
    issueDate,
    quantity,
    unit: upperTr(input.unit) || 'ADET',
    note: clean(input.note) || null,
    ettn: upperTr(input.ettn) || null,
    portalDocumentId: clean(input.portalDocumentId) || null,
    internalReference,
    dedupeKey,
    status,
    customerDispatchMissing,
    pdfSha256: hashBuffer(input.pdfBuffer),
    pdfFileName: clean(input.pdfFileName) || null,
  };
}

export function calculateDispatchCapacity(params: {
  sourceQuantity: number;
  producedNetQuantity: number;
  outgoingDispatchQuantity: number;
  invoicedQuantity: number;
  nonBillableQuantity: number;
}) {
  const sourceQuantity = Math.max(0, Number(params.sourceQuantity) || 0);
  const producedNetQuantity = Math.max(0, Number(params.producedNetQuantity) || 0);
  const outgoingDispatchQuantity = Math.max(0, Number(params.outgoingDispatchQuantity) || 0);
  const invoicedQuantity = Math.max(0, Number(params.invoicedQuantity) || 0);
  const nonBillableQuantity = Math.max(0, Number(params.nonBillableQuantity) || 0);

  if (outgoingDispatchQuantity > sourceQuantity) {
    throw new Error('Toplam giden irsaliye adedi kaynak adedi aşamaz.');
  }
  if (invoicedQuantity > outgoingDispatchQuantity) {
    throw new Error('Toplam faturalanan adet giden irsaliye adedini aşamaz.');
  }
  if (invoicedQuantity + nonBillableQuantity > sourceQuantity) {
    throw new Error('Faturalanan ve ücretsiz/test toplamı kaynak adedi aşamaz.');
  }

  return {
    sourceQuantity,
    producedNetQuantity,
    outgoingDispatchQuantity,
    invoicedQuantity,
    nonBillableQuantity,
    outgoingRemaining: Math.max(0, sourceQuantity - outgoingDispatchQuantity),
    invoiceRemaining: Math.max(0, outgoingDispatchQuantity - invoicedQuantity),
    sourceClosingRemaining: Math.max(0, sourceQuantity - invoicedQuantity - nonBillableQuantity),
    productionDifference: producedNetQuantity - invoicedQuantity,
    dispatchStatus:
      outgoingDispatchQuantity === 0
        ? 'NOT_CREATED'
        : outgoingDispatchQuantity < sourceQuantity
          ? 'PARTIAL'
          : 'COMPLETE',
    invoiceStatus:
      invoicedQuantity === 0
        ? 'NOT_INVOICED'
        : invoicedQuantity + nonBillableQuantity < sourceQuantity
          ? 'PARTIAL'
          : 'COMPLETE',
  } as const;
}
