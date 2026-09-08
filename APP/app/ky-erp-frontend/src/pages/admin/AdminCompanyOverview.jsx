import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listLoginApprovals, listUsers } from "../../services/adminApi";
import { listMailApprovals } from "../../services/mailApi";
import AdminMailApprovals from "./AdminMailApprovals";
import "./AdminManagement.css";

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

export default function AdminCompanyOverview({ activeMainCompany }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [mailApprovals, setMailApprovals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Firma yönetim merkezi hazırlanıyor...");

  const load = useCallback(async () => {
    setBusy(true);
    const jobs = await Promise.allSettled([listUsers(), listLoginApprovals(), listMailApprovals()]);
    if (jobs[0].status === "fulfilled") setUsers(rowsOf(jobs[0].value));
    if (jobs[1].status === "fulfilled") setApprovals(rowsOf(jobs[1].value));
    if (jobs[2].status === "fulfilled") setMailApprovals(rowsOf(jobs[2].value).filter((row) => String(row?.status || "").toUpperCase() === "PENDING"));
    const failed = jobs.filter((job) => job.status === "rejected").length;
    setMessage(failed ? `${failed} firma yönetim kontrolü yanıt vermedi.` : "Firma kullanıcı ve giriş kontrolleri güncel.");
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const metrics = useMemo(() => ({
    activeUsers: users.filter((row) => row?.isActive !== false).length,
    passiveUsers: users.filter((row) => row?.isActive === false).length,
    approvals: approvals.length,
    mailApprovals: mailApprovals.length,
  }), [approvals.length, mailApprovals.length, users]);

  return (
    <div className="admpro-page">
      <header className="admpro-head">
        <div>
          <span className="admpro-kicker">YÖNETİM / FİRMA MERKEZİ</span>
          <h2>{activeMainCompany?.name || user?.mainCompanySlug || "Firma"} Yönetim Merkezi</h2>
          <p>Firma Sahibi / İşveren kendi firmasındaki kullanıcı ve onay işlerini yönetir. Kişisel oturumlar Profil & Giriş Güvenliği alanından yönetilir.</p>
        </div>
        <div className="admpro-actions"><button type="button" className="primary" onClick={load} disabled={busy}>{busy ? "Kontrol Ediliyor..." : "Yenile"}</button></div>
      </header>

      <div className={`admpro-notice ${message.includes("yanıt vermedi") ? "warn" : "success"}`}>{message}</div>

      <section className="admpro-stats">
        <div className="admpro-stat"><span>Aktif Kullanıcı</span><strong>{metrics.activeUsers}</strong><small>{metrics.passiveUsers} pasif kullanıcı</small></div>
        <div className="admpro-stat"><span>Bekleyen Giriş Onayı</span><strong>{metrics.approvals}</strong><small>Karar bekleyen yeni cihaz girişi</small></div>
        <div className="admpro-stat"><span>Bekleyen Mail Onayı</span><strong>{metrics.mailApprovals}</strong><small>Mail hesabı bağlantı kararı</small></div>
      </section>

      <section className="admpro-grid-2">
        <div className="admpro-card">
          <div className="admpro-card-head"><div><h3>Giriş Onayları</h3><p>Yeni cihaz girişlerini onaylayın veya reddedin.</p></div><span className={`admpro-badge ${metrics.approvals ? "warn" : "ok"}`}>{metrics.approvals} bekleyen</span></div>
          <div className="admpro-actions" style={{ justifyContent: "flex-start" }}><button type="button" className="primary" onClick={() => window.location.assign("/admin/giris-onaylari")}>Giriş Onaylarını Aç</button></div>
        </div>
        <div className="admpro-card">
          <div className="admpro-card-head"><div><h3>Firma Kullanıcıları</h3><p>Kullanıcı ekleme, aktif/pasif, parola ve giriş güvenliği.</p></div><span className="admpro-badge ok">{users.length} kullanıcı</span></div>
          <div className="admpro-actions" style={{ justifyContent: "flex-start" }}><button type="button" onClick={() => window.location.assign("/admin/kullanicilar")}>Kullanıcıları Aç</button><button type="button" onClick={() => window.location.assign("/admin/ana-firma-ayarlar")}>Firma Yetkisini Aç</button></div>
        </div>
      </section>

      <section className="admpro-card admpro-decision-center">
        <AdminMailApprovals compact onChanged={load} />
      </section>
    </div>
  );
}
