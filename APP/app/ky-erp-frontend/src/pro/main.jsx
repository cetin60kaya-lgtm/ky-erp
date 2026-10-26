import React,{useCallback,useEffect,useMemo,useRef,useState,Suspense} from "react";
import{createRoot}from"react-dom/client";
import{House,ShieldCheck,LayoutGrid,ChartNoAxesCombined,UserRound,Search,X,ChevronRight}from"lucide-react";
import{AuthProvider,useAuth}from"../context/AuthContext";
import{installPersistedAuthBootstrap}from"../context/authBootstrap";
import{installAndroidRuntimeBridge}from"../utils/installAndroidRuntimeBridge";
import{MODULES,getModuleTabs}from"../app/moduleRegistry";
import LoginPage from"../pages/LoginPage";
import "../App.css";
import "../styles/canonical-workspace-ui.css";
import "../styles/module-action-popups.css";
import "../styles/canonical-dialog-resize.css";
import "./pro.css";

const PRO_PREFIX="/guvenlik/pro";
const OWNER_ROLES=new Set(["SUPER_ADMIN","ADMIN"]);
const LazyWorkspace=React.lazy(async()=>{
  await Promise.all([
    import("../app/pdksModuleRegistryPatch"),
    import("../app/applicationSettingsModulePatch"),
  ]);
  const [{default:AppV3},{ActiveCompanyProvider},{installAuthenticatedAssetBridge},{installMuhasebeDocumentSanitizer},{installCanonicalDialogSizing}]=await Promise.all([
    import("../AppV3.jsx"),
    import("../context/ActiveCompanyContext"),
    import("../utils/installAuthenticatedAssetBridge"),
    import("../utils/installMuhasebeDocumentSanitizer"),
    import("../utils/installCanonicalDialogSizing")
  ]);
  installAuthenticatedAssetBridge();
  installMuhasebeDocumentSanitizer();
  installCanonicalDialogSizing();
  return{default:function FullErpWorkspace(){return <ActiveCompanyProvider><AppV3/></ActiveCompanyProvider>}};
});

function goModule(module,tab){
  const url=`${PRO_PREFIX}/${encodeURIComponent(module)}/${encodeURIComponent(tab)}`;
  if(location.pathname!==url){history.pushState({},"",url);window.dispatchEvent(new PopStateEvent("popstate"));}
}

function ModuleChooser({opened,onClose,allowed}){
 const ref=useRef(null);
 const [search,setSearch]=useState("");
 useEffect(()=>{
   const dialog=ref.current;
   if(!dialog)return;
   if(opened&&!dialog.open)dialog.showModal();
   if(!opened&&dialog.open)dialog.close();
 },[opened]);
 const groups=useMemo(()=>allowed.map(module=>({
    module,tabs:getModuleTabs(module).filter(tab=>Array.isArray(tab)&&tab[0]),
  })).filter(row=>row.tabs.length),[allowed]);
 const filtered=groups.map(row=>({...row,tabs:row.tabs.filter(tab=>(
   !search||`${row.module.label} ${tab[1]}`.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))
 ))})).filter(row=>row.tabs.length);
 return <dialog ref={ref} className="ky-pro-dialog" aria-label="Tüm KY ERP modülleri"
   onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
  <div className="ky-pro-sheet-header"><div><span>KY ERP PRO · TÜM İŞLEMLER</span><h2>Modüller ve Sekmeler</h2><p>Yetkili olduğunuz bütün ERP işlemleri burada.</p></div>
   <button type="button" className="ky-pro-icon-button" onClick={onClose} aria-label="Kapat"><X size={21}/></button></div>
  <label className="ky-pro-search"><Search size={19}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Modül veya işlem ara..." aria-label="Modül veya işlem ara"/></label>
  <div className="ky-pro-module-list">
   {filtered.map(({module,tabs})=><details key={module.key} open={Boolean(search)} className="ky-pro-module">
     <summary><strong>{module.label}</strong><small>{tabs.length} işlem</small><ChevronRight size={18}/></summary>
     <div className="ky-pro-module-tabs">{tabs.map(tab=><button key={tab[0]} type="button" onClick={()=>{goModule(module.key,tab[0]);onClose()}}>{tab[1]}<ChevronRight size={16}/></button>)}</div>
   </details>)}
   {!filtered.length?<p className="ky-pro-no-results">Bu aramaya uygun yetkili işlem bulunamadı.</p>:null}
  </div>
  <div className="ky-pro-sheet-foot">{groups.length} modül · {groups.reduce((n,g)=>n+g.tabs.length,0)} işlem · Eksik ekran yerine canlı ERP modülü açılır</div>
 </dialog>;
}

