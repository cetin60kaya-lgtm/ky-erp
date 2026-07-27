import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";

type CompanyScope = { mainCompanySlug: string; mainCompanyId?: string };

function asString(value: any) {
  return String(value ?? "").trim();
}

function asDate(value: any) {
  const raw = asString(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function asNumber(value: any) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function truthy(value: any, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "evet", "yes", "aktif"].includes(
    String(value).toLowerCase(),
  );
}

@Injectable()
export class MuhasebeIntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  private db(): any {
    return this.prisma as any;
  }

  scope(mainCompanySlug?: string, mainCompanyId?: string): CompanyScope {
    const slug = asString(mainCompanySlug || mainCompanyId || "mecit-hakan");
    if (!slug) throw new BadRequestException("mainCompanySlug zorunludur");
    return { mainCompanySlug: slug, mainCompanyId: asString(mainCompanyId) || undefined };
  }

  private personPayload(scope: CompanyScope, body: any) {
    return {
      mainCompanyId: asString(body.mainCompanyId || scope.mainCompanyId) || null,
      mainCompanySlug: scope.mainCompanySlug,
      firmId: asString(body.firmId || body.companyId) || null,
      firmName: asString(body.firmName || body.companyName || body.firma) || null,
      departmentCode: asString(body.departmentCode || body.departmentNo) || null,
      departmentName: asString(body.departmentName || body.department) || null,
      fullName: asString(body.fullName || body.name || body.adSoyad),
      email: asString(body.email || body.eposta),
      phone: asString(body.phone || body.telefon) || null,
      title: asString(body.title || body.gorev) || null,
      canReceiveInvoiceMail: truthy(body.canReceiveInvoiceMail, true),
      canReceiveDispatchMail: truthy(body.canReceiveDispatchMail, true),
      canReceiveStatementReminder: truthy(body.canReceiveStatementReminder, true),
      canReceiveModelNotification: truthy(body.canReceiveModelNotification, false),
      note: asString(body.note || body.not) || null,
      isActive: truthy(body.isActive ?? body.active, true),
    };
  }

  listContactPeople(scope: CompanyScope, query: any = {}) {
    return this.db().muhasebeContactPerson.findMany({
      where: {
        mainCompanySlug: scope.mainCompanySlug,
        ...(query.includePassive ? {} : { isActive: true }),
        ...(query.firmId ? { firmId: String(query.firmId) } : {}),
        ...(query.departmentCode ? { departmentCode: String(query.departmentCode) } : {}),
      },
      orderBy: [{ firmName: "asc" }, { departmentCode: "asc" }, { fullName: "asc" }],
    });
  }

  createContactPerson(scope: CompanyScope, body: any) {
    const data = this.personPayload(scope, body);
    if (!data.fullName || !data.email) {
      throw new BadRequestException("Ad Soyad ve e-posta zorunludur");
    }
    return this.db().muhasebeContactPerson.create({ data });
  }

  updateContactPerson(scope: CompanyScope, id: string, body: any) {
    return this.db().muhasebeContactPerson.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: this.personPayload(scope, body),
    }).then(async (result: any) => {
      if (!result.count) throw new NotFoundException("Kişi kartı bulunamadı");
      return this.db().muhasebeContactPerson.findUnique({ where: { id } });
    });
  }

  passiveContactPerson(scope: CompanyScope, id: string) {
    return this.db().muhasebeContactPerson.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: { isActive: false },
    });
  }

  listContactDepartments(scope: CompanyScope, query: any = {}) {
    return this.db().muhasebeContactDepartment.findMany({
      where: {
        mainCompanySlug: scope.mainCompanySlug,
        ...(query.includePassive ? {} : { isActive: true }),
        ...(query.firmId ? { firmId: String(query.firmId) } : {}),
      },
      orderBy: [{ firmName: "asc" }, { departmentCode: "asc" }],
    });
  }

  upsertContactDepartment(scope: CompanyScope, body: any, id?: string) {
    const data = {
      mainCompanyId: asString(body.mainCompanyId || scope.mainCompanyId) || null,
      mainCompanySlug: scope.mainCompanySlug,
      firmId: asString(body.firmId || body.companyId) || null,
      firmName: asString(body.firmName || body.companyName || body.firma) || null,
      departmentCode: asString(body.departmentCode || body.departmentNo),
      departmentName: asString(body.departmentName || body.department) || null,
      usageNote: asString(body.usageNote || body.note) || null,
      isActive: truthy(body.isActive ?? body.active, true),
    };
    if (!data.departmentCode) throw new BadRequestException("Departman kodu zorunludur");
    return id
      ? this.db().muhasebeContactDepartment.update({ where: { id }, data })
      : this.db().muhasebeContactDepartment.create({ data });
  }

  passiveContactDepartment(scope: CompanyScope, id: string) {
    return this.db().muhasebeContactDepartment.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: { isActive: false },
    });
  }

  listMailLogs(scope: CompanyScope, query: any = {}) {
    return this.db().muhasebeMailSendLog.findMany({
      where: {
        mainCompanySlug: scope.mainCompanySlug,
        ...(query.firmId ? { firmId: String(query.firmId) } : {}),
        ...(query.status ? { status: String(query.status) } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(Number(query.limit || 100), 500),
    });
  }

  async prepareMailLog(scope: CompanyScope, body: any) {
    const contactIds = Array.isArray(body.contactPersonIds) ? body.contactPersonIds : [];
    const contacts = contactIds.length
      ? await this.db().muhasebeContactPerson.findMany({
          where: { mainCompanySlug: scope.mainCompanySlug, id: { in: contactIds } },
        })
      : [];
    const recipientEmails = contacts.map((item: any) => item.email).filter(Boolean);
    const recipientPhones = contacts.map((item: any) => item.phone).filter(Boolean);
    return this.db().muhasebeMailSendLog.create({
      data: {
        mainCompanyId: asString(body.mainCompanyId || scope.mainCompanyId) || null,
        mainCompanySlug: scope.mainCompanySlug,
        firmId: asString(body.firmId || body.companyId) || null,
        firmName: asString(body.firmName || body.companyName || body.firma) || null,
        departmentCode: asString(body.departmentCode || body.departmentNo) || null,
        departmentName: asString(body.departmentName || body.department) || null,
        contactPersonIds: contactIds,
        recipientEmails: body.recipientEmails || recipientEmails,
        recipientPhones: body.recipientPhones || recipientPhones,
        invoiceNo: asString(body.invoiceNo) || null,
        dispatchNo: asString(body.dispatchNo) || null,
        documentId: asString(body.documentId) || null,
        modelId: asString(body.modelId) || null,
        modelName: asString(body.modelName) || null,
        subject: asString(body.subject) || null,
        body: asString(body.body) || null,
        status: asString(body.status) || "PREPARED",
        statementStatus: asString(body.statementStatus) || "UNKNOWN",
        note: asString(body.note) || null,
      },
    });
  }

  markMailSent(scope: CompanyScope, id: string) {
    return this.db().muhasebeMailSendLog.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  async createReminder(scope: CompanyScope, id: string, body: any = {}) {
    const existing = await this.db().muhasebeMailSendLog.findFirst({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
    });
    if (!existing) throw new NotFoundException("Mail log bulunamadı");
    return this.db().muhasebeMailSendLog.update({
      where: { id },
      data: {
        reminderCount: Number(existing.reminderCount || 0) + 1,
        lastReminderAt: new Date(),
        lastReminderStatus: asString(body.status) || "PREPARED",
        status: existing.status || "PREPARED",
      },
    });
  }

  updateMailLog(scope: CompanyScope, id: string, body: any) {
    return this.db().muhasebeMailSendLog.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: {
        statementStatus: asString(body.statementStatus) || undefined,
        status: asString(body.status) || undefined,
        note: body.note,
        subject: body.subject,
        body: body.body,
      },
    });
  }

  listStatements(scope: CompanyScope) {
    return this.db().muhasebeStatementImport.findMany({
      where: { mainCompanySlug: scope.mainCompanySlug },
      orderBy: { createdAt: "desc" },
    });
  }

  createStatementImport(scope: CompanyScope, file: any, body: any = {}) {
    return this.db().muhasebeStatementImport.create({
      data: {
        mainCompanyId: asString(body.mainCompanyId || scope.mainCompanyId) || null,
        mainCompanySlug: scope.mainCompanySlug,
        firmId: asString(body.firmId || body.companyId) || null,
        firmName: asString(body.firmName || body.companyName || body.firma) || null,
        fileName: file?.originalname || asString(body.fileName) || null,
        filePath: file?.path || asString(body.filePath) || null,
        fileType: file?.mimetype || asString(body.fileType) || null,
        importedAt: new Date(),
        status: "UPLOADED",
        rowCount: Number(body.rowCount || 0),
        note: asString(body.note) || null,
      },
    });
  }

  async compareStatement(scope: CompanyScope, id: string, body: any = {}) {
    await this.db().muhasebeStatementImport.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: { status: "COMPARED" },
    });
    const ourAmount = asNumber(body.ourAmount) ?? 8488;
    const statementAmount = body.statementAmount === undefined ? undefined : asNumber(body.statementAmount);
    const status =
      statementAmount === undefined
        ? "MISSING_IN_STATEMENT"
        : statementAmount === ourAmount
          ? "MATCHED"
          : "AMOUNT_DIFF";
    const difference =
      statementAmount === undefined ? ourAmount : Number((ourAmount - statementAmount).toFixed(2));
    return this.db().muhasebeStatementCompareResult.create({
      data: {
        mainCompanyId: asString(body.mainCompanyId || scope.mainCompanyId) || null,
        mainCompanySlug: scope.mainCompanySlug,
        firmId: asString(body.firmId || body.companyId) || null,
        firmName: asString(body.firmName || body.companyName || body.firma) || null,
        statementImportId: id,
        invoiceNo: asString(body.invoiceNo) || "HKN202600000415",
        ourAmount,
        statementAmount,
        difference,
        status,
        reminderNeeded: status !== "MATCHED",
        note: asString(body.note) || null,
      },
    });
  }

  listStatementResults(scope: CompanyScope, query: any = {}) {
    return this.db().muhasebeStatementCompareResult.findMany({
      where: {
        mainCompanySlug: scope.mainCompanySlug,
        ...(query.status ? { status: String(query.status) } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async reminderFromStatementResult(scope: CompanyScope, resultId: string) {
    const result = await this.db().muhasebeStatementCompareResult.findFirst({
      where: { id: resultId, mainCompanySlug: scope.mainCompanySlug },
    });
    if (!result) throw new NotFoundException("Ekstre karşılaştırma sonucu bulunamadı");
    const previous = await this.db().muhasebeMailSendLog.findFirst({
      where: { mainCompanySlug: scope.mainCompanySlug, invoiceNo: result.invoiceNo },
      orderBy: { createdAt: "desc" },
    });
    if (!previous) throw new BadRequestException("Önce mail gönderim kaydı yok");
    const log = await this.createReminder(scope, previous.id);
    await this.db().muhasebeStatementCompareResult.update({
      where: { id: resultId },
      data: { relatedMailLogId: log.id || previous?.id, reminderNeeded: false },
    });
    return log;
  }

  listSupplierLots(scope: CompanyScope) {
    return this.db().muhasebeSupplierInvoiceLot.findMany({
      where: { mainCompanySlug: scope.mainCompanySlug },
      orderBy: { createdAt: "desc" },
    });
  }

  upsertSupplierLot(scope: CompanyScope, body: any, id?: string) {
    const lotNo = asString(body.lotNo);
    const productName = asString(body.productName || body.productAlias);
    const status =
      asString(body.status) ||
      (lotNo && productName ? "BOYAHANEYE_AKTARILDI" : lotNo ? "HAZIR" : "LOT_BEKLIYOR");
    const data = {
      mainCompanyId: asString(body.mainCompanyId || scope.mainCompanyId) || null,
      mainCompanySlug: scope.mainCompanySlug,
      supplierInvoiceId: asString(body.supplierInvoiceId) || null,
      invoiceNo: asString(body.invoiceNo) || null,
      supplierFirmId: asString(body.supplierFirmId || body.firmId) || null,
      supplierFirmName: asString(body.supplierFirmName || body.firmName) || null,
      productId: asString(body.productId) || null,
      productName: productName || null,
      productAlias: asString(body.productAlias) || null,
      lotNo: lotNo || null,
      purchaseDate: asDate(body.purchaseDate),
      expiryDate: asDate(body.expiryDate),
      quantity: asNumber(body.quantity),
      unit: asString(body.unit) || null,
      unitPrice: asNumber(body.unitPrice),
      totalAmount: asNumber(body.totalAmount),
      status,
      boyaStockLotId:
        status === "BOYAHANEYE_AKTARILDI"
          ? asString(body.boyaStockLotId) || (id ? `TODO-BOYAHANE-${id}` : `TODO-BOYAHANE-${Date.now()}`)
          : asString(body.boyaStockLotId) || null,
      note: asString(body.note) || null,
    };
    return id
      ? this.db().muhasebeSupplierInvoiceLot.update({ where: { id }, data })
      : this.db().muhasebeSupplierInvoiceLot.create({ data });
  }

  async transferSupplierLot(scope: CompanyScope, id: string) {
    const lot = await this.db().muhasebeSupplierInvoiceLot.findFirst({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
    });
    if (!lot) throw new NotFoundException("Lot bulunamadı");
    if (!lot.lotNo) throw new BadRequestException("Lot no olmadan boyahaneye aktarılamaz");
    return this.db().muhasebeSupplierInvoiceLot.update({
      where: { id },
      data: {
        status: "BOYAHANEYE_AKTARILDI",
        boyaStockLotId: lot.boyaStockLotId || `TODO-BOYAHANE-${id}`,
      },
    });
  }

  passiveSupplierLot(scope: CompanyScope, id: string) {
    return this.db().muhasebeSupplierInvoiceLot.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: { status: "PASIF" },
    });
  }

  listManualDispatches(scope: CompanyScope) {
    return this.db().muhasebeManualCustomerDispatch.findMany({
      where: { mainCompanySlug: scope.mainCompanySlug },
      orderBy: { createdAt: "desc" },
    });
  }

  upsertManualDispatch(scope: CompanyScope, body: any, id?: string) {
    const suggestedModelName = asString(body.suggestedModelName || body.modelAdi);
    const data = {
      mainCompanyId: asString(body.mainCompanyId || scope.mainCompanyId) || null,
      mainCompanySlug: scope.mainCompanySlug,
      firmId: asString(body.firmId || body.companyId) || null,
      firmName: asString(body.firmName || body.companyName || body.firma) || null,
      dispatchNo: asString(body.dispatchNo || body.irsaliyeNo) || null,
      dispatchDate: asDate(body.dispatchDate || body.tarih),
      rawDescription: asString(body.rawDescription || body.aciklama) || null,
      suggestedModelId: asString(body.suggestedModelId) || null,
      suggestedModelName: suggestedModelName || null,
      suggestionConfidence: Number(body.suggestionConfidence || (suggestedModelName ? 85 : 0)) || null,
      linkedModelId: asString(body.linkedModelId) || null,
      linkedModelName: asString(body.linkedModelName) || null,
      groundColor: asString(body.groundColor || body.zemin) || null,
      quantity: asNumber(body.quantity || body.gelenAdet),
      status: asString(body.status) || (suggestedModelName ? "ONERI_BEKLIYOR" : "MODEL_BEKLIYOR"),
      note: asString(body.note) || null,
    };
    return id
      ? this.db().muhasebeManualCustomerDispatch.update({ where: { id }, data })
      : this.db().muhasebeManualCustomerDispatch.create({ data });
  }

  approveManualSuggestion(scope: CompanyScope, id: string) {
    return this.db().muhasebeManualCustomerDispatch.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: { status: "MODELE_BAGLANDI" },
    });
  }

  linkManualModel(scope: CompanyScope, id: string, body: any) {
    return this.db().muhasebeManualCustomerDispatch.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: {
        linkedModelId: asString(body.modelId || body.linkedModelId) || null,
        linkedModelName: asString(body.modelName || body.linkedModelName) || null,
        status: "MODELE_BAGLANDI",
      },
    });
  }

  createModelAndLink(scope: CompanyScope, id: string, body: any) {
    return this.db().muhasebeManualCustomerDispatch.updateMany({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
      data: {
        linkedModelId: asString(body.modelId) || `NEW-${id}`,
        linkedModelName: asString(body.modelName || body.modelAdi) || null,
        status: "MODELE_BAGLANDI",
      },
    });
  }

  async updateCheckImage(scope: CompanyScope, id: string, side: "front" | "back", file: any) {
    if (!file?.path) throw new BadRequestException("Görsel dosyası zorunludur");
    const check = await this.db().check.findFirst({
      where: { id, mainCompanySlug: scope.mainCompanySlug },
    });
    if (!check) throw new NotFoundException("Çek bulunamadı");
    const raw = check.raw && typeof check.raw === "object" ? check.raw : {};
    const storageRoot = path.join(process.cwd(), "storage");
    const publicPath = path.relative(storageRoot, file.path).replace(/\\/g, "/");
    const nextRaw = {
      ...raw,
      [`${side}ImagePath`]: file.path,
      [`${side}ImageUrl`]: `/storage/${publicPath}`,
    };
    return this.db().check.update({ where: { id }, data: { raw: nextRaw } });
  }

  ensureUploadDir(...parts: string[]) {
    const dir = path.join(process.cwd(), "storage", ...parts);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}
