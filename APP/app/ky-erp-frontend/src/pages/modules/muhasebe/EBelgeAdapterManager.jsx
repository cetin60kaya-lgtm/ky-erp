import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {CheckCircle2,ChevronLeft,ChevronRight,FileCode2,FolderOpen,Layers3,Plus,RefreshCw,Search,ShieldCheck,Trash2,Building2,AlertTriangle,LockKeyhole} from "lucide-react";
import {getCompanyEBelgeAdapters,setCompanyEBelgeAdapter} from "../../../services/eBelgeAdapterApi";
import EBelgeIntegrationsWorkspace from "./EBelgeIntegrationsWorkspace";
import "./eBelgeAdapterManager.css";

const ICONS={ISNET:ShieldCheck,MANUAL:FileCode2,LOGO:Building2,MIKRO:Layers3,PARASUT:FolderOpen};
const installedStatus=(adapter,provider)=>{
 if(adapter.driver===null)return "Adaptör motoru bekliyor";
 if(adapter.key==="MANUAL")return "XML yükleme hazır";
 if(provider?.connected===true)return "Sağlayıcı oturumu doğrulandı";
 return "Giriş doğrulaması bekleniyor";
};
export default function EBelgeAdapterManager({activeMainCompany,openModule,providerStatuses=[]}){
 const tenant=activeMainCompany?.slug||activeMainCompany?.mainCompanySlug||activeMainCompany?.id||activeMainCompany?.mainCompanyId||"";
 const owner=useMemo(()=>({slug:tenant}),[tenant]);
 const [data,setData]=useState({systemCatalog:[],companyAdapters:[]});
 const [selected,setSelected]=useState("");
 const [showCatalog,setShowCatalog]=useState(false);
 const [query,setQuery]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
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
  }catch(e){if(seq===requestSeq.current)setError(e?.message||"Firmanın adaptörleri alınamadı.")}
  finally{if(seq===requestSeq.current)setLoading(false)}
 },[tenant,owner]);
 useEffect(()=>{setSelected("");setShowCatalog(false);setQuery("");setNotice("");setBusy("");void load()},[load]);
 const visibleData=data.mainCompanySlug===tenant?data:{systemCatalog:[],companyAdapters:[]};
 const enabled=useMemo(()=>new Set(visibleData.companyAdapters.filter(x=>x.selected).map(x=>x.key)),[visibleData.companyAdapters]);
 const installed=visibleData.systemCatalog.filter(x=>enabled.has(x.key));
 const available=visibleData.systemCatalog.filter(x=>!enabled.has(x.key)&&String(x.label+" "+x.description).toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
 const change=async(adapter,add)=>{
  const seq=++requestSeq.current,operationTenant=tenant;
  setBusy(adapter.key);setError("");setNotice("");
  try{
   await setCompanyEBelgeAdapter(owner,adapter.key,add);
   const next=await getCompanyEBelgeAdapters(owner);
   if(seq!==requestSeq.current)return;
   if(String(next.mainCompanySlug||"").toLowerCase()!==String(operationTenant).toLowerCase())
    throw new Error("Adaptör güncellemesinin firma kapsamı eşleşmiyor.");
   setData({mainCompanySlug:operationTenant,systemCatalog:next.systemCatalog||[],companyAdapters:next.companyAdapters||[]});
   if(!add&&selected===adapter.key)setSelected("");
   if(add){setShowCatalog(false);setSelected(adapter.key)}
   setNotice(add?"Adaptör firma listesine eklendi; gerçek bağlantısı ayrıca doğrulanacaktır.":"Adaptör yalnız firmanın seçim listesinden çıkarıldı. Belgeler ve ayarlar korunur.");
  }catch(e){if(seq===requestSeq.current)setError(e?.message||"Firma adaptör seçimi güncellenemedi.")}
  finally{if(seq===requestSeq.current)setBusy("")}
 };
 const active=visibleData.systemCatalog.find(x=>x.key===selected&&enabled.has(x.key));
 const status=(adapter)=>installedStatus(adapter,providerStatuses.find(x=>String(x.key).toUpperCase()===adapter.key));
 if(!tenant)return <div className="eam-alert">Önce ana firma seçin.</div>;
 return <main className="eam">
  <header className="eam-head"><div><small>e-BELGE / FİRMA BAZLI ENTEGRASYONLAR</small><h2>Entegrasyon Merkezi</h2><p>Sistem kataloğundaki tüm adaptörler ile firmanın seçtiği adaptörler ayrıdır.</p></div>
   <button type="button" disabled={Boolean(busy)||loading} onClick={()=>void load()}><RefreshCw size={16}/> Yenile</button>
  </header>
  {error&&<div className="eam-alert" role="alert"><AlertTriangle size={16}/>{error}</div>}
  {notice&&<div className="eam-ok" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  {active ? <>
   <div className="eam-breadcrumb"><button type="button" onClick={()=>setSelected("")}><ChevronLeft size={17}/> Firmanın Entegrasyonlarına Dön</button><ChevronRight size={15}/>{active.label}</div>
   <div className="eam-detail"><div><small>ADAPTÖR AYARLARI</small><h3>{active.label}</h3><p>{active.description}</p></div><span className="eam-state">{status(active)}</span></div>
   {active.key==="ISNET" ? <EBelgeIntegrationsWorkspace activeMainCompany={activeMainCompany} openModule={openModule}/> :
    active.key==="MANUAL" ? <section className="eam-detail-body">
     <div className="eam-instruction"><FileCode2 size={24}/><div><strong>Manuel XML / PDF Belge Havuzu</strong><p>UBL-TR XML asıl kaynak olarak kaydedilir. PDF/JPEG/PNG görseller yalnız sunum ve kontrol çıktısıdır. Hazır olmayan OCR işlevleri aktif gösterilmez.</p></div></div>
     <button className="eam-main-button" type="button" onClick={()=>openModule?.("e-belge",{tabKey:"belge-havuzu"})}>Belge Havuzunu Aç <ChevronRight size={16}/></button>
     <p>Firma bazlı belge görsel şablonları Belge Havuzu altında yönetilir. Kaldırma mevcut arşivleri etkilemez.</p>
    </section>:
    <section className="eam-detail-body">
     <div className="eam-instruction"><LockKeyhole size={24}/><div><strong>Sistem kataloğunda tanımlı — henüz kullanıma hazır değil</strong><p>Bu adaptörün gerçek bağlayıcısı, kimlik doğrulaması ve XML indirme akışı geliştirilmedi. Firma listesine eklenmesi bir sağlayıcı bağlantısı oluşturmaz.</p></div></div>
     <div className="eam-planned"><span>Sağlayıcı oturumu <b>Bekliyor</b></span><span>XML sorgu ve indirme <b>Bekliyor</b></span><span>Belge eşleştirme <b>Planlandı</b></span><span>Hata/işlem geçmişi <b>Planlandı</b></span></div>
    </section>}
  </> : <>
   <section className="eam-section">
    <div className="eam-section-title"><div><h3>Bu Firmanın Adaptörleri</h3><p>Yalnız bu firma için ekledikleriniz görünür. Birine tıklayınca kendi ayarları açılır.</p></div>
     <button className="eam-main-button" type="button" disabled={Boolean(busy)||loading||Boolean(error)} onClick={()=>{setShowCatalog(x=>!x);setQuery("")}}><Plus size={16}/>{showCatalog?"Kataloğu Kapat":"Adaptör Ekle"}</button></div>
    {loading?<div className="eam-empty">Adaptörler yükleniyor...</div>:error?<div className="eam-empty">Firma adaptörleri yüklenemedi. Yenile düğmesiyle tekrar deneyin.</div>:installed.length===0?
     <div className="eam-empty"><Layers3 size={25}/><strong>Henüz adaptör seçilmemiş.</strong><p>İhtiyacınız olanları sistem kataloğundan ekleyin.</p></div>:
     <div className="eam-list">{installed.map(adapter=>{
      const Icon=ICONS[adapter.key]||Layers3;
      return <div key={adapter.key} className="eam-item">
       <button className="eam-item-main" type="button" onClick={()=>setSelected(adapter.key)}>
        <span className="eam-item-icon"><Icon size={22}/></span>
        <span className="eam-item-caption"><strong>{adapter.label}</strong><small>{adapter.description}</small></span>
        <span className="eam-state">{status(adapter)}</span><ChevronRight size={17}/>
       </button>
       <button className="eam-remove" type="button" disabled={Boolean(busy)} onClick={()=>void change(adapter,false)} title="Yalnız bu firmanın listesinden kaldırır; geçmiş belgeleri silmez"><Trash2 size={16}/> Kaldır</button>
      </div>;
     })}</div>}
   </section>
   {showCatalog&&<section className="eam-section">
    <div className="eam-section-title"><div><h3>Sistem Adaptör Kataloğu</h3><p>KY ERP'nin kurulu adaptör tanımları. Diğer firmaların tercihlerinden bağımsızdır.</p></div>
     <label className="eam-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Adaptör ara" aria-label="Adaptör ara"/></label>
    </div>
    <div className="eam-grid">{available.map(adapter=>{
     const Icon=ICONS[adapter.key]||Layers3;
     return <article className="eam-option" key={adapter.key}><Icon size={24}/><strong>{adapter.label}</strong><p>{adapter.description}</p>
      <small>{adapter.driver===null?"Henüz bağlayıcı motoru yok":"Gerçek bağlantı ve yetki ayrıca doğrulanır"}</small>
      <button type="button" disabled={Boolean(busy)} onClick={()=>void change(adapter,true)}><Plus size={16}/> Bu Firmaya Ekle</button>
     </article>;
    })}{available.length===0&&<div className="eam-empty">Başka adaptör bulunamadı.</div>}</div>
   </section>}
   <p className="eam-foot"><ShieldCheck size={16}/> Kaldırılan adaptörün geçmiş belgeleri, firma ayarları ve KY ERP sistem sürücüsü silinmez.</p>
  </>}
 </main>;
}
