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
    <section className="dsg-toolbar-card dsg-storage-status" aria-label="Desen dosya bağlantıları">
      <div className="dsg-storage-overview">
        <div className="dsg-storage-title">
          {busy ? <LoaderCircle className="spin" size={17} /> : connected.length ? <ShieldCheck size={17} /> : <TriangleAlert size={17} />}
          <div>
            <strong>Dosya bağlantıları · {connected.length}/{TARGETS.length}</strong>
            <small>{connected.length
              ? `${providerLabel(primaryProvider)} · ${directReady ? "Bulut bağlantısı hazır" : "Dosya hedefi tanımlı"}`
              : "Desen için dosya kaynağı tanımlanmalı"}</small>
          </div>
        </div>
        <div className="dsg-storage-actions">
          {cloudPending ? <span className="dsg-storage-alert"><TriangleAlert size={14} /> Bulut ayarı eksik</span> : null}
          {agentOnly ? <span className="dsg-storage-hint">Agent modunda</span> : null}
          <button className="dsg-btn" type="button" disabled={busy} onClick={load}>
            <RefreshCw size={15} /> Yenile
          </button>
        </div>
      </div>
      {message ? <div className="dsg-page-message" role="status">{message}</div> : null}
      <details className="dsg-storage-details">
        <summary>Kaynak ve senkronizasyon ayrıntıları</summary>
        <div className="dsg-storage-facts">
          {targets.map((row) => (
            <div key={row.purposeCode} className="dsg-storage-fact">
              {row.ok ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
              <div>
                <strong>{row.label}</strong>
                <span>{row.ok
                  ? `${row.connectionName || providerLabel(row.provider)} · ${row.rootPath || row.localRootPath || row.remoteRootName || "/"} · ${row.syncMode || "Mod bilinmiyor"} · ${row.connectionStatus || "Durum bilinmiyor"}${row.exact ? "" : " · Firma varsayılanı"}`
                  : "Atama yok"}</span>
                {row.ok ? <small>Son doğrulanmış tarama: {formatSync(row.lastSyncAt)}{row.lastError ? ` · Hata: ${row.lastError}` : ""}</small> : null}
              </div>
            </div>
          ))}
        </div>
        <p className="dsg-storage-note"><FolderOpen size={14} /> Orijinal PSD/AI/PDF, seçili bulut veya yerel sağlayıcıda kalır. R2 yalnız yükleme, önizleme ve önbellek içindir.</p>
      </details>
    </section>
  );
}
