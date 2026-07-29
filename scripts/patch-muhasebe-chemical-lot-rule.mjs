import fs from "node:fs";

const file = "APP/app/ky-erp-backend/src/muhasebe/muhasebe-document-workflow.service.ts";
const source = fs.readFileSync(file, "utf8");

const oldMethod = `  private isLotRequiredForSupplierInvoice(invoice: any, lines: any[]) {
    const supplierText = this.normalizeLotRuleText(
      [
        invoice?.supplierName,
        invoice?.firma,
        invoice?.saticiUnvan,
        invoice?.rawSupplierName,
      ].join(" "),
    );
    const supplierKeywords = ["URAS", "TURAN", "KIMYA", "BOYA", "KIMYEVI"];
    if (supplierKeywords.some((keyword) => supplierText.includes(keyword))) {
      return true;
    }
    const productKeywords = [
      "KIMYA",
      "BOYA",
      "PIGMENT",
      "BASE",
      "FIKSATOR",
      "TUTKAL",
    ];
    return (Array.isArray(lines) ? lines : []).some((line) => {
      const productText = this.normalizeLotRuleText(
        [
          line?.category,
          line?.productCategory,
          line?.productName,
          line?.matchedProductName,
          line?.rawDescription,
        ].join(" "),
      );
      return productKeywords.some((keyword) => productText.includes(keyword));
    });
  }`;

const newMethod = `  private isLotRequiredForSupplierInvoice(
    company: MainCompany,
    invoice: any,
  ) {
    const companies = this.getCompanies(company);
    const supplierId = this.cleanText(
      invoice?.supplierCompanyId || invoice?.companyId,
    );
    const supplierName = this.normalizeLotRuleText(
      invoice?.supplierName || invoice?.firma || invoice?.saticiUnvan,
    );
    const supplier = companies.find((row: any) => {
      if (supplierId && this.cleanText(row?.id || row?.firmaId) === supplierId) {
        return true;
      }
      const rowName = this.normalizeLotRuleText(
        row?.firmaAdi || row?.firma || row?.name || row?.companyName,
      );
      return Boolean(
        supplierName &&
          rowName &&
          (rowName === supplierName ||
            rowName.includes(supplierName) ||
            supplierName.includes(rowName)),
      );
    });
    const raw = supplier?.raw || {};
    const explicitFlags = [
      supplier?.isChemicalSupplier,
      supplier?.kimyaBoyaTedarikcisi,
      supplier?.dyehouseSupplier,
      supplier?.boyahaneTedarikcisi,
      raw?.isChemicalSupplier,
      raw?.kimyaBoyaTedarikcisi,
      raw?.dyehouseSupplier,
      raw?.boyahaneTedarikcisi,
    ];
    if (
      explicitFlags.some(
        (value) =>
          value === true ||
          value === 1 ||
          ["EVET", "TRUE", "1", "AKTIF", "ACTIVE"].includes(
            this.normalizeLotRuleText(value),
          ),
      )
    ) {
      return true;
    }
    const classificationText = this.normalizeLotRuleText(
      [
        supplier?.supplierCategory,
        supplier?.tedarikciKategorisi,
        supplier?.category,
        supplier?.kategori,
        supplier?.sector,
        supplier?.sektor,
        supplier?.companyGroup,
        supplier?.firmaGrubu,
        raw?.supplierCategory,
        raw?.tedarikciKategorisi,
        raw?.category,
        raw?.kategori,
        raw?.sector,
        raw?.sektor,
        raw?.companyGroup,
        raw?.firmaGrubu,
      ].join(" "),
    );
    const classificationKeywords = [
      "KIMYA",
      "BOYA",
      "KIMYEVI",
      "PIGMENT",
      "BOYAHANE",
    ];
    if (
      classificationKeywords.some((keyword) =>
        classificationText.includes(keyword),
      )
    ) {
      return true;
    }
    const supplierText = this.normalizeLotRuleText(
      [
        supplierName,
        invoice?.rawSupplierName,
        supplier?.firmaAdi,
        supplier?.firma,
        supplier?.name,
      ].join(" "),
    );
    const knownChemicalSupplierKeywords = [
      "URAS",
      "TURAN",
      "SELVI",
      "KIMYA",
      "BOYA",
      "KIMYEVI",
    ];
    return knownChemicalSupplierKeywords.some((keyword) =>
      supplierText.includes(keyword),
    );
  }`;

let next = source;
if (next.includes(oldMethod)) {
  next = next.replace(oldMethod, newMethod);
}

next = next.replaceAll(
  "this.isLotRequiredForSupplierInvoice(invoice, lines)",
  "this.isLotRequiredForSupplierInvoice(company, invoice)",
);

if (next === source) {
  console.log("Boya/kimya lot kuralı zaten güncel.");
  process.exit(0);
}

if (next.includes("private isLotRequiredForSupplierInvoice(invoice: any, lines: any[])")) {
  throw new Error("Eski lot kuralı kaldırılamadı.");
}
if (!next.includes("this.isLotRequiredForSupplierInvoice(company, invoice)")) {
  throw new Error("Yeni lot kuralı çağrısı doğrulanamadı.");
}

fs.writeFileSync(file, next, "utf8");
console.log("Lot üretimi yalnız boya/kimya tedarikçi firma kartlarına sınırlandı.");
