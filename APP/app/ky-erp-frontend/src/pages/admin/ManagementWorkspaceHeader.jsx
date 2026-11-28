import { Building2, ChevronRight, Settings2, Link2 } from "lucide-react";
import "./ManagementWorkspace.css";
export default function ManagementWorkspaceHeader({area,title,description,company,actions,openModule}){
 const platform=area==="Platform Yönetimi";
 return <header className="ky-management-header">
  <div className="ky-management-heading"><div className="ky-management-crumb"><span>Ayarlar &amp; Sistem</span><ChevronRight size={12} aria-hidden="true"/><span>{area}</span></div><h1>{title}</h1><p>{description}</p></div>
  <div className="ky-management-right"><div className="ky-management-company"><Building2 size={18} aria-hidden="true"/><div><small>Aktif firma</small><strong>{company||"Firma seçilmedi"}</strong></div></div>
  {openModule?<button className="ky-management-switch" type="button" onClick={()=>openModule(platform?"depolama":"admin",{tabKey:platform?"depolama-genel":"admin-yonetim-ozeti"})}>{platform?<Link2 size={15}/>:<Settings2 size={15}/>} {platform?"Bağlantılar":"Platform Yönetimi"}</button>:null}{actions}</div>
 </header>
}
