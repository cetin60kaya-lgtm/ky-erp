import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Activity,AlertTriangle,CheckCircle2,ChevronDown,FileCode2,FolderOpen,Layers3,Plus,RefreshCw,Search,ShieldCheck,LockKeyhole,PauseCircle,PlayCircle,Settings2,X,Trash2} from "lucide-react";
import {getCompanyEBelgeAdapters,setCompanyEBelgeAdapter,getCompanyEBelgeAdapterProfile} from "../../../services/eBelgeAdapterApi";
import EBelgeIntegrationTestCenter from "./EBelgeIntegrationTestCenter";
import EBelgeIntegrationProfileEditor from "./EBelgeIntegrationProfileEditor";
import EBelgeIntegrationsWorkspace from "./EBelgeIntegrationsWorkspace";
import EBelgeIsnetPortalSync from "./EBelgeIsnetPortalSync";
import "./eBelgeAdapterManager.css";

const connectionStatus=(adapter,provider,entry)=>{
 if(adapter.driver===null)return "Bağlayıcı henüz hazır değil";
 if(entry?.enabled===false)return "Firma için pasif";
 if(adapter.key==="MANUAL")return "XML yükleme kullanılabilir";
 if(provider?.connected===true)return "İşNet sağlayıcı oturumu doğrulandı";
 if(provider?.status==="SESSION_EXPIRED")return "İşNet oturumu süresi doldu";
 if(provider?.status==="NOT_CONFIGURED")return "İşNet firma bağlantısı kurulmadı";
 return "Sağlayıcı bağlantısı doğrulanmadı";
};
const providerService=(key)=>key==="ISNET"
 ?{title:"Resmî İşNet API",url:"https://einvoiceapi.isnet.net.tr",description:"Servis adresi güvenlik nedeniyle sistemde sabittir. Portal veya API giriş yöntemi aşağıdaki İşNet bağlantı ayarlarından seçilir."}
 :key==="MANUAL"
 ?{title:"Yerel belge kaynağı",description:"Manuel UBL-TR XML / PDF yüklemesi için dış servis URL'si gerekmez."}
 :{title:"Henüz entegre edilmedi",description:"Bu sağlayıcının doğrulanmış bağlantı sürücüsü yok. Rastgele servis URL'si eklemek bağlantı açmaz; bağlantı ayarları sürücü hazırlandığında gösterilir."};

