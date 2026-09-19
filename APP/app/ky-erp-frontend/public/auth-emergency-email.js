(() => {
  "use strict";

  const API_BASE = "https://api.kyerp.net/api";
  const TOKEN_KEY = "kyerp_auth_token";
  const USER_KEY = "kyerp_auth_user";
  const rawFetch = window.fetch.bind(window);
  let proof = null;
  let modal = null;
  let busy = false;
  let recoveryState = null;

  function stageOf(payload) {
    return String(payload?.stage || "").trim().toUpperCase();
  }

  function captureProof(payload) {
    if (!payload || typeof payload !== "object") return;
    const stage = stageOf(payload);
    if (["AUTHENTICATED", "CREDENTIALS"].includes(stage)) {
      proof = null;
      return;
    }
    if (payload.phoneApprovalId && payload.phoneApprovalToken) {
      proof = {
        type: "PHONE",
        phoneApprovalId: String(payload.phoneApprovalId),
        phoneApprovalToken: String(payload.phoneApprovalToken),
      };
      queueMicrotask(installRecoveryPanel);
      return;
    }
    if (payload.challengeId && payload.challengeToken && ["MFA_REQUIRED", "MFA_LEGACY_REQUIRED", "MFA_SETUP"].includes(stage)) {
      proof = {
        type: "CHALLENGE",
        challengeId: String(payload.challengeId),
        challengeToken: String(payload.challengeToken),
      };
      queueMicrotask(installRecoveryPanel);
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
    } catch { /* observer never blocks auth */ }
    return response;
  };

  async function jsonRequest(path, body) {
    const response = await rawFetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body || {}),
      cache: "no-store",
      mode: "cors",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.error?.message || `İşlem tamamlanamadı (HTTP ${response.status}).`);
      error.code = payload?.error?.code || "";
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function proofBody() {
    if (!proof) return null;
    return proof.type === "PHONE"
      ? { phoneApprovalId: proof.phoneApprovalId, phoneApprovalToken: proof.phoneApprovalToken }
      : { challengeId: proof.challengeId, challengeToken: proof.challengeToken };
  }

  function ensureStyles() {
    if (document.getElementById("ky-email-recovery-style")) return;
    const style = document.createElement("style");
    style.id = "ky-email-recovery-style";
    style.textContent = `
      .ky-email-recovery-panel{margin-top:14px;padding:16px;border:1px solid #d7e2ee;border-radius:14px;background:#f8fbff;text-align:left}
      .ky-email-recovery-panel strong{display:block;color:#163252;font-size:14px;margin-bottom:5px}
      .ky-email-recovery-panel span{display:block;color:#66788c;font-size:12px;line-height:1.5;margin-bottom:11px}
      .ky-email-recovery-btn{width:100%;border:1px solid #b8c9dc;background:#fff;color:#173b63;border-radius:11px;padding:12px 14px;font-weight:800;cursor:pointer}
      .ky-email-recovery-btn:disabled{opacity:.55;cursor:default}
      .ky-email-recovery-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(5,18,38,.58);display:grid;place-items:center;padding:20px}
      .ky-email-recovery-modal{width:min(460px,100%);background:#fff;border-radius:20px;padding:24px;box-shadow:0 28px 80px rgba(0,0,0,.28);font-family:inherit}
      .ky-email-recovery-kicker{display:block;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.08em;margin-bottom:7px}
      .ky-email-recovery-modal h2{margin:0 0 8px;color:#10284d;font-size:22px}
      .ky-email-recovery-modal p{margin:0 0 16px;color:#65768a;line-height:1.5}
      .ky-email-recovery-modal input{width:100%;box-sizing:border-box;border:1px solid #cbd7e4;border-radius:12px;padding:14px 16px;font-size:24px;letter-spacing:.18em;text-align:center;font-weight:800;margin-bottom:12px}
      .ky-email-recovery-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .ky-email-recovery-actions button{border:0;border-radius:11px;padding:12px 10px;font-weight:800;cursor:pointer}
      .ky-email-recovery-primary{background:#1769e0;color:#fff}.ky-email-recovery-secondary{background:#edf2f7;color:#34495e}
      .ky-email-recovery-resend{width:100%;margin-top:10px;border:1px solid #d7e2ee;background:#fff;color:#315273;border-radius:11px;padding:11px;font-weight:800;cursor:pointer}
      .ky-email-recovery-error{color:#b42318;background:#fff0ee;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:13px}
      .ky-email-recovery-note{font-size:11px;color:#7b8796;margin-top:12px;line-height:1.45}
    `;
    document.head.appendChild(style);
  }

  function eligibleLoginView() {
    const root = document.getElementById("root");
    if (!root || !proof) return null;
    const flows = [...root.querySelectorAll(".auth-flow-block")];
    return flows.find((flow) => /(KY ERP TELEFON ONAYI|GÜVENLİK POLİTİKASI|Yeni doğrulama kurulumu|Mevcut Authenticator kaydı)/i.test(String(flow.textContent || ""))) || null;
  }

  function installRecoveryPanel() {
    const flow = eligibleLoginView();
    if (!flow || flow.querySelector(".ky-email-recovery-panel")) return;
    ensureStyles();
    const panel = document.createElement("div");
    panel.className = "ky-email-recovery-panel";
    panel.innerHTML = `<strong>Kurtarma Seçenekleri</strong><span>Telefonunuza veya Authenticator uygulamanıza erişemiyorsanız, hesabınıza kayıtlı doğrulanmış e-posta adresi ile giriş doğrulamasını tamamlayabilirsiniz.</span><button type="button" class="ky-email-recovery-btn">E-posta Doğrulama</button>`;
    panel.querySelector("button")?.addEventListener("click", startEmailRecovery);
    const backButton = [...flow.querySelectorAll("button")].find((button) => /Giriş ekranına dön|İptal ve geri dön/i.test(String(button.textContent || "")));
    if (backButton) flow.insertBefore(panel, backButton);
    else flow.appendChild(panel);
  }

  function closeModal() {
    modal?.remove();
    modal = null;
  }

  function setModalError(message) {
    const box = modal?.querySelector(".ky-email-recovery-error");
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || "";
  }

  function showOtpModal(payload) {
    recoveryState = payload;
    closeModal();
    ensureStyles();
    modal = document.createElement("div");
    modal.className = "ky-email-recovery-overlay";
    modal.innerHTML = `<div class="ky-email-recovery-modal" role="dialog" aria-modal="true" aria-labelledby="ky-email-recovery-title"><span class="ky-email-recovery-kicker">KURTARMA SEÇENEKLERİ</span><h2 id="ky-email-recovery-title">E-posta Doğrulama</h2><p><b>${String(payload.maskedDestination || "Hesap e-postası")}</b> adresine gönderilen 6 haneli doğrulama kodunu girin.</p><div class="ky-email-recovery-error" hidden></div><input inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="E-posta doğrulama kodu"><div class="ky-email-recovery-actions"><button type="button" class="ky-email-recovery-secondary">İptal</button><button type="button" class="ky-email-recovery-primary">Doğrula ve Giriş Yap</button></div><button type="button" class="ky-email-recovery-resend">Yeni Kod Gönder</button><div class="ky-email-recovery-note">Kod 10 dakika geçerlidir ve tek kullanımlıktır. Hatalı denemeler ve kod gönderimleri güvenlik amacıyla sınırlandırılır.</div></div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector("input");
    input?.focus();
    input?.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 6); setModalError(""); });
    input?.addEventListener("keydown", (event) => { if (event.key === "Enter") verifyEmailRecovery(); });
    modal.querySelector(".ky-email-recovery-secondary")?.addEventListener("click", closeModal);
    modal.querySelector(".ky-email-recovery-primary")?.addEventListener("click", verifyEmailRecovery);
    modal.querySelector(".ky-email-recovery-resend")?.addEventListener("click", resendEmailRecovery);
  }

  async function startEmailRecovery(event) {
    if (busy) return;
    const button = event?.currentTarget;
    const body = proofBody();
    if (!body) return;
    busy = true;
    if (button) { button.disabled = true; button.textContent = "Kod gönderiliyor..."; }
    try {
      const payload = await jsonRequest("/auth/email-emergency/start", body);
      showOtpModal(payload);
    } catch (error) {
      const panel = button?.closest(".ky-email-recovery-panel");
      if (panel) {
        let box = panel.querySelector(".ky-email-recovery-error");
        if (!box) { box = document.createElement("div"); box.className = "ky-email-recovery-error"; panel.insertBefore(box, button); }
        box.textContent = error?.message || "E-posta doğrulaması başlatılamadı.";
      }
    } finally {
      busy = false;
      if (button?.isConnected) { button.disabled = false; button.textContent = "E-posta Doğrulama"; }
    }
  }

  async function resendEmailRecovery() {
    if (busy || !modal) return;
    const body = proofBody();
    if (!body) return;
    const button = modal.querySelector(".ky-email-recovery-resend");
    busy = true;
    setModalError("");
    if (button) { button.disabled = true; button.textContent = "Kod gönderiliyor..."; }
    try {
      const payload = await jsonRequest("/auth/email-emergency/start", body);
      showOtpModal(payload);
    } catch (error) {
      setModalError(error?.message || "Yeni kod gönderilemedi.");
      if (button?.isConnected) { button.disabled = false; button.textContent = "Yeni Kod Gönder"; }
    } finally {
      busy = false;
    }
  }

  async function waitForSession(verified) {
    const deadline = Date.now() + 15000;
    let last = null;
    while (Date.now() < deadline) {
      last = await jsonRequest(`/auth/approval/${encodeURIComponent(verified.approvalId)}/status`, { approvalToken: verified.approvalToken });
      if (stageOf(last) === "AUTHENTICATED" && last.token && last.user) return last;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    return last;
  }

  async function verifyEmailRecovery() {
    if (busy || !modal || !recoveryState) return;
    const input = modal.querySelector("input");
    const code = String(input?.value || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) { setModalError("E-postadaki 6 haneli doğrulama kodunu girin."); return; }
    const button = modal.querySelector(".ky-email-recovery-primary");
    busy = true;
    setModalError("");
    if (button) { button.disabled = true; button.textContent = "Doğrulanıyor..."; }
    try {
      const verified = await jsonRequest("/auth/email-emergency/verify", {
        emailEmergencyId: recoveryState.emailEmergencyId,
        emailEmergencyToken: recoveryState.emailEmergencyToken,
        otp: code,
      });
      const session = await waitForSession(verified);
      if (stageOf(session) !== "AUTHENTICATED" || !session?.token || !session?.user) throw new Error("E-posta doğrulandı ancak güvenli oturum tamamlanamadı. Yeniden giriş yapın.");
      const storedUser = { ...session.user, permissions: session.user?.permissions || session.permissions || [] };
      sessionStorage.setItem(TOKEN_KEY, String(session.token));
      sessionStorage.setItem(USER_KEY, JSON.stringify(storedUser));
      proof = null;
      recoveryState = null;
      if (button) button.textContent = "Giriş hazır";
      window.setTimeout(() => window.location.reload(), 180);
    } catch (error) {
      setModalError(error?.message || "E-posta doğrulaması tamamlanamadı.");
      if (button) { button.disabled = false; button.textContent = "Doğrula ve Giriş Yap"; }
    } finally {
      busy = false;
    }
  }

  const observer = new MutationObserver(installRecoveryPanel);
  const startObserver = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    installRecoveryPanel();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  else startObserver();
})();
