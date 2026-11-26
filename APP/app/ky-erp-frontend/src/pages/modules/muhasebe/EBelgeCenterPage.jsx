import {apiPatch} from "../../../utils/api";
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
  Upload,
  X,
} from "lucide-react";
import {
  finalizeEBelge,
  getEBelgeCompanySuggestions,
  getEBelgeDashboard,
  getEBelgeDetail,
  getEBelgeFilePreview,
  getEBelgeVisualProfiles,
  getEBelgeAccountingPrintStatuses,
  getEBelgeIntegrations,
  getEBelgePool,
  openEBelgeBlob,
  reserveEBelgePreviewTab,
  reconcileAllEBelge,
  reconcileEBelge,
  recoverEBelgeCompanyFromXml,
  recoverVerifiedEBelgeCompaniesBatch,
  resolveEBelgeIssue,
  updateEBelge,
  uploadEBelge,
} from "../../../services/eBelgeApi";
import EBelgeLineReview from "./EBelgeLineReview";
import EBelgeAccountingPrint, { isIncomingAccountingInvoice } from "./EBelgeAccountingPrint";
import EBelgeManualFallback from "./EBelgeManualFallback";
import {eBelgeFileKey,splitEBelgeUploadQueue} from "./eBelgeUploadQueue";
import {selectOriginalEBelgeFiles} from "./eBelgeOriginalFiles";
import {parseUblForVisualOutput,renderUblOutput} from "./visualUblOutput";
import VisualProfileStudio from "./VisualProfileStudio";
import EBelgeAdapterManager from "./EBelgeAdapterManager";
import InvoiceDispatchControlWorkspace from "./InvoiceDispatchControlWorkspace";
import IncomingDispatchBillingWorkspace from "./IncomingDispatchBillingWorkspace";
import "./eBelgeCenter.css";
import EBelgeDraftWorkspace from "./EBelgeDraftWorkspace";
import EBelgeReceiveWorkspace from "./EBelgeReceiveWorkspace";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const monthStart = () => `${today().slice(0, 8)}01`;
const FOUR_DOCUMENT_VIEWS = [
 ["incoming-invoices","gelen-faturalar","Gelen Faturalar"],
 ["incoming-dispatches","gelen-irsaliyeler","Gelen İrsaliyeler"],
 ["outgoing-dispatches","giden-irsaliyeler","Giden İrsaliyeler"],
 ["outgoing-invoices","giden-faturalar","Giden Faturalar"],
];
const FOUR_DOCUMENT_FILTERS={
 "incoming-invoices":"INCOMING_INVOICE",
 "unread-invoices":"INCOMING_INVOICE",
 "unread-dispatches":"INCOMING_DISPATCH",
 "incoming-dispatches":"INCOMING_DISPATCH",
 "outgoing-dispatches":"OUTGOING_DISPATCH",
 "outgoing-invoices":"OUTGOING_INVOICE",
};
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
  MANUAL_REVIEW: "Manuel Giriş",
}[String(value || "").toUpperCase()] || value || "-");

