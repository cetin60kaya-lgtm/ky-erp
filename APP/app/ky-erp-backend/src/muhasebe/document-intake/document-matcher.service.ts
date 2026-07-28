import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  DocumentKind,
  MatchStatus,
  ParsedDocument,
  ParsedDocumentLine,
} from "./dto/document-intake.dto";

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
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeFirm(value: unknown) {
    return this.normalize(value)
      .replace(
        /\b(LTD|LIMITED|STI|SIRKETI|SAN|SANAYI|TIC|TICARET|AS|A S|VE)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  async enrich(
    mainCompanySlug: string,
    parsed: ParsedDocument,
    documentKind: DocumentKind,
  ) {
    const firmName = this.counterpartyName(parsed, documentKind);
    const firmTaxNo = this.counterpartyTaxNo(parsed, documentKind);
    const firmMatch = await this.matchFirm(
      mainCompanySlug,
      firmName,
      firmTaxNo,
      documentKind,
    );
    const modelMatch = await this.matchModel(mainCompanySlug, parsed.modelGuess);
    const lines = await Promise.all(
      parsed.lines.map((line) =>
        this.matchLine(mainCompanySlug, line, firmMatch.firmId),
      ),
    );
    return {
      firmMatch,
      modelMatch,
      lines,
    };
  }

  private counterpartyName(
    parsed: ParsedDocument,
    documentKind: DocumentKind,
  ) {
    return ["OUR_INVOICE", "OUR_DISPATCH"].includes(documentKind)
      ? parsed.receiverName
      : parsed.issuerName;
  }

  private counterpartyTaxNo(
    parsed: ParsedDocument,
    documentKind: DocumentKind,
  ) {
    return ["OUR_INVOICE", "OUR_DISPATCH"].includes(documentKind)
      ? parsed.receiverTaxNo
      : parsed.issuerTaxNo;
  }

  async matchFirm(
    mainCompanySlug: string,
    name: string,
    taxNo: string,
    documentKind: DocumentKind,
  ) {
    const cleanTax = String(taxNo || "").replace(/\D/g, "");
    if (cleanTax) {
      const byTax = await this.prisma.company.findFirst({
        where: { mainCompanySlug, taxNo: cleanTax, deletedAt: null },
      });
      if (byTax) {
        return {
          firmId: byTax.id,
          firmName: byTax.name,
          firmMatchStatus: "MATCHED" as MatchStatus,
          score: 100,
          matchSource: "TAX_NO",
          firmDraftJson: null,
        };
      }

      const aliasByTax = await this.prisma.companyAlias.findFirst({
        where: {
          mainCompanySlug,
          taxNo: cleanTax,
          isActive: true,
          deletedAt: null,
        },
        include: { company: true },
      });
      if (aliasByTax?.company) {
        return {
          firmId: aliasByTax.company.id,
          firmName: aliasByTax.company.name,
          firmMatchStatus: "MATCHED" as MatchStatus,
          score: 100,
          matchSource: "ALIAS_TAX_NO",
          aliasId: aliasByTax.id,
          firmDraftJson: null,
        };
      }
    }

    const normalized = this.normalize(name);
    const firmNormalized = this.normalizeFirm(name);
    if (normalized) {
      const exactAlias = await this.prisma.companyAlias.findFirst({
        where: {
          mainCompanySlug,
          normalizedName: normalized,
          isActive: true,
          deletedAt: null,
        },
        include: { company: true },
      });
      if (exactAlias?.company) {
        return {
          firmId: exactAlias.company.id,
          firmName: exactAlias.company.name,
          firmMatchStatus: "MATCHED" as MatchStatus,
          score: 100,
          matchSource: "COMPANY_ALIAS",
          aliasId: exactAlias.id,
          firmDraftJson: null,
        };
      }

      const rows = await this.prisma.company.findMany({
        where: { mainCompanySlug, isActive: true, deletedAt: null },
      });
      const exact = rows.find(
        (row) =>
          this.normalize(row.name) === normalized ||
          this.normalize(row.normalizedName) === normalized ||
          this.normalizeFirm(row.name) === firmNormalized,
      );
      if (exact) {
        return {
          firmId: exact.id,
          firmName: exact.name,
          firmMatchStatus: "MATCHED" as MatchStatus,
          score: 98,
          matchSource: "COMPANY_NAME",
          firmDraftJson: null,
        };
      }

      const aliases = await this.prisma.companyAlias.findMany({
        where: {
          mainCompanySlug,
          isActive: true,
          deletedAt: null,
        },
        include: { company: true },
        take: 2000,
      });
      const aliasSuggestion = aliases
        .map((alias) => ({
          alias,
          score: this.similarity(
            firmNormalized,
            this.normalizeFirm(alias.rawName),
          ),
        }))
        .sort((left, right) => right.score - left.score)[0];
      if (aliasSuggestion?.alias?.company && aliasSuggestion.score >= 86) {
        return {
          firmId: aliasSuggestion.alias.company.id,
          firmName: aliasSuggestion.alias.company.name,
          firmMatchStatus: "SUGGESTED" as MatchStatus,
          score: aliasSuggestion.score,
          matchSource: "COMPANY_ALIAS_SUGGESTION",
          aliasId: aliasSuggestion.alias.id,
          firmDraftJson: null,
        };
      }

      const suggested = rows
        .map((row) => ({
          row,
          score: this.similarity(
            firmNormalized,
            this.normalizeFirm(row.name),
          ),
        }))
        .sort((left, right) => right.score - left.score)[0];
      if (suggested && suggested.score >= 84) {
        return {
          firmId: suggested.row.id,
          firmName: suggested.row.name,
          firmMatchStatus: "SUGGESTED" as MatchStatus,
          score: suggested.score,
          matchSource: "COMPANY_NAME_SUGGESTION",
          firmDraftJson: null,
        };
      }
    }

    return {
      firmId: null,
      firmName: name,
      firmMatchStatus: "NEW_DRAFT" as MatchStatus,
      score: 0,
      matchSource: "NEW_DRAFT",
      firmDraftJson: {
        name: name || "Bilinmeyen firma",
        taxNo: cleanTax,
        taxOffice: "",
        address: "",
        email: "",
        phone: "",
        suggestedType:
          documentKind === "OUR_INVOICE" ||
          documentKind === "OUR_DISPATCH" ||
          documentKind === "CUSTOMER_DISPATCH"
            ? "CUSTOMER"
            : "SUPPLIER",
      },
    };
  }

  async matchLine(
    mainCompanySlug: string,
    line: ParsedDocumentLine,
    supplierFirmId?: string | null,
  ) {
    const normalized = this.normalize(line.rawName || line.description);
    if (!normalized) {
      return {
        ...line,
        productMatchStatus: "MISSING" as MatchStatus,
        missingFields: ["PRODUCT"],
      };
    }

    const codes = [
      line.standardItemId,
      line.manufacturerItemId,
      line.sellerItemId,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (codes.length) {
      const aliases = await this.prisma.productAlias.findMany({
        where: { mainCompanySlug, isActive: true },
        take: 3000,
      });
      const byCode = aliases.find((alias) => {
        const raw =
          alias.raw && typeof alias.raw === "object"
            ? (alias.raw as any)
            : {};
        const aliasSupplierId = String(raw.supplierFirmId || "");
        if (
          supplierFirmId &&
          aliasSupplierId &&
          aliasSupplierId !== supplierFirmId
        ) {
          return false;
        }
        return codes.some(
          (code) =>
            String(
              raw.gtin ||
                raw.barcode ||
                raw.sellerItemId ||
                raw.manufacturerItemId ||
                raw.standardItemId ||
                "",
            ) === code || this.normalize(alias.rawName) === this.normalize(code),
        );
      });
      if (byCode) {
        return {
          ...line,
          productId: byCode.productId,
          productMatchStatus: "MATCHED" as MatchStatus,
          productMatchSource: "PRODUCT_CODE_ALIAS",
          missingFields: [],
        };
      }
    }

    const exact = await this.prisma.product.findFirst({
      where: { mainCompanySlug, normalizedName: normalized, isActive: true },
    });
    if (exact) {
      return {
        ...line,
        productId: exact.id,
        productMatchStatus: "MATCHED" as MatchStatus,
        productMatchSource: "PRODUCT_NAME",
        missingFields: [],
      };
    }

    const alias = await this.prisma.productAlias.findFirst({
      where: {
        mainCompanySlug,
        normalizedName: normalized,
        isActive: true,
      },
    });
    if (alias) {
      return {
        ...line,
        productId: alias.productId,
        productMatchStatus: "MATCHED" as MatchStatus,
        productMatchSource: "PRODUCT_ALIAS",
        missingFields: [],
      };
    }

    const products = await this.prisma.product.findMany({
      where: { mainCompanySlug, isActive: true },
      take: 1000,
    });
    const suggested = products
      .map((row) => ({
        row,
        score: this.similarity(normalized, this.normalize(row.name)),
      }))
      .sort((left, right) => right.score - left.score)[0];
    if (suggested && suggested.score >= 82) {
      return {
        ...line,
        productId: suggested.row.id,
        productMatchStatus: "SUGGESTED" as MatchStatus,
        productMatchSource: "PRODUCT_SUGGESTION",
        matchScore: suggested.score,
        missingFields: [],
      };
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
    if (!normalized) {
      return {
        modelId: null,
        modelMatchStatus: "MISSING" as MatchStatus,
        score: 0,
      };
    }
    const rows = await this.prisma.modelRecord.findMany({
      where: { mainCompanySlug },
    });
    const exact = rows.find(
      (row) =>
        this.normalize(row.modelName) === normalized ||
        this.normalize(row.modelCode) === normalized,
    );
    if (exact) {
      return {
        modelId: exact.id,
        modelName: exact.modelName,
        modelMatchStatus: "MATCHED" as MatchStatus,
        score: 100,
      };
    }
    const suggested = rows
      .map((row) => ({
        row,
        score: this.similarity(normalized, this.normalize(row.modelName)),
      }))
      .sort((left, right) => right.score - left.score)[0];
    if (suggested && suggested.score >= 82) {
      return {
        modelId: suggested.row.id,
        modelName: suggested.row.modelName,
        modelMatchStatus: "SUGGESTED" as MatchStatus,
        score: suggested.score,
      };
    }
    return {
      modelId: null,
      modelName: modelGuess,
      modelMatchStatus: "MISSING" as MatchStatus,
      score: 0,
    };
  }

  private suggestProductGroup(name: string) {
    const normalized = this.normalize(name);
    return /BOYA|PIGMENT|WHITE|RETARDER|FIXATOR|FIXAT|SILICONE|SILIKON|EMULSIYON|GEL|KIMYA|TINER|GAZ|SPREY|SIM/.test(
      normalized,
    )
      ? "BOYAHANE"
      : "GENEL";
  }

  private similarity(left: string, right: string) {
    if (!left || !right) return 0;
    if (left === right) return 100;
    if (left.includes(right) || right.includes(left)) return 90;
    const leftSet = new Set(left.split(" ").filter(Boolean));
    const rightSet = new Set(right.split(" ").filter(Boolean));
    const intersection = [...leftSet].filter((item) =>
      rightSet.has(item),
    ).length;
    return Math.round(
      (intersection / Math.max(leftSet.size, rightSet.size, 1)) * 100,
    );
  }
}
