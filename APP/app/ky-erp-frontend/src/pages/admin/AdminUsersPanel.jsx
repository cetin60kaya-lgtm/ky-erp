import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  activateUser,
  approveLogin,
  createUser,
  deactivateUser,
  denyLogin,
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
const ALL_ROLES = [
  "SUPER_ADMIN", "COMPANY_ADMIN", "MUHASEBE", "DESEN", "IMALAT", "BOYAHANE", "IK", "VIEWER",
];

function emptyForm() {
  return {
    id: "",
    username: "",
    email: "",
    password: "",
    fullName: "",
    role: "VIEWER",
    mainCompanySlug: "mecit-hakan",
    isActive: true,
    approvalRequired: true,
    emailVerified: false,
  };
}
function emptyPermissionRow(moduleKey) {
  return { moduleKey, canView: false, canCreate: false, canUpdate: false, canDelete: false, canApprove: false };
}
function normalizePermissions(rows) {
  const map = new Map(MODULE_KEYS.map((key) => [key, emptyPermissionRow(key)]));
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
function dateText(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("tr-TR");
}
function remainingText(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours} sa ${minutes} dk`;
}

export default function AdminUsersPanel() {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = ["SUPER_ADMIN", "ADMIN"].includes(String(currentUser?.role || "").toUpperCase());
  const roleOptions = isSuperAdmin ? ALL_ROLES : ALL_ROLES.filter((role) => !["SUPER_ADMIN", "COMPANY_ADMIN"].includes(role));
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permissions, setPermissions] = useState(normalizePermissions([]));
  const [form, setForm] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Kullanıcılar ve güvenlik durumu yükleniyor...");

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || null,
    [users, selectedUserId],
  );

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

  const loadUsers = useCallback(async (preserveSelected = true) => {
    try {
      setBusy(true);
      const data = await listUsers();
      const rows = Array.isArray(data) ? data : data?.items || [];
      setUsers(rows);
      const nextId =
        preserveSelected && selectedUserId && rows.some((item) => item.id === selectedUserId)
          ? selectedUserId
          : rows[0]?.id || "";
      setSelectedUserId(nextId);
      if (nextId) {
        const permissionRows = await getUserPermissions(nextId);
        setPermissions(normalizePermissions(permissionRows));
      } else {
        setPermissions(normalizePermissions([]));
      }
      setMessage("Kullanıcı, MFA, giriş onayı ve aktif oturum bilgileri güncel.");
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
      setUsers([]);
      setSelectedUserId("");
      setPermissions(normalizePermissions([]));
    } finally {
      setBusy(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    Promise.all([loadUsers(false), loadSecurity()]);
  }, [loadSecurity, loadUsers]);

  useEffect(() => {
    if (!selectedUserId) return;
    let alive = true;
    getUserPermissions(selectedUserId)
      .then((rows) => {
        if (alive) setPermissions(normalizePermissions(rows));
      })
      .catch((error) => {
        if (alive) setMessage(`Yetkiler alınamadı: ${error?.message}`);
      });
    return () => {
      alive = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    const timer = window.setInterval(loadSecurity, 15000);
    return () => window.clearInterval(timer);
  }, [loadSecurity]);

  function editPermission(moduleKey, field, value) {
    setPermissions((prev) => prev.map((row) => row.moduleKey === moduleKey ? { ...row, [field]: value } : row));
  }
  function editForm(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "role" && ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(value)) next.approvalRequired = false;
      return next;
    });
  }
  function startEdit(user) {
    setForm({
      id: user?.id || "",
      username: user?.username || "",
      email: user?.email || "",
      password: "",
      fullName: user?.fullName || "",
      role: user?.role || "VIEWER",
      mainCompanySlug: user?.mainCompanySlug || "mecit-hakan",
      isActive: user?.isActive !== false,
      approvalRequired: user?.approvalRequired !== false,
      emailVerified: user?.emailVerified === true,
    });
    setSelectedUserId(user?.id || "");
  }

  async function handleSaveUser(event) {
    event?.preventDefault();
    try {
      setBusy(true);
      const payload = {
        username: form.username,
        email: form.email,
        fullName: form.fullName,
        role: form.role,
        mainCompanySlug: form.mainCompanySlug,
        isActive: form.isActive,
        approvalRequired: form.approvalRequired,
        emailVerified: form.emailVerified,
      };
      if (form.id) {
        await updateUser(form.id, payload);
        if (form.password.trim()) await resetUserPassword(form.id, form.password.trim());
        setMessage("Kullanıcı ve güvenlik tanımı güncellendi. Yetki/parola değişiminde mevcut oturumlar kapatılır.");
      } else {
        await createUser({ ...payload, password: form.password, permissions });
        setMessage("Kullanıcı oluşturuldu. İlk girişte Authenticator kurulumu zorunlu.");
      }
      setForm(emptyForm());
      await Promise.all([loadUsers(), loadSecurity()]);
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(user) {
    try {
      setBusy(true);
      if (user?.isActive) await deactivateUser(user.id);
      else await activateUser(user.id);
      setMessage(user?.isActive ? "Kullanıcı pasife alındı ve aktif oturumları kapatıldı." : "Kullanıcı aktifleştirildi.");
      await Promise.all([loadUsers(), loadSecurity()]);
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePermissions() {
    if (!selectedUserId) return setMessage("Yetki güncellemek için kullanıcı seçin.");
    try {
      setBusy(true);
      await updateUserPermissions(selectedUserId, permissions);
      setMessage("Yetkiler güncellendi ve kullanıcının mevcut oturumları kapatıldı.");
      await loadSecurity();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
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
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-users-page">
      <header className="admin-security-header">
        <div>
          <h2>Kullanıcılar, Güvenlik ve Aktif Oturumlar</h2>
          <p>{message}</p>
        </div>
        <button type="button" onClick={() => Promise.all([loadUsers(), loadSecurity()])} disabled={busy}>Yenile</button>
      </header>

      <section className="security-summary">
        <div><span>Bekleyen giriş</span><strong>{approvals.length}</strong></div>
        <div><span>Aktif oturum</span><strong>{sessions.length}</strong></div>
        <div><span>MFA aktif kullanıcı</span><strong>{users.filter((item) => item.mfaEnabled).length}</strong></div>
        <div><span>Oturum üst sınırı</span><strong>8 saat</strong></div>
      </section>

      {approvals.length ? (
        <section className="panel security-panel">
          <div className="panel-head"><div><h3>Bekleyen Giriş Onayları</h3><p>Authenticator doğrulamasını geçen normal kullanıcılar burada yönetici onayı bekler.</p></div></div>
          <div className="security-table-wrap">
            <table>
              <thead><tr><th>Kullanıcı</th><th>Firma</th><th>Cihaz</th><th>IP</th><th>İstek</th><th>İşlem</th></tr></thead>
              <tbody>{approvals.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.fullName || item.username}</strong><small>{item.email || `@${item.username}`}</small></td>
                  <td>{item.mainCompanySlug || "-"}</td>
                  <td>{item.deviceLabel || "-"}</td>
                  <td>{item.ipAddress || "-"}</td>
                  <td>{dateText(item.requestedAt)}</td>
                  <td className="security-actions">
                    <button type="button" className="approve" onClick={() => runSecurityAction(() => approveLogin(item.id), "Giriş onaylandı. Kullanıcı en fazla 8 saatlik oturum alabilir.")}>Onayla</button>
                    <button type="button" className="deny" onClick={() => runSecurityAction(() => denyLogin(item.id), "Giriş isteği reddedildi.")}>Reddet</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="admin-users-grid">
        <article className="panel">
          <h3>Kullanıcılar</h3>
          <div className="list-wrap">
            {users.map((user) => (
              <button key={user.id} type="button" className={`list-row ${selectedUserId === user.id ? "active" : ""}`} onClick={() => setSelectedUserId(user.id)}>
                <div>
                  <strong>{user.fullName || user.username}</strong>
                  <span>{user.email || `@${user.username}`}</span>
                  <span>{user.mainCompanySlug || "-"} · {user.mfaEnabled ? "MFA açık" : "MFA kurulacak"}</span>
                </div>
                <small>{user.role}</small>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <h3>{form.id ? "Kullanıcı Güncelle" : "Yeni Kullanıcı"}</h3>
          <form onSubmit={handleSaveUser} className="user-form">
            <label>Kullanıcı Adı<input value={form.username} onChange={(event) => editForm("username", event.target.value)} disabled={Boolean(form.id)} /></label>
            <label>E-posta<input type="email" value={form.email} onChange={(event) => editForm("email", event.target.value)} placeholder="kullanici@firma.com" /></label>
            <label>Şifre {form.id ? "(boş bırakılırsa değişmez)" : ""}<input type="password" value={form.password} onChange={(event) => editForm("password", event.target.value)} /></label>
            <label>Ad Soyad<input value={form.fullName} onChange={(event) => editForm("fullName", event.target.value)} /></label>
            <label>Rol<select value={form.role} onChange={(event) => editForm("role", event.target.value)}>{roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
            <label>Firma Kodu<input value={form.mainCompanySlug} onChange={(event) => editForm("mainCompanySlug", event.target.value)} disabled={!isSuperAdmin} /></label>
            <label className="check-field"><input type="checkbox" checked={form.isActive} onChange={(event) => editForm("isActive", event.target.checked)} /> Aktif kullanıcı</label>
            <label className="check-field"><input type="checkbox" checked={form.approvalRequired} disabled={["SUPER_ADMIN", "COMPANY_ADMIN"].includes(form.role)} onChange={(event) => editForm("approvalRequired", event.target.checked)} /> Her yeni oturumda yönetici onayı iste</label>
            <label className="check-field"><input type="checkbox" checked={form.emailVerified} onChange={(event) => editForm("emailVerified", event.target.checked)} /> E-posta adresi doğrulandı</label>
            <div className="form-actions">
              <button type="submit" disabled={busy}>{form.id ? "Güncelle" : "Oluştur"}</button>
              <button type="button" onClick={() => setForm(emptyForm())}>Temizle</button>
              {selectedUser ? <button type="button" onClick={() => startEdit(selectedUser)}>Seçiliyi Düzenle</button> : null}
              {selectedUser ? <button type="button" onClick={() => handleToggleActive(selectedUser)}>{selectedUser.isActive ? "Pasife Al" : "Aktifleştir"}</button> : null}
            </div>
            {selectedUser ? (
              <div className="form-actions security-user-actions">
                <button type="button" onClick={() => runSecurityAction(() => resetUserMfa(selectedUser.id), "Authenticator kaydı sıfırlandı. Tüm oturumlar kapatıldı; sonraki girişte yeniden kurulum istenecek.")}>MFA Sıfırla</button>
                <button type="button" onClick={() => runSecurityAction(() => revokeAllUserSessions(selectedUser.id), "Kullanıcının bütün aktif oturumları kapatıldı.")}>Tüm Oturumları Kapat</button>
              </div>
            ) : null}
          </form>
        </article>
      </section>

      <section className="panel permissions-panel">
        <div className="panel-head"><h3>Modül Yetki Matrisi</h3><button type="button" onClick={handleSavePermissions} disabled={busy || !selectedUserId}>Yetkileri Kaydet</button></div>
        <div className="security-table-wrap">
          <table>
            <thead><tr><th>Modül</th><th>Gör</th><th>Ekle</th><th>Güncelle</th><th>Sil</th><th>Onayla</th></tr></thead>
            <tbody>{permissions.map((row) => (
              <tr key={row.moduleKey}>
                <td>{row.moduleKey}</td>
                {["canView", "canCreate", "canUpdate", "canDelete", "canApprove"].map((field) => (
                  <td key={field}><input type="checkbox" checked={row[field]} onChange={(event) => editPermission(row.moduleKey, field, event.target.checked)} /></td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="panel security-panel">
        <div className="panel-head">
          <div><h3>Aktif Oturumlar</h3><p>Onaylanmış her cihaz en fazla 8 saat çalışır. İstediğiniz oturumu anında kapatabilirsiniz.</p></div>
          <button type="button" onClick={loadSecurity} disabled={busy}>Oturumları Yenile</button>
        </div>
        {sessions.length ? (
          <div className="security-table-wrap">
            <table>
              <thead><tr><th>Kullanıcı</th><th>Rol / Firma</th><th>Cihaz</th><th>IP</th><th>Giriş</th><th>Son Hareket</th><th>Kalan</th><th>İşlem</th></tr></thead>
              <tbody>{sessions.map((session) => (
                <tr key={session.id}>
                  <td><strong>{session.fullName || session.username}</strong><small>{session.email || `@${session.username}`}</small></td>
                  <td>{session.role}<small>{session.mainCompanySlug || "-"}</small></td>
                  <td>{session.deviceLabel || "-"}</td>
                  <td>{session.ipAddress || "-"}</td>
                  <td>{dateText(session.createdAt)}</td>
                  <td>{dateText(session.lastSeenAt)}</td>
                  <td><strong>{remainingText(session.remainingSeconds)}</strong></td>
                  <td><button type="button" className="deny" onClick={() => runSecurityAction(() => revokeSession(session.id), "Oturum anında kapatıldı.")}>Oturumu Sonlandır</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="security-empty">Aktif oturum bulunmuyor.</div>}
      </section>
    </div>
  );
}
