import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
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
import "./AdminUsersPanel.css";
import "./AdminUsersSecurityV2.css";

const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME",
  "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "ASISTAN", "ADMIN", "RAPORLAR",
];
const MODULE_LABELS = {
  DASHBOARD: "Yönetim Özeti", MUHASEBE: "Muhasebe", FIRMA_CARI: "Firma / Cari",
  BELGE_ISLEM: "Belge İşlemleri", KDV: "KDV", CEK_ODEME: "Çek / Ödeme", DESEN: "Desen",
  IMALAT: "İmalat", BOYAHANE: "Boyahane", IK: "İK", ISNET: "İşNet", ASISTAN: "KY ERP Asistan",
  ADMIN: "Yönetim", RAPORLAR: "Raporlar",
};
const ROLE_LABELS = {
  SUPER_ADMIN: "Uygulama Sahibi", ADMIN: "Uygulama Sahibi", COMPANY_ADMIN: "Firma Yöneticisi",
  MUHASEBE: "Muhasebe Kullanıcısı", DESEN: "Desen Kullanıcısı", IMALAT: "İmalat Kullanıcısı",
  BOYAHANE: "Boyahane Kullanıcısı", IK: "İK Kullanıcısı", VIEWER: "Özel Yetkili Kullanıcı",
};
const OWNER_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
const MANAGED_ROLES = ["COMPANY_ADMIN", "MUHASEBE", "DESEN", "IMALAT", "BOYAHANE", "IK", "VIEWER"];
const LOGIN_POLICIES = [
  ["PASSWORD_ONLY", "Sadece parola", "Maksimum 30 dakika; süre sunucu tarafından zorunlu uygulanır."],
  ["GOOGLE", "Parola + Google Authenticator", "Google kodu zorunludur."],
  ["MICROSOFT", "Parola + Microsoft Authenticator", "Microsoft kodu zorunludur."],
  ["ANY_MFA", "Parola + Google veya Microsoft", "Kayıtlı iki uygulamadan herhangi biriyle giriş yapılabilir."],
  ["BOTH_MFA", "Parola + Google ve Microsoft", "Her girişte iki ayrı kod da doğrulanır."],
];
const SESSION_OPTIONS = [
  [1800, "30 dakika"], [3600, "1 saat"], [7200, "2 saat"], [14400, "4 saat"],
  [28800, "8 saat"], [43200, "12 saat"], [86400, "24 saat"],
];

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
      canView: row.canView === true, canCreate: row.canCreate === true, canUpdate: row.canUpdate === true,
      canDelete: row.canDelete === true, canApprove: row.canApprove === true,
    });
  }
  return Array.from(map.values());
}
function permissionPreset(type) {
  const full = new Set();
  const viewOnly = new Set();
  if (["FULL", "COMPANY_ADMIN"].includes(type)) MODULE_KEYS.forEach((key) => full.add(key));
  if (type === "VIEW") MODULE_KEYS.forEach((key) => viewOnly.add(key));
  if (type === "MUHASEBE") ["DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME", "ISNET", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "DESEN") ["DASHBOARD", "DESEN", "ASISTAN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "IMALAT") ["DASHBOARD", "IMALAT", "DESEN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "BOYAHANE") ["DASHBOARD", "BOYAHANE", "DESEN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "IK") ["DASHBOARD", "IK", "RAPORLAR"].forEach((key) => full.add(key));
  return MODULE_KEYS.map((moduleKey) => {
    if (type === "COMPANY_ADMIN" && moduleKey === "ADMIN") return { moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true };
    if (full.has(moduleKey)) return { moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: true, canApprove: true };
    if (viewOnly.has(moduleKey)) return { moduleKey, canView: true, canCreate: false, canUpdate: false, canDelete: false, canApprove: false };
    return emptyPermission(moduleKey);
  });
}
function emptyForm(companySlug = "mecit-hakan") {
  return {
    id: "", username: "", email: "", password: "", fullName: "", role: "VIEWER",
    mainCompanySlug: companySlug || "mecit-hakan", isActive: true, emailVerified: false,
    loginPolicy: "ANY_MFA", sessionSeconds: 28800, approvalRequired: true,
  };
}
function normalizeCompanies(value) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
  return rows.map((item) => ({
    id: String(item?.id || ""), name: String(item?.name || item?.ad || item?.slug || item?.kod || "Firma"),
    slug: String(item?.slug || item?.kod || ""), isActive: item?.isActive !== false,
  })).filter((item) => item.slug);
}
function dateText(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("tr-TR");
}
function remainingText(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  if (total < 3600) return `${Math.max(0, Math.ceil(total / 60))} dk`;
  return `${Math.floor(total / 3600)} sa ${Math.floor((total % 3600) / 60)} dk`;
}
function sessionLabel(seconds) {
  return SESSION_OPTIONS.find(([value]) => Number(value) === Number(seconds))?.[1] || `${Math.round(Number(seconds || 0) / 60)} dk`;
}
function policyLabel(policy) {
  return LOGIN_POLICIES.find(([key]) => key === policy)?.[1] || "Parola + Google veya Microsoft";
}

