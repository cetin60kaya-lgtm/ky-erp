import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { DocumentKind, MatchStatus, ParsedDocument, ParsedDocumentLine } from "./dto/document-intake.dto";

@Injectable()
export class DocumentMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  normalize(value: unknown) {
    return String(value || "")
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\b(LTD|LIMITED|STI|SIRKETI|SAN|SANAYI|TIC|TICARET|AS|A S|VE|TEKSTIL|KIMYA)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async enrich(mainCompanySlug: string, parsed: ParsedDocument, documentKind: DocumentKind) {
    const firmName = this.counterpartyName(parsed, documentKind);
    const firmTaxNo = this.counterpartyTaxNo(parsed, documentKind);
    const firmMatch = await this.matchFirm(mainCompanySlug, firmName, firmTaxNo, documentKind);
    const modelMatch = await this.matchModel(mainCompanySlug, parsed.modelGuess);
    const lines = await Promise.all(
      parsed.lines.map((line) => this.matchLine(mainCompanySlug, line, firmMatch.firmId)),
    );
    return {
      firmMatch,
      modelMatch,
      lines,
    };
  }

  private counterpartyName(parsed: ParsedDocument, documentKind: DocumentKind) {
    return ["OUR_INVOICE", "OUR_DISPATCH"].includes(documentKind)
      ? parsed.receiverName
      : parsed.issuerName;
  }

  private counterpartyTaxNo(parsed: ParsedDocument, documentKind: DocumentKind) {
    return ["OUR_INVOICE", "OUR_DISPATCH"].includes(documentKind)
      ? parsed.receiverTaxNo
      : parsed.issuerTaxNo;
  }

  async matchFirm(mainCompanySlug: string, name: string, taxNo: string, documentKind: DocumentKind) {
    const cleanTax = String(taxNo || "").replace(/\D/g, "");
    if (cleanTax) {
      const byTax = await this.prisma.company.findFirst({ where: { mainCompanySlug, taxNo: cleanTax } });
      if (byTax) return { firmId: byTax.id, firmName: byTax.name, firmMatchStatus: "MATCHED" as MatchStatus, score: 100, firmDraftJson: null };
    }
    const normalized = this.normalize(name);
    if (normalized) {
      const rows = await this.prisma.company.findMany({ where: { mainCompanySlug, isActive: true } });
      const exact = rows.find((row) => this.normalize(row.name) === normalized || this.normalize(row.normalizedName) === normalized);
      if (exact) return { firmId: exact.id, firmName: exact.name, firmMatchStatus: "MATCHED" as MatchStatus, score: 96, firmDraftJson: null };
      const suggested = rows
        .map((row) => ({ row, score: this.similarity(normalized, this.normalize(row.name)) }))
        .sort((a, b) => b.score - a.score)[0];
      if (suggested && suggested.score >= 72) {
        return { firmId: suggested.row.id, firmName: suggested.row.name, firmMatchStatus: "SUGGESTED" as MatchStatus, score: suggested.score, firmDraftJson: null };
      }
    }
    return {
      firmId: null,
      firmName: name,
      firmMatchStatus: "NEW_DRAFT" as MatchStatus,
      score: 0,
      firmDraftJson: {
        name: name || "Bilinmeyen firma",
        taxNo: cleanTax,
        taxOffice: "",
        address: "",
        email: "",
        phone: "",
        suggestedType: documentKind === "OUR_INVOICE" || documentKind === "OUR_DISPATCH" || documentKind === "CUSTOMER_DISPATCH" ? "CUSTOMER" : "SUPPLIER",
      },
    };
  }

