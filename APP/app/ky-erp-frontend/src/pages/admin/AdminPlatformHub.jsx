import { useAuth } from "../../context/AuthContext";
import { Archive, Building2, ChevronRight, CreditCard, Database, GitCompareArrows, History, KeyRound, LayoutDashboard, Package, Settings2, ShieldCheck, UserRoundCog, Users } from "lucide-react";
import { ADMIN_SECTIONS, findAdminPanel } from "../../app/adminNavigation";
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

const ICONS={dashboard:LayoutDashboard,users:Users,building:Building2,"user-cog":UserRoundCog,"credit-card":CreditCard,shield:ShieldCheck,key:KeyRound,settings:Settings2,database:Database,git:GitCompareArrows,archive:Archive,package:Package,history:History};
function PanelContent({route,company,owner}){
  if(!owner)return <AdminCompanyOverview activeMainCompany={company}/>;
  switch(route){
    case "admin-yonetim-ozeti":return <AdminSystemOverview activeMainCompany={company}/>;
    case "kullanicilar":return <AdminUsersPanel activeMainCompany={company}/>;
    case "ana-firma-ayarlar":return <AdminCompanySettings activeMainCompany={company}/>;
    case "firma-yetkilileri":return <AdminCompanyAuthority activeMainCompany={company}/>;
    case "firma-ucretlendirme":return <AdminCompanyBilling activeMainCompany={company}/>;
    case "admin-guvenlik":return <SecurityCenterPanel/>;
    case "uygulama-sahibi":return <AdminOwnerSecurity/>;
    case "admin-sistem":return <AdminApplicationSettings/>;
    case "dosya-klasor-yonetimi":return <AdminStorageCenter activeMainCompany={company}/>;
    case "eslestirmeler":return <AdminMappings activeMainCompany={company}/>;
    case "yedekleme-loglar":return <AdminBackupLogs activeMainCompany={company}/>;
    case "surum-merkezi":return <AdminBuildCenter/>;
    case "guncelleme-gecmisi":return <AdminReleaseHistory/>;
    default:return <AdminSystemOverview activeMainCompany={company}/>;
  }
}
export default function AdminPlatformHub({activeTab,activeMainCompany,openModule}){
  const {user}=useAuth();
  const owner=["SUPER_ADMIN","ADMIN"].includes(String(user?.role||"").toUpperCase().replace(/İ/g,"I"));
  const {section,panel}=findAdminPanel(activeTab)||findAdminPanel("admin-yonetim-ozeti");
  const companyName=activeMainCompany?.name||activeMainCompany?.slug||user?.mainCompanySlug||"Firma seçilmedi";
  const navigate=(route)=>openModule?.("admin",{tabKey:route});
  return <div className="aph-page">
    <header className="aph-header">
      <div><span>YÖNETİM & SİSTEM</span><h1>Platform Yönetimi</h1><p>Bir işlem seçin; ilgili kayıt veya düzenleme ekranı açılır.</p></div>
      <div className="aph-company"><small>AKTİF FİRMA</small><strong>{companyName}</strong></div>
    </header>
    <nav className="aph-main-tabs" aria-label="Yönetim bölümleri">
      {ADMIN_SECTIONS.map((entry)=><button type="button" key={entry.key} aria-pressed={section.key===entry.key} className={section.key===entry.key?"active":""}
        onClick={()=>navigate(entry.panels[0].route)}><strong>{entry.label}</strong><span>{entry.description}</span></button>)}
    </nav>
    <section className="aph-workspace">
      <div className="aph-workspace-head"><div><span>{section.label.toLocaleUpperCase("tr-TR")}</span><h2>İşlem Seçimi</h2><p>{section.description}</p></div><small>{section.panels.length} işlem</small></div>
      <nav className="aph-panel-menu" aria-label={section.label+" işlemleri"}>
        {section.panels.map(item=>{
          const Icon=ICONS[item.icon]||LayoutDashboard;
          return <button type="button" key={item.route} className={panel.route===item.route?"active":""}
            aria-current={panel.route===item.route?"page":undefined} onClick={()=>navigate(item.route)}>
            <Icon size={18} aria-hidden="true"/><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={16} aria-hidden="true"/>
          </button>;
        })}
      </nav>
    </section>
    <main className="aph-content" key={panel.route}><PanelContent route={panel.route} company={activeMainCompany} owner={owner}/></main>
  </div>;
}
