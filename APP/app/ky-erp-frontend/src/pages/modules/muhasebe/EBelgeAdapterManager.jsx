import IsnetOfficeStatus from "./IsnetOfficeStatus";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Activity,AlertTriangle,CheckCircle2,ChevronDown,FileCode2,FolderOpen,Layers3,Plus,RefreshCw,Search,ShieldCheck,LockKeyhole,PauseCircle,PlayCircle,Settings2,X,Trash2} from "lucide-react";
import {getCompanyEBelgeAdapters,setCompanyEBelgeAdapter,getCompanyEBelgeAdapterProfile} from "../../../services/eBelgeAdapterApi";
import EBelgeIntegrationTestCenter from "./EBelgeIntegrationTestCenter";
import EBelgeIntegrationProfileEditor from "./EBelgeIntegrationProfileEditor";
import EBelgeIntegrationsWorkspace from "./EBelgeIntegrationsWorkspace";
import IsnetOfficialWorkspace from "./IsnetOfficialWorkspace";
import "./eBelgeAdapterManager.css";

const integrationError=e=>{
 const status=Number(e?.status||0),code=String(e?.code||"");
 const id=String(e?.payload?.error?.details?.requestId||e?.payload?.error?.requestId||"");
 const message=[401,403].includes(status)?"Oturum veya firma erişim yetkisi doğrulanamadı.":code==="AUTH_SESSION_CHANGED"?"Oturum yenilendi; entegrasyon listesini yeniden doğrulayın.":[500,502,503,504].includes(status)||["NETWORK_ERROR","REQUEST_TIMEOUT"].includes(code)?"Entegrasyon listesi geçici olarak alınamadı. Kayıtlar silinmedi; Yenile ile yeniden doğrulayın.":e?.message||"Firma entegrasyonları alınamadı.";
 return message+(id?" · İstek: "+id:"");
};
const connectionStatus=(adapter,provider,entry)=>{
 if(adapter.key==="ISNET")return entry?.enabled===false?"Firma için pasif":"Firma seçimi kayıtlı olabilir; canlı ofis bağlantısı ve sağlayıcı yetkisi aşağıda ayrı gösterilir";
 if(adapter.driver===null)return "Bağlayıcı henüz hazır değil";
 if(entry?.enabled===false)return "Firma için pasif";
 if(adapter.key==="MANUAL")return "XML yükleme kullanılabilir";
 if(provider?.connected===true)return "İşNet sağlayıcı oturumu doğrulandı";
 if(provider?.status==="SESSION_EXPIRED")return "İşNet oturumu süresi doldu";
 if(provider?.status==="NOT_CONFIGURED")return "İşNet firma bağlantısı kurulmadı";
 return "Sağlayıcı bağlantısı doğrulanmadı";
};
const providerService=(key)=>key==="ISNET"
 ?{title:"İşNet NetteFatura · Ofis bağlantısı",description:"Günlük belge işlemleri e-Belge merkezinde; burada firma bağlantısı, canlı servisler ve teknik kontrol yönetilir."}
 :key==="MANUAL"
 ?{title:"Yerel belge kaynağı",description:"Manuel UBL-TR XML / PDF yüklemesi için dış servis URL'si gerekmez."}
 :{title:"Henüz entegre edilmedi",description:"Bu sağlayıcının doğrulanmış bağlantı sürücüsü yok. Rastgele servis URL'si eklemek bağlantı açmaz; bağlantı ayarları sürücü hazırlandığında gösterilir."};