const statusLabel = (value) => ({
  INGESTED: "Yeni",
  REVIEW_REQUIRED: "Kontrol Bekliyor",
  READY_FOR_APPROVAL: "Onaya Hazır",
  APPROVED: "Onaylandı",
  FINALIZING: "İşleniyor",
  FINALIZE_RETRY: "Yeniden deneme / inceleme",
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
  const [uploadErrors, setUploadErrors] = useState([]);
  const [manualFileKey,setManualFileKey]=useState("");
  const [progress,setProgress]=useState("");

  const addFiles=(list)=>{
    if(busy)return;
    const selected=Array.from(list||[]);
    const next=selected.filter(file=>/\.(xml|pdf|jpe?g|png|webp|bmp|tiff?)$/i.test(file.name)&&file.size<=20*1024*1024);
    setFiles(old=>[...new Map([...old,...next].map(file=>[eBelgeFileKey(file),file])).values()]);
    setUploadErrors([]);
    if(next.length!==selected.length){setTone("warning");setMessage("Desteklenmeyen veya 20 MB dosya sınırını aşan dosyalar eklenmedi.")}
    else setMessage("");
  };
  const send=async()=>{
    if(!files.length||busy)return;
    setBusy(true);setMessage("");setTone("success");setUploadErrors([]);setManualFileKey("");
    const batches=splitEBelgeUploadQueue(files),acceptedItems=[],errors=[],failedFiles=[];
    let index=0;
    try{
      for(const batch of batches){
        setProgress(`Parti ${index+1}/${batches.length} · ${acceptedItems.length} belge alındı`);
        let result;
        try{result=await uploadEBelge(batch)}
        catch(err){
          // Transport failures have unknown outcomes; never auto-retry or drop affected files.
          setFiles([...failedFiles,...batches.slice(index).flat()]);
          setUploadErrors(errors);setTone("warning");
          setMessage(`${acceptedItems.length} belge kabul edildi. Parti ${index+1} sonucu belirsiz: ${err?.message||"Sunucu yanıtı alınamadı"}. Tekrar göndermeden önce Belge Havuzu'nu kontrol edin.`);
          if(acceptedItems.length)await onUploaded?.({items:acceptedItems,errors,total:files.length});
          return;
        }
        const accepted=Array.isArray(result?.items)?result.items:[],rejected=Array.isArray(result?.errors)?result.errors:[];
        if(accepted.length+rejected.length!==batch.length){
          setFiles([...failedFiles,...batches.slice(index).flat()]);setTone("warning");
          setMessage("Parti yanıtı eksik; aynı dosya otomatik yeniden gönderilmedi. Belge Havuzu'nu kontrol edin.");
          if(acceptedItems.length)await onUploaded?.({items:acceptedItems,errors,total:files.length});
          return;
        }
        acceptedItems.push(...accepted);errors.push(...rejected);
        const counts=new Map();
        rejected.forEach(row=>counts.set(String(row.fileName||""),(counts.get(String(row.fileName||""))||0)+1));
        for(const file of batch){
          const count=counts.get(file.name)||0;
          if(count>0){failedFiles.push(file);counts.set(file.name,count-1);}
        }
        index+=1;
      }
      setFiles(failedFiles);setUploadErrors(errors);
      if(inputRef.current)inputRef.current.value="";
      setTone(errors.length?"warning":"success");
      setMessage(errors.length?
        `${acceptedItems.length} belge havuza alındı, ${errors.length} dosya alınamadı. Yalnız hatalılar kuyrukta kaldı; PDF/görseli elle girebilirsiniz.`:
        `${acceptedItems.length} belge havuza alındı; güvenli partiler tamamlandı.`);
      await onUploaded?.({items:acceptedItems,errors,total:files.length});
    }finally{setProgress("");setBusy(false)}
  };
  const manualFile=files.find(file=>eBelgeFileKey(file)===manualFileKey);
  const onManualSaved=async(result,file)=>{
    setFiles(old=>old.filter(row=>eBelgeFileKey(row)!==eBelgeFileKey(file)));
    setManualFileKey("");
    setUploadErrors(old=>old.filter(row=>row.fileName!==file.name));
    setTone("success");
    setMessage(`${file.name} kontrol bekleyen manuel belge olarak alındı. Belge ve kalemlerin son kontrolü gerekiyor.`);
    await onUploaded?.(result);
  };

  return <section className="eb-upload-card">
    <div className="eb-section-title">
      <div>
        <strong>Belge Yükle</strong>
        <span>Dosyayı yükleyin; sistem Hakan Emprime tarafını, belge türünü ve gelen/giden yönünü kendisi belirlesin.</span>
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
      <span>XML · PDF · JPG · PNG · WEBP · BMP · TIFF — sınırsız seçim kuyruğu · dosya başına 20 MB · güvenli partiler</span>
    </button>
    <input
      ref={inputRef}
      type="file"
      multiple
      accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff"
      hidden
      onChange={(event) => addFiles(event.target.files)}
    />
    {files.length>0&&<div className="eb-file-queue">
      <strong>{files.length} dosya sırada · {splitEBelgeUploadQueue(files).length} güvenli parti</strong>
      {files.slice(0,80).map(file=><div key={eBelgeFileKey(file)}>
        <FileText size={16}/><span>{file.name}</span>
        <small>{(file.size/1024/1024).toFixed(2)} MB</small>
        {!/\.xml$/i.test(file.name)&&<button type="button" disabled={busy} onClick={()=>setManualFileKey(eBelgeFileKey(file))}>Elle Gir</button>}
        <button type="button" disabled={busy} aria-label={`${file.name} kuyruktan kaldır`}
          onClick={()=>setFiles(old=>old.filter(row=>eBelgeFileKey(row)!==eBelgeFileKey(file)))}><X size={15}/></button>
      </div>)}
      {files.length>80&&<small>İlk 80 dosya gösteriliyor; kalan {files.length-80} dosya da işleme dahil.</small>}
    </div>}
    {manualFile&&<EBelgeManualFallback key={manualFileKey} file={manualFile} onSaved={onManualSaved} onCancel={()=>setManualFileKey("")}/>}
    {progress&&<p role="status" className="eb-inline-message">{progress}</p>}
    {uploadErrors.length > 0 ? <div className="eb-inline-message warning" role="alert">
      <strong>Alınamayan dosyalar</strong>
      <ul>{uploadErrors.map((item, index) => <li key={`${item.fileName}-${index}`}>
        {item.fileName}: {item.message || item.code || "Dosya kontrolü gerekli."}
      </li>)}</ul>
    </div> : null}
    <div className="eb-upload-footer">
      <span className={message ? `eb-inline-message ${tone}` : ""}>{message}</span>
      <button type="button" className="eb-primary" disabled={!files.length || busy} onClick={send}>
        {busy ? <LoaderCircle className="eb-spin" size={17} /> : <Upload size={17} />}
        {busy ? "Partiler işleniyor" : "Sırayı Havuza Al ve Eşleştir"}
      </button>
    </div>
  </section>;
}

function DetailDrawer({ id, onClose, onChanged, mainCompanySlug, onOpenMailDrafts, autoOpenPdf = false }) {
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);
  const autoPreviewStarted = useRef(false);
  useEffect(() => () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview?.url]);

  const showPdfInPlace = useCallback(async (blob, fileName) => {
    if (!(blob instanceof Blob) || blob.size < 5 || await blob.slice(0, 5).text() !== "%PDF-")
      throw new Error("PDF imzası doğrulanamadı. Orijinal belgeyi kontrol edin.");
    const pdf = /^application\/pdf(?:;|$)/i.test(blob.type) ? blob : new Blob([blob], { type: "application/pdf" });
    setPdfPreview({ url: URL.createObjectURL(pdf), fileName: String(fileName || "Belge.pdf") });
  }, []);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [finalAcknowledged, setFinalAcknowledged] = useState(false);
  const [finalPhysicalReceived, setFinalPhysicalReceived] = useState(false);
  const [manualSourceConfirmed,setManualSourceConfirmed] = useState(false);
  const finalInFlight = useRef(false);
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
  useEffect(() => { setFinalConfirmOpen(false); setFinalAcknowledged(false); setFinalPhysicalReceived(false); setManualSourceConfirmed(false); }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!companyOpen || companyQuery.trim().length < 2) { setCompanies([]); return undefined; }
    const timer = window.setTimeout(() => {
      getEBelgeCompanySuggestions(companyQuery).then(setCompanies).catch(() => setCompanies([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [companyOpen, companyQuery]);

  const action = async (key, fn) => {
    setBusy(key); setError("");
    try { await fn(); await load(); await onChanged?.(); if (!key.startsWith("file-")) window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "e-belge", documentId: id, action: key } })); }
    catch (e) { setError(e?.message || "İşlem tamamlanamadı."); }
    finally { setBusy(""); }
  };
  const preview = async (file) => {
    const isPdf = /[.]pdf$/i.test(String(file.file_name || "")) || /pdf/i.test(String(file.mime_type || ""));
    const reservedWindow = isPdf ? null : reserveEBelgePreviewTab();
    setBusy(`file-${file.id}`); setError("");
    try {
      const blob = await getEBelgeFilePreview(file.id);
      if (isPdf) await showPdfInPlace(blob, file.file_name || "Orijinal.pdf");
      else openEBelgeBlob(blob, reservedWindow);
    } catch (e) {
      if (reservedWindow && !reservedWindow.closed) reservedWindow.close();
      setError(e?.message || "Orijinal belge açılamadı. PDF kaynağını kontrol edin.");
    } finally { setBusy(""); }
  };
  const downloadOriginal = async (file, kind) => {
    if (busy || !file?.id) return;
    setBusy("download-" + file.id); setError("");
    try {
      const blob = await getEBelgeFilePreview(file.id);
      if (kind === "pdf" && await blob.slice(0, 5).text() !== "%PDF-") throw new Error("Orijinal PDF imzası doğrulanamadı.");
      if (kind === "xml") {
        const xml = new DOMParser().parseFromString(await blob.text(), "application/xml");
        if (xml.querySelector("parsererror") || /^(html|parsererror)$/i.test(xml.documentElement?.localName || "")) throw new Error("Orijinal XML doğrulanamadı.");
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = String(file.file_name || ("Belge." + kind)).replace(/[\\/]/g, "_");
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
    } catch (e) { setError(e?.message || "Orijinal dosya indirilemedi."); }
    finally { setBusy(""); }
  };
  const openSupplierAccountingPdf = async () => {
    setError("");
    try {
      const files = Array.isArray(detail?.files) ? detail.files : [];
      const pdfFile = files.find(file => /[.]pdf$/i.test(String(file.file_name || "")));
      if (pdfFile) {
        await showPdfInPlace(await getEBelgeFilePreview(pdfFile.id), pdfFile.file_name);
        return;
      }
      const xmlFile = files.find(file => /[.]xml$/i.test(String(file.file_name || "")));
      if (!xmlFile) throw Error("Bu faturaya bağlı orijinal XML/PDF yok. Belge kaynağını kontrol edin.");
      const xml = await (await getEBelgeFilePreview(xmlFile.id)).text();
      const document = parseUblForVisualOutput(xml);
      if (document.kind !== "INVOICE" || String(detail.document_no) !== document.number)
        throw Error("Belge numarası veya türü orijinal XML ile uyuşmuyor.");
      const all = await getEBelgeVisualProfiles();
      const profile = (all?.items || []).find(p => p.issuerTaxNo === document.supplier?.tax && p.kind === "INVOICE" && p.approved === true);
      // Only a secondary CONTROL PDF is created when the provider's original PDF is missing.
      const output = await renderUblOutput(xml, profile?.layout || {}, "PDF");
      await showPdfInPlace(output.blob, `${detail.document_no}-KONTROL.pdf`);
    } catch (e) {
      setError(e?.message || "Muhasebe PDF'si açılamadı.");
    }
  };
  // The workflow's "Müşteri İrsaliyesini Aç" must display the original PDF
  // immediately in this same KY ERP screen, not navigate to another module tab.
  useEffect(() => {
    if (!autoOpenPdf || autoPreviewStarted.current || !detail?.files) return;
    autoPreviewStarted.current = true;
    const file = detail.files.find(item => /[.]pdf$/i.test(String(item.file_name || "")));
    if (!file) return; // XML stays accessible; no fake PDF fallback for an irsaliye.
    let cancelled = false;
    getEBelgeFilePreview(file.id).then(async blob => {
      if (!cancelled) await showPdfInPlace(blob, file.file_name);
    }).catch(error => {
      if (!cancelled) setError(error?.message || "İlişkili PDF açılamadı.");
    });
    return () => { cancelled = true; };
  }, [autoOpenPdf, detail, showPdfInPlace]);

  const saveDocument = async () => action("edit", async () => { await updateEBelge(id, editForm); setEditing(false); });
  const confirmFinancialPosting = async () => {
    if (finalInFlight.current || busy || !finalConfirmOpen || !finalAcknowledged || !detail || detail.status === "POSTED") return;
    finalInFlight.current = true;
    setBusy("final");
    setError("");
    try {
      await finalizeEBelge(id, { confirmed: true, expectedUpdatedAt: detail.updated_at || detail.updatedAt || "", retryPhysical: detail.status === "FINALIZE_RETRY", confirmPhysicalReceipt: finalPhysicalReceived });
      setFinalConfirmOpen(false);
      setFinalAcknowledged(false);
      setFinalPhysicalReceived(false);
      window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "e-belge", documentId: id } }));
      await load();
      await onChanged?.();
    } catch (e) {
      setError(e?.message || "Belge muhasebeleştirmesi tamamlanamadı; kayıt durumunu kontrol edin.");
    } finally {
      finalInFlight.current = false;
      setBusy("");
    }
  };

  if (!id) return null;
  const openIssues = detail?.issues?.filter((item) => !item.is_resolved) || [];
  const relationCount = detail?.relations?.length || 0;
  const { pdf:originalPdf, xml:originalXml, other:otherFiles }=selectOriginalEBelgeFiles(detail?.files);
  const isProviderSource=/^ISNET/i.test(String(detail?.source_type||detail?.provider_type||""));

  const supplierPhysicalInvoice = detail?.direction === "INCOMING" && /FATURA|INVOICE|ARSIV/i.test(String(detail?.document_type || "")) &&
    (detail?.lines || []).some((line) => ["BOYAHANE", "STOCK", "CONSUMABLE"].includes(String(line?.raw_metadata?.routingType || "").toUpperCase()));

  return <div className="eb-drawer-backdrop eb-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="eb-drawer eb-document-modal" role="dialog" aria-modal="true" aria-label={detail?.document_no ? `Belge ${detail.document_no}` : "Belge detayı"}>
      <header className="eb-document-modal-head">
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
        <section className="eb-original-archive" aria-label="Orijinal belge arşivi">
          <div className="eb-original-archive-head">
            <div><strong>Orijinal Belge Arşivi</strong>
              <span>{isProviderSource?"İşNet":sourceLabel(detail.source_type)} · Aynı belgeye bağlı XML ve PDF, değişmeden saklanır.</span>
            </div>
            <span className="eb-original-archive-count">{Number(Boolean(originalXml))+Number(Boolean(originalPdf))}/2 ana dosya</span>
          </div>
          <div className="eb-original-file-actions">
            {originalPdf?<button type="button" className="eb-original-file-primary" disabled={busy===`file-${originalPdf.id}`} onClick={()=>void preview(originalPdf)}>
              <FileText size={19}/><span><strong>Orijinal PDF</strong><small>Görüntüle / Yazdır</small></span><CheckCircle2 size={16}/>
            </button>:<div className="eb-original-file-missing"><FileText size={19}/><span><strong>Orijinal PDF eksik</strong><small>XML korunur, tekrar indirmede tamamlanabilir.</small></span></div>}
            {originalXml?<button type="button" className="eb-original-file-xml" disabled={busy===`file-${originalXml.id}`} onClick={()=>void preview(originalXml)}>
              <FileCheck2 size={19}/><span><strong>Orijinal XML</strong><small>UBL-TR · Aç / İndir</small></span><CheckCircle2 size={16}/>
            </button>:<div className="eb-original-file-missing"><FileCheck2 size={19}/><span><strong>Orijinal XML eksik</strong><small>Belge kaynağı kontrol edilmeli.</small></span></div>}
          </div>
          <div className="eb-document-toolbar" aria-label="Orijinal dosyaları indir">
            <button type="button" disabled={!originalPdf||Boolean(busy)} onClick={()=>void downloadOriginal(originalPdf,"pdf")}>PDF İndir</button>
            <button type="button" disabled={!originalXml||Boolean(busy)} onClick={()=>void downloadOriginal(originalXml,"xml")}>XML İndir</button>
          </div>
          {otherFiles.length>0&&<details className="eb-original-extra"><summary>Diğer ek dosyalar · {otherFiles.length}</summary>
            <div className="eb-original-extra-list">{otherFiles.map(file=><button key={file.id} type="button" onClick={()=>void preview(file)}>{file.file_name||"Ek dosya"}</button>)}</div>
          </details>}
          {!originalPdf&&originalXml&&<small className="eb-original-archive-note">Gerekirse XML’den yalnız kontrol amaçlı PDF önizlemesi üretilebilir. Bu çıktı orijinal İşNet PDF’si değildir; şablon zorunlu değildir.</small>}
        </section>
        <EBelgeAccountingPrint detail={detail} mainCompanySlug={mainCompanySlug}
          onPdf={()=>void openSupplierAccountingPdf()} onChanged={onChanged}/>
        <section className="eb-document-toolbar">
          {detail.direction==="INCOMING"&&["READ","UNREAD"].map(state=><button key={state} type="button" disabled={Boolean(busy)} onClick={()=>action("read-state",()=>apiPatch("/e-belge/documents/"+encodeURIComponent(id)+"/read-state",{mainCompanySlug,state}))}>{state==="READ"?"Okundu İşaretle":"Okunmadı İşaretle"}</button>)}
          {detail.direction==="OUTGOING"&&<button type="button" onClick={()=>onOpenMailDrafts?.(detail)}>
             Fatura / İrsaliye Mail Merkezi
           </button>}
          <button type="button" disabled={["FINALIZING","FINALIZE_RETRY","APPROVED","POSTED"].includes(detail.status)} onClick={() => setEditing(true)}><Pencil size={16} /> Belge Düzenle</button>
          {!detail.party_company_id && <button type="button" onClick={() => setCompanyOpen(true)}>Cari Eşleştir</button>}
          {!detail.party_company_id && detail.xml_file_asset_id && !["FINALIZING","FINALIZE_RETRY","APPROVED","POSTED"].includes(detail.status) && <button type="button" disabled={Boolean(busy)} title="Asıl UBL-TR XML içindeki VKN, belge no, tarih ve yön doğrulanır; eşleşme kesin değilse kayıt değiştirilmez." onClick={() => action("xmlCompany", () => recoverEBelgeCompanyFromXml(id))}>{busy === "xmlCompany" ? <LoaderCircle className="eb-spin" size={16} /> : <FileCheck2 size={16} />} XML’den Firma Oluştur / Eşleştir</button>}
          <button type="button" disabled={Boolean(busy) || ["FINALIZING","FINALIZE_RETRY","APPROVED","POSTED"].includes(detail.status)} onClick={() => action("match", () => reconcileEBelge(id))}>{busy === "match" ? <LoaderCircle className="eb-spin" size={16} /> : <Link2 size={16} />} Yeniden Kontrol</button>
          <button type="button" className="eb-primary" disabled={Boolean(busy) || ["FINALIZING","APPROVED","POSTED"].includes(detail.status)} onClick={() => { setFinalAcknowledged(false); setFinalConfirmOpen(true); }}>{busy === "final" ? <LoaderCircle className="eb-spin" size={16} /> : <FileCheck2 size={16} />} {detail.status === "FINALIZE_RETRY" ? "Kontrollü Yeniden Dene" : "Son Onay / Muhasebeleştir"}</button>
        </section>
        <div className="eb-document-body">
          <section className="eb-document-lines-section">
            <div className="eb-section-title"><div><strong>Belge Kalemleri</strong><span>Ürün, LOT ve gider bilgilerini satır bazında yönetin.</span></div><span>{detail.lines?.length || 0} satır</span></div>
            {detail.lines?.length ? <div className="eb-lines">
              <div className="eb-line head"><span>Ürün</span><span>Miktar</span><span>LOT</span><span>Yönlendirme</span><span>İşlem</span></div>
              {detail.lines.map((line) => <div className="eb-line" key={line.id}>
                <span><strong>{line.description || line.product_code || "Kalem"}</strong><small>{line.product_code || line.supplier_product_code || ""}</small></span>
                <span>{Number(line.quantity || 0).toLocaleString("tr-TR")} {line.unit_code || ""}{Number(line.raw_metadata?.calculatedKg || 0) > 0 && <small> · {Number(line.raw_metadata.calculatedKg).toLocaleString("tr-TR")} kg ambalaj karşılığı</small>}</span>
                <span>{lotLabel(line)}</span>
                <span><strong>{routingLabel(line)}</strong><small>{line.raw_metadata?.expenseCategoryName ? `Gider: ${line.raw_metadata.expenseCategoryName}` : ""}</small></span>
                <span><EBelgeLineReview documentId={id} documentType={detail.document_type} line={line} onChanged={async () => { await load(); await onChanged?.(); window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "e-belge", documentId: id, action: "line" } })); }} hasCounterDocument={relationCount > 0} /></span>
              </div>)}
            </div> : <Empty title="Kalem bulunamadı" text="Belge kalemleri kontrol gerektiriyor." />}
          </section>

          <div className="eb-document-folds">
            <details className="eb-fold" open={detail.physicalStatus === "SCHEMA_APPROVAL_REQUIRED" || detail.status === "FINALIZE_RETRY"}>
              <summary><strong>Fiziksel Stok / LOT İşlem Durumu</strong><span>{detail.physicalOperations?.length || 0} kayıt</span></summary>
              <div className="eb-fold-body">
                {detail.physicalStatus === "SCHEMA_APPROVAL_REQUIRED" && <p role="alert">Fiziksel işlem şeması için üretim D1 onayı bekleniyor. Stok/LOT kaydı güvenli olarak kapalı.</p>}
                {(detail.physicalOperations || []).map((op) => <div key={op.id} className="eb-issues">
                  <span><strong>{op.operation_type === "COST_LINK" ? "Maliyet Bağı" : "Fiziksel Giriş"} · {{
                    PENDING:"Kuyrukta",PROCESSING:"İşleniyor",DONE:"Tamamlandı",
                    RETRY:"Tekrar denenecek",NEEDS_REVIEW:"İnceleme gerekiyor"
                  }[op.state] || op.state}</strong>
                    <small>Satır: {op.physical_line_id} · LOT: {op.lot_normalized || "LOT yok"} · Miktar: {Number(op.quantity||0).toLocaleString("tr-TR")} · Deneme: {op.attempts}</small>
                    {op.last_error_code && <small role="alert">Hata: {op.last_error_code} · Son deneme: {op.updated_at || "-"}</small>}
                    {op.next_attempt_at && op.state === "RETRY" && <small>Tekrar deneme: {new Date(op.next_attempt_at).toLocaleString("tr-TR")}</small>}
                  </span>
                </div>)}
                {!detail.physicalOperations?.length && detail.physicalStatus !== "SCHEMA_APPROVAL_REQUIRED" && <span className="eb-muted">Henüz fiziksel işlem kaydı yok.</span>}
              </div>
            </details>
            <details className="eb-fold" open={openIssues.length > 0}>
              <summary><strong>Kontroller</strong><span>{openIssues.length} açık</span></summary>
              <div className="eb-fold-body">{openIssues.length ? <div className="eb-issues">{openIssues.map((issue) => <div key={issue.id}><AlertTriangle size={17} /><span><strong>{issue.issue_code}</strong><small>{issue.message}</small></span>{issue.issue_code==="MANUAL_SOURCE_REVIEW_REQUIRED"&&<>
                  <label className="eb-manual-ack"><input type="checkbox" checked={manualSourceConfirmed}
                    onChange={e=>setManualSourceConfirmed(e.target.checked)}/>
                    Orijinal belgeyi, kalemleri, KDV'yi ve toplamı tek tek kontrol ettim.
                  </label>
                  <button type="button" disabled={!manualSourceConfirmed||Boolean(busy)}
                    onClick={()=>action(`issue-${issue.id}`,()=>resolveEBelgeIssue(id,issue.id,true))}>
                    Manuel Kaynağı Doğrula
                  </button>
                </>}
                {issue.severity !== "ERROR" && <button type="button" onClick={() => action(`issue-${issue.id}`, () => resolveEBelgeIssue(id, issue.id))}>Çözüldü</button>}</div>)}</div> : <div className="eb-good"><CheckCircle2 size={17} /> Açık sorun yok.</div>}</div>
            </details>
            <details className="eb-fold">
              <summary><strong>Fatura – İrsaliye Bağı</strong><span>{relationCount}</span></summary>
              <div className="eb-fold-body">{relationCount ? <div className="eb-relations">{detail.relations.map((row) => <div key={row.id}><Link2 size={16} /><span>{row.related_document_no || row.related_document_id}</span><small>{row.relation_type}</small></div>)}</div> : <span className="eb-muted">Henüz bağlı irsaliye/fatura yok.</span>}</div>
            </details>

          </div>
        </div>
      </>}
    </section>
    {pdfPreview && <div className="eb-inline-pdf-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPdfPreview(null); }}>
      <section className="eb-inline-pdf-panel" role="dialog" aria-modal="true" aria-label="Belge PDF önizleme">
        <header><div><strong>{pdfPreview.fileName}</strong><small>Orijinal belge, KY ERP ekranından ayrılmadan görüntülenir.</small></div>
          <button type="button" onClick={() => setPdfPreview(null)} aria-label="PDF önizlemeyi kapat"><X size={20}/></button></header>
        <iframe title={`PDF: ${pdfPreview.fileName}`} src={pdfPreview.url} />
        <footer><span>PDF görüntüleyicisinin yazdır ve indir araçlarını kullanabilirsiniz.</span>
          <button type="button" onClick={() => window.open(pdfPreview.url, "_blank", "noopener,noreferrer")}>Yeni Sekmede Aç</button>
          <button type="button" onClick={() => setPdfPreview(null)}>Kapat</button>
        </footer>
      </section>
    </div>}
    {finalConfirmOpen && detail && <div className="eb-submodal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setFinalConfirmOpen(false); }}>
      <section className="eb-submodal eb-final-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="eb-final-confirm-title">
        <header>
          <div><small>MUHASEBEYE KAYIT ÖNCESİ</small><h3 id="eb-final-confirm-title">Son Onay / İşlem Özeti</h3></div>
          <button type="button" disabled={Boolean(busy)} onClick={() => setFinalConfirmOpen(false)} aria-label="Kapat"><X size={18} /></button>
        </header>
        <div className="eb-final-confirm-body">
          <p>Bu işlem belgeyi muhasebeleştirir ve uygun stok/LOT hareketlerini oluşturabilir. Resmî e-Belge gönderimi değildir. Hatalı kayıt oluşmaması için bilgileri kontrol edin.</p>
          <dl>
            <div><dt>Belge / Tür</dt><dd>{detail.document_no || "Belge No Yok"} · {typeLabel(detail.document_type)}</dd></div>
            <div><dt>Firma / Cari</dt><dd>{detail.party_name || "Eşleşmedi"}</dd></div>
            <div><dt>Yön</dt><dd>{detail.direction === "OUTGOING" ? "Giden" : "Gelen"}</dd></div>
            <div><dt>Tutar / KDV</dt><dd>{money(detail.payable_total, detail.currency)} · KDV {money(detail.tax_total, detail.currency)}</dd></div>
            <div><dt>Kalem / Açık kontrol</dt><dd>{detail.lines?.length || 0} kalem · {openIssues.length} açık kontrol</dd></div>
          </dl>
          {supplierPhysicalInvoice && <label className="eb-final-acknowledge"><input type="checkbox" checked={finalPhysicalReceived} onChange={(event) => setFinalPhysicalReceived(event.target.checked)} disabled={Boolean(busy)} /> Ürünleri fiziksel olarak teslim aldım; bu alış faturasındaki ürün ve LOT bilgileriyle Boyahane/Stok girişi oluşturulsun. İrsaliye ayrıca gelirse aynı miktar ikinci kez eklenmesin.</label>}
          <label className="eb-final-acknowledge"><input type="checkbox" checked={finalAcknowledged} onChange={(event) => setFinalAcknowledged(event.target.checked)} disabled={Boolean(busy)} /> Belgenin cari, kalem, LOT ve tutar bilgilerini inceledim; muhasebeleştirmeyi açıkça onaylıyorum.</label>
          {error && <p role="alert" className="eb-final-error">{error}</p>}
        </div>
        <footer>
          <button type="button" disabled={Boolean(busy)} onClick={() => setFinalConfirmOpen(false)}>Vazgeç</button>
          <button type="button" className="eb-primary" disabled={Boolean(busy) || !finalAcknowledged} onClick={confirmFinancialPosting}>{busy === "final" ? "Kaydediliyor..." : detail.status === "FINALIZE_RETRY" ? "Onayla ve Yeniden Dene" : "Onayla ve Muhasebeleştir"}</button>
        </footer>
      </section>
    </div>}
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

