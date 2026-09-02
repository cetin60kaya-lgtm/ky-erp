import AdminUsersPanelV2 from "./AdminUsersPanelV2";
import AdminUserSessionsScoped from "./AdminUserSessionsScoped";
import "./AdminUsersPanelHardening.css";

export default function AdminUsersPanel() {
  return <>
    <AdminUsersPanelV2 />
    <AdminUserSessionsScoped />
  </>;
}
