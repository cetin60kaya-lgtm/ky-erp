export type ParsedDocumentHeader = {
  documentNo: string;
  documentType: string;
  scenario: string;
  date: string;
  firmName: string;
  receiverName: string;
  ettn: string;
  dispatchNo: string;
  invoiceNo: string;
  plateNo: string;
  trailerPlateNo: string;
  driverName: string;
  driverTckn: string;
};

export type ParsedDocumentLine = {
  rowNo: number;
  rawName: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
  isTestSample: boolean;
  status: string;
};

export type ParsedKyDocument = ParsedDocumentHeader & {
  lines: ParsedDocumentLine[];
  totals: {
    quantityTotal: number;
    goodsTotal: number;
    vatTotal: number;
    payableTotal: number;
  };
  rawText: string;
};

const EMPTY_HEADER: ParsedDocumentHeader = {
  documentNo: "",
  documentType: "",
  scenario: "",
  date: "",
  firmName: "",
  receiverName: "",
  ettn: "",
  dispatchNo: "",
  invoiceNo: "",
  plateNo: "",
  trailerPlateNo: "",
  driverName: "",
  driverTckn: "",
};

export function normalizePdfText(text: string): string {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\u00AD/g, "-")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseTurkishNumber(value: string): number {
  const raw = String(value || "")
    .replace(/\s+/g, "")
    .replace(/TL|₺/gi, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  if (raw.includes(",") && raw.includes(".")) {
    return Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (raw.includes(",")) return Number(raw.replace(",", ".")) || 0;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    return Number(raw.replace(/\./g, "")) || 0;
  }
  return Number(raw) || 0;
}

function linesOf(text: string) {
  return normalizePdfText(text).split("\n").map((line) => line.trim()).filter(Boolean);
}

function pickValue(lines: string[], label: RegExp) {
  const line = lines.find((item) => label.test(item));
  if (!line) return "";
  return line.split(":").slice(1).join(":").trim();
}

function normalizeCompanyName(value: string) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

export function extractDocumentHeader(text: string): ParsedDocumentHeader {
  const lines = linesOf(text);
  const invoiceNo = pickValue(lines, /^Fatura\s*No\s*:/i);
  const dispatchNo = pickValue(lines, /^İrsaliye\s*No\s*:/i);
  const invoiceDate = pickValue(lines, /^Fatura\s*Tarihi\s*:/i);
  const dispatchDate = pickValue(lines, /^İrsaliye\s*Tarihi\s*:/i);
  const seller = pickValue(lines, /^Asıl\s*Satıcı\s*Ünvan\s*:/i);
  const scenario = pickValue(lines, /^Senaryo\s*:/i);
  const ettn = pickValue(lines, /^ETTN\s*:/i);
  const plateNo = pickValue(lines, /Araç\s*plaka\s*numarası\s*:/i);
  const trailerPlateNo = pickValue(lines, /Dorse\s*plaka\s*numarası\s*:/i);
  const driverLine = lines.find((line) => /^Şoför\s*:/i.test(line)) || "";
  const driverMatch = driverLine.match(/^Şoför\s*:\s*(.+?)(?:,\s*TCKN\s*:?\s*|\s+TCKN\s*:?\s*)(\d{11})/i);
  const sayinIndex = lines.findIndex((line) => /^SAYIN$/i.test(line));
  const firmFromSayin =
    sayinIndex >= 0 && /SAN|TİC|A\.Ş|LTD/i.test(lines[sayinIndex + 1] || "")
      ? lines[sayinIndex + 1]
      : "";
  const receiverIndex = lines.findIndex((line) => /MECİT\s+HAKAN|HAKAN\s+EMP/i.test(line));
  const receiverName = receiverIndex >= 0 ? lines[receiverIndex] : "";
  const documentType = invoiceNo ? "FATURA" : dispatchNo ? "IRSALIYE" : "";

  return {
    ...EMPTY_HEADER,
    documentNo: invoiceNo || dispatchNo,
    documentType,
    scenario,
    date: invoiceDate || dispatchDate,
    firmName: normalizeCompanyName(seller || firmFromSayin),
    receiverName: normalizeCompanyName(receiverName),
    ettn,
    dispatchNo: dispatchNo || pickValue(lines, /^İrsaliye\s*No\s*:/i),
    invoiceNo,
    plateNo,
    trailerPlateNo,
    driverName: (driverMatch?.[1] || "").trim(),
    driverTckn: driverMatch?.[2] || "",
  };
}

function lineStatus(line: Partial<ParsedDocumentLine>) {
  if (!line.productName) return "ESLESME_BEKLIYOR";
  if (!line.unitPrice) return "FIYAT_EKSIK";
  return "MODEL_BAGLANTISI_BEKLIYOR";
}

function cleanProductName(value: string) {
  return String(value || "")
    .replace(/^Sıra\s*No\s*/i, "")
    .replace(/^Malzeme\s*No\s*/i, "")
    .replace(/^Mal\s*Hizmet\s*/i, "")
    .replace(/^Açıklama\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDispatchCandidate(candidate: string): ParsedDocumentLine | null {
  const cleaned = candidate.replace(/\s+/g, " ").trim();
  if (/^Toplam\b/i.test(cleaned)) return null;
  const match = cleaned.match(/^\s*(\d{1,2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*|\d+)(?:\s*)?(Adet|ADET|Ad|AD)\b/i);
  if (!match) return null;
  const productName = cleanProductName(match[2]);
  if (!productName || /^Toplam/i.test(productName)) return null;
  const line: ParsedDocumentLine = {
    rowNo: Number(match[1]),
    rawName: cleaned,
    productName,
    quantity: parseTurkishNumber(match[3]),
    unit: "Adet",
    unitPrice: 0,
    vatRate: 0,
    vatAmount: 0,
    lineTotal: 0,
    isTestSample: /TEST\s*NUMUNES[İI]/i.test(productName),
    status: "FIYAT_EKSIK",
  };
  line.status = lineStatus(line);
  return line;
}

export function extractDispatchLines(text: string): ParsedDocumentLine[] {
  const lines = linesOf(text);
  const result: ParsedDocumentLine[] = [];
  let buffer = "";
  let inTable = false;
  for (const line of lines) {
    if (/Malzeme\s*No|AçıklamaMiktar|Açıklama\s*Miktar|Birim\s*Fiyat/i.test(line)) {
      inTable = true;
      buffer = "";
      continue;
    }
    if (!inTable) continue;
    if (/^Toplam\b/i.test(line)) {
      buffer = "";
      continue;
    }
    if (!buffer && !/^\d+\b/.test(line)) continue;
    buffer = buffer ? `${buffer} ${line}` : line;
    const parsed = parseDispatchCandidate(buffer);
    if (parsed) {
      result.push({ ...parsed, rowNo: result.length + 1 });
      buffer = "";
    }
  }
  return result;
}

export function extractInvoiceLines(text: string): ParsedDocumentLine[] {
  const normalized = normalizePdfText(text);
  const tableStart = normalized.search(/Sıra\s*(?:\n| )*No|Mal\s*Hizmet|AçıklamaMiktar/i);
  const tableText = tableStart >= 0 ? normalized.slice(tableStart) : normalized;
  const tableEnd = tableText.search(/Mal\s*Hizmet\s*Toplam\s*Tutarı|Toplam\s*İskonto|Vergiler\s*Dahil/i);
  const collapsed = (tableEnd >= 0 ? tableText.slice(0, tableEnd) : tableText)
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ");
  const result: ParsedDocumentLine[] = [];
  const rowRegex =
    /\b(\d{1,3})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*|\d+)Adet\s+(\d+(?:[,.]\d+)?)\s*TL\s+%?\d+(?:[,.]\d+)?\s+%(\d+(?:[,.]\d+)?)\s+(\d{1,3}(?:\.\d{3})*,\d{2}|0,00)\s*TL\s+(\d{1,3}(?:\.\d{3})*,\d{2}|0,00)\s*TL/gi;
  for (const match of collapsed.matchAll(rowRegex)) {
    const productName = cleanProductName(match[2]);
    const line: ParsedDocumentLine = {
      rowNo: result.length + 1,
      rawName: match[0].trim(),
      productName,
      quantity: parseTurkishNumber(match[3]),
      unit: "Adet",
      unitPrice: parseTurkishNumber(match[4]),
      vatRate: parseTurkishNumber(match[5]),
      vatAmount: parseTurkishNumber(match[6]),
      lineTotal: parseTurkishNumber(match[7]),
      isTestSample: /TEST\s*NUMUNES[İI]/i.test(productName),
      status: "MODEL_BAGLANTISI_BEKLIYOR",
    };
    line.status = lineStatus(line);
    result.push(line);
  }
  return result;
}

function extractTotals(text: string, lines: ParsedDocumentLine[]) {
  const normalized = normalizePdfText(text).replace(/\n/g, " ");
  const goodsTotal = parseTurkishNumber(
    normalized.match(/Mal\s*Hizmet\s*Toplam\s*Tutarı\s*(\d[\d.]*,\d{2})\s*TL/i)?.[1] || "",
  );
  const vatTotal = parseTurkishNumber(
    normalized.match(/Hesaplanan\s*KDV\(%\d+\)\s*(\d[\d.]*,\d{2})\s*TL/i)?.[1] || "",
  );
  const payableTotal = parseTurkishNumber(
    normalized.match(/Ödenecek\s*Tutar\s*(\d[\d.]*,\d{2})\s*TL/i)?.[1] ||
      normalized.match(/Vergiler\s*Dahil\s*Toplam\s*Tutar\s*(\d[\d.]*,\d{2})\s*TL/i)?.[1] ||
      "",
  );
  return {
    quantityTotal: lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
    goodsTotal: goodsTotal || lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    vatTotal: vatTotal || lines.reduce((sum, line) => sum + Number(line.vatAmount || 0), 0),
    payableTotal:
      payableTotal ||
      lines.reduce((sum, line) => sum + Number(line.lineTotal || 0) + Number(line.vatAmount || 0), 0),
  };
}

export function parseKyDocumentFromPdfText(text: string): ParsedKyDocument {
  const rawText = normalizePdfText(text);
  const header = extractDocumentHeader(rawText);
  const invoiceLines = extractInvoiceLines(rawText);
  const dispatchLines = invoiceLines.length ? [] : extractDispatchLines(rawText);
  const lines = invoiceLines.length ? invoiceLines : dispatchLines;
  return {
    ...header,
    lines,
    totals: extractTotals(rawText, lines),
    rawText,
  };
}
