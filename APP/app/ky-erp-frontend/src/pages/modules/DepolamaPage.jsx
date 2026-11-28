import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminBackupLogs from "../admin/AdminBackupLogs";
import AdminMailConnections from "../admin/AdminMailConnectionsV2";

export default function DepolamaPage({ activeTab, activeMainCompany, openModule }) {
  if (activeTab === "depolama-yedekleme") {
    return <AdminBackupLogs activeMainCompany={activeMainCompany} />;
  }

  if (activeTab === "depolama-mail") {
    return <AdminMailConnections key={activeMainCompany?.slug||activeMainCompany?.id||"no-company"} activeMainCompany={activeMainCompany} openModule={openModule} />;
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
