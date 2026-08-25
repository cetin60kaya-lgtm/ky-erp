import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginPage.css";

function normalizeCredential(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
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

    // Google Authenticator yeni surumlerinde en sorunsuz bicim:
    // issuer ve hesap ayri encode edilir, aradaki ':' literal kalir.
    // Microsoft Authenticator da ayni standart TOTP URI'sini kabul eder.
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    return `${prefix}${label}${query ? `?${query}` : ""}`;
  } catch {
    return raw;
  }
}

export default function LoginPage() {
  const { login, verifyMfa, checkApproval } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [flow, setFlow] = useState({ stage: "CREDENTIALS" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");
  const qrRef = useRef(null);
  const deviceLabel = useMemo(() => deviceName(), []);
  const compatibleOtpUri = useMemo(
    () => authenticatorCompatibleUri(flow.otpauthUri),
    [flow.otpauthUri],
  );

  useEffect(() => {
    document.title = "KY ERP | Kurumsal Giriş";

    // Oturum açılmadan hiçbir iç modül yolu adres çubuğunda görünmesin.
    // kyerp.net veya app.kyerp.net hangi deep-link ile açılırsa açılsın
    // güvenli giriş ekranı kök adreste kalır. Giriş tamamlanınca AppV3
    // yetkili kullanıcının gerçek modül yolunu yeniden yazar.
    if (window.location.pathname !== "/") {
      window.history.replaceState(
        {},
        "",
        `/${window.location.search}${window.location.hash}`,
      );
    }
  }, []);

  function applyResponse(response) {
    const stage = String(response?.stage || "").toUpperCase();
    if (!stage) return;
    if (stage === "AUTHENTICATED") {
      setFlow({ stage: "AUTHENTICATED" });
      setCode("");
      setError("");
      return;
    }
    setFlow({ ...response, stage });
    setCode("");
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
      });
      applyResponse(response);
    } catch (requestError) {
      setError(requestError?.message || "Authenticator doğrulaması başarısız oldu.");
    } finally {
      setLoading(false);
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

    // Normalde AuthProvider state degisimi LoginPage'i hemen unmount eder.
    // Herhangi bir render zamanlama sorununda eski MFA ekraninda kalmak yerine
    // sessionStorage'a yazilmis imzali oturumu yeniden yukleyerek uygulamayi ac.
    const timer = window.setTimeout(() => {
      window.location.replace(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
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

    return () => {
      holder.replaceChildren();
    };
  }, [compatibleOtpUri, flow.stage]);

  useEffect(() => {
    if (flow.stage !== "APPROVAL_PENDING") return undefined;
    const timer = window.setInterval(refreshApproval, 3000);
    return () => window.clearInterval(timer);
    // approval kimliği değişince yeni sayaç kurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.stage, flow.approvalId, flow.approvalToken]);

  const isMfa = flow.stage === "MFA_SETUP" || flow.stage === "MFA_REQUIRED";

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">KY ERP</div>
        <h1>Kurumsal Giriş</h1>

        {flow.stage === "CREDENTIALS" ? (
          <>
            <p>Parolanız ve Authenticator doğrulamasıyla güvenli oturum açın.</p>
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

        {isMfa ? (
          <>
            <p>
              {flow.stage === "MFA_SETUP"
                ? "İlk güvenli girişiniz. Google Authenticator veya Microsoft Authenticator'dan birini kullanabilirsiniz."
                : "Kurulu Authenticator uygulamasındaki güncel 6 haneli kodu girin."}
            </p>

            {flow.stage === "MFA_SETUP" ? (
              <div className="login-security-box login-setup-box">
                <strong>Google / Microsoft Authenticator</strong>
                <span>Telefonunuzda hangisi yüklüyse onu kullanın. İkisini birden kurmanız gerekmez.</span>
                <span>1. Authenticator uygulamasını açın.</span>
                <span>2. + / Hesap ekle → QR kodu tara seçin.</span>
                <span>3. Aşağıdaki QR kodunu okutun. KY ERP için 6 haneli kod otomatik oluşur.</span>

                <div className="login-qr-shell" aria-label="KY ERP Authenticator QR kodu">
                  <div className="login-qr-code" ref={qrRef} />
                </div>

                <div className="login-qr-help">
                  Google Authenticator'da daha önce eklenmiş eski bir KY ERP hesabı varsa önce onu silin, sonra bu yeni QR kodunu okutun. Microsoft Authenticator için de aynı QR geçerlidir.
                </div>
                {compatibleOtpUri ? (
                  <a className="login-auth-link" href={compatibleOtpUri}>
                    Telefonda yüklü Authenticator uygulamasını aç
                  </a>
                ) : null}
                {qrError ? <div className="login-error">{qrError}</div> : null}

                <details className="login-manual-setup">
                  <summary>QR okunmazsa manuel kurulum anahtarını göster</summary>
                  <span>Hesap türü: Zaman tabanlı (TOTP) · 6 hane · 30 saniye</span>
                  <code>{flow.secret}</code>
                </details>
              </div>
            ) : null}

            <form onSubmit={handleMfa}>
              <label>
                Google / Microsoft Authenticator Kodu
                <input
                  autoFocus={flow.stage === "MFA_REQUIRED"}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
              </label>
              {error ? <div className="login-error">{error}</div> : null}
              <button type="submit" disabled={loading}>
                {loading ? "Doğrulanıyor..." : "Authenticator'ı Doğrula"}
              </button>
              <button
                type="button"
                className="login-secondary"
                disabled={loading}
                onClick={() => {
                  setFlow({ stage: "CREDENTIALS" });
                  setCode("");
                  setError("");
                  setQrError("");
                }}
              >
                Geri Dön
              </button>
            </form>
          </>
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
            <button type="button" disabled={loading} onClick={refreshApproval}>
              Onay Durumunu Kontrol Et
            </button>
            <button
              type="button"
              className="login-secondary"
              onClick={() => {
                setFlow({ stage: "CREDENTIALS" });
                setPassword("");
                setError("");
              }}
            >
              Giriş İsteğini Kapat
            </button>
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
          KY ERP oturumları en fazla 8 saat geçerlidir. Parola tek başına uygulamaya erişim sağlamaz.
        </div>
      </div>
    </div>
  );
}
