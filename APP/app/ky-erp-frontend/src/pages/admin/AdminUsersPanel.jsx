import AdminLoginApprovals from "./AdminLoginApprovals";
import AdminUsersPanelV2 from "./AdminUsersPanelV2";
import "./AdminUsersPanelHardening.css";

export default function AdminUsersPanel(props) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <AdminLoginApprovals compact />
      <AdminUsersPanelV2 {...props} />
    </div>
  );
}
