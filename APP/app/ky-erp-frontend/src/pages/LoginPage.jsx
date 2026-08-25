import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

const PROVIDER_LABELS = {
  GOOGLE: "Google Authenticator",
  MICROSOFT: "Microsoft Authenticator",
};

function normalizeCredential(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}
function normalizeProvider(value) {
  const provider = String(value || "").toUpperCase();
  return provider === "GOOGLE" || provider === "MICROSOFT" ? provider : "";
}
function deviceName() {
  if (typeof navigator === "undefined") return "KY ERP cihazı";
  const platform = navigator.userAgentData?.platform || navigator.platform || "Cihaz";
  const mobile = navigator.userAgentData?.mobile ? "Telefon" : "Tarayıcı";
  return `${platform} · ${mobile}`.slice(0, 160);
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
  const deviceLabel = useMemo(() => deviceName(), []);
  const otpUri = useMemo(() => compatibleOtpUri(flow.otpauthUri), [flow.otpauthUri]);

  useEffect(() => {
    document.title = "KY ERP | Kurumsal Giriş";
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
    if (direct) return direct;
    return available.find((item) => !verified.includes(item)) || available[0] || "GOOGLE";
  }

  function applyResponse(response) {
    const stage = String(response?.stage || "").toUpperCase();
    if (!stage) return;
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
    const identity = normalizeCredential(username);
    const cleanPassword = normalizeCredential(password);
    if (!identity || !cleanPassword) {
      setError("E-posta/kullanıcı adı ve şifre zorunludur.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      applyResponse(await login(identity, cleanPassword, deviceLabel));
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
    const timer = window.setInterval(refreshApproval, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.stage, flow.approvalId, flow.approvalToken]);

  useEffect(() => {
    if (flow.stage !== "AUTHENTICATED") return undefined;
    const timer = window.setTimeout(() => window.location.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`), 250);
    return () => window.clearTimeout(timer);
  }, [flow.stage]);

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
      setQrError("QR bileşeni yüklenemedi. Sayfayı Ctrl+F5 ile yenileyin.");
      return undefined;
    }
    try {
      new QRCodeCtor(holder, {
        text: otpUri,
        width: 220,
        height: 220,
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

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">KY ERP</div>
        <h1>Kurumsal Giriş</h1>

        {flow.stage === "CREDENTIALS" ? (
          <>
            <p>Giriş güvenliği hesabınıza özel olarak sistem yöneticisi tarafından belirlenir.</p>
            <form onSubmit={handleLogin}>
              <label>E-posta veya Kullanıcı Adı
                <input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="kullanici veya mail@firma.com" />
              </label>
              <label>Şifre
                <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="********" />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>{loading ? "Kontrol ediliyor..." : "Giriş Yap"}</button>
            </form>
            <div className="login-security-box">
              <strong>Kullanıcıya özel güvenlik</strong>
              <span>Sadece parola kullanan hesaplar en fazla 30 dakika açık kalır.</span>
              <span>Google, Microsoft, ikisinden biri veya ikisi birden kullanıcı bazında zorunlu tutulabilir.</span>
            </div>
          </>
        ) : null}

        {flow.stage === "MFA_LEGACY_REQUIRED" ? (
          <>
            <p><strong>Mevcut Authenticator doğrulaması</strong></p>
            <div className="login-security-box">
              <strong>Güvenli geçiş</strong>
              <span>Eski tek Authenticator kaydınız bulundu. Bu kod bir kez doğrulandıktan sonra yeni Google/Microsoft güvenlik düzenine taşınacaksınız.</span>
            </div>
            <form onSubmit={handleMfa}>
              <label>Mevcut 6 Haneli Authenticator Kodu
                <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : "Mevcut Kodu Doğrula"}</button>
              {flow.recoveryCodeAvailable ? <button type="button" className="login-secondary" onClick={() => setShowRecoveryCode((value) => !value)}>Acil kurtarma kodu kullan</button> : null}
              <button type="button" className="login-secondary" onClick={() => resetToCredentials()} disabled={loading}>Geri Dön</button>
            </form>
          </>
        ) : null}

        {flow.stage === "MFA_SETUP" ? (
          <>
            <p><strong>{flow.providerLabel || currentLabel}</strong> bu hesap için kuruluyor.</p>
            {flow.recoveryReenroll ? <div className="login-security-box"><strong>Güvenli yeniden kurulum</strong><span>Bu işlem doğrudan oturum açmaz. Gerekli Authenticator kayıtları tamamlanır ve ardından yeniden parola ile giriş yapılır.</span></div> : null}
            <div className={`login-security-box login-setup-box provider-${String(currentProvider).toLowerCase()}`}>
              <strong>{flow.providerLabel || currentLabel}</strong>
              <span>1. İlgili Authenticator uygulamasını açın.</span>
              <span>2. Hesap ekle → QR kodu tara seçin.</span>
              <span>3. Aşağıdaki QR kodunu okutun ve oluşan 6 haneli kodu girin.</span>
              <div className="login-qr-shell"><div className="login-qr-code" ref={qrRef} /></div>
              {qrError ? <div className="login-error">{qrError}</div> : null}
              <details className="login-manual-setup"><summary>QR okunmazsa manuel kurulum</summary><code>{flow.secret || ""}</code></details>
            </div>
            <form onSubmit={handleMfa}>
              <label>6 Haneli Kod
                <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : `${flow.providerLabel || currentLabel} Kurulumunu Doğrula`}</button>
              {!flow.recoveryReenroll ? <button type="button" className="login-secondary" onClick={() => resetToCredentials()} disabled={loading}>Geri Dön</button> : null}
            </form>
          </>
        ) : null}

        {flow.stage === "MFA_REQUIRED" ? (
          <>
            <p><strong>{flow.policyLabel || "Authenticator doğrulaması"}</strong></p>
            {flow.requireBoth ? <div className="login-security-box"><strong>İki doğrulama gerekli</strong><span>Google ve Microsoft kodları bağımsız olarak doğrulanır.</span><span>Doğrulanan: {verifiedProviders.length ? verifiedProviders.map((item) => PROVIDER_LABELS[item]).join(", ") : "Henüz yok"}</span></div> : null}
            {availableProviders.length > 1 ? <div className="login-provider-tabs">{availableProviders.map((provider) => <button key={provider} type="button" className={selectedProvider === provider ? "active" : ""} disabled={verifiedProviders.includes(provider)} onClick={() => { setSelectedProvider(provider); setCode(""); setResetProvider(""); }}>{PROVIDER_LABELS[provider]}{verifiedProviders.includes(provider) ? " ✓" : ""}</button>)}</div> : null}
            <form onSubmit={handleMfa}>
              <label>{currentLabel} Kodu
                <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
              </label>
              {resetProvider ? <div className="login-security-box"><strong>{PROVIDER_LABELS[resetProvider]} yeniden kurulacak</strong><span>Önce {currentLabel} kodunuzla kimliğinizi doğrulayın.</span></div> : null}
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading || verifiedProviders.includes(currentProvider)}>{loading ? "Doğrulanıyor..." : resetProvider ? "Doğrula ve Yeniden Kur" : `${currentLabel} ile Doğrula`}</button>
              {!flow.requireBoth && alternativeAvailable ? <button type="button" className="login-secondary" onClick={() => setSelectedProvider(alternative)}>Diğer Authenticator ile doğrula</button> : null}
              {!flow.requireBoth && availableProviders.includes(alternative) ? <button type="button" className="login-secondary" onClick={() => setResetProvider(currentProvider)}>{currentLabel} erişilemiyor · diğer yöntemle yeniden kur</button> : null}
              <button type="button" className="login-secondary" onClick={() => resetToCredentials()} disabled={loading}>Geri Dön</button>
            </form>

            {flow.ownerRecoveryAvailable ? (
              <div className="login-recovery-panel">
                <strong>Authenticator'lara erişemiyor musunuz?</strong>
                <span>Doğrulanmış telefon veya e-posta + iki özel güvenlik sorusu yalnız Authenticator'ları yeniden kurar; doğrudan uygulamaya giriş vermez.</span>
                <div className="login-provider-tabs">
                  {flow.recoveryChannels?.email ? <button type="button" onClick={() => handleOwnerRecovery("EMAIL")} disabled={loading}>E-posta ile Kurtar</button> : null}
                  {flow.recoveryChannels?.sms ? <button type="button" onClick={() => handleOwnerRecovery("SMS")} disabled={loading}>Telefon / SMS ile Kurtar</button> : null}
                </div>
              </div>
            ) : null}

            {flow.recoveryCodeAvailable ? (
              <div className="login-recovery-panel">
                <strong>Acil yedek kurtarma</strong>
                <span>Telefon/e-posta kurtarma tam kurulana kadar mevcut tek kullanımlık KY ERP kodları kilitlenmeyi önlemek için acil yedek olarak korunur.</span>
                <button type="button" className="login-secondary" onClick={() => setShowRecoveryCode((value) => !value)}>{showRecoveryCode ? "Kurtarma kodunu kapat" : "Tek kullanımlık kurtarma kodu kullan"}</button>
              </div>
            ) : null}
          </>
        ) : null}

        {showRecoveryCode && ["MFA_REQUIRED", "MFA_LEGACY_REQUIRED"].includes(flow.stage) ? (
          <form onSubmit={handleRecoveryCode} className="login-recovery-panel">
            <label>KY ERP Tek Kullanımlık Kurtarma Kodu
              <input autoFocus value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())} placeholder="KYERP-ABCD-2345" />
            </label>
            {error ? <div className="login-error">{error}</div> : null}
            <button type="submit" disabled={loading}>{loading ? "Kontrol ediliyor..." : "Kodu Doğrula ve Authenticator'ı Yeniden Kur"}</button>
          </form>
        ) : null}

        {flow.stage === "OWNER_RECOVERY_VERIFY" ? (
          <>
            <p>Doğrulama kodu <strong>{flow.maskedDestination}</strong> kanalına gönderildi.</p>
            <div className="login-security-box"><strong>Uygulama sahibi kurtarma</strong><span>Kod ve iki özel soru birlikte doğru olmalıdır. Başarılı olursa tüm eski oturumlar kapanır ve Google/Microsoft yeniden kurulur.</span></div>
            <form onSubmit={handleOwnerRecoveryVerify}>
              <label>6 Haneli Doğrulama Kodu
                <input autoFocus inputMode="numeric" maxLength={6} value={recoveryOtp} onChange={(event) => setRecoveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
              </label>
              {(flow.questions || []).slice(0, 2).map((question, index) => <label key={question.id || index}>{question.question}<input type="password" autoComplete="off" value={recoveryAnswers[index] || ""} onChange={(event) => setRecoveryAnswers((previous) => previous.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder="Cevabınız" /></label>)}
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : "Kurtarmayı Doğrula"}</button>
              <button type="button" className="login-secondary" onClick={() => resetToCredentials()} disabled={loading}>İptal</button>
            </form>
          </>
        ) : null}

        {flow.stage === "APPROVAL_PENDING" ? (
          <>
            <p>Kimlik doğrulaması tamamlandı. Yeni cihaz girişi için yönetici onayı bekleniyor.</p>
            <div className="login-security-box"><strong>Giriş onayı bekleniyor</strong><span>Bu ekran otomatik kontrol edilir. Onay verildiğinde uygulama açılır.</span></div>
            {error ? <div className="login-error">{error}</div> : null}
            <button type="button" onClick={refreshApproval} disabled={loading}>Şimdi Kontrol Et</button>
            <button type="button" className="login-secondary" onClick={() => resetToCredentials()} disabled={loading}>Geri Dön</button>
          </>
        ) : null}

        {flow.stage === "RECOVERY_COMPLETE" ? <><div className="login-security-box"><strong>Güvenlik kurulumu tamamlandı</strong><span>{flow.message}</span></div><button type="button" onClick={() => resetToCredentials()}>Yeniden Giriş Yap</button></> : null}
        {flow.stage === "AUTHENTICATED" ? <div className="login-security-box"><strong>Giriş başarılı</strong><span>KY ERP açılıyor...</span></div> : null}

        <div className="login-footer">KY ERP · Oturum süresi kullanıcı güvenlik profiline göre sunucu tarafından uygulanır.</div>
      </div>
    </div>
  );
}
