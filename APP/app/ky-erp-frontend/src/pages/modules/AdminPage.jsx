import { useAuth } from "../../context/AuthContext";
import AdminSystemOverview from "../admin/AdminSystemOverview";
import AdminCompanyOverview from "../admin/AdminCompanyOverview";
import AdminOwnerSecurity from "../admin/AdminOwnerSecurity";
import SecurityCenterPanel from "../admin/SecurityCenterPanel";
import AdminUsersPanel from "../admin/AdminUsersPanel";
import AdminCompanyUsersPanel from "../admin/AdminCompanyUsersPanel";
import AdminCompanySettings from "../admin/AdminCompanySettings";
import AdminCompanyAuthority from "../admin/AdminCompanyAuthority";
import AdminCompanyBilling from "../admin/AdminCompanyBilling";
import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminMappings from "../admin/AdminMappings";
import AdminBackupLogs from "../admin/AdminBackupLogs";
import AdminBuildCenter from "../admin/AdminBuildCenter";
import DepolamaPage from "./DepolamaPage";

function canonicalRole(role) {
  return String(role || "").toUpperCase().replace(/İ/g, "I");
}

function isOwnerRole(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(canonicalRole(role));
}

export default function AdminPage({ activeTab, activeMainCompany }) {
  const { user } = useAuth();
  const owner = isOwnerRole(user?.role);
  const companyAdmin = canonicalRole(user?.role) === "COMPANY_ADMIN";

  if (String(activeTab || "").startsWith("depolama-")) {
    if (owner) return <DepolamaPage activeTab={activeTab} activeMainCompany={activeMainCompany} />;
    if (companyAdmin && activeTab !== "depolama-yedekleme") {
      return <DepolamaPage activeTab={activeTab} activeMainCompany={activeMainCompany} />;
    }
    return <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "admin-yonetim-ozeti") {
    return owner
      ? <AdminSystemOverview activeMainCompany={activeMainCompany} />
      : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "uygulama-sahibi") {
    return owner ? <><AdminOwnerSecurity /><SecurityCenterPanel /></> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "giris-onaylari") {
    return owner ? <AdminSystemOverview activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "kullanicilar") {
    return owner
      ? <AdminUsersPanel activeMainCompany={activeMainCompany} />
      : companyAdmin
        ? <><AdminCompanyUsersPanel activeMainCompany={activeMainCompany} /><SecurityCenterPanel /></>
        : <AdminCompanyUsersPanel activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "ana-firma-ayarlar") {
    if (owner) {
      return <>
        <AdminCompanySettings activeMainCompany={activeMainCompany} />
        <div style={{ height: 16 }} />
        <AdminCompanyAuthority activeMainCompany={activeMainCompany} />
      </>;
    }
    if (companyAdmin) return <AdminCompanyAuthority activeMainCompany={activeMainCompany} />;
    return <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "firma-ucretlendirme") {
    return owner ? <AdminCompanyBilling activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "dosya-klasor-yonetimi") {
    return (owner || companyAdmin) ? <AdminStorageCenter activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "eslestirmeler") {
    return owner ? <AdminMappings activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "yedekleme-loglar") {
    return owner ? <AdminBackupLogs activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "surum-merkezi") {
    return owner ? <AdminBuildCenter /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  return owner
    ? <AdminSystemOverview activeMainCompany={activeMainCompany} />
    : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
}
