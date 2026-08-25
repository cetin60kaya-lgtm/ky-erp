import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  activateUser,
  approveLogin,
  createUser,
  deactivateUser,
  denyLogin,
  getMainCompanies,
  getUserPermissions,
  listActiveSessions,
  listLoginApprovals,
  listUsers,
  resetUserMfa,
  resetUserPassword,
  revokeAllUserSessions,
  revokeSession,
  updateUser,
  updateUserPermissions,
} from "../../services/adminApi";
import "./AdminUsersPanel.css";

const MODULE_KEYS = [
  "DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME",
  "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "ASISTAN", "ADMIN", "RAPORLAR",
];

const MODULE_LABELS = {
  DASHBOARD: "Yönetim Özeti",
  MUHASEBE: "Muhasebe",
  FIRMA_CARI: "Firma / Cari",
  BELGE_ISLEM: "Belge İşlemleri",
  KDV: "KDV",
  CEK_ODEME: "Çek / Ödeme",
  DESEN: "Desen",
  IMALAT: "İmalat",
  BOYAHANE: "Boyahane",
  IK: "İK",
  ISNET: "İşNet",
  ASISTAN: "KY ERP Asistan",
  ADMIN: "Yönetim",
  RAPORLAR: "Raporlar",
};

const ROLE_LABELS = {
  SUPER_ADMIN: "Uygulama Sahibi",
  ADMIN: "Uygulama Sahibi",
  COMPANY_ADMIN: "Firma Yöneticisi",
  MUHASEBE: "Muhasebe Kullanıcısı",
  DESEN: "Desen Kullanıcısı",
  IMALAT: "İmalat Kullanıcısı",
  BOYAHANE: "Boyahane Kullanıcısı",
  IK: "İK Kullanıcısı",
  VIEWER: "Özel Yetkili Kullanıcı",
};

const OWNER_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
const MANAGED_ROLES = [
  "COMPANY_ADMIN", "MUHASEBE", "DESEN", "IMALAT", "BOYAHANE", "IK", "VIEWER",
];

function roleOf(value) {
  const role = String(value || "VIEWER").toUpperCase();
  return role === "ADMIN" ? "SUPER_ADMIN" : role;
}

function emptyPermission(moduleKey) {
  return {
    moduleKey,
    canView: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
  };
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
  const viewOnly = new Set();
  if (type === "FULL" || type === "COMPANY_ADMIN") MODULE_KEYS.forEach((key) => full.add(key));
  if (type === "VIEW") MODULE_KEYS.forEach((key) => viewOnly.add(key));
  if (type === "MUHASEBE") ["DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME", "ISNET", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "DESEN") ["DASHBOARD", "DESEN", "ASISTAN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "IMALAT") ["DASHBOARD", "IMALAT", "DESEN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "BOYAHANE") ["DASHBOARD", "BOYAHANE", "DESEN", "RAPORLAR"].forEach((key) => full.add(key));
  if (type === "IK") ["DASHBOARD", "IK", "RAPORLAR"].forEach((key) => full.add(key));

  return MODULE_KEYS.map((moduleKey) => {
    if (type === "COMPANY_ADMIN" && moduleKey === "ADMIN") {
      return { moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: false, canApprove: true };
    }
    if (full.has(moduleKey)) {
      return { moduleKey, canView: true, canCreate: true, canUpdate: true, canDelete: true, canApprove: true };
    }
    if (viewOnly.has(moduleKey)) {
      return { moduleKey, canView: true, canCreate: false, canUpdate: false, canDelete: false, canApprove: false };
    }
    return emptyPermission(moduleKey);
  });
}

function emptyForm(companySlug = "mecit-hakan") {
  return {
    id: "",
    username: "",
    email: "",
    password: "",
    fullName: "",
    role: "VIEWER",
    mainCompanySlug: companySlug || "mecit-hakan",
    isActive: true,
    approvalRequired: true,
    emailVerified: false,
  };
}

function normalizeCompanies(value) {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
  return rows
    .map((item) => ({
      id: String(item?.id || ""),
      name: String(item?.name || item?.ad || item?.slug || item?.kod || "Firma"),
      slug: String(item?.slug || item?.kod || ""),
      isActive: item?.isActive !== false,
    }))
    .filter((item) => item.slug);
}

function dateText(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("tr-TR");
}

function remainingText(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  return `${Math.floor(total / 3600)} sa ${Math.floor((total % 3600) / 60)} dk`;
}

