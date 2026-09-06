import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  activateUser,
  createUser,
  deactivateUser,
  listActiveSessions,
  listUsers,
  resetUserPassword,
  revokeAllUserSessions,
  updateUser,
} from "../../services/adminApi";
import AdminApprovalCenter from "./AdminApprovalCenter";
import "./AdminManagement.css";

const ROLES = [
  ["VIEWER", "Özel Yetkili"],
  ["MUHASEBE", "Muhasebe"],
  ["DESEN", "Desen"],
  ["IMALAT", "İmalat"],
  ["BOYAHANE", "Boyahane"],
  ["IK", "İK"],
  ["DENETIM", "Denetim"],
];

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function roleText(role) {
  return ROLES.find(([key]) => key === String(role || "").toUpperCase())?.[1] || String(role || "VIEWER");
}

function emptyForm(companySlug = "") {
  return { fullName: "", username: "", email: "", password: "", role: "VIEWER", mainCompanySlug: companySlug, approvalRequired: true, isActive: true };
}

export default function AdminCompanyUsersPanel({ activeMainCompany }) {
  const { user: currentUser } = useAuth();
  const companySlug = activeMainCompany?.slug || currentUser?.mainCompanySlug || "";
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [form, setForm] = useState(() => emptyForm(companySlug));
  const [editingId, setEditingId] = useState("");
  const [passwords, setPasswords] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Firma kullanıcıları yükleniyor...");

  const load = useCallback(async () => {
    setBusy(true);
    const jobs = await Promise.allSettled([listUsers(), listActiveSessions()]);
    if (jobs[0].status === "fulfilled") setUsers(rowsOf(jobs[0].value));
    if (jobs[1].status === "fulfilled") setSessions(rowsOf(jobs[1].value));
    const failed = jobs.filter((job) => job.status === "rejected").length;
    setMessage(failed ? `${failed} firma kullanıcı kontrolü alınamadı.` : "Firma kullanıcıları ve oturumları güncel.");
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setForm((old) => ({ ...old, mainCompanySlug: companySlug })); }, [companySlug]);

  const sessionCount = useMemo(() => {
    const map = new Map();
    sessions.forEach((row) => {
      const key = String(row.userId || row.user_id || "");
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [sessions]);

  function startEdit(row) {
    setEditingId(String(row.id));
    setForm({
      fullName: row.fullName || "",
      username: row.username || "",
      email: row.email || "",
      password: "",
      role: String(row.role || "VIEWER").toUpperCase(),
      mainCompanySlug: companySlug,
      approvalRequired: row.approvalRequired !== false,
      isActive: row.isActive !== false,
    });
    setMessage(`${row.fullName || row.username} düzenlemeye açıldı.`);
  }

  function clearForm() {
    setEditingId("");
    setForm(emptyForm(companySlug));
  }

  async function save(event) {
    event.preventDefault();
    if (!form.fullName.trim() || !form.username.trim()) return setMessage("Hata: Ad soyad ve kullanıcı adı zorunludur.");
    if (!editingId && form.password.length < 6) return setMessage("Hata: Yeni kullanıcı parolası en az 6 karakter olmalıdır.");
    setBusy(true);
    try {
      if (editingId) {
        await updateUser(editingId, {
          fullName: form.fullName.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          role: form.role,
          mainCompanySlug: companySlug,
          approvalRequired: Boolean(form.approvalRequired),
          isActive: Boolean(form.isActive),
        });
        setMessage("Firma kullanıcısı güncellendi.");
      } else {
        await createUser({
          fullName: form.fullName.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          mainCompanySlug: companySlug,
          approvalRequired: Boolean(form.approvalRequired),
          isActive: Boolean(form.isActive),
          mustChangePassword: true,
        });
        setMessage("Firma kullanıcısı oluşturuldu.");
      }
      clearForm();
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kullanıcı kaydedilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row) {
    if (busy) return;
    setBusy(true);
    try {
      if (row.isActive === false) await activateUser(row.id);
      else await deactivateUser(row.id);
      setMessage(`${row.fullName || row.username} ${row.isActive === false ? "aktifleştirildi" : "pasife alındı"}.`);
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kullanıcı durumu değiştirilemedi."}`);
    } finally { setBusy(false); }
  }

  async function changePassword(row) {
    const password = String(passwords[row.id] || "");
    if (password.length < 6) return setMessage("Hata: Yeni parola en az 6 karakter olmalıdır.");
    setBusy(true);
    try {
      await resetUserPassword(row.id, password);
      setPasswords((old) => ({ ...old, [row.id]: "" }));
      setMessage(`${row.fullName || row.username} parolası yenilendi; mevcut girişler güvenlik gereği kapatıldı.`);
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Parola yenilenemedi."}`);
    } finally { setBusy(false); }
  }

  async function revoke(row) {
    setBusy(true);
    try {
      await revokeAllUserSessions(row.id);
      setMessage(`${row.fullName || row.username} kullanıcısının aktif oturumları kapatıldı.`);
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Oturumlar kapatılamadı."}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="admpro-page">
      <header className="admpro-head">
        <div><span className="admpro-kicker">YÖNETİM / FİRMA KULLANICILARI</span><h2>Firma Kullanıcıları</h2><p>COMPANY_ADMIN yalnız kendi firmasındaki normal kullanıcıları yönetir; yeni firma yöneticisi atama yetkisi Uygulama Sahibindedir.</p></div>
        <div className="admpro-actions"><button type="button" onClick={clearForm}>+ Yeni Kullanıcı</button><button type="button" className="primary" onClick={load} disabled={busy}>Yenile</button></div>
      </header>
      <div className={`admpro-notice ${message.startsWith("Hata:") ? "warn" : "success"}`}>{message}</div>

      <AdminApprovalCenter compact />

      <section className="admpro-grid-2">
        <div className="admpro-card">
          <div className="admpro-card-head"><div><h3>{editingId ? "Kullanıcı Düzenle" : "Yeni Kullanıcı"}</h3><p>Firma: {activeMainCompany?.name || companySlug || "-"}</p></div>{editingId ? <button type="button" onClick={clearForm}>İptal</button> : null}</div>
          <form onSubmit={save}>
            <div className="admpro-form-grid">
              <label>Ad Soyad<input value={form.fullName} onChange={(event) => setForm((old) => ({ ...old, fullName: event.target.value }))} /></label>
              <label>Kullanıcı Adı<input value={form.username} onChange={(event) => setForm((old) => ({ ...old, username: event.target.value }))} /></label>
              <label>E-posta<input type="email" value={form.email} onChange={(event) => setForm((old) => ({ ...old, email: event.target.value }))} /></label>
              <label>Rol<select value={form.role} onChange={(event) => setForm((old) => ({ ...old, role: event.target.value }))}>{ROLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              {!editingId ? <label>İlk Parola<input type="password" value={form.password} onChange={(event) => setForm((old) => ({ ...old, password: event.target.value }))} /></label> : null}
              <label className="admpro-check"><input type="checkbox" checked={form.approvalRequired} onChange={(event) => setForm((old) => ({ ...old, approvalRequired: event.target.checked }))} /> Yeni cihaz girişinde Firma Sahibi / Süper Yönetici onayı</label>
              <label className="admpro-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((old) => ({ ...old, isActive: event.target.checked }))} /> Kullanıcı aktif</label>
            </div>
            <div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button type="submit" className="primary" disabled={busy}>{editingId ? "Değişiklikleri Kaydet" : "Kullanıcı Oluştur"}</button></div>
          </form>
        </div>

        <div className="admpro-card">
          <div className="admpro-card-head"><div><h3>Yetki Sınırı</h3><p>Firma yöneticisi başka firmaya veya başka COMPANY_ADMIN hesabına müdahale edemez.</p></div><span className="admpro-badge ok">Tenant Kilitli</span></div>
          <div className="admpro-notice success">Giriş onayı, kullanıcı listesi ve oturum işlemleri backend tarafında firma kısa koduna göre sınırlandırılır.</div>
          <div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button type="button" className="primary" onClick={() => window.location.assign("/admin/giris-onaylari")}>Bekleyen Giriş Onayları</button></div>
        </div>
      </section>

      <section className="admpro-card">
        <div className="admpro-card-head"><div><h3>Kullanıcı Listesi</h3><p>{users.length} firma kullanıcısı.</p></div></div>
        <div className="admpro-table"><table><thead><tr><th>Kullanıcı</th><th>Rol</th><th>Giriş Onayı</th><th>Oturum</th><th>Durum</th><th>Parola</th><th>İşlem</th></tr></thead><tbody>
          {users.map((row) => <tr key={row.id}><td><strong>{row.fullName || row.username}</strong><br/><small>@{row.username}{row.email ? ` · ${row.email}` : ""}</small></td><td>{roleText(row.role)}</td><td>{row.approvalRequired ? "Gerekli" : "Kapalı"}</td><td>{sessionCount.get(String(row.id)) || 0}</td><td>{row.isActive === false ? "Pasif" : "Aktif"}</td><td><div style={{ display: "flex", gap: 6 }}><input type="password" placeholder="Yeni parola" value={passwords[row.id] || ""} onChange={(event) => setPasswords((old) => ({ ...old, [row.id]: event.target.value }))} style={{ minWidth: 120 }} /><button type="button" onClick={() => changePassword(row)} disabled={busy}>Yenile</button></div></td><td><div className="admpro-row-actions"><button type="button" onClick={() => startEdit(row)}>Düzenle</button><button type="button" onClick={() => toggle(row)} disabled={busy}>{row.isActive === false ? "Aktifleştir" : "Pasife Al"}</button><button type="button" onClick={() => revoke(row)} disabled={busy}>Oturumları Kapat</button></div></td></tr>)}
          {!users.length ? <tr><td colSpan="7">Firma kullanıcısı bulunamadı.</td></tr> : null}
        </tbody></table></div>
      </section>
    </div>
  );
}
