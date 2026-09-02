import AdminStorageCenter from "../admin/AdminStorageCenter";
import AdminBackupLogs from "../admin/AdminBackupLogs";

export default function DepolamaPage({ activeTab, activeMainCompany }) {
  if (activeTab === "depolama-yedekleme") {
    return <AdminBackupLogs activeMainCompany={activeMainCompany} />;
  }

  return (
    <AdminStorageCenter
      activeMainCompany={activeMainCompany}
      activeTab={activeTab}
      showToolbar={false}
    />
  );
}
