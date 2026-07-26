import { Injectable } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import pdfParse from "pdf-parse";
import type { ParsedDocument, ParsedDocumentLine } from "./dto/document-intake.dto";

function arr<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function pick(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function scalar(value: any): any {
  if (value == null) return "";
  if (typeof value !== "object") return value;
  if (Object.prototype.hasOwnProperty.call(value, "#text")) return value["#text"];
  if (Object.prototype.hasOwnProperty.call(value, "_text")) return value._text;
  if (Object.prototype.hasOwnProperty.call(value, "__text")) return value.__text;
  if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text;
  if (Object.prototype.hasOwnProperty.call(value, "value")) return value.value;
  return "";
}

function clean(value: unknown) {
  return String(scalar(value) ?? "")
    .replace(/\u00ad/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = clean(value).replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quantity(value: unknown) {
  const raw = clean(value).replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    return Number(raw.replace(/\./g, ""));
  }
  return money(raw);
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function modelGuessFromText(value: string) {
  const known = ["PONYKA", "HAKITO", "MARAL", "FINKIY", "EMAVIM"];
  const upper = value.toLocaleUpperCase("tr-TR");
  const knownMatch = known.find((item) => upper.includes(item));
  if (knownMatch) return knownMatch;
  const explicit = value.match(
    /(?:MODEL|MODEL ADI|MODEL KODU)\s*[:#-]?\s*([A-Z0-9ÇĞİÖŞÜ][A-Z0-9ÇĞİÖŞÜ ._/-]{2,80})/i,
  )?.[1];
  if (explicit) return clean(explicit).replace(/\s{2,}.*/, "");
  const candidate = clean(value)
    .replace(/\b(?:ADET|AD|KG|KİLOGRAM|KILOGRAM|SEVK|İRSALİYE|IRSALIYE)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return candidate.length >= 2 && candidate.length <= 100 ? candidate : "";
}

function lotFromText(value: string) {
  return firstMatch(value, [
    /LOT\s*[-:]?\s*([A-Z0-9]+)/i,
    /LOT￾([A-Z0-9]+)/i,
    /LOT-([A-Z0-9]+)/i,
  ]);
}

function lotFromUblItem(item: any, line: any, supplierTaxNo: string) {
  const standardLot = clean(
    pick(item, "ItemInstance.LotIdentification.LotNumberID") ||
      pick(item, "ItemInstance.LotIdentification.ID") ||
      pick(item, "ItemInstance.SerialID") ||
      pick(line, "ItemInstance.LotIdentification.LotNumberID"),
  );
  if (standardLot) return standardLot;

  const lotProperty = arr(item?.AdditionalItemProperty).find((property: any) =>
    /^(LOT|LOT NO|LOT NUMARASI|PARTI|PARTI NO|BATCH)$/i.test(
      clean(property?.Name).replace(/[İIı]/g, "I"),
    ),
  );
  const propertyLot = clean(lotProperty?.Value || lotProperty?.ValueQualifier);
  if (propertyLot) return propertyLot;

  const combinedText = `${clean(line?.Note)} ${clean(item?.Description)} ${clean(item?.Name)}`;
  const labeledLot = lotFromText(combinedText);
  if (labeledLot) return labeledLot;

  // Selvi Kimya lot kodunu UBL Item/Description alaninda etiketsiz olarak
  // gonderiyor (or. 260704022-K11 veya 260618001).
  const itemDescription = clean(item?.Description);
  if (
    clean(supplierTaxNo) === "7600500357" &&
    /^\d{9}(?:-K\d+)?$/i.test(itemDescription)
  ) {
    return itemDescription.toUpperCase();
  }
  return "";
}

function unitCode(value: any, fallback = "ADET") {
  if (value && typeof value === "object") {
    return clean(value.unitCode || value.unit || value.UnitCode || fallback);
  }
  return clean(fallback);
}

function textList(value: any): string[] {
  return arr(value).map(clean).filter(Boolean);
}

function extractLineMeta(line: any, item: any) {
  const ids = [
    ...textList(pick(item, "BuyersItemIdentification.ID")),
    ...textList(pick(item, "SellersItemIdentification.ID")),
    ...textList(pick(item, "ManufacturersItemIdentification.ID")),
    ...textList(pick(item, "AdditionalItemIdentification.ID")),
  ];
  const notes = textList([line.Note, item.Note, pick(line, "DocumentReference.ID"), pick(line, "OrderLineReference.LineID")]);
  const combined = `${notes.join(" ")} ${clean(item.Name)} ${clean(item.Description)}`;
  const orderNo = clean(
    pick(line, "OrderReference.ID") ||
      pick(line, "OrderLineReference.LineID") ||
      pick(line, "DocumentReference.ID"),
  );
  const color = firstMatch(combined, [/\b(?:RENK|COLOR)\s*[:#-]?\s*([^,;/]+)/i]);
  const region = firstMatch(combined, [/\b(ÜST ALT|ÜST|ALT|ÖN|ARKA|KOL|ENSE|TOP|POLO|REPETE)\b/i]);
  return { ids: [...new Set(ids)], orderNo, color, region, note: notes.join(" ") };
}

function partyName(party: any, legalEntity: any) {
  const person = arr(party?.Person)[0] || {};
  return clean(
    legalEntity?.RegistrationName ||
      party?.PartyName?.Name ||
      [person.FirstName, person.MiddleName, person.FamilyName]
        .map(clean)
        .filter(Boolean)
        .join(" "),
  );
}

@Injectable()
export class DocumentParserService {
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });

  private taxCategoryText(value: any) {
    const category = value?.TaxCategory || value || {};
    const scheme = category.TaxScheme || {};
    return [
      category.ID,
      category.Name,
      scheme.ID,
      scheme.Name,
      scheme.TaxTypeCode,
    ]
      .map((item) => clean(item))
      .filter(Boolean)
      .join(" ")
      .toLocaleUpperCase("tr-TR");
  }

  private collectTaxBreakdown(root: any, lines: ParsedDocumentLine[]) {
    const taxSubtotals = arr(root.TaxTotal).flatMap((taxTotal: any) =>
      arr(taxTotal?.TaxSubtotal).map((subtotal: any) => {
        const categoryText = this.taxCategoryText(subtotal);
        return {
          taxableAmount: money(subtotal?.TaxableAmount),
          taxAmount: money(subtotal?.TaxAmount),
          percent: money(subtotal?.Percent),
          category: clean(pick(subtotal, "TaxCategory.Name") || pick(subtotal, "TaxCategory.ID")),
          scheme: clean(pick(subtotal, "TaxCategory.TaxScheme.Name") || pick(subtotal, "TaxCategory.TaxScheme.ID")),
          code: clean(pick(subtotal, "TaxCategory.TaxScheme.TaxTypeCode")),
          isVat:
            /KDV|0015|VAT|VALUE ADDED/.test(categoryText) &&
            !/TEVKIFAT|STOPAJ|WITHHOLD/.test(categoryText),
          isWithholding: /TEVKIFAT|STOPAJ|WITHHOLD|9015/.test(categoryText),
          isExcise: /OTV|ÖTV|EXCISE|007/.test(categoryText),
        };
      }),
    );
    const withholdingSubtotals = arr(root.WithholdingTaxTotal).flatMap((taxTotal: any) =>
      arr(taxTotal?.TaxSubtotal).map((subtotal: any) => ({
        taxableAmount: money(subtotal?.TaxableAmount),
        taxAmount: money(subtotal?.TaxAmount),
        percent: money(subtotal?.Percent),
        category: clean(pick(subtotal, "TaxCategory.Name") || pick(subtotal, "TaxCategory.ID")),
        scheme: clean(pick(subtotal, "TaxCategory.TaxScheme.Name") || pick(subtotal, "TaxCategory.TaxScheme.ID")),
        code: clean(pick(subtotal, "TaxCategory.TaxScheme.TaxTypeCode")),
        isWithholding: true,
      })),
    );
    const allowanceCharges = arr(root.AllowanceCharge).map((item: any) => {
      const charge = String(item?.ChargeIndicator ?? "").toLocaleLowerCase("tr-TR") === "true";
      return {
        charge,
        amount: money(item?.Amount),
        reason: clean(item?.AllowanceChargeReason),
      };
    });
    const documentTaxTotal = arr(root.TaxTotal).reduce(
      (sum: number, item: any) => sum + money(item?.TaxAmount),
      0,
    );
    const withholdingVat = arr(root.WithholdingTaxTotal).reduce(
      (sum: number, item: any) => sum + money(item?.TaxAmount),
      0,
    ) + withholdingSubtotals.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
    const normalVat = taxSubtotals
      .filter((item) => item.isVat)
      .reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);
    const otherTax = Math.max(
      0,
      documentTaxTotal -
        normalVat -
        taxSubtotals
          .filter((item) => item.isWithholding)
          .reduce((sum, item) => sum + Number(item.taxAmount || 0), 0),
    );
    return {
      taxSubtotals,
      withholdingSubtotals,
      allowanceCharges,
      normalVat,
      withholdingVat,
      otherTax,
      discountTotal: allowanceCharges
        .filter((item) => !item.charge)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      chargeTotal: allowanceCharges
        .filter((item) => item.charge)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      documentTaxTotal,
      lineSubtotal: lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0),
      lineVat: lines.reduce((sum, line) => sum + Number(line.vatAmount || 0), 0),
    };
  }

  async parseFile(args: {
    buffer: Buffer;
    fileName: string;
    filePath: string;
    fileHash: string;
    mimeType: string;
  }): Promise<ParsedDocument> {
    const ext = args.fileName.toLocaleLowerCase("tr-TR").split(".").pop() || "";
    if (ext === "xml" || /xml/i.test(args.mimeType)) {
      return this.parseXml(args);
    }
    if (ext === "pdf" || /pdf/i.test(args.mimeType)) {
      return this.parsePdf(args);
    }
    if (["jpg", "jpeg", "png"].includes(ext) || /^image\//i.test(args.mimeType)) {
      return this.parseImage(args);
    }
    return this.empty(args, "UNKNOWN", "");
  }

  private async parseXml(args: {
    buffer: Buffer;
    fileName: string;
    filePath: string;
    fileHash: string;
    mimeType: string;
  }): Promise<ParsedDocument> {
    const xmlText = args.buffer.toString("utf8");
    let parsed: any = {};
    try {
      parsed = this.xmlParser.parse(xmlText);
    } catch {
      return this.empty(args, "XML", xmlText);
    }
    const root = parsed.Invoice || parsed.DespatchAdvice || parsed;
    const isDispatch = Boolean(parsed.DespatchAdvice || root.DespatchLine);
    const supplier = pick(root, "AccountingSupplierParty.Party") || pick(root, "DespatchSupplierParty.Party") || {};
    const customer = pick(root, "AccountingCustomerParty.Party") || pick(root, "DeliveryCustomerParty.Party") || {};
    const legalSupplier = arr(supplier.PartyLegalEntity)[0] || {};
    const legalCustomer = arr(customer.PartyLegalEntity)[0] || {};
    const supplierTax = arr(pick(supplier, "PartyIdentification"))[0]?.ID || pick(supplier, "PartyTaxScheme.CompanyID") || "";
    const customerTax = arr(pick(customer, "PartyIdentification"))[0]?.ID || pick(customer, "PartyTaxScheme.CompanyID") || "";
    const linesRaw = isDispatch ? arr(root.DespatchLine) : arr(root.InvoiceLine);
    const lines: ParsedDocumentLine[] = linesRaw.map((line: any, index) => {
      const item = line.Item || {};
      const quantityValue = line.InvoicedQuantity || line.DeliveredQuantity;
      const quantity = money(quantityValue);
      let unitPrice = money(pick(line, "Price.PriceAmount"));
      const taxSubtotal = arr(pick(line, "TaxTotal.TaxSubtotal"))[0] || {};
      const lineExtensionAmount = money(line.LineExtensionAmount);
      const itemPriceExtensionAmount = money(pick(line, "ItemPriceExtension.Amount"));
      const grossLineAmount = lineExtensionAmount || itemPriceExtensionAmount || quantity * unitPrice;
      let priceDerived = false;
      let priceSource = clean(pick(line, "Price.PriceAmount")) ? "PriceAmount" : "";
      if (unitPrice <= 0 && grossLineAmount > 0 && quantity > 0) {
        unitPrice = grossLineAmount / quantity;
        priceDerived = true;
        priceSource = lineExtensionAmount ? "LineExtensionAmount/Quantity" : "ItemPriceExtensionAmount/Quantity";
      }
      const subtotal = money(taxSubtotal.TaxableAmount) || grossLineAmount;
      const vatAmount = money(pick(line, "TaxTotal.TaxAmount"));
      const vatRate = money(pick(taxSubtotal, "Percent"));
      const rawName = clean(item.Name || item.Description || line.Note || "");
      const sellerItemId = clean(pick(item, "SellersItemIdentification.ID"));
      const manufacturerItemId = clean(pick(item, "ManufacturersItemIdentification.ID"));
      const standardItemId = clean(pick(item, "StandardItemIdentification.ID"));
      const lineMeta = extractLineMeta(line, item);
      return {
        lineId: `${args.fileHash}-${index + 1}`,
        lineNo: Number(line.ID || index + 1),
        rawName,
        description: clean(item.Description || rawName),
        quantity,
        unit: unitCode(quantityValue),
        unitPrice,
        priceDerived,
        priceSource,
        subtotal,
        vatRate,
        vatAmount,
        total: grossLineAmount || subtotal + vatAmount,
        lotNo: lotFromUblItem(item, line, clean(supplierTax)),
        modelGuess: modelGuessFromText(
          `${manufacturerItemId} ${sellerItemId} ${rawName} ${item.Description || ""}`,
        ),
        sellerItemId,
        manufacturerItemId,
        standardItemId,
        additionalItemIds: lineMeta.ids,
        orderNo: lineMeta.orderNo,
        productCode: sellerItemId || manufacturerItemId || standardItemId || lineMeta.ids[0] || "",
        color: lineMeta.color,
        region: lineMeta.region,
        sourceNote: lineMeta.note,
        missingFields: [],
      };
    });
    const monetaryTotal = root.LegalMonetaryTotal || {};
    const documentNo = clean(root.ID);
    const rawText = xmlText.slice(0, 20000);
    const taxBreakdown = this.collectTaxBreakdown(root, lines);
    return {
      originalFileName: args.fileName,
      filePath: args.filePath,
      fileHash: args.fileHash,
      mimeType: args.mimeType,
      rawText,
      sourceType: "XML",
      documentNo,
      invoiceNo: isDispatch ? "" : documentNo,
      dispatchNo: isDispatch ? documentNo : clean(arr(root.DespatchDocumentReference)[0]?.ID),
      scenario: clean(root.ProfileID),
      documentType: isDispatch ? "DespatchAdvice" : "Invoice",
      issueDate: clean(root.IssueDate),
      dueDate: clean(root.DueDate),
      issuerName: partyName(supplier, legalSupplier),
      issuerTaxNo: clean(supplierTax),
      receiverName: partyName(customer, legalCustomer),
      receiverTaxNo: clean(customerTax),
      currency: clean(root.DocumentCurrencyCode || "TRY"),
      subtotal: money(monetaryTotal.TaxExclusiveAmount) || money(monetaryTotal.LineExtensionAmount),
      vatTotal: taxBreakdown.documentTaxTotal || money(root.TaxTotal?.TaxAmount),
      grandTotal: money(monetaryTotal.PayableAmount || monetaryTotal.TaxInclusiveAmount),
      modelGuess:
        lines.map((line) => line.modelGuess).find(Boolean) ||
        modelGuessFromText(`${args.fileName} ${lines.map((line) => line.rawName).join(" ")}`),
      lines,
      taxBreakdown,
      parseRawJson: { xmlRoot: isDispatch ? "DespatchAdvice" : "Invoice", parsed, taxBreakdown },
    };
  }

  private async parsePdf(args: {
    buffer: Buffer;
    fileName: string;
    filePath: string;
    fileHash: string;
    mimeType: string;
  }): Promise<ParsedDocument> {
    let rawText = "";
    try {
      const parsed = await pdfParse(args.buffer);
      rawText = clean(parsed.text || "");
    } catch {
      rawText = "";
    }
    const text = rawText || args.fileName;
    const documentNo = firstMatch(text, [
      /(?:Fatura|Belge|İrsaliye|Irsaliye)\s*No\s*:?\s*([A-Z]{2,4}\d{8,})/i,
      /\b([A-Z]{2,4}20\d{11,})\b/i,
    ]);
    const dispatchNo = firstMatch(text, [
      /(?:İrsaliye|Irsaliye)\s*No\s*:?\s*([A-Z]{2,4}\d{8,})/i,
      /\b(DDM20\d{11,}|TIA20\d{11,})\b/i,
    ]);
    const invoiceNo = firstMatch(text, [
      /Fatura\s*No\s*:?\s*([A-Z]{2,4}\d{8,})/i,
      /\b(HKN20\d{11,}|TKF20\d{11,}|SLV20\d{11,}|CNS20\d{11,})\b/i,
    ]) || (!dispatchNo ? documentNo : "");
    const issueDate = firstMatch(text, [
      /(?:Fatura Tarihi|İrsaliye Tarihi|Irsaliye Tarihi|Tarih)\s*:?\s*(\d{2}[./-]\d{2}[./-]\d{4}|\d{4}-\d{2}-\d{2})/i,
    ]);
    const normalizedDate = this.normalizeDate(issueDate);
    let issuerName = firstMatch(text, [
      /Asıl Satıcı Ünvan\s*:?\s*([^\n\r]+?)\s+Asıl Alıcı VKN/i,
      /(?:Satıcı|Satici|Gönderici|Gonderici|Unvan)\s*:?\s*([^\n\r]+)/i,
      /(FİLE MARKET MAĞAZACILIK ANONİM ŞİRKETİ|FILE MARKET MAGAZACILIK ANONIM SIRKETI)/i,
      /(MEC[İI]T HAKAN G[ÜU]RSU|HAKAN EMPR[İI]ME|SELV[İI] K[İI]MYA|TURAN K[İI]MYA|CAN YEMEK[^\n\r]*)/i,
    ]);
    let receiverName = firstMatch(text, [
      /Asıl Alıcı Ünvan\s*:?\s*([^\n\r]+?)\s+(?:\d{2}\s|15 Temmuz|BAĞLAR|BAGLAR|Vergi|Tic\.|e-İRSALİYE)/i,
      /(?:Alıcı|Alici|Müşteri|Musteri)\s*:?\s*([^\n\r]+)/i,
      /(TAHA G[İI]Y[İI]M[^\n\r]*|MEC[İI]T HAKAN G[ÜU]RSU|HAKAN EMPR[İI]ME[^\n\r]*)/i,
    ]);
    const taxNos = [...text.matchAll(/\b(?:VKN|TCKN)\s*:?\s*(\d{10,11})\b/gi)].map((m) => m[1]);
    const prefix = (documentNo || invoiceNo || dispatchNo || args.fileName).toLocaleUpperCase("tr-TR");
    let issuerTaxNo = taxNos[0] || "";
    let receiverTaxNo = taxNos.find((item) => item !== taxNos[0]) || "";
    if (/^(HKN|DDM)/.test(prefix)) {
      issuerName = "MECİT HAKAN GÜRSU";
      issuerTaxNo = "47254313470";
      receiverName = "TAHA GİYİM SAN. VE TİC. A.Ş";
      receiverTaxNo = "8160150864";
    } else if (/^TIA/.test(prefix) || /TIA20\d+/.test(prefix)) {
      issuerName = "TAHA GİYİM SAN. VE TİC. A.Ş";
      issuerTaxNo = "8160150864";
      receiverName = "MECİT HAKAN GÜRSU";
      receiverTaxNo = "47254313470";
    } else if (/^SLV/.test(prefix)) {
      issuerName = "SELVİ KİMYA";
      issuerTaxNo = "7600500357";
      receiverName = "MECİT HAKAN GÜRSU";
      receiverTaxNo = "47254313470";
    } else if (/^TKF/.test(prefix)) {
      issuerName = "TURAN KİMYA";
      issuerTaxNo = "8680681104";
      receiverName = "MECİT HAKAN GÜRSU";
      receiverTaxNo = "47254313470";
    } else if (/^CNS/.test(prefix)) {
      issuerName = "CAN YEMEK HİZMETLERİ";
      issuerTaxNo = "1980388415";
      receiverName = "MECİT HAKAN GÜRSU";
      receiverTaxNo = "47254313470";
    }
    const lines = this.parsePdfLines(text, args.fileHash);
    const grandTotal = money(firstMatch(text, [/(?:Vergiler\s*Dahil\s*Toplam\s*Tutar|Ödenecek\s*Tutar|Odenecek\s*Tutar|Fatura\s*Tutarı|Toplam\s*Tutar)\s*:?\s*([0-9.,]+)/i]));
    const parsedVatTotal = this.sumPdfVat(text) || money(firstMatch(text, [/Hesaplanan\s*KDV(?:\s*\([^)]*\))?\s*:?\s*([0-9.,]+)/i]));
    const lineSubtotal = lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0);
    const parsedSubtotal = money(firstMatch(text, [/Mal\s*Hizmet\s*Toplam\s*Tutarı\s*:?\s*([0-9.,]+)/i]));
    const subtotal = parsedSubtotal || (grandTotal && parsedVatTotal ? Number((grandTotal - parsedVatTotal).toFixed(2)) : lineSubtotal);
    const vatTotal = parsedVatTotal || (grandTotal && subtotal && grandTotal > subtotal ? Number((grandTotal - subtotal).toFixed(2)) : 0);
    if (lines.length === 1 && subtotal > 0 && Number(lines[0].subtotal || 0) <= 0) {
      lines[0].subtotal = subtotal;
      lines[0].vatAmount = vatTotal;
      lines[0].total = grandTotal || subtotal + vatTotal;
      lines[0].unitPrice = Number(lines[0].quantity || 0) > 0
        ? Number((subtotal / Number(lines[0].quantity || 1)).toFixed(4))
        : subtotal;
    }
    return {
      originalFileName: args.fileName,
      filePath: args.filePath,
      fileHash: args.fileHash,
      mimeType: args.mimeType,
      rawText,
      sourceType: "PDF",
      documentNo: documentNo || invoiceNo || dispatchNo,
      invoiceNo,
      dispatchNo,
      scenario: "",
      documentType: dispatchNo && !invoiceNo ? "DespatchAdvice" : "Invoice",
      issueDate: normalizedDate,
      issuerName,
      issuerTaxNo,
      receiverName,
      receiverTaxNo,
      currency: "TRY",
      subtotal,
      vatTotal,
      grandTotal,
      modelGuess: modelGuessFromText(`${args.fileName} ${text}`),
      lines,
      parseRawJson: { parser: "pdf-parse", rawText },
    };
  }

  private parsePdfLines(text: string, fileHash: string): ParsedDocumentLine[] {
    const tableRows = this.parseGenericPdfTableLines(text, fileHash);
    const paidFallbackRows = tableRows.length
      ? []
      : this.parsePaidQuantityLines(text, fileHash);
    const primaryRows = [...tableRows, ...paidFallbackRows];
    const zeroValueRows = this.parseZeroValueQuantityLines(
      text,
      fileHash,
      primaryRows.length,
    ).filter(
      (zeroRow) =>
        !primaryRows.some(
          (row) =>
            Number(row.unitPrice || 0) === 0 &&
            Math.abs(Number(row.quantity || 0) - Number(zeroRow.quantity || 0)) < 0.0001,
        ),
    );
    if (tableRows.length || paidFallbackRows.length) {
      return [...primaryRows, ...zeroValueRows];
    }
    const knownProducts = [
      "S 20 WHITE",
      "RETARDER GEL",
      "A 25 FİXATÖR",
      "A 25 FIXATOR",
      "SILICONE IN PRIMARY FORMS",
      "YEMEK",
    ];
    const lots = [...text.matchAll(/LOT\s*[-:]?\s*([A-Z0-9]+)|LOT￾([A-Z0-9]+)|LOT-([A-Z0-9]+)/gi)].map(
      (match) => match[1] || match[2] || match[3],
    );
    const rows: ParsedDocumentLine[] = [];
    knownProducts.forEach((product, index) => {
      if (!text.toLocaleUpperCase("tr-TR").includes(product.toLocaleUpperCase("tr-TR"))) return;
      const quantityValue = this.quantityNear(text, product);
      const lineUnit = /KG/i.test(text.slice(Math.max(0, text.toLocaleUpperCase("tr-TR").indexOf(product.toLocaleUpperCase("tr-TR"))), text.toLocaleUpperCase("tr-TR").indexOf(product.toLocaleUpperCase("tr-TR")) + 160)) ? "KG" : "ADET";
      rows.push({
        lineId: `${fileHash}-${rows.length + 1}`,
        lineNo: rows.length + 1,
        rawName: product,
        description: product,
        quantity: quantityValue,
        unit: lineUnit,
        unitPrice: 0,
        subtotal: 0,
        vatRate: product === "YEMEK" ? 10 : 20,
        vatAmount: 0,
        total: 0,
        lotNo: lots[index] || "",
        modelGuess: modelGuessFromText(text),
        missingFields: [],
      });
    });
    if (!rows.length && modelGuessFromText(text)) {
      rows.push({
        lineId: `${fileHash}-1`,
        lineNo: 1,
        rawName: modelGuessFromText(text),
        description: modelGuessFromText(text),
        quantity: this.quantityNear(text, modelGuessFromText(text)) || quantity(firstMatch(text, [/(?:Adet|Miktar)\s*:?\s*([0-9.,]+)/i, /\b([0-9][0-9.]*)\s*(?:ADET|AD)\b/i])),
        unit: "ADET",
        unitPrice: 0,
        subtotal: 0,
        vatRate: 20,
        vatAmount: 0,
        total: 0,
        modelGuess: modelGuessFromText(text),
        lotNo: lots[0] || "",
        missingFields: [],
      });
    }
    return [...rows, ...this.parseZeroValueQuantityLines(text, fileHash, rows.length)];
  }

  /**
   * Bazı İşNet PDF şablonları ürün kodunu ve satır numarasını miktarın altına
   * taşır. Bu durumda tablo regex'i çalışmaz; ücretli satır miktar + birim fiyat
   * üzerinden güvenli biçimde geri kazanılır.
   */
  private parsePaidQuantityLines(text: string, fileHash: string): ParsedDocumentLine[] {
    const rows: ParsedDocumentLine[] = [];
    const quantityPattern =
      /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(?:Adet|ADET|Ad|AD)\b/gi;
    for (const match of text.matchAll(quantityPattern)) {
      const qty = quantity(match[1]);
      if (qty <= 0) continue;
      const index = match.index || 0;
      const afterQuantity = clean(text.slice(index + match[0].length, index + match[0].length + 90));
      const firstPriceText = afterQuantity.match(/^(?:\s*)([0-9.,]+)\s*TL\b/i)?.[1] || "";
      const unitPrice = money(firstPriceText);
      if (unitPrice <= 0) continue;
      const before = text.slice(Math.max(0, index - 180), index);
      const candidateLines = before
        .split(/\r?\n/)
        .map(clean)
        .filter(Boolean)
        .filter((line) => !/(Miktar|Birim Fiyat|İskonto|KDV|Mal Hizmet)$/i.test(line));
      const description = clean(candidateLines.slice(-1)[0] || "Ürün / hizmet");
      const percentValues = [...afterQuantity.matchAll(/%\s*([0-9]+(?:[,.][0-9]+)?)/g)];
      const vatText = percentValues.at(-1)?.[1] || "";
      const vatRate = money(vatText);
      const subtotal = Number((qty * unitPrice).toFixed(2));
      const vatAmount = Number((subtotal * vatRate / 100).toFixed(2));
      rows.push({
        lineId: `${fileHash}-${rows.length + 1}`,
        lineNo: rows.length + 1,
        rawName: description,
        description,
        quantity: qty,
        unit: "ADET",
        unitPrice,
        subtotal,
        vatRate,
        vatAmount,
        total: subtotal,
        lotNo: "",
        modelGuess: modelGuessFromText(`${description} ${text}`),
        missingFields: [],
      });
    }
    return rows;
  }

  /**
   * Bedelsiz numune ve kalite-fire satirlari fatura tutarina girmese de adet
   * mutabakatina girer. PDF metinlerinde bu satirlar kolon sirasi bozulmus
   * gelebiliyor; bu nedenle fiyat regex'inden bagimsiz olarak adet + aciklama
   * uzerinden ikinci bir guvenli gecis yapilir. XML belgelerde zaten tum
   * InvoiceLine satirlari kaydedildigi icin bu yalnizca PDF yedegidir.
   */
  private parseZeroValueQuantityLines(
    text: string,
    fileHash: string,
    offset = 0,
  ): ParsedDocumentLine[] {
    const rows: ParsedDocumentLine[] = [];
    const exceptionWords =
      /\b(TEST|NUMUNE|KUMA[SŞ]\s*SAKATI|BASKI\s*SAKATI|SAKAT|HATALI|HATA|F[Iİ]RE|DEFOLU|BOZUK|ISKARTA)\b/i;
    const quantityPattern =
      /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(?:Adet|ADET|Ad|AD)\b/gi;
    for (const match of text.matchAll(quantityPattern)) {
      const qty = quantity(match[1]);
      if (qty <= 0) continue;
      const index = match.index || 0;
      const nearby = clean(text.slice(Math.max(0, index - 140), index + 280));
      const keyword = nearby.match(exceptionWords)?.[0] || "";
      if (!keyword) continue;
      // Ucretli ana satir ayni pencereye denk gelse bile yalniz sifir bedelli
      // istisna satirini al. IsNet PDF'lerinde 0 TL bilgisi adet sonrasinda olur.
      const afterQuantity = clean(text.slice(index, index + 180));
      const firstPrice = afterQuantity.match(/\b(\d+(?:[,.]\d+)?)\s*TL\b/i)?.[1] || "";
      if (money(firstPrice) !== 0) continue;
      if (rows.some((row) => Math.abs(row.quantity - qty) < 0.0001 && row.rawName === nearby)) continue;
      const description = clean(
        nearby.match(/(?:TEST\s*NUMUNE\w*|KUMA[SŞ]\s*SAKATI\w*|BASKI\s*SAKATI\w*|SAKAT\w*|HATALI\w*|F[Iİ]RE\w*|DEFOLU\w*|BOZUK\w*|ISKARTA\w*)/i)?.[0] ||
          keyword,
      );
      rows.push({
        lineId: `${fileHash}-${offset + rows.length + 1}`,
        lineNo: offset + rows.length + 1,
        rawName: nearby,
        description,
        quantity: qty,
        unit: "ADET",
        unitPrice: 0,
        subtotal: 0,
        vatRate: 0,
        vatAmount: 0,
        total: 0,
        lotNo: "",
        modelGuess: modelGuessFromText(text),
        missingFields: [],
      });
    }
    return rows;
  }

  private parseGenericPdfTableLines(text: string, fileHash: string): ParsedDocumentLine[] {
    const rows: ParsedDocumentLine[] = [];
    const tableText = text.includes("Malzeme Kodu/Code")
      ? text.slice(text.indexOf("Malzeme Kodu/Code"))
      : text;
    const pattern =
      /\b(\d{8,14})\s+(.+?)\s+(\d+(?:[,.]\d+)?)\s+([0-9.,]+)\s*TL\s+[0-9.,]+\s*TL\s*%([0-9]+(?:[,.][0-9])?)\s*([0-9.,]+)\s*TL/gi;
    for (const match of tableText.matchAll(pattern)) {
      const productCode = clean(match[1]);
      const rawName = clean(match[2]);
      const qty = quantity(match[3]);
      const unitPrice = money(match[4]);
      const vatRate = money(match[5]);
      const grossTotal = money(match[6]);
      if (!rawName || qty <= 0) continue;
      const vatAmount = vatRate > 0 ? Number((grossTotal - grossTotal / (1 + vatRate / 100)).toFixed(2)) : 0;
      rows.push({
        lineId: `${fileHash}-${rows.length + 1}`,
        lineNo: rows.length + 1,
        rawName,
        description: productCode ? `${rawName} (${productCode})` : rawName,
        quantity: qty,
        unit: "ADET",
        unitPrice,
        subtotal: Number((grossTotal - vatAmount).toFixed(2)),
        vatRate,
        vatAmount,
        total: grossTotal,
        lotNo: "",
        modelGuess: modelGuessFromText(text),
        sellerItemId: productCode,
        manufacturerItemId: productCode,
        standardItemId: productCode,
        missingFields: [],
      });
    }
    return rows;
  }

  private sumPdfVat(text: string) {
    const matches = [...text.matchAll(/Hesaplanan\s*KDV\s*\([^)]*\)\s*%[0-9.,]+\s*:?\s*([0-9.,]+)\s*TL/gi)];
    const total = matches.reduce((sum, match) => sum + money(match[1]), 0);
    return Number(total.toFixed(2));
  }

  private quantityNear(text: string, token: string) {
    if (!token) return 0;
    const upper = text.toLocaleUpperCase("tr-TR");
    const needle = token.toLocaleUpperCase("tr-TR");
    const indexes: number[] = [];
    let index = upper.indexOf(needle);
    while (index >= 0) {
      indexes.push(index);
      index = upper.indexOf(needle, index + needle.length);
    }
    for (const tokenIndex of indexes) {
      const windowText = text.slice(tokenIndex, tokenIndex + 220);
      const after = firstMatch(windowText, [
        /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(?:Adet|ADET|Ad|KG|Kg|Unit)/i,
      ]);
      if (after) return quantity(after);
      const before = firstMatch(text.slice(Math.max(0, tokenIndex - 80), tokenIndex + 80), [
        /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(?:Adet|ADET|Ad|KG|Kg|Unit)/i,
      ]);
      if (before) return quantity(before);
    }
    return 0;
  }

  private normalizeDate(value: string) {
    const raw = clean(value);
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
  }

  private parseImage(args: {
    fileName: string;
    filePath: string;
    fileHash: string;
    mimeType: string;
  }): ParsedDocument {
    const provider = clean(process.env.DOCUMENT_OCR_PROVIDER || "disabled").toLocaleLowerCase("tr-TR");
    const rawText =
      provider && provider !== "disabled"
        ? "OCR saglayicisi yapilandirildi; bu dosya on kontrol havuzunda kullanici onayi bekler."
        : "OCR servisi tanimli degil. Gorsel belge havuza alindi; kalici muhasebe kaydi icin OCR/API anahtari veya manuel duzeltme gerekir.";
    return {
      ...this.empty(args, "IMAGE_OCR", rawText),
      sourceType: "IMAGE_OCR",
      parseRawJson: {
        rawText,
        ocrProvider: provider || "disabled",
        warnings: [rawText],
      },
    };
  }

  private empty(args: { fileName: string; filePath: string; fileHash: string; mimeType: string }, sourceType: "XML" | "PDF" | "IMAGE_OCR" | "UNKNOWN", rawText: string): ParsedDocument {
    return {
      originalFileName: args.fileName,
      filePath: args.filePath,
      fileHash: args.fileHash,
      mimeType: args.mimeType,
      rawText,
      sourceType,
      documentNo: firstMatch(args.fileName, [/\b([A-Z]{2,4}20\d{11,})\b/i]),
      invoiceNo: "",
      dispatchNo: "",
      scenario: "",
      documentType: "",
      issueDate: "",
      issuerName: "",
      issuerTaxNo: "",
      receiverName: "",
      receiverTaxNo: "",
      currency: "TRY",
      subtotal: 0,
      vatTotal: 0,
      grandTotal: 0,
      modelGuess: modelGuessFromText(args.fileName),
      lines: [],
      parseRawJson: { rawText },
    };
  }
}
