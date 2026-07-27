import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

type JsonRecord = Record<string, any>;

type IsnetConfig = {
  baseUrl: string;
  username: string;
  password: string;
  token: string;
  companyId: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function firstNonEmpty<T = unknown>(...values: T[]) {
  return values.find((value) => text(value).length > 0);
}

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTime(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function parseJsonSafe(textValue: string) {
  try {
    return textValue ? JSON.parse(textValue) : null;
  } catch {
    return textValue || null;
  }
}

function extractMessage(
  payload: any,
  fallback = "İşNet isteği başarısız oldu.",
) {
  const rawMessage =
    payload?.ErrorMessage ||
    payload?.errorMessage ||
    payload?.message ||
    payload?.Message ||
    payload?.ExceptionMessage ||
    payload?.ModelState ||
    fallback;

  if (Array.isArray(rawMessage)) {
    return rawMessage
      .map((item) => text(item))
      .filter(Boolean)
      .join(", ");
  }

  if (rawMessage && typeof rawMessage === "object") {
    return Object.values(rawMessage)
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .map((item) => text(item))
      .filter(Boolean)
      .join(", ");
  }

  return text(rawMessage) || fallback;
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.Recipients,
    payload.recipients,
    payload.Despatches,
    payload.despatches,
    payload.Data,
    payload.data,
    payload.Items,
    payload.items,
    payload.Value,
    payload.value,
    payload.List,
    payload.list,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function resultOk(payload: any) {
  const value = payload?.Result ?? payload?.result;
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "number") return value === 0;
  const normalized = text(value).toLocaleLowerCase("tr-TR");
  return ["0", "success", "başarılı", "basarili", "ok"].includes(normalized);
}

function recipientTypeLabel(value: unknown) {
  const normalized = text(value).toLocaleLowerCase("tr-TR");
  if (!normalized) return "-";
  if (["0", "none"].includes(normalized)) return "-";
  if (["1", "efatura", "einvoice", "e-fatura"].includes(normalized)) {
    return "e-Fatura";
  }
  if (["2", "earsiv", "earchive", "e-arşiv", "e-arsiv"].includes(normalized)) {
    return "e-Arşiv";
  }
  if (["3", "eirsaliye", "edespatch", "e-irsaliye"].includes(normalized)) {
    return "e-İrsaliye";
  }
  return text(value);
}

@Injectable()
export class IsnetTestService {
  private readonly logger = new Logger(IsnetTestService.name);
  private tokenCache = "";

  private getConfig(requireCompanyId = true) {
    const config: IsnetConfig = {
      baseUrl:
        text(process.env.ISNET_API_BASE) || "https://einvoiceapi.isnet.net.tr",
      username: text(process.env.ISNET_USERNAME),
      password: text(process.env.ISNET_PASSWORD),
      token: text(process.env.ISNET_TOKEN),
      companyId: text(process.env.ISNET_COMPANY_ID),
    };

    const missing: string[] = [];
    if (!config.baseUrl) missing.push("ISNET_API_BASE");
    if (requireCompanyId && !config.companyId) missing.push("ISNET_COMPANY_ID");
    if (!config.token && !(config.username && config.password)) {
      missing.push("ISNET_TOKEN veya ISNET_USERNAME + ISNET_PASSWORD");
    }
    if (missing.length) {
      throw new BadRequestException(
        `İşNet yapılandırması eksik: ${missing.join(", ")}`,
      );
    }
    return config;
  }

  private buildUrl(config: IsnetConfig, endpoint: string) {
    const safeBase = config.baseUrl.replace(/\/+$/, "");
    const safeEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${safeBase}${safeEndpoint}`;
  }

  private async resolveToken(config: IsnetConfig, allowMissingAuth = false) {
    if (config.token) return config.token;
    if (this.tokenCache) return this.tokenCache;

    if (!(config.username && config.password)) {
      if (allowMissingAuth) return "";
      throw new BadRequestException(
        "İşNet kimlik doğrulaması için token veya kullanıcı bilgisi gerekli.",
      );
    }

    const payload = await this.requestRaw("/api/Account/Login", {
      method: "POST",
      body: {
        IdentificationNumber: config.username,
        Password: config.password,
      },
      skipAuth: true,
      requireCompanyId: false,
    });

    const token = text(payload?.Token);
    if (!token) {
      throw new UnauthorizedException(
        `İşNet giriş başarısız: ${extractMessage(payload, "Token alınamadı.")}`,
      );
    }
    this.tokenCache = token;
    return token;
  }

  private async requestRaw(
    endpoint: string,
    options: {
      method?: "GET" | "POST";
      body?: JsonRecord;
      skipAuth?: boolean;
      allowMissingAuth?: boolean;
      requireCompanyId?: boolean;
    } = {},
  ) {
    const {
      method = "POST",
      body,
      skipAuth = false,
      allowMissingAuth = false,
      requireCompanyId = true,
    } = options;
    const config = this.getConfig(requireCompanyId);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    if (!skipAuth) {
      const token = await this.resolveToken(config, allowMissingAuth);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers.Token = token;
      }
    }

    const url = this.buildUrl(config, endpoint);
    const response = await fetch(url, {
      method,
      headers,
      ...(method === "GET" ? {} : { body: JSON.stringify(body || {}) }),
    });

    const rawText = await response.text();
    const payload = parseJsonSafe(rawText);

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException(
        `İşNet kimlik doğrulama hatası: ${extractMessage(payload, response.statusText)}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `İşNet API hatası (${response.status}): ${extractMessage(payload, response.statusText)}`,
      );
    }

    if (!resultOk(payload)) {
      throw new BadGatewayException(
        `İşNet işlemi başarısız: ${extractMessage(payload)}`,
      );
    }

    return payload;
  }

  private normalizeRecipients(payload: any) {
    return extractArray(payload)
      .map((row) => {
        const eInvoice = text(
          firstNonEmpty(
            row?.EFaturaDurumu,
            row?.eFaturaDurumu,
            row?.InvoiceStatus,
            row?.EInvoiceStatus,
          ),
        );
        const eDespatch = text(
          firstNonEmpty(
            row?.EIrsaliyeDurumu,
            row?.eIrsaliyeDurumu,
            row?.DespatchStatus,
            row?.EDespatchStatus,
          ),
        );
        return {
          idAlici: text(row?.IdAlici || row?.idAlici),
          firmaAdi: text(
            firstNonEmpty(
              row?.Unvan_Ad_Soyad,
              row?.FirmaAdi,
              row?.RecipientCompanyName,
              row?.ReceiverName,
            ),
          ),
          vknTckn: text(firstNonEmpty(row?.VknTckn, row?.VKN, row?.TCKN)),
          eFatura: eInvoice || recipientTypeLabel(row?.RecipientType),
          eIrsaliye: eDespatch || "-",
        };
      })
      .filter((row) => row.idAlici && row.firmaAdi)
      .sort((left, right) =>
        left.firmaAdi.localeCompare(right.firmaAdi, "tr", {
          sensitivity: "base",
        }),
      );
  }

  private normalizeDrafts(payload: any) {
    return extractArray(payload)
      .map((row) => ({
        id: text(firstNonEmpty(row?.DespatchId, row?.id, row?.Id)),
        taslakNo: text(
          firstNonEmpty(
            row?.DespatchNumber,
            row?.DespatchAdviceNumber,
            row?.Number,
          ),
        ),
        tarih: text(
          firstNonEmpty(row?.DespatchDate, row?.Date, row?.IssueDate),
        ),
        alici: text(
          firstNonEmpty(
            row?.RecipientCompanyName,
            row?.AliciAdi,
            row?.FirmaAdi,
          ),
        ),
        durum: text(firstNonEmpty(row?.Status, row?.Durum, row?.State)),
        hata: text(firstNonEmpty(row?.ErrorMessage, row?.errorMessage)),
        ettn: text(firstNonEmpty(row?.Ettn, row?.ETTN)),
      }))
      .filter((row) => row.taslakNo || row.alici || row.tarih);
  }

  async health(_mainCompanySlug?: string) {
    const config = this.getConfig(false);
    try {
      const payload = await this.requestRaw("/api/Account/GetHealthCheck", {
        method: "GET",
        allowMissingAuth: true,
        requireCompanyId: false,
      });
      return {
        ok: true,
        baseUrl: config.baseUrl,
        companyId: config.companyId || "-",
        authConfigured: Boolean(
          config.token || (config.username && config.password),
        ),
        message:
          extractMessage(payload, "İşNet erişimi başarılı.") ||
          "İşNet erişimi başarılı.",
      };
    } catch (error) {
      this.logger.warn(`İşNet health check failed: ${String(error)}`);
      throw error;
    }
  }

  async getRecipients(_mainCompanySlug?: string) {
    const config = this.getConfig();
    const payload = await this.requestRaw("/api/Company/GetRecipientList", {
      method: "POST",
      body: {
        CompanyId: Number(config.companyId),
      },
    });

    return {
      companyId: config.companyId,
      rows: this.normalizeRecipients(payload),
    };
  }

  async createDespatchDraft(body: any = {}, _mainCompanySlug?: string) {
    const config = this.getConfig();
    const idAlici = text(body?.idAlici || body?.IdAlici);
    if (!idAlici) {
      throw new BadRequestException(
        "Taslak oluşturmak için alıcı seçimi zorunludur.",
      );
    }

    const now = new Date();
    const stamp = formatStamp(now);
    const extraNote = text(body?.note || body?.Note);
    const quantity = Number(body?.quantity || 1);
    const payload = {
      DespatchAdviceNumber:
        text(body?.despatchAdviceNumber || body?.DespatchAdviceNumber) ||
        `TEST-${stamp}`,
      IdIrsaliyeExternal: `KYERP-TEST-${stamp}`,
      CompanyId: Number(config.companyId),
      ScenarioType: 0,
      DespatchAdviceDate: formatLocalDate(now),
      DespatchAdviceTime: formatLocalTime(now),
      ActualDespatchAdviceDate: formatLocalDate(now),
      ActualDespatchAdviceTime: formatLocalTime(now),
      DespatchAdviceType: 1,
      OrderNumber: "KYERP-TEST",
      Notes: [
        "TESTTİR",
        "RESMİ GÖNDERİM YAPILMAYACAKTIR",
        "KY ERP İŞNET TASLAK DENEMESİ",
        ...(extraNote ? [extraNote] : []),
      ],
      IdAlici: Number(idAlici),
      Products: [
        {
          ProductName:
            text(body?.productName || body?.ProductName) ||
            "KY ERP TEST İRSALİYE KALEMİ",
          StockDescription: "TEST",
          Quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          MeasureUnitDesc: "ADET",
          UnitPrice: 0,
          VatRate: 0,
          VatAmount: 0,
          LineExtensionAmount: 0,
          Note: "TEST KALEMİ",
        },
      ],
    };

    const response = await this.requestRaw("/api/Invoice/SaveDespatchAdvice", {
      method: "POST",
      body: payload,
    });

    return {
      companyId: config.companyId,
      despatchNumber: text(
        firstNonEmpty(response?.DespatchNumber, payload.DespatchAdviceNumber),
      ),
      ettn: text(response?.Ettn),
      externalId: payload.IdIrsaliyeExternal,
      aliciId: idAlici,
      message:
        extractMessage(response, "Taslak irsaliye oluşturuldu.") ||
        "Taslak irsaliye oluşturuldu.",
    };
  }

  async getDespatchDrafts(_mainCompanySlug?: string) {
    const config = this.getConfig();
    const today = formatLocalDate(new Date());
    const payload = await this.requestRaw(
      "/api/Invoice/GetStagingDespatchList",
      {
        method: "POST",
        body: {
          CompanyId: Number(config.companyId),
          FirstDespatchDate: today,
          LastDespatchDate: today,
          PageIndex: 0,
          PageSize: 100,
        },
      },
    );

    return {
      companyId: config.companyId,
      rows: this.normalizeDrafts(payload),
    };
  }
}
