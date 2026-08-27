import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  FileImage,
  FolderOpen,
  ImageOff,
  Images,
  LoaderCircle,
  Play,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  XCircle,
} from "lucide-react";
import {
  getDesignCompanies,
  getDesignInbox,
  ignoreDesignInbox,
  moveDesignInboxToError,
  processDesignInboxBulk,
  scanDesignInbox,
} from "../../services/desenWorkflowApi";
import { openDesenImportFolder } from "../../services/desenApi";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import {
  assetUrl,
  EmptyState,
  formatDate,
  ImagePreview,
  ModelEditorModal,
  Pager,
  StatusBadge,
  WideModal,
} from "./DesenWorkflowShared";

const EMPTY_INBOX = {
  items: [], groups: [],
  summary: { readyFiles: 0, suggestedGroups: 0, missingModelImage: 0, missingChannelImage: 0, duplicates: 0, errors: 0 },
};

export default function DesenModelMasasi({ activeMainCompany }) {
  const [inbox, setInbox] = useState(EMPTY_INBOX);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [message, setMessage] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState(null);
  const [editorGroup, setEditorGroup] = useState(null);
  const [showErrors, setShowErrors] = useState(false);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setLoading(true);
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id;
      const result = await loadModuleData({
        scope: `desen:${tenant}:model-masasi`,
        sources: {
          inbox: { critical: true, load: () => getDesignInbox(activeMainCompany) },
          companies: { fallback: [], load: () => getDesignCompanies(activeMainCompany) },
        },
      });
      if (result.states.inbox.status !== "error") setInbox(result.data.inbox || EMPTY_INBOX);
      if (result.states.companies.status !== "error") setCompanies(result.data.companies || []);
      setMessage(moduleLoadMessage(
        result,
        "Gelen Desenler ana listesi yüklenemedi; son başarılı içerik korunuyor.",
        "Firma listesi geçici olarak yenilenemedi; Gelen Desenler görünmeye devam ediyor.",
      ));
    } catch (error) { setMessage(error?.message || "Gelen Desenler yüklenemedi."); }
    finally { setLoading(false); }
  }, [activeMainCompany]);

  const runScan = useCallback(async (openModal = true) => {
    if (!activeMainCompany?.slug || scanning) return;
    if (openModal) setScanOpen(true);
    setScanning(true); setMessage("");
    try {
      const data = await scanDesignInbox(activeMainCompany);
      setInbox(data || EMPTY_INBOX);
      setMessage(`${data?.items?.length || 0} dosya kontrol edildi, ${data?.groups?.length || 0} grup önerildi.`);
    } catch (error) { setMessage(error?.message || "Gelen klasör taranamadı."); }
    finally { setScanning(false); }
  }, [activeMainCompany, scanning]);

  useEffect(() => { load(); }, [activeMainCompany?.slug, load]);
  useEffect(() => {
    if (!autoScan) return undefined;
    const timer = window.setInterval(() => runScan(false), 30000);
    return () => window.clearInterval(timer);
  }, [autoScan, activeMainCompany?.slug, runScan]);

  const groups = useMemo(() => showErrors
    ? inbox.groups.filter((group) => ["ERROR", "UNSUPPORTED"].includes(group.status))
    : inbox.groups,
  [inbox.groups, showErrors]);

  const openGroup = (group) => { setActiveGroup(group); setScanOpen(true); };
  const openFolder = async () => {
    try { await openDesenImportFolder(activeMainCompany); }
    catch (error) { setMessage(error?.message || "Klasör açılamadı."); }
  };

  const summaryCards = [
    ["Hazır Dosya", inbox.summary.readyFiles, CheckCircle2, "green"],
    ["Önerilen Model Grubu", inbox.summary.suggestedGroups, Images, "blue"],
    ["Model Görseli Eksik", inbox.summary.missingModelImage, ImageOff, "orange"],
    ["Kanal Görseli Eksik", inbox.summary.missingChannelImage, FileImage, "yellow"],
    ["Mükerrer", inbox.summary.duplicates, Copy, "gray"],
    ["Hatalı", inbox.summary.errors, XCircle, "red"],
  ];

  return <>
    <section className="dsg-toolbar-card">
      <div className="dsg-toolbar-main">
        <button className="dsg-btn primary" onClick={() => runScan(true)} disabled={scanning}>{scanning ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />} Bulut Gelenleri Tara</button>
        <button className={`dsg-btn ${autoScan ? "active" : ""}`} onClick={() => setAutoScan((value) => !value)}><Play size={16} /> Otomatik Tarama {autoScan ? "Açık" : "Kapalı"}</button>
        <button className="dsg-btn" onClick={load}><RefreshCw size={16} /> Yenile</button>
        <button className="dsg-btn" onClick={openFolder}><FolderOpen size={16} /> Klasörü Aç</button>
        <button className={`dsg-btn ${showErrors ? "active danger" : ""}`} onClick={() => setShowErrors((value) => !value)}><AlertTriangle size={16} /> Hatalı Dosyalar</button>
      </div>
      <div className="dsg-scan-meta"><Clock3 size={16} /><span>Son tarama</span><strong>{formatDate(inbox.lastScanAt)}</strong><code>{inbox.folderPath || "STORAGE/desen/gelen"}</code></div>
    </section>
    {message && <div className="dsg-page-message">{message}</div>}
    <section className="dsg-summary-grid">{summaryCards.map(([label, value, Icon, tone]) => <article className={tone} key={label}><Icon size={22} /><div><span>{label}</span><strong>{value}</strong></div></article>)}</section>
    <section className="dsg-card dsg-inbox-list-card">
      <header className="dsg-card-head"><div><h2>Gelen model grupları</h2><p>Aynı model köküne sahip görseller birlikte önerilir; son karar kullanıcıya aittir.</p></div><span>{groups.length} grup</span></header>
      {loading ? <div className="dsg-loading"><LoaderCircle className="spin" /> Gerçek veriler yükleniyor…</div> : groups.length === 0 ? <EmptyState icon={FolderOpen} title={showErrors ? "Hatalı dosya yok" : "Gelen klasörde bekleyen grup yok"} text="Yeni model veya kanal görsellerini gelen klasöre bırakıp taramayı başlatın." action={<button className="dsg-btn primary" onClick={() => runScan(true)}><ScanLine size={16} /> Klasörü Tara</button>} /> : <div className="dsg-inbox-table"><div className="dsg-inbox-row head"><span>Önizleme</span><span>Tahmini Model</span><span>Dosya</span><span>Model Görseli</span><span>Kanal Görseli</span><span>Durum</span><span>İşlem</span></div>{groups.map((group) => <button className="dsg-inbox-row" key={group.id} onClick={() => openGroup(group)}><span className="dsg-row-thumb">{group.files.find((file) => file.metadata?.imagePreview) ? <img src={assetUrl(group.files.find((file) => file.metadata?.imagePreview).previewUrl)} alt="" /> : <FileImage size={22} />}</span><strong>{group.modelName}</strong><span>{group.fileCount} dosya</span><span>{group.hasModelImage ? <CheckCircle2 className="ok" size={18} /> : <XCircle className="missing" size={18} />}</span><span>{group.hasChannelImage ? <CheckCircle2 className="ok" size={18} /> : <XCircle className="missing" size={18} />}</span><StatusBadge value={group.status}>{group.status === "READY" ? "Kontrole Hazır" : group.status}</StatusBadge><span className="dsg-btn compact"><Settings2 size={15} /> Kontrol Et</span></button>)}</div>}
    </section>
    {scanOpen && <InboxScanModal activeMainCompany={activeMainCompany} companies={companies} inbox={inbox} initialGroup={activeGroup} scanning={scanning} onScan={() => runScan(false)} onClose={() => { setScanOpen(false); setActiveGroup(null); }} onEdit={(group) => setEditorGroup(group)} onChanged={async () => { await load(); setActiveGroup(null); }} />}
    {editorGroup && <ModelEditorModal activeMainCompany={activeMainCompany} companies={companies} inboxGroup={editorGroup} onClose={() => setEditorGroup(null)} onSaved={async () => { setEditorGroup(null); setScanOpen(false); await load(); }} />}
  </>;
}

