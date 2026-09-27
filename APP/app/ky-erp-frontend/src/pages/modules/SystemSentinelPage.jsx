import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, Bot, CirclePower, Clock3, Cpu, HardDrive, KeyRound, Laptop,
  LockKeyhole, MonitorUp, Network, Plus, RefreshCw, RotateCw, ShieldCheck,
  Smartphone, Trash2, UserRoundCog, Wifi, WifiOff, Zap,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  createSystemSentinelGrant,
  enrollSystemSentinelDevice,
  getSystemSentinelOverview,
  listSystemSentinelGrants,
  listSystemSentinelUsers,
  revokeSystemSentinelGrant,
  runSystemSentinelAction,
} from "../../services/systemSentinelApi";
import "./SystemSentinelPage.css";

const ACTION_LABELS = {
  VIEW_STATUS: "Durum",
  REMOTE_VIEW: "Ekranı Gör",
  REMOTE_CONTROL: "Uzak Kontrol",
  WAKE: "Uyandır",
  LOCK: "Kilitle",
  RESTART: "Yeniden Başlat",
  SHUTDOWN: "Kapat",
  SERVICE_RESTART: "Servis Yenile",
  COLLECT_LOGS: "Log Topla",
};
const GRANT_ACTIONS = Object.keys(ACTION_LABELS);

function ago(value) {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) return "Henüz bağlantı yok";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk önce`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} sa önce`;
  return `${Math.floor(seconds / 86400)} gün önce`;
}

