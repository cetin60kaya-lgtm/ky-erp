import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { LayoutDashboard, Users, Building2, UserRoundCog, CreditCard, ShieldCheck, KeyRound, Settings2, Database, GitCompareArrows, Archive, Package, History, ChevronRight } from "lucide-react";
import AdminSystemOverview from "./AdminSystemOverview";
import AdminCompanyOverview from "./AdminCompanyOverview";
import AdminUsersPanel from "./AdminUsersPanel";
import AdminCompanySettings from "./AdminCompanySettings";
import AdminCompanyAuthority from "./AdminCompanyAuthority";
import AdminCompanyBilling from "./AdminCompanyBilling";
import AdminOwnerSecurity from "./AdminOwnerSecurity";
import SecurityCenterPanel from "./SecurityCenterPanel";
import AdminApplicationSettings from "./AdminApplicationSettings";
import AdminStorageCenter from "./AdminStorageCenter";
import AdminMappings from "./AdminMappings";
import AdminBackupLogs from "./AdminBackupLogs";
import AdminBuildCenter from "./AdminBuildCenter";
import AdminReleaseHistory from "./AdminReleaseHistory";
import "./AdminPlatformHub.css";
const ALL_GROUPS = {
 management:{label:"Yönetim",description:"Firma, kullanıcı, yetki ve paket işlemleri.",panels:[
 ["overview","Genel Bakış","Durum, bekleyen onaylar ve kontroller",LayoutDashboard],
 ["users","Kullanıcılar","Kişi ekleme, roller ve modül yetkileri",Users],
 ["companies","Firmalar","Firma kartı, PDKS politikası ve yedek",Building2],
 ["authority","Firma Yetkilileri","Firma sahibi atama ve yetki kaldırma",UserRoundCog],
 ["billing","Paket ve Ücretler","Süre, fiyat ve hareket geçmişi",CreditCard]]},
 security:{label:"Güvenlik",description:"Oturumlar, giriş onayları ve hesap koruması.",panels:[
 ["securityCenter","Güvenlik Merkezi","Giriş, cihaz, bildirim ve oturumlar",ShieldCheck],
 ["owner","Süper Yönetici","Kurtarma, MFA ve yönetici hesabı",KeyRound]]},
 system:{label:"Sistem",description:"Uygulamanın teknik ayar ve izleme ekranları.",panels:[
 ["application","Uygulama Ayarları","Hızlı menü ve arayüz tercihleri",Settings2],
 ["storage","Dosya ve Depolama","Klasör atamaları, bağlantılar ve agent",Database],
 ["mappings","Firma / Ürün Eşleştirme","Fatura ve ürün adı eşleştirmeleri",GitCompareArrows],
 ["backup","Yedek ve Kayıtlar","Yedekleme, geri yükleme ve günlükler",Archive],
 ["build","Windows Build","Kaynak, sürüm ve kurulum üretimi",Package],
 ["history","Güncelleme Geçmişi","PR, commit, test ve yayın kanıtları",History]]},
};
const COMPANY_GROUPS={
 management:{label:"Firma Yönetimi",description:"Yalnız kendi firmanızdaki kullanıcı ve girişler.",panels:[
 ["overview","Firma Özeti","Firma durumu ve bekleyen onaylar",LayoutDashboard],
 ["users","Kullanıcılar","Kendi firmanızın kullanıcı ve yetkileri",Users],
 ["authority","Firma Yetkisi","Firma sahibi yetki bilgileri",UserRoundCog]]},
 security:{label:"Giriş Güvenliği",description:"Firma kapsamındaki onaylı cihazlar ve oturumlar.",panels:[
 ["securityCenter","Güvenlik Merkezi","Giriş onayları ve cihazlar",ShieldCheck]]}
};
const ROUTES={
 "admin-yonetim-ozeti":["management","overview"],"kullanicilar":["management","users"],
 "ana-firma-ayarlar":["management","companies"],"firma-ucretlendirme":["management","billing"],
 "admin-guvenlik":["security","securityCenter"],"uygulama-sahibi":["security","owner"],
 "giris-onaylari":["security","securityCenter"],"admin-sistem":["system","application"],
 "uygulama-ayarlari":["system","application"],"dosya-klasor-yonetimi":["system","storage"],
 "eslestirmeler":["system","mappings"],"yedekleme-loglar":["system","backup"],
 "surum-merkezi":["system","build"],"guncelleme-gecmisi":["system","history"],
};
function allowedTarget(tab,groups){
 const [group,panel]=ROUTES[String(tab||"")]||["management","overview"];
 return groups[group]?.panels.some(([key])=>key===panel)?[group,panel]:["management","overview"];
}
export default function AdminPlatformHub({activeTab,activeMainCompany}){
 const {user}=useAuth();
 const owner=["SUPER_ADMIN","ADMIN"].includes(String(user?.role||"").toUpperCase());
 const groups=owner?ALL_GROUPS:COMPANY_GROUPS;
 const initial=allowedTarget(activeTab,groups);
 const [group,setGroup]=useState(initial[0]),[panel,setPanel]=useState(initial[1]);
 useEffect(()=>{const [g,p]=allowedTarget(activeTab,groups);setGroup(g);setPanel(p)},[activeTab,owner]);
 const current=groups[group]||groups.management;
 const selected=current.panels.find(([key])=>key===panel)||current.panels[0];
 const content=useMemo(()=>{
  if(panel==="overview")return owner?<AdminSystemOverview activeMainCompany={activeMainCompany}/>:<AdminCompanyOverview activeMainCompany={activeMainCompany}/>;
  if(panel==="users")return <AdminUsersPanel activeMainCompany={activeMainCompany}/>;
  if(panel==="authority")return <AdminCompanyAuthority activeMainCompany={activeMainCompany}/>;
  if(panel==="securityCenter")return <SecurityCenterPanel/>;
  if(!owner)return <AdminCompanyOverview activeMainCompany={activeMainCompany}/>;
  if(panel==="companies")return <AdminCompanySettings activeMainCompany={activeMainCompany}/>;
  if(panel==="billing")return <AdminCompanyBilling activeMainCompany={activeMainCompany}/>;
  if(panel==="owner")return <AdminOwnerSecurity/>;
  if(panel==="application")return <AdminApplicationSettings/>;
  if(panel==="storage")return <AdminStorageCenter activeMainCompany={activeMainCompany}/>;
  if(panel==="mappings")return <AdminMappings activeMainCompany={activeMainCompany}/>;
  if(panel==="backup")return <AdminBackupLogs activeMainCompany={activeMainCompany}/>;
  if(panel==="build")return <AdminBuildCenter/>;
  if(panel==="history")return <AdminReleaseHistory/>;
  return <AdminSystemOverview activeMainCompany={activeMainCompany}/>;
 },[panel,activeMainCompany,owner]);
 return <div className="aph-page">
  <header className="aph-header"><div><span>KY ERP / YÖNETİM MERKEZİ</span><h1>{owner?"Platform Yönetimi":"Firma Yönetimi"}</h1><p>Bölüm seçin, işlemi açın ve kaydedin. Mevcut fonksiyonların tamamı korunur.</p></div>
  <div className="aph-company"><small>AKTİF FİRMA</small><strong>{activeMainCompany?.name||activeMainCompany?.slug||user?.mainCompanySlug||"Firma seçilmedi"}</strong></div></header>
  <nav className="aph-main-tabs" aria-label="Yönetim bölümleri">{Object.entries(groups).map(([key,item])=>
   <button type="button" key={key} aria-pressed={group===key} className={group===key?"active":""} onClick={()=>{setGroup(key);setPanel(item.panels[0][0])}}><strong>{item.label}</strong><span>{item.description}</span></button>)}</nav>
  <section className="aph-workspace"><div className="aph-workspace-head"><div><span>İŞLEM SEÇİN</span><h2>{current.label}</h2><p>{current.description}</p></div><small>{current.panels.length} işlem</small></div>
   <nav className="aph-panel-menu" aria-label="Yönetim alt işlemleri">{current.panels.map(([key,label,description,Icon])=>
    <button key={key} type="button" aria-current={panel===key?"page":undefined} className={panel===key?"active":""} onClick={()=>setPanel(key)}>
     <Icon size={18} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={16} aria-hidden="true"/></button>)}</nav></section>
  <div className="aph-selected"><div><strong>{selected[1]}</strong><span>{selected[2]}</span></div><small>İşlem detayları gerektiğinde açılır.</small></div>
  <main className="aph-content" key={panel}>{content}</main>
 </div>
}
