import { useCallback, useEffect, useMemo, useState } from "react";
import {
  decideMailApproval,
  getMailProviders,
  listMailAccounts,
  listMailApprovals,
  requestMailAccount,
  setMailAccountDefaults,
  startGoogleMailOAuth,
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
const accountTypeLabel = (value) => ({ PERSONAL: "Kişisel", SHARED: "Ortak Posta Kutusu", DEPARTMENT: "Bölüm Posta Kutusu" }[String(value || "").toUpperCase()] || value || "—");
const statusLabel = (value) => ({ ACTIVE:"Aktif",PENDING:"Onay Bekliyor",DISCONNECTED:"Bağlantı Bekliyor",REAUTH_REQUIRED:"Yeniden Bağlanmalı",SUSPENDED:"Askıda",APPROVED:"Onaylandı",REJECTED:"Reddedildi" }[String(value || "").toUpperCase()] || value || "—");
const ownerRole = (value) => ["SUPER_ADMIN","ADMIN"].includes(String(value || "").toUpperCase());
const companyOwnerRole = (value) => String(value || "").toUpperCase() === "COMPANY_ADMIN";
const norm = (value) => String(value || "").trim().toLowerCase();

const HAKAN_PRESETS = [
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
    note: "Firma ana gönderme ve alma hesabı.",
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
    note: "DESEN bölümü posta kutusu. Bölüm hesabı olduğu için çift onay uygulanır.",
  },
];

