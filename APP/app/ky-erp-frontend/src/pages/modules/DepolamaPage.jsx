import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminBackupLogs from "../admin/AdminBackupLogs";
import AdminMailConnections from "../admin/AdminMailConnectionsV2";

export default function DepolamaPage({ activeTab, activeMainCompany, openModule }) {
  if (activeTab === "depolama-yedekleme") {
    return <AdminBackupLogs activeMainCompany={activeMainCompany} />;
  }

  if (activeTab === "depolama-mail") {
    return <AdminMailConnections activeMainCompany={activeMainCompany} openModule={openModule} />;
  }

  return (
    <AdminStorageCenter
      activeMainCompany={activeMainCompany}
      activeTab={activeTab}
      showToolbar={false}
    />
  );
}