export default function EBelgeCenterPage({ activeMainCompany, initialView = "overview", openModule, moduleActionContext }) {
  const allowedViews = ["overview", "incoming", "outgoing", ...Object.keys(FOUR_DOCUMENT_FILTERS), "pool", "matching", "issues", "workflow", "archive", "integrations", "visual-templates", "receive", "invoice-drafts", "dispatch-drafts"];
  const view = allowedViews.includes(initialView) ? initialView : "overview";
  const poolViews = useMemo(() => ["incoming", "outgoing", ...Object.keys(FOUR_DOCUMENT_FILTERS), "pool", "matching", "issues", "archive"], []);
  const [pool, setPool] = useState({ items: [], stats: {}, total: 0 });
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("DATE");
  const [sortDirection, setSortDirection] = useState("DESC");
  const poolRequestSeq = useRef(0);
  const [dashboard, setDashboard] = useState({ summary: {}, recent: [] });
  const [integrations, setIntegrations] = useState({ mainCompanySlug:"", providers: [], archive: [], fileHub: [] });
  const integrationRequestSeq = useRef(0);
  const [integrationError,setIntegrationError]=useState("");
  const [lastUpload, setLastUpload] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [statusFilter,setStatusFilter] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [companyBatchBusy, setCompanyBatchBusy] = useState(false);
  const companyBatchLock = useRef(false);
  const matchingLock = useRef(false);
  const [matchingConfirmOpen, setMatchingConfirmOpen] = useState(false);
  const [matchingApproved, setMatchingApproved] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [autoPdfDocumentId, setAutoPdfDocumentId] = useState("");
  const [printStatuses,setPrintStatuses]=useState({});
  const [printStatusError,setPrintStatusError]=useState("");
  const [onlyPrintPending,setOnlyPrintPending]=useState(false);
  const [archiveType, setArchiveType] = useState("ALL");
  const [archiveSelectedIds, setArchiveSelectedIds] = useState([]);
  const [archiveQueue, setArchiveQueue] = useState({ items: [], index: 0 });
  const mainCompanySlug=activeMainCompany?.slug||activeMainCompany?.id||"";

  const effectiveFilter=FOUR_DOCUMENT_FILTERS[view]||(
   view==="matching"?"MATCHING_WAIT":view==="issues"?"ISSUE":view==="archive"?archiveType:view==="pool"?filter:"ALL");
  const direction = view === "incoming" ? "INCOMING" : view === "outgoing" ? "OUTGOING" : undefined;
  const params = useMemo(()=>({
    mainCompanySlug,filter:effectiveFilter,direction,q:query,from,to,status:statusFilter,page,pageSize:50,sortBy,sortDirection,
    ...(view.startsWith("unread-")?{readStatus:"UNREAD"}:{}),
    ...((view==="incoming-invoices"||(view==="archive"&&archiveType==="INCOMING_INVOICE"))&&onlyPrintPending?{printStatus:"PENDING"}:{})
  }),[mainCompanySlug,direction,effectiveFilter,from,onlyPrintPending,page,query,to,view,statusFilter,sortBy,sortDirection,archiveType]);
  const openEBelgeTab = useCallback((tabKey) => openModule?.("e-belge", { tabKey }), [openModule]);
  const sortPoolBy = (column) => {
    if (sortBy === column) setSortDirection((old) => old === "ASC" ? "DESC" : "ASC");
    else { setSortBy(column); setSortDirection(column === "DATE" ? "DESC" : "ASC"); }
    setPage(1);
  };
  const renderPoolSort = (label, column) => column ? <span>
    <button type="button" className="eb-sort-header" onClick={() => sortPoolBy(column)}
      aria-label={`${label} sütununu sırala`} aria-pressed={sortBy === column}>
      {label} <span aria-hidden="true">{sortBy === column ? (sortDirection === "ASC" ? "↑" : "↓") : "↕"}</span>
    </button>
  </span> : <span>{label}</span>;

  const loadPool = useCallback(async () => {
    const requestId = ++poolRequestSeq.current;
    const data = await getEBelgePool(params);
    if (requestId !== poolRequestSeq.current) return;
    const maxPage = Math.max(1, Math.ceil(Number(data?.total || 0) / Math.max(1, Number(data?.pageSize || 50))));
    if (page > maxPage) {
      setPage(maxPage);
      return;
    }
    setPool(data || { items: [], stats: {}, total: 0 });
    if(view==="incoming-invoices"||view==="archive"){
      const ids=(data?.items||[])
        .filter(row=>view==="incoming-invoices"||isIncomingAccountingInvoice(row))
        .map(row=>row.id).filter(Boolean);
      if(ids.length){
        try{
          const response=await getEBelgeAccountingPrintStatuses(ids,mainCompanySlug);
          if(requestId===poolRequestSeq.current){
            setPrintStatuses(response?.statuses||{});
            setPrintStatusError("");
          }
        }catch(e){
          if(requestId===poolRequestSeq.current){
            setPrintStatuses({});
            setPrintStatusError(e?.message||"Muhasebe çıktı durumları okunamadı.");
          }
        }
      }else if(requestId===poolRequestSeq.current){setPrintStatuses({});setPrintStatusError("")}
    }
  }, [page, params, mainCompanySlug, view]);

  const dashboardRequestSeq = useRef(0);
  const loadDashboard = useCallback(async () => {
    const seq = ++dashboardRequestSeq.current;
    const data = await getEBelgeDashboard({ mainCompanySlug, today: today(), monthStart: monthStart() });
    if (seq !== dashboardRequestSeq.current) return;
    setDashboard(data || { summary: {}, recent: [] });
  }, [mainCompanySlug]);

  const loadIntegrations = useCallback(async () => {
    const seq=++integrationRequestSeq.current;
    if(!mainCompanySlug)return;
    setIntegrationError("");
    try{
      const data = await getEBelgeIntegrations(mainCompanySlug);
      if(seq!==integrationRequestSeq.current)return;
      if(String(data?.mainCompanySlug||"")!==String(mainCompanySlug)||!Array.isArray(data.providers))throw new Error("Entegrasyon durumunun firma kapsamı doğrulanamadı.");
      setIntegrations({...data,mainCompanySlug});
      if(data.providers.some(p=>p.status==="CHECK_UNAVAILABLE"))setIntegrationError("İşNet oturum durumu geçici olarak doğrulanamadı. Entegrasyon seçimi bundan bağımsızdır.");
    }catch(e){if(seq===integrationRequestSeq.current){
      setIntegrations({mainCompanySlug:"",providers:[],archive:[],fileHub:[]});
      const id=e?.payload?.error?.details?.requestId||"";
      setIntegrationError("Entegrasyon durumu okunamadı; firma bağlantı listesi ayrı doğrulanıyor."+(id?" · İstek: "+id:""));
    }}
  }, [mainCompanySlug]);

  const refreshCurrent = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) {
      setPool({ items: [], stats: {}, total: 0 });
      setDashboard({ summary: {}, recent: [] });
      setIntegrations({ providers: [], archive: [], fileHub: [] });
      setError("e-Belge için ana firma seçin.");
      return;
    }
    if (from && to && from > to) {
      setError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
      return;
    }
    if (["workflow", "visual-templates", "receive", "invoice-drafts", "dispatch-drafts"].includes(view)) return;
    setBusy(true);
    setError("");
    try {
      if (view === "overview") await loadDashboard();
      else if (poolViews.includes(view)) await loadPool();
      else if (view === "integrations") await loadIntegrations();
    } catch (e) {
      setError(e?.message || "e-Belge verileri yüklenemedi.");
    } finally {
      setBusy(false);
    }
  }, [activeMainCompany?.slug, activeMainCompany?.id, from, to, loadDashboard, loadIntegrations, loadPool, poolViews, view]);

  useEffect(() => {
    setPage(1);
    setStatusFilter("ALL");
    setMatchingConfirmOpen(false);
    setMatchingApproved(false);
  }, [view, activeMainCompany?.slug, activeMainCompany?.id]);
  useEffect(() => {
    poolRequestSeq.current += 1;
    integrationRequestSeq.current += 1;
    setIntegrationError("");
    setPool({ items: [], stats: {}, total: 0 });
    setDashboard({ summary: {}, recent: [] });
    setIntegrations({ providers: [], archive: [], fileHub: [] });
    setSelectedId("");
    setPrintStatuses({});setPrintStatusError("");setOnlyPrintPending(false);
    setLastUpload(null);
    setQuery("");
  }, [activeMainCompany?.slug, activeMainCompany?.id]);
  useEffect(() => { void refreshCurrent(); return () => { poolRequestSeq.current += 1; dashboardRequestSeq.current += 1; }; }, [refreshCurrent, activeMainCompany?.slug, activeMainCompany?.id]);
  useEffect(() => {
    if (moduleActionContext?.targetModule !== "e-belge" || !moduleActionContext?.documentId) return;
    setSelectedId(String(moduleActionContext.documentId));
  }, [moduleActionContext?.nonce, moduleActionContext?.documentId, moduleActionContext?.targetModule]);

  // The click is the user's explicit approval. The backend still requires
  // authenticated tenant-scoped MUHASEBE create rights and validated UBL XML.
  const runVerifiedCompanyRecovery = async () => {
    if(companyBatchLock.current || busy || companyBatchBusy)return;
    companyBatchLock.current=true;setCompanyBatchBusy(true);setError("");setNotice("");
    let cursor=null,hasMore=true,processed=0,created=0,linked=0,review=0,routing=0,failed=0;
    try{
      for(let batch=0;batch<8 && hasMore;batch+=1){
        const result=await recoverVerifiedEBelgeCompaniesBatch(cursor);
        processed+=Number(result?.scanned||0);
        created+=Number(result?.created||0);
        linked+=Number(result?.linked||0);
        review+=Number(result?.reviewRequired||0);
        routing+=Number(result?.routingReview||0);
        failed+=Number(result?.errors||0);
        hasMore=Boolean(result?.hasMore && result?.nextCursor);
        cursor=result?.nextCursor||null;
        if(!Number(result?.scanned))break;
      }
      setNotice(`XML firma kontrolü: ${processed} belge tarandı; ${created} yeni cari kartı açıldı, ${linked} belge eşleşti. ${review} belge kimlik kontrolü, ${routing} ürün/LOT kontrolü bekliyor.${failed?` ${failed} kaynak okunamadı; belge havuzunda kaldı.`:""}${hasMore?" Kalan kayıtlar için işlemi tekrar çalıştırın.":""} Kesin muhasebe kaydı veya ödeme yapılmadı.`);
      if(view==="overview")await loadDashboard();else if(poolViews.includes(view))await loadPool();
      window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh",{detail:{source:"e-belge",action:"xml-company-recovery"}}));
    }catch(e){
      setError(`XML cari eşleştirmesi kısmen tamamlanmış olabilir (${linked} belge). Mükerrer açmadan güncel listeyi kontrol edin: ${e?.message||"İşlem tamamlanamadı."}`);
    }finally{companyBatchLock.current=false;setCompanyBatchBusy(false)}
  };

  const runMatching = async () => {
    if (!matchingConfirmOpen || !matchingApproved || matching || matchingLock.current) return;
    matchingLock.current = true;
    setMatching(true);
    setError("");
    setNotice("");
    try {
      const result = await reconcileAllEBelge();
      const checked = Number(result?.total || 0);
      const responses = Array.isArray(result?.results) ? result.results : [];
      const failed = responses.filter((row) => row?.status === "ERROR" || row?.ok === false || Boolean(row?.error)).length;
      setNotice(`${checked} uygun belge eşleştirme kontrolünden geçirildi.${failed ? ` ${failed} belgede hata oluştu; Onay & Sorunlar ekranından kontrol edin.` : " Sonuçlar belge havuzunda görülebilir."}`);
      setMatchingConfirmOpen(false);
      setMatchingApproved(false);
      await loadPool();
      window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "e-belge", action: "matching" } }));
    } catch (e) {
      setMatchingConfirmOpen(false);
      setMatchingApproved(false);
      setError(e?.message || "Toplu eşleştirme sonucu belirsiz olabilir; tekrarlamadan önce kayıtları kontrol edin.");
    } finally {
      matchingLock.current = false;
      setMatching(false);
    }
  };

  const handleUploaded = async (result) => {
    setLastUpload(result || {});
    window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "e-belge", action: "upload" } }));
    try { await loadPool(); } catch { /* Yükleme başarılıysa liste yenileme ikincil kalır. */ }
  };

  const rows = useMemo(() => {
    const allRows = pool.items || [];
    if (view === "incoming") return allRows.filter((row) => String(row.direction || "INCOMING").toUpperCase() !== "OUTGOING");
    if (view === "outgoing") return allRows.filter((row) => String(row.direction || "").toUpperCase() === "OUTGOING");
    return allRows;
  }, [pool.items, view]);
  const companyName = activeMainCompany?.name || activeMainCompany?.title || activeMainCompany?.slug || "Ana firma seçilmedi";
  const summary = dashboard.summary || {};
  const providers = [...(integrations.mainCompanySlug===mainCompanySlug?(integrations.providers || []):[])].sort((a, b) => String(a.label || a.key || "").localeCompare(String(b.label || b.key || ""), "tr"));
  const viewMeta = {
    receive: ["Belgeleri Al", "Firmanın etkin sağlayıcısından veya orijinal XML/PDF dosyasından belge alın."],
    "invoice-drafts": ["Fatura Taslakları", "Tek veri girişi · kaydet · kontrol et. Resmî gönderim ayrı kabul gerektirir."],
    "dispatch-drafts": ["İrsaliye Taslakları", "Sevk kalemleri ve teslim bilgilerini hazırlayın."],
    overview: ["Genel Bakış", "Bugün ve bu ay gelen-giden belgeleri, sorunları ve son hareketleri tek bakışta görün."],
    incoming: ["Gelen Belgeler", "Tedarikçi faturaları ve müşteri/tedarikçi irsaliyelerini tek canonical havuzdan yönetin."],
    "unread-invoices":["Okunmamış Faturalar","Kullanıcıya özel okunma durumu."],
    "unread-dispatches":["Okunmamış İrsaliyeler","Kullanıcıya özel okunma durumu."],
    "incoming-invoices":["Gelen Faturalar","Tedarikçi faturaları · gider kalemleri · muhasebe tek çıktı kontrolü."],
    "incoming-dispatches":["Gelen İrsaliyeler","Müşteriden gelen irsaliyeler ve model bağlantılarını takip edin."],
    "outgoing-dispatches":["Giden İrsaliyeler","Üretim ve model bazında giden irsaliyeleri izleyin."],
    "outgoing-invoices":["Giden Faturalar","Satış faturalarını, ilgili irsaliyeyi ve Outlook işlemlerini izleyin."],
    outgoing: ["Giden Belgeler", "Bizim faturalarımızı ve irsaliyelerimizi kaynak sağlayıcıdan bağımsız tek listede izleyin."],
    pool: ["Belge Havuzu", "XML, PDF ve görselleri yükleyin; belgeyi, firmayı, kalemleri ve dosyaları tek canonical kayıt üzerinden yönetin."],
    matching: ["Eşleştirmeler", "Fatura–irsaliye, firma, ürün ve LOT eşleşmesi bekleyen kayıtları sonuçlandırın."],
    issues: ["Onay & Sorunlar", "Gerçek hata, eksik eşleşme ve son onay bekleyen belgeleri tek yerde çözün."],
    workflow: ["İş Akışları", "Müşteri irsaliyesi → model → bizim irsaliye → fatura zincirini canonical belgeler üzerinden izleyin."],
    archive: ["Arşiv & Çıktı", "Gelen/giden fatura ve irsaliyeleri seçin; orijinal PDF’leri sıra ile açın ve çıktı durumlarını izleyin."],
    integrations: ["Entegrasyonlar", "İşNet ve diğer sağlayıcı bağlantılarını e-Belge adaptörü olarak yönetin; ana belge gerçeği sağlayıcıdan bağımsız kalsın."],
    "visual-templates": ["Görsel Şablonlar", "Düzenleyen VKN/TCKN ve belge türüne göre XML + orijinal PDF örneğini tanıtın; şablonu düzenleyip sonraki XML'lere uygulayın."],
  }[view];
  const poolTitle = viewMeta[0];
  const poolHint = viewMeta[1];
  const showPool = poolViews.includes(view);
  const pageCount = Math.max(1, Math.ceil(Number(pool.total || 0) / Math.max(1, Number(pool.pageSize || 50))));
  const pageSelected = rows.filter(row => archiveSelectedIds.includes(row.id));
  const beginArchiveQueue = () => {
    if (!pageSelected.length) return;
    const items = pageSelected.map(row => ({ id: row.id, documentNo: row.document_no }));
    setArchiveQueue({ items, index: 0 });
    setSelectedId(items[0].id);
    setAutoPdfDocumentId(items[0].id);
  };
  const closeArchiveDocument = () => {
    if (archiveQueue.items.length && archiveQueue.index < archiveQueue.items.length - 1) {
      const index = archiveQueue.index + 1;
      setArchiveQueue(current => ({ ...current, index }));
      const id = archiveQueue.items[index].id;
      setSelectedId(id); setAutoPdfDocumentId(id);
    } else {
      setArchiveQueue({ items: [], index: 0 });
      setSelectedId(""); setAutoPdfDocumentId("");
    }
  };
  useEffect(() => {
    setArchiveSelectedIds([]);
    setArchiveQueue({ items: [], index: 0 });
  }, [mainCompanySlug, view, archiveType, query, from, to, statusFilter, page, sortBy, sortDirection]);


  return <section className="eb-page">
    <div className="eb-company-context" aria-label={`Belge sahibi: ${companyName}`}><span>Belge sahibi</span><strong>{companyName}</strong></div>

    {view !== "integrations" && <div className="eb-hero">
      <div>
        <span className="eb-kicker">e-Belge · Tek Canonical Havuz</span>
        <h2>{viewMeta[0]}</h2>
        <p>{viewMeta[1]}</p>
      </div>
      <div className="eb-hero-actions">
        {(view==="overview"||showPool)&&<button type="button" className="eb-primary" onClick={()=>openEBelgeTab("belgeleri-al")}><RefreshCw size={17}/> Belgeleri Al</button>}
        {(view === "overview" || view === "outgoing-invoices") && <button type="button" className="eb-primary" onClick={()=>openEBelgeTab("fatura-taslaklari")}>+ Fatura Hazırla</button>}
        {(view === "overview" || view === "outgoing-dispatches") && <button type="button" className="eb-primary" onClick={()=>openEBelgeTab("irsaliye-taslaklari")}>+ İrsaliye Hazırla</button>}
        {view === "overview" && <>
          <button type="button" onClick={() => openEBelgeTab("belge-havuzu")}><Upload size={17} /> Belge Yükle</button>
          <button type="button" onClick={runVerifiedCompanyRecovery} disabled={companyBatchBusy||busy} title="Yalnız asıl XML ile VKN, belge kimliği ve tarih doğrulanan eksik carileri aç/eşleştir; kesin muhasebeleştirme yapma">
            {companyBatchBusy?<LoaderCircle size={17} className="eb-spin" />:<Link2 size={17} />} {companyBatchBusy?"Cari Eşleşiyor...":"XML'den Carileri Eşleştir"}
          </button>

          <button type="button" className="eb-primary" onClick={() => openEBelgeTab("onay-sorunlar")}><FileCheck2 size={17} /> Sorunları Aç</button>
        </>}
        {showPool && <>
      <nav className="eb-four-document-nav" aria-label="Dört belge işlem ekranı">
        {FOUR_DOCUMENT_VIEWS.map(([key,tabKey,title])=><button type="button" key={key}
          className={view===key?"active":""} aria-current={view===key?"page":undefined}
          onClick={()=>openEBelgeTab(tabKey)}>{title}</button>)}
      </nav>
          {view!=="pool"&&<button type="button" onClick={()=>openEBelgeTab("belge-havuzu")}><Upload size={17}/> Belge Yükle</button>}
          <button type="button" onClick={loadPool} disabled={busy}><RefreshCw size={17} /> Güncelle</button>
          <button type="button" onClick={runVerifiedCompanyRecovery} disabled={companyBatchBusy||busy} title="Yalnız asıl XML ile VKN, belge kimliği ve tarih doğrulanan eksik carileri aç/eşleştir; kesin muhasebeleştirme yapma">
            {companyBatchBusy?<LoaderCircle size={17} className="eb-spin" />:<Link2 size={17} />} {companyBatchBusy?"Cari Eşleşiyor...":"XML'den Carileri Eşleştir"}
          </button>

          {(view === "matching" || view === "pool") && <button type="button" className="eb-primary" onClick={() => { setMatchingApproved(false); setMatchingConfirmOpen(true); }} disabled={matching || busy}>{matching ? <LoaderCircle className="eb-spin" size={17} /> : <Link2 size={17} />} Eşleşmeleri Kontrol Et</button>}
        </>}
        {view === "integrations" && <button type="button" onClick={loadIntegrations} disabled={busy}><RefreshCw size={17} /> Durumu Yenile</button>}
      </div>
    </div>}

    {error && <div className="eb-error"><AlertTriangle size={18} />{error}</div>}
    {view==="integrations"&&integrationError&&<div className="eb-overview-note" role="status"><AlertTriangle size={18}/><span>{integrationError}</span></div>}
    {notice && <div className="eb-overview-note"><CheckCircle2 size={18} /><div><strong>Kontrol tamamlandı</strong><span>{notice}</span></div></div>}

    {view === "overview" && <>
      <div className="eb-stats eb-dashboard-stats">
        <StatCard label="Bugün Toplam" value={summary.todayTotal} hint="Bugün sisteme alınan" />
        <StatCard label="Bugün Gelen" value={summary.todayIncoming} hint="Alıcı olduğumuz belgeler" />
        <StatCard label="Bugün Giden" value={summary.todayOutgoing} hint="Düzenlediğimiz belgeler" />
        <button type="button" className="eb-dashboard-stat-action" onClick={() => openEBelgeTab("onay-sorunlar")} title="Kontrol bekleyen belgeleri aç"><StatCard label="Kontrol Bekleyen" value={summary.attention} hint="Listeyi aç · uyarı / hata" /></button>
        <button type="button" className="eb-dashboard-stat-action" onClick={() => openEBelgeTab("eslestirmeler")} title="Eşleşme bekleyen belgeleri aç"><StatCard label="Eşleşme Bekleyen" value={summary.matchingWait} hint="Listeyi aç · fatura – irsaliye" /></button>
      </div>
      <section className="eb-dashboard-periods">
        <article className="eb-period-card current"><header><div><span>DÖNEM ÖZETİ</span><strong>Bu Ay</strong></div><b>{Number(summary.monthTotal || 0).toLocaleString("tr-TR")} belge</b></header><div className="eb-period-flow"><div><span>Gelen</span><strong>{Number(summary.monthIncoming || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.monthIncomingAmount)}</small></div><div><span>Giden</span><strong>{Number(summary.monthOutgoing || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.monthOutgoingAmount)}</small></div></div><footer>{dateText(dashboard.monthStart || monthStart())} – Bugün</footer></article>
        <article className="eb-period-card previous"><header><div><span>KARŞILAŞTIRMA</span><strong>Geçen Ay</strong></div><b>{Number(summary.previousMonthTotal || 0).toLocaleString("tr-TR")} belge</b></header><div className="eb-period-flow"><div><span>Gelen</span><strong>{Number(summary.previousMonthIncoming || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.previousMonthIncomingAmount)}</small></div><div><span>Giden</span><strong>{Number(summary.previousMonthOutgoing || 0).toLocaleString("tr-TR")}</strong><small>{money(summary.previousMonthOutgoingAmount)}</small></div></div><footer>{dateText(dashboard.previousMonthStart)} – {dateText(dashboard.previousMonthEnd)}</footer></article>
      </section>
      <section className="eb-pool eb-recent-pool eb-dashboard-recent">
        <div className="eb-section-title"><div><strong>Son İşlemler</strong><span>En son havuza alınan 10 belge ve kontrol durumu</span></div><button type="button" onClick={() => openEBelgeTab("belge-havuzu")}>Belge Havuzunu Aç</button></div>
        {busy && !dashboard.recent?.length ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Özet yükleniyor</div> : dashboard.recent?.length ? <div className="eb-pool-table-scroll eb-dashboard-table-scroll"><div className="eb-table">
          <div className="eb-tr eb-th"><span>Belge</span><span>Firma / Cari</span><span>Tarih</span><span>Kaynak</span><span>Toplam</span><span>Durum</span></div>
          {dashboard.recent.map((row) => <button type="button" className="eb-tr" key={row.id} onClick={() => setSelectedId(row.id)}><span><strong>{row.document_no || "Belge No Yok"}</strong><small>{typeLabel(row.document_type)}</small></span><span><strong>{row.party_name || "Cari eşleşmesi bekliyor"}</strong><small>{row.direction === "OUTGOING" ? "Giden" : "Gelen"}</small></span><span>{dateText(row.issue_date)}</span><span><small>{sourceLabel(row.source_type)}</small></span><span><strong>{money(row.payable_total, row.currency)}</strong><small>{row.currency || "TRY"}</small></span><span className={`eb-chip ${Number(row.issue_count || 0) > 0 ? "review_required" : "ready"}`}>{Number(row.issue_count || 0) > 0 ? `${row.issue_count} kontrol` : statusLabel(row.status)}</span></button>)}
        </div></div> : <Empty title="Henüz belge yok" text="Belge Havuzu'ndan ilk dosyaları yükleyin." />}
      </section>
    </>}

    {view === "pool" && <>
      <UploadPanel onUploaded={handleUploaded} />
      <div className="eb-section-title"><div><strong>PDF Görünüm Şablonu</strong><span>Firma bazlı bir kez tanıtılır, sonraki belgelerde tekrar kullanılabilir.</span></div>
        <button type="button" onClick={() => openEBelgeTab("gorsel-sablonlar")}>Görsel Şablonlar'ı Aç</button></div>
      {lastUpload && <div className="eb-upload-result"><CheckCircle2 size={20} /><div><strong>Yükleme tamamlandı</strong><span>{lastUpload.items?.length || 0} belge havuza alındı. {lastUpload.errors?.length ? `${lastUpload.errors.length} dosya ayrıca kontrol istiyor.` : "Kayıtlar Belge Havuzu'nda hazır."}</span></div></div>}
    </>}

    {view === "incoming-dispatches" && <IncomingDispatchBillingWorkspace
      activeMainCompany={activeMainCompany}
      onOpenDocument={documentId => {setAutoPdfDocumentId(String(documentId));setSelectedId(String(documentId));}} />}

    {showPool && <>
      <div className="eb-stats">
        <StatCard label="Toplam Belge" value={pool.stats?.total} hint="Canonical havuz" />
        <StatCard label="Gelen Fatura" value={pool.stats?.incomingInvoices} hint="Tedarikçi faturası" />
        <StatCard label="Giden Fatura" value={pool.stats?.outgoingInvoices} hint="Satış faturası" />
        <StatCard label="İrsaliye" value={pool.stats?.dispatches} hint="Gelen + giden" />
        <StatCard label="Muhasebeleşti" value={pool.stats?.posted} hint="Son onayı tamamlanan" />
      </div>
      <section className="eb-pool">
        <div className="eb-section-title"><div><strong>{poolTitle}</strong><span>{poolHint} · XML, PDF ve manuel belgeler aynı havuzda korunur.</span></div><span>{Number(pool.total || 0)} kayıt · Sayfa {page}/{pageCount}</span></div>
        <div className="eb-pool-toolbar">
          <div className="eb-search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Belge no, firma veya VKN ara" /></div>
          {(view==="incoming-invoices"||(view==="archive"&&archiveType==="INCOMING_INVOICE"))&&<label className="eb-print-pending-filter">
            <input type="checkbox" checked={onlyPrintPending}
              onChange={e=>{setOnlyPrintPending(e.target.checked);setPage(1)}}/>
            Yalnız Çıktı Bekleyenler
          </label>}
          <label>Durum<select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);}}>
            <option value="ALL">Tüm Durumlar</option><option value="INGESTED">Yeni</option>
            <option value="REVIEW_REQUIRED">Kontrol Bekliyor</option><option value="READY_FOR_APPROVAL">Onaya Hazır</option>
            <option value="APPROVED">Onaylandı</option><option value="POSTED">Muhasebeleşti</option>
          </select></label>
          {view === "archive" && <label>Belge türü<select value={archiveType} onChange={event=>{setArchiveType(event.target.value);setOnlyPrintPending(false);setPage(1);}}>
            <option value="ALL">Tüm gelen/giden belgeler</option><option value="INCOMING_INVOICE">Gelen Faturalar</option>
            <option value="OUTGOING_INVOICE">Giden Faturalar</option><option value="INCOMING_DISPATCH">Gelen İrsaliyeler</option>
            <option value="OUTGOING_DISPATCH">Giden İrsaliyeler</option>
          </select></label>}
          {view === "pool" && <label>Göster<select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>{FILTERS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>}
          <label>Başlangıç<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
          <label>Bitiş<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
        </div>
        {(view==="incoming-invoices"||view==="archive")&&printStatusError&&<div className="eb-error" role="alert">{printStatusError}</div>}
        {view==="archive"&&<div className="eb-archive-queue-tools" aria-label="Arşiv toplu çıktı sırası">
          <label><input type="checkbox" checked={rows.length>0&&rows.every(row=>archiveSelectedIds.includes(row.id))}
             onChange={event=>setArchiveSelectedIds(event.target.checked?rows.map(row=>row.id):[])} disabled={!rows.length}/> Bu sayfadaki belgeleri seç</label>
          <button type="button" className="eb-primary" disabled={!pageSelected.length||busy}
             onClick={beginArchiveQueue}>Seçili {pageSelected.length} belgeyi sıra ile aç / yazdır</button>
          {archiveQueue.items.length>0&&<span role="status">Çıktı sırası {archiveQueue.index+1}/{archiveQueue.items.length} · {archiveQueue.items[archiveQueue.index]?.documentNo||""}
            <button type="button" onClick={()=>{setArchiveQueue({items:[],index:0});setSelectedId("");setAutoPdfDocumentId("");}}>Sırayı Bitir</button>
          </span>}
          <small>Orijinal PDF’ler ayrı ayrı açılır; her belgenin yazdırılması Chrome’da onaylanır. Yazıcıdan çıktı alınmadan durum otomatik “Çıktı Alındı” olmaz.</small>
        </div>}
        {busy && !rows.length ? <div className="eb-loading"><LoaderCircle className="eb-spin" /> Belgeler yükleniyor</div> : rows.length ? <div className="eb-pool-table-scroll"><div className="eb-table">
          <div className={`eb-tr eb-th ${view==="archive"?"eb-archive-heading":""}`}>
            {renderPoolSort("Belge", "DOCUMENT_NO")}
            {renderPoolSort("Firma / Cari", "PARTY")}
            {renderPoolSort("Tarih", "DATE")}
            {renderPoolSort(view==="incoming-invoices"?"Muhasebe Çıktısı":view==="archive"?"Kaynak / Çıktı":"Kaynak", view==="incoming-invoices"||view==="archive"?null:"SOURCE")}
            {renderPoolSort("Toplam", "TOTAL")}
            {renderPoolSort("Kontrol", "STATUS")}
          </div>
          {rows.map((row) => {
            const hasIssue = Number(row.issue_count || 0) > 0;
            const posted = String(row.status || "").toUpperCase() === "POSTED";
            const content = <button type="button" className="eb-tr" key={row.id} onClick={() => {setArchiveQueue({items:[],index:0});setAutoPdfDocumentId("");setSelectedId(row.id);}}><span><strong>{row.document_no || "Belge No Yok"}</strong><small>{typeLabel(row.document_type)}</small></span><span><strong>{row.party_name || "Cari eşleşmesi bekliyor"}</strong><small>{row.party_tax_no || ""}</small></span><span>{dateText(row.issue_date)}</span><span>{view==="incoming-invoices"?
                 (printStatusError?<small>Durum okunamadı</small>:
                  printStatuses[row.id]?.status==="PRINTED"?
                   <strong className="eb-print-mark-yes">Çıktı Alındı</strong>:
                  printStatuses[row.id]?.status==="PENDING"?
                   <strong className="eb-print-mark-no">Çıktı Bekliyor</strong>:
                   <small>Durum yükleniyor</small>):
                 <><small>{sourceLabel(row.source_type)}</small><em>{view==="archive"&&isIncomingAccountingInvoice(row)
                  ? (printStatusError ? "Çıktı durumu okunamadı" : printStatuses[row.id]?.status==="PRINTED" ? "Çıktı alındı" : printStatuses[row.id]?.status==="PENDING" ? "Çıktı bekliyor" : "Durum yükleniyor")
                  : (row.archive_status || "Arşiv durumunu belgede kontrol et")}</em></>}
                 </span><span><strong>{money(row.payable_total, row.currency)}</strong><small>{row.currency || "TRY"}</small></span><span className={`eb-chip ${hasIssue ? "review_required" : posted ? "posted" : "ready"}`}>{hasIssue ? `${row.issue_count} kontrol` : statusLabel(row.status)}</span></button>;
            return view==="archive" ? <div className="eb-archive-select-row" key={row.id}>
              <label aria-label={`${row.document_no||"Belge"} seç`}>
                <input type="checkbox" checked={archiveSelectedIds.includes(row.id)}
                  onChange={event=>setArchiveSelectedIds(current=>event.target.checked?[...new Set([...current,row.id])]:current.filter(id=>id!==row.id))}/>
              </label>
              {content}
            </div> : content;
          })}
        </div></div> : <Empty title="Bu görünümde belge yok" text="Tarih aralığını değiştirin veya yeni belge yükleyin." />}
        {Number(pool.total || 0) > 0 ? <nav className="eb-pool-pagination" aria-label="e-Belge sayfaları">
          <span>{(page - 1) * (pool.pageSize || 50) + 1}–{Math.min(Number(pool.total || 0), page * (pool.pageSize || 50))} / {pool.total} kayıt</span>
          <div>
            <button type="button" aria-label="Önceki sayfa" disabled={busy || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Önceki</button>
            <button type="button" aria-label="Sonraki sayfa" disabled={busy || page >= pageCount} onClick={() => setPage((current) => current + 1)}>Sonraki</button>
          </div>
        </nav> : null}
      </section>
    </>}

    {view === "receive" && <EBelgeReceiveWorkspace key={mainCompanySlug} activeMainCompany={activeMainCompany} openModule={openModule} />}
    {["invoice-drafts", "dispatch-drafts"].includes(view) && <EBelgeDraftWorkspace key={mainCompanySlug+":"+view} activeMainCompany={activeMainCompany} kind={view==="invoice-drafts"?"INVOICE":"DISPATCH"} />}
    {view === "workflow" && <InvoiceDispatchControlWorkspace activeMainCompany={activeMainCompany} onOpenDocument={(documentId) => { setAutoPdfDocumentId(String(documentId)); setSelectedId(String(documentId)); }} />}
    {view === "visual-templates" && <VisualProfileStudio key={activeMainCompany?.slug||activeMainCompany?.id||"no-company"} standalone />}

    {view === "integrations" && <>
      <EBelgeAdapterManager activeMainCompany={activeMainCompany} openModule={openModule} providerStatuses={providers} onRefreshStatuses={loadIntegrations} />

    </>}

    {matchingConfirmOpen ? <div className="eb-submodal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !matching) setMatchingConfirmOpen(false); }}>
      <section className="eb-submodal eb-bulk-confirm" role="dialog" aria-modal="true" aria-labelledby="eb-bulk-confirm-title">
        <header>
          <div><small>TOPLU BELGE KONTROLÜ</small><h3 id="eb-bulk-confirm-title">Tüm Açık Belgeleri Eşleştir</h3></div>
          <button type="button" aria-label="Kapat" disabled={matching} onClick={() => setMatchingConfirmOpen(false)}><X size={18}/></button>
        </header>
        <div className="eb-bulk-confirm-body">
          <p>Bu işlem <strong>yalnız ekranda görünen belge sayfasını değil</strong>, seçili ana firmaya ait henüz muhasebeleşmemiş uygun faturaları yeniden kontrol eder ve belge/irsaliye eşleşmelerini güncelleyebilir.</p>
          <p>Mevcut sunucu akışı her çalışmada en fazla <strong>500 uygun belgeyi</strong> işler. Resmî fatura gönderimi veya yeni banka ödemesi değildir. İşlemi tekrarlamadan önce önceki sonuçları inceleyin.</p>
          <label><input type="checkbox" disabled={matching} checked={matchingApproved} onChange={(event) => setMatchingApproved(event.target.checked)} /> Açık belgelerin eşleştirmelerinin güncellenmesini onaylıyorum.</label>
        </div>
        <footer><button type="button" disabled={matching} onClick={() => setMatchingConfirmOpen(false)}>Vazgeç</button><button type="button" className="eb-primary" disabled={matching || !matchingApproved} onClick={runMatching}>{matching ? "Kontrol Ediliyor..." : "Onayla ve Kontrol Et"}</button></footer>
      </section>
    </div> : null}
    <DetailDrawer key={selectedId || "empty-document"} id={selectedId} autoOpenPdf={Boolean(selectedId && autoPdfDocumentId === selectedId)}
      mainCompanySlug={mainCompanySlug}
      onOpenMailDrafts={(doc)=>{
        const no=String(doc.document_no||"").trim().toUpperCase();
        openModule?.("muhasebe",{
          tabKey:"fatura-mail-mutabakat",
          actionContext:{
            source:"e-belge",documentId:doc.id,
            document_no:no.startsWith("HKN")?no:"",
            delivery_no:no.startsWith("DDM")?no:"",
            party_name:doc.party_name||"",
            model_name:doc.model_name||"",
            model_id:doc.model_id||"",
          }
        });
      }}
      onClose={closeArchiveDocument}
      onChanged={showPool ? loadPool : loadDashboard} />
  </section>;
}
