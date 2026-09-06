import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { decideMailApproval, listMailAccounts, listMailApprovals } from "../../services/mailApi";
import "./AdminCompanyMailCard.css";

const upper = (value) => String(value || "").trim().toUpperCase().replace(/İ/g, "I");
const providerLabel = (value) => ({
  MICROSOFT_365: "Microsoft / Outlook / Hotmail",
  GMAIL: "Gmail / Google Workspace",
  JMAP: "JMAP",
  IMAP_SMTP: "IMAP / SMTP",
}[upper(value)] || value || "—");
const statusLabel = (value) => ({
  ACTIVE: "Aktif",
  PENDING: "Onay Bekliyor",
  DISCONNECTED: "Bağlantı Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
}[upper(value)] || value || "—");

export default function AdminCompanyMailCard({ activeMainCompany, openModule }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Firma e-posta hesapları yükleniyor...");
  const companyOwner = upper(user?.role) === "COMPANY_ADMIN";
  const companyName = activeMainCompany?.name || activeMainCompany?.title || activeMainCompany?.slug || "Aktif Firma";

  const load = useCallback(async () => {
    setBusy(true);
    const jobs = await Promise.allSettled([listMailAccounts(), listMailApprovals()]);
    if (jobs[0].status === "fulfilled") {
      const list = Array.isArray(jobs[0].value) ? jobs[0].value : [];
      setAccounts(list.filter((row) => !row.account_scope || upper(row.account_scope) === "COMPANY"));
    }
    if (jobs[1].status === "fulfilled") setApprovals(Array.isArray(jobs[1].value) ? jobs[1].value : []);
    const failed = jobs.filter((row) => row.status === "rejected").length;
    setMessage(failed ? "Bazı firma mail bilgileri alınamadı." : "Firma mail listesi güncel.");
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingByAccount = useMemo(() => {
    const map = new Map();
    for (const row of approvals) if (upper(row.status) === "PENDING") map.set(String(row.target_id), row);
    return map;
  }, [approvals]);

  const hakanPreset = /hakans*emprime/i.test(companyName);
  const presetRows = hakanPreset ? [
    { email: "hkngursu@hotmail.com", label: "Genel / Ana Mail", provider: "Microsoft / Hotmail", department: "GENEL" },
    { email: "hkndesen@gmail.com", label: "Desen Bölümü", provider: "Gmail", department: "DESEN" },
  ] : [];

  async function decide(request, decision) {
    if (!request?.id || busy) return;
    setBusy(true);
    try {
      await decideMailApproval(request.id, decision);
      setMessage(decision === "APPROVE" ? "Firma mail hesabı Firma Sahibi tarafından onaylandı." : "Firma mail hesabı talebi reddedildi.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Mail onayı tamamlanamadı."}`);
      setBusy(false);
    }
  }

  return <section className="company-mail-card">
    <header>
      <div>
        <small>FİRMA KARTI / E-POSTA HESAPLARI</small>
        <h3>Firma E-posta Hesapları · {companyName}</h3>
        <p>Burada yalnız firmaya ait kurumsal posta kutuları tutulur. Kullanıcıların giriş/doğrulama e-postaları Kullanıcılar ekranında ayrı kalır.</p>
      </div>
      <div className="company-mail-actions">
        <button type="button" onClick={() => openModule?.("iletisim", { tabKey: "mail-gelen" })}>+ Firma Maili Talebi</button>
        <button type="button" className="secondary" onClick={load} disabled={busy}>Yenile</button>
      </div>
    </header>

    <div className={`company-mail-notice ${message.startsWith("Hata:") ? "bad" : ""}`}>{message}</div>

    {presetRows.length ? <div className="company-mail-presets">
      <b>Hakan Emprime hazır hesap düzeni</b>
      {presetRows.map((row) => <div key={row.email}>
        <span><strong>{row.label}</strong><small>{row.department} · {row.provider}</small></span>
        <code>{row.email}</code>
        <em>{accounts.some((item) => String(item.email_address || item.emailAddress).toLowerCase() === row.email.toLowerCase()) ? "Kayıtlı" : "Henüz talep açılmadı"}</em>
      </div>)}
    </div> : null}

    <div className="company-mail-table">
      <div className="head"><span>Posta Kutusu</span><span>Bölüm</span><span>Sağlayıcı</span><span>Durum</span><span>Onay / İşlem</span></div>
      {accounts.length ? accounts.map((row) => {
        const pending = pendingByAccount.get(String(row.id));
        return <div className="row" key={row.id}>
          <span><b>{row.display_name || row.displayName || row.email_address || row.emailAddress}</b><small>{row.email_address || row.emailAddress}</small></span>
          <span>{row.department_code || row.departmentCode || "GENEL"}</span>
          <span>{providerLabel(row.provider_type || row.providerType)}</span>
          <span><b>{statusLabel(row.status)}</b><small>{statusLabel(row.approval_status || row.approvalStatus)}</small></span>
          <span className="row-actions">
            {pending && companyOwner ? <>
              <button type="button" className="approve" onClick={() => decide(pending, "APPROVE")} disabled={busy}>Onayla</button>
              <button type="button" className="reject" onClick={() => decide(pending, "REJECT")} disabled={busy}>Reddet</button>
            </> : pending ? <em>Firma Sahibi onayı bekleniyor</em> : <em>{statusLabel(row.approval_status || row.approvalStatus)}</em>}
          </span>
        </div>;
      }) : <div className="company-mail-empty">Bu firmaya kayıtlı kurumsal posta kutusu yok. Mail & Dosyalar bölümünden talep açabilirsiniz.</div>}
    </div>
  </section>;
}
