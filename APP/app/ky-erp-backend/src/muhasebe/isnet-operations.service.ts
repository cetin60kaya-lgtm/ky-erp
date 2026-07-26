import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { XMLParser } from "fast-xml-parser";
import { PDFDocument } from "pdf-lib";
import { PrismaService } from "../prisma/prisma.service";
import { ModelService } from "../modules/models/model.service";
import { DocumentIntakeServiceV2 } from "./document-intake/document-intake.service";
import { DocumentMatcherService } from "./document-intake/document-matcher.service";

type Query = Record<string, any>;

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const objectValue = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
const arrayValue = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];
const dateText = (value: unknown) => {
  const date = value ? new Date(value as any) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("tr-TR")
    : "-";
};

type IsnetCompanyOption = {
  id: string;
  parentId: string;
  name: string;
  schemaName: string;
  hasRole: boolean;
};

type PortalDocumentKind = "invoice" | "dispatch";
type PortalDocumentDirection = "incoming" | "outgoing";

type PortalDocumentSource = {
  kind: PortalDocumentKind;
  direction: PortalDocumentDirection;
  page: string;
  endpoint: string;
};

@Injectable()
export class IsnetOperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IsnetOperationsService.name);
  private readonly activeSyncs = new Map<string, Promise<any>>();
  private readonly activeInvoiceSubmissions = new Map<string, Promise<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentIntake: DocumentIntakeServiceV2,
    private readonly documentMatcher: DocumentMatcherService,
    private readonly modelService: ModelService,
  ) {}

  // İşNet bağlantısı yalnızca kullanıcı tarafından açıkça başlatılan sync() çağrısında açılır.
  onModuleInit() {}

  onModuleDestroy() {}

  private slug(input: Query) {
    const slug = clean(input.mainCompanySlug || input.companyId);
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return slug;
  }

  private invoiceDraftIdentity(slug: string, sourceId: string, dispatchNo: string) {
    const source = clean(sourceId || dispatchNo);
    if (!source) throw new BadRequestException("Fatura taslağı için irsaliye kimliği zorunludur.");
    const digest = createHash("sha256")
      .update(`${slug}:${source}`)
      .digest("hex")
      .slice(0, 24)
      .toUpperCase();
    return {
      idempotencyKey: `DISPATCH:${source}`,
      externalId: `KYERP-${digest}`,
    };
  }

  private async beginInvoiceDraftRequest(
    slug: string,
    sourceId: string,
    dispatchNo: string,
  ) {
    const identity = this.invoiceDraftIdentity(slug, sourceId, dispatchNo);
    try {
      const request = await this.prisma.isnetInvoiceDraftRequest.create({
        data: { ...identity, mainCompanySlug: slug, sourceId: clean(sourceId) || null, dispatchNo: clean(dispatchNo) || null },
      });
      return { request, identity };
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
      const request = await this.prisma.isnetInvoiceDraftRequest.findUnique({
        where: { mainCompanySlug_idempotencyKey: { mainCompanySlug: slug, idempotencyKey: identity.idempotencyKey } },
      });
      if (request?.portalDraftId) return { request, identity, alreadyCompleted: true };
      if (["VERIFIED", "FINAL_APPROVAL_PENDING", "APPROVED", "SUBMITTING", "SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING", "COMPLETED"].includes(clean(request?.status))) {
        return { request, identity, alreadyCompleted: true };
      }
      if (request?.status === "VERIFY_PENDING") {
        throw new ConflictException("İşNet taslağı oluşturulmuş olabilir ancak geri okuma doğrulanamadı. Çift kayıt riskini önlemek için bu irsaliyede otomatik yeniden deneme engellendi.");
      }
      if (request?.status === "CREATING") {
        throw new ConflictException("Bu irsaliye için fatura taslağı oluşturma işlemi halen sürüyor.");
      }
      const retried = await this.prisma.isnetInvoiceDraftRequest.update({
        where: { id: request?.id },
        data: { status: "CREATING", error: null, draftNo: null, mailPackageId: null },
      });
      return { request: retried, identity };
    }
  }

  private isnetBaseUrl() {
    return (
      clean(process.env.ISNET_API_BASE) || "https://einvoiceapi.isnet.net.tr"
    );
  }

  private secretKeyPath() {
    const localRoot =
      clean(process.env.LOCALAPPDATA) ||
      path.join(os.homedir(), "AppData", "Local");
    return path.join(localRoot, "KYERP", "secrets", "isnet-settings.key");
  }

  private encryptionKey() {
    const filePath = this.secretKeyPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath)) {
      const existing = Buffer.from(
        clean(fs.readFileSync(filePath, "utf8")),
        "base64",
      );
      if (existing.length === 32) return existing;
    }
    const key = randomBytes(32);
    fs.writeFileSync(filePath, key.toString("base64"), {
      encoding: "utf8",
      mode: 0o600,
    });
    return key;
  }

  private encryptSecret(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      encrypted.toString("base64"),
    ].join(".");
  }

  private decryptSecret(value: unknown) {
    const [version, iv, tag, encrypted] = clean(value).split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) return "";
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.encryptionKey(),
        Buffer.from(iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      return "";
    }
  }

  private async connectionRow(slug: string) {
    return this.prisma.setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "CONNECTION",
        },
      },
    });
  }

  private connectionValue(row: any) {
    return objectValue(row?.value);
  }

  private async configuredPortal(slug: string) {
    const row = await this.connectionRow(slug);
    const settings = this.connectionValue(row);
    const username = clean(settings.username || process.env.ISNET_USERNAME);
    const password =
      this.decryptSecret(settings.passwordEncrypted) ||
      clean(process.env.ISNET_PASSWORD);
    const companyId = clean(settings.companyId || process.env.ISNET_COMPANY_ID);
    const companyName = clean(settings.companyName);
    if (!username || !password || !companyId || !companyName) {
      throw new BadRequestException(
        "Önce İşNet bağlantısını ve firmayı Ayarlar ekranından kaydedin.",
      );
    }
    return {
      companyId,
      companyName,
      session: await this.openPortalCompanySession(
        username,
        password,
        companyId,
        companyName,
      ),
    };
  }

  private async portalJson(
    session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>,
    url: string,
  ) {
    const response = await session.request(url, {
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!response.ok || response.status === 302) {
      throw new BadGatewayException("İşNet beklenen veriyi döndürmedi.");
    }
    return payload;
  }

  private normalizeCompanies(payload: any): IsnetCompanyOption[] {
    const source = Array.isArray(payload?.CompanyList)
      ? payload.CompanyList
      : Array.isArray(payload?.companyList)
        ? payload.companyList
        : Array.isArray(payload?.options)
          ? payload.options
          : Array.isArray(payload)
            ? payload
            : [];
    return source
      .map((row: any) => ({
        id: clean(row?.IdFirma ?? row?.idFirma ?? row?.CompanyId),
        parentId: clean(row?.IdAnaFirma ?? row?.idAnaFirma),
        name: clean(row?.FirmaAdi ?? row?.firmaAdi ?? row?.CompanyName),
        schemaName: clean(row?.SchemaName ?? row?.schemaName),
        hasRole: row?.UserHasRole !== false,
      }))
      .filter((row: IsnetCompanyOption) => row.id && row.name && row.hasRole);
  }

  private mergeResponseCookies(response: Response, jar: Map<string, string>) {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const values =
      headers.getSetCookie?.() ||
      (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
    for (const value of values) {
      const pair = clean(value.split(";", 1)[0]);
      const separator = pair.indexOf("=");
      if (separator > 0) {
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
    }
  }

  private cookieHeader(jar: Map<string, string>) {
    return [...jar.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  private verificationToken(html: string) {
    return clean(
      html.match(
        /name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i,
      )?.[1],
    );
  }

  private async loginToPortal(username: string, password: string) {
    const portalBase = "https://nettefatura.isnet.net.tr";
    const jar = new Map<string, string>();
    const commonHeaders = {
      Accept: "text/html,application/xhtml+xml,application/json",
      "User-Agent": "KY-ERP-IsNet-Connector/1.0",
    };

    const loginPage = await fetch(`${portalBase}/Account/Login`, {
      headers: commonHeaders,
      redirect: "manual",
    });
    this.mergeResponseCookies(loginPage, jar);
    const loginHtml = await loginPage.text();
    const token = this.verificationToken(loginHtml);
    if (!loginPage.ok || !token) {
      throw new BadGatewayException(
        "İşNet portal giriş sayfasına ulaşılamadı.",
      );
    }

    const loginResponse = await fetch(`${portalBase}/Account/Login`, {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.cookieHeader(jar),
        Origin: portalBase,
        Referer: `${portalBase}/Account/Login`,
      },
      body: new URLSearchParams({
        VknTckn: username,
        Password: password,
        RememberMe: "false",
        __RequestVerificationToken: token,
      }).toString(),
      redirect: "manual",
    });
    this.mergeResponseCookies(loginResponse, jar);
    const loginResult = await loginResponse.text();

    const companyResponse = await fetch(
      `${portalBase}/Account/GetCompanyList`,
      {
        method: "POST",
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Cookie: this.cookieHeader(jar),
          Origin: portalBase,
          Referer: `${portalBase}/Account/Login`,
          "User-Agent": commonHeaders["User-Agent"],
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams({ q: "" }).toString(),
        redirect: "manual",
      },
    );
    const companyRaw = await companyResponse.text();
    let companyPayload: any = {};
    try {
      companyPayload = companyRaw ? JSON.parse(companyRaw) : {};
    } catch {
      companyPayload = {};
    }
    const companies = this.normalizeCompanies(companyPayload);
    if (companies.length) {
      return { companies, expiresOn: null, connectionMode: "portal" };
    }

    const redirectLocation = clean(loginResponse.headers.get("location"));
    const redirectedAwayFromLogin =
      loginResponse.status >= 300 &&
      loginResponse.status < 400 &&
      !redirectLocation.toLocaleLowerCase("tr-TR").includes("account/login");
    if (redirectedAwayFromLogin) {
      throw new BadRequestException(
        "İşNet portal girişi doğrulandı ancak yetkili firma listesi alınamadı. Portalda firma seçimini kontrol edip tekrar deneyin.",
      );
    }
    if (
      companyResponse.status >= 500 ||
      loginResult.toLocaleLowerCase("tr-TR").includes("<title>error</title>")
    ) {
      throw new BadGatewayException(
        "İşNet portal firma servisi yanıt vermedi.",
      );
    }
    throw new BadRequestException(
      "İşNet portalı kullanıcı adı veya şifreyi kabul etmedi. KY ERP oturumunuz açık kalacak.",
    );
  }

  private async openPortalCompanySession(
    username: string,
    password: string,
    companyId: string,
    companyName: string,
  ) {
    const portalBase = "https://nettefatura.isnet.net.tr";
    const jar = new Map<string, string>();
    const request = async (url: string, init: RequestInit = {}) => {
      const response = await fetch(`${portalBase}${url}`, {
        ...init,
        headers: {
          "User-Agent": "KY-ERP-IsNet-Connector/1.0",
          ...(init.headers || {}),
          ...(jar.size ? { Cookie: this.cookieHeader(jar) } : {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      this.mergeResponseCookies(response, jar);
      return response;
    };

    let response = await request("/Account/Login");
    let html = await response.text();
    let token = this.verificationToken(html);
    if (!response.ok || !token) {
      throw new BadGatewayException(
        "İşNet portal giriş sayfasına ulaşılamadı.",
      );
    }

    response = await request("/Account/Login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: portalBase,
        Referer: `${portalBase}/Account/Login`,
      },
      body: new URLSearchParams({
        VknTckn: username,
        Password: password,
        RememberMe: "false",
        __RequestVerificationToken: token,
      }).toString(),
    });
    html = await response.text();
    token = this.verificationToken(html);
    if (!token) {
      throw new BadRequestException("İşNet portal firma seçimi başlatılamadı.");
    }

    response = await request("/Account/Login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: portalBase,
        Referer: `${portalBase}/Account/Login`,
      },
      body: new URLSearchParams({
        VknTckn: username,
        Password: password,
        "validation[Companylist]": companyName,
        CompanyId: companyId,
        RememberMe: "false",
        __RequestVerificationToken: token,
      }).toString(),
    });
    const location = clean(response.headers.get("location"));
    if (response.status !== 302 || location !== "/") {
      throw new BadRequestException(
        "İşNet firmasıyla portal oturumu açılamadı. Ayarlardan bağlantıyı yeniden test edin.",
      );
    }
    return { request, portalBase };
  }

  private portalDate(value: string) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  }

  private portalDateRange(query: Query) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStartDate = new Date(today);
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    const startDate =
      clean(query.startDate) || defaultStartDate.toISOString().slice(0, 10);
    const endDate = clean(query.endDate) || defaultEnd;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      throw new BadRequestException("Başlangıç ve bitiş tarihi geçersiz.");
    }
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    const dayCount = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
    if (dayCount < 0) {
      throw new BadRequestException(
        "Başlangıç tarihi bitiş tarihinden sonra olamaz.",
      );
    }
    if (dayCount > 366) {
      throw new BadRequestException(
        "Tek seferde en fazla 366 günlük veri alınabilir.",
      );
    }
    return { startDate, endDate };
  }

  private normalizePortalDocument(source: PortalDocumentSource, row: Query) {
    const incoming = source.direction === "incoming";
    const invoice = source.kind === "invoice";
    const sourceId = clean(
      invoice
        ? incoming
          ? row.IdFaturaGelen
          : row.IdFatura
        : incoming
          ? row.IdIrsaliyeGelen
          : row.IdIrsaliye,
    );
    return {
      id: `${source.direction}-${source.kind}-${sourceId}`,
      sourceId,
      kind: source.kind,
      direction: source.direction,
      documentNo: clean(invoice ? row.FaturaNo : row.IrsaliyeNo),
      documentTypeText: invoice ? "Fatura" : "İrsaliye",
      directionText: incoming ? "Gelen" : "Giden",
      dateText: clean(
        invoice ? row.FaturaTarihiFormated : row.IrsaliyeTarihiFormated,
      ),
      transferDateText: clean(
        incoming ? row.GelisTarihiFormated : row.GonderilmeTarihiFormated,
      ),
      partnerName: clean(
        incoming ? row.FirmaAdi || row.AliciAdi : row.AliciAdi,
      ),
      scenarioText: clean(row.SenaryoAdi),
      subtypeText: clean(invoice ? row.FaturaTipiAdi : row.IrsaliyeTipiAdi),
      statusText: clean(row.DurumAdi || row.GonderimDurumAdi),
      amount: invoice ? numberValue(row.OdenecekTutar) : null,
      amountText: invoice ? clean(row.OdenecekTutarFormatted) : "",
      currency: invoice ? clean(row.DovizKodu) : "",
      uuid: invoice ? clean(row.Ettn || row.ETTN || row.UUID) : "",
      partnerTaxNo: clean(row.VknTckn || row.VNKTCKN || row.VKN || row.TCKN),
      unread: incoming ? row.IsRead === false : false,
      referenceNo: clean(row.ExternalInvoiceCode || row.Ettn),
    };
  }

  private async fetchPortalDocumentSource(
    session: Awaited<
      ReturnType<IsnetOperationsService["openPortalCompanySession"]>
    >,
    source: PortalDocumentSource,
    companyId: string,
    startDate: string,
    endDate: string,
  ) {
    const pageResponse = await session.request(source.page);
    const pageHtml = await pageResponse.text();
    const token = this.verificationToken(pageHtml);
    if (!pageResponse.ok || !token) {
      throw new BadGatewayException("İşNet belge ekranı açılamadı.");
    }
    const rows: Query[] = [];
    const length = 300;
    let total = length;
    for (let start = 0; start < total && start < 1500; start += length) {
      const form: Record<string, string> = {
        draw: "1",
        start: String(start),
        length: String(length),
        "search[value]": "",
        "search[regex]": "false",
        CompanyIdFilter: companyId,
        __RequestVerificationToken: token,
        IlkTarih: this.portalDate(startDate),
        SonTarih: this.portalDate(endDate),
      };
      if (source.kind === "invoice") {
        form.FaturaIlkTarihi = this.portalDate(startDate);
        form.FaturaSonTarihi = this.portalDate(endDate);
      } else {
        form.IrsaliyeIlkTarihi = this.portalDate(startDate);
        form.IrsaliyeSonTarihi = this.portalDate(endDate);
      }
      const response = await session.request(source.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: `${session.portalBase}${source.page}`,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams(form).toString(),
      });
      const payload: any = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.data)) {
        throw new BadGatewayException("İşNet belge listesi alınamadı.");
      }
      rows.push(...payload.data);
      total = Math.min(
        numberValue(payload.recordsFiltered || payload.recordsTotal),
        5000,
      );
      if (payload.data.length < length) break;
    }
    return rows.map((row) => this.normalizePortalDocument(source, row));
  }

  async portalDocuments(query: Query = {}) {
    const slug = this.slug(query);
    const range = this.portalDateRange(query);
    const provided = query.__configuredPortal;
    const row = await this.connectionRow(slug);
    const settings = this.connectionValue(row);
    const username = clean(settings.username || process.env.ISNET_USERNAME);
    const password =
      this.decryptSecret(settings.passwordEncrypted) ||
      clean(process.env.ISNET_PASSWORD);
    const companyId = clean(provided?.companyId || settings.companyId || process.env.ISNET_COMPANY_ID);
    const companyName = clean(provided?.companyName || settings.companyName);
    if (!username || !password || !companyId || !companyName) {
      throw new BadRequestException(
        "Önce İşNet bağlantısını ve firmayı kaydedin.",
      );
    }
    const session = provided?.session || await this.openPortalCompanySession(username, password, companyId, companyName);
    const minDate = range.startDate;
    const sources: PortalDocumentSource[] = [
      {
        kind: "invoice",
        direction: "incoming",
        page: `/IncomingInvoice/IncomingInvoiceList?minDate=${minDate}`,
        endpoint: "/IncomingInvoice/AllIncomingInvoiceByFilter",
      },
      {
        kind: "invoice",
        direction: "outgoing",
        page: `/OutgoingInvoice/OutgoingInvoiceList?minDate=${minDate}`,
        endpoint: "/OutgoingInvoice/AllOutgoingInvoiceByFilter",
      },
      {
        kind: "dispatch",
        direction: "incoming",
        page: `/IncomingDespatchAdvice/IncomingDespatchAdviceList?minDate=${minDate}`,
        endpoint: "/IncomingDespatchAdvice/AllIncomingDespatchAdviceByFilter",
      },
      {
        kind: "dispatch",
        direction: "outgoing",
        page: "/OutgoingDespatch/OutgoingDespatchList",
        endpoint: "/OutgoingDespatch/AllOutgoingDespatchByFilter",
      },
    ];
    const sourceResults = await Promise.allSettled(
      sources.map((source) =>
        this.fetchPortalDocumentSource(
          session,
          source,
          companyId,
          range.startDate,
          range.endDate,
        ),
      ),
    );
    const sourceWarnings: string[] = [];
    const groups = sourceResults.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      const source = sources[index];
      const direction = source.direction === "incoming" ? "gelen" : "giden";
      const kind = source.kind === "invoice" ? "fatura" : "irsaliye";
      sourceWarnings.push(
        `${direction} ${kind}: ${clean((result.reason as any)?.message) || "İşNet kaynağı geçici olarak yanıt vermedi."}`,
      );
      return [];
    });
    if (sourceWarnings.length === sources.length) {
      throw new BadGatewayException(
        `İşNet belge listeleri alınamadı. ${sourceWarnings.join(" ")}`,
      );
    }
    const documents = groups.flat();
    const documentNos = documents
      .map((item) => clean(item.documentNo))
      .filter(Boolean);
    const imported = documentNos.length
      ? await this.prisma.documentIntake.findMany({
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
      : [];
    const intakeFirmIds = [...new Set(imported.map((item) => clean(item.firmId)).filter(Boolean))];
    const intakeCompanies = intakeFirmIds.length
      ? await this.prisma.company.findMany({
          where: { mainCompanySlug: slug, id: { in: intakeFirmIds } },
          select: { id: true, companyType: true },
        })
      : [];
    const companyTypeById = new Map(intakeCompanies.map((company) => [company.id, company.companyType]));
    const accountingDocuments = documentNos.length
      ? await this.prisma.document.findMany({
          where: { mainCompanySlug: slug, documentNo: { in: documentNos }, deletedAt: null },
          select: { id: true, documentNo: true, status: true, processedAt: true },
        })
      : [];
    const importedByNo = new Map(
      imported.map((item) => [
        clean(item.documentNo || item.dispatchNo || item.invoiceNo),
        item,
      ]),
    );
    const accountingByNo = new Map(accountingDocuments.map((item) => [clean(item.documentNo), item]));
    const automationRow = await this.prisma.setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "AUTOMATION",
        },
      },
    });
    const automationStates = await this.automationStates(
      slug,
      objectValue(automationRow?.value),
    );
    const enrichedDocuments = documents.map((item) => {
      const intake = importedByNo.get(clean(item.documentNo));
      const accountingDocument = accountingByNo.get(clean(item.documentNo));
      const key = this.automationKey(item);
      const localState = objectValue(automationStates[key]);
      const companyType = clean(localState.companyType || companyTypeById.get(clean(intake?.firmId)) || (intake?.documentKind === "CUSTOMER_DISPATCH" ? "CUSTOMER" : "SUPPLIER"));
      const localUnread = Boolean(localState.completed && !localState.appReadAt);
      const base = intake
        ? {
            ...item,
            intakeId: intake.id,
            intakeStatus: intake.status,
            modelId: intake.modelId || "",
            modelGuess: intake.modelGuess || "",
            importedAt: intake.updatedAt.toISOString(),
          }
        : item;
      return {
        ...base,
        accountingImported: Boolean(accountingDocument),
        accountingDocumentId: accountingDocument?.id || "",
        accountingStatus: accountingDocument?.status || "",
        automationKey: key,
        downloaded: Boolean(localState.completed),
        pdfSaved: Boolean(localState.pdfPath && fs.existsSync(clean(localState.pdfPath))),
        xmlSaved: Boolean(localState.xmlPath && fs.existsSync(clean(localState.xmlPath))),
        modelName: clean(intake?.modelGuess || localState.modelName || (base as Query).modelGuess),
        localUnread,
        isNew: localUnread,
        localReadAt: localState.appReadAt || null,
        companyId: clean(localState.companyId || intake?.firmId),
        companyType,
        modelApplicable: ["CUSTOMER", "BOTH"].includes(companyType) && item.direction === "incoming" && item.kind === "dispatch",
      };
    });
    return {
      ...range,
      syncedAt: new Date().toISOString(),
      companyId,
      companyName,
      counts: {
        incomingInvoices: groups[0].length,
        outgoingInvoices: groups[1].length,
        incomingDispatches: groups[2].length,
        outgoingDispatches: groups[3].length,
        total: documents.length,
        drafts: enrichedDocuments.filter((item) =>
          /TASLAK/i.test(`${clean(item.statusText)} ${clean(item.scenarioText)} ${clean(item.subtypeText)}`),
        ).length,
        newDocuments: enrichedDocuments.filter((item) => item.isNew).length,
        localUnread: enrichedDocuments.filter((item) => item.localUnread).length,
      },
      warnings: sourceWarnings,
      documents: enrichedDocuments,
    };
  }

  async localDocuments(query: Query = {}) {
    const startedAt = performance.now();
    const slug = this.slug(query);
    const range = this.portalDateRange(query);
    const page = Math.max(numberValue(query.page) || 1, 1);
    const pageSize = [25, 50, 100].includes(numberValue(query.pageSize))
      ? numberValue(query.pageSize)
      : 50;
    const queryStartedAt = performance.now();
    const [rows, automationRow] = await Promise.all([
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
    const queryMs = performance.now() - queryStartedAt;
    const comparableDate = (value: unknown) => {
      const text = clean(value);
      const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
      return iso?.[1] || "";
    };
    const filteredStates = rows
      .map((row) => this.stateFromRow(row))
      .filter((state) => {
        if (!clean(state.documentNo) || !clean(state.sourceId)) return false;
        if (!["incoming", "outgoing"].includes(clean(state.direction))) return false;
        if (!["invoice", "dispatch"].includes(clean(state.kind))) return false;
        const date = comparableDate(state.dateText || state.downloadedAt || state.firstSeenAt);
        return !date || (date >= range.startDate && date <= range.endDate);
      })
      .sort((left, right) => {
        const leftDate = comparableDate(left.dateText || left.downloadedAt || left.firstSeenAt);
        const rightDate = comparableDate(right.dateText || right.downloadedAt || right.firstSeenAt);
        const dateComparison = rightDate.localeCompare(leftDate);
        return dateComparison || clean(right.documentNo || right.key).localeCompare(clean(left.documentNo || left.key), "tr-TR", { numeric: true });
      });
    const documentNos = filteredStates.map((state) => clean(state.documentNo)).filter(Boolean);
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
              updatedAt: true,
            },
          })
        : Promise.resolve([]),
      documentNos.length
        ? this.prisma.document.findMany({
            where: { mainCompanySlug: slug, documentNo: { in: documentNos }, deletedAt: null },
            select: { id: true, documentNo: true, status: true },
          })
        : Promise.resolve([]),
    ]);
    const intakeByNo = new Map(
      intakes.map((item) => [clean(item.documentNo || item.dispatchNo || item.invoiceNo), item]),
    );
    const accountingByNo = new Map(accountingDocuments.map((item) => [clean(item.documentNo), item]));
    const pageStart = (page - 1) * pageSize;
    const documents = filteredStates.slice(pageStart, pageStart + pageSize).map((state) => {
      const documentNo = clean(state.documentNo);
      const intake = intakeByNo.get(documentNo);
      const accountingDocument = accountingByNo.get(documentNo);
      const completed = Boolean(state.completed);
      const localUnread = Boolean(completed && !state.appReadAt);
      return {
        ...state,
        id: clean(state.key || state.sourceId),
        automationKey: clean(state.key),
        sourceId: clean(state.sourceId),
        documentNo,
        partnerName: clean(state.partnerName),
        transferDateText: clean(state.transferDateText || state.dateText),
        portalStatusText: clean(state.statusText),
        statusText: state.error ? "İndirme hatası" : completed ? "Yerelde hazır" : "İndirme bekliyor",
        intakeId: clean(intake?.id || state.intakeId),
        intakeStatus: clean(intake?.status),
        modelId: clean(intake?.modelId),
        modelName: clean(intake?.modelGuess || state.modelName),
        accountingImported: Boolean(accountingDocument),
        accountingDocumentId: accountingDocument?.id || "",
        accountingStatus: accountingDocument?.status || "",
        downloaded: completed,
        pdfSaved: Boolean(state.pdfPath && fs.existsSync(clean(state.pdfPath))),
        xmlSaved: Boolean(state.xmlPath && fs.existsSync(clean(state.xmlPath))),
        localUnread,
        isNew: localUnread,
        localReadAt: state.appReadAt || null,
        companyType: clean(state.companyType || (state.customerDispatch ? "CUSTOMER" : "SUPPLIER")),
        modelApplicable: Boolean(state.customerDispatch && state.direction === "incoming" && state.kind === "dispatch"),
      };
    });
    const count = (direction: string, kind: string) =>
      filteredStates.filter((state) => state.direction === direction && state.kind === kind).length;
    const automation = objectValue(automationRow?.value);
    return {
      ...range,
      source: "local",
      lastSyncAt: automation.lastRunAt || null,
      hasMore: pageStart + documents.length < filteredStates.length,
      totalLocal: filteredStates.length,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(filteredStates.length / pageSize), 1),
      counts: {
        incomingInvoices: count("incoming", "invoice"),
        outgoingInvoices: count("outgoing", "invoice"),
        incomingDispatches: count("incoming", "dispatch"),
        outgoingDispatches: count("outgoing", "dispatch"),
        total: filteredStates.length,
        drafts: filteredStates.filter((state) =>
          /TASLAK/i.test(`${clean(state.statusText)} ${clean(state.scenarioText)} ${clean(state.subtypeText)}`),
        ).length,
        newDocuments: filteredStates.filter((state) => state.completed && !state.appReadAt).length,
        localUnread: filteredStates.filter((state) => state.completed && !state.appReadAt).length,
      },
      warnings: [],
      documents,
      performance: {
        databaseMs: Math.round(queryMs * 100) / 100,
        totalMs: Math.round((performance.now() - startedAt) * 100) / 100,
        scannedRows: rows.length,
        returnedRows: documents.length,
      },
    };
  }

  async portalDocumentFile(query: Query = {}) {
    const slug = this.slug(query);
    const direction = clean(query.direction).toLowerCase();
    const kind = clean(query.kind).toLowerCase();
    const sourceId = clean(query.id);
    const format = clean(query.format).toLowerCase();
    if (!["incoming", "outgoing"].includes(direction)) {
      throw new BadRequestException("Belge yönü geçersiz.");
    }
    if (!["invoice", "dispatch"].includes(kind)) {
      throw new BadRequestException("Belge türü geçersiz.");
    }
    if (!/^\d+$/.test(sourceId)) {
      throw new BadRequestException("İşNet belge kimliği geçersiz.");
    }
    if (!["pdf", "xml"].includes(format)) {
      throw new BadRequestException("Dosya biçimi PDF veya XML olmalıdır.");
    }
    const { session } = await this.configuredPortal(slug);
    return this.downloadPortalFile(session, { direction, kind, sourceId, format });
  }

  async importArchivedPortalDocument(body: Query = {}) {
    const slug = this.slug(body);
    const documentNo = clean(body.documentNo);
    const automationKey = clean(body.automationKey || body.key);
    if (!documentNo && !automationKey) {
      throw new BadRequestException("İşNet belge numarası veya otomasyon anahtarı zorunludur.");
    }
    const state = await this.prisma.isnetDocumentState.findFirst({
      where: {
        mainCompanySlug: slug,
        ...(automationKey ? { automationKey } : { documentNo }),
      },
    });
    if (!state) throw new NotFoundException("İşNet arşiv kaydı bulunamadı.");
    if (state.kind !== "invoice") {
      throw new BadRequestException("Muhasebe fatura aktarımı yalnızca fatura belgeleri için kullanılabilir.");
    }
    const existing = state.documentNo
      ? await this.prisma.document.findFirst({
          where: { mainCompanySlug: slug, documentNo: state.documentNo, deletedAt: null },
        })
      : null;
    if (existing) {
      return { imported: true, alreadyImported: true, documentId: existing.id, documentNo: existing.documentNo };
    }
    const xmlPath = clean(state.xmlPath);
    if (!xmlPath || !fs.existsSync(xmlPath)) {
      throw new NotFoundException("İşNet XML arşiv dosyası bulunamadı; önce belgeyi senkronize edin.");
    }
    const file = this.multerFile({
      buffer: fs.readFileSync(xmlPath),
      contentType: "application/xml",
      fileName: path.basename(xmlPath),
    });
    const upload = await this.documentIntake.upload([file], {
      mainCompanySlug: slug,
      mainCompanyId: clean(body.mainCompanyId),
      autoApprove: true,
    });
    if (upload.errors?.length) {
      throw new BadRequestException(upload.errors.map((item: any) => clean(item.message)).filter(Boolean).join(" ") || "İşNet faturası muhasebeye aktarılamadı.");
    }
    const intakeId = clean(upload.items?.[0]?.id || upload.skipped?.[0]?.existingId || state.intakeId);
    const approval = upload.autoApproved?.[0];
    if (approval?.ok === false) {
      throw new BadRequestException(clean(approval.reason) || "İşNet faturası kontrol nedeniyle muhasebeye aktarılamadı.");
    }
    const document = state.documentNo
      ? await this.prisma.document.findFirst({
          where: { mainCompanySlug: slug, documentNo: state.documentNo, deletedAt: null },
        })
      : null;
    if (!document) {
      throw new BadRequestException("XML okundu ancak muhasebe belge kaydı oluşmadı; belge havuzundaki eksikleri kontrol edin.");
    }
    await this.prisma.isnetDocumentState.update({
      where: { id: state.id },
      data: { intakeId: intakeId || null, error: null, lastAttemptAt: new Date() },
    });
    return { imported: true, alreadyImported: false, intakeId, documentId: document.id, documentNo: document.documentNo };
  }

  private async downloadPortalFile(
    session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>,
    input: Query,
  ) {
    const direction = clean(input.direction).toLowerCase();
    const kind = clean(input.kind).toLowerCase();
    const sourceId = clean(input.sourceId || input.id);
    const format = clean(input.format).toLowerCase();
    const incoming = direction === "incoming";
    const entity = kind === "invoice" ? "Invoice" : "Despatch";
    const path = `/${entity}/Get${entity}${format === "pdf" ? "Pdf" : "Xml"}?InOrOut=${incoming}&${entity}Id=${encodeURIComponent(sourceId)}`;
    const response = await session.request(path);
    const buffer = Buffer.from(await response.arrayBuffer());
    const disposition = clean(response.headers.get("content-disposition"));
    const contentType =
      clean(response.headers.get("content-type")) ||
      (format === "pdf" ? "application/pdf" : "application/xml");
    if (!response.ok || !buffer.length || /NotAutorized/i.test(disposition)) {
      throw new BadGatewayException(
        "İşNet bu belge dosyasına erişim vermedi. Portal belge yetkilerini kontrol edin.",
      );
    }
    const remoteName = disposition.match(
      /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i,
    )?.[1];
    const fileName =
      decodeURIComponent(clean(remoteName)) ||
      `isnet-${kind}-${sourceId}.${format}`;
    return { buffer, contentType, fileName };
  }

  async importIncomingDispatch(body: Query = {}) {
    const slug = this.slug(body);
    const sourceId = clean(body.id);
    if (!/^\d+$/.test(sourceId)) {
      throw new BadRequestException("Gelen İşNet irsaliye kimliği geçersiz.");
    }
    if (body.confirmed !== true) {
      throw new BadRequestException("Belgeyi işleme almak için kullanıcı onayı zorunludur.");
    }
    const [xml, pdf] = await Promise.all([
      this.portalDocumentFile({
        ...body,
        direction: "incoming",
        kind: "dispatch",
        format: "xml",
      }),
      this.portalDocumentFile({
        ...body,
        direction: "incoming",
        kind: "dispatch",
        format: "pdf",
      }),
    ]);
    const files = [
      {
        fieldname: "files",
        originalname: xml.fileName,
        encoding: "7bit",
        mimetype: xml.contentType || "application/xml",
        size: xml.buffer.length,
        buffer: xml.buffer,
      },
      {
        fieldname: "files",
        originalname: pdf.fileName,
        encoding: "7bit",
        mimetype: pdf.contentType || "application/pdf",
        size: pdf.buffer.length,
        buffer: pdf.buffer,
      },
    ] as Express.Multer.File[];
    const result = await this.documentIntake.upload(files, {
      mainCompanySlug: slug,
      mainCompanyId: clean(body.mainCompanyId),
      autoApprove: false,
    });
    if (result.errors?.length) {
      throw new BadGatewayException(
        result.errors.map((item: any) => clean(item.message)).filter(Boolean).join(" ") ||
          "İşNet belgesi işleme alınamadı.",
      );
    }
    const intakeId = clean(result.items?.[0]?.id || result.skipped?.[0]?.existingId);
    if (!intakeId) {
      throw new BadGatewayException("İşNet belgesi kaydedildi ancak işleme kaydı bulunamadı.");
    }
    const intake = await this.documentIntake.detail(slug, intakeId);
    return {
      ok: true,
      duplicate: !result.items?.length,
      intake,
      files: [xml.fileName, pdf.fileName],
      message: intake.modelId
        ? "İrsaliye PDF ve XML dosyalarıyla işleme alındı; model eşleşti."
        : "İrsaliye PDF ve XML dosyalarıyla işleme alındı; model seçimi gerekiyor.",
    };
  }

  private modelSimilarity(left: unknown, right: unknown) {
    const a = this.documentMatcher.normalize(left);
    const b = this.documentMatcher.normalize(right);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 90;
    const aSet = new Set(a.split(" "));
    const bSet = new Set(b.split(" "));
    const matches = [...aSet].filter((value) => bSet.has(value)).length;
    if (matches && Math.min(aSet.size, bSet.size) === matches) return 86;
    return Math.round((matches / Math.max(aSet.size, bSet.size, 1)) * 100);
  }

  async intakeDetail(id: string, query: Query = {}) {
    return this.documentIntake.detail(this.slug(query), id);
  }

  async modelSuggestions(id: string, query: Query = {}) {
    const slug = this.slug(query);
    const { intake, company } = await this.customerIntakeContext(slug, id);
    const search = clean(query.search || intake.modelGuess);
    const primaryTerm = this.documentMatcher.normalize(search)
      .split(" ")
      .find((token) => token.length >= 3 && !/^\d+$/.test(token)) || "";
    if (primaryTerm.length < 2) {
      return { intakeId: intake.id, modelGuess: intake.modelGuess || "", currentModelId: intake.modelId || "", requiresModel: !intake.modelId, company: { id: company.id, name: company.name }, suggestions: [] };
    }
    const [records, designModels, productionModels] = await Promise.all([
      this.prisma.modelRecord.findMany({
        where: { mainCompanySlug: slug, status: "ACTIVE", OR: [{ modelName: { contains: primaryTerm } }, { modelCode: { contains: primaryTerm } }] },
        take: 40,
      }),
      this.prisma.designWorkflowModel.findMany({
        where: { mainCompanySlug: slug, isActive: true, OR: [{ modelName: { contains: primaryTerm } }, { modelCode: { contains: primaryTerm } }] },
        select: { id: true, modelName: true, modelCode: true, designName: true },
        take: 20,
      }),
      this.prisma.model.findMany({
        where: { mainCompanySlug: slug, status: "ACTIVE", OR: [{ name: { contains: primaryTerm } }, { code: { contains: primaryTerm } }] },
        select: { id: true, name: true, code: true },
        take: 20,
      }),
    ]);
    const candidates = [
      ...records.filter((item) => {
        const raw = objectValue(item.raw);
        const companyId = clean(raw.companyId || raw.firmaId);
        return !companyId || companyId === company.id;
      }).map((item) => ({
        id: item.id,
        source: "MODEL_RECORD",
        name: item.modelName,
        code: item.modelCode || "",
      })),
      ...designModels.map((item) => ({
        id: item.id,
        source: "DESIGN_MODEL",
        name: item.modelName,
        code: item.modelCode || "",
        note: item.designName || "Desen modeli",
      })),
      ...productionModels.map((item) => ({
        id: item.id,
        source: "PRODUCTION_MODEL",
        name: item.name,
        code: item.code || "",
      })),
    ]
      .map((item) => ({
        ...item,
        score: Math.max(
          this.modelSimilarity(search, item.name),
          this.modelSimilarity(search, item.code),
        ),
      }))
      .filter((item) => item.score >= 35)
      .sort((a, b) => b.score - a.score);
    const unique = new Map<string, any>();
    for (const item of candidates) {
      const key = this.documentMatcher.normalize(item.code || item.name);
      if (!unique.has(key)) unique.set(key, item);
    }
    const suggestionRows = [...unique.values()].slice(0, 8);
    const recordIds = suggestionRows.filter((item) => item.source === "MODEL_RECORD").map((item) => item.id);
    const images = recordIds.length
      ? await this.prisma.modelImage.findMany({
          where: { mainCompanySlug: slug, modelId: { in: recordIds } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const imageByModel = new Map<string, any>();
    for (const image of images) if (!imageByModel.has(image.modelId)) imageByModel.set(image.modelId, image);
    return {
      intakeId: intake.id,
      modelGuess: intake.modelGuess || "",
      currentModelId: intake.modelId || "",
      company: { id: company.id, name: company.name },
      requiresModel: !intake.modelId,
      suggestions: suggestionRows.map((item) => ({
        ...item,
        companyId: company.id,
        companyName: company.name,
        matchedExpression: primaryTerm,
        thumbnailUrl: imageByModel.get(item.id)?.thumbnailPath || "",
      })),
    };
  }

  private async resolveModelCandidate(slug: string, body: Query) {
    const source = clean(body.source).toUpperCase();
    const candidateId = clean(body.candidateId || body.modelId);
    if (!candidateId) throw new BadRequestException("Model seçimi zorunludur.");
    if (source === "MODEL_RECORD" || !source) {
      const record = await this.prisma.modelRecord.findFirst({
        where: { id: candidateId, mainCompanySlug: slug },
      });
      if (!record) throw new NotFoundException("Model kaydı bulunamadı.");
      return record;
    }
    const sourceModel =
      source === "DESIGN_MODEL"
        ? await this.prisma.designWorkflowModel.findFirst({
            where: { id: candidateId, mainCompanySlug: slug },
            select: { id: true, modelName: true, modelCode: true },
          })
        : await this.prisma.model.findFirst({
            where: { id: candidateId, mainCompanySlug: slug },
            select: { id: true, name: true, code: true },
          });
    if (!sourceModel) throw new NotFoundException("Kaynak model bulunamadı.");
    const modelName = clean((sourceModel as any).modelName || (sourceModel as any).name);
    const modelCode = clean((sourceModel as any).modelCode || (sourceModel as any).code);
    const existing = await this.prisma.modelRecord.findFirst({
      where: {
        mainCompanySlug: slug,
        OR: [
          ...(modelCode ? [{ modelCode }] : []),
          { modelName },
        ],
      },
    });
    return (
      existing ||
      this.prisma.modelRecord.create({
        data: {
          mainCompanySlug: slug,
          modelName,
          modelCode: modelCode || null,
          raw: { source, sourceId: candidateId },
        },
      })
    );
  }

  async assignIntakeModel(id: string, body: Query = {}) {
    const slug = this.slug(body);
    const intake = await this.documentIntake.detail(slug, id);
    const model = await this.resolveModelCandidate(slug, body);
    const updated = await this.documentIntake.fix(slug, id, { modelId: model.id });
    await this.prisma.modelDocumentLink.upsert({
      where: {
        mainCompanySlug_modelId_documentId: {
          mainCompanySlug: slug,
          modelId: model.id,
          documentId: id,
        },
      },
      create: {
        mainCompanySlug: slug,
        modelId: model.id,
        documentId: id,
        raw: { source: "ISNET", documentNo: intake.documentNo || intake.dispatchNo },
      },
      update: {
        raw: { source: "ISNET", documentNo: intake.documentNo || intake.dispatchNo },
      },
    });
    await this.finalizeStagedArchive(slug, id, model.modelName);
    let processing: any = null;
    if (updated.status !== "APPROVED") {
      processing = await this.documentIntake.autoProcess(slug, id, {
        confirm: true,
        mainCompanySlug: slug,
        manualApproval: true,
        manualApprovalReason:
          "İşNet müşteri irsaliyesi model bağlandıktan sonra fatura kesim akışına alındı.",
        approvedBy: "ISNET_MODEL_LINK",
      });
    }
    return {
      intake: await this.documentIntake.detail(slug, id),
      model,
      processing,
    };
  }

  async finalizeStagedArchiveByDocumentNo(
    slug: string,
    documentNo: string,
    modelNameValue: unknown,
  ) {
    return this.finalizeStagedArchive(slug, "", modelNameValue, documentNo);
  }

  private async finalizeStagedArchive(
    slug: string,
    intakeId: string,
    modelNameValue: unknown,
    documentNo = "",
  ) {
    const row = await this.prisma.setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "AUTOMATION",
        },
      },
    });
    if (!row) return;
    const value = objectValue(row.value);
    const documents = await this.automationStates(slug, value);
    const modelName = this.shortModelName(modelNameValue);
    let changed = false;
    for (const [key, stateValue] of Object.entries(documents)) {
      const state = objectValue(stateValue);
      const intakeMatches = Boolean(intakeId) && clean(state.intakeId) === clean(intakeId);
      const documentMatches = Boolean(documentNo) && clean(state.documentNo) === clean(documentNo);
      if ((!intakeMatches && !documentMatches) || state.archiveStage !== "MODEL_BEKLEYEN") continue;
      const targetFolder = path.join(
        this.archiveRoot(),
        this.archiveFolder(state, Boolean(state.customerDispatch)),
      );
      const baseName = this.safeArchiveName(
        `${state.documentNo || state.sourceId}${modelName ? ` ${modelName}` : ""}`,
      );
      documents[key] = {
        ...state,
        modelName,
        pdfPath: this.moveManagedArchiveFile(state.pdfPath, targetFolder, baseName),
        xmlPath: this.moveManagedArchiveFile(state.xmlPath, targetFolder, baseName),
        archiveStage: "MODELE_BAGLI",
        modelLinkedAt: new Date().toISOString(),
      };
      changed = true;
    }
    if (changed) {
      await this.persistAutomationStates(slug, documents);
    }
  }

  async createIntakeModel(id: string, body: Query = {}) {
    const slug = this.slug(body);
    if (body.confirmed !== true) {
      throw new BadRequestException("Yeni model açmak için kullanıcı onayı zorunludur.");
    }
    const intake = await this.documentIntake.detail(slug, id);
    const modelName = clean(body.modelName || intake.modelGuess);
    const modelCode = clean(body.modelCode);
    if (!modelName) throw new BadRequestException("Model adı zorunludur.");
    const existing = await this.prisma.modelRecord.findFirst({
      where: {
        mainCompanySlug: slug,
        OR: [
          ...(modelCode ? [{ modelCode }] : []),
          { modelName },
        ],
      },
    });
    const model =
      existing ||
      (await this.prisma.modelRecord.create({
        data: {
          mainCompanySlug: slug,
          modelName,
          modelCode: modelCode || null,
          raw: { source: "ISNET_CREATED", intakeId: id },
        },
      }));
    return this.assignIntakeModel(id, {
      ...body,
      mainCompanySlug: slug,
      source: "MODEL_RECORD",
      candidateId: model.id,
    });
  }

  private async customerIntakeContext(slug: string, id: string) {
    const intake = await this.documentIntake.detail(slug, id);
    if (intake.documentKind !== "CUSTOMER_DISPATCH" || clean(intake.direction).toUpperCase() === "OUTGOING") {
      throw new ConflictException("Bu belge müşteri yönlü değildir; model eşleştirme uygulanmaz.");
    }
    if (!intake.firmId) {
      throw new ConflictException("Belgenin müşteri firma eşleşmesi tamamlanmadan model işlemi yapılamaz.");
    }
    const company = await this.prisma.company.findFirst({
      where: { id: intake.firmId, mainCompanySlug: slug, isActive: true, deletedAt: null },
      select: { id: true, name: true, companyType: true },
    });
    if (!company || !["CUSTOMER", "BOTH"].includes(clean(company.companyType).toUpperCase())) {
      throw new ConflictException("Bu firma tedarikçidir; model eşleştirme uygulanmaz.");
    }
    return { intake, company };
  }

  private async linkIntakeModelSafe(slug: string, id: string, model: any, body: Query) {
    const { intake, company } = await this.customerIntakeContext(slug, id);
    const requestedLineId = clean(body.documentLineId || body.lineId);
    const lines = arrayValue(intake.lines);
    const targetLines = requestedLineId
      ? lines.filter((line) => line.id === requestedLineId)
      : lines;
    if (!targetLines.length) throw new NotFoundException("XML belge satırı bulunamadı.");
    const confidence = Math.min(Math.max(numberValue(body.confidence) || 100, 0), 100);
    const approvedBy = clean(body.approvedBy || body.userId) || "ISNET_USER";
    const aliasText = clean(body.aliasText || targetLines[0]?.rawName || targetLines[0]?.description || intake.modelGuess);
    const normalizedAlias = this.documentMatcher.normalize(aliasText);

    await this.prisma.$transaction(async (tx) => {
      await tx.documentIntake.update({ where: { id }, data: { modelId: model.id, status: "READY" } });
      await tx.documentIntakeLine.updateMany({
        where: { documentIntakeId: id, ...(requestedLineId ? { id: requestedLineId } : {}) },
        data: { modelId: model.id, matchStatus: "APPROVED", matchConfidence: confidence },
      });
      await tx.modelDocumentLink.upsert({
        where: { mainCompanySlug_modelId_documentId: { mainCompanySlug: slug, modelId: model.id, documentId: id } },
        create: {
          mainCompanySlug: slug,
          modelId: model.id,
          documentId: id,
          raw: { source: "ISNET", documentNo: intake.documentNo || intake.dispatchNo, documentLineIds: targetLines.map((line) => line.id), matchStatus: "APPROVED", confidence, approvedBy, approvedAt: new Date().toISOString() },
        },
        update: {
          raw: { source: "ISNET", documentNo: intake.documentNo || intake.dispatchNo, documentLineIds: targetLines.map((line) => line.id), matchStatus: "APPROVED", confidence, approvedBy, approvedAt: new Date().toISOString() },
        },
      });
      if (normalizedAlias) {
        const current = await tx.isnetModelAlias.findFirst({
          where: { mainCompanySlug: slug, companyId: company.id, normalizedText: normalizedAlias },
        });
        const aliasData = {
          rawText: aliasText,
          normalizedText: normalizedAlias,
          orderNo: clean(targetLines[0]?.orderNo) || null,
          productCode: clean(targetLines[0]?.productCode) || null,
          modelId: model.id,
          confidence,
          approved: true,
          approvedBy,
          approvedAt: new Date(),
          lastUsedAt: new Date(),
          usageCount: (current?.usageCount || 0) + 1,
        };
        if (current) await tx.isnetModelAlias.update({ where: { id: current.id }, data: aliasData });
        else await tx.isnetModelAlias.create({ data: { mainCompanySlug: slug, companyId: company.id, ...aliasData } });
      }
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          module: "ISNET",
          entityType: "document_intake",
          entityId: id,
          action: "MODEL_LINKED",
          actionType: "UPDATE",
          description: `${clean(model.modelName || model.name)} modeli belge satırına bağlandı.`,
          oldValue: { modelId: intake.modelId || null },
          newValue: { modelId: model.id, lineIds: targetLines.map((line) => line.id), confidence },
          actor: approvedBy,
        },
      });
    });
    await this.finalizeStagedArchive(slug, id, model.modelName || model.name);
    return {
      success: true,
      intake: await this.documentIntake.detail(slug, id),
      model,
      documentLine: { id: targetLines[0].id, modelId: model.id, matchStatus: "APPROVED", confidence },
    };
  }

  async assignIntakeModelSafe(id: string, body: Query = {}) {
    const slug = this.slug(body);
    await this.customerIntakeContext(slug, id);
    const model = await this.resolveModelCandidate(slug, body);
    return this.linkIntakeModelSafe(slug, id, model, body);
  }

  async createIntakeModelSafe(id: string, body: Query = {}) {
    const slug = this.slug(body);
    if (body.confirmed !== true) throw new BadRequestException("Yeni model açmak için kullanıcı onayı zorunludur.");
    const { intake, company } = await this.customerIntakeContext(slug, id);
    const modelName = clean(body.modelName || intake.modelGuess);
    if (!modelName) throw new BadRequestException("Model adı zorunludur.");
    const normalizedName = this.documentMatcher.normalize(modelName);
    const existingRows = await this.prisma.modelRecord.findMany({
      where: { mainCompanySlug: slug, status: "ACTIVE" },
      select: { id: true, modelName: true, raw: true },
    });
    const existing = existingRows.find((row) => {
      const raw = objectValue(row.raw);
      const rowCompanyId = clean(raw.companyId || raw.firmaId);
      return this.documentMatcher.normalize(row.modelName) === normalizedName && (!rowCompanyId || rowCompanyId === company.id);
    });
    const firstLine = arrayValue(intake.lines)[0] || {};
    const model = await this.modelService.create({
      mainCompanySlug: slug,
      modelName,
      modelCode: clean(body.modelCode || firstLine.productCode),
      orderNo: clean(body.orderNo || firstLine.orderNo),
      companyId: company.id,
      firmaId: company.id,
      firmaAdi: company.name,
      color: clean(body.color || firstLine.color),
      baskiBolgesi: clean(body.region || firstLine.region),
      notes: clean(body.note),
      source: "ISNET_CREATED",
      intakeId: id,
    });
    let image: any = null;
    if (body.imageBase64) {
      const mimeType = clean(body.imageMimeType).toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        throw new BadRequestException("Görsel türü JPG, PNG veya WEBP olmalıdır.");
      }
      const encoded = clean(body.imageBase64).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(encoded, "base64");
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new BadRequestException("Model görseli boş veya 8 MB sınırını aşıyor.");
      const validMagic = mimeType === "image/png"
        ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mimeType === "image/webp"
          ? buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
          : buffer[0] === 0xff && buffer[1] === 0xd8;
      if (!validMagic) throw new BadRequestException("Görsel içeriği bildirilen dosya türüyle uyuşmuyor.");
      const ext = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
      const upload = await this.modelService.saveUploadedImages(slug, model.id, [{ buffer, mimetype: mimeType, originalname: clean(body.imageName) || `${modelName}${ext}` }]);
      image = upload.images?.[0] || null;
      if (!image) throw new ConflictException("Model kaydı oluşturuldu ancak görsel depolama sonucu doğrulanamadı; aynı modelle yeniden deneyin.");
    }
    const linked = await this.linkIntakeModelSafe(slug, id, { ...model, imageUrl: image?.url || model.imageUrl || "" }, body);
    const verified = await this.modelService.getById(model.id, slug);
    if (!verified?.id) throw new ConflictException("Desen Havuzu model kaydı doğrulanamadı.");
    return { ...linked, created: !existing, duplicate: Boolean(existing), model: { ...verified, imageUrl: image?.url || verified.imageUrl || "" } };
  }

  async modelAliases(query: Query = {}) {
    const slug = this.slug(query);
    return this.prisma.isnetModelAlias.findMany({
      where: { mainCompanySlug: slug, ...(query.companyId ? { companyId: clean(query.companyId) } : {}), ...(query.normalizedText ? { normalizedText: { contains: clean(query.normalizedText) } } : {}) },
      orderBy: [{ approved: "desc" }, { usageCount: "desc" }, { updatedAt: "desc" }],
      take: Math.min(Math.max(numberValue(query.limit) || 100, 1), 500),
    });
  }

  async approveModelAlias(body: Query = {}) {
    const slug = this.slug(body);
    const rawText = clean(body.rawText);
    const modelId = clean(body.modelId);
    if (!rawText || !modelId) throw new BadRequestException("Alias için ham metin ve model zorunludur.");
    const normalizedText = this.documentMatcher.normalize(rawText);
    return this.prisma.isnetModelAlias.upsert({
      where: { id: clean(body.id) || "missing-id" },
      update: { companyId: clean(body.companyId) || null, rawText, normalizedText, orderNo: clean(body.orderNo) || null, productCode: clean(body.productCode) || null, modelId, confidence: 100, approved: true, approvedBy: clean(body.approvedBy) || "USER", approvedAt: new Date(), lastUsedAt: new Date() },
      create: { mainCompanySlug: slug, companyId: clean(body.companyId) || null, rawText, normalizedText, orderNo: clean(body.orderNo) || null, productCode: clean(body.productCode) || null, modelId, confidence: 100, approved: true, approvedBy: clean(body.approvedBy) || "USER", approvedAt: new Date(), lastUsedAt: new Date() },
    });
  }

  async updateModelAlias(id: string, body: Query = {}) {
    const slug = this.slug(body);
    const current = await this.prisma.isnetModelAlias.findFirst({ where: { id, mainCompanySlug: slug } });
    if (!current) throw new NotFoundException("Model alias bulunamadı.");
    const rawText = clean(body.rawText || current.rawText);
    return this.prisma.isnetModelAlias.update({ where: { id }, data: { rawText, normalizedText: this.documentMatcher.normalize(rawText), companyId: clean(body.companyId) || current.companyId, orderNo: clean(body.orderNo) || current.orderNo, productCode: clean(body.productCode) || current.productCode, modelId: clean(body.modelId) || current.modelId, approved: body.approved !== false, approvedBy: clean(body.approvedBy) || current.approvedBy || "USER", approvedAt: body.approved === false ? null : current.approvedAt || new Date() } });
  }

  async rejectModelAlias(id: string, body: Query = {}) {
    const slug = this.slug(body);
    const current = await this.prisma.isnetModelAlias.findFirst({ where: { id, mainCompanySlug: slug } });
    if (!current) throw new NotFoundException("Model alias bulunamadı.");
    return this.prisma.isnetModelAlias.update({ where: { id }, data: { approved: false, confidence: 0, approvedAt: null } });
  }

  async createDispatchDraftFromIncoming(body: Query = {}) {
    const slug = this.slug(body);
    const sourceId = clean(body.id);
    if (!/^\d+$/.test(sourceId)) {
      throw new BadRequestException("Gelen İşNet irsaliye kimliği geçersiz.");
    }
    if (body.confirmed !== true) {
      throw new BadRequestException("Taslak oluşturma için kullanıcı onayı zorunludur.");
    }
    const row = await this.connectionRow(slug);
    const settings = this.connectionValue(row);
    const username = clean(settings.username || process.env.ISNET_USERNAME);
    const password =
      this.decryptSecret(settings.passwordEncrypted) ||
      clean(process.env.ISNET_PASSWORD);
    const companyId = clean(settings.companyId || process.env.ISNET_COMPANY_ID);
    const companyName = clean(settings.companyName);
    if (!username || !password || !companyId || !companyName) {
      throw new BadRequestException("Önce İşNet bağlantısını ve firmayı kaydedin.");
    }
    const session = await this.openPortalCompanySession(
      username,
      password,
      companyId,
      companyName,
    );
    const response = await session.request(
      "/IncomingDespatchAdvice/CreateFromIncomingDespatchAdvice",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=UTF-8",
          Referer: `${session.portalBase}/IncomingDespatchAdvice/IncomingDespatchAdviceList`,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          DespatchId: [sourceId],
          DespatchCompanyId: companyId,
        }),
      },
    );
    const raw = await response.text();
    let payload: any = raw;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }
    const error = clean(payload?.error);
    if (!response.ok || error) {
      throw new BadGatewayException(error || "İşNet irsaliye taslağı oluşturamadı.");
    }
    const draftNo = clean(
      typeof payload === "string" || typeof payload === "number"
        ? payload
        : payload?.documentNo || payload?.IrsaliyeNo,
    );
    return {
      ok: true,
      sourceId,
      draftNo,
      message: draftNo
        ? `${draftNo} numaralı giden irsaliye taslağı oluşturuldu.`
        : "Giden irsaliye taslağı İşNet'te oluşturuldu.",
    };
  }

  private portalInputDate(value: unknown) {
    const text = clean(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return this.portalDate(text);
    return text || this.portalDate(new Date().toISOString().slice(0, 10));
  }

  private xmlValue(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number") return clean(value);
    return clean(value["#text"] ?? value._ ?? value.value);
  }

  private xmlArray(value: any) {
    return value === null || value === undefined
      ? []
      : Array.isArray(value)
        ? value
        : [value];
  }

  private parseDispatchXml(buffer: Buffer) {
    const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(
      buffer.toString("utf8"),
    );
    const root = parsed?.DespatchAdvice || parsed;
    const receiver = root?.DeliveryCustomerParty?.Party || root?.AccountingCustomerParty?.Party || {};
    const sender = root?.DespatchSupplierParty?.Party || root?.AccountingSupplierParty?.Party || {};
    const receiverName = this.xmlValue(
      receiver?.PartyName?.Name || receiver?.PartyLegalEntity?.RegistrationName,
    );
    const senderName = this.xmlValue(
      sender?.PartyName?.Name || sender?.PartyLegalEntity?.RegistrationName,
    );
    const lines = this.xmlArray(root?.DespatchLine).map((line: any, index: number) => {
      const quantity = numberValue(this.xmlValue(line?.DeliveredQuantity));
      const item = line?.Item || {};
      const name = this.xmlValue(item?.Name) || this.xmlValue(item?.Description);
      const description = this.xmlArray(item?.Description)
        .map((entry: any) => this.xmlValue(entry))
        .filter(Boolean)
        .join(" · ");
      return {
        lineNo: Number(this.xmlValue(line?.ID)) || index + 1,
        productName: name || `İrsaliye kalemi ${index + 1}`,
        description,
        quantity: quantity > 0 ? quantity : 1,
        unitCode: clean(line?.DeliveredQuantity?.["@_unitCode"]),
        unitPrice: 0,
        vatRate: 20,
      };
    });
    return {
      documentNo: this.xmlValue(root?.ID),
      issueDate: this.xmlValue(root?.IssueDate),
      receiverName,
      senderName,
      notes: this.xmlArray(root?.Note).map((entry: any) => this.xmlValue(entry)).filter(Boolean),
      lines,
    };
  }

  async incomingDispatchDraft(id: string, query: Query = {}) {
    const slug = this.slug(query);
    if (!/^\d+$/.test(clean(id))) {
      throw new BadRequestException("Gelen irsaliye kimliği geçersiz.");
    }
    const file = await this.portalDocumentFile({
      ...query,
      id,
      direction: "incoming",
      kind: "dispatch",
      format: "xml",
    });
    const parsed = this.parseDispatchXml(file.buffer);
    let recipients = await this.recipientSearch({
      ...query,
      mainCompanySlug: slug,
      kind: "dispatch",
      q: parsed.senderName,
    });
    if (!recipients.rows.length && parsed.senderName) {
      const shortName = parsed.senderName
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(" ");
      if (shortName.length >= 2) {
        recipients = await this.recipientSearch({
          ...query,
          mainCompanySlug: slug,
          kind: "dispatch",
          q: shortName,
        });
      }
    }
    const senderKey = this.documentMatcher.normalize(parsed.senderName);
    const recipient =
      recipients.rows.find(
        (row: any) => this.documentMatcher.normalize(row.name) === senderKey,
      ) || recipients.rows[0] || null;
    const intake = parsed.documentNo
      ? await this.prisma.documentIntake.findFirst({
          where: {
            mainCompanySlug: slug,
            OR: [
              { documentNo: parsed.documentNo },
              { dispatchNo: parsed.documentNo },
            ],
          },
          orderBy: { updatedAt: "desc" },
        })
      : null;
    const modelName = clean(
      intake?.modelGuess ||
        parsed.notes.find((note: string) => /^MODEL\s*:/i.test(note))?.replace(/^MODEL\s*:/i, "") ||
        parsed.lines[0]?.description ||
        parsed.lines[0]?.productName,
    );
    return {
      sourceId: clean(id),
      incomingDispatchNo: parsed.documentNo,
      recipient,
      recipientName: parsed.senderName,
      issueDate: new Date().toISOString().slice(0, 10),
      issueTime: new Date().toLocaleTimeString("tr-TR", { hour12: false }),
      scenarioType: "1",
      dispatchType: "1",
      currency: "TRY",
      modelId: intake?.modelId || "",
      modelName,
      note: parsed.notes.join("\n"),
      lines: parsed.lines.map((line: any) => ({
        ...line,
        measureUnitId: line.measureUnitId || 67,
        description: line.description || modelName,
      })),
    };
  }

  async recipientSearch(query: Query = {}) {
    const slug = this.slug(query);
    const kind = clean(query.kind).toLowerCase() === "invoice" ? "Invoice" : "Despatch";
    const search = clean(query.q || query.search);
    if (search.length < 2) return { rows: [] };
    const { companyId, session } = await this.configuredPortal(slug);
    const payload = await this.portalJson(
      session,
      `/${kind}/GetRecipientList?q=${encodeURIComponent(search)}&companyId=${encodeURIComponent(companyId)}`,
    );
    const portalRows = arrayValue(payload)
      .map((row: any) => ({
        id: clean(row.IdAlici),
        name: clean(row.AliciAdi),
        taxNo: clean(row.Vnktckn),
        recipientType: clean(row.AliciTipi),
        city: clean(row.IlAdi),
        district: clean(row.IlceAdi),
      }))
      .filter((row) => row.id && row.name);
    const groups = new Map<string, Query[]>();
    for (const row of portalRows) {
      const key = this.documentMatcher.normalize(row.name);
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    const companies = await this.prisma.company.findMany({
      where: { mainCompanySlug: slug, isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        taxNo: true,
        type: true,
        firmaTuru: true,
        companyType: true,
        raw: true,
      },
    });
    const customerCompanies = companies.filter((company) => {
      if (company.companyType === "CUSTOMER" || company.companyType === "BOTH") return true;
      const profile = `${company.type || ""} ${company.firmaTuru || ""} ${clean(objectValue(company.raw).relationshipType)}`.toUpperCase();
      return /MUSTERI|MÜŞTERİ|CUSTOMER|ALICI|BOTH|GENEL/.test(profile);
    });
    const result: Query[] = [];
    for (const candidateRows of groups.values()) {
      let selected: Query | null = null;
      for (const candidate of candidateRows) {
        try {
          const detail = await this.recipientDetail(session, kind as "Invoice" | "Despatch", candidate.id);
          selected = {
            ...candidate,
            name: clean(detail.recipient?.AliciAdi || candidate.name),
            taxNo: clean(detail.recipient?.Vnktckn || candidate.taxNo),
            recipientType: clean(detail.recipient?.AliciTipi || candidate.recipientType),
            tag: detail.tag,
          };
          if (selected.taxNo) break;
        } catch {
          // Portal ayni firmayi birden fazla alici satirinda dondurebiliyor.
        }
      }
      if (!selected) selected = candidateRows[0];
      const taxMatch = selected.taxNo
        ? customerCompanies.find((company) => clean(company.taxNo) === clean(selected?.taxNo))
        : null;
      const ranked = customerCompanies
        .map((company) => ({
          company,
          score: this.modelSimilarity(selected?.name, company.normalizedName || company.name),
        }))
        .filter((item) => item.score >= 55)
        .sort((left, right) => right.score - left.score);
      let localCompany: any = taxMatch || ranked[0]?.company || null;
      const mergedIntoCompanyId = clean(objectValue(localCompany?.raw).mergedIntoCompanyId);
      if (mergedIntoCompanyId) {
        localCompany = companies.find((company) => company.id === mergedIntoCompanyId) || localCompany;
      }
      if (localCompany) {
        const raw = objectValue(localCompany.raw);
        const recipients = objectValue(raw.isnetRecipients);
        await this.prisma.company.update({
          where: { id: localCompany.id },
          data: {
            raw: {
              ...raw,
              isnetRecipients: {
                ...recipients,
                [kind.toLowerCase()]: {
                  id: selected.id,
                  name: selected.name,
                  taxNo: selected.taxNo,
                  tag: selected.tag || "",
                  syncedAt: new Date().toISOString(),
                },
              },
            },
          },
        });
      }
      result.push({
        ...selected,
        localCompanyId: localCompany?.id || "",
        localCompanyName: localCompany?.name || "",
        matched: Boolean(localCompany),
      });
    }
    return { rows: result };
  }

  async invoiceRecipientContext(query: Query = {}) {
    const slug = this.slug(query);
    const localCompanyId = clean(query.localCompanyId);
    if (!localCompanyId) return { departments: [], contacts: [] };
    const [departments, contacts] = await Promise.all([
      this.prisma.muhasebeContactDepartment.findMany({
        where: { mainCompanySlug: slug, firmId: localCompanyId, isActive: true },
        orderBy: { departmentCode: "asc" },
      }),
      this.prisma.muhasebeContactPerson.findMany({
        where: {
          mainCompanySlug: slug,
          firmId: localCompanyId,
          isActive: true,
          canReceiveInvoiceMail: true,
        },
        orderBy: [{ departmentCode: "asc" }, { fullName: "asc" }],
      }),
    ]);
    return {
      departments: departments.map((row) => ({
        code: row.departmentCode,
        name: row.departmentName || row.departmentCode,
      })),
      contacts: contacts.map((row) => ({
        id: row.id,
        departmentCode: row.departmentCode || "",
        name: row.fullName,
        email: row.email,
      })),
    };
  }

  async invoiceAssistantTemplate(query: Query = {}) {
    const slug = this.slug(query);
    const row = await this.prisma.setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "INVOICE_ASSISTANT_TEMPLATE",
        },
      },
    });
    return {
      scenarioType: "2",
      invoiceType: "1",
      currency: "TRY",
      measureUnitId: 67,
      vatRate: 20,
      paymentDays: 0,
      carrier: {},
      attachments: [],
      notes: [],
      ...objectValue(row?.value),
    };
  }

  async saveInvoiceAssistantTemplate(body: Query = {}) {
    const slug = this.slug(body);
    const value = {
      scenarioType: clean(body.scenarioType || "2"),
      invoiceType: clean(body.invoiceType || "1"),
      currency: clean(body.currency || "TRY"),
      measureUnitId: numberValue(body.measureUnitId) || 67,
      vatRate: numberValue(body.vatRate),
      paymentDays: numberValue(body.paymentDays),
      carrier: objectValue(body.carrier),
      attachments: arrayValue(body.attachments),
      notes: arrayValue(body.notes).map(clean).filter(Boolean),
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.setting.upsert({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "INVOICE_ASSISTANT_TEMPLATE",
        },
      },
      create: {
        scope: "ISNET",
        mainCompanySlug: slug,
        key: "INVOICE_ASSISTANT_TEMPLATE",
        value,
      },
      update: { value },
    });
    return value;
  }

  private async recipientDetail(
    session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>,
    kind: "Invoice" | "Despatch",
    recipientId: string,
  ) {
    const recipient = await this.portalJson(
      session,
      `/${kind}/GetRecipient?RecipientId=${encodeURIComponent(recipientId)}`,
    );
    const tagPayload = await this.portalJson(
      session,
      `/${kind}/GetRecipientTag?IdAlici=${encodeURIComponent(recipientId)}&EtiketType=${kind === "Invoice" ? "1" : "2"}`,
    );
    const tags = arrayValue(tagPayload)
      .map((row: any) => clean(row.Etiket))
      .filter(Boolean);
    if (!tags.length) {
      throw new BadRequestException(
        `${clean(recipient?.AliciAdi) || "Seçilen firma"} için İşNet GİB etiketi bulunamadı.`,
      );
    }
    return { recipient, tag: tags[0], tags };
  }

  private async submitPortalDraft(
    session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>,
    page: "/Invoice/Create" | "/Despatch/Create",
    payload: Query,
  ) {
    const pageResponse = await session.request(page);
    const html = await pageResponse.text();
    const token = this.verificationToken(html);
    if (!pageResponse.ok || !token) {
      throw new BadGatewayException("İşNet taslak ekranı açılamadı.");
    }
    const response = await session.request(page, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: `${session.portalBase}${page}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({
        jsonData: JSON.stringify(payload),
        __RequestVerificationToken: token,
      }).toString(),
    });
    const raw = await response.text();
    let result: any = raw;
    try {
      result = raw ? JSON.parse(raw) : null;
    } catch {
      result = raw;
    }
    const error = clean(result?.error || result?.ErrorMessage);
    if (!response.ok || error) {
      throw new BadGatewayException(error || "İşNet taslağı kaydedemedi.");
    }
    return result;
  }

  private canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value as Query)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value ?? null);
  }

  private snapshotHash(value: unknown) {
    return createHash("sha256").update(this.canonicalJson(value)).digest("hex");
  }

  private invoiceSnapshot(input: Query) {
    const canonicalDate = (value: unknown) => {
      const raw = clean(value);
      const match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
      if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : raw;
    };
    const canonicalUnit = (value: unknown) => {
      const normalized = this.documentMatcher.normalize(value);
      return ["67", "C62", "ADET", "AD"].includes(normalized) ? "ADET" : normalized;
    };
    const canonicalScenario = (value: unknown) => {
      const normalized = this.documentMatcher.normalize(value);
      return normalized === "2" || normalized === "TICARI FATURA" || normalized === "TICARIFATURA" ? "TICARIFATURA" : normalized;
    };
    const canonicalInvoiceType = (value: unknown) => {
      const normalized = this.documentMatcher.normalize(value);
      return normalized === "1" || normalized === "SATIS" ? "SATIS" : normalized;
    };
    const lines = arrayValue(input.lines || input.Products).map((line: any, index) => {
      const quantity = numberValue(line.quantity ?? line.Quantity);
      const unitPrice = numberValue(line.unitPrice ?? line.UnitPrice);
      const discountAmount = numberValue(line.discountAmount ?? line.DiscountAmount);
      const subtotal = numberValue(line.subtotal ?? line.LineExtensionAmount ?? quantity * unitPrice - discountAmount);
      const vatRate = numberValue(line.vatRate ?? line.VatRate);
      const vatAmount = numberValue(line.vatAmount ?? line.VatAmount ?? subtotal * vatRate / 100);
      return {
        lineNo: Number(line.lineNo ?? line.LineNo ?? index + 1),
        description: clean(line.description ?? line.StockDescription ?? line.productName ?? line.ProductName),
        productName: clean(line.productName ?? line.ProductName ?? line.description ?? line.StockDescription),
        quantity,
        unit: canonicalUnit(line.unit ?? line.MeasureUnitDesc ?? line.measureUnitId ?? line.MeasureUnitId),
        unitPrice,
        discountAmount,
        subtotal,
        vatRate,
        vatAmount,
        total: numberValue(line.total ?? line.TotalAmount ?? subtotal + vatAmount),
        modelId: clean(line.modelId),
        sourceLineId: clean(line.sourceLineId || line.id),
      };
    });
    const subtotal = numberValue(input.subtotal ?? input.TotalLineExtensionAmount ?? lines.reduce((sum, line) => sum + line.subtotal, 0));
    const vatTotal = numberValue(input.vatTotal ?? input.TotalVATAmount ?? lines.reduce((sum, line) => sum + line.vatAmount, 0));
    return {
      recipientName: clean(input.recipientName ?? input.AliciAdi ?? input.ReceiverName),
      recipientTaxNo: clean(input.recipientTaxNo ?? input.Vnktckn ?? input.VKN ?? input.TCKN),
      dispatchNo: clean(input.dispatchNo ?? input.DispatchNumber ?? input.DispatchList?.[0]?.DispatchNumber),
      dispatchDate: canonicalDate(input.dispatchDate ?? input.DispatchDate ?? input.DispatchList?.[0]?.DispatchDate),
      invoiceDate: canonicalDate(input.invoiceDate ?? input.InvoiceDate),
      lines,
      subtotal,
      vatTotal,
      grandTotal: numberValue(input.grandTotal ?? input.TotalPayableAmount ?? subtotal + vatTotal),
      currency: clean(input.currency ?? input.CurrencyCode),
      scenario: canonicalScenario(input.scenario ?? input.scenarioType ?? input.ScenarioType),
      invoiceType: canonicalInvoiceType(input.invoiceType ?? input.InvoiceType),
    };
  }

  private recursiveValue(source: unknown, aliases: string[]): any {
    if (!source || typeof source !== "object") return undefined;
    const wanted = new Set(aliases.map((alias) => alias.toLocaleLowerCase("tr-TR")));
    const queue: any[] = [source];
    const seen = new Set<any>();
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || seen.has(current)) continue;
      seen.add(current);
      for (const [key, value] of Object.entries(current)) {
        if (wanted.has(key.toLocaleLowerCase("tr-TR"))) return value;
        if (value && typeof value === "object") queue.push(value);
      }
    }
    return undefined;
  }

  private portalInvoiceSnapshot(row: Query) {
    const rawLines = this.recursiveValue(row, ["Products", "InvoiceLines", "Lines", "FaturaSatirlari", "Items"]);
    return this.invoiceSnapshot({
      recipientName: this.recursiveValue(row, ["AliciAdi", "RecipientCompanyName", "ReceiverName", "Unvan_Ad_Soyad"]),
      recipientTaxNo: this.recursiveValue(row, ["Vnktckn", "VknTckn", "VKN", "TCKN", "ReceiverTaxNo"]),
      dispatchNo: this.recursiveValue(row, ["IrsaliyeNo", "DispatchNumber", "DespatchNumber"]),
      dispatchDate: this.recursiveValue(row, ["IrsaliyeTarihi", "DispatchDate", "DespatchDate"]),
      invoiceDate: this.recursiveValue(row, ["FaturaTarihi", "InvoiceDate", "IssueDate"]),
      lines: Array.isArray(rawLines) ? rawLines : [],
      subtotal: this.recursiveValue(row, ["MalHizmetToplami", "Matrah", "LineExtensionAmount", "TotalLineExtensionAmount"]),
      vatTotal: this.recursiveValue(row, ["HesaplananKdv", "KdvTutari", "VATAmount", "TotalVATAmount"]),
      grandTotal: this.recursiveValue(row, ["OdenecekTutar", "GenelToplam", "PayableAmount", "TotalPayableAmount"]),
      currency: this.recursiveValue(row, ["DovizKodu", "CurrencyCode", "DocumentCurrencyCode"]),
      scenario: this.recursiveValue(row, ["SenaryoAdi", "ScenarioType", "ProfileID"]),
      invoiceType: this.recursiveValue(row, ["FaturaTipiAdi", "InvoiceType", "InvoiceTypeCode"]),
    });
  }

  private compareInvoiceSnapshots(expected: Query, actual: Query) {
    const differences: Query[] = [];
    const textFields = ["recipientName", "recipientTaxNo", "dispatchNo", "dispatchDate", "invoiceDate", "currency", "scenario", "invoiceType"];
    for (const field of textFields) {
      const left = clean(expected[field]);
      const right = clean(actual[field]);
      const same = this.documentMatcher.normalize(left) === this.documentMatcher.normalize(right);
      if (!left || !right || !same) differences.push({ field, expected: left, actual: right, difference: right ? "VALUE_MISMATCH" : "PORTAL_VALUE_MISSING" });
    }
    const numberFields = ["subtotal", "vatTotal", "grandTotal"];
    for (const field of numberFields) {
      const left = numberValue(expected[field]);
      const right = numberValue(actual[field]);
      if (!Number.isFinite(right) || Math.abs(left - right) > 0.01) differences.push({ field, expected: left, actual: right, difference: right ? left - right : "PORTAL_VALUE_MISSING" });
    }
    const expectedLines = arrayValue(expected.lines);
    const actualLines = arrayValue(actual.lines);
    if (!actualLines.length || actualLines.length !== expectedLines.length) {
      differences.push({ field: "lines.length", expected: expectedLines.length, actual: actualLines.length, difference: actualLines.length ? "VALUE_MISMATCH" : "PORTAL_VALUE_MISSING" });
    }
    expectedLines.forEach((line: any, index) => {
      const portalLine = actualLines[index] || {};
      for (const field of ["description", "productName", "unit"]) {
        const left = clean(line[field]);
        const right = clean(portalLine[field]);
        if (!left || !right || this.documentMatcher.normalize(left) !== this.documentMatcher.normalize(right)) {
          differences.push({ field: `lines[${index}].${field}`, expected: left, actual: right, difference: right ? "VALUE_MISMATCH" : "PORTAL_VALUE_MISSING" });
        }
      }
      for (const field of ["quantity", "unitPrice", "discountAmount", "subtotal", "vatRate", "vatAmount", "total"]) {
        const left = numberValue(line[field]);
        const right = numberValue(portalLine[field]);
        if (portalLine[field] === undefined || Math.abs(left - right) > 0.01) {
          differences.push({ field: `lines[${index}].${field}`, expected: left, actual: portalLine[field] === undefined ? null : right, difference: portalLine[field] === undefined ? "PORTAL_VALUE_MISSING" : left - right });
        }
      }
    });
    return differences;
  }

  private async stagingInvoiceRows(
    session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>,
  ) {
    const page = "/OutgoingInvoice/StagingInvoiceList";
    const pageResponse = await session.request(page);
    const html = await pageResponse.text();
    const token = this.verificationToken(html);
    if (!pageResponse.ok || !token) throw new BadGatewayException("İşNet taslak fatura listesi açılamadı.");
    const response = await session.request("/OutgoingInvoice/GetStagingInvoiceList", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: `${session.portalBase}${page}`, "X-Requested-With": "XMLHttpRequest" },
      body: new URLSearchParams({ draw: "1", start: "0", length: "300", "search[value]": "", "search[regex]": "false", __RequestVerificationToken: token }).toString(),
    });
    const payload: any = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.data)) throw new BadGatewayException("İşNet taslak fatura listesi okunamadı.");
    return payload.data as Query[];
  }

  private portalDraftIdentity(row: Query) {
    return {
      id: clean(this.recursiveValue(row, ["IdFatura", "InvoiceId", "Id"])),
      no: clean(this.recursiveValue(row, ["FaturaNo", "InvoiceNumber", "DocumentNo", "Number"])),
      externalId: clean(this.recursiveValue(row, ["ExternalInvoiceCode", "IdFaturaExternal", "ExternalId"])),
    };
  }

  private async verifyStoredDraft(
    request: any,
    session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>,
  ) {
    const rows = await this.stagingInvoiceRows(session);
    const row = rows.find((item) => {
      const identity = this.portalDraftIdentity(item);
      return (request.portalDraftId && identity.id === request.portalDraftId) ||
        (request.draftNo && identity.no === request.draftNo) || identity.externalId === request.externalId;
    });
    if (!row) {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "VERIFY_PENDING", error: "Taslak İşNet taslak listesinden geri okunamadı." } });
      throw new BadGatewayException("Taslak İşNet taslak listesinden geri okunamadı; resmî gönderim engellendi.");
    }
    const expected = objectValue(request.expectedSnapshot);
    const portalSnapshot = this.portalInvoiceSnapshot(row);
    const differences = this.compareInvoiceSnapshots(expected, portalSnapshot);
    const version = this.snapshotHash(portalSnapshot);
    const identity = this.portalDraftIdentity(row);
    const approvalStillValid = !differences.length && clean(request.approvalVersion) === version && Boolean(request.approvedAt);
    const updated = await this.prisma.isnetInvoiceDraftRequest.update({
      where: { id: request.id },
      data: {
        portalDraftId: identity.id || request.portalDraftId,
        draftNo: identity.no || request.draftNo,
        portalSnapshot,
        verificationDiff: differences,
        draftVersion: version,
        approvalVersion: approvalStillValid ? request.approvalVersion : null,
        approvedAt: approvalStillValid ? request.approvedAt : null,
        approvedBy: approvalStillValid ? request.approvedBy : null,
        status: differences.length ? "VERIFY_FAILED" : approvalStillValid ? "APPROVED" : "VERIFIED",
        error: differences.length ? `${differences.length} doğrulama farkı bulundu.` : null,
      },
    });
    return { request: updated, verified: !differences.length, differences, expected, portal: portalSnapshot, version };
  }

  private async reserveInvoiceLineAllocations(requestId: string, dispatchNo: string, sourceLines: any[], billedLines: any[]) {
    const prior = await this.prisma.isnetInvoiceLineAllocation.findMany({
      where: {
        draftRequest: {
          dispatchNo,
          status: { in: ["SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING", "COMPLETED"] },
          id: { not: requestId },
        },
      },
    });
    const rows = billedLines.map((line: any, index: number) => {
      const source = sourceLines[index] || {};
      const sourceLineKey = clean(source.id || line.sourceLineId || `${index + 1}:${this.documentMatcher.normalize(source.productName || source.description || line.productName)}`);
      const dispatchedQuantity = numberValue(source.quantity);
      const billedQuantity = numberValue(line.quantity);
      const previouslyBilled = prior
        .filter((item) => item.sourceLineKey === sourceLineKey)
        .reduce((sum, item) => sum + numberValue(item.billedQuantity), 0);
      const totalBilled = previouslyBilled + billedQuantity;
      const remainingQuantity = dispatchedQuantity - totalBilled;
      if (billedQuantity <= 0 || remainingQuantity < -0.0001) {
        throw new ConflictException(`${index + 1}. satırda faturalanacak adet irsaliye kalan adedini aşıyor.`);
      }
      return {
        id: randomUUID(),
        draftRequestId: requestId,
        sourceLineKey,
        sourceIntakeLineId: clean(source.id) || null,
        modelId: clean(line.modelId || source.modelId) || null,
        productName: clean(line.productName || source.productName || source.description) || null,
        dispatchedQuantity,
        previouslyBilled,
        billedQuantity,
        nonBillableQuantity: numberValue(line.nonBillableQuantity),
        totalBilled,
        remainingQuantity: Math.max(0, remainingQuantity),
        status: totalBilled > dispatchedQuantity + 0.0001 ? "FAZLA_KONTROL" : remainingQuantity <= 0.0001 ? "TAM_FATURALANDI" : "KISMI_FATURALANDI",
        raw: { sourceLineNo: source.lineNo || index + 1, unitPrice: numberValue(line.unitPrice), vatRate: numberValue(line.vatRate) },
      };
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.isnetInvoiceLineAllocation.deleteMany({ where: { draftRequestId: requestId } });
      if (rows.length) await tx.isnetInvoiceLineAllocation.createMany({ data: rows });
    });
    return rows;
  }

  async createManualDispatchDraft(body: Query = {}) {
    const slug = this.slug(body);
    if (body.confirmed !== true) {
      throw new BadRequestException("İrsaliye taslağı için kullanıcı onayı zorunludur.");
    }
    const recipientId = clean(body.recipientId);
    const lines = arrayValue(body.lines).filter((line) => clean(line.productName));
    if (!recipientId) throw new BadRequestException("Alıcı firma seçimi zorunludur.");
    if (!lines.length) throw new BadRequestException("En az bir ürün satırı girin.");
    const { companyId, session } = await this.configuredPortal(slug);
    const { recipient, tag } = await this.recipientDetail(session, "Despatch", recipientId);
    const date = this.portalInputDate(body.issueDate);
    const time = clean(body.issueTime) || new Date().toLocaleTimeString("tr-TR", { hour12: false });
    const payload = {
      ETTN: "",
      DespatchAdviceId: 0,
      RecipientType: clean(recipient.AliciTipi || 3),
      DespatchAdviceNumber: clean(body.documentNo),
      CompanyId: companyId,
      ScenarioType: clean(body.scenarioType || 1),
      ReceiverInboxTag: tag,
      DespatchAdviceDate: date,
      DespatchAdviceTime: time,
      ActualDespatchAdviceDate: date,
      ActualDespatchAdviceTime: time,
      DespatchAdviceType: clean(body.dispatchType || 1),
      IdIrsaliyeExternal: clean(body.externalId),
      OrderDate: this.portalInputDate(body.orderDate || body.issueDate),
      OrderNumber: clean(body.orderNo),
      LastPaymentDate: "",
      AttachmentList: [],
      IdAlici: recipientId,
      Products: lines.map((line: any) => ({
        ProductDespatchModelId: 0,
        LineExtensionAmount: numberValue(line.quantity) * numberValue(line.unitPrice),
        MeasureUnitId: clean(line.measureUnitId || 67),
        ProductId: 0,
        ProductName: clean(line.productName),
        Quantity: numberValue(line.quantity) || 1,
        Deleted: false,
        ImprintNumber: "",
        IdisTagNumbers: [],
        UnitPrice: numberValue(line.unitPrice),
        StockDescription: clean(line.description || body.modelName),
      })),
      CurrencyCode: clean(body.currency || "TRY"),
      Notes: [clean(body.note), clean(body.modelName) ? `MODEL: ${clean(body.modelName)}` : ""].filter(Boolean),
      TotalAmount: lines.reduce((sum: number, line: any) => sum + numberValue(line.quantity) * numberValue(line.unitPrice), 0),
      AliciBayiNo: "",
      PrintedDocumentDate: "",
      PrintedDocumentSerialNumber: "",
      PrintedDocumentOrderNumber: "",
      PrintedStaticValue: "",
      CompanyBankAccountList: [],
      DriverList: [],
      IdisShipmentNumber: "",
      CarrierVkn: "",
      CarrierTitle: "",
      Plaque: clean(body.plaque),
      TrailerPlaque: "",
    };
    const result = await this.submitPortalDraft(session, "/Despatch/Create", payload);
    return {
      ok: true,
      draftNo: clean(typeof result === "string" || typeof result === "number" ? result : result?.documentNo),
      recipientName: clean(recipient.AliciAdi),
      message: "Giden e-irsaliye taslağı KY ERP içinden oluşturuldu.",
    };
  }

  async outgoingDispatchInvoiceDraft(id: string, query: Query = {}) {
    const slug = this.slug(query);
    if (!/^\d+$/.test(clean(id))) throw new BadRequestException("İrsaliye kimliği geçersiz.");
    const file = await this.portalDocumentFile({
      ...query,
      id,
      direction: "outgoing",
      kind: "dispatch",
      format: "xml",
    });
    const parsed = this.parseDispatchXml(file.buffer);
    const recipients = await this.recipientSearch({
      ...query,
      mainCompanySlug: slug,
      kind: "invoice",
      q: parsed.receiverName,
    });
    const normalizedName = this.documentMatcher.normalize(parsed.receiverName);
    const recipient = recipients.rows.find(
      (row: any) => this.documentMatcher.normalize(row.name) === normalizedName,
    ) || recipients.rows[0] || null;
    const modelName = clean(
      parsed.notes.find((note: string) => /^MODEL\s*:/i.test(note))?.replace(/^MODEL\s*:/i, "") ||
      parsed.lines[0]?.description ||
      parsed.lines[0]?.productName,
    );
    const modelRecords = modelName
      ? await this.prisma.modelRecord.findMany({
          where: { mainCompanySlug: slug },
          select: { id: true, modelName: true, raw: true },
          take: 2000,
        })
      : [];
    const normalizedModel = this.documentMatcher.normalize(modelName);
    const model = modelRecords.find((row) => {
      const candidate = this.documentMatcher.normalize(row.modelName);
      return candidate && (candidate === normalizedModel || candidate.includes(normalizedModel) || normalizedModel.includes(candidate));
    });
    const modelImage = model
      ? await this.prisma.modelImage.findFirst({ where: { mainCompanySlug: slug, modelId: model.id }, orderBy: { createdAt: "desc" } })
      : null;
    const localCompanyId = clean(recipient?.localCompanyId);
    const [departments, contacts] = localCompanyId
      ? await Promise.all([
          this.prisma.muhasebeContactDepartment.findMany({
            where: { mainCompanySlug: slug, firmId: localCompanyId, isActive: true },
            orderBy: { departmentCode: "asc" },
          }),
          this.prisma.muhasebeContactPerson.findMany({
            where: { mainCompanySlug: slug, firmId: localCompanyId, isActive: true, canReceiveInvoiceMail: true },
            orderBy: [{ departmentCode: "asc" }, { fullName: "asc" }],
          }),
        ])
      : [[], []];
    return {
      sourceId: clean(id),
      dispatchNo: parsed.documentNo,
      dispatchDate: parsed.issueDate,
      recipient,
      recipientName: parsed.receiverName,
      invoiceDate: new Date().toISOString().slice(0, 10),
      scenarioType: "2",
      invoiceType: "1",
      currency: "TRY",
      notes: parsed.notes,
      modelName,
      modelId: model?.id || "",
      modelImageUrl: modelImage?.thumbnailPath || modelImage?.filePath || "",
      departments: departments.map((row) => ({ code: row.departmentCode, name: row.departmentName || row.departmentCode })),
      contacts: contacts.map((row) => ({ id: row.id, departmentCode: row.departmentCode || "", name: row.fullName, email: row.email })),
      lines: parsed.lines,
    };
  }

  async createInvoiceFromDispatch(id: string, body: Query = {}) {
    const slug = this.slug(body);
    if (body.confirmed !== true) {
      throw new BadRequestException("Fatura taslağı için son kullanıcı onayı zorunludur.");
    }
    if (body.previewApproved !== true) {
      throw new BadRequestException("İşNet taslağı oluşturmadan önce fatura önizlemesi kullanıcı tarafından onaylanmalıdır.");
    }
    const draft = await this.outgoingDispatchInvoiceDraft(id, body);
    const recipientId = clean(body.recipientId || draft.recipient?.id);
    const lines = arrayValue(body.lines).filter((line) => clean(line.productName));
    if (!recipientId) throw new BadRequestException("Fatura alıcısı seçilmelidir.");
    if (!lines.length) throw new BadRequestException("Fatura için en az bir satır zorunludur.");
    if (lines.some((line) => numberValue(line.quantity) <= 0 || numberValue(line.unitPrice) <= 0)) {
      throw new BadRequestException("Fatura satırlarında miktar ve birim fiyat sıfırdan büyük olmalıdır.");
    }
    if (lines.some((line) => numberValue(line.vatRate ?? 20) < 0 || numberValue(line.vatRate ?? 20) > 100)) {
      throw new BadRequestException("Fatura satırlarındaki KDV oranı yüzde 0 ile 100 arasında olmalıdır.");
    }
    const { companyId, session } = await this.configuredPortal(slug);
    const { recipient, tag } = await this.recipientDetail(session, "Invoice", recipientId);
    const recipientTaxNo = clean(recipient.Vnktckn || recipient.VKN || recipient.TCKN);
    if (!/^\d{10,11}$/.test(recipientTaxNo)) {
      throw new BadRequestException("Alıcı VKN/TCKN doğrulanamadığı için İşNet taslağı oluşturulmadı.");
    }
    const sourceQuantity = arrayValue(draft.lines).reduce((sum, line) => sum + numberValue(line.quantity), 0);
    const requestedQuantity = lines.reduce((sum, line) => sum + numberValue(line.quantity), 0);
    if (requestedQuantity <= 0 || requestedQuantity - sourceQuantity > 0.0001) {
      throw new ConflictException("Faturalanacak adet irsaliye adedini aşıyor; İşNet taslağı oluşturulmadı.");
    }
    const products = lines.map((line: any) => {
      const quantity = numberValue(line.quantity) || 1;
      const unitPrice = numberValue(line.unitPrice);
      const vatRate = numberValue(line.vatRate ?? 20);
      const lineAmount = quantity * unitPrice;
      const vatAmount = lineAmount * vatRate / 100;
      return {
        ProductInvoiceModelId: 0,
        DiscountAmount: 0,
        DiscountRate: 0,
        LineExtensionAmount: lineAmount,
        MeasureUnitId: clean(line.measureUnitId || 67),
        ProductId: 0,
        ProductName: clean(line.productName),
        Quantity: quantity,
        TaxExemptionReason: "",
        TaxExemptionReasonCode: "",
        UnitPrice: unitPrice,
        VatAmount: vatAmount,
        VatRate: vatRate,
        AdditionalTaxes: [],
        WitholdingTaxes: [],
        Deleted: false,
        DeliveryList: [],
        CustomsTrackingList: [],
        IdisTagNumbers: [],
        StockDescription: clean(line.description || body.modelName),
      };
    });
    const subtotal = products.reduce((sum, line) => sum + line.LineExtensionAmount, 0);
    const vatTotal = products.reduce((sum, line) => sum + line.VatAmount, 0);
    const requestState = await this.beginInvoiceDraftRequest(slug, id, draft.dispatchNo);
    if (requestState.alreadyCompleted) {
      return {
        ok: true,
        verified: ["VERIFIED", "FINAL_APPROVAL_PENDING", "APPROVED", "SUBMITTING", "SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING", "COMPLETED"].includes(clean(requestState.request.status)),
        requestId: requestState.request.id,
        draftId: requestState.request.portalDraftId || "",
        draftVersion: requestState.request.draftVersion || "",
        status: requestState.request.status,
        draftNo: requestState.request.draftNo || "",
        dispatchNo: draft.dispatchNo,
        mailPackageId: requestState.request.mailPackageId || "",
        message: "Bu irsaliye için fatura taslağı daha önce oluşturulmuştu; mevcut taslak açıldı.",
      };
    }
    const payload = {
      ETTN: "",
      InvoiceId: 0,
      RecipientType: clean(recipient.AliciTipi || 1),
      InvoiceNumber: clean(body.invoiceNo),
      CompanyId: companyId,
      ScenarioType: "2",
      ReceiverInboxTag: tag,
      InvoiceDate: this.portalInputDate(body.invoiceDate),
      InvoiceTime: clean(body.invoiceTime) || new Date().toLocaleTimeString("tr-TR", { hour12: false }),
      InvoiceType: "1",
      IdFaturaExternal: requestState.identity.externalId,
      OrderDate: "",
      OrderNumber: "",
      LastPaymentDate: this.portalInputDate(body.dueDate || body.invoiceDate),
      DispatchList: [{ DispatchNumber: draft.dispatchNo, DispatchDate: this.portalInputDate(draft.dispatchDate) }],
      AttachmentList: [],
      IdAlici: recipientId,
      Products: products,
      CurrencyCode: clean(body.currency || "TRY"),
      Notes: [
        ...arrayValue(body.notes).map(clean).filter(Boolean),
        clean(body.modelName) ? `MODEL: ${clean(body.modelName)}` : "",
        clean(body.departmentNo) ? `DEPARTMAN: ${clean(body.departmentNo)}` : "",
      ].filter(Boolean),
      IsFreeOfCharge: false,
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
      ...this.invoiceSnapshot({
      recipientName: clean(recipient.AliciAdi),
      recipientTaxNo,
      dispatchNo: draft.dispatchNo,
      dispatchDate: draft.dispatchDate,
      invoiceDate: clean(body.invoiceDate),
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
    };
    await this.prisma.isnetInvoiceDraftRequest.update({
      where: { id: requestState.request.id },
      data: { expectedSnapshot, status: "CREATING", error: null },
    });
    await this.reserveInvoiceLineAllocations(requestState.request.id, draft.dispatchNo, arrayValue(draft.lines), lines);
    let result: any;
    try {
      result = await this.submitPortalDraft(session, "/Invoice/Create", payload);
    } catch (error: any) {
      await this.prisma.isnetInvoiceDraftRequest.update({
        where: { id: requestState.request.id },
        data: { status: "FAILED", error: clean(error?.message).slice(0, 1000) || "İşNet taslak oluşturma hatası" },
      });
      throw error;
    }
    const draftNo = clean(typeof result === "string" || typeof result === "number" ? result : result?.documentNo);
    const draftId = clean(typeof result === "string" || typeof result === "number" ? result : result?.id || result?.invoiceId || result?.InvoiceId);
    if (!draftNo && !draftId) {
      await this.prisma.isnetInvoiceDraftRequest.update({
        where: { id: requestState.request.id },
        data: { status: "VERIFY_PENDING", error: "İşNet doğrulanabilir taslak kimliği döndürmedi." },
      });
      throw new BadGatewayException("İşNet taslağı kaydettiğini doğrulayan numara veya kimlik dönmedi. Çift kayıt riskine karşı yeniden gönderim engellendi.");
    }
    await this.prisma.isnetInvoiceDraftRequest.update({
      where: { id: requestState.request.id },
      data: { status: "VERIFY_PENDING", draftNo: draftNo || draftId, portalDraftId: draftId || null },
    });
    const verification = await this.verifyStoredDraft(
      { ...requestState.request, expectedSnapshot, draftNo: draftNo || draftId, portalDraftId: draftId || null },
      session,
    );
    if (!verification.verified) {
      return {
        ok: true,
        verified: false,
        requestId: requestState.request.id,
        draftId: clean(verification.request.portalDraftId || draftId),
        draftNo: clean(verification.request.draftNo || draftNo),
        draftVersion: verification.version,
        verification: { differences: verification.differences, expected: verification.expected, portal: verification.portal },
        status: "VERIFY_FAILED",
        message: `İşNet taslağında ${verification.differences.length} alan farkı bulundu; resmî gönderim engellendi.`,
      };
    }
    const verifiedDraft = {
      sourceId: clean(verification.request.portalDraftId || draftId),
      documentNo: clean(verification.request.draftNo || draftNo),
    };
    const departmentNo = clean(body.departmentNo);
    const mailContacts = arrayValue(body.contacts).filter(
      (contact) => clean(contact.email) && (!departmentNo || clean(contact.departmentCode) === departmentNo),
    );
    const mailPackage = await this.prisma.mailPackage.create({
      data: {
        mainCompanySlug: slug,
        companyId: clean(draft.recipient?.localCompanyId) || null,
        modelId: clean(body.modelId || draft.modelId) || null,
        invoiceNo: draftNo || null,
        dispatchNo: draft.dispatchNo || null,
        departmentNo: departmentNo || null,
        toList: mailContacts.map((contact) => clean(contact.email)),
        ccList: [],
        subject: `${draftNo || "Fatura taslağı"} · ${clean(body.modelName) || draft.dispatchNo}`,
        body: `${clean(recipient.AliciAdi)} için ${draft.dispatchNo} irsaliyesine bağlı fatura taslağı hazırlandı. Departman: ${departmentNo}. PDF/XML, İşNet senkronizasyonundan sonra pakete eklenecektir.`,
        attachmentsJson: [],
        status: "WAITING_DOCUMENTS",
        raw: { source: "ISNET_INVOICE_ASSISTANT", recipientId, contactCount: mailContacts.length },
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
      draftId: verifiedDraft.sourceId || draftId,
      draftNo: draftNo || verifiedDraft.documentNo,
      draftVersion: verification.version,
      verification: { differences: [], expected: verification.expected, portal: verification.portal },
      recipientName: clean(recipient.AliciAdi),
      dispatchNo: draft.dispatchNo,
      mailPackageId: mailPackage.id,
      mailRecipientCount: mailContacts.length,
      message: `Fatura taslağı KY ERP içinden oluşturuldu; portal sekmesi açılmadı. Mail paketi ${mailContacts.length} alıcı için belgeyi bekliyor.`,
    };
  }

  async createManualInvoiceDraft(body: Query = {}) {
    const slug = this.slug(body);
    if (body.confirmed !== true) {
      throw new BadRequestException("Fatura taslağı için son kullanıcı onayı zorunludur.");
    }
    const recipientId = clean(body.recipientId);
    const lines = arrayValue(body.lines).filter((line) => clean(line.productName));
    if (!recipientId) throw new BadRequestException("Fatura alıcısı seçilmelidir.");
    if (!lines.length) throw new BadRequestException("Fatura için en az bir satır zorunludur.");
    if (lines.some((line) => numberValue(line.quantity) <= 0 || numberValue(line.unitPrice) <= 0)) {
      throw new BadRequestException("Fatura satırlarında miktar ve birim fiyat sıfırdan büyük olmalıdır.");
    }
    if (lines.some((line) => numberValue(line.vatRate ?? body.vatRate ?? 20) < 0 || numberValue(line.vatRate ?? body.vatRate ?? 20) > 100)) {
      throw new BadRequestException("Fatura satırlarındaki KDV oranı yüzde 0 ile 100 arasında olmalıdır.");
    }
    const { companyId, session } = await this.configuredPortal(slug);
    const { recipient, tag } = await this.recipientDetail(session, "Invoice", recipientId);
    const products = lines.map((line: any) => {
      const quantity = numberValue(line.quantity);
      const unitPrice = numberValue(line.unitPrice);
      const vatRate = numberValue(line.vatRate ?? body.vatRate ?? 20);
      const lineAmount = quantity * unitPrice;
      const vatAmount = lineAmount * vatRate / 100;
      return {
        ProductInvoiceModelId: 0,
        DiscountAmount: numberValue(line.discountAmount),
        DiscountRate: numberValue(line.discountRate),
        LineExtensionAmount: lineAmount,
        MeasureUnitId: clean(line.measureUnitId || body.measureUnitId || 67),
        ProductId: 0,
        ProductName: clean(line.productName),
        Quantity: quantity,
        TaxExemptionReason: clean(line.taxExemptionReason),
        TaxExemptionReasonCode: clean(line.taxExemptionReasonCode),
        UnitPrice: unitPrice,
        VatAmount: vatAmount,
        VatRate: vatRate,
        AdditionalTaxes: [],
        WitholdingTaxes: [],
        Deleted: false,
        DeliveryList: [],
        CustomsTrackingList: [],
        IdisTagNumbers: [],
        StockDescription: clean(line.description || body.modelName),
      };
    });
    const subtotal = products.reduce((sum, line) => sum + line.LineExtensionAmount, 0);
    const vatTotal = products.reduce((sum, line) => sum + line.VatAmount, 0);
    const dispatchNo = clean(body.dispatchNo);
    const invoiceDate = clean(body.invoiceDate) || new Date().toISOString().slice(0, 10);
    const payload = {
      ETTN: "",
      InvoiceId: 0,
      RecipientType: clean(recipient.AliciTipi || 1),
      InvoiceNumber: clean(body.invoiceNo),
      CompanyId: companyId,
      ScenarioType: "2",
      ReceiverInboxTag: tag,
      InvoiceDate: this.portalInputDate(invoiceDate),
      InvoiceTime: clean(body.invoiceTime) || new Date().toLocaleTimeString("tr-TR", { hour12: false }),
      InvoiceType: "1",
      IdFaturaExternal: clean(body.externalId),
      OrderDate: this.portalInputDate(body.orderDate || invoiceDate),
      OrderNumber: clean(body.orderNo),
      LastPaymentDate: this.portalInputDate(body.dueDate || invoiceDate),
      DispatchList: dispatchNo
        ? [{ DispatchNumber: dispatchNo, DispatchDate: this.portalInputDate(body.dispatchDate || invoiceDate) }]
        : [],
      AttachmentList: [],
      IdAlici: recipientId,
      Products: products,
      CurrencyCode: clean(body.currency || "TRY"),
      Notes: [
        ...arrayValue(body.notes).map(clean).filter(Boolean),
        clean(body.modelName) ? `MODEL: ${clean(body.modelName)}` : "",
        clean(body.departmentNo) ? `DEPARTMAN: ${clean(body.departmentNo)}` : "",
        clean(body.productionRecordId) ? `ÜRETİM: ${clean(body.productionRecordId)}` : "",
      ].filter(Boolean),
      IsFreeOfCharge: false,
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
    const result = await this.submitPortalDraft(session, "/Invoice/Create", payload);
    const draftNo = clean(
      typeof result === "string" || typeof result === "number"
        ? result
        : result?.documentNo,
    );
    const departmentNo = clean(body.departmentNo);
    const contacts = arrayValue(body.contacts).filter(
      (contact) => clean(contact.email) && (!departmentNo || clean(contact.departmentCode) === departmentNo),
    );
    const mailPackage = await this.prisma.mailPackage.create({
      data: {
        mainCompanySlug: slug,
        companyId: clean(body.localCompanyId) || null,
        modelId: clean(body.modelId) || null,
        invoiceNo: draftNo || null,
        dispatchNo: dispatchNo || null,
        departmentNo: departmentNo || null,
        toList: contacts.map((contact) => clean(contact.email)),
        ccList: [],
        subject: `${draftNo || "Fatura taslağı"} · ${clean(body.modelName) || clean(recipient.AliciAdi)}`,
        body: `${clean(recipient.AliciAdi)} için fatura taslağı hazırlandı. Departman: ${departmentNo || "belirtilmedi"}. PDF/XML senkronizasyondan sonra pakete eklenecektir.`,
        attachmentsJson: [],
        status: "WAITING_DOCUMENTS",
        raw: {
          source: "ISNET_MANUAL_INVOICE_ASSISTANT",
          recipientId,
          productionRecordId: clean(body.productionRecordId),
          contactCount: contacts.length,
        },
      },
    });
    return {
      ok: true,
      draftNo,
      recipientName: clean(recipient.AliciAdi),
      mailPackageId: mailPackage.id,
      mailRecipientCount: contacts.length,
      message: "Fatura taslağı KY ERP içinden oluşturuldu; İşNet portalı açılmadı.",
    };
  }

  private async loginToIsnet(username: string, password: string) {
    if (!username || !password) {
      throw new BadRequestException(
        "İşNet kullanıcı adı ve şifresi zorunludur.",
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(
        `${this.isnetBaseUrl().replace(/\/+$/, "")}/api/Account/Login`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            IdentificationNumber: username,
            Password: password,
          }),
          signal: controller.signal,
        },
      );
      const raw = await response.text();
      let payload: any = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = {};
      }
      if (response.status === 401 || response.status === 403) {
        return await this.loginToPortal(username, password);
      }
      if (!response.ok) {
        throw new BadGatewayException(
          `İşNet giriş servisi yanıt vermedi (${response.status}).`,
        );
      }
      const result = clean(
        payload?.Result ?? payload?.result,
      ).toLocaleLowerCase("tr-TR");
      const token = clean(payload?.Token ?? payload?.token);
      const errorMessage = clean(
        payload?.ErrorMessage ?? payload?.errorMessage,
      );
      if (
        errorMessage ||
        (!token &&
          result &&
          !["0", "success", "başarılı", "basarili", "ok"].includes(result))
      ) {
        throw new BadRequestException(
          errorMessage || "İşNet girişi başarısız.",
        );
      }
      const companies = this.normalizeCompanies(payload);
      if (!token)
        throw new BadRequestException("İşNet giriş tokenı alınamadı.");
      if (!companies.length) {
        throw new BadRequestException(
          "Bu İşNet kullanıcısına bağlı yetkili firma bulunamadı.",
        );
      }
      return {
        companies,
        expiresOn: payload?.ExpiresOn || payload?.expiresOn || null,
        connectionMode: "api",
      };
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new ServiceUnavailableException(
          "İşNet giriş isteği zaman aşımına uğradı.",
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getSettings(query: Query = {}) {
    const slug = this.slug(query);
    const row = await this.connectionRow(slug);
    const value = this.connectionValue(row);
    const companies = arrayValue(value.companies) as IsnetCompanyOption[];
    const selectedCompany = companies.find(
      (company) => clean(company.id) === clean(value.companyId),
    );
    return {
      mainCompanySlug: slug,
      username: clean(value.username || process.env.ISNET_USERNAME),
      hasPassword: Boolean(
        value.passwordEncrypted || clean(process.env.ISNET_PASSWORD),
      ),
      companyId: clean(value.companyId || process.env.ISNET_COMPANY_ID),
      companyName: clean(value.companyName || selectedCompany?.name),
      companies,
      testedAt: value.testedAt || null,
      savedAt: row?.updatedAt || null,
      connectionMode: clean(value.connectionMode),
      apiBase: this.isnetBaseUrl(),
    };
  }

  async testSettings(body: Query = {}) {
    const slug = this.slug(body);
    const row = await this.connectionRow(slug);
    const stored = this.connectionValue(row);
    const username = clean(
      body.username || stored.username || process.env.ISNET_USERNAME,
    );
    const password =
      clean(body.password) ||
      this.decryptSecret(stored.passwordEncrypted) ||
      clean(process.env.ISNET_PASSWORD);
    const result = await this.loginToIsnet(username, password);
    return {
      ok: true,
      username,
      companies: result.companies,
      expiresOn: result.expiresOn,
      connectionMode: result.connectionMode,
      testedAt: new Date().toISOString(),
    };
  }

  async saveSettings(body: Query = {}) {
    const slug = this.slug(body);
    const currentRow = await this.connectionRow(slug);
    const current = this.connectionValue(currentRow);
    const username = clean(
      body.username || current.username || process.env.ISNET_USERNAME,
    );
    const password =
      clean(body.password) ||
      this.decryptSecret(current.passwordEncrypted) ||
      clean(process.env.ISNET_PASSWORD);
    const tested = await this.loginToIsnet(username, password);
    const companyId = clean(body.companyId);
    const selectedCompany = tested.companies.find(
      (company) => company.id === companyId,
    );
    if (!selectedCompany) {
      throw new BadRequestException(
        "Kaydetmek için İşNet firma seçimi zorunludur.",
      );
    }
    const value = {
      username,
      passwordEncrypted: this.encryptSecret(password),
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      companies: tested.companies,
      connectionMode: tested.connectionMode,
      testedAt: new Date().toISOString(),
    };
    await this.prisma.setting.upsert({
      where: {
        scope_mainCompanySlug_key: {
          scope: "ISNET",
          mainCompanySlug: slug,
          key: "CONNECTION",
        },
      },
      update: { value, deletedAt: null },
      create: {
        scope: "ISNET",
        mainCompanySlug: slug,
        key: "CONNECTION",
        value,
      },
    });
    return this.getSettings({ mainCompanySlug: slug });
  }

  private async configuration(slug: string) {
    const settings = await this.getSettings({ mainCompanySlug: slug });
    const authConfigured = Boolean(
      clean(process.env.ISNET_TOKEN) ||
      (settings.username && settings.hasPassword),
    );
    const companyConfigured = Boolean(settings.companyId);
    return {
      apiConfigured: authConfigured && companyConfigured,
      authConfigured,
      companyConfigured,
      apiBase: this.isnetBaseUrl(),
      username: settings.username,
      companyId: settings.companyId,
      companyName: settings.companyName,
      capabilities: {
        listLocalRecords: true,
        validateInvoice: true,
        markMailSent: true,
        sync: settings.connectionMode === "portal",
        createInvoiceDraft: true,
        verifyInvoiceDraft: true,
        submitOfficialInvoice: settings.connectionMode === "portal",
        prepareInvoice: false,
        archiveInvoice: false,
        outlookDraft: false,
      },
    };
  }

  async configurationSummary(query: Query = {}) {
    const slug = this.slug(query);
    return {
      generatedAt: new Date().toISOString(),
      configuration: await this.configuration(slug),
    };
  }

  private fileState(rawValue: unknown) {
    const serialized = JSON.stringify(rawValue || {}).toLocaleLowerCase(
      "tr-TR",
    );
    return {
      hasPdf:
        serialized.includes(".pdf") || serialized.includes("application/pdf"),
      hasXml:
        serialized.includes(".xml") || serialized.includes("application/xml"),
    };
  }

  private mapDispatch(row: any, invoicedDispatches: Set<string>) {
    const raw = objectValue(row.parseRawJson);
    const line = row.lines?.[0] || {};
    const dispatchNo = clean(row.dispatchNo || row.documentNo);
    const modelName = clean(row.modelGuess || line.modelGuess || line.rawName);
    const groupName = clean(
      raw.groupName || raw.modelGroup || raw.departmentName || raw.departmentNo,
    );
    const quantity = (row.lines || []).reduce(
      (sum: number, item: any) => sum + numberValue(item.quantity),
      0,
    );
    const files = this.fileState({
      raw,
      filePath: row.filePath,
      fileName: row.originalFileName,
    });
    const matched = Boolean(row.firmId && (row.modelId || modelName));
    const alreadyInvoiced = invoicedDispatches.has(dispatchNo);
    const invoiceReady = Boolean(
      dispatchNo && matched && quantity > 0 && !alreadyInvoiced,
    );

    return {
      id: row.id,
      dateText: dateText(row.issueDate || row.createdAt),
      dispatchNo,
      companyName: clean(row.issuerName || row.receiverName),
      groupName,
      modelName,
      quantity,
      lastUnitPrice: numberValue(raw.lastUnitPrice || line.unitPrice),
      vatRate: numberValue(line.vatRate || raw.vatRate || 20),
      filesReady: files.hasPdf && files.hasXml,
      fileState: files,
      matched,
      invoiceReady,
      invoicePending: invoiceReady,
      alreadyInvoiced,
      invoiceStatusText: alreadyInvoiced
        ? "Faturalandı"
        : invoiceReady
          ? "Hazır"
          : "Kontrol gerekli",
      status: row.status,
      missingFields: arrayValue(row.missingFieldsJson),
    };
  }

  async incomingDispatches(query: Query = {}) {
    const slug = this.slug(query);
    const rows = await this.prisma.documentIntake.findMany({
      where: { mainCompanySlug: slug, documentKind: "CUSTOMER_DISPATCH" },
      include: { lines: true },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    const dispatchNos = rows
      .map((row) => clean(row.dispatchNo || row.documentNo))
      .filter(Boolean);
    const invoiceRows = dispatchNos.length
      ? await this.prisma.salesInvoiceState.findMany({
          where: { mainCompanySlug: slug, dispatchNo: { in: dispatchNos } },
          select: { dispatchNo: true },
        })
      : [];
    const invoiced = new Set(
      invoiceRows.map((row) => clean(row.dispatchNo)).filter(Boolean),
    );
    return rows.map((row) => this.mapDispatch(row, invoiced));
  }

  async issuedDocuments(query: Query = {}) {
    const slug = this.slug(query);
    const [rows, automationRow] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          mainCompanySlug: slug,
          deletedAt: null,
          OR: [
            { documentType: { contains: "SATIS" } },
            { documentType: { contains: "FATURA" } },
            { documentType: { contains: "IRSALIYE" } },
          ],
        },
        include: { files: true, company: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 500,
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
    const automationStates = Object.values(
      await this.automationStates(slug, objectValue(automationRow?.value)),
    ).map(objectValue);
    const stateByDocumentNo = new Map(
      automationStates
        .filter((state) => clean(state.documentNo))
        .map((state) => [clean(state.documentNo), state]),
    );
    return rows.map((row: any) => {
      const raw = objectValue(row.raw);
      const files = (row.files || []).filter((file: any) => !file.deletedAt);
      const archiveState = stateByDocumentNo.get(clean(row.documentNo)) || {};
      const statePdfPath = clean(archiveState.pdfPath);
      const stateXmlPath = clean(archiveState.xmlPath);
      const hasPdf = files.some((file: any) =>
        /pdf/i.test(`${file.mimeType} ${file.fileName}`),
      ) || Boolean(statePdfPath && fs.existsSync(statePdfPath));
      const hasXml = files.some((file: any) =>
        /xml/i.test(`${file.mimeType} ${file.fileName}`),
      ) || Boolean(stateXmlPath && fs.existsSync(stateXmlPath));
      const pdfFile = files.find((file: any) =>
        /pdf/i.test(`${file.mimeType} ${file.fileName}`),
      );
      const xmlFile = files.find((file: any) =>
        /xml/i.test(`${file.mimeType} ${file.fileName}`),
      );
      return {
        id: row.id,
        dateText: dateText(row.date || row.createdAt),
        documentTypeText: clean(row.documentType) || "Belge",
        documentNo: clean(row.documentNo),
        modelName: clean(raw.modelName || raw.modelAdi || archiveState.modelName),
        groupName: clean(raw.groupName || raw.modelGroup || raw.departmentNo),
        companyName: clean(row.company?.name || raw.companyName),
        filesReady: hasPdf && hasXml,
        fileState: { hasPdf, hasXml },
        pdfFileId: pdfFile?.id || null,
        xmlFileId: xmlFile?.id || null,
        oneDriveSaved:
          files.some((file: any) => fs.existsSync(file.filePath)) ||
          Boolean(
            (statePdfPath && fs.existsSync(statePdfPath)) ||
              (stateXmlPath && fs.existsSync(stateXmlPath)),
          ),
        archiveStage: archiveState.archiveStage || null,
        status: clean(row.status),
      };
    });
  }

  async issuedDocumentFile(id: string, query: Query = {}) {
    const slug = this.slug(query);
    const format = clean(query.format).toLowerCase() === "xml" ? "xml" : "pdf";
    const document = await this.prisma.document.findFirst({
      where: { id, mainCompanySlug: slug, deletedAt: null },
      include: { files: true },
    });
    if (!document) throw new NotFoundException("Arşiv belgesi bulunamadı.");
    const file = (document.files || []).find((item: any) =>
      !item.deletedAt && new RegExp(format, "i").test(`${item.mimeType} ${item.fileName}`),
    ) as any;
    let filePath = clean(file?.filePath);
    let fileName = clean(file?.fileName);
    if (!filePath || !fs.existsSync(filePath)) {
      const automationRow = await this.prisma.setting.findUnique({
        where: {
          scope_mainCompanySlug_key: {
            scope: "ISNET",
            mainCompanySlug: slug,
            key: "AUTOMATION",
          },
        },
      });
      const state = Object.values(
        await this.automationStates(slug, objectValue(automationRow?.value)),
      )
        .map(objectValue)
        .find((item) => clean(item.documentNo) === clean(document.documentNo));
      filePath = clean(format === "xml" ? state?.xmlPath : state?.pdfPath);
      fileName = filePath ? path.basename(filePath) : fileName;
    }
    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException(`${format.toUpperCase()} dosyası yerel arşivde bulunamadı.`);
    }
    return {
      buffer: fs.readFileSync(filePath),
      fileName: fileName || path.basename(filePath),
      contentType: format === "xml" ? "application/xml; charset=utf-8" : "application/pdf",
    };
  }

  async mailQueue(query: Query = {}) {
    const slug = this.slug(query);
    const rows = await this.prisma.mailPackage.findMany({
      where: { mainCompanySlug: slug, deletedAt: null },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    });
    return rows.map((row: any) => {
      const to = arrayValue(row.toList);
      const cc = arrayValue(row.ccList);
      const attachments = arrayValue(row.attachmentsJson);
      const sent =
        clean(row.status).toUpperCase() === "SENT" || Boolean(row.sentAt);
      return {
        id: row.id,
        modelName: clean(objectValue(row.raw).modelName),
        invoiceNo: clean(row.invoiceNo),
        dispatchNo: clean(row.dispatchNo),
        recipientCount: to.length + cc.length,
        attachmentsReady:
          attachments.filter((item) =>
            /\.pdf$/i.test(clean(item?.fileName || item?.path || item)),
          ).length >= 2,
        attachmentCount: attachments.length,
        sent,
        statusText: sent ? "Gönderildi" : clean(row.status) || "Taslak",
        subject: clean(row.subject),
        createdAt: row.createdAt,
      };
    });
  }

  async dashboard(query: Query = {}) {
    const slug = this.slug(query);
    const [dispatches, documents, mails, folder, automationRow] = await Promise.all([
      this.incomingDispatches({ mainCompanySlug: slug }),
      this.issuedDocuments({ mainCompanySlug: slug }),
      this.mailQueue({ mainCompanySlug: slug }),
      this.prisma.documentFolderSetting.findFirst({
        where: {
          mainCompanySlug: slug,
          active: true,
          targetModule: { contains: "ISNET" },
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.setting.findUnique({
        where: { scope_mainCompanySlug_key: { scope: "ISNET", mainCompanySlug: slug, key: "AUTOMATION" } },
      }),
    ]);
    const automation = objectValue(automationRow?.value);
    const automationDocuments = Object.values(objectValue(automation.documents)).map(objectValue);
    const archiveRoot = this.archiveRoot();
    const waiting = dispatches.filter((row) => row.invoicePending);
    const workItems = dispatches
      .filter((row) => !row.invoiceReady || row.invoicePending)
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        documentNo: row.dispatchNo,
        modelName: row.modelName,
        groupName: row.groupName,
        statusText: row.invoiceStatusText,
        tone: row.invoiceReady ? "green" : "orange",
      }));
    return {
      generatedAt: new Date().toISOString(),
      lastSyncText: automation.lastRunAt
        ? new Date(automation.lastRunAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
        : folder?.lastScanAt
        ? dateText(folder.lastScanAt)
        : "Henüz yok",
      newDispatchCount: dispatches.length,
      invoiceWaitingCount: waiting.length,
      invoiceWaitingTotal: waiting.reduce(
        (sum, row) =>
          sum +
          row.quantity *
            numberValue(row.lastUnitPrice) *
            (1 + numberValue(row.vatRate) / 100),
        0,
      ),
      unmatchedCount: dispatches.filter((row) => !row.matched).length,
      mailWaitingCount: mails.filter((row) => !row.sent).length,
      archivedDocumentCount: automationDocuments.filter((row) => row.completed).length ||
        documents.filter((row) => row.oneDriveSaved).length,
      oneDriveOk: fs.existsSync(archiveRoot),
      storagePath: archiveRoot,
      workItems,
      configuration: await this.configuration(slug),
    };
  }

  async validateInvoice(body: Query = {}) {
    const slug = this.slug(body);
    const row = await this.prisma.documentIntake.findFirst({
      where: {
        id: clean(body.dispatchId),
        mainCompanySlug: slug,
        documentKind: "CUSTOMER_DISPATCH",
      },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException("İrsaliye bulunamadı.");
    const dispatchNo = clean(row.dispatchNo || row.documentNo);
    const duplicate = dispatchNo
      ? await this.prisma.salesInvoiceState.findFirst({
          where: { mainCompanySlug: slug, dispatchNo },
        })
      : null;
    if (duplicate)
      throw new ConflictException(`${dispatchNo} daha önce faturalanmış.`);
    const errors = [
      !dispatchNo ? "İrsaliye numarası eksik." : "",
      !row.firmId ? "Firma eşleşmesi eksik." : "",
      !row.modelId && !row.modelGuess ? "Model eşleşmesi eksik." : "",
      !clean(body.invoiceSeries) ? "Fatura serisi eksik." : "",
      !clean(body.invoiceDate) ? "Fatura tarihi eksik." : "",
      numberValue(body.unitPrice) <= 0
        ? "Birim fiyat sıfırdan büyük olmalıdır."
        : "",
      numberValue(body.vatRate) < 0 ? "KDV oranı geçersiz." : "",
    ].filter(Boolean);
    return { ok: errors.length === 0, errors };
  }

  private automationKey(document: Query) {
    return `${clean(document.direction)}:${clean(document.kind)}:${clean(document.sourceId)}`;
  }

  private stateDate(value: unknown) {
    const text = clean(value);
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private stateFromRow(row: any): Query {
    return {
      ...objectValue(row.metadata),
      key: row.automationKey,
      sourceId: row.sourceId || "",
      kind: row.kind || "",
      direction: row.direction || "",
      documentNo: row.documentNo || "",
      partnerName: row.partnerName || "",
      dateText: row.dateText || "",
      modelName: row.modelName || "",
      modelLinked: row.modelLinked,
      archiveStage: row.archiveStage || "",
      intakeId: row.intakeId || "",
      pdfPath: row.pdfPath || "",
      xmlPath: row.xmlPath || "",
      customerDispatch: row.customerDispatch,
      printEligible: row.printEligible,
      printedAt: row.printedAt?.toISOString() || null,
      completed: row.completed,
      downloadedAt: row.downloadedAt?.toISOString() || null,
      markedReadAt: row.markedReadAt?.toISOString() || null,
      firstSeenAt: row.firstSeenAt?.toISOString() || null,
      newDocument: row.newDocument,
      appReadAt: row.appReadAt?.toISOString() || null,
      error: row.error || "",
      lastAttemptAt: row.lastAttemptAt?.toISOString() || null,
      uuid: row.uuid || "",
      issuerTaxNo: row.issuerTaxNo || "",
      receiverTaxNo: row.receiverTaxNo || "",
      companyId: row.companyId || "",
      companyType: row.companyType || (row.customerDispatch ? "CUSTOMER" : "SUPPLIER"),
      documentClass: row.documentClass || "",
      pdfStatus: row.pdfStatus || "",
      xmlStatus: row.xmlStatus || "",
    };
  }

  private stateData(key: string, state: Query) {
    return {
      automationKey: key,
      sourceId: clean(state.sourceId) || null,
      kind: clean(state.kind) || null,
      direction: clean(state.direction) || null,
      documentNo: clean(state.documentNo) || null,
      partnerName: clean(state.partnerName) || null,
      dateText: clean(state.dateText) || null,
      modelName: clean(state.modelName) || null,
      modelLinked: Boolean(state.modelLinked),
      archiveStage: clean(state.archiveStage) || null,
      intakeId: clean(state.intakeId) || null,
      pdfPath: clean(state.pdfPath) || null,
      xmlPath: clean(state.xmlPath) || null,
      customerDispatch: Boolean(state.customerDispatch),
      printEligible: Boolean(state.printEligible),
      printedAt: this.stateDate(state.printedAt),
      completed: Boolean(state.completed),
      downloadedAt: this.stateDate(state.downloadedAt),
      markedReadAt: this.stateDate(state.markedReadAt),
      firstSeenAt: this.stateDate(state.firstSeenAt),
      newDocument: Boolean(state.newDocument),
      appReadAt: this.stateDate(state.appReadAt),
      error: clean(state.error) || null,
      lastAttemptAt: this.stateDate(state.lastAttemptAt),
      uuid: clean(state.uuid) || null,
      issuerTaxNo: clean(state.issuerTaxNo) || null,
      receiverTaxNo: clean(state.receiverTaxNo) || null,
      companyId: clean(state.companyId) || null,
      companyType: clean(state.companyType) || (state.customerDispatch ? "CUSTOMER" : null),
      documentClass: clean(state.documentClass) || null,
      pdfStatus: clean(state.pdfStatus) || null,
      xmlStatus: clean(state.xmlStatus) || null,
      metadata: state,
    };
  }

  private async automationStates(slug: string, automationValue: Query = {}) {
    const rows = await this.prisma.isnetDocumentState.findMany({
      where: { mainCompanySlug: slug },
    });
    if (rows.length) {
      return Object.fromEntries(rows.map((row) => [row.automationKey, this.stateFromRow(row)]));
    }
    const legacy = objectValue(automationValue.documents);
    if (Object.keys(legacy).length) {
      await this.persistAutomationStates(slug, legacy);
    }
    return { ...legacy };
  }

  private async persistAutomationStates(slug: string, states: Record<string, Query>) {
    const entries = Object.entries(states).filter(([key]) => clean(key));
    if (!entries.length) return;
    await this.prisma.$transaction(
      entries.map(([key, state]) =>
        this.prisma.isnetDocumentState.upsert({
          where: {
            mainCompanySlug_automationKey: {
              mainCompanySlug: slug,
              automationKey: key,
            },
          },
          update: this.stateData(key, state),
          create: {
            mainCompanySlug: slug,
            ...this.stateData(key, state),
          },
        }),
      ),
    );
  }

  private archiveRoot() {
    return clean(process.env.KYERP_ISNET_ARCHIVE_ROOT) ||
      path.join("D:\\onedrive-Hkn\\OneDrive", "Masaüstü", "HKN");
  }

  private safeArchiveName(value: unknown) {
    return clean(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 96) || "ISNET-BELGE";
  }

  private shortModelName(value: unknown) {
    return this.safeArchiveName(value)
      .replace(/\s+/g, " ")
      .slice(0, 52)
      .trim();
  }

  private stagingArchiveFolder() {
    return "_MODEL_BEKLEYEN";
  }

  private temporaryDownloadFolder(document: Query, format: "pdf" | "xml") {
    const kind = document.kind === "dispatch" ? "E-IRSALIYE" : "E-FATURA";
    return path.join(this.archiveRoot(), "_ISNET_GECICI", kind, format.toUpperCase());
  }

  private writeTemporaryDownload(folder: string, baseName: string, extension: ".xml" | ".pdf", buffer: Buffer) {
    fs.mkdirSync(folder, { recursive: true });
    let suffix = 1;
    while (true) {
      const fileName = `${baseName}${suffix === 1 ? "" : `-${suffix}`}${extension}`;
      const target = path.join(folder, fileName);
      if (fs.existsSync(target)) {
        if (fs.readFileSync(target).equals(buffer)) return target;
        suffix += 1;
        continue;
      }
      try {
        fs.writeFileSync(target, buffer, { flag: "wx" });
        return target;
      } catch (error: any) {
        if (error?.code !== "EEXIST") throw error;
        suffix += 1;
      }
    }
  }

  private moveManagedArchiveFile(sourceValue: unknown, targetFolder: string, baseName: string) {
    const source = clean(sourceValue);
    if (!source || !fs.existsSync(source)) return source;
    const root = path.resolve(this.archiveRoot());
    const resolvedSource = path.resolve(source);
    if (!resolvedSource.toLocaleLowerCase("tr-TR").startsWith(`${root.toLocaleLowerCase("tr-TR")}${path.sep}`)) {
      throw new BadRequestException("Yalnızca İşNet arşivindeki yönetilen dosyalar taşınabilir.");
    }
    fs.mkdirSync(targetFolder, { recursive: true });
    const extension = path.extname(source).toLowerCase();
    const target = path.join(targetFolder, `${baseName}${extension}`);
    if (path.resolve(target) === resolvedSource) return source;
    if (fs.existsSync(target)) return target;
    fs.renameSync(source, target);
    return target;
  }

  private modelNameFromXml(buffer: Buffer, kind: string) {
    const xml = buffer.toString("utf8");
    const explicit = xml.match(/MODEL\s*[:\-]\s*([^<\r\n]+)/i)?.[1];
    if (explicit) return clean(explicit);
    try {
      const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(xml);
      const root = parsed?.Invoice || parsed?.DespatchAdvice || parsed;
      const line = this.xmlArray(kind === "invoice" ? root?.InvoiceLine : root?.DespatchLine)[0];
      return this.xmlValue(line?.Item?.Name) || this.xmlValue(line?.Item?.Description);
    } catch {
      return "";
    }
  }

  private archiveFolder(document: Query, customerDispatch: boolean) {
    if (document.kind === "invoice" && document.direction === "outgoing") return "HKN E-FATURA";
    if (document.kind === "dispatch" && document.direction === "outgoing") return "DDM E-İRSALİYE";
    if (document.kind === "invoice") return "İŞNET GELEN FATURALAR";
    return customerDispatch ? "KESİMDEN GELEN İRSALİYE" : "İŞNET GELEN İRSALİYELER";
  }

  private async isCustomerPartner(slug: string, partnerName: unknown) {
    const normalized = this.documentMatcher.normalize(partnerName);
    if (!normalized) return false;
    const companies = await this.prisma.company.findMany({
      where: { mainCompanySlug: slug, isActive: true, deletedAt: null },
      select: { name: true, normalizedName: true, type: true, firmaTuru: true, companyType: true, raw: true },
    });
    return companies.some((company) => {
      const companyName = this.documentMatcher.normalize(company.normalizedName || company.name);
      const matched = companyName === normalized || companyName.includes(normalized) || normalized.includes(companyName);
      if (!matched) return false;
      if (company.companyType === "CUSTOMER" || company.companyType === "BOTH") return true;
      const profile = `${company.type || ""} ${company.firmaTuru || ""} ${clean(objectValue(company.raw).relationshipType)}`.toUpperCase();
      return /MUSTERI|MÜŞTERİ|CUSTOMER|ALICI|BOTH|GENEL/.test(profile);
    });
  }

  private async markPortalDocumentRead(
    session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>,
    document: Query,
  ) {
    if (document.direction !== "incoming" || !document.unread) return false;
    const invoice = document.kind === "invoice";
    const page = invoice
      ? "/IncomingInvoice/IncomingInvoiceList"
      : "/IncomingDespatchAdvice/IncomingDespatchAdviceList";
    const endpoint = invoice
      ? "/IncomingInvoice/SetInvoicesReaded"
      : "/IncomingDespatchAdvice/SetDespatchReaded";
    const idKey = invoice ? "InvoiceId[]" : "DespatchId[]";
    const pageResponse = await session.request(page);
    const html = await pageResponse.text();
    const token = this.verificationToken(html);
    if (!pageResponse.ok || !token) return false;
    const form = new URLSearchParams();
    form.append(idKey, clean(document.sourceId));
    form.append("IsAllSelected", "false");
    form.append("__RequestVerificationToken", token);
    const response = await session.request(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: `${session.portalBase}${page}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: form.toString(),
    });
    return response.ok;
  }

  private multerFile(file: { buffer: Buffer; contentType: string; fileName: string }) {
    return {
      fieldname: "files",
      originalname: file.fileName,
      encoding: "7bit",
      mimetype: file.contentType,
      size: file.buffer.length,
      buffer: file.buffer,
    } as Express.Multer.File;
  }

  async sync(body: Query = {}) {
    const slug = this.slug(body);
    const active = this.activeSyncs.get(slug);
    if (active) return active;
    const operation = this.syncInternal(body, slug);
    this.activeSyncs.set(slug, operation);
    try {
      return await operation;
    } finally {
      if (this.activeSyncs.get(slug) === operation) this.activeSyncs.delete(slug);
    }
  }

  private async syncInternal(body: Query, slug: string) {
    const automationRow = await this.prisma.setting.findUnique({
      where: { scope_mainCompanySlug_key: { scope: "ISNET", mainCompanySlug: slug, key: "AUTOMATION" } },
    });
    const previous = objectValue(automationRow?.value);
    const today = new Date();
    const recentStart = new Date(today);
    recentStart.setDate(recentStart.getDate() - 7);
    const syncQuery = {
      ...body,
      startDate: clean(body.startDate) || recentStart.toISOString().slice(0, 10),
      endDate: clean(body.endDate) || today.toISOString().slice(0, 10),
    };
    const configured = await this.configuredPortal(slug);
    const portal = await this.portalDocuments({ ...syncQuery, __configuredPortal: configured });
    const newStatusWasEnabled = Boolean(previous.newStatusEnabledAt);
    const newStatusEnabledAt = previous.newStatusEnabledAt || new Date().toISOString();
    const states = await this.automationStates(slug, previous);
    if (!newStatusWasEnabled) {
      for (const [key, stateValue] of Object.entries(states)) {
        const state = objectValue(stateValue);
        states[key] = {
          ...state,
          newDocument: false,
          firstSeenAt: state.firstSeenAt || state.downloadedAt || newStatusEnabledAt,
          appReadAt: state.appReadAt || state.downloadedAt || newStatusEnabledAt,
        };
      }
    }
    const { session } = configured;
    const pendingCandidates = portal.documents.filter((document: Query) => {
      const state = objectValue(states[this.automationKey(document)]);
      return body.force === true || !state.completed || !state.pdfPath || !state.xmlPath || !fs.existsSync(clean(state.pdfPath)) || !fs.existsSync(clean(state.xmlPath));
    });
    const batchSize = Math.min(Math.max(numberValue(body.batchSize) || 25, 5), 50);
    const pending = pendingCandidates.slice(0, batchSize);
    const readPending = portal.documents.filter((document: Query) => {
      const state = objectValue(states[this.automationKey(document)]);
      return document.direction === "incoming" && document.unread && state.completed && !state.markedReadAt;
    });
    let cursor = 0;
    let downloaded = 0;
    let processed = 0;
    let markedRead = 0;
    const errors: Query[] = [];
    const worker = async () => {
      while (cursor < pending.length) {
        const document = pending[cursor++] as Query;
        const key = this.automationKey(document);
        const oldState = objectValue(states[key]);
        try {
          const [xml, pdf] = await Promise.all([
            this.downloadPortalFile(session, { ...document, format: "xml" }),
            this.downloadPortalFile(session, { ...document, format: "pdf" }),
          ]);
          let intakeId = clean(document.intakeId);
          let modelName = clean(document.modelGuess) || this.modelNameFromXml(xml.buffer, document.kind);
          let modelLinked = document.direction === "outgoing" && Boolean(modelName);
          if (document.direction === "incoming" || document.kind === "invoice") {
            const upload = await this.documentIntake.upload(
              [this.multerFile(xml)],
              { mainCompanySlug: slug, mainCompanyId: clean(body.mainCompanyId), autoApprove: true },
            );
            if (upload.errors?.length) throw new Error(upload.errors.map((item: any) => clean(item.message)).join(" "));
            intakeId = clean(upload.items?.[0]?.id || upload.skipped?.[0]?.existingId || intakeId);
            if (intakeId) {
              const intake = await this.documentIntake.detail(slug, intakeId);
              modelName = clean(intake.modelGuess) || modelName;
              modelLinked = Boolean(intake.modelId);
              if (intake.modelId) {
                const linkedModel = await this.prisma.modelRecord.findFirst({
                  where: { id: intake.modelId, mainCompanySlug: slug },
                  select: { modelName: true },
                });
                modelName = clean(linkedModel?.modelName) || modelName;
              }
            }
            processed += 1;
          }
          const customerDispatch = document.kind === "dispatch" && document.direction === "incoming"
            ? await this.isCustomerPartner(slug, document.partnerName)
            : false;
          const archiveStage = modelLinked ? "MODELE_BAGLI" : "MODEL_BEKLEYEN";
          const shortModelName = modelLinked ? this.shortModelName(modelName) : "";
          const baseName = this.safeArchiveName(
            `${document.documentNo || document.sourceId}${shortModelName ? ` ${shortModelName}` : ""}`,
          );
          const xmlFolder = this.temporaryDownloadFolder(document, "xml");
          const pdfFolder = this.temporaryDownloadFolder(document, "pdf");
          const xmlPath = this.writeTemporaryDownload(xmlFolder, baseName, ".xml", xml.buffer);
          const pdfPath = this.writeTemporaryDownload(pdfFolder, baseName, ".pdf", pdf.buffer);
          const read = await this.markPortalDocumentRead(session, document);
          if (read) markedRead += 1;
          states[key] = {
            ...oldState,
            ...document,
            key,
            sourceId: document.sourceId,
            kind: document.kind,
            direction: document.direction,
            documentNo: document.documentNo,
            partnerName: document.partnerName,
            dateText: document.dateText,
            modelName,
            modelLinked,
            archiveStage,
            intakeId,
            xmlPath,
            pdfPath,
            customerDispatch,
            printEligible: document.kind === "invoice" || customerDispatch,
            printedAt: oldState.printedAt || null,
            completed: true,
            downloadedAt: new Date().toISOString(),
            markedReadAt: read ? new Date().toISOString() : oldState.markedReadAt || null,
            firstSeenAt: oldState.firstSeenAt || new Date().toISOString(),
            newDocument: oldState.newDocument ?? Boolean(newStatusWasEnabled && !oldState.completed),
            appReadAt: oldState.appReadAt ||
              (newStatusWasEnabled && !oldState.completed ? null : oldState.downloadedAt || new Date().toISOString()),
          };
          downloaded += 1;
        } catch (error: any) {
          const message = clean(error?.message) || "Belge indirilemedi.";
          errors.push({ key, documentNo: document.documentNo, message });
          states[key] = { ...objectValue(states[key]), ...document, key, completed: false, error: message, lastAttemptAt: new Date().toISOString() };
        }
      }
    };
    await worker();
    await Promise.all(readPending.map(async (document: Query) => {
      const key = this.automationKey(document);
      if (await this.markPortalDocumentRead(session, document)) {
        states[key] = { ...objectValue(states[key]), markedReadAt: new Date().toISOString() };
        markedRead += 1;
      }
    }));
    const value = {
      enabled: previous.enabled !== false,
      intervalMinutes: numberValue(previous.intervalMinutes) || 5,
      lastRunAt: new Date().toISOString(),
      newStatusEnabledAt,
      backfillComplete: errors.length === 0,
      lastRange: { startDate: portal.startDate, endDate: portal.endDate },
    };
    await this.persistAutomationStates(slug, states);
    await this.prisma.setting.upsert({
      where: { scope_mainCompanySlug_key: { scope: "ISNET", mainCompanySlug: slug, key: "AUTOMATION" } },
      update: { value, deletedAt: null },
      create: { scope: "ISNET", mainCompanySlug: slug, key: "AUTOMATION", value },
    });
    return {
      ...portal,
      documents: portal.documents.map((document: Query) => {
        const state = objectValue(states[this.automationKey(document)]);
        const localUnread = Boolean(state.completed && !state.appReadAt);
        return {
          ...document,
          downloaded: Boolean(state.completed),
          pdfSaved: Boolean(state.pdfPath && fs.existsSync(clean(state.pdfPath))),
          xmlSaved: Boolean(state.xmlPath && fs.existsSync(clean(state.xmlPath))),
          modelName: clean(state.modelName || document.modelGuess),
          localUnread,
          isNew: localUnread,
          localReadAt: state.appReadAt || null,
        };
      }),
      automation: {
        pending: pending.length,
        remaining: Math.max(pendingCandidates.length - pending.length, 0),
        batchSize,
        downloaded,
        processed,
        markedRead,
        newDocuments: Object.values(states).map(objectValue).filter((item) => item.completed && !item.appReadAt).length,
        errors,
      },
    };
  }

  async markDocumentRead(key: string, body: Query = {}) {
    const slug = this.slug(body);
    const row = await this.prisma.setting.findUnique({
      where: { scope_mainCompanySlug_key: { scope: "ISNET", mainCompanySlug: slug, key: "AUTOMATION" } },
    });
    if (!row) throw new NotFoundException("İşNet otomasyon kaydı bulunamadı.");
    const value = objectValue(row.value);
    const documents = await this.automationStates(slug, value);
    if (!documents[key]) throw new NotFoundException("İşNet belgesi yerel arşivde bulunamadı.");
    documents[key] = {
      ...objectValue(documents[key]),
      appReadAt: body.read === false ? null : new Date().toISOString(),
    };
    await this.persistAutomationStates(slug, { [key]: documents[key] });
    return { ok: true, key, appReadAt: objectValue(documents[key]).appReadAt };
  }

  async markDocumentsRead(body: Query = {}) {
    const slug = this.slug(body);
    const documentIds = [...new Set(arrayValue(body.documentIds).map(clean).filter(Boolean))];
    if (!documentIds.length) throw new BadRequestException("En az bir belge seçilmelidir.");
    if (documentIds.length > 500) throw new BadRequestException("Tek işlemde en fazla 500 belge güncellenebilir.");
    if (typeof body.isRead !== "boolean") throw new BadRequestException("isRead alanı true veya false olmalıdır.");
    const rows = await this.prisma.isnetDocumentState.findMany({
      where: { mainCompanySlug: slug, automationKey: { in: documentIds } },
      select: { automationKey: true, appReadAt: true },
    });
    const found = new Set(rows.map((row) => row.automationKey));
    const missingDocumentIds = documentIds.filter((id) => !found.has(id));
    const changedKeys = rows
      .filter((row) => body.isRead ? !row.appReadAt : Boolean(row.appReadAt))
      .map((row) => row.automationKey);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (rows.length) {
        await tx.isnetDocumentState.updateMany({
          where: { mainCompanySlug: slug, automationKey: { in: [...found] } },
          data: { appReadAt: body.isRead ? now : null, newDocument: !body.isRead },
        });
      }
      await tx.activityLog.create({
        data: {
          mainCompanySlug: slug,
          module: "ISNET",
          entityType: "isnet_document_state",
          action: "BULK_READ_STATUS",
          actionType: "UPDATE",
          description: `${rows.length} belgenin okundu durumu topluca güncellendi.`,
          oldValue: { read: rows.filter((row) => row.appReadAt).length, unread: rows.filter((row) => !row.appReadAt).length },
          newValue: { isRead: body.isRead, documentCount: rows.length, changedCount: changedKeys.length },
          actor: clean(body.userId || body.actor) || "ISNET_USER",
        },
      });
    });
    return {
      success: true,
      isRead: body.isRead,
      requestedCount: documentIds.length,
      updatedCount: rows.length,
      changedCount: changedKeys.length,
      changedDocumentIds: changedKeys,
      missingDocumentIds,
    };
  }

  async automationStatus(query: Query = {}) {
    const slug = this.slug(query);
    const row = await this.prisma.setting.findUnique({
      where: { scope_mainCompanySlug_key: { scope: "ISNET", mainCompanySlug: slug, key: "AUTOMATION" } },
    });
    const value = objectValue(row?.value);
    const states = Object.values(await this.automationStates(slug, value)).map(objectValue);
    return {
      enabled: value.enabled !== false,
      intervalMinutes: numberValue(value.intervalMinutes) || 5,
      lastRunAt: value.lastRunAt || null,
      totalArchived: states.filter((item) => item.completed).length,
      printWaiting: states.filter((item) => item.printEligible && !item.printedAt).length,
      errors: states.filter((item) => item.error && !item.completed).slice(-20),
    };
  }

  async printQueue(query: Query = {}) {
    const slug = this.slug(query);
    const printDateValue = (value: unknown) => {
      const text = clean(value);
      const match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
      if (match) return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
      const parsed = Date.parse(text);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const documents = Object.values(await this.automationStates(slug))
      .map(objectValue)
      .filter((item) => item.completed && item.printEligible && item.pdfPath && fs.existsSync(clean(item.pdfPath)))
      .sort((left, right) =>
        printDateValue(right.dateText || right.downloadedAt) -
        printDateValue(left.dateText || left.downloadedAt),
      );
    return { rows: documents, waiting: documents.filter((item) => !item.printedAt).length };
  }

  async printQueueFile(key: string, query: Query = {}) {
    const queue = await this.printQueue(query);
    const item = queue.rows.find((row: Query) => clean(row.key) === clean(key));
    if (!item) throw new NotFoundException("Çıktı kuyruğu belgesi bulunamadı.");
    return { buffer: fs.readFileSync(clean(item.pdfPath)), fileName: path.basename(clean(item.pdfPath)) };
  }

  async printQueueBundle(body: Query = {}) {
    const queue = await this.printQueue(body);
    const selectedKeys = new Set(arrayValue(body.keys).map(clean).filter(Boolean));
    const rows = queue.rows.filter((row: Query) => {
      if (selectedKeys.size) return selectedKeys.has(clean(row.key));
      if (body.newOnly === true) return row.newDocument === true && !row.printedAt;
      return !row.printedAt;
    });
    if (!rows.length) throw new BadRequestException("Toplu çıktı için bekleyen belge bulunamadı.");
    const merged = await PDFDocument.create();
    const includedKeys: string[] = [];
    const skipped: Query[] = [];
    for (const row of rows) {
      try {
        const source = await PDFDocument.load(fs.readFileSync(clean(row.pdfPath)), { ignoreEncryption: true });
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
        includedKeys.push(clean(row.key));
      } catch (error: any) {
        skipped.push({ key: row.key, documentNo: row.documentNo, message: clean(error?.message) });
      }
    }
    if (skipped.length) {
      throw new BadRequestException(
        `${skipped.length} PDF birleştirilemedi (${skipped.slice(0, 3).map((item) => item.documentNo || item.key).join(", ")}). Hiçbir belge atlanmadı; sorunlu dosyayı düzeltip tekrar deneyin.`,
      );
    }
    if (!includedKeys.length) throw new BadRequestException("Seçilen PDF dosyaları birleştirilemedi.");
    merged.setTitle(`İşNet Toplu Çıktı - ${includedKeys.length} belge`);
    merged.setCreator("KY ERP İşNet Otomasyonu");
    return {
      buffer: Buffer.from(await merged.save()),
      fileName: `ISNET-TOPLU-CIKTI-${new Date().toISOString().slice(0, 10)}.pdf`,
      keys: includedKeys,
      skipped,
    };
  }

  async markPrintedMany(body: Query = {}) {
    const keys = new Set(arrayValue(body.keys).map(clean).filter(Boolean));
    if (!keys.size) throw new BadRequestException("Çıktısı alınan belgeleri seçin.");
    const slug = this.slug(body);
    const printedAt = new Date();
    const result = await this.prisma.isnetDocumentState.updateMany({
      where: { mainCompanySlug: slug, automationKey: { in: [...keys] } },
      data: { printedAt },
    });
    const updated = result.count;
    return { ok: true, updated, printedAt };
  }

  async markPrinted(key: string, body: Query = {}) {
    const slug = this.slug(body);
    const printedAt = body.printed === false ? null : new Date();
    const result = await this.prisma.isnetDocumentState.updateMany({
      where: { mainCompanySlug: slug, automationKey: clean(key) },
      data: { printedAt },
    });
    if (!result.count) throw new NotFoundException("Çıktı belgesi bulunamadı.");
    return { ok: true, key, printedAt };
  }

  async invoiceDraftStatus(id: string, query: Query = {}) {
    const slug = this.slug(query);
    const request = await this.prisma.isnetInvoiceDraftRequest.findFirst({
      where: { id: clean(id), mainCompanySlug: slug },
      include: { lineAllocations: { orderBy: { createdAt: "asc" } } },
    });
    if (!request) throw new NotFoundException("İşNet fatura taslağı bulunamadı.");
    return {
      id: request.id, status: request.status, draftNo: request.draftNo || "", portalDraftId: request.portalDraftId || "",
      expected: request.expectedSnapshot || {}, portal: request.portalSnapshot || {}, differences: arrayValue(request.verificationDiff),
      draftVersion: request.draftVersion || "", approvalVersion: request.approvalVersion || "", approvedAt: request.approvedAt,
      approvedBy: request.approvedBy || "", officialInvoiceNumber: request.officialInvoiceNumber || "", officialUuid: request.officialUuid || "",
      isnetDocumentId: request.isnetDocumentId || "", officialStatus: request.officialStatus || "", pdfPath: request.pdfPath || "",
      xmlPath: request.xmlPath || "", salesInvoiceId: request.salesInvoiceId || "", currentMovementId: request.currentMovementId || "",
      error: request.error || "", lines: request.lineAllocations,
    };
  }

  async verifyInvoiceDraft(id: string, body: Query = {}) {
    const slug = this.slug(body);
    const request = await this.prisma.isnetInvoiceDraftRequest.findFirst({ where: { id: clean(id), mainCompanySlug: slug } });
    if (!request) throw new NotFoundException("İşNet fatura taslağı bulunamadı.");
    if (request.status === "VERIFY_PENDING" && request.submittedAt) {
      const { companyId, session } = await this.configuredPortal(slug);
      const official: any = await this.findSubmittedInvoice(session, companyId, request);
      const invoiceNumber = clean(official?.documentNo);
      const uuid = clean(official?.uuid);
      const documentId = clean(official?.sourceId);
      if (!invoiceNumber || !uuid || !documentId) return { ...(await this.invoiceDraftStatus(id, body)), verified: false };
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "SENT", officialInvoiceNumber: invoiceNumber, officialUuid: uuid, isnetDocumentId: documentId, officialStatus: clean(official.statusText) || "SENT", portalResponseHash: this.snapshotHash(official), error: null } });
      return this.archiveInvoice({ ...body, draftId: request.id });
    }
    if (["SUBMITTING", "SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING", "COMPLETED"].includes(request.status)) return this.invoiceDraftStatus(id, body);
    const { session } = await this.configuredPortal(slug);
    const result = await this.verifyStoredDraft(request, session);
    return { ...(await this.invoiceDraftStatus(id, body)), verified: result.verified };
  }

  async finalApproveInvoiceDraft(id: string, body: Query = {}, actor = "user") {
    const slug = this.slug(body);
    if (body.approved !== true || clean(body.confirmationText) !== "FATURAYI GÖNDER") {
      throw new BadRequestException("Son onay için FATURAYI GÖNDER metni eksiksiz yazılmalıdır.");
    }
    const request = await this.prisma.isnetInvoiceDraftRequest.findFirst({ where: { id: clean(id), mainCompanySlug: slug } });
    if (!request) throw new NotFoundException("İşNet fatura taslağı bulunamadı.");
    if (request.status !== "VERIFIED") throw new ConflictException("Yalnız VERIFIED durumundaki taslak son onaya alınabilir.");
    if (arrayValue(request.verificationDiff).length) throw new ConflictException("Taslak doğrulama farkları giderilmeden son onay verilemez.");
    const expectedVersion = clean(body.expectedVersion);
    if (!expectedVersion || expectedVersion !== clean(request.draftVersion)) throw new ConflictException("Taslak sürümü değişti; taslağı yeniden doğrulayıp tekrar onaylayın.");
    const expected = objectValue(request.expectedSnapshot);
    const companyId = clean(expected.localCompanyId);
    const company = companyId ? await this.prisma.company.findFirst({ where: { id: companyId, mainCompanySlug: slug, isActive: true } }) : null;
    if (!company || !["CUSTOMER", "BOTH"].includes(clean(company.companyType).toUpperCase())) {
      throw new ConflictException("Resmî satış faturası yalnız CUSTOMER/BOTH müşteri yönündeki firma için gönderilebilir.");
    }
    const approvedAt = new Date();
    const updated = await this.prisma.isnetInvoiceDraftRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", approvalVersion: request.draftVersion, approvedAt, approvedBy: clean(actor) || "user", error: null },
    });
    return { ok: true, id: updated.id, status: updated.status, approvedAt, approvedBy: updated.approvedBy, approvalVersion: updated.approvalVersion };
  }

  private async sendStagingInvoice(session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>, portalDraftId: string) {
    const page = "/OutgoingInvoice/StagingInvoiceList";
    const pageResponse = await session.request(page);
    const html = await pageResponse.text();
    const token = this.verificationToken(html);
    if (!pageResponse.ok || !token) throw new BadGatewayException("İşNet taslak fatura gönderim ekranı açılamadı.");
    const response = await session.request("/OutgoingInvoice/SendStagingInvoice", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: `${session.portalBase}${page}`, "X-Requested-With": "XMLHttpRequest" },
      body: new URLSearchParams({ InvoiceId: portalDraftId, IsAllSelected: "false", Filter: "{}", __RequestVerificationToken: token }).toString(),
    });
    const raw = await response.text();
    let payload: any = null;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
    const error = clean(payload?.error || payload?.ErrorMessage || payload?.messageError);
    if (!response.ok || error) throw new BadGatewayException(error || "İşNet resmî fatura gönderimini kabul etmedi.");
    return payload;
  }

  private async findSubmittedInvoice(session: Awaited<ReturnType<IsnetOperationsService["openPortalCompanySession"]>>, companyId: string, request: any) {
    const expected = objectValue(request.expectedSnapshot);
    const startDate = clean(expected.invoiceDate).slice(0, 10) || new Date().toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);
    const rows = await this.fetchPortalDocumentSource(session, {
      kind: "invoice", direction: "outgoing", page: `/OutgoingInvoice/OutgoingInvoiceList?minDate=${startDate}`,
      endpoint: "/OutgoingInvoice/AllOutgoingInvoiceByFilter",
    }, companyId, startDate, endDate);
    return rows.find((row: any) => clean(row.referenceNo) === clean(request.externalId) ||
      (clean(request.draftNo) && clean(row.documentNo) === clean(request.draftNo)) ||
      (clean(request.portalDraftId) && clean(row.sourceId) === clean(request.portalDraftId))) || null;
  }

  async submitOfficialInvoice(id: string, body: Query = {}, actor = "user") {
    const slug = this.slug(body);
    const key = `${slug}:${clean(id)}`;
    if (this.activeInvoiceSubmissions.has(key)) throw new ConflictException("Bu taslak için resmî gönderim zaten sürüyor.");
    const operation = this.submitOfficialInvoiceInternal(id, body, actor);
    this.activeInvoiceSubmissions.set(key, operation);
    try { return await operation; } finally { this.activeInvoiceSubmissions.delete(key); }
  }

  private async submitOfficialInvoiceInternal(id: string, body: Query, actor: string) {
    const slug = this.slug(body);
    let request = await this.prisma.isnetInvoiceDraftRequest.findFirst({ where: { id: clean(id), mainCompanySlug: slug } });
    if (!request) throw new NotFoundException("İşNet fatura taslağı bulunamadı.");
    if (["SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING", "COMPLETED"].includes(request.status)) return this.invoiceDraftStatus(id, body);
    if (request.status === "VERIFY_PENDING") throw new ConflictException("Belirsiz gönderim sonucu önce İşNet üzerinden doğrulanmalıdır; otomatik ikinci gönderim yapılmaz.");
    if (request.status !== "APPROVED" || !request.approvedAt || request.approvalVersion !== request.draftVersion) throw new ConflictException("Geçerli son kullanıcı onayı olmadan resmî fatura gönderilemez.");
    const { companyId, session } = await this.configuredPortal(slug);
    const verification = await this.verifyStoredDraft(request, session);
    request = verification.request;
    if (!verification.verified || request.status !== "APPROVED") throw new ConflictException("Taslak son onaydan sonra değişti; resmî gönderim engellendi.");
    const claimed = await this.prisma.isnetInvoiceDraftRequest.updateMany({
      where: { id: request.id, status: "APPROVED", approvalVersion: request.draftVersion },
      data: { status: "SUBMITTING", submittedBy: clean(actor) || "user", submittedAt: new Date(), error: null },
    });
    if (claimed.count !== 1) throw new ConflictException("Taslak başka bir işlem tarafından gönderime alındı.");
    let portalResponse: any;
    try { portalResponse = await this.sendStagingInvoice(session, clean(request.portalDraftId)); }
    catch (error: any) {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "VERIFY_PENDING", error: clean(error?.message).slice(0, 1000) || "İşNet gönderim sonucu belirsiz." } });
      throw error;
    }
    let official: any = null;
    try {
      for (let attempt = 0; attempt < 3 && !official; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 1200));
        official = await this.findSubmittedInvoice(session, companyId, request);
      }
    }
    catch (error: any) {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "VERIFY_PENDING", portalResponseHash: this.snapshotHash(portalResponse), error: clean(error?.message).slice(0, 1000) || "Gönderim sonucu doğrulanamadı." } });
      throw new BadGatewayException("İşNet gönderim isteğini aldı ancak sonuç doğrulanamadı; otomatik ikinci gönderim engellendi.");
    }
    const invoiceNumber = clean(official?.documentNo);
    const uuid = clean(official?.uuid);
    const documentId = clean(official?.sourceId);
    if (!official || !invoiceNumber || !uuid || !documentId) {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "VERIFY_PENDING", portalResponseHash: this.snapshotHash(portalResponse), error: "İşNet fatura numarası, UUID veya belge kimliği döndürmedi." } });
      throw new BadGatewayException("İşNet sonucu fatura numarası/UUID ile doğrulanamadı; işlem SENT sayılmadı.");
    }
    const expected = objectValue(request.expectedSnapshot);
    if (expected.recipientTaxNo && official.partnerTaxNo && clean(expected.recipientTaxNo) !== clean(official.partnerTaxNo)) {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "VERIFY_PENDING", error: "Gönderilen faturanın müşteri VKN/TCKN değeri beklenenle farklı." } });
      throw new ConflictException("Gönderim sonucu VKN/TCKN farkı içeriyor; kapanış engellendi.");
    }
    await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: {
      status: "SENT", officialInvoiceNumber: invoiceNumber, officialUuid: uuid, isnetDocumentId: documentId,
      officialStatus: clean(official.statusText) || "SENT", portalResponseHash: this.snapshotHash({ portalResponse, official }), error: null,
    } });
    return this.archiveInvoice({ ...body, draftId: request.id });
  }

  private officialArchiveRoots() {
    return {
      root: clean(process.env.ISNET_OFFICIAL_ARCHIVE_ROOT) || "D:\\Onedrive-Hkn\\OneDrive\\Masaüstü\\HKN\\HKN E-FATURA",
      temporary: clean(process.env.ISNET_TEMP_ROOT) || "D:\\Onedrive-Hkn\\OneDrive\\Masaüstü\\HKN\\ISNET-GECICI",
    };
  }

  private officialXmlIdentity(buffer: Buffer) {
    const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(buffer.toString("utf8"));
    const invoice = objectValue(parsed?.Invoice || parsed);
    return { invoiceNo: clean(this.recursiveValue(invoice, ["ID"])), uuid: clean(this.recursiveValue(invoice, ["UUID"])) };
  }

  private async closeOfficialInvoiceAccounting(request: any, xml: any, pdf: any) {
    const slug = request.mainCompanySlug;
    let document = await this.prisma.document.findFirst({ where: { mainCompanySlug: slug, documentNo: request.officialInvoiceNumber, deletedAt: null } });
    let movement = document ? await this.prisma.currentAccountMovement.findFirst({ where: { mainCompanySlug: slug, documentNo: request.officialInvoiceNumber, documentId: document.id } }) : null;
    if (!document || !movement) {
      const upload = await this.documentIntake.upload([
        this.multerFile({ buffer: xml.buffer, contentType: "application/xml", fileName: path.basename(request.xmlPath) }),
        this.multerFile({ buffer: pdf.buffer, contentType: "application/pdf", fileName: path.basename(request.pdfPath) }),
      ], { mainCompanySlug: slug, autoApprove: true });
      if (upload.errors?.length || upload.autoApproved?.some((item: any) => item.ok === false)) {
        throw new BadRequestException(upload.errors?.map((item: any) => clean(item.message)).filter(Boolean).join(" ") || "Resmî fatura muhasebeye aktarılamadı.");
      }
      document = await this.prisma.document.findFirst({ where: { mainCompanySlug: slug, documentNo: request.officialInvoiceNumber, deletedAt: null } });
      movement = document ? await this.prisma.currentAccountMovement.findFirst({ where: { mainCompanySlug: slug, documentNo: request.officialInvoiceNumber, documentId: document.id } }) : null;
    }
    if (!document) throw new BadRequestException("Resmî fatura XML'i işlendi ancak satış faturası kaydı bulunamadı.");
    if (!movement) throw new BadRequestException("Satış faturası kaydedildi ancak müşteri cari hareketi oluşmadı.");
    const vatRecord = await this.prisma.vatRecord.findFirst({ where: { mainCompanySlug: slug, documentId: document.id, OR: [{ vatDirection: "OUT" }, { direction: "OUT" }, { outgoingVat: { gt: 0 } }] } });
    if (!vatRecord) throw new BadRequestException("Satış faturası kaydedildi ancak çıkış KDV kaydı oluşmadı.");
    const invoiceLines = await this.prisma.invoiceItem.findMany({ where: { mainCompanySlug: slug, documentId: document.id }, orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }] });
    const sourceDocument = request.dispatchNo ? await this.prisma.document.findFirst({ where: { mainCompanySlug: slug, documentNo: request.dispatchNo, deletedAt: null } }) : null;
    const sourceLines = sourceDocument ? await this.prisma.invoiceItem.findMany({ where: { mainCompanySlug: slug, documentId: sourceDocument.id }, orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }] }) : [];
    const allocations = await this.prisma.isnetInvoiceLineAllocation.findMany({ where: { draftRequestId: request.id }, orderBy: { createdAt: "asc" } });
    await this.prisma.$transaction(async (tx) => {
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        const sourceLine = sourceLines[index];
        const salesLine = invoiceLines[index];
        await tx.isnetInvoiceLineAllocation.update({ where: { id: allocation.id }, data: { sourceDocumentLineId: sourceLine?.id || allocation.sourceDocumentLineId, salesInvoiceLineId: salesLine?.id || allocation.salesInvoiceLineId } });
        if (sourceLine) {
          const raw = objectValue(sourceLine.raw);
          await tx.invoiceItem.update({ where: { id: sourceLine.id }, data: { raw: { ...raw, billedQuantity: numberValue(allocation.totalBilled), remainingQuantity: numberValue(allocation.remainingQuantity), invoiceClosureStatus: allocation.status, officialInvoiceNumber: request.officialInvoiceNumber, officialUuid: request.officialUuid } } });
        }
      }
      await tx.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "COMPLETED", salesInvoiceId: document.id, currentMovementId: movement?.id || null, completedAt: new Date(), error: null } });
    });
    return { document, movement };
  }

  async prepareInvoice(body: Query = {}, actor = "user") {
    const draftId = clean(body.draftId || body.id);
    if (!draftId) throw new BadRequestException("Resmî gönderim için taslak kimliği zorunludur.");
    return this.submitOfficialInvoice(draftId, body, actor);
  }

  async archiveInvoice(body: Query = {}) {
    const slug = this.slug(body);
    const draftId = clean(body.draftId || body.id);
    const request = await this.prisma.isnetInvoiceDraftRequest.findFirst({ where: { id: draftId, mainCompanySlug: slug } });
    if (!request) throw new NotFoundException("İşNet fatura taslağı bulunamadı.");
    if (request.status === "COMPLETED") return this.invoiceDraftStatus(request.id, body);
    if (!request.officialInvoiceNumber || !request.officialUuid || !request.isnetDocumentId || !["SENT", "FILE_DOWNLOAD_PENDING", "ACCOUNTING_PENDING"].includes(request.status)) throw new ConflictException("Resmî fatura numarası ve UUID doğrulanmadan arşiv/kapanış yapılamaz.");
    let pdf: any;
    let xml: any;
    try {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "FILE_DOWNLOAD_PENDING", error: null } });
      const { session } = await this.configuredPortal(slug);
      [pdf, xml] = await Promise.all([
        this.downloadPortalFile(session, { direction: "outgoing", kind: "invoice", sourceId: request.isnetDocumentId, format: "pdf" }),
        this.downloadPortalFile(session, { direction: "outgoing", kind: "invoice", sourceId: request.isnetDocumentId, format: "xml" }),
      ]);
      if (!pdf.buffer.length || !pdf.buffer.subarray(0, 4).equals(Buffer.from("%PDF"))) throw new BadGatewayException("İşNet resmî PDF dosyası geçersiz.");
      const identity = this.officialXmlIdentity(xml.buffer);
      if (identity.invoiceNo !== request.officialInvoiceNumber || identity.uuid !== request.officialUuid) throw new ConflictException("İndirilen XML fatura numarası/UUID ile gönderim sonucu eşleşmiyor.");
      const expected = objectValue(request.expectedSnapshot);
      const model = clean(expected.modelName) || clean(arrayValue(expected.lines)[0]?.productName) || "MODEL-YOK";
      const baseName = this.safeArchiveName(`${new Date().toISOString().slice(0, 10)} - ${clean(expected.recipientName)} - ${request.officialInvoiceNumber} - ${arrayValue(expected.lines).length > 1 ? "COKLU-MODEL" : model}`);
      const roots = this.officialArchiveRoots();
      const pdfDir = path.join(roots.root, "PDF");
      const xmlDir = path.join(roots.root, "XML");
      fs.mkdirSync(roots.temporary, { recursive: true }); fs.mkdirSync(pdfDir, { recursive: true }); fs.mkdirSync(xmlDir, { recursive: true });
      const tempPdf = path.join(roots.temporary, `${baseName}.pdf`); const tempXml = path.join(roots.temporary, `${baseName}.xml`);
      fs.writeFileSync(tempPdf, pdf.buffer); fs.writeFileSync(tempXml, xml.buffer);
      const pdfPath = path.join(pdfDir, `${baseName}.pdf`); const xmlPath = path.join(xmlDir, `${baseName}.xml`);
      fs.copyFileSync(tempPdf, pdfPath); fs.copyFileSync(tempXml, xmlPath);
      request.pdfPath = pdfPath; request.xmlPath = xmlPath;
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "ACCOUNTING_PENDING", pdfPath, xmlPath, error: null } });
    } catch (error: any) {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "FILE_DOWNLOAD_PENDING", error: clean(error?.message).slice(0, 1000) } });
      throw error;
    }
    try { await this.closeOfficialInvoiceAccounting(request, xml, pdf); }
    catch (error: any) {
      await this.prisma.isnetInvoiceDraftRequest.update({ where: { id: request.id }, data: { status: "ACCOUNTING_PENDING", error: clean(error?.message).slice(0, 1000) } });
      throw error;
    }
    return this.invoiceDraftStatus(request.id, body);
  }

  async createOutlookDraft(_id: string, _body: Query = {}) {
    throw new NotImplementedException(
      "Outlook taslak adaptörü etkinleştirilmeden bu işlem kullanılamaz.",
    );
  }

  async markMailSent(id: string, body: Query = {}) {
    const slug = this.slug(body);
    const row = await this.prisma.mailPackage.findFirst({
      where: { id: clean(id), mainCompanySlug: slug, deletedAt: null },
    });
    if (!row) throw new NotFoundException("Mail paketi bulunamadı.");
    return this.prisma.mailPackage.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: row.sentAt || new Date() },
    });
  }
}
