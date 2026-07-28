import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type Input = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

@Injectable()
export class MuhasebeSmartMatchService {
  constructor(private readonly prisma: PrismaService) {}

  private db(): any {
    return this.prisma as any;
  }

  private slug(input: Input = {}) {
    const value = clean(
      input.mainCompanySlug || input.mainCompanyId || "mecit-hakan",
    );
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  normalize(value: unknown) {
    return clean(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(
        /\b(LTD|LIMITED|STI|SIRKETI|SAN|SANAYI|TIC|TICARET|AS|A S|VE)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  async summary(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const [
      companyAliasCount,
      productAliasCount,
      unmatchedLineCount,
      documents,
      lots,
    ] = await Promise.all([
      this.db().companyAlias.count({
        where: { mainCompanySlug, isActive: true, deletedAt: null },
      }),
      this.db().productAlias.count({
        where: { mainCompanySlug, isActive: true },
      }),
      this.db().invoiceItem.count({
        where: { mainCompanySlug, productId: null },
      }),
      this.db().document.findMany({
        where: { mainCompanySlug, deletedAt: null },
        select: {
          id: true,
          detectedType: true,
          targetType: true,
          documentType: true,
          raporKategoriId: true,
        },
        take: 3000,
      }),
      this.db().boyahaneLot.findMany({
        where: { mainCompanySlug, deletedAt: null },
        select: { id: true, remainingQuantity: true, status: true },
        take: 3000,
      }),
    ]);

    const supplierDocuments = documents.filter((row: any) =>
      this.isSupplierDocument(row),
    );

    return {
      ok: true,
      companyAliasCount,
      productAliasCount,
      unmatchedLineCount,
      uncategorizedSupplierDocumentCount: supplierDocuments.filter(
        (row: any) => !row.raporKategoriId,
      ).length,
      activeLotCount: lots.filter((row: any) => row.status !== "CLOSED").length,
      remainingLotQuantity: lots.reduce(
        (sum: number, row: any) => sum + numberValue(row.remainingQuantity),
        0,
      ),
    };
  }

  listCompanyAliases(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    return this.db().companyAlias.findMany({
      where: {
        mainCompanySlug,
        ...(input.includePassive
          ? {}
          : { isActive: true, deletedAt: null }),
        ...(input.companyId ? { companyId: clean(input.companyId) } : {}),
      },
      include: {
        company: {
          select: { id: true, name: true, taxNo: true, type: true },
        },
      },
      orderBy: [{ companyId: "asc" }, { rawName: "asc" }],
      take: Math.min(Math.max(Number(input.limit || 500), 1), 2000),
    });
  }

  async createCompanyAlias(body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const companyId = clean(body.companyId || body.firmId);
    const rawName = clean(body.rawName || body.alias || body.name);
    const normalizedName = this.normalize(rawName);
    if (!companyId || !rawName || !normalizedName) {
      throw new BadRequestException("Firma ve alias adı zorunludur.");
    }

    const company = await this.db().company.findFirst({
      where: { id: companyId, mainCompanySlug, deletedAt: null },
    });
    if (!company) throw new NotFoundException("Firma kartı bulunamadı.");

    const existing = await this.db().companyAlias.findUnique({
      where: {
        mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName },
      },
    });
    if (existing && existing.companyId !== companyId) {
      throw new BadRequestException(
        `Bu alias başka bir firmaya bağlı: ${existing.rawName}`,
      );
    }

    return this.db().companyAlias.upsert({
      where: {
        mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName },
      },
      update: {
        companyId,
        rawName,
        taxNo: clean(body.taxNo) || company.taxNo || null,
        source: clean(body.source) || "MANUAL",
        isActive: true,
        deletedAt: null,
      },
      create: {
        mainCompanySlug,
        companyId,
        rawName,
        normalizedName,
        taxNo: clean(body.taxNo) || company.taxNo || null,
        source: clean(body.source) || "MANUAL",
        isActive: true,
      },
      include: {
        company: { select: { id: true, name: true, taxNo: true } },
      },
    });
  }

  async passiveCompanyAlias(id: string, input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const result = await this.db().companyAlias.updateMany({
      where: { id: clean(id), mainCompanySlug },
      data: { isActive: false, deletedAt: new Date() },
    });
    if (!result.count) {
      throw new NotFoundException("Firma alias kaydı bulunamadı.");
    }
    return { ok: true, id };
  }

  listProductAliases(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    return this.db().productAlias.findMany({
      where: {
        mainCompanySlug,
        ...(input.includePassive ? {} : { isActive: true }),
        ...(input.productId ? { productId: clean(input.productId) } : {}),
      },
      include: {
        product: { select: { id: true, name: true, unit: true, raw: true } },
      },
      orderBy: [{ rawName: "asc" }],
      take: Math.min(Math.max(Number(input.limit || 1000), 1), 3000),
    });
  }

  async createProductAlias(body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const productId = clean(body.productId);
    const rawName = clean(body.rawName || body.alias || body.name);
    const normalizedName = this.normalize(rawName);
    if (!productId || !rawName || !normalizedName) {
      throw new BadRequestException("Ürün ve alias adı zorunludur.");
    }

    const product = await this.db().product.findFirst({
      where: { id: productId, mainCompanySlug, isActive: true },
    });
    if (!product) throw new NotFoundException("Ürün kartı bulunamadı.");

    const existing = await this.db().productAlias.findUnique({
      where: {
        mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName },
      },
    });
    if (existing && existing.productId !== productId) {
      throw new BadRequestException(
        `Bu ürün aliası başka bir ürüne bağlı: ${existing.rawName}`,
      );
    }

    const nextRaw = {
      ...objectValue(existing?.raw),
      supplierFirmId: clean(body.supplierFirmId) || null,
      sellerItemId: clean(body.sellerItemId) || null,
      manufacturerItemId: clean(body.manufacturerItemId) || null,
      standardItemId: clean(body.standardItemId) || null,
      source: clean(body.source) || "MANUAL",
    };

    return this.db().productAlias.upsert({
      where: {
        mainCompanySlug_normalizedName: { mainCompanySlug, normalizedName },
      },
      update: {
        productId,
        rawName,
        packageInfo: clean(body.packageInfo) || null,
        isActive: true,
        raw: nextRaw,
      },
      create: {
        mainCompanySlug,
        productId,
        rawName,
        normalizedName,
        packageInfo: clean(body.packageInfo) || null,
        isActive: true,
        raw: nextRaw,
      },
      include: {
        product: { select: { id: true, name: true, unit: true } },
      },
    });
  }

  async passiveProductAlias(id: string, input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const result = await this.db().productAlias.updateMany({
      where: { id: clean(id), mainCompanySlug },
      data: { isActive: false },
    });
    if (!result.count) {
      throw new NotFoundException("Ürün alias kaydı bulunamadı.");
    }
    return { ok: true, id };
  }

  async pendingProductLines(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const rows = await this.db().invoiceItem.findMany({
      where: { mainCompanySlug, productId: null },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(Number(input.limit || 250), 1), 1000),
    });
    const documentIds = [
      ...new Set(rows.map((row: any) => row.documentId).filter(Boolean)),
    ];
    const documents = documentIds.length
      ? await this.db().document.findMany({
          where: { mainCompanySlug, id: { in: documentIds } },
          select: {
            id: true,
            documentNo: true,
            companyId: true,
            date: true,
            detectedType: true,
            targetType: true,
          },
        })
      : [];
    const documentMap = new Map(
      documents.map((row: any) => [row.id, row]),
    );
    return rows.map((row: any) => ({
      ...row,
      document: documentMap.get(row.documentId) || null,
    }));
  }

