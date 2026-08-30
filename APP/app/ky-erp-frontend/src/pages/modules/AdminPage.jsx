import AdminSystemOverview from "../admin/AdminSystemOverview";
import AdminUsersPanel from "../admin/AdminUsersPanel";
import AdminCompanySettings from "../admin/AdminCompanySettings";
import DosyaKlasorYonetimi from "../admin/DosyaKlasorYonetimi";
import AdminMappings from "../admin/AdminMappings";
import AdminBackupLogs from "../admin/AdminBackupLogs";

export default function AdminPage({ activeTab, activeMainCompany }) {
  if (activeTab === "admin-yonetim-ozeti") {
    return <AdminSystemOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "kullanicilar") {
    return <AdminUsersPanel activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "ana-firma-ayarlar") {
    return <AdminCompanySettings activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "dosya-klasor-yonetimi") {
    return <DosyaKlasorYonetimi activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "eslestirmeler") {
    return <AdminMappings activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "yedekleme-loglar") {
    return <AdminBackupLogs activeMainCompany={activeMainCompany} />;
  }
  return <AdminSystemOverview activeMainCompany={activeMainCompany} />;
}