  async matchLine(mainCompanySlug: string, line: ParsedDocumentLine, supplierFirmId?: string | null) {
    const normalized = this.normalize(line.rawName || line.description);
    if (!normalized) return { ...line, productMatchStatus: "MISSING" as MatchStatus, missingFields: ["PRODUCT"] };
    const codes = [line.standardItemId, line.manufacturerItemId, line.sellerItemId]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (codes.length) {
      const aliases = await this.prisma.productAlias.findMany({
        where: { mainCompanySlug, isActive: true },
        take: 1000,
      });
      const byCode = aliases.find((alias) => {
        const raw = alias.raw && typeof alias.raw === "object" ? alias.raw as any : {};
        return codes.some(
          (code) =>
            String(raw.gtin || raw.barcode || raw.sellerItemId || raw.manufacturerItemId || raw.standardItemId || "") === code ||
            this.normalize(alias.rawName) === this.normalize(code),
        );
      });
      if (byCode) {
        return { ...line, productId: byCode.productId, productMatchStatus: "MATCHED" as MatchStatus, missingFields: [] };
      }
    }
    const exact = await this.prisma.product.findFirst({ where: { mainCompanySlug, normalizedName: normalized } });
    if (exact) return { ...line, productId: exact.id, productMatchStatus: "MATCHED" as MatchStatus, missingFields: [] };
    const alias = await this.prisma.productAlias.findFirst({ where: { mainCompanySlug, normalizedName: normalized } });
    if (alias) return { ...line, productId: alias.productId, productMatchStatus: "MATCHED" as MatchStatus, missingFields: [] };
    const products = await this.prisma.product.findMany({ where: { mainCompanySlug, isActive: true }, take: 300 });
    const suggested = products.map((row) => ({ row, score: this.similarity(normalized, this.normalize(row.name)) })).sort((a, b) => b.score - a.score)[0];
    if (suggested && suggested.score >= 78) {
      return { ...line, productId: suggested.row.id, productMatchStatus: "SUGGESTED" as MatchStatus, missingFields: [] };
    }
    return {
      ...line,
      productId: null,
      productMatchStatus: "NEW_DRAFT" as MatchStatus,
      productDraftJson: {
        rawName: line.rawName,
        normalizedName: normalized,
        supplierFirmId: supplierFirmId || null,
        unit: line.unit || "ADET",
        defaultVatRate: line.vatRate || 20,
        firstPrice: line.unitPrice || 0,
        sellerItemId: line.sellerItemId || "",
        manufacturerItemId: line.manufacturerItemId || "",
        standardItemId: line.standardItemId || "",
        productGroup: this.suggestProductGroup(line.rawName),
      },
      missingFields: ["PRODUCT"],
    };
  }

  async matchModel(mainCompanySlug: string, modelGuess: string) {
    const normalized = this.normalize(modelGuess);
    if (!normalized) return { modelId: null, modelMatchStatus: "MISSING" as MatchStatus, score: 0 };
    const rows = await this.prisma.modelRecord.findMany({ where: { mainCompanySlug } });
    const exact = rows.find((row) => this.normalize(row.modelName) === normalized || this.normalize(row.modelCode) === normalized);
    if (exact) return { modelId: exact.id, modelName: exact.modelName, modelMatchStatus: "MATCHED" as MatchStatus, score: 100 };
    const suggested = rows.map((row) => ({ row, score: this.similarity(normalized, this.normalize(row.modelName)) })).sort((a, b) => b.score - a.score)[0];
    if (suggested && suggested.score >= 78) {
      return { modelId: suggested.row.id, modelName: suggested.row.modelName, modelMatchStatus: "SUGGESTED" as MatchStatus, score: suggested.score };
    }
    return { modelId: null, modelName: modelGuess, modelMatchStatus: "MISSING" as MatchStatus, score: 0 };
  }

  private suggestProductGroup(name: string) {
    const normalized = this.normalize(name);
    return /WHITE|RETARDER|FIXATOR|FIXAT|SILICONE|GEL|KIMYA/.test(normalized)
      ? "BOYAHANE"
      : "GENEL";
  }

  private similarity(a: string, b: string) {
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 88;
    const aSet = new Set(a.split(" "));
    const bSet = new Set(b.split(" "));
    const intersection = [...aSet].filter((item) => bSet.has(item)).length;
    return Math.round((intersection / Math.max(aSet.size, bSet.size, 1)) * 100);
  }
}
