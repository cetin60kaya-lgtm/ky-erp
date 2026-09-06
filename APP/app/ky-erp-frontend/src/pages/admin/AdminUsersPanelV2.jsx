import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  activateUser,
  createUserComplete,
  deactivateUser,
  getDeliveryCapabilities,
  getMainCompanies,
  getUserPermissions,
  listActiveSessions,
  listLoginSecurityPolicies,
  listSecurityAuditLog,
  listSessionHistory,
  listUsers,
  resetUserPassword,
  revokeAllUserSessions,
  revokeSession,
  startUserEmailVerification,
  updateLoginSecurityPolicy,
  updateUser,
  updateUserPermissions,
  verifyUserEmail,
} from "../../services/adminApi";
import { saveIkUserScope } from "../../services/ikPersonnelControlApi";
import "./AdminUsersPanelV2.css";

const MODULE_KEYS=["DASHBOARD","MUHASEBE","FIRMA_CARI","BELGE_ISLEM","KDV","CEK_ODEME","DESEN","IMALAT","BOYAHANE","IK","ISNET","MAIL","STORAGE_ADMIN","ASISTAN","ADMIN","RAPORLAR"];
const MODULE_LABELS={DASHBOARD:"Yönetim Merkezi",MUHASEBE:"Muhasebe",FIRMA_CARI:"Firma / Cari",BELGE_ISLEM:"Belge İşlemleri",KDV:"KDV",CEK_ODEME:"Çek / Ödeme",DESEN:"Desen",IMALAT:"İmalat",BOYAHANE:"Boyahane",IK:"İK",ISNET:"e-Belge / İşNet",MAIL:"Mail & Dosyalar",STORAGE_ADMIN:"Bağlantılar & Depolama",ASISTAN:"KY ERP Asistan",ADMIN:"Yönetim",RAPORLAR:"Raporlar"};
const ROLE_LABELS={SUPER_ADMIN:"Süper Yönetici",ADMIN:"Süper Yönetici",COMPANY_ADMIN:"Firma Sahibi / İşveren",MUHASEBE:"Muhasebe Kullanıcısı",DESEN:"Desen Kullanıcısı",IMALAT:"İmalat Kullanıcısı",BOYAHANE:"Boyahane Kullanıcısı",IK:"İK Kullanıcısı",DENETIM:"Denetim Kullanıcısı",VIEWER:"Özel Yetkili Kullanıcı"};
const MANAGED_ROLES=["COMPANY_ADMIN","MUHASEBE","DESEN","IMALAT","BOYAHANE","IK","DENETIM","VIEWER"];
const OWNER_ROLES=new Set(["SUPER_ADMIN","ADMIN"]);
const LOGIN_POLICIES=[["GOOGLE","Parola + Google Authenticator"],["MICROSOFT","Parola + Microsoft Authenticator"],["ANY_MFA","Parola + Google veya Microsoft"],["BOTH_MFA","Parola + Google ve Microsoft"]];
const TABS=[["OVERVIEW","Genel"],["PERMISSIONS","Yetkiler"],["SECURITY","Giriş & MFA"],["SESSIONS","Oturumlar & Geçmiş"]];

