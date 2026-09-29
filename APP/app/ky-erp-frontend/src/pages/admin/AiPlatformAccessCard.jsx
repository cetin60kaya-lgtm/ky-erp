import { useEffect, useMemo, useState } from "react";
import { getAiPlatformAccess, updateAiPlatformAccess } from "../../services/adminApi";
import "./AiPlatformAccessCard.css";

const PLATFORMS = [
  ["GPT", "GPT / ChatGPT", "OpenAI ChatGPT ve özel MCP uygulaması"],
  ["GEMINI", "Gemini", "Gemini Spark veya Gemini CLI MCP bağlantısı"],
  ["COPILOT", "Copilot", "Microsoft Copilot Studio MCP bağlantısı"],
];
const emptyRow = () => ({ enabled: false, readEnabled: true, writeEnabled: false, approveEnabled: false });
const normalize = (value = {}) => Object.fromEntries(
  PLATFORMS.map(([key]) => [key, { ...emptyRow(), ...(value?.[key] || {}) }]),
);

export default function AiPlatformAccessCard({ userId, email, emailVerified, disabled = false, onMessage }) {
  const [platforms, setPlatforms] = useState(() => normalize());
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError("");
    if (!userId) return () => { cancelled = true; };
    getAiPlatformAccess(userId)
      .then((data) => {
        if (!cancelled) {
          setPlatforms(normalize(data?.platforms));
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "AI platform yetkileri alınamadı.");
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [userId]);

  const hasExternalAccess = useMemo(
    () => Object.values(platforms).some((row) => row.enabled),
    [platforms],
  );

  function change(key, field, checked) {
    if (disabled || !emailVerified) return;
    setPlatforms((current) => ({
      ...current,
      [key]: { ...current[key], [field]: checked },
    }));
  }
  async function save() {
    if (!userId || disabled) return;
    if (!emailVerified && hasExternalAccess) {
      const text = "E-posta doğrulanmadan dış AI platform erişimi açılamaz.";
      setError(text);
      onMessage?.(`Hata: ${text}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await updateAiPlatformAccess(userId, { platforms });
      setPlatforms(normalize(data?.platforms));
      onMessage?.("GPT, Gemini ve Copilot erişim yetkileri kaydedildi.");
    } catch (err) {
      const text = err?.message || "AI platform yetkileri kaydedilemedi.";
      setError(text);
      onMessage?.(`Hata: ${text}`);
    } finally {
      setBusy(false);
    }
  }

  return <section className="ai-access-card">
    <div className="ai-access-head">
      <div>
        <small>CHAT / KOMUT MERKEZİ</small>
        <h3>GPT · Gemini · Copilot</h3>
        <p>Dış sohbet platformları kullanıcı bazında açılır. Modül yetkileri her zaman üst sınırdır; buradaki seçimler yeni ERP yetkisi vermez.</p>
      </div>
      <button type="button" className="auc2-primary" disabled={busy || disabled || !loaded} onClick={save}>
        Platform Yetkilerini Kaydet
      </button>
    </div>

    <div className={`ai-access-identity ${emailVerified ? "is-ok" : "is-warn"}`}>
      <span>{email || "E-posta kayıtlı değil"}</span>
      <b>{emailVerified ? "Doğrulanmış ERP e-postası" : "Önce ERP e-postasını doğrulayın"}</b>
    </div>

    {error && <div className="ai-access-error">{error}</div>}

    <div className="ai-access-grid">
      {PLATFORMS.map(([key, label, description]) => {
        const row = platforms[key] || emptyRow();
        return <article className={`ai-platform ${row.enabled ? "is-enabled" : ""}`} key={key}>
          <div className="ai-platform-title">
            <div><strong>{label}</strong><small>{description}</small></div>
            <label className="ai-switch">
              <input type="checkbox" checked={Boolean(row.enabled)} disabled={disabled || !emailVerified} onChange={(e) => change(key, "enabled", e.target.checked)}/>
              <span>{row.enabled ? "Açık" : "Kapalı"}</span>
            </label>
          </div>
          <div className="ai-platform-rights">
            <label><input type="checkbox" checked={Boolean(row.readEnabled)} disabled={disabled || !emailVerified || !row.enabled} onChange={(e) => change(key, "readEnabled", e.target.checked)}/> Oku</label>
            <label><input type="checkbox" checked={Boolean(row.writeEnabled)} disabled={disabled || !emailVerified || !row.enabled} onChange={(e) => change(key, "writeEnabled", e.target.checked)}/> Yaz</label>
            <label><input type="checkbox" checked={Boolean(row.approveEnabled)} disabled={disabled || !emailVerified || !row.enabled} onChange={(e) => change(key, "approveEnabled", e.target.checked)}/> Onay</label>
          </div>
        </article>;
      })}
    </div>

    <div className="ai-access-note">
      Yazma komutları ayrıca işlem onayı ister. Silme, resmî belge gönderimi ve güvenlik aksiyonları güçlü onay akışından geçer. Paylaşılan sohbet yönetici yetkisini karşı tarafa taşımaz.
    </div>
  </section>;
}
