import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listMailAccounts,
  startGoogleMailOAuth,
  startMicrosoftMailOAuth,
  syncGoogleMailAccount,
  syncMailAccount,
} from "../../services/mailApi";
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

export default function AdminMailConnections({ activeMainCompany, openModule }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const slug = activeMainCompany?.slug || "";
  const companyName = activeMainCompany?.name || activeMainCompany?.title || slug || "Aktif Firma";
  const load = useCallback(async () => {
    setLoading(true);
    const rows = await Promise.allSettled([listMailAccounts()]);
    if (rows[0].status === "fulfilled") setAccounts(Array.isArray(rows[0].value) ? rows[0].value : []);
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
      const provider = String(account.provider_type || account.providerType || "").toUpperCase();
      const result = provider === "GMAIL"
        ? await startGoogleMailOAuth(account.id)
        : await startMicrosoftMailOAuth(account.id);
      if (!result?.authorizeUrl) throw new Error("Sağlayıcı giriş adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail hesabı bağlantısı başlatılamadı."}`);
      setLoading(false);
    }
  }

  async function sync(account) {
    setLoading(true);
    setNotice("");
    try {
      const provider = String(account.provider_type || account.providerType || "").toUpperCase();
      const result = provider === "GMAIL"
        ? await syncGoogleMailAccount(account.id)
        : await syncMailAccount(account.id);
      const count = Number(result?.count || (Array.isArray(result?.folders) ? result.folders : []).reduce((sum, row) => sum + Number(row.count || 0), 0));
      setNotice(result?.partial ? `Senkronizasyon kısmi tamamlandı. ${count} kayıt işlendi.` : `Senkronizasyon tamamlandı. ${count} kayıt işlendi.`);
      await load();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Senkronizasyon tamamlanamadı."}`);
      setLoading(false);
    }
  }

  return (
    <div className="mail-admin-page">
      <section className="mail-admin-hero">
        <div>
          <small>BAĞLANTILAR & DEPOLAMA / MAIL BAĞLANTILARI</small>
          <h2>Mail Sağlayıcı Bağlantıları</h2>
          <p><b>{companyName}</b> için Onaylanmış Outlook/Hotmail ve Gmail posta kutularının OAuth bağlantısı ve senkronizasyonu burada yönetilir. Firma maili onayı <b>Firma Kartı / Ayarlar</b> veya <b>Onay Merkezi</b> içinden verilir.</p>
        </div>
        <button type="button" onClick={() => openModule?.("iletisim", { tabKey: "mail-gelen" })}>Mail Merkezini Aç</button>
      </section>

      {notice ? <div className={`mail-admin-notice ${notice.startsWith("Hata:") ? "bad" : "ok"}`}>{notice}</div> : null}

      <section className="mail-admin-stats">
        <div><span>Toplam Hesap</span><strong>{stats.total}</strong><small>Kişisel + ortak + bölüm</small></div>
        <div><span>Aktif</span><strong>{stats.active}</strong><small>Kullanıma hazır posta kutusu</small></div>
        <div><span>Onay Bekleyen</span><strong>{stats.pending}</strong><small>Firma Sahibi kararı bekleniyor</small></div>
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
                {["MICROSOFT_365","GMAIL"].includes(provider) && !connected ? <button type="button" onClick={() => connect(row)} disabled={loading || String(row.approval_status || row.approvalStatus || "").toUpperCase() !== "APPROVED"}>{provider === "GMAIL" ? "Gmail Bağla" : "Microsoft Bağla"}</button> : null}
                {["MICROSOFT_365","GMAIL"].includes(provider) && connected ? <button type="button" className="secondary" onClick={() => sync(row)} disabled={loading}>Senkronize Et</button> : null}
              </span>
            </div>;
          })}
        </div> : <div className="mail-admin-empty"><b>Henüz mail hesabı yok.</b><span>Yeni firma maili talebi Mail & Dosyalar bölümünden açılır. Onay Firma Kartı / Onay Merkezi'nde; teknik OAuth bağlantısı burada yapılır.</span><button type="button" onClick={() => openModule?.("iletisim", { tabKey: "mail-gelen" })}>Firma Maili Talebi Aç</button></div>}
      </section>

      <section className="mail-admin-card">
        <div className="mail-admin-card-head"><div><h3>Onay ve Sahiplik</h3><p>Bu ekran teknik bağlantı içindir; firma maili ekleme/onay kararı burada verilmez.</p></div></div>
        <div className="mail-admin-empty compact">Firma mail listesi ve onayları için Yönetim → Firma Kartı / Ayarlar veya Yönetim → Onay Merkezi kullanılır.</div>
      </section>
    </div>
  );
}
