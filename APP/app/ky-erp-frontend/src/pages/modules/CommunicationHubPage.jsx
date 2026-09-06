import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMailDraft,
  getMailOverview,
  getMailProviders,
  listCommunicationFiles,
  listMailAccounts,
  listMailDrafts,
  listMailMessages,
  requestMailAccount,
  searchCommunicationFiles,
  sendMailDraft,
  startMicrosoftMailOAuth,
  syncMailAccount,
} from "../../services/mailApi";
import "./CommunicationHubPage.css";

const MAIL_TABS = new Set(["mail-gelen", "mail-gonderilen", "mail-taslaklar", "mail-yanit-bekleyen", "mail-sablonlar"]);

const providerLabel = (value) => ({
  MICROSOFT_365: "Microsoft 365 / Outlook",
  GMAIL: "Gmail / Google Workspace",
  JMAP: "JMAP",
  IMAP_SMTP: "Standart IMAP / SMTP",
}[String(value || "").toUpperCase()] || value || "Mail");

const statusLabel = (value) => ({
  ACTIVE: "Aktif",
  PENDING: "Onay Bekliyor",
  DISCONNECTED: "Bağlantı Bekliyor",
  REAUTH_REQUIRED: "Yeniden Bağla",
  SUSPENDED: "Askıda",
}[String(value || "").toUpperCase()] || value || "—");

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function CommunicationHubPage({ activeTab, activeMainCompany, openModule }) {
  const isMail = MAIL_TABS.has(activeTab);
  const [overview, setOverview] = useState(null);
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [files, setFiles] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    providerType: "MICROSOFT_365",
    accountType: "PERSONAL",
    emailAddress: "",
    displayName: "",
    departmentCode: "",
  });
  const [draftForm, setDraftForm] = useState({ to: "", subject: "", bodyText: "" });
  const [composeOpen, setComposeOpen] = useState(false);

  const activeCompanyName = activeMainCompany?.name || activeMainCompany?.ad || activeMainCompany?.slug || "Aktif Firma";
  const selectedAccount = useMemo(
    () => accounts.find((row) => String(row.id) === String(selectedAccountId)) || null,
    [accounts, selectedAccountId],
  );

  const loadBase = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      getMailOverview(),
      getMailProviders(),
      listMailAccounts(),
      listCommunicationFiles(),
    ]);
    if (results[0].status === "fulfilled") setOverview(results[0].value || null);
    if (results[1].status === "fulfilled") setProviders(safeArray(results[1].value?.providers));
    if (results[2].status === "fulfilled") {
      const rows = safeArray(results[2].value);
      setAccounts(rows);
      setSelectedAccountId((current) => rows.some((row) => String(row.id) === String(current)) ? current : String(rows[0]?.id || ""));
    }
    if (results[3].status === "fulfilled") setFiles(safeArray(results[3].value));
    const failed = results.filter((row) => row.status === "rejected");
    setNotice(failed.length ? "Bazı kaynaklar henüz hazır değil; erişilebilen bilgiler gösteriliyor." : "");
    setLoading(false);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mailConnected") === "1") setNotice("Microsoft posta kutusu bağlantısı doğrulandı.");
    if (params.get("mailError")) setNotice(`Hata: ${params.get("mailError")}`);
    if (params.has("mailConnected") || params.has("mailError")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadMailbox() {
      if (!isMail || !selectedAccountId) {
        setMessages([]);
        setDrafts([]);
        return;
      }
      try {
        if (activeTab === "mail-taslaklar") {
          const rows = await listMailDrafts();
          if (!cancelled) {
            const list = safeArray(rows).filter((row) => String(row.account_id || row.accountId) === String(selectedAccountId));
            setDrafts(list);
            setSelectedMessage((current) => list.find((row) => row.id === current?.id) || list[0] || null);
          }
          return;
        }
        const direction = activeTab === "mail-gonderilen" ? "OUTGOING" : "INCOMING";
        const rows = await listMailMessages(selectedAccountId, { direction, take: 120 });
        if (!cancelled) {
          const list = safeArray(rows);
          setMessages(activeTab === "mail-yanit-bekleyen" ? list.filter((row) => row.is_flagged || row.isFlagged) : list);
          setSelectedMessage((current) => list.find((row) => row.id === current?.id) || list[0] || null);
        }
      } catch (error) {
        if (!cancelled) setNotice(error?.message || "Posta kutusu okunamadı.");
      }
    }
    loadMailbox();
    return () => { cancelled = true; };
  }, [activeTab, isMail, selectedAccountId]);

  async function submitAccountRequest(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await requestMailAccount(requestForm);
      setNotice(`Hesap talebi oluşturuldu. Onay politikası: ${result.approvalPolicy === "COMPANY_OWNER_AND_APP_OWNER" ? "Firma Sahibi + Uygulama Sahibi" : "Firma Sahibi"}.`);
      setRequestOpen(false);
      setRequestForm((current) => ({ ...current, emailAddress: "", displayName: "", departmentCode: "" }));
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail hesabı talebi oluşturulamadı."}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitDraft(event) {
    event.preventDefault();
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      await createMailDraft({
        accountId: selectedAccountId,
        subject: draftForm.subject,
        bodyText: draftForm.bodyText,
        recipients: { to: draftForm.to.split(/[;,]/).map((email) => email.trim()).filter(Boolean) },
      });
      setDraftForm({ to: "", subject: "", bodyText: "" });
      setComposeOpen(false);
      setNotice("Taslak kaydedildi. Otomatik gönderim yapılmadı.");
      if (activeTab === "mail-taslaklar") {
        const rows = await listMailDrafts();
        setDrafts(safeArray(rows).filter((row) => String(row.account_id || row.accountId) === String(selectedAccountId)));
      }
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Taslak kaydedilemedi."}`);
    } finally {
      setLoading(false);
    }
  }

  async function connectMicrosoft() {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const result = await startMicrosoftMailOAuth(selectedAccountId);
      if (!result?.authorizeUrl) throw new Error("Microsoft OAuth adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Microsoft hesabı bağlanamadı."}`);
      setLoading(false);
    }
  }

  async function syncSelectedMailbox() {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const result = await syncMailAccount(selectedAccountId);
      const total = safeArray(result?.folders).reduce((sum, row) => sum + Number(row.count || 0), 0);
      setNotice(result?.partial ? `Mail senkronizasyonu kısmi tamamlandı. ${total} kayıt işlendi.` : `Mail senkronizasyonu tamamlandı. ${total} kayıt işlendi.`);
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail senkronizasyonu tamamlanamadı."}`);
      setLoading(false);
    }
  }

  async function sendSelectedDraft() {
    if (!selectedMessage?.id) return;
    setLoading(true);
    try {
      const result = await sendMailDraft(selectedMessage.id);
      setNotice(result?.status === "PROVIDER_ACCEPTED"
        ? "Microsoft gönderim isteğini kabul etti. Bu durum teslim edildi anlamına gelmez."
        : "Gönderim işlemi tamamlandı.");
      const rows = await listMailDrafts();
      const list = safeArray(rows).filter((row) => String(row.account_id || row.accountId) === String(selectedAccountId));
      setDrafts(list);
      setSelectedMessage(list[0] || null);
      await loadBase();
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail gönderilemedi."}`);
      setLoading(false);
    }
  }

  async function runFileSearch(value) {
    setSearch(value);
    try {
      const rows = value.trim() ? await searchCommunicationFiles(value) : await listCommunicationFiles();
      setFiles(safeArray(rows));
    } catch (error) {
      setNotice(error?.message || "Dosya araması yapılamadı.");
    }
  }

  const visibleDrafts = activeTab === "mail-taslaklar" ? drafts : [];
  const messageRows = activeTab === "mail-taslaklar" ? visibleDrafts : messages;

  return (
    <div className="comm-page">
      <header className="comm-header">
        <div>
          <small>KY ERP / MAIL & DOSYALAR</small>
          <h1>{isMail ? "Mail Merkezi" : "Dosya Merkezi"}</h1>
          <p><b>Aktif Firma:</b> {activeCompanyName} · Mail, firma dosyaları ve ERP ilişkileri tek çalışma alanında.</p>
        </div>
        <div className="comm-actions">
          {isMail ? <button type="button" onClick={() => setComposeOpen(true)} disabled={!selectedAccountId || loading}>+ Yeni Mail</button> : null}
          {isMail ? <button type="button" className="secondary" onClick={() => setRequestOpen(true)}>+ Mail Hesabı</button> : null}
          <button type="button" className="secondary" onClick={loadBase} disabled={loading}>Yenile</button>
        </div>
      </header>

      {notice ? <div className={`comm-notice ${notice.startsWith("Hata:") ? "error" : ""}`}>{notice}</div> : null}

      <section className="comm-metrics">
        <div><span>Okunmamış Mail</span><b>{overview?.unreadCount ?? 0}</b></div>
        <div><span>Aktif Mail Hesabı</span><b>{overview?.activeAccountCount ?? 0}</b></div>
        <div><span>Hesap Onayı Bekleyen</span><b>{overview?.pendingAccountCount ?? 0}</b></div>
        <div><span>Firma Dosyası</span><b>{files.length}</b></div>
      </section>

      {requestOpen ? (
        <section className="comm-request-card">
          <div className="comm-section-title"><div><h2>Mail Hesabı Ekleme Talebi</h2><p>Bağlantı onaydan önce aktif olmaz. Muhasebe, e-Belge, ortak ve bölüm posta kutuları çift onaya düşer.</p></div><button type="button" className="secondary" onClick={() => setRequestOpen(false)}>Kapat</button></div>
          <form onSubmit={submitAccountRequest}>
            <label>Sağlayıcı<select value={requestForm.providerType} onChange={(e) => setRequestForm((v) => ({ ...v, providerType: e.target.value }))}>
              {(providers.length ? providers : [{provider:"MICROSOFT_365"},{provider:"GMAIL"},{provider:"JMAP"},{provider:"IMAP_SMTP"}]).map((row) => <option key={row.provider} value={row.provider}>{providerLabel(row.provider)}</option>)}
            </select></label>
            <label>Hesap Türü<select value={requestForm.accountType} onChange={(e) => setRequestForm((v) => ({ ...v, accountType: e.target.value }))}><option value="PERSONAL">Kişisel</option><option value="SHARED">Ortak / Shared</option><option value="DEPARTMENT">Bölüm</option></select></label>
            <label>E-posta<input type="email" required value={requestForm.emailAddress} onChange={(e) => setRequestForm((v) => ({ ...v, emailAddress: e.target.value }))} placeholder="muhasebe@firma.com"/></label>
            <label>Görünen Ad<input value={requestForm.displayName} onChange={(e) => setRequestForm((v) => ({ ...v, displayName: e.target.value }))} placeholder="Muhasebe"/></label>
            <label>Bölüm<select value={requestForm.departmentCode} onChange={(e) => setRequestForm((v) => ({ ...v, departmentCode: e.target.value }))}><option value="">Genel</option><option value="MUHASEBE">Muhasebe</option><option value="E_BELGE">e-Belge</option><option value="DESEN">Desen</option><option value="IK">İK</option><option value="YONETIM">Yönetim</option></select></label>
            <button type="submit" disabled={loading}>Onaya Gönder</button>
          </form>
        </section>
      ) : null}

      {composeOpen ? (
        <section className="comm-compose">
          <div className="comm-section-title"><div><h2>Yeni Mail Taslağı</h2><p>Bu aşamada yalnız taslak kaydedilir; AI veya ekran otomatik gönderim yapmaz.</p></div><button type="button" className="secondary" onClick={() => setComposeOpen(false)}>Kapat</button></div>
          <form onSubmit={submitDraft}>
            <label>Kimden<select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>{accounts.map((row) => <option key={row.id} value={row.id}>{row.display_name || row.displayName || row.email_address || row.emailAddress}</option>)}</select></label>
            <label>Kime<input value={draftForm.to} onChange={(e) => setDraftForm((v) => ({ ...v, to: e.target.value }))} placeholder="mail@firma.com"/></label>
            <label className="wide">Konu<input value={draftForm.subject} onChange={(e) => setDraftForm((v) => ({ ...v, subject: e.target.value }))}/></label>
            <label className="wide">Mesaj<textarea rows={7} value={draftForm.bodyText} onChange={(e) => setDraftForm((v) => ({ ...v, bodyText: e.target.value }))}/></label>
            <div className="wide comm-compose-actions"><button type="submit" disabled={loading}>Taslağı Kaydet</button><span>Gönderim yalnız açık kullanıcı işlemiyle yapılır; otomatik gönderim kapalıdır.</span></div>
          </form>
        </section>
      ) : null}

      {isMail ? (
        <section className="comm-mail-layout">
          <aside className="comm-mailboxes">
            <div className="comm-pane-title"><b>Posta Kutuları</b><small>{accounts.length} hesap</small></div>
            {accounts.length ? accounts.map((row) => (
              <button type="button" key={row.id} className={String(row.id) === String(selectedAccountId) ? "active" : ""} onClick={() => setSelectedAccountId(String(row.id))}>
                <b>{row.display_name || row.displayName || row.email_address || row.emailAddress}</b>
                <span>{row.email_address || row.emailAddress}</span>
                <em>{providerLabel(row.provider_type || row.providerType)} · {statusLabel(row.status)}</em>
              </button>
            )) : <div className="comm-empty">Henüz atanmış posta kutusu yok.<br/>“+ Mail Hesabı” ile talep oluşturabilirsiniz.</div>}
            {selectedAccount ? <div className="comm-account-tools">
              <span><b>{statusLabel(selectedAccount.status)}</b> · {providerLabel(selectedAccount.provider_type || selectedAccount.providerType)}</span>
              {String(selectedAccount.provider_type || selectedAccount.providerType).toUpperCase() === "MICROSOFT_365" && String(selectedAccount.status || "").toUpperCase() !== "ACTIVE"
                ? <button type="button" onClick={connectMicrosoft} disabled={loading}>Microsoft Hesabını Bağla</button>
                : null}
              {String(selectedAccount.status || "").toUpperCase() === "ACTIVE"
                ? <button type="button" className="secondary" onClick={syncSelectedMailbox} disabled={loading}>Postayı Senkronize Et</button>
                : null}
            </div> : null}
          </aside>

          <main className="comm-message-list">
            <div className="comm-pane-title"><b>{activeTab === "mail-gonderilen" ? "Gönderilenler" : activeTab === "mail-taslaklar" ? "Taslaklar" : activeTab === "mail-yanit-bekleyen" ? "Yanıt Bekleyenler" : activeTab === "mail-sablonlar" ? "Şablonlar" : "Gelen Kutusu"}</b><small>{messageRows.length} kayıt</small></div>
            {activeTab === "mail-sablonlar" ? (
              <div className="comm-empty large"><b>Kurumsal Mail Şablonları</b><span>Mevcut muhasebe şablonları bu merkeze taşınırken tek canonical şablon kaynağı korunacak.</span><button type="button" onClick={() => openModule?.("muhasebe", { tabKey: "mail-sablonlari" })}>Mevcut Şablonları Aç</button></div>
            ) : messageRows.length ? messageRows.map((row) => (
              <button type="button" key={row.id} className={selectedMessage?.id === row.id ? "active" : ""} onClick={() => setSelectedMessage(row)}>
                <div><b>{row.sender_name || row.sender_email || row.subject || "Taslak"}</b><span>{dateText(row.received_at || row.sent_at || row.updated_at)}</span></div>
                <strong>{row.subject || "(Konu yok)"}</strong>
                <p>{row.body_text || row.bodyText || "İçerik önizlemesi yok."}</p>
              </button>
            )) : <div className="comm-empty large">{selectedAccount ? "Bu görünümde mail kaydı yok." : "Önce bir posta kutusu seçin veya hesap talebi oluşturun."}</div>}
          </main>

          <aside className="comm-preview">
            <div className="comm-pane-title"><b>Mail Detayı</b><small>ERP Bağlamı</small></div>
            {selectedMessage && activeTab === "mail-taslaklar" ? <>
              <h2>{selectedMessage.subject || "(Konu yok)"}</h2>
              <p><b>Durum:</b> {selectedMessage.status || "DRAFT"}</p>
              <div className="comm-body">{selectedMessage.body_text || selectedMessage.bodyText || "Taslak içeriği yok."}</div>
              <div className="comm-context-box"><b>Gönderim Güvenliği</b><span>Gönderim yalnız kullanıcı düğmeye bastığında yapılır. Provider kabulü teslimat sayılmaz.</span><button type="button" onClick={sendSelectedDraft} disabled={loading || String(selectedAccount?.status || "").toUpperCase() !== "ACTIVE"}>Gönder</button></div>
            </> : selectedMessage ? <>
              <h2>{selectedMessage.subject || "(Konu yok)"}</h2>
              <p><b>Gönderen:</b> {selectedMessage.sender_name || selectedMessage.sender_email || "—"}</p>
              <p><b>Tarih:</b> {dateText(selectedMessage.received_at || selectedMessage.sent_at)}</p>
              <div className="comm-body">{selectedMessage.body_text || "Mail gövdesi henüz senkronize edilmemiş."}</div>
              <div className="comm-context-box"><b>KY ERP Bağlamı</b><span>Firma / cari / model / desen / fatura ilişkileri mail_relations üzerinden burada gösterilecek.</span><span>File Hub ekleri ikinci kez kopyalanmadan ilişkilendirilecek.</span></div>
            </> : <div className="comm-empty large">Bir mail seçildiğinde içerik ve KY ERP ilişkileri burada açılır.</div>}
          </aside>
        </section>
      ) : (
        <section className="comm-files">
          <div className="comm-files-toolbar">
            <div><b>Firma Dosyaları</b><span>Google Drive, OneDrive, SharePoint, Yerel ve NAS tek File Hub görünümünde.</span></div>
            <input type="search" value={search} onChange={(e) => runFileSearch(e.target.value)} placeholder="Dosya, model veya klasör ara"/>
          </div>
          <div className="comm-file-table">
            <div className="head"><span>Dosya</span><span>Kaynak</span><span>Konum</span><span>Durum</span><span>Güncelleme</span></div>
            {files.length ? files.map((row) => <div className="row" key={row.id}>
              <span><b>{row.file_name || row.fileName}</b><small>{row.extension || ""}</small></span>
              <span>{row.provider_type || row.providerType || row.connection_name || "File Hub"}</span>
              <span title={row.relative_path || row.relativePath || ""}>{row.relative_path || row.relativePath || "—"}</span>
              <span>{row.status || "AVAILABLE"}</span>
              <span>{dateText(row.updated_at || row.updatedAt)}</span>
            </div>) : <div className="comm-empty large">Bu firmada indekslenmiş dosya bulunamadı.</div>}
          </div>
          <footer className="comm-files-footer">
            <span>Günlük kullanım burada; servis ekleme, OAuth, ana klasör ve bölüm atamaları Bağlantılar & Depolama bölümünde kalır.</span>
            <button type="button" className="secondary" onClick={() => openModule?.("depolama", { tabKey: "depolama-kaynaklar" })}>Bağlantılar & Depolama</button>
          </footer>
        </section>
      )}
    </div>
  );
}
