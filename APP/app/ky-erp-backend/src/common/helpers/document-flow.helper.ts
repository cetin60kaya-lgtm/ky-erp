export type DocumentKind =
  | 'OUR_INVOICE'
  | 'OUR_DISPATCH'
  | 'CUSTOMER_DISPATCH'
  | 'SUPPLIER_INVOICE'
  | 'UNKNOWN';

export type StorageStatus =
  | 'RAW'
  | 'MODEL_PENDING'
  | 'MODEL_LINKED'
  | 'ARCHIVED';

export interface ParsedDocumentFileName {
  documentNo: string;
  guessedModelName: string;
  documentKind: DocumentKind;
}

export function normalizeText(value: any): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/\s+/g, ' ');
}

export function normalizeModelName(value: any): string {
  return normalizeText(value)
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function safeFilePart(value: any): string {
  return String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDocumentNo(fileNameOrNo: any): string {
  const text = normalizeText(fileNameOrNo);

  const hkn = text.match(/\bHKN\d{8,}\b/);
  if (hkn) return hkn[0];

  const ddm = text.match(/\bDDM\d{8,}\b/);
  if (ddm) return ddm[0];

  return '';
}

export function classifyDocument(input: {
  fileName?: string;
  belgeNo?: string;
  belgeTuru?: string;
  sourceScreen?: string;
}): DocumentKind {
  const fileName = normalizeText(input.fileName);
  const belgeNo = normalizeText(input.belgeNo);
  const belgeTuru = normalizeText(input.belgeTuru);
  const sourceScreen = normalizeText(input.sourceScreen);

  const all = `${fileName} ${belgeNo} ${belgeTuru} ${sourceScreen}`;

  // Bizim HKN e-fatura
  if (/\bHKN\d{8,}\b/.test(all)) {
    return 'OUR_INVOICE';
  }

  // Bizim DDM e-irsaliye
  if (/\bDDM\d{8,}\b/.test(all)) {
    return 'OUR_DISPATCH';
  }

  // Müşteriden gelen irsaliye
  if (
    all.includes('MUSTERI IRSALIYE') ||
    all.includes('MUSTERIDEN GELEN') ||
    all.includes('MUSTERIDEN GELEN IRSALIYE') ||
    all.includes('MÜŞTERİ İRSALİYE') ||
    all.includes('CUSTOMER_DISPATCH')
  ) {
    return 'CUSTOMER_DISPATCH';
  }

  // Tedarikçi / gelen fatura
  if (
    all.includes('TEDARIKCI') ||
    all.includes('TEDARİKÇİ') ||
    all.includes('GELEN FATURA') ||
    all.includes('SUPPLIER')
  ) {
    return 'SUPPLIER_INVOICE';
  }

  return 'UNKNOWN';
}

export function parseDocumentFileName(fileName: string): ParsedDocumentFileName {
  const original = String(fileName ?? '').trim();

  const withoutExt = original
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const documentNo = extractDocumentNo(withoutExt);

  let guessedModelName = '';

  if (documentNo) {
    guessedModelName = withoutExt
      .replace(new RegExp(documentNo, 'i'), '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    documentNo,
    guessedModelName,
    documentKind: classifyDocument({
      fileName,
      belgeNo: documentNo,
    }),
  };
}

export function buildModelDocumentFileName(input: {
  documentNo: string;
  modelName: string;
  ext?: string;
}): string {
  const ext = input.ext || '.pdf';

  const documentNo = safeFilePart(input.documentNo);
  const modelName = safeFilePart(input.modelName);

  if (!documentNo && !modelName) {
    return `BELGE${ext}`;
  }

  if (!documentNo) {
    return `${modelName}${ext}`;
  }

  if (!modelName) {
    return `${documentNo}${ext}`;
  }

  return `${documentNo} ${modelName}${ext}`;
}

export function isOurInvoice(value: any): boolean {
  return classifyDocument({
    fileName: value?.fileName || value?.originalFileName,
    belgeNo: value?.documentNo || value?.belgeNo || value?.faturaNo || value?.no,
    belgeTuru: value?.documentKind || value?.belgeTuru || value?.tur || value?.type,
  }) === 'OUR_INVOICE';
}

export function isOurDispatch(value: any): boolean {
  return classifyDocument({
    fileName: value?.fileName || value?.originalFileName,
    belgeNo: value?.documentNo || value?.belgeNo || value?.irsaliyeNo || value?.no,
    belgeTuru: value?.documentKind || value?.belgeTuru || value?.tur || value?.type,
  }) === 'OUR_DISPATCH';
}

export function isCustomerDispatch(value: any): boolean {
  return classifyDocument({
    fileName: value?.fileName || value?.originalFileName,
    belgeNo: value?.documentNo || value?.belgeNo || value?.irsaliyeNo || value?.no,
    belgeTuru: value?.documentKind || value?.belgeTuru || value?.tur || value?.type,
    sourceScreen: value?.sourceScreen,
  }) === 'CUSTOMER_DISPATCH';
}

export function shouldShowInBizimBelgeler(value: any): boolean {
  return isOurInvoice(value);
}

export function shouldShowInMusteriIrsaliye(value: any): boolean {
  return isCustomerDispatch(value);
}

export function shouldShowAsLinkedDispatch(value: any): boolean {
  return isOurDispatch(value);
}
