import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

const PROVIDER_LABELS = {
  GOOGLE: "Google Authenticator",
  MICROSOFT: "Microsoft Authenticator",
};

const PROVIDER_SHORT = {
  GOOGLE: "G",
  MICROSOFT: "M",
};

function normalizeIdentity(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function normalizeProvider(value) {
  const provider = String(value || "").toUpperCase();
  return provider === "GOOGLE" || provider === "MICROSOFT" ? provider : "";
}

function compatibleOtpUri(value) {
  const raw = String(value || "").trim();
  const prefix = "otpauth://totp/";
  if (!raw.toLowerCase().startsWith(prefix)) return raw;
  try {
    const remainder = raw.slice(prefix.length);
    const questionIndex = remainder.indexOf("?");
    const encodedLabel = questionIndex >= 0 ? remainder.slice(0, questionIndex) : remainder;
    const query = questionIndex >= 0 ? remainder.slice(questionIndex + 1) : "";
    const decodedLabel = decodeURIComponent(encodedLabel);
    const separatorIndex = decodedLabel.indexOf(":");
    if (separatorIndex < 0) return raw;
    const issuer = decodedLabel.slice(0, separatorIndex).trim();
    const account = decodedLabel.slice(separatorIndex + 1).trim();
    if (!issuer || !account) return raw;
    return `${prefix}${encodeURIComponent(issuer)}:${encodeURIComponent(account)}${query ? `?${query}` : ""}`;
  } catch {
    return raw;
  }
}

function StepRail({ stage }) {
  const securityStage = [
    "MFA_REQUIRED",
    "MFA_LEGACY_REQUIRED",
    "MFA_SETUP",
    "PHONE_APPROVAL_PENDING",
    "OWNER_RECOVERY_VERIFY",
  ].includes(stage);
  const sessionStage = ["APPROVAL_PENDING", "AUTHENTICATED", "RECOVERY_COMPLETE"].includes(stage);
  return (
    <div className="auth-steps" aria-label="Giriş adımları">
      <div className={`auth-step${stage === "CREDENTIALS" ? " active" : " done"}`}>
        <span>1</span><small>Hesap</small>
      </div>
      <div className={`auth-step${securityStage ? " active" : sessionStage ? " done" : ""}`}>
        <span>2</span><small>Güvenlik</small>
      </div>
      <div className={`auth-step${sessionStage ? " active" : ""}`}>
        <span>3</span><small>Oturum</small>
      </div>
    </div>
  );
}

function ProviderCard({ provider, selected, verified, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`provider-card${selected ? " selected" : ""}${verified ? " verified" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={`provider-mark provider-${provider.toLowerCase()}`}>{PROVIDER_SHORT[provider]}</span>
      <span className="provider-copy">
        <strong>{PROVIDER_LABELS[provider]}</strong>
        <small>{verified ? "Doğrulandı" : selected ? "Kod bekleniyor" : "Seç ve doğrula"}</small>
      </span>
      <span className="provider-state">{verified ? "✓" : "›"}</span>
    </button>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return <div className="auth-error" role="alert" aria-live="polite">{message}</div>;
}

let turnstileScriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser gerekli."));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kyerp-turnstile="1"]');
    const script = existing || document.createElement("script");
    const onReady = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile yüklenemedi."));
    const onError = () => reject(new Error("Turnstile güvenlik bileşeni yüklenemedi."));
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.kyerpTurnstile = "1";
      document.head.appendChild(script);
    }
  });
  return turnstileScriptPromise;
}

export default function LoginPage() {
  const {
    getTurnstileConfig,
    login,
    verifyMfa,
    startOwnerRecovery,
    verifyOwnerRecovery,
    checkApproval,
    checkPhoneApproval,
    resendPhoneApproval,
    useAuthenticatorFallback,
  } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("GOOGLE");
  const [resetProvider, setResetProvider] = useState("");
  const [flow, setFlow] = useState({ stage: "CREDENTIALS" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneStatusMessage, setPhoneStatusMessage] = useState("");
  const [qrError, setQrError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryAnswers, setRecoveryAnswers] = useState(["", ""]);
  const [turnstileConfig, setTurnstileConfig] = useState({ enabled: false, siteKey: "", loaded: false, failed: false });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const qrRef = useRef(null);
  const phoneApprovalCheckRef = useRef({ busy: false, settled: false, id: "" });
  const turnstileRef = useRef(null);
  const turnstileWidgetRef = useRef(null);
  const otpUri = useMemo(() => compatibleOtpUri(flow.otpauthUri), [flow.otpauthUri]);

  useEffect(() => {
    document.title = "KY ERP | Güvenli Giriş";
    if (window.location.pathname !== "/") {
      window.history.replaceState({}, "", `/${window.location.search}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTurnstileConfig()
      .then((response) => {
        if (cancelled) return;
        setTurnstileConfig({
          enabled: Boolean(response?.enabled),
          siteKey: String(response?.siteKey || ""),
          loaded: true,
          failed: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTurnstileConfig({ enabled: true, siteKey: "", loaded: true, failed: true });
        setTurnstileError("Güvenlik doğrulama ayarı alınamadı. Güvenli giriş için sayfayı yenileyip tekrar deneyin.");
      });
    return () => { cancelled = true; };
  }, [getTurnstileConfig]);

  useEffect(() => {
    if (flow.stage !== "CREDENTIALS" || !turnstileConfig.loaded || !turnstileConfig.enabled || !turnstileConfig.siteKey) return undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !turnstileRef.current || turnstileWidgetRef.current !== null) return;
        setTurnstileError("");
        turnstileWidgetRef.current = turnstile.render(turnstileRef.current, {
          sitekey: turnstileConfig.siteKey,
          theme: "light",
          size: "flexible",
          callback: (token) => {
            setTurnstileToken(String(token || ""));
            setTurnstileError("");
          },
          "expired-callback": () => setTurnstileToken(""),
          "timeout-callback": () => setTurnstileToken(""),
          "error-callback": () => {
            setTurnstileToken("");
            setTurnstileError("Güvenlik doğrulaması yüklenemedi. Yeniden deneyin.");
          },
        });
      })
      .catch(() => setTurnstileError("Güvenlik doğrulaması yüklenemedi. Sayfayı yenileyin."));

    return () => {
      cancelled = true;
      if (turnstileWidgetRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(turnstileWidgetRef.current); } catch { /* noop */ }
      }
      turnstileWidgetRef.current = null;
      setTurnstileToken("");
    };
  }, [flow.stage, turnstileConfig]);

  function chooseNextProvider(response) {
    const available = Array.isArray(response?.availableProviders)
      ? response.availableProviders.map(normalizeProvider).filter(Boolean)
      : [];
    const verified = Array.isArray(response?.verifiedProviders)
      ? response.verifiedProviders.map(normalizeProvider).filter(Boolean)
      : [];
    const direct = normalizeProvider(response?.provider);
    if (direct && !verified.includes(direct)) return direct;
    return available.find((item) => !verified.includes(item)) || direct || available[0] || "GOOGLE";
  }

  function applyResponse(response) {
    const stage = String(response?.stage || "").toUpperCase();
    if (!stage) {
      setError("Giriş servisi geçerli bir aşama döndürmedi. Yeniden deneyin.");
      return;
    }
    setError("");
    setCode("");
    setResetProvider("");
    setQrError("");
    if (["MFA_REQUIRED", "MFA_SETUP"].includes(stage)) setSelectedProvider(chooseNextProvider(response));
    if (stage === "OWNER_RECOVERY_VERIFY") {
      setRecoveryOtp("");
      setRecoveryAnswers(["", ""]);
    }
    setFlow({ ...response, stage });
  }

  function resetToCredentials(message = "") {
    setFlow({ stage: "CREDENTIALS" });
    setPassword("");
    setCode("");
    setRecoveryOtp("");
    setRecoveryAnswers(["", ""]);
    setResetProvider("");
    setShowPassword(false);
    setCapsLock(false);
    setError(message);
  }

  async function handleLogin(event) {
    event?.preventDefault();
    const identity = normalizeIdentity(username);
    const rawPassword = String(password ?? "");
    if (!identity || !rawPassword) {
      setError("Kullanıcı adı/e-posta ve şifre zorunludur.");
      return;
    }
    if (!turnstileConfig.loaded) {
      setError("Güvenlik doğrulaması hazırlanıyor. Birkaç saniye sonra tekrar deneyin.");
      return;
    }
    if (turnstileConfig.enabled && !turnstileToken) {
      setError("Güvenlik doğrulamasını tamamlayın.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      // Cihaz bilgisi auth isteğinin JSON gövdesine özel header ekletmemek için
      // burada boş bırakılır. Session güvenliği sunucu JWT/policy motoruyla yürür.
      applyResponse(await login(identity, rawPassword, "", turnstileToken));
    } catch (requestError) {
      setError(requestError?.message || "Giriş yapılamadı.");
    } finally {
      if (turnstileConfig.enabled && turnstileWidgetRef.current !== null && window.turnstile) {
        try { window.turnstile.reset(turnstileWidgetRef.current); } catch { /* noop */ }
        setTurnstileToken("");
      }
      setLoading(false);
    }
  }

  async function handleMfa(event) {
    event?.preventDefault();
    const cleanCode = String(code || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Authenticator uygulamasındaki 6 haneli kodu girin.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      applyResponse(await verifyMfa({
        challengeId: flow.challengeId,
        challengeToken: flow.challengeToken,
        code: cleanCode,
        provider: normalizeProvider(flow.provider) || selectedProvider,
        resetProvider,
      }));
    } catch (requestError) {
      setError(requestError?.message || "Authenticator doğrulaması başarısız oldu.");
    } finally {
      setLoading(false);
    }
  }

  function updateCapsLock(event) {
    setCapsLock(Boolean(event?.getModifierState?.("CapsLock")));
  }

  async function handleOwnerRecovery(channel) {
    try {
      setLoading(true);
      setError("");
      applyResponse(await startOwnerRecovery({
        challengeId: flow.challengeId,
        challengeToken: flow.challengeToken,
        channel,
      }));
    } catch (requestError) {
      setError(requestError?.message || "Hesap kurtarma başlatılamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOwnerRecoveryVerify(event) {
    event?.preventDefault();
    const otp = String(recoveryOtp || "").replace(/\D/g, "");
    if (!/^\d{6}$/.test(otp) || recoveryAnswers.some((answer) => !String(answer || "").trim())) {
      setError("6 haneli doğrulama kodunu ve iki güvenlik sorusunun cevabını girin.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      applyResponse(await verifyOwnerRecovery({
        recoveryId: flow.recoveryId,
        recoveryToken: flow.recoveryToken,
        otp,
        answers: recoveryAnswers,
      }));
    } catch (requestError) {
      setError(requestError?.message || "Hesap kurtarma doğrulanamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPhoneApproval() {
    if (!flow.phoneApprovalId || !flow.phoneApprovalToken) return;
    const state = phoneApprovalCheckRef.current;
    if (state.busy || state.settled) return;
    state.busy = true;
    try {
      const response = await checkPhoneApproval({
        phoneApprovalId: flow.phoneApprovalId,
        phoneApprovalToken: flow.phoneApprovalToken,
      });
      const nextStage = String(response?.stage || "").toUpperCase();
      if (["PHONE_APPROVAL_DENIED", "PHONE_APPROVAL_EXPIRED", "PHONE_APPROVAL_SUPERSEDED"].includes(nextStage)) {
        state.settled = true;
        resetToCredentials(response?.message || "Telefon giriş onayı tamamlanmadı. Yeniden giriş yapın.");
        return;
      }
      if (nextStage !== "PHONE_APPROVAL_PENDING") state.settled = true;
      applyResponse(response);
    } catch (requestError) {
      if (String(requestError?.code || "") === "PHONE_APPROVAL_CONSUMED") {
        setError("Telefon onayı işlendi. Aynı onaya tekrar basmayın; oturum sonucu tamamlanıyor.");
        return;
      }
      setError(requestError?.message || "Telefon onayı durumu kontrol edilemedi.");
    } finally {
      state.busy = false;
    }
  }

  async function resendPhoneApprovalNotification() {
    if (!flow.phoneApprovalId || !flow.phoneApprovalToken || loading) return;
    try {
      setLoading(true);
      setError("");
      setPhoneStatusMessage("");
      const response = await resendPhoneApproval({
        phoneApprovalId: flow.phoneApprovalId,
        phoneApprovalToken: flow.phoneApprovalToken,
      });
      setPhoneStatusMessage(response?.message || "Giriş bildirimi KY ERP Güvenlik uygulamasına yeniden gönderildi.");
    } catch (requestError) {
      setError(requestError?.message || "Telefon bildirimi yeniden gönderilemedi. KY ERP Güvenlik uygulamasında Bağlantıyı Yenile işlemini kullanın.");
    } finally {
      setLoading(false);
    }
  }

  async function switchToAuthenticator() {
    if (!flow.phoneApprovalId || !flow.phoneApprovalToken) return;
    try {
      setLoading(true);
      setError("");
      applyResponse(await useAuthenticatorFallback({
        phoneApprovalId: flow.phoneApprovalId,
        phoneApprovalToken: flow.phoneApprovalToken,
      }));
    } catch (requestError) {
      setError(requestError?.message || "Authenticator yedek yöntemi açılamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshApproval() {
    if (!flow.approvalId || !flow.approvalToken) return;
    try {
      const response = await checkApproval({ approvalId: flow.approvalId, approvalToken: flow.approvalToken });
      const stage = String(response?.stage || "").toUpperCase();
      if (["APPROVAL_DENIED", "APPROVAL_EXPIRED"].includes(stage)) {
        resetToCredentials(response?.message || "Giriş onayı tamamlanmadı. Yeniden giriş yapın.");
        return;
      }
      applyResponse(response);
    } catch (requestError) {
      setError(requestError?.message || "Onay durumu kontrol edilemedi.");
    }
  }

  useEffect(() => {
    if (flow.stage !== "PHONE_APPROVAL_PENDING") return undefined;
    phoneApprovalCheckRef.current = { busy: false, settled: false, id: String(flow.phoneApprovalId || "") };
    const kickoff = window.setTimeout(refreshPhoneApproval, 700);
    const timer = window.setInterval(refreshPhoneApproval, 2200);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
      phoneApprovalCheckRef.current.settled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.stage, flow.phoneApprovalId, flow.phoneApprovalToken]);

  useEffect(() => {
    if (flow.stage !== "APPROVAL_PENDING") return undefined;
    const timer = window.setInterval(refreshApproval, 3500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.stage, flow.approvalId, flow.approvalToken]);

  // AUTHENTICATED olduğunda AuthContext tokenı zaten kaydeder ve AppV3 aynı React
  // ağacında uygulamaya geçer. Burada window.location.replace/reload yapılmaz;
  // böylece başarılı girişten hemen sonra gereksiz ikinci /auth/me/ağ bağlantısı oluşmaz.

  useEffect(() => {
    if (flow.stage !== "MFA_SETUP") {
      setQrError("");
      return undefined;
    }
    const holder = qrRef.current;
    if (!holder || !otpUri) return undefined;
    holder.replaceChildren();
    const QRCodeCtor = window.QRCode;
    if (typeof QRCodeCtor !== "function") {
      setQrError("QR bileşeni yüklenemedi. Sayfayı yenileyip tekrar deneyin.");
      return undefined;
    }
    try {
      new QRCodeCtor(holder, {
        text: otpUri,
        width: 210,
        height: 210,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCodeCtor.CorrectLevel?.M,
      });
    } catch {
      setQrError("QR kodu oluşturulamadı. Geri dönüp yeniden deneyin.");
    }
    return () => holder.replaceChildren();
  }, [flow.stage, otpUri]);

  const availableProviders = Array.isArray(flow.availableProviders)
    ? flow.availableProviders.map(normalizeProvider).filter(Boolean)
    : [];
  const verifiedProviders = Array.isArray(flow.verifiedProviders)
    ? flow.verifiedProviders.map(normalizeProvider).filter(Boolean)
    : [];
  const currentProvider = normalizeProvider(flow.provider) || selectedProvider;
  const currentLabel = PROVIDER_LABELS[currentProvider] || "Authenticator";
  const alternative = currentProvider === "GOOGLE" ? "MICROSOFT" : "GOOGLE";
  const alternativeAvailable = availableProviders.includes(alternative) && !verifiedProviders.includes(alternative);
  const stage = String(flow.stage || "CREDENTIALS").toUpperCase();

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <aside className="auth-brand-panel">
          <div className="auth-brand-lockup">
            <span className="auth-logo">KY</span>
            <div><strong>KY ERP</strong><small>Kurumsal Yönetim Sistemi</small></div>
          </div>
          <div className="auth-brand-copy">
            <span className="auth-eyebrow">KURUMSAL VE GÜVENLİ ERİŞİM</span>
            <h1>Tek giriş.<br /><span>Güvenli erişim.</span></h1>
            <p>Tüm iş süreçlerinize tek ve güvenli bir kapıdan erişin. KY ERP oturum, bot koruması ve çok faktörlü doğrulamayı birlikte uygular.</p>
          </div>
          <div className="auth-security-points">
            <div><span className="auth-point-icon">S</span><p><strong>Güvenli oturum</strong><small>Sunucu kontrollü JWT, session süresi ve otomatik zaman aşımı.</small></p></div>
            <div><span className="auth-point-icon">T</span><p><strong>Turnstile koruması</strong><small>Cloudflare Turnstile ile otomatik bot ve kötüye kullanım kontrolü.</small></p></div>
            <div><span className="auth-point-icon">M</span><p><strong>MFA desteği</strong><small>Google ve Microsoft Authenticator ile güçlü ikinci doğrulama.</small></p></div>
          </div>
          <div className="auth-brand-footer">KY ERP · Verimlilik · Kontrol · Güven</div>
        </aside>

        <section className="auth-card-panel">
          <div className="auth-card">
            <div className="auth-mobile-brand" aria-hidden="true">
              <span className="auth-mobile-logo">KY</span>
              <div><strong>KY ERP</strong><small>Güvenli Giriş</small></div>
            </div>
            <div className="auth-card-head">
              <div>
                <span className="auth-section-label">KY ERP / GİRİŞ</span>
                <h2>{stage === "CREDENTIALS" ? "Kurumsal Giriş" : "Güvenlik Doğrulaması"}</h2>
                <p>{stage === "CREDENTIALS" ? "Hesabınızla giriş yaparak KY ERP’ye güvenli şekilde erişin." : "Hesabınız için tanımlı güvenlik adımını tamamlayın."}</p>
              </div>
              <span className="auth-secure-badge">Güvenli</span>
            </div>

            <StepRail stage={stage} />

            {stage === "CREDENTIALS" ? (
              <form className="auth-form" onSubmit={handleLogin}>
                <label>Kullanıcı adı veya e-posta
                  <input
                    name="username"
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="admin veya ad@firma.com"
                  />
                </label>
                <div className="auth-field-group">
                  <label htmlFor="kyerp-password">Şifre</label>
                  <span className="auth-password-field">
                    <input
                      id="kyerp-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={updateCapsLock}
                      onKeyUp={updateCapsLock}
                      placeholder="Şifrenizi girin"
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                      title={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    >
                      {showPassword ? "Gizle" : "Göster"}
                    </button>
                  </span>
                </div>
                {capsLock ? <div className="auth-caps-warning" role="status">Caps Lock açık. Şifrenizi kontrol edin.</div> : null}
                {turnstileConfig.enabled ? (
                  <div className="auth-turnstile-shell">
                    <div className="auth-turnstile" ref={turnstileRef} />
                    <ErrorBox message={turnstileError} />
                  </div>
                ) : null}
                <ErrorBox message={error} />
                <button className="auth-primary" type="submit" disabled={loading || !turnstileConfig.loaded || turnstileConfig.failed || (turnstileConfig.enabled && !turnstileToken)}>
                  {loading ? "Giriş yapılıyor..." : turnstileConfig.failed ? "Güvenlik doğrulaması kullanılamıyor" : turnstileConfig.enabled && !turnstileToken ? "Güvenlik doğrulaması bekleniyor" : "Giriş Yap"}
                </button>
                <div className="auth-inline-note">
                  <span className="auth-dot" />
                  <span>Giriş güvenliği ve gerekli doğrulama adımları hesabınıza göre otomatik uygulanır.</span>
                </div>
              </form>
            ) : null}

            {stage === "MFA_LEGACY_REQUIRED" ? (
              <div className="auth-flow-block">
                <div className="auth-notice"><strong>Mevcut Authenticator kaydı bulundu</strong><span>Eski doğrulama kodunu bir kez onaylayın; ardından yeni Google/Microsoft düzenine güvenli geçiş yapılır.</span></div>
                <form className="auth-form" onSubmit={handleMfa}>
                  <label>6 haneli mevcut kod
                    <input className="auth-code-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  </label>
                  <ErrorBox message={error} />
                  <button className="auth-primary" type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : "Kodu Doğrula"}</button>
                  <button type="button" className="auth-ghost" onClick={() => resetToCredentials()} disabled={loading}>Giriş ekranına dön</button>
                </form>
              </div>
            ) : null}

            {stage === "MFA_SETUP" ? (
              <div className="auth-flow-block">
                <div className="auth-provider-title">
                  <span className={`provider-mark provider-${currentProvider.toLowerCase()}`}>{PROVIDER_SHORT[currentProvider] || "A"}</span>
                  <div><strong>{flow.providerLabel || currentLabel}</strong><small>Yeni doğrulama kurulumu</small></div>
                </div>
                {flow.recoveryReenroll ? <div className="auth-notice"><strong>Güvenli yeniden kurulum</strong><span>Bu işlem oturum açmaz. Authenticator kaydı yenilenir ve sonrasında parola ile tekrar giriş yapılır.</span></div> : null}
                <div className="auth-setup-grid">
                  <div className="auth-qr-shell"><div className="auth-qr-code" ref={qrRef} /></div>
                  <div className="auth-setup-steps">
                    <p><span>1</span>Authenticator uygulamasını açın.</p>
                    <p><span>2</span>Hesap ekle → QR kodu tara seçin.</p>
                    <p><span>3</span>QR kodunu okutun ve oluşan 6 haneli kodu girin.</p>
                    {flow.secret ? <details><summary>Manuel kurulum anahtarı</summary><code>{flow.secret}</code></details> : null}
                  </div>
                </div>
                <ErrorBox message={qrError} />
                <form className="auth-form" onSubmit={handleMfa}>
                  <label>6 haneli doğrulama kodu
                    <input className="auth-code-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  </label>
                  <ErrorBox message={error} />
                  <button className="auth-primary" type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : "Kurulumu Doğrula"}</button>
                  {!flow.recoveryReenroll ? <button type="button" className="auth-ghost" onClick={() => resetToCredentials()} disabled={loading}>İptal ve geri dön</button> : null}
                </form>
              </div>
            ) : null}

            {stage === "PHONE_APPROVAL_PENDING" ? (
              <div className="auth-flow-block auth-centered">
                <div className="auth-phone-approval-icon" aria-hidden="true">✓</div>
                <span className="auth-section-label">KY ERP TELEFON ONAYI</span>
                <h3>Telefonunuza bildirim gönderildi</h3>
                <p>Tek KY ERP bildirimini açıp <strong>Onayla</strong> seçin. Aynı giriş için ikinci bildirim üretilmez. Cihaz kilidi kurulmuşsa Face ID / parmak izi / PIN doğrulaması da açılır.</p>
                <div className="auth-notice">
                  <strong>Güvenli bekleme</strong>
                  <span>Bu giriş yalnız kayıtlı güvenilir telefonunuzdan onaylanabilir. İstek kısa süre içinde otomatik olarak geçersiz olur.</span>
                </div>
                {phoneStatusMessage ? <div className="auth-notice"><strong>Telefon bağlantısı</strong><span>{phoneStatusMessage}</span></div> : null}
                <ErrorBox message={error} />
                <button className="auth-primary" type="button" onClick={refreshPhoneApproval} disabled={loading}>Onayı Şimdi Kontrol Et</button>
                <button className="auth-secondary" type="button" onClick={resendPhoneApprovalNotification} disabled={loading}>Bildirimi Yeniden Gönder</button>
                <button className="auth-secondary" type="button" onClick={switchToAuthenticator} disabled={loading}>6 haneli kod ile devam et</button>
                <button type="button" className="auth-ghost" onClick={() => resetToCredentials()} disabled={loading}>Giriş ekranına dön</button>
              </div>
            ) : null}

            {stage === "MFA_REQUIRED" ? (
              <div className="auth-flow-block">
                <div className="auth-policy-row">
                  <div><span className="auth-section-label">GÜVENLİK POLİTİKASI</span><strong>{flow.policyLabel || (flow.requireBoth ? "Google + Microsoft" : "Authenticator doğrulaması")}</strong></div>
                  {flow.requireBoth ? <span className="auth-policy-badge">2/2 MFA gerekli</span> : <span className="auth-policy-badge">1 MFA doğrulaması gerekli</span>}
                </div>

                <div className="provider-grid">
                  {(availableProviders.length ? availableProviders : [currentProvider]).filter(Boolean).map((provider) => (
                    <ProviderCard
                      key={provider}
                      provider={provider}
                      selected={selectedProvider === provider && !verifiedProviders.includes(provider)}
                      verified={verifiedProviders.includes(provider)}
                      disabled={verifiedProviders.includes(provider) || loading}
                      onClick={() => { setSelectedProvider(provider); setCode(""); setResetProvider(""); setError(""); }}
                    />
                  ))}
                </div>

                {flow.requireBoth ? (
                  <div className="auth-progress-note">
                    <strong>{verifiedProviders.length}/2 doğrulama tamamlandı</strong>
                    <span>{verifiedProviders.length ? `${verifiedProviders.map((item) => PROVIDER_LABELS[item]).join(", ")} tamamlandı. Kalan doğrulamaya devam edin.` : "Önce Google veya Microsoft kodlarından biriyle başlayın."}</span>
                  </div>
                ) : null}

                <form className="auth-form" onSubmit={handleMfa}>
                  <label>{currentLabel} kodu
                    <input className="auth-code-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  </label>
                  {resetProvider ? <div className="auth-notice"><strong>{PROVIDER_LABELS[resetProvider]} yeniden kurulacak</strong><span>Kimliğinizi önce {currentLabel} koduyla doğrulayın.</span></div> : null}
                  <ErrorBox message={error} />
                  <button className="auth-primary" type="submit" disabled={loading || verifiedProviders.includes(currentProvider)}>{loading ? "Doğrulanıyor..." : resetProvider ? "Doğrula ve Yeniden Kur" : `${currentLabel} ile Doğrula`}</button>
                  {!flow.requireBoth && alternativeAvailable ? <button type="button" className="auth-secondary" onClick={() => { setSelectedProvider(alternative); setCode(""); setError(""); }}>Diğer Authenticator'ı kullan</button> : null}
                  {!flow.requireBoth && availableProviders.includes(alternative) ? <button type="button" className="auth-secondary" onClick={() => { setResetProvider(currentProvider); setSelectedProvider(alternative); setCode(""); setError(""); }}>{currentLabel} erişilemiyor · diğer yöntemle yeniden kur</button> : null}
                  <button type="button" className="auth-ghost" onClick={() => resetToCredentials()} disabled={loading}>Giriş ekranına dön</button>
                </form>

                {flow.ownerRecoveryAvailable ? (
                  <div className="auth-recovery-panel auth-owner-recovery-panel">
                    <div>
                      <span className="auth-section-label">UYGULAMA SAHİBİ EK GÜVENLİK</span>
                      <strong>Özel soru-cevap ile güvenli kurtarma</strong>
                      <span>Yalnız uygulama sahibi için çalışır. Doğrulanmış iletişim kanalı ve kayıtlı özel güvenlik soruları birlikte doğrulanır; doğrudan oturum açılmaz, MFA güvenli şekilde yeniden kurulur.</span>
                    </div>
                    <div className="auth-recovery-actions">
                      {flow.recoveryChannels?.email ? <button type="button" className="auth-secondary" onClick={() => handleOwnerRecovery("EMAIL")} disabled={loading}>E-posta + özel sorular</button> : null}
                      {flow.recoveryChannels?.sms ? <button type="button" className="auth-secondary" onClick={() => handleOwnerRecovery("SMS")} disabled={loading}>SMS + özel sorular</button> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {stage === "OWNER_RECOVERY_VERIFY" ? (
              <div className="auth-flow-block">
                <div className="auth-notice auth-owner-notice"><strong>Uygulama sahibi özel güvenlik doğrulaması</strong><span><b>{flow.maskedDestination}</b> kanalındaki iletişim doğrulamasını ve aşağıdaki iki özel güvenlik sorusunu birlikte tamamlayın.</span></div>
                <form className="auth-form" onSubmit={handleOwnerRecoveryVerify}>
                  <label>İletişim doğrulama kodu
                    <input className="auth-code-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={recoveryOtp} onChange={(event) => setRecoveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  </label>
                  {(flow.questions || []).slice(0, 2).map((question, index) => (
                    <label key={question.id || index}>{question.question}
                      <input type="password" autoComplete="off" value={recoveryAnswers[index] || ""} onChange={(event) => setRecoveryAnswers((previous) => previous.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Cevabınız" />
                    </label>
                  ))}
                  <ErrorBox message={error} />
                  <button className="auth-primary" type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : "Özel Güvenliği Doğrula"}</button>
                  <button type="button" className="auth-ghost" onClick={() => resetToCredentials()} disabled={loading}>İptal</button>
                </form>
              </div>
            ) : null}

            {stage === "APPROVAL_PENDING" ? (
              <div className="auth-flow-block auth-centered">
                <div className="auth-wait-ring"><span /></div>
                <h3>Yönetici onayı bekleniyor</h3>
                <p>Kimlik doğrulaması tamamlandı. Yeni cihaz girişi güvenlik nedeniyle yönetici tarafından onaylanmalıdır.</p>
                <ErrorBox message={error} />
                <button className="auth-primary" type="button" onClick={refreshApproval} disabled={loading}>Şimdi Kontrol Et</button>
                <button type="button" className="auth-ghost" onClick={() => resetToCredentials()} disabled={loading}>Geri dön</button>
              </div>
            ) : null}

            {stage === "RECOVERY_COMPLETE" ? (
              <div className="auth-flow-block auth-centered">
                <div className="auth-success-mark">✓</div>
                <h3>Güvenlik kurulumu tamamlandı</h3>
                <p>{flow.message || "Authenticator güvenliği yeniden kuruldu."}</p>
                <button className="auth-primary" type="button" onClick={() => resetToCredentials()}>Yeniden Giriş Yap</button>
              </div>
            ) : null}

            {stage === "AUTHENTICATED" ? (
              <div className="auth-flow-block auth-centered">
                <div className="auth-success-mark">✓</div>
                <h3>Giriş başarılı</h3>
                <p>Güvenli oturum oluşturuldu. KY ERP açılıyor...</p>
              </div>
            ) : null}

            {![
              "CREDENTIALS", "MFA_LEGACY_REQUIRED", "MFA_SETUP", "MFA_REQUIRED", "PHONE_APPROVAL_PENDING",
              "OWNER_RECOVERY_VERIFY", "APPROVAL_PENDING", "RECOVERY_COMPLETE", "AUTHENTICATED",
            ].includes(stage) ? (
              <div className="auth-flow-block">
                <ErrorBox message={error || "Giriş akışında bilinmeyen bir durum oluştu. Yeniden giriş yapın."} />
                <button className="auth-primary" type="button" onClick={() => resetToCredentials()}>Girişe Dön</button>
              </div>
            ) : null}

            <div className="auth-card-footer">
              <span className="auth-dot" />
              <span>Şifre, Turnstile, telefon onayı, MFA ve oturum politikaları sunucu tarafından doğrulanır.</span>
            </div>
          </div>
        </section>
      </section>
      <footer className="auth-page-footer">
        <span>© 2026 KY ERP. Tüm hakları saklıdır.</span>
        <span>Güvenli · Güçlü · Kurumsal</span>
      </footer>
    </main>
  );
}
