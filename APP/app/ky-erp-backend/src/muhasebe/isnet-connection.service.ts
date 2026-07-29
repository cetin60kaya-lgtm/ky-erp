import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";

type Query = Record<string, any>;

type IsnetCompanyOption = {
  id: string;
  parentId: string;
  name: string;
  schemaName: string;
  hasRole: boolean;
};

type LoginResult = {
  companies: IsnetCompanyOption[];
  expiresOn: string | null;
  connectionMode: "api" | "portal";
  diagnostics: {
    api: string;
    portal: string;
  };
};

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const objectValue = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

@Injectable()
export class IsnetConnectionService {
  private readonly portalBase = "https://nettefatura.isnet.net.tr";

  constructor(private readonly prisma: PrismaService) {}

  private slug(input: Query) {
    const slug = clean(input.mainCompanySlug || input.mainCompanyId);
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return slug;
  }

  private apiBase() {
    return clean(process.env.ISNET_API_BASE) || "https://einvoiceapi.isnet.net.tr";
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

  private normalizeCompanies(payload: any): IsnetCompanyOption[] {
    const source = Array.isArray(payload?.CompanyList)
      ? payload.CompanyList
      : Array.isArray(payload?.companyList)
        ? payload.companyList
        : Array.isArray(payload?.Companies)
          ? payload.Companies
          : Array.isArray(payload?.companies)
            ? payload.companies
            : Array.isArray(payload?.options)
              ? payload.options
              : Array.isArray(payload)
                ? payload
                : [];
    const seen = new Set<string>();
    return source
      .map((row: any) => ({
        id: clean(
          row?.IdFirma ??
            row?.idFirma ??
            row?.CompanyId ??
            row?.companyId ??
            row?.Id,
        ),
        parentId: clean(
          row?.IdAnaFirma ?? row?.idAnaFirma ?? row?.ParentId ?? row?.parentId,
        ),
        name: clean(
          row?.FirmaAdi ??
            row?.firmaAdi ??
            row?.CompanyName ??
            row?.companyName ??
            row?.Name,
        ),
        schemaName: clean(row?.SchemaName ?? row?.schemaName),
        hasRole: row?.UserHasRole !== false && row?.hasRole !== false,
      }))
      .filter((row: IsnetCompanyOption) => {
        if (!row.id || !row.name || !row.hasRole || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
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
      )?.[1] ||
        html.match(
          /value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i,
        )?.[1],
    );
  }

  private portalErrorText(html: string) {
    const text = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    const candidates = [
      "kullanıcı adı veya şifre",
      "kullanıcı adı",
      "şifre",
      "hatalı giriş",
      "doğrulama",
      "captcha",
      "güvenlik kodu",
    ];
    const lower = text.toLocaleLowerCase("tr-TR");
    const marker = candidates.find((item) => lower.includes(item));
    if (!marker) return "";
    const index = lower.indexOf(marker);
    return clean(text.slice(Math.max(0, index - 50), index + 180));
  }

  private async loginApi(username: string, password: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(
        `${this.apiBase().replace(/\/+$/, "")}/api/Account/Login`,
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
        throw new Error(`API JSON yerine farklı yanıt döndürdü (${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(`API HTTP ${response.status} döndürdü.`);
      }
      const token = clean(payload?.Token ?? payload?.token);
      const errorMessage = clean(
        payload?.ErrorMessage ?? payload?.errorMessage ?? payload?.Message,
      );
      const companies = this.normalizeCompanies(payload);
      if (errorMessage) throw new Error(errorMessage);
      if (!token) throw new Error("API giriş tokenı alınamadı.");
      if (!companies.length) throw new Error("API yetkili firma listesi döndürmedi.");
      return {
        companies,
        expiresOn: clean(payload?.ExpiresOn || payload?.expiresOn) || null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async loginPortal(username: string, password: string) {
    const jar = new Map<string, string>();
    const request = async (url: string, init: RequestInit = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      try {
        const response = await fetch(
          url.startsWith("http") ? url : `${this.portalBase}${url}`,
          {
            ...init,
            headers: {
              Accept: "text/html,application/xhtml+xml,application/json",
              "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Connector/2.0",
              ...(jar.size ? { Cookie: this.cookieHeader(jar) } : {}),
              ...(init.headers || {}),
            },
            redirect: "manual",
            signal: controller.signal,
          },
        );
        this.mergeResponseCookies(response, jar);
        return response;
      } finally {
        clearTimeout(timeout);
      }
    };

    const loginPage = await request("/Account/Login");
    const loginHtml = await loginPage.text();
    const loginToken = this.verificationToken(loginHtml);
    if (!loginPage.ok || !loginToken) {
      throw new Error("Portal giriş sayfası veya doğrulama anahtarı alınamadı.");
    }

    const loginResponse = await request("/Account/Login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: this.portalBase,
        Referer: `${this.portalBase}/Account/Login`,
      },
      body: new URLSearchParams({
        VknTckn: username,
        Password: password,
        RememberMe: "false",
        __RequestVerificationToken: loginToken,
      }).toString(),
    });
    const loginResult = await loginResponse.text();

    const companyResponse = await request("/Account/GetCompanyList", {
      method: "POST",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: this.portalBase,
        Referer: `${this.portalBase}/Account/Login`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ q: "" }).toString(),
    });
    const companyRaw = await companyResponse.text();
    let companyPayload: any = {};
    try {
      companyPayload = companyRaw ? JSON.parse(companyRaw) : {};
    } catch {
      companyPayload = {};
    }
    const companies = this.normalizeCompanies(companyPayload);
    if (companies.length) return { companies, expiresOn: null };

    const portalMessage = this.portalErrorText(`${loginResult} ${companyRaw}`);
    if (portalMessage) throw new BadRequestException(portalMessage);
    const location = clean(loginResponse.headers.get("location"));
    if (
      loginResponse.status >= 300 &&
      loginResponse.status < 400 &&
      location &&
      !location.toLocaleLowerCase("tr-TR").includes("account/login")
    ) {
      throw new Error(
        "Portal girişi doğrulandı ancak yetkili firma listesi alınamadı.",
      );
    }
    throw new BadRequestException(
      "İşNet portalı kullanıcı adı veya şifreyi kabul etmedi.",
    );
  }

  private async login(username: string, password: string): Promise<LoginResult> {
    if (!username || !password) {
      throw new BadRequestException(
        "İşNet kullanıcı adı ve şifresi zorunludur.",
      );
    }
    let apiMessage = "";
    try {
      const result = await this.loginApi(username, password);
      return {
        ...result,
        connectionMode: "api",
        diagnostics: { api: "Bağlandı", portal: "Denenmedi" },
      };
    } catch (error: any) {
      apiMessage = clean(error?.message) || "API bağlantısı kurulamadı.";
    }

    try {
      const result = await this.loginPortal(username, password);
      return {
        ...result,
        connectionMode: "portal",
        diagnostics: { api: apiMessage, portal: "Bağlandı" },
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      if (error?.name === "AbortError") {
        throw new ServiceUnavailableException(
          `İşNet bağlantısı zaman aşımına uğradı. API: ${apiMessage}`,
        );
      }
      const portalMessage = clean(error?.message) || "Portal bağlantısı kurulamadı.";
      throw new BadGatewayException(
        `İşNet bağlantısı kurulamadı. API: ${apiMessage} Portal: ${portalMessage}`,
      );
    }
  }

  async test(body: Query = {}) {
    const slug = this.slug(body);
    const row = await this.connectionRow(slug);
    const stored = objectValue(row?.value);
    const username = clean(
      body.username || stored.username || process.env.ISNET_USERNAME,
    );
    const password =
      clean(body.password) ||
      this.decryptSecret(stored.passwordEncrypted) ||
      clean(process.env.ISNET_PASSWORD);
    const result = await this.login(username, password);
    return {
      ok: true,
      mainCompanySlug: slug,
      username,
      companies: result.companies,
      expiresOn: result.expiresOn,
      connectionMode: result.connectionMode,
      diagnostics: result.diagnostics,
      testedAt: new Date().toISOString(),
    };
  }

  async save(body: Query = {}) {
    const slug = this.slug(body);
    const row = await this.connectionRow(slug);
    const current = objectValue(row?.value);
    const username = clean(
      body.username || current.username || process.env.ISNET_USERNAME,
    );
    const password =
      clean(body.password) ||
      this.decryptSecret(current.passwordEncrypted) ||
      clean(process.env.ISNET_PASSWORD);
    const result = await this.login(username, password);
    const companyId = clean(body.companyId);
    const selectedCompany = result.companies.find(
      (company) => clean(company.id) === companyId,
    );
    if (!selectedCompany) {
      throw new BadRequestException(
        "Kaydetmek için test sonucundaki İşNet firmasını seçin.",
      );
    }
    const value = {
      username,
      passwordEncrypted: this.encryptSecret(password),
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      companies: result.companies,
      connectionMode: result.connectionMode,
      testedAt: new Date().toISOString(),
      diagnostics: result.diagnostics,
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
    return {
      mainCompanySlug: slug,
      username,
      hasPassword: true,
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      companies: result.companies,
      testedAt: value.testedAt,
      savedAt: new Date().toISOString(),
      connectionMode: result.connectionMode,
      apiBase: this.apiBase(),
      diagnostics: result.diagnostics,
    };
  }
}
