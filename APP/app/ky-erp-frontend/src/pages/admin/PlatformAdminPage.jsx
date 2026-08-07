import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "../../context/ActiveCompanyContext";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../utils/api";

const SECTIONS = ["Firmalar", "Kullanıcılar", "Yetkiler", "Sistem Durumu", "Güvenlik", "Aktivite Kayıtları"];
const MODULE_KEYS = ["DASHBOARD", "MUHASEBE", "FIRMA_CARI", "BELGE_ISLEM", "KDV", "CEK_ODEME", "DESEN", "IMALAT", "BOYAHANE", "IK", "ISNET", "ASISTAN", "RAPORLAR"];

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.items || payload?.data || [];
}

export default function PlatformAdminPage({ embedded = false }) {
  const { user, switchCompany, leaveCompany, logout } = useAuth();
  const { activeCompany } = useActiveCompany();
  const [section, setSection] = useState("Firmalar");
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState(null);
  const [activity, setActivity] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: "", slug: "", code: "" });
  const [userForm, setUserForm] = useState({ username: "", fullName: "", email: "", password: "", companyRole: "VIEWER" });
  const [resetUserId, setResetUserId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [permissionMembershipId, setPermissionMembershipId] = useState("");
  const [permissionKeys, setPermissionKeys] = useState([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [companyResponse, userResponse, statusResponse, activityResponse] = await Promise.all([
        apiFetch("/admin/companies"),
        apiFetch("/admin/users"),
        apiFetch("/admin/system-status"),
        apiFetch("/admin/activity-logs"),
      ]);
      const companyRows = rowsOf(companyResponse);
      setCompanies(companyRows);
      setUsers(rowsOf(userResponse));
      setStatus(statusResponse?.data || null);
      setActivity(rowsOf(activityResponse));
      setSelectedCompanyId((current) => current || companyRows.find((item) => item.isActive !== false)?.id || "");
    } catch (requestError) {
      setError(requestError?.message || "Yönetim verileri alınamadı.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedUsers = useMemo(() => users.filter((item) => !selectedCompanyId || item.mainCompanyId === selectedCompanyId), [selectedCompanyId, users]);

  async function enterCompany(companyId) {
    setBusy(true);
    setError("");
    try { await switchCompany(companyId); }
    catch (requestError) { setError(requestError?.message || "Firma bağlamına girilemedi."); }
    finally { setBusy(false); }
  }

  async function toggleCompany(company) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/admin/companies/${company.id}`, {
        method: "PATCH",
        body: { ...company, isActive: company.isActive === false },
      });
      await load();
    } catch (requestError) { setError(requestError?.message || "Firma durumu değiştirilemedi."); }
    finally { setBusy(false); }
  }

  async function createCompany(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await apiFetch("/admin/companies", { method: "POST", body: companyForm });
      setCompanyForm({ name: "", slug: "", code: "" });
      await load();
    } catch (requestError) { setError(requestError?.message || "Firma oluşturulamadı."); }
    finally { setBusy(false); }
  }

  async function createUser(event) {
    event.preventDefault();
    if (!selectedCompanyId) { setError("Önce firma seçin."); return; }
    setBusy(true); setError("");
    try {
      await apiFetch("/admin/users", { method: "POST", body: { ...userForm, companyId: selectedCompanyId } });
      setUserForm({ username: "", fullName: "", email: "", password: "", companyRole: "VIEWER" });
      await load();
    } catch (requestError) { setError(requestError?.message || "Kullanıcı oluşturulamadı."); }
    finally { setBusy(false); }
  }

  async function toggleUser(item) {
    setBusy(true); setError("");
    try {
      await apiFetch(`/admin/users/${item.id}/status`, { method: "PATCH", body: { isActive: !item.isActive } });
      await load();
    } catch (requestError) { setError(requestError?.message || "Kullanıcı durumu değiştirilemedi."); }
    finally { setBusy(false); }
  }

  async function resetPasswordForUser(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await apiFetch(`/admin/users/${resetUserId}/reset-password`, { method: "POST", body: { password: resetPassword } });
      setResetUserId(""); setResetPassword("");
    } catch (requestError) { setError(requestError?.message || "Şifre sıfırlanamadı."); }
    finally { setBusy(false); }
  }

  async function selectPermissionMembership(membershipId) {
    setPermissionMembershipId(membershipId);
    if (!membershipId) { setPermissionKeys([]); return; }
    try {
      const payload = await apiFetch(`/admin/memberships/${membershipId}/permissions`);
      setPermissionKeys(rowsOf(payload).filter((item) => item.canView).map((item) => item.moduleKey));
    } catch (requestError) { setError(requestError?.message || "Yetkiler alınamadı."); }
  }

  async function savePermissions() {
    setBusy(true); setError("");
    try {
      await apiFetch(`/admin/memberships/${permissionMembershipId}/permissions`, {
        method: "PUT",
        body: { permissions: MODULE_KEYS.map((moduleKey) => ({ moduleKey, canView: permissionKeys.includes(moduleKey), canCreate: permissionKeys.includes(moduleKey), canUpdate: permissionKeys.includes(moduleKey), canDelete: permissionKeys.includes(moduleKey), canApprove: permissionKeys.includes(moduleKey) })) },
      });
      await load();
    } catch (requestError) { setError(requestError?.message || "Yetkiler kaydedilemedi."); }
    finally { setBusy(false); }
  }

  const content = (() => {
    if (section === "Firmalar") return (
      <div className="content-card">
        <h2>Firmalar</h2>
        <form onSubmit={createCompany} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <input required placeholder="Firma adı" value={companyForm.name} onChange={(event) => setCompanyForm((form) => ({ ...form, name: event.target.value }))} />
          <input required placeholder="firma-slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={companyForm.slug} onChange={(event) => setCompanyForm((form) => ({ ...form, slug: event.target.value }))} />
          <input placeholder="Firma kodu" value={companyForm.code} onChange={(event) => setCompanyForm((form) => ({ ...form, code: event.target.value }))} />
          <button className="primary-btn" disabled={busy}>Yeni Firma</button>
        </form>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
          {companies.map((company) => (
            <article key={company.id} className="content-card" style={{ margin: 0 }}>
              <h3>{company.name}</h3>
              <p>Durum: {company.isActive === false ? "Pasif" : "Aktif"}</p>
              <p>Kod: {company.code || "—"}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="primary-btn" disabled={busy || company.isActive === false} onClick={() => enterCompany(company.id)}>Firmaya Gir</button>
                <button className="secondary-btn" disabled={busy} onClick={() => { setSelectedCompanyId(company.id); setSection("Kullanıcılar"); }}>Kullanıcılar</button>
                <button className="secondary-btn" disabled={busy} onClick={() => toggleCompany(company)}>{company.isActive === false ? "Aktif Yap" : "Pasife Al"}</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    );
    if (section === "Kullanıcılar") return (
      <div className="content-card">
        <h2>Kullanıcılar</h2>
        <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
          <option value="">Tüm kullanıcılar</option>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <form onSubmit={createUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginTop: 14 }}>
          <input required placeholder="Kullanıcı adı" value={userForm.username} onChange={(event) => setUserForm((form) => ({ ...form, username: event.target.value }))} />
          <input required placeholder="Ad soyad" value={userForm.fullName} onChange={(event) => setUserForm((form) => ({ ...form, fullName: event.target.value }))} />
          <input type="email" placeholder="E-posta" value={userForm.email} onChange={(event) => setUserForm((form) => ({ ...form, email: event.target.value }))} />
          <input required type="password" autoComplete="new-password" placeholder="Geçici şifre" value={userForm.password} onChange={(event) => setUserForm((form) => ({ ...form, password: event.target.value }))} />
          <select value={userForm.companyRole} onChange={(event) => setUserForm((form) => ({ ...form, companyRole: event.target.value }))}><option>COMPANY_ADMIN</option><option>ACCOUNTING</option><option>HR</option><option>PRODUCTION</option><option>DYEHOUSE</option><option>DESIGN</option><option>VIEWER</option></select>
          <button className="primary-btn" disabled={busy || !selectedCompanyId}>Yeni Kullanıcı</button>
        </form>
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table><thead><tr><th>Kullanıcı Adı</th><th>Ad Soyad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Son Giriş</th><th>İşlem</th></tr></thead>
            <tbody>{selectedUsers.map((item) => <tr key={`${item.id}-${item.membershipId || "platform"}`}><td>{item.username}</td><td>{item.fullName}</td><td>{item.email || "—"}</td><td>{item.companyRole || item.platformRole}</td><td>{item.isActive ? "Aktif" : "Pasif"}</td><td>{item.lastLoginAt ? new Date(Number(item.lastLoginAt)).toLocaleString("tr-TR") : "—"}</td><td><button className="secondary-btn" disabled={busy || item.id === user?.id} onClick={() => toggleUser(item)}>{item.isActive ? "Pasife Al" : "Aktif Yap"}</button>{item.id !== user?.id ? <button className="secondary-btn" onClick={() => setResetUserId(item.id)}>Şifre Sıfırla</button> : null}</td></tr>)}</tbody>
          </table>
        </div>
        {resetUserId ? <form onSubmit={resetPasswordForUser} style={{ display: "flex", gap: 8, marginTop: 14 }}><input required type="password" autoComplete="new-password" placeholder="Yeni geçici şifre" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /><button className="primary-btn" disabled={busy}>Şifreyi Sıfırla</button><button type="button" className="secondary-btn" onClick={() => setResetUserId("")}>İptal</button></form> : null}
      </div>
    );
    if (section === "Yetkiler") return <div className="content-card"><h2>Firma Bazlı Yetkiler</h2><select value={permissionMembershipId} onChange={(event) => selectPermissionMembership(event.target.value)}><option value="">Kullanıcı üyeliği seçin</option>{users.filter((item) => item.membershipId).map((item) => <option key={item.membershipId} value={item.membershipId}>{item.username} — {item.mainCompanySlug}</option>)}</select>{permissionMembershipId ? <><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 16 }}>{MODULE_KEYS.map((moduleKey) => <label key={moduleKey}><input type="checkbox" checked={permissionKeys.includes(moduleKey)} onChange={(event) => setPermissionKeys((keys) => event.target.checked ? [...new Set([...keys, moduleKey])] : keys.filter((key) => key !== moduleKey))} /> {moduleKey}</label>)}</div><button className="primary-btn" disabled={busy} onClick={savePermissions} style={{ marginTop: 16 }}>Yetkileri Kaydet</button></> : null}</div>;
    if (section === "Sistem Durumu") return <div className="content-card"><h2>Sistem Durumu</h2><pre>{JSON.stringify(status, null, 2)}</pre></div>;
    if (section === "Güvenlik") return <div className="content-card"><h2>Güvenlik</h2><p>JWT oturumları sunucuda doğrulanır, firma geçişi yeni token üretir ve pasif kullanıcı/firma erişimi kapatılır.</p><p>MFA veri modeli hazırdır; MFA bu sürümde etkin değildir.</p></div>;
    return <div className="content-card"><h2>Aktivite Kayıtları</h2><div style={{ overflowX: "auto" }}><table><thead><tr><th>Zaman</th><th>Kullanıcı</th><th>Firma</th><th>İşlem</th></tr></thead><tbody>{activity.map((item) => <tr key={item.id}><td>{new Date(Number(item.created_at)).toLocaleString("tr-TR")}</td><td>{item.username || "Sistem"}</td><td>{item.company_name || "—"}</td><td>{item.action}</td></tr>)}</tbody></table></div></div>;
  })();

  return (
    <div className={embedded ? "kyerp-page" : "app-centered-state"} style={{ padding: 24, width: "100%" }}>
      <header className="content-card" style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div><strong>Sistem Yöneticisi</strong><div>{user?.fullName || user?.username}</div>{activeCompany ? <div>Görüntülenen Firma: {activeCompany.name}</div> : <div>Firma operasyon bağlamı seçilmedi</div>}</div>
        <div style={{ display: "flex", gap: 8 }}>{activeCompany ? <button className="secondary-btn" onClick={leaveCompany}>Firma Seçimine Dön</button> : null}<button className="secondary-btn" onClick={logout}>Çıkış</button></div>
      </header>
      {error ? <div className="login-error">{error}</div> : null}
      <nav className="content-card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{SECTIONS.map((item) => <button key={item} className={section === item ? "primary-btn" : "secondary-btn"} onClick={() => setSection(item)}>{item}</button>)}</nav>
      {content}
    </div>
  );
}
