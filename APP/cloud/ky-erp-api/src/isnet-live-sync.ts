// @ts-nocheck
import type { Context, Hono } from "hono";
import { ingestProviderEBelgeXml } from "./e-belge-center-cloud";

type AppEnv = { Bindings: Cloudflare.Env; Variables: { requestId: string } };
type Row = Record<string, any>;

type PortalSession = {
  base: string;
  cookie: string;
  companies: Row[];
  companySelected: boolean;
  loginPath: string;
};

const SETTINGS_SCOPE = "ISNET_SETTINGS";
const PORTAL_SCOPE = "ISNET_PORTAL_DOCUMENT";
const STATE_SCOPE = "ISNET_DOCUMENT_STATE";
const SYNC_SCOPE = "ISNET_SYNC_RUN";
const API_BASE = "https://einvoiceapi.isnet.net.tr";
const PORTAL_BASES = [
  "https://efatura.isnet.net.tr",
  "https://nettefatura.isnet.net.tr",
];

const text = (value: unknown) => value == null ? "" : String(value).trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nowIso = () => new Date().toISOString();
const normalize = (value: unknown) =>
  text(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const safeFile = (value: unknown) =>
  text(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "belge";

function obj(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function err(code: string, message: string, details?: unknown) {
  return {
    ok: false,
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function bodyOf(c: Context<AppEnv>) {
  try {
    return obj(await c.req.json());
  } catch {
    return {};
  }
}

function slugOf(c: Context<AppEnv>, body: Row = {}) {
  return text(
    body.mainCompanySlug ||
      body.main_company_slug ||
      c.req.query("mainCompanySlug") ||
      c.req.query("mainCompanyId") ||
      "mecit-hakan",
  );
}

async function tableExists(c: Context<AppEnv>, table: string) {
  return Boolean(
    (
      await c.env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
      )
        .bind(table)
        .first<Row>()
    )?.name,
  );
}

async function columns(c: Context<AppEnv>, table: string) {
  if (!(await tableExists(c, table))) return new Set<string>();
  const rows = await c.env.DB.prepare(
    `PRAGMA table_info("${table.replace(/"/g, '""')}")`,
  ).all<Row>();
  return new Set((rows.results || []).map((row) => text(row.name)));
}

async function storeGet(c: Context<AppEnv>, scope: string, fileName: string, slug: string) {
  if (!(await tableExists(c, "json_store"))) return null;
  const row = await c.env.DB.prepare(
    `SELECT id,file_name,data,created_at,updated_at
       FROM json_store
      WHERE scope=? AND file_name=?
        AND (main_company_slug=? OR main_company_slug IS NULL)
      ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(scope, fileName, slug)
    .first<Row>();
  if (!row) return null;
  return { ...obj(row.data), storeId: text(row.id), fileName: text(row.file_name) };
}

async function storePut(c: Context<AppEnv>, scope: string, fileName: string, data: Row, slug: string) {
  const existing = await storeGet(c, scope, fileName, slug);
  const ts = nowIso();
  const payload = {
    ...data,
    updatedAt: ts,
    createdAt: data.createdAt || existing?.createdAt || ts,
  };
  if (existing?.storeId) {
    await c.env.DB.prepare("UPDATE json_store SET data=?,updated_at=? WHERE id=?")
      .bind(JSON.stringify(payload), ts, existing.storeId)
      .run();
    return payload;
  }
  await c.env.DB.prepare(
    "INSERT INTO json_store(id,scope,main_company_slug,file_name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(crypto.randomUUID(), scope, slug, fileName, JSON.stringify(payload), ts, ts)
    .run();
  return payload;
}

function normalizeCompanies(payload: any) {
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
    .map((row: Row) => ({
      id: text(row.IdFirma ?? row.idFirma ?? row.CompanyId ?? row.companyId ?? row.Id ?? row.id ?? row.value),
      parentId: text(row.IdAnaFirma ?? row.idAnaFirma ?? row.ParentId ?? row.parentId),
      name: text(row.FirmaAdi ?? row.firmaAdi ?? row.CompanyName ?? row.companyName ?? row.Name ?? row.name ?? row.text),
      schemaName: text(row.SchemaName ?? row.schemaName),
      hasRole: row.UserHasRole !== false && row.hasRole !== false,
    }))
    .filter((row: Row) => {
      if (!row.id || !row.name || !row.hasRole || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}

function payloadMessage(payload: any, fallback = "İşNet isteği başarısız oldu.") {
  const raw =
    payload?.ErrorMessage ||
    payload?.errorMessage ||
    payload?.Message ||
    payload?.message ||
    payload?.error?.message;
  if (Array.isArray(raw)) return raw.map(text).filter(Boolean).join(", ") || fallback;
  if (raw && typeof raw === "object") {
    return Object.values(raw).flat().map(text).filter(Boolean).join(", ") || fallback;
  }
  return text(raw) || fallback;
}

async function apiHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/Account/GetHealthCheck`, {
      method: "GET",
      headers: { Accept: "application/json,text/plain,*/*" },
      signal: AbortSignal.timeout(10_000),
    });
    return { reachable: response.ok, status: response.status };
  } catch {
    return { reachable: false, status: 0 };
  }
}

async function loginApi(username: string, password: string) {
  const response = await fetch(`${API_BASE}/api/Account/Login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ IdentificationNumber: username, Password: password }),
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`İşNet API JSON yerine farklı yanıt döndürdü (${response.status}).`);
  }
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("API 401: Bu İşNet hesabı API oturumu için yetkilendirilmedi veya API parolası kabul edilmedi.");
    }
    throw new Error(`API ${response.status}: ${payloadMessage(payload, response.statusText)}`);
  }
  const errorMessage = text(
    payload?.ErrorMessage ?? payload?.errorMessage ?? payload?.Message ?? payload?.message,
  );
  if (errorMessage) throw new Error(errorMessage);
  const token = text(payload?.Token || payload?.token);
  const companies = normalizeCompanies(payload);
  if (!token) throw new Error("İşNet API giriş tokenı alınamadı.");
  if (!companies.length) throw new Error("İşNet API yetkili firma listesi döndürmedi.");
  return {
    token,
    companies,
    expiresOn: text(payload?.ExpiresOn || payload?.expiresOn) || null,
  };
}

function verificationToken(html: string) {
  return text(
    html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
      html.match(/value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i)?.[1],
  );
}

function mergeCookies(response: Response, jar: Map<string, string>) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ||
    (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  for (const value of values) {
    const pair = text(value.split(";", 1)[0]);
    const pos = pair.indexOf("=");
    if (pos > 0) jar.set(pair.slice(0, pos), pair.slice(pos + 1));
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function htmlDecode(value: string) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attr(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text(
    tag.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ||
      tag.match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, "i"))?.[1],
  );
}

function inputRows(html: string) {
  return [...String(html || "").matchAll(/<input\b[^>]*>/gi)].map((match) => {
    const tag = match[0];
    return {
      tag,
      name: attr(tag, "name"),
      value: htmlDecode(attr(tag, "value")),
      type: (attr(tag, "type") || "text").toLowerCase(),
      checked: /\bchecked(?:\s*=|\s|>)/i.test(tag),
      required: /\brequired(?:\s*=|\s|>)/i.test(tag),
      disabled: /\bdisabled(?:\s*=|\s|>)/i.test(tag),
    };
  });
}

function formDefaults(html: string) {
  const params = new URLSearchParams();
  for (const input of inputRows(html)) {
    if (!input.name || input.disabled) continue;
    if (["submit", "button", "reset", "file"].includes(input.type)) continue;
    if (["checkbox", "radio"].includes(input.type) && !input.checked) continue;
    params.set(input.name, input.value);
  }
  return params;
}

function applyConsentFields(html: string, params: URLSearchParams) {
  for (const input of inputRows(html)) {
    if (!input.name || input.disabled || input.type !== "checkbox") continue;
    if (/remember/i.test(input.name)) continue;
    if (
      input.required ||
      /(test|warning|accept|accepted|confirm|confirmation|consent|acknowledge|onay|kabul|kvkk|bilgilendirme)/i.test(input.name)
    ) {
      params.set(input.name, input.value || "true");
    }
  }
}

function formAction(html: string, fallback: string) {
  const tag = String(html || "").match(/<form\b[^>]*>/i)?.[0] || "";
  return htmlDecode(attr(tag, "action")) || fallback;
}

function portalErrorText(html: string) {
  const plain = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  const lower = plain.toLocaleLowerCase("tr-TR");
  const marker = [
    "kullanıcı adı veya şifre",
    "hatalı giriş",
    "şifreniz hatalı",
    "giriş başarısız",
    "captcha",
    "güvenlik kodu",
    "doğrulama",
    "bilgilendirme metnini",
    "zorunludur",
  ].find((item) => lower.includes(item));
  if (!marker) return "";
  const index = lower.indexOf(marker);
  return text(plain.slice(Math.max(0, index - 70), index + 260));
}

function looksLikeLoginPage(html: string) {
  const source = String(html || "");
  return /type=["']password["']/i.test(source) && /(TCKN|VknTckn|IdentificationNumber|Şifreniz|Password)/i.test(source);
}

function companyOptionsFromHtml(html: string) {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const match of String(html || "").matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const tag = `<option${match[1]}>`;
    const id = htmlDecode(attr(tag, "value"));
    const name = htmlDecode(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (!id || !name || /^(-|seç|select)/i.test(name) || seen.has(id)) continue;
    if (!/^\d+$/.test(id)) continue;
    seen.add(id);
    rows.push({ id, parentId: "", name, schemaName: "", hasRole: true });
  }
  return rows;
}

async function portalLogin(username: string, password: string, companyId = "", companyName = ""): Promise<PortalSession> {
  let lastError = "";

  for (const base of PORTAL_BASES) {
    const jar = new Map<string, string>();
    const request = async (path: string, init: RequestInit = {}) => {
      const target = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
      const response = await fetch(target, {
        ...init,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/json",
          "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Cloud/6.0",
          ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
          ...(init.headers || {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(35_000),
      });
      mergeCookies(response, jar);
      return response;
    };

    try {
      const loginPaths = ["/account/Login", "/Account/Login", "/account/login/Login", "/account/login"];
      let loginPath = "";
      let loginHtml = "";
      let token = "";
      for (const candidate of loginPaths) {
        try {
          const response = await request(candidate);
          const html = await response.text();
          const nextToken = verificationToken(html);
          if (response.ok && nextToken) {
            loginPath = candidate;
            loginHtml = html;
            token = nextToken;
            break;
          }
        } catch {
          // try next supported login path
        }
      }
      if (!loginPath || !token) {
        throw new Error("Portal giriş sayfası veya doğrulama anahtarı alınamadı.");
      }

      const inputs = inputRows(loginHtml);
      const inputNames = inputs.map((row) => row.name).filter(Boolean);
      const usernameField =
        inputNames.find((name) => /(identificationnumber|vkntckn|tckn|username|user_name)/i.test(name)) ||
        "VknTckn";
      const passwordField =
        inputNames.find((name) => /(password|sifre|şifre)/i.test(name)) || "Password";
      const action = formAction(loginHtml, loginPath);
      const loginBody = formDefaults(loginHtml);
      applyConsentFields(loginHtml, loginBody);
      loginBody.set(usernameField, username);
      loginBody.set(passwordField, password);
      loginBody.set("RememberMe", "false");
      loginBody.set("__RequestVerificationToken", token);

      const loginResponse = await request(action, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: base,
          Referer: `${base}${loginPath}`,
        },
        body: loginBody.toString(),
      });
      const loginResult = await loginResponse.text();
      const location = text(loginResponse.headers.get("location"));

      const explicitPortalError = portalErrorText(loginResult);
      const redirectedToLogin =
        loginResponse.status >= 300 &&
        loginResponse.status < 400 &&
        /login/i.test(location);
      if (explicitPortalError && looksLikeLoginPage(loginResult)) {
        throw new Error(explicitPortalError);
      }
      if (redirectedToLogin) {
        throw new Error("İşNet portalı kullanıcı/TCKN veya şifre bilgisini kabul etmedi.");
      }

      const companyPaths = [
        "/account/GetCompanyList",
        "/Account/GetCompanyList",
        "/account/login/GetCompanyList",
      ];
      let companies = companyOptionsFromHtml(loginResult);
      let companyRaw = "";
      const companyToken = verificationToken(loginResult) || token;

      if (!companies.length) {
        for (const candidate of companyPaths) {
          try {
            const body = new URLSearchParams({ q: "" });
            if (companyToken) body.set("__RequestVerificationToken", companyToken);
            const response = await request(candidate, {
              method: "POST",
              headers: {
                Accept: "application/json, text/javascript, */*; q=0.01",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                Origin: base,
                Referer: `${base}${loginPath}`,
                "X-Requested-With": "XMLHttpRequest",
              },
              body: body.toString(),
            });
            const raw = await response.text();
            companyRaw += ` ${raw}`;
            let payload: any = {};
            try {
              payload = raw ? JSON.parse(raw) : {};
            } catch {
              payload = {};
            }
            const rows = normalizeCompanies(payload);
            if (rows.length) {
              companies = rows;
              break;
            }
          } catch {
            // try next company endpoint
          }
        }
      }

      if (!companies.length && location && !/login/i.test(location)) {
        try {
          const page = await request(location);
          const html = await page.text();
          companies = companyOptionsFromHtml(html);
        } catch {
          // diagnostics below
        }
      }

      if (!companies.length) {
        const message = portalErrorText(`${loginResult} ${companyRaw}`);
        if (message) throw new Error(message);
        if (looksLikeLoginPage(loginResult)) {
          throw new Error("İşNet portalı giriş bilgilerini kabul etmedi.");
        }
        throw new Error("Portal girişi açıldı ancak yetkili firma listesi alınamadı.");
      }

      if (!companyId) {
        return {
          base,
          cookie: cookieHeader(jar),
          companies,
          companySelected: false,
          loginPath,
        };
      }

      const selected = companies.find((row) => text(row.id) === text(companyId));
      if (!selected) throw new Error("Seçilen firma İşNet yetki listesinde bulunamadı.");

      let selectionHtml = loginResult;
      let selectionToken = verificationToken(selectionHtml);
      if (!selectionToken) {
        const selectionPage = await request(loginPath);
        selectionHtml = await selectionPage.text();
        selectionToken = verificationToken(selectionHtml);
      }
      if (!selectionToken) throw new Error("Portal firma seçimi başlatılamadı.");

      const selectionBody = formDefaults(selectionHtml);
      applyConsentFields(selectionHtml, selectionBody);
      selectionBody.set(usernameField, username);
      selectionBody.set(passwordField, password);
      selectionBody.set("validation[Companylist]", companyName || text(selected.name));
      selectionBody.set("CompanyId", text(companyId));
      selectionBody.set("RememberMe", "false");
      selectionBody.set("__RequestVerificationToken", selectionToken);

      const selectionAction = formAction(selectionHtml, loginPath);
      const selectionResponse = await request(selectionAction, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: base,
          Referer: `${base}${loginPath}`,
        },
        body: selectionBody.toString(),
      });
      const selectionResult = await selectionResponse.text();
      const selectionLocation = text(selectionResponse.headers.get("location"));
      const selectionError = portalErrorText(selectionResult);
      if (selectionError && looksLikeLoginPage(selectionResult)) throw new Error(selectionError);
      if (
        (selectionResponse.status >= 300 && selectionResponse.status < 400 && /login/i.test(selectionLocation)) ||
        (selectionResponse.ok && looksLikeLoginPage(selectionResult))
      ) {
        throw new Error("İşNet firmasıyla portal oturumu açılamadı.");
      }

      try {
        const verifyPath = selectionLocation && !/login/i.test(selectionLocation) ? selectionLocation : "/";
        const verifyResponse = await request(verifyPath);
        const verifyText = await verifyResponse.text();
        if (/login/i.test(text(verifyResponse.headers.get("location"))) || looksLikeLoginPage(verifyText)) {
          throw new Error("İşNet portal oturumu doğrulanamadı.");
        }
      } catch (error: any) {
        throw new Error(text(error?.message) || "İşNet portal oturumu doğrulanamadı.");
      }

      return {
        base,
        cookie: cookieHeader(jar),
        companies,
        companySelected: true,
        loginPath,
      };
    } catch (error: any) {
      lastError = `${base.replace(/^https?:\/\//, "")}: ${text(error?.message) || "başarısız"}`;
    }
  }

  throw new Error(lastError || "İşNet portalına bağlanılamadı.");
}

function publicSettings(row: Row) {
  const diagnostics = obj(row.diagnostics);
  return {
    username: text(row.username),
    companyId: text(row.companyId),
    companyName: text(row.companyName),
    companies: Array.isArray(row.companies) ? row.companies : [],
    connectionMode: text(row.connectionMode || "auto"),
    hasPassword: false,
    sessionReady: Boolean(text(row.accessToken) || text(row.portalCookie)),
    apiSessionReady: Boolean(text(row.accessToken)),
    portalSessionReady: Boolean(text(row.portalCookie) && row.portalCompanySelected === true),
    tokenExpiresOn: row.tokenExpiresOn || null,
    testedAt: row.testedAt || null,
    savedAt: row.savedAt || null,
    diagnostics: {
      api: text(diagnostics.api),
      portal: text(diagnostics.portal),
      primary: text(diagnostics.primary || row.connectionMode || "auto"),
      portalBase: text(diagnostics.portalBase || row.portalBase),
    },
    securityNote:
      "Şifre kaydedilmez. İşNet API tokenı ve/veya firma seçilmiş portal oturumu saklanır; parola, token ve çerez AI bağlamına verilmez.",
  };
}

const SOURCES = [
  {
    kind: "invoice",
    direction: "incoming",
    page: (min: string) => `/IncomingInvoice/IncomingInvoiceList?minDate=${min}`,
    endpoint: "/IncomingInvoice/AllIncomingInvoiceByFilter",
  },
  {
    kind: "invoice",
    direction: "outgoing",
    page: (min: string) => `/OutgoingInvoice/OutgoingInvoiceList?minDate=${min}`,
    endpoint: "/OutgoingInvoice/AllOutgoingInvoiceByFilter",
  },
  {
    kind: "dispatch",
    direction: "incoming",
    page: (min: string) => `/IncomingDespatchAdvice/IncomingDespatchAdviceList?minDate=${min}`,
    endpoint: "/IncomingDespatchAdvice/AllIncomingDespatchAdviceByFilter",
  },
  {
    kind: "dispatch",
    direction: "outgoing",
    page: () => "/OutgoingDespatch/OutgoingDespatchList",
    endpoint: "/OutgoingDespatch/AllOutgoingDespatchByFilter",
  },
] as const;

function portalDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function normalizePortal(source: any, row: Row) {
  const incoming = source.direction === "incoming";
  const invoice = source.kind === "invoice";
  const sourceId = text(
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
    documentNo: text(invoice ? row.FaturaNo : row.IrsaliyeNo),
    dateText: text(invoice ? row.FaturaTarihiFormated : row.IrsaliyeTarihiFormated),
    transferDateText: text(incoming ? row.GelisTarihiFormated : row.GonderilmeTarihiFormated),
    partnerName: text(incoming ? row.FirmaAdi || row.AliciAdi : row.AliciAdi),
    partnerTaxNo: text(row.VknTckn || row.VNKTCKN || row.VKN || row.TCKN),
    scenarioText: text(row.SenaryoAdi),
    subtypeText: text(invoice ? row.FaturaTipiAdi : row.IrsaliyeTipiAdi),
    statusText: text(row.DurumAdi || row.GonderimDurumAdi),
    amount: invoice ? numberValue(row.OdenecekTutar) : 0,
    amountText: invoice ? text(row.OdenecekTutarFormatted) : "",
    currency: invoice ? text(row.DovizKodu) : "",
    uuid: invoice ? text(row.Ettn || row.ETTN || row.UUID) : "",
    raw: row,
  };
}

async function portalRequest(base: string, cookie: string, path: string, init: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Cloud/6.0",
      ...(init.headers || {}),
      Cookie: cookie,
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
}

async function fetchSource(
  base: string,
  cookie: string,
  source: any,
  companyId: string,
  startDate: string,
  endDate: string,
) {
  const pagePath = source.page(startDate);
  const pageResponse = await portalRequest(base, cookie, pagePath);
  const pageHtml = await pageResponse.text();
  const token = verificationToken(pageHtml);
  if (!pageResponse.ok || !token || looksLikeLoginPage(pageHtml)) {
    throw new Error(`${source.direction} ${source.kind} ekranı açılamadı; portal oturumu süresi dolmuş olabilir.`);
  }

  const rows: Row[] = [];
  const length = 300;
  let total = length;
  for (let start = 0; start < total && start < 5000; start += length) {
    const form: Record<string, string> = {
      draw: "1",
      start: String(start),
      length: String(length),
      "search[value]": "",
      "search[regex]": "false",
      CompanyIdFilter: companyId,
      __RequestVerificationToken: token,
      IlkTarih: portalDate(startDate),
      SonTarih: portalDate(endDate),
    };
    if (source.kind === "invoice") {
      form.FaturaIlkTarihi = portalDate(startDate);
      form.FaturaSonTarihi = portalDate(endDate);
    } else {
      form.IrsaliyeIlkTarihi = portalDate(startDate);
      form.IrsaliyeSonTarihi = portalDate(endDate);
    }
    const response = await portalRequest(base, cookie, source.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: `${base}${pagePath}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams(form).toString(),
    });
    const raw = await response.text();
    let payload: any = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }
    if (!response.ok || !Array.isArray(payload?.data)) {
      if (looksLikeLoginPage(raw)) throw new Error("İşNet portal oturumu sona ermiş.");
      throw new Error(`${source.direction} ${source.kind} listesi alınamadı.`);
    }
    rows.push(...payload.data);
    total = Math.min(numberValue(payload.recordsFiltered || payload.recordsTotal), 5000);
    if (payload.data.length < length) break;
  }
  return rows.map((row) => normalizePortal(source, row)).filter((row) => row.sourceId && row.documentNo);
}

function xmlDecode(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function tag(xml: string, name: string) {
  const match = xml.match(
    new RegExp(
      `<(?:[A-Za-z0-9_-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${name}>`,
      "i",
    ),
  );
  return match ? xmlDecode(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")) : "";
}

function moneyTag(xml: string, name: string) {
  const v = tag(xml, name).replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseUbl(xml: string, kind: string) {
  const documentNo = tag(xml, "ID");
  const issueDate = tag(xml, "IssueDate");
  const taxNo = text(xml.match(/<(?:\w+:)?CompanyID[^>]*>([^<]+)<\/[^>]*CompanyID>/i)?.[1]);
  const supplierName = tag(xml, "Name");
  const taxTotal = moneyTag(xml, "TaxAmount");
  const subtotal = moneyTag(xml, "TaxExclusiveAmount") || moneyTag(xml, "LineExtensionAmount");
  const total = moneyTag(xml, "PayableAmount") || moneyTag(xml, "TaxInclusiveAmount");
  let quantity = 0;
  const qtyMatches = [...xml.matchAll(/<(?:\w+:)?(?:InvoicedQuantity|DeliveredQuantity)[^>]*>([^<]+)</gi)];
  for (const match of qtyMatches) {
    const n = Number(text(match[1]).replace(",", "."));
    if (Number.isFinite(n)) quantity += n;
  }
  return { documentNo, issueDate, taxNo, supplierName, taxTotal, subtotal, total, quantity, kind };
}

async function findCompany(c: Context<AppEnv>, slug: string, name: string, taxNo: string) {
  if (!(await tableExists(c, "companies"))) return null;
  const cols = await columns(c, "companies");
  const clauses: string[] = [];
  const binds: any[] = [];
  if (cols.has("main_company_slug")) {
    clauses.push("main_company_slug=?");
    binds.push(slug);
  }
  if (cols.has("deleted_at")) clauses.push("deleted_at IS NULL");
  const result = await c.env.DB.prepare(
    `SELECT * FROM companies${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`,
  )
    .bind(...binds)
    .all<Row>();
  const tax = text(taxNo).replace(/\D/g, "");
  if (tax) {
    const match = (result.results || []).find((row) => text(row.tax_no).replace(/\D/g, "") === tax);
    if (match) return match;
  }
  const n = normalize(name);
  return (result.results || []).find(
    (row) => normalize(row.name) === n || normalize(row.normalized_name) === n,
  ) || null;
}

async function insertDynamic(c: Context<AppEnv>, table: string, values: Row) {
  const cols = await columns(c, table);
  const entries = Object.entries(values).filter(([key]) => cols.has(key));
  if (!entries.length) return;
  await c.env.DB.prepare(
    `INSERT INTO ${table} (${entries.map(([key]) => `"${key}"`).join(",")}) VALUES (${entries.map(() => "?").join(",")})`,
  )
    .bind(...entries.map(([, value]) => (typeof value === "object" && value !== null ? JSON.stringify(value) : value)))
    .run();
}

async function ensureAccountingDocument(c: Context<AppEnv>, slug: string, doc: Row, xmlText: string) {
  if (!(await tableExists(c, "documents"))) return null;
  if (
    !(doc.direction === "incoming" && ["invoice", "dispatch"].includes(doc.kind)) &&
    !(doc.direction === "outgoing" && doc.kind === "invoice")
  ) return null;

  if (doc.direction === "incoming" && doc.kind === "dispatch") {
    const company = await findCompany(c, slug, doc.partnerName, doc.partnerTaxNo);
    const role = normalize(company?.company_type || company?.type);
    if (/SUPPLIER|TEDARIK|SATICI/.test(role)) return null;
  }

  const parsed = parseUbl(xmlText, doc.kind);
  const existing = await c.env.DB.prepare(
    "SELECT id FROM documents WHERE main_company_slug=? AND document_no=? LIMIT 1",
  )
    .bind(slug, doc.documentNo)
    .first<Row>();
  if (existing?.id) return text(existing.id);

  const company = await findCompany(
    c,
    slug,
    doc.partnerName || parsed.supplierName,
    doc.partnerTaxNo || parsed.taxNo,
  );
  const id = crypto.randomUUID();
  const documentType =
    doc.direction === "outgoing"
      ? "CUSTOMER_INVOICE"
      : doc.kind === "invoice"
        ? "SUPPLIER_INVOICE"
        : "CUSTOMER_DISPATCH";
  const raw = {
    source: "ISNET_DIRECT",
    direction: doc.direction,
    kind: doc.kind,
    companyName: doc.partnerName,
    supplierName: doc.partnerName,
    taxNo: doc.partnerTaxNo,
    quantity: parsed.quantity,
    portalSourceId: doc.sourceId,
    automationKey: doc.automationKey,
    pdfKey: doc.pdfKey,
    xmlKey: doc.xmlKey,
  };
  await insertDynamic(c, "documents", {
    id,
    main_company_slug: slug,
    company_id: company?.id || null,
    document_type: documentType,
    detected_type: documentType,
    target_type: documentType,
    document_no: doc.documentNo,
    date: parsed.issueDate || doc.dateText || new Date().toISOString().slice(0, 10),
    source_type: "ISNET_DIRECT",
    status: doc.direction === "incoming" && doc.kind === "invoice" ? "CONTROL_WAITING" : "PROCESSED",
    firm_match_status: company?.id ? "MATCHED" : "PENDING",
    subtotal: parsed.subtotal,
    vat_total: parsed.taxTotal,
    grand_total: parsed.total || doc.amount,
    metadata: raw,
    raw,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return id;
}

async function downloadFile(base: string, cookie: string, doc: Row, format: "pdf" | "xml") {
  const incoming = doc.direction === "incoming";
  const entity = doc.kind === "invoice" ? "Invoice" : "Despatch";
  const path = `/${entity}/Get${entity}${format === "pdf" ? "Pdf" : "Xml"}?InOrOut=${incoming}&${entity}Id=${encodeURIComponent(doc.sourceId)}`;
  const response = await portalRequest(base, cookie, path);
  const buffer = await response.arrayBuffer();
  if (!response.ok || !buffer.byteLength) {
    throw new Error(`${doc.documentNo} ${format.toUpperCase()} indirilemedi.`);
  }
  return {
    buffer,
    contentType:
      text(response.headers.get("content-type")) ||
      (format === "pdf" ? "application/pdf" : "application/xml"),
  };
}

export function registerIsnetLiveSyncRoutes(app: Hono<AppEnv>) {
  const getSettings = async (c: Context<AppEnv>) => {
    const slug = slugOf(c);
    return c.json({
      ok: true,
      success: true,
      data: publicSettings((await storeGet(c, SETTINGS_SCOPE, slug, slug)) || {}),
    });
  };
  app.get("/api/isnet/settings", getSettings);
  app.get("/api/isnet/connection", getSettings);

  app.get("/api/isnet/connection/health", async (c) => {
    const slug = slugOf(c);
    const settings = (await storeGet(c, SETTINGS_SCOPE, slug, slug)) || {};
    const sync = (await storeGet(c, SYNC_SCOPE, "latest", slug)) || { status: "NOT_RUN" };
    return c.json({
      ok: true,
      success: true,
      data: {
        ...publicSettings(settings),
        apiHealth: await apiHealth(),
        syncStatus: text(sync.status || "NOT_RUN"),
        lastSyncAt: sync.completedAt || sync.startedAt || null,
        lastSyncError: text(sync.error),
      },
    });
  });

  const test = async (c: Context<AppEnv>) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const current = (await storeGet(c, SETTINGS_SCOPE, slug, slug)) || {};
    const username = text(body.username || current.username);
    const password = text(body.password);
    if (!username || !password) {
      return c.json(
        err("ISNET_CREDENTIALS_REQUIRED", "İşNet kullanıcı adı/TCKN ve şifre zorunludur."),
        400,
      );
    }

    let api: any = null;
    let portal: PortalSession | null = null;
    let apiError = "";
    let portalError = "";
    try {
      api = await loginApi(username, password);
    } catch (error: any) {
      apiError = text(error?.message);
    }
    try {
      portal = await portalLogin(username, password);
    } catch (error: any) {
      portalError = text(error?.message);
    }

    if (!api && !portal) {
      return c.json(
        err(
          "ISNET_LOGIN_FAILED",
          "İşNet bağlantısı kurulamadı.",
          {
            api: apiError || "API bağlantısı başarısız.",
            portal: portalError || "Portal bağlantısı başarısız.",
            hint: "TCKN ve şifre İşNet/NetteFatura hesabına ait olmalıdır. API yetkisi kapalı olsa bile portal bağlantısı çalışabilir.",
          },
        ),
        502,
      );
    }

    const companies = api?.companies?.length ? api.companies : portal?.companies || [];
    const primary = api ? "api" : "portal";
    const saved = await storePut(
      c,
      SETTINGS_SCOPE,
      slug,
      {
        ...current,
        username,
        companies,
        accessToken: api?.token || "",
        tokenExpiresOn: api?.expiresOn || null,
        portalCookie: portal?.cookie || "",
        portalBase: portal?.base || text(current.portalBase) || PORTAL_BASES[0],
        portalCompanySelected: false,
        connectionMode: primary,
        testedAt: nowIso(),
        passwordStored: false,
        diagnostics: {
          api: api ? "Bağlandı" : apiError,
          portal: portal ? "Bağlandı" : portalError,
          primary,
          portalBase: portal?.base || "",
        },
      },
      slug,
    );

    return c.json({
      ok: true,
      success: true,
      data: {
        ...publicSettings(saved),
        companies,
        authorizedCompanies: companies,
        message:
          api && portal
            ? "İşNet API ve NetteFatura portalı doğrulandı. Yetkili firmayı seçip Kaydet'e basın."
            : api
              ? "İşNet API doğrulandı; portal oturumu kurulamadı. Firma seçimi kaydedilebilir ancak portal senkronu için portal bağlantısı da gerekli."
              : "NetteFatura portalı doğrulandı. İşNet API yetkisi olmasa da portal üzerinden çalışmaya devam edilebilir. Yetkili firmayı seçip Kaydet'e basın.",
      },
    });
  };
  app.post("/api/isnet/settings/test", test);
  app.post("/api/isnet/connection/test", test);

  const save = async (c: Context<AppEnv>) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    let current = (await storeGet(c, SETTINGS_SCOPE, slug, slug)) || {};
    const username = text(body.username || current.username);
    const password = text(body.password);
    const companyId = text(body.companyId || current.companyId);
    const companies = Array.isArray(current.companies) ? current.companies : [];
    let selected = companies.find((row: Row) => text(row.id) === companyId);
    if (!username || !companyId || !selected) {
      return c.json(
        err("ISNET_COMPANY_REQUIRED", "Önce bağlantıyı test edin ve yetkili firmayı seçin."),
        400,
      );
    }

    let apiToken = text(current.accessToken);
    let apiExpires = current.tokenExpiresOn || null;
    let portalCookie = text(current.portalCookie);
    let portalBase = text(current.portalBase) || PORTAL_BASES[0];
    let portalSelected = current.portalCompanySelected === true;
    let apiError = "";
    let portalError = "";

    if (password) {
      try {
        const api = await loginApi(username, password);
        apiToken = api.token;
        apiExpires = api.expiresOn;
        current.companies = api.companies;
        selected = api.companies.find((row: Row) => text(row.id) === companyId) || selected;
      } catch (error: any) {
        apiError = text(error?.message);
      }
      try {
        const portal = await portalLogin(username, password, companyId, text(selected.name));
        portalCookie = portal.cookie;
        portalBase = portal.base;
        portalSelected = portal.companySelected;
        if (!Array.isArray(current.companies) || !current.companies.length) current.companies = portal.companies;
      } catch (error: any) {
        portalError = text(error?.message);
      }
    } else if (!portalSelected) {
      return c.json(
        err(
          "ISNET_PASSWORD_REQUIRED_FOR_PORTAL_SELECTION",
          "Firma seçimini tamamlamak için İşNet şifresini yeniden girin. Şifre güvenlik nedeniyle KY ERP'de saklanmaz.",
        ),
        409,
      );
    }

    if (!apiToken && !portalSelected) {
      return c.json(
        err("ISNET_COMPANY_SESSION_FAILED", "Seçilen firma için İşNet oturumu açılamadı.", {
          api: apiError || "API oturumu yok.",
          portal: portalError || "Portal oturumu yok.",
        }),
        502,
      );
    }

    const primary = apiToken ? "api" : "portal";
    const saved = await storePut(
      c,
      SETTINGS_SCOPE,
      slug,
      {
        ...current,
        username,
        companyId,
        companyName: text(selected.name),
        companies: Array.isArray(current.companies) ? current.companies : companies,
        accessToken: apiToken,
        tokenExpiresOn: apiExpires,
        portalCookie,
        portalBase,
        portalCompanySelected: portalSelected,
        connectionMode: primary,
        savedAt: nowIso(),
        passwordStored: false,
        diagnostics: {
          api: apiToken ? "Bağlandı" : apiError,
          portal: portalSelected ? "Bağlandı" : portalError,
          primary,
          portalBase,
        },
      },
      slug,
    );

    return c.json({
      ok: true,
      success: true,
      data: {
        ...publicSettings(saved),
        message: portalSelected
          ? "İşNet firması kaydedildi; portal senkronizasyon oturumu hazır."
          : "Firma kaydedildi. API oturumu hazır; portal senkronu için şifreyle bağlantıyı yeniden doğrulayın.",
      },
    });
  };
  app.put("/api/isnet/settings", save);
  app.put("/api/isnet/connection", save);

  app.post("/api/isnet/full-sync", async (c) => {
    const body = await bodyOf(c);
    const slug = slugOf(c, body);
    const settings = (await storeGet(c, SETTINGS_SCOPE, slug, slug)) || {};
    const cookie = text(settings.portalCookie);
    const base = text(settings.portalBase) || PORTAL_BASES[0];
    const companyId = text(settings.companyId);
    if (!cookie || !companyId || settings.portalCompanySelected !== true) {
      return c.json(
        err(
          "ISNET_PORTAL_SESSION_REQUIRED",
          "İşNet portal oturumu hazır değil. Ayarlarda TCKN ve şifreyle Bağlantıyı Test Et, firmayı seçip Kaydet yapın.",
        ),
        409,
      );
    }

    const endDate = text(body.endDate) || new Date().toISOString().slice(0, 10);
    const defaultStart = new Date(`${endDate}T00:00:00Z`);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 31);
    const startDate = text(body.startDate) || defaultStart.toISOString().slice(0, 10);
    const runId = crypto.randomUUID();
    await storePut(
      c,
      SYNC_SCOPE,
      "latest",
      { id: runId, status: "RUNNING", startedAt: nowIso(), startDate, endDate, source: "portal" },
      slug,
    );

    try {
      const groups = await Promise.all(
        SOURCES.map((source) => fetchSource(base, cookie, source, companyId, startDate, endDate)),
      );
      const docs = groups.flat();
      let downloaded = 0;
      let failed = 0;
      let accountingCreated = 0;
      let legacyAccountingFailed = 0;
      const legacyAccountingErrors: Row[] = [];
      let canonicalCreated = 0;
      let canonicalDuplicates = 0;
      let canonicalFailed = 0;
      const canonicalErrors: Row[] = [];

      for (const baseDoc of docs) {
        const automationKey = `${baseDoc.direction}:${baseDoc.kind}:${baseDoc.sourceId}`;
        let state = (await storeGet(c, STATE_SCOPE, automationKey, slug)) || {};
        const month =
          baseDoc.dateText && /^\d{2}\.\d{2}\.\d{4}$/.test(baseDoc.dateText)
            ? baseDoc.dateText.split(".").reverse().slice(0, 2).join("-")
            : (baseDoc.dateText || new Date().toISOString()).slice(0, 7);
        const folder = `${slug}/isnet/${baseDoc.direction}/${baseDoc.kind}/${month}/${safeFile(baseDoc.documentNo)}`;
        let pdfKey = text(state.pdfKey);
        let xmlKey = text(state.xmlKey);
        let xmlText = "";

        try {
          if (!pdfKey) {
            const pdf = await downloadFile(base, cookie, baseDoc, "pdf");
            pdfKey = `${folder}/${safeFile(baseDoc.documentNo)}.pdf`;
            await c.env.FILES.put(pdfKey, pdf.buffer, {
              httpMetadata: { contentType: pdf.contentType },
            });
          }
          if (!xmlKey) {
            const xml = await downloadFile(base, cookie, baseDoc, "xml");
            xmlKey = `${folder}/${safeFile(baseDoc.documentNo)}.xml`;
            await c.env.FILES.put(xmlKey, xml.buffer, {
              httpMetadata: { contentType: xml.contentType },
            });
            xmlText = new TextDecoder().decode(xml.buffer);
          } else {
            const existing = await c.env.FILES.get(xmlKey);
            if (existing) xmlText = await existing.text();
          }
          downloaded += 1;
        } catch (error: any) {
          failed += 1;
          state = { ...state, error: text(error?.message) };
        }

        const portal = { ...baseDoc, automationKey, pdfKey, xmlKey };
        await storePut(c, PORTAL_SCOPE, automationKey, portal, slug);
        state = await storePut(
          c,
          STATE_SCOPE,
          automationKey,
          {
            ...state,
            ...portal,
            completed: Boolean(pdfKey && xmlKey),
            pdfSaved: Boolean(pdfKey),
            xmlSaved: Boolean(xmlKey),
            downloadedAt: pdfKey && xmlKey ? nowIso() : state.downloadedAt || null,
            lastAttemptAt: nowIso(),
          },
          slug,
        );
        if (xmlText) {
          try {
            const id = await ensureAccountingDocument(c, slug, portal, xmlText);
            if (id) accountingCreated += 1;
          } catch (error: any) {
            legacyAccountingFailed += 1;
            legacyAccountingErrors.push({
              automationKey,
              documentNo: baseDoc.documentNo,
              message: text(error?.message) || "Legacy İşNet belge uyumluluk kaydı yazılamadı.",
            });
          }
          try {
            const canonical = await ingestProviderEBelgeXml(c, slug, {
              providerType: "ISNET",
              providerDocumentId: automationKey,
              sourceId: baseDoc.sourceId,
              automationKey,
              documentNo: baseDoc.documentNo,
              direction: baseDoc.direction,
              kind: baseDoc.kind,
              statusText: baseDoc.statusText,
              xmlText,
              xmlKey,
              pdfKey,
              sourceType: "ISNET_DIRECT",
              rawMetadata: {
                portalSourceId: baseDoc.sourceId,
                portalDirection: baseDoc.direction,
                portalKind: baseDoc.kind,
                portalDateText: baseDoc.dateText,
                partnerName: baseDoc.partnerName,
                partnerTaxNo: baseDoc.partnerTaxNo,
              },
            });
            if (canonical?.duplicate) canonicalDuplicates += 1;
            else if (canonical?.documentId) canonicalCreated += 1;
          } catch (error: any) {
            canonicalFailed += 1;
            canonicalErrors.push({
              automationKey,
              documentNo: baseDoc.documentNo,
              code: text(error?.code) || "CANONICAL_EBELGE_INGEST_FAILED",
              message: text(error?.message) || "İşNet belgesi canonical e-Belge havuzuna alınamadı.",
            });
          }
        }
      }

      const requiresReview = failed > 0 || canonicalFailed > 0 || legacyAccountingFailed > 0;
      const result = {
        id: runId,
        status: requiresReview ? "PARTIAL_REVIEW_REQUIRED" : "COMPLETED",
        requiresReview,
        warning: requiresReview
          ? "İşNet taşıma tamamlandı ancak bazı belge dosyaları veya canonical e-Belge kayıtları kontrol gerektiriyor."
          : null,
        source: "portal",
        startedAt: (await storeGet(c, SYNC_SCOPE, "latest", slug))?.startedAt,
        completedAt: nowIso(),
        startDate,
        endDate,
        portalCount: docs.length,
        downloaded,
        failed,
        accountingCreated,
        legacyAccounting: {
          created: accountingCreated,
          failed: legacyAccountingFailed,
          errors: legacyAccountingErrors,
        },
        canonical: {
          created: canonicalCreated,
          duplicates: canonicalDuplicates,
          failed: canonicalFailed,
          errors: canonicalErrors,
        },
        counts: {
          incomingInvoices: docs.filter((d) => d.direction === "incoming" && d.kind === "invoice").length,
          incomingDispatches: docs.filter((d) => d.direction === "incoming" && d.kind === "dispatch").length,
          outgoingDispatches: docs.filter((d) => d.direction === "outgoing" && d.kind === "dispatch").length,
          outgoingInvoices: docs.filter((d) => d.direction === "outgoing" && d.kind === "invoice").length,
          canonicalCreated,
          canonicalDuplicates,
          canonicalFailed,
          legacyAccountingFailed,
        },
      };
      await storePut(c, SYNC_SCOPE, "latest", result, slug);
      return c.json({ ok: true, success: true, data: result });
    } catch (error: any) {
      const result = {
        id: runId,
        status: "FAILED",
        source: "portal",
        completedAt: nowIso(),
        error: text(error?.message),
      };
      await storePut(c, SYNC_SCOPE, "latest", result, slug);
      return c.json(
        err("ISNET_SYNC_FAILED", text(error?.message) || "İşNet senkronizasyonu tamamlanamadı."),
        502,
      );
    }
  });

  app.get("/api/isnet/full-sync/status", async (c) => {
    const slug = slugOf(c);
    return c.json({
      ok: true,
      success: true,
      data: (await storeGet(c, SYNC_SCOPE, "latest", slug)) || { status: "NOT_RUN" },
    });
  });
}
