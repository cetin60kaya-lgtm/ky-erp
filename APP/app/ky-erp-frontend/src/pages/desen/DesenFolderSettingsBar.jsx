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
import { apiGet, apiPost } from "../../utils/api";
import { analyzeDesenStorageTargets } from "./desenStorageReadiness";

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
    connectionId: row.storage_connection_id || "",
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

export default function DesenFolderSettingsBar({ activeMainCompany }) {
  const [targets, setTargets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [imageSyncStatus, setImageSyncStatus] = useState(null);
  const [syncingImages, setSyncingImages] = useState(false);
  const companyKey = String(activeMainCompany?.slug || activeMainCompany?.id || "");

  const load = useCallback(async () => {
    if (!companyKey) { setTargets([]); setImageSyncStatus(null); setMessage(""); return; }
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

    const imageTarget = next.find((row) => row.purposeCode === "MODEL_IMAGE");
    if (imageTarget?.ok && imageTarget.provider === "GOOGLE_DRIVE" && imageTarget.syncMode === "CLOUD_API" && imageTarget.connectionId) {
      try {
        const state = await apiGet(`/file-hub/cloud/connections/${encodeURIComponent(imageTarget.connectionId)}/status`, undefined, { forceFresh: true });
        setImageSyncStatus(state?.data || null);
      } catch (error) {
        setImageSyncStatus({ error: error?.message || "Dosya senkron durumu okunamadı." });
      }
    } else setImageSyncStatus(null);

    const missing = next.filter((row) => !row.ok);
    const readiness = analyzeDesenStorageTargets(next);
    if (missing.length) {
      setMessage("Desen için eksik depolama ataması var. Depolama > Bölüm / Dosya Atamaları ekranından hedefi tanımlayın.");
    } else if (readiness.cloudPending.length) {
      setMessage("Doğrudan bulut kaynağı hazır değil: " + readiness.cloudPending.map((row) => row.label).join(", ") + ". Mevcut bağlantının OAuth/uzak klasör ayarını kontrol edin.");
    } else if (readiness.agentPending.length) {
      setMessage("Drive bulut kaynakları ayrı çalışıyor. Agent bağlantısı henüz doğrulanmadı: " + readiness.agentPending.map((row) => row.label).join(", ") + ". Yeni hesap veya anahtar açmadan mevcut KY Control bağlantısını kontrol edin.");
    }
    setBusy(false);
  }, [companyKey]);

  useEffect(() => { load(); }, [load]);

  const syncModelImages = async () => {
    const target = targets.find((row) => row.purposeCode === "MODEL_IMAGE");
    if (!target?.connectionId || target.provider !== "GOOGLE_DRIVE" || target.syncMode !== "CLOUD_API" || busy || syncingImages) return;
    setSyncingImages(true);
    setMessage("");
    try {
      const result = await apiPost(`/file-hub/cloud/connections/${encodeURIComponent(target.connectionId)}/sync`, {});
      await load();
      const progress = result?.data || {};
      setMessage(progress.designImagePriority
        ? `${progress.files || 0} Drive görseli tarandı, ${progress.modelSyncs || 0} model ilişkilendirildi. Toplam ${progress.scannedTotal || 0} incelendi. ${progress.inProgress ? "Diğer sayfalar sırada; yeniden Senkronize seçilebilir veya otomatik tarama sürdürebilir." : "Görsel klasörü taraması tamamlandı."}`
        : progress.busy || progress.inProgress
          ? "File Hub zaten senkronize ediliyor; devam eden işlemin tamamlanmasını kontrol edin."
          : "File Hub taraması başlatıldı; durumunu kontrol edin.");
    } catch (error) {
      const forbidden = Number(error?.status) === 403;
      setMessage(forbidden ? "Bu işlem için Firma Sahibi / Yönetici dosya senkronizasyon yetkisi gerekiyor." : error?.message || "Görsel senkronizasyonu tamamlanamadı.");
    } finally {
      setSyncingImages(false);
    }
  };

  const readiness = useMemo(() => analyzeDesenStorageTargets(targets), [targets]);
  const connected = readiness.connected;
  const primaryProvider = connected[0]?.provider || "";
  const directReady = readiness.directReady;
  const agentOnly = readiness.agentRows.length > 0;
  const cloudPending = readiness.cloudPending.length > 0;
  const agentPending = readiness.agentPending;
  const imageTarget = targets.find((row) => row.purposeCode === "MODEL_IMAGE");
  const imageCloudReady = imageTarget?.ok && imageTarget.provider === "GOOGLE_DRIVE" && imageTarget.syncMode === "CLOUD_API" && imageTarget.connectionId;
  const imageProgress = imageSyncStatus?.modelImageSync || null;

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
          {agentPending.length ? <span className="dsg-storage-alert"><TriangleAlert size={14} /> Agent doğrulanmadı: {agentPending.map((row) => row.label).join(", ")}</span>
            : agentOnly ? <span className="dsg-storage-hint">Agent bağlantısı tanımlı</span> : null}
          {imageCloudReady ? <button className="dsg-btn primary" type="button" disabled={busy || syncingImages} onClick={syncModelImages}>
            {syncingImages ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            {syncingImages ? "Eşleştiriliyor…" : "Drive Görsellerini Eşleştir"}
          </button> : null}
          <button className="dsg-btn" type="button" disabled={busy || syncingImages} onClick={load}>
            <RefreshCw size={15} /> Yenile
          </button>
        </div>
      </div>
      {message ? <div className="dsg-page-message" role="status">{message}</div> : null}
      {imageCloudReady ? <div className="dsg-storage-note" role="status">
        <Cloud size={14} />
        <span>Drive görsel taraması: {imageProgress?.error ? "Hata — " + imageProgress.error : imageProgress?.completedAt ? "Tamamlandı" : imageProgress?.nextPageToken ? "Devam ediyor" : "Kontrol bekliyor"}
          {" · "}{Number(imageProgress?.scannedTotal || 0)} dosya incelendi, {Number(imageProgress?.linkedTotal || 0)} model bağı güncellendi
          {imageProgress?.lastRunAt ? " · Son tur: " + formatSync(imageProgress.lastRunAt) : ""}
          {imageSyncStatus?.sync?.pendingFolders ? " · Tam File Hub kuyruğu: " + imageSyncStatus.sync.pendingFolders + " klasör" : ""}
        </span>
      </div> : null}
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
