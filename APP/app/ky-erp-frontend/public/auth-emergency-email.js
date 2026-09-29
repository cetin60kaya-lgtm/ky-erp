(() => {
  "use strict";

  const API_BASE = "https://api.kyerp.net/api";
  const TOKEN_KEY = "kyerp_auth_token";
  const USER_KEY = "kyerp_auth_user";
  const rawFetch = window.fetch.bind(window);
  let proof = null;
  let modal = null;
  let busy = false;

  function stageOf(payload) {
    return String(payload?.stage || "").trim().toUpperCase();
  }

  function captureProof(payload) {
    if (!payload || typeof payload !== "object") return;
    const stage = stageOf(payload);
    if (stage === "AUTHENTICATED" || stage === "CREDENTIALS") {
      proof = null;
      return;
    }
    if (payload.phoneApprovalId && payload.phoneApprovalToken) {
      proof = {
        type: "PHONE",
        phoneApprovalId: String(payload.phoneApprovalId),
        phoneApprovalToken: String(payload.phoneApprovalToken),
      };
      queueMicrotask(installFallbackPanel);
      return;
    }
    if (payload.challengeId && payload.challengeToken && [
      "MFA_REQUIRED", "MFA_LEGACY_REQUIRED", "MFA_SETUP",
    ].includes(stage)) {
      proof = {
        type: "CHALLENGE",
        challengeId: String(payload.challengeId),
        challengeToken: String(payload.challengeToken),
      };
      queueMicrotask(installFallbackPanel);
    }
  }

  window.fetch = async (...args) => {
    const response = await rawFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === "string" ? input : String(input?.url || "");
      if (url.includes("/api/auth/") && !url.includes("/api/auth/email-emergency/")) {
        response.clone().json().then(captureProof).catch(() => {});
      }
    } catch { /* transport observer never blocks auth */ }
    return response;
  };

  function jsonRequest(path, body) {
    return rawFetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body || {}),
      cache: "no-store",
      mode: "cors",
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        const error = new Error(payload?.error?.message || `İşlem tamamlanamadı (HTTP ${response.status}).`);
        error.code = payload?.error?.code || "";
        throw error;
      }
      return payload;
    });
  }

  function proofBody() {
    if (!proof) return null;
    return proof.type === "PHONE"
      ? { phoneApprovalId: proof.phoneApprovalId, phoneApprovalToken: proof.phoneApprovalToken }
      : { challengeId: proof.challengeId, challengeToken: proof.challengeToken };
  }

  function ensureStyles() {
    if (document.getElementById("ky-email-emergency-style")) return;
    const style = document.createElement("style");
    style.id = "ky-email-emergency-style";
    style.textContent = `
      .ky-email-emergency-panel{margin-top:14px;padding:14px;border:1px solid #dbe4ee;border-radius:14px;background:#f8fbff;text-align:left}
      .ky-email-emergency-panel strong{display:block;color:#163252;font-size:14px;margin-bottom:4px}
      .ky-email-emergency-panel span{display:block;color:#66788c;font-size:12px;line-height:1.45;margin-bottom:10px}
      .ky-email-emergency-btn{width:100%;border:1px solid #b8c9dc;background:#fff;color:#173b63;border-radius:11px;padding:12px 14px;font-weight:800;cursor:pointer}
      .ky-email-emergency-btn:disabled{opacity:.55;cursor:default}
      .ky-email-emergency-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(5,18,38,.58);display:grid;place-items:center;padding:20px}
      .ky-email-emergency-modal{width:min(440px,100%);background:#fff;border-radius:20px;padding:24px;box-shadow:0 28px 80px rgba(0,0,0,.28);font-family:inherit}
      .ky-email-emergency-modal h2{margin:0 0 8px;color:#10284d;font-size:22px}
      .ky-email-emergency-modal p{margin:0 0 16px;color:#65768a;line-height:1.5}
      .ky-email-emergency-modal input{width:100%;box-sizing:border-box;border:1px solid #cbd7e4;border-radius:12px;padding:14px 16px;font-size:24px;letter-spacing:.18em;text-align:center;font-weight:800;margin-bottom:12px}
      .ky-email-emergency-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .ky-email-emergency-actions button{border:0;border-radius:11px;padding:12px 10px;font-weight:800;cursor:pointer}
      .ky-email-emergency-verify{background:#1769e0;color:#fff}.ky-email-emergency-resend{background:#edf2f7;color:#34495e}
      .ky-email-emergency-close{width:100%;border:0;background:transparent;color:#65768a;padding:10px 0 0;font-weight:700;cursor:pointer}
      .ky-email-emergency-error{color:#b42318;background:#fff0ee;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:13px}
      .ky-email-emergency-note{font-size:11px;color:#7b8796;margin-top:12px;line-height:1.45}
    `;
    document.head.appendChild(style);
  }

  function eligibleLoginView() {
    const root = document.getElementById("root");
    if (!root || !proof) return null;
    const flow = root.querySelector(".auth-flow-block");
    if (!flow) return null;
    const text = String(flow.textContent || "");
    if (!/(KY ERP TELEFON ONAYI|GÜVENLİK POLİTİKASI|Yeni doğrulama kurulumu|Mevcut Authenticator kaydı)/i.test(text)) return null;
    return flow;
  }

  function installFallbackPanel() {
    const flow = eligibleLoginView();
    if (!flow || flow.querySelector(".ky-email-emergency-panel")) return;
    ensureStyles();
    const panel = document.createElement("div");
    panel.className = "ky-email-emergency-panel";
    panel.innerHTML = `<strong>Telefon kullanılamıyor mu?</strong><span>Hesabınıza kayıtlı doğrulanmış e-posta adresine tek kullanımlık doğrulama kodu gönderilir.</span><button type="button" class="ky-email-emergency-btn">E-posta ile Kurtarma</button>`;
    panel.querySelector("button")?.addEventListener("click", startEmergencyEmail);
    const backButton = [...flow.querySelectorAll("button")].find((button) => /Giriş ekranına dön|İptal ve geri dön/i.test(String(button.textContent || "")));
    if (backButton) flow.insertBefore(panel, backButton);
    else flow.appendChild(panel);
  }

  function closeModal() {
    modal?.remove();
    modal = null;
  }

  function showOtpModal(payload) {
    closeModal();
    ensureStyles();
    modal = document.createElement("div");
    modal.className = "ky-email-emergency-overlay";
    modal.innerHTML = `<div class="ky-email-emergency-modal" role="dialog" aria-modal="true"><h2>E-posta Doğrulama</h2><p><b>${String(payload.maskedDestination || "Hesap e-postası")}</b> adresine gönderilen 6 haneli doğrulama kodunu girin.</p><div class="ky-email-emergency-error" hidden></div><input inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="6 haneli doğrulama kodu"><div class="ky-email-emergency-actions"><button type="button" class="ky-email-emergency-resend">Yeni Kod Gönder</button><button type="button" class="ky-email-emergency-verify">Doğrula ve Giriş Yap</button></div><button type="button" class="ky-email-emergency-close">İptal</button><div class="ky-email-emergency-note">Kod 10 dakika ve tek kullanım içindir. 5 hatalı denemede 30 dakika kilitlenir. E-posta kurtarması yalnız bu giriş için kullanılır; mevcut güvenilir telefon kaydınız değiştirilmez.</div></div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector("input");
    input?.focus();
    input?.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); });
    modal.querySelector(".ky-email-emergency-close")?.addEventListener("click", closeModal);
    modal.querySelector(".ky-email-emergency-resend")?.addEventListener("click", startEmergencyEmail);
    modal.querySelector(".ky-email-emergency-verify")?.addEventListener("click", () => verifyEmergencyEmail(payload));
  }

  function setModalError(message) {
    const box = modal?.querySelector(".ky-email-emergency-error");
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
  }

  async function startEmergencyEmail(event) {
    if (busy) return;
    const button = event?.currentTarget;
    const body = proofBody();
    if (!body) return;
    busy = true;
    if (button) { button.disabled = true; button.textContent = "E-posta kodu gönderiliyor..."; }
    try {
      const payload = await jsonRequest("/auth/email-emergency/start", body);
      showOtpModal(payload);
    } catch (error) {
      alert(error?.message || "E-posta ile kurtarma başlatılamadı.");
    } finally {
      busy = false;
      if (button?.isConnected) { button.disabled = false; button.textContent = button.classList.contains("ky-email-emergency-resend") ? "Yeni Kod Gönder" : "E-posta ile Kurtarma"; }
    }
  }

  async function verifyEmergencyEmail(startPayload) {
    if (busy || !modal) return;
    const input = modal.querySelector("input");
    const code = String(input?.value || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) { setModalError("E-postadaki 6 haneli kodu girin."); return; }
    const button = modal.querySelector(".ky-email-emergency-verify");
    busy = true;
    if (button) { button.disabled = true; button.textContent = "Doğrulanıyor..."; }
    try {
      const verified = await jsonRequest("/auth/email-emergency/verify", {
        emailEmergencyId: startPayload.emailEmergencyId,
        emailEmergencyToken: startPayload.emailEmergencyToken,
        otp: code,
      });
      const session = await jsonRequest(`/auth/approval/${encodeURIComponent(verified.approvalId)}/status`, {
        approvalToken: verified.approvalToken,
      });
      if (stageOf(session) !== "AUTHENTICATED" || !session.token || !session.user) throw new Error("E-posta doğrulandı ancak güvenli oturum tamamlanamadı. Yeniden giriş yapın.");
      const storedUser = { ...session.user, permissions: session.user?.permissions || session.permissions || [] };
      sessionStorage.setItem(TOKEN_KEY, String(session.token));
      sessionStorage.setItem(USER_KEY, JSON.stringify(storedUser));
      proof = null;
      if (button) button.textContent = "Giriş hazır";
      window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      setModalError(error?.message || "E-posta doğrulaması tamamlanamadı.");
      if (button) { button.disabled = false; button.textContent = "Doğrula ve Giriş Yap"; }
    } finally {
      busy = false;
    }
  }

  const observer = new MutationObserver(() => installFallbackPanel());
  const startObserver = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    installFallbackPanel();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();
})();
