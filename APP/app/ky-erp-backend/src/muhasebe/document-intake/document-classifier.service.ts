import { Injectable } from "@nestjs/common";
import type { DocumentDirection, DocumentKind, ParsedDocument } from "./dto/document-intake.dto";

const MAIN_COMPANY_TAX_NO = "47254313470";
const MAIN_COMPANY_NAMES = [
  "MECİT HAKAN GÜRSU",
  "MECIT HAKAN GURSU",
  "HAKAN EMPRİME",
  "HAKAN EMPRIME",
  "HAKAN EMP",
];

@Injectable()
export class DocumentClassifierService {
  normalize(value: unknown) {
    return String(value || "")
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\b(LTD|LIMITED|STI|SIRKETI|SAN|SANAYI|TIC|TICARET|AS|A S|VE)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  isMainCompany(name?: string, taxNo?: string) {
    const normalizedTax = String(taxNo || "").replace(/\D/g, "");
    if (normalizedTax && normalizedTax === MAIN_COMPANY_TAX_NO) return true;
    const normalized = this.normalize(name);
    return MAIN_COMPANY_NAMES.some((item) => {
      const key = this.normalize(item);
      return normalized === key || normalized.includes(key) || key.includes(normalized);
    });
  }

  classify(parsed: ParsedDocument) {
    const issuerIsMain = this.isMainCompany(parsed.issuerName, parsed.issuerTaxNo);
    const receiverIsMain = this.isMainCompany(parsed.receiverName, parsed.receiverTaxNo);
    const isDispatch = /DESPATCH|IRSALIYE|İRSALIYE/i.test(
      `${parsed.documentType} ${parsed.dispatchNo} ${parsed.rawText.slice(0, 600)}`,
    );
    const isInvoice = /INVOICE|FATURA/i.test(
      `${parsed.documentType} ${parsed.invoiceNo} ${parsed.rawText.slice(0, 600)}`,
    );
    let documentKind: DocumentKind = "UNKNOWN";
    let direction: DocumentDirection = "UNKNOWN";
    const reasons: string[] = [];

    if (issuerIsMain) {
      direction = "OUTGOING";
      documentKind = isDispatch && !isInvoice ? "OUR_DISPATCH" : "OUR_INVOICE";
      reasons.push("Belgeyi kesen ana firma");
    } else if (receiverIsMain) {
      direction = "INCOMING";
      if (isDispatch && !isInvoice) {
        documentKind = "CUSTOMER_DISPATCH";
      } else {
        documentKind = this.looksExpense(parsed) ? "EXPENSE_INVOICE" : "SUPPLIER_INVOICE";
      }
      reasons.push("Belge ana firmaya kesilmiş");
    }

    const documentNo = (parsed.documentNo || parsed.invoiceNo || parsed.dispatchNo).toLocaleUpperCase("tr-TR");
    if (/^HKN/.test(documentNo)) reasons.push("HKN prefix satış faturası kontrolü");
    if (/^DDM/.test(documentNo)) reasons.push("DDM prefix sevk irsaliyesi kontrolü");
    if (/^TIA/.test(documentNo)) reasons.push("TIA prefix müşteri irsaliyesi kontrolü");
    if (/^(TKF|SLV|CNS)/.test(documentNo)) reasons.push("Tedarikçi/gider prefix kontrolü");

    return { documentKind, direction, issuerIsMain, receiverIsMain, reasons };
  }

  private looksExpense(parsed: ParsedDocument) {
    const haystack = this.normalize(
      `${parsed.issuerName} ${parsed.rawText.slice(0, 1500)} ${parsed.lines.map((line) => line.rawName).join(" ")}`,
    );
    return /CAN YEMEK|YEMEK|LOKANTA|RESTAURANT|AKARYAKIT|KARGO|TELEFON|INTERNET/.test(haystack);
  }
}
