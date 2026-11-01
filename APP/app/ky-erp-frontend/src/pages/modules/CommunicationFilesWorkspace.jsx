import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getCommunicationFileBlob, listCommunicationFiles } from "../../services/mailApi";
import {
  FILE_TABS, fileName, filePreviewType, fileScope, fileSize, fileViewTitle,
  recentFileIds, recordRecentFile, visibleCommunicationFiles,
} from "./communicationFiles.js";
import "./CommunicationFilesWorkspace.css";

function memoryKey(company, user) {
  return "kyerp.mail.files.recent:" + encodeURIComponent(company || "none") + ":" + encodeURIComponent(user || "anonymous");
}
function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("tr-TR");
}
function isAvailable(file) {
  return String(file?.status || "AVAILABLE").toUpperCase() === "AVAILABLE";
}

export default function CommunicationFilesWorkspace({
  activeTab = "drive-dosyalar", activeMainCompany, picker = false,
  selectedIds = [], onSelect, onClose, onComposeWithFile,
}) {
  const { user } = useAuth();
  const tenant = String(activeMainCompany?.slug || "");
  const storageKey = memoryKey(tenant, user?.id);
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [recentIds, setRecentIds] = useState(() => typeof window === "undefined" ? [] : recentFileIds(window.localStorage, storageKey));
  const [preview, setPreview] = useState(null);
  const scope = picker ? "all" : fileScope(activeTab);

  useEffect(() => {
    setRecentIds(typeof window === "undefined" ? [] : recentFileIds(window.localStorage, storageKey));
    setQuery("");
  }, [storageKey]);

  const refresh = useCallback(async (term = "") => {
    setBusy(true);
    try {
      const rows = await listCommunicationFiles({ q: term.trim() || undefined, scope, take: 200 });
      setFiles(Array.isArray(rows) ? rows : []);
      setNotice("");
    } catch (error) {
      setNotice("Hata: " + (error?.message || "Dosya listesi alınamadı."));
      setFiles([]);
    } finally { setBusy(false); }
  }, [scope, tenant]);

  useEffect(() => {
    let cancelled = false;
    // The server resolves permissions and tenant scope. Never enumerate the raw Drive.
    async function load() {
      setBusy(true);
      try {
        const rows = await listCommunicationFiles({ scope, take: 200 });
        if (!cancelled) { setFiles(Array.isArray(rows) ? rows : []); setNotice(""); }
      } catch (error) {
        if (!cancelled) { setFiles([]); setNotice("Hata: " + (error?.message || "Dosyalar alınamadı.")); }
      } finally { if (!cancelled) setBusy(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [scope, tenant]);

  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview?.url]);

  const rows = useMemo(() => visibleCommunicationFiles(files, activeTab, recentIds), [files, activeTab, recentIds]);
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  function remember(file) {
    if (typeof window !== "undefined") setRecentIds(recordRecentFile(window.localStorage, storageKey, file.id));
  }

  async function openFile(file, downloadOnly = false) {
    if (!isAvailable(file)) return setNotice("Hata: Bu dosya kaynakta bulunamıyor.");
    setBusy(true);
    try {
      const blob = await getCommunicationFileBlob(file.id);
      remember(file);
      const kind = filePreviewType(file);
      const url = URL.createObjectURL(blob);
      if (!downloadOnly && kind !== "download") {
        setPreview({ name: fileName(file), url, kind });
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName(file);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setNotice("Hata: " + (error?.message || "Dosya okunamadı. Kaynak bağlantısını kontrol edin."));
    } finally { setBusy(false); }
  }

  if (!picker && !FILE_TABS.has(activeTab)) return null;

  return (
    <section className="commf-workspace" aria-label={picker ? "Mail eki seçici" : fileViewTitle(activeTab)}>
      <header className="commf-head">
        <div>
          <small>{picker ? "YENİ MAİL / FILE HUB" : "KY ERP / DOSYA ÇALIŞMA ALANI"}</small>
          <h2>{picker ? "Mail Eki Seç" : fileViewTitle(activeTab)}</h2>
          <p>{picker
            ? "Mevcut dosyalardan seçin. Dosyalar Drive'dan taşınmaz ve ikinci bir arşiv oluşturulmaz."
            : activeTab === "drive-son-kullanilanlar" ? "Bu tarayıcıda açılan dosyalar. Kayıtlar cihaz bazlıdır." : activeTab === "drive-firma-dosyalari" ? "ERP'de firma veya iş kaydıyla ilişkili dosyalar." : "Erişim yetkinizin bulunduğu Google Drive, OneDrive ve diğer File Hub dosyaları."}</p>
        </div>
        <div className="commf-head-actions">
          <button type="button" className="secondary" disabled={busy} onClick={() => refresh(query)}>Yenile</button>
          {picker ? <button type="button" className="secondary" onClick={onClose}>Seçimi Bitir ({selectedIds.length})</button> : null}
        </div>
      </header>
      <form className="commf-search" onSubmit={(event) => { event.preventDefault(); refresh(query); }}>
        <label htmlFor="commf-file-query">Dosya veya model adı</label>
        <input id="commf-file-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="PSD, PDF, model, klasör..." />
        <button type="submit" disabled={busy}>Ara</button>
        {query ? <button type="button" className="secondary" onClick={() => { setQuery(""); refresh(""); }}>Temizle</button> : null}
      </form>
      {notice ? <p className="commf-notice" role="alert">{notice}</p> : null}
      <div className="commf-summary">{busy ? "Dosyalar yükleniyor..." : rows.length + " dosya gösteriliyor"} · Kaynak: KY File Hub · Dosyalar fiziksel kaynaklarında kalır</div>
      <div className="commf-list">
        {rows.map((file) => {
          const id = String(file.id);
          const available = isAvailable(file);
          const selected = selectedSet.has(id);
          const canSelect = available && Number(file.size_bytes || 0) <= 25 * 1024 * 1024;
          return <article key={id} className={"commf-row" + (selected ? " selected" : "")}>
            <span className="commf-icon" aria-hidden="true">{filePreviewType(file) === "image" ? "▧" : filePreviewType(file) === "pdf" ? "▤" : "▣"}</span>
            <div className="commf-identity">
              <strong title={fileName(file)}>{fileName(file)}</strong>
              <span title={file.relative_path || ""}>{file.relative_path || "Klasör kaydı bulunmuyor"}</span>
              <small>{file.provider_type || file.connection_name || "File Hub"} · {fileSize(file.size_bytes)} · {dateText(file.updated_at)}</small>
            </div>
            <span className={"commf-status" + (available ? " ok" : "")}>{available ? "Mevcut" : "Kaynakta yok"}</span>
            <div className="commf-row-actions">
              {picker
                ? <button type="button" className={selected ? "secondary" : ""} disabled={!canSelect} onClick={() => onSelect?.(file)} title={!canSelect ? "Mail eki için erişilebilir ve 25 MB veya daha küçük dosya gerekir" : ""}>{selected ? "Çıkar" : "Ekle"}</button>
                : <>
                  <button type="button" className="secondary" disabled={!available || busy} onClick={() => openFile(file)}>Aç</button>
                  <button type="button" className="secondary" disabled={!available || busy} onClick={() => openFile(file, true)}>İndir</button>
                  {onComposeWithFile ? <button type="button" disabled={!canSelect} onClick={() => onComposeWithFile(file)}>Maile Ekle</button> : null}
                </>}
            </div>
          </article>;
        })}
        {!busy && rows.length === 0 ? <div className="commf-empty">{activeTab === "drive-son-kullanilanlar" ? "Bu cihazda henüz açılmış bir dosya bulunmuyor veya kayıt listede değil." : "Bu filtreye uygun erişilebilir dosya bulunamadı."}</div> : null}
      </div>
      <footer className="commf-footer">Bağlantı kurma, OAuth, klasör atama ve Agent ayarları burada yapılmaz. Bunlar Bağlantılar & Depolama bölümünün görevleridir.</footer>
      {preview ? <div className="commf-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
        <section className="commf-preview" role="dialog" aria-modal="true" aria-label={preview.name}>
          <header><strong>{preview.name}</strong><button type="button" className="secondary" onClick={() => setPreview(null)}>Kapat</button></header>
          {preview.kind === "image" ? <img src={preview.url} alt={preview.name}/> : preview.kind === "pdf" ? <iframe title={preview.name} src={preview.url} referrerPolicy="no-referrer"/> : <iframe title={preview.name} src={preview.url} sandbox="" referrerPolicy="no-referrer"/>}
        </section>
      </div> : null}
    </section>
  );
}
