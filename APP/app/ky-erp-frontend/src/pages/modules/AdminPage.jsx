import { useAuth } from "../../context/AuthContext";
import AdminSystemOverview from "../admin/AdminSystemOverview";
import AdminOwnerSecurity from "../admin/AdminOwnerSecurity";
import AdminUsersPanel from "../admin/AdminUsersPanel";
import AdminCompanySettings from "../admin/AdminCompanySettings";
import AdminCompanyBilling from "../admin/AdminCompanyBilling";
import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminMappings from "../admin/AdminMappings";
import AdminBackupLogs from "../admin/AdminBackupLogs";
import DepolamaPage from "./DepolamaPage";

function isOwnerRole(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(String(role || "").toUpperCase().replace(/İ/g, "I"));
}

export default function AdminPage({ activeTab, activeMainCompany }) {
  const { user } = useAuth();
  const owner = isOwnerRole(user?.role);

  if (String(activeTab || "").startsWith("depolama-")) {
    return <DepolamaPage activeTab={activeTab} activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "admin-yonetim-ozeti") {
    return <AdminSystemOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "uygulama-sahibi") {
    return owner ? <AdminOwnerSecurity /> : <AdminSystemOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "kullanicilar") {
    return <AdminUsersPanel activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "ana-firma-ayarlar") {
    return <AdminCompanySettings activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "firma-ucretlendirme") {
    return owner ? <AdminCompanyBilling activeMainCompany={activeMainCompany} /> : <AdminSystemOverview activeMainCompany={activeMainCompany} />;
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
