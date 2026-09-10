import { useEffect, useMemo, useState } from "react";
import {
  decideSecurityCenterLoginApproval,
  getSecurityCenterOverview,
  getSecurityNotificationPreferences,
  listSecurityCapabilityGrants,
  listSecurityCenterAudit,
  listSecurityCenterLoginApprovals,
  listSecurityCenterSessions,
  listSecurityGrantUsers,
  runPhoneApprovedSecurityAction,
  saveSecurityNotificationPreferences,
} from "../../services/securityCenterApi";
import "./SecurityCenterPanel.css";

const CAPABILITIES = [
  ["LOGIN_APPROVE", "Giriş onayı"],
  ["SESSION_VIEW", "Oturum görüntüleme"],
  ["SESSION_APPROVE", "Oturum güven onayı"],
  ["SESSION_CLOSE", "Oturum kapatma"],
  ["AUDIT_VIEW", "Güvenlik logu"],
];
const PREFS = [
  ["ownLogins", "Kendi girişlerim"],
  ["companyLoginRequests", "Firma giriş istekleri"],
  ["newSession", "Yeni oturum"],
  ["suspiciousLogin", "Şüpheli giriş"],
  ["newDevice", "Yeni cihaz"],
  ["sessionClosed", "Oturum kapatma"],
  ["permissionChange", "Güvenlik yetkisi değişikliği"],
  ["securityProblem", "Güvenlik problemi"],
];

