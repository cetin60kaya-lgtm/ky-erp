import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileCheck2,
  FileText,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import {
  finalizeEBelge,
  getEBelgeCompanySuggestions,
  getEBelgeDetail,
  getEBelgeFilePreview,
  getEBelgeIntegrations,
  getEBelgePool,
  openEBelgeBlob,
  reconcileAllEBelge,
  reconcileEBelge,
  resolveEBelgeIssue,
  updateEBelge,
  uploadEBelge,
} from "../../../services/eBelgeApi";
import { startDailySync } from "../../../services/isnetApi";
import EBelgeLineReview from "./EBelgeLineReview";
import "./eBelgeCenter.css";

const today = () => new Date().toISOString().slice(0, 10);
const sixtyDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 62);
  return d.toISOString().slice(0, 10);
};

const VIEWS = [
  ["overview", "Genel Bakış"],
  ["invoices", "Gelen Faturalar"],
  ["outgoing-invoices", "Giden Faturalar"],
  ["dispatches", "Gelen İrsaliyeler"],
  ["outgoing-dispatches", "Giden İrsaliyeler"],
  ["upload", "Belge Havuzu / Yükleme"],
  ["matching", "Eşleştirmeler"],
  ["issues", "Onay / Sorunlar"],
  ["integrations", "Entegrasyonlar"],
  ["history", "Geçmiş / Arşiv"],
];

