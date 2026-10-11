import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { resolveFileHubStorage } from "../../components/files/fileHub";

const TARGETS = [
  ["MODEL_IMAGE", "Model görseli"],
  ["MODEL_SOURCE", "PSD / AI / kaynak"],
  ["PLACEMENT", "Yerleşim / kalıp"],
  ["OUTGOING_DESIGN", "Giden desen / takım"],
];

const providerLabel = (value) => ({
  GOOGLE_DRIVE: "Google Drive",
  ONEDRIVE: "Microsoft OneDrive",
  SHAREPOINT: "Microsoft SharePoint",
  LOCAL_FOLDER: "Yerel Klasör",
  NAS: "NAS / Ağ Klasörü",
})[value] || value || "-";

function storageView(payload, purposeCode, label) {
  const row = payload?.data || payload || {};
  return {
    purposeCode,
    label,
    ok: Boolean(row.storage_connection_id),
    provider: row.provider_type || "",
    connectionName: row.connection_name || "",
    rootPath: row.root_path || "",
    localRootPath: row.local_root_path || "",
    remoteRootName: row.remote_root_name || "",
    remoteRootId: row.remote_root_id || "",
    syncMode: row.sync_mode || "",
    connectionStatus: row.connection_status || "",
    lastSyncAt: row.last_sync_at || "",
    lastError: row.last_error || "",
    exact: Boolean(row.module_code && row.purpose_code),
  };
}

function formatSync(value) {
  if (!value) return "henüz senkron yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("tr-TR");
}

export default function DesenFolderSettingsBar() {
  const [targets, setTargets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    const settled = await Promise.allSettled(
      TARGETS.map(([purposeCode]) => resolveFileHubStorage("DESEN", purposeCode)),
    );
    const next = settled.map((result, index) => {
      const [purposeCode, label] = TARGETS[index];
      return result.status === "fulfilled"
        ? storageView(result.value, purposeCode, label)
        : { purposeCode, label, ok: false, error: result.reason?.message || "Depolama hedefi bulunamadı." };
    });
    setTargets(next);

    const missing = next.filter((row) => !row.ok);
    const cloudPending = next.filter((row) =>
      row.ok
      && ["GOOGLE_DRIVE", "ONEDRIVE", "SHAREPOINT"].includes(row.provider)
      && (row.syncMode !== "CLOUD_API" || row.connectionStatus !== "CONNECTED" || !row.remoteRootId),
    );
    if (missing.length) {
      setMessage("Desen için eksik depolama ataması var. Depolama > Bölüm / Dosya Atamaları ekranından hedefi tanımlayın.");
    } else if (cloudPending.length) {
      setMessage("Bulut depolama kaydı var ancak doğrudan bulut senkronu henüz hazır değil. OAuth hesabı, uzak klasör ve CLOUD_API bağlantısını Depolama ekranından tamamlayın.");
    }
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const connected = useMemo(() => targets.filter((row) => row.ok), [targets]);
  const primaryProvider = connected[0]?.provider || "";
  const cloudRows = connected.filter((row) => ["GOOGLE_DRIVE", "ONEDRIVE", "SHAREPOINT"].includes(row.provider));
  const directReady = cloudRows.some((row) => row.syncMode === "CLOUD_API" && row.connectionStatus === "CONNECTED" && row.remoteRootId);
  const agentOnly = cloudRows.some((row) => row.syncMode === "AGENT");
  const cloudPending = cloudRows.some((row) => row.syncMode !== "CLOUD_API" || row.connectionStatus !== "CONNECTED" || !row.remoteRootId);

  return (
    <>
      <section className="dsg-toolbar-card dsg-storage-status">
        <div className="dsg-toolbar-main">
          <span className={`dsg-btn ${connected.length ? "active" : ""}`}>
            {busy ? <LoaderCircle className="spin" size={16} /> : connected.length ? <ShieldCheck size={16} /> : <Cloud size={16} />}
            {connected.length ? `File Hub bağlı · ${providerLabel(primaryProvider)}` : "Desen depolaması bekliyor"}
          </span>
          {directReady ? <span className="dsg-btn active"><Cloud size={16} />Doğrudan bulut senkronu aktif</span> : null}
          {agentOnly ? <span className="dsg-btn"><Cloud size={16} />Bulut kaydı Agent modunda</span> : null}
          {cloudPending && !directReady ? <span className="dsg-btn"><TriangleAlert size={16} />Doğrudan bulut bağlantısı tamamlanmadı</span> : null}
          <button className="dsg-btn" type="button" disabled={busy} onClick={load}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
            Depolamayı Yenile
          </button>
        </div>

        <div className="dsg-storage-facts">
          {targets.map((row) => (
            <span key={row.purposeCode}>
              {row.ok ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
              <strong>{row.label}:</strong>{" "}
              {row.ok
                ? `${row.connectionName || providerLabel(row.provider)} · ${row.rootPath || row.localRootPath || row.remoteRootName || "/"} · ${row.syncMode || "mod bilinmiyor"} · ${row.connectionStatus || "durum bilinmiyor"}${row.exact ? "" : " · firma varsayılanı"}`
                : "Atama yok"}
            </span>
          ))}
          {connected.map((row) => row.ok ? (
            <span key={`sync-${row.purposeCode}`}>
              <RefreshCw size={14} /><strong>{row.label} son senkron:</strong> {formatSync(row.lastSyncAt)}
              {row.lastError ? ` · Hata: ${row.lastError}` : ""}
            </span>
          ) : null)}
          <span><FolderOpen size={14} /><strong>Orijinal dosya:</strong> seçilen Google / Microsoft / Yerel / NAS kaynağında kalır.</span>
          <span><Cloud size={14} /><strong>R2:</strong> yalnız web önizleme / cache; Desen ana arşivi değildir.</span>
        </div>
      </section>
      {message ? <div className="dsg-page-message">{message}</div> : null}
    </>
  );
}
