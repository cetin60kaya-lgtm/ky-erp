import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, CheckCircle2, FileCheck2, FileUp, RefreshCcw, Save, ShieldCheck, X } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiUpload } from "../../../utils/api";
import "./documentPoolPanel.css";

const TYPE_OPTIONS = [
  ["GELEN_FATURA", "Gelen Fatura"], ["GELEN_IRSALIYE", "Gelen İrsaliye"],
  ["GIDEN_FATURA", "Giden Fatura"], ["GIDEN_IRSALIYE", "Giden İrsaliye"],
  ["IADE_FATURA", "İade Faturası"], ["DIGER", "Diğer Belge"],
];
const isXml = (file) => /\.xml$/i.test(file?.name || "") || String(file?.type || "").includes("xml");
const money = (value, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateText = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";
const listOf = (payload) => Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.data?.rows) ? payload.data.rows : Array.isArray(payload) ? payload : [];

export default function DocumentPoolPanel({ activeMainCompany }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [firms, setFirms] = useState([]);
  const [documentType, setDocumentType] = useState("GELEN_FATURA");
  const [recordScope, setRecordScope] = useState("OFFICIAL");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [headerDraft, setHeaderDraft] = useState({});
  const [lineDrafts, setLineDrafts] = useState({});
  const [reviewBusy, setReviewBusy] = useState(false);

  const companyParams = useCallback(() => ({ mainCompanySlug: activeMainCompany?.slug, mainCompanyId: activeMainCompany?.id }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    try {
      const [pool, companyList] = await Promise.all([
        apiGet("/muhasebe/belge-havuzu", { ...companyParams(), take: 100 }),
        apiGet("/muhasebe/firmalar", { ...companyParams(), limit: 10000 }),
      ]);
      setRows(listOf(pool));
      setFirms(listOf(companyList));
    } catch (e) { setError(e?.message || "Belge havuzu alınamadı."); }
  }, [activeMainCompany?.slug, companyParams]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    setReviewBusy(true); setError("");
    try {
      const result = await apiGet(`/muhasebe/belge-havuzu/${encodeURIComponent(id)}`, companyParams());
      const value = result?.data || {};
      setDetail(value);
      setHeaderDraft({
        documentType: value.document_type || "DIGER", documentNo: value.document_no || "",
        issueDate: value.issue_date || "", dueDate: value.due_date || "", currency: value.currency || "TRY",
        partyCompanyId: value.party_company_id || "", partyName: value.party_name || "", partyTaxNo: value.party_tax_no || "",
        recordScope: value.record_scope || "OFFICIAL", note: value.note || "",
      });
      setLineDrafts(Object.fromEntries((value.lines || []).map((line) => [line.id, {
        productId: line.product_id || "", productCode: line.product_code || "", supplierProductCode: line.supplier_product_code || "",
        description: line.description || "", quantity: line.quantity ?? 0, unitCode: line.unit_code || "", unitPrice: line.unit_price ?? 0,
        discountTotal: line.discount_total ?? 0, taxRate: line.tax_rate ?? 0, taxAmount: line.tax_amount ?? 0, lineTotal: line.line_total ?? 0,
      }])));
      setSelectedId(id);
    } catch (e) { setError(e?.message || "Belge detayı alınamadı."); }
    finally { setReviewBusy(false); }
  }, [companyParams]);

  useEffect(() => { void load(); }, [load]);

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !activeMainCompany?.slug) return;
    setLoading(true); setMessage(""); setError("");
    let success = 0; const failures = [];
    try {
      for (const file of files) {
        try {
          const direction = documentType.startsWith("GIDEN_") ? "OUTGOING" : "INCOMING";
          if (isXml(file)) {
            await apiPost("/muhasebe/belge-havuzu/import-xml", { ...companyParams(), xml: await file.text(), documentType, direction, recordScope, providerType: "MANUAL", sourceType: "XML_IMPORT", rawMetadata: { originalFileName: file.name } });
          } else {
            const form = new FormData(); form.set("file", file); form.set("mainCompanySlug", activeMainCompany.slug);
            if (activeMainCompany?.id) form.set("mainCompanyId", activeMainCompany.id);
            form.set("documentType", documentType); form.set("direction", direction); form.set("recordScope", recordScope); form.set("providerType", "MANUAL");
            await apiUpload("/muhasebe/belge-havuzu/scan", form);
          }
          success += 1;
        } catch (e) { failures.push(`${file.name}: ${e?.message || "okunamadı"}`); }
      }
      if (success) setMessage(`${success} belge havuza alındı ve analiz edildi.`);
      if (failures.length) setError(failures.join(" • "));
      await load();
    } finally { setLoading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const saveHeader = async () => {
    if (!selectedId) return;
    setReviewBusy(true); setError(""); setMessage("");
    try {
      const firm = firms.find((row) => String(row.id) === String(headerDraft.partyCompanyId));
      await apiPatch(`/muhasebe/belge-havuzu/${encodeURIComponent(selectedId)}`, {
        ...companyParams(), ...headerDraft,
        partyName: firm?.companyName || firm?.firmaAdi || firm?.name || headerDraft.partyName,
        partyTaxNo: firm?.taxNo || firm?.tax_no || headerDraft.partyTaxNo,
      });
      setMessage("Belge üst bilgileri kaydedildi."); await loadDetail(selectedId); await load();
    } catch (e) { setError(e?.message || "Belge bilgileri kaydedilemedi."); }
    finally { setReviewBusy(false); }
  };

  const saveLine = async (lineId) => {
    const draft = lineDrafts[lineId]; if (!draft || !selectedId) return;
    setReviewBusy(true); setError(""); setMessage("");
    try {
      await apiPatch(`/muhasebe/belge-havuzu/${encodeURIComponent(selectedId)}/lines/${encodeURIComponent(lineId)}`, { ...companyParams(), ...draft });
      setMessage("Kalem düzeltildi ve toplamlar yeniden hesaplandı."); await loadDetail(selectedId); await load();
    } catch (e) { setError(e?.message || "Kalem kaydedilemedi."); }
    finally { setReviewBusy(false); }
  };

  const revalidate = async () => {
    setReviewBusy(true); setError(""); setMessage("");
    try { await apiPost(`/muhasebe/belge-havuzu/${selectedId}/revalidate`, companyParams()); setMessage("Belge yeniden kontrol edildi."); await loadDetail(selectedId); await load(); }
    catch (e) { setError(e?.message || "Belge kontrol edilemedi."); } finally { setReviewBusy(false); }
  };

  const approve = async () => {
    setReviewBusy(true); setError(""); setMessage("");
    try { await apiPost(`/muhasebe/belge-havuzu/${selectedId}/approve`, companyParams()); setMessage("Belge onaylandı."); await loadDetail(selectedId); await load(); }
    catch (e) { setError(e?.message || "Belge onaylanamadı."); } finally { setReviewBusy(false); }
  };

  return <section className="doc-pool-card">
    <header className="doc-pool-head"><div><span className="doc-pool-icon"><BrainCircuit size={20}/></span><div><strong>Akıllı Belge Havuzu</strong><small>İşNet olmasa da XML, PDF veya taranmış belgeyi okuyup muhasebe kaydına hazırlar.</small></div></div><button type="button" className="doc-pool-refresh" onClick={load}><RefreshCcw size={15}/> Yenile</button></header>
    <div className="doc-pool-controls"><label>Belge türü<select value={documentType} onChange={(e)=>setDocumentType(e.target.value)}>{TYPE_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Kayıt sınıfı<select value={recordScope} onChange={(e)=>setRecordScope(e.target.value)}><option value="OFFICIAL">Resmî</option><option value="INTERNAL">İç / Operasyon</option></select></label><div className="doc-pool-badges"><span><ShieldCheck size={14}/> Firma bazlı</span><span><FileCheck2 size={14}/> Mükerrer kontrol</span><span><BrainCircuit size={14}/> AI alan + kalem analizi</span></div></div>
    <div className={`doc-pool-drop ${dragging?"is-dragging":""}`} onDragEnter={(e)=>{e.preventDefault();setDragging(true)}} onDragOver={(e)=>e.preventDefault()} onDragLeave={(e)=>{e.preventDefault();setDragging(false)}} onDrop={(e)=>{e.preventDefault();setDragging(false);void uploadFiles(e.dataTransfer.files)}} onClick={()=>!loading&&inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" ")inputRef.current?.click()}}><FileUp size={28}/><strong>{loading?"Belge okunuyor ve ayrıştırılıyor…":"XML / PDF / tarama / görsel sürükleyip bırak"}</strong><span>PDF ve görseller yalnız OCR yapılmaz; yapılandırılmış yapay zeka belge analizi ile firma, tarih, belge no, toplam, vergi ve kalemler çıkarılır. Firma bazlı özel okuma modeli gerektiğinde otomatik profil kullanılabilir.</span><input ref={inputRef} type="file" multiple hidden accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff" onChange={(e)=>void uploadFiles(e.target.files)}/></div>
    {message?<div className="doc-pool-message ok">{message}</div>:null}{error?<div className="doc-pool-message error">{error}</div>:null}
    <div className="doc-pool-table-wrap"><table className="doc-pool-table"><thead><tr><th>Tarih</th><th>Tür</th><th>Firma / Cari</th><th>Belge No</th><th>Toplam</th><th>Kaynak</th><th>Durum</th><th>Sorun</th></tr></thead><tbody>{rows.length?rows.map((row)=><tr key={row.id} className={selectedId===row.id?"is-selected":""} onClick={()=>void loadDetail(row.id)}><td>{dateText(row.issue_date||row.created_at)}</td><td>{row.document_type||"-"}</td><td><strong>{row.party_name||"Eşleşme bekliyor"}</strong><small>{row.party_tax_no||""}</small></td><td>{row.document_no||"-"}</td><td>{money(row.payable_total,row.currency)}</td><td>{row.source_type||row.provider_type||"-"}</td><td><span className={`doc-pool-status ${String(row.status||"").toLowerCase()}`}>{row.status||"-"}</span></td><td>{Number(row.issue_count||0)||"-"}</td></tr>):<tr><td colSpan="8" className="doc-pool-empty">Henüz canonical belge havuzu kaydı yok.</td></tr>}</tbody></table></div>

    {detail ? <section className="doc-review">
      <header><div><strong>Belge İnceleme ve Son Onay</strong><small>{detail.document_no||detail.id} · {detail.status}</small></div><button type="button" onClick={()=>{setDetail(null);setSelectedId("")}}><X size={16}/> Kapat</button></header>
      <div className="doc-review-grid">
        <label>Tür<select value={headerDraft.documentType||"DIGER"} onChange={(e)=>setHeaderDraft({...headerDraft,documentType:e.target.value})}>{TYPE_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Belge No<input value={headerDraft.documentNo||""} onChange={(e)=>setHeaderDraft({...headerDraft,documentNo:e.target.value})}/></label>
        <label>Tarih<input type="date" value={headerDraft.issueDate||""} onChange={(e)=>setHeaderDraft({...headerDraft,issueDate:e.target.value})}/></label>
        <label>Vade<input type="date" value={headerDraft.dueDate||""} onChange={(e)=>setHeaderDraft({...headerDraft,dueDate:e.target.value})}/></label>
        <label className="wide">Firma / Cari<select value={headerDraft.partyCompanyId||""} onChange={(e)=>setHeaderDraft({...headerDraft,partyCompanyId:e.target.value})}><option value="">Eşleşme seçin</option>{firms.map((firm)=><option key={firm.id} value={firm.id}>{firm.companyName||firm.firmaAdi||firm.name}</option>)}</select></label>
        <label>Kayıt<select value={headerDraft.recordScope||"OFFICIAL"} onChange={(e)=>setHeaderDraft({...headerDraft,recordScope:e.target.value})}><option value="OFFICIAL">Resmî</option><option value="INTERNAL">İç / Operasyon</option></select></label>
        <label>Para Birimi<input value={headerDraft.currency||"TRY"} onChange={(e)=>setHeaderDraft({...headerDraft,currency:e.target.value.toUpperCase()})}/></label>
        <label className="wide">Not<input value={headerDraft.note||""} onChange={(e)=>setHeaderDraft({...headerDraft,note:e.target.value})}/></label>
      </div>
      <div className="doc-review-actions"><button type="button" onClick={saveHeader} disabled={reviewBusy}><Save size={15}/> Üst Bilgiyi Kaydet</button><button type="button" onClick={revalidate} disabled={reviewBusy}><RefreshCcw size={15}/> Yeniden Kontrol</button><button type="button" className="approve" onClick={approve} disabled={reviewBusy}><CheckCircle2 size={15}/> Son Onay</button></div>
      <div className="doc-review-summary"><span>Matrah <b>{money(detail.subtotal,detail.currency)}</b></span><span>KDV <b>{money(detail.tax_total,detail.currency)}</b></span><span>Genel Toplam <b>{money(detail.payable_total,detail.currency)}</b></span></div>
      <div className="doc-review-lines"><table><thead><tr><th>#</th><th>Ürün Kodu</th><th>Açıklama</th><th>Miktar</th><th>Birim</th><th>Birim Fiyat</th><th>İskonto</th><th>KDV %</th><th>Toplam</th><th></th></tr></thead><tbody>{(detail.lines||[]).map((line)=>{const d=lineDrafts[line.id]||{};return <tr key={line.id}><td>{line.line_no}</td><td><input value={d.productCode||""} onChange={(e)=>setLineDrafts({...lineDrafts,[line.id]:{...d,productCode:e.target.value}})}/></td><td><input value={d.description||""} onChange={(e)=>setLineDrafts({...lineDrafts,[line.id]:{...d,description:e.target.value}})}/></td><td><input type="number" step="0.001" value={d.quantity??0} onChange={(e)=>setLineDrafts({...lineDrafts,[line.id]:{...d,quantity:e.target.value}})}/></td><td><input value={d.unitCode||""} onChange={(e)=>setLineDrafts({...lineDrafts,[line.id]:{...d,unitCode:e.target.value}})}/></td><td><input type="number" step="0.01" value={d.unitPrice??0} onChange={(e)=>setLineDrafts({...lineDrafts,[line.id]:{...d,unitPrice:e.target.value}})}/></td><td><input type="number" step="0.01" value={d.discountTotal??0} onChange={(e)=>setLineDrafts({...lineDrafts,[line.id]:{...d,discountTotal:e.target.value}})}/></td><td><input type="number" step="0.01" value={d.taxRate??0} onChange={(e)=>setLineDrafts({...lineDrafts,[line.id]:{...d,taxRate:e.target.value}})}/></td><td>{money(line.line_total,detail.currency)}</td><td><button type="button" onClick={()=>saveLine(line.id)} disabled={reviewBusy}><Save size={14}/></button></td></tr>})}</tbody></table></div>
      <div className="doc-review-issues"><strong>Kontrol / Sorunlar</strong>{(detail.issues||[]).length?(detail.issues||[]).map((issue)=><div key={issue.id} className={issue.is_resolved?"resolved":""}><b>{issue.issue_code}</b><span>{issue.message}</span><em>{issue.is_resolved?"Çözüldü":issue.severity}</em></div>):<span>Aktif sorun yok.</span>}</div>
    </section> : null}
  </section>;
}
