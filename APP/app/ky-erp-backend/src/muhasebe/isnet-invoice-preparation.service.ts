import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IsnetBusinessSettingsService } from "./isnet-business-settings.service";
import { IsnetOperationsService } from "./isnet-operations.service";

type Input = Record<string, any>;

type InvoiceCategory =
  | "MAIN"
  | "TEST_NUMUNESI"
  | "BASKI_SAKATI"
  | "KUMAS_SAKATI";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function arrayValue(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Input {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Input)
    : {};
}

@Injectable()
export class IsnetInvoicePreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: IsnetOperationsService,
    private readonly businessSettings: IsnetBusinessSettingsService,
  ) {}

  private slug(input: Input = {}) {
    const value = clean(input.mainCompanySlug || input.companyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private normalize(value: unknown) {
    return clean(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private category(line: Input): InvoiceCategory {
    const explicit = clean(line.category).toUpperCase();
    if (
      [
        "MAIN",
        "TEST_NUMUNESI",
        "BASKI_SAKATI",
        "KUMAS_SAKATI",
      ].includes(explicit)
    ) {
      return explicit as InvoiceCategory;
    }
    const name = this.normalize(
      line.productName || line.name || line.description,
    );
    if (/TEST NUMUNESI/.test(name)) return "TEST_NUMUNESI";
    if (/BASKI SAKATI/.test(name)) return "BASKI_SAKATI";
    if (/KUMAS SAKATI/.test(name)) return "KUMAS_SAKATI";
    return "MAIN";
  }

  private lineKey(line: Input, index: number) {
    return (
      clean(line.sourceLineId || line.id || line.lineNo) ||
      `${index + 1}:${this.normalize(line.productName || line.description)}`
    );
  }

  private findRequestedLine(
    source: Input,
    sourceIndex: number,
    requested: Input[],
  ) {
    const sourceKey = this.lineKey(source, sourceIndex);
    const sourceName = this.normalize(
      source.productName || source.description,
    );
    return (
      requested.find(
        (row, index) => this.lineKey(row, index) === sourceKey,
      ) ||
      requested.find(
        (row) =>
          this.normalize(row.productName || row.description) === sourceName,
      ) ||
      null
    );
  }

  private replaceTemplate(value: unknown, variables: Input) {
    return clean(value).replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) =>
      clean(variables[key]),
    );
  }

  private prepareLines(
    sourceLines: Input[],
    requestedLines: Input[],
    settings: Input,
    body: Input,
  ) {
    const rules = objectValue(settings.nonBillableRules);
    const prepared: Array<{
      source: Input;
      line: Input;
      category: InvoiceCategory;
    }> = [];
    const excluded: Input[] = [];

    sourceLines.forEach((source, index) => {
      const category = this.category(source);
      const sourceQuantity = numberValue(source.quantity);
      if (!(sourceQuantity > 0)) return;
      const requested =
        this.findRequestedLine(source, index, requestedLines) || source;
      const requestedQuantity = numberValue(
        requested.quantity || sourceQuantity,
      );
      if (Math.abs(requestedQuantity - sourceQuantity) > 0.0001) {
        throw new ConflictException(
          `${index + 1}. satır adedi gönderilmiş irsaliyedeki ${sourceQuantity} adetle aynı olmalıdır.`,
        );
      }

      if (
        category === "BASKI_SAKATI" ||
        category === "KUMAS_SAKATI"
      ) {
        excluded.push({
          ...source,
          category,
          exclusionReason: "DO_NOT_INVOICE",
        });
        return;
      }

      const productName = clean(
        requested.productName ||
          source.productName ||
          source.description ||
          body.modelName,
      );
      if (!productName) {
        throw new BadRequestException(
          `${index + 1}. satır ürün açıklaması bulunamadı.`,
        );
      }

      let unitPrice = numberValue(
        requested.unitPrice ?? body.unitPrice,
      );
      let vatRate = numberValue(
        requested.vatRate ?? body.vatRate ?? 20,
      );
      let taxExemptionReason = "";
      let taxExemptionReasonCode = "";

      if (category === "TEST_NUMUNESI") {
        const rule = objectValue(rules.TEST_NUMUNESI);
        const behavior = clean(
          rule.invoiceBehavior || "ZERO_PRICE_EXEMPT",
        ).toUpperCase();
        if (behavior === "DO_NOT_INVOICE") {
          excluded.push({
            ...source,
            category,
            exclusionReason: "DO_NOT_INVOICE",
          });
          return;
        }
        if (behavior === "ZERO_PRICE_EXEMPT") {
          taxExemptionReasonCode = clean(rule.exemptionCode);
          taxExemptionReason = clean(rule.exemptionReason);
          if (!taxExemptionReasonCode || !taxExemptionReason) {
            throw new BadRequestException(
              "Test numunesi için resmî vergi muafiyet kodu ve açıklaması Ayarlar ekranında kaydedilmelidir. Sistem muafiyet değeri uydurmaz.",
            );
          }
          unitPrice = 0;
          vatRate = 0;
        } else if (!(unitPrice > 0)) {
          throw new BadRequestException(
            "Test numunesi normal faturalanacaksa birim fiyat sıfırdan büyük olmalıdır.",
          );
        }
      } else if (!(unitPrice > 0)) {
        throw new BadRequestException(
          `${productName} satırı için birim fiyat sıfırdan büyük olmalıdır.`,
        );
      }

      if (vatRate < 0 || vatRate > 100) {
        throw new BadRequestException(
          `${productName} satırındaki KDV oranı yüzde 0 ile 100 arasında olmalıdır.`,
        );
      }

      const lineAmount = sourceQuantity * unitPrice;
      const vatAmount = lineAmount * (vatRate / 100);
      prepared.push({
        source,
        category,
        line: {
          sourceLineId: this.lineKey(source, index),
          lineNo: prepared.length + 1,
          category,
          productName,
          description: clean(
            requested.description ||
              source.description ||
              productName,
          ),
          quantity: sourceQuantity,
          measureUnitId: clean(
            requested.measureUnitId || source.measureUnitId || 67,
          ),
          unitPrice,
          vatRate,
          vatAmount,
          subtotal: lineAmount,
          total: lineAmount + vatAmount,
          taxExemptionReason,
          taxExemptionReasonCode,
          modelId: clean(requested.modelId || body.modelId),
        },
      });
    });

    if (!prepared.length) {
      throw new BadRequestException(
        "Faturaya aktarılacak ana ürün veya geçerli test numunesi satırı bulunamadı.",
      );
    }
    return { prepared, excluded };
  }

  async createFromDispatch(idValue: string, body: Input = {}) {
    const slug = this.slug(body);
    const sourceId = clean(idValue);
    if (!/^\d+$/.test(sourceId)) {
      throw new BadRequestException("Giden irsaliye kimliği geçersiz.");
    }
    if (body.confirmed !== true || body.previewApproved !== true) {
      throw new BadRequestException(
        "Fatura önizlemesi ve son kullanıcı onayı zorunludur.",
      );
    }

    const operations = this.operations as any;
    const draft: any = await operations.outgoingDispatchInvoiceDraft(
      sourceId,
      { ...body, mainCompanySlug: slug },
    );
    const recipientId = clean(body.recipientId || draft.recipient?.id);
    if (!recipientId) {
      throw new BadRequestException("Fatura alıcısı doğrulanamadı.");
    }

    const context: any = await this.businessSettings.resolveContext({
      mainCompanySlug: slug,
      companyId: clean(
        body.localCompanyId || draft.recipient?.localCompanyId,
      ),
      companyName: clean(draft.recipientName),
      modelId: clean(body.modelId || draft.modelId),
      modelName: clean(body.modelName || draft.modelName),
    });
    const requestedLines = arrayValue(body.lines);
    const sourceLines = arrayValue(draft.lines);
    const { prepared, excluded } = this.prepareLines(
      sourceLines,
      requestedLines,
      context,
      { ...body, modelName: body.modelName || draft.modelName },
    );
    const lines = prepared.map((row) => row.line);
    const billableSourceLines = prepared.map((row) => row.source);

    const requestState = await operations.beginInvoiceDraftRequest(
      slug,
      sourceId,
      draft.dispatchNo,
    );
    if (requestState.alreadyCompleted) {
      const request = requestState.request;
      return {
        ok: true,
        duplicatePrevented: true,
        verified: [
          "VERIFIED",
          "APPROVED",
          "SUBMITTING",
          "SENT",
          "FILE_DOWNLOAD_PENDING",
          "ACCOUNTING_PENDING",
          "COMPLETED",
        ].includes(clean(request.status)),
        requestId: request.id,
        draftNo: clean(request.draftNo),
        draftId: clean(request.portalDraftId),
        draftVersion: clean(request.draftVersion),
        status: clean(request.status),
        mailPackageId: clean(request.mailPackageId),
        message:
          "Bu irsaliye için fatura taslağı daha önce oluşturuldu; mevcut taslak açıldı.",
      };
    }

    const configured = await operations.configuredPortal(slug);
    const detail = await operations.recipientDetail(
      configured.session,
      "Invoice",
      recipientId,
    );
    const recipient = detail.recipient;
    const tag = detail.tag;
    const recipientTaxNo = clean(
      recipient.Vnktckn || recipient.VKN || recipient.TCKN,
    );

    const products = lines.map((line) => ({
      ProductInvoiceModelId: 0,
      DiscountAmount: 0,
      DiscountRate: 0,
      LineExtensionAmount: numberValue(line.subtotal),
      MeasureUnitId: clean(line.measureUnitId || 67),
      ProductId: 0,
      ProductName: clean(line.productName),
      Quantity: numberValue(line.quantity),
      TaxExemptionReason: clean(line.taxExemptionReason),
      TaxExemptionReasonCode: clean(line.taxExemptionReasonCode),
      UnitPrice: numberValue(line.unitPrice),
      VatAmount: numberValue(line.vatAmount),
      VatRate: numberValue(line.vatRate),
      AdditionalTaxes: [],
      WitholdingTaxes: [],
      Deleted: false,
      DeliveryList: [],
      CustomsTrackingList: [],
      IdisTagNumbers: [],
      StockDescription: clean(line.description),
      SourceLineId: clean(line.sourceLineId),
    }));
    const subtotal = products.reduce(
      (sum, line) => sum + numberValue(line.LineExtensionAmount),
      0,
    );
    const vatTotal = products.reduce(
      (sum, line) => sum + numberValue(line.VatAmount),
      0,
    );
    const invoiceDate = clean(body.invoiceDate) ||
      new Date().toISOString().slice(0, 10);
    const departmentNo = clean(
      body.departmentNo || context.department?.departmentCode,
    );
    const responsibleName = clean(context.responsible?.fullName);
    const notes = [
      ...arrayValue(body.notes).map(clean).filter(Boolean),
      clean(body.modelName || draft.modelName)
        ? `MODEL: ${clean(body.modelName || draft.modelName)}`
        : "",
      departmentNo ? `DEPARTMAN: ${departmentNo}` : "",
      responsibleName ? `TESLİM EDEN: ${responsibleName}` : "",
    ].filter(Boolean);

    const payload = {
      ETTN: "",
      InvoiceId: 0,
      RecipientType: clean(recipient.AliciTipi || 1),
      InvoiceNumber: clean(body.invoiceNo),
      CompanyId: configured.companyId,
      ScenarioType: clean(body.scenarioType || "2"),
      ReceiverInboxTag: tag,
      InvoiceDate: operations.portalInputDate(invoiceDate),
      InvoiceTime:
        clean(body.invoiceTime) ||
        new Date().toLocaleTimeString("tr-TR", { hour12: false }),
      InvoiceType: clean(body.invoiceType || "1"),
      IdFaturaExternal: requestState.identity.externalId,
      OrderDate: "",
      OrderNumber: "",
      LastPaymentDate: operations.portalInputDate(
        body.dueDate || invoiceDate,
      ),
      DispatchList: [
        {
          DispatchNumber: draft.dispatchNo,
          DispatchDate: operations.portalInputDate(draft.dispatchDate),
        },
      ],
      AttachmentList: [],
      IdAlici: recipientId,
      Products: products,
      CurrencyCode: clean(body.currency || "TRY"),
      Notes: notes,
      IsFreeOfCharge: subtotal <= 0,
      KismiIadeMi: false,
      CompanyBankAccountList: [],
      TotalLineExtensionAmount: subtotal,
      TotalVATAmount: vatTotal,
      TotalTaxInclusiveAmount: subtotal + vatTotal,
      TotalDiscountAmount: 0,
      TotalPayableAmount: subtotal + vatTotal,
      RoundCounter: 2,
      IdRepresentative: 0,
      IsSgkMdl: false,
      isCommonPayment: false,
      CommonPaymentType: 0,
    };

    const expectedSnapshot = {
      ...operations.invoiceSnapshot({
        recipientName: clean(recipient.AliciAdi),
        recipientTaxNo,
        dispatchNo: draft.dispatchNo,
        dispatchDate: draft.dispatchDate,
        invoiceDate,
        lines: products,
        subtotal,
        vatTotal,
        grandTotal: subtotal + vatTotal,
        currency: payload.CurrencyCode,
        scenario: payload.ScenarioType,
        invoiceType: payload.InvoiceType,
      }),
      localCompanyId: clean(draft.recipient?.localCompanyId),
      modelName: clean(body.modelName || draft.modelName),
      excludedDispatchLines: excluded,
      departmentNo,
      responsibleName,
    };

    await this.prisma.isnetInvoiceDraftRequest.update({
      where: { id: requestState.request.id },
      data: {
        expectedSnapshot,
        status: "CREATING",
        error: null,
      },
    });
    await operations.reserveInvoiceLineAllocations(
      requestState.request.id,
      draft.dispatchNo,
      billableSourceLines,
      lines,
    );

    let portalResult: any;
    try {
      portalResult = await operations.submitPortalDraft(
        configured.session,
        "/Invoice/Create",
        payload,
      );
    } catch (error: any) {
      await this.prisma.isnetInvoiceDraftRequest.update({
        where: { id: requestState.request.id },
        data: {
          status: "FAILED",
          error:
            clean(error?.message).slice(0, 1000) ||
            "İşNet fatura taslağı oluşturma hatası",
        },
      });
      throw error;
    }

    const draftNo = clean(
      typeof portalResult === "string" || typeof portalResult === "number"
        ? portalResult
        : portalResult?.documentNo,
    );
    const portalDraftId = clean(
      typeof portalResult === "string" || typeof portalResult === "number"
        ? portalResult
        : portalResult?.id ||
            portalResult?.invoiceId ||
            portalResult?.InvoiceId,
    );
    if (!draftNo && !portalDraftId) {
      await this.prisma.isnetInvoiceDraftRequest.update({
        where: { id: requestState.request.id },
        data: {
          status: "VERIFY_PENDING",
          error: "İşNet doğrulanabilir taslak kimliği döndürmedi.",
        },
      });
      throw new BadGatewayException(
        "İşNet taslağı kaydettiğini doğrulayan numara veya kimlik dönmedi. Çift kayıt riskine karşı yeniden gönderim engellendi.",
      );
    }

    await this.prisma.isnetInvoiceDraftRequest.update({
      where: { id: requestState.request.id },
      data: {
        status: "VERIFY_PENDING",
        draftNo: draftNo || portalDraftId,
        portalDraftId: portalDraftId || null,
      },
    });
    const verification = await operations.verifyStoredDraft(
      {
        ...requestState.request,
        expectedSnapshot,
        draftNo: draftNo || portalDraftId,
        portalDraftId: portalDraftId || null,
      },
      configured.session,
    );
    if (!verification.verified) {
      return {
        ok: true,
        verified: false,
        requestId: requestState.request.id,
        draftId: clean(
          verification.request.portalDraftId || portalDraftId,
        ),
        draftNo: clean(verification.request.draftNo || draftNo),
        draftVersion: verification.version,
        verification: {
          differences: verification.differences,
          expected: verification.expected,
          portal: verification.portal,
        },
        excludedLines: excluded,
        status: "VERIFY_FAILED",
        message: `İşNet taslağında ${verification.differences.length} alan farkı bulundu; resmî gönderim engellendi.`,
      };
    }

    const recipientRows = arrayValue(context.combinedRecipients).filter(
      (row) => clean(row.email),
    );
    const variables = {
      MODEL: clean(body.modelName || draft.modelName),
      DEPARTMENT: departmentNo,
      RESPONSIBLE: responsibleName,
      DISPATCH_NO: clean(draft.dispatchNo),
      INVOICE_NO: draftNo || "FATURA TASLAĞI",
    };
    const template = objectValue(context.mailTemplate);
    const mailPackage = await this.prisma.mailPackage.create({
      data: {
        mainCompanySlug: slug,
        companyId: clean(draft.recipient?.localCompanyId) || null,
        modelId: clean(body.modelId || draft.modelId) || null,
        invoiceNo: draftNo || null,
        dispatchNo: draft.dispatchNo || null,
        departmentNo: departmentNo || null,
        toList: recipientRows.map((row) => clean(row.email)),
        ccList: [],
        subject: this.replaceTemplate(
          template.subjectPattern || "{{MODEL}} FATURA",
          variables,
        ),
        body: this.replaceTemplate(
          template.body ||
            "{{MODEL}} modeline ait irsaliye ve fatura ektedir.",
          variables,
        ),
        attachmentsJson: [],
        status: "WAITING_DOCUMENTS",
        raw: {
          source: "ISNET_INVOICE_PREPARATION",
          recipientId,
          contactCount: recipientRows.length,
          responsibleName,
          departmentNo,
          excludedLines: excluded,
          attachmentPolicy: {
            attachDispatchPdf: template.attachDispatchPdf !== false,
            attachInvoicePdf: template.attachInvoicePdf !== false,
            attachXml: template.attachXml === true,
          },
        },
      },
    });
    await this.prisma.isnetInvoiceDraftRequest.update({
      where: { id: requestState.request.id },
      data: { mailPackageId: mailPackage.id },
    });

    return {
      ok: true,
      verified: true,
      requestId: requestState.request.id,
      draftId: clean(
        verification.request.portalDraftId || portalDraftId,
      ),
      draftNo: draftNo || clean(verification.request.draftNo),
      draftVersion: verification.version,
      verification: {
        differences: [],
        expected: verification.expected,
        portal: verification.portal,
      },
      recipientName: clean(recipient.AliciAdi),
      dispatchNo: draft.dispatchNo,
      mailPackageId: mailPackage.id,
      mailRecipientCount: recipientRows.length,
      excludedLines: excluded,
      invoiceLines: lines,
      message: `Fatura taslağı oluşturuldu ve portal satırları doğrulandı. ${recipientRows.length} Outlook alıcısı için irsaliye ve fatura paketi hazırlanıyor.`,
    };
  }
}
