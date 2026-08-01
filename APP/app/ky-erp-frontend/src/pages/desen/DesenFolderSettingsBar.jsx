import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Database,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getDesenFolderSettings,
  testDesenFolderSettings,
} from "../../services/desenFolderSettingsApi";

const numberText = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    maximumFractionDigits: 2,
  });

function sizeText(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${numberText(bytes / 1024)} KB`;
  return `${numberText(bytes / (1024 * 1024))} MB`;
}

export default function DesenFolderSettingsBar({ activeMainCompany }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = async (test = false) => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setBusy(true);
    setMessage("");
    try {
      const data = test
        ? await testDesenFolderSettings(activeMainCompany)
        : await getDesenFolderSettings(activeMainCompany);
      setResult(data || null);
      setMessage(
        test
          ? `R2 bağlantısı doğrulandı. ${Number(data?.pendingFileCount || 0)} gelen dosya hazır.`
          : "",
      );
    } catch (error) {
      setMessage(error?.message || "Desen R2 alanı kontrol edilemedi.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load(false);
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  const connected = result?.connected === true || result?.ok === true;
  const settings = result?.settings || {};

  return (
    <>
      <section className="dsg-toolbar-card dsg-storage-status">
        <div className="dsg-toolbar-main">
          <span className={`dsg-btn ${connected ? "active" : ""}`}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : connected ? (
              <ShieldCheck size={16} />
            ) : (
              <Cloud size={16} />
            )}
            {connected ? "R2 Desen Alanı Bağlı" : "R2 Bağlantısı Kontrol Edilecek"}
          </span>
          <button
            className="dsg-btn"
            type="button"
            disabled={busy}
            onClick={() => load(true)}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Bağlantıyı Test Et
          </button>
        </div>
        <div className="dsg-scan-meta">
          <Database size={16} />
          <span>Gelen R2 alanı</span>
          <strong>{Number(result?.pendingFileCount || 0)} dosya</strong>
          <code>{settings.incomingFolder || "R2/desen/inbox"}</code>
        </div>
        <div className="dsg-storage-facts">
          <span>
            <CheckCircle2 size={14} /> Kalıcı bulut depolama
          </span>
          <span>{sizeText(result?.totalBytes)} bekleyen veri</span>
          <span>Model: {settings.modelsFolder || "R2/desen/models"}</span>
          <span>Hata: {settings.errorFolder || "R2/desen/error"}</span>
        </div>
      </section>
      {message ? <div className="dsg-page-message">{message}</div> : null}
    </>
  );
}
