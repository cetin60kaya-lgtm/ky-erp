import { useCallback, useEffect, useMemo, useState } from "react";
import { approveLogin, decideCriticalApproval, denyLogin, listCriticalApprovals, listLoginApprovals } from "../../services/adminApi";
import { decideMailApproval, listMailApprovals } from "../../services/mailApi";
import "./AdminApprovalCenter.css";

const upper = (value) => String(value || "").trim().toUpperCase().replace(/İ/g, "I");
const rows = (value) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const dateText = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("tr-TR");
};

function normalizeCritical(row) {
  return {
    source: "CRITICAL",
    id: row.id,
    title: row.title || row.action_type || "Kritik İşlem",
    description: row.description || row.action_type || "",
    status: upper(row.status),
    riskLevel: upper(row.risk_level || "HIGH"),
    policy: row.approvalPolicyLabel || row.approval_policy || "—",
    requestedBy: row.requested_by_name || row.requested_by_username || row.requested_by || "—",
    createdAt: row.created_at,
    myDecision: upper(row.myDecision),
    raw: row,
  };
}
function normalizeMail(row) {
  return {
    source: "MAIL",
    id: row.id,
    title: `Firma Maili · ${row.display_name || row.email_address || "Posta Kutusu"}`,
    description: [row.email_address, row.provider_type, row.department_code].filter(Boolean).join(" · "),
    status: upper(row.status),
    riskLevel: "HIGH",
    policy: "Firma Sahibi",
    requestedBy: row.requested_by || "—",
    createdAt: row.created_at,
    myDecision: upper(row.my_decision),
    raw: row,
  };
}
function normalizeLogin(row) {
  return {
    source: "LOGIN",
    id: row.id,
    title: `Giriş İsteği · ${row.fullName || row.username || "Kullanıcı"}`,
    description: [row.username ? `@${row.username}` : "", row.deviceLabel, row.ipAddress].filter(Boolean).join(" · "),
    status: "PENDING",
    riskLevel: "SECURITY",
    policy: "Giriş Yetkilisi",
    requestedBy: row.fullName || row.username || "—",
    createdAt: row.requestedAt,
    myDecision: "",
    raw: row,
  };
}

