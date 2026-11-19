import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decideMailApproval,
  diagnoseMailAccounts,
  getMailProviders,
  listMailAccounts,
  listMailApprovals,
  requestMailAccount,
  setMailAccountDefaults,
  startGoogleMailOAuth,
  startMicrosoftMailOAuth,
  syncMailAccount,
  updateMailAccountProfile,
} from "../../services/mailApi";
import { useAuth } from "../../context/AuthContext";
import IntegrationFlowSteps from "../modules/common/IntegrationFlowSteps";
import { accountMatchesFilter, mailAccountReadiness, mailProviderReady } from "./mailAccountRules";
import { gmailOAuthFeedback } from "./mailGoogleOAuthFeedback";
import { runGmailSyncBatch } from "./mailGmailSyncBatch";
import "./AdminMailConnections.css";

const PROVIDER_NAMES = {
  MICROSOFT_365: "Microsoft 365 / Outlook / Hotmail",
  GMAIL: "Gmail / Google Workspace",
  JMAP: "JMAP",
  IMAP_SMTP: "IMAP / SMTP",
};
const ACCOUNT_TYPES = [
  { value: "PERSONAL", label: "Kişisel hesap" },
  { value: "SHARED", label: "Ortak posta kutusu" },
  { value: "DEPARTMENT", label: "Bölüm posta kutusu" },
];
const ACCOUNT_STATUS = {
  ACTIVE: "Aktif",
  PENDING: "Onay bekliyor",
  DISCONNECTED: "Bağlantı bekliyor",
  REAUTH_REQUIRED: "Yeniden bağlantı gerekli",
  SUSPENDED: "Askıda",
  REJECTED: "Reddedildi",
};
const INITIAL_FORM = {
  displayName: "", emailAddress: "", providerType: "MICROSOFT_365",
  accountType: "PERSONAL", departmentCode: "",
};
const upper = (value) => String(value || "").trim().toUpperCase();
const isOwner = (role) => ["SUPER_ADMIN", "ADMIN", "COMPANY_ADMIN"].includes(upper(role));
const formatDate = (value) => {
  if (!value) return "Henüz yok";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? String(value) : time.toLocaleString("tr-TR");
};

function StateMark({ ok, children, warning = false }) {
  return <span className={"mail-admin-state " + (ok ? "is-ok" : warning ? "is-warn" : "is-pending")}>
    <span aria-hidden="true" className="mail-admin-state-dot" />{children}
  </span>;
}

