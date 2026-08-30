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

export default function LoginPage() {
  const {
    login,
    verifyMfa,
    recoverMfa,
    startOwnerRecovery,
    verifyOwnerRecovery,
    checkApproval,
  } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("GOOGLE");
  const [resetProvider, setResetProvider] = useState("");
  const [flow, setFlow] = useState({ stage: "CREDENTIALS" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryAnswers, setRecoveryAnswers] = useState(["", ""]);
  const qrRef = useRef(null);
  const otpUri = useMemo(() => compatibleOtpUri(flow.otpauthUri), [flow.otpauthUri]);

  useEffect(() => {
    document.title = "KY ERP | Güvenli Giriş";
    if (window.location.pathname !== "/") {
      window.history.replaceState({}, "", `/${window.location.search}${window.location.hash}`);
    }
  }, []);

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
    setShowRecoveryCode(false);
    setRecoveryCode("");
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
    setRecoveryCode("");
    setRecoveryOtp("");
    setRecoveryAnswers(["", ""]);
    setResetProvider("");
    setShowRecoveryCode(false);
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
    try {
      setLoading(true);
      setError("");
      // Cihaz bilgisi auth isteğinin JSON gövdesine özel header ekletmemek için
      // burada boş bırakılır. Session güvenliği sunucu JWT/policy motoruyla yürür.
      applyResponse(await login(identity, rawPassword, ""));
    } catch (requestError) {
      setError(requestError?.message || "Giriş yapılamadı.");
    } finally {
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

  async function handleRecoveryCode(event) {
    event?.preventDefault();
    const clean = String(recoveryCode || "").trim().toUpperCase();
    if (!/^KYERP-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(clean)) {
      setError("Geçerli tek kullanımlık KY ERP kurtarma kodunu girin.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      applyResponse(await recoverMfa({
        challengeId: flow.challengeId,
        challengeToken: flow.challengeToken,
        recoveryCode: clean,
      }));
    } catch (requestError) {
      setError(requestError?.message || "Kurtarma kodu doğrulanamadı.");
    } finally {
      setLoading(false);
    }
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
            <span className="auth-eyebrow">GÜVENLİ OTURUM</span>
            <h1>Tek giriş.<br />İki bağımsız doğrulama.</h1>
            <p>Hesabın güvenlik politikasına göre Google Authenticator, Microsoft Authenticator veya ikisi birlikte doğrulanır.</p>
          </div>
          <div className="auth-security-points">
            <div><span>01</span><p><strong>Sunucu kontrollü oturum</strong><small>JWT ve gerçek session süresi sunucu tarafından uygulanır.</small></p></div>
            <div><span>02</span><p><strong>Çift MFA desteği</strong><small>Google ve Microsoft kayıtları birbirinden bağımsız tutulur.</small></p></div>
            <div><span>03</span><p><strong>Kurtarma güvenliği</strong><small>Kurtarma işlemi doğrudan uygulamaya giriş vermez; doğrulamayı yeniden kurar.</small></p></div>
          </div>
          <div className="auth-brand-footer">KY ERP · Yetkili kullanıcı erişimi</div>
        </aside>

        <section className="auth-card-panel">
          <div className="auth-card">
            <div className="auth-card-head">
              <div>
                <span className="auth-section-label">KY ERP / GİRİŞ</span>
                <h2>{stage === "CREDENTIALS" ? "Kurumsal Giriş" : "Güvenlik Doğrulaması"}</h2>
                <p>{stage === "CREDENTIALS" ? "Hesabınızla devam edin." : "Hesabınız için tanımlı güvenlik adımını tamamlayın."}</p>
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
                <label>Şifre
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Şifrenizi girin"
                  />
                </label>
                <ErrorBox message={error} />
                <button className="auth-primary" type="submit" disabled={loading}>
                  {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
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
                  {flow.recoveryCodeAvailable ? <button type="button" className="auth-secondary" onClick={() => setShowRecoveryCode((value) => !value)}>Tek kullanımlık kurtarma kodu</button> : null}
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

            {stage === "MFA_REQUIRED" ? (
              <div className="auth-flow-block">
                <div className="auth-policy-row">
                  <div><span className="auth-section-label">GÜVENLİK POLİTİKASI</span><strong>{flow.policyLabel || (flow.requireBoth ? "Google + Microsoft" : "Authenticator doğrulaması")}</strong></div>
                  {flow.requireBoth ? <span className="auth-policy-badge">2/2 gerekli</span> : <span className="auth-policy-badge">1 doğrulama</span>}
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
                  <div className="auth-recovery-panel">
                    <div><strong>Authenticator'lara erişemiyor musunuz?</strong><span>Doğrulanmış e-posta/SMS ve güvenlik soruları ile Authenticator kayıtları yeniden kurulabilir.</span></div>
                    <div className="auth-recovery-actions">
                      {flow.recoveryChannels?.email ? <button type="button" className="auth-secondary" onClick={() => handleOwnerRecovery("EMAIL")} disabled={loading}>E-posta ile kurtar</button> : null}
                      {flow.recoveryChannels?.sms ? <button type="button" className="auth-secondary" onClick={() => handleOwnerRecovery("SMS")} disabled={loading}>SMS ile kurtar</button> : null}
                    </div>
                  </div>
                ) : null}

                {flow.recoveryCodeAvailable ? <button type="button" className="auth-link-button" onClick={() => setShowRecoveryCode((value) => !value)}>{showRecoveryCode ? "Kurtarma kodunu kapat" : "Tek kullanımlık acil kurtarma kodu kullan"}</button> : null}
              </div>
            ) : null}

            {showRecoveryCode && ["MFA_REQUIRED", "MFA_LEGACY_REQUIRED"].includes(stage) ? (
              <form className="auth-form auth-recovery-code" onSubmit={handleRecoveryCode}>
                <label>KY ERP kurtarma kodu
                  <input autoFocus value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} placeholder="KYERP-ABCD-2345" />
                </label>
                <ErrorBox message={error} />
                <button className="auth-primary" type="submit" disabled={loading}>{loading ? "Kontrol ediliyor..." : "Kodu Doğrula"}</button>
              </form>
            ) : null}

            {stage === "OWNER_RECOVERY_VERIFY" ? (
              <div className="auth-flow-block">
                <div className="auth-notice"><strong>Hesap kurtarma doğrulaması</strong><span>Kod <b>{flow.maskedDestination}</b> kanalına gönderildi. Kod ve iki güvenlik sorusu birlikte doğru olmalıdır.</span></div>
                <form className="auth-form" onSubmit={handleOwnerRecoveryVerify}>
                  <label>6 haneli kurtarma kodu
                    <input className="auth-code-input" autoFocus inputMode="numeric" maxLength={6} value={recoveryOtp} onChange={(event) => setRecoveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  </label>
                  {(flow.questions || []).slice(0, 2).map((question, index) => (
                    <label key={question.id || index}>{question.question}
                      <input type="password" autoComplete="off" value={recoveryAnswers[index] || ""} onChange={(event) => setRecoveryAnswers((previous) => previous.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Cevabınız" />
                    </label>
                  ))}
                  <ErrorBox message={error} />
                  <button className="auth-primary" type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : "Kurtarmayı Doğrula"}</button>
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
              "CREDENTIALS", "MFA_LEGACY_REQUIRED", "MFA_SETUP", "MFA_REQUIRED",
              "OWNER_RECOVERY_VERIFY", "APPROVAL_PENDING", "RECOVERY_COMPLETE", "AUTHENTICATED",
            ].includes(stage) ? (
              <div className="auth-flow-block">
                <ErrorBox message={error || "Giriş akışında bilinmeyen bir durum oluştu. Yeniden giriş yapın."} />
                <button className="auth-primary" type="button" onClick={() => resetToCredentials()}>Girişe Dön</button>
              </div>
            ) : null}

            <div className="auth-card-footer">
              <span className="auth-dot" />
              <span>Şifre, MFA ve oturum politikaları sunucu tarafından doğrulanır.</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