const money = (value, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateText = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";
const typeLabel = (value) => {
  const v = String(value || "").toUpperCase();
  if (v.includes("IRSALIYE")) return v.includes("GIDEN") ? "Giden İrsaliye" : "Gelen İrsaliye";
  if (v.includes("FATURA") || v.includes("ARSIV") || v.includes("IADE")) return v.includes("GIDEN") ? "Giden Fatura" : "Gelen Fatura";
  return value || "Belge";
};
const sourceLabel = (value) => ({ XML_IMPORT: "XML", AI_SCAN: "AI / Tarama", ISNET: "İşNet", ISNET_DIRECT: "İşNet", PARASUT: "Paraşüt", MANUAL: "Manuel" }[String(value || "").toUpperCase()] || value || "-");
const statusLabel = (value) => ({ INGESTED: "Yeni", REVIEW_REQUIRED: "Kontrol Bekliyor", READY_FOR_APPROVAL: "Onaya Hazır", APPROVED: "Onaylandı", POSTED: "Muhasebeleşti", REJECTED: "Reddedildi", ERROR: "Hata" }[String(value || "").toUpperCase()] || value || "-");
const tone = (row) => Number(row?.issue_count || 0) > 0 ? "warn" : String(row?.status || "").toUpperCase() === "POSTED" ? "ok" : "neutral";
const routingLabel = (line) => {
  const raw = line?.raw_metadata || {};
  const routing = String(raw.routingType || "EXPENSE").toUpperCase();
  if (routing === "BOYAHANE") return raw.lotRequired ? "Boyahane · LOT" : "Boyahane";
  if (routing === "STOCK") return "Stok";
  return `Gider · ${raw.expenseCategoryName || "Mal ve Hizmet Alımı"}`;
};

function StatCard({ label, value, hint }) {
  return <div className="eb-stat"><span>{label}</span><strong>{Number(value || 0).toLocaleString("tr-TR")}</strong><small>{hint}</small></div>;
}

function Empty({ title, text }) {
  return <div className="eb-empty"><FileText size={30} /><strong>{title}</strong><span>{text}</span></div>;
}

function UploadPanel({ onUploaded }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [direction, setDirection] = useState("INCOMING");
  const [kind, setKind] = useState("AUTO");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const addFiles = (list) => {
    const next = Array.from(list || []).filter((file) => /\.(xml|pdf|jpe?g|png|webp|bmp|tiff?)$/i.test(file.name));
    setFiles((current) => [...current, ...next].slice(0, 20));
  };
  const send = async () => {
    if (!files.length || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await uploadEBelge(files, { direction, documentKind: kind });
      const failed = result?.errors?.length || 0;
      setMessage(failed ? `${result.items?.length || 0} belge alındı, ${failed} dosya kontrol gerektiriyor.` : `${result.items?.length || files.length} dosya e-Belge Havuzuna alındı.`);
      setFiles([]);
      onUploaded?.();
    } catch (error) { setMessage(error.message || "Yükleme tamamlanamadı."); }
    finally { setBusy(false); }
  };
  return <section className="eb-upload-card">
    <div className="eb-section-title"><div><strong>Belge Yükleme</strong><span>XML doğrudan UBL-TR olarak okunur. PDF ve görseller belge yapay zekâsı ile analiz edilir.</span></div></div>
    <div className="eb-upload-options">
      <label>Yön<select value={direction} onChange={(e) => setDirection(e.target.value)}><option value="INCOMING">Gelen</option><option value="OUTGOING">Giden</option></select></label>
      <label>Belge türü<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="AUTO">Otomatik</option><option value="FATURA">Fatura</option><option value="IRSALIYE">İrsaliye</option></select></label>
    </div>
    <button type="button" className="eb-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      <Upload size={28} /><strong>Dosyaları sürükle veya seç</strong><span>XML · PDF · JPG · PNG · WEBP · BMP · TIFF — en fazla 20 dosya, dosya başına 20 MB</span>
    </button>
    <input ref={inputRef} type="file" multiple accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff" hidden onChange={(e) => addFiles(e.target.files)} />
    {files.length > 0 && <div className="eb-file-queue">{files.map((file, index) => <div key={`${file.name}-${index}`}><FileText size={16} /><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small><button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={15} /></button></div>)}</div>}
    <div className="eb-upload-footer"><span>{message}</span><button type="button" className="eb-primary" disabled={!files.length || busy} onClick={send}>{busy ? <LoaderCircle className="eb-spin" size={17} /> : <Upload size={17} />} Havuzuna Al</button></div>
  </section>;
}

function DetailDrawer({ id, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [companies, setCompanies] = useState([]);
  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try { setDetail(await getEBelgeDetail(id)); }
    catch (e) { setError(e.message || "Belge detayı alınamadı."); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (companyQuery.trim().length < 2) { setCompanies([]); return; }
    const timer = window.setTimeout(() => getEBelgeCompanySuggestions(companyQuery).then(setCompanies).catch(() => setCompanies([])), 250);
    return () => window.clearTimeout(timer);
  }, [companyQuery]);
  const action = async (key, fn) => {
    setBusy(key); setError("");
    try { await fn(); await load(); onChanged?.(); }
    catch (e) { setError(e.message || "İşlem tamamlanamadı."); }
    finally { setBusy(""); }
  };
  const preview = async (file) => action(`file-${file.id}`, async () => openEBelgeBlob(await getEBelgeFilePreview(file.id)));
  if (!id) return null;
  return <div className="eb-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><aside className="eb-drawer">
    <header><div><span>{detail ? typeLabel(detail.document_type) : "Belge"}</span><h2>{detail?.document_no || "Belge detayı"}</h2></div><button type="button" onClick={onClose}><X /></button></header>
    {error && <div className="eb-error"><AlertTriangle size={17} />{error}</div>}
    {!detail ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Belge yükleniyor</div> : <div className="eb-drawer-body">
      <section className="eb-detail-grid">
        <div><span>Firma / Cari</span><strong>{detail.party_name || "Eşleşmedi"}</strong><small>{detail.party_tax_no || "VKN yok"}</small></div>
        <div><span>Tarih</span><strong>{dateText(detail.issue_date)}</strong><small>{sourceLabel(detail.source_type)}</small></div>
        <div><span>Toplam</span><strong>{money(detail.payable_total, detail.currency)}</strong><small>KDV {money(detail.tax_total, detail.currency)}</small></div>
        <div><span>Durum</span><strong>{statusLabel(detail.status)}</strong><small>{detail.direction === "OUTGOING" ? "Giden" : "Gelen"}</small></div>
      </section>
      {!detail.party_company_id && <section className="eb-company-match"><strong>Cari Eşleştir</strong><input value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} placeholder="Firma adı veya VKN yazın" />{companies.length > 0 && <div>{companies.map((row) => <button key={row.id} type="button" onClick={() => action("company", () => updateEBelge(id, { partyCompanyId: row.id }))}><span>{row.name}</span><small>{row.tax_no || "VKN yok"}</small></button>)}</div>}</section>}
      <section><div className="eb-section-title"><strong>Kalemler</strong><span>{detail.lines?.length || 0} satır</span></div>{detail.lines?.length ? <div className="eb-lines"><div className="eb-line head"><span>Ürün</span><span>Miktar</span><span>LOT</span><span>Yönlendirme</span><span>Eşleşme</span></div>{detail.lines.map((line) => <div className="eb-line" key={line.id}><span><strong>{line.description || line.product_code || "Kalem"}</strong><small>{line.product_code || line.supplier_product_code || ""}</small><EBelgeLineReview documentId={id} line={line} onChanged={load} /></span><span>{Number(line.quantity || 0).toLocaleString("tr-TR")} {line.unit_code || ""}</span><span>{line.raw_metadata?.lotNo || "-"}</span><span><strong>{routingLabel(line)}</strong></span><span className={`eb-chip ${String(line.match_status || "").toLowerCase()}`}>{line.product_id ? (line.match_status || "MATCHED") : String(line.raw_metadata?.routingType || "EXPENSE").toUpperCase() === "EXPENSE" ? "GİDER" : (line.match_status || "UNMATCHED")}</span></div>)}</div> : <Empty title="Kalem bulunamadı" text="Belge kalemleri kontrol gerektiriyor." />}</section>
      <section><div className="eb-section-title"><strong>Sorunlar / Kontroller</strong><span>{detail.issues?.filter((x) => !x.is_resolved).length || 0} açık</span></div>{detail.issues?.length ? <div className="eb-issues">{detail.issues.map((issue) => <div key={issue.id} className={issue.is_resolved ? "resolved" : ""}><AlertTriangle size={17} /><span><strong>{issue.issue_code}</strong><small>{issue.message}</small></span>{!issue.is_resolved && issue.severity !== "ERROR" && <button type="button" onClick={() => action(`issue-${issue.id}`, () => resolveEBelgeIssue(id, issue.id))}>Çözüldü</button>}</div>)}</div> : <div className="eb-good"><CheckCircle2 size={17} /> Açık sorun yok.</div>}</section>
      <section><div className="eb-section-title"><strong>Bağlı Belgeler</strong><span>{detail.relations?.length || 0}</span></div>{detail.relations?.length ? <div className="eb-relations">{detail.relations.map((row) => <div key={row.id}><Link2 size={16} /><span>{row.related_document_no || row.related_document_id}</span><small>{row.relation_type}</small></div>)}</div> : <span className="eb-muted">Henüz fatura–irsaliye bağı yok.</span>}</section>
      <section><div className="eb-section-title"><strong>Dosyalar</strong><span>File Hub</span></div><div className="eb-files">{detail.files?.map((file) => <button type="button" key={file.id} disabled={busy === `file-${file.id}`} onClick={() => preview(file)}><FileText size={17} /><span>{file.file_name}</span><small>{file.source_type} · {file.preview_status}</small></button>)}</div></section>
      <section className="eb-drawer-actions"><button type="button" disabled={Boolean(busy)} onClick={() => action("match", () => reconcileEBelge(id))}>{busy === "match" ? <LoaderCircle className="eb-spin" size={17} /> : <Link2 size={17} />} Fatura–İrsaliye Kontrol</button><button type="button" className="eb-primary" disabled={Boolean(busy) || detail.status === "POSTED"} onClick={() => action("final", () => finalizeEBelge(id))}>{busy === "final" ? <LoaderCircle className="eb-spin" size={17} /> : <FileCheck2 size={17} />} Son Onay / Muhasebeleştir</button></section>
    </div>}
  </aside></div>;
}

