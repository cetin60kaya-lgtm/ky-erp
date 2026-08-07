import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function CompanySelectionPage() {
  const { memberships, switchCompany, logout } = useAuth();
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function selectCompany(companyId) {
    setBusyId(companyId);
    setError("");
    try {
      await switchCompany(companyId);
    } catch (requestError) {
      setError(requestError?.message || "Firma seçilemedi.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" style={{ maxWidth: 720 }}>
        <div className="login-brand"><strong>KY ERP</strong><span>Firma Seçimi</span></div>
        <h1>Çalışacağınız firmayı seçin</h1>
        <p>Firma bağlamı sunucuda doğrulanır ve seçim için yeni bir güvenli oturum üretilir.</p>
        {error ? <div className="login-error">{error}</div> : null}
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          {memberships.filter((item) => item?.company?.isActive !== false).map((membership) => (
            <button
              key={membership.id}
              type="button"
              className="primary-btn"
              disabled={Boolean(busyId)}
              onClick={() => selectCompany(membership.company.id)}
              style={{ justifyContent: "space-between", padding: 16 }}
            >
              <span>{membership.company.name}</span>
              <small>{membership.companyRole}</small>
            </button>
          ))}
        </div>
        <button type="button" className="secondary-btn" onClick={logout} style={{ marginTop: 18 }}>Oturumu kapat</button>
      </section>
    </main>
  );
}
