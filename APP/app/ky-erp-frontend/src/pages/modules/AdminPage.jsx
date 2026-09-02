import AdminSystemOverview from "../admin/AdminSystemOverview";
import AdminOwnerSecurity from "../admin/AdminOwnerSecurity";
import AdminUsersPanel from "../admin/AdminUsersPanel";
import AdminCompanySettings from "../admin/AdminCompanySettings";
import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminMappings from "../admin/AdminMappings";
import AdminBackupLogs from "../admin/AdminBackupLogs";

export default function AdminPage({ activeTab, activeMainCompany }) {
  if (activeTab === "admin-yonetim-ozeti") {
    return <AdminSystemOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "uygulama-sahibi") {
    return <AdminOwnerSecurity />;
  }
  if (activeTab === "kullanicilar") {
    return <AdminUsersPanel activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "ana-firma-ayarlar") {
    return <AdminCompanySettings activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "dosya-klasor-yonetimi") {
    return <AdminStorageCenter activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "eslestirmeler") {
    return <AdminMappings activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "yedekleme-loglar") {
    return <AdminBackupLogs activeMainCompany={activeMainCompany} />;
  }
  return <AdminSystemOverview activeMainCompany={activeMainCompany} />;
}