  async assignProductLine(lineId: string, body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const productId = clean(body.productId);
    if (!productId) {
      throw new BadRequestException("Ürün seçimi zorunludur.");
    }

    const [line, product] = await Promise.all([
      this.db().invoiceItem.findFirst({
        where: { id: clean(lineId), mainCompanySlug },
      }),
      this.db().product.findFirst({
        where: { id: productId, mainCompanySlug, isActive: true },
      }),
    ]);
    if (!line) throw new NotFoundException("Fatura kalemi bulunamadı.");
    if (!product) throw new NotFoundException("Ürün kartı bulunamadı.");

    const aliasName = clean(line.productName || line.description);
    if (aliasName) {
      await this.createProductAlias({
        ...body,
        mainCompanySlug,
        productId,
        rawName: aliasName,
        source: "INVOICE_LINE_APPROVAL",
      });
    }

    const raw = objectValue(line.raw);
    return this.db().invoiceItem.update({
      where: { id: line.id },
      data: {
        productId,
        raw: {
          ...raw,
          productMatchStatus: "MATCHED",
          productMatchedAt: new Date().toISOString(),
          productMatchedBy: clean(body.approvedBy) || "USER",
        },
      },
    });
  }

  async setProductRule(productIdValue: string, body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const productId = clean(productIdValue);
    const product = await this.db().product.findFirst({
      where: { id: productId, mainCompanySlug, isActive: true },
    });
    if (!product) throw new NotFoundException("Ürün kartı bulunamadı.");

    const raw = objectValue(product.raw);
    const routingType = clean(
      body.routingType || raw.routingType || "EXPENSE",
    ).toUpperCase();
    if (!["EXPENSE", "STOCK", "BOYAHANE"].includes(routingType)) {
      throw new BadRequestException(
        "Yönlendirme tipi EXPENSE, STOCK veya BOYAHANE olmalıdır.",
      );
    }

    return this.db().product.update({
      where: { id: product.id },
      data: {
        raw: {
          ...raw,
          routingType,
          productGroup:
            clean(body.productGroup || raw.productGroup) ||
            (routingType === "BOYAHANE" ? "BOYAHANE" : "GENEL"),
          expenseCategoryId: clean(body.expenseCategoryId) || null,
          expenseCategoryName: clean(body.expenseCategoryName) || null,
          requiresLot:
            body.requiresLot === undefined
              ? routingType === "BOYAHANE"
              : body.requiresLot === true,
          ruleUpdatedAt: new Date().toISOString(),
          ruleUpdatedBy: clean(body.updatedBy) || "USER",
        },
      },
    });
  }