function roleOf(value){const role=String(value||"VIEWER").toUpperCase();return role==="ADMIN"?"SUPER_ADMIN":role}
function emptyPermission(moduleKey){return{moduleKey,canView:false,canCreate:false,canUpdate:false,canDelete:false,canApprove:false}}
function normalizePermissions(rows){const map=new Map(MODULE_KEYS.map(key=>[key,emptyPermission(key)]));for(const row of Array.isArray(rows)?rows:[]){const key=String(row?.moduleKey||"").toUpperCase();if(!map.has(key))continue;map.set(key,{moduleKey:key,canView:row.canView===true,canCreate:row.canCreate===true,canUpdate:row.canUpdate===true,canDelete:row.canDelete===true,canApprove:row.canApprove===true})}return [...map.values()]}
function permissionPreset(type){const role=roleOf(type);const full=new Set(),view=new Set();if(role==="COMPANY_ADMIN")MODULE_KEYS.forEach(k=>full.add(k));if(role==="MUHASEBE")["DASHBOARD","MUHASEBE","FIRMA_CARI","BELGE_ISLEM","KDV","CEK_ODEME","ISNET","MAIL","RAPORLAR"].forEach(k=>full.add(k));if(role==="DESEN")["DASHBOARD","DESEN","ASISTAN","RAPORLAR"].forEach(k=>full.add(k));if(["DESEN","IMALAT","BOYAHANE","IK"].includes(role))view.add("MAIL");if(role==="IMALAT")["DASHBOARD","IMALAT","DESEN","RAPORLAR"].forEach(k=>full.add(k));if(role==="BOYAHANE")["DASHBOARD","BOYAHANE","DESEN","RAPORLAR"].forEach(k=>full.add(k));if(role==="IK")["DASHBOARD","IK","RAPORLAR"].forEach(k=>full.add(k));if(role==="DENETIM")view.add("IK");if(role==="VIEWER")MODULE_KEYS.filter(k=>k!=="ADMIN").forEach(k=>view.add(k));return MODULE_KEYS.map(moduleKey=>{if(role==="COMPANY_ADMIN"&&moduleKey==="ADMIN")return{moduleKey,canView:true,canCreate:true,canUpdate:true,canDelete:false,canApprove:true};if(full.has(moduleKey))return{moduleKey,canView:true,canCreate:true,canUpdate:true,canDelete:true,canApprove:true};if(view.has(moduleKey))return{moduleKey,canView:true,canCreate:false,canUpdate:false,canDelete:false,canApprove:false};return emptyPermission(moduleKey)})}
function rowsOf(value){if(Array.isArray(value))return value;if(Array.isArray(value?.items))return value.items;return[]}
function initials(value){return String(value||"U").split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function dateText(value){if(!value)return"-";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString("tr-TR")}
function policyLabel(value){const normalized=value==="PASSWORD_ONLY"?"ANY_MFA":value;return LOGIN_POLICIES.find(([key])=>key===normalized)?.[1]||"Parola + Google veya Microsoft"}
function companySlugOf(row){return String(row?.slug||row?.kod||"").trim()}
function companyNameOf(row){return String(row?.name||row?.ad||row?.slug||row?.kod||"").trim()}
function newUserForm(company=""){return{fullName:"",username:"",email:"",password:"",mainCompanySlug:company,role:"VIEWER",isActive:true,mustChangePassword:true,loginPolicy:"ANY_MFA",approvalRequired:false}}
function profileFromUser(user,company=""){return{fullName:user?.fullName||"",username:user?.username||"",email:user?.email||"",mainCompanySlug:user?.mainCompanySlug||company,role:roleOf(user?.role),isActive:user?.isActive!==false}}
function friendlyDevice(row){const label=String(row?.deviceLabel||"");if(label&&!label.startsWith("BROWSER:"))return label;const ua=String(row?.userAgent||"");const browser=/Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Firefox\//.test(ua)?"Firefox":/Safari\//.test(ua)?"Safari":"Tarayıcı";const os=/Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"macOS":/Android/.test(ua)?"Android":/iPhone|iPad/.test(ua)?"iOS":"";return[browser,os].filter(Boolean).join(" / ")||"Tarayıcı"}
function sessionIdFromToken(token){try{const parts=String(token||"").split(".");if(parts.length!==3)return"";const raw=parts[1].replace(/-/g,"+").replace(/_/g,"/");const padded=raw+"=".repeat((4-raw.length%4)%4);return String(JSON.parse(window.atob(padded))?.sid||"")}catch{return""}}

function PermissionMatrix({rows,onChange,disabled=false,compact=false}){
  return <div className={`auc2-permissions ${compact?"is-compact":""}`}>
    <div className="auc2-perm-head"><span>Modül</span><span>Gör</span><span>Ekle</span><span>Düzenle</span><span>Sil</span><span>Onay</span></div>
    {rows.map(row=><div className="auc2-perm-row" key={row.moduleKey}>
      <strong>{MODULE_LABELS[row.moduleKey]||row.moduleKey}</strong>
      {["canView","canCreate","canUpdate","canDelete","canApprove"].map(field=><label key={field}><input type="checkbox" checked={Boolean(row[field])} disabled={disabled} onChange={e=>onChange?.(row.moduleKey,field,e.target.checked)}/></label>)}
    </div>)}
  </div>
}

export default function AdminUsersPanelV2(){
  const {user:currentUser,token,logout}=useAuth();
  const currentRole=roleOf(currentUser?.role);const isOwner=OWNER_ROLES.has(currentRole);
  const [users,setUsers]=useState([]),[companies,setCompanies]=useState([]),[sessions,setSessions]=useState([]),[history,setHistory]=useState([]),[audit,setAudit]=useState([]),[policies,setPolicies]=useState([]),[delivery,setDelivery]=useState(null);
  const [selectedUserId,setSelectedUserId]=useState(""),[tab,setTab]=useState("OVERVIEW"),[permissions,setPermissions]=useState(()=>permissionPreset("VIEWER"));
  const [search,setSearch]=useState(""),[statusFilter,setStatusFilter]=useState("ACTIVE"),[companyFilter,setCompanyFilter]=useState("ALL"),[busy,setBusy]=useState(false),[message,setMessage]=useState("Kullanıcı merkezi hazırlanıyor..."),[warnings,setWarnings]=useState([]);
  const [createOpen,setCreateOpen]=useState(false),[createForm,setCreateForm]=useState(()=>newUserForm("")),[createPermissions,setCreatePermissions]=useState(()=>permissionPreset("VIEWER")),[createKey,setCreateKey]=useState(0);
  const [profileEditing,setProfileEditing]=useState(false),[profileForm,setProfileForm]=useState(()=>profileFromUser(null,""));
  const [password,setPassword]=useState(""),[emailChallenge,setEmailChallenge]=useState(null),[emailOtp,setEmailOtp]=useState("");
  const searchRef=useRef(null);

  const companyMap=useMemo(()=>new Map(companies.map(row=>[companySlugOf(row),companyNameOf(row)])),[companies]);
  const userMap=useMemo(()=>new Map(users.map(row=>[String(row.id),row])),[users]);
  const currentSessionId=useMemo(()=>sessionIdFromToken(token),[token]);
  const selectedUser=useMemo(()=>users.find(row=>String(row.id)===String(selectedUserId))||null,[users,selectedUserId]);
  const selectedRole=roleOf(selectedUser?.role);const selectedIsOwner=OWNER_ROLES.has(selectedRole);
  const policyMap=useMemo(()=>new Map(policies.map(row=>[String(row.userId||row.user_id||""),row])),[policies]);
  const selectedPolicy=policyMap.get(String(selectedUserId))||{};
  const filteredUsers=useMemo(()=>{const q=search.trim().toLocaleLowerCase("tr-TR");return users.filter(row=>{if(statusFilter==="ACTIVE"&&row.isActive===false)return false;if(statusFilter==="PASSIVE"&&row.isActive!==false)return false;if(companyFilter!=="ALL"&&String(row.mainCompanySlug||"")!==companyFilter)return false;const haystack=`${row.fullName||""} ${row.username||""} ${row.email||""} ${ROLE_LABELS[roleOf(row.role)]||""} ${companyMap.get(row.mainCompanySlug)||row.mainCompanySlug||""}`.toLocaleLowerCase("tr-TR");return !q||haystack.includes(q)})},[users,search,statusFilter,companyFilter,companyMap]);
  const selectedSessions=useMemo(()=>sessions.filter(row=>String(row.userId||row.user_id||"")===String(selectedUserId)),[sessions,selectedUserId]);
  const visibleSessions=useMemo(()=>isOwner?sessions:selectedSessions,[isOwner,sessions,selectedSessions]);
  const selectedHistory=useMemo(()=>history.filter(row=>String(row.userId||row.user_id||"")===String(selectedUserId)),[history,selectedUserId]);
  const selectedAudit=useMemo(()=>audit.filter(row=>String(row.targetUserId||row.target_user_id||"")===String(selectedUserId)),[audit,selectedUserId]);

  const loadAll=useCallback(async()=>{
    setBusy(true);
    const sources=[
      ["Kullanıcılar",listUsers],
      ["Firmalar",getMainCompanies],
      ["Aktif oturumlar",listActiveSessions],
      ["Oturum geçmişi",()=>listSessionHistory(300)],
      ["Güvenlik geçmişi",()=>listSecurityAuditLog(300)],
      ["Giriş politikaları",listLoginSecurityPolicies],
      ["E-posta servisi",getDeliveryCapabilities],
    ];
    const results=await Promise.allSettled(sources.map(([,fn])=>fn()));
    const failed=[];results.forEach((result,index)=>{if(result.status==="rejected")failed.push(sources[index][0])});
    if(results[0].status==="fulfilled"){const list=rowsOf(results[0].value);setUsers(list);setSelectedUserId(cur=>list.some(row=>String(row.id)===String(cur))?cur:(list.find(row=>row.isActive!==false)?.id||list[0]?.id||""))}
    else{setUsers([]);setSelectedUserId("")}
    if(results[1].status==="fulfilled")setCompanies(rowsOf(results[1].value));
    if(results[2].status==="fulfilled")setSessions(rowsOf(results[2].value));
    if(results[3].status==="fulfilled")setHistory(rowsOf(results[3].value));
    if(results[4].status==="fulfilled")setAudit(rowsOf(results[4].value));
    if(results[5].status==="fulfilled")setPolicies(rowsOf(results[5].value));
    if(results[6].status==="fulfilled")setDelivery(results[6].value);
    setWarnings(failed);
    if(results[0].status==="rejected")setMessage(`Hata: Kullanıcı listesi alınamadı. ${results[0].reason?.message||"Yönetim servisi yanıt vermedi."}`);
    else{const helperFailed=failed.filter(name=>name!=="Kullanıcılar");setMessage(helperFailed.length?`Kullanıcı listesi hazır. Alınamayan yardımcı kaynak: ${helperFailed.join(", ")}.`:"Kullanıcı, yetki ve güvenlik bilgileri güncel.")}
    setBusy(false);
  },[]);

  useEffect(()=>{loadAll()},[loadAll]);
  useEffect(()=>{if(!selectedUserId)return;let cancelled=false;getUserPermissions(selectedUserId).then(rows=>{if(!cancelled)setPermissions(selectedRole==="DENETIM"?permissionPreset("DENETIM"):normalizePermissions(rows))}).catch(()=>{if(!cancelled)setPermissions(permissionPreset(selectedRole))});return()=>{cancelled=true}},[selectedUserId,selectedRole]);

  function defaultCompany(){const current=String(currentUser?.mainCompanySlug||"");if(companies.some(row=>companySlugOf(row)===current))return current;return companySlugOf(companies.find(row=>row.isActive!==false)||companies[0])}
  function selectUser(id){setSelectedUserId(id);setTab("OVERVIEW");setProfileEditing(false);setPassword("");setEmailChallenge(null);setEmailOtp("");setCreateOpen(false)}
  function handleSearchChange(event){if(document.activeElement!==event.currentTarget)return;setSearch(event.currentTarget.value)}
  function startCreate(){const company=defaultCompany();setCreateForm(newUserForm(company));setCreatePermissions(permissionPreset("VIEWER"));setCreateKey(value=>value+1);setCreateOpen(true);setMessage("Yeni kullanıcı tek ekranda firma, rol, yetki ve zorunlu MFA ile birlikte oluşturulur.")}
  function changeCreateRole(role){setCreateForm(form=>({...form,role}));setCreatePermissions(permissionPreset(role))}
  function editCreatePermission(moduleKey,field,value){if(roleOf(createForm.role)==="DENETIM")return;setCreatePermissions(rows=>rows.map(row=>row.moduleKey===moduleKey?{...row,[field]:value}:row))}
  async function submitCreate(event){event.preventDefault();if(!createForm.mainCompanySlug)return setMessage("Hata: Kayıtlı ana firma seçilmelidir.");if(createForm.password.length<6)return setMessage("Hata: Yeni kullanıcı şifresi boş gelmelidir ama kayıt sırasında en az 6 karakter girilmelidir.");setBusy(true);try{const created=await createUserComplete({...createForm,loginPolicy:createForm.loginPolicy==="PASSWORD_ONLY"?"ANY_MFA":createForm.loginPolicy,permissions:createPermissions});setMessage(`${created.fullName||created.username} tek işlemde oluşturuldu; firma, rol, yetki ve zorunlu MFA hazır.`);setCreateOpen(false);await loadAll();setSelectedUserId(created.id);setTab("OVERVIEW")}catch(error){setMessage(`Hata: ${error?.message||"Kullanıcı oluşturulamadı."}`)}finally{setBusy(false)}}

  function startProfileEdit(){if(!selectedUser)return;setProfileForm(profileFromUser(selectedUser,defaultCompany()));setProfileEditing(true)}
  async function saveProfile(event){event.preventDefault();if(!selectedUser)return;setBusy(true);try{const oldRole=selectedRole;await updateUser(selectedUser.id,{...profileForm,emailVerified:String(profileForm.email||"").trim().toLowerCase()===String(selectedUser.email||"").trim().toLowerCase()&&selectedUser.emailVerified===true});await saveIkUserScope({userId:selectedUser.id,mainCompanySlug:profileForm.mainCompanySlug,scope:roleOf(profileForm.role)==="DENETIM"?"AUDIT":"FULL"});if(roleOf(profileForm.role)==="DENETIM")await updateUserPermissions(selectedUser.id,permissionPreset("DENETIM"));if(oldRole!==roleOf(profileForm.role))await revokeAllUserSessions(selectedUser.id);setProfileEditing(false);setMessage("Kullanıcı profili kaydedildi.");await loadAll()}catch(error){setMessage(`Hata: ${error?.message||"Profil kaydedilemedi."}`)}finally{setBusy(false)}}
  function editPermission(moduleKey,field,value){if(!selectedUser||selectedIsOwner||selectedRole==="DENETIM")return;setPermissions(rows=>rows.map(row=>row.moduleKey===moduleKey?{...row,[field]:value}:row))}
  async function savePermissions(){if(!selectedUser||selectedIsOwner)return;setBusy(true);try{const clean=selectedRole==="DENETIM"?permissionPreset("DENETIM"):permissions;await updateUserPermissions(selectedUser.id,clean);await saveIkUserScope({userId:selectedUser.id,mainCompanySlug:selectedUser.mainCompanySlug,scope:selectedRole==="DENETIM"?"AUDIT":"FULL"});setPermissions(clean);setMessage(selectedRole==="DENETIM"?"DENETİM sabit: yalnız İK / SGK kartlı PDKS görüntüleme.":"Yetkiler kaydedildi.")}catch(error){setMessage(`Hata: ${error?.message||"Yetkiler kaydedilemedi."}`)}finally{setBusy(false)}}
  async function savePolicy(policyValue,approvalRequired){if(!selectedUser||!isOwner||selectedIsOwner)return;const securePolicy=policyValue==="PASSWORD_ONLY"?"ANY_MFA":policyValue;setBusy(true);try{await updateLoginSecurityPolicy(selectedUser.id,{loginPolicy:securePolicy,sessionSeconds:36000,approvalRequired});setMessage("Giriş politikası kaydedildi. İkili doğrulama zorunlu kalır.");await loadAll()}catch(error){setMessage(`Hata: ${error?.message||"Giriş politikası kaydedilemedi."}`)}finally{setBusy(false)}}
  async function startEmailVerification(){if(!selectedUser)return;if(!delivery?.email)return setMessage("Hata: Gerçek e-posta doğrulama servisi bağlı değil; kod gönderildi mesajı gösterilmeyecek.");setBusy(true);try{const result=await startUserEmailVerification(selectedUser.id);if(result?.alreadyVerified){setMessage("E-posta zaten doğrulanmış.");return}if(result?.deliveryStatus!=="PROVIDER_ACCEPTED"||!result?.providerMessageId)throw new Error("E-posta sağlayıcısından kabul kimliği alınamadı.");setEmailChallenge(result);setEmailOtp("");setMessage(`${result.masked||selectedUser.email} için ${result.provider} gönderim isteğini kabul etti. Sağlayıcı ID: ${result.providerMessageId}. Gelen kutusu/spam kontrol edin; teslimat henüz ayrıca doğrulanmış değildir.`)}catch(error){setEmailChallenge(null);setMessage(`Hata: ${error?.message||"E-posta doğrulama isteği kabul edilmedi."}`)}finally{setBusy(false)}}
  async function finishEmailVerification(){if(!selectedUser||!emailChallenge)return;if(!/^\d{6}$/.test(emailOtp.replace(/\D/g,"")))return setMessage("Hata: 6 haneli doğrulama kodunu girin.");setBusy(true);try{await verifyUserEmail(selectedUser.id,{verificationId:emailChallenge.verificationId,verificationToken:emailChallenge.verificationToken,otp:emailOtp});setEmailChallenge(null);setEmailOtp("");setMessage("E-posta doğrulandı.");await loadAll()}catch(error){setMessage(`Hata: ${error?.message||"Kod doğrulanamadı."}`)}finally{setBusy(false)}}
  async function resetPassword(){if(!selectedUser)return;if(password.length<6)return setMessage("Hata: Yeni şifre en az 6 karakter olmalı.");setBusy(true);try{await resetUserPassword(selectedUser.id,password);setPassword("");setMessage("Şifre değiştirildi ve mevcut oturumlar sonlandırıldı. Sonraki giriş MFA ister.");await loadAll()}catch(error){setMessage(`Hata: ${error?.message||"Şifre değiştirilemedi."}`)}finally{setBusy(false)}}
  async function setActive(next){if(!selectedUser)return;setBusy(true);try{if(next)await activateUser(selectedUser.id);else await deactivateUser(selectedUser.id);setMessage(next?"Kullanıcı aktifleştirildi.":"Kullanıcı pasife alındı ve oturumları kapatıldı.");await loadAll()}catch(error){setMessage(`Hata: ${error?.message||"Durum değiştirilemedi."}`)}finally{setBusy(false)}}
  async function closeSession(row){if(!row?.id)return;setBusy(true);try{if(String(row.id)===String(currentSessionId)){setMessage("Güvenli çıkış yapılıyor; bu oturum sunucuda iptal edilip tarayıcı anahtarı temizlenecek.");await logout();return}await revokeSession(row.id);setMessage("Oturum sonlandırıldı. Bu cihazın sonraki girişi MFA ile doğrulanacak.");await loadAll()}catch(error){setMessage(`Hata: ${error?.message||"Oturum sonlandırılamadı."}`)}finally{setBusy(false)}}
  async function revokeAllSelected(){if(!selectedUser)return;setBusy(true);try{await revokeAllUserSessions(selectedUser.id);if(String(selectedUser.id)===String(currentUser?.id)){setMessage("Tüm oturumlar sonlandırıldı; güvenli çıkış yapılıyor.");await logout();return}setMessage("Kullanıcının tüm oturumları sonlandırıldı. Sonraki giriş MFA ile doğrulanacak.");await loadAll()}catch(error){setMessage(`Hata: ${error?.message||"Oturumlar sonlandırılamadı."}`)}finally{setBusy(false)}}

  const activeCount=users.filter(row=>row.isActive!==false).length;const companyOwnerCount=users.filter(row=>roleOf(row.role)==="COMPANY_ADMIN").length;const verifiedCount=users.filter(row=>row.emailVerified===true).length;
  const currentPolicy=selectedPolicy.loginPolicy==="PASSWORD_ONLY"?"ANY_MFA":selectedPolicy.loginPolicy||"ANY_MFA";const currentApproval=Boolean(selectedPolicy.approvalRequired);

  return <div className="auc2-page">
    <div className="auc2-titlebar"><div><small>PLATFORM YÖNETİMİ / KULLANICI & ORGANİZASYON</small><h1>Kullanıcı & Yetki Merkezi</h1><p>Firma, işveren, muhasebe ve bölüm kullanıcıları; yetki, MFA ve oturumlarıyla birlikte tek kurumsal görünümde yönetilir.</p></div><div className="auc2-actions"><button className="auc2-secondary" disabled={busy} onClick={loadAll}>Yenile</button><button className="auc2-primary" disabled={busy||!isOwner} onClick={startCreate}>+ Yeni Kullanıcı</button></div></div>
    <div className={`auc2-banner ${String(message).startsWith("Hata:")?"is-error":warnings.length?"is-warn":"is-ok"}`}>{message}</div>
    <div className="auc2-metrics"><div><span>Aktif Kullanıcı</span><b>{activeCount}</b><small>{users.length} toplam</small></div><div><span>Firma Sahibi / İşveren</span><b>{companyOwnerCount}</b><small>COMPANY_ADMIN</small></div><div><span>Aktif Oturum</span><b>{sessions.length}</b><small>Canlı cihaz oturumu</small></div><div><span>Doğrulanmış E-posta</span><b>{verifiedCount}</b><small>Kimlik güvenliği</small></div></div>

    {createOpen&&<section className="auc2-create-card"><div className="auc2-section-title"><div><h2>Yeni Kullanıcı — Tek Adım</h2><p>Kullanıcı kaydı tamamlanmadan firma, rol, yetki ve zorunlu MFA birlikte seçilir.</p></div><button className="auc2-secondary" onClick={()=>setCreateOpen(false)}>Vazgeç</button></div>
      <form autoComplete="off" onSubmit={submitCreate}>
        <div className="auc2-grid four">
          <label>Ad Soyad<input autoComplete="off" name={`kyerp-fullname-${createKey}`} value={createForm.fullName} onChange={e=>setCreateForm(v=>({...v,fullName:e.target.value}))}/></label>
          <label>Kullanıcı Adı<input autoComplete="off" name={`kyerp-user-${createKey}`} value={createForm.username} onChange={e=>setCreateForm(v=>({...v,username:e.target.value}))}/></label>
          <label>E-posta<input type="email" autoComplete="off" name={`kyerp-email-${createKey}`} value={createForm.email} onChange={e=>setCreateForm(v=>({...v,email:e.target.value}))}/></label>
          <label>Ana Firma<select value={createForm.mainCompanySlug} onChange={e=>setCreateForm(v=>({...v,mainCompanySlug:e.target.value}))}><option value="">Kayıtlı firma seçin</option>{companies.filter(row=>row.isActive!==false).map(row=><option key={companySlugOf(row)} value={companySlugOf(row)}>{companyNameOf(row)}</option>)}</select></label>
          <label>Şifre<input type="password" autoComplete="new-password" name={`kyerp-new-password-${createKey}`} value={createForm.password} onChange={e=>setCreateForm(v=>({...v,password:e.target.value}))} placeholder="Boş başlar — yeni şifreyi yazın"/></label>
          <label>Rol<select value={createForm.role} onChange={e=>changeCreateRole(e.target.value)}>{MANAGED_ROLES.map(role=><option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
          <label>Giriş Politikası<select value={createForm.loginPolicy} onChange={e=>setCreateForm(v=>({...v,loginPolicy:e.target.value}))}>{LOGIN_POLICIES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <div className="auc2-check-stack"><label><input type="checkbox" checked={createForm.isActive} onChange={e=>setCreateForm(v=>({...v,isActive:e.target.checked}))}/> Aktif kullanıcı</label><label><input type="checkbox" checked={createForm.mustChangePassword} onChange={e=>setCreateForm(v=>({...v,mustChangePassword:e.target.checked}))}/> İlk girişte şifre değiştirsin</label><label><input type="checkbox" checked={createForm.approvalRequired} onChange={e=>setCreateForm(v=>({...v,approvalRequired:e.target.checked}))}/> Yeni cihaz girişinde Firma Sahibi / Süper Yönetici onayı</label></div>
        </div>
        <div className="auc2-lock-note">İkili doğrulama tüm kullanıcılar için zorunludur. Sadece parola ile giriş kapalıdır.</div>
        {roleOf(createForm.role)==="DENETIM"&&<div className="auc2-lock-note">DENETİM profili sabittir: yalnız İK / SGK kartlı PDKS görüntüleme. Günlük personel ve diğer modüller kapalıdır.</div>}
        <h3>Başlangıç Yetkileri</h3><PermissionMatrix rows={createPermissions} onChange={editCreatePermission} disabled={roleOf(createForm.role)==="DENETIM"} compact/>
        <div className="auc2-form-actions"><button type="submit" className="auc2-primary" disabled={busy||!createForm.mainCompanySlug}>Kullanıcıyı Oluştur</button><span>Kayıt tek D1 batch içinde tamamlanır; yarım kullanıcı bırakılmaz.</span></div>
      </form>
    </section>}

    <div className="auc2-layout">
      <aside className="auc2-users"><div className="auc2-list-title"><b>Kullanıcılar</b><small>{filteredUsers.length} kayıt gösteriliyor</small></div><div className="auc2-filter-row"><input ref={searchRef} type="search" name="kyerp-admin-user-filter" autoComplete="off" data-lpignore="true" data-1p-ignore="true" spellCheck="false" placeholder="Ad, kullanıcı, e-posta veya rol ara" value={search} onChange={handleSearchChange}/><select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)}><option value="ALL">Tüm firmalar</option>{companies.filter(row=>row.isActive!==false).map(row=><option key={companySlugOf(row)} value={companySlugOf(row)}>{companyNameOf(row)}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ACTIVE">Aktif</option><option value="ALL">Tümü</option><option value="PASSIVE">Pasif</option></select></div>{search&&<button className="auc2-clear" onClick={()=>{setSearch("");searchRef.current?.focus()}}>Filtreyi temizle</button>}
        <div className="auc2-user-scroll">{filteredUsers.map(row=><button key={row.id} className={`auc2-user ${String(row.id)===String(selectedUserId)?"is-selected":""}`} onClick={()=>selectUser(row.id)}><span className="auc2-avatar">{initials(row.fullName||row.username)}</span><span><b>{row.fullName||row.username}</b><small>@{row.username} · {row.email||"e-posta yok"}</small><em>{ROLE_LABELS[roleOf(row.role)]||row.role} · {companyMap.get(row.mainCompanySlug)||row.mainCompanySlug||"-"}</em></span><i className={row.isActive===false?"is-passive":""}>{row.isActive===false?"Pasif":"Aktif"}</i></button>)}</div>
      </aside>

      <main className="auc2-main">{!selectedUser?<div className="auc2-empty">Bir kullanıcı seçin veya yeni kullanıcı oluşturun.</div>:<>
        <header className="auc2-user-head"><div className="auc2-avatar big">{initials(selectedUser.fullName||selectedUser.username)}</div><div><small>DÜZENLENEN KULLANICI</small><h2>{selectedUser.fullName||selectedUser.username}</h2><p>@{selectedUser.username} · {selectedUser.email||"e-posta yok"}</p><div className="auc2-tags"><span>{ROLE_LABELS[selectedRole]||selectedRole}</span><span>{companyMap.get(selectedUser.mainCompanySlug)||selectedUser.mainCompanySlug}</span><span className={selectedUser.isActive===false?"bad":"good"}>{selectedUser.isActive===false?"Pasif":"Aktif"}</span><span className={selectedUser.emailVerified?"good":"warn"}>{selectedUser.emailVerified?"E-posta doğrulandı":"E-posta doğrulanmadı"}</span></div></div><div className="auc2-head-actions"><button className="auc2-primary" onClick={startProfileEdit}>Profili Düzenle</button>{!selectedIsOwner&&<button className={selectedUser.isActive===false?"auc2-secondary":"auc2-danger"} onClick={()=>setActive(selectedUser.isActive===false)}>{selectedUser.isActive===false?"Aktif Et":"Pasife Al"}</button>}</div></header>
        <nav className="auc2-tabs">{TABS.map(([key,label])=><button key={key} className={tab===key?"is-active":""} onClick={()=>setTab(key)}>{label}</button>)}</nav>

        {tab==="OVERVIEW"&&<section className="auc2-panel">{profileEditing?<form onSubmit={saveProfile}><div className="auc2-grid three"><label>Ad Soyad<input autoComplete="off" value={profileForm.fullName} onChange={e=>setProfileForm(v=>({...v,fullName:e.target.value}))}/></label><label>Kullanıcı Adı<input autoComplete="off" value={profileForm.username} onChange={e=>setProfileForm(v=>({...v,username:e.target.value}))}/></label><label>E-posta<input type="email" autoComplete="off" value={profileForm.email} onChange={e=>setProfileForm(v=>({...v,email:e.target.value}))}/></label><label>Ana Firma<select value={profileForm.mainCompanySlug} onChange={e=>setProfileForm(v=>({...v,mainCompanySlug:e.target.value}))}>{companies.filter(row=>row.isActive!==false).map(row=><option key={companySlugOf(row)} value={companySlugOf(row)}>{companyNameOf(row)}</option>)}</select></label><label>Rol<select value={profileForm.role} disabled={selectedIsOwner} onChange={e=>setProfileForm(v=>({...v,role:e.target.value}))}>{selectedIsOwner?<option value={selectedRole}>{ROLE_LABELS[selectedRole]}</option>:MANAGED_ROLES.map(role=><option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label><label className="auc2-inline-check"><input type="checkbox" checked={profileForm.isActive} disabled={selectedIsOwner} onChange={e=>setProfileForm(v=>({...v,isActive:e.target.checked}))}/> Aktif</label></div><div className="auc2-form-actions"><button className="auc2-primary" type="submit">Kaydet</button><button className="auc2-secondary" type="button" onClick={()=>setProfileEditing(false)}>Vazgeç</button></div></form>:<div className="auc2-summary-grid"><div><span>Rol</span><b>{ROLE_LABELS[selectedRole]||selectedRole}</b></div><div><span>Ana Firma</span><b>{companyMap.get(selectedUser.mainCompanySlug)||selectedUser.mainCompanySlug||"-"}</b></div><div><span>Giriş Güvenliği</span><b>{selectedIsOwner?"Süper Yönetici MFA zorunlu":policyLabel(currentPolicy)}</b></div><div><span>Aktif Oturum</span><b>{selectedSessions.length}</b></div></div>}</section>}

        {tab==="PERMISSIONS"&&<section className="auc2-panel"><div className="auc2-section-title"><div><h3>Modül Yetkileri</h3><p>{selectedRole==="DENETIM"?"Sabit DENETİM / PDKS profili. Değiştirilemez.":selectedIsOwner?"Süper Yönetici tüm platform modüllerine sahiptir.":"Görme, ekleme, düzenleme, silme ve onay haklarını yönetin."}</p></div>{!selectedIsOwner&&<button className="auc2-primary" disabled={busy} onClick={savePermissions}>Yetkileri Kaydet</button>}</div><PermissionMatrix rows={selectedIsOwner?permissionPreset("COMPANY_ADMIN").map(row=>({...row,canView:true,canCreate:true,canUpdate:true,canDelete:true,canApprove:true})):permissions} onChange={editPermission} disabled={selectedIsOwner||selectedRole==="DENETIM"}/></section>}

        {tab==="SECURITY"&&<section className="auc2-panel"><div className="auc2-security-grid"><div className="auc2-card"><h3>Giriş Politikası & MFA</h3><p>Parola + Authenticator tüm aktif kullanıcılar için zorunludur.</p><div className="auc2-lock-note">Sadece parola ile giriş kapalıdır. Google, Microsoft veya her ikisi seçilebilir.</div><label>Giriş Yöntemi<select value={selectedIsOwner?"ANY_MFA":currentPolicy} disabled={selectedIsOwner||!isOwner} onChange={e=>savePolicy(e.target.value,currentApproval)}>{LOGIN_POLICIES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{!selectedIsOwner&&<label className="auc2-inline-check"><input type="checkbox" checked={currentApproval} onChange={e=>savePolicy(currentPolicy,e.target.checked)}/> Yeni cihaz girişinde Firma Sahibi / Süper Yönetici onayı</label>}<div className="auc2-lock-note">Authenticator anahtarı doğrudan sıfırlanamaz. Güvenli QR yenileme yalnız Süper Yönetici & Güvenlik ekranındaki yeniden kimlik doğrulama akışıyla yapılır.</div></div>
          <div className="auc2-card"><h3>E-posta Doğrulama</h3><p>Başarı mesajı yalnız gerçek sağlayıcı isteği kabul ettiğinde gösterilir.</p><div className="auc2-email-line"><span>{selectedUser.email||"E-posta kayıtlı değil"}</span><span className={selectedUser.emailVerified?"good":"warn"}>{selectedUser.emailVerified?"Doğrulandı":"Doğrulanmadı"}</span></div>{!selectedUser.emailVerified&&<button className="auc2-primary" disabled={busy||!selectedUser.email||!delivery?.email} onClick={startEmailVerification}>Doğrulama Kodu Gönder</button>}{!delivery?.email&&<small className="auc2-error-text">Gerçek e-posta servisi bağlı değil; sahte başarı mesajı gösterilmez.</small>}{emailChallenge&&<div className="auc2-otp"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailOtp} onChange={e=>setEmailOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="000000"/><button className="auc2-primary" onClick={finishEmailVerification}>Kodu Doğrula</button><button onClick={()=>{setEmailChallenge(null);setEmailOtp("")}}>Vazgeç</button></div>}</div>
          <div className="auc2-card"><h3>Şifre & Oturum Güvenliği</h3><p>Şifre değişikliği mevcut oturumları kapatır; sonraki giriş MFA ister.</p><div className="auc2-password-row"><input key={`reset-${selectedUser.id}`} type="password" name={`kyerp-reset-password-${selectedUser.id}`} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Yeni şifre"/><button onClick={resetPassword}>Şifreyi Değiştir</button><button className="auc2-danger" disabled={busy} onClick={revokeAllSelected}>{String(selectedUser.id)===String(currentUser?.id)?"Tüm Oturumlarımı Güvenli Kapat":"Kullanıcının Tüm Oturumlarını Sonlandır"}</button></div></div></div></section>}

        {tab==="SESSIONS"&&<section className="auc2-panel"><div className="auc2-section-title"><div><h3>{isOwner?"Tüm Aktif Oturumlar":"Aktif Oturumlar"}</h3><p>{isOwner?"Süper Yönetici tüm firmalardaki aktif cihaz oturumlarını görür ve tek tek sonlandırabilir.":"Seçili kullanıcının cihaz ve oturum geçmişi."}</p></div></div><div className={`auc2-table ${isOwner?"is-owner-sessions":""}`}><div className="auc2-table-head">{isOwner&&<span>Kullanıcı</span>}<span>Cihaz</span><span>Oluşturma</span><span>Son Görülme</span><span>İşlem</span></div>{visibleSessions.length?visibleSessions.map(row=>{const owner=userMap.get(String(row.userId||row.user_id||""));const isCurrent=String(row.id)===String(currentSessionId);return <div className="auc2-table-row" key={row.id}>{isOwner&&<span className="auc2-session-user"><b>{owner?.fullName||row.fullName||row.username||"Kullanıcı"}</b><small>@{owner?.username||row.username||"-"}</small></span>}<span>{friendlyDevice(row)}{isCurrent&&<small className="auc2-current-session">Bu cihaz</small>}</span><span>{dateText(row.createdAt||row.created_at)}</span><span>{dateText(row.lastSeenAt||row.last_seen_at)}</span><span><button className="auc2-danger small" disabled={busy} onClick={()=>closeSession(row)}>{isCurrent?"Güvenli Çıkış":"Oturumu Sonlandır"}</button></span></div>}):<div className="auc2-empty-row">Aktif oturum yok.</div>}</div><div className="auc2-history-columns"><div><h3>Seçili Kullanıcının Oturum Geçmişi</h3>{selectedHistory.slice(0,30).map((row,index)=><div className="auc2-log" key={row.id||index}><b>{row.action||row.status||"Oturum"}</b><span>{dateText(row.createdAt||row.created_at||row.updatedAt)}</span></div>)}</div><div><h3>Güvenlik Kaydı</h3>{selectedAudit.slice(0,30).map((row,index)=><div className="auc2-log" key={row.id||index}><b>{row.action||"Güvenlik"}</b><span>{dateText(row.createdAt||row.created_at)}</span></div>)}</div></div></section>}
      </>}</main>
    </div>
  </div>
}