export default function AdminUsersPanel() {
  const { user: currentUser } = useAuth();
  const currentRole = roleOf(currentUser?.role);
  const isOwnerAdmin = OWNER_ROLES.has(currentRole);
  const roleOptions = isOwnerAdmin ? MANAGED_ROLES : MANAGED_ROLES.filter((role) => role !== "COMPANY_ADMIN");

  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissions, setPermissions] = useState(() => permissionPreset("VIEW"));
  const [form, setForm] = useState(() => emptyForm(currentUser?.mainCompanySlug));
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Kullanıcılar ve güvenlik profilleri yükleniyor...");

  const [ownerRecovery, setOwnerRecovery] = useState(null);
  const [ownerQuestions, setOwnerQuestions] = useState([
    { question: "", answer: "" }, { question: "", answer: "" }, { question: "", answer: "" },
  ]);
  const [stepUp, setStepUp] = useState({ provider: "GOOGLE", code: "" });
  const [contactDraft, setContactDraft] = useState({ email: "", phone: "" });
  const [contactChallenge, setContactChallenge] = useState(null);
  const [contactOtp, setContactOtp] = useState("");

  const companyMap = useMemo(() => new Map(companies.map((company) => [company.slug, company])), [companies]);
  const policyMap = useMemo(() => new Map(policies.map((item) => [item.userId, item])), [policies]);
  const selectedUser = useMemo(() => users.find((user) => user.id === selectedUserId) || null, [selectedUserId, users]);
  const selectedIsOwner = Boolean(selectedUser && OWNER_ROLES.has(roleOf(selectedUser.role)));

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return users.filter((user) => {
      const role = roleOf(user.role);
      const owner = OWNER_ROLES.has(role);
      if (companyFilter !== "ALL" && !owner && user.mainCompanySlug !== companyFilter) return false;
      if (statusFilter === "ACTIVE" && user.isActive === false) return false;
      if (statusFilter === "PASSIVE" && user.isActive !== false) return false;
      if (!query) return true;
      const companyName = companyMap.get(user.mainCompanySlug)?.name || user.mainCompanySlug || "";
      return [user.fullName, user.username, user.email, ROLE_LABELS[role], companyName, policyLabel(policyMap.get(user.id)?.loginPolicy)]
        .join(" ").toLocaleLowerCase("tr-TR").includes(query);
    });
  }, [companyFilter, companyMap, policyMap, search, statusFilter, users]);

  const activeUsers = users.filter((user) => user.isActive !== false).length;
  const passwordOnlyCount = policies.filter((item) => item.loginPolicy === "PASSWORD_ONLY").length;
  const anyMfaCount = policies.filter((item) => item.loginPolicy === "ANY_MFA").length;
  const strictMfaCount = policies.filter((item) => ["GOOGLE", "MICROSOFT", "BOTH_MFA"].includes(item.loginPolicy)).length;

  function companyName(slug) { return companyMap.get(slug)?.name || slug || "Firma seçilmedi"; }
  function defaultCompanySlug() {
    if (companyFilter !== "ALL") return companyFilter;
    return currentUser?.mainCompanySlug || companies.find((company) => company.isActive)?.slug || companies[0]?.slug || "mecit-hakan";
  }

  const loadCompanies = useCallback(async () => {
    const ownSlug = String(currentUser?.mainCompanySlug || "mecit-hakan");
    if (!isOwnerAdmin) {
      setCompanies([{ id: ownSlug, name: ownSlug, slug: ownSlug, isActive: true }]);
      return;
    }
    try {
      const rows = normalizeCompanies(await getMainCompanies());
      setCompanies(rows.length ? rows : [{ id: ownSlug, name: ownSlug, slug: ownSlug, isActive: true }]);
    } catch {
      setCompanies([{ id: ownSlug, name: ownSlug, slug: ownSlug, isActive: true }]);
    }
  }, [currentUser?.mainCompanySlug, isOwnerAdmin]);

  const loadUsers = useCallback(async () => {
    const data = await listUsers();
    const rows = Array.isArray(data) ? data : data?.items || [];
    setUsers(rows);
    setSelectedUserId((previous) => previous && rows.some((item) => item.id === previous) ? previous : "");
  }, []);

  const loadSecurity = useCallback(async () => {
    const result = await loadModuleData({
      scope: "admin:security",
      sources: {
        sessions: { critical: true, load: () => listActiveSessions() },
        approvals: { fallback: [], load: () => listLoginApprovals() },
      },
    });
    if (result.states.sessions.status !== "error") {
      const rows = result.data.sessions;
      setSessions(Array.isArray(rows) ? rows : rows?.items || []);
    }
    if (result.states.approvals.status !== "error") {
      const rows = result.data.approvals;
      setApprovals(Array.isArray(rows) ? rows : rows?.items || []);
    }
    const warning = moduleLoadMessage(result, "Aktif oturumlar alınamadı; son başarılı liste korunuyor.", "Giriş onayları yenilenemedi; aktif oturumlar kullanılabilir.");
    if (warning) setMessage(warning);
  }, []);

  const loadPolicies = useCallback(async () => {
    if (!isOwnerAdmin) { setPolicies([]); return; }
    const rows = await listLoginSecurityPolicies();
    setPolicies(Array.isArray(rows) ? rows : rows?.items || []);
  }, [isOwnerAdmin]);

  const loadOwnerRecovery = useCallback(async () => {
    if (!isOwnerAdmin) return;
    try {
      const data = await getOwnerRecoveryConfig();
      setOwnerRecovery(data);
      setContactDraft({ email: data?.email || "", phone: data?.phone || "" });
      setOwnerQuestions([0, 1, 2].map((index) => ({
        question: data?.questions?.[index]?.question || "",
        answer: "",
      })));
    } catch (error) {
      setMessage(`Uygulama sahibi kurtarma ayarları alınamadı: ${error?.message || "Bilinmeyen hata"}`);
    }
  }, [isOwnerAdmin]);

  const refreshAll = useCallback(async () => {
    try {
      setBusy(true);
      const results = await Promise.allSettled([loadCompanies(), loadUsers(), loadSecurity(), loadPolicies(), loadOwnerRecovery()]);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
      setMessage((current) => current || "Kullanıcı, yetki, giriş güvenliği ve oturum bilgileri güncel.");
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Yönetim bilgileri alınamadı."}`);
    } finally {
      setBusy(false);
    }
  }, [loadCompanies, loadOwnerRecovery, loadPolicies, loadSecurity, loadUsers]);

  useEffect(() => { refreshAll(); }, [refreshAll]);
  useEffect(() => {
    if (!selectedUserId) return undefined;
    let alive = true;
    getUserPermissions(selectedUserId)
      .then((rows) => { if (alive) setPermissions(normalizePermissions(rows)); })
      .catch((error) => { if (alive) setMessage(`Yetkiler alınamadı: ${error?.message || "Bilinmeyen hata"}`); });
    return () => { alive = false; };
  }, [selectedUserId]);
  useEffect(() => {
    const timer = window.setInterval(loadSecurity, 15000);
    return () => window.clearInterval(timer);
  }, [loadSecurity]);

  function resetEditor() {
    setSelectedUserId("");
    setForm(emptyForm(defaultCompanySlug()));
    setPermissions(permissionPreset("VIEW"));
  }
  function startEdit(user) {
    if (!user) return;
    const policy = policyMap.get(user.id) || {};
    const owner = OWNER_ROLES.has(roleOf(user.role));
    setSelectedUserId(user.id);
    setForm({
      id: user.id || "", username: user.username || "", email: user.email || "", password: "",
      fullName: user.fullName || "", role: roleOf(user.role), mainCompanySlug: user.mainCompanySlug || defaultCompanySlug(),
      isActive: user.isActive !== false, emailVerified: user.emailVerified === true,
      loginPolicy: owner ? "ANY_MFA" : policy.loginPolicy || "ANY_MFA",
      sessionSeconds: Number(policy.configuredSessionSeconds || 28800),
      approvalRequired: policy.approvalRequired ?? user.approvalRequired !== false,
    });
  }
  function editPermission(moduleKey, field, value) {
    if (selectedIsOwner) return;
    setPermissions((previous) => previous.map((row) => row.moduleKey === moduleKey ? { ...row, [field]: value } : row));
  }
  function applyPreset(type) { if (!selectedIsOwner) setPermissions(permissionPreset(type)); }
  function editForm(field, value) {
    setForm((previous) => {
      if (previous.id && selectedIsOwner && ["role", "mainCompanySlug", "isActive", "loginPolicy", "approvalRequired"].includes(field)) return previous;
      const next = { ...previous, [field]: value };
      if (field === "loginPolicy" && value === "PASSWORD_ONLY") next.sessionSeconds = 1800;
      if (field === "role") {
        const role = roleOf(value);
        if (["COMPANY_ADMIN", "MUHASEBE", "DESEN", "IMALAT", "BOYAHANE", "IK"].includes(role)) setPermissions(permissionPreset(role));
      }
      return next;
    });
  }

  async function handleSaveUser(event) {
    event?.preventDefault();
    if (!form.username.trim() || !form.fullName.trim()) { setMessage("Kullanıcı adı ve ad soyad zorunludur."); return; }
    if (!form.id && form.password.length < 6) { setMessage("Yeni kullanıcı için en az 6 karakter şifre girin."); return; }
    try {
      setBusy(true);
      const corePayload = {
        username: form.username.trim(), email: form.email.trim(), fullName: form.fullName.trim(),
        role: selectedIsOwner ? "SUPER_ADMIN" : form.role, mainCompanySlug: form.mainCompanySlug,
        isActive: selectedIsOwner ? true : form.isActive, emailVerified: form.emailVerified,
      };
      let userId = form.id;
      if (form.id) {
        await updateUser(form.id, corePayload);
        if (!selectedIsOwner) await updateUserPermissions(form.id, permissions);
        if (form.password.trim()) await resetUserPassword(form.id, form.password.trim());
      } else {
        const created = await createUser({ ...corePayload, password: form.password, permissions });
        userId = created?.id;
      }
      if (isOwnerAdmin && userId) {
        await updateLoginSecurityPolicy(userId, {
          loginPolicy: selectedIsOwner ? "ANY_MFA" : form.loginPolicy,
          sessionSeconds: form.loginPolicy === "PASSWORD_ONLY" ? 1800 : Number(form.sessionSeconds),
          approvalRequired: selectedIsOwner ? false : form.approvalRequired,
        });
      }
      setMessage(form.id ? "Kullanıcı, modül yetkileri ve giriş güvenliği kaydedildi. Eski oturumlar güvenlik için kapatıldı." : "Kullanıcı oluşturuldu ve giriş güvenliği uygulandı.");
      resetEditor();
      await Promise.all([loadUsers(), loadPolicies(), loadSecurity()]);
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kullanıcı kaydedilemedi."}`);
    } finally { setBusy(false); }
  }

  async function runSecurityAction(action, successMessage) {
    try {
      setBusy(true);
      await action();
      setMessage(successMessage);
      await Promise.all([loadUsers(), loadPolicies(), loadSecurity()]);
    } catch (error) {
      setMessage(`Hata: ${error?.message || "İşlem tamamlanamadı."}`);
    } finally { setBusy(false); }
  }
  async function handleToggleActive(user) {
    if (!user || OWNER_ROLES.has(roleOf(user.role))) return;
    if (user.isActive && !window.confirm(`${user.fullName || user.username} pasife alınsın mı? Aktif oturumları kapanır.`)) return;
    await runSecurityAction(() => user.isActive ? deactivateUser(user.id) : activateUser(user.id), user.isActive ? "Kullanıcı pasife alındı." : "Kullanıcı aktifleştirildi.");
    resetEditor();
  }
  async function handleResetMfa(user, provider = "ALL") {
    if (!user) return;
    const normalized = String(provider || "ALL").toUpperCase();
    const label = normalized === "GOOGLE" ? "Google Authenticator" : normalized === "MICROSOFT" ? "Microsoft Authenticator" : "tüm Authenticator kayıtları";
    if (!window.confirm(`${user.fullName || user.username} için ${label} yeniden kurulsun mu? Eski kayıt kullanılamaz.`)) return;
    await runSecurityAction(() => resetUserMfa(user.id, normalized), `${label} sıfırlandı. Sonraki gerekli girişte yeni QR oluşturulacak.`);
  }
  async function handleSavePermissions() {
    if (!selectedUserId || selectedIsOwner) return;
    await runSecurityAction(() => updateUserPermissions(selectedUserId, permissions), "Modül yetkileri kaydedildi.");
  }

  async function saveOwnerQuestions() {
    if (!/^\d{6}$/.test(stepUp.code)) { setMessage("Güvenlik sorularını değiştirmek için mevcut Authenticator kodunuzu girin."); return; }
    try {
      setBusy(true);
      await saveOwnerRecoveryQuestions({ provider: stepUp.provider, code: stepUp.code, questions: ownerQuestions });
      setStepUp((previous) => ({ ...previous, code: "" }));
      setMessage("Uygulama sahibi özel güvenlik soruları kaydedildi. Cevaplar okunabilir biçimde saklanmaz.");
      await loadOwnerRecovery();
    } catch (error) { setMessage(`Kurtarma soruları kaydedilemedi: ${error?.message || "Hata"}`); }
    finally { setBusy(false); }
  }
  async function startContactVerification(channel) {
    const value = channel === "EMAIL" ? contactDraft.email : contactDraft.phone;
    if (!/^\d{6}$/.test(stepUp.code)) { setMessage("İletişim kanalını değiştirmek için mevcut Authenticator kodunuzu girin."); return; }
    try {
      setBusy(true);
      const data = await startOwnerRecoveryContactVerification({ channel, value, provider: stepUp.provider, code: stepUp.code });
      setContactChallenge({ ...data, channel });
      setContactOtp("");
      setMessage(`${channel === "EMAIL" ? "E-posta" : "Telefon"} doğrulama kodu ${data?.masked || "kayıtlı kanala"} gönderildi.`);
    } catch (error) { setMessage(`Doğrulama başlatılamadı: ${error?.message || "Hata"}`); }
    finally { setBusy(false); }
  }
  async function verifyContact() {
    if (!contactChallenge || !/^\d{6}$/.test(contactOtp)) { setMessage("6 haneli doğrulama kodunu girin."); return; }
    try {
      setBusy(true);
      await verifyOwnerRecoveryContact({ recoveryId: contactChallenge.recoveryId, recoveryToken: contactChallenge.recoveryToken, otp: contactOtp });
      setContactChallenge(null);
      setContactOtp("");
      setStepUp((previous) => ({ ...previous, code: "" }));
      setMessage("Kurtarma iletişim kanalı doğrulandı.");
      await loadOwnerRecovery();
    } catch (error) { setMessage(`Kanal doğrulanamadı: ${error?.message || "Hata"}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="admin-users-page">
      <header className="admin-security-header">
        <div><div className="admin-users-eyebrow">YÖNETİM / KULLANICILAR</div><h2>Firma Kullanıcıları ve Yetkilendirme</h2><p>{message}</p></div>
        <div className="admin-header-actions"><button type="button" className="primary" onClick={resetEditor} disabled={busy}>+ Yeni Kullanıcı</button><button type="button" onClick={refreshAll} disabled={busy}>Yenile</button></div>
      </header>

      {isOwnerAdmin ? (
        <section className="owner-banner"><div className="owner-badge">SAHİP</div><div><strong>{currentUser?.fullName || currentUser?.username || "Uygulama Sahibi"}</strong><span>Uygulama güvenliği, kullanıcı giriş yöntemleri ve oturum süreleri bu hesap tarafından yönetilir.</span></div><div className="owner-scope">Tüm firmalara tam erişim</div></section>
      ) : (
        <section className="owner-banner company-admin-banner"><div className="owner-badge">FİRMA</div><div><strong>{companyName(currentUser?.mainCompanySlug)}</strong><span>Firma yöneticisi modül yetkilerini yönetebilir; giriş güvenliğini zayıflatamaz veya oturum süresini uzatamaz.</span></div></section>
      )}

      <section className="security-summary">
        <div><span>Aktif kullanıcı</span><strong>{activeUsers}</strong></div>
        <div><span>Sadece parola</span><strong>{passwordOnlyCount}</strong></div>
        <div><span>Google / Microsoft seçmeli</span><strong>{anyMfaCount}</strong></div>
        <div><span>Zorunlu MFA profili</span><strong>{strictMfaCount}</strong></div>
        <div><span>Aktif oturum</span><strong>{sessions.length}</strong></div>
      </section>

      {approvals.length ? (
        <section className="admin-panel security-panel attention-panel">
          <div className="panel-head"><div><h3>Bekleyen Giriş Onayları</h3><p>Parola/MFA aşamasını tamamlayan ve yönetici onayı bekleyen cihazlar.</p></div></div>
          <div className="security-table-wrap"><table><thead><tr><th>Kullanıcı</th><th>Firma</th><th>Cihaz</th><th>IP</th><th>İstek</th><th>İşlem</th></tr></thead><tbody>
            {approvals.map((item) => <tr key={item.id}><td><strong>{item.fullName || item.username}</strong><small>{item.email || `@${item.username}`}</small></td><td>{companyName(item.mainCompanySlug)}</td><td>{item.deviceLabel || "-"}</td><td>{item.ipAddress || "-"}</td><td>{dateText(item.requestedAt)}</td><td className="security-actions"><button type="button" className="approve" onClick={() => runSecurityAction(() => approveLogin(item.id), "Giriş onaylandı.")}>Onayla</button><button type="button" className="danger-light" onClick={() => runSecurityAction(() => denyLogin(item.id), "Giriş reddedildi.")}>Reddet</button></td></tr>)}
          </tbody></table></div>
        </section>
      ) : null}

      <section className="admin-users-workspace">
        <aside className="admin-panel users-directory">
          <div className="panel-head directory-head"><div><h3>Kullanıcılar</h3><p>{filteredUsers.length} kayıt gösteriliyor</p></div><button type="button" className="compact" onClick={resetEditor}>Ekle</button></div>
          <div className="directory-filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ad, e-posta, rol veya güvenlik ara..." />
            {isOwnerAdmin ? <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="ALL">Tüm firmalar</option>{companies.map((company) => <option key={company.slug} value={company.slug}>{company.name}</option>)}</select> : null}
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ACTIVE">Aktif kullanıcılar</option><option value="ALL">Aktif + pasif</option><option value="PASSIVE">Sadece pasif</option></select>
          </div>
          <div className="list-wrap">
            {filteredUsers.map((user) => {
              const role = roleOf(user.role); const owner = OWNER_ROLES.has(role); const policy = policyMap.get(user.id);
              return <button key={user.id} type="button" className={`list-row ${selectedUserId === user.id ? "active" : ""} ${user.isActive === false ? "passive" : ""}`} onClick={() => startEdit(user)}>
                <div className="user-main"><div className="user-title-row"><strong>{user.fullName || user.username}</strong>{owner ? <span className="role-pill owner">Sahip</span> : null}{user.isActive === false ? <span className="role-pill passive">Pasif</span> : null}</div><span>{user.email || `@${user.username}`}</span><span>{owner ? "Tüm firmalar" : companyName(user.mainCompanySlug)} · {policy ? policyLabel(policy.loginPolicy) : (user.mfaEnabled ? "MFA" : "Güvenlik profili")}</span></div><small>{ROLE_LABELS[role] || role}</small>
              </button>;
            })}
            {!filteredUsers.length ? <div className="security-empty">Filtreye uygun kullanıcı bulunamadı.</div> : null}
          </div>
        </aside>

        <main className="admin-panel user-editor">
          <div className="panel-head editor-head"><div><h3>{form.id ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}</h3><p>Firma, rol, modül ve giriş güvenliğini tek yerden yönetin.</p></div>{selectedUser ? <span className={`status-chip ${selectedUser.isActive === false ? "passive" : "active"}`}>{selectedUser.isActive === false ? "Pasif" : "Aktif"}</span> : null}</div>
          <form onSubmit={handleSaveUser} className="user-form">
            <div className="form-grid two-col">
              <label>Kullanıcı Adı<input value={form.username} onChange={(event) => editForm("username", event.target.value)} /></label>
              <label>Ad Soyad<input value={form.fullName} onChange={(event) => editForm("fullName", event.target.value)} /></label>
              <label>E-posta<input type="email" value={form.email} onChange={(event) => editForm("email", event.target.value)} /></label>
              <label>Şifre {form.id ? "(değişmeyecekse boş)" : ""}<input type="password" value={form.password} onChange={(event) => editForm("password", event.target.value)} /></label>
              <label>Ana Firma<select value={form.mainCompanySlug} onChange={(event) => editForm("mainCompanySlug", event.target.value)} disabled={!isOwnerAdmin || selectedIsOwner}>{companies.length ? companies.map((company) => <option key={company.slug} value={company.slug}>{company.name}{company.isActive ? "" : " (Pasif)"}</option>) : <option value={form.mainCompanySlug}>{form.mainCompanySlug || "Firma"}</option>}</select></label>
              <label>Rol{selectedIsOwner ? <input value="Uygulama Sahibi · Tam Yetki" disabled /> : <select value={form.role} onChange={(event) => editForm("role", event.target.value)}>{roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>)}</select>}</label>
            </div>

            <div className="security-options">
              <label className={`check-field ${selectedIsOwner ? "locked" : ""}`}><input type="checkbox" checked={selectedIsOwner ? true : form.isActive} disabled={selectedIsOwner} onChange={(event) => editForm("isActive", event.target.checked)} /><span><strong>Aktif kullanıcı</strong><small>Kapalıysa giriş yapamaz.</small></span></label>
              <label className="check-field"><input type="checkbox" checked={form.emailVerified} onChange={(event) => editForm("emailVerified", event.target.checked)} /><span><strong>E-posta doğrulandı</strong><small>Yönetici tarafından teyit edilen adres.</small></span></label>
            </div>

            {isOwnerAdmin ? (
              <div className="login-policy-card">
                <div className="security-v2-title"><div><strong>Giriş Güvenliği ve Oturum</strong><span>{selectedIsOwner ? "Uygulama sahibi parola-only kullanamaz; Google veya Microsoft zorunludur." : "Bu kullanıcı için giriş yöntemini ve oturum süresini siz belirlersiniz."}</span></div><span className="security-owner-only">SAHİP KONTROLÜ</span></div>
                <div className="form-grid two-col">
                  <label>Giriş Güvenliği<select value={selectedIsOwner ? "ANY_MFA" : form.loginPolicy} disabled={selectedIsOwner} onChange={(event) => editForm("loginPolicy", event.target.value)}>{LOGIN_POLICIES.filter(([key]) => !selectedIsOwner || key === "ANY_MFA").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>{LOGIN_POLICIES.find(([key]) => key === (selectedIsOwner ? "ANY_MFA" : form.loginPolicy))?.[2]}</small></label>
                  <label>Oturum Süresi<select value={form.loginPolicy === "PASSWORD_ONLY" ? 1800 : form.sessionSeconds} disabled={form.loginPolicy === "PASSWORD_ONLY"} onChange={(event) => editForm("sessionSeconds", Number(event.target.value))}>{SESSION_OPTIONS.filter(([seconds]) => !selectedIsOwner || seconds <= 28800).map(([seconds, label]) => <option key={seconds} value={seconds}>{label}</option>)}</select><small>{form.loginPolicy === "PASSWORD_ONLY" ? "Sadece parola: sunucu en fazla 30 dakika izin verir ve süre dolunca ekran otomatik kapanır." : `Seçili süre: ${sessionLabel(form.sessionSeconds)}`}</small></label>
                </div>
                {!selectedIsOwner ? <label className="check-field standalone-check"><input type="checkbox" checked={form.approvalRequired} onChange={(event) => editForm("approvalRequired", event.target.checked)} /><span><strong>Yeni cihaz girişinde yönetici onayı</strong><small>Parola/MFA bittikten sonra ayrıca yönetici onayı bekler.</small></span></label> : null}
                {selectedUser ? <div className="security-user-actions"><div><strong>Authenticator kayıt durumu</strong><span>Google: {selectedUser.googleMfaEnabled ? "Aktif" : "Kurulum gerekli"} · Microsoft: {selectedUser.microsoftMfaEnabled ? "Aktif" : "Kurulum gerekli"}</span><small>Politikayı kapatmak kayıtlı anahtarı silmez; “Yeniden Kur” yalnız açıkça seçildiğinde secret değişir.</small></div><div className="form-actions"><button type="button" onClick={() => handleResetMfa(selectedUser, "GOOGLE")}>Google Yeniden Kur</button><button type="button" onClick={() => handleResetMfa(selectedUser, "MICROSOFT")}>Microsoft Yeniden Kur</button><button type="button" className="danger-light" onClick={() => handleResetMfa(selectedUser, "ALL")}>Tüm MFA'yı Sıfırla</button><button type="button" onClick={() => runSecurityAction(() => revokeAllUserSessions(selectedUser.id), "Kullanıcının bütün aktif oturumları kapatıldı.")}>Tüm Oturumları Kapat</button></div></div> : null}
              </div>
            ) : <div className="login-policy-readonly"><strong>Giriş güvenliği uygulama sahibi tarafından yönetilir.</strong><span>Firma yöneticisi modül yetkilerini değiştirebilir; MFA veya oturum süresini zayıflatamaz.</span></div>}

            <div className="form-actions primary-actions"><button type="submit" className="primary" disabled={busy}>{form.id ? "Kullanıcıyı Kaydet" : "Kullanıcı Oluştur"}</button><button type="button" onClick={resetEditor}>Yeni Kayıt</button>{selectedUser && !selectedIsOwner ? <button type="button" className={selectedUser.isActive ? "danger-light" : "approve"} onClick={() => handleToggleActive(selectedUser)}>{selectedUser.isActive ? "Firmadan Çıkar / Pasife Al" : "Tekrar Aktifleştir"}</button> : null}</div>
          </form>
        </main>
      </section>

      {isOwnerAdmin && ownerRecovery ? (
        <section className="admin-panel owner-recovery-panel">
          <div className="panel-head"><div><h3>Uygulama Sahibi Kurtarma Güvenliği</h3><p>Authenticator'ların ikisi de kaybolursa doğrulanmış telefon veya e-posta + iki özel soru yalnız MFA yeniden kurulumuna izin verir; doğrudan oturum açmaz.</p></div><span className={`status-chip ${ownerRecovery.recoveryEnabled ? "active" : "passive"}`}>{ownerRecovery.recoveryEnabled ? "Kurtarma Hazır" : "Kurulum Eksik"}</span></div>
          <div className="owner-recovery-status-grid">
            <div><span>E-posta</span><strong>{ownerRecovery.emailMasked || "Tanımlı değil"}</strong><small>{ownerRecovery.emailVerified ? "Doğrulandı" : "Doğrulanmadı"} · Gönderim servisi: {ownerRecovery.readiness?.capabilities?.email ? "Hazır" : "Bağlı değil"}</small></div>
            <div><span>Telefon</span><strong>{ownerRecovery.phoneMasked || "Tanımlı değil"}</strong><small>{ownerRecovery.phoneVerified ? "Doğrulandı" : "Doğrulanmadı"} · SMS servisi: {ownerRecovery.readiness?.capabilities?.sms ? "Hazır" : "Bağlı değil"}</small></div>
            <div><span>Özel sorular</span><strong>{ownerRecovery.readiness?.questionsConfigured ? "3 / 3" : `${ownerRecovery.questions?.length || 0} / 3`}</strong><small>Cevaplar salt + PBKDF2 hash olarak saklanır, tekrar görüntülenmez.</small></div>
          </div>
          <div className="owner-recovery-note">{ownerRecovery.note}</div>

          <div className="owner-recovery-stepup">
            <strong>Güvenlik değişikliği doğrulaması</strong>
            <div className="form-grid two-col"><label>Mevcut Authenticator<select value={stepUp.provider} onChange={(event) => setStepUp((previous) => ({ ...previous, provider: event.target.value }))}><option value="GOOGLE">Google Authenticator</option><option value="MICROSOFT">Microsoft Authenticator</option></select></label><label>6 haneli mevcut kod<input inputMode="numeric" maxLength={6} value={stepUp.code} onChange={(event) => setStepUp((previous) => ({ ...previous, code: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="000000" /></label></div>
          </div>

          <div className="owner-contact-grid">
            <div className="owner-contact-card"><strong>Kurtarma E-postası</strong><input type="email" value={contactDraft.email} onChange={(event) => setContactDraft((previous) => ({ ...previous, email: event.target.value }))} /><button type="button" disabled={busy || !ownerRecovery.readiness?.capabilities?.email} onClick={() => startContactVerification("EMAIL")}>E-postaya Kod Gönder ve Doğrula</button>{!ownerRecovery.readiness?.capabilities?.email ? <small>Worker'da gerçek e-posta gönderim servisi bağlı olmadığı için sahte doğrulama açılmaz.</small> : null}</div>
            <div className="owner-contact-card"><strong>Kurtarma Telefonu</strong><input value={contactDraft.phone} onChange={(event) => setContactDraft((previous) => ({ ...previous, phone: event.target.value }))} placeholder="+90 5xx xxx xx xx" /><button type="button" disabled={busy || !ownerRecovery.readiness?.capabilities?.sms} onClick={() => startContactVerification("SMS")}>Telefona SMS Kodu Gönder ve Doğrula</button>{!ownerRecovery.readiness?.capabilities?.sms ? <small>Worker'da gerçek SMS gönderim servisi bağlı olmadığı için sahte doğrulama açılmaz.</small> : null}</div>
          </div>

          {contactChallenge ? <div className="owner-contact-verify"><strong>{contactChallenge.channel === "EMAIL" ? "E-posta" : "Telefon"} kodunu doğrula</strong><span>{contactChallenge.masked}</span><input inputMode="numeric" maxLength={6} value={contactOtp} onChange={(event) => setContactOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /><button type="button" className="primary" onClick={verifyContact} disabled={busy}>Kodu Doğrula</button></div> : null}

          <div className="owner-questions-grid">
            {ownerQuestions.map((item, index) => <div className="owner-question-card" key={index}><strong>{index + 1}. Özel Soru</strong><input value={item.question} onChange={(event) => setOwnerQuestions((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, question: event.target.value } : row))} placeholder={index === 0 ? "Örn. Sadece benim bildiğim iş yeri sorusu" : "Kendi sorunuzu yazın"} /><input type="password" autoComplete="new-password" value={item.answer} onChange={(event) => setOwnerQuestions((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, answer: event.target.value } : row))} placeholder={ownerRecovery.questions?.[index]?.configured ? "Değişmeyecekse boş bırakın" : "Cevabı yazın"} /><small>İnternetten veya yakın çevreden kolay öğrenilmeyen bir cevap kullanın.</small></div>)}
          </div>
          <div className="form-actions"><button type="button" className="primary" onClick={saveOwnerQuestions} disabled={busy}>3 Güvenlik Sorusunu Kaydet</button></div>
        </section>
      ) : null}

      <section className="admin-panel permissions-panel">
        <div className="panel-head permissions-head"><div><h3>Modül Yetkileri</h3><p>{selectedIsOwner ? "Uygulama sahibinin tüm yetkileri zorunlu olarak açıktır." : form.id ? "Seçili kullanıcının modül işlem yetkilerini düzenleyin." : "Yeni kullanıcı için başlangıç yetkilerini seçin."}</p></div>{!selectedIsOwner ? <div className="permission-presets"><button type="button" onClick={() => applyPreset("FULL")}>Tam Yetki</button><button type="button" onClick={() => applyPreset("VIEW")}>Sadece Gör</button><button type="button" onClick={() => applyPreset("NONE")}>Temizle</button><button type="button" className="primary" onClick={handleSavePermissions} disabled={busy || !selectedUserId}>Yetkileri Kaydet</button></div> : null}</div>
        <div className="security-table-wrap"><table><thead><tr><th>Modül</th><th>Gör</th><th>Ekle</th><th>Güncelle</th><th>Sil</th><th>Onayla</th></tr></thead><tbody>{permissions.map((row) => <tr key={row.moduleKey}><td><strong>{MODULE_LABELS[row.moduleKey] || row.moduleKey}</strong><small>{row.moduleKey}</small></td>{["canView", "canCreate", "canUpdate", "canDelete", "canApprove"].map((field) => { const lock = form.role === "COMPANY_ADMIN" && row.moduleKey === "ADMIN" && field === "canDelete"; return <td key={field}><input type="checkbox" checked={selectedIsOwner ? true : lock ? false : row[field]} disabled={selectedIsOwner || lock} onChange={(event) => editPermission(row.moduleKey, field, event.target.checked)} /></td>; })}</tr>)}</tbody></table></div>
      </section>

      <section className="admin-panel security-panel">
        <div className="panel-head"><div><h3>Aktif Oturumlar</h3><p>Her kullanıcının kalan süresi kendi güvenlik profiline göre hesaplanır; istenen oturum anında kapatılabilir.</p></div><button type="button" onClick={loadSecurity} disabled={busy}>Oturumları Yenile</button></div>
        {sessions.length ? <div className="security-table-wrap"><table><thead><tr><th>Kullanıcı</th><th>Rol / Firma</th><th>Cihaz</th><th>IP</th><th>Giriş</th><th>Son Hareket</th><th>Kalan</th><th>İşlem</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id}><td><strong>{session.fullName || session.username}</strong><small>{session.email || `@${session.username}`}</small></td><td>{ROLE_LABELS[roleOf(session.role)] || session.role}<small>{OWNER_ROLES.has(roleOf(session.role)) ? "Tüm firmalar" : companyName(session.mainCompanySlug)}</small></td><td>{session.deviceLabel || "-"}</td><td>{session.ipAddress || "-"}</td><td>{dateText(session.createdAt)}</td><td>{dateText(session.lastSeenAt)}</td><td><strong>{remainingText(session.remainingSeconds)}</strong></td><td><button type="button" className="danger-light" onClick={() => runSecurityAction(() => revokeSession(session.id), "Oturum anında kapatıldı.")}>Oturumu Sonlandır</button></td></tr>)}</tbody></table></div> : <div className="security-empty">Aktif oturum bulunmuyor.</div>}
      </section>
    </div>
  );
}
