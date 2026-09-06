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
  setMailAccountDefaults,
  startGoogleMailOAuth,
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

const HAKAN_DIRECT_ACCOUNTS = [
  {
    key: "HAKAN_MAIN",
    title: "Hakan Emprime Ana Mail",
    providerType: "MICROSOFT_365",
    accountType: "PERSONAL",
    emailAddress: "hkngursu@hotmail.com",
    displayName: "Hakan Emprime",
    departmentCode: "YONETIM",
    isDefaultSend: true,
    isDefaultReceive: true,
  },
  {
    key: "DESEN",
    title: "Desen Maili",
    providerType: "GMAIL",
    accountType: "DEPARTMENT",
    emailAddress: "hkndesen@gmail.com",
    displayName: "Hakan Emprime Desen",
    departmentCode: "DESEN",
    isDefaultSend: false,
    isDefaultReceive: false,
  },
];

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
  const [draftForm, setDraftForm] = useState({ to: "", cc: "", bcc: "", subject: "", bodyText: "", replyToMessageId: "" });
  const [composeOpen, setComposeOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");

  const activeCompanyName = activeMainCompany?.name || activeMainCompany?.ad || activeMainCompany?.slug || "Aktif Firma";
  const activeCompanyKey = String(activeMainCompany?.slug || activeCompanyName || "").toLocaleLowerCase("tr-TR");
  const showHakanDirectAccounts = /hakan|mecit/.test(activeCompanyKey);
  const selectedAccount = useMemo(
    () => accounts.find((row) => String(row.id) === String(selectedAccountId)) || null,
    [accounts, selectedAccountId],
  );
  const selectedProviderRuntime = useMemo(
    () => providers.find((row) => row.provider === requestForm.providerType) || null,
    [providers, requestForm.providerType],
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
    const sourceNames = ["Mail özeti", "Sağlayıcı durumu", "Posta kutuları", "Firma dosyaları"];
    const failedSources = results
      .map((row, index) => row.status === "rejected" ? sourceNames[index] : "")
      .filter(Boolean);
    const schemaPending = results[0].status === "fulfilled" && results[0].value?.schemaReady === false;
    setNotice(schemaPending
      ? "Mail Core veritabanı kurulumu bekliyor. Ekran önizleme modunda; mail bağlantısı ve gönderim 0050 tamamlanınca açılacak."
      : failedSources.length ? `Hazır olmayan kaynak: ${failedSources.join(", ")}. Diğer bilgiler gösteriliyor.` : "");
    setLoading(false);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mailConnected") === "1") {
      const provider = String(params.get("mailProvider") || "").toUpperCase();
      setNotice(provider === "GMAIL" ? "Google / Gmail posta kutusu bağlantısı doğrulandı." : "Microsoft posta kutusu bağlantısı doğrulandı.");
    }
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
        const params = activeTab === "mail-yanit-bekleyen"
          ? { awaitingReply: 1, take: 120 }
          : { direction: activeTab === "mail-gonderilen" ? "OUTGOING" : "INCOMING", take: 120 };
        const rows = await listMailMessages(selectedAccountId, params);
        if (!cancelled) {
          const list = safeArray(rows);
          setMessages(list);
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
      setNotice("Hesap talebi oluşturuldu. İlgili firma sahibi / işveren onayı bekleniyor.");
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
        replyToMessageId: draftForm.replyToMessageId || undefined,
        subject: draftForm.subject,
        bodyText: draftForm.bodyText,
        recipients: {
          to: draftForm.to.split(/[;,]/).map((email) => email.trim()).filter(Boolean),
          cc: draftForm.cc.split(/[;,]/).map((email) => email.trim()).filter(Boolean),
          bcc: draftForm.bcc.split(/[;,]/).map((email) => email.trim()).filter(Boolean),
        },
      });
      setDraftForm({ to: "", cc: "", bcc: "", subject: "", bodyText: "", replyToMessageId: "" });
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

  async function addAndConnectPreset(preset) {
    setLoading(true);
    try {
      const runtime = providers.find((row) => String(row.provider || "").toUpperCase() === preset.providerType);
      if (!runtime) throw new Error("Mail sağlayıcı durumu alınamadı. Worker /mail/providers bağlantısı hazır değil.");
      if (runtime.adapterReady === false) throw new Error(runtime.reason || `${providerLabel(preset.providerType)} adapterı hazır değil.`);
      if (runtime.configured === false) throw new Error(runtime.reason || `${providerLabel(preset.providerType)} OAuth production ayarı eksik.`);

      let account = accounts.find((row) => String(row.email_address || row.emailAddress || "").trim().toLowerCase() === preset.emailAddress.toLowerCase()) || null;
      let accountId = account?.id || "";
      if (!accountId) {
        const created = await requestMailAccount(preset);
        accountId = created?.accountId || "";
        if (!accountId) throw new Error("Mail hesabı kaydı oluşturulamadı.");
        if (preset.isDefaultSend || preset.isDefaultReceive) {
          await setMailAccountDefaults(accountId, {
            isDefaultSend: Boolean(preset.isDefaultSend),
            isDefaultReceive: Boolean(preset.isDefaultReceive),
          });
        }
      }

      const startOAuth = preset.providerType === "GMAIL" ? startGoogleMailOAuth : startMicrosoftMailOAuth;
      const result = await startOAuth(accountId);
      if (!result?.authorizeUrl) throw new Error("OAuth giriş adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail hesabı doğrudan eklenemedi."}`);
      setLoading(false);
    }
  }

  async function connectSelectedAccount() {
    if (!selectedAccountId || !selectedAccount) return;
    const provider = String(selectedAccount.provider_type || selectedAccount.providerType || "").toUpperCase();
    const startOAuth = provider === "GMAIL"
      ? startGoogleMailOAuth
      : provider === "MICROSOFT_365"
        ? startMicrosoftMailOAuth
        : null;
    if (!startOAuth) {
      setNotice("Hata: Bu posta sağlayıcısı için etkileşimli bağlantı henüz aktif değil.");
      return;
    }
    setLoading(true);
    try {
      const result = await startOAuth(selectedAccountId);
      if (!result?.authorizeUrl) throw new Error("OAuth giriş adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice(`Hata: ${error?.message || "Mail hesabı bağlantısı başlatılamadı."}`);
      setLoading(false);
    }
  }

  function openReply() {
    if (!selectedMessage) return;
    const sender = selectedMessage.sender_email || selectedMessage.senderEmail || "";
    const subject = String(selectedMessage.subject || "").trim();
    setDraftForm({
      to: sender,
      cc: "",
      bcc: "",
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject || "(Konu yok)"}`,
      bodyText: "",
      replyToMessageId: selectedMessage.id || "",
    });
    setComposeOpen(true);
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
      const providerName = providerLabel(selectedAccount?.provider_type || selectedAccount?.providerType);
      setNotice(result?.status === "PROVIDER_ACCEPTED"
        ? `${providerName} gönderim isteğini kabul etti. Bu durum teslim edildi anlamına gelmez.`
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
  const baseMessageRows = activeTab === "mail-taslaklar" ? visibleDrafts : messages;
  const messageNeedle = messageSearch.trim().toLocaleLowerCase("tr-TR");
  const messageRows = messageNeedle
    ? baseMessageRows.filter((row) => [
        row.sender_name,
        row.sender_email,
        row.subject,
        row.body_text,
        row.bodyText,
      ].some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(messageNeedle)))
    : baseMessageRows;

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

      <section className="comm-metrics" aria-label="Mail merkezi durum özeti">
        <div><span>Okunmamış</span><b>{overview?.unreadCount ?? 0}</b></div>
        <div><span>Aktif hesap</span><b>{overview?.activeAccountCount ?? 0}</b></div>
        <div><span>Onay bekleyen</span><b>{overview?.pendingAccountCount ?? 0}</b></div>
        <div><span>Firma dosyası</span><b>{files.length}</b></div>
      </section>

      {requestOpen ? (
        <div className="comm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRequestOpen(false); }}>
        <section className="comm-request-card comm-modal" role="dialog" aria-modal="true" aria-label="Mail hesabı ekleme talebi">
          <div className="comm-section-title"><div><h2>Mail Hesabı Ekle</h2><p>Outlook/Hotmail veya Gmail hesabını seçin; KY ERP sizi doğrudan sağlayıcının güvenli giriş ekranına gönderir.</p></div><button type="button" className="secondary" onClick={() => setRequestOpen(false)}>Kapat</button></div>
          {showHakanDirectAccounts ? <div className="comm-direct-mail-grid">
            {HAKAN_DIRECT_ACCOUNTS.map((preset) => {
              const runtime = providers.find((row) => String(row.provider || "").toUpperCase() === preset.providerType);
              const existing = accounts.find((row) => String(row.email_address || row.emailAddress || "").trim().toLowerCase() === preset.emailAddress.toLowerCase());
              const ready = Boolean(runtime?.adapterReady && runtime?.configured);
              return <article key={preset.key} className="comm-direct-mail-card">
                <div><b>{preset.title}</b><span>{preset.emailAddress}</span><small>{providerLabel(preset.providerType)} · {preset.departmentCode === "DESEN" ? "Desen bölümü" : "Şirket ana maili"}</small></div>
                <button type="button" onClick={() => addAndConnectPreset(preset)} disabled={loading || !ready}>{existing ? "Hesabı Bağla" : "Direkt Ekle & Bağla"}</button>
                {!ready ? <em>{runtime?.reason || "Sağlayıcı production OAuth ayarı henüz doğrulanmadı."}</em> : null}
              </article>;
            })}
          </div> : null}
          <div className="comm-advanced-mail-title"><b>Diğer Mail Hesabı</b><span>Farklı bir hesap eklemek için aşağıdaki gelişmiş formu kullanın.</span></div>
          <form onSubmit={submitAccountRequest}>
            <label>Sağlayıcı<select value={requestForm.providerType} onChange={(e) => setRequestForm((v) => ({ ...v, providerType: e.target.value }))}>
              {(providers.length ? providers : [
                {provider:"MICROSOFT_365",adapterReady:true,configured:false},
                {provider:"GMAIL",adapterReady:false,configured:false},
                {provider:"JMAP",adapterReady:false,configured:false},
                {provider:"IMAP_SMTP",adapterReady:false,configured:false},
              ]).map((row) => <option key={row.provider} value={row.provider} disabled={row.adapterReady===false || row.configured===false}>{providerLabel(row.provider)}{row.adapterReady===false ? " · Yakında" : row.configured===false ? " · OAuth Ayarı Gerekli" : ""}</option>)}
            </select></label>
            <label>Hesap Türü<select value={requestForm.accountType} onChange={(e) => setRequestForm((v) => ({ ...v, accountType: e.target.value }))}><option value="PERSONAL">Kişisel</option><option value="SHARED">Ortak / Shared</option><option value="DEPARTMENT">Bölüm</option></select></label>
            <label>E-posta<input type="email" required value={requestForm.emailAddress} onChange={(e) => setRequestForm((v) => ({ ...v, emailAddress: e.target.value }))} placeholder="muhasebe@firma.com"/></label>
            <label>Görünen Ad<input value={requestForm.displayName} onChange={(e) => setRequestForm((v) => ({ ...v, displayName: e.target.value }))} placeholder="Muhasebe"/></label>
            <label>Bölüm<select value={requestForm.departmentCode} onChange={(e) => setRequestForm((v) => ({ ...v, departmentCode: e.target.value }))}><option value="">Genel</option><option value="MUHASEBE">Muhasebe</option><option value="E_BELGE">e-Belge</option><option value="DESEN">Desen</option><option value="IK">İK</option><option value="YONETIM">Yönetim</option></select></label>
            <button type="submit" disabled={loading || overview?.schemaReady===false || selectedProviderRuntime?.adapterReady===false || selectedProviderRuntime?.configured===false}>Onaya Gönder</button>
            {selectedProviderRuntime && (!selectedProviderRuntime.adapterReady || !selectedProviderRuntime.configured) ? <div className="wide comm-provider-warning">{selectedProviderRuntime.reason || "Bu sağlayıcı henüz bağlantıya hazır değil."}</div> : null}
          </form>
        </section>
        </div>
      ) : null}

      {composeOpen ? (
        <div className="comm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false); }}>
        <section className="comm-compose comm-modal comm-compose-modal" role="dialog" aria-modal="true" aria-label="Yeni mail taslağı">
          <div className="comm-section-title"><div><h2>Yeni Mail Taslağı</h2><p>Bu aşamada yalnız taslak kaydedilir; AI veya ekran otomatik gönderim yapmaz.</p></div><button type="button" className="secondary" onClick={() => setComposeOpen(false)}>Kapat</button></div>
          <form onSubmit={submitDraft}>
            <label>Kimden<select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>{accounts.map((row) => <option key={row.id} value={row.id}>{row.display_name || row.displayName || row.email_address || row.emailAddress}</option>)}</select></label>
            <label>Kime<input value={draftForm.to} onChange={(e) => setDraftForm((v) => ({ ...v, to: e.target.value }))} placeholder="mail@firma.com"/></label>
            <label>CC<input value={draftForm.cc} onChange={(e) => setDraftForm((v) => ({ ...v, cc: e.target.value }))} placeholder="opsiyonel"/></label>
            <label>BCC<input value={draftForm.bcc} onChange={(e) => setDraftForm((v) => ({ ...v, bcc: e.target.value }))} placeholder="opsiyonel"/></label>
            <label className="wide">Konu<input value={draftForm.subject} onChange={(e) => setDraftForm((v) => ({ ...v, subject: e.target.value }))}/></label>
            <label className="wide">Mesaj<textarea rows={10} value={draftForm.bodyText} onChange={(e) => setDraftForm((v) => ({ ...v, bodyText: e.target.value }))}/></label>
            <div className="wide comm-compose-actions"><button type="submit" disabled={loading}>Taslağı Kaydet</button><span>Gönderim yalnız açık kullanıcı işlemiyle yapılır; otomatik gönderim kapalıdır.</span></div>
          </form>
        </section>
        </div>
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
              {["MICROSOFT_365", "GMAIL"].includes(String(selectedAccount.provider_type || selectedAccount.providerType).toUpperCase()) && String(selectedAccount.status || "").toUpperCase() !== "ACTIVE"
                ? <button type="button" onClick={connectSelectedAccount} disabled={loading}>{String(selectedAccount.provider_type || selectedAccount.providerType).toUpperCase() === "GMAIL" ? "Google Hesabını Bağla" : "Microsoft Hesabını Bağla"}</button>
                : null}
              {String(selectedAccount.status || "").toUpperCase() === "ACTIVE"
                ? <button type="button" className="secondary" onClick={syncSelectedMailbox} disabled={loading}>Postayı Senkronize Et</button>
                : null}
            </div> : null}
          </aside>

          <main className="comm-message-list">
            <div className="comm-pane-title comm-list-toolbar"><b>{activeTab === "mail-gonderilen" ? "Gönderilenler" : activeTab === "mail-taslaklar" ? "Taslaklar" : activeTab === "mail-yanit-bekleyen" ? "Yanıt Bekleyenler" : activeTab === "mail-sablonlar" ? "Şablonlar" : "Gelen Kutusu"}</b><div><input className="comm-message-search" type="search" value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Mail ara"/><small>{messageRows.length} kayıt</small></div></div>
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
              <div className="comm-preview-actions">
                {activeTab !== "mail-gonderilen" ? <button type="button" onClick={openReply}>Yanıtla</button> : null}
                <button type="button" className="secondary" onClick={() => setComposeOpen(true)}>Yeni Mail</button>
              </div>
              <div className="comm-body">{selectedMessage.body_text || "Mail gövdesi henüz senkronize edilmemiş."}</div>
              <div className="comm-context-box"><b>KY ERP Bağlamı</b><span>Bu mail için kayıtlı ERP ilişkisi varsa firma / cari / model / desen / fatura bağlamında kullanılır; ilişki yoksa sistem tahmin üretmez.</span><span>File Hub ekleri ayrı kopya üretmeden aynı dosya kimliğiyle ilişkilendirilir.</span></div>
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