export default function EBelgeCenterPage({ activeMainCompany, openModule, initialView = "" }) {
  const [view, setView] = useState(initialView || "overview");
  const [pool, setPool] = useState({ items: [], stats: {}, total: 0 });
  const [integrations, setIntegrations] = useState(null);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(sixtyDaysAgo());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const filter = useMemo(() => ({ invoices: "INCOMING_INVOICE", "outgoing-invoices": "OUTGOING_INVOICE", dispatches: "INCOMING_DISPATCH", "outgoing-dispatches": "OUTGOING_DISPATCH", matching: "MATCHING_WAIT", issues: "ISSUE", history: "HISTORY" }[view] || "ALL"), [view]);
  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const data = await getEBelgePool({ filter, q: query, from, to, page: 1, pageSize: 100 });
      setPool(data || { items: [], stats: {}, total: 0 });
      if (view === "integrations") setIntegrations(await getEBelgeIntegrations());
    } catch (e) { setError(e.message || "e-Belge Merkezi yüklenemedi."); }
    finally { setBusy(false); }
  }, [filter, query, from, to, view]);
  useEffect(() => { load(); }, [load, activeMainCompany?.slug, activeMainCompany?.id]);
  const rows = pool.items || [];
  const synchronizeIsnet = async () => {
    if (busy) return;
    setBusy(true); setError(""); setSyncNotice("");
    try {
      const result = await startDailySync({ startDate: from, endDate: to });
      const canonical = result?.canonical || {};
      const summary = `İşNet senkronu: ${Number(result?.portalCount || 0)} belge tarandı; canonical havuza ${Number(canonical.created ?? result?.counts?.canonicalCreated ?? 0)} yeni, ${Number(canonical.duplicates ?? result?.counts?.canonicalDuplicates ?? 0)} mevcut belge bağlandı.`;
      setSyncNotice(result?.requiresReview ? `${summary} ${result?.warning || "Bazı kayıtlar kontrol gerektiriyor."}` : summary);
      await load();
    } catch (e) {
      setError(e?.message || "İşNet senkronizasyonu tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };
  const companyName = activeMainCompany?.name || activeMainCompany?.title || activeMainCompany?.slug || "Aktif Firma";
  return <section className="eb-page"><div className="eb-company-context"><span>Aktif Firma</span><strong>{companyName}</strong></div>
    <div className="eb-hero"><div><span className="eb-kicker">e-Belge Merkezi</span><h2>Fatura, irsaliye ve belge kontrolü tek merkezde</h2><p>İşNet, manuel XML/PDF ve diğer sağlayıcılar aynı belge havuzuna gelir. Muhasebeleştirme son kullanıcı onayından sonra yapılır.</p></div><div className="eb-hero-actions"><button type="button" onClick={load} disabled={busy}>{busy ? <LoaderCircle className="eb-spin" size={17} /> : <RefreshCw size={17} />} Güncelle</button><button type="button" className="eb-primary" onClick={() => setView("upload")}><Upload size={17} /> Belge Yükle</button></div></div>
    <nav className="eb-tabs">{VIEWS.map(([key, label]) => <button type="button" key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav>
    {error && <div className="eb-error"><AlertTriangle size={18} />{error}</div>}
    {syncNotice && <div className="eb-overview-note"><CheckCircle2 size={18} /><div><strong>İşNet Senkronizasyonu</strong><span>{syncNotice}</span></div></div>}
    {view === "overview" && <><div className="eb-stats"><StatCard label="Toplam Belge" value={pool.stats?.total} hint="Havuzdaki aktif belge" /><StatCard label="Gelen Fatura" value={pool.stats?.incomingInvoices} hint="Tedarikçi / gider" /><StatCard label="Giden Fatura" value={pool.stats?.outgoingInvoices} hint="Müşteri satış" /><StatCard label="İrsaliye" value={pool.stats?.dispatches} hint="Gelen + giden" /><StatCard label="Muhasebeleşti" value={pool.stats?.posted} hint="Son onay tamamlandı" /></div><div className="eb-overview-note"><CheckCircle2 size={20} /><div><strong>Kontrollü akış</strong><span>Belge otomatik okunabilir ve eşleşebilir; cari, KDV, stok ve LOT etkisi son onaydan önce oluşmaz.</span></div></div></>}
    {view === "upload" && <UploadPanel onUploaded={() => { setView("issues"); load(); }} />}
    {view === "integrations" && <section className="eb-integration-grid">{(integrations?.providers || []).map((provider) => <div className="eb-integration-provider" key={provider.key}><button type="button" onClick={() => provider.key === "ISNET" && openModule?.("isnet", { tabKey: "yonetim-merkezi" })}><Wifi size={22} /><span><strong>{provider.label}</strong><small>{provider.key === "ISNET" ? `${provider.status} · ${Number(provider.canonicalDocumentCount || 0)} canonical belge` : provider.key === "MANUAL" ? (provider.ocrConfigured ? "XML + PDF/Görsel OCR hazır" : "XML hazır · PDF/Görsel OCR yapılandırılmadı") : provider.status}</small>{provider.key === "ISNET" && provider.lastSyncAt && <small>Son senkron: {new Date(provider.lastSyncAt).toLocaleString("tr-TR")}</small>}</span>{provider.key === "ISNET" && <Link2 size={16} />}</button>{provider.key === "ISNET" && <button type="button" className="eb-primary" disabled={busy || !provider.configured} onClick={synchronizeIsnet}>{busy ? <LoaderCircle className="eb-spin" size={16} /> : <RefreshCw size={16} />} Şimdi Senkronize Et</button>}</div>)}<div className="eb-archive-summary"><Archive size={22} /><div><strong>File Hub Arşiv Kuyruğu</strong>{(integrations?.archive || []).map((row) => <span key={row.status}>{row.status}: {row.n}</span>)}</div></div></section>}
    {view === "matching" && <div className="eb-toolbar-callout"><div><Link2 size={20} /><span><strong>Toplu fatura–irsaliye kontrolü</strong><small>Firma, yön, ürün kodu/açıklaması, birim ve miktar üzerinden tüm açık faturaları tekrar kontrol eder.</small></span></div><button type="button" className="eb-primary" disabled={busy} onClick={async () => { setBusy(true); try { await reconcileAllEBelge(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Tümünü Eşleştir</button></div>}
    {view !== "upload" && view !== "integrations" && <section className="eb-pool"><div className="eb-pool-toolbar"><div className="eb-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Belge no, firma veya VKN ara" /></div><label>Başlangıç<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Bitiş<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><span>{pool.total || 0} kayıt</span></div>{busy && !rows.length ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Belgeler yükleniyor</div> : rows.length ? <div className="eb-table"><div className="eb-tr eb-th"><span>Belge</span><span>Firma / Cari</span><span>Tarih</span><span>Kaynak</span><span>Toplam</span><span>Kontrol</span></div>{rows.map((row) => <button type="button" className="eb-tr" key={row.id} onClick={() => setSelectedId(row.id)}><span><strong>{row.document_no || "Belge No Yok"}</strong><small>{typeLabel(row.document_type)}</small></span><span><strong>{row.party_name || "Eşleşmedi"}</strong><small>{row.party_tax_no || ""}</small></span><span>{dateText(row.issue_date)}</span><span><small>{sourceLabel(row.source_type)}</small><em>{row.archive_status || "-"}</em></span><span><strong>{money(row.payable_total, row.currency)}</strong><small>KDV {money(row.tax_total, row.currency)}</small></span><span><i className={`eb-status ${tone(row)}`}>{Number(row.issue_count || 0) ? `${row.issue_count} sorun` : statusLabel(row.status)}</i><small>{row.line_count || 0} kalem</small></span></button>)}</div> : <Empty title="Bu görünümde belge yok" text="Filtreyi değiştirin veya yeni belge yükleyin." />}</section>}
    <DetailDrawer id={selectedId} onClose={() => setSelectedId("")} onChanged={load} />
  </section>;
}