export default function EBelgeAdapterManager({activeMainCompany,openModule,providerStatuses=[],onRefreshStatuses}){
 const tenant=activeMainCompany?.slug||activeMainCompany?.mainCompanySlug||activeMainCompany?.id||activeMainCompany?.mainCompanyId||"";
 const owner=useMemo(()=>({slug:tenant}),[tenant]);
 const [data,setData]=useState({mainCompanySlug:"",systemCatalog:[],companyAdapters:[]});
 const [selected,setSelected]=useState("");
 const [panel,setPanel]=useState("overview");
 const [profile,setProfile]=useState(null);
 const [profileError,setProfileError]=useState("");
 const [officeRefresh,setOfficeRefresh]=useState(0);
 const [showCatalog,setShowCatalog]=useState(false);
 const [query,setQuery]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
 const [removeKey,setRemoveKey]=useState("");
 const requestSeq=useRef(0);

 const load=useCallback(async()=>{
  const seq=++requestSeq.current;
  setData(current=>current.mainCompanySlug===tenant?current:{mainCompanySlug:"",systemCatalog:[],companyAdapters:[]});
  if(!tenant){setLoading(false);return}
  setLoading(true);setError("");
  try{
   const result=await getCompanyEBelgeAdapters(owner);
   if(seq!==requestSeq.current)return;
   if(String(result.mainCompanySlug||"").toLowerCase()!==String(tenant).toLowerCase())
    throw new Error("Firma entegrasyon yanıtının şirket kapsamı eşleşmiyor.");
   if(!Array.isArray(result.companyAdapters)||!Array.isArray(result.systemCatalog))throw new Error("Entegrasyon listesi geçersiz yanıt verdi.");
   const companyAdapters=result.companyAdapters;
   setData({mainCompanySlug:tenant,systemCatalog:result.systemCatalog||[],companyAdapters,canManage:result.canManage===true});
   setSelected(current=>companyAdapters.some(x=>x.key===current&&x.selected)
    ?current:companyAdapters.find(x=>x.key==="ISNET"&&x.selected)?.key||companyAdapters.find(x=>x.selected)?.key||"");
  }catch(e){if(seq===requestSeq.current){
   if([401,403].includes(Number(e?.status))||e?.code==="AUTH_SESSION_CHANGED"){setData({mainCompanySlug:"",systemCatalog:[],companyAdapters:[]});setSelected("");}
   setError(integrationError(e));
  }}
  finally{if(seq===requestSeq.current)setLoading(false)}
 },[tenant,owner]);
 useEffect(()=>{setSelected("");setPanel("overview");setShowCatalog(false);setQuery("");setNotice("");setBusy("");setRemoveKey("");void load();return()=>{requestSeq.current+=1}},[load]);

 const visibleData=data.mainCompanySlug===tenant?data:{systemCatalog:[],companyAdapters:[]};
 const enabled=useMemo(()=>new Set(visibleData.companyAdapters.filter(x=>x.selected).map(x=>x.key)),[visibleData.companyAdapters]);
 const installed=visibleData.systemCatalog.filter(x=>enabled.has(x.key));
 const available=visibleData.systemCatalog.filter(x=>!enabled.has(x.key)&&String(x.label+" "+x.description).toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
 const choice=key=>visibleData.companyAdapters.find(x=>x.key===key);
 const active=visibleData.systemCatalog.find(x=>x.key===selected&&enabled.has(x.key));
 const activeCount=installed.filter(x=>choice(x.key)?.enabled!==false).length;
 const provider=adapter=>providerStatuses.find(x=>String(x.key||"").toUpperCase()===adapter.key);
 const status=adapter=>connectionStatus(adapter,provider(adapter),choice(adapter.key));
 const connected=installed.filter(x=>x.key==="ISNET"&&choice(x.key)?.enabled!==false&&provider(x)?.connected===true).length;
 const verified=data.mainCompanySlug===tenant&&!loading&&!error;
 const canEdit=Boolean(verified&&!busy&&data.canManage===true);
 useEffect(()=>{
  let live=true;
  setProfile(null);setProfileError("");
  if(!selected||!tenant||panel!=="profile"&&panel!=="test")return()=>{live=false};
  getCompanyEBelgeAdapterProfile(owner,selected).then(p=>{if(live)setProfile(p)})
   .catch(e=>{if(live)setProfileError(e?.message||"Entegrasyon ayarı alınamadı.")});
  return()=>{live=false};
 },[owner,selected,tenant,panel]);

 const change=async(adapter,add,activate=true)=>{
  if(!canEdit||add&&activate&&adapter.driver===null)return;
  const seq=++requestSeq.current,operationTenant=tenant;
  setBusy(adapter.key);setError("");setNotice("");
  try{
   await setCompanyEBelgeAdapter(owner,adapter.key,add,activate);
   const next=await getCompanyEBelgeAdapters(owner);
   if(seq!==requestSeq.current)return;
   if(String(next.mainCompanySlug||"").toLowerCase()!==String(operationTenant).toLowerCase())
    throw new Error("Entegrasyon güncellemesinin firma kapsamı eşleşmiyor.");
   if(!Array.isArray(next.companyAdapters)||!Array.isArray(next.systemCatalog))throw new Error("Firma kaydı yeniden okunamadı.");
   const state=next.companyAdapters.find(x=>x.key===adapter.key);
   if(!state||state.selected!==add||state.enabled!==(add&&activate))throw new Error("Entegrasyon değişikliği doğrulanamadı; yenileyin.");
   setData({mainCompanySlug:operationTenant,systemCatalog:next.systemCatalog,companyAdapters:next.companyAdapters,canManage:next.canManage===true});
   setRemoveKey("");setShowCatalog(false);setPanel("overview");setOfficeRefresh(v=>v+1);
   setSelected(current=>{
    const stillPresent=next.companyAdapters?.some(x=>x.key===current&&x.selected);
    if(add&&!enabled.has(adapter.key))return adapter.key;
    if(stillPresent)return current;
    return next.companyAdapters?.find(x=>x.key==="ISNET"&&x.selected)?.key||next.companyAdapters?.find(x=>x.selected)?.key||"";
   });
   if(!add)setNotice("Entegrasyon yalnız bu firmanın listesinden kaldırıldı. Belgeler ve ayarlar korunur.");
   else setNotice(activate?"Entegrasyon firma için etkinleştirildi; gerçek bağlantısı ayrıca doğrulanacaktır.":"Entegrasyon firma için pasife alındı; geçmiş ve ayarlar korunur.");
  }catch(e){if(seq===requestSeq.current){if([401,403].includes(Number(e?.status))||e?.code==="AUTH_SESSION_CHANGED"){setData({mainCompanySlug:"",systemCatalog:[],companyAdapters:[]});setSelected("");}setError(integrationError(e));}}
  finally{if(seq===requestSeq.current)setBusy("")}
 };
 const refresh=async()=>{await load();setOfficeRefresh(v=>v+1);if(typeof onRefreshStatuses==="function")try{await onRefreshStatuses()}catch{/* Parent page handles its own errors. */}};
 const isnetOption=visibleData.systemCatalog.find(x=>x.key==="ISNET");
 if(!tenant)return <div className="eam-alert">Önce ana firma seçin.</div>;

 return <main className="eam">
  <header className="eam-head">
   <div><small>e-BELGE / ENTEGRASYON YÖNETİMİ</small><h2>Entegrasyon Yönetimi</h2><p>Firma bağlantısı ve çalışma ayarları. Fatura ve irsaliyeler e-Belge merkezinde hazırlanır.</p></div>
   <button type="button" disabled={Boolean(busy)||loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Yenile</button>
  </header>
  <div className="eam-toolbar">
   <div className="eam-selector">
    <label htmlFor="eam-company-integration">Firma Entegrasyonları</label>
    <div className="eam-select-wrap">
     <Layers3 size={17}/>
     <select id="eam-company-integration" aria-label="Bu Firmanın Entegrasyonları" value={active?.key||""} onChange={e=>{setSelected(e.target.value);setPanel("overview");setRemoveKey("");setShowCatalog(false)}} disabled={loading||Boolean(error)}>
      <option value="">{loading?"Entegrasyonlar yükleniyor...":error?"Liste doğrulanamadı":installed.length?"Entegrasyon seçin":"Henüz entegrasyon seçilmemiş"}</option>
      {installed.map(adapter=><option key={adapter.key} value={adapter.key}>{adapter.label}{choice(adapter.key)?.enabled===false?" (Pasif)":""}</option>)}
     </select><ChevronDown size={16}/>
    </div>
   </div>
   <div className="eam-add-area">
    <button type="button" className="eam-main-button" disabled={!canEdit} aria-expanded={showCatalog} aria-controls="eam-catalog-popup"
     onClick={()=>{setShowCatalog(x=>!x);setQuery("");setRemoveKey("")}}><Plus size={16}/> Entegrasyon Ekle <ChevronDown size={15}/></button>
    {showCatalog&&<section id="eam-catalog-popup" className="eam-catalog-popup" aria-label="Sistem Entegrasyon Kataloğu">
     <div className="eam-popup-head"><div><strong>Sistem Entegrasyon Kataloğu</strong><small>Yalnız bu firmaya eklenir</small></div>
      <button type="button" aria-label="Entegrasyon eklemeyi kapat" onClick={()=>setShowCatalog(false)}><X size={18}/></button>
     </div>
     <label className="eam-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="İşNet, Logo, Mikro..." aria-label="Entegrasyon ara"/></label>
     <div className="eam-catalog-list">{available.length===0?<p className="eam-empty">Eklenebilecek başka entegrasyon bulunamadı.</p>:available.map(adapter=><div className="eam-catalog-item" key={adapter.key}>
      <div><strong>{adapter.label}</strong><p>{adapter.description}</p><small>{adapter.driver===null?"Bağlayıcı geliştirme bekliyor":adapter.key==="MANUAL"?"URL gerektirmez":"Servis ve giriş ayarları eklendikten sonra açılır"}</small></div>
      <button type="button" disabled={!canEdit} onClick={()=>void change(adapter,true,adapter.driver!==null)}><Plus size={15}/> {adapter.driver===null?"Pasif Ekle":"Ekle"}</button>
     </div>)}</div>
    </section>}
   </div>
   <div className="eam-summary" aria-label="Firma entegrasyon özeti">
    <span><b>{verified?installed.length:"—"}</b> seçili</span><span><b>{verified?activeCount:"—"}</b> etkin</span>
    <span><Activity size={15}/><b>{verified&&providerStatuses.length?connected:"—"}</b> sağlayıcı oturumu (canlı kabul ayrı)</span>
   </div>
  </div>
  {error&&<div className="eam-alert" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {notice&&<div className="eam-ok" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  {verified&&!data.canManage&&<p className="eam-readonly" role="status">Bu oturumda entegrasyon ayarlarını değiştirme yetkisi doğrulanmadı. Bağlantı durumunu okuyabilirsiniz.</p>}
  <section className="eam-detail-pane" aria-label="Seçili entegrasyon ayarları">
   {!verified?<div className="eam-detail-placeholder" role="status"><Settings2 size={28}/><h3>{loading?"Entegrasyonlar doğrulanıyor":"Entegrasyon listesi doğrulanamadı"}</h3><p>{loading?"Firma bağlantıları okunuyor.":data.mainCompanySlug===tenant?"Son okunan firma seçimi korunuyor; işlem yapmak için listeyi yenileyin.":"Kayıtlı entegrasyon olup olmadığı henüz bilinmiyor. Yeniden bağlantı eklemeyin."}</p></div>:active?<><div className="eam-detail">
     <div><small>ENTEGRASYON AYARLARI · {active.key}</small><h3>{profile?.displayName||active.label}</h3><p>{status(active)}</p></div>
     <details className="eam-management"><summary>Entegrasyonu yönet</summary><div className="eam-detail-actions">
      <button type="button" disabled={!canEdit||active.driver===null&&choice(active.key)?.enabled===false} onClick={()=>{if(window.confirm(choice(active.key)?.enabled===false?"Bu firma için entegrasyonu etkinleştir?":"Bu firma için entegrasyonu pasife al?"))void change(active,true,choice(active.key)?.enabled===false)}}>
       {choice(active.key)?.enabled===false?<PlayCircle size={16}/>:<PauseCircle size={16}/>}
       {choice(active.key)?.enabled===false?"Etkinleştir":"Pasife Al"}
      </button>
      <button type="button" className="eam-remove" disabled={!canEdit} onClick={()=>{setRemoveKey(removeKey===active.key?"":active.key);setShowCatalog(false)}}><Trash2 size={15}/> Kaldır</button>
     </div></details>
    </div>
    {removeKey===active.key&&<div className="eam-remove-confirm" role="group" aria-label="Entegrasyonu kaldırmayı onayla">
      <p>Yalnız bu firmanın listesinden kaldırılır. Mevcut belgeler, İşNet şifresi ve entegrasyon ayarları silinmez.</p>
      <button type="button" disabled={!canEdit} onClick={()=>void change(active,false,false)}>Listeden Çıkar</button>
      <button type="button" onClick={()=>setRemoveKey("")}>Vazgeç</button>
    </div>}
    {choice(active.key)?.enabled===false&&<div className="eam-paused"><PauseCircle size={18}/> Bu entegrasyon firma için pasif. Ayarlar korunur, devam etmek için Etkinleştir'e basın.</div>}
    <div className="eam-service"><ShieldCheck size={18}/><div><strong>{providerService(active.key).title}</strong>
     {active.key!=="ISNET"&&profile?.serviceUrl&&<code>{profile.serviceUrl}</code>}
     <p>{providerService(active.key).description}</p></div></div>
    
    <div className="eam-tabs" role="tablist" aria-label="Entegrasyon çalışma alanları">
     <button type="button" role="tab" aria-selected={panel==="overview"} className={panel==="overview"?"active":""} onClick={()=>setPanel("overview")}>Bağlantı Durumu</button>
     <button type="button" role="tab" aria-selected={panel==="profile"} className={panel==="profile"?"active":""} onClick={()=>setPanel("profile")}>Firma Ayarları</button>
     {active.key==="ISNET"&&<button type="button" role="tab" aria-selected={panel==="official"} className={panel==="official"?"active":""} onClick={()=>setPanel("official")}>Teknik Kabul / TEST</button>}
     {active.key==="ISNET"&&<button type="button" role="tab" aria-selected={panel==="connection"} className={panel==="connection"?"active":""} onClick={()=>setPanel("connection")}>Gelişmiş İş Kuralları</button>}
     <button type="button" role="tab" aria-selected={panel==="test"} className={panel==="test"?"active":""} onClick={()=>setPanel("test")}>{active.key==="ISNET"?"Dosya Kontrolü":"Belge Test Merkezi"}</button>

    </div>
    {(panel==="profile"||panel==="test")&&profileError&&<div className="eam-alert" role="alert">{profileError}</div>}
    {panel==="overview"?<div className="eam-overview">{active.key==="ISNET"?<><IsnetOfficeStatus key={tenant} slug={tenant} refreshKey={officeRefresh}/><div className="eam-next"><strong>Günlük işlemlere dön</strong><p>Bağlantı kurulmadan resmî gönderim yapılamaz. Mevcut belgeleri ve taslakları kullanabilirsiniz.</p><div className="eam-detail-actions"><button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"olustur"})}>e-Belge Oluştur</button><button type="button" onClick={()=>openModule?.("e-belge",{tabKey:"belgeleri-al"})}>Belge Aktarımı</button></div></div></>:active.key==="MANUAL"?<div className="eam-next"><strong>XML / PDF yükleme</strong><p>Dış servis gerektirmez. Belge Havuzu üzerinden aktarın.</p><button type="button" className="eam-main-button" disabled={choice(active.key)?.enabled===false} onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}>Belge Havuzunu Aç</button></div>:<div className="eam-next"><strong>Bağlayıcı motoru henüz hazır değil</strong><p>Bu sağlayıcı için aktif bağlantı veya gönderim kabulü bulunmuyor.</p></div>}</div>:panel==="official"&&active.key==="ISNET"?<IsnetOfficialWorkspace slug={tenant} key={tenant+":official"} openModule={openModule} enabled={choice(active.key)?.enabled!==false} technicalOnly onOpenSync={()=>openModule?.("e-belge",{tabKey:"belgeleri-al"})} onOpenRules={()=>setPanel("connection")} onOpenTest={()=>setPanel("test")}/>:
     panel==="test"?<EBelgeIntegrationTestCenter key={tenant+":"+active.key} adapter={active} activeMainCompany={activeMainCompany} profile={profile} onOpenSync={()=>openModule?.("e-belge",{tabKey:"belgeleri-al"})} onOpenVisualStudio={()=>openModule?.("e-belge",{tabKey:"gorsel-sablonlar"})}/>:
     panel==="profile"?<EBelgeIntegrationProfileEditor key={tenant+":"+active.key} adapter={active} company={owner} profile={profile} onSaved={setProfile} canManage={canEdit}/>:
     active.key==="ISNET"?<div className="eam-detail-content"><EBelgeIntegrationsWorkspace key={tenant} activeMainCompany={activeMainCompany} openModule={openModule} onOpenDocumentTest={()=>setPanel("test")} hideConnection/></div>:
     active.key==="MANUAL"?<div className="eam-detail-body"><div className="eam-instruction"><FileCode2 size={23}/><div><strong>Manuel XML / PDF Belge Havuzu</strong><p>UBL-TR XML asıl kaynaktır. PDF/JPEG/PNG görüntü ve kontrol içindir.</p></div></div>
      <button className="eam-main-button" type="button" disabled={choice(active.key)?.enabled===false} onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}><FolderOpen size={16}/> Belge Havuzunu Aç</button>
     </div>:<div className="eam-detail-body"><div className="eam-instruction"><LockKeyhole size={23}/><div><strong>Bağlayıcı motoru henüz hazır değil</strong><p>Logo, Mikro ve Paraşüt şu an kataloğa eklenebilir; gerçek API sürücüsü olmadan servis URL'si veya sahte giriş formu ile bağlantı kurulamaz.</p></div></div></div>}
   </>:<div className="eam-detail-placeholder"><Settings2 size={28}/><h3>Entegrasyon seçin</h3><p>Yukarıdaki açılır alandan seçili entegrasyonu açın. İşNet bağlantısı ve diğer servis ayarları burada tam genişlikte görünür.</p>
    {installed.length===0&&isnetOption&&<button className="eam-main-button" type="button" disabled={!canEdit} onClick={()=>void change(isnetOption,true,true)}><Plus size={16}/> İşNet'i Ekle</button>}
   </div>}
  </section>
  <p className="eam-foot"><ShieldCheck size={15}/> Entegrasyonu kaldırmak geçmiş belgeleri, XML/PDF dosyalarını veya platform bağlantı motorunu silmez.</p>
 </main>;
}
