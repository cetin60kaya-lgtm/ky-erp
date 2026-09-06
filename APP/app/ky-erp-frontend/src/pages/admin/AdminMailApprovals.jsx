import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { decideMailApproval, listMailApprovals } from "../../services/mailApi";

const upper = (value) => String(value || "").toUpperCase().replace(/İ/g, "I");
const providerLabel = (value) => ({
  MICROSOFT_365: "Microsoft 365 / Outlook",
  GMAIL: "Gmail / Google Workspace",
  JMAP: "JMAP",
  IMAP_SMTP: "IMAP / SMTP",
}[upper(value)] || value || "Mail");
const accountTypeLabel = (value) => ({
  PERSONAL: "Kişisel",
  SHARED: "Ortak",
  DEPARTMENT: "Bölüm",
}[upper(value)] || value || "—");

export default function AdminMailApprovals({ compact = false, onChanged }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const role = upper(user?.role);
  const companyOwner = role === "COMPANY_ADMIN";
  const appOwner = ["SUPER_ADMIN", "ADMIN"].includes(role);
  const canDecide = companyOwner || appOwner;

  const load = useCallback(async () => {
    try {
      const result = await listMailApprovals();
      setRows(Array.isArray(result) ? result : []);
    } catch (error) {
      setNotice(error?.message || "Mail onayları alınamadı.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = useMemo(
    () => rows.filter((row) => upper(row.status) === "PENDING"),
    [rows],
  );

  async function decide(row, decision) {
    setBusyId(String(row.id));
    setNotice("");
    try {
      await decideMailApproval(row.id, decision);
      setNotice(decision === "APPROVE" ? "Mail hesabı onaylandı." : "Mail hesabı talebi reddedildi.");
      await load();
      onChanged?.();
    } catch (error) {
      setNotice(error?.message || "Mail onayı tamamlanamadı.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className={compact ? "admpro-mail-approvals compact" : "admpro-mail-approvals"}>
      <div className="admpro-card-head">
        <div>
          <h3>Mail Hesabı Onayları</h3>
          <p>Normal kullanıcıların Outlook / Gmail talepleri burada karar kuyruğuna düşer. Firma Sahibi / İşveren ve Süper Yönetici kendi taleplerinde onay beklemez.</p>
        </div>
        <span className={`admpro-badge ${pending.length ? "warn" : "ok"}`}>{pending.length} bekleyen</span>
      </div>
      {notice ? <div className={`admpro-notice ${/alınamadı|tamamlanamadı/i.test(notice) ? "warn" : "success"}`}>{notice}</div> : null}
      {pending.length ? (
        <div className="admpro-health-list">
          {pending.map((row) => (
            <div className="admpro-health-item warn" key={row.id}>
              <span className="dot" />
              <div>
                <strong>{row.display_name || row.email_address || "Mail hesabı"}</strong>
                <small>{row.email_address || "—"} · {providerLabel(row.provider_type)} · {accountTypeLabel(row.account_type)}</small>
              </div>
              <div className="admpro-actions">
                {canDecide ? (
                  <>
                    <button type="button" className="primary" onClick={() => decide(row, "APPROVE")} disabled={Boolean(busyId)}>Onayla</button>
                    <button type="button" onClick={() => decide(row, "REJECT")} disabled={Boolean(busyId)}>Reddet</button>
                  </>
                ) : (
                  <span className="admpro-badge warn">Firma sahibi / Süper Yönetici onayı</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="admpro-notice success">Bekleyen mail hesabı onayı yok.</div>
      )}
    </div>
  );
}