export default function AdminMailConnectionsV2({ activeMainCompany, openModule }) {
  const { user } = useAuth();
  const slug = String(activeMainCompany?.slug || "").trim();
  const companyName = activeMainCompany?.name || activeMainCompany?.title || slug || "Firma seçilmedi";
  const canManage = isOwner(user?.role);
  const canInspectRecords = ["SUPER_ADMIN", "ADMIN"].includes(upper(user?.role));
  const [accounts, setAccounts] = useState([]);
  const [loadedSlug, setLoadedSlug] = useState("");
  const loadSequence = useRef(0);
  const [approvals, setApprovals] = useState([]);
  const [providers, setProviders] = useState([]);
  const [tab, setTab] = useState("accounts");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [oauthFeedback, setOauthFeedback] = useState(null);
  const [accountDiagnostics, setAccountDiagnostics] = useState(null);
  const syncStopRequested = useRef(false);
  const [syncBatchRunning, setSyncBatchRunning] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState("");
  const [editing, setEditing] = useState({ displayName: "", departmentCode: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const feedback = gmailOAuthFeedback(params);
    if (!feedback) return;
    setOauthFeedback(feedback);
    const target = new URL(window.location.href);
    for (const key of ["mailProvider","mailConnected","mailError","accountId"]) target.searchParams.delete(key);
    window.history.replaceState({}, "", target.pathname + target.search + target.hash);
  }, []);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!slug) {
      setAccounts([]);setApprovals([]);setProviders([]);setLoadedSlug("");
      setNotice("Hata: E-posta hesaplarını görmek için aktif firma seçin.");
      return;
    }
    setLoading(true);
    const result = await Promise.allSettled([
      listMailAccounts(slug), listMailApprovals(slug), getMailProviders(),
    ]);
    if (sequence !== loadSequence.current) return;
    const errors = result.filter((item) => item.status === "rejected");
    setAccounts(result[0].status === "fulfilled" && Array.isArray(result[0].value) ? result[0].value : []);
    setApprovals(result[1].status === "fulfilled" && Array.isArray(result[1].value) ? result[1].value : []);
    setProviders(result[2].status === "fulfilled" && Array.isArray(result[2].value?.providers) ? result[2].value.providers : []);
    setNotice(errors.length ? "Hata: Firma posta kutularının bazı bilgileri alınamadı. Eksik sonuçları tam bağlantı olarak kabul etmeyin." : "");
    setLoadedSlug(slug);
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    setAccountDiagnostics(null);
    load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  // Firma değiştirilirken eski firmanın posta kutuları bir anlığına bile gösterilmez.
  const shownAccounts = useMemo(() => loadedSlug === slug ? accounts : [], [loadedSlug, slug, accounts]);
  const shownApprovals = useMemo(() => loadedSlug === slug ? approvals : [], [loadedSlug, slug, approvals]);

  const providerState = (type) => providers.find((item) => upper(item.provider) === upper(type)) || null;
  const counts = useMemo(() => ({
    total: shownAccounts.length,
    connected: shownAccounts.filter((a) => Boolean(a.readiness?.oauthConnected)).length,
    ready: shownAccounts.filter((a) => {
      const state = providers.find((item) => upper(item.provider) === upper(a.provider_type));
      return mailAccountReadiness(a, state).ready;
    }).length,
    pending: shownApprovals.filter((a) => upper(a.status) === "PENDING").length,
  }), [shownAccounts, shownApprovals, providers]);
  const visible = useMemo(() => shownAccounts.filter((account) => accountMatchesFilter(account, filter)), [shownAccounts, filter]);
  const availableForNew = providerState(form.providerType);
  const newProviderReady = mailProviderReady(availableForNew);

  async function run(label, task) {
    setLoading(true);setNotice("");
    try {
      await task();
      await load();
      setNotice(label);
      return true;
    } catch (error) {
      setNotice("Hata: " + (error?.message || "İşlem tamamlanamadı."));
      setLoading(false);
      return false;
    }
  }

  async function createAccount(event) {
    event.preventDefault();
    if (!canManage || !newProviderReady) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.emailAddress.trim())) {
      setNotice("Hata: Geçerli bir e-posta adresi yazın.");
      return;
    }
    const done = await run("Posta kutusu talebi kaydedildi. OAuth ve senkronizasyon ayrı adımlardır.", async () => {
      await requestMailAccount({ ...form, displayName: form.displayName.trim(), emailAddress: form.emailAddress.trim().toLowerCase(),
        departmentCode: upper(form.departmentCode), mainCompanySlug: slug });
    });
    if (done) { setForm(INITIAL_FORM);setTab("accounts"); }
  }

  function startEdit(account) {
    setEditingId(account.id);
    setEditing({ displayName: account.display_name || account.email_address || "", departmentCode: account.department_code || "" });
  }

  async function saveProfile(account) {
    const done = await run("Posta kutusunun adı ve bölüm etiketi güncellendi.", async () => {
      await updateMailAccountProfile(account.id, { displayName: editing.displayName.trim(),
        departmentCode: upper(editing.departmentCode), mainCompanySlug: slug });
    });
    if (done) setEditingId("");
  }

  async function inspectAccountRegistry() {
    setLoading(true);setNotice("");setAccountDiagnostics(null);
    try {
      const diagnostics=await diagnoseMailAccounts(slug);
      setAccountDiagnostics(diagnostics);
      setNotice("Salt okunur hesap kayıt denetimi tamamlandı. Hiçbir kayıt taşınmadı veya silinmedi.");
    } catch(error) {
      setNotice("Hata: " + (error?.message || "Kayıt kontrolü tamamlanamadı."));
    } finally { setLoading(false); }
  }

  async function changeDefault(account, type, enabled) {
    const label = type === "isDefaultSend" ? "gönderim" : "alım";
    await run("Firma için varsayılan " + label + " hesabı güncellendi.", async () => {
      await setMailAccountDefaults(account.id, { [type]: enabled, mainCompanySlug: slug });
    });
  }

  async function connect(account) {
    const provider = upper(account.provider_type);
    if (!["MICROSOFT_365", "GMAIL"].includes(provider)) return;
    setLoading(true);setNotice("");
    try {
      const result = provider === "GMAIL"
        ? await startGoogleMailOAuth(account.id, slug)
        : await startMicrosoftMailOAuth(account.id, slug);
      if (!result?.authorizeUrl) throw new Error("Sağlayıcı OAuth bağlantısı alınamadı.");
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      setNotice("Hata: " + (error?.message || "E-posta hesabı bağlantısı başlatılamadı."));
      setLoading(false);
    }
  }

  async function synchronize(account) {
    setLoading(true);setNotice("");
    const gmail = upper(account.provider_type) === "GMAIL";
    syncStopRequested.current = false;
    if (gmail) setSyncBatchRunning(true);
    try {
      if (gmail) {
        const result = await runGmailSyncBatch({
          syncStep: () => syncMailAccount(account.id, slug),
          shouldStop: () => syncStopRequested.current,
          onProgress: ({ steps, maxSteps, processed, completedFolders, totalFolders, lastFolder }) =>
            setNotice(`Gmail arşivi taranıyor: ${steps}/${maxSteps} kontrollü adım, ${processed} mesaj işleme kaydı, ${completedFolders}/${totalFolders} klasör tamamlandı.${lastFolder ? " Son etiket: " + lastFolder : ""}`),
        });
        await load();
        const progress = `${result.steps} adımda ${result.processed} mesaj işleme kaydı; ${result.completedFolders}/${result.totalFolders} klasör tamamlandı.`;
        setNotice(result.reason === "completed"
          ? "Gmail tam senkron sunucu tarafından doğrulandı. " + progress
          : result.reason === "limit"
            ? "Bu kontrollü tarama turu tamamlandı. " + progress + " Kaldığı yerden sürdürmek için Senkronize Et'e bas."
            : result.reason === "cancelled"
              ? "Gmail taraması kullanıcı tarafından durduruldu. İlerleme kaydedildi. " + progress
              : "Gmail taraması güvenli biçimde durduruldu (" + result.reason + "). " + progress + " Hata veya ilerleme durumunu kontrol edin.");
      } else {
        const result = await syncMailAccount(account.id, slug);
        await load();
        setNotice(result?.partial
          ? `Senkronizasyon devam ediyor: ${Number(result.completedFolders || 0)}/${Number(result.totalFolders || 0)} klasör tamamlandı.`
          : "Senkronizasyon isteği tamamlandı. Klasör kanıtları güncellendi.");
      }
    } catch (error) {
      await load();
      setNotice("Hata: " + (error?.message || "Senkronizasyon tamamlanamadı.") + " Önceki başarılı sayfalar korunur.");
    } finally {
      setSyncBatchRunning(false);
      setLoading(false);
    }
  }

  async function decide(approval, decision) {
    const done = await run(decision === "APPROVE" ? "Hesap onayı kaydedildi." : "Hesap talebi reddedildi.", async () => {
      await decideMailApproval(approval.id, decision, "", slug);
    });
    if (done) setTab("approvals");
  }

  return <div className="mail-admin-page">
    <section className="mail-admin-hero">
      <div className="mail-admin-hero-copy">
        <small>AYARLAR & SİSTEM / BAĞLANTILAR / E-POSTA HESAPLARI</small>
        <h2>E-Posta Yönetim Merkezi</h2>
        <p><strong>{companyName}</strong> için hesap ekleme, bölüm atama, onay, OAuth ve klasör senkronizasyonu tek ekrandan yönetilir. Her firmanın hesapları birbirinden ayrıdır.</p>
        <div className="mail-admin-company"><span aria-hidden="true">▣</span> Aktif firma: <strong>{companyName}</strong><span className="mail-admin-company-hint">Firma değişimini KY ERP firma seçiminden yapın.</span></div>
      </div>
      <div className="mail-admin-hero-actions">
        <button className="secondary" type="button" onClick={load} disabled={loading || !slug}>Yenile</button>
        <button type="button" onClick={() => openModule?.("iletisim", { tabKey: "mail-gelen" })}>Mail Merkezini Aç</button>
      </div>
    </section>
    <IntegrationFlowSteps kind="MAIL" stage={counts.ready > 0 ? 3 : counts.connected > 0 ? 2 : 1} />
    {oauthFeedback && <div role="status" className={"mail-admin-notice " + (oauthFeedback.ok ? "ok" : "bad")}>Gmail OAuth — {oauthFeedback.code}: {oauthFeedback.text}</div>}
    {notice && <div role="status" className={"mail-admin-notice " + (notice.startsWith("Hata:") ? "bad" : "ok")}>{notice}</div>}
    {syncBatchRunning && <button type="button" className="secondary" onClick={() => { syncStopRequested.current = true; setNotice("Durdurma istendi. Mevcut küçük senkronizasyon adımı bittikten sonra yeni istek yapılmayacak."); }}>Senkronizasyonu Durdur</button>}
    <div className="mail-admin-stats">
      <div><span>Bu firmanın hesapları</span><strong>{counts.total}</strong><small>Kişisel, ortak ve bölüm</small></div>
      <div><span>OAuth doğrulanan</span><strong>{counts.connected}</strong><small>Bağlantı kanıtı bulunan</small></div>
      <div><span>Tam kullanıma hazır</span><strong>{counts.ready}</strong><small>Onay + OAuth + tam senkron</small></div>
      <div><span>Onay bekleyen</span><strong>{counts.pending}</strong><small>Firma yetkilisi kararı</small></div>
    </div>
    <nav className="mail-admin-tabs" aria-label="E-posta hesap yönetimi">
      <button type="button" className={tab === "accounts" ? "selected" : ""} onClick={() => setTab("accounts")}>Posta Kutuları <span>{counts.total}</span></button>
      {canManage && <button type="button" className={tab === "add" ? "selected" : ""} onClick={() => setTab("add")}>+ Hesap Ekle</button>}
      <button type="button" className={tab === "approvals" ? "selected" : ""} onClick={() => setTab("approvals")}>Onaylar <span>{counts.pending}</span></button>
      <button type="button" className={tab === "providers" ? "selected" : ""} onClick={() => setTab("providers")}>Sağlayıcı Durumu</button>
    </nav>
    {tab === "accounts" && <section className="mail-admin-card">
      <div className="mail-admin-card-head">
        <div><h3>Firma Posta Kutuları</h3><p>Bağlı hesapları düzenleyin, varsayılan gönderim/alım hesabını seçin; eski e-postalar korunur.</p></div>
        <div className="mail-admin-toolbar">
          <input aria-label="Posta kutusu ara" placeholder="Hesap veya bölüm ara..." value={filter} onChange={(event) => setFilter(event.target.value)} />
          {canManage && <button type="button" onClick={() => setTab("add")} disabled={!slug}>+ Yeni Hesap</button>}
        </div>
      </div>
      {!visible.length ? <div className="mail-admin-empty"><b>{shownAccounts.length ? "Aramaya uygun hesap bulunamadı." : "Bu firma kapsamında görüntülenen posta kutusu yok."}</b>
          <span>Bu, geçmiş hesapların silindiğini kanıtlamaz. Aynı hesabı yeniden oluşturmadan kayıt kapsamını kontrol edin.</span>
          {!shownAccounts.length && canInspectRecords && <button type="button" className="secondary" disabled={loading || !slug} onClick={inspectAccountRegistry}>Hesap Kayıtlarını Kontrol Et</button>}
        </div> :
        <div className="mail-admin-account-list">{visible.map((account) => {
          const provider = upper(account.provider_type), available = providerState(provider);
          const state = mailAccountReadiness(account, available), active = upper(account.status);
          const defaultSend = Boolean(account.is_default_send), defaultReceive = Boolean(account.is_default_receive);
          const editingThis = editingId === account.id;
          return <article className="mail-admin-account" key={account.id}>
            <div className="mail-admin-account-main">
              <div className="mail-admin-avatar" aria-hidden="true">{(account.display_name || account.email_address || "M").charAt(0).toLocaleUpperCase("tr-TR")}</div>
              <div className="mail-admin-identity">
                <div className="mail-admin-account-title"><strong>{account.display_name || account.email_address}</strong><span className={"mail-admin-status " + (state.ready ? "ready" : "waiting")}>{state.ready ? "Hazır" : ACCOUNT_STATUS[active] || "Kontrol gerekli"}</span></div>
                <span className="mail-admin-address">{account.email_address}</span>
                <div className="mail-admin-meta"><span>{PROVIDER_NAMES[provider] || provider}</span><span>{ACCOUNT_TYPES.find((item) => item.value === account.account_type)?.label || account.account_type}</span><span>Bölüm: {account.department_code || "Atanmamış"}</span></div>
                <div className="mail-admin-default-flags">{defaultSend && <span>Varsayılan gönderim</span>}{defaultReceive && <span>Varsayılan alım</span>}</div>
              </div>
              <div className="mail-admin-account-actions">
                {canManage && <button type="button" className="secondary" disabled={loading} onClick={() => editingThis ? setEditingId("") : startEdit(account)}>{editingThis ? "Kapat" : "Düzenle"}</button>}
                {state.approved && state.configured && ["MICROSOFT_365", "GMAIL"].includes(provider) && (!state.oauth || provider === "GMAIL") && <button type="button" disabled={loading} onClick={() => connect(account)}>{active === "REAUTH_REQUIRED" ? "Yeniden Bağla" : state.oauth ? "Google Yetkisini Yenile" : "Hesabı Bağla"}</button>}
                {state.oauth && state.configured && ["MICROSOFT_365", "GMAIL"].includes(provider) && <button type="button" className="secondary" disabled={loading} onClick={() => synchronize(account)}>Senkronize Et</button>}
              </div>
            </div>
            <div className="mail-admin-health">
              <StateMark ok={state.approved}>Firma onayı: {state.approved ? "Onaylandı" : "Bekliyor"}</StateMark>
              <StateMark ok={state.oauth && active !== "REAUTH_REQUIRED"}>OAuth: {active === "REAUTH_REQUIRED" ? "Yeniden onay gerekli" : state.oauth ? "Kayıtlı bağlantı" : "Bekliyor"}</StateMark>
              <StateMark ok={state.sync}>Tam senkron: {state.sync ? "Tamam" : "Bekliyor"} ({state.completed}/{state.enabled})</StateMark>
              <StateMark ok={state.configured} warning={!state.configured}>Sağlayıcı: {state.configured ? "Hazır" : "Ayar gerekli"}</StateMark>
              <span className="mail-admin-last-sync">Son tam işlem: {formatDate(account.readiness?.lastSyncSuccessAt)}</span>
            </div>
            {!state.configured && <div className="mail-admin-account-warning">{available?.reason || "Bu sağlayıcı için canlı OAuth/adapter ayarı hazır değil."} Mevcut hesap ve arşiv silinmedi; bağlantı ve yeni senkron kapalı.</div>}
            {editingThis && <div className="mail-admin-edit-panel">
              <div><label htmlFor={"display-" + account.id}>Görünen hesap adı</label><input id={"display-" + account.id} maxLength={120} value={editing.displayName} onChange={(event) => setEditing((value) => ({ ...value, displayName: event.target.value }))} /></div>
              <div><label htmlFor={"department-" + account.id}>Bölüm kodu (isteğe bağlı)</label><input id={"department-" + account.id} maxLength={40} placeholder="Örn. MUHASEBE" value={editing.departmentCode} onChange={(event) => setEditing((value) => ({ ...value, departmentCode: event.target.value }))} /></div>
              <div className="mail-admin-edit-note">Mail adresi, sağlayıcı ve hesap türü güvenlik nedeniyle burada değiştirilmez. Yeni kimlik için yeni hesap eklenir.</div>
              <button type="button" disabled={loading || !editing.displayName.trim()} onClick={() => saveProfile(account)}>Bilgileri Kaydet</button>
              <button type="button" className="secondary" disabled={loading} onClick={() => setEditingId("")}>Vazgeç</button>
              <div className="mail-admin-default-actions">
                <b>Firma varsayılanları</b>
                <button type="button" className="secondary" disabled={loading || (!state.configured || !state.oauth || !state.approved) && !defaultSend} onClick={() => changeDefault(account, "isDefaultSend", !defaultSend)}>{defaultSend ? "Gönderim varsayılanını kaldır" : "Gönderim varsayılanı yap"}</button>
                <button type="button" className="secondary" disabled={loading || (!state.configured || !state.oauth || !state.approved) && !defaultReceive} onClick={() => changeDefault(account, "isDefaultReceive", !defaultReceive)}>{defaultReceive ? "Alım varsayılanını kaldır" : "Alım varsayılanı yap"}</button>
              </div>
            </div>}
          </article>;
        })}</div>}
    </section>}
    {tab === "accounts" && accountDiagnostics && <section className="mail-admin-card" aria-label="Salt okunur posta kutusu denetimi">
      <div className="mail-admin-card-head"><div><h3>Posta Kutusu Kayıt Denetimi</h3>
        <p>Yalnız veritabanı kayıt sayılarını okur; başka firmadan hesap taşımaz veya yeni kayıt açmaz.</p></div></div>
      <div style={{padding:"14px 18px",fontSize:"12px"}}>
        <p>Firma kapsamı: <strong>{accountDiagnostics.requestedTenant}</strong>. Toplam hesap: <strong>{accountDiagnostics.currentTenantCount}</strong>. Gmail: <strong>{accountDiagnostics.currentTenantGmailCount}</strong>. Yeniden onay gereken: <strong>{accountDiagnostics.currentTenantReconnectCount}</strong>.</p>
        {(accountDiagnostics.gmailTenants || []).length ? <p>Gmail kaydı bulunan firma kapsamları: {accountDiagnostics.gmailTenants.map(item => item.tenant + " (" + item.count + ")").join(" · ")}</p> : <p>Gmail kaydı görünmüyor. Canlı D1 ve yedek karşılaştırması yapılmadan yeni hesap açmayın.</p>}
      </div>
    </section>}
    {tab === "add" && canManage && <section className="mail-admin-card">
      <div className="mail-admin-card-head"><div><h3>Yeni Posta Kutusu Ekle</h3><p>Yalnız <strong>{companyName}</strong> firmasına eklenir. Bağlantı ve posta gönderimi kendiliğinden başlamaz.</p></div></div>
      <form className="mail-admin-new-form" onSubmit={createAccount}>
        <div className="mail-admin-field"><label htmlFor="mail-new-name">Hesap adı</label><input id="mail-new-name" required maxLength={120} placeholder="Örn. Firma Muhasebe" value={form.displayName} onChange={(event) => setForm((v) => ({ ...v, displayName: event.target.value }))} /></div>
        <div className="mail-admin-field"><label htmlFor="mail-new-email">E-posta adresi</label><input id="mail-new-email" required type="email" placeholder="ornek@firma.com" value={form.emailAddress} onChange={(event) => setForm((v) => ({ ...v, emailAddress: event.target.value }))} /></div>
        <div className="mail-admin-field"><label htmlFor="mail-new-provider">Sağlayıcı</label><select id="mail-new-provider" value={form.providerType} onChange={(event) => setForm((v) => ({ ...v, providerType: event.target.value }))}>{Object.entries(PROVIDER_NAMES).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></div>
        <div className="mail-admin-field"><label htmlFor="mail-new-type">Posta kutusu türü</label><select id="mail-new-type" value={form.accountType} onChange={(event) => setForm((v) => ({ ...v, accountType: event.target.value }))}>{ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="mail-admin-field"><label htmlFor="mail-new-dept">Bölüm kodu (isteğe bağlı)</label><input id="mail-new-dept" maxLength={40} placeholder="Örn. DESEN" value={form.departmentCode} onChange={(event) => setForm((v) => ({ ...v, departmentCode: event.target.value }))} /></div>
        <div className="mail-admin-form-help">
          <StateMark ok={newProviderReady} warning={!newProviderReady}>{newProviderReady ? "Sağlayıcı kurulu ve hazır" : "Sağlayıcı henüz hazır değil"}</StateMark>
          {!newProviderReady && <p>{availableForNew?.reason || "Sağlayıcı bilgisi alınamadı. Yeni bağlantı kurulmaz."}</p>}
          <p>Önce hesap talebi ve firma onayı; sonra sağlayıcının kendi OAuth ekranı; en son klasör senkronizasyonu. Şifre/token girilmez.</p>
        </div>
        <div className="mail-admin-form-actions"><button type="submit" disabled={loading || !slug || !newProviderReady}>Hesap Talebini Oluştur</button><button type="button" className="secondary" disabled={loading} onClick={() => setTab("accounts")}>İptal</button></div>
      </form>
    </section>}
    {tab === "approvals" && <section className="mail-admin-card">
      <div className="mail-admin-card-head"><div><h3>Posta Kutusu Onayları</h3><p>Yeni bağlantılar, hesap sahibinin OAuth izni ve yetkili firma onayı olmadan kullanılmaz.</p></div></div>
      {shownApprovals.filter((row) => upper(row.status) === "PENDING").length === 0 ? <div className="mail-admin-empty compact">Bekleyen posta kutusu onayı yok.</div> :
        <div className="mail-admin-approvals">{shownApprovals.filter((row) => upper(row.status) === "PENDING").map((row) => <div className="approval" key={row.id}><div><b>{row.display_name || row.email_address}</b><span>{row.email_address} · {PROVIDER_NAMES[upper(row.provider_type)] || row.provider_type} · {row.department_code || "Genel"}</span><small>Talep sahibi: {row.requested_by_name || "—"}. Kararı yetkili firma sahibi / Süper Yönetici verir.</small></div><div className="actions">{canManage ? <><button type="button" disabled={loading} onClick={() => decide(row, "APPROVE")}>Onayla</button><button type="button" className="danger" disabled={loading} onClick={() => decide(row, "REJECT")}>Reddet</button></> : <span>Yetkili onayı bekleniyor</span>}</div></div>)}</div>}
    </section>}
    {tab === "providers" && <section className="mail-admin-card">
      <div className="mail-admin-card-head"><div><h3>Sağlayıcı ve Bağlantı Durumu</h3><p>Katalog bütün firmalar için ortaktır; her firmanın hesap bağlantıları özeldir.</p></div></div>
      <div className="mail-admin-provider-list">{Object.entries(PROVIDER_NAMES).map(([key, label]) => {
        const provider = providerState(key), ready = Boolean(provider?.configured && provider?.adapterReady);
        return <div className="mail-admin-provider" key={key}><div><strong>{label}</strong><small>{provider?.reason || (ready ? "OAuth ve adapter yapılandırıldı." : "Bu sağlayıcı için canlı bağlantı desteği hazır değil.")}</small></div><StateMark ok={ready}>{ready ? "Hazır" : "Kurulum gerekli"}</StateMark></div>;
      })}</div>
      <div className="mail-admin-provider-note">Sağlayıcı durumları sunucudan okunur. Bir hesabın eski kaydının “Aktif” görünmesi, sağlayıcı adapterının bugün çalıştığı anlamına gelmez.</div>
    </section>}
  </div>;
}
