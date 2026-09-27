import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { approveLogin, denyLogin, listLoginApprovals } from "../../services/adminApi";
import "./AdminLoginApprovals.css";

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function canonicalRole(value) {
  return String(value || "").trim().toUpperCase().replace(/İ/g, "I");
}

function dateText(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

function remainingText(value) {
  if (!value) return "-";
  const ms = Date.parse(value) - Date.now();
  if (!Number.isFinite(ms)) return "-";
  if (ms <= 0) return "Süresi doldu";
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `${minutes} dk`;
}

function deviceText(row) {
  return String(row?.deviceLabel || "").trim() || "Yeni / tanımsız cihaz";
}

export default function AdminLoginApprovals({ compact = false }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Bekleyen giriş istekleri kontrol ediliyor...");
  const role = canonicalRole(user?.role);
  const owner = ["SUPER_ADMIN", "ADMIN"].includes(role);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const rows = rowsOf(await listLoginApprovals());
      setItems(rows);
      setMessage(rows.length
        ? `${rows.length} giriş isteği karar bekliyor.`
        : "Bekleyen giriş onayı yok.");
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Bekleyen giriş istekleri alınamadı."}`);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ silent: true }), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => Date.parse(a.requestedAt || 0) - Date.parse(b.requestedAt || 0)), [items]);

  async function decide(row, decision) {
    if (!row?.id || busyId) return;
    const approving = decision === "APPROVE";
    setBusyId(row.id);
    try {
      if (approving) await approveLogin(row.id);
      else await denyLogin(row.id);
      setItems((current) => current.filter((item) => String(item.id) !== String(row.id)));
      setMessage(`${row.fullName || row.username || "Kullanıcı"} giriş isteği ${approving ? "ONAYLANDI" : "REDDEDİLDİ"}.`);
      window.setTimeout(() => load({ silent: true }), 800);
    } catch (error) {
      setMessage(`Hata: ${error?.message || (approving ? "Giriş onaylanamadı." : "Giriş reddedilemedi.")}`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className={`ala-page ${compact ? "is-compact" : ""}`}>
      <header className="ala-head">
        <div>
          <span className="ala-kicker">KARAR MERKEZİ / GİRİŞ GÜVENLİĞİ</span>
          <h2>Bekleyen Giriş Onayları</h2>
          <p>{owner ? "Süper Yönetici tüm firmalardaki giriş isteklerini gözetir ve yönetir." : "Firma Sahibi / İşveren yalnız kendi firmasındaki kullanıcı girişlerini yönetebilir."}</p>
        </div>
        <div className="ala-head-actions">
          <span className={`ala-count ${sortedItems.length ? "has-items" : ""}`}>{sortedItems.length} bekleyen</span>
          <button type="button" onClick={() => load()} disabled={loading || Boolean(busyId)}>{loading ? "Kontrol Ediliyor..." : "Yenile"}</button>
        </div>
      </header>

      <div className={`ala-notice ${String(message).startsWith("Hata:") ? "is-error" : sortedItems.length ? "is-warn" : "is-ok"}`}>{message}</div>

      {!sortedItems.length ? (
        <div className="ala-empty">
          <strong>Şu anda karar bekleyen giriş yok.</strong>
          <span>Yeni cihaz girişi geldiğinde bu ekran otomatik olarak yaklaşık 10 saniye içinde güncellenir.</span>
        </div>
      ) : (
        <div className="ala-list">
          {sortedItems.map((row) => (
            <article className="ala-card" key={row.id}>
              <div className="ala-user">
                <div className="ala-avatar">{String(row.fullName || row.username || "K").trim().slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{row.fullName || row.username || "Kullanıcı"}</strong>
                  <span>@{row.username || "-"}{row.email ? ` · ${row.email}` : ""}</span>
                </div>
              </div>

              <div className="ala-grid">
                <div><span>Firma</span><strong>{row.mainCompanySlug || "-"}</strong></div>
                <div><span>Cihaz</span><strong>{deviceText(row)}</strong></div>
                <div><span>IP</span><strong>{row.ipAddress || "-"}</strong></div>
                <div><span>İstek zamanı</span><strong>{dateText(row.requestedAt)}</strong></div>
                <div><span>Kalan süre</span><strong>{remainingText(row.expiresAt)}</strong></div>
              </div>

              <div className="ala-actions">
                <button type="button" className="deny" disabled={Boolean(busyId)} onClick={() => decide(row, "DENY")}>{busyId === row.id ? "İşleniyor..." : "Reddet"}</button>
                <button type="button" className="approve" disabled={Boolean(busyId)} onClick={() => decide(row, "APPROVE")}>{busyId === row.id ? "İşleniyor..." : "Girişi Onayla"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
