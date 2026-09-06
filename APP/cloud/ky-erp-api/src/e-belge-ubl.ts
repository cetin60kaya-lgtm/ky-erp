type Row = Record<string, any>;

const text = (value: unknown) => value == null ? "" : String(value).trim();
const upper = (value: unknown) => text(value).toLocaleUpperCase("tr-TR");
const normalize = (value: unknown) =>
  upper(value)
    .replace(/İ/g, "I")
    .replace(/ı/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const cleanTax = (value: unknown) => text(value).replace(/\D/g, "");
const directionOf = (value: unknown) => /OUT|GIDEN/i.test(upper(value)) ? "OUTGOING" : "INCOMING";

function documentTypeOf(value: unknown, direction: string) {
  const normalized = upper(value);
  if (/IRSALIYE|DISPATCH|DESPATCH/.test(normalized)) {
    return direction === "OUTGOING" ? "GIDEN_IRSALIYE" : "GELEN_IRSALIYE";
  }
  if (/IADE|RETURN/.test(normalized)) return "IADE_FATURA";
  if (/ARSIV/.test(normalized)) return "E_ARSIV";
  return direction === "OUTGOING" ? "GIDEN_FATURA" : "GELEN_FATURA";
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function xmlTag(xml: string, names: string[]) {
  for (const name of names) {
    const re = new RegExp(
      `<(?:[A-Za-z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${name}>`,
      "i",
    );
    const match = xml.match(re);
    if (match) return decodeXml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  }
  return "";
}

function xmlBlocks(xml: string, name: string) {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${name}>`,
    "gi",
  );
  return [...xml.matchAll(re)].map((match) => match[1]);
}

function trNumber(value: unknown) {
  let source = text(value).replace(/[^0-9,.-]/g, "");
  if (!source) return 0;
  const comma = source.lastIndexOf(",");
  const dot = source.lastIndexOf(".");
  const idx = Math.max(comma, dot);
  if (comma >= 0 && dot >= 0) {
    source = `${source.slice(0, idx).replace(/[,.]/g, "")}.${source.slice(idx + 1).replace(/[,.]/g, "")}`;
  } else if (comma >= 0) {
    source = source.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(source);
  return Number.isFinite(parsed) ? parsed : 0;
}

function amount(block: string, name: string) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}[^>]*>([^<]+)</`, "i");
  return trNumber((block.match(re) || [])[1]);
}

function nestedId(block: string, name: string) {
  const inner = xmlBlocks(block, name)[0] || "";
  return xmlTag(inner, ["ID"]);
}

function lotFrom(item: string, line: string) {
  const instance = xmlBlocks(item, "ItemInstance")[0] || "";
  const lot = xmlBlocks(instance, "LotIdentification")[0] || "";
  const standard = xmlTag(lot, ["LotNumberID", "ID"]) || xmlTag(instance, ["SerialID"]);
  if (standard) return standard;
  for (const property of xmlBlocks(item, "AdditionalItemProperty")) {
    const name = normalize(xmlTag(property, ["Name"]));
    if (["LOT", "LOT NO", "LOT NUMARASI", "PARTI", "PARTI NO", "BATCH"].includes(name)) {
      const value = xmlTag(property, ["Value", "ValueQualifier"]);
      if (value) return value;
    }
  }
  const combined = `${xmlTag(line, ["Note"])} ${xmlTag(item, ["Description", "Name"])}`;
  return text(combined.match(/\b(?:LOT|PARTI|BATCH)\s*[-:#]?\s*([A-Z0-9._/-]+)/i)?.[1]);
}

export function parseCanonicalEBelgeUbl(xml: string, directionInput: string): Row {
  const invoice = /<(?:[A-Za-z0-9_]+:)?Invoice\b/i.test(xml);
  const dispatch = /<(?:[A-Za-z0-9_]+:)?DespatchAdvice\b/i.test(xml);
  if (!invoice && !dispatch) {
    throw Object.assign(new Error("Dosya UBL-TR fatura/irsaliye olarak tanınmadı."), {
      code: "UBL_TR_NOT_RECOGNIZED",
    });
  }

  const direction = directionOf(directionInput);
  const supplier =
    xmlBlocks(xml, "AccountingSupplierParty")[0] ||
    xmlBlocks(xml, "DespatchSupplierParty")[0] ||
    "";
  const customer =
    xmlBlocks(xml, "AccountingCustomerParty")[0] ||
    xmlBlocks(xml, "DeliveryCustomerParty")[0] ||
    "";
  const party = direction === "INCOMING" ? supplier : customer;
  const legal = xmlBlocks(xml, "LegalMonetaryTotal")[0] || "";
  const taxTotalBlock = xmlBlocks(xml, "TaxTotal")[0] || "";
  const lineName = invoice ? "InvoiceLine" : "DespatchLine";

  const lines = xmlBlocks(xml, lineName).map((block, index) => {
    const item = xmlBlocks(block, "Item")[0] || block;
    const price = xmlBlocks(block, "Price")[0] || block;
    const tax = xmlBlocks(block, "TaxTotal")[0] || "";
    const quantityName = invoice ? "InvoicedQuantity" : "DeliveredQuantity";
    const quantity = amount(block, quantityName);
    const unitCode = text(
      block.match(
        new RegExp(
          `<(?:[A-Za-z0-9_]+:)?${quantityName}[^>]*unitCode=["']([^"']+)["']`,
          "i",
        ),
      )?.[1],
    );

    return {
      lineNo: index + 1,
      productCode:
        nestedId(item, "BuyersItemIdentification") ||
        nestedId(item, "StandardItemIdentification"),
      supplierProductCode: nestedId(item, "SellersItemIdentification"),
      description: xmlTag(item, ["Name", "Description"]),
      quantity,
      unitCode,
      unitPrice: amount(price, "PriceAmount"),
      taxRate: amount(xmlBlocks(tax, "TaxSubtotal")[0] || tax, "Percent"),
      taxAmount: amount(tax, "TaxAmount"),
      discountTotal: xmlBlocks(block, "AllowanceCharge")
        .filter((value) => !/ChargeIndicator[^>]*>\s*true/i.test(value))
        .reduce((sum, value) => sum + amount(value, "Amount"), 0),
      lineTotal: amount(block, "LineExtensionAmount"),
      lotNo: lotFrom(item, block),
    };
  });

  const dispatchReferences = xmlBlocks(xml, "DespatchDocumentReference")
    .map((block) => xmlTag(block, ["ID"]))
    .filter(Boolean);

  return {
    direction,
    documentType: documentTypeOf(invoice ? "INVOICE" : "DISPATCH", direction),
    documentNo: xmlTag(xml, ["ID"]),
    uuid: xmlTag(xml, ["UUID"]),
    issueDate: xmlTag(xml, ["IssueDate"]),
    dueDate: xmlTag(xml, ["DueDate"]),
    currency: xmlTag(xml, ["DocumentCurrencyCode"]) || "TRY",
    partyName: xmlTag(party, ["RegistrationName", "Name"]),
    partyTaxNo: cleanTax(xmlTag(party, ["CompanyID", "ID"])),
    subtotal:
      amount(legal, "TaxExclusiveAmount") ||
      amount(legal, "LineExtensionAmount"),
    taxTotal: amount(taxTotalBlock, "TaxAmount"),
    discountTotal: amount(legal, "AllowanceTotalAmount"),
    payableTotal:
      amount(legal, "PayableAmount") ||
      amount(legal, "TaxInclusiveAmount"),
    lines,
    parserVersion: "ubl-tr-e-belge-v2",
    rawMetadata: {
      profileId: xmlTag(xml, ["ProfileID"]),
      invoiceTypeCode: xmlTag(xml, ["InvoiceTypeCode"]),
      dispatchReferences: [...new Set(dispatchReferences)],
    },
  };
}
