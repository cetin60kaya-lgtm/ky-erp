import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AccountingApiService } from "../muhasebe/accounting-api.service";
import { MuhasebeFinalService } from "../muhasebe/muhasebe-final.service";
import { BoyahaneWorkflowService } from "../modules/boyahane/boyahane-workflow.service";
import { ModelService } from "../modules/models/model.service";
import { safeJsonObject } from "./ai.security";
import { AiDevelopmentService } from "./ai-development.service";

type AiUser = { id: string; role?: string; permissions?: Array<Record<string, any>> };
type ToolContext = { user: AiUser; mainCompanySlug: string; requestMessage?: string };

const MODULE_BY_TOOL: Record<string, string[]> = {
  getSystemSummary: [], searchCompanies: ["MUHASEBE", "FIRMA_CARI"],
  getCompanyBalance: ["MUHASEBE", "FIRMA_CARI"], getCompanyTransactions: ["MUHASEBE", "FIRMA_CARI"],
  searchPersonnel: ["IK"], getPersonnelSummary: ["IK"], getPayrollSummary: ["IK"],
  getManufacturingSummary: ["IMALAT"], searchManufacturingRecords: ["IMALAT"],
  getDeliveryNoteSummary: ["BELGE_ISLEM", "MUHASEBE", "ISNET"], searchDeliveryNotes: ["BELGE_ISLEM", "MUHASEBE", "ISNET"],
  getInvoiceSummary: ["BELGE_ISLEM", "MUHASEBE", "ISNET"], searchInvoices: ["BELGE_ISLEM", "MUHASEBE", "ISNET"],
  compareDeliveryNotesAndInvoices: ["MUHASEBE", "ISNET"], getVatSummary: ["KDV", "MUHASEBE"],
  getAccountingOverview: ["MUHASEBE"],
  getBoyahaneOverview: ["BOYAHANE"], searchBoyahaneJobs: ["BOYAHANE"],
  getModelTrackingOverview: ["DESEN"], searchModelTrackingRecords: ["DESEN"],
  searchDesignModels: ["DESEN"], getRecentOperations: [], getIsnetStatus: ["ISNET"],
  getIsnetDocumentSummary: ["ISNET"], getIsnetRecentErrors: ["ISNET"],
  createCompanyNote: ["MUHASEBE", "FIRMA_CARI"], createPersonnelNote: ["IK"],
  createManufacturingDraft: ["IMALAT"], createAccountingDraft: ["MUHASEBE"],
  matchDeliveryNoteAndInvoice: ["MUHASEBE", "ISNET"], updateRecord: [], archiveRecord: ["BELGE_ISLEM", "MUHASEBE"],
  getDevelopmentOverview: ["ADMIN"], searchProjectCode: ["ADMIN"], readProjectFile: ["ADMIN"],
  inspectDevelopmentErrors: ["ADMIN"], applyCodeEdits: ["ADMIN"], runDevelopmentChecks: ["ADMIN"],
};

const WRITE_TOOLS = new Set([
  "createCompanyNote", "createPersonnelNote", "createManufacturingDraft", "createAccountingDraft",
  "matchDeliveryNoteAndInvoice", "updateRecord", "archiveRecord",
  "applyCodeEdits", "runDevelopmentChecks",
]);

const DEVELOPMENT_TOOLS = new Set([
  "getDevelopmentOverview", "searchProjectCode", "readProjectFile", "inspectDevelopmentErrors",
  "applyCodeEdits", "runDevelopmentChecks",
]);

const schema = (properties: Record<string, any> = {}, required: string[] = []) => ({
  type: "object", properties, required, additionalProperties: false,
});
const textProp = (description: string) => ({ type: "string", description });
const limitProp = { type: "integer", minimum: 1, maximum: 50, description: "Döndürülecek en fazla kayıt" };

