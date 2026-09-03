import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DocumentClassifierService } from "./document-intake/document-classifier.service";
import { DocumentIntakeServiceV2 } from "./document-intake/document-intake.service";
import { DocumentMatcherService } from "./document-intake/document-matcher.service";
import type { ParsedDocument, ParsedDocumentLine } from "./document-intake/dto/document-intake.dto";
import { EBelgeAiExtractorService } from "./e-belge-ai-extractor.service";
import { reconcileEBelgeInvoice } from "./e-belge-match.engine";

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const objectValue = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const decimal = (value: unknown) => new Prisma.Decimal(Number(value || 0) || 0);
const dateValue = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text.length <= 10 ? `${text}T00:00:00.000Z` : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

@Injectable()
export class EBelgeCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intake: DocumentIntakeServiceV2,
    private readonly classifier: DocumentClassifierService,
    private readonly matcher: DocumentMatcherService,
    private readonly ai: EBelgeAiExtractorService,
  ) {}

  private slug(body: Record<string, any> = {}) {
    const slug = clean(body.mainCompanySlug || body.mainCompanyId);
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return slug;
  }

  async upload(files: Express.Multer.File[], body: Record<string, any> = {}) {
    const mainCompanySlug = this.slug(body);
    const result: any = await this.intake.upload(files, {
      ...body,
      mainCompanySlug,
      autoApprove: false,
    });

    await this.attachUploadFiles(mainCompanySlug, result);

    const aiResults = [];
    for (const item of result?.items || []) {
      try {
        const aiResult = await this.enrichWithAiIfNeeded(mainCompanySlug, clean(item?.id));
        if (aiResult) aiResults.push(aiResult);
      } catch (error: any) {
        aiResults.push({
          id: clean(item?.id),
          ok: false,
          status: "AI_REVIEW_REQUIRED",
          message: clean(error?.message || "AI belge okuma tamamlanamadı."),
        });
      }
    }

    const touchedIds = [
      ...(result?.items || []).map((item: any) => clean(item?.id)),
      ...(result?.skipped || []).map((item: any) => clean(item?.existingId)),
    ].filter(Boolean);
    const reconciliation = [];
    for (const id of [...new Set(touchedIds)]) {
      try {
        const match = await this.reconcileOne(mainCompanySlug, id);
        if (match) reconciliation.push(match);
      } catch (error: any) {
        reconciliation.push({ id, ok: false, error: clean(error?.message) });
      }
    }

    return {
      ...result,
      ok: result?.errors?.length ? false : true,
      aiResults,
      reconciliation,
    };
  }

  private batchDirectory(mainCompanySlug: string, batchId: string) {
    return path.join(
      process.cwd(),
      "storage",
      "muhasebe",
      "document-intake",
      mainCompanySlug,
      batchId,
    );
  }

  private findPersistedBatchFile(mainCompanySlug: string, batchId: string, fileName: string) {
    const dir = this.batchDirectory(mainCompanySlug, batchId);
    if (!fs.existsSync(dir)) return "";
    const wanted = path.basename(clean(fileName)).toLocaleLowerCase("tr-TR");
    const exact = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .find((name) => name.toLocaleLowerCase("tr-TR") === wanted);
    if (exact) return path.join(dir, exact);
    const base = path.parse(wanted).name;
    const fuzzy = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .find((name) => path.parse(name.toLocaleLowerCase("tr-TR")).name.startsWith(base));
    return fuzzy ? path.join(dir, fuzzy) : "";
  }

  private async appendAttachment(mainCompanySlug: string, id: string, attachment: Record<string, any>) {
    const row = await this.prisma.documentIntake.findFirst({
      where: { id, mainCompanySlug },
      select: { id: true, parseRawJson: true },
    });
    if (!row) return false;
    const current = objectValue(row.parseRawJson);
    const existing = Array.isArray(current._eBelgeAttachments) ? current._eBelgeAttachments : [];
    const filePath = clean(attachment.filePath);
    const fileName = clean(attachment.fileName) || path.basename(filePath);
    const ext = path.extname(fileName).toLocaleLowerCase("tr-TR");
    const nextAttachment = {
      fileName,
      filePath,
      extension: ext,
      source: clean(attachment.source || "MANUAL_UPLOAD"),
      attachedAt: new Date().toISOString(),
    };
    const deduped = [
      ...existing.filter((item: any) => clean(item?.filePath) !== filePath && clean(item?.fileName) !== fileName),
      nextAttachment,
    ];
    await this.prisma.documentIntake.update({
      where: { id },
      data: {
        parseRawJson: {
          ...current,
          _eBelgeAttachments: deduped,
        },
      },
    });
    return true;
  }

  private async attachUploadFiles(mainCompanySlug: string, result: any) {
    for (const item of result?.items || []) {
      if (!item?.id) continue;
      await this.appendAttachment(mainCompanySlug, clean(item.id), {
        fileName: item.originalFileName,
        filePath: item.filePath,
        source: "MANUAL_UPLOAD",
      });
    }
    for (const skipped of result?.skipped || []) {
      const existingId = clean(skipped?.existingId);
      if (!existingId) continue;
      const filePath = this.findPersistedBatchFile(
        mainCompanySlug,
        clean(result?.batchId),
        clean(skipped?.fileName),
      );
      if (!filePath) continue;
      await this.appendAttachment(mainCompanySlug, existingId, {
        fileName: skipped?.fileName,
        filePath,
        source: "MANUAL_DUPLICATE_ATTACHMENT",
      });
    }
  }

  private needsAi(row: any) {
    const ext = path.extname(clean(row.originalFileName)).toLocaleLowerCase("tr-TR");
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return true;
    if (ext !== ".pdf") return false;
    const hasHeader = Boolean(clean(row.documentNo || row.invoiceNo || row.dispatchNo) && clean(row.issuerName));
    const hasLines = Array.isArray(row.lines) && row.lines.length > 0;
    return !hasHeader || !hasLines;
  }

  private aiParsedDocument(row: any, data: any): ParsedDocument {
    const isDispatch = data.documentType === "DESPATCH";
    const documentNo = clean(data.documentNo || (isDispatch ? data.dispatchNo : data.invoiceNo));
    const lines: ParsedDocumentLine[] = (data.lines || []).map((line: any, index: number) => ({
      lineNo: Number(line.lineNo || index + 1),
      rawName: clean(line.description || line.productCode),
      description: clean(line.description),
      quantity: Number(line.quantity || 0),
      unit: clean(line.unit || "ADET"),
      unitPrice: Number(line.unitPrice || 0),
      subtotal: Number(line.subtotal || 0),
      vatRate: Number(line.vatRate || 0),
      vatAmount: Number(line.vatAmount || 0),
      total: Number(line.total || 0),
      lotNo: clean(line.lotNo),
      productCode: clean(line.productCode),
    }));
    return {
      originalFileName: clean(row.originalFileName),
      filePath: clean(row.filePath),
      fileHash: clean(row.fileHash),
      mimeType: clean(row.mimeType),
      rawText: "",
      sourceType: "IMAGE_AI" as any,
      documentNo,
      invoiceNo: isDispatch ? "" : clean(data.invoiceNo || documentNo),
      dispatchNo: isDispatch ? clean(data.dispatchNo || documentNo) : clean(data.dispatchReferences?.[0] || data.dispatchNo),
      scenario: clean(data.scenario),
      documentType: isDispatch ? "DespatchAdvice" : "Invoice",
      issueDate: clean(data.issueDate),
      dueDate: clean(data.dueDate),
      issuerName: clean(data.issuerName),
      issuerTaxNo: clean(data.issuerTaxNo),
      receiverName: clean(data.receiverName),
      receiverTaxNo: clean(data.receiverTaxNo),
      currency: clean(data.currency || "TRY"),
      subtotal: Number(data.subtotal || 0),
      vatTotal: Number(data.vatTotal || 0),
      grandTotal: Number(data.grandTotal || 0),
      modelGuess: "",
      lines,
      parseRawJson: {
        aiExtraction: data,
        dispatchReferences: data.dispatchReferences || [],
      },
    };
  }

  private async enrichWithAiIfNeeded(mainCompanySlug: string, id: string) {
    if (!id) return null;
    const row = await this.prisma.documentIntake.findFirst({
      where: { id, mainCompanySlug },
      include: { lines: true },
    });
    if (!row || !this.needsAi(row)) return { id, ok: true, status: "AI_NOT_NEEDED" };

    const extracted: any = await this.ai.extract({
      filePath: row.filePath,
      mimeType: row.mimeType,
      originalFileName: row.originalFileName,
    });
    if (extracted.status !== "COMPLETED" || !extracted.data) {
      const current = objectValue(row.parseRawJson);
      await this.prisma.documentIntake.update({
        where: { id },
        data: {
          parseRawJson: {
            ...current,
            _eBelgeAi: {
              status: extracted.status,
              warning: clean(extracted.warning),
              checkedAt: new Date().toISOString(),
            },
          },
        },
      });
      return { id, ok: false, status: extracted.status, warning: extracted.warning };
    }

    const parsed = this.aiParsedDocument(row, extracted.data);
    const classified = this.classifier.classify(parsed);
    const matched: any = await this.matcher.enrich(mainCompanySlug, parsed, classified.documentKind);
    const current = objectValue(row.parseRawJson);
    const nextRaw = {
      ...current,
      _eBelgeAi: {
        status: "COMPLETED",
        model: extracted.model,
        responseId: extracted.responseId,
        confidence: extracted.data.confidence,
        warnings: extracted.data.warnings,
        extractedAt: new Date().toISOString(),
      },
      _eBelgeDispatchReferences: extracted.data.dispatchReferences || [],
      aiExtraction: extracted.data,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.documentIntake.update({
        where: { id },
        data: {
          documentNo: clean(parsed.documentNo) || null,
          invoiceNo: clean(parsed.invoiceNo) || null,
          dispatchNo: clean(parsed.dispatchNo) || null,
          documentKind: classified.documentKind as any,
          direction: classified.direction,
          scenario: clean(parsed.scenario) || null,
          documentType: clean(parsed.documentType) || null,
          issueDate: dateValue(parsed.issueDate),
          dueDate: dateValue(parsed.dueDate),
          issuerName: clean(parsed.issuerName) || null,
          issuerTaxNo: clean(parsed.issuerTaxNo) || null,
          receiverName: clean(parsed.receiverName) || null,
          receiverTaxNo: clean(parsed.receiverTaxNo) || null,
          firmId: clean(matched?.firmMatch?.firmId) || null,
          firmDraftJson: matched?.firmMatch?.firmDraftJson || Prisma.DbNull,
          currency: clean(parsed.currency || "TRY"),
          subtotal: decimal(parsed.subtotal),
          vatTotal: decimal(parsed.vatTotal),
          grandTotal: decimal(parsed.grandTotal),
          status: "CONTROL_WAITING",
          parseRawJson: nextRaw,
        },
      });
      await tx.documentIntakeLine.deleteMany({ where: { documentIntakeId: id } });
      const lines = Array.isArray(matched?.lines) ? matched.lines : parsed.lines;
      if (lines.length) {
        await tx.documentIntakeLine.createMany({
          data: lines.map((line: any, index: number) => ({
            documentIntakeId: id,
            lineNo: Number(line.lineNo || index + 1),
            rawName: clean(line.rawName || line.description) || null,
            description: clean(line.description) || null,
            productId: clean(line.productId) || null,
            productDraftJson: line.productDraftJson || undefined,
            quantity: decimal(line.quantity),
            unit: clean(line.unit) || null,
            unitPrice: decimal(line.unitPrice),
            subtotal: decimal(line.subtotal),
            vatRate: decimal(line.vatRate),
            vatAmount: decimal(line.vatAmount),
            total: decimal(line.total),
            lotNo: clean(line.lotNo) || null,
            productCode: clean(line.productCode || line.sellerItemId || line.standardItemId) || null,
            matchStatus: clean(line.productMatchStatus) || null,
            missingFieldsJson: Array.isArray(line.missingFields) ? line.missingFields : [],
          })),
        });
      }
    });

    return {
      id,
      ok: true,
      status: "AI_ENRICHED",
      confidence: extracted.data.confidence,
      lineCount: parsed.lines.length,
    };
  }

  private collectDispatchReferences(row: any) {
    const refs = new Set<string>();
    const add = (value: unknown) => {
      const text = clean(value);
      if (text && text.length <= 80) refs.add(text);
    };
    add(row.dispatchNo);
    const root = objectValue(row.parseRawJson);
    const walk = (value: any, pathText = "") => {
      if (value == null) return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item, pathText);
        return;
      }
      if (typeof value !== "object") {
        if (/DESPATCH.*REFERENCE|DISPATCH.*REFERENCE|IRSALIYE.*REFER|_EBELGEDISPATCHREFERENCES/i.test(pathText)) add(value);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        const nextPath = `${pathText}.${key}`;
        if (/DESPATCHDOCUMENTREFERENCE|DISPATCHREFERENCES|DISPATCHREFERENCE|IRSALIYEREFERENCE/i.test(key)) {
          if (typeof child !== "object") add(child);
          else if (Array.isArray(child)) child.forEach((item) => typeof item === "object" ? add((item as any)?.ID || (item as any)?.id || (item as any)?.value) : add(item));
          else add((child as any)?.ID || (child as any)?.id || (child as any)?.value);
        }
        walk(child, nextPath);
      }
    };
    walk(root);
    return [...refs];
  }

  private isInvoice(row: any) {
    return row.documentKind === "OUR_INVOICE" || row.documentKind === "SUPPLIER_INVOICE" || row.documentKind === "EXPENSE_INVOICE" || /INVOICE|FATURA/i.test(clean(row.documentType));
  }

  private isDispatch(row: any) {
    return row.documentKind === "OUR_DISPATCH" || row.documentKind === "CUSTOMER_DISPATCH" || /DESPATCH|IRSALIYE|İRSALİYE/i.test(clean(row.documentType));
  }

  private compatibleDirection(invoice: any, dispatch: any) {
    const invoiceOutgoing = clean(invoice.direction).toUpperCase() === "OUTGOING" || invoice.documentKind === "OUR_INVOICE";
    const dispatchOutgoing = clean(dispatch.direction).toUpperCase() === "OUTGOING" || dispatch.documentKind === "OUR_DISPATCH";
    return invoiceOutgoing === dispatchOutgoing;
  }

  async reconcileOne(mainCompanySlug: string, id: string) {
    const invoice: any = await this.prisma.documentIntake.findFirst({
      where: { id, mainCompanySlug, status: { not: "ARCHIVED" } },
      include: { lines: true },
    });
    if (!invoice) throw new NotFoundException("e-Belge kaydı bulunamadı.");
    if (!this.isInvoice(invoice)) return null;

    const dispatches: any[] = await this.prisma.documentIntake.findMany({
      where: { mainCompanySlug, id: { not: id }, status: { not: "ARCHIVED" } },
      include: { lines: true },
      orderBy: { issueDate: "desc" },
      take: 1500,
    });
    const candidates = dispatches.filter((row) => this.isDispatch(row) && this.compatibleDirection(invoice, row));
    const refs = this.collectDispatchReferences(invoice);
    const result = reconcileEBelgeInvoice(invoice as any, candidates as any, refs);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentIntakeMatch.deleteMany({
        where: {
          documentIntakeId: id,
          matchType: { in: ["INVOICE_DISPATCH_SUMMARY", "INVOICE_DISPATCH", "INVOICE_DISPATCH_LINE"] },
        },
      });
      await tx.documentIntakeMatch.create({
        data: {
          documentIntakeId: id,
          matchType: "INVOICE_DISPATCH_SUMMARY",
          matchedId: result.linkedDispatches[0]?.id || null,
          score: decimal(result.confidence),
          status: result.status,
          note: JSON.stringify(result),
        },
      });
      for (const linked of result.linkedDispatches) {
        await tx.documentIntakeMatch.create({
          data: {
            documentIntakeId: id,
            matchType: "INVOICE_DISPATCH",
            matchedId: linked.id,
            score: decimal(result.confidence),
            status: result.status,
            note: JSON.stringify(linked),
          },
        });
      }
      for (const line of result.lines) {
        for (const allocation of line.allocations) {
          await tx.documentIntakeMatch.create({
            data: {
              documentIntakeId: id,
              matchType: "INVOICE_DISPATCH_LINE",
              matchedId: allocation.dispatchLineId || allocation.dispatchId,
              score: decimal(allocation.productScore),
              status: line.status,
              note: JSON.stringify({
                invoiceLineId: line.invoiceLineId,
                invoiceProduct: line.invoiceProduct,
                dispatchId: allocation.dispatchId,
                dispatchNo: allocation.dispatchNo,
                quantity: allocation.quantity,
                difference: line.difference,
                unit: line.unit,
                productMatchSource: allocation.productMatchSource,
              }),
            },
          });
        }
      }
    });

    return { id, ok: true, ...result };
  }

  async reconcileAll(body: Record<string, any> = {}) {
    const mainCompanySlug = this.slug(body);
    const invoices = await this.prisma.documentIntake.findMany({
      where: { mainCompanySlug, status: { not: "ARCHIVED" } },
      select: { id: true, documentKind: true, documentType: true },
      orderBy: { createdAt: "desc" },
      take: 3000,
    });
    const results = [];
    for (const row of invoices) {
      if (!this.isInvoice(row)) continue;
      try {
        results.push(await this.reconcileOne(mainCompanySlug, row.id));
      } catch (error: any) {
        results.push({ id: row.id, ok: false, error: clean(error?.message) });
      }
    }
    return {
      ok: results.every((row: any) => row?.ok !== false),
      total: results.length,
      matched: results.filter((row: any) => row?.status === "MATCHED").length,
      partial: results.filter((row: any) => row?.status === "PARTIAL").length,
      mismatch: results.filter((row: any) => row?.status === "MISMATCH").length,
      unmatched: results.filter((row: any) => row?.status === "UNMATCHED").length,
      results,
    };
  }

  private category(row: any) {
    const outgoing = clean(row.direction).toUpperCase() === "OUTGOING" || ["OUR_INVOICE", "OUR_DISPATCH"].includes(row.documentKind);
    if (this.isDispatch(row)) return outgoing ? "OUTGOING_DISPATCH" : "INCOMING_DISPATCH";
    if (this.isInvoice(row)) return outgoing ? "OUTGOING_INVOICE" : "INCOMING_INVOICE";
    return "OTHER";
  }

  private matchSummary(row: any) {
    const match = (row.matches || []).find((item: any) => item.matchType === "INVOICE_DISPATCH_SUMMARY");
    if (!match?.note) return null;
    try {
      return JSON.parse(match.note);
    } catch {
      return { status: match.status, confidence: Number(match.score || 0), linkedDispatches: [], lines: [], notes: [] };
    }
  }

  async list(query: Record<string, any> = {}) {
    const mainCompanySlug = this.slug(query);
    const requestedLimit = Number(query.limit || query.pageSize || 300);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 300, 1000));
    const category = clean(query.category).toUpperCase();
    const search = clean(query.search).toLocaleUpperCase("tr-TR");
    const startDate = clean(query.startDate);
    const endDate = clean(query.endDate);

    const rows: any[] = await this.prisma.documentIntake.findMany({
      where: { mainCompanySlug, status: { not: "ARCHIVED" } },
      include: { lines: true, matches: true },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 3000,
    });
    const firmIds = [...new Set(rows.map((row) => clean(row.firmId)).filter(Boolean))];
    const firms = firmIds.length
      ? await this.prisma.company.findMany({
          where: { mainCompanySlug, id: { in: firmIds } },
          select: { id: true, name: true, taxNo: true, companyType: true },
        })
      : [];
    const firmMap = new Map(firms.map((firm) => [firm.id, firm]));

    const mapped = rows.map((row) => {
      const raw = objectValue(row.parseRawJson);
      const attachments = Array.isArray(raw._eBelgeAttachments) ? raw._eBelgeAttachments : [];
      const files = [
        ...attachments,
        ...(row.filePath ? [{ fileName: row.originalFileName, filePath: row.filePath, extension: path.extname(row.originalFileName || row.filePath) }] : []),
      ].filter((item, index, array) => array.findIndex((candidate) => clean(candidate.filePath) === clean(item.filePath)) === index);
      const firm = firmMap.get(clean(row.firmId));
      const match = this.matchSummary(row);
      const rowCategory = this.category(row);
      const partnerName = firm?.name || (rowCategory.startsWith("OUTGOING") ? row.receiverName : row.issuerName) || "Firma eşleşmesi bekliyor";
      const issueDate = row.issueDate ? new Date(row.issueDate).toISOString().slice(0, 10) : "";
      const aiMeta = objectValue(raw._eBelgeAi);
      return {
        id: row.id,
        category: rowCategory,
        documentKind: row.documentKind,
        direction: row.direction,
        documentNo: row.documentNo || row.invoiceNo || row.dispatchNo || "",
        invoiceNo: row.invoiceNo || "",
        dispatchNo: row.dispatchNo || "",
        issueDate,
        partnerName,
        partnerTaxNo: firm?.taxNo || (rowCategory.startsWith("OUTGOING") ? row.receiverTaxNo : row.issuerTaxNo) || "",
        companyType: firm?.companyType || "",
        currency: row.currency || "TRY",
        subtotal: Number(row.subtotal || 0),
        vatTotal: Number(row.vatTotal || 0),
        grandTotal: Number(row.grandTotal || 0),
        status: row.status,
        lineCount: row.lines?.length || 0,
        lotCount: (row.lines || []).filter((line: any) => clean(line.lotNo)).length,
        unmatchedProductCount: (row.lines || []).filter((line: any) => !clean(line.productId)).length,
        files: files.map((file: any) => ({ fileName: clean(file.fileName), extension: clean(file.extension || path.extname(file.fileName || file.filePath)).toLowerCase(), source: clean(file.source) })),
        hasXml: files.some((file: any) => /\.xml$/i.test(clean(file.fileName || file.filePath))),
        hasPdf: files.some((file: any) => /\.pdf$/i.test(clean(file.fileName || file.filePath))),
        match,
        matchStatus: match?.status || (this.isInvoice(row) ? "UNMATCHED" : "NOT_REQUIRED"),
        matchConfidence: Number(match?.confidence || 0),
        aiStatus: clean(aiMeta.status || "NOT_USED"),
        aiConfidence: Number(aiMeta.confidence || 0),
        actionNeeded: Boolean(
          row.status === "MISSING_INFO" ||
            row.status === "CONTROL_WAITING" ||
            (this.isInvoice(row) && !["MATCHED"].includes(match?.status)) ||
            (row.lines || []).some((line: any) => !clean(line.productId))
        ),
      };
    });

    const filtered = mapped
      .filter((row) => !category || category === "ALL" || row.category === category || (category === "MATCHING" && row.matchStatus !== "MATCHED" && row.matchStatus !== "NOT_REQUIRED") || (category === "ISSUES" && row.actionNeeded))
      .filter((row) => !startDate || !row.issueDate || row.issueDate >= startDate)
      .filter((row) => !endDate || !row.issueDate || row.issueDate <= endDate)
      .filter((row) => !search || `${row.documentNo} ${row.partnerName} ${row.partnerTaxNo}`.toLocaleUpperCase("tr-TR").includes(search));

    const summary = {
      total: mapped.length,
      incomingInvoices: mapped.filter((row) => row.category === "INCOMING_INVOICE").length,
      outgoingInvoices: mapped.filter((row) => row.category === "OUTGOING_INVOICE").length,
      incomingDispatches: mapped.filter((row) => row.category === "INCOMING_DISPATCH").length,
      outgoingDispatches: mapped.filter((row) => row.category === "OUTGOING_DISPATCH").length,
      fullyMatched: mapped.filter((row) => row.matchStatus === "MATCHED").length,
      matchingReview: mapped.filter((row) => ["PARTIAL", "MISMATCH", "SUGGESTED", "UNMATCHED"].includes(row.matchStatus)).length,
      actionNeeded: mapped.filter((row) => row.actionNeeded).length,
    };

    return {
      ok: true,
      rows: filtered.slice(0, limit),
      total: filtered.length,
      summary,
    };
  }

  async detail(mainCompanySlug: string, id: string) {
    const row = await this.prisma.documentIntake.findFirst({
      where: { id, mainCompanySlug },
      include: { lines: true, matches: true },
    });
    if (!row) throw new NotFoundException("e-Belge bulunamadı.");
    return {
      ...row,
      match: this.matchSummary(row),
      dispatchReferences: this.collectDispatchReferences(row),
    };
  }
}
