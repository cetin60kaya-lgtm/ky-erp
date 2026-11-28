import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminBackupLogs from "../admin/AdminBackupLogs";
import AdminMailConnections from "../admin/AdminMailConnectionsV2";
import ManagementWorkspaceHeader from "../admin/ManagementWorkspaceHeader";

export default function DepolamaPage({ activeTab, activeMainCompany, openModule }) {
  const company=activeMainCompany?.name||activeMainCompany?.slug;
  if (activeTab === "depolama-yedekleme") {
    return <div className="ky-management-page"><ManagementWorkspaceHeader area="Bağlantılar" title="Yedekleme ve Loglar" description="Firma yedekleri ve işlem geçmişi" company={company} openModule={openModule}/><AdminBackupLogs key={activeMainCompany?.slug||"no-company"} activeMainCompany={activeMainCompany}/></div>;
  }

  if (activeTab === "depolama-mail") {
    return <div className="ky-management-page"><ManagementWorkspaceHeader area="Bağlantılar" title="E-posta Hesapları" description="Firma posta kutuları, sağlayıcılar ve onaylar" company={company} openModule={openModule}/><AdminMailConnections key={activeMainCompany?.slug||activeMainCompany?.id||"no-company"} activeMainCompany={activeMainCompany} embedded openModule={openModule}/></div>;
  }

  return (
    <AdminStorageCenter
      key={activeMainCompany?.slug||activeMainCompany?.id||"no-company"}
      activeMainCompany={activeMainCompany}
      activeTab={activeTab}
      showToolbar={false}
      openModule={openModule}
    />
  );
}
