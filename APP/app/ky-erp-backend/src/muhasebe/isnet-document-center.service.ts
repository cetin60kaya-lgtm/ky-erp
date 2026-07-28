import { BadRequestException, Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import { PrismaService } from "../prisma/prisma.service";

type Query = Record<string, any>;
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

@Injectable()
export class IsnetDocumentCenterService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(query: Query = {}) {
    const value = clean(query.mainCompanySlug || query.companyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private comparableDate(value: unknown) {
    const text = clean(value);
    const tr = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (tr) return `${tr[3]}-${tr[2].padStart(2, "0")}-${tr[1].padStart(2, "0")}`;
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return iso?.[1] || "";
  }

  async list(query: Query = {}) {
    const slug = this.slug(query);
    const page = Math.max(numberValue(query.page) || 1, 1);
    const requestedPageSize = numberValue(query.pageSize) || 50;
    const pageSize = [25, 50, 100].includes(requestedPageSize) ? requestedPageSize : 50;
    const startDate = clean(query.startDate);
    const endDate = clean(query.endDate);
    const direction = clean(query.direction).toLowerCase();
    const kind = clean(query.kind).toLowerCase();
    const fileStatus = clean(query.fileStatus).toLowerCase();
    const actionStatus = clean(query.actionStatus).toLowerCase();
    const search = clean(query.search).toLocaleLowerCase("tr-TR");

    const [states, automationRow] = await Promise.all([
      this.prisma.isnetDocumentState.findMany({
        where: { mainCompanySlug: slug },
        orderBy: [{ downloadedAt: "desc" }, { updatedAt: "desc" }],
      }),
      this.prisma.setting.findUnique({
        where: {
          scope_mainCompanySlug_key: {
            scope: "ISNET",
            mainCompanySlug: slug,
            key: "AUTOMATION",
          },
        },
      }),
    ]);

    const documentNos = states.map((row) => clean(row.documentNo)).filter(Boolean);
    const [intakes, accountingDocuments] = await Promise.all([
      documentNos.length
        ? this.prisma.documentIntake.findMany({
            where: {
              mainCompanySlug: slug,
              OR: [
                { documentNo: { in: documentNos } },
                { dispatchNo: { in: documentNos } },
                { invoiceNo: { in: documentNos } },
              ],
            },
            select: {
              id: true,
              documentNo: true,
              dispatchNo: true,
              invoiceNo: true,
              status: true,
              modelId: true,
              modelGuess: true,
              firmId: true,
              documentKind: true,
              updatedAt: true,
            },
          })
        : Promise.resolve([]),
      documentNos.length
        ? this.prisma.document.findMany({
            where: { mainCompanySlug: slug, documentNo: { in: documentNos }, deletedAt: null },
            select: { id: true, documentNo: true, status: true, processedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const intakeByNo = new Map(
      intakes.map((row) => [clean(row.documentNo || row.dispatchNo || row.invoiceNo), row]),
    );
    const accountingByNo = new Map(accountingDocuments.map((row) => [clean(row.documentNo), row]));

    const enriched = states
      .map((state) => {
        const documentNo = clean(state.documentNo);
        const intake = intakeByNo.get(documentNo);
        const accounting = accountingByNo.get(documentNo);
        const pdfSaved = Boolean(state.pdfPath && fs.existsSync(clean(state.pdfPath)));
        const xmlSaved = Boolean(state.xmlPath && fs.existsSync(clean(state.xmlPath)));
        const companyType = clean(
          state.companyType ||
            (state.customerDispatch || intake?.documentKind === "CUSTOMER_DISPATCH"
              ? "CUSTOMER"
              : "SUPPLIER"),
        ).toUpperCase();
        const modelApplicable =
          state.direction === "incoming" &&
          state.kind === "dispatch" &&
          ["CUSTOMER", "BOTH"].includes(companyType);
        const modelId = clean(intake?.modelId);
        const accountingImported = Boolean(accounting);
        const errorText = clean(state.error);
        const actionNeeded = Boolean(
          errorText ||
            !pdfSaved ||
            !xmlSaved ||
            (state.direction === "incoming" && state.kind === "invoice" && !accountingImported) ||
            (state.direction === "outgoing" && state.kind === "invoice" && !accountingImported) ||
            (modelApplicable && !modelId),
        );
        const date = this.comparableDate(state.dateText || state.downloadedAt || state.firstSeenAt);
        return {
          id: clean(state.id),
          automationKey: clean(state.automationKey),
          sourceId: clean(state.sourceId),
          direction: clean(state.direction),
          kind: clean(state.kind),
          date,
          dateText: clean(state.dateText) || date,
          transferDateText: clean(state.transferDateText),
          documentNo,
          partnerName: clean(state.partnerName),
          scenarioText: clean(state.scenarioText),
          subtypeText: clean(state.subtypeText),
          portalStatusText: clean(state.statusText),
          amount: state.amount,
          amountText: clean(state.amountText),
          currency: clean(state.currency),
          uuid: clean(state.uuid),
          downloaded: Boolean(state.completed),
          pdfSaved,
          xmlSaved,
          error: errorText,
          intakeId: clean(intake?.id || state.intakeId),
          intakeStatus: clean(intake?.status),
          modelId,
          modelName: clean(intake?.modelGuess || state.modelName),
          companyId: clean(state.companyId || intake?.firmId),
          companyType,
          modelApplicable,
          accountingImported,
          accountingDocumentId: clean(accounting?.id),
          accountingStatus: clean(accounting?.status),
          localUnread: Boolean(state.completed && !state.appReadAt),
          actionNeeded,
        };
      })
      .filter((row) => !startDate || !row.date || row.date >= startDate)
      .filter((row) => !endDate || !row.date || row.date <= endDate)
      .filter((row) => !direction || direction === "all" || row.direction === direction)
      .filter((row) => !kind || kind === "all" || row.kind === kind)
      .filter((row) => {
        if (!fileStatus || fileStatus === "all") return true;
        if (fileStatus === "complete") return row.pdfSaved && row.xmlSaved;
        if (fileStatus === "missing") return !row.pdfSaved || !row.xmlSaved;
        if (fileStatus === "pdf-missing") return !row.pdfSaved;
        if (fileStatus === "xml-missing") return !row.xmlSaved;
        return true;
      })
      .filter((row) => {
        if (!actionStatus || actionStatus === "all") return true;
        if (actionStatus === "needed") return row.actionNeeded;
        if (actionStatus === "clear") return !row.actionNeeded;
        return true;
      })
      .filter((row) => {
        if (!search) return true;
        return [
          row.documentNo,
          row.partnerName,
          row.modelName,
          row.portalStatusText,
          row.scenarioText,
          row.subtypeText,
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR")
          .includes(search);
      })
      .sort((left, right) =>
        right.date.localeCompare(left.date) ||
        right.documentNo.localeCompare(left.documentNo, "tr-TR", { numeric: true }),
      );

    const summary = {
      total: enriched.length,
      incomingInvoices: enriched.filter((row) => row.direction === "incoming" && row.kind === "invoice").length,
      incomingDispatches: enriched.filter((row) => row.direction === "incoming" && row.kind === "dispatch").length,
      outgoingDispatches: enriched.filter((row) => row.direction === "outgoing" && row.kind === "dispatch").length,
      outgoingInvoices: enriched.filter((row) => row.direction === "outgoing" && row.kind === "invoice").length,
      missingFiles: enriched.filter((row) => !row.pdfSaved || !row.xmlSaved).length,
      actionNeeded: enriched.filter((row) => row.actionNeeded).length,
    };
    const pageStart = (page - 1) * pageSize;
    const automation = (automationRow?.value || {}) as Query;
    return {
      rows: enriched.slice(pageStart, pageStart + pageSize),
      total: enriched.length,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(enriched.length / pageSize), 1),
      summary,
      lastSyncAt: automation.lastRunAt || null,
    };
  }
}