function ProHome(){
 const {user,hasModule}=useAuth();
 const [search,setSearch]=useState("");
 const owner=OWNER_ROLES.has(String(user?.role||"").toUpperCase());
 const allowed=MODULES.filter(m=>owner||Boolean(hasModule(m.permissionKey||m.key.toUpperCase())));
 const visible=allowed.filter(m=>String(m.label||"").toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")));
 const fullCount=allowed.reduce((sum,m)=>sum+getModuleTabs(m).length,0);
 return <main className="ky-pro-home" aria-label="KY ERP PRO ana sayfa">
   <section className="ky-pro-home-hero">
    <div className="ky-pro-home-top"><span>KY ERP PRO 4.2</span><ShieldCheck size={21}/></div>
    <h1>İşletmeniz elinizde.</h1>
    <p>{owner?"Bütün firmaların yetkili yönetim ve operasyon ekranları.":"Hesabınıza tanımlı ERP modülleri ve günlük işlemler."}</p>
    <div className="ky-pro-home-stats"><strong>{allowed.length} modül</strong><span>·</span><strong>{fullCount} işlem</strong><span>·</span><span>Tek telefon uygulaması</span></div>
   </section>
   <div className="ky-pro-home-tools">
    <button type="button" onClick={()=>location.assign("/guvenlik/")}><ShieldCheck size={22}/><span><b>Güvenlik Onayları</b><small>Giriş, cihaz, oturum ve kod</small></span><ChevronRight size={17}/></button>
    <button type="button" onClick={()=>{const m=allowed.find(x=>x.key==="muhasebe");const t=m&&getModuleTabs(m)[0];if(m&&t)goModule(m.key,t[0])}}><ChartNoAxesCombined size={22}/><span><b>Genel Yönetim</b><small>Muhasebe ve operasyon</small></span><ChevronRight size={17}/></button>
   </div>
   <div className="ky-pro-home-title"><div><span>TÜM ERİŞİLEBİLİR MODÜLLER</span><h2>Çalışma Alanları</h2></div><LayoutGrid size={20}/></div>
   <label className="ky-pro-search ky-pro-home-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Modül ara..." aria-label="Modüllerde ara"/></label>
   <div className="ky-pro-home-modules">{visible.map((m,index)=>{
     const tabs=getModuleTabs(m),first=tabs[0];return <button key={m.key} type="button" style={{"--pro-card-shade":index%5}} onClick={()=>first&&goModule(m.key,first[0])}>
       <span className="ky-pro-home-module-icon"><LayoutGrid size={22}/></span><span><b>{m.label}</b><small>{tabs.length} gerçek ERP işlemi</small></span><ChevronRight size={18}/>
     </button>;
   })}</div>
   {!visible.length?<p className="ky-pro-no-results">Aramanıza uygun modül bulunamadı.</p>:null}
   <footer className="ky-pro-home-note">Tüm işlemler sunucudaki mevcut kullanıcı ve firma yetkileriyle açılır. Kullanıcı yetkisi olmayan işlem gösterilmez.</footer>
 </main>;
}

function ProDock(){
 const {user,hasModule}=useAuth();
 const [menuOpen,setMenuOpen]=useState(false);
 const [currentPath,setCurrentPath]=useState(location.pathname);
 const owner=OWNER_ROLES.has(String(user?.role||"").toUpperCase());
 const allowed=useMemo(()=>MODULES.filter(m=>owner||Boolean(hasModule(m.permissionKey||m.key.toUpperCase()))),[hasModule,owner]);
 useEffect(()=>{
   const sync=()=>setCurrentPath(location.pathname);
   window.addEventListener("popstate",sync);
   return()=>window.removeEventListener("popstate",sync);
 },[]);
 const onHome=useCallback(()=>{
   if(location.pathname!==PRO_PREFIX+"/"){history.pushState({},"",PRO_PREFIX+"/");window.dispatchEvent(new PopStateEvent("popstate"));}
 },[]);
 const onAnalysis=useCallback(()=>{
   const module=allowed.find(m=>m.key==="muhasebe")||allowed[0];
   const first=module&&getModuleTabs(module).find(tab=>/ozet|analiz|rapor|dashboard/i.test(tab[0]))||module&&getModuleTabs(module)[0];
   if(module&&first)goModule(module.key,first[0]);
 },[allowed]);
 const security=()=>location.assign("/guvenlik/");
 const isAnalytic=/ozet|dashboard|rapor|analiz/i.test(currentPath);
 return <>
   <header className="ky-pro-header"><div className="ky-pro-brand"><span className="ky-pro-mark">KY</span><div><strong>KY ERP <em>PRO</em></strong><small>{owner?"Sistem Sahibi · Tam Yönetim":"Yetkili ERP Kullanıcısı"} · v4.2.0</small></div></div>
    <button type="button" className="ky-pro-header-action" onClick={security}><ShieldCheck size={18}/>Güvenlik</button></header>
   <nav className="ky-pro-dock" aria-label="KY ERP PRO telefon gezinmesi">
     <button type="button" onClick={onHome}><House size={23}/><span>Ana Sayfa</span></button>
     <button type="button" onClick={security}><ShieldCheck size={23}/><span>Güvenlik</span></button>
     <button type="button" className="ky-pro-dock-main" onClick={()=>setMenuOpen(true)} aria-haspopup="dialog"><LayoutGrid size={24}/><span>Modüller</span></button>
     <button type="button" className={isAnalytic?"is-active":""} onClick={onAnalysis}><ChartNoAxesCombined size={23}/><span>Analiz</span></button>
     <button type="button" onClick={()=>setMenuOpen(true)}><UserRound size={23}/><span>Menü</span></button>
   </nav>
   <ModuleChooser opened={menuOpen} onClose={()=>setMenuOpen(false)} allowed={allowed}/>
   <div className="ky-pro-sr-only" role="status" aria-live="polite">İşlemler mevcut KY ERP rol ve firma yetkileriyle korunur.</div>
 </>;
}
function ProApplication(){
 const {user,isAuthenticated,loading}=useAuth();
 const [home,setHome]=useState(()=>location.pathname===PRO_PREFIX||location.pathname===PRO_PREFIX+"/");
 useEffect(()=>{const update=()=>setHome(location.pathname===PRO_PREFIX||location.pathname===PRO_PREFIX+"/");window.addEventListener("popstate",update);return()=>window.removeEventListener("popstate",update)},[]);
 if(loading)return <div className="ky-pro-loading"><span className="ky-pro-loading-icon">KY</span><strong>KY ERP PRO</strong><p>Güvenli oturum ve yetkiler kontrol ediliyor...</p></div>;
 if(!isAuthenticated)return <div className="ky-pro-login"><div className="ky-pro-login-bar"><a href="/guvenlik/"><ShieldCheck size={18}/> KY Güvenlik</a><strong>KY ERP PRO v4.2.0</strong></div><LoginPage onClose={()=>{}}/></div>;
 return <div className="ky-pro-app" data-role={String(user?.role||"")}>{home?<ProHome/>:<Suspense fallback={<div className="ky-pro-loading"><strong>ERP modülleri yükleniyor...</strong></div>}><LazyWorkspace/></Suspense>}<ProDock/></div>;
}
installAndroidRuntimeBridge();
installPersistedAuthBootstrap();
createRoot(document.getElementById("root")).render(<React.StrictMode><AuthProvider><ProApplication/></AuthProvider></React.StrictMode>);
