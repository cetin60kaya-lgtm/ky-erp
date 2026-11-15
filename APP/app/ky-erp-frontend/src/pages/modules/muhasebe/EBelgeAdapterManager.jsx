import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {Activity,AlertTriangle,CheckCircle2,ChevronRight,FileCode2,FolderOpen,Layers3,Plus,RefreshCw,Search,ShieldCheck,Trash2,Building2,LockKeyhole,PauseCircle,PlayCircle,Settings2,XCircle} from "lucide-react";
import {getCompanyEBelgeAdapters,setCompanyEBelgeAdapter} from "../../../services/eBelgeAdapterApi";
import EBelgeIntegrationsWorkspace from "./EBelgeIntegrationsWorkspace";
import "./eBelgeAdapterManager.css";

const ICONS={ISNET:ShieldCheck,MANUAL:FileCode2,LOGO:Building2,MIKRO:Layers3,PARASUT:FolderOpen};
const connectionStatus=(adapter,provider,entry)=>{
 if(adapter.driver===null)return "Bağlantı motoru geliştirme bekliyor";
 if(entry?.enabled===false)return "Firma için pasif";
 if(adapter.key==="MANUAL")return "XML yükleme kullanılabilir";
 if(provider?.connected===true)return "İşNet sağlayıcı oturumu doğrulandı";
 if(provider?.status==="SESSION_EXPIRED")return "İşNet oturumu süresi doldu";
 if(provider?.status==="NOT_CONFIGURED")return "İşNet firma bağlantısı kurulmadı";
 return "Sağlayıcı bağlantısı doğrulanmadı";
};