export default function AdminUsersPanel() {
  const { user: currentUser } = useAuth();
  const currentRole = roleOf(currentUser?.role);
  const isOwnerAdmin = OWNER_ROLES.has(currentRole);
  const roleOptions = isOwnerAdmin
    ? MANAGED_ROLES
    : MANAGED_ROLES.filter((role) => role !== "COMPANY_ADMIN");

  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissions, setPermissions] = useState(() => permissionPreset("VIEW"));
  const [form, setForm] = useState(() => emptyForm(currentUser?.mainCompanySlug));
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Kullanıcılar, firmalar ve güvenlik durumu yükleniyor...");

  const companyMap = useMemo(
    () => new Map(companies.map((company) => [company.slug, company])),
    [companies],
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users],
  );
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
      return [user.fullName, user.username, user.email, ROLE_LABELS[role], role, companyName]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query);
    });
  }, [companyFilter, companyMap, search, statusFilter, users]);

  const activeUsers = users.filter((user) => user.isActive !== false).length;
  const mfaUsers = users.filter((user) => user.mfaEnabled).length;
  const linkedCompanyCount = new Set(
    users
      .filter((user) => !OWNER_ROLES.has(roleOf(user.role)))
      .map((user) => user.mainCompanySlug)
      .filter(Boolean),
  ).size;

  function companyName(slug) {
    return companyMap.get(slug)?.name || slug || "Firma seçilmedi";
  }

  function defaultCompanySlug() {
    if (companyFilter !== "ALL") return companyFilter;
    return currentUser?.mainCompanySlug
      || companies.find((company) => company.isActive)?.slug
      || companies[0]?.slug
      || "mecit-hakan";
  }

  const loadSecurity = useCallback(async () => {
    try {
      const [sessionRows, approvalRows] = await Promise.all([
        listActiveSessions(),
        listLoginApprovals(),
      ]);
      setSessions(Array.isArray(sessionRows) ? sessionRows : sessionRows?.items || []);
      setApprovals(Array.isArray(approvalRows) ? approvalRows : approvalRows?.items || []);
    } catch (error) {
      setMessage(`Güvenlik bilgisi alınamadı: ${error?.message || "Bilinmeyen hata"}`);
    }
  }, []);

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
    try {
      setBusy(true);
      const data = await listUsers();
      const rows = Array.isArray(data) ? data : data?.items || [];
      setUsers(rows);
      setSelectedUserId((previous) => (
        previous && rows.some((user) => user.id === previous) ? previous : ""
      ));
      setMessage("Kullanıcı ve firma yetkileri güncel.");
    } catch (error) {
      setUsers([]);
      setSelectedUserId("");
      setMessage(`Hata: ${error?.message || "Kullanıcılar alınamadı."}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCompanies(), loadUsers(), loadSecurity()]);
  }, [loadCompanies, loadSecurity, loadUsers]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedUserId) return undefined;
    let alive = true;
    getUserPermissions(selectedUserId)
      .then((rows) => {
        if (alive) setPermissions(normalizePermissions(rows));
      })
      .catch((error) => {
        if (alive) setMessage(`Yetkiler alınamadı: ${error?.message || "Bilinmeyen hata"}`);
      });
    return () => {
      alive = false;
    };
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
    setSelectedUserId(user.id);
    setForm({
      id: user.id || "",
      username: user.username || "",
      email: user.email || "",
      password: "",
      fullName: user.fullName || "",
      role: roleOf(user.role),
      mainCompanySlug: user.mainCompanySlug || defaultCompanySlug(),
      isActive: user.isActive !== false,
      approvalRequired: user.approvalRequired !== false,
      emailVerified: user.emailVerified === true,
    });
  }

  function editPermission(moduleKey, field, value) {
    if (selectedIsOwner) return;
    setPermissions((previous) => previous.map((row) => (
      row.moduleKey === moduleKey ? { ...row, [field]: value } : row
    )));
  }

  function applyPreset(type) {
    if (!selectedIsOwner) setPermissions(permissionPreset(type));
  }

  function editForm(field, value) {
    setForm((previous) => {
      if (previous.id && selectedIsOwner && ["role", "mainCompanySlug", "isActive", "approvalRequired"].includes(field)) {
        return previous;
      }
      const next = { ...previous, [field]: value };
      if (field === "role") {
        const role = roleOf(value);
        next.approvalRequired = role !== "COMPANY_ADMIN";
        if (["COMPANY_ADMIN", "MUHASEBE", "DESEN", "IMALAT", "BOYAHANE", "IK"].includes(role)) {
          setPermissions(permissionPreset(role));
        }
      }
      return next;
    });
  }

  async function handleSaveUser(event) {
    event?.preventDefault();
    if (!form.username.trim() || !form.fullName.trim()) {
      setMessage("Kullanıcı adı ve ad soyad zorunludur.");
      return;
    }
    if (!form.id && form.password.length < 6) {
      setMessage("Yeni kullanıcı için en az 6 karakter şifre girin.");
      return;
    }
    if (!selectedIsOwner && !form.mainCompanySlug) {
      setMessage("Kullanıcıyı bir ana firmaya bağlayın.");
      return;
    }

    try {
      setBusy(true);
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        role: selectedIsOwner ? "SUPER_ADMIN" : form.role,
        mainCompanySlug: form.mainCompanySlug,
        isActive: selectedIsOwner ? true : form.isActive,
        approvalRequired: selectedIsOwner ? false : form.approvalRequired,
        emailVerified: form.emailVerified,
      };

      if (form.id) {
        await updateUser(form.id, payload);
        if (!selectedIsOwner) await updateUserPermissions(form.id, permissions);
        if (form.password.trim()) await resetUserPassword(form.id, form.password.trim());
        setMessage(selectedIsOwner
          ? "Uygulama sahibi hesabı güncellendi; sahip rolü ve aktif durumu korundu."
          : "Kullanıcı, firma bağlantısı ve yetkileri güncellendi.");
      } else {
        await createUser({ ...payload, password: form.password, permissions });
        setMessage("Kullanıcı oluşturuldu ve seçilen firmaya bağlandı. İlk girişte Authenticator kurulumu yapılacak.");
      }

      resetEditor();
      await Promise.all([loadUsers(), loadSecurity()]);
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kullanıcı kaydedilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(user) {
    if (!user) return;
    if (OWNER_ROLES.has(roleOf(user.role))) {
      setMessage("Uygulama sahibi hesabı pasife alınamaz.");
      return;
    }
    if (user.isActive) {
      const approved = window.confirm(
        `${user.fullName || user.username} kullanıcısı firmadan çıkarılıp pasife alınsın mı? Aktif oturumları da kapanır.`,
      );
      if (!approved) return;
    }
    try {
      setBusy(true);
      if (user.isActive) await deactivateUser(user.id);
      else await activateUser(user.id);
      setMessage(user.isActive
        ? "Kullanıcı pasife alındı; kayıt ve işlem geçmişi korunarak erişimi kesildi."
        : "Kullanıcı yeniden aktifleştirildi.");
      resetEditor();
      await Promise.all([loadUsers(), loadSecurity()]);
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Durum değiştirilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePermissions() {
    if (!selectedUserId) {
      setMessage("Yetki güncellemek için kullanıcı seçin.");
      return;
    }
    if (selectedIsOwner) {
      setMessage("Uygulama sahibinin yetkileri tam ve sabittir.");
      return;
    }
    try {
      setBusy(true);
      await updateUserPermissions(selectedUserId, permissions);
      setMessage("Modül yetkileri kaydedildi. Eski oturumlar güvenlik için kapatıldı.");
      await loadSecurity();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Yetkiler kaydedilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function runSecurityAction(action, successMessage) {
    try {
      setBusy(true);
      await action();
      setMessage(successMessage);
      await Promise.all([loadUsers(), loadSecurity()]);
    } catch (error) {
      setMessage(`Hata: ${error?.message || "İşlem tamamlanamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetMfa(user) {
    if (!user) return;
    const approved = window.confirm(
      `${user.fullName || user.username} için Authenticator eşleşmesi sıfırlanacak. Telefonda eski KY ERP hesabı varsa silin; sonraki girişte yeni QR okutulacak. Devam edilsin mi?`,
    );
    if (!approved) return;
    await runSecurityAction(
      () => resetUserMfa(user.id),
      "Authenticator kaydı sıfırlandı. Google/Microsoft Authenticator'daki eski KY ERP kaydını silip yeni QR ile yeniden eşleştirin.",
    );
  }

  return (
    <div className="admin-users-page">
      <header className="admin-security-header">
        <div>
          <div className="admin-users-eyebrow">YÖNETİM / KULLANICILAR</div>
          <h2>Firma Kullanıcıları ve Yetkilendirme</h2>
          <p>{message}</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="primary" onClick={resetEditor} disabled={busy}>+ Yeni Kullanıcı</button>
          <button type="button" onClick={refreshAll} disabled={busy}>Yenile</button>
        </div>
      </header>

      {isOwnerAdmin ? (
        <section className="owner-banner">
          <div className="owner-badge">SAHİP</div>
          <div>
            <strong>{currentUser?.fullName || currentUser?.username || "Uygulama Sahibi"}</strong>
            <span>Uygulamanın üst yöneticisi. Tüm ana firmalar, firma yöneticileri ve kullanıcılar bu hesabın altında yönetilir.</span>
          </div>
          <div className="owner-scope">Tüm firmalara tam erişim</div>
        </section>
      ) : (
        <section className="owner-banner company-admin-banner">
          <div className="owner-badge">FİRMA</div>
          <div>
            <strong>{companyName(currentUser?.mainCompanySlug)}</strong>
            <span>Bu oturum yalnız bağlı firmanın standart kullanıcılarını yönetebilir.</span>
          </div>
        </section>
      )}

      <section className="security-summary">
        <div><span>Aktif kullanıcı</span><strong>{activeUsers}</strong></div>
        <div><span>Bağlı firma</span><strong>{linkedCompanyCount || companies.length}</strong></div>
        <div><span>MFA aktif</span><strong>{mfaUsers}</strong></div>
        <div><span>Bekleyen giriş</span><strong>{approvals.length}</strong></div>
        <div><span>Aktif oturum</span><strong>{sessions.length}</strong></div>
      </section>

      {approvals.length ? (
        <section className="admin-panel security-panel attention-panel">
          <div className="panel-head">
            <div><h3>Bekleyen Giriş Onayları</h3><p>Authenticator doğrulamasını tamamlayan yeni cihaz girişleri.</p></div>
          </div>
          <div className="security-table-wrap">
            <table>
              <thead><tr><th>Kullanıcı</th><th>Firma</th><th>Cihaz</th><th>IP</th><th>İstek</th><th>İşlem</th></tr></thead>
              <tbody>{approvals.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.fullName || item.username}</strong><small>{item.email || `@${item.username}`}</small></td>
                  <td>{companyName(item.mainCompanySlug)}</td>
                  <td>{item.deviceLabel || "-"}</td>
                  <td>{item.ipAddress || "-"}</td>
                  <td>{dateText(item.requestedAt)}</td>
                  <td className="security-actions">
                    <button type="button" className="approve" onClick={() => runSecurityAction(() => approveLogin(item.id), "Giriş onaylandı.")}>Onayla</button>
                    <button type="button" className="danger-light" onClick={() => runSecurityAction(() => denyLogin(item.id), "Giriş isteği reddedildi.")}>Reddet</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="admin-users-workspace">
        <aside className="admin-panel users-directory">
          <div className="panel-head directory-head">
            <div><h3>Kullanıcılar</h3><p>{filteredUsers.length} kayıt gösteriliyor</p></div>
            <button type="button" className="compact" onClick={resetEditor}>Ekle</button>
          </div>

          <div className="directory-filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ad, e-posta, rol ara..." />
            {isOwnerAdmin ? (
              <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
                <option value="ALL">Tüm firmalar</option>
                {companies.map((company) => <option key={company.slug} value={company.slug}>{company.name}</option>)}
              </select>
            ) : null}
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ACTIVE">Aktif kullanıcılar</option>
              <option value="ALL">Aktif + pasif</option>
              <option value="PASSIVE">Sadece pasif</option>
            </select>
          </div>

          <div className="list-wrap">
            {filteredUsers.map((user) => {
              const role = roleOf(user.role);
              const owner = OWNER_ROLES.has(role);
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`list-row ${selectedUserId === user.id ? "active" : ""} ${user.isActive === false ? "passive" : ""}`}
                  onClick={() => startEdit(user)}
                >
                  <div className="user-main">
                    <div className="user-title-row">
                      <strong>{user.fullName || user.username}</strong>
                      {owner ? <span className="role-pill owner">Sahip</span> : null}
                      {user.isActive === false ? <span className="role-pill passive">Pasif</span> : null}
                    </div>
                    <span>{user.email || `@${user.username}`}</span>
                    <span>{owner ? "Tüm firmalar" : companyName(user.mainCompanySlug)} · {user.mfaEnabled ? "MFA açık" : "MFA kurulacak"}</span>
                  </div>
                  <small>{ROLE_LABELS[role] || role}</small>
                </button>
              );
            })}
            {!filteredUsers.length ? <div className="security-empty">Filtreye uygun kullanıcı bulunamadı.</div> : null}
          </div>
        </aside>

        <main className="admin-panel user-editor">
          <div className="panel-head editor-head">
            <div>
              <h3>{form.id ? "Kullanıcıyı Düzenle" : "Yeni Kullanıcı"}</h3>
              <p>{form.id ? "Firma, rol, güvenlik ve erişim ayarlarını tek yerden yönetin." : "Kullanıcıyı doğrudan doğru ana firmaya bağlayın."}</p>
            </div>
            {selectedUser ? <span className={`status-chip ${selectedUser.isActive === false ? "passive" : "active"}`}>{selectedUser.isActive === false ? "Pasif" : "Aktif"}</span> : null}
          </div>

          <form onSubmit={handleSaveUser} className="user-form">
            <div className="form-grid two-col">
              <label>Kullanıcı Adı<input value={form.username} onChange={(event) => editForm("username", event.target.value)} disabled={Boolean(form.id)} placeholder="or. boya01" /></label>
              <label>Ad Soyad<input value={form.fullName} onChange={(event) => editForm("fullName", event.target.value)} placeholder="Ad Soyad" /></label>
              <label>E-posta<input type="email" value={form.email} onChange={(event) => editForm("email", event.target.value)} placeholder="kullanici@firma.com" /></label>
              <label>Şifre {form.id ? "(değişmeyecekse boş)" : ""}<input type="password" value={form.password} onChange={(event) => editForm("password", event.target.value)} placeholder={form.id ? "Yeni şifre isteğe bağlı" : "En az 6 karakter"} /></label>
            </div>

            <div className="form-grid two-col access-fields">
              <label>
                Ana Firma
                <select value={form.mainCompanySlug} onChange={(event) => editForm("mainCompanySlug", event.target.value)} disabled={!isOwnerAdmin || selectedIsOwner}>
                  {companies.length
                    ? companies.map((company) => <option key={company.slug} value={company.slug}>{company.name}{company.isActive ? "" : " (Pasif)"}</option>)
                    : <option value={form.mainCompanySlug}>{form.mainCompanySlug || "Firma"}</option>}
                </select>
                {selectedIsOwner ? <small>Uygulama sahibi firma sınırı olmadan tüm sistemi yönetir.</small> : null}
              </label>
              <label>
                Rol
                {selectedIsOwner ? (
                  <input value="Uygulama Sahibi · Tam Yetki" disabled />
                ) : (
                  <select value={form.role} onChange={(event) => editForm("role", event.target.value)}>
                    {roleOptions.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>)}
                  </select>
                )}
              </label>
            </div>

            <div className="security-options">
              <label className={`check-field ${selectedIsOwner ? "locked" : ""}`}>
                <input type="checkbox" checked={selectedIsOwner ? true : form.isActive} disabled={selectedIsOwner} onChange={(event) => editForm("isActive", event.target.checked)} />
                <span><strong>Aktif kullanıcı</strong><small>Kapalıysa uygulamaya giriş yapamaz.</small></span>
              </label>
              <label className={`check-field ${selectedIsOwner || form.role === "COMPANY_ADMIN" ? "locked" : ""}`}>
                <input type="checkbox" checked={selectedIsOwner ? false : form.approvalRequired} disabled={selectedIsOwner || form.role === "COMPANY_ADMIN"} onChange={(event) => editForm("approvalRequired", event.target.checked)} />
                <span><strong>Yeni cihaz girişinde yönetici onayı</strong><small>Authenticator sonrası firma yöneticisi / sahip onayı ister.</small></span>
              </label>
              <label className="check-field">
                <input type="checkbox" checked={form.emailVerified} onChange={(event) => editForm("emailVerified", event.target.checked)} />
                <span><strong>E-posta doğrulandı</strong><small>Yönetici tarafından teyit edilen adres.</small></span>
              </label>
            </div>

            <div className="form-actions primary-actions">
              <button type="submit" className="primary" disabled={busy}>{form.id ? "Kullanıcıyı Kaydet" : "Kullanıcı Oluştur"}</button>
              <button type="button" onClick={resetEditor}>Yeni Kayıt</button>
              {selectedUser && !selectedIsOwner ? (
                <button type="button" className={selectedUser.isActive ? "danger-light" : "approve"} onClick={() => handleToggleActive(selectedUser)}>
                  {selectedUser.isActive ? "Firmadan Çıkar / Pasife Al" : "Tekrar Aktifleştir"}
                </button>
              ) : null}
            </div>

            {selectedUser ? (
              <div className="security-user-actions">
                <div><strong>Authenticator ve oturum</strong><span>{selectedUser.mfaEnabled ? "MFA eşleşmesi aktif." : "İlk girişte MFA kurulacak."}</span></div>
                <div className="form-actions">
                  <button type="button" onClick={() => handleResetMfa(selectedUser)}>MFA Yeniden Kur</button>
                  <button type="button" onClick={() => runSecurityAction(() => revokeAllUserSessions(selectedUser.id), "Kullanıcının bütün aktif oturumları kapatıldı.")}>Tüm Oturumları Kapat</button>
                </div>
              </div>
            ) : null}
          </form>
        </main>
      </section>

      <section className="admin-panel permissions-panel">
        <div className="panel-head permissions-head">
          <div>
            <h3>Modül Yetkileri</h3>
            <p>{selectedIsOwner ? "Uygulama sahibinin tüm yetkileri zorunlu olarak açıktır." : form.id ? "Seçili kullanıcının yetkilerini düzenleyin." : "Yeni kullanıcı için başlangıç yetkilerini seçin."}</p>
          </div>
          {!selectedIsOwner ? (
            <div className="permission-presets">
              <button type="button" onClick={() => applyPreset("FULL")}>Tam Yetki</button>
              <button type="button" onClick={() => applyPreset("VIEW")}>Sadece Gör</button>
              <button type="button" onClick={() => applyPreset("NONE")}>Temizle</button>
              <button type="button" className="primary" onClick={handleSavePermissions} disabled={busy || !selectedUserId}>Yetkileri Kaydet</button>
            </div>
          ) : null}
        </div>
        <div className="security-table-wrap">
          <table>
            <thead><tr><th>Modül</th><th>Gör</th><th>Ekle</th><th>Güncelle</th><th>Sil</th><th>Onayla</th></tr></thead>
            <tbody>{permissions.map((row) => (
              <tr key={row.moduleKey}>
                <td><strong>{MODULE_LABELS[row.moduleKey] || row.moduleKey}</strong><small>{row.moduleKey}</small></td>
                {["canView", "canCreate", "canUpdate", "canDelete", "canApprove"].map((field) => {
                  const companyAdminDeleteLock = form.role === "COMPANY_ADMIN" && row.moduleKey === "ADMIN" && field === "canDelete";
                  return (
                    <td key={field}>
                      <input
                        type="checkbox"
                        checked={selectedIsOwner ? true : companyAdminDeleteLock ? false : row[field]}
                        disabled={selectedIsOwner || companyAdminDeleteLock}
                        onChange={(event) => editPermission(row.moduleKey, field, event.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel security-panel">
        <div className="panel-head">
          <div><h3>Aktif Oturumlar</h3><p>Her onaylı cihaz en fazla 8 saat çalışır. İstediğiniz oturumu anında kapatabilirsiniz.</p></div>
          <button type="button" onClick={loadSecurity} disabled={busy}>Oturumları Yenile</button>
        </div>
        {sessions.length ? (
          <div className="security-table-wrap">
            <table>
              <thead><tr><th>Kullanıcı</th><th>Rol / Firma</th><th>Cihaz</th><th>IP</th><th>Giriş</th><th>Son Hareket</th><th>Kalan</th><th>İşlem</th></tr></thead>
              <tbody>{sessions.map((session) => (
                <tr key={session.id}>
                  <td><strong>{session.fullName || session.username}</strong><small>{session.email || `@${session.username}`}</small></td>
                  <td>{ROLE_LABELS[roleOf(session.role)] || session.role}<small>{OWNER_ROLES.has(roleOf(session.role)) ? "Tüm firmalar" : companyName(session.mainCompanySlug)}</small></td>
                  <td>{session.deviceLabel || "-"}</td>
                  <td>{session.ipAddress || "-"}</td>
                  <td>{dateText(session.createdAt)}</td>
                  <td>{dateText(session.lastSeenAt)}</td>
                  <td><strong>{remainingText(session.remainingSeconds)}</strong></td>
                  <td><button type="button" className="danger-light" onClick={() => runSecurityAction(() => revokeSession(session.id), "Oturum anında kapatıldı.")}>Oturumu Sonlandır</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="security-empty">Aktif oturum bulunmuyor.</div>}
      </section>
    </div>
  );
}
