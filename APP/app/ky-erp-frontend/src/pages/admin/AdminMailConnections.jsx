import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decideMailApproval,
  listMailAccounts,
  listMailApprovals,
  startMicrosoftMailOAuth,
  syncMailAccount,
} from "../../services/mailApi";
import { useAuth } from "../../context/AuthContext";
import "./AdminMailConnections.css";

const providerLabel = (value) => ({
  MICROSOFT_365: "Microsoft 365 / Outlook",
  GMAIL: "Gmail / Google Workspace",
  JMAP: "JMAP",
  IMAP_SMTP: "Standart IMAP / SMTP",
}[String(value || "").toUpperCase()] || value || "Mail");

const accountTypeLabel = (value) => ({
  PERSONAL: "Kişisel",
  SHARED: "Ortak Posta Kutusu",
  DEPARTMENT: "Bölüm Posta Kutusu",
}[String(value || "").toUpperCase()] || value || "—");

const statusLabel = (value) => ({
  ACTIVE: "Aktif",
  PENDING: "Onay Bekliyor",
  DISCONNECTED: "Bağlantı Bekliyor",
  REAUTH_REQUIRED: "Yeniden Bağlanmalı",
  SUSPENDED: "Askıda",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
}[String(value || "").toUpperCase()] || value || "—");

const isOwnerRole = (value) => ["SUPER_ADMIN", "ADMIN"].includes(String(value || "").toUpperCase());
const isCompanyOwnerRole = (value) => String(value || "").toUpperCase() === "COMPANY_ADMIN";