export default function EBelgeAdapterManager({activeMainCompany,openModule,providerStatuses=[],onRefreshStatuses}){
 const tenant=activeMainCompany?.slug||activeMainCompany?.mainCompanySlug||activeMainCompany?.id||activeMainCompany?.mainCompanyId||"";
 const owner=useMemo(()=>({slug:tenant}),[tenant]);
 const [data,setData]=useState({mainCompanySlug:"",systemCatalog:[],companyAdapters:[]});
 const [selected,setSelected]=useState("");
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
    throw new Error("Firma adaptör yanıtının şirket kapsamı eşleşmiyor.");
   setData({mainCompanySlug:tenant,systemCatalog:result.systemCatalog||[],companyAdapters:result.companyAdapters||[]});
   setSelected(current=>current||result.companyAdapters?.find(x=>x.key==="ISNET"&&x.selected)?.key||result.companyAdapters?.find(x=>x.selected)?.key||"");
  }catch(e){if(seq===requestSeq.current)setError(e?.message||"Firmanın adaptörleri alınamadı.")}
  finally{if(seq===requestSeq.current)setLoading(false)}
 },[tenant,owner]);
 useEffect(()=>{setSelected("");setShowCatalog(false);setQuery("");setNotice("");setBusy("");setRemoveKey("");void load();return()=>{requestSeq.current+=1}},[load]);

 const visibleData=data.mainCompanySlug===tenant?data:{systemCatalog:[],companyAdapters:[]};
 const enabled=useMemo(()=>new Set(visibleData.companyAdapters.filter(x=>x.selected).map(x=>x.key)),[visibleData.companyAdapters]);
 const installed=visibleData.systemCatalog.filter(x=>enabled.has(x.key));
 const available=visibleData.systemCatalog.filter(x=>!enabled.has(x.key)&&String(x.label+" "+x.description).toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
 const choice=(key)=>visibleData.companyAdapters.find(x=>x.key===key);
 const active=visibleData.systemCatalog.find(x=>x.key===selected&&enabled.has(x.key));
 const activeCount=installed.filter(x=>choice(x.key)?.enabled!==false).length;
 const provider=(adapter)=>providerStatuses.find(x=>String(x.key||"").toUpperCase()===adapter.key);
 const status=(adapter)=>connectionStatus(adapter,provider(adapter),choice(adapter.key));
 const connected=installed.filter(x=>x.key==="ISNET"&&choice(x.key)?.enabled!==false&&provider(x)?.connected===true).length;
 const canEdit=!busy&&!loading&&!error;

 const change=async(adapter,add,activate=true)=>{
  if(busy)return;
  const seq=++requestSeq.current,operationTenant=tenant;
  setBusy(adapter.key);setError("");setNotice("");
  try{
   await setCompanyEBelgeAdapter(owner,adapter.key,add,activate);
   const next=await getCompanyEBelgeAdapters(owner);
   if(seq!==requestSeq.current)return;
   if(String(next.mainCompanySlug||"").toLowerCase()!==String(operationTenant).toLowerCase())
    throw new Error("Adaptör güncellemesinin firma kapsamı eşleşmiyor.");
   setData({mainCompanySlug:operationTenant,systemCatalog:next.systemCatalog||[],companyAdapters:next.companyAdapters||[]});
   setRemoveKey("");
   if(!add&&selected===adapter.key)setSelected("");
   if(add&&!enabled.has(adapter.key)){setShowCatalog(false);setSelected(adapter.key)}
   if(!add)setNotice("Adaptör yalnız firmanın seçim listesinden çıkarıldı. Belgeler ve ayarlar korunur.");
   else setNotice(activate?"Adaptör firma için etkinleştirildi; gerçek bağlantısı ayrıca doğrulanacaktır.":"Adaptör firma için pasife alındı; geçmiş ve ayarlar korunur.");
  }catch(e){if(seq===requestSeq.current)setError(e?.message||"Firma adaptör seçimi güncellenemedi.")}
  finally{if(seq===requestSeq.current)setBusy("")}
 };

 const refresh=async()=>{await load();if(typeof onRefreshStatuses==="function")try{await onRefreshStatuses()}catch{/* Main page reports its error. */}};
 const isnetOption=visibleData.systemCatalog.find(x=>x.key==="ISNET");
 if(!tenant)return <div className="eam-alert">Önce ana firma seçin.</div>;

 return <main className="eam">
  <header className="eam-head">
   <div><small>e-BELGE / FİRMA BAZLI ENTEGRASYONLAR</small><h2>Entegrasyon Merkezi</h2><p>Firmanın kullandığı adaptörler solda, seçilen bağlantının ayarları sağda. Platform kataloğu ayrı tutulur.</p></div>
   <button type="button" disabled={Boolean(busy)||loading} onClick={()=>void refresh()}><RefreshCw size={16}/> Yenile</button>
  </header>
  <div className="eam-summary" aria-label="Firma adaptör özeti">
   <span><Layers3 size={17}/> <b>{installed.length}</b> seçili</span>
   <span><PlayCircle size={17}/> <b>{activeCount}</b> etkin</span>
   <span><Activity size={17}/> <b>{connected}</b> oturumu doğrulanan</span>
  </div>
  {error&&<div className="eam-alert" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {notice&&<div className="eam-ok" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  <div className="eam-workspace">
   <aside className="eam-sidebar" aria-label="Bu firmanın adaptörleri">
    <div className="eam-side-heading"><div><h3>Bu Firmanın Adaptörleri</h3><small>Yalnız bu firmada seçilenler</small></div>
     <button type="button" className="eam-main-button" disabled={!canEdit} onClick={()=>{setShowCatalog(x=>!x);setQuery("");setRemoveKey("")}}><Plus size={16}/> Adaptör Ekle</button>
    </div>
    {loading?<div className="eam-empty">Adaptörler yükleniyor...</div>:error?<div className="eam-empty">Firma adaptörleri yüklenemedi. Yenile düğmesiyle tekrar deneyin.</div>:installed.length===0?
     <div className="eam-empty"><Layers3 size={25}/><strong>Henüz adaptör seçilmemiş.</strong>
      <p>Mevcut İşNet bağlantınızı kullanmak için ekleyin veya sistem kataloğunu açın.</p>
      {isnetOption&&<button type="button" className="eam-main-button" disabled={!canEdit} onClick={()=>void change(isnetOption,true,true)}>İşNet'i Ekle ve Ayarla</button>}
     </div>:
     <div className="eam-list">{installed.map(adapter=>{
      const Icon=ICONS[adapter.key]||Layers3;
      const entry=choice(adapter.key),isActive=entry?.enabled!==false;
      return <div key={adapter.key} className={"eam-item "+(selected===adapter.key?"selected":"")}>
       <button className="eam-item-main" type="button" aria-current={selected===adapter.key?"page":undefined} onClick={()=>{setSelected(adapter.key);setRemoveKey("");setShowCatalog(false)}}>
        <span className="eam-item-icon"><Icon size={20}/></span>
        <span className="eam-item-caption"><strong>{adapter.label}</strong><small>{status(adapter)}</small></span><ChevronRight size={16}/>
       </button>
       <div className="eam-item-tools">
        <button type="button" className={isActive?"eam-state-control active":"eam-state-control"} disabled={!canEdit} title={isActive?"Firma için pasife al":"Firma için etkinleştir"}
         onClick={()=>void change(adapter,true,!isActive)}>{isActive?<PauseCircle size={14}/>:<PlayCircle size={14}/>} {isActive?"Pasife Al":"Etkinleştir"}</button>
        <button className="eam-remove" type="button" disabled={!canEdit} onClick={()=>setRemoveKey(removeKey===adapter.key?"":adapter.key)} title="Yalnız bu firmanın seçiminden kaldırır"><Trash2 size={14}/> Kaldır</button>
       </div>
       {removeKey===adapter.key&&<div className="eam-remove-confirm" role="group" aria-label="Adaptörü kaldırmayı onayla">
        <p>Yalnız bu firmanın listesinden kaldırılır. Eski belgeler ve kayıtlı ayarlar silinmez.</p>
        <button type="button" onClick={()=>void change(adapter,false,false)} disabled={!canEdit}>Listeden Çıkar</button>
        <button type="button" onClick={()=>setRemoveKey("")}>Vazgeç</button>
       </div>}
      </div>;
     })}</div>}
    {showCatalog&&<section className="eam-catalog">
     <div className="eam-section-title"><div><h3>Sistem Adaptör Kataloğu</h3><p>Kurulu adaptörleri seçili firmaya ekleyin.</p></div>
      <button type="button" title="Kataloğu kapat" onClick={()=>setShowCatalog(false)}><XCircle size={17}/></button></div>
     <label className="eam-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Adaptör ara" aria-label="Adaptör ara"/></label>
     <div className="eam-grid">{available.map(adapter=>{
      const Icon=ICONS[adapter.key]||Layers3;
      return <article className="eam-option" key={adapter.key}><Icon size={21}/><div><strong>{adapter.label}</strong><p>{adapter.description}</p><small>{adapter.driver===null?"Henüz bağlayıcı motoru yok":"Gerçek bağlantı ve yetki ayrıca doğrulanır"}</small></div>
       <button type="button" disabled={!canEdit} onClick={()=>void change(adapter,true,true)}><Plus size={15}/> Bu Firmaya Ekle</button>
      </article>
     })}{available.length===0&&<div className="eam-empty">Başka adaptör bulunamadı.</div>}</div>
    </section>}
   </aside>
   <section className="eam-detail-pane" aria-label="Seçili adaptör ayarları">
    {active?<><div className="eam-detail">
      <div><small>ADAPTÖR AYARLARI · {active.key}</small><h3>{active.label}</h3><p>{active.description}</p></div>
      <div className="eam-detail-actions"><span className="eam-state">{status(active)}</span>
       <button type="button" disabled={!canEdit} onClick={()=>void change(active,true,choice(active.key)?.enabled===false)}>
        {choice(active.key)?.enabled===false?<PlayCircle size={15}/>:<PauseCircle size={15}/>}
        {choice(active.key)?.enabled===false?"Etkinleştir":"Pasife Al"}
       </button>
      </div>
     </div>
     {choice(active.key)?.enabled===false&&<div className="eam-paused"><PauseCircle size={18}/> Bu adaptör firma için pasif. Ayarlar korunur; yeniden kullanmak için Etkinleştir'e basın.</div>}
     {active.key==="ISNET" ? <div className="eam-detail-content"><EBelgeIntegrationsWorkspace key={tenant} activeMainCompany={activeMainCompany} openModule={openModule}/></div> :
      active.key==="MANUAL" ? <div className="eam-detail-body">
       <div className="eam-instruction"><FileCode2 size={24}/><div><strong>Manuel XML / PDF Belge Havuzu</strong><p>UBL-TR XML asıl kaynaktır. PDF/JPEG/PNG yalnız sunum ve kontrol içindir. OCR hazır değilse belge kesin kayıt yapılmaz.</p></div></div>
       <button className="eam-main-button" type="button" disabled={choice(active.key)?.enabled===false} onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}><FolderOpen size={16}/> Belge Havuzunu Aç</button>
      </div>:
      <div className="eam-detail-body"><div className="eam-instruction"><LockKeyhole size={24}/><div><strong>Bağlayıcı motoru henüz hazır değil</strong><p>Logo, Mikro veya Paraşüt için sahte giriş ekranı ya da çalışıyor bilgisi verilmez. Gerçek sürücü geliştirilmeden yalnız katalog seçimi yapılabilir.</p></div></div><div className="eam-planned"><span>Sağlayıcı oturumu <b>Bekliyor</b></span><span>XML sorgu / indirme <b>Bekliyor</b></span></div></div>}
    </>:
    <div className="eam-detail-placeholder"><Settings2 size={32}/><h3>Bağlantı ayarlarını açın</h3><p>Soldan bir adaptör seçin; yalnız o adaptörün bağlantı, firma ve otomasyon kuralları gösterilir.</p>
     {installed.length===0&&isnetOption&&<button className="eam-main-button" disabled={!canEdit} type="button" onClick={()=>void change(isnetOption,true,true)}><Plus size={16}/> İşNet'i Ekle</button>}
    </div>}
   </section>
  </div>
  <p className="eam-foot"><ShieldCheck size={16}/> Kaldırma yalnız firma seçimini değiştirir. Geçmiş faturalar, XML/PDF, İşNet ayarları ve sistem adaptörleri silinmez.</p>
 </main>;
}
