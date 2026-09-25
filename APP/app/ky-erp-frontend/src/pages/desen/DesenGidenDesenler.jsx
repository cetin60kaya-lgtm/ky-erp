import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, FolderOpen, Mail, RefreshCw, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../../utils/api";

const DEFAULT_SENDER = "hkndesen@gmail.com";
const DEFAULT_RECIPIENT = "film@maverditekstil.com";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("tr-TR");
}

function statusLabel(value) {
  const key = String(value || "").toUpperCase();
  if (key === "ACCEPTED") return "Gönderildi";
  if (key === "SENDING") return "Gönderiliyor";
  if (key === "FAILED") return "Hata";
  if (key === "UNKNOWN_REVIEW_REQUIRED") return "Kontrol gerekli";
  return key || "-";
}

export default function DesenGidenDesenler() {
  const [config, setConfig] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [senderEmail, setSenderEmail] = useState(DEFAULT_SENDER);
  const [recipient, setRecipient] = useState(DEFAULT_RECIPIENT);
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    try {
      const [cfg, history] = await Promise.all([
        apiGet("/desen/outgoing-mail/config"),
        apiGet("/desen/outgoing-mail/jobs", { take: 30 }),
      ]);
      const data = cfg?.data || cfg || {};
      setConfig(data);
      setSenderEmail(data.senderEmail || DEFAULT_SENDER);
      setRecipient(data.recipients?.[0] || DEFAULT_RECIPIENT);
      setEnabled(Boolean(data.enabled));
      setJobs(history?.data || history || []);
    } catch (error) {
      setMessage(error?.message || "Giden desen otomasyonu yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const folderPath = useMemo(() => {
    const root = String(config?.binding?.local_root_path || "D:\\GoogleDrive\\Hakan Emp").replace(/[\\/]+$/, "");
    const suffix = String(config?.binding?.root_path || "giden desenler").replace(/^[\\/]+/, "");
    return `${root}\\${suffix}`;
  }, [config]);

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPut("/desen/outgoing-mail/config", {
        enabled,
        senderEmail,
        recipients: [recipient],
        sendRevisions: false,
      });
      setConfig(response?.data || response || {});
      setMessage("Ayarlar kaydedildi.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Ayarlar kaydedilemedi.");
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage("");
    try {
      await apiPost("/desen/outgoing-mail/test", {});
      setMessage("Test maili Gmail tarafından kabul edildi.");
      await load();
    } catch (error) {
      setMessage(error?.message || "Test maili gönderilemedi.");
      setBusy(false);
    }
  };

  return (
    <div className="dsg-outgoing-page">
      <section className="dsg-toolbar-card dsg-outgoing-hero">
        <div>
          <span className={`dsg-status ${config?.ready && enabled ? "green" : "yellow"}`}>
            {config?.ready && enabled ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
            {config?.ready && enabled ? "Otomatik gönderim aktif" : "Kurulum / aktivasyon bekliyor"}
          </span>
          <h2>Giden Desen Otomatik Gönderim</h2>
          <p>Klasöre yeni atılan desen dosyası bir kez algılanır ve kayıtlı alıcıya Gmail bildirimi gönderilir.</p>
        </div>
        <div className="dsg-cloud-upload">
          <button className="dsg-btn" type="button" disabled={busy} onClick={load}>
            <RefreshCw size={16} /> Yenile
          </button>
          {config?.driveFolderUrl ? (
            <a className="dsg-btn primary" href={config.driveFolderUrl} target="_blank" rel="noreferrer">
              <FolderOpen size={16} /> Drive Klasörünü Aç <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      </section>

      <section className="dsg-outgoing-grid">
        <article className="dsg-toolbar-card">
          <h3><FolderOpen size={17} /> İzlenen klasör</h3>
          <strong>{folderPath}</strong>
          <small>{config?.binding?.connection_status || "Bağlantı bekliyor"}</small>
        </article>
        <article className="dsg-toolbar-card">
          <h3><Mail size={17} /> Gmail</h3>
          <strong>{senderEmail}</strong>
          <small>{config?.sender?.provider_connected ? "Bağlı ve hazır" : "Bağlantı kontrolü gerekli"}</small>
        </article>
        <article className="dsg-toolbar-card">
          <h3><Mail size={17} /> Alıcı</h3>
          <strong>{recipient}</strong>
          <small>Yeni desen bildirimi</small>
        </article>
      </section>

      <section className="dsg-toolbar-card dsg-outgoing-settings">
        <div className="dsg-panel-tools">
          <div>
            <h3><ShieldCheck size={17} /> Otomasyon ayarı</h3>
            <small>İlk tarama eski dosyaları sadece kaydeder; mail yalnız yeni dosyada çıkar.</small>
          </div>
          <label className="dsg-outgoing-switch">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Otomatik gönderim
          </label>
        </div>
        <div className="dsg-form-grid two dsg-outgoing-form">
          <label>
            Gönderen Gmail
            <input value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} />
          </label>
          <label>
            Alıcı e-posta
            <input value={recipient} onChange={(event) => setRecipient(event.target.value)} />
          </label>
        </div>
        <div className="dsg-cloud-upload dsg-outgoing-actions">
          <button className="dsg-btn" type="button" disabled={busy || !config?.ready} onClick={sendTest}>
            <Send size={16} /> Test Maili Gönder
          </button>
          <button className="dsg-btn primary" type="button" disabled={busy} onClick={save}>
            <CheckCircle2 size={16} /> Kaydet
          </button>
        </div>
        {message ? <div className="dsg-page-message">{message}</div> : null}
      </section>

      <section className="dsg-toolbar-card dsg-outgoing-history">
        <div className="dsg-panel-tools">
          <div>
            <h3>Gönderim geçmişi</h3>
            <small>Son otomatik ve test gönderimleri</small>
          </div>
        </div>
        {jobs.length ? (
          <div className="dsg-table-wrap">
            <table className="dsg-table">
              <thead><tr><th>Dosya</th><th>Durum</th><th>Deneme</th><th>Tarih</th><th>Hata</th></tr></thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.fileName || "-"}</td>
                    <td><span className={`dsg-status ${String(job.status).toUpperCase() === "ACCEPTED" ? "green" : "yellow"}`}>{statusLabel(job.status)}</span></td>
                    <td>{job.attempt_count || 1}</td>
                    <td>{formatDate(job.created_at)}</td>
                    <td>{job.last_error || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dsg-empty"><Mail size={30} /><strong>Henüz gönderim yok</strong><span>İlk test veya yeni dosya sonrasında kayıt burada görünür.</span></div>
        )}
      </section>
    </div>
  );
}
