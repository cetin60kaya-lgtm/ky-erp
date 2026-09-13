import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileText,
  Link2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  deleteEBelge,
  finalizeEBelge,
  getEBelgeCompanySuggestions,
  getEBelgeDashboard,
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
import EBelgeLineReview from "./EBelgeLineReview";
import "./eBelgeCenter.css";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;
const FILTERS = [
  ["ALL", "Tüm Belgeler"],
  ["INCOMING_INVOICE", "Gelen Fatura"],
  ["OUTGOING_INVOICE", "Giden Fatura"],
  ["INCOMING_DISPATCH", "Gelen İrsaliye"],
  ["OUTGOING_DISPATCH", "Giden İrsaliye"],
  ["MATCHING_WAIT", "Eşleşme Bekleyen"],
  ["ISSUE", "Kontrol Gereken"],
  ["REVIEW", "İşlem Bekleyen"],
  ["HISTORY", "Muhasebeleşen"],
];

const money = (value, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const dateText = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";

const typeLabel = (value) => {
  const v = String(value || "").toUpperCase();
  if (v.includes("IRSALIYE")) return v.includes("GIDEN") ? "Giden İrsaliye" : "Gelen İrsaliye";
  if (v.includes("FATURA") || v.includes("ARSIV") || v.includes("IADE")) return v.includes("GIDEN") ? "Giden Fatura" : "Gelen Fatura";
  return value || "Belge";
};

const sourceLabel = (value) => ({
  XML_IMPORT: "XML",
  AI_SCAN: "PDF / Görsel",
  ISNET: "İşNet",
  ISNET_DIRECT: "İşNet",
  PARASUT: "Paraşüt",
  MANUAL: "Manuel",
}[String(value || "").toUpperCase()] || value || "-");

const statusLabel = (value) => ({
  INGESTED: "Yeni",
  REVIEW_REQUIRED: "Kontrol Bekliyor",
  READY_FOR_APPROVAL: "Onaya Hazır",
  APPROVED: "Onaylandı",
  POSTED: "Muhasebeleşti",
  REJECTED: "Reddedildi",
  ERROR: "Hata",
}[String(value || "").toUpperCase()] || value || "-");

const routingLabel = (line) => {
  const raw = line?.raw_metadata || {};
  const routing = String(raw.routingType || "EXPENSE").toUpperCase();
  const expense = raw.expenseCategoryName || (routing === "BOYAHANE" ? "Kimya / Boya" : routing === "STOCK" ? "Stok / Malzeme Alımı" : "Mal ve Hizmet Alımı");
  if (routing === "BOYAHANE") return `Boyahane${raw.lotRequired ? " · LOT" : ""} · Gider: ${expense}`;
  if (routing === "STOCK") return `Stok · Gider: ${expense}`;
  if (routing === "CONSUMABLE") return `Sarf · Gider: ${expense}`;
  return `Gider · ${expense}`;
};

const lotLabel = (line) => {
  const raw = line?.raw_metadata || {};
  const invoiceLot = raw.invoiceLotNo || "";
  const dispatchLot = raw.dispatchLotNo || "";
  if (invoiceLot && dispatchLot && invoiceLot !== dispatchLot) return `Fatura: ${invoiceLot} · İrsaliye: ${dispatchLot}`;
  if (invoiceLot) return `${invoiceLot} · Fatura`;
  if (dispatchLot) return `${dispatchLot} · İrsaliye`;
  return raw.lotNo || "-";
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("success");

  const addFiles = (list) => {
    const next = Array.from(list || []).filter((file) => /\.(xml|pdf|jpe?g|png|webp|bmp|tiff?)$/i.test(file.name));
    setFiles((current) => [...current, ...next].slice(0, 20));
    setMessage("");
  };

  const send = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    setMessage("");
    setTone("success");
    try {
      const selectedCount = files.length;
      const result = await uploadEBelge(files);
      const failed = result?.errors?.length || 0;
      const accepted = result?.items?.length || Math.max(0, selectedCount - failed);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      if (failed) {
        setTone("warning");
        setMessage(`${accepted} dosya havuza alındı. ${failed} dosya alınamadı veya kontrol istiyor. Belge Havuzu'ndan sonucu inceleyin.`);
      } else {
        setMessage(`${accepted} dosya havuza alındı. Yeni kayıtlar artık Belge Havuzu'nda görünür; fatura–irsaliye eşleştirmesi yüklenen belgeler için otomatik kontrol edildi.`);
      }
      await onUploaded?.(result);
    } catch (error) {
      setTone("error");
      setMessage(error?.message || "Belge yükleme tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="eb-upload-card">
    <div className="eb-section-title">
      <div>
        <strong>Belge Yükle</strong>
        <span>Dosyayı yükleyin; sistem Hakan Empirme tarafını, belge türünü ve gelen/giden yönünü kendisi belirlesin.</span>
      </div>
    </div>
    <div className="eb-overview-note">
      <CheckCircle2 size={18} />
      <div>
        <strong>Tek havuz, otomatik sınıflandırma</strong>
        <span>Fatura ve irsaliyeyi ayrı ayrı seçmeniz gerekmez. XML doğrudan okunur; PDF ve görseller analiz edilir. Net olmayan kayıt yalnızca kontrol bekleyen olarak bırakılır.</span>
      </div>
    </div>
    <button
      type="button"
      className="eb-drop"
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
    >
      <Upload size={28} />
      <strong>Dosyaları sürükle veya seç</strong>
      <span>XML · PDF · JPG · PNG · WEBP · BMP · TIFF — en fazla 20 dosya, dosya başına 20 MB</span>
    </button>
    <input
      ref={inputRef}
      type="file"
      multiple
      accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff"
      hidden
      onChange={(event) => addFiles(event.target.files)}
    />
    {files.length > 0 && <div className="eb-file-queue">
      {files.map((file, index) => <div key={`${file.name}-${index}`}>
        <FileText size={16} />
        <span>{file.name}</span>
        <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
        <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}><X size={15} /></button>
      </div>)}
    </div>}
    <div className="eb-upload-footer">
      <span className={message ? `eb-inline-message ${tone}` : ""}>{message}</span>
      <button type="button" className="eb-primary" disabled={!files.length || busy} onClick={send}>
        {busy ? <LoaderCircle className="eb-spin" size={17} /> : <Upload size={17} />}
        {busy ? "Okunuyor ve eşleştiriliyor" : "Havuza Al ve Eşleştir"}
      </button>
    </div>
  </section>;
}

function DetailDrawer({ id, onClose, onChanged }) {
  const modalRef = useRef(null);
  const dragRef = useRef(null);
  const [modalGeometry, setModalGeometry] = useState(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const fallback = { w: Math.min(1180, vw - 48), h: Math.min(820, vh - 48) };
    let saved = {}; try { saved = JSON.parse(window.localStorage.getItem("kyerp:ebelge:document-window") || "{}"); } catch { /* localStorage verisi okunamazsa varsayilan pencere kullanilir. */ }
    const w = Math.max(720, Math.min(Number(saved.w) || fallback.w, vw - 20));
    const h = Math.max(500, Math.min(Number(saved.h) || fallback.h, vh - 20));
    const x = Math.max(8, Math.min(Number.isFinite(Number(saved.x)) ? Number(saved.x) : (vw - w) / 2, vw - w - 8));
    const y = Math.max(8, Math.min(Number.isFinite(Number(saved.y)) ? Number(saved.y) : (vh - h) / 2, vh - h - 8));
    return { x, y, w, h };
  });
  const persistGeometry = useCallback((next) => { try { window.localStorage.setItem("kyerp:ebelge:document-window", JSON.stringify(next)); } catch { /* localStorage kullanilamiyorsa geometri kalici olmaz. */ } }, []);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [editForm, setEditForm] = useState({ documentNo: "", issueDate: "", dueDate: "", currency: "TRY", direction: "INCOMING", documentType: "FATURA", note: "" });
  const [companyQuery, setCompanyQuery] = useState("");
  const [companies, setCompanies] = useState([]);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const next = await getEBelgeDetail(id);
      setDetail(next);
      setEditForm({
        documentNo: next?.document_no || "",
        issueDate: String(next?.issue_date || "").slice(0, 10),
        dueDate: String(next?.due_date || "").slice(0, 10),
        currency: next?.currency || "TRY",
        direction: String(next?.direction || "INCOMING").toUpperCase(),
        documentType: /IRSALIYE|DISPATCH|DESPATCH/i.test(String(next?.document_type || "")) ? "IRSALIYE" : "FATURA",
        note: next?.note || "",
      });
    } catch (e) {
      setError(e?.message || "Belge detayı alınamadı.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const node = modalRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width), h = Math.round(entry.contentRect.height);
      setModalGeometry((current) => {
        if (Math.abs(current.w - w) < 2 && Math.abs(current.h - h) < 2) return current;
        const next = { ...current, w, h };
        persistGeometry(next);
        return next;
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [persistGeometry]);
  useEffect(() => {
    if (!companyOpen || companyQuery.trim().length < 2) { setCompanies([]); return undefined; }
    const timer = window.setTimeout(() => {
      getEBelgeCompanySuggestions(companyQuery).then(setCompanies).catch(() => setCompanies([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [companyOpen, companyQuery]);

  const action = async (key, fn) => {
    setBusy(key); setError("");
    try { await fn(); await load(); await onChanged?.(); }
    catch (e) { setError(e?.message || "İşlem tamamlanamadı."); }
    finally { setBusy(""); }
  };
  const preview = async (file) => action(`file-${file.id}`, async () => openEBelgeBlob(await getEBelgeFilePreview(file.id)));
  const saveDocument = async () => action("edit", async () => { await updateEBelge(id, editForm); setEditing(false); });
  const removeDocument = async () => {
    if (!window.confirm(`${detail?.document_no || "Bu belge"} kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?`)) return;
    setBusy("delete"); setError("");
    try { await deleteEBelge(id); onClose?.(); await onChanged?.(); }
    catch (e) { setError(e?.message || "Belge tamamen silinemedi."); }
    finally { setBusy(""); }
  };

  if (!id) return null;
  const openIssues = detail?.issues?.filter((item) => !item.is_resolved) || [];
  const relationCount = detail?.relations?.length || 0;
  const fileCount = detail?.files?.length || 0;
  const startDrag = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: modalGeometry.x, y: modalGeometry.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const maxX = Math.max(8, window.innerWidth - modalGeometry.w - 8), maxY = Math.max(8, window.innerHeight - modalGeometry.h - 8);
    setModalGeometry((current) => ({ ...current, x: Math.max(8, Math.min(drag.x + event.clientX - drag.startX, maxX)), y: Math.max(8, Math.min(drag.y + event.clientY - drag.startY, maxY)) }));
  };
  const endDrag = (event) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setModalGeometry((current) => { persistGeometry(current); return current; });
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return <div className="eb-drawer-backdrop eb-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={modalRef} className="eb-drawer eb-document-modal" style={{ left: modalGeometry.x, top: modalGeometry.y, width: modalGeometry.w, height: modalGeometry.h }}>
      <header className="eb-document-modal-head" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div><span>{detail ? typeLabel(detail.document_type) : "Belge"}</span><h2>{detail?.document_no || "Belge detayı"}</h2></div>
        <button type="button" onClick={onClose} aria-label="Kapat"><X /></button>
      </header>
      {error && <div className="eb-error"><AlertTriangle size={17} />{error}</div>}
      {!detail ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Belge yükleniyor</div> : <>
        <section className="eb-document-summary">
          <div className="wide"><span>Firma / Cari</span><strong>{detail.party_name || "Eşleşmedi"}</strong><small>{detail.party_tax_no || "VKN yok"}</small></div>
          <div><span>Tarih</span><strong>{dateText(detail.issue_date)}</strong><small>{sourceLabel(detail.source_type)}</small></div>
          <div><span>Toplam</span><strong>{money(detail.payable_total, detail.currency)}</strong><small>KDV {money(detail.tax_total, detail.currency)}</small></div>
          <div><span>Durum</span><strong>{statusLabel(detail.status)}</strong><small>{detail.direction === "OUTGOING" ? "Giden" : "Gelen"}</small></div>
        </section>
        <section className="eb-document-toolbar">
          <button type="button" onClick={() => setEditing(true)}><Pencil size={16} /> Belge Düzenle</button>
          {!detail.party_company_id && <button type="button" onClick={() => setCompanyOpen(true)}>Cari Eşleştir</button>}
          <button type="button" disabled={Boolean(busy)} onClick={() => action("match", () => reconcileEBelge(id))}>{busy === "match" ? <LoaderCircle className="eb-spin" size={16} /> : <Link2 size={16} />} Yeniden Kontrol</button>
          <button type="button" className="eb-primary" disabled={Boolean(busy) || detail.status === "POSTED"} onClick={() => action("final", async () => { const result = await finalizeEBelge(id); window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "e-belge", documentId: id } })); return result; })}>{busy === "final" ? <LoaderCircle className="eb-spin" size={16} /> : <FileCheck2 size={16} />} Son Onay / Muhasebeleştir</button>
          <button type="button" className="eb-danger" disabled={Boolean(busy) || detail.status === "POSTED" || detail.status === "APPROVED"} onClick={removeDocument}>{busy === "delete" ? <LoaderCircle className="eb-spin" size={16} /> : <Trash2 size={16} />} Tam Sil</button>
        </section>
        <div className="eb-document-body">
          <section className="eb-document-lines-section">
            <div className="eb-section-title"><div><strong>Belge Kalemleri</strong><span>Ürün, LOT ve gider bilgilerini satır bazında yönetin.</span></div><span>{detail.lines?.length || 0} satır</span></div>
            {detail.lines?.length ? <div className="eb-lines">
              <div className="eb-line head"><span>Ürün</span><span>Miktar</span><span>LOT</span><span>Yönlendirme</span><span>İşlem</span></div>
              {detail.lines.map((line) => <div className="eb-line" key={line.id}>
                <span><strong>{line.description || line.product_code || "Kalem"}</strong><small>{line.product_code || line.supplier_product_code || ""}</small></span>
                <span>{Number(line.quantity || 0).toLocaleString("tr-TR")} {line.unit_code || ""}</span>
                <span>{lotLabel(line)}</span>
                <span><strong>{routingLabel(line)}</strong><small>{line.raw_metadata?.expenseCategoryName ? `Gider: ${line.raw_metadata.expenseCategoryName}` : ""}</small></span>
                <span><EBelgeLineReview documentId={id} documentType={detail.document_type} line={line} onChanged={load} hasCounterDocument={relationCount > 0} /></span>
              </div>)}
            </div> : <Empty title="Kalem bulunamadı" text="Belge kalemleri kontrol gerektiriyor." />}
          </section>

          <div className="eb-document-folds">
            <details className="eb-fold" open={openIssues.length > 0}>
              <summary><strong>Kontroller</strong><span>{openIssues.length} açık</span></summary>
              <div className="eb-fold-body">{openIssues.length ? <div className="eb-issues">{openIssues.map((issue) => <div key={issue.id}><AlertTriangle size={17} /><span><strong>{issue.issue_code}</strong><small>{issue.message}</small></span>{issue.severity !== "ERROR" && <button type="button" onClick={() => action(`issue-${issue.id}`, () => resolveEBelgeIssue(id, issue.id))}>Çözüldü</button>}</div>)}</div> : <div className="eb-good"><CheckCircle2 size={17} /> Açık sorun yok.</div>}</div>
            </details>
            <details className="eb-fold">
              <summary><strong>Fatura – İrsaliye Bağı</strong><span>{relationCount}</span></summary>
              <div className="eb-fold-body">{relationCount ? <div className="eb-relations">{detail.relations.map((row) => <div key={row.id}><Link2 size={16} /><span>{row.related_document_no || row.related_document_id}</span><small>{row.relation_type}</small></div>)}</div> : <span className="eb-muted">Henüz bağlı irsaliye/fatura yok.</span>}</div>
            </details>
            <details className="eb-fold">
              <summary><strong>Dosyalar</strong><span>{fileCount}</span></summary>
              <div className="eb-fold-body"><div className="eb-files">{detail.files?.map((file) => <button type="button" key={file.id} disabled={busy === `file-${file.id}`} onClick={() => preview(file)}><FileText size={17} /><span>{file.file_name}</span><small>{file.source_type}</small></button>)}</div></div>
            </details>
          </div>
        </div>
      </>}
    </section>
    {editing && <div className="eb-submodal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false); }}>
      <section className="eb-submodal eb-doc-edit-modal">
        <header><div><small>BELGE İŞLEMİ</small><h3>Belge Bilgilerini Düzenle</h3></div><button type="button" onClick={() => setEditing(false)}><X size={18} /></button></header>
        <div className="eb-edit-grid">
          <label>Belge No<input value={editForm.documentNo} onChange={(e) => setEditForm((v) => ({ ...v, documentNo: e.target.value }))} /></label>
          <label>Belge Tarihi<input type="date" value={editForm.issueDate} onChange={(e) => setEditForm((v) => ({ ...v, issueDate: e.target.value }))} /></label>
          <label>Vade Tarihi<input type="date" value={editForm.dueDate} onChange={(e) => setEditForm((v) => ({ ...v, dueDate: e.target.value }))} /></label>
          <label>Para Birimi<input value={editForm.currency} maxLength={3} onChange={(e) => setEditForm((v) => ({ ...v, currency: e.target.value.toUpperCase() }))} /></label>
          <label>Yön<select value={editForm.direction} onChange={(e) => setEditForm((v) => ({ ...v, direction: e.target.value }))}><option value="INCOMING">Gelen</option><option value="OUTGOING">Giden</option></select></label>
          <label>Belge Türü<select value={editForm.documentType} onChange={(e) => setEditForm((v) => ({ ...v, documentType: e.target.value }))}><option value="FATURA">Fatura</option><option value="IRSALIYE">İrsaliye</option></select></label>
          <label className="eb-edit-note">Not<textarea value={editForm.note} onChange={(e) => setEditForm((v) => ({ ...v, note: e.target.value }))} rows={3} /></label>
        </div>
        <footer><button type="button" onClick={() => setEditing(false)}>Vazgeç</button><button type="button" className="eb-primary" disabled={Boolean(busy)} onClick={saveDocument}>{busy === "edit" ? <LoaderCircle className="eb-spin" size={16} /> : <Save size={16} />} Kaydet</button></footer>
      </section>
    </div>}

    {companyOpen && <div className="eb-submodal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompanyOpen(false); }}>
      <section className="eb-submodal eb-company-modal">
        <header><div><small>CARİ İŞLEMİ</small><h3>Cari Eşleştir</h3></div><button type="button" onClick={() => setCompanyOpen(false)}><X size={18} /></button></header>
        <div className="eb-company-match eb-company-match-modal"><input autoFocus value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} placeholder="Firma adı veya VKN yazın" />
          {companies.length > 0 && <div>{companies.map((row) => <button key={row.id} type="button" onClick={async () => { await action("company", () => updateEBelge(id, { partyCompanyId: row.id })); setCompanyOpen(false); }}><span>{row.name}</span><small>{row.tax_no || "VKN yok"}</small></button>)}</div>}
        </div>
      </section>
    </div>}
  </div>;
}

export default function EBelgeCenterPage({ activeMainCompany, initialView = "overview", openModule }) {
  const view = ["overview", "upload", "pool", "modules"].includes(initialView) ? initialView : "overview";
  const [pool, setPool] = useState({ items: [], stats: {}, total: 0 });
  const [dashboard, setDashboard] = useState({ summary: {}, recent: [] });
  const [integrations, setIntegrations] = useState({ providers: [], archive: [], fileHub: [] });
  const [lastUpload, setLastUpload] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const params = useMemo(() => ({ filter, q: query, from, to, page: 1, pageSize: 100 }), [filter, from, query, to]);
  const openEBelgeTab = useCallback((tabKey) => openModule?.("isnet", { tabKey }), [openModule]);

  const loadPool = useCallback(async () => {
    const data = await getEBelgePool(params);
    setPool(data || { items: [], stats: {}, total: 0 });
  }, [params]);

  const loadDashboard = useCallback(async () => {
    const data = await getEBelgeDashboard({ today: today(), monthStart: monthStart() });
    setDashboard(data || { summary: {}, recent: [] });
  }, []);

  const loadModules = useCallback(async () => {
    const data = await getEBelgeIntegrations();
    setIntegrations(data || { providers: [], archive: [], fileHub: [] });
  }, []);

  const refreshCurrent = useCallback(async () => {
    if (view === "upload") return;
    setBusy(true);
    setError("");
    try {
      if (view === "overview") await loadDashboard();
      if (view === "pool") await loadPool();
      if (view === "modules") await loadModules();
    } catch (e) {
      setError(e?.message || "e-Belge verileri yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [loadDashboard, loadModules, loadPool, view]);

  useEffect(() => { void refreshCurrent(); }, [refreshCurrent, activeMainCompany?.slug, activeMainCompany?.id]);

  const runMatching = async () => {
    if (matching) return;
    setMatching(true);
    setError("");
    setNotice("");
    try {
      await reconcileAllEBelge();
      setNotice("Açık belgeler yeniden kontrol edildi. Uygun fatura–irsaliye bağlantıları güncellendi; gerçek kontrol gerektiren kayıtlar havuzda bırakıldı.");
      await loadPool();
    } catch (e) {
      setError(e?.message || "Eşleştirme kontrolü tamamlanamadı.");
    } finally {
      setMatching(false);
    }
  };

  const handleUploaded = async (result) => {
    setLastUpload(result || {});
    try { await loadDashboard(); } catch { /* Yükleme başarılıysa özet yenileme ikincil kalır. */ }
  };

  const rows = pool.items || [];
  const companyName = activeMainCompany?.name || activeMainCompany?.title || activeMainCompany?.slug || "Hakan Empirme";
  const summary = dashboard.summary || {};
  const providers = [...(integrations.providers || [])].sort((a, b) => {
    const rank = (row) => row?.key === "MANUAL" ? 0 : row?.key === "ISNET" ? 1 : 2;
    return rank(a) - rank(b);
  });
  const viewMeta = {
    overview: ["e-Belge Ana Sayfa", "Bugün ve bu ay gelen-giden belgeleri, kontrol bekleyenleri ve son hareketleri tek bakışta görün."],
    upload: ["Belge Yükle", "Fatura ve irsaliyeleri toplu yükleyin; sistem türü ve gelen-giden yönünü otomatik belirleyip havuza alsın."],
    pool: ["Belge Havuzu", "Tüm belgeleri geniş tabloda filtreleyin, inceleyin, cari/ürün/LOT düzeltmelerini ve eşleştirmeleri yönetin."],
    modules: ["Modüller", "Manuel belge motoru ve bağlı adaptörlerin durumunu görün. İşNet otomatik kullanım bu çalışma düzeninde kapalıdır."],
  }[view];

  return <section className="eb-page">
    <div className="eb-company-context"><span>Belge Sahibi</span><strong>{companyName}</strong></div>

    <div className="eb-hero">
      <div>
        <span className="eb-kicker">e-Belge · {view === "modules" ? "Sistem Durumu" : "Manuel Çalışma"}</span>
        <h2>{viewMeta[0]}</h2>
        <p>{viewMeta[1]}</p>
      </div>
      <div className="eb-hero-actions">
        {view === "overview" && <>
          <button type="button" onClick={() => openEBelgeTab("e-belge-yukleme")}><Upload size={17} /> Belge Yükle</button>
          <button type="button" className="eb-primary" onClick={() => openEBelgeTab("e-belge-merkezi")}><FileText size={17} /> Belge Havuzu</button>
        </>}
        {view === "upload" && <button type="button" onClick={() => openEBelgeTab("e-belge-merkezi")}><FileText size={17} /> Belge Havuzunu Aç</button>}
        {view === "pool" && <>
          <button type="button" onClick={loadPool} disabled={busy}><RefreshCw size={17} /> Güncelle</button>
          <button type="button" className="eb-primary" onClick={runMatching} disabled={matching || busy}>{matching ? <LoaderCircle className="eb-spin" size={17} /> : <Link2 size={17} />} Eşleşmeleri Kontrol Et</button>
        </>}
        {view === "modules" && <button type="button" onClick={loadModules} disabled={busy}><RefreshCw size={17} /> Durumu Yenile</button>}
      </div>
    </div>

    {error && <div className="eb-error"><AlertTriangle size={18} />{error}</div>}
    {notice && <div className="eb-overview-note"><CheckCircle2 size={18} /><div><strong>Kontrol tamamlandı</strong><span>{notice}</span></div></div>}

    {view === "overview" && <>
      <div className="eb-stats eb-dashboard-stats">
        <StatCard label="Bugün Toplam" value={summary.todayTotal} hint="Bugün sisteme alınan" />
        <StatCard label="Bugün Gelen" value={summary.todayIncoming} hint="Hakan Emprime alıcı" />
        <StatCard label="Bugün Giden" value={summary.todayOutgoing} hint="Hakan Emprime düzenleyen" />
        <StatCard label="Kontrol Bekleyen" value={summary.attention} hint="Gerçek uyarı / hata" />
        <StatCard label="Eşleşme Bekleyen" value={summary.matchingWait} hint="Fatura – irsaliye" />
      </div>

      <section className="eb-dashboard-periods">
        <article className="eb-period-card current">
          <header><div><span>DÖNEM ÖZETİ</span><strong>Bu Ay</strong></div><b>{Number(summary.monthTotal || 0).toLocaleString("tr-TR")} belge</b></header>
          <div className="eb-period-flow">
            <div><span>Gelen</span><strong>{Number(summary.monthIncoming || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.monthIncomingAmount)}</small></div>
            <div><span>Giden</span><strong>{Number(summary.monthOutgoing || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.monthOutgoingAmount)}</small></div>
          </div>
          <footer>{dateText(dashboard.monthStart || monthStart())} – Bugün</footer>
        </article>
        <article className="eb-period-card previous">
          <header><div><span>KARŞILAŞTIRMA</span><strong>Geçen Ay</strong></div><b>{Number(summary.previousMonthTotal || 0).toLocaleString("tr-TR")} belge</b></header>
          <div className="eb-period-flow">
            <div><span>Gelen</span><strong>{Number(summary.previousMonthIncoming || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.previousMonthIncomingAmount)}</small></div>
            <div><span>Giden</span><strong>{Number(summary.previousMonthOutgoing || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.previousMonthOutgoingAmount)}</small></div>
          </div>
          <footer>{dateText(dashboard.previousMonthStart)} – {dateText(dashboard.previousMonthEnd)}</footer>
        </article>
      </section>

      <section className="eb-pool eb-recent-pool eb-dashboard-recent">
        <div className="eb-section-title"><div><strong>Son İşlemler</strong><span>En son havuza alınan 10 belge ve kontrol durumu</span></div><button type="button" onClick={() => openEBelgeTab("e-belge-merkezi")}>Belge Havuzunu Aç</button></div>
        {busy && !dashboard.recent?.length ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Özet yükleniyor</div> : dashboard.recent?.length ? <div className="eb-pool-table-scroll eb-dashboard-table-scroll"><div className="eb-table">
          <div className="eb-tr eb-th"><span>Belge</span><span>Firma / Cari</span><span>Tarih</span><span>Kaynak</span><span>Toplam</span><span>Durum</span></div>
          {dashboard.recent.map((row) => <button type="button" className="eb-tr" key={row.id} onClick={() => setSelectedId(row.id)}>
            <span><strong>{row.document_no || "Belge No Yok"}</strong><small>{typeLabel(row.document_type)}</small></span>
            <span><strong>{row.party_name || "Cari eşleşmesi bekliyor"}</strong><small>{row.direction === "OUTGOING" ? "Giden" : "Gelen"}</small></span>
            <span>{dateText(row.issue_date)}</span>
            <span><small>{sourceLabel(row.source_type)}</small></span>
            <span><strong>{money(row.payable_total, row.currency)}</strong><small>{row.currency || "TRY"}</small></span>
            <span className={`eb-chip ${Number(row.issue_count || 0) > 0 ? "review_required" : "ready"}`}>{Number(row.issue_count || 0) > 0 ? `${row.issue_count} kontrol` : statusLabel(row.status)}</span>
          </button>)}
        </div></div> : <Empty title="Henüz belge yok" text="Belge Yükle ekranından ilk dosyaları havuza alın." />}
      </section>
    </>}

    {view === "upload" && <>
      <UploadPanel onUploaded={handleUploaded} />
      {lastUpload && <div className="eb-upload-result"><CheckCircle2 size={20} /><div><strong>Yükleme tamamlandı</strong><span>{lastUpload.items?.length || 0} belge havuza alındı. {lastUpload.errors?.length ? `${lastUpload.errors.length} dosya ayrıca kontrol istiyor.` : "Kayıtlar Belge Havuzu'nda hazır."}</span></div><button type="button" onClick={() => openEBelgeTab("e-belge-merkezi")}>Havuzda İncele</button></div>}
    </>}

    {view === "pool" && <>
      <div className="eb-stats">
        <StatCard label="Toplam Belge" value={pool.stats?.total} hint="Havuzdaki kayıt" />
        <StatCard label="Gelen Fatura" value={pool.stats?.incomingInvoices} hint="Tedarikçi faturası" />
        <StatCard label="Giden Fatura" value={pool.stats?.outgoingInvoices} hint="Satış faturası" />
        <StatCard label="İrsaliye" value={pool.stats?.dispatches} hint="Gelen + giden" />
        <StatCard label="Muhasebeleşti" value={pool.stats?.posted} hint="Son onayı tamamlanan" />
      </div>
      <section className="eb-pool">
        <div className="eb-section-title"><div><strong>Belge Havuzu</strong><span>Gelen/giden ve belge türleri sekme değil, filtre olarak kullanılır.</span></div><span>{pool.total || 0} kayıt</span></div>
        <div className="eb-pool-toolbar">
          <div className="eb-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Belge no, firma veya VKN ara" /></div>
          <label>Göster<select value={filter} onChange={(event) => setFilter(event.target.value)}>{FILTERS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label>Başlangıç<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Bitiş<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
        {busy && !rows.length ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Belgeler yükleniyor</div> : rows.length ? <div className="eb-pool-table-scroll"><div className="eb-table">
          <div className="eb-tr eb-th"><span>Belge</span><span>Firma / Cari</span><span>Tarih</span><span>Kaynak</span><span>Toplam</span><span>Kontrol</span></div>
          {rows.map((row) => {
            const hasIssue = Number(row.issue_count || 0) > 0;
            const posted = String(row.status || "").toUpperCase() === "POSTED";
            return <button type="button" className="eb-tr" key={row.id} onClick={() => setSelectedId(row.id)}>
              <span><strong>{row.document_no || "Belge No Yok"}</strong><small>{typeLabel(row.document_type)}</small></span>
              <span><strong>{row.party_name || "Cari eşleşmesi bekliyor"}</strong><small>{row.party_tax_no || ""}</small></span>
              <span>{dateText(row.issue_date)}</span>
              <span><small>{sourceLabel(row.source_type)}</small><em>{row.archive_status || "-"}</em></span>
              <span><strong>{money(row.payable_total, row.currency)}</strong><small>{row.currency || "TRY"}</small></span>
              <span className={`eb-chip ${hasIssue ? "review_required" : posted ? "posted" : "ready"}`}>{hasIssue ? `${row.issue_count} kontrol` : statusLabel(row.status)}</span>
            </button>;
          })}
        </div></div> : <Empty title="Bu filtrede belge yok" text="Tarih / filtre alanlarını değiştirin veya Belge Yükle ekranından dosya ekleyin." />}
      </section>
    </>}

    {view === "modules" && <section className="eb-modules-panel">
      <div className="eb-overview-note"><CheckCircle2 size={18} /><div><strong>Çalışma modu: Manuel havuz</strong><span>XML, PDF ve görsel yükleme ana kanaldır. İşNet otomatik senkronizasyonu bu ekrandan çalıştırılmaz.</span></div></div>
      <div className="eb-module-grid">
        {providers.map((provider) => {
          const key = String(provider.key || "").toUpperCase();
          const manual = key === "MANUAL";
          const isnet = key === "ISNET";
          return <article key={key || provider.label} className={`eb-module-card ${manual ? "active" : ""}`}>
            <div><strong>{provider.label || key}</strong><span className={`eb-module-status ${manual ? "active" : isnet ? "paused" : "idle"}`}>{manual ? "AKTİF" : isnet ? "BEKLEMEDE" : "HAZIR"}</span></div>
            <p>{manual ? "Dosya yükleme, otomatik tür/yön tespiti ve belge eşleştirme aktif." : isnet ? "Bağlantı bilgisi korunur; otomatik kullanım ve senkron bu çalışma düzeninde kapalıdır." : "Adaptör altyapısı mevcut; günlük iş akışında kullanılmıyor."}</p>
            <small>Sistem durumu: {provider.status || "-"}</small>
          </article>;
        })}
      </div>
      <section className="eb-summary-panel"><div className="eb-section-title"><div><strong>Arşiv / File Hub</strong><span>Belge dosyalarının arka plan saklama durumu</span></div></div><div className="eb-module-mini-list">{(integrations.archive || []).length ? integrations.archive.map((row) => <span key={row.status}><strong>{row.status}</strong><small>{row.n} kayıt</small></span>) : <span><strong>Hazır</strong><small>Bekleyen arşiv özeti yok</small></span>}</div></section>
    </section>}

    <DetailDrawer id={selectedId} onClose={() => setSelectedId("")} onChanged={view === "pool" ? loadPool : loadDashboard} />
  </section>;
}
