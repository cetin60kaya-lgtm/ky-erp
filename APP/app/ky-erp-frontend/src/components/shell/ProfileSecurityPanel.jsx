import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import { apiGet, apiPost } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import "./profile-security-panel.css";

function rowsOf(value) {
  const data = value?.data ?? value;
  return Array.isArray(data) ? data : [];
}

function dateText(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("tr-TR");
}

function friendlyDevice(row = {}) {
  const label = String(row.deviceLabel || "").trim();
  if (label && !label.startsWith("BROWSER:")) return label;
  const ua = String(row.userAgent || "");
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Tarayıcı";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : "";
  return [browser, os].filter(Boolean).join(" / ") || "Tarayıcı";
}

export default function ProfileSecurityPanel({ onClose, onOpenPhoneApproval }) {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const activeCount = useMemo(() => sessions.length, [sessions]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await apiGet("/auth/security/sessions", { _ts: Date.now() });
      setSessions(rowsOf(result));
    } catch (error) {
      setMessage(error?.message || "Oturumlar alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revoke(row) {
    if (!row?.id || busyId) return;
    setBusyId(row.id);
    setMessage("");
    try {
      const result = await apiPost(`/auth/security/sessions/${encodeURIComponent(row.id)}/revoke`, {});
      const current = Boolean(result?.data?.current ?? result?.current ?? row.current);
      if (current) {
        await logout();
        return;
      }
      setMessage("Seçilen oturum güvenli şekilde kapatıldı.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Oturum kapatılamadı.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="profile-security-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="profile-security-panel" role="dialog" aria-modal="true" aria-label="Profil ve giriş güvenliği">
        <header>
          <div>
            <small>KY ERP · PROFİL VE GÜVENLİK</small>
            <h2>{user?.fullName || user?.username || "Kullanıcı"}</h2>
            <p>Kendi aktif oturumlarınızı ve güvenilir telefonunuzu buradan yönetin.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat"><X size={19}/></button>
        </header>

        <div className="profile-security-summary">
          <div><ShieldCheck size={18}/><span><strong>{activeCount}</strong><small>Aktif oturum</small></span></div>
          <button type="button" onClick={onOpenPhoneApproval}><Smartphone size={17}/>Telefon Onayı</button>
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""}/>Yenile</button>
        </div>

        {message ? <div className="profile-security-message">{message}</div> : null}

        <div className="profile-security-session-list">
          {loading && !sessions.length ? <div className="profile-security-empty">Oturumlar kontrol ediliyor...</div> : null}
          {!loading && !sessions.length ? <div className="profile-security-empty">Aktif oturum bulunamadı.</div> : null}
          {sessions.map((row) => (
            <article key={row.id} className={row.current ? "current" : ""}>
              <div>
                <strong>{friendlyDevice(row)}</strong>
                <span>{row.current ? "Bu cihaz" : "Diğer cihaz"}{row.ipAddress ? ` · ${row.ipAddress}` : ""}</span>
                <small>Oluşturma: {dateText(row.createdAt)}</small>
                <small>Son görülme: {dateText(row.lastSeenAt)}</small>
              </div>
              <button type="button" className="danger" disabled={Boolean(busyId)} onClick={() => revoke(row)}>
                <LogOut size={16}/>{busyId === row.id ? "Kapatılıyor..." : row.current ? "Güvenli Çıkış" : "Oturumu Kapat"}
              </button>
            </article>
          ))}
        </div>

        <footer>
          <span>Her kullanıcı yalnız kendi oturumlarını görür. Süper Yönetici tüm sistem oturumlarını yönetebilir.</span>
          <button type="button" onClick={onClose}>Kapat</button>
        </footer>
      </section>
    </div>
  );
}