function metric(value, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}${suffix}` : "—";
}

function eventLabel(action) {
  return ({
    DEVICE_ENROLLED: "Cihaz kaydedildi",
    DEVICE_UPDATED: "Cihaz güncellendi",
    DEVICE_TOKEN_ROTATED: "Agent anahtarı yenilendi",
    ACCESS_GRANTED: "Erişim yetkisi verildi",
    ACCESS_REVOKED: "Erişim yetkisi kaldırıldı",
    COMMAND_QUEUED: "Komut sıraya alındı",
    COMMAND_COMPLETED: "Komut tamamlandı",
    COMMAND_FAILED: "Komut başarısız",
    REMOTE_SESSION_STARTED: "Uzak oturum başladı",
    REMOTE_SESSION_CLOSED: "Uzak oturum kapandı",
  })[String(action || "").toUpperCase()] || action || "Sistem olayı";
}

function capabilityText(device) {
  const values = [...new Set([...(device.capabilities || []), ...(device.runtimeCapabilities || [])])];
  return values.length ? values.slice(0, 5).join(" · ") : "Temel izleme";
}

export default function SystemSentinelPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [grants, setGrants] = useState([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showGrant, setShowGrant] = useState(false);
  const [enrollment, setEnrollment] = useState(null);
  const [deviceForm, setDeviceForm] = useState({ name: "", macAddress: "", siteKey: "MAIN", bridge: false });
  const [grantForm, setGrantForm] = useState({ userId: "", deviceId: "*", mode: "TEMPORARY", hours: 8, actions: ["VIEW_STATUS", "REMOTE_VIEW", "REMOTE_CONTROL", "WAKE"] });

  const access = overview?.access || {};
  const devices = overview?.devices || [];
  const summary = overview?.summary || { total: 0, online: 0, offline: 0, wakeBridges: 0 };
  const isOwner = Boolean(access.owner);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const data = await getSystemSentinelOverview();
      setOverview(data);
      setError("");
    } catch (requestError) {
      setError(requestError?.message || "Sistem Merkezi yüklenemedi.");
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh(true);
    }, 30000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!isOwner) return;
    Promise.all([listSystemSentinelUsers(), listSystemSentinelGrants()])
      .then(([nextUsers, nextGrants]) => {
        setUsers(Array.isArray(nextUsers) ? nextUsers : nextUsers?.data || []);
        setGrants(Array.isArray(nextGrants) ? nextGrants : []);
      })
      .catch(() => {});
  }, [isOwner]);

  const permittedActions = useMemo(() => new Set(access.actions || []), [access.actions]);

  async function action(device, action, extra = {}) {
    const key = `${device.id}:${action}`;
    setActionBusy(key);
    setNotice("");
    setError("");
    let placeholder = null;
    if (["REMOTE_VIEW", "REMOTE_CONTROL"].includes(action)) placeholder = window.open("about:blank", "_blank");
    try {
      const payload = { ...extra };
      if (["RESTART", "SHUTDOWN"].includes(action)) {
        const accepted = window.confirm(`${device.name || device.id} için ${ACTION_LABELS[action]} işlemini onaylıyor musunuz?`);
        if (!accepted) { placeholder?.close(); return; }
        payload.confirmation = `${action}:${device.id}`;
      }
      const result = await runSystemSentinelAction(device.id, action, payload);
      if (result?.kind === "REMOTE_SESSION" && result.launchUrl) {
        if (placeholder) placeholder.location.replace(result.launchUrl);
        else window.location.assign(result.launchUrl);
        setNotice(`${device.name} uzak oturumu açıldı.`);
      } else {
        placeholder?.close();
        setNotice(`${device.name}: ${ACTION_LABELS[action] || action} isteği gönderildi.`);
      }
      await refresh(true);
    } catch (requestError) {
      placeholder?.close();
      setError(requestError?.message || "İşlem tamamlanamadı.");
    } finally {
      setActionBusy("");
    }
  }

  async function wakeAndConnect(device) {
    const key = `${device.id}:WAKE_CONNECT`;
    const placeholder = window.open("about:blank", "_blank");
    setActionBusy(key);
    setNotice("");
    setError("");
    try {
      await runSystemSentinelAction(device.id, "WAKE", {});
      setNotice(`${device.name} uyandırılıyor. Çevrimiçi olduğunda uzak masaüstü açılacak.`);
      let online = false;
      for (let index = 0; index < 24; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const next = await getSystemSentinelOverview();
        setOverview(next);
        online = Boolean((next?.devices || []).find((item) => item.id === device.id)?.online);
        if (online) break;
      }
      if (!online) throw new Error("Bilgisayar iki dakika içinde çevrimiçi olmadı. Wake Bridge ve BIOS/UEFI ayarını kontrol edin.");
      const remote = await runSystemSentinelAction(device.id, "REMOTE_CONTROL", {});
      if (!remote?.launchUrl) throw new Error("Uzak masaüstü adapteri hazır değil.");
      if (placeholder) placeholder.location.replace(remote.launchUrl);
      else window.location.assign(remote.launchUrl);
    } catch (requestError) {
      placeholder?.close();
      setError(requestError?.message || "Aç ve bağlan işlemi tamamlanamadı.");
    } finally {
      setActionBusy("");
    }
  }

  async function enrollDevice(event) {
    event.preventDefault();
    setActionBusy("ENROLL");
    setError("");
    try {
      const data = await enrollSystemSentinelDevice({
        name: deviceForm.name,
        macAddress: deviceForm.macAddress,
        siteKey: deviceForm.siteKey || "MAIN",
        kind: "WINDOWS_PC",
        capabilities: deviceForm.bridge ? ["WAKE_BRIDGE", "REMOTE_DESKTOP", "SYSTEM_CONTROL"] : ["REMOTE_DESKTOP", "SYSTEM_CONTROL"],
        allowedServices: ["KYERP.PDKS.Agent", "KYERP.FileAgent"],
        remoteAccess: { adapter: "RUSTDESK", fallbackAdapter: "ANYDESK" },
      });
      setEnrollment(data?.enrollment || null);
      setDeviceForm({ name: "", macAddress: "", siteKey: "MAIN", bridge: false });
      await refresh(true);
    } catch (requestError) {
      setError(requestError?.message || "Cihaz kaydedilemedi.");
    } finally {
      setActionBusy("");
    }
  }

  async function createGrant(event) {
    event.preventDefault();
    setActionBusy("GRANT");
    setError("");
    try {
      const expiresAt = grantForm.mode === "TEMPORARY" ? new Date(Date.now() + Math.max(1, Number(grantForm.hours || 8)) * 3600000).toISOString() : null;
      await createSystemSentinelGrant({
        userId: grantForm.userId,
        deviceIds: [grantForm.deviceId],
        actions: grantForm.actions,
        mode: grantForm.mode,
        expiresAt,
      });
      setGrants(await listSystemSentinelGrants());
      setShowGrant(false);
      setNotice("Uzak erişim yetkisi tanımlandı.");
    } catch (requestError) {
      setError(requestError?.message || "Yetki verilemedi.");
    } finally {
      setActionBusy("");
    }
  }

  async function revokeGrant(id) {
    if (!window.confirm("Bu uzak erişim yetkisi kaldırılsın mı?")) return;
    setActionBusy(`GRANT:${id}`);
    try {
      await revokeSystemSentinelGrant(id);
      setGrants(await listSystemSentinelGrants());
      setNotice("Yetki kaldırıldı.");
    } catch (requestError) {
      setError(requestError?.message || "Yetki kaldırılamadı.");
    } finally {
      setActionBusy("");
    }
  }

  if (busy && !overview) return <div className="sentinel-loading"><RefreshCw className="sentinel-spin" /> Sistem Merkezi hazırlanıyor…</div>;

  return (
    <div className="sentinel-page">
      <header className="sentinel-hero">
        <div>
          <span className="sentinel-eyebrow"><ShieldCheck size={16} /> KY ERP Sistem Merkezi</span>
          <h1>Sistem Nöbetçisi</h1>
          <p>Cihazlar, Wake-on-LAN, uzak erişim, sağlık durumu ve güvenli müdahale tek merkezde.</p>
        </div>
        <div className="sentinel-hero-actions">
          <button type="button" className="sentinel-btn ghost" onClick={() => refresh()}><RefreshCw size={16} /> Yenile</button>
          {isOwner ? <button type="button" className="sentinel-btn" onClick={() => setShowEnroll((value) => !value)}><Plus size={16} /> Cihaz Ekle</button> : null}
          {isOwner ? <button type="button" className="sentinel-btn secondary" onClick={() => setShowGrant((value) => !value)}><UserRoundCog size={16} /> Yetki Ver</button> : null}
        </div>
      </header>

      {error ? <div className="sentinel-banner error">{error}</div> : null}
      {notice ? <div className="sentinel-banner success">{notice}</div> : null}

      <section className="sentinel-summary-grid">
        <div className="sentinel-summary-card"><Laptop /><div><strong>{summary.online} / {summary.total}</strong><span>Çevrimiçi cihaz</span></div></div>
        <div className="sentinel-summary-card"><WifiOff /><div><strong>{summary.offline}</strong><span>Çevrimdışı</span></div></div>
        <div className="sentinel-summary-card"><Zap /><div><strong>{summary.wakeBridges}</strong><span>Aktif Wake Bridge</span></div></div>
        <div className="sentinel-summary-card"><Bot /><div><strong>{(overview?.recommendations || []).filter((item) => item.severity === "critical").length}</strong><span>Kritik uyarı</span></div></div>
      </section>

      {(overview?.recommendations || []).length ? (
        <section className="sentinel-recommendations">
          {(overview.recommendations || []).map((item, index) => <div key={`${item.code}-${item.deviceId || index}`} className={`sentinel-recommendation ${item.severity || "warning"}`}><Activity size={17} /><span>{item.message}</span></div>)}
        </section>
      ) : <div className="sentinel-all-good"><ShieldCheck size={18} /> Sistem sağlığı normal.</div>}

      {isOwner && showEnroll ? (
        <section className="sentinel-panel sentinel-form-panel">
          <div className="sentinel-panel-title"><div><h2>Yeni cihaz kaydı</h2><p>Agent anahtarı yalnız bu kayıt işleminde gösterilir.</p></div></div>
          <form onSubmit={enrollDevice} className="sentinel-form-grid">
            <label>Cihaz adı<input required value={deviceForm.name} onChange={(event) => setDeviceForm((row) => ({ ...row, name: event.target.value }))} placeholder="Örn. Desen PC" /></label>
            <label>MAC adresi<input value={deviceForm.macAddress} onChange={(event) => setDeviceForm((row) => ({ ...row, macAddress: event.target.value }))} placeholder="00:D8:61:0E:05:78" /></label>
            <label>Ağ / site<input value={deviceForm.siteKey} onChange={(event) => setDeviceForm((row) => ({ ...row, siteKey: event.target.value }))} placeholder="MAIN" /></label>
            <label className="sentinel-check"><input type="checkbox" checked={deviceForm.bridge} onChange={(event) => setDeviceForm((row) => ({ ...row, bridge: event.target.checked }))} /> Bu cihaz Wake Bridge olarak da çalışsın</label>
            <button className="sentinel-btn" type="submit" disabled={actionBusy === "ENROLL"}>{actionBusy === "ENROLL" ? "Kaydediliyor…" : "Cihazı Kaydet"}</button>
          </form>
          {enrollment ? <div className="sentinel-secret"><KeyRound size={18} /><div><strong>Agent kaydı hazır</strong><code>Agent ID: {enrollment.agentId}</code><code>Token: {enrollment.agentToken}</code><small>Tokenı güvenli agent kurulumunda bir kez kullanın; ekranda tekrar gösterilmez.</small></div></div> : null}
        </section>
      ) : null}

      {isOwner && showGrant ? (
        <section className="sentinel-panel sentinel-form-panel">
          <div className="sentinel-panel-title"><div><h2>Uzak erişim yetkisi</h2><p>Yetki kişi + cihaz + işlem bazlıdır. Normal yönetim rolü verilmez.</p></div></div>
          <form onSubmit={createGrant} className="sentinel-form-grid wide">
            <label>Kullanıcı<select required value={grantForm.userId} onChange={(event) => setGrantForm((row) => ({ ...row, userId: event.target.value }))}><option value="">Seçin</option>{users.map((item) => <option key={item.id} value={item.id}>{item.fullName || item.full_name || item.username}</option>)}</select></label>
            <label>Cihaz<select value={grantForm.deviceId} onChange={(event) => setGrantForm((row) => ({ ...row, deviceId: event.target.value }))}><option value="*">Tüm cihazlar</option>{devices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Süre<select value={grantForm.mode} onChange={(event) => setGrantForm((row) => ({ ...row, mode: event.target.value }))}><option value="TEMPORARY">Geçici</option><option value="ONE_TIME">Tek kullanımlık</option><option value="PERMANENT">Kalıcı</option></select></label>
            {grantForm.mode === "TEMPORARY" ? <label>Saat<input type="number" min="1" max="720" value={grantForm.hours} onChange={(event) => setGrantForm((row) => ({ ...row, hours: event.target.value }))} /></label> : null}
            <div className="sentinel-action-checks">{GRANT_ACTIONS.map((key) => <label key={key}><input type="checkbox" checked={grantForm.actions.includes(key)} onChange={(event) => setGrantForm((row) => ({ ...row, actions: event.target.checked ? [...row.actions, key] : row.actions.filter((item) => item !== key) }))} />{ACTION_LABELS[key]}</label>)}</div>
            <button className="sentinel-btn" type="submit" disabled={actionBusy === "GRANT" || !grantForm.userId || !grantForm.actions.length}>Yetkiyi Kaydet</button>
          </form>
        </section>
      ) : null}

      <section className="sentinel-panel">
        <div className="sentinel-panel-title"><div><h2>Cihazlar</h2><p>Canlı durum ve hızlı müdahale</p></div><span>{devices.length} cihaz</span></div>
        <div className="sentinel-device-grid">
          {devices.length ? devices.map((device) => {
            const cpu = device.metrics?.cpuPercent;
            const ram = device.metrics?.memoryPercent;
            const disk = device.metrics?.diskFreePercent;
            const can = (name) => isOwner || permittedActions.has(name);
            return (
              <article className={`sentinel-device-card ${device.online ? "online" : "offline"}`} key={device.id}>
                <div className="sentinel-device-head">
                  <div className="sentinel-device-icon"><Laptop size={22} /></div>
                  <div><h3>{device.name || device.id}</h3><span className={`sentinel-status ${device.online ? "online" : "offline"}`}>{device.online ? <Wifi size={14} /> : <WifiOff size={14} />}{device.online ? "Çevrimiçi" : "Çevrimdışı"}</span></div>
                  <small>{ago(device.lastSeenAt)}</small>
                </div>
                <div className="sentinel-device-meta"><span><Network size={14} /> {device.siteKey || "MAIN"}</span><span><MonitorUp size={14} /> {device.remoteAccess?.adapter || "Adapter yok"}</span></div>
                <div className="sentinel-metrics"><span><Cpu size={14} /> CPU {metric(cpu, "%")}</span><span><Activity size={14} /> RAM {metric(ram, "%")}</span><span><HardDrive size={14} /> Disk {metric(disk, "% boş")}</span></div>
                <div className="sentinel-capabilities">{capabilityText(device)}</div>
                <div className="sentinel-device-actions">
                  {!device.online && can("WAKE") ? <button disabled={Boolean(actionBusy)} onClick={() => action(device, "WAKE")}><CirclePower size={16} /> Aç / Uyandır</button> : null}
                  {!device.online && can("WAKE") && can("REMOTE_CONTROL") ? <button className="primary" disabled={Boolean(actionBusy)} onClick={() => wakeAndConnect(device)}><Zap size={16} /> Aç ve Bağlan</button> : null}
                  {device.online && can("REMOTE_CONTROL") ? <button className="primary" disabled={Boolean(actionBusy)} onClick={() => action(device, "REMOTE_CONTROL")}><MonitorUp size={16} /> Uzak Masaüstü</button> : null}
                  {device.online && can("LOCK") ? <button disabled={Boolean(actionBusy)} onClick={() => action(device, "LOCK")}><LockKeyhole size={16} /> Kilitle</button> : null}
                  {device.online && can("RESTART") ? <button disabled={Boolean(actionBusy)} onClick={() => action(device, "RESTART")}><RotateCw size={16} /> Yeniden Başlat</button> : null}
                  {device.online && can("SHUTDOWN") ? <button className="danger" disabled={Boolean(actionBusy)} onClick={() => action(device, "SHUTDOWN")}><CirclePower size={16} /> Kapat</button> : null}
                </div>
              </article>
            );
          }) : <div className="sentinel-empty">Henüz cihaz kaydı yok. Süper Yönetici ilk bilgisayarı ekleyebilir.</div>}
        </div>
      </section>

      {isOwner ? (
        <section className="sentinel-panel">
          <div className="sentinel-panel-title"><div><h2>Yetki kayıtları</h2><p>Geçici, tek kullanımlık ve kalıcı erişimler</p></div></div>
          <div className="sentinel-grant-list">{grants.filter((item) => !item.revokedAt).length ? grants.filter((item) => !item.revokedAt).map((grant) => <div className="sentinel-grant" key={grant.id}><div><strong>{grant.userLabel || grant.userId}</strong><span>{(grant.actions || []).map((item) => ACTION_LABELS[item] || item).join(" · ")}</span><small>{grant.mode === "PERMANENT" ? "Kalıcı" : grant.mode === "ONE_TIME" ? "Tek kullanımlık" : `Bitiş: ${new Date(grant.expiresAt).toLocaleString("tr-TR")}`}</small></div><button title="Yetkiyi kaldır" onClick={() => revokeGrant(grant.id)} disabled={actionBusy === `GRANT:${grant.id}`}><Trash2 size={16} /></button></div>) : <div className="sentinel-empty compact">Aktif devredilmiş uzak erişim yetkisi yok.</div>}</div>
        </section>
      ) : null}

      <section className="sentinel-panel">
        <div className="sentinel-panel-title"><div><h2>Son sistem olayları</h2><p>Kim, hangi cihazda, ne zaman işlem yaptı</p></div></div>
        <div className="sentinel-event-list">{(overview?.events || []).slice(0, 20).map((item) => <div className="sentinel-event" key={item.id}><span className="sentinel-event-dot" /><div><strong>{eventLabel(item.action)}</strong><small>{item.deviceId || "Platform"} · {new Date(item.createdAt).toLocaleString("tr-TR")}</small></div></div>)}</div>
      </section>

      <footer className="sentinel-footer"><ShieldCheck size={14} /> Oturum: {user?.fullName || user?.username || "KY ERP"} · Uzak erişim yetkileri bağımsız ve denetlenebilir.</footer>
    </div>
  );
}
