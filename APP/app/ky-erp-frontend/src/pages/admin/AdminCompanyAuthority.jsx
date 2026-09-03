import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getMainCompanies, listUsers, updateUser } from "../../services/adminApi";
import "./AdminManagement.css";

function roleOf(value) {
  return String(value || "").trim().toUpperCase().replace(/İ/g, "I");
}

function isOwnerRole(value) {
  return ["SUPER_ADMIN", "ADMIN"].includes(roleOf(value));
}

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

export default function AdminCompanyAuthority({ activeMainCompany }) {
  const { user } = useAuth();
  const owner = isOwnerRole(user?.role);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [companySlug, setCompanySlug] = useState(activeMainCompany?.slug || user?.mainCompanySlug || "");
  const [candidateId, setCandidateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(owner ? "Firma yetkilileri yükleniyor..." : "Firma yönetici yetkiniz aktif.");

  const load = useCallback(async () => {
    if (!owner) return;
    setBusy(true);
    try {
      const [companyRows, userRows] = await Promise.all([getMainCompanies({ _ts: Date.now() }), listUsers()]);
      const nextCompanies = rowsOf(companyRows);
      const nextUsers = rowsOf(userRows);
      setCompanies(nextCompanies);
      setUsers(nextUsers);
      setCompanySlug((current) => {
        if (nextCompanies.some((row) => String(row.slug) === String(current))) return current;
        return activeMainCompany?.slug || nextCompanies[0]?.slug || "";
      });
      setMessage("Firma sahibi / admin yetkileri güncel.");
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Firma yetkilileri alınamadı."}`);
    } finally {
      setBusy(false);
    }
  }, [activeMainCompany?.slug, owner]);

  useEffect(() => { load(); }, [load]);

  const companyAdmins = useMemo(
    () => users.filter((row) => roleOf(row?.role) === "COMPANY_ADMIN" && String(row?.mainCompanySlug || "") === String(companySlug || "")),
    [companySlug, users],
  );

  const candidates = useMemo(
    () => users.filter((row) => row?.isActive !== false && !["SUPER_ADMIN", "ADMIN"].includes(roleOf(row?.role))),
    [users],
  );

  async function assignAdmin() {
    const target = users.find((row) => String(row.id) === String(candidateId));
    if (!target || !companySlug || busy) return;
    setBusy(true);
    try {
      await updateUser(target.id, {
        role: "COMPANY_ADMIN",
        mainCompanySlug: companySlug,
        isActive: target.isActive !== false,
      });
      setCandidateId("");
      setMessage(`${target.fullName || target.username} artık ${companySlug} firma sahibi/admin yetkisine sahip.`);
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Firma admin yetkisi atanamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeAdmin(row) {
    if (!row?.id || busy) return;
    setBusy(true);
    try {
      await updateUser(row.id, {
        role: "VIEWER",
        mainCompanySlug: companySlug,
        approvalRequired: true,
        isActive: row.isActive !== false,
      });
      setMessage(`${row.fullName || row.username} firma admin yetkisinden çıkarıldı.`);
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Firma admin yetkisi kaldırılamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  if (!owner) {
    return (
      <section className="admpro-card">
        <div className="admpro-card-head">
          <div>
            <h3>Firma Sahibi / Admin Yetkisi</h3>
            <p>Bu yetki yalnız kendi firmanızdaki kullanıcı, oturum ve giriş onaylarını yönetir.</p>
          </div>
          <span className="admpro-badge ok">COMPANY_ADMIN</span>
        </div>
        <div className="admpro-notice success">{message}</div>
        <div className="admpro-grid-2" style={{ marginTop: 12 }}>
          <div className="admpro-card"><strong>Firma</strong><p>{activeMainCompany?.name || user?.mainCompanySlug || "Kayıtlı firma"}</p></div>
          <div className="admpro-card"><strong>Yetkili</strong><p>{user?.fullName || user?.username || "Firma yöneticisi"}</p></div>
        </div>
        <div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
          <button type="button" className="primary" onClick={() => window.location.assign("/admin/giris-onaylari")}>Giriş Onaylarını Aç</button>
          <button type="button" onClick={() => window.location.assign("/admin/kullanicilar")}>Firma Kullanıcılarını Aç</button>
        </div>
      </section>
    );
  }

  return (
    <section className="admpro-card">
      <div className="admpro-card-head">
        <div>
          <h3>Firma Sahibi / Admin Yetkisi</h3>
          <p>Yeni firma için bir veya birden fazla COMPANY_ADMIN atanabilir. Bu kişiler yalnız kendi firmasının giriş onaylarını ve kullanıcılarını yönetir.</p>
        </div>
        <button type="button" onClick={load} disabled={busy}>{busy ? "İşleniyor..." : "Yenile"}</button>
      </div>
      <div className={`admpro-notice ${message.startsWith("Hata:") ? "warn" : "success"}`}>{message}</div>
      <div className="admpro-form-grid" style={{ marginTop: 12 }}>
        <label>Firma
          <select value={companySlug} onChange={(event) => setCompanySlug(event.target.value)}>
            {companies.map((row) => <option key={row.id || row.slug} value={row.slug}>{row.name || row.slug}</option>)}
          </select>
        </label>
        <label>Firma Sahibi / Admin Ata
          <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
            <option value="">Kullanıcı seçin</option>
            {candidates.map((row) => <option key={row.id} value={row.id}>{row.fullName || row.username} · {roleOf(row.role) || "VIEWER"}</option>)}
          </select>
        </label>
      </div>
      <div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
        <button type="button" className="primary" onClick={assignAdmin} disabled={!candidateId || !companySlug || busy}>COMPANY_ADMIN Yetkisi Ver</button>
      </div>
      <div className="admpro-table" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Yetkili</th><th>Kullanıcı</th><th>Firma</th><th>Yetki</th><th>İşlem</th></tr></thead>
          <tbody>
            {companyAdmins.map((row) => <tr key={row.id}><td>{row.fullName || "-"}</td><td>{row.username || "-"}</td><td>{row.mainCompanySlug || "-"}</td><td>Firma Sahibi / Admin</td><td><button type="button" className="danger" onClick={() => removeAdmin(row)} disabled={busy}>Yetkiyi Kaldır</button></td></tr>)}
            {!companyAdmins.length ? <tr><td colSpan="5">Bu firmaya henüz COMPANY_ADMIN atanmadı.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
