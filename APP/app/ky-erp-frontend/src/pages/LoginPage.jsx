import { useEffect, useMemo, useState } from "react";
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

export default function LoginPage() {
  const { login, verifyMfa, checkApproval } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [flow, setFlow] = useState({ stage: "CREDENTIALS" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const deviceLabel = useMemo(() => deviceName(), []);

  function applyResponse(response) {
    const stage = String(response?.stage || "").toUpperCase();
    if (!stage || stage === "AUTHENTICATED") return;
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
                ? "İlk güvenli girişiniz. KY ERP hesabını Google Authenticator veya Microsoft Authenticator'a ekleyin."
                : "Authenticator uygulamanızdaki güncel 6 haneli kodu girin."}
            </p>

            {flow.stage === "MFA_SETUP" ? (
              <div className="login-security-box">
                <strong>Authenticator kurulumu</strong>
                <span>1. Google Authenticator veya Microsoft Authenticator'ı açın.</span>
                <span>2. Hesap ekle → Kurulum anahtarı seçin.</span>
                <span>3. Aşağıdaki anahtarı girin ve zaman tabanlı kodu seçin.</span>
                <code>{flow.secret}</code>
                {flow.otpauthUri ? (
                  <a className="login-auth-link" href={flow.otpauthUri}>
                    Telefonda Authenticator ile aç
                  </a>
                ) : null}
              </div>
            ) : null}

            <form onSubmit={handleMfa}>
              <label>
                6 Haneli Authenticator Kodu
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

        <div className="login-security-note">
          KY ERP oturumları en fazla 8 saat geçerlidir. Parola tek başına uygulamaya erişim sağlamaz.
        </div>
      </div>
    </div>
  );
}
