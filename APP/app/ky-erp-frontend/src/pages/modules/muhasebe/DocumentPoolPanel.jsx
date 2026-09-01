import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, FileCheck2, FileUp, RefreshCcw, ShieldCheck } from "lucide-react";
import { apiGet, apiPost, apiUpload } from "../../../utils/api";
import "./documentPoolPanel.css";

const TYPE_OPTIONS = [
  ["GELEN_FATURA", "Gelen Fatura"],
  ["GELEN_IRSALIYE", "Gelen İrsaliye"],
  ["GIDEN_FATURA", "Giden Fatura"],
  ["GIDEN_IRSALIYE", "Giden İrsaliye"],
  ["IADE_FATURA", "İade Faturası"],
  ["DIGER", "Diğer Belge"],
];
const isXml = (file) => /\.xml$/i.test(file?.name || "") || String(file?.type || "").includes("xml");
const money = (value, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateText = (value) => value ? new Date(value).toLocaleDateString("tr-TR") : "-";

export default function DocumentPoolPanel({ activeMainCompany }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [documentType, setDocumentType] = useState("GELEN_FATURA");
  const [recordScope, setRecordScope] = useState("OFFICIAL");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const companyParams = useCallback(() => ({
    mainCompanySlug: activeMainCompany?.slug,
    mainCompanyId: activeMainCompany?.id,
  }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    try {
      const result = await apiGet("/muhasebe/belge-havuzu", { ...companyParams(), take: 50 });
      setRows(Array.isArray(result?.data) ? result.data : []);
    } catch (e) {
      setError(e?.message || "Belge havuzu alınamadı.");
    }
  }, [activeMainCompany?.slug, companyParams]);

  useEffect(() => { void load(); }, [load]);

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !activeMainCompany?.slug) return;
    setLoading(true);
    setMessage("");
    setError("");
    let success = 0;
    const failures = [];
    try {
      for (const file of files) {
        try {
          const direction = documentType.startsWith("GIDEN_") ? "OUTGOING" : "INCOMING";
          if (isXml(file)) {
            const xml = await file.text();
            await apiPost("/muhasebe/belge-havuzu/import-xml", {
              ...companyParams(),
              xml,
              documentType,
              direction,
              recordScope,
              providerType: "MANUAL",
              sourceType: "XML_IMPORT",
              rawMetadata: { originalFileName: file.name },
            });
          } else {
            const form = new FormData();
            form.set("file", file);
            form.set("mainCompanySlug", activeMainCompany.slug);
            if (activeMainCompany?.id) form.set("mainCompanyId", activeMainCompany.id);
            form.set("documentType", documentType);
            form.set("direction", direction);
            form.set("recordScope", recordScope);
            form.set("providerType", "MANUAL");
            await apiUpload("/muhasebe/belge-havuzu/scan", form);
          }
          success += 1;
        } catch (e) {
          failures.push(`${file.name}: ${e?.message || "okunamadı"}`);
        }
      }
      if (success) setMessage(`${success} belge havuza alındı ve analiz edildi.`);
      if (failures.length) setError(failures.join(" • "));
      await load();
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className="doc-pool-card">
      <header className="doc-pool-head">
        <div>
          <span className="doc-pool-icon"><BrainCircuit size={20} /></span>
          <div><strong>Akıllı Belge Havuzu</strong><small>İşNet olmasa da XML, PDF veya taranmış belgeyi okuyup muhasebe kaydına hazırlar.</small></div>
        </div>
        <button type="button" className="doc-pool-refresh" onClick={load}><RefreshCcw size={15} /> Yenile</button>
      </header>

      <div className="doc-pool-controls">
        <label>Belge türü<select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>{TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Kayıt sınıfı<select value={recordScope} onChange={(e) => setRecordScope(e.target.value)}><option value="OFFICIAL">Resmî</option><option value="INTERNAL">İç / Operasyon</option></select></label>
        <div className="doc-pool-badges"><span><ShieldCheck size={14} /> Firma bazlı</span><span><FileCheck2 size={14} /> Mükerrer kontrol</span><span><BrainCircuit size={14} /> AI alan + kalem analizi</span></div>
      </div>

      <div
        className={`doc-pool-drop ${dragging ? "is-dragging" : ""}`}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); }}
        onClick={() => !loading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <FileUp size={28} />
        <strong>{loading ? "Belge okunuyor ve ayrıştırılıyor…" : "XML / PDF / tarama / görsel sürükleyip bırak"}</strong>
        <span>PDF ve görseller yalnız OCR yapılmaz; yapılandırılmış belge analizi ile firma, tarih, belge no, toplam, vergi ve kalemler çıkarılır.</span>
        <input ref={inputRef} type="file" multiple hidden accept=".xml,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff" onChange={(e) => void uploadFiles(e.target.files)} />
      </div>

      {message ? <div className="doc-pool-message ok">{message}</div> : null}
      {error ? <div className="doc-pool-message error">{error}</div> : null}

      <div className="doc-pool-table-wrap">
        <table className="doc-pool-table">
          <thead><tr><th>Tarih</th><th>Tür</th><th>Firma / Cari</th><th>Belge No</th><th>Toplam</th><th>Kaynak</th><th>Durum</th><th>Sorun</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((row) => <tr key={row.id}>
              <td>{dateText(row.issue_date || row.created_at)}</td>
              <td>{row.document_type || "-"}</td>
              <td><strong>{row.party_name || "Eşleşme bekliyor"}</strong><small>{row.party_tax_no || ""}</small></td>
              <td>{row.document_no || "-"}</td>
              <td>{money(row.payable_total, row.currency)}</td>
              <td>{row.source_type || row.provider_type || "-"}</td>
              <td><span className={`doc-pool-status ${String(row.status || "").toLowerCase()}`}>{row.status || "-"}</span></td>
              <td>{Number(row.issue_count || 0) || "-"}</td>
            </tr>) : <tr><td colSpan="8" className="doc-pool-empty">Henüz canonical belge havuzu kaydı yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
