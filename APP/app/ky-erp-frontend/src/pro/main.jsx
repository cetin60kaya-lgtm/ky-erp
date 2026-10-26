import React,{useCallback,useEffect,useMemo,useRef,useState,Suspense} from "react";
import{createRoot}from"react-dom/client";
import{House,ShieldCheck,LayoutGrid,ChartNoAxesCombined,UserRound,Search,X,ChevronRight,RefreshCw,LogOut}from"lucide-react";
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

function ProDock(){
 const {user,hasModule,logout}=useAuth();
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
   const dashboard=allowed.find(m=>m.key==="dashboard"||m.key==="ana-sayfa")||allowed[0];
   const first=dashboard&&getModuleTabs(dashboard)[0];
   if(first)goModule(dashboard.key,first[0]);else location.assign(PRO_PREFIX+"/");
 },[allowed]);
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
 const {user,isAuthenticated,loading,logout}=useAuth();
 if(loading)return <div className="ky-pro-loading"><span className="ky-pro-loading-icon">KY</span><strong>KY ERP PRO</strong><p>Güvenli oturum ve yetkiler kontrol ediliyor...</p></div>;
 if(!isAuthenticated)return <div className="ky-pro-login"><div className="ky-pro-login-bar"><a href="/guvenlik/"><ShieldCheck size={18}/> KY Güvenlik</a><strong>KY ERP PRO v4.2.0</strong></div><LoginPage onClose={()=>{}}/></div>;
 return <div className="ky-pro-app" data-role={String(user?.role||"")}><Suspense fallback={<div className="ky-pro-loading"><strong>ERP modülleri yükleniyor...</strong></div>}><LazyWorkspace/></Suspense><ProDock/></div>;
}
installAndroidRuntimeBridge();
installPersistedAuthBootstrap();
createRoot(document.getElementById("root")).render(<React.StrictMode><AuthProvider><ProApplication/></AuthProvider></React.StrictMode>);
