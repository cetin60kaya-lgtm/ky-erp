import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listActiveSessions, listSessionHistory, listUsers, revokeAllUserSessions, revokeSession } from "../../services/adminApi";
import "./AdminUserSessionsScoped.css";

const roleOf = (value) => String(value || "").trim().toUpperCase().replace(/İ/g, "I");
const canManageSessions = (role) => ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(roleOf(role));
const rowsOf = (value) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const dateText = (value) => { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR"); };

function deviceText(row) {
  const label = String(row?.deviceLabel || row?.device_label || "");
  if (label && !label.startsWith("BROWSER:")) return label;
  const ua = String(row?.userAgent || row?.user_agent || "");
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Tarayıcı";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : "";
  return [browser, os].filter(Boolean).join(" / ");
}

export default function AdminUserSessionsScoped() {
  const { user: currentUser } = useAuth();
  const manager = canManageSessions(currentUser?.role);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Oturum merkezi hazırlanıyor...");

  const load = useCallback(async () => {
    if (!manager) {
      setMessage("Oturum sonlandırma yalnız uygulama sahibi veya firma sahibine açıktır.");
      return;
    }
    setBusy(true);
    try {
      const [userRows, activeRows, historyRows] = await Promise.all([listUsers(), listActiveSessions(), listSessionHistory(300)]);
      const list = rowsOf(userRows);
      setUsers(list);
      setSessions(rowsOf(activeRows));
      setHistory(rowsOf(historyRows));
      setSelectedId((current) => list.some((row) => String(row.id) === String(current)) ? current : String(list[0]?.id || ""));
      setMessage("Seçili kullanıcının oturumları güncel.");
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Oturum bilgileri alınamadı."}`);
    } finally { setBusy(false); }
  }, [manager]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => users.find((row) => String(row.id) === String(selectedId)) || null, [users, selectedId]);
  const selectedSessions = useMemo(() => sessions.filter((row) => String(row.userId || row.user_id || "") === String(selectedId)), [sessions, selectedId]);
  const selectedHistory = useMemo(() => history.filter((row) => String(row.userId || row.user_id || "") === String(selectedId)), [history, selectedId]);

  async function closeOne(row) {
    if (!row?.id || !manager) return;
    setBusy(true);
    try { await revokeSession(row.id); setMessage("Seçili oturum sonlandırıldı."); await load(); }
    catch (error) { setMessage(`Hata: ${error?.message || "Oturum sonlandırılamadı."}`); }
    finally { setBusy(false); }
  }

  async function closeAll() {
    if (!selected?.id || !manager) return;
    setBusy(true);
    try { await revokeAllUserSessions(selected.id); setMessage(`${selected.fullName || selected.username} için tüm oturumlar sonlandırıldı.`); await load(); }
    catch (error) { setMessage(`Hata: ${error?.message || "Oturumlar sonlandırılamadı."}`); }
    finally { setBusy(false); }
  }

  if (!manager) return null;

  return <section className="auss-card">
    <div className="auss-head">
      <div><small>YÖNETİM / KULLANICI OTURUMLARI</small><h2>Seçili Kullanıcının Oturumları</h2><p>Firma sahibi yalnız kendi firmasındaki kullanıcıları; uygulama sahibi tüm firmaları yönetir. Yetki API tarafında da doğrulanır.</p></div>
      <button type="button" onClick={load} disabled={busy}>Yenile</button>
    </div>
    <div className={`auss-message ${message.startsWith("Hata:") ? "bad" : ""}`}>{message}</div>
    <div className="auss-toolbar">
      <label>Kullanıcı<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{users.map((row) => <option key={row.id} value={row.id}>{row.fullName || row.username} · @{row.username}</option>)}</select></label>
      <button type="button" className="danger" onClick={closeAll} disabled={busy || !selectedId || !selectedSessions.length}>Bu Kullanıcının Tüm Oturumlarını Sonlandır</button>
    </div>
    <div className="auss-table">
      <div className="auss-row head"><span>Cihaz</span><span>Oluşturma</span><span>Son Görülme</span><span>İşlem</span></div>
      {selectedSessions.map((row) => <div className="auss-row" key={row.id}><span>{deviceText(row)}</span><span>{dateText(row.createdAt || row.created_at)}</span><span>{dateText(row.lastSeenAt || row.last_seen_at)}</span><span><button type="button" className="danger" disabled={busy} onClick={() => closeOne(row)}>Oturumu Sonlandır</button></span></div>)}
      {!selectedSessions.length && <div className="auss-empty">Seçili kullanıcının aktif oturumu yok.</div>}
    </div>
    <div className="auss-history"><h3>Seçili Kullanıcının Oturum Geçmişi</h3>{selectedHistory.slice(0, 20).map((row, index) => <div key={row.id || index}><b>{row.action || row.status || "Oturum"}</b><span>{dateText(row.createdAt || row.created_at || row.updatedAt)}</span></div>)}{!selectedHistory.length && <p>Kayıt yok.</p>}</div>
  </section>;
}
