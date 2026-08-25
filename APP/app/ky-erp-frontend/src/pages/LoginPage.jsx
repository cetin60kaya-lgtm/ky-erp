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

function otherProvider(provider) {
  return provider === "MICROSOFT" ? "GOOGLE" : "MICROSOFT";
}

function deviceName() {
  if (typeof navigator === "undefined") return "KY ERP cihazı";
  const platform = navigator.userAgentData?.platform || navigator.platform || "Cihaz";
  const mobile = navigator.userAgentData?.mobile ? "Telefon" : "Tarayıcı";
  return `${platform} · ${mobile}`.slice(0, 160);
}

function authenticatorCompatibleUri(value) {
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
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    return `${prefix}${label}${query ? `?${query}` : ""}`;
  } catch {
    return raw;
  }
}

export default function LoginPage() {
  const {
    login,
    verifyMfa,
    recoverMfa,
    acknowledgeRecoveryCodes,
    checkApproval,
  } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("GOOGLE");
  const [resetProvider, setResetProvider] = useState("");
  const [flow, setFlow] = useState({ stage: "CREDENTIALS" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);
  const deviceLabel = useMemo(() => deviceName(), []);
  const compatibleOtpUri = useMemo(
    () => authenticatorCompatibleUri(flow.otpauthUri),
    [flow.otpauthUri],
  );

  useEffect(() => {
    document.title = "KY ERP | Kurumsal Giriş";
    if (window.location.pathname !== "/") {
      window.history.replaceState({}, "", `/${window.location.search}${window.location.hash}`);
    }
  }, []);

  function applyResponse(response) {
    const stage = String(response?.stage || "").toUpperCase();
    if (!stage) return;
    if (stage === "AUTHENTICATED") {
      setFlow({ stage: "AUTHENTICATED" });
      setCode("");
      setRecoveryCode("");
      setResetProvider("");
      setError("");
      return;
    }
    const provider = normalizeProvider(response?.provider);
    const availableProviders = Array.isArray(response?.availableProviders)
      ? response.availableProviders.map(normalizeProvider).filter(Boolean)
      : [];
    if (provider) setSelectedProvider(provider);
    else if (availableProviders.length && !availableProviders.includes(selectedProvider)) {
      setSelectedProvider(availableProviders[0]);
    }
    setFlow({ ...response, stage });
    setCode("");
    setRecoveryCode("");
    setCopied(false);
    if (stage !== "MFA_REQUIRED") setResetProvider("");
  }

  function goBackToCredentials() {
    setFlow({ stage: "CREDENTIALS" });
    setCode("");
    setRecoveryCode("");
    setResetProvider("");
    setError("");
    setQrError("");
    setCopied(false);
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const cleanUsername = normalizeCredential(username);
    const cleanPassword = normalizeCredential(password);
    if (!cleanUsername || !cleanPassword) {
      setError("E-posta/kullanıcı adı ve şifre zorunludur.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const response = await login(cleanUsername, cleanPassword, deviceLabel);
      applyResponse(response);
    } catch (requestError) {
      setError(requestError?.message || "Giriş yapılamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(event) {
    event?.preventDefault();
    const cleanCode = String(code || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Authenticator uygulamasındaki 6 haneli kodu girin.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const response = await verifyMfa({
        challengeId: flow.challengeId,
        challengeToken: flow.challengeToken,
        code: cleanCode,
        provider: flow.stage === "MFA_LEGACY_REQUIRED" ? "" : selectedProvider,
        resetProvider,
      });
      applyResponse(response);
    } catch (requestError) {
      setError(requestError?.message || "Authenticator doğrulaması başarısız oldu.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecovery(event) {
    event?.preventDefault();
    const cleanRecovery = String(recoveryCode || "").trim().toUpperCase();
    if (!/^KYERP-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cleanRecovery)) {
      setError("Geçerli KY ERP kurtarma kodunu girin. Örnek: KYERP-ABCD-2345");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const response = await recoverMfa({
        challengeId: flow.challengeId,
        challengeToken: flow.challengeToken,
        recoveryCode: cleanRecovery,
      });
      applyResponse(response);
    } catch (requestError) {
      setError(requestError?.message || "Kurtarma kodu doğrulanamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRecoveryCodesAck() {
    try {
      setLoading(true);
      setError("");
      const response = await acknowledgeRecoveryCodes({
        challengeId: flow.challengeId,
        challengeToken: flow.challengeToken,
      });
      applyResponse(response);
    } catch (requestError) {
      setError(requestError?.message || "Kurtarma kodu onayı tamamlanamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function copyRecoveryCodes() {
    const value = (flow.recoveryCodes || []).join("\n");
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function refreshApproval() {
    if (!flow.approvalId || !flow.approvalToken) return;
    try {
      const response = await checkApproval({
        approvalId: flow.approvalId,
        approvalToken: flow.approvalToken,
      });
      const stage = String(response?.stage || "").toUpperCase();
      if (stage === "APPROVAL_DENIED" || stage === "APPROVAL_EXPIRED") {
        setError(response?.message || "Giriş onayı tamamlanmadı. Yeniden giriş yapın.");
        setFlow({ stage: "CREDENTIALS" });
        setPassword("");
        return;
      }
      applyResponse(response);
    } catch (requestError) {
      setError(requestError?.message || "Onay durumu kontrol edilemedi.");
    }
  }

  useEffect(() => {
    if (flow.stage !== "AUTHENTICATED") return undefined;
    const timer = window.setTimeout(() => {
      window.location.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [flow.stage]);

  useEffect(() => {
    if (flow.stage !== "MFA_SETUP") {
      setQrError("");
      return undefined;
    }
    const holder = qrRef.current;
    const setupUri = compatibleOtpUri;
    if (!holder || !setupUri) {
      setQrError("Authenticator kurulum bağlantısı hazırlanamadı. Geri dönüp yeniden giriş yapın.");
      return undefined;
    }
    holder.replaceChildren();
    const QRCodeCtor = window.QRCode;
    if (typeof QRCodeCtor !== "function") {
      setQrError("QR bileşeni yüklenemedi. Sayfayı Ctrl+F5 ile yenileyip tekrar deneyin.");
      return undefined;
    }
    try {
      new QRCodeCtor(holder, {
        text: setupUri,
        width: 220,
        height: 220,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCodeCtor.CorrectLevel?.M,
      });
      setQrError("");
    } catch {
      holder.replaceChildren();
      setQrError("QR kodu oluşturulamadı. Geri dönüp yeniden giriş yapın.");
    }
    return () => holder.replaceChildren();
  }, [compatibleOtpUri, flow.stage]);

  useEffect(() => {
    if (flow.stage !== "APPROVAL_PENDING") return undefined;
    const timer = window.setInterval(refreshApproval, 3000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.stage, flow.approvalId, flow.approvalToken]);

  const availableProviders = Array.isArray(flow.availableProviders)
    ? flow.availableProviders.map(normalizeProvider).filter(Boolean)
    : [];
  const selectedAvailable = availableProviders.includes(selectedProvider);
  const alternative = otherProvider(selectedProvider);
  const alternativeAvailable = availableProviders.includes(alternative);
  const selectedLabel = PROVIDER_LABELS[selectedProvider] || "Authenticator";
  const resetLabel = resetProvider ? PROVIDER_LABELS[resetProvider] : "";

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">KY ERP</div>
        <h1>Kurumsal Giriş</h1>

        {flow.stage === "CREDENTIALS" ? (
          <>
            <p>Parolanız ve iki ayrı Authenticator güvenlik düzeniyle oturum açın.</p>
            <form onSubmit={handleSubmit}>
              <label>
                E-posta veya Kullanıcı Adı
                <input
                  name="username"
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="kullanici veya mail@firma.com"
                />
              </label>
              <label>
                Şifre
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>
                {loading ? "Kontrol ediliyor..." : "Giriş Yap"}
              </button>
            </form>
          </>
        ) : null}

        {flow.stage === "MFA_LEGACY_REQUIRED" ? (
          <>
            <p>
              Eski tek Authenticator kaydınız bulundu. Bu kodu bir kez doğruladıktan sonra Google ve Microsoft kayıtları ayrı ayrı oluşturulacak.
            </p>
            <div className="login-security-box">
              <strong>Güvenli geçiş</strong>
              <span>Mevcut Authenticator kaydı silinmeden önce doğrulanır.</span>
              <span>Ardından Google Authenticator ve Microsoft Authenticator için iki farklı QR oluşturulur.</span>
            </div>
            <form onSubmit={handleMfa}>
              <label>
                Mevcut Authenticator Kodu
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : "Mevcut Kodu Doğrula"}</button>
              <button type="button" className="login-secondary" disabled={loading} onClick={goBackToCredentials}>Geri Dön</button>
            </form>
          </>
        ) : null}

        {flow.stage === "MFA_SETUP" ? (
          <>
            <p>
              <strong>{PROVIDER_LABELS[normalizeProvider(flow.provider)] || flow.providerLabel || "Authenticator"}</strong> ayrı bir KY ERP güvenlik yöntemi olarak kuruluyor.
            </p>
            <div className={`login-security-box login-setup-box provider-${String(flow.provider || "").toLowerCase()}`}>
              <strong>{flow.providerLabel || PROVIDER_LABELS[normalizeProvider(flow.provider)]}</strong>
              <span>1. Telefonunuzda yalnız bu Authenticator uygulamasını açın.</span>
              <span>2. + / Hesap ekle → QR kodu tara seçin.</span>
              <span>3. Aşağıdaki QR kodunu okutun ve oluşan 6 haneli kodu girin.</span>
              <div className="login-qr-shell" aria-label={`${flow.providerLabel || "KY ERP Authenticator"} QR kodu`}>
                <div className="login-qr-code" ref={qrRef} />
              </div>
              <div className="login-qr-help">
                Google ve Microsoft için aynı QR kullanılmaz. Her sağlayıcının kendi ayrı anahtarı ve QR kodu vardır.
              </div>
              {compatibleOtpUri ? (
                <a className="login-auth-link" href={compatibleOtpUri}>
                  Telefonda {flow.providerLabel || "Authenticator"} uygulamasını aç
                </a>
              ) : null}
              {qrError ? <div className="login-error">{qrError}</div> : null}
              <details className="login-manual-setup">
                <summary>QR okunmazsa manuel kurulum anahtarını göster</summary>
                <span>Hesap türü: Zaman tabanlı (TOTP) · 6 hane · 30 saniye</span>
                <code>{flow.secret}</code>
              </details>
            </div>
            <form onSubmit={handleMfa}>
              <label>
                {flow.providerLabel || "Authenticator"} Kodu
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>{loading ? "Doğrulanıyor..." : `${flow.providerLabel || "Authenticator"} Kurulumunu Doğrula`}</button>
              <button type="button" className="login-secondary" disabled={loading} onClick={goBackToCredentials}>Kurulumu İptal Et</button>
            </form>
          </>
        ) : null}

        {flow.stage === "MFA_REQUIRED" ? (
          <>
            <p>Google ve Microsoft kayıtları birbirinden bağımsızdır. Çalışan doğrulama aracını seçin.</p>
            <div className="login-provider-tabs" role="tablist" aria-label="Authenticator seçimi">
              {Object.entries(PROVIDER_LABELS).map(([provider, label]) => {
                const active = selectedProvider === provider;
                const enabled = availableProviders.includes(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    className={`login-provider-tab ${active ? "active" : ""} ${enabled ? "enabled" : "disabled"}`}
                    onClick={() => {
                      if (!enabled) return;
                      setSelectedProvider(provider);
                      setResetProvider("");
                      setCode("");
                      setError("");
                    }}
                    disabled={!enabled || loading}
                  >
                    <span>{label}</span>
                    <small>{enabled ? "Aktif" : "Kurulum gerekli"}</small>
                  </button>
                );
              })}
            </div>

            {resetProvider ? (
              <div className="login-warning-box">
                <strong>{resetLabel} yeniden kurulacak.</strong>
                <span>Önce {selectedLabel} koduyla kimliğinizi doğrulayın. Doğrulama geçerse eski {resetLabel} anahtarı iptal edilip yeni QR üretilecek.</span>
              </div>
            ) : null}

            <form onSubmit={handleMfa}>
              <label>
                {selectedLabel} Kodu
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  disabled={!selectedAvailable}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading || !selectedAvailable}>
                {loading ? "Doğrulanıyor..." : `${selectedLabel} ile Doğrula`}
              </button>

              {alternativeAvailable ? (
                <button
                  type="button"
                  className="login-secondary login-recovery-action"
                  disabled={loading}
                  onClick={() => {
                    setResetProvider(selectedProvider);
                    setSelectedProvider(alternative);
                    setCode("");
                    setError("");
                  }}
                >
                  {selectedLabel}&apos;a erişemiyorum · {PROVIDER_LABELS[alternative]} ile doğrula ve yeniden kur
                </button>
              ) : null}

              {flow.recoveryAvailable ? (
                <button
                  type="button"
                  className="login-link-button"
                  disabled={loading}
                  onClick={() => {
                    setFlow((previous) => ({ ...previous, stage: "RECOVERY_CODE" }));
                    setResetProvider("");
                    setError("");
                  }}
                >
                  İki Authenticator&apos;a da erişemiyorum · Kurtarma kodu kullan
                </button>
              ) : null}

              <button type="button" className="login-secondary" disabled={loading} onClick={goBackToCredentials}>Geri Dön</button>
            </form>
          </>
        ) : null}

        {flow.stage === "RECOVERY_CODE" ? (
          <>
            <p>İki Authenticator&apos;a da erişemiyorsanız daha önce kaydettiğiniz tek kullanımlık KY ERP kurtarma kodlarından birini girin.</p>
            <div className="login-warning-box danger">
              <strong>Kurtarma işlemi iki Authenticator kaydını da yeniler.</strong>
              <span>Doğrulama başarılı olursa eski Google ve Microsoft anahtarları iptal edilir ve iki yeni QR sırayla oluşturulur.</span>
            </div>
            <form onSubmit={handleRecovery}>
              <label>
                Kurtarma Kodu
                <input
                  autoFocus
                  autoComplete="off"
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value.toUpperCase().slice(0, 15))}
                  placeholder="KYERP-ABCD-2345"
                />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>{loading ? "Kontrol ediliyor..." : "Kurtarma Kodunu Doğrula"}</button>
              <button
                type="button"
                className="login-secondary"
                disabled={loading}
                onClick={() => {
                  setFlow((previous) => ({ ...previous, stage: "MFA_REQUIRED" }));
                  setRecoveryCode("");
                  setError("");
                }}
              >
                Authenticator Seçimine Dön
              </button>
            </form>
          </>
        ) : null}

        {flow.stage === "RECOVERY_CODES" ? (
          <div className="login-approval recovery-codes-panel">
            <div className="login-approval-icon">✓</div>
            <h2>Kurtarma Kodlarınız Hazır</h2>
            <p>Telefon sıfırlanır, kaybolur veya iki Authenticator&apos;a da erişemezseniz bu kodlardan biriyle hesabınızı kurtarabilirsiniz.</p>
            <div className="login-recovery-grid">
              {(flow.recoveryCodes || []).map((item) => <code key={item}>{item}</code>)}
            </div>
            <div className="login-warning-box">
              <strong>Bu ekran tekrar gösterilmez.</strong>
              <span>Kodları güvenli bir yere kaydedin. Her kod tek kullanımlıktır ve bir kurtarma işlemi başladığında eski kod seti iptal edilir.</span>
            </div>
            {error ? <div className="login-error">{error}</div> : null}
            <button type="button" className="login-secondary" onClick={copyRecoveryCodes}>{copied ? "Kodlar Kopyalandı" : "Kurtarma Kodlarını Kopyala"}</button>
            <button type="button" disabled={loading} onClick={handleRecoveryCodesAck}>{loading ? "Devam ediliyor..." : "Kodları Kaydettim · Girişe Devam Et"}</button>
          </div>
        ) : null}

        {flow.stage === "APPROVAL_PENDING" ? (
          <div className="login-approval">
            <div className="login-approval-icon">✓</div>
            <h2>Authenticator Onaylandı</h2>
            <p>
              Giriş isteğiniz firma yöneticisine / uygulama yöneticisine gönderildi.
              Onay verildiğinde bu ekran otomatik açılır.
            </p>
            <div className="login-security-box compact">
              <span><strong>Cihaz:</strong> {deviceLabel}</span>
              <span><strong>Oturum:</strong> Onaydan sonra en fazla 8 saat</span>
              <span><strong>Güvenlik:</strong> Yönetici oturumu istediği anda iptal edebilir</span>
            </div>
            {error ? <div className="login-error">{error}</div> : null}
            <button type="button" disabled={loading} onClick={refreshApproval}>Onay Durumunu Kontrol Et</button>
            <button type="button" className="login-secondary" onClick={goBackToCredentials}>Giriş İsteğini Kapat</button>
          </div>
        ) : null}

        {flow.stage === "AUTHENTICATED" ? (
          <div className="login-approval">
            <div className="login-approval-icon">✓</div>
            <h2>Doğrulama Tamamlandı</h2>
            <p>Güvenli oturum açıldı. KY ERP yükleniyor...</p>
          </div>
        ) : null}

        <div className="login-security-note">
          Google ve Microsoft doğrulamaları ayrı anahtarlardır. Birisi bozulursa diğeriyle giriş yapıp sorunlu olanı yeniden kurabilirsiniz. KY ERP oturumları en fazla 8 saat geçerlidir.
        </div>
      </div>
    </div>
  );
}
