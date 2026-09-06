import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../utils/api";
import {
  getOwnerRecoveryConfig,
  listActiveSessions,
  listLoginApprovals,
  listSecurityAuditLog,
  listUsers,
} from "../../services/adminApi";
import AdminLoginApprovals from "./AdminLoginApprovals";
import AdminMailApprovals from "./AdminMailApprovals";
import "./AdminManagement.css";

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

function browserKey(row = {}) {
  const device = String(row.deviceLabel || "").trim();
  if (!device.startsWith("BROWSER:")) return "";
  return `${row.userId || row.user_id || row.username || "?"}|${device}`;
}

export default function AdminSystemOverview({ activeMainCompany }) {
  const [state, setState] = useState({ system: null, users: [], sessions: [], approvals: [], audit: [], recovery: null, storage: null, delivery: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Yönetim merkezi hazırlanıyor...");

  const load = useCallback(async () => {
    setBusy(true);
    const companyParams = { mainCompanyId: activeMainCompany?.id || "", mainCompanySlug: activeMainCompany?.slug || "" };
    const jobs = await Promise.allSettled([
      apiGet("/system/status", { _ts: Date.now() }),
      listUsers(),
      listActiveSessions(),
      listLoginApprovals(),
      listSecurityAuditLog(80),
      getOwnerRecoveryConfig(),
      apiGet("/admin/file-storage/status", companyParams),
      apiGet("/admin/security/delivery-capabilities", { _ts: Date.now() }),
    ]);
    setState((current) => ({
      ...current,
      system: jobs[0].status === "fulfilled" ? jobs[0].value : current.system,
      users: jobs[1].status === "fulfilled" ? rowsOf(jobs[1].value) : current.users,
      sessions: jobs[2].status === "fulfilled" ? rowsOf(jobs[2].value) : current.sessions,
      approvals: jobs[3].status === "fulfilled" ? rowsOf(jobs[3].value) : current.approvals,
      audit: jobs[4].status === "fulfilled" ? rowsOf(jobs[4].value) : current.audit,
      recovery: jobs[5].status === "fulfilled" ? jobs[5].value : current.recovery,
      storage: jobs[6].status === "fulfilled" ? jobs[6].value : current.storage,
      delivery: jobs[7].status === "fulfilled" ? jobs[7].value : current.delivery,
    }));
    const failed = jobs.filter((job) => job.status === "rejected").length;
    setMessage(failed ? `${failed} kontrol yanıt vermedi; çalışan kontroller gösteriliyor.` : "Tüm yönetim kontrolleri güncel.");
    setBusy(false);
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => {
    const activeUsers = state.users.filter((row) => row.isActive !== false).length;
    const unverified = state.users.filter((row) => row.email && row.emailVerified !== true).length;
    const keys = new Map();
    state.sessions.forEach((row) => { const key = browserKey(row); if (key) keys.set(key, (keys.get(key) || 0) + 1); });
    const duplicateBrowserSessions = [...keys.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
    return { activeUsers, unverified, duplicateBrowserSessions };
  }, [state.sessions, state.users]);

  const system = state.system?.data || state.system || {};
  const storage = state.storage?.data || state.storage || {};
  const delivery = state.delivery?.data || state.delivery || {};
  const recovery = state.recovery?.data || state.recovery || {};

  const recommendations = useMemo(() => {
    const result = [];
    if (metrics.duplicateBrowserSessions) result.push({ severity: "critical", title: "Aynı tarayıcıda birden fazla aktif oturum", detail: `${metrics.duplicateBrowserSessions} fazla oturum bulundu. Tek-browser tek-session koruması kontrol edilmeli.`, action: "Oturumları incele" });
    if (state.approvals.length) result.push({ severity: "warn", title: "Bekleyen giriş onayları", detail: `${state.approvals.length} giriş isteği karar bekliyor.`, action: "Karar Merkezinde İncele" });
    if (metrics.unverified) result.push({ severity: "warn", title: "Doğrulanmamış kullanıcı e-postaları", detail: `${metrics.unverified} kullanıcıda e-posta var ancak doğrulama tamamlanmamış.`, action: "Doğrulama gönder" });
    if (delivery.email === false) result.push({ severity: "warn", title: "E-posta gönderim servisi bağlı değil", detail: "Kayıtlı e-posta tek başına doğrulanmış sayılmaz. Gönderim servisi Worker secret olarak bağlanmalı.", action: "Entegrasyonu tamamla" });
    if (state.recovery && recovery.recoveryEnabled !== true) result.push({ severity: "warn", title: "Süper Yönetici kurtarma güvenliği eksik", detail: "Doğrulanmış iletişim kanalı ve 3 güvenlik sorusu tamamlanmalı.", action: "Kurtarma güvenliğini tamamla" });
    if (state.storage && storage.accessible === false) result.push({ severity: "warn", title: "Dosya depolama kontrol istiyor", detail: "R2 dosya saklama katmanı erişilebilir görünmüyor.", action: "Dosya & Depolama'yı aç" });
    if (!result.length) result.push({ severity: "ok", title: "Kritik yönetim uyarısı yok", detail: "Kullanıcı, oturum, kurtarma ve depolama kontrollerinde acil aksiyon görünmüyor.", action: "İzlemeye devam" });
    return result;
  }, [delivery.email, metrics.duplicateBrowserSessions, metrics.unverified, recovery.recoveryEnabled, state.approvals.length, state.recovery, state.storage, storage.accessible]);

  return (
    <div className="admpro-page">
      <header className="admpro-head"><div><span className="admpro-kicker">PLATFORM YÖNETİMİ / SÜPER YÖNETİCİ</span><h2>KY ERP Süper Yönetim Konsolu</h2><p>Firmalar, kullanıcılar, karar kuyrukları, güvenlik ve platform sağlığı tek kurumsal merkezde.</p></div><div className="admpro-actions"><button type="button" className="primary" onClick={load} disabled={busy}>{busy ? "Kontrol Ediliyor..." : "Tümünü Kontrol Et"}</button></div></header>
      <div className={`admpro-notice ${message.includes("yanıt vermedi") ? "warn" : "success"}`}>{message}</div>
      <section className="admpro-stats"><div className="admpro-stat"><span>Aktif Kullanıcı</span><strong>{metrics.activeUsers}</strong><small>{state.users.length} toplam kullanıcı</small></div><div className="admpro-stat"><span>Aktif Oturum</span><strong>{state.sessions.length}</strong><small>{metrics.duplicateBrowserSessions ? `${metrics.duplicateBrowserSessions} tekrar kontrolü gerekli` : "Tekrarlı browser görünmüyor"}</small></div><div className="admpro-stat"><span>Bekleyen Giriş Onayı</span><strong>{state.approvals.length}</strong><small>Güvenlik karar kuyruğu</small></div><div className="admpro-stat"><span>Doğrulanmamış E-posta</span><strong>{metrics.unverified}</strong><small>Adres var, doğrulama eksik</small></div></section>
      <section className="admpro-grid-2">
        <div className="admpro-card admpro-smart"><div className="admpro-card-head"><div><div className="admpro-smart-title"><b>AI</b><h3>Akıllı Yönetim Kontrolü</h3></div><p>Kurallı sağlık analizi; kritik işlemleri otomatik uygulamaz, güvenli aksiyon önerir.</p></div></div><div className="admpro-health-list">{recommendations.map((item,index)=><div key={`${item.title}-${index}`} className={`admpro-health-item ${item.severity}`}><span className="dot"/><div><strong>{item.title}</strong><small>{item.detail}</small></div>{item.href?<button type="button" className={`admpro-badge ${item.severity==="ok"?"ok":item.severity==="critical"?"bad":"warn"}`} style={{border:0,cursor:"pointer"}} onClick={()=>window.location.assign(item.href)}>{item.action}</button>:<span className={`admpro-badge ${item.severity==="ok"?"ok":item.severity==="critical"?"bad":"warn"}`}>{item.action}</span>}</div>)}</div></div>
        <div className="admpro-card"><div className="admpro-card-head"><div><h3>Sistem Sağlığı</h3><p>D1, R2, e-posta ve kurtarma hazır olma durumu.</p></div></div><div className="admpro-health-list">
          <div className={`admpro-health-item ${system.tables?"ok":"warn"}`}><span className="dot"/><div><strong>Cloud D1</strong><small>{system.tables?`${system.tables} tablo · ${system.documents||0} belge · ${system.personnel||0} personel`:"Sistem durum verisi alınamadı"}</small></div><span className={`admpro-badge ${system.tables?"ok":"warn"}`}>{system.tables?"Hazır":"Kontrol"}</span></div>
          <div className={`admpro-health-item ${storage.accessible?"ok":"warn"}`}><span className="dot"/><div><strong>Cloudflare R2</strong><small>{storage.storageRoot||"Depolama kökü raporlanmadı"}</small></div><span className={`admpro-badge ${storage.accessible?"ok":"warn"}`}>{storage.accessible?"Erişilebilir":"Kontrol"}</span></div>
          <div className={`admpro-health-item ${delivery.email?"ok":"warn"}`}><span className="dot"/><div><strong>E-posta Doğrulama</strong><small>{delivery.email?`${delivery.emailProvider||"Gönderim servisi"} bağlı`:"Gönderim servisi bağlı değil"}</small></div><span className={`admpro-badge ${delivery.email?"ok":"warn"}`}>{delivery.email?"Hazır":"Eksik"}</span></div>
          <div className={`admpro-health-item ${recovery.recoveryEnabled?"ok":"warn"}`}><span className="dot"/><div><strong>Süper Yönetici Kurtarma</strong><small>{recovery.recoveryEnabled?"Kurtarma kanalları aktif":"Kurtarma kurulumu tamamlanmamış"}</small></div><span className={`admpro-badge ${recovery.recoveryEnabled?"ok":"warn"}`}>{recovery.recoveryEnabled?"Hazır":"Kurulum"}</span></div>
        </div></div>
      </section>
      <section className="admpro-card admpro-decision-center">
        <div className="admpro-card-head"><div><h3>Karar Merkezi</h3><p>Giriş ve mail hesabı talepleri aynı karar merkezinde görünür; mail hesabı kararı ilgili firma sahibi / işveren tarafından verilir.</p></div></div>
        <AdminLoginApprovals compact />
        <div style={{ height: 16 }} />
        <AdminMailApprovals compact />
      </section>
      <section className="admpro-card"><div className="admpro-card-head"><div><h3>Son Güvenlik Hareketleri</h3><p>Giriş, oturum ve yönetici güvenliğiyle ilgili son olaylar.</p></div></div><div className="admpro-table"><table><thead><tr><th>Zaman</th><th>İşlem</th><th>Uygulayan</th><th>Hedef</th><th>IP</th></tr></thead><tbody>{state.audit.slice(0,12).map((row)=><tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.action||"-"}</td><td>{row.actorName||"Sistem"}</td><td>{row.targetName||"-"}</td><td>{row.ipAddress||"-"}</td></tr>)}{!state.audit.length?<tr><td colSpan="5">Güvenlik hareketi alınamadı veya kayıt yok.</td></tr>:null}</tbody></table></div></section>
    </div>
  );
}
