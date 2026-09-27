(() => {
  "use strict";

  const API_ORIGIN = "https://api.kyerp.net";
  const API_BASE = `${API_ORIGIN}/api`;
  const TOKEN_KEY = "kyerp_auth_token";
  const USER_KEY = "kyerp_auth_user";
  const upstreamFetch = window.fetch.bind(window);
  let proof = null;
  let providers = null;
  let providerLoad = null;
  let completing = false;

  function stageOf(payload) { return String(payload?.stage || "").trim().toUpperCase(); }
  function captureProof(payload) {
    if (!payload || typeof payload !== "object") return;
    const stage = stageOf(payload);
    if (stage === "AUTHENTICATED" || stage === "CREDENTIALS") { proof = null; removePanel(); return; }
    if (payload.phoneApprovalId && payload.phoneApprovalToken) {
      proof = { type: "PHONE", phoneApprovalId: String(payload.phoneApprovalId), phoneApprovalToken: String(payload.phoneApprovalToken) };
      queueMicrotask(installPanel); return;
    }
    if (payload.challengeId && payload.challengeToken && ["MFA_REQUIRED", "MFA_LEGACY_REQUIRED", "MFA_SETUP"].includes(stage)) {
      proof = { type: "CHALLENGE", challengeId: String(payload.challengeId), challengeToken: String(payload.challengeToken) };
      queueMicrotask(installPanel);
    }
  }

  window.fetch = async (...args) => {
    const response = await upstreamFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === "string" ? input : String(input?.url || "");
      if (url.includes("/api/auth/") && !url.includes("/api/auth/external/")) response.clone().json().then(captureProof).catch(() => {});
    } catch {}
    return response;
  };

  function proofBody() {
    if (!proof) return null;
    return proof.type === "PHONE"
      ? { phoneApprovalId: proof.phoneApprovalId, phoneApprovalToken: proof.phoneApprovalToken }
      : { challengeId: proof.challengeId, challengeToken: proof.challengeToken };
  }

  async function jsonRequest(path, body) {
    const response = await upstreamFetch(`${API_BASE}${path}`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body || {}), cache: "no-store", mode: "cors",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error?.message || `İşlem tamamlanamadı (HTTP ${response.status}).`);
    return payload;
  }

  async function loadProviders() {
    if (providers) return providers;
    if (providerLoad) return providerLoad;
    providerLoad = upstreamFetch(`${API_BASE}/auth/external/providers`, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", mode: "cors" })
      .then(async (response) => { const payload = await response.json().catch(() => null); providers = response.ok && payload?.ok ? (payload.providers || {}) : {}; return providers; })
      .catch(() => { providers = {}; return providers; })
      .finally(() => { providerLoad = null; });
    return providerLoad;
  }

  function ensureStyles() {
    if (document.getElementById("ky-external-recovery-style")) return;
    const style = document.createElement("style");
    style.id = "ky-external-recovery-style";
    style.textContent = `
      .ky-external-recovery-panel{margin-top:10px;padding:12px;border:1px solid #dbe4ee;border-radius:14px;background:#fff;text-align:left}
      .ky-external-recovery-panel strong{display:block;color:#163252;font-size:13px;margin-bottom:3px}
      .ky-external-recovery-panel span{display:block;color:#66788c;font-size:11px;line-height:1.4;margin-bottom:9px}
      .ky-external-recovery-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ky-external-provider-btn{min-height:42px;border:1px solid #c8d5e4;background:#fff;border-radius:10px;font-weight:800;color:#173b63;cursor:pointer;padding:9px 8px}
      .ky-external-provider-btn:hover{background:#f7faff;border-color:#9eb5cf}.ky-external-provider-btn:disabled{opacity:.55;cursor:default}
      .ky-external-provider-status{margin-top:8px!important;margin-bottom:0!important;padding:7px 9px;border-radius:9px;background:#f3f7fb;color:#536579!important;font-size:11px!important}
      .ky-external-provider-status[data-error="1"]{background:#fff0ee;color:#b42318!important}
      @media(max-width:520px){.ky-external-recovery-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function eligibleLoginView() {
    const root = document.getElementById("root"); if (!root || !proof) return null;
    const flow = root.querySelector(".auth-flow-block"); if (!flow) return null;
    if (!/(KY ERP TELEFON ONAYI|GÜVENLİK POLİTİKASI|Yeni doğrulama kurulumu|Mevcut Authenticator kaydı)/i.test(String(flow.textContent || ""))) return null;
    return flow;
  }
  function removePanel() { document.querySelector(".ky-external-recovery-panel")?.remove(); }
  function setStatus(message, error = false) {
    const box = document.querySelector(".ky-external-provider-status"); if (!box) return;
    box.hidden = !message; box.dataset.error = error ? "1" : "0"; box.textContent = message || "";
  }

  async function installPanel() {
    const flow = eligibleLoginView(); if (!flow || flow.querySelector(".ky-external-recovery-panel")) return;
    const available = await loadProviders(); if (!proof || (!available.google && !available.microsoft)) return;
    ensureStyles();
    const panel = document.createElement("div"); panel.className = "ky-external-recovery-panel";
    panel.innerHTML = `
      <strong>Hesap ile doğrula</strong>
      <span>Telefon kullanılamıyorsa KY ERP hesabınızdaki doğrulanmış e-posta ile aynı Google veya Microsoft hesabını kullanabilirsiniz.</span>
      <div class="ky-external-recovery-actions">
        ${available.google ? '<button type="button" class="ky-external-provider-btn" data-provider="google">Google ile Doğrula</button>' : ""}
        ${available.microsoft ? '<button type="button" class="ky-external-provider-btn" data-provider="microsoft">Microsoft ile Doğrula</button>' : ""}
      </div><span class="ky-external-provider-status" hidden></span>`;
    panel.querySelectorAll(".ky-external-provider-btn").forEach((button) => button.addEventListener("click", () => startProvider(String(button.dataset.provider || ""), button)));
    const emailPanel = flow.querySelector(".ky-email-emergency-panel");
    if (emailPanel) flow.insertBefore(panel, emailPanel);
    else { const backButton = [...flow.querySelectorAll("button")].find((button) => /Giriş ekranına dön|İptal ve geri dön/i.test(String(button.textContent || ""))); if (backButton) flow.insertBefore(panel, backButton); else flow.appendChild(panel); }
  }

  async function startProvider(provider, button) {
    if (!["google", "microsoft"].includes(provider) || !proof || button.disabled) return;
    const popup = window.open("about:blank", "kyerp-external-recovery", "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes");
    if (!popup) { setStatus("Tarayıcı doğrulama penceresini engelledi. Açılır pencereye izin verip tekrar deneyin.", true); return; }
    try { popup.document.title = "KY ERP Doğrulama"; popup.document.body.innerHTML = "<p style='font-family:Arial;padding:24px'>Güvenli doğrulama hazırlanıyor...</p>"; } catch {}
    const original = button.textContent; button.disabled = true; button.textContent = "Hazırlanıyor..."; setStatus("");
    try {
      const body = proofBody(); if (!body) throw new Error("Giriş güvenlik isteği bulunamadı. Yeniden giriş yapın.");
      const payload = await jsonRequest(`/auth/external/${provider}/start`, body); if (!payload.authorizationUrl) throw new Error("Kimlik sağlayıcı bağlantısı hazırlanamadı.");
      popup.location.replace(payload.authorizationUrl);
    } catch (error) { try { popup.close(); } catch {} setStatus(error?.message || "Hesap doğrulaması başlatılamadı.", true); }
    finally { button.disabled = false; button.textContent = original; }
  }

  async function completeSession(data) {
    if (completing || !data?.approvalId || !data?.approvalToken) return;
    completing = true; setStatus("Hesap doğrulandı. KY ERP oturumu hazırlanıyor...");
    try {
      const session = await jsonRequest(`/auth/approval/${encodeURIComponent(data.approvalId)}/status`, { approvalToken: data.approvalToken });
      if (stageOf(session) !== "AUTHENTICATED" || !session.token || !session.user) throw new Error("Hesap doğrulandı ancak güvenli oturum tamamlanamadı. Yeniden giriş yapın.");
      const storedUser = { ...session.user, permissions: session.user?.permissions || session.permissions || [] };
      sessionStorage.setItem(TOKEN_KEY, String(session.token)); sessionStorage.setItem(USER_KEY, JSON.stringify(storedUser));
      proof = null; setStatus("Giriş hazır."); window.setTimeout(() => window.location.reload(), 200);
    } catch (error) { setStatus(error?.message || "Güvenli oturum tamamlanamadı.", true); }
    finally { completing = false; }
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== API_ORIGIN) return;
    const data = event.data; if (!data || data.type !== "KYERP_EXTERNAL_RECOVERY") return;
    if (!data.ok) { setStatus(data.error || "Google/Microsoft doğrulaması tamamlanamadı.", true); return; }
    completeSession(data);
  });

  const observer = new MutationObserver(() => installPanel());
  const startObserver = () => { if (document.body) observer.observe(document.body, { childList: true, subtree: true }); installPanel(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true }); else startObserver();
})();
