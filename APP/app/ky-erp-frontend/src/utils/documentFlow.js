export const DOCUMENT_KIND = {
  OUR_INVOICE: 'OUR_INVOICE',
  OUR_DISPATCH: 'OUR_DISPATCH',
  CUSTOMER_DISPATCH: 'CUSTOMER_DISPATCH',
  SUPPLIER_INVOICE: 'SUPPLIER_INVOICE',
  UNKNOWN: 'UNKNOWN',
};

export function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.models)) return value.models;
  if (Array.isArray(value.belgeler)) return value.belgeler;
  if (Array.isArray(value.documents)) return value.documents;
  return [];
}

export function normalizeText(value) {
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

export function extractDocumentNo(value) {
  const text = normalizeText(value);

  const hkn = text.match(/\bHKN\d{8,}\b/);
  if (hkn) return hkn[0];

  const ddm = text.match(/\bDDM\d{8,}\b/);
  if (ddm) return ddm[0];

  return '';
}

export function classifyDocument(item = {}) {
  const fileName = normalizeText(item?.fileName || item?.originalFileName || item?.name);
  const belgeNo = normalizeText(
    item?.documentNo ||
    item?.belgeNo ||
    item?.faturaNo ||
    item?.irsaliyeNo ||
    item?.no
  );
  const belgeTuru = normalizeText(
    item?.documentKind ||
    item?.belgeTuru ||
    item?.tur ||
    item?.type
  );
  const sourceScreen = normalizeText(item?.sourceScreen);

  const all = `${fileName} ${belgeNo} ${belgeTuru} ${sourceScreen}`;

  if (all.includes('OUR_INVOICE')) return DOCUMENT_KIND.OUR_INVOICE;
  if (all.includes('OUR_DISPATCH')) return DOCUMENT_KIND.OUR_DISPATCH;
  if (all.includes('CUSTOMER_DISPATCH')) return DOCUMENT_KIND.CUSTOMER_DISPATCH;
  if (all.includes('SUPPLIER_INVOICE')) return DOCUMENT_KIND.SUPPLIER_INVOICE;

  if (/\bHKN\d{8,}\b/.test(all)) return DOCUMENT_KIND.OUR_INVOICE;
  if (/\bDDM\d{8,}\b/.test(all)) return DOCUMENT_KIND.OUR_DISPATCH;

  if (
    all.includes('MUSTERI IRSALIYE') ||
    all.includes('MUSTERIDEN GELEN') ||
    all.includes('MUSTERIDEN GELEN IRSALIYE') ||
    all.includes('MÜŞTERİ İRSALİYE') ||
    all.includes('CUSTOMER_DISPATCH')
  ) {
    return DOCUMENT_KIND.CUSTOMER_DISPATCH;
  }

  if (
    all.includes('TEDARIKCI') ||
    all.includes('TEDARİKÇİ') ||
    all.includes('GELEN FATURA') ||
    all.includes('SUPPLIER')
  ) {
    return DOCUMENT_KIND.SUPPLIER_INVOICE;
  }

  return DOCUMENT_KIND.UNKNOWN;
}

export function parseDocumentFileName(fileName) {
  const clean = String(fileName ?? '')
    .replace(/\?.[^.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const documentNo = extractDocumentNo(clean);

  let guessedModelName = '';

  if (documentNo) {
    guessedModelName = clean
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

export function getDocumentNo(item = {}) {
  return (
    item?.documentNo ||
    item?.belgeNo ||
    item?.faturaNo ||
    item?.irsaliyeNo ||
    item?.no ||
    extractDocumentNo(item?.fileName || item?.originalFileName || item?.name)
  );
}

export function getGuessedModelName(item = {}) {
  if (item?.guessedModelName) return item?.guessedModelName;
  if (item?.modelName) return item?.modelName;
  if (item?.modelAdi) return item?.modelAdi;

  const fileName = item?.fileName || item?.originalFileName || item?.name;
  if (!fileName) return '';

  return parseDocumentFileName(fileName).guessedModelName;
}

export function filterBizimBelgeler(list) {
  return normalizeList(list).filter((item) => classifyDocument(item) === DOCUMENT_KIND.OUR_INVOICE);
}

export function filterMusteriIrsaliyeleri(list) {
  return normalizeList(list).filter((item) => classifyDocument(item) === DOCUMENT_KIND.CUSTOMER_DISPATCH);
}

export function filterBizimIrsaliyeler(list) {
  return normalizeList(list).filter((item) => classifyDocument(item) === DOCUMENT_KIND.OUR_DISPATCH);
}

export function normalizeLines(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.lineItems)) return value.lineItems;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.satirlar)) return value.satirlar;
  if (Array.isArray(value.kalemler)) return value.kalemler;
  if (Array.isArray(value.lines)) return value.lines;
  return [];
}

export function getLineDescription(line = {}) {
  return (
    line?.aciklama ||
    line?.description ||
    line?.urunAdi ||
    line?.productName ||
    line?.name ||
    ''
  );
}

export function findMatchedModelFromText(models, text) {
  const source = normalizeText(text);

  return normalizeList(models).find((model) => {
    const modelName = normalizeText(
      model?.name ||
      model?.modelName ||
      model?.modelAdi ||
      model?.title
    );

    return modelName && source.includes(modelName);
  });
}