export default function EBelgeAdapterManager({activeMainCompany,openModule,providerStatuses=[],onRefreshStatuses}){
 const tenant=activeMainCompany?.slug||activeMainCompany?.mainCompanySlug||activeMainCompany?.id||activeMainCompany?.mainCompanyId||"";
 const owner=useMemo(()=>({slug:tenant}),[tenant]);
 const [data,setData]=useState({mainCompanySlug:"",systemCatalog:[],companyAdapters:[]});
 const [selected,setSelected]=useState("");
 const [panel,setPanel]=useState("sync");
 const [profile,setProfile]=useState(null);
 const [profileError,setProfileError]=useState("");
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
  setData({mainCompanySlug:tenant,systemCatalog:[],companyAdapters:[]});
  if(!tenant){setLoading(false);return}
  setLoading(true);setError("");
  try{
   const result=await getCompanyEBelgeAdapters(owner);
   if(seq!==requestSeq.current)return;
   if(String(result.mainCompanySlug||"").toLowerCase()!==String(tenant).toLowerCase())
    throw new Error("Firma entegrasyon yanıtının şirket kapsamı eşleşmiyor.");
   const companyAdapters=result.companyAdapters||[];
   setData({mainCompanySlug:tenant,systemCatalog:result.systemCatalog||[],companyAdapters});
   setSelected(current=>companyAdapters.some(x=>x.key===current&&x.selected)
    ?current:companyAdapters.find(x=>x.key==="ISNET"&&x.selected)?.key||companyAdapters.find(x=>x.selected)?.key||"");
  }catch(e){if(seq===requestSeq.current)setError(e?.message||"Firma entegrasyonları alınamadı.")}
  finally{if(seq===requestSeq.current)setLoading(false)}
 },[tenant,owner]);
 useEffect(()=>{setSelected("");setShowCatalog(false);setQuery("");setNotice("");setBusy("");setRemoveKey("");void load();return()=>{requestSeq.current+=1}},[load]);

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
 const canEdit=!busy&&!loading&&!error;
 useEffect(()=>{
  let live=true;
  setProfile(null);setProfileError("");
  if(!selected||!tenant)return()=>{live=false};
  getCompanyEBelgeAdapterProfile(owner,selected).then(p=>{if(live)setProfile(p)})
   .catch(e=>{if(live)setProfileError(e?.message||"Entegrasyon ayarı alınamadı.")});
  return()=>{live=false};
 },[owner,selected,tenant]);

 const change=async(adapter,add,activate=true)=>{
  if(busy)return;
  const seq=++requestSeq.current,operationTenant=tenant;
  setBusy(adapter.key);setError("");setNotice("");
  try{
   await setCompanyEBelgeAdapter(owner,adapter.key,add,activate);
   const next=await getCompanyEBelgeAdapters(owner);
   if(seq!==requestSeq.current)return;
   if(String(next.mainCompanySlug||"").toLowerCase()!==String(operationTenant).toLowerCase())
    throw new Error("Entegrasyon güncellemesinin firma kapsamı eşleşmiyor.");
   setData({mainCompanySlug:operationTenant,systemCatalog:next.systemCatalog||[],companyAdapters:next.companyAdapters||[]});
   setRemoveKey("");setShowCatalog(false);
   setSelected(current=>{
    const stillPresent=next.companyAdapters?.some(x=>x.key===current&&x.selected);
    if(add&&!enabled.has(adapter.key))return adapter.key;
    if(stillPresent)return current;
    return next.companyAdapters?.find(x=>x.key==="ISNET"&&x.selected)?.key||next.companyAdapters?.find(x=>x.selected)?.key||"";
   });
   if(!add)setNotice("Entegrasyon yalnız bu firmanın listesinden kaldırıldı. Belgeler ve ayarlar korunur.");
   else setNotice(activate?"Entegrasyon firma için etkinleştirildi; gerçek bağlantısı ayrıca doğrulanacaktır.":"Entegrasyon firma için pasife alındı; geçmiş ve ayarlar korunur.");
  }catch(e){if(seq===requestSeq.current)setError(e?.message||"Firma entegrasyonu güncellenemedi.")}
  finally{if(seq===requestSeq.current)setBusy("")}
 };
 const refresh=async()=>{await load();if(typeof onRefreshStatuses==="function")try{await onRefreshStatuses()}catch{/* Parent page handles its own errors. */}};
 const isnetOption=visibleData.systemCatalog.find(x=>x.key==="ISNET");
 if(!tenant)return <div className="eam-alert">Önce ana firma seçin.</div>;

 return <main className="eam">
  <header className="eam-head">
   <div><small>e-BELGE / ENTEGRASYONLAR</small><h2>Entegrasyon Merkezi</h2><p>Firmanın seçili entegrasyonunu açın, bağlantısını ve ayarlarını tek ekranda yönetin.</p></div>
   <button type="button" disabled={Boolean(busy)||loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Yenile</button>
  </header>
  <div className="eam-toolbar">
   <div className="eam-selector">
    <label htmlFor="eam-company-integration">Firma Entegrasyonları</label>
    <div className="eam-select-wrap">
     <Layers3 size={17}/>
     <select id="eam-company-integration" aria-label="Bu Firmanın Entegrasyonları" value={active?.key||""} onChange={e=>{setSelected(e.target.value);setPanel(e.target.value==="ISNET"?"sync":"test");setRemoveKey("");setShowCatalog(false)}} disabled={loading||Boolean(error)}>
      <option value="">{loading?"Entegrasyonlar yükleniyor...":installed.length?"Entegrasyon seçin":"Henüz entegrasyon seçilmemiş"}</option>
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
      <button type="button" disabled={!canEdit} onClick={()=>void change(adapter,true,adapter.driver!==null)}><Plus size={15}/> Ekle</button>
     </div>)}</div>
    </section>}
   </div>
   <div className="eam-summary" aria-label="Firma entegrasyon özeti">
    <span><b>{installed.length}</b> seçili</span><span><b>{activeCount}</b> etkin</span>
    <span><Activity size={15}/><b>{connected}</b> oturumu doğrulanan</span>
   </div>
  </div>
  {error&&<div className="eam-alert" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {notice&&<div className="eam-ok" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  <section className="eam-detail-pane" aria-label="Seçili entegrasyon ayarları">
   {active?<><div className="eam-detail">
     <div><small>ENTEGRASYON AYARLARI · {active.key}</small><h3>{profile?.displayName||active.label}</h3><p>{status(active)}</p></div>
     <div className="eam-detail-actions">
      <button type="button" disabled={!canEdit} onClick={()=>void change(active,true,choice(active.key)?.enabled===false)}>
       {choice(active.key)?.enabled===false?<PlayCircle size={16}/>:<PauseCircle size={16}/>}
       {choice(active.key)?.enabled===false?"Etkinleştir":"Pasife Al"}
      </button>
      <button type="button" className="eam-remove" disabled={!canEdit} onClick={()=>{setRemoveKey(removeKey===active.key?"":active.key);setShowCatalog(false)}}><Trash2 size={15}/> Kaldır</button>
     </div>
    </div>
    {removeKey===active.key&&<div className="eam-remove-confirm" role="group" aria-label="Entegrasyonu kaldırmayı onayla">
      <p>Yalnız bu firmanın listesinden kaldırılır. Mevcut belgeler, İşNet şifresi ve entegrasyon ayarları silinmez.</p>
      <button type="button" disabled={!canEdit} onClick={()=>void change(active,false,false)}>Listeden Çıkar</button>
      <button type="button" onClick={()=>setRemoveKey("")}>Vazgeç</button>
    </div>}
    {choice(active.key)?.enabled===false&&<div className="eam-paused"><PauseCircle size={18}/> Bu entegrasyon firma için pasif. Ayarlar korunur, devam etmek için Etkinleştir'e basın.</div>}
    <div className="eam-service"><ShieldCheck size={18}/><div><strong>{providerService(active.key).title}</strong>
     {profile?.serviceUrl&&<code>{profile.serviceUrl}</code>}
     <p>{providerService(active.key).description}</p></div></div>
    <div className="eam-tabs" role="tablist" aria-label="Entegrasyon çalışma alanları">
     {active.key==="ISNET"&&<button type="button" role="tab" aria-selected={panel==="sync"} className={panel==="sync"?"active":""} onClick={()=>setPanel("sync")}>Belgeleri Al · XML + PDF</button>}
     <button type="button" role="tab" aria-selected={panel==="connection"} className={panel==="connection"?"active":""} onClick={()=>setPanel("connection")}>Gelişmiş İş Kuralları</button>
     <button type="button" role="tab" aria-selected={panel==="test"} className={panel==="test"?"active":""} onClick={()=>setPanel("test")}>Belge Test Merkezi</button>
     <button type="button" role="tab" aria-selected={panel==="profile"} className={panel==="profile"?"active":""} onClick={()=>setPanel("profile")}>Entegrasyonu Düzenle</button>
    </div>
    {profileError&&<div className="eam-alert" role="alert">{profileError}</div>}
    {panel==="sync"&&active.key==="ISNET"?<EBelgeIsnetPortalSync key={tenant+":sync"} activeMainCompany={activeMainCompany} openModule={openModule} enabled={choice(active.key)?.enabled!==false} onSynced={refresh}/>:
     panel==="test"?<EBelgeIntegrationTestCenter key={tenant+":"+active.key} adapter={active} activeMainCompany={activeMainCompany} profile={profile} onOpenSync={()=>setPanel("sync")} onOpenVisualStudio={()=>openModule?.("e-belge",{tabKey:"gorsel-sablonlar"})}/>:
     panel==="profile"?<EBelgeIntegrationProfileEditor key={tenant+":"+active.key} adapter={active} company={owner} profile={profile} onSaved={setProfile}/>:
     active.key==="ISNET"?<div className="eam-detail-content"><EBelgeIntegrationsWorkspace key={tenant} activeMainCompany={activeMainCompany} openModule={openModule} onOpenDocumentTest={()=>setPanel("test")}/></div>:
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
