import { useCallback, useEffect, useMemo, useState } from "react";
import { listSecurityAuditLog } from "../../services/adminApi";
import { listMailApprovals } from "../../services/mailApi";
import AdminLoginApprovals from "./AdminLoginApprovals";
import AdminMailApprovals from "./AdminMailApprovals";
import "./AdminManagement.css";

const upper = (value) => String(value || "").toUpperCase().replace(/İ/g, "I");
const dateText = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
};
const providerLabel = (value) => ({
  MICROSOFT_365: "Microsoft 365 / Outlook",
  GMAIL: "Gmail / Google Workspace",
}[upper(value)] || value || "Mail");

export default function AdminApprovalCenter({ compact = false }) {
  const [mailRows, setMailRows] = useState([]);
  const [securityAudit, setSecurityAudit] = useState([]);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      listMailApprovals(),
      listSecurityAuditLog(250),
    ]);
    if (results[0].status === "fulfilled") setMailRows(Array.isArray(results[0].value) ? results[0].value : []);
    if (results[1].status === "fulfilled") setSecurityAudit(Array.isArray(results[1].value) ? results[1].value : []);
    const failed = results.filter((row) => row.status === "rejected").length;
    setNotice(failed ? `${failed} onay geçmişi kaynağı alınamadı.` : "");
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const loginLog = useMemo(() => securityAudit
    .filter((row) => ["LOGIN_APPROVED", "LOGIN_DENIED"].includes(upper(row.action)))
    .map((row) => ({
      id: `login-${row.id}`,
      type: "Giriş",
      action: upper(row.action) === "LOGIN_APPROVED" ? "Onaylandı" : "Reddedildi",
      target: row.targetName || row.targetUserId || "Kullanıcı girişi",
      actor: row.actorName || row.actorUserId || "Sistem",
      company: row.mainCompanySlug || "—",
      at: row.createdAt,
      detail: "Yeni cihaz / oturum girişi",
    })), [securityAudit]);

  const mailLog = useMemo(() => mailRows
    .filter((row) => ["APPROVED", "REJECTED"].includes(upper(row.status)))
    .map((row) => ({
      id: `mail-${row.id}`,
      type: "Mail",
      action: upper(row.status) === "APPROVED" ? "Onaylandı" : "Reddedildi",
      target: row.email_address || row.display_name || "Mail hesabı",
      actor: row.decision_actor_name || row.decision_actor_id || "—",
      company: row.main_company_slug || "—",
      at: row.decision_at || row.decided_at || row.updated_at,
      detail: `${providerLabel(row.provider_type)} · ${row.department_code || "Genel"}`,
    })), [mailRows]);

  const log = useMemo(() => [...loginLog, ...mailLog]
    .sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))
    .slice(0, 40), [loginLog, mailLog]);

  return (
    <section className={compact ? "admpro-card admpro-decision-center is-compact" : "admpro-card admpro-decision-center"}>
      <div className="admpro-card-head">
        <div>
          <h3>Bekleyen Onaylar</h3>
          <p>Giriş ve mail hesabı talepleri tek karar merkezinde. Firma Sahibi / İşveren ve Süper Yönetici yetkili talepleri doğrudan sonuçlandırabilir.</p>
        </div>
      </div>

      <div className="admpro-grid-2">
        <div className="admpro-card">
          <AdminLoginApprovals compact />
        </div>
        <div className="admpro-card">
          <AdminMailApprovals compact onChanged={load} />
        </div>
      </div>

      <div style={{ height: 16 }} />
      <div className="admpro-card-head">
        <div>
          <h3>Onay Logu</h3>
          <p>Kim onay verdi / reddetti, hangi işlem için ve ne zaman.</p>
        </div>
        <span className="admpro-badge ok">{log.length} son karar</span>
      </div>
      {notice ? <div className="admpro-notice warn">{notice}</div> : null}
      <div className="admpro-table">
        <table>
          <thead><tr><th>Zaman</th><th>Tür</th><th>İşlem</th><th>Hedef</th><th>Onaylayan / Reddeden</th><th>Firma</th><th>Detay</th></tr></thead>
          <tbody>
            {log.map((row) => <tr key={row.id}>
              <td>{dateText(row.at)}</td>
              <td>{row.type}</td>
              <td><strong>{row.action}</strong></td>
              <td>{row.target}</td>
              <td>{row.actor}</td>
              <td>{row.company}</td>
              <td>{row.detail}</td>
            </tr>)}
            {!log.length ? <tr><td colSpan="7">Henüz sonuçlanmış giriş veya mail onayı yok.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