function InboxScanModal({ activeMainCompany, companies, inbox, initialGroup, scanning, onScan, onClose, onEdit, onChanged }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroup?.id || inbox.groups[0]?.id || "");
  const [fileIndex, setFileIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => (initialGroup || inbox.groups[0])?.files.filter((item) => ["READY", "DUPLICATE"].includes(item.status)).map((item) => item.id) || []);
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const groups = useMemo(() => inbox.groups.filter((group) => {
    if (query && !`${group.modelName} ${group.files.map((file) => file.fileName).join(" ")}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))) return false;
    if (filter === "READY" && group.status !== "READY") return false;
    if (filter === "MODEL_IMAGE" && !group.hasModelImage) return false;
    if (filter === "CHANNEL_IMAGE" && !group.hasChannelImage) return false;
    return true;
  }), [inbox.groups, query, filter]);
  const group = groups.find((item) => item.id === selectedGroupId) || groups[0];
  const file = group?.files[fileIndex] || group?.files[0];
  useEffect(() => { setFileIndex(0); }, [group?.id]);

  const selectableFiles = groups.flatMap((item) => item.files.filter((fileItem) => ["READY", "DUPLICATE"].includes(fileItem.status)));
  const selectedGroups = inbox.groups.filter((item) => item.files.some((fileItem) => selectedIds.includes(fileItem.id)));
  const selectAll = () => setSelectedIds(selectableFiles.map((item) => item.id));

  const bulkSave = async () => {
    if (!companyId) return setMessage("Toplu kayıt için firma seçin.");
    if (!selectedGroups.length) return setMessage("Kaydedilecek en az bir desen grubu seçin.");
    const company = companies.find((item) => String(item.id) === String(companyId));
    setBusy(true); setMessage(`${selectedGroups.length} desen seçili firmaya kaydediliyor…`);
    const groupPayloads = [];
    for (const item of selectedGroups) {
      const selectedFiles = item.files.filter((fileItem) => selectedIds.includes(fileItem.id) && ["READY", "DUPLICATE"].includes(fileItem.status));
      if (!selectedFiles.length) continue;
      groupPayloads.push({
          modelCode: item.modelName,
          modelName: item.modelName,
          groupKey: item.id,
          status: "CHANNEL_REVIEW_PENDING",
          queueIds: selectedFiles.map((fileItem) => fileItem.id),
          files: selectedFiles.map((fileItem) => ({ queueId: fileItem.id, role: fileItem.suggestedRole || "OTHER", printAreaCode: "FRONT" })),
          operations: [{ printAreaCode: "FRONT", printAreaName: "Ön", channels: [] }],
      });
    }
    try {
      const result = await processDesignInboxBulk(activeMainCompany, { companyId, companyName: company?.name || "", groups: groupPayloads });
      await onChanged();
      if (!result?.failed) { setMessage(`${result?.saved || 0} desen ${company?.name || "seçili firma"} için kaydedildi.`); onClose(); return; }
      setSelectedIds([]);
      const sampleErrors = (result.errors || []).slice(0, 4).map((item) => `${item.modelName}: ${item.message}`).join(" | ");
      setMessage(`${result.saved || 0} desen kaydedildi, ${result.failed} desen kaydedilemedi${sampleErrors ? `: ${sampleErrors}` : "."}`);
    } catch (error) {
      setMessage(error?.message || "Toplu desen kaydı tamamlanamadı. Backend servisini kontrol edin.");
    } finally { setBusy(false); }
  };

  const ignore = async () => { if (!selectedIds.length) return; await ignoreDesignInbox(activeMainCompany, selectedIds); setMessage("Seçilen dosyalar yok sayıldı."); await onChanged(); };
  const moveError = async () => { if (!selectedIds.length || !window.confirm("Seçilen dosyalar işlenemeyen klasörüne taşınsın mı?")) return; await moveDesignInboxToError(activeMainCompany, selectedIds); setMessage("Dosyalar işlenemeyen klasörüne taşındı."); await onChanged(); };

  return <WideModal title="Gelen Desen Dosyalarını Kontrol Et" subtitle="Tümünü seçin, firmayı belirleyin ve desenleri toplu kaydedin." onClose={onClose} footer={<><span className="dsg-foot-message">{message}</span><button className="dsg-btn ghost" disabled={busy} onClick={onClose}>Vazgeç</button><button className="dsg-btn danger" disabled={busy || !selectedIds.length} onClick={moveError}>Hatalı Klasörüne Gönder</button><button className="dsg-btn" disabled={busy || !selectedIds.length} onClick={ignore}>Yok Say</button><button className="dsg-btn primary" disabled={busy || !companyId || !selectedGroups.length} onClick={bulkSave}>{busy ? "Kaydediliyor…" : `Seçili Firmaya Toplu Kaydet (${selectedGroups.length})`}</button></>}>
    <div className="dsg-scan-tools"><button className="dsg-btn" onClick={onScan} disabled={scanning || busy}>{scanning ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />} Yeniden Tara</button><button className="dsg-btn primary" disabled={busy || !selectableFiles.length} onClick={selectAll}>Tümünü Seç ({selectableFiles.length})</button><button className="dsg-btn" disabled={busy} onClick={() => setSelectedIds([])}>Seçimi Temizle</button><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Tüm Dosyalar</option><option value="READY">Hazır Dosyalar</option><option value="MODEL_IMAGE">Model Görselleri</option><option value="CHANNEL_IMAGE">Kanal Görselleri</option></select><div className="dsg-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Dosya veya model ara" /></div><strong className="dsg-selection-count">{selectedGroups.length} grup / {selectedIds.length} dosya seçili</strong></div>
    <div className="dsg-scan-layout">
      <aside className="dsg-scan-list"><h3>Dosya grupları <span>{groups.length}</span></h3>{groups.map((item) => { const selectedCount = item.files.filter((child) => selectedIds.includes(child.id)).length; return <div key={item.id} className={`dsg-scan-group ${group?.id === item.id ? "active" : ""} ${selectedCount ? "selected" : ""}`}><button onClick={() => setSelectedGroupId(item.id)}><strong>{item.modelName}</strong><small>{item.fileCount} dosya · {item.status} · {selectedCount ? `${selectedCount} seçili` : "seçilmedi"}</small></button>{group?.id === item.id && item.files.map((child, index) => <button key={child.id} className={`dsg-scan-file ${file?.id === child.id ? "active" : ""}`} onClick={() => setFileIndex(index)}><input type="checkbox" disabled={busy || !["READY", "DUPLICATE"].includes(child.status)} checked={selectedIds.includes(child.id)} onChange={(event) => { event.stopPropagation(); setSelectedIds((current) => event.target.checked ? [...new Set([...current, child.id])] : current.filter((id) => id !== child.id)); }} /><span className="dsg-file-mini">{child.metadata?.imagePreview ? <img src={assetUrl(child.previewUrl)} alt="" /> : <FileImage size={18} />}</span><span><strong>{child.fileName}</strong><small>{child.suggestedRole} · {(child.fileSize / 1024).toFixed(1)} KB</small></span><StatusBadge value={child.status}>{child.status}</StatusBadge></button>)}</div>; })}</aside>
      <main className="dsg-scan-preview"><ImagePreview src={file?.previewUrl} alt={file?.fileName} /><Pager index={fileIndex} count={group?.files.length || 0} onPrevious={() => setFileIndex((value) => Math.max(0, value - 1))} onNext={() => setFileIndex((value) => Math.min((group?.files.length || 1) - 1, value + 1))} />{file && <dl><dt>Dosya adı</dt><dd>{file.fileName}</dd><dt>Tahmini rol</dt><dd>{file.suggestedRole}</dd><dt>Değiştirilme</dt><dd>{formatDate(file.modifiedAt)}</dd><dt>SHA-256</dt><dd><code>{file.fileHash || "Dosya henüz hazır değil"}</code></dd></dl>}</main>
      <aside className="dsg-scan-settings"><h3>Toplu kayıt ayarları</h3><label className="dsg-bulk-company"><span>Kaydedilecek firma</span><select value={companyId} disabled={busy} onChange={(event) => setCompanyId(event.target.value)}><option value="">Firma seçin</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><div className="dsg-group-summary"><strong>{selectedGroups.length} desen grubu seçili</strong><span>{selectedIds.length} dosya toplu kaydedilecek</span><div><StatusBadge value={companyId ? "READY" : "UNRESOLVED"}>{companyId ? "Firma belirlendi" : "Firma seçilmedi"}</StatusBadge></div></div><p>Tüm seçili desenler, seçtiğiniz firmaya ayrı model kartları olarak kaydedilir. Kanal bilgileri daha sonra tamamlanabilir.</p><button className="dsg-btn primary full" disabled={busy || !companyId || !selectedGroups.length} onClick={bulkSave}>{busy ? "Toplu kayıt yapılıyor…" : "Kaydet ve Bitir"}</button><button className="dsg-btn full" disabled={busy || !group} onClick={() => onEdit(group)}><Settings2 size={16} /> Seçili Grubu Ayrıntılı Düzenle</button></aside>
    </div>
  </WideModal>;
}