const rows = (value) => Array.isArray(value) ? value : [];
const dateText = (value) => { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR"); };
const scopeLabel = (value) => value === "SYSTEM" ? "Tüm Sistem" : value === "COMPANY" ? "Firma Kapsamı" : "Kendi Hesabım";
const trustLabel = (value) => ({ TRUSTED: "Güvenilir", REJECTED: "Reddedildi", SUSPICIOUS: "Şüpheli", UNREVIEWED: "İncelenmedi" }[String(value || "").toUpperCase()] || value || "-");
const messageOf = (error, fallback) => error?.message || error?.response?.data?.error?.message || fallback;

export default function SecurityCenterPanel() {
  const [tab, setTab] = useState("approvals");
  const [overview, setOverview] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [preferences, setPreferences] = useState({});
  const [users, setUsers] = useState([]);
  const [grants, setGrants] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCaps, setSelectedCaps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("KY Güvenlik Merkezi yükleniyor...");
  const [filter, setFilter] = useState("");

  const scopeType = overview?.scopeType || "SELF";
  const capabilities = overview?.capabilities || [];
  const canManage = scopeType !== "SELF";
  const canSessionApprove = scopeType === "SYSTEM" || capabilities.includes("SESSION_APPROVE");
  const canSessionClose = scopeType === "SYSTEM" || capabilities.includes("SESSION_CLOSE");
  const canApproveLogin = scopeType === "SYSTEM" || capabilities.includes("LOGIN_APPROVE");
  const selectedUser = users.find((row) => String(row.id) === String(selectedUserId));

  const filteredAudit = useMemo(() => {
    const query = String(filter || "").trim().toLocaleLowerCase("tr-TR");
    if (!query) return audit;
    return audit.filter((row) => [row.label, row.action, row.actorName, row.targetName, row.mainCompanySlug, row.ipAddress, row.deviceLabel].some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(query)));
  }, [audit, filter]);

  async function loadAll() {
    setBusy(true);
    try {
      const base = await getSecurityCenterOverview();
      setOverview(base || {});
      const requests = [
        listSecurityCenterSessions(),
        listSecurityCenterAudit(300),
        listSecurityCenterLoginApprovals(),
        getSecurityNotificationPreferences(),
      ];
      if (base?.scopeType !== "SELF") requests.push(listSecurityGrantUsers(), listSecurityCapabilityGrants());
      const result = await Promise.allSettled(requests);
      setSessions(result[0].status === "fulfilled" ? rows(result[0].value) : []);
      setAudit(result[1].status === "fulfilled" ? rows(result[1].value) : []);
      setApprovals(result[2].status === "fulfilled" ? rows(result[2].value) : []);
      setPreferences(result[3].status === "fulfilled" ? result[3].value || {} : {});
      if (base?.scopeType !== "SELF") {
        setUsers(result[4]?.status === "fulfilled" ? rows(result[4].value) : []);
        setGrants(result[5]?.status === "fulfilled" ? rows(result[5].value) : []);
      } else { setUsers([]); setGrants([]); }
      setMessage("KY Güvenlik Merkezi güncel.");
    } catch (error) {
      setMessage(`Hata: ${messageOf(error, "Güvenlik Merkezi yüklenemedi.")}`);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadAll(); }, []);

  async function approveLogin(row, decision) {
    setBusy(true);
    try {
      await decideSecurityCenterLoginApproval(row.id, decision);
      setMessage(decision === "DENY" ? "Giriş isteği reddedildi." : "Giriş isteği onaylandı.");
      await loadAll();
    } catch (error) { setMessage(`Hata: ${messageOf(error, "Giriş kararı uygulanamadı.")}`); }
    finally { setBusy(false); }
  }

  async function critical(payload, successMessage) {
    setBusy(true);
    try {
      setMessage("KY Güvenlik telefonuna kritik işlem onayı gönderildi. Telefonda onaylayın...");
      await runPhoneApprovedSecurityAction(payload);
      setMessage(successMessage);
      await loadAll();
    } catch (error) { setMessage(`Hata: ${messageOf(error, "Güvenlik işlemi tamamlanamadı.")}`); }
    finally { setBusy(false); }
  }

  async function savePreferences() {
    setBusy(true);
    try { await saveSecurityNotificationPreferences(preferences); setMessage("Bildirim tercihleri kaydedildi."); }
    catch (error) { setMessage(`Hata: ${messageOf(error, "Bildirim tercihleri kaydedilemedi.")}`); }
    finally { setBusy(false); }
  }

  function chooseUser(id) {
    setSelectedUserId(id);
    const grant = grants.find((row) => String(row.userId) === String(id));
    setSelectedCaps(grant?.capabilities || []);
  }

  function toggleCap(capability) {
    setSelectedCaps((current) => current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability]);
  }

  async function saveGrant() {
    if (!selectedUser) return setMessage("Hata: Yetki verilecek kullanıcıyı seçin.");
    return critical({ operation: "SECURITY_CAPABILITY_SET", targetUserId: selectedUser.id, companySlug: selectedUser.mainCompanySlug || overview?.companySlug, capabilities: selectedCaps }, selectedCaps.length ? "Güvenlik yetkileri telefondan doğrulanarak kaydedildi." : "Kullanıcının delege güvenlik yetkileri kaldırıldı.");
  }

  return <section className="sc-root">
    <div className="sc-head">
      <div><small>KY GÜVENLİK / SECURITY CENTER v1</small><h2>Güvenlik Merkezi</h2><p>Giriş onayı, gerçek oturumlar, güvenlik akışı, bildirimler ve delege yetkileri tek merkezde.</p></div>
      <div className="sc-head-actions"><span className={`sc-scope ${scopeType.toLowerCase()}`}>{scopeLabel(scopeType)}</span><button disabled={busy} onClick={loadAll}>Yenile</button></div>
    </div>
    <div className={`sc-message ${String(message).startsWith("Hata:") ? "bad" : ""}`}>{message}</div>

    <div className="sc-summary">
      <div><span>Aktif Oturum</span><strong>{overview?.activeSessionCount ?? 0}</strong></div>
      <div><span>KY Güvenlik Cihazı</span><strong>{overview?.ownDevices?.length ?? 0}</strong></div>
      <div><span>Bekleyen Giriş</span><strong>{approvals.length}</strong></div>
      <div><span>Kapsam</span><strong>{scopeLabel(scopeType)}</strong></div>
    </div>

    <div className="sc-tabs">
      <button className={tab === "approvals" ? "active" : ""} onClick={() => setTab("approvals")}>Onaylar {approvals.length ? <b>{approvals.length}</b> : null}</button>
      <button className={tab === "sessions" ? "active" : ""} onClick={() => setTab("sessions")}>Oturumlar</button>
      <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>Güvenlik Akışı</button>
      <button className={tab === "notifications" ? "active" : ""} onClick={() => setTab("notifications")}>Bildirimler</button>
      {canManage && <button className={tab === "grants" ? "active" : ""} onClick={() => setTab("grants")}>Yetkiler</button>}
    </div>

    {tab === "approvals" && <div className="sc-panel">
      <div className="sc-panel-head"><div><h3>Bekleyen Giriş Onayları</h3><p>{scopeType === "SELF" ? "Kendi giriş onayınız KY Güvenlik telefonunda görünür." : "Yetkiniz kapsamındaki bekleyen ERP girişleri."}</p></div></div>
      {approvals.length ? <div className="sc-list">{approvals.map((row) => <div className="sc-row" key={row.id}>
        <div className="sc-row-main"><strong>{row.fullName || row.username || "Kullanıcı"}</strong><span>{row.mainCompanySlug || "-"} · {row.deviceLabel || "Yeni cihaz"}</span><small>{row.ipAddress || "IP yok"} · {dateText(row.requestedAt)}</small></div>
        {canApproveLogin && <div className="sc-actions"><button className="ok" disabled={busy} onClick={() => approveLogin(row, "APPROVE")}>Onayla</button><button className="danger" disabled={busy} onClick={() => approveLogin(row, "DENY")}>Reddet</button></div>}
      </div>)}</div> : <div className="sc-empty">Bekleyen giriş onayı yok.</div>}
    </div>}

    {tab === "sessions" && <div className="sc-panel">
      <div className="sc-panel-head"><div><h3>Gerçek ERP Oturumları</h3><p>Login onayı ile oturum güveni ayrıdır. Güven kararı ayrıca kaydedilir.</p></div>{scopeType === "SYSTEM" && <button className="danger strong" disabled={busy} onClick={() => critical({ operation: "ONLY_ME" }, "Sadece Ben Kalayım tamamlandı; diğer aktif oturumlar kapatıldı.")}>Sadece Ben Kalayım</button>}</div>
      <div className="sc-table"><div className="sc-table-head"><span>Kullanıcı / Cihaz</span><span>Firma / IP</span><span>Güven</span><span>Durum</span><span>İşlem</span></div>
        {sessions.map((row) => <div className="sc-table-row" key={row.id}>
          <span><strong>{row.fullName || row.username}</strong><small>{row.deviceLabel || "Tarayıcı"}<br/>{dateText(row.createdAt)}</small></span>
          <span>{row.mainCompanySlug || "-"}<small>{row.ipAddress || "-"}</small></span>
          <span><em className={`trust ${String(row.trustStatus || "").toLowerCase()}`}>{trustLabel(row.trustStatus)}</em></span>
          <span><em className={row.active ? "active-session" : "closed-session"}>{row.active ? "Aktif" : "Kapalı"}</em><small>{dateText(row.lastSeenAt)}</small></span>
          <span className="sc-actions compact">
            {row.active && canSessionApprove && row.trustStatus !== "TRUSTED" && <button className="ok" disabled={busy} onClick={() => critical({ operation: "SESSION_TRUST_APPROVE", sessionId: row.id }, "Oturum güvenilir olarak onaylandı.")}>Güven</button>}
            {row.active && canSessionApprove && <button disabled={busy} onClick={() => critical({ operation: "SESSION_SUSPICIOUS", sessionId: row.id }, "Şüpheli oturum kapatıldı ve loglandı.")}>Şüpheli</button>}
            {row.active && (row.own || canSessionClose) && <button className="danger" disabled={busy} onClick={() => critical({ operation: "SESSION_CLOSE", sessionId: row.id }, "Oturum KY Güvenlik onayıyla kapatıldı.")}>Kapat</button>}
          </span>
        </div>)}
      </div>
      {!sessions.length && <div className="sc-empty">Görüntülenebilir oturum yok.</div>}
    </div>}

    {tab === "audit" && <div className="sc-panel">
      <div className="sc-panel-head"><div><h3>Güvenlik Akışı</h3><p>Kim, ne zaman, hangi firma/oturum/IP üzerinde ne yaptı.</p></div><input className="sc-search" placeholder="Kullanıcı, firma, IP, olay ara" value={filter} onChange={(event) => setFilter(event.target.value)}/></div>
      <div className="sc-timeline">{filteredAudit.map((row) => <div className="sc-event" key={row.id}><span className="sc-event-icon">{row.icon || "•"}</span><div><strong>{row.label || row.action}</strong><p>{[row.actorName, row.targetName && row.targetName !== row.actorName ? `→ ${row.targetName}` : "", row.mainCompanySlug].filter(Boolean).join(" · ")}</p><small>{dateText(row.createdAt)} · {row.ipAddress || "IP yok"}{row.sessionId ? ` · Oturum ${String(row.sessionId).slice(0, 8)}` : ""}</small></div></div>)}</div>
      {!filteredAudit.length && <div className="sc-empty">Filtreye uygun güvenlik olayı yok.</div>}
    </div>}

    {tab === "notifications" && <div className="sc-panel">
      <div className="sc-panel-head"><div><h3>Bildirim Tercihleri</h3><p>Bildirimler rol adına değil, gerçek güvenlik kapsamınıza göre yönetilir.</p></div><button className="primary" disabled={busy} onClick={savePreferences}>Kaydet</button></div>
      <div className="sc-pref-grid">{PREFS.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(preferences[key])} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))}/><span>{label}</span></label>)}</div>
    </div>}

    {tab === "grants" && canManage && <div className="sc-panel">
      <div className="sc-panel-head"><div><h3>Delege Güvenlik Yetkileri</h3><p>Bu yetkiler ERP rolünü yükseltmez; yalnız seçilen firma için güvenlik işi verir.</p></div></div>
      <div className="sc-grant-editor">
        <label>Kullanıcı<select value={selectedUserId} onChange={(event) => chooseUser(event.target.value)}><option value="">Kullanıcı seçin</option>{users.map((row) => <option value={row.id} key={row.id}>{row.fullName || row.username} · {row.role} · {row.mainCompanySlug || "-"}</option>)}</select></label>
        <div className="sc-cap-grid">{CAPABILITIES.map(([key, label]) => <label key={key}><input type="checkbox" disabled={!selectedUserId} checked={selectedCaps.includes(key)} onChange={() => toggleCap(key)}/><span>{label}</span></label>)}</div>
        <div className="sc-actions"><button className="primary" disabled={busy || !selectedUserId} onClick={saveGrant}>Telefondan Onayla ve Yetkiyi Kaydet</button></div>
      </div>
      {scopeType === "SYSTEM" && selectedUser && <div className="sc-super-admin-box"><div><strong>Süper Yönetici sahiplik kilidi</strong><p>Normal kullanıcı ekranı bu rolü veremez. Yalnız asıl Süper Yönetici, KY Güvenlik telefonu ile yeniden doğrulayarak değiştirebilir.</p></div><div className="sc-actions">{selectedUser.role === "SUPER_ADMIN" ? <button className="danger" disabled={busy} onClick={() => critical({ operation: "SUPER_ADMIN_REVOKE", targetUserId: selectedUser.id }, "İkincil Süper Yönetici yetkisi kaldırıldı.")}>Süper Yönetici Yetkisini Kaldır</button> : <button disabled={busy} onClick={() => critical({ operation: "SUPER_ADMIN_GRANT", targetUserId: selectedUser.id }, "Yeni Süper Yönetici KY Güvenlik onayıyla eklendi.")}>Süper Yönetici Yap</button>}</div></div>}
      <div className="sc-list grants">{grants.map((row) => <div className="sc-row" key={row.id}><div className="sc-row-main"><strong>{row.fullName || row.username}</strong><span>{row.mainCompanySlug} · {row.role}</span><small>{(row.capabilities || []).join(" · ")}</small></div></div>)}</div>
    </div>}
  </section>;
}
