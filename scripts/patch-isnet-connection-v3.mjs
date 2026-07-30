import fs from "node:fs";

const servicePath = "APP/app/ky-erp-backend/src/muhasebe/isnet-connection.service.ts";
const pagePath = "APP/app/ky-erp-frontend/src/pages/modules/IsnetPage.jsx";
let service = fs.readFileSync(servicePath, "utf8").replace(/\r\n/g, "\n");
let page = fs.readFileSync(pagePath, "utf8").replace(/\r\n/g, "\n");

const portalRegex = /  private async loginPortal\(username: string, password: string\) \{[\s\S]*?\n  \}\n\n  private async login\(/m;
const portalReplacement = `  private async loginPortal(username: string, password: string) {
    const jar = new Map<string, string>();
    const request = async (url: string, init: RequestInit = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      try {
        const response = await fetch(
          url.startsWith("http") ? url : this.portalBase + url,
          {
            ...init,
            headers: {
              Accept: "text/html,application/xhtml+xml,application/json",
              "User-Agent": "Mozilla/5.0 KY-ERP-IsNet-Connector/3.0",
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

    const loginPaths = [
      "/account/login/Login",
      "/Account/Login",
      "/account/login",
    ];
    let loginPath = "";
    let loginHtml = "";
    let loginToken = "";
    for (const candidate of loginPaths) {
      try {
        const response = await request(candidate);
        const html = await response.text();
        const token = this.verificationToken(html);
        if (response.ok && token) {
          loginPath = candidate;
          loginHtml = html;
          loginToken = token;
          break;
        }
      } catch {
        // Bir sonraki güncel/uyumlu portal yolu denenir.
      }
    }
    if (!loginPath || !loginToken) {
      throw new Error(
        "İşNet portal giriş sayfası veya doğrulama anahtarı alınamadı.",
      );
    }

    const inputNames = [...loginHtml.matchAll(/<input[^>]*name=["']([^"']+)["']/gi)]
      .map((match) => clean(match[1]))
      .filter(Boolean);
    const usernameField =
      inputNames.find((name) =>
        /(identificationnumber|vkntckn|tckn|username|user_name)/i.test(name),
      ) || "VknTckn";
    const passwordField =
      inputNames.find((name) => /(password|sifre|şifre)/i.test(name)) ||
      "Password";
    const loginBody = new URLSearchParams();
    loginBody.set(usernameField, username);
    loginBody.set(passwordField, password);
    loginBody.set("RememberMe", "false");
    loginBody.set("__RequestVerificationToken", loginToken);

    const loginResponse = await request(loginPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: this.portalBase,
        Referer: this.portalBase + loginPath,
      },
      body: loginBody.toString(),
    });
    const loginResult = await loginResponse.text();

    const companyPaths = [
      "/account/GetCompanyList",
      "/Account/GetCompanyList",
      "/account/login/GetCompanyList",
    ];
    let companyRaw = "";
    for (const candidate of companyPaths) {
      try {
        const companyResponse = await request(candidate, {
          method: "POST",
          headers: {
            Accept: "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Origin: this.portalBase,
            Referer: this.portalBase + loginPath,
            "X-Requested-With": "XMLHttpRequest",
          },
          body: new URLSearchParams({ q: "" }).toString(),
        });
        const raw = await companyResponse.text();
        companyRaw = companyRaw + " " + raw;
        let payload: any = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          payload = {};
        }
        const companies = this.normalizeCompanies(payload);
        if (companies.length) return { companies, expiresOn: null };
      } catch {
        // Eski veya yeni firma liste yolu sırayla denenir.
      }
    }

    const portalMessage = this.portalErrorText(loginResult + " " + companyRaw);
    if (portalMessage) throw new BadRequestException(portalMessage);
    const location = clean(loginResponse.headers.get("location"));
    if (
      loginResponse.status >= 300 &&
      loginResponse.status < 400 &&
      location &&
      !location.toLocaleLowerCase("tr-TR").includes("login")
    ) {
      throw new Error(
        "Portal girişi doğrulandı ancak yetkili firma listesi alınamadı.",
      );
    }
    throw new BadRequestException(
      "İşNet kullanıcı/TCKN veya şifre bilgisini kabul etmedi.",
    );
  }

  private async login(`;
if (!portalRegex.test(service)) throw new Error("İşNet portal login metodu bulunamadı");
service = service.replace(portalRegex, portalReplacement);

const apiErrorOld = `      const errorMessage = clean(
        payload?.ErrorMessage ?? payload?.errorMessage ?? payload?.Message,
      );`;
const apiErrorNew = `      const errorMessage = clean(
        payload?.ErrorMessage ??
          payload?.errorMessage ??
          payload?.Message ??
          payload?.message ??
          payload?.Error?.Message ??
          payload?.error?.message,
      );`;
if (service.includes(apiErrorOld)) service = service.replace(apiErrorOld, apiErrorNew);

const stateOld = `    companies: [],
    connectionMode: "",
  });`;
const stateNew = `    companies: [],
    connectionMode: "",
    diagnostics: null,
  });`;
if (page.includes(stateOld)) page = page.replace(stateOld, stateNew);

const settingsStateOld = `      connectionMode: settings.connectionMode || current.connectionMode,
    }));`;
const settingsStateNew = `      connectionMode: settings.connectionMode || current.connectionMode,
      diagnostics: settings.diagnostics || current.diagnostics || null,
    }));`;
if (page.includes(settingsStateOld)) page = page.replace(settingsStateOld, settingsStateNew);

const testStateOld = `        connectionMode: result.connectionMode || "",
        companyId: result.companies?.some(`;
const testStateNew = `        connectionMode: result.connectionMode || "",
        diagnostics: result.diagnostics || null,
        companyId: result.companies?.some(`;
if (page.includes(testStateOld)) page = page.replace(testStateOld, testStateNew);

const summaryAnchor = `            </div>
            <div className="isnet-connection-form">`;
const summaryNew = `            </div>
            {connectionForm.diagnostics ? (
              <div className="isnet-status-list" style={{ marginBottom: 12 }}>
                <div>
                  <span>Resmî İşNet API</span>
                  <Badge tone={connectionForm.diagnostics.api === "Bağlandı" ? "green" : "warning"}>
                    {connectionForm.diagnostics.api || "Denenmedi"}
                  </Badge>
                </div>
                <div>
                  <span>NetteFatura portalı</span>
                  <Badge tone={connectionForm.diagnostics.portal === "Bağlandı" ? "green" : "neutral"}>
                    {connectionForm.diagnostics.portal || "Denenmedi"}
                  </Badge>
                </div>
              </div>
            ) : null}
            <div className="isnet-connection-form">`;
if (!page.includes("Resmî İşNet API")) {
  const settingsIndex = page.indexOf('{activeTab === "ayarlar"');
  const anchorIndex = page.indexOf(summaryAnchor, settingsIndex);
  if (settingsIndex < 0 || anchorIndex < 0) throw new Error("İşNet ayar summary anchor bulunamadı");
  page = `${page.slice(0, anchorIndex)}${page.slice(anchorIndex).replace(summaryAnchor, summaryNew)}`;
}

fs.writeFileSync(servicePath, service, "utf8");
fs.writeFileSync(pagePath, page, "utf8");
console.log("İşNet API/portal bağlantı v3 yaması uygulandı.");
