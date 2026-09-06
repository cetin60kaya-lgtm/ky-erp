import { useAuth } from "../../context/AuthContext";
import AdminSystemOverview from "../admin/AdminSystemOverview";
import AdminCompanyOverview from "../admin/AdminCompanyOverview";
import AdminOwnerSecurity from "../admin/AdminOwnerSecurity";
import AdminLoginApprovals from "../admin/AdminLoginApprovals";
import AdminApprovalCenter from "../admin/AdminApprovalCenter";
import AdminCompanyMailCard from "../admin/AdminCompanyMailCard";
import AdminUsersPanel from "../admin/AdminUsersPanel";
import AdminCompanyUsersPanel from "../admin/AdminCompanyUsersPanel";
import AdminCompanySettings from "../admin/AdminCompanySettings";
import AdminCompanyAuthority from "../admin/AdminCompanyAuthority";
import AdminCompanyBilling from "../admin/AdminCompanyBilling";
import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminMappings from "../admin/AdminMappings";
import AdminBackupLogs from "../admin/AdminBackupLogs";
import DepolamaPage from "./DepolamaPage";

function canonicalRole(role) {
  return String(role || "").toUpperCase().replace(/İ/g, "I");
}

function isOwnerRole(role) {
  return ["SUPER_ADMIN", "ADMIN"].includes(canonicalRole(role));
}

export default function AdminPage({ activeTab, activeMainCompany, openModule }) {
  const { user } = useAuth();
  const owner = isOwnerRole(user?.role);
  const companyAdmin = canonicalRole(user?.role) === "COMPANY_ADMIN";

  if (String(activeTab || "").startsWith("depolama-")) {
    return owner
      ? <DepolamaPage activeTab={activeTab} activeMainCompany={activeMainCompany} />
      : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "admin-yonetim-ozeti") {
    return owner
      ? <AdminSystemOverview activeMainCompany={activeMainCompany} />
      : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "uygulama-sahibi") {
    return owner ? <AdminOwnerSecurity /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "onay-merkezi") {
    return <AdminApprovalCenter />;
  }
  if (activeTab === "giris-onaylari") {
    return <AdminLoginApprovals />;
  }
  if (activeTab === "kullanicilar") {
    return owner
      ? <AdminUsersPanel activeMainCompany={activeMainCompany} />
      : <AdminCompanyUsersPanel activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "ana-firma-ayarlar") {
    if (owner) {
      return <>
        <AdminCompanySettings activeMainCompany={activeMainCompany} />
        <div style={{ height: 16 }} />
        <AdminCompanyAuthority activeMainCompany={activeMainCompany} />
        <div style={{ height: 16 }} />
        <AdminCompanyMailCard activeMainCompany={activeMainCompany} openModule={openModule} />
      </>;
    }
    if (companyAdmin) return <>
      <AdminCompanyAuthority activeMainCompany={activeMainCompany} />
      <div style={{ height: 16 }} />
      <AdminCompanyMailCard activeMainCompany={activeMainCompany} openModule={openModule} />
    </>;
    return <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "firma-ucretlendirme") {
    return owner ? <AdminCompanyBilling activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "dosya-klasor-yonetimi") {
    return owner ? <AdminStorageCenter activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "eslestirmeler") {
    return owner ? <AdminMappings activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  if (activeTab === "yedekleme-loglar") {
    return owner ? <AdminBackupLogs activeMainCompany={activeMainCompany} /> : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
  }
  return owner
    ? <AdminSystemOverview activeMainCompany={activeMainCompany} />
    : <AdminCompanyOverview activeMainCompany={activeMainCompany} />;
}
