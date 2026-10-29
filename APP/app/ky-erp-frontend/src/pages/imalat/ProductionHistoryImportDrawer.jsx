import { useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";
import { importProductionHistory } from "../../services/productionCenterApi";
import { parseProductionHistoryCsv } from "./productionHistoryCsv";

function localDate(value) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}
function period() {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 6);
  return { startDate: localDate(start), endDate: localDate(now) };
}
async function fingerprint(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export default function ProductionHistoryImportDrawer({ open, activeMainCompany, onClose, onImported }) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const { startDate, endDate } = period();
  if (!open) return null;
  async function choose(file) {
    setPreview(null); setProgress(null); setParsed(null); setError("");
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error("CSV dosyası 5 MB sınırını aşıyor.");
      const text = await file.text();
      const result = parseProductionHistoryCsv(text, { startDate, endDate });
      setCsv(text); setFilename(file.name); setParsed(result);
      if (!result.rows.length) setError("Seçilen dönemde aktarılabilir satır bulunamadı.");
    } catch (e) { setError(e.message || "CSV okunamadı."); }
  }
  async function runPreview() {
    if (!parsed?.rows.length || busy) return;
    setBusy(true); setError("");
    try {
      const result = await importProductionHistory(activeMainCompany, {
        requestId: "PREVIEW-" + (await fingerprint(csv)).slice(0, 48),
        preview: true, rows: parsed.rows,
      });
      setPreview(result);
    } catch (e) { setError(e.message || "Önizleme okunamadı."); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || !parsed?.rows.length || busy || !(activeMainCompany?.slug || activeMainCompany?.id)) return;
    setBusy(true); setError("");
    let success = 0, failed = 0, skipped = 0;
    const requestId = "KYHIST-" + (await fingerprint(csv)).slice(0, 48);
    try {
      for (let offset = 0; offset < parsed.rows.length; offset += 50) {
        const result = await importProductionHistory(activeMainCompany, {
          requestId, preview: false, rows: parsed.rows.slice(offset, offset + 50),
        });
        success += Number(result.successCount || 0);
        failed += Number(result.failedCount || 0);
        skipped += Number(result.skippedCount || 0);
        setProgress({ processed: Math.min(offset + 50, parsed.rows.length), total: parsed.rows.length, success, failed, skipped });
      }
      if (success) await onImported?.();
      setPreview(null);
    } catch (e) {
      setError((e.message || "Aktarım durdu.") + " Önceden kaydedilmiş fişler silinmedi; aynı dosyayla devam edebilirsiniz.");
    } finally { setBusy(false); }
  }
  return <div className="pc2-layer" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
    <aside className="pc2-drawer wide" role="dialog" aria-modal="true" aria-label="İmalat Geçmiş CSV Aktarımı" onMouseDown={(e) => e.stopPropagation()}>
      <header className="pc2-drawer-head">
        <div><h2><FileSpreadsheet size={20} /> Geçmiş İmalat CSV Al</h2>
          <p>Yalnız model adı, tarih, adet, vardiya, makine no, zemin, baskı bölgesi, baskı sakatı, kumaş sakatı ve makinacı.</p></div>
        <button type="button" className="pc2-icon" disabled={busy} onClick={onClose} aria-label="Kapat"><X size={19} /></button>
      </header>
      <div className="pc2-drawer-body">
        <div className="pc2-panel" style={{ padding: 16 }}>
          <strong>Öncelikli dönem: {startDate} – {endDate}</strong>
          <p>Farklı tarihli satırlar içeri alınmaz. Yardımcı, makine adı, sipariş, fatura ve Excel toplam sütunları kesinlikle okunmaz. Cari/KDV veya resmî fatura oluşturulmaz.</p>
          <label>Hazırlanmış CSV dosyası
            <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { void choose(event.target.files?.[0]); }} />
          </label>
          {filename && parsed && <p>{filename} · {parsed.rows.length} uygun satır · {parsed.rejected.length} geçersiz veya dönem dışı satır</p>}
        </div>
        {preview && <div className="pc2-panel" style={{ padding: 16 }}>
          <strong>Canlı D1 karşılaştırma önizlemesi</strong>
          <p>Aktarılabilir: {preview.eligibleCount} · Kayıtlı modele eşleşen: {preview.matchedCount} · Firma atanmadan yeni model kartı: {preview.newModelCount} · Mükerrer / belirsiz / hatalı: {preview.skippedCount}</p>
          {preview.skippedCount > 0 && <p>Atlanan satırlar kaybolmaz, bu CSV dosyasında durur. Aynı isimli farklı model kartları otomatik birleştirilmez.</p>}
        </div>}
        {progress && <div className="pc2-panel" style={{ padding: 16 }}>
          <strong>Aktarım ilerlemesi</strong>
          <p>{progress.processed}/{progress.total} işlendi · Kaydedilen: {progress.success} · Atlanan: {progress.skipped} · Hata: {progress.failed}</p>
        </div>}
        {error && <div className="pc2-notice warning" role="alert">{error}</div>}
      </div>
      <footer className="pc2-drawer-foot">
        <button type="button" disabled={busy} onClick={onClose}>Kapat</button>
        <button type="button" disabled={busy || !parsed?.rows.length} onClick={() => { void runPreview(); }}>
          {busy ? <LoaderCircle size={15} /> : <FileSpreadsheet size={15} />} Canlı Kayıtlarla Kontrol Et
        </button>
        <button type="button" className="primary" disabled={busy || !preview || !parsed?.rows.length} onClick={() => { void commit(); }}>
          <Upload size={15} /> {busy ? "Aktarılıyor" : "Kontrol Edilenleri İmalata Kaydet"}
        </button>
      </footer>
    </aside>
  </div>;
}
