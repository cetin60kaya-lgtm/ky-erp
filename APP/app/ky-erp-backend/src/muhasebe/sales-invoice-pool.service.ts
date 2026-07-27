import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import AdmZip from "adm-zip";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ModelService } from "../modules/models/model.service";
import { PrismaService } from "../prisma/prisma.service";
import { getStorageRoot } from "../storage/storage-path.util";
import { DocumentParserService } from "./document-intake/document-parser.service";

type Query = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimal(value: unknown) {
  return new Prisma.Decimal(num(value));
}

function normalize(value: unknown) {
  return clean(value)
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function companyMatchKey(value: unknown) {
  return normalize(value)
    .replace(/\b(ANONIM|LIMITED|SIRKETI|SIRKET|A S|LTD STI|LTD|STI)\b/g, " ")
    .replace(/\b(SANAYI|SAN|TICARET|TIC)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fixMojibake(value: unknown) {
  const raw = clean(value);
  if (!/[\u00c4\u00c3\u00c5\u00c2\u00b0]/.test(raw)) return raw;
  try {
    return Buffer.from(raw, "latin1").toString("utf8");
  } catch {
    return raw;
  }
}

function dateValue(value: unknown) {
  const raw = clean(value);
  const normalized = /^\d{2}[./-]\d{2}[./-]\d{4}$/.test(raw)
    ? raw.replace(/^(\d{2})[./-](\d{2})[./-](\d{4})$/, "$3-$2-$1")
    : raw.slice(0, 10);
  const parsed = new Date(`${normalized || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException("Fatura tarihi geçersiz.");
  }
  return parsed;
}

@Injectable()
export class SalesInvoicePoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: DocumentParserService,
    private readonly modelService: ModelService,
  ) {}

  private slug(query: Query) {
    return clean(query.mainCompanySlug || query.mainCompanyId || "mecit-hakan");
  }

  private raw(value: any) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  private fileUrl(invoiceId: string, fileId: string) {
    return `/api/muhasebe/kesilen-faturalar/${encodeURIComponent(invoiceId)}/dosya/${encodeURIComponent(fileId)}`;
  }

  private async ensureSalesInvoiceTables() {
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS sales_invoice_states (
        id TEXT NOT NULL PRIMARY KEY,
        main_company_slug TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        invoice_no TEXT NOT NULL,
        invoice_date DATETIME NOT NULL,
        document_type TEXT NOT NULL DEFAULT 'SATIS_FATURA',
        source_kind TEXT NOT NULL DEFAULT 'MANUAL',
        cari_status TEXT NOT NULL DEFAULT 'CARI_PENDING',
        model_status TEXT NOT NULL DEFAULT 'MODEL_PENDING',
        cari_movement_id TEXT,
        dispatch_no TEXT,
        order_no TEXT,
        note TEXT,
        parser_confidence DECIMAL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_states_invoice_id_key
      ON sales_invoice_states (invoice_id)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_states_main_company_slug_company_id_invoice_no_invoice_date_document_type_key
      ON sales_invoice_states (main_company_slug, company_id, invoice_no, invoice_date, document_type)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS sales_invoice_states_main_company_slug_invoice_date_idx
      ON sales_invoice_states (main_company_slug, invoice_date)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS sales_invoice_states_main_company_slug_cari_status_idx
      ON sales_invoice_states (main_company_slug, cari_status)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS sales_invoice_states_main_company_slug_model_status_idx
      ON sales_invoice_states (main_company_slug, model_status)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS sales_invoice_line_model_links (
        id TEXT NOT NULL PRIMARY KEY,
        main_company_slug TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        invoice_line_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        print_region_id TEXT,
        print_region_name TEXT,
        matched_quantity DECIMAL NOT NULL DEFAULT 0,
        note TEXT,
        created_by TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS sales_invoice_line_model_links_invoice_line_id_model_id_print_region_id_key
      ON sales_invoice_line_model_links (invoice_line_id, model_id, print_region_id)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS sales_invoice_line_model_links_main_company_slug_invoice_id_idx
      ON sales_invoice_line_model_links (main_company_slug, invoice_id)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS sales_invoice_line_model_links_invoice_line_id_idx
      ON sales_invoice_line_model_links (invoice_line_id)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS sales_invoice_line_model_links_model_id_idx
      ON sales_invoice_line_model_links (model_id)
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS sales_invoice_history (
        id TEXT NOT NULL PRIMARY KEY,
        main_company_slug TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        action TEXT NOT NULL,
        message TEXT NOT NULL,
        detail JSONB,
        created_by TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await (this.prisma as any).$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS sales_invoice_history_main_company_slug_invoice_id_created_at_idx
      ON sales_invoice_history (main_company_slug, invoice_id, created_at)
    `);
  }

  private async findOrCreateCustomer(slug: string, parsed: any) {
    const taxNo = clean(parsed.receiverTaxNo);
    const name = clean(parsed.receiverName);
    if (!taxNo && !name) {
      throw new BadRequestException("Firma bulunamadı. Alıcı ünvanı veya vergi no okunamadı.");
    }
    let company = taxNo
      ? await this.prisma.company.findFirst({
          where: { mainCompanySlug: slug, taxNo, deletedAt: null },
        })
      : null;
    if (!company && name) {
      const target = normalize(name);
      const targetMatchKey = companyMatchKey(name);
      const rows = await this.prisma.company.findMany({
        where: { mainCompanySlug: slug, deletedAt: null },
        take: 1000,
      });
      company =
        rows.find((row) => normalize(row.name) === target) ||
        rows.find(
          (row) =>
            targetMatchKey.length >= 5 &&
            companyMatchKey(row.name) === targetMatchKey &&
            (!row.taxNo || !taxNo || clean(row.taxNo) === taxNo),
        ) ||
        null;
      if (company && taxNo && !clean(company.taxNo)) {
        company = await this.prisma.company.update({
          where: { id: company.id },
          data: { taxNo },
        });
      }
    }
    if (company) return company;
    if (taxNo) {
      const deletedTaxMatch = await this.prisma.company.findFirst({
        where: { mainCompanySlug: slug, taxNo, deletedAt: { not: null } },
        orderBy: { updatedAt: "desc" },
      });
      if (deletedTaxMatch) {
        return this.prisma.company.update({
          where: { id: deletedTaxMatch.id },
          data: {
            deletedAt: null,
            deletedBy: null,
            deleteReason: null,
            isActive: true,
            name: name || deletedTaxMatch.name,
          },
        });
      }
    }
    const normalizedName =
      normalize(name).toLocaleLowerCase("tr-TR").replace(/\s+/g, "-") ||
      `musteri-${taxNo}`;
    return this.prisma.company.create({
      data: {
        mainCompanySlug: slug,
        name: name || taxNo,
        normalizedName,
        type: "MUSTERI",
        taxNo: taxNo || null,
        source: "SALES_INVOICE_IMPORT",
        raw: { source: "SALES_INVOICE_IMPORT", parsedCustomer: true },
      },
    });
  }

  private async history(
    slug: string,
    invoiceId: string,
    action: string,
    message: string,
    detail?: any,
  ) {
    return (this.prisma as any).salesInvoiceHistory.create({
      data: {
        mainCompanySlug: slug,
        invoiceId,
        action,
        message,
        detail: detail || undefined,
      },
    });
  }

  private async computeModelStatus(invoiceId: string) {
    const lines = await this.prisma.invoiceItem.findMany({
      where: { documentId: invoiceId },
    });
    const links = await (this.prisma as any).salesInvoiceLineModelLink.findMany({
      where: { invoiceId },
    });
    if (!lines.length) return "MODEL_REVIEW_REQUIRED";
    let productionCount = 0;
    let completeCount = 0;
    let partialCount = 0;
    let review = false;
    for (const line of lines) {
      const raw = this.raw(line.raw);
      if (raw.modelOutside === true) continue;
      productionCount += 1;
      const matched = links
        .filter((link: any) => link.invoiceLineId === line.id)
        .reduce((sum: number, link: any) => sum + num(link.matchedQuantity), 0);
      const quantity = num(line.quantity);
      if (matched > quantity + 0.0001) review = true;
      else if (matched >= quantity && quantity > 0) completeCount += 1;
      else if (matched > 0) partialCount += 1;
    }
    if (review) return "MODEL_REVIEW_REQUIRED";
    if (!productionCount) return "MODEL_NOT_REQUIRED";
    if (completeCount === productionCount) return "MODEL_COMPLETE";
    if (completeCount || partialCount) return "MODEL_PARTIAL";
    return "MODEL_PENDING";
  }

  private async refreshModelStatus(invoiceId: string) {
    const modelStatus = await this.computeModelStatus(invoiceId);
    await (this.prisma as any).salesInvoiceState.update({
      where: { invoiceId },
      data: { modelStatus },
    });
    return modelStatus;
  }

  private async syncExistingSalesInvoices(slug: string) {
    const documents = await this.prisma.document.findMany({
      where: {
        mainCompanySlug: slug,
        deletedAt: null,
        companyId: { not: null },
        documentNo: { not: null },
      },
      select: {
        id: true,
        companyId: true,
        documentNo: true,
        documentType: true,
        sourceType: true,
        date: true,
        createdAt: true,
        raw: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const salesDocuments = documents.filter((document) => {
      const type = normalize(document.documentType).replace(/\s+/g, "_");
      return [
        "SATIS_FATURA",
        "BIZIM_FATURA",
        "BIZIM_KESTIGIMIZ_FATURA",
        "GIDEN_FATURA",
      ].includes(type);
    });
    if (!salesDocuments.length) return;
    const existingStates = await (this.prisma as any).salesInvoiceState.findMany({
      where: {
        mainCompanySlug: slug,
        invoiceId: { in: salesDocuments.map((document) => document.id) },
      },
      select: { invoiceId: true },
    });
    const stateIds = new Set(existingStates.map((state: any) => state.invoiceId));
    const existingLineRows = await this.prisma.invoiceItem.findMany({
      where: {
        mainCompanySlug: slug,
        documentId: { in: salesDocuments.map((document) => document.id) },
      },
      select: { documentId: true },
    });
    const lineDocumentIds = new Set(existingLineRows.map((line) => line.documentId));
    for (const document of salesDocuments.filter(
      (item) => !stateIds.has(item.id) || !lineDocumentIds.has(item.id),
    )) {
      const needsState = !stateIds.has(document.id);
      const needsLines = !lineDocumentIds.has(document.id);
      const movement = needsState
        ? await this.prisma.currentAccountMovement.findFirst({
            where: {
              mainCompanySlug: slug,
              companyId: document.companyId!,
              OR: [
                { documentId: document.id },
                { documentNo: document.documentNo },
              ],
              movementType: "SATIS_FATURA",
            },
            orderBy: { createdAt: "asc" },
          })
        : null;
      const raw = this.raw(document.raw);
      const rawLines = Array.isArray(raw.kalemler)
        ? raw.kalemler
        : Array.isArray(raw.lines)
          ? raw.lines
          : [];
      if (needsLines && rawLines.length) {
        await this.prisma.invoiceItem.createMany({
          data: rawLines.map((line: any, index: number) => {
            const unitPrice = num(line.unitPrice);
            const lineTotal = num(line.lineTotal || line.subtotal || line.total);
            const rawQuantity = num(line.quantity);
            const derivedQuantity =
              unitPrice > 0 && lineTotal > 0 ? lineTotal / unitPrice : 0;
            const quantity =
              derivedQuantity > 0 &&
              rawQuantity > 0 &&
              rawQuantity / derivedQuantity >= 10
                ? derivedQuantity
                : rawQuantity || derivedQuantity;
            return {
              mainCompanySlug: slug,
              documentId: document.id,
              lineNo: Number(line.lineNo || index + 1),
              productName: clean(
                line.productName || line.description || line.rawDescription,
              ),
              normalizedProductName: normalize(
                line.productName || line.description || line.rawDescription,
              ),
              description: clean(
                line.rawDescription || line.description || line.productName,
              ),
              quantity: decimal(quantity),
              unit: clean(line.unit || "Adet"),
              unitPrice: decimal(unitPrice),
              vatRate: decimal(line.vatRate),
              vatAmount: decimal(line.vatAmount),
              lineTotal: decimal(lineTotal),
              lotNo: clean(line.lotNo) || null,
              raw: {
                ...line,
                originalQuantity: rawQuantity,
                quantityCorrectedFromLineTotal: quantity !== rawQuantity,
                lineType: "MODEL",
                modelOutside: false,
              },
            };
          }),
        });
      }
      try {
        if (needsState) {
          await (this.prisma as any).salesInvoiceState.create({
            data: {
              mainCompanySlug: slug,
              invoiceId: document.id,
              companyId: document.companyId,
              invoiceNo: document.documentNo,
              invoiceDate: document.date || document.createdAt,
              documentType: "SATIS_FATURA",
              sourceKind: clean(document.sourceType || "LEGACY").toLocaleUpperCase("tr-TR"),
              cariStatus: movement ? "CARI_PROCESSED" : "CARI_PENDING",
              cariMovementId: movement?.id || null,
              modelStatus: "MODEL_PENDING",
              dispatchNo: clean(raw.dispatchNo || raw.irsaliyeNo) || null,
              orderNo: clean(raw.orderNo || raw.siparisNo) || null,
            },
          });
        }
        const modelStatus = await this.computeModelStatus(document.id);
        await (this.prisma as any).salesInvoiceState.update({
          where: { invoiceId: document.id },
          data: { modelStatus },
        });
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
      }
    }
  }

  private async mapInvoice(row: any, includeDetail = false) {
    const state = row.salesState;
    const lines = includeDetail ? row.lines || [] : [];
    const links = includeDetail ? row.links || [] : [];
    const mappedLines = lines.map((line: any) => {
      const lineLinks = links.filter((link: any) => link.invoiceLineId === line.id);
      const matchedQuantity = lineLinks.reduce(
        (sum: number, link: any) => sum + num(link.matchedQuantity),
        0,
      );
      const quantity = num(line.quantity);
      const raw = this.raw(line.raw);
      return {
        id: line.id,
        lineNo: line.lineNo,
        description: line.description || line.productName || "",
        quantity,
        unit: line.unit || "Adet",
        unitPrice: num(line.unitPrice),
        vatRate: num(line.vatRate),
        vatAmount: num(line.vatAmount),
        lineTotal: num(line.lineTotal),
        modelOutside: raw.modelOutside === true,
        lineType: raw.lineType || "MODEL",
        matchedQuantity,
        remainingQuantity: Math.max(0, quantity - matchedQuantity),
        links: lineLinks.map((link: any) => ({
          ...link,
          matchedQuantity: num(link.matchedQuantity),
        })),
      };
    });
    const pendingLineCount = mappedLines.filter(
      (line: any) => !line.modelOutside && line.remainingQuantity > 0,
    ).length;
    return {
      id: row.id,
      invoiceNo: state?.invoiceNo || row.documentNo || "",
      invoiceDate: state?.invoiceDate
        ? new Date(state.invoiceDate).toISOString()
        : row.date
          ? new Date(row.date).toISOString()
          : null,
      companyId: state?.companyId || row.companyId,
      companyName: row.company?.name || "",
      companyTaxNo: row.company?.taxNo || "",
      companyTaxOffice: row.company?.taxOffice || "",
      documentType: state?.documentType || row.documentType,
      sourceKind: state?.sourceKind || row.sourceType,
      cariStatus: state?.cariStatus || "CARI_PENDING",
      modelStatus: state?.modelStatus || "MODEL_PENDING",
      dispatchNo: state?.dispatchNo || "",
      orderNo: state?.orderNo || "",
      subtotal: num(row.subtotal),
      vatTotal: num(row.vatTotal),
      grandTotal: num(row.grandTotal),
      status: row.status,
      pendingLineCount,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      lines: mappedLines,
      files: includeDetail
        ? (row.files || []).map((file: any) => ({
            id: file.id,
            fileName: file.fileName,
            mimeType: file.mimeType,
            role: file.role,
            url: this.fileUrl(row.id, file.id),
          }))
        : undefined,
      history: includeDetail ? row.history || [] : undefined,
      raw: includeDetail ? this.raw(row.raw) : undefined,
    };
  }

  async list(query: Query = {}) {
    const slug = this.slug(query);
    await this.ensureSalesInvoiceTables();
    await this.syncExistingSalesInvoices(slug);
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));
    const states = await (this.prisma as any).salesInvoiceState.findMany({
      where: {
        mainCompanySlug: slug,
        ...(query.companyId ? { companyId: clean(query.companyId) } : {}),
        ...(query.cariStatus ? { cariStatus: clean(query.cariStatus) } : {}),
        ...(query.modelStatus ? { modelStatus: clean(query.modelStatus) } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              invoiceDate: {
                ...(query.dateFrom ? { gte: dateValue(query.dateFrom) } : {}),
                ...(query.dateTo
                  ? {
                      lte: new Date(
                        `${clean(query.dateTo).slice(0, 10)}T23:59:59.999Z`,
                      ),
                    }
                  : {}),
              },
            }
          : {}),
      },
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    });
    const documentIds = states.map((state: any) => state.invoiceId);
    const documents = documentIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: documentIds }, deletedAt: null },
          include: { company: true },
        })
      : [];
    const stateByInvoice = new Map(states.map((state: any) => [state.invoiceId, state]));
    const stateOrder = new Map(
      states.map((state: any, index: number) => [state.invoiceId, index]),
    );
    const lines = documentIds.length
      ? await this.prisma.invoiceItem.findMany({
          where: { documentId: { in: documentIds } },
        })
      : [];
    const links = documentIds.length
      ? await (this.prisma as any).salesInvoiceLineModelLink.findMany({
          where: { invoiceId: { in: documentIds }, mainCompanySlug: slug },
        })
      : [];
    const search = normalize(query.search);
    const filtered = documents
      .map((document) => ({
        ...document,
        salesState: stateByInvoice.get(document.id),
      }))
      .sort(
        (left, right) =>
          Number(stateOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          Number(stateOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .filter((document) => {
        if (!search) return true;
        const lineText = lines
          .filter((line) => line.documentId === document.id)
          .map((line) => `${line.description || ""} ${line.productName || ""}`)
          .join(" ");
        return normalize(
          `${document.documentNo || ""} ${document.company?.name || ""} ${lineText}`,
        ).includes(search);
      });
    const pageRows = filtered.slice((page - 1) * limit, page * limit);
    const items = await Promise.all(
      pageRows.map(async (row) => {
        const mapped = await this.mapInvoice(
          {
            ...row,
            lines: lines.filter((line) => line.documentId === row.id),
            links: links.filter((link: any) => link.invoiceId === row.id),
            files: [],
            history: [],
          },
          true,
        );
        return {
          ...mapped,
          lines: undefined,
          files: undefined,
          history: undefined,
          raw: undefined,
        };
      }),
    );
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthRows = filtered.filter(
      (row: any) => new Date(row.salesState.invoiceDate) >= monthStart,
    );
    return {
      items,
      total: filtered.length,
      page,
      limit,
      summary: {
        monthInvoiceCount: monthRows.length,
        cariProcessedCount: filtered.filter(
          (row: any) => row.salesState.cariStatus === "CARI_PROCESSED",
        ).length,
        modelPendingCount: filtered.filter((row: any) =>
          ["MODEL_PENDING", "MODEL_PARTIAL"].includes(row.salesState.modelStatus),
        ).length,
        partialCount: filtered.filter(
          (row: any) => row.salesState.modelStatus === "MODEL_PARTIAL",
        ).length,
        reviewCount: filtered.filter((row: any) =>
          ["MODEL_REVIEW_REQUIRED"].includes(row.salesState.modelStatus),
        ).length,
        grandTotal: filtered.reduce((sum, row) => sum + num(row.grandTotal), 0),
      },
    };
  }

  async detail(slugValue: string, invoiceId: string) {
    const slug = this.slug({ mainCompanySlug: slugValue });
    await this.ensureSalesInvoiceTables();
    const state = await (this.prisma as any).salesInvoiceState.findFirst({
      where: { invoiceId, mainCompanySlug: slug },
    });
    if (!state) throw new NotFoundException("Kesilen fatura bulunamadı.");
    const [document, lines, links, history] = await Promise.all([
      this.prisma.document.findFirst({
        where: { id: invoiceId, mainCompanySlug: slug, deletedAt: null },
        include: { company: true, files: true },
      }),
      this.prisma.invoiceItem.findMany({
        where: { documentId: invoiceId, mainCompanySlug: slug },
        orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
      }),
      (this.prisma as any).salesInvoiceLineModelLink.findMany({
        where: { invoiceId, mainCompanySlug: slug },
        orderBy: { createdAt: "asc" },
      }),
      (this.prisma as any).salesInvoiceHistory.findMany({
        where: { invoiceId, mainCompanySlug: slug },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!document) throw new NotFoundException("Fatura belgesi bulunamadı.");
    const modelIds: string[] = [
      ...new Set<string>(
        links.map((link: any) => clean(link.modelId)).filter(Boolean),
      ),
    ];
    const modelRows = modelIds.length
      ? await this.prisma.modelRecord.findMany({
          where: { id: { in: modelIds }, mainCompanySlug: slug },
          select: { id: true, modelName: true },
        })
      : [];
    const modelNameById = new Map(
      modelRows.map((model) => [model.id, model.modelName]),
    );
    return this.mapInvoice({
      ...document,
      salesState: state,
      lines,
      links: links.map((link: any) => ({
        ...link,
        modelName: modelNameById.get(link.modelId) || link.modelId,
      })),
      history,
    }, true);
  }

  private async saveParsedInvoice(
    slug: string,
    parsed: any,
    attachments: Array<{
      filePath: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
      role: string;
    }>,
  ) {
    const invoiceNo = clean(parsed.invoiceNo || parsed.documentNo);
    if (!invoiceNo) throw new BadRequestException("Fatura no yok.");
    if (!Array.isArray(parsed.lines) || !parsed.lines.length) {
      throw new BadRequestException(`${invoiceNo}: Fatura kalemi okunamadı.`);
    }
    const company = await this.findOrCreateCustomer(slug, parsed);
    const invoiceDate = dateValue(parsed.issueDate);
    const duplicate = await (this.prisma as any).salesInvoiceState.findFirst({
      where: {
        mainCompanySlug: slug,
        companyId: company.id,
        invoiceNo,
        invoiceDate,
        documentType: "SATIS_FATURA",
      },
    });
    if (duplicate) {
      await this.history(
        slug,
        duplicate.invoiceId,
        "DUPLICATE_UPLOAD",
        "Bu fatura daha önce işlenmiş. Mevcut kayda yönlendirildi.",
      );
      return {
        duplicate: true,
        message: "Bu fatura daha önce işlenmiş. Mevcut kayda yönlendirildi.",
        invoice: await this.detail(slug, duplicate.invoiceId),
      };
    }
    const sourceKind = clean(parsed.sourceType || "MANUAL").toLocaleUpperCase("tr-TR");
    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          mainCompanySlug: slug,
          companyId: company.id,
          documentNo: invoiceNo,
          documentType: "SATIS_FATURA",
          sourceType: "SALES_INVOICE_IMPORT",
          date: invoiceDate,
          subtotal: decimal(parsed.subtotal),
          vatTotal: decimal(parsed.vatTotal),
          grandTotal: decimal(parsed.grandTotal),
          status: sourceKind === "XML" ? "APPROVED" : "KONTROL_BEKLIYOR",
          confidence: sourceKind === "XML" ? decimal(1) : decimal(0.65),
          raw: {
            sourceKind,
            issuerName: parsed.issuerName,
            issuerTaxNo: parsed.issuerTaxNo,
            receiverName: parsed.receiverName,
            receiverTaxNo: parsed.receiverTaxNo,
            currency: parsed.currency || "TRY",
            scenario: parsed.scenario,
            rawText: parsed.rawText,
            parseRawJson: parsed.parseRawJson,
          },
        },
      });
      await tx.invoiceItem.createMany({
        data: parsed.lines.map((line: any, index: number) => ({
          mainCompanySlug: slug,
          documentId: created.id,
          lineNo: Number(line.lineNo || index + 1),
          productName: clean(line.rawName || line.description),
          normalizedProductName: normalize(line.rawName || line.description),
          description: clean(line.description || line.rawName),
          quantity: decimal(line.quantity),
          unit: clean(line.unit || "Adet"),
          unitPrice: decimal(line.unitPrice),
          vatRate: decimal(line.vatRate),
          vatAmount: decimal(line.vatAmount),
          lineTotal: decimal(line.subtotal || line.total),
          raw: {
            lineType: "MODEL",
            modelOutside: false,
            sourceLineId: line.lineId,
            sellerItemId: line.sellerItemId,
            manufacturerItemId: line.manufacturerItemId,
          },
        })),
      });
      await (tx as any).salesInvoiceState.create({
        data: {
          mainCompanySlug: slug,
          invoiceId: created.id,
          companyId: company.id,
          invoiceNo,
          invoiceDate,
          documentType: "SATIS_FATURA",
          sourceKind,
          cariStatus: sourceKind === "XML" ? "CARI_PENDING" : "CARI_MANUAL_REVIEW",
          modelStatus: "MODEL_PENDING",
          dispatchNo: clean(parsed.dispatchNo) || null,
          orderNo: clean(parsed.orderNo) || null,
          parserConfidence: sourceKind === "XML" ? decimal(1) : decimal(0.65),
        },
      });
      if (attachments.length) {
        await tx.documentFile.createMany({
          data: attachments.map((file) => ({
            mainCompanySlug: slug,
            documentId: created.id,
            ...file,
          })),
        });
      }
      return created;
    });
    await this.history(
      slug,
      document.id,
      "IMPORTED",
      sourceKind === "XML"
        ? "XML ana veri kaynağı olarak fatura içe aktarıldı."
        : "PDF okundu; cari işlem kullanıcı onayı bekliyor.",
    );
    let cariWarning = "";
    if (sourceKind === "XML") {
      try {
        await this.processCari(slug, document.id);
      } catch (error: any) {
        cariWarning = clean(
          error?.response?.message || error?.message || "Cari kaydı oluşturulamadı.",
        );
        await (this.prisma as any).salesInvoiceState.update({
          where: { invoiceId: document.id },
          data: { cariStatus: "CARI_ERROR" },
        });
        await this.history(
          slug,
          document.id,
          "CARI_ERROR",
          `Fatura kaydedildi; cari işlem tamamlanamadı: ${cariWarning}`,
        );
      }
    }
    return {
      duplicate: false,
      warning: Boolean(cariWarning),
      cariWarning: cariWarning || undefined,
      message:
        cariWarning
          ? `Fatura havuza alındı; cari işlem kontrol bekliyor: ${cariWarning}`
          : sourceKind === "XML"
          ? "Fatura havuza alındı ve müşteri carisine otomatik işlendi."
          : "Fatura havuza alındı; cari işlem kullanıcı kontrolü bekliyor.",
      invoice: await this.detail(slug, document.id),
    };
  }

  private safeFileName(name: string) {
    return path.basename(fixMojibake(name)).replace(/[<>:"/\\|?*]/g, "_");
  }

  private validateParsedCandidate(parsed: any, fileName: string) {
    const invoiceNo = clean(parsed?.invoiceNo || parsed?.documentNo);
    if (!invoiceNo) {
      throw new BadRequestException(`${fileName}: Fatura numarası okunamadı.`);
    }
    if (!Array.isArray(parsed?.lines) || !parsed.lines.length) {
      throw new BadRequestException(`${invoiceNo}: Fatura kalemi okunamadı.`);
    }
  }

  private uploadError(fileName: string, error: any, stage = "READ") {
    return {
      error: true,
      stage,
      fileName,
      message:
        error?.response?.message ||
        error?.message ||
        `${fileName || "Dosya"} okunamadı.`,
    };
  }

  async upload(query: Query, files: any[]) {
    const slug = this.slug(query);
    await this.ensureSalesInvoiceTables();
    if (!Array.isArray(files) || !files.length) {
      throw new BadRequestException("XML, PDF veya ZIP dosyası gereklidir.");
    }
    const candidates: Array<{ parsed: any; attachment: any }> = [];
    const failedItems: any[] = [];
    for (const file of files) {
      const ext = path.extname(file.originalname || "").toLocaleLowerCase("tr-TR");
      if (ext === ".zip") {
        let zip: AdmZip;
        const zipFileName = fixMojibake(file.originalname);
        try {
          zip = new AdmZip(file.path);
        } catch (error: any) {
          failedItems.push(this.uploadError(zipFileName, error, "ZIP_READ"));
          continue;
        }
        for (const entry of zip.getEntries().filter((item) => !item.isDirectory)) {
          const entryFileName = path.basename(fixMojibake(entry.entryName));
          const entryExt = path.extname(entryFileName).toLocaleLowerCase("tr-TR");
          if (![".xml", ".pdf"].includes(entryExt)) continue;
          try {
            const buffer = entry.getData();
            const targetDir = path.join(getStorageRoot(), "muhasebe", "musteri", "kesilen-fatura");
            fs.mkdirSync(targetDir, { recursive: true });
            const target = path.join(
              targetDir,
              `${Date.now()}-${crypto.randomUUID()}-${this.safeFileName(entryFileName)}`,
            );
            fs.writeFileSync(target, buffer);
            const parsed = await this.parser.parseFile({
              buffer,
              fileName: entryFileName,
              filePath: target,
              fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
              mimeType: entryExt === ".xml" ? "application/xml" : "application/pdf",
            });
            this.validateParsedCandidate(parsed, entryFileName);
            candidates.push({
              parsed,
              attachment: {
                filePath: target,
                fileName: entryFileName,
                mimeType: entryExt === ".xml" ? "application/xml" : "application/pdf",
                fileSize: buffer.length,
                role: entryExt === ".xml" ? "sales-invoice-xml" : "sales-invoice-pdf",
              },
            });
          } catch (error: any) {
            failedItems.push(this.uploadError(entryFileName, error, "PARSE"));
          }
        }
      } else {
        const originalName = fixMojibake(file.originalname);
        try {
          const buffer = fs.readFileSync(file.path);
          const parsed = await this.parser.parseFile({
            buffer,
            fileName: originalName,
            filePath: file.path,
            fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
            mimeType: file.mimetype,
          });
          this.validateParsedCandidate(parsed, originalName);
          candidates.push({
            parsed,
            attachment: {
              filePath: file.path,
              fileName: originalName,
              mimeType: file.mimetype,
              fileSize: Number(file.size || buffer.length),
              role: ext === ".xml" ? "sales-invoice-xml" : "sales-invoice-pdf",
            },
          });
        } catch (error: any) {
          failedItems.push(this.uploadError(originalName, error, "PARSE"));
        }
      }
    }
    const xmlRows = candidates.filter(
      (row) => clean(row.parsed.sourceType).toLocaleUpperCase("tr-TR") === "XML",
    );
    const primaryRows = xmlRows.length
      ? xmlRows
      : candidates.filter((row) => clean(row.parsed.invoiceNo || row.parsed.documentNo));
    const results = [];
    for (const row of primaryRows) {
      const invoiceNo = clean(row.parsed.invoiceNo || row.parsed.documentNo);
      const attachments = candidates
        .filter((candidate) => {
          const candidateNo = clean(
            candidate.parsed.invoiceNo || candidate.parsed.documentNo,
          );
          return candidate === row || (candidateNo && candidateNo === invoiceNo);
        })
        .map((candidate) => candidate.attachment);
      try {
        results.push(await this.saveParsedInvoice(slug, row.parsed, attachments));
      } catch (error: any) {
        failedItems.push(
          this.uploadError(row.attachment?.fileName || invoiceNo, error, "SAVE"),
        );
      }
    }
    if (!results.length && failedItems.length) {
      return { items: failedItems };
    }
    if (!results.length) {
      throw new BadRequestException("XML/PDF okunamadı veya fatura no bulunamadı.");
    }
    return { items: [...results, ...failedItems] };
  }

  async processCari(slugValue: string, invoiceId: string) {
    const slug = this.slug({ mainCompanySlug: slugValue });
    await this.ensureSalesInvoiceTables();
    const state = await (this.prisma as any).salesInvoiceState.findFirst({
      where: { invoiceId, mainCompanySlug: slug },
    });
    if (!state) throw new NotFoundException("Kesilen fatura bulunamadı.");
    if (state.cariStatus === "CARI_PROCESSED" && state.cariMovementId) {
      return {
        message: "Bu fatura daha önce müşteri carisine işlendi.",
        invoice: await this.detail(slug, invoiceId),
      };
    }
    const document = await this.prisma.document.findFirst({
      where: { id: invoiceId, mainCompanySlug: slug, deletedAt: null },
    });
    if (!document || !document.companyId) {
      throw new BadRequestException("Cari işlem için firma bağlantısı zorunludur.");
    }
    const existingMovement = await this.prisma.currentAccountMovement.findFirst({
      where: {
        mainCompanySlug: slug,
        companyId: document.companyId,
        documentNo: state.invoiceNo,
        sourceType: "SALES_INVOICE_IMPORT",
      },
    });
    const existingVatRecord = await this.prisma.vatRecord.findFirst({
      where: {
        mainCompanySlug: slug,
        documentId: invoiceId,
        OR: [
          { vatDirection: "OUT" },
          { vatDirection: "SALES" },
          { direction: "OUT" },
          { direction: "OUTGOING" },
          { outgoingVat: { gt: 0 } },
        ],
      },
    });
    const movement = await this.prisma.$transaction(async (tx) => {
      if (existingMovement) return existingMovement;
      const company = await tx.company.findUnique({ where: { id: document.companyId! } });
      if (!company) throw new NotFoundException("Firma bulunamadı.");
      const amount = num(document.grandTotal);
      const balanceAfter = num(company.currentBalance) + amount;
      const created = await tx.currentAccountMovement.create({
        data: {
          mainCompanySlug: slug,
          companyId: company.id,
          movementDate: state.invoiceDate,
          movementType: "SATIS_FATURA",
          sourceType: "SALES_INVOICE_IMPORT",
          documentNo: state.invoiceNo,
          documentId: invoiceId,
          description: `${state.invoiceNo} kesilen fatura`,
          debit: decimal(amount),
          credit: decimal(0),
          amount: decimal(amount),
          effect: decimal(amount),
          balanceAfter: decimal(balanceAfter),
          raw: { salesInvoiceId: invoiceId },
        },
      });
      await tx.company.update({
        where: { id: company.id },
        data: { currentBalance: decimal(balanceAfter) },
      });
      return created;
    });
    if (!existingVatRecord) {
      const invoiceDate = state.invoiceDate || document.date || new Date();
      const subtotal = num(document.subtotal);
      const vatTotal = num(document.vatTotal);
      const total = num(document.grandTotal);
      await this.prisma.vatRecord.create({
        data: {
          mainCompanySlug: slug,
          companyId: document.companyId,
          documentId: invoiceId,
          direction: "OUT",
          workType: "RESMI",
          date: invoiceDate,
          subtotal: decimal(subtotal),
          total: decimal(total),
          periodMonth: invoiceDate.getUTCMonth() + 1,
          periodYear: invoiceDate.getUTCFullYear(),
          vatDirection: "OUT",
          vatRate: decimal(subtotal > 0 && vatTotal > 0 ? (vatTotal / subtotal) * 100 : 0),
          baseAmount: decimal(subtotal),
          vatAmount: decimal(vatTotal),
          documentNo: state.invoiceNo,
          documentDate: invoiceDate,
          incomingVat: decimal(0),
          outgoingVat: decimal(vatTotal),
          carryVat: decimal(0),
          raw: { source: "SALES_INVOICE_IMPORT", salesInvoiceId: invoiceId },
        },
      });
    }
    await (this.prisma as any).salesInvoiceState.update({
      where: { invoiceId },
      data: { cariStatus: "CARI_PROCESSED", cariMovementId: movement.id },
    });
    await this.history(slug, invoiceId, "CARI_PROCESSED", "Fatura müşteri carisine işlendi.");
    return {
      message: "Fatura müşteri carisine işlendi.",
      invoice: await this.detail(slug, invoiceId),
    };
  }

  async updateLine(slugValue: string, invoiceId: string, lineId: string, body: Query) {
    const slug = this.slug({ mainCompanySlug: slugValue });
    await this.ensureSalesInvoiceTables();
    const line = await this.prisma.invoiceItem.findFirst({
      where: { id: lineId, documentId: invoiceId, mainCompanySlug: slug },
    });
    if (!line) throw new NotFoundException("Fatura kalemi bulunamadı.");
    const state = await (this.prisma as any).salesInvoiceState.findFirst({
      where: { invoiceId, mainCompanySlug: slug },
    });
    const financialEditRequested =
      body.quantity !== undefined ||
      body.unitPrice !== undefined ||
      body.vatRate !== undefined;
    if (state?.cariStatus === "CARI_PROCESSED" && financialEditRequested) {
      throw new BadRequestException(
        "Cari kaydı oluşmuş faturada miktar, fiyat ve KDV değiştirilemez. Önce muhasebe düzeltme işlemi yapılmalıdır.",
      );
    }
    const raw = this.raw(line.raw);
    const nextQuantity =
      body.quantity !== undefined ? num(body.quantity) : num(line.quantity);
    const nextUnitPrice =
      body.unitPrice !== undefined ? num(body.unitPrice) : num(line.unitPrice);
    const nextVatRate =
      body.vatRate !== undefined ? num(body.vatRate) : num(line.vatRate);
    const nextLineTotal = nextQuantity * nextUnitPrice;
    const nextVatAmount = nextLineTotal * (nextVatRate / 100);
    await this.prisma.invoiceItem.update({
      where: { id: lineId },
      data: {
        description:
          body.description !== undefined ? clean(body.description) : undefined,
        productName:
          body.description !== undefined ? clean(body.description) : undefined,
        quantity: body.quantity !== undefined ? decimal(body.quantity) : undefined,
        unit: body.unit !== undefined ? clean(body.unit) : undefined,
        unitPrice:
          body.unitPrice !== undefined ? decimal(body.unitPrice) : undefined,
        vatRate: body.vatRate !== undefined ? decimal(body.vatRate) : undefined,
        lineTotal: decimal(nextLineTotal),
        vatAmount: decimal(nextVatAmount),
        raw: {
          ...raw,
          lineType: clean(body.lineType || raw.lineType || "MODEL"),
        },
      },
    });
    if (financialEditRequested) {
      const updatedLines = await this.prisma.invoiceItem.findMany({
        where: { documentId: invoiceId, mainCompanySlug: slug },
      });
      const subtotal = updatedLines.reduce(
        (sum, item) => sum + num(item.lineTotal),
        0,
      );
      const vatTotal = updatedLines.reduce(
        (sum, item) => sum + num(item.vatAmount),
        0,
      );
      await this.prisma.document.update({
        where: { id: invoiceId },
        data: {
          subtotal: decimal(subtotal),
          vatTotal: decimal(vatTotal),
          grandTotal: decimal(subtotal + vatTotal),
        },
      });
    }
    await this.refreshModelStatus(invoiceId);
    await this.history(slug, invoiceId, "LINE_UPDATED", "Fatura kalemi düzenlendi.");
    return this.detail(slug, invoiceId);
  }

  async linkModel(slugValue: string, invoiceId: string, lineId: string, body: Query) {
    const slug = this.slug({ mainCompanySlug: slugValue });
    await this.ensureSalesInvoiceTables();
    const line = await this.prisma.invoiceItem.findFirst({
      where: { id: lineId, documentId: invoiceId, mainCompanySlug: slug },
    });
    if (!line) throw new NotFoundException("Fatura kalemi bulunamadı.");
    const modelId = clean(body.modelId);
    if (!modelId) throw new BadRequestException("Model seçimi zorunludur.");
    const model = await this.modelService.getById(modelId, slug);
    if (clean(model.status).toLocaleUpperCase("tr-TR") === "ARCHIVED") {
      throw new BadRequestException("Seçilen model pasif.");
    }
    const regions = await this.modelService.getPrintRegions(modelId, {
      mainCompanySlug: slug,
    });
    const printRegionId = clean(body.printRegionId);
    const region = regions.find(
      (item: any) =>
        clean(item.id) === printRegionId ||
        clean(item.regionCode) === printRegionId ||
        clean(item.regionName) === clean(body.printRegionName),
    );
    if (printRegionId && !region) {
      throw new BadRequestException("Baskı bölgesi modelde tanımlı değil.");
    }
    const existingLinks = await (this.prisma as any).salesInvoiceLineModelLink.findMany({
      where: { invoiceLineId: lineId },
    });
    const matched = existingLinks.reduce(
      (sum: number, item: any) => sum + num(item.matchedQuantity),
      0,
    );
    const remaining = Math.max(0, num(line.quantity) - matched);
    const matchedQuantity = num(body.matchedQuantity || remaining);
    if (matchedQuantity <= 0) {
      throw new BadRequestException("Eşleşen adet sıfırdan büyük olmalıdır.");
    }
    if (matchedQuantity > remaining + 0.0001) {
      throw new BadRequestException(
        `Fatura kalemindeki ${num(line.quantity)} adet aşılamaz. Kalan eşleştirilebilir adet: ${remaining}.`,
      );
    }
    await (this.prisma as any).salesInvoiceLineModelLink.create({
      data: {
        mainCompanySlug: slug,
        invoiceId,
        invoiceLineId: lineId,
        modelId,
        printRegionId: region?.id || null,
        printRegionName: region?.regionName || clean(body.printRegionName) || null,
        matchedQuantity: decimal(matchedQuantity),
        note: clean(body.note) || null,
      },
    });
    await this.prisma.invoiceItem.update({
      where: { id: lineId },
      data: { raw: { ...this.raw(line.raw), modelOutside: false, lineType: "MODEL" } },
    });
    await this.refreshModelStatus(invoiceId);
    await this.history(slug, invoiceId, "MODEL_LINKED", "Fatura kalemi modele bağlandı.", {
      lineId,
      modelId,
      matchedQuantity,
      printRegionName: region?.regionName || "",
    });
    return {
      message: "Fatura kalemi modele bağlandı.",
      invoice: await this.detail(slug, invoiceId),
    };
  }

  async removeLink(slugValue: string, invoiceId: string, lineId: string, linkId: string) {
    const slug = this.slug({ mainCompanySlug: slugValue });
    await this.ensureSalesInvoiceTables();
    const link = await (this.prisma as any).salesInvoiceLineModelLink.findFirst({
      where: { id: linkId, invoiceId, invoiceLineId: lineId, mainCompanySlug: slug },
    });
    if (!link) throw new NotFoundException("Model bağlantısı bulunamadı.");
    await (this.prisma as any).salesInvoiceLineModelLink.delete({ where: { id: linkId } });
    await this.refreshModelStatus(invoiceId);
    await this.history(slug, invoiceId, "MODEL_UNLINKED", "Model bağlantısı kaldırıldı.", {
      lineId,
      linkId,
    });
    return {
      message: "Model bağlantısı kaldırıldı.",
      invoice: await this.detail(slug, invoiceId),
    };
  }

  async markOutside(slugValue: string, invoiceId: string, lineId: string) {
    const slug = this.slug({ mainCompanySlug: slugValue });
    await this.ensureSalesInvoiceTables();
    const line = await this.prisma.invoiceItem.findFirst({
      where: { id: lineId, documentId: invoiceId, mainCompanySlug: slug },
    });
    if (!line) throw new NotFoundException("Fatura kalemi bulunamadı.");
    await (this.prisma as any).salesInvoiceLineModelLink.deleteMany({
      where: { invoiceLineId: lineId, invoiceId, mainCompanySlug: slug },
    });
    await this.prisma.invoiceItem.update({
      where: { id: lineId },
      data: {
        raw: { ...this.raw(line.raw), modelOutside: true, lineType: "MODEL_DISI" },
      },
    });
    await this.refreshModelStatus(invoiceId);
    await this.history(
      slug,
      invoiceId,
      "MODEL_NOT_REQUIRED",
      "Kalem model dışı olarak işaretlendi.",
      { lineId },
    );
    return {
      message: "Kalem model dışı olarak işaretlendi.",
      invoice: await this.detail(slug, invoiceId),
    };
  }

  async file(slugValue: string, invoiceId: string, fileId: string) {
    const slug = this.slug({ mainCompanySlug: slugValue });
    const file = await this.prisma.documentFile.findFirst({
      where: { id: fileId, documentId: invoiceId, mainCompanySlug: slug, deletedAt: null },
    });
    if (!file || !fs.existsSync(file.filePath)) {
      throw new NotFoundException("Fatura dosyası bulunamadı.");
    }
    return file;
  }
}