  private isSupplierDocument(row: any) {
    return [row?.detectedType, row?.targetType, row?.documentType]
      .map((value) => String(value || "").toUpperCase())
      .some((value) =>
        ["SUPPLIER_INVOICE", "GELEN_FATURA", "ALIS_FATURA"].some(
          (token) => value.includes(token),
        ),
      );
  }

  private isChemicalProduct(product: any, item: any) {
    const raw = objectValue(product?.raw);
    const routingType = clean(raw.routingType).toUpperCase();
    const productGroup = clean(raw.productGroup).toUpperCase();
    if (routingType === "BOYAHANE" || productGroup === "BOYAHANE") {
      return true;
    }
    const normalized = this.normalize(
      [product?.name, item?.productName, item?.description]
        .filter(Boolean)
        .join(" "),
    );
    return /BOYA|PIGMENT|KIMYA|WHITE|RETARDER|FIXATOR|FIXAT|SILIKON|SILICONE|EMULSIYON|TINER|GAZ|SPREY|SIM/.test(
      normalized,
    );
  }

  async synchronizeSupplierRouting(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const documents = await this.db().document.findMany({
      where: { mainCompanySlug, deletedAt: null },
      select: {
        id: true,
        documentNo: true,
        companyId: true,
        date: true,
        detectedType: true,
        targetType: true,
        documentType: true,
        raporKategoriId: true,
      },
      take: 3000,
      orderBy: { date: "desc" },
    });
    const supplierDocuments = documents.filter((row: any) =>
      this.isSupplierDocument(row),
    );
    const documentIds = supplierDocuments.map((row: any) => row.id);
    if (!documentIds.length) {
      return {
        ok: true,
        documents: 0,
        lines: 0,
        stockMovementsCreated: 0,
        lotsCreated: 0,
        lotsLinked: 0,
        pendingProduct: 0,
        pendingLot: 0,
      };
    }

    const items = await this.db().invoiceItem.findMany({
      where: { mainCompanySlug, documentId: { in: documentIds } },
      orderBy: [{ documentId: "asc" }, { lineNo: "asc" }],
      take: 10000,
    });
    const productIds = [
      ...new Set(items.map((row: any) => row.productId).filter(Boolean)),
    ];
    const products = productIds.length
      ? await this.db().product.findMany({
          where: { mainCompanySlug, id: { in: productIds } },
        })
      : [];
    const productMap = new Map(products.map((row: any) => [row.id, row]));
    const documentMap = new Map(
      supplierDocuments.map((row: any) => [row.id, row]),
    );
    const categoriesByDocument = new Map<string, Set<string>>();

    let stockMovementsCreated = 0;
    let lotsCreated = 0;
    let lotsLinked = 0;
    let pendingProduct = 0;
    let pendingLot = 0;

    for (const item of items) {
      const document = documentMap.get(item.documentId);
      const product = item.productId ? productMap.get(item.productId) : null;
      if (!product) {
        pendingProduct += 1;
        continue;
      }

      const productRaw = objectValue(product.raw);
      const itemRaw = objectValue(item.raw);
      const routingType = clean(
        productRaw.routingType || "EXPENSE",
      ).toUpperCase();
      const expenseCategoryId = clean(productRaw.expenseCategoryId);
      const effectiveRouting = this.isChemicalProduct(product, item)
        ? "BOYAHANE"
        : routingType;

      if (expenseCategoryId) {
        const categorySet =
          categoriesByDocument.get(item.documentId) || new Set<string>();
        categorySet.add(expenseCategoryId);
        categoriesByDocument.set(item.documentId, categorySet);
      }

      await this.db().invoiceItem.update({
        where: { id: item.id },
        data: {
          raw: {
            ...itemRaw,
            routingType: effectiveRouting,
            expenseCategoryId: expenseCategoryId || null,
            expenseCategoryName:
              clean(productRaw.expenseCategoryName) || null,
            routingUpdatedAt: new Date().toISOString(),
          },
        },
      });

      if (!["STOCK", "BOYAHANE"].includes(effectiveRouting)) continue;

      const existingMovement = await this.db().stockMovement.findFirst({
        where: {
          mainCompanySlug,
          documentLineId: item.id,
          movementType: "PURCHASE_IN",
          active: true,
        },
      });
      if (!existingMovement) {
        await this.db().stockMovement.create({
          data: {
            mainCompanySlug,
            productId: product.id,
            firmId: document?.companyId || null,
            documentId: item.documentId,
            documentLineId: item.id,
            movementType: "PURCHASE_IN",
            sourceType: "SUPPLIER_INVOICE",
            date: document?.date || new Date(),
            quantity: numberValue(item.quantity),
            unit: clean(item.unit) || product.unit || null,
            unitPrice: numberValue(item.unitPrice),
            totalAmount: numberValue(item.lineTotal),
            lotNo: clean(item.lotNo) || null,
            note: `${document?.documentNo || "Tedarikçi faturası"} stok girişi`,
            raw: {
              invoiceItemId: item.id,
              routingType: effectiveRouting,
              supplierDocumentNo: document?.documentNo || "",
            },
          },
        });
        stockMovementsCreated += 1;
      }

      if (effectiveRouting !== "BOYAHANE") continue;
      const lotNo = clean(item.lotNo || itemRaw.lotNo);
      if (!lotNo) {
        pendingLot += 1;
        continue;
      }

      const existingLot = await this.db().boyahaneLot.findUnique({
        where: { mainCompanySlug_lotNo: { mainCompanySlug, lotNo } },
      });
      if (existingLot) {
        const existingRaw = objectValue(existingLot.raw);
        if (
          existingLot.invoiceItemId &&
          existingLot.invoiceItemId !== item.id
        ) {
          throw new BadRequestException(
            `Lot ${lotNo} başka bir fatura kalemine bağlı. Mükerrer lot kontrolü gerekiyor.`,
          );
        }
        await this.db().boyahaneLot.update({
          where: { id: existingLot.id },
          data: {
            productId: product.id,
            supplierCompanyId: document?.companyId || null,
            invoiceItemId: existingLot.invoiceItemId || item.id,
            deletedAt: null,
            raw: {
              ...existingRaw,
              source: "SUPPLIER_INVOICE_ROUTING",
              documentId: item.documentId,
              documentNo: document?.documentNo || "",
              invoiceItemId: item.id,
              lastVerifiedAt: new Date().toISOString(),
            },
          },
        });
        lotsLinked += 1;
        continue;
      }

      await this.db().boyahaneLot.create({
        data: {
          mainCompanySlug,
          productId: product.id,
          supplierCompanyId: document?.companyId || null,
          invoiceItemId: item.id,
          lotNo,
          quantity: numberValue(item.quantity),
          remainingQuantity: numberValue(item.quantity),
          status: "ACTIVE",
          raw: {
            source: "SUPPLIER_INVOICE_ROUTING",
            documentId: item.documentId,
            documentNo: document?.documentNo || "",
            invoiceItemId: item.id,
          },
        },
      });
      lotsCreated += 1;
    }

    for (const [documentId, categorySet] of categoriesByDocument.entries()) {
      if (categorySet.size !== 1) continue;
      const [raporKategoriId] = [...categorySet];
      await this.db().document.updateMany({
        where: { id: documentId, mainCompanySlug, raporKategoriId: null },
        data: { raporKategoriId, kategoriKaynagi: "URUN_KURALI" },
      });
    }

    return {
      ok: true,
      documents: supplierDocuments.length,
      lines: items.length,
      stockMovementsCreated,
      lotsCreated,
      lotsLinked,
      pendingProduct,
      pendingLot,
    };
  }

  async lotStock(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const rows = await this.db().boyahaneLot.findMany({
      where: {
        mainCompanySlug,
        deletedAt: null,
        ...(input.status ? { status: clean(input.status) } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(Number(input.limit || 500), 1), 2000),
    });
    const productIds = [
      ...new Set(rows.map((row: any) => row.productId).filter(Boolean)),
    ];
    const companyIds = [
      ...new Set(
        rows.map((row: any) => row.supplierCompanyId).filter(Boolean),
      ),
    ];
    const [products, companies] = await Promise.all([
      productIds.length
        ? this.db().product.findMany({
            where: { mainCompanySlug, id: { in: productIds } },
            select: { id: true, name: true, unit: true },
          })
        : [],
      companyIds.length
        ? this.db().company.findMany({
            where: { mainCompanySlug, id: { in: companyIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const productMap = new Map(products.map((row: any) => [row.id, row]));
    const companyMap = new Map(companies.map((row: any) => [row.id, row]));
    return rows.map((row: any) => ({
      ...row,
      product: productMap.get(row.productId) || null,
      supplier: companyMap.get(row.supplierCompanyId) || null,
    }));
  }
}