export default function AdminApprovalCenter() {
  const [critical, setCritical] = useState([]);
  const [mail, setMail] = useState([]);
  const [login, setLogin] = useState([]);
  const [tab, setTab] = useState("PENDING");
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Onay Merkezi yükleniyor...");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const jobs = await Promise.allSettled([
      listCriticalApprovals({ status: "ALL" }),
      listMailApprovals(),
      listLoginApprovals(),
    ]);
    if (jobs[0].status === "fulfilled") setCritical(rows(jobs[0].value).map(normalizeCritical));
    if (jobs[1].status === "fulfilled") setMail(rows(jobs[1].value).map(normalizeMail));
    if (jobs[2].status === "fulfilled") setLogin(rows(jobs[2].value).map(normalizeLogin));
    const failed = jobs.filter((row) => row.status === "rejected").length;
    setMessage(failed ? `${failed} onay kaynağı okunamadı; erişilebilen kayıtlar gösteriliyor.` : "Onay kayıtları güncel.");
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ silent: true }), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const allItems = useMemo(() => [...critical, ...mail, ...login].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0)), [critical, mail, login]);
  const visible = useMemo(() => {
    if (tab === "PENDING") return allItems.filter((row) => row.status === "PENDING");
    if (tab === "MY_APPROVED") return allItems.filter((row) => row.myDecision === "APPROVED");
    if (tab === "MY_REJECTED") return allItems.filter((row) => row.myDecision === "REJECTED");
    return allItems;
  }, [allItems, tab]);

  const counts = useMemo(() => ({
    pending: allItems.filter((row) => row.status === "PENDING").length,
    mineApproved: allItems.filter((row) => row.myDecision === "APPROVED").length,
    mineRejected: allItems.filter((row) => row.myDecision === "REJECTED").length,
    total: allItems.length,
  }), [allItems]);

  async function decide(row, decision) {
    if (!row?.id || busyId) return;
    setBusyId(`${row.source}:${row.id}`);
    try {
      if (row.source === "CRITICAL") await decideCriticalApproval(row.id, decision);
      else if (row.source === "MAIL") await decideMailApproval(row.id, decision);
      else if (row.source === "LOGIN") {
        if (decision === "APPROVE") await approveLogin(row.id);
        else await denyLogin(row.id);
      }
      setMessage(`${row.title} · ${decision === "APPROVE" ? "ONAYLANDI" : "REDDEDİLDİ"}.`);
      await load({ silent: true });
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Onay kararı kaydedilemedi."}`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="approval-center">
      <header className="approval-head">
        <div>
          <small>YÖNETİM / ONAY MERKEZİ</small>
          <h2>Onay Merkezi</h2>
          <p>Mail, yedekleme, geri yükleme, firma işlemleri, bağlantılar ve güvenlik gibi kritik işler tek merkezden takip edilir.</p>
        </div>
        <button type="button" onClick={() => load()} disabled={loading}>{loading ? "Kontrol Ediliyor..." : "Yenile"}</button>
      </header>

      <div className={`approval-notice ${message.startsWith("Hata:") ? "bad" : ""}`}>{message}</div>

      <section className="approval-metrics">
        <button type="button" className={tab === "PENDING" ? "active" : ""} onClick={() => setTab("PENDING")}><span>Bekleyen Onaylar</span><b>{counts.pending}</b></button>
        <button type="button" className={tab === "MY_APPROVED" ? "active" : ""} onClick={() => setTab("MY_APPROVED")}><span>Onayladıklarım</span><b>{counts.mineApproved}</b></button>
        <button type="button" className={tab === "MY_REJECTED" ? "active" : ""} onClick={() => setTab("MY_REJECTED")}><span>Reddettiklerim</span><b>{counts.mineRejected}</b></button>
        <button type="button" className={tab === "ALL" ? "active" : ""} onClick={() => setTab("ALL")}><span>Tüm Geçmiş</span><b>{counts.total}</b></button>
      </section>

      <section className="approval-list">
        {visible.length ? visible.map((row) => {
          const key = `${row.source}:${row.id}`;
          const pending = row.status === "PENDING";
          return <article key={key} className="approval-card">
            <div className="approval-main">
              <div className="approval-title-line">
                <span className={`approval-source ${row.source.toLowerCase()}`}>{row.source === "MAIL" ? "MAIL" : row.source === "LOGIN" ? "GİRİŞ" : "KRİTİK İŞLEM"}</span>
                <span className={`approval-risk risk-${row.riskLevel.toLowerCase()}`}>{row.riskLevel}</span>
                <span className={`approval-status status-${row.status.toLowerCase()}`}>{row.status}</span>
              </div>
              <h3>{row.title}</h3>
              <p>{row.description || "Açıklama yok."}</p>
              <div className="approval-meta">
                <span><b>İsteyen:</b> {row.requestedBy}</span>
                <span><b>Onay:</b> {row.policy}</span>
                <span><b>Tarih:</b> {dateText(row.createdAt)}</span>
              </div>
            </div>
            <div className="approval-actions">
              {row.myDecision ? <span className="my-decision">Benim kararım: <b>{row.myDecision}</b></span> : null}
              {pending ? <>
                <button type="button" className="reject" disabled={Boolean(busyId)} onClick={() => decide(row, "REJECT")}>{busyId === key ? "İşleniyor..." : "Reddet"}</button>
                <button type="button" className="approve" disabled={Boolean(busyId)} onClick={() => decide(row, "APPROVE")}>{busyId === key ? "İşleniyor..." : "Onayla"}</button>
              </> : <span className="closed">İşlem {row.status === "APPROVED" ? "onaylandı" : row.status === "REJECTED" ? "reddedildi" : row.status.toLowerCase()}.</span>}
            </div>
          </article>;
        }) : <div className="approval-empty"><b>Bu görünümde kayıt yok.</b><span>Yeni kritik işlem isteği geldiğinde burada görünecek.</span></div>}
      </section>
    </div>
  );
}
