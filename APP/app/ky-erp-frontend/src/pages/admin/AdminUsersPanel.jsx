import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  activateUser,
  approveLogin,
  createUser,
  deactivateUser,
  denyLogin,
  getMainCompanies,
  getOwnerRecoveryConfig,
  getUserPermissions,
  listActiveSessions,
  listLoginApprovals,
  listLoginSecurityPolicies,
  listSecurityAuditLog,
  listSessionHistory,
  listUsers,
  resetUserMfa,
  resetUserPassword,
  revokeAllUserSessions,
  revokeSession,
  saveOwnerRecoveryQuestions,
  startOwnerRecoveryContactVerification,
  updateLoginSecurityPolicy,
  updateUser,
  updateUserPermissions,
  verifyOwnerRecoveryContact,
} from "../../services/adminApi";
import { saveIkUserScope } from "../../services/ikPersonnelControlApi";
import "./AdminUsersPanelV3.css";

const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME",
  "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "ASISTAN", "ADMIN", "RAPORLAR",
];
const MODULE_LABELS = {
  DASHBOARD: "Yönetim Özeti", MUHASEBE: "Muhasebe", FIRMA_CARI: "Firma / Cari", BELGE_ISLEM: "Belge İşlemleri",
  KDV: "KDV", CEK_ODEME: "Çek / Ödeme", DESEN: "Desen", IMALAT: "İmalat", BOYAHANE: "Boyahane",
  IK: "İK", ISNET: "İşNet", ASISTAN: "KY ERP Asistan", ADMIN: "Yönetim", RAPORLAR: "Raporlar",
};
const ROLE_LABELS = {
  SUPER_ADMIN: "Uygulama Sahibi", ADMIN: "Uygulama Sahibi", COMPANY_ADMIN: "Firma Yöneticisi",
  MUHASEBE: "Muhasebe Kullanıcısı", DESEN: "Desen Kullanıcısı", IMALAT: "İmalat Kullanıcısı",
  BOYAHANE: "Boyahane Kullanıcısı", IK: "İK Kullanıcısı", DENETIM: "Denetim Kullanıcısı", VIEWER: "Özel Yetkili Kullanıcı",
};
const MANAGED_ROLES = ["COMPANY_ADMIN", "MUHASEBE", "DESEN", "IMALAT", "BOYAHANE", "IK", "DENETIM", "VIEWER"];
const OWNER_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
const LOGIN_POLICIES = [
  ["PASSWORD_ONLY", "Sadece parola", "8 saat"],
  ["GOOGLE", "Parola + Google Authenticator", "10 saat"],
  ["MICROSOFT", "Parola + Microsoft Authenticator", "10 saat"],
  ["ANY_MFA", "Parola + Google veya Microsoft", "10 saat"],
  ["BOTH_MFA", "Parola + Google ve Microsoft", "10 saat"],
];
const AUDIT_VIEW_MODULES = new Set(["MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME", "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "RAPORLAR"]);

function roleOf(value) {
  const role = String(value || "VIEWER").toUpperCase();
  return role === "ADMIN" ? "SUPER_ADMIN" : role;
}
function emptyPermission(moduleKey) {
  return { moduleKey, canView: false, canCreate: false, canUpdate: false, canDelete: false, canApprove: false };
}
function normalizePermissions(rows) {
  const map = new Map(MODULE_KEYS.map((key) => [key, emptyPermission(key)]));
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.moduleKey || "").toUpperCase();
    if (!map.has(key)) continue;
    map.set(key, {
      moduleKey: key,
      canView: row.canView === true,
      canCreate: row.canCreate === true,
      canUpdate: row.canUpdate === true,
      canDelete: row.canDelete === true,
      canApprove: row.canApprove === true,
    });
  }
  return Array.from(map.values());
}
function permissionPreset(type) {
  const full = new Set();
  const view = new Set();
  if (type === "COMPANY_ADMIN") MODULE_KEYS.forEach((key) => full.add(key));
  if (type === "MUHASEBE") ["DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME", "ISNET", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "DESEN") ["DASHBOARD", "DESEN", "ASISTAN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "IMALAT") ["DASHBOARD", "IMALAT", "DESEN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "BOYAHANE") ["DASHBOARD", "BOYAHANE", "DESEN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "IK") ["DASHBOARD", "IK", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "DENETIM") AUDIT_VIEW_MODULES.forEach((key) => view.add(key));
  if (type === "VIEW") MODULE_KEYS.filter((key) => key !== "ADMIN").forEach((key) => view.add(key));
  return MODULE_KEYS.map((moduleKey) => {
    if (type === "COMPANY_ADMIN" && moduleKey === "ADMIN") return { moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true };
    if (full.has(moduleKey)) return { moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: true, canApprove: true };
    if (view.has(moduleKey)) return { moduleKey, canView: true, canCreate: false, canUpdate: false, canDelete: false, canApprove: false };
    return emptyPermission(moduleKey);
  });
}
function emptyForm(companySlug = "mecit-hakan") {
  return { id: "", username: "", fullName: "", email: "", password: "", role: "VIEWER", mainCompanySlug: companySlug, isActive: true, emailVerified: false };
}
function dateText(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}
function durationText(start, end) {
  const a = Date.parse(start || ""); const b = Date.parse(end || "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "-";
  const minutes = Math.max(0, Math.floor((b - a) / 60000));
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}
function remainingText(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (value < 3600) return `${Math.ceil(value / 60)} dk`;
  return `${Math.floor(value / 3600)} sa ${Math.floor((value % 3600) / 60)} dk`;
}
function policyLabel(value) { return LOGIN_POLICIES.find(([key]) => key === value)?.[1] || "Parola + Google veya Microsoft"; }
function companyRows(value) {
  const rows = Array.isArray(value) ? value : value?.items || [];
  return rows.map((row) => ({ id: String(row.id || ""), slug: String(row.slug || row.kod || ""), name: String(row.name || row.ad || row.slug || "Firma"), isActive: row.isActive !== false })).filter((row) => row.slug);
}
function initials(value) { return String(value || "U").split(" ").filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase(); }
function friendlyDevice(row) {
  const label = String(row?.deviceLabel || "");
  if (label && !label.startsWith("BROWSER:")) return label;
  const ua = String(row?.userAgent || "");
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Tarayıcı";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : "";
  return [browser, os].filter(Boolean).join(" / ") || "Tarayıcı";
}
function closureLabel(value) {
  return ({ ACTIVE: "Aktif", EXPIRED: "Süresi doldu", REVOKED: "Sonlandırıldı", ADMIN_REVOKED: "Yönetici sonlandırdı", ALL_SESSIONS_REVOKED: "Tüm oturumlar kapatıldı", SAME_BROWSER_REPLACED: "Aynı tarayıcıda yenilendi" })[value] || value || "-";
}

export default function AdminUsersPanel() {
  const { user: currentUser } = useAuth();
  const currentRole = roleOf(currentUser?.role);
  const isOwner = OWNER_ROLES.has(currentRole);
  const roleOptions = isOwner ? MANAGED_ROLES : MANAGED_ROLES.filter((role) => role !== "COMPANY_ADMIN");

  const [tab, setTab] = useState("USERS");
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissions, setPermissions] = useState(() => permissionPreset("VIEW"));
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(currentUser?.mainCompanySlug || "mecit-hakan"));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Kullanıcı yönetimi hazır.");
  const [securityPassword, setSecurityPassword] = useState("");
  const [ownerRecovery, setOwnerRecovery] = useState(null);
  const [ownerQuestions, setOwnerQuestions] = useState([{ question: "", answer: "" }, { question: "", answer: "" }, { question: "", answer: "" }]);
  const [stepUp, setStepUp] = useState({ provider: "GOOGLE", code: "" });
  const [contactDraft, setContactDraft] = useState({ email: "", phone: "" });
  const [contactChallenge, setContactChallenge] = useState(null);
  const [contactOtp, setContactOtp] = useState("");

  const companyMap = useMemo(() => new Map(companies.map((row) => [row.slug, row.name])), [companies]);
  const policyMap = useMemo(() => new Map(policies.map((row) => [row.userId, row])), [policies]);
  const selectedUser = useMemo(() => users.find((row) => row.id === selectedUserId) || null, [selectedUserId, users]);
  const selectedRole = roleOf(selectedUser?.role);
  const selectedIsOwner = OWNER_ROLES.has(selectedRole);
  const selectedPolicy = policyMap.get(selectedUserId) || {};

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return users.filter((row) => {
      if (statusFilter === "ACTIVE" && row.isActive === false) return false;
      if (statusFilter === "PASSIVE" && row.isActive !== false) return false;
      if (!q) return true;
      return [row.fullName, row.username, row.email, ROLE_LABELS[roleOf(row.role)], companyMap.get(row.mainCompanySlug)]
        .join(" ").toLocaleLowerCase("tr-TR").includes(q);
    });
  }, [companyMap, search, statusFilter, users]);

  const companyName = (slug) => companyMap.get(slug) || slug || "-";
  const defaultCompany = () => currentUser?.mainCompanySlug || companies.find((row) => row.isActive)?.slug || companies[0]?.slug || "mecit-hakan";

  const loadUsers = useCallback(async () => {
    const rows = await listUsers();
    const list = Array.isArray(rows) ? rows : rows?.items || [];
    setUsers(list);
    setSelectedUserId((current) => list.some((row) => row.id === current) ? current : (list[0]?.id || ""));
  }, []);

  const loadCompanies = useCallback(async () => {
    const own = currentUser?.mainCompanySlug || "mecit-hakan";
    if (!isOwner) { setCompanies([{ id: own, slug: own, name: own, isActive: true }]); return; }
    try {
      const rows = companyRows(await getMainCompanies());
      setCompanies(rows.length ? rows : [{ id: own, slug: own, name: own, isActive: true }]);
    } catch { setCompanies([{ id: own, slug: own, name: own, isActive: true }]); }
  }, [currentUser?.mainCompanySlug, isOwner]);

  const loadSecurity = useCallback(async () => {
    const jobs = [listActiveSessions(), listLoginApprovals(), listSessionHistory(300), listSecurityAuditLog(300)];
    const [active, pending, history, log] = await Promise.allSettled(jobs);
    if (active.status === "fulfilled") setSessions(Array.isArray(active.value) ? active.value : []);
    if (pending.status === "fulfilled") setApprovals(Array.isArray(pending.value) ? pending.value : []);
    if (history.status === "fulfilled") setSessionHistory(Array.isArray(history.value) ? history.value : []);
    if (log.status === "fulfilled") setAuditLog(Array.isArray(log.value) ? log.value : []);
  }, []);

  const loadPolicies = useCallback(async () => {
    if (!isOwner) { setPolicies([]); return; }
    try {
      const rows = await listLoginSecurityPolicies();
      setPolicies(Array.isArray(rows) ? rows : rows?.items || []);
    } catch { setPolicies([]); }
  }, [isOwner]);

  const loadOwnerRecovery = useCallback(async () => {
    if (!isOwner) return;
    try {
      const data = await getOwnerRecoveryConfig();
      setOwnerRecovery(data);
      setContactDraft({ email: data?.email || "", phone: data?.phone || "" });
      setOwnerQuestions([0, 1, 2].map((index) => ({ question: data?.questions?.[index]?.question || "", answer: "" })));
    } catch { setOwnerRecovery(null); }
  }, [isOwner]);

  const refreshAll = useCallback(async () => {
    setBusy(true);
    try {
      await Promise.allSettled([loadCompanies(), loadUsers(), loadSecurity(), loadPolicies(), loadOwnerRecovery()]);
      setMessage("Kullanıcı, yetki ve güvenlik bilgileri güncel.");
    } finally { setBusy(false); }
  }, [loadCompanies, loadOwnerRecovery, loadPolicies, loadSecurity, loadUsers]);

  useEffect(() => { refreshAll(); }, [refreshAll]);
  useEffect(() => {
    if (!selectedUserId) return;
    let alive = true;
    getUserPermissions(selectedUserId)
      .then((rows) => { if (alive) setPermissions(normalizePermissions(rows)); })
      .catch(() => { if (alive) setPermissions(permissionPreset("VIEW")); });
    return () => { alive = false; };
  }, [selectedUserId]);

  function selectUser(id) {
    setSelectedUserId(id);
    setEditorOpen(false);
    setSecurityPassword("");
  }
  function newUser() {
    setForm(emptyForm(defaultCompany()));
    setEditorOpen(true);
    setTab("USERS");
  }
  function editUser() {
    if (!selectedUser) return;
    setForm({
      id: selectedUser.id, username: selectedUser.username || "", fullName: selectedUser.fullName || "", email: selectedUser.email || "",
      password: "", role: roleOf(selectedUser.role), mainCompanySlug: selectedUser.mainCompanySlug || defaultCompany(),
      isActive: selectedUser.isActive !== false, emailVerified: selectedUser.emailVerified === true,
    });
    setEditorOpen(true);
    setTab("USERS");
  }

  async function applyHrScope(userId, role, companySlug) {
    try {
      await saveIkUserScope({ userId, mainCompanySlug: companySlug, scope: roleOf(role) === "DENETIM" ? "AUDIT" : "FULL" });
    } catch (error) {
      if (roleOf(role) === "DENETIM") throw error;
    }
  }

  async function saveUser(event) {
    event?.preventDefault();
    if (!form.username.trim() || !form.fullName.trim()) { setMessage("Kullanıcı adı ve ad soyad zorunludur."); return; }
    if (!form.id && form.password.length < 6) { setMessage("Yeni kullanıcı için en az 6 karakter şifre girin."); return; }
    setBusy(true);
    try {
      const payload = {
        username: form.username.trim(), fullName: form.fullName.trim(), email: form.email.trim(), role: form.role,
        mainCompanySlug: form.mainCompanySlug, isActive: form.isActive, emailVerified: form.emailVerified,
      };
      let id = form.id;
      const oldRole = selectedUser ? roleOf(selectedUser.role) : "";
      if (form.id) {
        await updateUser(form.id, payload);
        if (form.password) await resetUserPassword(form.id, form.password);
      } else {
        const created = await createUser({ ...payload, password: form.password });
        id = created?.id;
        if (!id) throw new Error("Kullanıcı kimliği alınamadı.");
        await updateUserPermissions(id, permissionPreset(form.role));
      }
      await applyHrScope(id, form.role, form.mainCompanySlug);
      if (roleOf(form.role) === "DENETIM") await updateUserPermissions(id, permissionPreset("DENETIM"));
      if (form.id && oldRole !== roleOf(form.role)) await revokeAllUserSessions(id);
      if (isOwner && !form.id) {
        await updateLoginSecurityPolicy(id, { loginPolicy: "ANY_MFA", sessionSeconds: 36000, approvalRequired: false });
      }
      setEditorOpen(false);
      setMessage(form.id ? "Kullanıcı bilgileri kaydedildi." : "Kullanıcı oluşturuldu. Modül yetkileri ayrı sekmeden yönetilebilir.");
      await Promise.all([loadUsers(), loadPolicies(), loadSecurity()]);
      setSelectedUserId(id);
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kullanıcı kaydedilemedi."}`);
    } finally { setBusy(false); }
  }

  function editPermission(moduleKey, field, checked) {
    if (!selectedUser || selectedIsOwner) return;
    setPermissions((rows) => rows.map((row) => {
      if (row.moduleKey !== moduleKey) return row;
      if (selectedRole === "DENETIM") {
        if (field !== "canView" || !AUDIT_VIEW_MODULES.has(moduleKey)) return row;
        return { ...row, canView: checked, canCreate: false, canUpdate: false, canDelete: false, canApprove: false };
      }
      return { ...row, [field]: checked };
    }));
  }

  function applyPermissionPreset(type) {
    if (!selectedUser || selectedIsOwner) return;
    if (selectedRole === "DENETIM") setPermissions(permissionPreset("DENETIM"));
    else setPermissions(permissionPreset(type));
  }

  async function savePermissions() {
    if (!selectedUser || selectedIsOwner) return;
    setBusy(true);
    try {
      const clean = selectedRole === "DENETIM"
        ? permissions.map((row) => ({ ...row, canView: AUDIT_VIEW_MODULES.has(row.moduleKey) && row.canView, canCreate: false, canUpdate: false, canDelete: false, canApprove: false }))
        : permissions;
      await updateUserPermissions(selectedUser.id, clean);
      await applyHrScope(selectedUser.id, selectedRole, selectedUser.mainCompanySlug);
      setPermissions(clean);
      setMessage(`${selectedUser.fullName || selectedUser.username} için modül yetkileri kaydedildi.`);
      await loadSecurity();
    } catch (error) { setMessage(`Hata: ${error?.message || "Yetkiler kaydedilemedi."}`); }
    finally { setBusy(false); }
  }

  async function run(action, success, refresh = true) {
    setBusy(true);
    try {
      await action();
      setMessage(success);
      if (refresh) await Promise.allSettled([loadUsers(), loadPolicies(), loadSecurity()]);
    } catch (error) { setMessage(`Hata: ${error?.message || "İşlem tamamlanamadı."}`); }
    finally { setBusy(false); }
  }

  async function savePolicy() {
    if (!selectedUser || !isOwner || selectedIsOwner) return;
    const loginPolicy = selectedPolicy.loginPolicy || "ANY_MFA";
    await run(() => updateLoginSecurityPolicy(selectedUser.id, {
      loginPolicy,
      sessionSeconds: loginPolicy === "PASSWORD_ONLY" ? 28800 : 36000,
      approvalRequired: Boolean(selectedPolicy.approvalRequired),
    }), "Giriş güvenliği kaydedildi.");
  }

  function updateLocalPolicy(field, value) {
    if (!selectedUserId) return;
    setPolicies((rows) => {
      const exists = rows.some((row) => row.userId === selectedUserId);
      if (!exists) return [...rows, { userId: selectedUserId, loginPolicy: "ANY_MFA", approvalRequired: false, [field]: value }];
      return rows.map((row) => row.userId === selectedUserId ? { ...row, [field]: value } : row);
    });
  }

  async function saveOwnerQuestionsHandler() {
    if (!/^\d{6}$/.test(stepUp.code)) { setMessage("6 haneli Authenticator kodunu girin."); return; }
    await run(async () => {
      await saveOwnerRecoveryQuestions({ provider: stepUp.provider, code: stepUp.code, questions: ownerQuestions });
      setStepUp((old) => ({ ...old, code: "" }));
      await loadOwnerRecovery();
    }, "3 güvenlik sorusu kaydedildi.", false);
  }

  async function startContact(channel) {
    if (!/^\d{6}$/.test(stepUp.code)) { setMessage("6 haneli Authenticator kodunu girin."); return; }
    await run(async () => {
      const value = channel === "EMAIL" ? contactDraft.email : contactDraft.phone;
      const data = await startOwnerRecoveryContactVerification({ channel, value, provider: stepUp.provider, code: stepUp.code });
      setContactChallenge({ ...data, channel });
      setContactOtp("");
    }, "Doğrulama kodu gönderildi.", false);
  }

  async function verifyContactHandler() {
    if (!contactChallenge || !/^\d{6}$/.test(contactOtp)) { setMessage("6 haneli doğrulama kodunu girin."); return; }
    await run(async () => {
      await verifyOwnerRecoveryContact({ recoveryId: contactChallenge.recoveryId, recoveryToken: contactChallenge.recoveryToken, otp: contactOtp });
      setContactChallenge(null); setContactOtp(""); setStepUp((old) => ({ ...old, code: "" }));
      await loadOwnerRecovery();
    }, "İletişim kanalı doğrulandı.", false);
  }

  const summary = {
    activeUsers: users.filter((row) => row.isActive !== false).length,
    auditUsers: users.filter((row) => roleOf(row.role) === "DENETIM" && row.isActive !== false).length,
    sessions: sessions.length,
    pending: approvals.length,
  };

  return (
    <div className="auv3-page">
      <header className="auv3-header">
        <div><span>YÖNETİM / KULLANICILAR</span><h2>Firma Kullanıcıları ve Yetkilendirme</h2><p>{message}</p></div>
        <div><button type="button" className="primary" onClick={newUser} disabled={busy}>+ Yeni Kullanıcı</button><button type="button" onClick={refreshAll} disabled={busy}>Yenile</button></div>
      </header>

      <section className="auv3-summary">
        <div><span>Aktif kullanıcı</span><strong>{summary.activeUsers}</strong></div>
        <div><span>Denetim profili</span><strong>{summary.auditUsers}</strong></div>
        <div><span>Aktif oturum</span><strong>{summary.sessions}</strong></div>
        <div><span>Bekleyen onay</span><strong>{summary.pending}</strong></div>
      </section>

      <nav className="auv3-tabs">
        {[['USERS','Kullanıcılar'],['SECURITY','Güvenlik & Kurtarma'],['PERMISSIONS','Modül Yetkileri'],['SESSIONS','Aktif Oturumlar & Log']].map(([key,label]) => (
          <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {tab === "USERS" ? (
        <section className="auv3-users-layout">
          <aside className="auv3-panel auv3-directory">
            <div className="auv3-panel-title"><div><h3>Kullanıcılar</h3><p>{filteredUsers.length} kayıt</p></div></div>
            <div className="auv3-filters"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ad, kullanıcı, e-posta veya rol ara" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ACTIVE">Aktif</option><option value="ALL">Tümü</option><option value="PASSIVE">Pasif</option></select></div>
            <div className="auv3-user-list">
              {filteredUsers.map((row) => <button type="button" key={row.id} className={selectedUserId === row.id ? "active" : ""} onClick={() => selectUser(row.id)}><b>{initials(row.fullName || row.username)}</b><span><strong>{row.fullName || row.username}</strong><small>@{row.username}{row.email ? ` · ${row.email}` : ""}</small><em>{ROLE_LABELS[roleOf(row.role)] || row.role} · {companyName(row.mainCompanySlug)}</em></span>{row.isActive === false ? <i>Pasif</i> : null}</button>)}
            </div>
          </aside>

          <main className="auv3-panel auv3-user-main">
            {editorOpen ? (
              <form className="auv3-user-form" onSubmit={saveUser}>
                <div className="auv3-panel-title"><div><h3>{form.id ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}</h3><p>Bu form yalnız kullanıcı kimliği ve rolü içindir.</p></div><button type="button" onClick={() => setEditorOpen(false)}>Formu Kapat</button></div>
                <div className="auv3-form-grid">
                  <label>Kullanıcı Adı<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
                  <label>Ad Soyad<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
                  <label>E-posta<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                  <label>{form.id ? "Yeni Şifre (isteğe bağlı)" : "Şifre"}<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
                  <label>Ana Firma<select value={form.mainCompanySlug} onChange={(e) => setForm({ ...form, mainCompanySlug: e.target.value })}>{companies.map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}</select></label>
                  <label>Rol<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
                </div>
                <div className="auv3-switches"><label><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Aktif kullanıcı</label><label><input type="checkbox" checked={form.emailVerified} onChange={(e) => setForm({ ...form, emailVerified: e.target.checked })} /> E-posta doğrulandı</label></div>
                <div className="auv3-form-actions"><button type="submit" className="primary" disabled={busy}>{form.id ? "Kullanıcıyı Kaydet" : "Kullanıcı Oluştur"}</button><button type="button" onClick={() => setEditorOpen(false)}>Vazgeç</button></div>
              </form>
            ) : selectedUser ? (
              <div className="auv3-profile">
                <div className="auv3-selected"><b>{initials(selectedUser.fullName || selectedUser.username)}</b><div><span>SEÇİLİ KULLANICI</span><h3>{selectedUser.fullName || selectedUser.username}</h3><p>@{selectedUser.username}{selectedUser.email ? ` · ${selectedUser.email}` : ""}</p></div><em>{selectedUser.isActive === false ? "Pasif" : "Aktif"}</em></div>
                <div className="auv3-profile-grid"><div><span>Rol</span><strong>{ROLE_LABELS[selectedRole] || selectedRole}</strong></div><div><span>Firma</span><strong>{companyName(selectedUser.mainCompanySlug)}</strong></div><div><span>Giriş Güvenliği</span><strong>{policyLabel(selectedPolicy.loginPolicy)}</strong></div><div><span>E-posta</span><strong>{selectedUser.email || "-"}</strong></div></div>
                <div className="auv3-profile-actions"><button type="button" className="primary" onClick={editUser}>Kullanıcı Bilgilerini Düzenle</button>{!selectedIsOwner ? <button type="button" onClick={() => setTab("PERMISSIONS")}>Modül Yetkilerini Aç</button> : null}{!selectedIsOwner ? <button type="button" className={selectedUser.isActive === false ? "" : "danger"} onClick={() => run(() => selectedUser.isActive === false ? activateUser(selectedUser.id) : deactivateUser(selectedUser.id), selectedUser.isActive === false ? "Kullanıcı aktifleştirildi." : "Kullanıcı pasife alındı.")}>{selectedUser.isActive === false ? "Aktifleştir" : "Pasife Al"}</button> : null}</div>
              </div>
            ) : <div className="auv3-empty">Kullanıcı seçin veya yeni kullanıcı oluşturun.</div>}
          </main>
        </section>
      ) : null}

      {tab === "PERMISSIONS" ? (
        <section className="auv3-panel">
          <div className="auv3-panel-title"><div><h3>Modül Yetkileri</h3><p>Önce kullanıcıyı seçin; bu ekrandaki bütün değişiklikler yalnız seçili kullanıcıya uygulanır.</p></div><select className="auv3-user-select" value={selectedUserId} onChange={(e) => selectUser(e.target.value)}><option value="">Kullanıcı seçin</option>{users.map((row) => <option key={row.id} value={row.id}>{row.fullName || row.username} — {ROLE_LABELS[roleOf(row.role)] || row.role}</option>)}</select></div>
          {selectedUser ? <>
            <div className="auv3-selected permission"><b>{initials(selectedUser.fullName || selectedUser.username)}</b><div><span>YETKİSİ DÜZENLENEN KULLANICI</span><h3>{selectedUser.fullName || selectedUser.username}</h3><p>@{selectedUser.username} · {ROLE_LABELS[selectedRole] || selectedRole} · {companyName(selectedUser.mainCompanySlug)}</p></div></div>
            {!selectedIsOwner ? <div className="auv3-permission-tools"><button type="button" onClick={() => applyPermissionPreset(selectedRole)}>Role Göre</button>{selectedRole !== "DENETIM" ? <><button type="button" onClick={() => applyPermissionPreset("VIEW")}>Sadece Görüntüleme</button><button type="button" onClick={() => setPermissions(MODULE_KEYS.map(emptyPermission))}>Temizle</button></> : null}<button type="button" className="primary" onClick={savePermissions} disabled={busy}>Yetkileri Kaydet</button></div> : null}
            <div className="auv3-permission-table"><table><thead><tr><th>Modül</th><th>Görüntüle</th><th>Ekle</th><th>Güncelle</th><th>Sil</th><th>Onayla</th></tr></thead><tbody>{permissions.map((row) => <tr key={row.moduleKey}><td><strong>{MODULE_LABELS[row.moduleKey]}</strong></td>{["canView","canCreate","canUpdate","canDelete","canApprove"].map((field) => { const lock = selectedIsOwner || (selectedRole === "DENETIM" && (field !== "canView" || !AUDIT_VIEW_MODULES.has(row.moduleKey))); return <td key={field}><input type="checkbox" checked={selectedIsOwner ? true : Boolean(row[field])} disabled={lock} onChange={(e) => editPermission(row.moduleKey, field, e.target.checked)} /></td>; })}</tr>)}</tbody></table></div>
          </> : <div className="auv3-empty">Yetkileri görüntülemek için kullanıcı seçin.</div>}
        </section>
      ) : null}

      {tab === "SECURITY" ? (
        <section className="auv3-security-grid">
          <div className="auv3-panel">
            <div className="auv3-panel-title"><div><h3>Giriş Güvenliği</h3><p>Güvenlik işlemi yapılacak kullanıcıyı açıkça seçin.</p></div><select className="auv3-user-select" value={selectedUserId} onChange={(e) => selectUser(e.target.value)}><option value="">Kullanıcı seçin</option>{users.map((row) => <option key={row.id} value={row.id}>{row.fullName || row.username}</option>)}</select></div>
            {selectedUser ? <>
              <div className="auv3-selected"><b>{initials(selectedUser.fullName || selectedUser.username)}</b><div><span>GÜVENLİK PROFİLİ</span><h3>{selectedUser.fullName || selectedUser.username}</h3><p>@{selectedUser.username} · {ROLE_LABELS[selectedRole] || selectedRole}</p></div></div>
              {isOwner && !selectedIsOwner ? <div className="auv3-security-form"><label>Giriş Yöntemi<select value={selectedPolicy.loginPolicy || "ANY_MFA"} onChange={(e) => updateLocalPolicy("loginPolicy", e.target.value)}>{LOGIN_POLICIES.map(([key,label,time]) => <option key={key} value={key}>{label} — {time}</option>)}</select></label><label className="check"><input type="checkbox" checked={Boolean(selectedPolicy.approvalRequired)} onChange={(e) => updateLocalPolicy("approvalRequired", e.target.checked)} /> Yeni cihaz girişinde yönetici onayı</label><button type="button" className="primary" onClick={savePolicy}>Giriş Güvenliğini Kaydet</button></div> : null}
              <div className="auv3-security-actions"><button type="button" onClick={() => run(() => resetUserMfa(selectedUser.id, "GOOGLE"), "Google Authenticator yeniden kurulum için sıfırlandı.")}>Google QR Yenile</button><button type="button" onClick={() => run(() => resetUserMfa(selectedUser.id, "MICROSOFT"), "Microsoft Authenticator yeniden kurulum için sıfırlandı.")}>Microsoft QR Yenile</button><button type="button" onClick={() => run(() => resetUserMfa(selectedUser.id, "ALL"), "Authenticator kayıtları sıfırlandı.")}>Tüm MFA'yı Yenile</button></div>
              <div className="auv3-password-reset"><input type="password" value={securityPassword} onChange={(e) => setSecurityPassword(e.target.value)} placeholder="Yeni şifre" /><button type="button" onClick={() => { if (securityPassword.length < 6) { setMessage("Yeni şifre en az 6 karakter olmalıdır."); return; } run(async () => { await resetUserPassword(selectedUser.id, securityPassword); setSecurityPassword(""); }, "Şifre güncellendi."); }}>Şifreyi Değiştir</button><button type="button" className="danger" onClick={() => run(() => revokeAllUserSessions(selectedUser.id), "Kullanıcının aktif oturumları kapatıldı.")}>Tüm Oturumları Sonlandır</button></div>
            </> : <div className="auv3-empty">Kullanıcı seçin.</div>}
          </div>

          {isOwner ? <div className="auv3-panel auv3-recovery">
            <div className="auv3-panel-title"><div><h3>Sahip Hesabı Kurtarma</h3><p>İletişim doğrulama ve güvenlik soruları birbirinden ayrı yönetilir.</p></div></div>
            <div className="auv3-stepup"><select value={stepUp.provider} onChange={(e) => setStepUp({ ...stepUp, provider: e.target.value })}><option value="GOOGLE">Google Authenticator</option><option value="MICROSOFT">Microsoft Authenticator</option></select><input value={stepUp.code} onChange={(e) => setStepUp({ ...stepUp, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6 haneli mevcut kod" /></div>
            <details><summary>İletişim Doğrulama</summary><div className="auv3-details-body"><label>E-posta<input type="email" value={contactDraft.email} onChange={(e) => setContactDraft({ ...contactDraft, email: e.target.value })} /></label><button type="button" onClick={() => startContact("EMAIL")}>E-postayı Doğrula</button><label>Telefon<input value={contactDraft.phone} onChange={(e) => setContactDraft({ ...contactDraft, phone: e.target.value })} /></label><button type="button" onClick={() => startContact("SMS")}>Telefonu Doğrula</button>{contactChallenge ? <div className="auv3-otp"><input value={contactOtp} onChange={(e) => setContactOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Doğrulama kodu" /><button type="button" className="primary" onClick={verifyContactHandler}>Kodu Doğrula</button></div> : null}<small>{ownerRecovery?.emailVerified ? "E-posta doğrulandı" : ""}{ownerRecovery?.phoneVerified ? " · Telefon doğrulandı" : ""}</small></div></details>
            <details><summary>3 Güvenlik Sorusu</summary><div className="auv3-details-body">{ownerQuestions.map((row,index) => <div className="auv3-question" key={index}><label>{index + 1}. Soru<input value={row.question} onChange={(e) => setOwnerQuestions((items) => items.map((item,i) => i === index ? { ...item, question: e.target.value } : item))} /></label><label>Cevap<input type="password" value={row.answer} onChange={(e) => setOwnerQuestions((items) => items.map((item,i) => i === index ? { ...item, answer: e.target.value } : item))} /></label></div>)}<button type="button" className="primary" onClick={saveOwnerQuestionsHandler}>Soruları Kaydet</button></div></details>
          </div> : null}
        </section>
      ) : null}

      {tab === "SESSIONS" ? (
        <div className="auv3-session-stack">
          {approvals.length ? <section className="auv3-panel"><div className="auv3-panel-title"><div><h3>Bekleyen Giriş Onayları</h3><p>{approvals.length} istek</p></div></div><div className="auv3-table"><table><thead><tr><th>Kullanıcı</th><th>Cihaz</th><th>IP</th><th>İstek</th><th></th></tr></thead><tbody>{approvals.map((row) => <tr key={row.id}><td>{row.fullName || row.username}</td><td>{row.deviceLabel || "-"}</td><td>{row.ipAddress || "-"}</td><td>{dateText(row.requestedAt)}</td><td><button type="button" onClick={() => run(() => approveLogin(row.id), "Giriş onaylandı.")}>Onayla</button><button type="button" className="danger" onClick={() => run(() => denyLogin(row.id), "Giriş reddedildi.")}>Reddet</button></td></tr>)}</tbody></table></div></section> : null}
          <section className="auv3-panel"><div className="auv3-panel-title"><div><h3>Aktif Oturumlar</h3><p>Şu anda sunucu tarafından geçerli kabul edilen oturumlar.</p></div><button type="button" onClick={loadSecurity}>Oturumları Yenile</button></div><div className="auv3-table"><table><thead><tr><th>Kullanıcı</th><th>Rol / Firma</th><th>Cihaz</th><th>IP</th><th>Giriş</th><th>Son Hareket</th><th>Kalan</th><th></th></tr></thead><tbody>{sessions.map((row) => <tr key={row.id}><td><strong>{row.fullName || row.username}</strong><small>{row.email || ""}</small></td><td>{ROLE_LABELS[roleOf(row.role)] || row.role}<small>{companyName(row.mainCompanySlug)}</small></td><td>{friendlyDevice(row)}</td><td>{row.ipAddress || "-"}</td><td>{dateText(row.createdAt)}</td><td>{dateText(row.lastSeenAt)}</td><td>{remainingText(row.remainingSeconds)}</td><td><button type="button" className="danger" onClick={() => run(() => revokeSession(row.id), "Oturum sonlandırıldı.")}>Sonlandır</button></td></tr>)}{!sessions.length ? <tr><td colSpan="8">Aktif oturum bulunmuyor.</td></tr> : null}</tbody></table></div></section>
          <section className="auv3-panel"><div className="auv3-panel-title"><div><h3>Oturum Geçmişi</h3><p>Aktif, kapanmış ve süresi dolmuş oturumlar.</p></div></div><div className="auv3-table tall"><table><thead><tr><th>Durum</th><th>Kullanıcı</th><th>Giriş</th><th>Son Hareket</th><th>Çıkış</th><th>Süre</th><th>Cihaz / IP</th><th>Kapanış</th></tr></thead><tbody>{sessionHistory.map((row) => { const end = row.revokedAt || (row.closureReason === "EXPIRED" ? row.expiresAt : row.lastSeenAt); return <tr key={row.id}><td><span className={`auv3-state ${row.closureReason === "ACTIVE" ? "active" : ""}`}>{closureLabel(row.closureReason)}</span></td><td>{row.fullName || row.username}</td><td>{dateText(row.createdAt)}</td><td>{dateText(row.lastSeenAt)}</td><td>{row.closureReason === "ACTIVE" ? "-" : dateText(row.revokedAt || row.expiresAt)}</td><td>{durationText(row.createdAt, end)}</td><td>{friendlyDevice(row)}<small>{row.ipAddress || ""}</small></td><td>{closureLabel(row.closureReason)}{row.closureActorName ? <small>{row.closureActorName}</small> : null}</td></tr>; })}</tbody></table></div></section>
          <section className="auv3-panel"><div className="auv3-panel-title"><div><h3>Güvenlik Logu</h3><p>Giriş, oturum ve kullanıcı güvenliği hareketleri.</p></div></div><div className="auv3-table tall"><table><thead><tr><th>Zaman</th><th>İşlem</th><th>Uygulayan</th><th>Hedef</th><th>IP</th></tr></thead><tbody>{auditLog.map((row) => <tr key={row.id}><td>{dateText(row.createdAt)}</td><td>{row.action}</td><td>{row.actorName || "Sistem"}</td><td>{row.targetName || "-"}</td><td>{row.ipAddress || "-"}</td></tr>)}</tbody></table></div></section>
        </div>
      ) : null}
    </div>
  );
}
