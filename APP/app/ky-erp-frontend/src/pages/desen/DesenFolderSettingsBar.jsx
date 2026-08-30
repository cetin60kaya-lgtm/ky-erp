import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  Database,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getDesenBridgeStatus,
  getDesenFolderSettings,
  testDesenFolderSettings,
} from "../../services/desenFolderSettingsApi";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";

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
  const [bridge, setBridge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const companyId = activeMainCompany?.id || "";
  const companySlug = activeMainCompany?.slug || "";

  const load = useCallback(
    async (test = false) => {
      if (!companySlug && !companyId) return;
      setBusy(true);
      setMessage("");
      try {
        const company = { id: companyId, slug: companySlug };
        const loadResult = await loadModuleData({
          scope: `desen:${companySlug || companyId}:depolama:${test ? "test" : "durum"}`,
          sources: {
            storage: {
              critical: true,
              load: () => test ? testDesenFolderSettings(company) : getDesenFolderSettings(company),
            },
            bridge: { fallback: null, load: () => getDesenBridgeStatus(company) },
          },
        });
        if (loadResult.states.storage.status !== "error") setResult(loadResult.data.storage || null);
        if (loadResult.states.bridge.status !== "error") setBridge(loadResult.data.bridge || null);
        const warning = moduleLoadMessage(
          loadResult,
          "Desen R2 canlı alanı kontrol edilemedi; son başarılı durum korunuyor.",
          "Yerel DESINATOR köprüsü yenilenemedi; R2 canlı alanı kullanılabilir.",
        );
        setMessage(warning || (test
          ? `R2 bağlantısı doğrulandı. ${Number(loadResult.data.storage?.pendingFileCount || 0)} gelen dosya hazır.`
          : ""));
      } catch (error) {
        setMessage(error?.message || "Desen depolama alanı kontrol edilemedi.");
      } finally {
        setBusy(false);
      }
    },
    [companyId, companySlug],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const connected = result?.connected === true || result?.ok === true;
  const settings = result?.settings || {};
  const localRoot = bridge?.latest?.rootName || "DESINATOR";

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
            {connected ? "R2 Canlı Görsel Alanı Bağlı" : "R2 Bağlantısı Kontrol Edilecek"}
          </span>
          <span className={`dsg-btn ${bridge?.online ? "active" : ""}`}>
            <FolderOpen size={16} />
            DESINATOR Köprüsü {bridge?.online ? "Çevrimiçi" : "Çevrimdışı"}
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
            Bağlantıları Yenile
          </button>
        </div>
        <div className="dsg-scan-meta">
          <Database size={16} />
          <span>R2 gelen alanı</span>
          <strong>{Number(result?.pendingFileCount || 0)} dosya</strong>
          <code>{settings.incomingFolder || "R2/desen/inbox"}</code>
        </div>
        <div className="dsg-storage-facts">
          <span><CheckCircle2 size={14} /> Orijinal kaynak: {localRoot}</span>
          <span><CheckCircle2 size={14} /> Gelen: DESINATOR/Gelen Desenler</span>
          <span><CheckCircle2 size={14} /> Model arşivi: DESINATOR/Modeller</span>
          <span><CheckCircle2 size={14} /> Hata: DESINATOR/Hata</span>
          <span><CheckCircle2 size={14} /> İşlenemeyen: DESINATOR/İşlenemeyen</span>
          {bridge?.latest?.lastModelName ? <span>Son yerel aktarım: {bridge.latest.lastModelName}</span> : null}
          <span>{sizeText(result?.totalBytes)} R2 bekleyen veri</span>
          <span>R2 model: {settings.modelsFolder || "R2/desen/models"}</span>
          <span>R2 hata: {settings.errorFolder || "R2/desen/error"}</span>
        </div>
      </section>
      {message ? <div className="dsg-page-message">{message}</div> : null}
    </>
  );
}