export default function AdminMailConnectionsV2({ activeMainCompany, openModule }) {
  const { user } = useAuth();
  const [accounts,setAccounts] = useState([]);
  const [approvals,setApprovals] = useState([]);
  const [providers,setProviders] = useState([]);
  const [loading,setLoading] = useState(false);
  const [notice,setNotice] = useState("");
  const slug = String(activeMainCompany?.slug || "").trim();
  const companyName = activeMainCompany?.name || activeMainCompany?.title || slug || "Aktif Firma";
  const role = String(user?.role || "").toUpperCase();
  const appOwner = ownerRole(role), companyOwner = companyOwnerRole(role);
  const elevated = appOwner || companyOwner;
  const isHakan = /hakan|mecit/.test(norm(`${slug} ${companyName}`));

  const load = useCallback(async () => {
    if (!slug) { setNotice("Hata: E-posta hesaplarını yönetmek için aktif firma seçilmelidir."); return; }
    setLoading(true);
    const rows = await Promise.allSettled([listMailAccounts(),listMailApprovals(),getMailProviders()]);
    if(rows[0].status==="fulfilled")setAccounts(Array.isArray(rows[0].value)?rows[0].value:[]);
    if(rows[1].status==="fulfilled")setApprovals(Array.isArray(rows[1].value)?rows[1].value:[]);
    if(rows[2].status==="fulfilled")setProviders(Array.isArray(rows[2].value?.providers)?rows[2].value.providers:[]);
    const failed=rows.filter((row)=>row.status==="rejected");
    setNotice(failed.length?"Bazı mail yönetim bilgileri alınamadı. Erişilebilen kayıtlar gösteriliyor.":"");
    setLoading(false);
  },[slug]);
  useEffect(()=>{load();},[load]);

  const stats=useMemo(()=>({
    total:accounts.length,
    active:accounts.filter((row)=>String(row.status||"").toUpperCase()==="ACTIVE").length,
    pending:accounts.filter((row)=>String(row.approval_status||row.approvalStatus||"").toUpperCase()==="PENDING").length,
    connected:accounts.filter((row)=>Boolean(row.provider_connected??row.providerConnected)).length,
  }),[accounts]);
  const providerState=(provider)=>providers.find((row)=>String(row.provider||"").toUpperCase()===String(provider||"").toUpperCase())||null;
  const accountForPreset=(preset)=>accounts.find((row)=>norm(row.email_address||row.emailAddress)===norm(preset.emailAddress))||null;

  async function createPreset(preset){
    setLoading(true);setNotice("");
    try{
      const state=providerState(preset.providerType);
      if(state && (!state.adapterReady || !state.configured)) throw new Error(state.reason || `${providerLabel(preset.providerType)} bağlantı ayarı hazır değil.`);
      const result=await requestMailAccount(preset);
      if(result?.accountId && elevated && (preset.isDefaultSend || preset.isDefaultReceive)){
        await setMailAccountDefaults(result.accountId,{isDefaultSend:preset.isDefaultSend,isDefaultReceive:preset.isDefaultReceive});
      }
      setNotice(`${preset.title} talebi oluşturuldu. ${result?.approvalPolicy === "COMPANY_OWNER_AND_APP_OWNER" ? "Firma Sahibi + Uygulama Sahibi onayı gerekiyor." : "Firma Sahibi onayı gerekiyor."}`);
      await load();
    }catch(error){setNotice(`Hata: ${error?.message || "Mail hesabı talebi oluşturulamadı."}`);setLoading(false);}
  }
  async function connect(account){
    setLoading(true);setNotice("");
    try{
      const provider=String(account.provider_type||account.providerType||"").toUpperCase();
      const result=provider==="GMAIL"?await startGoogleMailOAuth(account.id):await startMicrosoftMailOAuth(account.id);
      if(!result?.authorizeUrl)throw new Error("OAuth giriş adresi alınamadı.");
      window.location.assign(result.authorizeUrl);
    }catch(error){setNotice(`Hata: ${error?.message || "Mail hesabı bağlantısı başlatılamadı."}`);setLoading(false);}
  }
  async function sync(account){
    setLoading(true);setNotice("");
    try{const result=await syncMailAccount(account.id);const count=(Array.isArray(result?.folders)?result.folders:[]).reduce((sum,row)=>sum+Number(row.count||0),0);setNotice(result?.partial?`Senkronizasyon kısmi tamamlandı. ${count} kayıt işlendi.`:`Senkronizasyon tamamlandı. ${count} kayıt işlendi.`);await load();}
    catch(error){setNotice(`Hata: ${error?.message || "Senkronizasyon tamamlanamadı."}`);setLoading(false);}
  }
  async function defaults(account,send,receive){
    setLoading(true);setNotice("");
    try{await setMailAccountDefaults(account.id,{isDefaultSend:send,isDefaultReceive:receive});setNotice("Varsayılan mail hesabı ayarı güncellendi.");await load();}
    catch(error){setNotice(`Hata: ${error?.message || "Varsayılan hesap ayarı güncellenemedi."}`);setLoading(false);}
  }
  async function decide(request,decision){
    setLoading(true);setNotice("");
    try{await decideMailApproval(request.id,decision);setNotice(decision==="APPROVE"?"Mail bağlantı onayı kaydedildi.":"Mail bağlantı talebi reddedildi.");await load();}
    catch(error){setNotice(`Hata: ${error?.message || "Onay işlemi tamamlanamadı."}`);setLoading(false);}
  }

  return <div className="mail-admin-page">
    <section className="mail-admin-hero"><div><small>BAĞLANTILAR & DEPOLAMA / E-POSTA HESAPLARI</small><h2>Kurumsal Mail Bağlantıları</h2><p><b>{companyName}</b> için Outlook / Microsoft 365 ve Gmail posta kutuları burada bağlanır, onaylanır ve varsayılanları seçilir. Günlük kullanım <b>Mail & Dosyalar</b> bölümündedir.</p></div><button type="button" onClick={()=>openModule?.("iletisim",{tabKey:"mail-gelen"})}>Mail Merkezini Aç</button></section>
    {notice?<div className={`mail-admin-notice ${notice.startsWith("Hata:")?"bad":"ok"}`}>{notice}</div>:null}
    <section className="mail-admin-stats"><div><span>Toplam Hesap</span><strong>{stats.total}</strong><small>Kişisel + bölüm</small></div><div><span>Aktif</span><strong>{stats.active}</strong><small>Kullanıma hazır</small></div><div><span>Onay Bekleyen</span><strong>{stats.pending}</strong><small>Firma / uygulama sahibi</small></div><div><span>OAuth Bağlı</span><strong>{stats.connected}</strong><small>Provider doğrulandı</small></div></section>

    {isHakan?<section className="mail-admin-card"><div className="mail-admin-card-head"><div><h3>Hakan Emprime Hazır Mail Düzeni</h3><p>Firma ana maili ve DESEN posta kutusu sabit profille tanımlanır; yanlış bölüm/provider seçimi engellenir.</p></div></div><div className="mail-admin-approvals">
      {HAKAN_PRESETS.map((preset)=>{const account=accountForPreset(preset),state=providerState(preset.providerType),connected=Boolean(account?.provider_connected??account?.providerConnected),status=String(account?.status||"").toUpperCase();return <div className="approval" key={preset.key}><div><b>{preset.title}</b><span>{preset.emailAddress} · {providerLabel(preset.providerType)} · {accountTypeLabel(preset.accountType)} · {preset.departmentCode}</span><small>{preset.note} {state&&!state.configured?` ${state.reason||"OAuth ayarı gerekli."}`:""}</small></div><div className="actions">{!account?<button type="button" onClick={()=>createPreset(preset)} disabled={loading||state?.adapterReady===false||state?.configured===false}>Talebi Oluştur</button>:<><span>{statusLabel(status)} · {connected?"OAuth bağlı":"OAuth bekliyor"}</span>{!connected&&["MICROSOFT_365","GMAIL"].includes(preset.providerType)?<button type="button" onClick={()=>connect(account)} disabled={loading}>Hesabı Bağla</button>:null}{connected?<button type="button" className="secondary" onClick={()=>sync(account)} disabled={loading}>Senkronize Et</button>:null}{elevated&&preset.key==="HAKAN_MAIN"?<button type="button" className="secondary" onClick={()=>defaults(account,true,true)} disabled={loading}>Ana Gönder/Al</button>:null}</>}</div></div>;})}
    </div></section>:null}

    <section className="mail-admin-card"><div className="mail-admin-card-head"><div><h3>Posta Kutuları</h3><p>Hesap bağlantısı, OAuth durumu ve senkronizasyon sağlığı.</p></div><button type="button" className="secondary" disabled={loading} onClick={load}>Yenile</button></div>{accounts.length?<div className="mail-admin-table"><div className="head"><span>Hesap</span><span>Tür</span><span>Sağlayıcı</span><span>Durum</span><span>İşlem</span></div>{accounts.map((row)=>{const provider=String(row.provider_type||row.providerType||"").toUpperCase(),status=String(row.status||"").toUpperCase(),connected=Boolean(row.provider_connected??row.providerConnected);return <div className="row" key={row.id}><span><b>{row.display_name||row.displayName||row.email_address||row.emailAddress}</b><small>{row.email_address||row.emailAddress}{row.is_default_send?" · Varsayılan gönderim":""}{row.is_default_receive?" · Varsayılan alım":""}</small></span><span>{accountTypeLabel(row.account_type||row.accountType)}</span><span>{providerLabel(provider)}</span><span><b>{statusLabel(status)}</b><small>{connected?"OAuth bağlı":"OAuth bekliyor"}</small></span><span className="actions">{["MICROSOFT_365","GMAIL"].includes(provider)&&!connected?<button type="button" onClick={()=>connect(row)} disabled={loading}>Hesabı Bağla</button>:null}{connected?<button type="button" className="secondary" onClick={()=>sync(row)} disabled={loading}>Senkronize Et</button>:null}</span></div>;})}</div>:<div className="mail-admin-empty"><b>Henüz mail hesabı yok.</b><span>Hakan Emprime hazır profillerinden veya Mail & Dosyalar bölümünden hesap talebi oluşturabilirsiniz.</span></div>}</section>

    <section className="mail-admin-card"><div className="mail-admin-card-head"><div><h3>Bekleyen Mail Onayları</h3><p>Bölüm/ortak hesaplarda Firma Sahibi → Uygulama Sahibi sıralı onay uygulanır.</p></div></div>{approvals.filter((row)=>String(row.status||"").toUpperCase()==="PENDING").length?<div className="mail-admin-approvals">{approvals.filter((row)=>String(row.status||"").toUpperCase()==="PENDING").map((row)=>{const companyStepPending=row.approval_policy==="COMPANY_OWNER_AND_APP_OWNER"&&Number(row.pending_steps||0)>1,appOwnerBlocked=appOwner&&companyStepPending;return <div className="approval" key={row.id}><div><b>{row.display_name||row.email_address||"Mail hesabı"}</b><span>{providerLabel(row.provider_type)} · {accountTypeLabel(row.account_type)} · {row.approval_policy==="COMPANY_OWNER_AND_APP_OWNER"?"Çift Onay":"Firma Sahibi Onayı"}</span>{appOwnerBlocked?<small>Önce Firma Sahibi onayı bekleniyor.</small>:null}</div><div className="actions">{(appOwner||companyOwner)?<><button type="button" onClick={()=>decide(row,"APPROVE")} disabled={loading||appOwnerBlocked}>{appOwnerBlocked?"Firma Sahibi Bekleniyor":"Onayla"}</button><button type="button" className="danger" onClick={()=>decide(row,"REJECT")} disabled={loading||appOwnerBlocked}>Reddet</button></>:<span>Yetkili onayı bekleniyor</span>}</div></div>;})}</div>:<div className="mail-admin-empty compact">Bekleyen mail bağlantı onayı yok.</div>}</section>
  </div>;
}