export default function AdminMailConnections({ activeMainCompany, openModule }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const slug = activeMainCompany?.slug || "";
  const companyName = activeMainCompany?.name || activeMainCompany?.title || slug || "Aktif Firma";
  const role = String(user?.role || "").toUpperCase();
  const appOwner = isOwnerRole(role);
  const companyOwner = isCompanyOwnerRole(role);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await Promise.allSettled([listMailAccounts(), listMailApprovals()]);
    if (rows[0].status === "fulfilled") setAccounts(Array.isArray(rows[0].value) ? rows[0].value : []);
    if (rows[1].status === "fulfilled") setApprovals(Array.isArray(rows[1].value) ? rows[1].value : []);
    const failed = rows.filter((row) => row.status === "rejected");
    setNotice(failed.length ? "Bazı mail yönetim bilgileri alınamadı. Erişilebilen kayıtlar gösteriliyor." : "");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter((row) => String(row.status || "").toUpperCase() === "ACTIVE").length,
    pending: accounts.filter((row) => String(row.approval_status || row.approvalStatus || "").toUpperCase() === "PENDING").length,
    connected: accounts.filter((row) => Boolean(row.provider_connected ?? row.providerConnected)).length,
  }), [accounts]);

  async function connect(account) {
    setLoading(true);
    setNotice("");
    try {
      const result = await startMicrosoftMailOAuth(account.id);
      if (!result?.authorizeUrl) throw new Error("Microsoft giriş adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Microsoft hesabı bağlantısı başlatılamadı."}`);
      setLoading(false);
    }
  }

  async function sync(account) {
    setLoading(true);
    setNotice("");
    try {
      const result = await syncMailAccount(account.id);
      const count = (Array.isArray(result?.folders) ? result.folders : []).reduce((sum, row) => sum + Number(row.count || 0), 0);
      setNotice(result?.partial ? `Senkronizasyon kısmi tamamlandı. ${count} kayıt işlendi.` : `Senkronizasyon tamamlandı. ${count} kayıt işlendi.`);
      await load();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Senkronizasyon tamamlanamadı."}`);
      setLoading(false);
    }
  }

  async function decide(request, decision) {
    setLoading(true);
    setNotice("");
    try {
      await decideMailApproval(request.id, decision);
      setNotice(decision === "APPROVE" ? "Mail bağlantı onayı kaydedildi." : "Mail bağlantı talebi reddedildi.");
      await load();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Onay işlemi tamamlanamadı."}`);
      setLoading(false);
    }
  }

  return (
    <div className="mail-admin-page">
      <section className="mail-admin-hero">
        <div>
          <small>BAĞLANTILAR & DEPOLAMA / E-POSTA HESAPLARI</small>
          <h2>Kurumsal Mail Bağlantıları</h2>
          <p><b>{companyName}</b> için Outlook / Microsoft 365, Gmail ve diğer posta kutuları burada bağlanır ve yetkilendirilir. Günlük gelen-giden mail kullanımı bu ekranda değil, <b>Mail & Dosyalar</b> bölümünde yapılır.</p>
        </div>
        <button type="button" onClick={() => openModule?.("iletisim", { tabKey: "mail-gelen" })}>Mail Merkezini Aç</button>
      </section>

      {notice ? <div className={`mail-admin-notice ${notice.startsWith("Hata:") ? "bad" : "ok"}`}>{notice}</div> : null}

      <section className="mail-admin-stats">
        <div><span>Toplam Hesap</span><strong>{stats.total}</strong><small>Kişisel + ortak + bölüm</small></div>
        <div><span>Aktif</span><strong>{stats.active}</strong><small>Kullanıma hazır posta kutusu</small></div>
        <div><span>Onay Bekleyen</span><strong>{stats.pending}</strong><small>Firma / uygulama sahibi</small></div>
        <div><span>Provider Bağlı</span><strong>{stats.connected}</strong><small>OAuth bağlantısı tamamlandı</small></div>
      </section>

      <section className="mail-admin-card">
        <div className="mail-admin-card-head">
          <div><h3>Posta Kutuları</h3><p>Hesap bağlantısı, OAuth durumu ve senkronizasyon sağlığı.</p></div>
          <button type="button" className="secondary" disabled={loading} onClick={load}>Yenile</button>
        </div>
        {accounts.length ? <div className="mail-admin-table">
          <div className="head"><span>Hesap</span><span>Tür</span><span>Sağlayıcı</span><span>Durum</span><span>İşlem</span></div>
          {accounts.map((row) => {
            const provider = String(row.provider_type || row.providerType || "").toUpperCase();
            const status = String(row.status || "").toUpperCase();
            const connected = Boolean(row.provider_connected ?? row.providerConnected);
            return <div className="row" key={row.id}>
              <span><b>{row.display_name || row.displayName || row.email_address || row.emailAddress}</b><small>{row.email_address || row.emailAddress}</small></span>
              <span>{accountTypeLabel(row.account_type || row.accountType)}</span>
              <span>{providerLabel(provider)}</span>
              <span><b>{statusLabel(status)}</b><small>{connected ? "OAuth bağlı" : "OAuth bekliyor"}</small></span>
              <span className="actions">
                {provider === "MICROSOFT_365" && !connected ? <button type="button" onClick={() => connect(row)} disabled={loading}>Microsoft Bağla</button> : null}
                {provider === "MICROSOFT_365" && connected ? <button type="button" className="secondary" onClick={() => sync(row)} disabled={loading}>Senkronize Et</button> : null}
              </span>
            </div>;
          })}
        </div> : <div className="mail-admin-empty"><b>Henüz mail hesabı yok.</b><span>Yeni hesap talebi Mail & Dosyalar bölümünden açılır; onay ve bağlantı yönetimi burada yapılır.</span><button type="button" onClick={() => openModule?.("iletisim", { tabKey: "mail-gelen" })}>Mail Hesabı Talebi Aç</button></div>}
      </section>

      <section className="mail-admin-card">
        <div className="mail-admin-card-head"><div><h3>Bekleyen Mail Onayları</h3><p>Kritik ortak/bölüm hesaplarında Firma Sahibi → Uygulama Sahibi sıralı onay uygulanır.</p></div></div>
        {approvals.filter((row) => String(row.status || "").toUpperCase() === "PENDING").length ? <div className="mail-admin-approvals">
          {approvals.filter((row) => String(row.status || "").toUpperCase() === "PENDING").map((row) => <div className="approval" key={row.id}>
            <div><b>{row.display_name || row.email_address || "Mail hesabı"}</b><span>{providerLabel(row.provider_type)} · {accountTypeLabel(row.account_type)} · {row.approval_policy === "COMPANY_OWNER_AND_APP_OWNER" ? "Çift Onay" : "Firma Sahibi Onayı"}</span></div>
            <div className="actions">
              {(appOwner || companyOwner) ? <><button type="button" onClick={() => decide(row, "APPROVE")} disabled={loading}>Onayla</button><button type="button" className="danger" onClick={() => decide(row, "REJECT")} disabled={loading}>Reddet</button></> : <span>Yetkili onayı bekleniyor</span>}
            </div>
          </div>)}
        </div> : <div className="mail-admin-empty compact">Bekleyen mail bağlantı onayı yok.</div>}
      </section>
    </div>
  );
}
