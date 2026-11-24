// QA-only read-only extraction of existing isnet-live-sync.ts portal flow.
// No production imports or database bindings. No automatic user consent.
// @ts-nocheck
type Row=Record<string,any>;
type PortalSession={base:string,cookie:string,companies:Row[],companySelected:boolean,loginPath:string};
const PORTAL_BASES=["https://nettefatura.isnet.net.tr"];
// Real-account acceptance never sends credentials to a shared TEST portal.
const isProductionForm=(html:string)=>/if\s*\(\s*[\x27\x22]PROD[\x27\x22]\s*==\s*[\x27\x22]TEST[\x27\x22]\s*\)/i.test(html)&&!/<input\b[^>]*\bid\s*=\s*[\x27\x22]ReadedKvkk[\x27\x22][^>]*\brequired\b/i.test(html);
const text=(v:unknown)=>v==null?"":String(v).trim();
const numberValue=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
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
      if (!/^\d+$/.test(row.id) || !row.name || !row.hasRole || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}

function verificationToken(html: string) {
  return text(
    html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
      html.match(/value=["']([^"']+)["'][^>]*name=["']__RequestVerificationToken["']/i)?.[1],
  );
}

function mergeCookies(response: Response, jar: Map<string, string>) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() :
    typeof (headers as any).getAll === "function" ? (headers as any).getAll("Set-Cookie") :
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
  // No automatic consent, CAPTCHA, MFA or other provider security steps.
  if (inputRows(html).some(input=>input.type==="checkbox" && input.required && !input.checked && !input.disabled)) throw Error("PORTAL_USER_CONFIRMATION_REQUIRED");
  if (inputRows(html).some(input=>!input.disabled && /(captcha|otp|mfa|twofactor|verificationcode|securitycode)/i.test(input.name))) throw Error("PORTAL_INTERACTIVE_SECURITY_REQUIRED");
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
  // Generic login page labels ("kullanıcı adı", "şifre", "zorunludur",
  // "doğrulama") are NOT evidence that a user's password was rejected.
  // Return a fixed, non-sensitive diagnostic, never provider page content.
  if (["hatalı giriş", "şifreniz hatalı", "giriş başarısız"].some((x)=>lower.includes(x))) {
    return "İşNet giriş yanıtında kimlik doğrulama hatası bildiriyor.";
  }
  if (["captcha", "güvenlik kodu", "tek kullanımlık kod"].some((x)=>lower.includes(x))) {
    return "İşNet girişinde ek güvenlik doğrulaması gerekiyor.";
  }
  return "";
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

export async function portalLogin(username: string, password: string, companyId = "", companyName = ""): Promise<PortalSession> {
  let lastError = "";

  for (const base of PORTAL_BASES) {
    // A request containing a password may have reached the provider even if the
    // network fails. Never replay credentials to a second host automatically.
    let credentialsSubmitted = false;
    const jar = new Map<string, string>();
    const request = async (path: string, init: RequestInit = {}) => {
      const target = new URL(path, base);
      // Portal form/action and redirects are untrusted provider input. Never
      // send credentials or cookies to an arbitrary origin.
      if (target.origin !== new URL(base).origin || target.username || target.password) {
        throw new Error("PORTAL_UNSAFE_TARGET");
      }
      const response = await fetch(target.toString(), {
        ...init,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/json",
          "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Cloud/6.0",
          ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
          ...(init.headers || {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(init.method === "POST" ? 25_000 : 25_000),
      });
      mergeCookies(response, jar);
      return response;
    };

    try {
      const loginPaths = ["/Account/Login", "/account/Login", "/account/login/Login"];
      let loginPath = "";
      let loginHtml = "";
      let token = "";
      for (const candidate of loginPaths) {
        try {
          const response = await request(candidate);
          const html = await response.text();
          const nextToken = verificationToken(html);
          if (response.ok && nextToken && isProductionForm(html)) {
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
        throw new Error("PORTAL_FORM_UNAVAILABLE");
      }

      if (!isProductionForm(loginHtml)) throw Error("PORTAL_PRODUCTION_UNVERIFIED");
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

      credentialsSubmitted = true;
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
      if (loginResponse.status === 401 || loginResponse.status === 403 || loginResponse.status === 429) throw Error("PORTAL_LOGIN_REJECTED");
      if (loginResponse.status >= 400) throw Error("PORTAL_LOGIN_HTTP_ERROR");
      const location = text(loginResponse.headers.get("location"));

      const explicitPortalError = portalErrorText(loginResult);
      const redirectedToLogin =
        loginResponse.status >= 300 &&
        loginResponse.status < 400 &&
        /login/i.test(location);
      if (explicitPortalError && looksLikeLoginPage(loginResult)) {
        throw new Error(/ek güvenlik/i.test(explicitPortalError) ? "PORTAL_INTERACTIVE_SECURITY_REQUIRED" : "PORTAL_CREDENTIAL_REJECTED");
      }
      if (redirectedToLogin) {
        throw new Error("PORTAL_LOGIN_REDIRECT");
      }

      const companyPaths = [
        "/account/GetCompanyList",
        "/Account/GetCompanyList",
        "/account/login/GetCompanyList",
      ];
      let companies = companyOptionsFromHtml(loginResult);
      let companyRaw = "";
      const companyStatuses:number[]=[];
      const companyJsonCounts:number[]=[];
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
            companyStatuses.push(response.status);
            const raw = await response.text();
            companyRaw += ` ${raw}`;
            let payload: any = {};
            try {
              payload = raw ? JSON.parse(raw) : {};
            } catch {
              payload = {};
            }
            const rows = response.ok ? normalizeCompanies(payload) : [];
            companyJsonCounts.push(rows.length);
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
        if (message) throw new Error(/ek güvenlik/i.test(message) ? "PORTAL_INTERACTIVE_SECURITY_REQUIRED" : "PORTAL_CREDENTIAL_REJECTED");
        if (companyStatuses.some(n=>n===401||n===403||n===429)) throw Error("PORTAL_COMPANY_ACCESS_REJECTED");
        if (looksLikeLoginPage(loginResult)) throw new Error("PORTAL_LOGIN_FORM_RETURNED");
        throw new Error("PORTAL_COMPANY_LIST_EMPTY");
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

      if (!isProductionForm(selectionHtml)) throw Error("PORTAL_PRODUCTION_UNVERIFIED");
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
      if (selectionResponse.status === 401 || selectionResponse.status === 403 || selectionResponse.status === 429) throw Error("PORTAL_LOGIN_REJECTED");
      if (selectionResponse.status >= 400) throw Error("PORTAL_LOGIN_HTTP_ERROR");
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
        if (!verifyResponse.ok || /login/i.test(text(verifyResponse.headers.get("location"))) || looksLikeLoginPage(verifyText)) {
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
      const safe = text(error?.message) || "Portal isteği tamamlanamadı.";
      lastError = `${base.replace(/^https?:\/\//, "")}: ${safe}`;
      // Never silently retry a password against another İşNet host.
      if (credentialsSubmitted || /PORTAL_(INTERACTIVE_SECURITY|USER_CONFIRMATION|UNSAFE_TARGET)/.test(safe)) break;
    }
  }

  throw new Error(lastError || "İşNet portalına bağlanılamadı.");
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
  const u=new URL(path,base);
  if(!PORTAL_BASES.includes(base)||u.origin!==base||u.username||u.password)throw Error("PORTAL_UNSAFE_TARGET");
  return fetch(u.toString(), {
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


export async function portalList(session,kind,dir,from,to){
 if(!session?.companySelected || !/^\d+$/.test(session.companyId) || !session.cookie)throw Error("PORTAL_SELECTION_REQUIRED");
 const source=SOURCES.find(x=>x.kind===(kind==="despatch"?"dispatch":kind)&&x.direction===dir);
 if(!source)throw Error("INVALID_QUERY");
 const path=source.page(from), page=await portalRequest(session.base,session.cookie,path);
 if(!page.ok)throw Error("PORTAL_LIST_HTTP_ERROR");
 const html=await page.text(),token=verificationToken(html);
 if(!token||looksLikeLoginPage(html))throw Error("PORTAL_SESSION_EXPIRED");
 const form=new URLSearchParams({draw:"1",start:"0",length:"25","search[value]":"","search[regex]":"false",CompanyIdFilter:session.companyId,__RequestVerificationToken:token,IlkTarih:portalDate(from),SonTarih:portalDate(to)});
 const prefix=kind==="invoice"?"Fatura":"Irsaliye";
 form.set(prefix+"IlkTarihi",portalDate(from));form.set(prefix+"SonTarihi",portalDate(to));
 const response=await portalRequest(session.base,session.cookie,source.endpoint,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",Referer:session.base+path,"X-Requested-With":"XMLHttpRequest"},body:form.toString()});
 if(!response.ok)throw Error("PORTAL_LIST_HTTP_ERROR");
 let payload;try{payload=await response.json()}catch{throw Error("PORTAL_LIST_UNVERIFIED")}
 if(!Array.isArray(payload?.data))throw Error("PORTAL_LIST_UNVERIFIED");
 const seen=new Set();
 const rows=payload.data.slice(0,25).map(r=>normalizePortal(source,r)).filter(r=>/^\d{1,24}$/.test(r.sourceId)&&r.documentNo&&!seen.has(r.sourceId)&&seen.add(r.sourceId)).map(r=>({ettn:r.sourceId,number:r.documentNo.slice(0,100),date:r.dateText.slice(0,40),company:r.partnerName.slice(0,160),state:r.statusText.slice(0,80)}));
 if(payload.data.length&&!rows.length)throw Error("PORTAL_LIST_UNVERIFIED");
 return {rows,kind,direction:dir,from,to,providerCount:payload.data.length,firstPageOnly:true,readOnly:true};
}
export async function portalDownload(session,kind,dir,from,to,id,format){
 if(!/^\d{1,24}$/.test(id)||!["xml","pdf"].includes(format))throw Error("INVALID_DOCUMENT");
 const list=await portalList(session,kind,dir,from,to);
 if(!list.rows.some(r=>r.ettn===id))throw Error("DOCUMENT_NOT_IN_CURRENT_PAGE");
 const entity=kind==="invoice"?"Invoice":"Despatch";
 const path="/"+entity+"/Get"+entity+(format==="pdf"?"Pdf":"Xml")+"?InOrOut="+(dir==="incoming")+"&"+entity+"Id="+encodeURIComponent(id);
 const response=await portalRequest(session.base,session.cookie,path);
 if(!response.ok)throw Error("ISNET_FILE_HTTP_ERROR");
 if(Number(response.headers.get("content-length")||0)>20*1024*1024)throw Error("ISNET_FILE_TOO_LARGE");
 const bytes=await response.arrayBuffer();
 if(!bytes.byteLength||bytes.byteLength>20*1024*1024)throw Error("ISNET_FILE_SIZE_INVALID");
 const head=new TextDecoder().decode(bytes.slice(0,4096)).replace(/^\uFEFF/,"").trimStart();
 if(format==="pdf"){if(!head.startsWith("%PDF-"))throw Error("ISNET_NOT_A_REAL_PDF");}
 else {
  if(/<!DOCTYPE\b|<!ENTITY\b/i.test(head))throw Error("ISNET_NOT_A_UBL_XML");
  const root=/^(?:<\?xml\b[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[\w.-]+:)?(Invoice|DespatchAdvice)\b/i.exec(head)?.[1];
  if(!root)throw Error("ISNET_NOT_A_UBL_XML");
  if(root!==(kind==="invoice"?"Invoice":"DespatchAdvice"))throw Error("ISNET_XML_KIND_MISMATCH");
 }
 return {bytes,format};
}

// Public form connectivity only. No credentials, cookies, HTML, or identifiers returned.
export async function portalFormHealth(){
 return Promise.all(PORTAL_BASES.map(async base=>{
  const started=Date.now();
  try{
   const r=await fetch(base+"/Account/Login",{method:"GET",redirect:"manual",signal:AbortSignal.timeout(25000),headers:{Accept:"text/html","User-Agent":"Mozilla/5.0 KY-ERP-IsNet-Cloud/6.0"}});
   const html=await r.text();
   const jar=new Map<string,string>();mergeCookies(r,jar);
   return {host:new URL(base).hostname,status:r.status,form:looksLikeLoginPage(html),productionVerified:isProductionForm(html),csrfPresent:!!verificationToken(html),cookieCount:jar.size,companySearchPresent:/GetCompanyList/i.test(html),elapsedMs:Date.now()-started};
  }catch(e){return {host:new URL(base).hostname,status:null,reason:e?.name==="TimeoutError"||e?.name==="AbortError"?"TIMEOUT":"REQUEST_FAILED",elapsedMs:Date.now()-started}}
 }));
}