const TOOL_DEFINITIONS: any[] = [
  ["getSystemSummary", "Yetkili modüllerde bugünkü genel sistem özetini getirir", schema()],
  ["searchCompanies", "Cari/firma kartlarında ada göre arama yapar", schema({ query: textProp("Firma adı veya vergi numarası"), limit: limitProp }, ["query"])],
  ["getCompanyBalance", "Bir firmanın güncel cari bakiyesini getirir", schema({ companyId: textProp("Firma kimliği") }, ["companyId"])],
  ["getCompanyTransactions", "Firmanın sınırlı sayıdaki son cari hareketlerini getirir", schema({ companyId: textProp("Firma kimliği"), limit: limitProp }, ["companyId"])],
  ["searchPersonnel", "Personel adında arama yapar", schema({ query: textProp("Personel adı"), limit: limitProp }, ["query"])],
  ["getPersonnelSummary", "Aktif/pasif personel sayısını özetler", schema()],
  ["getPayrollSummary", "Ay bazında personel ödeme toplamını özetler", schema({ month: textProp("YYYY-MM") }, ["month"])],
  ["getManufacturingSummary", "Tarih aralığındaki imalat miktarını özetler", schema({ startDate: textProp("YYYY-MM-DD"), endDate: textProp("YYYY-MM-DD") }, ["startDate", "endDate"])],
  ["searchManufacturingRecords", "Model veya sipariş numarasıyla imalat kaydı arar", schema({ query: textProp("Model/sipariş/makine"), limit: limitProp }, ["query"])],
  ["getDeliveryNoteSummary", "Tarih aralığındaki irsaliyeleri özetler", schema({ startDate: textProp("YYYY-MM-DD"), endDate: textProp("YYYY-MM-DD") }, ["startDate", "endDate"])],
  ["searchDeliveryNotes", "İrsaliye numarası veya firma adıyla irsaliye arar", schema({ query: textProp("İrsaliye araması"), limit: limitProp }, ["query"])],
  ["getInvoiceSummary", "Tarih aralığındaki faturaları özetler", schema({ startDate: textProp("YYYY-MM-DD"), endDate: textProp("YYYY-MM-DD") }, ["startDate", "endDate"])],
  ["searchInvoices", "Fatura numarasıyla fatura arar", schema({ query: textProp("Fatura araması"), limit: limitProp }, ["query"])],
  ["compareDeliveryNotesAndInvoices", "İrsaliye-fatura eşleşme durumlarını özetler", schema()],
  ["getVatSummary", "Belirtilen yıl ve ay için kanonik dönem KDV toplamlarını getirir", schema({ year: { type: "integer", minimum: 2020, maximum: 2100 }, month: { type: "integer", minimum: 1, maximum: 12 } }, ["year", "month"])],
  ["getAccountingOverview", "Muhasebe çalışma masasındaki gerçek belge, cari, KDV, mail ve ödeme özetini getirir", schema()],
  ["getBoyahaneOverview", "Boyahane iş emirleri, renk hazırlıkları, lot stokları ve üretim özetini getirir", schema()],
  ["searchBoyahaneJobs", "Model, sipariş veya müşteri adına göre Boyahane iş emri arar", schema({ query: textProp("Model, sipariş veya müşteri araması"), limit: limitProp }, ["query"])],
  ["getModelTrackingOverview", "Model Takip ekranındaki aktif model, üretim ve fatura durumlarının özetini getirir", schema()],
  ["searchModelTrackingRecords", "Model adı, kodu veya sipariş numarasıyla Model Takip kaydı arar", schema({ query: textProp("Model, kod veya sipariş araması"), limit: limitProp }, ["query"])],
  ["searchDesignModels", "Desen ve tasarım kayıtlarında arama yapar", schema({ query: textProp("Tasarım/model adı"), limit: limitProp }, ["query"])],
  ["getRecentOperations", "Yetkili kullanıcının görebileceği son ERP işlemlerini getirir", schema({ limit: limitProp })],
  ["getIsnetStatus", "İşNet kurulum, bağlantı ve otomasyon durumunu gizli değerleri göstermeden özetler", schema()],
  ["getIsnetDocumentSummary", "İşNet belge, çıktı, model eşleşmesi ve arşiv durumlarını özetler", schema()],
  ["getIsnetRecentErrors", "Son İşNet belge/senkronizasyon hatalarını getirir", schema({ limit: limitProp })],
  ["createCompanyNote", "Firma kartına not eklemek için onay isteyen işlem hazırlar", schema({ companyId: textProp("Firma kimliği"), note: textProp("Eklenecek not") }, ["companyId", "note"])],
  ["createPersonnelNote", "Personel kartına iç not eklemek için onay isteyen işlem hazırlar", schema({ personnelId: textProp("Personel kimliği"), note: textProp("Eklenecek not") }, ["personnelId", "note"])],
  ["createManufacturingDraft", "İmalat taslağı oluşturmak için onay isteyen işlem hazırlar", schema({ title: textProp("Taslak başlığı"), details: { type: "object", additionalProperties: true } }, ["title", "details"])],
  ["createAccountingDraft", "Muhasebe taslağı oluşturmak için onay isteyen işlem hazırlar", schema({ title: textProp("Taslak başlığı"), details: { type: "object", additionalProperties: true } }, ["title", "details"])],
  ["matchDeliveryNoteAndInvoice", "İrsaliye satırını fatura satırıyla eşlemek için onay isteyen işlem hazırlar", schema({ dispatchLineId: textProp("İrsaliye satırı kimliği"), invoiceId: textProp("Fatura kimliği"), invoiceLineId: textProp("Fatura satırı kimliği"), matchedQty: { type: "number", minimum: 0 } }, ["dispatchLineId", "invoiceId", "invoiceLineId", "matchedQty"])],
  ["updateRecord", "Yalnızca izinli not alanını güncellemek için onay isteyen işlem hazırlar", schema({ recordType: { type: "string", enum: ["company", "production"] }, recordId: textProp("Kayıt kimliği"), note: textProp("Yeni not") }, ["recordType", "recordId", "note"])],
  ["archiveRecord", "Belgeyi silmeden arşiv durumuna almak için onay isteyen işlem hazırlar", schema({ recordType: { type: "string", enum: ["document"] }, recordId: textProp("Belge kimliği"), reason: textProp("Arşiv nedeni") }, ["recordType", "recordId", "reason"])],
  ["getDevelopmentOverview", "ADMIN geliştirme modunun kapsamını ve güvenlik sınırlarını getirir", schema()],
  ["searchProjectCode", "Frontend ve backend kaynak kodunda metin arar", schema({ query: textProp("Aranacak kod, bileşen, rota veya hata metni"), scope: { type: "string", enum: ["backend", "frontend", "all"] }, limit: limitProp }, ["query"])],
  ["readProjectFile", "İzinli frontend veya backend kaynak dosyasının belirtilen satırlarını okur", schema({ path: textProp("backend/ veya frontend/ ile başlayan proje yolu"), startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 } }, ["path"])],
  ["inspectDevelopmentErrors", "Yerel backend ve frontend servislerinin son hata ve çalışma loglarını inceler", schema({ lines: { type: "integer", minimum: 20, maximum: 300 } })],
  ["applyCodeEdits", "Frontend/backend kaynak dosyalarını oluşturmak veya tam metin eşlemesiyle düzenlemek için açık onay isteyen işlem hazırlar", schema({ summary: textProp("Kullanıcıya gösterilecek kısa değişiklik özeti"), edits: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", properties: { operation: { type: "string", enum: ["create", "replace"] }, path: textProp("backend/ veya frontend/ ile başlayan dosya yolu"), find: textProp("replace için dosyada tam bir kez bulunması gereken metin"), replacement: textProp("Yeni dosya içeriği veya hedef metnin yerine yazılacak içerik") }, required: ["operation", "path", "replacement"], additionalProperties: false } } }, ["summary", "edits"])],
  ["runDevelopmentChecks", "Backend AI test/build ve frontend lint/build kontrollerini çalıştırmak için onay ister", schema({ scope: { type: "string", enum: ["backend", "frontend", "all"] } }, ["scope"])],
].map(([name, description, parameters]) => ({
  type: "function",
  name,
  description,
  parameters,
  // Bazı araçlarda limit gibi isteğe bağlı alanlar var. Responses strict modu
  // bütün property'lerin required olmasını zorunlu tuttuğu için parametreler
  // burada best-effort üretilir ve aşağıda her araç sunucuda tekrar doğrulanır.
  strict: false,
}));

@Injectable()
export class AiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly development: AiDevelopmentService,
    private readonly accounting: AccountingApiService,
    private readonly muhasebeFinal: MuhasebeFinalService,
    private readonly boyahane: BoyahaneWorkflowService,
    private readonly models: ModelService,
  ) {}

  private hasModule(user: AiUser, modules: string[], action = "canView") {
    if (String(user.role || "").toUpperCase() === "ADMIN") return true;
    if (!modules.length) return true;
    return modules.some((moduleKey) => user.permissions?.some((row) =>
      String(row.moduleKey || "").toUpperCase() === moduleKey && row[action] === true));
  }

  assertToolPermission(name: string, user: AiUser, write = false) {
    if (!Object.prototype.hasOwnProperty.call(MODULE_BY_TOOL, name)) throw new ForbiddenException("Bu yapay zekâ aracı kullanıma açık değil.");
    if (DEVELOPMENT_TOOLS.has(name)) this.development.assertAllowed(user);
    const action = write ? "canUpdate" : "canView";
    if (!this.hasModule(user, MODULE_BY_TOOL[name], action)) throw new ForbiddenException("Bu araç için ilgili modül yetkiniz yok.");
    if (write && !this.hasModule(user, ["ASISTAN"], "canApprove")) throw new ForbiddenException("Yapay zekâ işlemlerini onaylama yetkiniz yok.");
  }

  definitionsFor(user: AiUser) {
    return TOOL_DEFINITIONS.filter((tool) => {
      try { this.assertToolPermission(tool.name, user, WRITE_TOOLS.has(tool.name)); return true; } catch { return false; }
    });
  }

  isWriteTool(name: string) { return WRITE_TOOLS.has(name); }

  developmentStatus(user: AiUser) { return this.development.status(user); }

  private limit(value: unknown) { return Math.min(50, Math.max(1, Number(value || 20) || 20)); }
  private date(value: unknown, end = false) {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new BadRequestException("Tarih YYYY-MM-DD biçiminde olmalıdır.");
    return new Date(`${text}T${end ? "23:59:59.999" : "00:00:00.000"}+03:00`);
  }
  private result(data: any, sourceCount: number) { return { success: true, sourceCount, data }; }
  private currentPeriod() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  private requestsCurrentPeriod(message?: string) {
    return /\b(bu\s*ay|güncel|su\s*an|şu\s*an|mevcut\s*ay|bu\s*dönem)\b/i.test(String(message || ""));
  }

  async executeRead(name: string, rawArgs: unknown, context: ToolContext): Promise<any> {
    this.assertToolPermission(name, context.user, false);
    const args = safeJsonObject(rawArgs);
    if (name === "getDevelopmentOverview") return this.development.overview(context.user);
    if (name === "searchProjectCode") return this.development.search(args, context.user);
    if (name === "readProjectFile") return this.development.read(args, context.user);
    if (name === "inspectDevelopmentErrors") return this.development.errors(args, context.user);
    const slug = context.mainCompanySlug;
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    const limit = this.limit(args.limit);

    switch (name) {
      case "getSystemSummary": {
        const visible = (module: string[]) => this.hasModule(context.user, module);
        const [companies, personnel, production, documents, isnetErrors] = await Promise.all([
          visible(["MUHASEBE", "FIRMA_CARI"]) ? this.prisma.company.count({ where: { mainCompanySlug: slug, deletedAt: null } }) : 0,
          visible(["IK"]) ? this.prisma.personnel.count({ where: { mainCompanySlug: slug, isActive: true } }) : 0,
          visible(["IMALAT"]) ? this.prisma.productionRecord.count({ where: { mainCompanySlug: slug } }) : 0,
          visible(["MUHASEBE", "BELGE_ISLEM", "ISNET"]) ? this.prisma.document.count({ where: { mainCompanySlug: slug, deletedAt: null } }) : 0,
          visible(["ISNET"]) ? this.prisma.isnetDocumentState.count({ where: { mainCompanySlug: slug, error: { not: null } } }) : 0,
        ]);
        return this.result({ companies, activePersonnel: personnel, productionRecords: production, documents, isnetErrors }, companies + personnel + production + documents + isnetErrors);
      }
      case "searchCompanies": {
        const q = String(args.query || "").trim();
        const rows = await this.prisma.company.findMany({ where: { mainCompanySlug: slug, deletedAt: null, OR: [{ name: { contains: q } }, { taxNo: { contains: q } }] }, take: limit, orderBy: { name: "asc" }, select: { id: true, name: true, taxNo: true, type: true, currentBalance: true, isActive: true } });
        return this.result(rows, rows.length);
      }
      case "getCompanyBalance": {
        const row = await this.prisma.company.findFirst({ where: { id: String(args.companyId), mainCompanySlug: slug, deletedAt: null }, select: { id: true, name: true, openingBalance: true, currentBalance: true } });
        if (!row) throw new NotFoundException("Firma bulunamadı.");
        return this.result(row, 1);
      }
      case "getCompanyTransactions": {
        const companyId = String(args.companyId || "");
        const company = await this.prisma.company.findFirst({ where: { id: companyId, mainCompanySlug: slug, deletedAt: null }, select: { name: true } });
        if (!company) throw new NotFoundException("Firma bulunamadı.");
        const rows = await this.prisma.currentAccountMovement.findMany({ where: { mainCompanySlug: slug, companyId }, take: limit, orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }], select: { id: true, movementDate: true, movementType: true, documentNo: true, description: true, debit: true, credit: true, balanceAfter: true } });
        return this.result({ company: company.name, rows }, rows.length);
      }
      case "searchPersonnel": {
        const rows = await this.prisma.personnel.findMany({ where: { mainCompanySlug: slug, fullName: { contains: String(args.query || "") } }, take: limit, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, isActive: true } });
        return this.result(rows, rows.length);
      }
      case "getPersonnelSummary": {
        const [active, passive] = await Promise.all([true, false].map((isActive) => this.prisma.personnel.count({ where: { mainCompanySlug: slug, isActive } })));
        return this.result({ active, passive, total: active + passive }, active + passive);
      }
      case "getPayrollSummary": {
        const month = String(args.month || "");
        if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException("Ay YYYY-MM biçiminde olmalıdır.");
        const aggregate = await this.prisma.payrollRecord.aggregate({ where: { mainCompanySlug: slug, month }, _count: true, _sum: { amount: true } });
        return this.result({ month, recordCount: aggregate._count, totalAmount: aggregate._sum.amount || 0 }, aggregate._count);
      }
      case "getManufacturingSummary": {
        const where = { mainCompanySlug: slug, productionDate: { gte: this.date(args.startDate), lte: this.date(args.endDate, true) } };
        const aggregate = await this.prisma.productionRecord.aggregate({ where, _count: true, _sum: { totalQuantity: true } });
        return this.result({ recordCount: aggregate._count, totalQuantity: aggregate._sum.totalQuantity || 0 }, aggregate._count);
      }
      case "searchManufacturingRecords": {
        const q = String(args.query || "");
        const rows = await this.prisma.productionRecord.findMany({ where: { mainCompanySlug: slug, OR: [{ modelName: { contains: q } }, { orderNo: { contains: q } }, { machineName: { contains: q } }] }, take: limit, orderBy: { productionDate: "desc" }, select: { id: true, modelName: true, orderNo: true, machineName: true, totalQuantity: true, productionDate: true, note: true } });
        return this.result(rows, rows.length);
      }
      case "getDeliveryNoteSummary":
      case "getInvoiceSummary": {
        const type = name === "getDeliveryNoteSummary" ? "IRSALIYE" : "FATURA";
        const where = { mainCompanySlug: slug, deletedAt: null, documentType: { contains: type }, date: { gte: this.date(args.startDate), lte: this.date(args.endDate, true) } };
        const aggregate = await this.prisma.document.aggregate({ where, _count: true, _sum: { subtotal: true, vatTotal: true, grandTotal: true } });
        return this.result({ type, recordCount: aggregate._count, subtotal: aggregate._sum.subtotal || 0, vatTotal: aggregate._sum.vatTotal || 0, grandTotal: aggregate._sum.grandTotal || 0 }, aggregate._count);
      }
      case "searchDeliveryNotes":
      case "searchInvoices": {
        const type = name === "searchDeliveryNotes" ? "IRSALIYE" : "FATURA";
        const q = String(args.query || "");
        const rows = await this.prisma.document.findMany({ where: { mainCompanySlug: slug, deletedAt: null, documentType: { contains: type }, documentNo: { contains: q } }, take: limit, orderBy: { date: "desc" }, select: { id: true, documentNo: true, documentType: true, date: true, grandTotal: true, status: true, company: { select: { name: true } } } });
        return this.result(rows, rows.length);
      }
      case "compareDeliveryNotesAndInvoices": {
        const groups = await this.prisma.dispatchInvoiceMatch.groupBy({ by: ["status"], where: { mainCompanySlug: slug }, _count: true });
        const unmatched = await this.prisma.customerDispatchLine.count({ where: { mainCompanySlug: slug, deletedAt: null, durum: { not: "MATCHED" } } });
        return this.result({ matchStatuses: groups, unmatchedDispatchLines: unmatched }, groups.reduce((sum, row) => sum + row._count, 0) + unmatched);
      }
      case "getVatSummary": {
        const current = this.currentPeriod();
        const year = this.requestsCurrentPeriod(context.requestMessage) ? current.year : Number(args.year);
        const month = this.requestsCurrentPeriod(context.requestMessage) ? current.month : Number(args.month);
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new BadRequestException("Geçerli yıl ve ay zorunludur.");
        const summary: any = await this.accounting.vatSummary({ mainCompanySlug: slug, year, month });
        const data = summary?.data || summary;
        return this.result({
          year,
          month,
          source: "KDV dönem kaydı",
          sourceDescription: "Belge-eşitleme kayıtlarından hesaplanan kanonik dönem KDV sonucu.",
          ...data,
        }, Number(data?.belgeSayisi || 0));
      }
      case "getAccountingOverview": {
        const data = await this.muhasebeFinal.yonetimOzeti({ mainCompanySlug: slug });
        return this.result(data, Number(data?.gunlukIsListesi?.length || 0));
      }
      case "getBoyahaneOverview": {
        const report = await this.boyahane.reports({ mainCompanySlug: slug });
        const jobs = (report.jobs || []).slice(0, limit).map((row: any) => ({
          id: row.id, modelName: row.modelName, orderNo: row.orderNo, companyName: row.companyName,
          status: row.status, pendingColorCount: row.pendingColorCount, plannedQuantity: row.plannedQuantity,
        }));
        return this.result({ summary: report.summary, recentJobs: jobs }, jobs.length + Number(report.summary?.activeLots || 0));
      }
      case "searchBoyahaneJobs": {
        const query = String(args.query || "").trim().toLocaleLowerCase("tr-TR");
        if (!query) throw new BadRequestException("Arama metni zorunludur.");
        const rows = (await this.boyahane.listJobs({ mainCompanySlug: slug })).filter((row: any) =>
          [row.modelName, row.orderNo, row.companyName, row.status].some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(query)),
        ).slice(0, limit).map((row: any) => ({
          id: row.id, modelName: row.modelName, orderNo: row.orderNo, companyName: row.companyName,
          status: row.status, preparedColorCount: row.preparedColorCount, pendingColorCount: row.pendingColorCount,
          plannedPaintKg: row.plannedPaintKg,
        }));
        return this.result(rows, rows.length);
      }
      case "getModelTrackingOverview": {
        const response: any = await this.models.list({ mainCompanySlug: slug, pageSize: 5000 });
        const rows = Array.isArray(response) ? response : response.rows || [];
        const statuses = rows.reduce((counts: Record<string, number>, row: any) => {
          const status = String(row.status || "BILINMIYOR"); counts[status] = (counts[status] || 0) + 1; return counts;
        }, {});
        const productionQty = rows.reduce((sum: number, row: any) => sum + Number(row.productionQty || row.uretimAdedi || 0), 0);
        const invoicedQty = rows.reduce((sum: number, row: any) => sum + Number(row.invoicedQty || row.faturaAdedi || 0), 0);
        return this.result({ totalModels: Number(response.total ?? rows.length), statusCounts: statuses, productionQty, invoicedQty }, rows.length);
      }
      case "searchModelTrackingRecords": {
        const query = String(args.query || "").trim();
        if (!query) throw new BadRequestException("Arama metni zorunludur.");
        const response: any = await this.models.list({ mainCompanySlug: slug, q: query, pageSize: limit });
        const rows = (Array.isArray(response) ? response : response.rows || []).slice(0, limit).map((row: any) => ({
          id: row.id, modelName: row.modelName, modelCode: row.modelCode, orderNo: row.orderNo,
          companyName: row.firmaAdi || row.musteriFirma, status: row.status,
          productionQty: row.productionQty || row.uretimAdedi || 0, invoicedQty: row.invoicedQty || row.faturaAdedi || 0,
        }));
        return this.result(rows, rows.length);
      }
      case "searchDesignModels": {
        const q = String(args.query || "");
        const [designs, patterns] = await Promise.all([
          this.prisma.designRecord.findMany({ where: { mainCompanySlug: slug, title: { contains: q } }, take: limit, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, status: true, updatedAt: true } }),
          this.prisma.desenRecord.findMany({ where: { mainCompanySlug: slug, deletedAt: null, name: { contains: q } }, take: limit, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, modelId: true, status: true, updatedAt: true } }),
        ]);
        return this.result({ designs, patterns }, designs.length + patterns.length);
      }
      case "getRecentOperations": {
        const rows = await this.prisma.activityLog.findMany({ where: { mainCompanySlug: slug }, take: limit, orderBy: { createdAt: "desc" }, select: { id: true, module: true, entityType: true, actionType: true, description: true, actor: true, createdAt: true } });
        return this.result(rows, rows.length);
      }
      case "getIsnetStatus": {
        const connection = await this.prisma.setting.findUnique({ where: { scope_mainCompanySlug_key: { scope: "ISNET", mainCompanySlug: slug, key: "CONNECTION" } } });
        const automation = await this.prisma.setting.findUnique({ where: { scope_mainCompanySlug_key: { scope: "ISNET", mainCompanySlug: slug, key: "AUTOMATION" } } });
        const safeConnection: any = connection?.value && typeof connection.value === "object" ? connection.value : {};
        const safeAutomation: any = automation?.value && typeof automation.value === "object" ? automation.value : {};
        return this.result({ configured: Boolean(safeConnection?.username && safeConnection?.companyId), companySelected: Boolean(safeConnection?.companyId), companyName: safeConnection?.companyName || null, apiBaseConfigured: Boolean(process.env.ISNET_API_BASE), automationEnabled: safeAutomation?.enabled === true, lastSyncAt: safeAutomation?.lastSyncAt || null, lastError: safeAutomation?.lastError || null }, connection ? 1 : 0);
      }
      case "getIsnetDocumentSummary": {
        const [total, errors, newDocuments, modelMissing, printPending, completed] = await Promise.all([
          this.prisma.isnetDocumentState.count({ where: { mainCompanySlug: slug } }), this.prisma.isnetDocumentState.count({ where: { mainCompanySlug: slug, error: { not: null } } }),
          this.prisma.isnetDocumentState.count({ where: { mainCompanySlug: slug, newDocument: true } }), this.prisma.isnetDocumentState.count({ where: { mainCompanySlug: slug, modelLinked: false } }),
          this.prisma.isnetDocumentState.count({ where: { mainCompanySlug: slug, printEligible: true, printedAt: null } }), this.prisma.isnetDocumentState.count({ where: { mainCompanySlug: slug, completed: true } }),
        ]);
        return this.result({ total, errors, newDocuments, modelMissing, printPending, completed }, total);
      }
      case "getIsnetRecentErrors": {
        const rows = await this.prisma.isnetDocumentState.findMany({ where: { mainCompanySlug: slug, error: { not: null } }, take: limit, orderBy: { updatedAt: "desc" }, select: { id: true, documentNo: true, kind: true, direction: true, partnerName: true, error: true, lastAttemptAt: true, updatedAt: true } });
        return this.result(rows, rows.length);
      }
      default: throw new BadRequestException("Araç yalnızca onay akışında çalıştırılabilir.");
    }
  }

  prepareWrite(name: string, rawArgs: unknown, context: ToolContext) {
    this.assertToolPermission(name, context.user, true);
    if (!WRITE_TOOLS.has(name)) throw new BadRequestException("Bu işlem onay aracı değildir.");
    const payload = safeJsonObject(rawArgs);
    if (name === "applyCodeEdits") {
      const prepared = this.development.prepareEdits(payload, context.user);
      return { actionType: name, payload: { ...prepared, mainCompanySlug: context.mainCompanySlug }, summary: prepared.summary };
    }
    if (name === "runDevelopmentChecks") {
      const scope = String(payload.scope || "all");
      return { actionType: name, payload: { scope, mainCompanySlug: context.mainCompanySlug }, summary: `${scope} geliştirme testleri çalıştırılacak.` };
    }
    const summary: Record<string, string> = {
      createCompanyNote: "Firma kartına not eklenecek.", createPersonnelNote: "Personel kartına iç not eklenecek.",
      createManufacturingDraft: "İmalat taslağı oluşturulacak.", createAccountingDraft: "Muhasebe taslağı oluşturulacak.",
      matchDeliveryNoteAndInvoice: "İrsaliye ile fatura satırı eşleştirilecek.", updateRecord: "Kayıt notu güncellenecek.",
      archiveRecord: "Belge silinmeden arşiv durumuna alınacak.",
    };
    return { actionType: name, payload: { ...payload, mainCompanySlug: context.mainCompanySlug }, summary: summary[name] };
  }

  async executeConfirmed(name: string, rawPayload: unknown, context: ToolContext) {
    this.assertToolPermission(name, context.user, true);
    const payload = safeJsonObject(rawPayload); const slug = context.mainCompanySlug;
    if (String(payload.mainCompanySlug || "") !== slug) throw new ForbiddenException("İşlem firma bağlamıyla eşleşmiyor.");
    switch (name) {
      case "applyCodeEdits":
        return this.development.applyEdits(payload, context.user);
      case "runDevelopmentChecks": {
        const validation = await this.development.validate(payload.scope, context.user);
        if (!validation.success) throw new BadRequestException(`Geliştirme kontrolleri başarısız: ${validation.results.filter((row) => !row.success).map((row) => row.script).join(", ")}`);
        return { module: "ADMIN", recordType: "development_check", recordId: randomUUID(), before: null, after: { scope: payload.scope, results: validation.results.map(({ script, success }) => ({ script, success })) } };
      }
      case "createCompanyNote":
      case "updateRecord": {
        const recordType = name === "createCompanyNote" ? "company" : String(payload.recordType);
        const id = String(payload.companyId || payload.recordId || ""); const note = String(payload.note || "").trim();
        if (!note || note.length > 2000) throw new BadRequestException("Not 1-2000 karakter olmalıdır.");
        if (recordType === "company") {
          const before = await this.prisma.company.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null }, select: { id: true, name: true, note: true } });
          if (!before) throw new NotFoundException("Firma bulunamadı.");
          const nextNote = name === "createCompanyNote" && before.note ? `${before.note}\n${note}` : note;
          const after = await this.prisma.company.update({ where: { id }, data: { note: nextNote }, select: { id: true, name: true, note: true } });
          return { module: "MUHASEBE", recordType: "company", recordId: id, before, after };
        }
        if (recordType === "production") {
          const before = await this.prisma.productionRecord.findFirst({ where: { id, mainCompanySlug: slug }, select: { id: true, modelName: true, note: true } });
          if (!before) throw new NotFoundException("İmalat kaydı bulunamadı.");
          const after = await this.prisma.productionRecord.update({ where: { id }, data: { note }, select: { id: true, modelName: true, note: true } });
          return { module: "IMALAT", recordType: "production", recordId: id, before, after };
        }
        throw new BadRequestException("Bu kayıt türü güncellenemez.");
      }
      case "createPersonnelNote": {
        const id = String(payload.personnelId || ""); const note = String(payload.note || "").trim();
        const row = await this.prisma.personnel.findFirst({ where: { id, mainCompanySlug: slug } });
        if (!row) throw new NotFoundException("Personel bulunamadı.");
        const raw: any = row.raw && typeof row.raw === "object" ? row.raw : {};
        const before = { id, fullName: row.fullName, aiNotes: Array.isArray(raw.aiNotes) ? raw.aiNotes : [] };
        const aiNotes = [...before.aiNotes, { note, createdAt: new Date().toISOString(), createdBy: context.user.id }].slice(-25);
        const afterRow = await this.prisma.personnel.update({ where: { id }, data: { raw: { ...raw, aiNotes } }, select: { id: true, fullName: true } });
        return { module: "IK", recordType: "personnel", recordId: id, before, after: { ...afterRow, aiNotes } };
      }
      case "createManufacturingDraft":
      case "createAccountingDraft": {
        const module = name === "createManufacturingDraft" ? "IMALAT" : "MUHASEBE";
        const key = `${module}_DRAFT_${randomUUID()}`;
        const after = await this.prisma.setting.create({ data: { scope: "AI_DRAFT", mainCompanySlug: slug, key, value: { title: String(payload.title || "Taslak"), details: payload.details || {}, status: "DRAFT", createdBy: context.user.id } } });
        return { module, recordType: "draft", recordId: after.id, before: null, after: { id: after.id, key, value: after.value } };
      }
      case "matchDeliveryNoteAndInvoice": {
        const invoiceId = String(payload.invoiceId || ""); const invoiceLineId = String(payload.invoiceLineId || ""); const dispatchLineId = String(payload.dispatchLineId || "");
        const [invoice, line] = await Promise.all([
          this.prisma.document.findFirst({ where: { id: invoiceId, mainCompanySlug: slug, deletedAt: null }, select: { id: true, documentNo: true } }),
          this.prisma.customerDispatchLine.findFirst({ where: { id: dispatchLineId, mainCompanySlug: slug, deletedAt: null }, select: { id: true, documentId: true, adet: true } }),
        ]);
        if (!invoice || !line) throw new NotFoundException("İrsaliye veya fatura kaydı bulunamadı.");
        const after = await this.prisma.dispatchInvoiceMatch.create({ data: { mainCompanySlug: slug, dispatchId: line.documentId, dispatchLineId, invoiceId, invoiceLineId, dispatchQty: line.adet || 0, matchedQty: Number(payload.matchedQty || 0), matchType: "AI_CONFIRMED", confidence: 100, isManual: true, approvedBy: context.user.id, approvedAt: new Date(), note: "KY ERP Asistan onayıyla eşleştirildi." } });
        return { module: "MUHASEBE", recordType: "dispatch_invoice_match", recordId: after.id, before: null, after };
      }
      case "archiveRecord": {
        const id = String(payload.recordId || "");
        const before = await this.prisma.document.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null }, select: { id: true, documentNo: true, status: true, metadata: true } });
        if (!before) throw new NotFoundException("Belge bulunamadı.");
        const metadata: any = before.metadata && typeof before.metadata === "object" ? before.metadata : {};
        const after = await this.prisma.document.update({ where: { id }, data: { status: "ARSIVLENDI", metadata: { ...metadata, aiArchiveReason: String(payload.reason || ""), aiArchivedAt: new Date().toISOString(), aiArchivedBy: context.user.id } }, select: { id: true, documentNo: true, status: true, metadata: true } });
        return { module: "BELGE_ISLEM", recordType: "document", recordId: id, before, after };
      }
      default: throw new BadRequestException("Onaylanan işlem desteklenmiyor.");
    }
  }
}
